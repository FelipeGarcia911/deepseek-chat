import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import request from "supertest";
import { test, vi, type TestContext } from "vitest";
import { loadConfig } from "../src/config";
import { createApplication } from "../src/composition";
import type { Database } from "../src/db/database";
import { createEmptyDatabase, createMigratedDatabase, publishAssistant } from "./database";

const allowedOrigin = "https://allowed.example.test";

function compose(t: TestContext, databaseUrl: string, origins = allowedOrigin, nodeEnv = "test") {
  const config = loadConfig({ NODE_ENV: nodeEnv, PORT: "4000", CORS_ORIGINS: origins, DATABASE_URL: databaseUrl });
  const { app, close } = createApplication(config);
  t.onTestFinished(close);
  return { app, api: request(app) };
}

async function fixture(t: TestContext, origins = allowedOrigin, nodeEnv = "test") {
  const { db, url } = await createMigratedDatabase(t);
  const assistant = await publishAssistant(db, "support");
  return { db, assistant, ...compose(t, url, origins, nodeEnv) };
}

async function rowCounts(db: Database) {
  const count = async (table: "conversations" | "messages" | "runs") =>
    Number(
      (
        await db
          .selectFrom(table)
          .select((eb) => eb.fn.countAll().as("count"))
          .executeTakeFirstOrThrow()
      ).count
    );
  return { conversations: await count("conversations"), messages: await count("messages"), runs: await count("runs") };
}

const admin = "/api/v1/admin/conversations";
const runtime = "/api/v1/runtime/conversations";
const create = "/api/v1/runtime/assistants/support/conversations";
const emptyPage = { items: [], nextCursor: null };
const unknownId = "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47";

function assertProblem(response: request.Response, status: number, code: string) {
  assert.equal(response.status, status);
  assert.match(response.headers["content-type"], /^application\/problem\+json/);
  assert.equal(response.body.code, code);
  assert.equal(response.body.status, status);
  assert.equal(response.body.type, "about:blank");
  assert.equal(response.body.requestId, response.headers["x-request-id"]);
  assert.match(response.body.requestId, /^[0-9a-f-]{36}$/);
}

test("should create, list, read and delete a conversation pinned to the production version", async (t) => {
  const { api, db, assistant } = await fixture(t);
  await api.get(admin).expect(200, emptyPage);
  const { body: chat } = await api.post(create).send({ title: "Test chat" }).expect(201);
  assert.equal(chat.title, "Test chat");
  assert.equal(chat.assistantId, assistant.assistantId);
  assert.equal(chat.status, "open");
  assert.match(chat.id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  assert.ok(!Number.isNaN(Date.parse(chat.createdAt)));
  const stored = await db.selectFrom("conversations").selectAll().executeTakeFirstOrThrow();
  assert.equal(stored.target_kind, "version");
  assert.equal(stored.assistant_version_id, assistant.versionId);
  await api.get(admin).expect(200, { items: [chat], nextCursor: null });
  await api.get(`${runtime}/${chat.id}/messages`).expect(200, emptyPage);
  await api.delete(`${admin}/${chat.id}`).expect(204, "");
  await api.get(admin).expect(200, emptyPage);
});

test("should page conversations newest first with an opaque cursor", async (t) => {
  const { api } = await fixture(t);
  for (const title of ["First", "Second", "Third"]) await api.post(create).send({ title }).expect(201);
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

test("should return a stable 503 problem without saving messages or making external requests", async (t) => {
  const { api, db } = await fixture(t);
  const { body: chat } = await api.post(create).send({ title: "Test chat" }).expect(201);
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected outgoing fetch"));
  const httpsSpy = vi.spyOn(https, "request").mockImplementation(() => {
    throw new Error("Unexpected outgoing HTTPS request");
  });
  const httpSpy = vi.spyOn(http, "request");
  const response = await api.post(`${runtime}/${chat.id}/messages`).send({ content: "Synthetic question" });
  assertProblem(response, 503, "MODEL_NOT_CONFIGURED");
  assert.equal(response.body.detail, "No Model Profile has been configured.");
  await api.get(`${runtime}/${chat.id}/messages`).expect(200, emptyPage);
  assert.deepEqual(await rowCounts(db), { conversations: 1, messages: 0, runs: 0 });
  assert.equal(fetchSpy.mock.calls.length, 0);
  assert.equal(httpsSpy.mock.calls.length, 0);
  for (const [options] of httpSpy.mock.calls) {
    assert.ok(typeof options === "object" && !(options instanceof URL));
    assert.ok(["127.0.0.1", "localhost", "::1"].includes(options.host ?? ""));
  }
});

test("should reject invalid titles, slugs, identifiers and messages with field-level validation problems", async (t) => {
  const { api, db } = await fixture(t);
  const { body: chat } = await api.post(create).send({ title: "Test chat" }).expect(201);
  const cases = [
    { call: () => api.post(create).send({}), path: "body.title" },
    { call: () => api.post(create).send({ title: "   " }), path: "body.title" },
    { call: () => api.post(create).send({ title: "x".repeat(121) }), path: "body.title" },
    { call: () => api.post(create).send({ title: "Valid", owner: "someone" }), path: "body" },
    {
      call: () => api.post("/api/v1/runtime/assistants/Bad_Slug/conversations").send({ title: "Valid" }),
      path: "params.assistantSlug",
    },
    { call: () => api.get(`${runtime}/not-a-number/messages`), path: "params.conversationId" },
    { call: () => api.delete(`${admin}/1730000000000`), path: "params.conversationId" },
    { call: () => api.post(`${runtime}/${chat.id}/messages`).send({ content: " " }), path: "body.content" },
    {
      call: () => api.post(`${runtime}/${chat.id}/messages`).send({ content: "x".repeat(4001) }),
      path: "body.content",
    },
    { call: () => api.post(`${runtime}/${chat.id}/messages`).send({ message: "Hi" }), path: "body" },
    { call: () => api.get(`${runtime}/${chat.id}/messages`).query({ cursor: "bm90LWEtc2VxdWVuY2U" }), path: "" },
  ];
  for (const { call, path: field } of cases) {
    const response = await call();
    assertProblem(response, 400, "VALIDATION_FAILED");
    if (field) {
      assert.ok(
        response.body.errors.some((error: { path: string }) => error.path === field),
        JSON.stringify(response.body)
      );
    }
  }
  assert.deepEqual(await rowCounts(db), { conversations: 1, messages: 0, runs: 0 });
});

test("should trim a valid title before storing it", async (t) => {
  const { api } = await fixture(t);
  const { body } = await api.post(create).send({ title: "  Spaced title  " }).expect(201);
  assert.equal(body.title, "Spaced title");
});

test("should keep admin and runtime operations in separate route groups without legacy routes", async (t) => {
  const { api } = await fixture(t);
  for (const call of [
    () => api.post(admin).send({ title: "Admin cannot create runtime conversations" }),
    () => api.post(runtime).send({ title: "Conversations need an assistant" }),
    () => api.get(runtime),
    () => api.delete(`${runtime}/${unknownId}`),
    () => api.get(`${admin}/${unknownId}/messages`),
    () => api.get("/api/chats/list"),
    () => api.post("/api/chats/new").send({ title: "Legacy route" }),
  ]) {
    assertProblem(await call(), 404, "NOT_FOUND");
  }
});

test("should return not-found problems for unknown conversations, assistants and routes", async (t) => {
  const { api } = await fixture(t);
  for (const call of [
    () => api.get(`${runtime}/${unknownId}/messages`),
    () => api.delete(`${admin}/${unknownId}`),
    () => api.post(`${runtime}/${unknownId}/messages`).send({ content: "Synthetic question" }),
    () => api.post("/api/v1/runtime/assistants/missing/conversations").send({ title: "Nobody" }),
    () => api.get("/api/unknown"),
  ]) {
    assertProblem(await call(), 404, "NOT_FOUND");
  }
});

test("should refuse conversations for archived or undeployed assistants and messages to closed conversations", async (t) => {
  const { api, db } = await fixture(t);
  await publishAssistant(db, "retired", { status: "archived" });
  await publishAssistant(db, "draft-only", { deploy: false });
  const archived = await api.post("/api/v1/runtime/assistants/retired/conversations").send({ title: "Too late" });
  assertProblem(archived, 409, "INVALID_STATE");
  assert.equal(archived.body.detail, "The assistant is archived.");
  const undeployed = await api.post("/api/v1/runtime/assistants/draft-only/conversations").send({ title: "Too early" });
  assertProblem(undeployed, 409, "INVALID_STATE");
  assert.equal(undeployed.body.detail, "The assistant has no production deployment.");
  const { body: chat } = await api.post(create).send({ title: "Closing soon" }).expect(201);
  await db.updateTable("conversations").set({ status: "closed" }).where("id", "=", chat.id).execute();
  const closed = await api.post(`${runtime}/${chat.id}/messages`).send({ content: "Anyone there?" });
  assertProblem(closed, 409, "INVALID_STATE");
  assert.deepEqual(await rowCounts(db), { conversations: 1, messages: 0, runs: 0 });
});

test("should report an unavailable database as an unavailable dependency", async (t) => {
  const { api } = compose(t, "postgres://chat_app:chat_app@127.0.0.1:1/chat_app");
  vi.spyOn(console, "error").mockImplementation(() => {});
  assertProblem(await api.post(create).send({ title: "Unsaved chat" }), 503, "DEPENDENCY_UNAVAILABLE");
  assertProblem(await api.get(admin), 503, "DEPENDENCY_UNAVAILABLE");
});

test("should accept configured origins, preflight and requests without Origin", async (t) => {
  const { api } = await fixture(t);
  await api.get(admin).set("Origin", allowedOrigin).expect(200).expect("Access-Control-Allow-Origin", allowedOrigin);
  await api
    .options(create)
    .set("Origin", allowedOrigin)
    .set("Access-Control-Request-Method", "POST")
    .expect(204)
    .expect("Access-Control-Allow-Origin", allowedOrigin);
  const local = await api.get(admin).expect(200);
  assert.equal(local.headers["access-control-allow-origin"], undefined);
});

test("should reject unconfigured origins before handlers or database writes", async (t) => {
  const { api, db } = await fixture(t);
  const rejected = await api
    .post(create)
    .set("Origin", "https://denied.example.test")
    .send({ title: "Must not be stored" });
  assertProblem(rejected, 403, "ORIGIN_NOT_ALLOWED");
  assert.equal(rejected.headers["access-control-allow-origin"], undefined);
  await api
    .options(create)
    .set("Origin", "https://denied.example.test")
    .set("Access-Control-Request-Method", "POST")
    .expect(403);
  assert.deepEqual(await rowCounts(db), { conversations: 0, messages: 0, runs: 0 });
});

test("should compose two applications with independent databases, origins and node environments", async (t) => {
  const first = await fixture(t, "https://first.example.test", "development");
  const second = await fixture(t, "https://second.example.test", "production");
  assert.equal(first.app.get("env"), "development");
  assert.equal(second.app.get("env"), "production");
  await first.api
    .post(create)
    .set("Origin", "https://first.example.test")
    .send({ title: "First app chat" })
    .expect(201);
  await second.api.get(admin).set("Origin", "https://first.example.test").expect(403);
  await second.api.get(admin).set("Origin", "https://second.example.test").expect(200, emptyPage);
  assert.deepEqual(await rowCounts(second.db), { conversations: 0, messages: 0, runs: 0 });
});

test("should return client problems for malformed and oversized JSON bodies", async (t) => {
  const { api } = await fixture(t);
  const malformed = await api.post(create).set("Content-Type", "application/json").send('{"title":');
  assertProblem(malformed, 400, "VALIDATION_FAILED");
  const oversized = await api.post(create).send({ title: "x".repeat(40_000) });
  assertProblem(oversized, 413, "PAYLOAD_TOO_LARGE");
});

test("should report the composed application as not ready until its database is migrated", async (t) => {
  const { url } = await createEmptyDatabase(t);
  const { api } = compose(t, url);
  const response = await api.get("/health/ready");
  assertProblem(response, 503, "DEPENDENCY_UNAVAILABLE");
  assert.equal(response.body.detail, "The database has 5 pending migration(s).");
});
