const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { once } = require("node:events");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { loadConfig } = require("../dist/config");
const { createApplication } = require("../dist/composition");

async function fixture(t, origins = "https://allowed.example.test", nodeEnv = "test") {
  const directory = await mkdtemp(path.join(tmpdir(), "chat-app-test-"));
  const storagePath = path.join(directory, "nested/chats.json");
  const config = loadConfig({ NODE_ENV: nodeEnv, PORT: "4000", CORS_ORIGINS: origins, CHAT_STORAGE_PATH: storagePath });
  const app = await createApplication(config);
  await writeFile(storagePath, "[]");
  const server = createServer(app);
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(directory, { recursive: true, force: true });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { app, config, storagePath, url: `http://127.0.0.1:${server.address().port}/api/chats` };
}

function post(url, body, headers = {}) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

test("importing application modules does not listen, read storage, create directories or load dotenv", () => {
  execFileSync(
    process.execPath,
    [
      "-e",
      `
    const assert = require('node:assert/strict');
    require('node:net').Server.prototype.listen = () => { throw new Error('Unexpected listener'); };
    require('node:fs/promises').readFile = () => { throw new Error('Unexpected storage read'); };
    require('node:fs/promises').mkdir = () => { throw new Error('Unexpected directory creation'); };
    require('dotenv').config = () => { throw new Error('Unexpected environment loading'); };
    for (const name of ['app', 'composition', 'server', 'config', 'controllers/ChatController', 'services/ChatService']) require('./dist/' + name);
    assert.equal(typeof require('./dist/app').createApp, 'function');
  `,
    ],
    { cwd: path.join(__dirname, ".."), timeout: 5000 }
  );
});

test("list, create, history and delete work without a configured model", async (t) => {
  const { url } = await fixture(t);
  const initial = await fetch(`${url}/list`);
  assert.equal(initial.status, 200);
  assert.deepEqual(await initial.json(), []);
  const created = await post(`${url}/new`, { title: "Test chat" });
  assert.equal(created.status, 201);
  const chat = await created.json();
  assert.equal(chat.title, "Test chat");
  assert.equal(typeof chat.id, "string");
  const listed = await fetch(`${url}/list`);
  assert.deepEqual(await listed.json(), [{ id: chat.id, title: "Test chat" }]);
  const history = await fetch(`${url}/${chat.id}/history`);
  assert.deepEqual(await history.json(), []);
  const deleted = await fetch(`${url}/${chat.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { message: "Chat deleted successfully." });
  const remaining = await fetch(`${url}/list`);
  assert.deepEqual(await remaining.json(), []);
});

test("unconfigured generation returns a stable 503 without saving messages or making external requests", async (t) => {
  const { url, storagePath } = await fixture(t);
  const created = await post(`${url}/new`, { title: "Test chat" });
  const chat = await created.json();
  const before = await readFile(storagePath, "utf8");
  const outgoing = [require("node:http"), require("node:https")].map((protocol) =>
    t.mock.method(protocol, "request", () => {
      throw new Error("Unexpected outgoing HTTP request");
    })
  );
  for (const body of [{ chatId: chat.id, message: "Synthetic question" }, {}]) {
    const response = await post(`${url}/${chat.id}/message`, body);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), {
      code: "MODEL_NOT_CONFIGURED",
      error: "No Model Profile has been configured.",
    });
  }
  const history = await fetch(`${url}/${chat.id}/history`);
  assert.deepEqual(await history.json(), []);
  assert.equal(await readFile(storagePath, "utf8"), before);
  for (const request of outgoing) assert.equal(request.mock.calls.length, 0);
});

test("existing title validation remains available", async (t) => {
  const { url } = await fixture(t);
  const response = await post(`${url}/new`, {});
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "Chat title is required." });
});

test("configured origins and preflight are accepted while requests without Origin still work", async (t) => {
  const { url } = await fixture(t);
  const response = await fetch(`${url}/list`, { headers: { Origin: "https://allowed.example.test" } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://allowed.example.test");
  const preflight = await fetch(`${url}/new`, {
    method: "OPTIONS",
    headers: { Origin: "https://allowed.example.test", "Access-Control-Request-Method": "POST" },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "https://allowed.example.test");
  const local = await fetch(`${url}/list`);
  assert.equal(local.status, 200);
  assert.equal(local.headers.get("Access-Control-Allow-Origin"), null);
});

test("unconfigured origins are rejected before handlers or storage writes", async (t) => {
  const { url, storagePath } = await fixture(t);
  const before = await readFile(storagePath, "utf8");
  const rejected = await post(`${url}/new`, { title: "Must not be stored" }, { Origin: "https://denied.example.test" });
  assert.equal(rejected.status, 403);
  assert.deepEqual(await rejected.json(), { error: "Origin is not allowed." });
  assert.equal(rejected.headers.get("Access-Control-Allow-Origin"), null);
  const preflight = await fetch(`${url}/new`, {
    method: "OPTIONS",
    headers: { Origin: "https://denied.example.test", "Access-Control-Request-Method": "POST" },
  });
  assert.equal(preflight.status, 403);
  assert.equal(await readFile(storagePath, "utf8"), before);
});

test("two composed applications have independent storage, origins and node environments", async (t) => {
  const first = await fixture(t, "https://first.example.test", "development");
  const second = await fixture(t, "https://second.example.test", "production");
  assert.equal(first.app.get("env"), "development");
  assert.equal(second.app.get("env"), "production");
  const created = await post(`${first.url}/new`, { title: "First app chat" }, { Origin: "https://first.example.test" });
  assert.equal(created.status, 201);
  const denied = await fetch(`${second.url}/list`, { headers: { Origin: "https://first.example.test" } });
  assert.equal(denied.status, 403);
  const listed = await fetch(`${second.url}/list`, { headers: { Origin: "https://second.example.test" } });
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), []);
  assert.equal(await readFile(second.storagePath, "utf8"), "[]");
});
