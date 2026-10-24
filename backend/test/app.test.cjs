const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { once } = require("node:events");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { createApp } = require("../dist/app");
const ChatService = require("../dist/services/ChatService").default;

async function fixture(t, generate = async () => "Test response") {
  const directory = await mkdtemp(path.join(tmpdir(), "chat-app-test-"));
  const storagePath = path.join(directory, "chats.json");
  await writeFile(storagePath, JSON.stringify([{ id: "chat-1", title: "Test chat", messages: [] }]));
  const chatService = new ChatService(storagePath);
  await chatService.initialize();
  const calls = [];
  const app = createApp({
    chatService,
    ollamaService: {
      async sendMessageWithHistory(messages) {
        calls.push(structuredClone(messages));
        return generate(messages);
      },
    },
  });
  const server = createServer(app);
  t.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    await rm(directory, { recursive: true, force: true });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const url = `http://127.0.0.1:${server.address().port}/api/chats`;
  return { url, calls, storagePath };
}

function post(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("importing application modules does not listen, read storage or require model configuration", () => {
  execFileSync(
    process.execPath,
    [
      "-e",
      `
    const assert = require('node:assert/strict');
    delete process.env.OLLAMA_API_URL;
    delete process.env.MODEL_NAME;
    require('node:net').Server.prototype.listen = () => { throw new Error('Unexpected listener'); };
    require('node:fs/promises').readFile = () => { throw new Error('Unexpected storage read'); };
    require('dotenv').config = () => { throw new Error('Unexpected environment loading'); };
    for (const name of ['app', 'composition', 'server', 'controllers/ChatController', 'services/ChatService', 'services/OllamaService']) {
      require('./dist/' + name);
    }
    assert.equal(typeof require('./dist/app').createApp, 'function');
  `,
    ],
    { cwd: path.join(__dirname, ".."), timeout: 5000 }
  );
});

test("injected services preserve list, create, history and delete routes", async (t) => {
  const { url } = await fixture(t);
  const listed = await fetch(`${url}/list`);
  assert.equal(listed.status, 200);
  assert.deepEqual(await listed.json(), [{ id: "chat-1", title: "Test chat" }]);

  const created = await post(`${url}/new`, { title: "Another chat" });
  assert.equal(created.status, 201);
  const chat = await created.json();
  assert.equal(chat.title, "Another chat");
  assert.equal(typeof chat.id, "string");
  const history = await fetch(`${url}/${chat.id}/history`);
  assert.deepEqual(await history.json(), []);

  const deleted = await fetch(`${url}/${chat.id}`, { method: "DELETE" });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { message: "Chat deleted successfully." });
  const remaining = await fetch(`${url}/list`);
  assert.deepEqual(await remaining.json(), [{ id: "chat-1", title: "Test chat" }]);
});

test("a message uses the injected model and persists both messages", async (t) => {
  const { url, calls, storagePath } = await fixture(t);
  const response = await post(`${url}/chat-1/message`, { chatId: "chat-1", message: "Test question" });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { response: "Test response" });
  assert.deepEqual(calls, [[{ role: "user", content: "Test question" }]]);
  const history = await fetch(`${url}/chat-1/history`);
  const expected = [
    { text: "Test question", sender: "user" },
    { text: "Test response", sender: "bot" },
  ];
  assert.deepEqual(await history.json(), expected);
  assert.deepEqual(JSON.parse(await readFile(storagePath, "utf8"))[0].messages, expected);
});

test("model failure preserves the HTTP error contract without inventing an assistant response", async (t) => {
  const { url } = await fixture(t, async () => {
    throw new Error("Model unavailable");
  });
  const response = await post(`${url}/chat-1/message`, { chatId: "chat-1", message: "Test question" });
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Server error while processing the message." });
  const history = await fetch(`${url}/chat-1/history`);
  assert.deepEqual(await history.json(), [{ text: "Test question", sender: "user" }]);
});

test("existing invalid-input responses do not call the model", async (t) => {
  const { url, calls } = await fixture(t);
  const title = await post(`${url}/new`, {});
  assert.equal(title.status, 400);
  assert.deepEqual(await title.json(), { error: "Chat title is required." });
  const message = await post(`${url}/chat-1/message`, { chatId: "chat-1" });
  assert.equal(message.status, 400);
  assert.deepEqual(await message.json(), { error: "Both chatId and message are required." });
  assert.equal(calls.length, 0);
});

test("independently constructed apps do not share their injected dependencies", async (t) => {
  const first = await fixture(t, async () => "First model");
  const second = await fixture(t, async () => "Second model");
  const response = await post(`${first.url}/chat-1/message`, { chatId: "chat-1", message: "Test question" });
  assert.deepEqual(await response.json(), { response: "First model" });
  assert.equal(second.calls.length, 0);
  const history = await fetch(`${second.url}/chat-1/history`);
  assert.deepEqual(await history.json(), []);
});
