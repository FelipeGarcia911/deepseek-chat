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

test("should return a stable 503 without saving messages or making external requests", async (t) => {
  const { api, storagePath } = await fixture(t);
  const { body: chat } = await api.post(`${base}/new`).send({ title: "Test chat" }).expect(201);
  const before = await readFile(storagePath, "utf8");
  const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Unexpected outgoing fetch"));
  const httpsSpy = vi.spyOn(https, "request").mockImplementation(() => {
    throw new Error("Unexpected outgoing HTTPS request");
  });
  const httpSpy = vi.spyOn(http, "request");
  for (const body of [{ chatId: chat.id, message: "Synthetic question" }, {}]) {
    await api.post(`${base}/${chat.id}/message`).send(body).expect(503, {
      code: "MODEL_NOT_CONFIGURED",
      error: "No Model Profile has been configured.",
    });
  }
  await api.get(`${base}/${chat.id}/history`).expect(200, []);
  assert.equal(await readFile(storagePath, "utf8"), before);
  assert.equal(fetchSpy.mock.calls.length, 0);
  assert.equal(httpsSpy.mock.calls.length, 0);
  assert.equal(httpSpy.mock.calls.length, 3);
  for (const [options] of httpSpy.mock.calls) {
    assert.ok(typeof options === "object" && !(options instanceof URL));
    assert.equal(options.host, "127.0.0.1");
  }
});

test("should preserve existing title validation", async (t) => {
  const { api } = await fixture(t);
  await api.post(`${base}/new`).send({}).expect(400, { error: "Chat title is required." });
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
    .send({ title: "Must not be stored" })
    .expect(403, { error: "Origin is not allowed." });
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
