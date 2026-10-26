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

async function fixture(t: TestContext, origins = "https://allowed.example.test", nodeEnv = "test") {
  const directory = await mkdtemp(path.join(tmpdir(), "chat-app-test-"));
  t.onTestFinished(() => rm(directory, { recursive: true, force: true }));
  const storagePath = path.join(directory, "nested/chats.json");
  const config = loadConfig({ NODE_ENV: nodeEnv, PORT: "4000", CORS_ORIGINS: origins, CHAT_STORAGE_PATH: storagePath });
  const app = await createApplication(config);
  await writeFile(storagePath, "[]");
  return { app, config, storagePath, api: request(app) };
}

const base = "/api/chats";

test("should support list, create, history and delete without a configured model", async (t) => {
  const { api } = await fixture(t);
  await api.get(`${base}/list`).expect(200, []);
  const { body: chat } = await api.post(`${base}/new`).send({ title: "Test chat" }).expect(201);
  assert.equal(chat.title, "Test chat");
  assert.equal(typeof chat.id, "string");
  await api.get(`${base}/list`).expect(200, [{ id: chat.id, title: "Test chat" }]);
  await api.get(`${base}/${chat.id}/history`).expect(200, []);
  await api.delete(`${base}/${chat.id}`).expect(200, { message: "Chat deleted successfully." });
  await api.get(`${base}/list`).expect(200, []);
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
  const { body: chat } = await api.post(`${base}/new`).send({ title: "Test chat" }).expect(201);
  const before = await readFile(storagePath, "utf8");
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected outgoing fetch"));
  const httpsSpy = vi.spyOn(https, "request").mockImplementation(() => {
    throw new Error("Unexpected outgoing HTTPS request");
  });
  const httpSpy = vi.spyOn(http, "request");
  const response = await api.post(`${base}/${chat.id}/message`).send({ message: "Synthetic question" });
  assertProblem(response, 503, "MODEL_NOT_CONFIGURED");
  assert.equal(response.body.detail, "No Model Profile has been configured.");
  await api.get(`${base}/${chat.id}/history`).expect(200, []);
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
  const { body: chat } = await api.post(`${base}/new`).send({ title: "Test chat" }).expect(201);
  const before = await readFile(storagePath, "utf8");
  const cases = [
    { call: () => api.post(`${base}/new`).send({}), path: "body.title" },
    { call: () => api.post(`${base}/new`).send({ title: "   " }), path: "body.title" },
    { call: () => api.post(`${base}/new`).send({ title: "x".repeat(121) }), path: "body.title" },
    { call: () => api.post(`${base}/new`).send({ title: "Valid", owner: "someone" }), path: "body" },
    { call: () => api.get(`${base}/not-a-number/history`), path: "params.chatId" },
    { call: () => api.delete(`${base}/1a`), path: "params.chatId" },
    { call: () => api.post(`${base}/${chat.id}/message`).send({ message: " " }), path: "body.message" },
    { call: () => api.post(`${base}/${chat.id}/message`).send({ message: "x".repeat(4001) }), path: "body.message" },
    { call: () => api.post(`${base}/${chat.id}/message`).send({ chatId: chat.id, message: "Hi" }), path: "body" },
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
  const { body } = await api.post(`${base}/new`).send({ title: "  Spaced title  " }).expect(201);
  assert.equal(body.title, "Spaced title");
});

test("should return not-found problems for unknown chats and routes", async (t) => {
  const { api } = await fixture(t);
  for (const call of [
    () => api.get(`${base}/1/history`),
    () => api.delete(`${base}/1`),
    () => api.post(`${base}/1/message`).send({ message: "Synthetic question" }),
    () => api.get("/api/unknown"),
  ]) {
    assertProblem(await call(), 404, "NOT_FOUND");
  }
});

test("should report storage failures as an unavailable dependency without keeping the unsaved chat", async (t) => {
  const { api, storagePath } = await fixture(t);
  vi.spyOn(console, "error").mockImplementation(() => {});
  await rm(path.dirname(storagePath), { recursive: true });
  assertProblem(await api.post(`${base}/new`).send({ title: "Unsaved chat" }), 503, "DEPENDENCY_UNAVAILABLE");
  await api.get(`${base}/list`).expect(200, []);
  assert.equal(vi.mocked(console.error).mock.calls.length, 1);
});

test("should accept configured origins, preflight and requests without Origin", async (t) => {
  const { api } = await fixture(t);
  await api
    .get(`${base}/list`)
    .set("Origin", "https://allowed.example.test")
    .expect(200)
    .expect("Access-Control-Allow-Origin", "https://allowed.example.test");
  await api
    .options(`${base}/new`)
    .set("Origin", "https://allowed.example.test")
    .set("Access-Control-Request-Method", "POST")
    .expect(204)
    .expect("Access-Control-Allow-Origin", "https://allowed.example.test");
  const local = await api.get(`${base}/list`).expect(200);
  assert.equal(local.headers["access-control-allow-origin"], undefined);
});

test("should reject unconfigured origins before handlers or storage writes", async (t) => {
  const { api, storagePath } = await fixture(t);
  const before = await readFile(storagePath, "utf8");
  const rejected = await api
    .post(`${base}/new`)
    .set("Origin", "https://denied.example.test")
    .send({ title: "Must not be stored" });
  assertProblem(rejected, 403, "ORIGIN_NOT_ALLOWED");
  assert.equal(rejected.headers["access-control-allow-origin"], undefined);
  await api
    .options(`${base}/new`)
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
    .post(`${base}/new`)
    .set("Origin", "https://first.example.test")
    .send({ title: "First app chat" })
    .expect(201);
  await second.api.get(`${base}/list`).set("Origin", "https://first.example.test").expect(403);
  await second.api.get(`${base}/list`).set("Origin", "https://second.example.test").expect(200, []);
  assert.equal(await readFile(second.storagePath, "utf8"), "[]");
});

test("should return client problems for malformed and oversized JSON bodies", async (t) => {
  const { api } = await fixture(t);
  const malformed = await api.post(`${base}/new`).set("Content-Type", "application/json").send('{"title":');
  assertProblem(malformed, 400, "VALIDATION_FAILED");
  const oversized = await api.post(`${base}/new`).send({ title: "x".repeat(40_000) });
  assertProblem(oversized, 413, "PAYLOAD_TOO_LARGE");
});
