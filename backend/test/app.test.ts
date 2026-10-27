import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { test, vi, type TestContext } from "vitest";
import { loadConfig } from "../src/config";
import { createApplication } from "../src/composition";
import { createEmptyDatabase } from "./database";

async function fixture(t: TestContext, origins = "https://allowed.example.test", nodeEnv = "test") {
  const directory = await mkdtemp(path.join(tmpdir(), "chat-app-test-"));
  t.onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const storagePath = path.join(directory, "nested/chats.json");
  const config = loadConfig({
    NODE_ENV: nodeEnv,
    PORT: "4000",
    CORS_ORIGINS: origins,
    CHAT_STORAGE_PATH: storagePath,
    DATABASE_URL: "postgres://chat_app:chat_app@127.0.0.1:5432/chat_app",
  });
  const { app, close } = await createApplication(config);
  t.onTestFinished(close);
  await writeFile(storagePath, "[]");
  return { app, config, storagePath, api: request(app) };
}

const admin = "/api/v1/admin/conversations";
const runtime = "/api/v1/runtime/conversations";

const emptyPage = { items: [], nextCursor: null };
const unknownId = "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47";

test("should support list, create, messages and delete without a configured model", async (t) => {
  const { api } = await fixture(t);
  await api.get(admin).expect(200, emptyPage);
  const { body: chat } = await api.post(runtime).send({ title: "Test chat" }).expect(201);
  assert.equal(chat.title, "Test chat");
  assert.match(chat.id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.ok(!Number.isNaN(Date.parse(chat.createdAt)));
  await api.get(admin).expect(200, { items: [chat], nextCursor: null });
  await api.get(`${runtime}/${chat.id}/messages`).expect(200, emptyPage);
  await api.delete(`${admin}/${chat.id}`).expect(204, "");
  await api.get(admin).expect(200, emptyPage);
});

test("should page conversations newest first with an opaque cursor", async (t) => {
  const { api } = await fixture(t);
  const titles = ["First", "Second", "Third"];
  for (const title of titles) await api.post(runtime).send({ title }).expect(201);
  const first = await api.get(admin).query({ limit: 2 }).expect(200);
  assert.deepEqual(
    first.body.items.map((item: { title: string }) => item.title),
    ["Third", "Second"]
  );
  assert.equal(typeof first.body.nextCursor, "string");
  const second = await api.get(admin).query({ limit: 2, cursor: first.body.nextCursor }).expect(200);
  assert.deepEqual(
    second.body.items.map((item: { title: string }) => item.title),
    ["First"]
  );
  assert.equal(second.body.nextCursor, null);
  for (const query of [{ limit: 0 }, { limit: 101 }, { cursor: "unknown" }, { page: 2 }]) {
    assertProblem(await api.get(admin).query(query), 400, "VALIDATION_FAILED");
  }
});

function assertProblem(response: request.Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/problem\+json/);
  assert.equal(response.body.code, code);
  assert.equal(response.body.status, status);
  assert.equal(response.body.type, "about:blank");
  assert.equal(response.body.requestId, response.headers["x-request-id"]);
  assert.match(response.body.requestId, /^[0-9a-f-]{36}$/);
}

test("should return a stable 503 problem without saving messages or making external requests", async (t) => {
  const { api, storagePath } = await fixture(t);
  const { body: chat } = await api.post(`${runtime}`).send({ title: "Test chat" }).expect(201);
  const before = await readFile(storagePath, "utf8");
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected outgoing fetch"));
  const httpsSpy = vi.spyOn(https, "request").mockImplementation(() => {
    throw new Error("Unexpected outgoing HTTPS request");
  });
  const httpSpy = vi.spyOn(http, "request");
  const response = await api.post(`${runtime}/${chat.id}/messages`).send({ content: "Synthetic question" });
  assertProblem(response, 503, "MODEL_NOT_CONFIGURED");
  assert.equal(response.body.detail, "No Model Profile has been configured.");
  await api.get(`${runtime}/${chat.id}/messages`).expect(200, emptyPage);
  assert.equal(await readFile(storagePath, "utf8"), before);
  assert.equal(fetchSpy.mock.calls.length, 0);
  assert.equal(httpsSpy.mock.calls.length, 0);
  for (const [options] of httpSpy.mock.calls) {
    assert.ok(typeof options === "object" && !(options instanceof URL));
    assert.ok(["127.0.0.1", "localhost", "::1"].includes(options.host ?? ""));
  }
});

test("should reject invalid titles, identifiers and messages with field-level validation problems", async (t) => {
  const { api, storagePath } = await fixture(t);
  const { body: chat } = await api.post(`${runtime}`).send({ title: "Test chat" }).expect(201);
  const before = await readFile(storagePath, "utf8");
  const cases = [
    { call: () => api.post(`${runtime}`).send({}), path: "body.title" },
    { call: () => api.post(`${runtime}`).send({ title: "   " }), path: "body.title" },
    { call: () => api.post(`${runtime}`).send({ title: "x".repeat(121) }), path: "body.title" },
    { call: () => api.post(`${runtime}`).send({ title: "Valid", owner: "someone" }), path: "body" },
    { call: () => api.get(`${runtime}/not-a-number/messages`), path: "params.conversationId" },
    { call: () => api.delete(`${admin}/1730000000000`), path: "params.conversationId" },
    { call: () => api.post(`${runtime}/${chat.id}/messages`).send({ content: " " }), path: "body.content" },
    {
      call: () => api.post(`${runtime}/${chat.id}/messages`).send({ content: "x".repeat(4001) }),
      path: "body.content",
    },
    { call: () => api.post(`${runtime}/${chat.id}/messages`).send({ message: "Hi" }), path: "body" },
  ];
  for (const { call, path: field } of cases) {
    const response = await call();
    assertProblem(response, 400, "VALIDATION_FAILED");
    assert.ok(
      response.body.errors.some((error: { path: string }) => error.path === field),
      JSON.stringify(response.body)
    );
  }
  assert.equal(await readFile(storagePath, "utf8"), before);
});

test("should trim a valid title before storing it", async (t) => {
  const { api } = await fixture(t);
  const { body } = await api.post(`${runtime}`).send({ title: "  Spaced title  " }).expect(201);
  assert.equal(body.title, "Spaced title");
});

test("should keep admin and runtime operations in separate route groups without legacy routes", async (t) => {
  const { api } = await fixture(t);
  for (const call of [
    () => api.post(admin).send({ title: "Admin cannot create runtime conversations" }),
    () => api.get(runtime),
    () => api.delete(`${runtime}/${unknownId}`),
    () => api.get(`${admin}/${unknownId}/messages`),
    () => api.get("/api/chats/list"),
    () => api.post("/api/chats/new").send({ title: "Legacy route" }),
  ]) {
    assertProblem(await call(), 404, "NOT_FOUND");
  }
});

test("should return not-found problems for unknown chats and routes", async (t) => {
  const { api } = await fixture(t);
  for (const call of [
    () => api.get(`${runtime}/${unknownId}/messages`),
    () => api.delete(`${admin}/${unknownId}`),
    () => api.post(`${runtime}/${unknownId}/messages`).send({ content: "Synthetic question" }),
    () => api.get("/api/unknown"),
  ]) {
    assertProblem(await call(), 404, "NOT_FOUND");
  }
});

test("should report storage failures as an unavailable dependency without keeping the unsaved chat", async (t) => {
  const { api, storagePath } = await fixture(t);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await rm(path.dirname(storagePath), { recursive: true });
  assertProblem(await api.post(`${runtime}`).send({ title: "Unsaved chat" }), 503, "DEPENDENCY_UNAVAILABLE");
  await api.get(`${admin}`).expect(200, emptyPage);
  assert.equal(vi.mocked(console.error).mock.calls.length, 1);
});

test("should accept configured origins, preflight and requests without Origin", async (t) => {
  const { api } = await fixture(t);
  await api
    .get(`${admin}`)
    .set("Origin", "https://allowed.example.test")
    .expect(200)
    .expect("Access-Control-Allow-Origin", "https://allowed.example.test");
  await api
    .options(`${runtime}`)
    .set("Origin", "https://allowed.example.test")
    .set("Access-Control-Request-Method", "POST")
    .expect(204)
    .expect("Access-Control-Allow-Origin", "https://allowed.example.test");
  const local = await api.get(`${admin}`).expect(200);
  assert.equal(local.headers["access-control-allow-origin"], undefined);
});

test("should reject unconfigured origins before handlers or storage writes", async (t) => {
  const { api, storagePath } = await fixture(t);
  const before = await readFile(storagePath, "utf8");
  const rejected = await api
    .post(`${runtime}`)
    .set("Origin", "https://denied.example.test")
    .send({ title: "Must not be stored" });
  assertProblem(rejected, 403, "ORIGIN_NOT_ALLOWED");
  assert.equal(rejected.headers["access-control-allow-origin"], undefined);
  await api
    .options(`${runtime}`)
    .set("Origin", "https://denied.example.test")
    .set("Access-Control-Request-Method", "POST")
    .expect(403);
  assert.equal(await readFile(storagePath, "utf8"), before);
});

test("should compose two applications with independent storage, origins and node environments", async (t) => {
  const first = await fixture(t, "https://first.example.test", "development");
  const second = await fixture(t, "https://second.example.test", "production");
  assert.equal(first.app.get("env"), "development");
  assert.equal(second.app.get("env"), "production");
  await first.api
    .post(`${runtime}`)
    .set("Origin", "https://first.example.test")
    .send({ title: "First app chat" })
    .expect(201);
  await second.api.get(`${admin}`).set("Origin", "https://first.example.test").expect(403);
  await second.api.get(`${admin}`).set("Origin", "https://second.example.test").expect(200, emptyPage);
  assert.equal(await readFile(second.storagePath, "utf8"), "[]");
});

test("should return client problems for malformed and oversized JSON bodies", async (t) => {
  const { api } = await fixture(t);
  const malformed = await api.post(`${runtime}`).set("Content-Type", "application/json").send('{"title":');
  assertProblem(malformed, 400, "VALIDATION_FAILED");
  const oversized = await api.post(`${runtime}`).send({ title: "x".repeat(40_000) });
  assertProblem(oversized, 413, "PAYLOAD_TOO_LARGE");
});

test("should report the composed application as not ready until its database is migrated", async (t) => {
  const { url } = await createEmptyDatabase(t);
  const directory = await mkdtemp(path.join(tmpdir(), "chat-app-test-"));
  t.onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const config = loadConfig({
    NODE_ENV: "test",
    PORT: "4000",
    CORS_ORIGINS: "https://allowed.example.test",
    CHAT_STORAGE_PATH: path.join(directory, "chats.json"),
    DATABASE_URL: url,
  });
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const { app, close } = await createApplication(config);
  t.onTestFinished(close);
  const response = await request(app).get("/health/ready");
  assertProblem(response, 503, "DEPENDENCY_UNAVAILABLE");
  assert.equal(response.body.detail, "The database has 3 pending migration(s).");
});
