const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { mkdir, mkdtemp, readFile, rm, writeFile } = require("node:fs/promises");
const { createServer, request } = require("node:http");
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

async function availablePort() {
  const reservation = createServer();
  reservation.listen(0);
  await once(reservation, "listening");
  const port = reservation.address().port;
  await new Promise((resolve) => reservation.close(resolve));
  return String(port);
}

async function launch(t, environment = {}, envFile) {
  const directory = await mkdtemp(path.join(tmpdir(), "chat-server-test-"));
  const storagePath = path.join(directory, "chats.json");
  await writeFile(storagePath, "[]");
  if (envFile === "directory") await mkdir(path.join(directory, ".env"));
  else if (envFile)
    await writeFile(path.join(directory, ".env"), typeof envFile === "function" ? envFile(storagePath) : envFile);
  const env = { ...process.env };
  for (const key of ["NODE_ENV", "PORT", "CORS_ORIGINS", "CHAT_STORAGE_PATH"]) delete env[key];
  if (!envFile)
    Object.assign(env, {
      NODE_ENV: "test",
      PORT: await availablePort(),
      CORS_ORIGINS: "https://allowed.example.test",
      CHAT_STORAGE_PATH: storagePath,
    });
  Object.assign(env, typeof environment === "function" ? environment(storagePath) : environment);
  const child = spawn(process.execPath, [serverPath], { cwd: directory, env, stdio: ["ignore", "pipe", "pipe"] });
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
  test(`${signal} drains an accepted HTTP request before exiting`, { timeout: 10_000 }, async (t) => {
    const running = await launch(t);
    const url = await running.ready();
    let client;
    const pending = new Promise((resolve, reject) => {
      client = request(
        `${url}/new`,
        { method: "POST", headers: { "Content-Type": "application/json", Connection: "close" } },
        (res) => {
          let body = "";
          res.on("data", (chunk) => {
            body += chunk;
          });
          res.on("end", () => resolve({ status: res.statusCode, body: JSON.parse(body) }));
        }
      );
      client.on("error", reject);
      client.write('{"title":');
    });
    t.after(() => client.destroy());
    await waitUntil(() => running.output().includes("POST /api/chats/new"));
    running.child.kill(signal);
    await waitUntil(() => running.output().includes(`${signal} received: closing HTTP server`));
    await assert.rejects(fetch(`${url}/list`));
    assert.equal(running.child.exitCode, null);
    client.end('"Synthetic private title"}');
    const response = await pending;
    assert.equal(response.status, 201);
    assert.equal(response.body.title, "Synthetic private title");
    const [code, exitSignal] = await running.exited;
    assert.equal(code, 0, running.output());
    assert.equal(exitSignal, null);
    assert.match(running.output(), /HTTP server closed/);
    assert.doesNotMatch(running.output(), /Synthetic private title/);
    assert.equal(JSON.parse(await readFile(running.storagePath, "utf8"))[0].title, "Synthetic private title");
  });
}

test(
  "the backend starts without a model and reads configuration from its executable env-file boundary",
  { timeout: 10_000 },
  async (t) => {
    const port = await availablePort();
    const running = await launch(
      t,
      {},
      (storagePath) =>
        `NODE_ENV=development\nPORT=${port}\nCORS_ORIGINS=https://from-file.example.test\nCHAT_STORAGE_PATH=${storagePath}\n`
    );
    const url = await running.ready();
    const response = await fetch(`${url}/list`, { headers: { Origin: "https://from-file.example.test" } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://from-file.example.test");
    running.child.kill("SIGTERM");
    assert.equal((await running.exited)[0], 0);
  }
);

test("process configuration takes priority over the env file", { timeout: 10_000 }, async (t) => {
  const port = await availablePort();
  const running = await launch(
    t,
    (storagePath) => ({
      NODE_ENV: "test",
      PORT: port,
      CORS_ORIGINS: "https://from-process.example.test",
      CHAT_STORAGE_PATH: storagePath,
    }),
    "NODE_ENV=invalid\nPORT=invalid\nCORS_ORIGINS=invalid\nCHAT_STORAGE_PATH=invalid\n"
  );
  const url = await running.ready();
  const response = await fetch(`${url}/list`, { headers: { Origin: "https://from-process.example.test" } });
  assert.equal(response.status, 200);
  running.child.kill("SIGTERM");
  assert.equal((await running.exited)[0], 0);
});

test("missing required platform settings fail before listening", { timeout: 10_000 }, async (t) => {
  const running = await launch(t, { NODE_ENV: "", PORT: "", CORS_ORIGINS: "", CHAT_STORAGE_PATH: "" });
  assert.equal((await running.exited)[0], 1);
  for (const key of ["NODE_ENV", "PORT", "CORS_ORIGINS", "CHAT_STORAGE_PATH"])
    assert.match(running.output(), new RegExp(`${key}: required`));
  assert.doesNotMatch(running.output(), /Server running on/);
});

test(
  "invalid platform settings fail together without exposing values or opening HTTP",
  { timeout: 10_000 },
  async (t) => {
    const running = await launch(t, {
      NODE_ENV: "invalid",
      PORT: "0",
      CORS_ORIGINS: "https://user:private-value@example.test",
      CHAT_STORAGE_PATH: "not-a-json-file",
    });
    assert.equal((await running.exited)[0], 1);
    assert.match(running.output(), /Failed to start server:/);
    for (const key of ["NODE_ENV", "PORT", "CORS_ORIGINS", "CHAT_STORAGE_PATH"])
      assert.match(running.output(), new RegExp(key));
    assert.doesNotMatch(running.output(), /private-value|example\.test|Server running on/);
  }
);

test("a port binding error exits unsuccessfully", { timeout: 10_000 }, async (t) => {
  const occupied = createServer();
  t.after(() => new Promise((resolve) => occupied.close(resolve)));
  occupied.listen(0);
  await once(occupied, "listening");
  const running = await launch(t, { PORT: String(occupied.address().port) });
  assert.equal((await running.exited)[0], 1);
  assert.match(running.output(), /Failed to start HTTP server:/);
  assert.match(running.output(), /EADDRINUSE/);
});

test("an unreadable env file fails at the startup boundary", { timeout: 10_000 }, async (t) => {
  const running = await launch(t, {}, "directory");
  assert.equal((await running.exited)[0], 1);
  assert.match(running.output(), /could not be read; check the file location and permissions/);
  assert.doesNotMatch(running.output(), /Server running on/);
});
