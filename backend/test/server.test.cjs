const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { setTimeout: delay } = require("node:timers/promises");

const serverPath = path.resolve(__dirname, "../dist/server.js");

async function waitUntil(predicate) {
  for (let attempt = 0; attempt < 500; attempt++) {
    if (predicate()) return;
    await delay(10);
  }
  throw new Error("Timed out waiting for the server lifecycle event");
}

async function launch(t, environment = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "chat-server-test-"));
  const storagePath = path.join(directory, "chats.json");
  await writeFile(storagePath, JSON.stringify([{ id: "chat-1", title: "Test chat", messages: [] }]));
  const child = spawn(process.execPath, [serverPath], {
    cwd: directory,
    env: {
      ...process.env,
      PORT: "0",
      OLLAMA_API_URL: "http://127.0.0.1:1/api/chat",
      MODEL_NAME: "test-model",
      LOGS_PATH: path.relative(path.join(path.dirname(serverPath), "services"), storagePath),
      ...environment,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const exited = once(child, "exit");
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
    await rm(directory, { recursive: true, force: true });
  });
  return {
    child,
    exited,
    storagePath,
    output: () => output,
    async ready() {
      await waitUntil(() => /Server running on http:\/\/localhost:\d+/.test(output) || child.exitCode !== null);
      assert.equal(child.exitCode, null, output);
      const port = output.match(/Server running on http:\/\/localhost:(\d+)/)[1];
      return `http://127.0.0.1:${port}/api/chats`;
    },
  };
}

for (const signal of ["SIGTERM", "SIGINT"]) {
  test(
    `${signal} stops new requests and drains an in-flight generation before exiting`,
    { timeout: 10_000 },
    async (t) => {
      let release;
      let providerRequested = false;
      const gate = new Promise((resolve) => {
        release = resolve;
      });
      const provider = createServer(async (req, res) => {
        for await (const _chunk of req) {
          /* Consume the request before simulating generation. */
        }
        providerRequested = true;
        await gate;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ message: { content: "Synthetic private answer" } }));
      });
      t.after(async () => {
        release();
        provider.closeAllConnections();
        await new Promise((resolve) => provider.close(resolve));
      });
      provider.listen(0, "127.0.0.1");
      await once(provider, "listening");
      const running = await launch(t, { OLLAMA_API_URL: `http://127.0.0.1:${provider.address().port}/api/chat` });
      const url = await running.ready();
      const pending = fetch(`${url}/chat-1/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chatId: "chat-1", message: "Synthetic private question" }),
      });
      await waitUntil(() => providerRequested);
      running.child.kill(signal);
      await waitUntil(() => running.output().includes(`${signal} received: closing HTTP server`));
      await assert.rejects(fetch(`${url}/list`));
      assert.equal(running.child.exitCode, null);
      release();
      const response = await pending;
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { response: "Synthetic private answer" });
      const [code, exitSignal] = await running.exited;
      assert.equal(code, 0, running.output());
      assert.equal(exitSignal, null);
      assert.match(running.output(), /HTTP server closed/);
      assert.doesNotMatch(running.output(), /Synthetic private (question|answer)/);
      assert.deepEqual(JSON.parse(await readFile(running.storagePath, "utf8"))[0].messages, [
        { text: "Synthetic private question", sender: "user" },
        { text: "Synthetic private answer", sender: "bot" },
      ]);
    }
  );
}

test(
  "missing model configuration exits with a startup error instead of opening a server",
  { timeout: 10_000 },
  async (t) => {
    const running = await launch(t, { OLLAMA_API_URL: "", MODEL_NAME: "" });
    const [code] = await running.exited;
    assert.equal(code, 1);
    assert.match(running.output(), /Failed to start server:/);
    assert.match(running.output(), /OLLAMA_API_URL and MODEL_NAME are required/);
    assert.doesNotMatch(running.output(), /Server running on/);
  }
);

test(
  "a port binding error exits unsuccessfully without leaving signal handlers running",
  { timeout: 10_000 },
  async (t) => {
    const occupied = createServer();
    t.after(() => new Promise((resolve) => occupied.close(resolve)));
    occupied.listen(0);
    await once(occupied, "listening");
    const running = await launch(t, { PORT: String(occupied.address().port) });
    const [code] = await running.exited;
    assert.equal(code, 1);
    assert.match(running.output(), /Failed to start HTTP server:/);
    assert.match(running.output(), /EADDRINUSE/);
  }
);
