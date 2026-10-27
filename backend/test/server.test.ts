import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer, request, type ClientRequest } from "node:http";
import { createRequire } from "node:module";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, test, type TestContext } from "vitest";
import { createMigratedDatabase, publishAssistant } from "./database";
beforeAll(() => {
  const require = createRequire(import.meta.url);
  execFileSync(process.execPath, [require.resolve("typescript/bin/tsc")], {
    cwd: path.resolve(__dirname, ".."),
    timeout: 20_000,
  });
}, 30_000);

const serverPath = path.resolve(__dirname, "../dist/server.js");

async function availablePort() {
  const reservation = createServer();
  reservation.listen(0);
  await once(reservation, "listening");
  const port = (reservation.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => reservation.close((error) => (error ? reject(error) : resolve())));
  return String(port);
}

type Environment = NodeJS.ProcessEnv | ((databaseUrl: string) => NodeJS.ProcessEnv);
type EnvFile = string | ((databaseUrl: string) => string);

async function launch(t: TestContext, environment: Environment = {}, envFile?: EnvFile) {
  const directory = await mkdtemp(path.join(tmpdir(), "chat-server-test-"));
  const { db, url: databaseUrl } = await createMigratedDatabase(t);
  await publishAssistant(db, "support");
  if (envFile === "directory") await mkdir(path.join(directory, ".env"));
  else if (envFile)
    await writeFile(path.join(directory, ".env"), typeof envFile === "function" ? envFile(databaseUrl) : envFile);
  const env = { ...process.env };
  for (const key of ["NODE_ENV", "PORT", "CORS_ORIGINS", "DATABASE_URL"]) delete env[key];
  if (!envFile)
    Object.assign(env, {
      NODE_ENV: "test",
      PORT: await availablePort(),
      CORS_ORIGINS: "https://allowed.example.test",
      DATABASE_URL: databaseUrl,
    });
  Object.assign(env, typeof environment === "function" ? environment(databaseUrl) : environment);
  const child = spawn(process.execPath, [serverPath], { cwd: directory, env, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  child.stdout.on("data", (chunk) => {
    output += chunk;
  });
  child.stderr.on("data", (chunk) => {
    output += chunk;
  });
  const exited = once(child, "exit");
  function waitForOutput(pattern: RegExp) {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => finish(new Error(`Missing lifecycle output: ${pattern}`)), 5000);
      const inspect = () => {
        if (pattern.test(output)) finish();
        else if (child.exitCode !== null || child.signalCode !== null) finish(new Error(output));
      };
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        child.stdout.off("data", inspect);
        child.stderr.off("data", inspect);
        child.off("exit", inspect);
        if (error) reject(error);
        else resolve();
      };
      child.stdout.on("data", inspect);
      child.stderr.on("data", inspect);
      child.on("exit", inspect);
      inspect();
    });
  }
  t.onTestFinished(async () => {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    await exited;
    await rm(directory, { recursive: true, force: true });
  });
  return {
    child,
    exited,
    db,
    output: () => output,
    waitForOutput,
    async ready() {
      await waitForOutput(/Server running on http:\/\/localhost:\d+/);
      assert.equal(child.exitCode, null, output);
      const port = output.match(/Server running on http:\/\/localhost:(\d+)/)![1];
      return `http://127.0.0.1:${port}/api/v1`;
    },
  };
}

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  test(`should drain an accepted HTTP request after ${signal} before exiting`, { timeout: 10_000 }, async (t) => {
    const running = await launch(t);
    const url = await running.ready();
    let client!: ClientRequest;
    const pending = new Promise<{ status: number | undefined; body: { title: string } }>((resolve, reject) => {
      client = request(
        `${url}/runtime/assistants/support/conversations`,
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
    t.onTestFinished(() => {
      client.destroy();
    });
    await running.waitForOutput(/POST \/api\/v1\/runtime\/assistants\/support\/conversations/);
    running.child.kill(signal);
    await running.waitForOutput(new RegExp(`${signal} received: closing HTTP server`));
    await assert.rejects(fetch(`${url}/admin/conversations`));
    assert.equal(running.child.exitCode, null);
    client.end('"Synthetic private title"}');
    const response = await pending;
    assert.equal(response.status, 201);
    assert.equal(response.body.title, "Synthetic private title");
    const [code, exitSignal] = await running.exited;
    assert.equal(code, 0, running.output());
    assert.equal(exitSignal, null);
    assert.match(running.output(), /HTTP server closed/);
    assert.match(running.output(), /Database connections closed/);
    assert.doesNotMatch(running.output(), /Synthetic private title/);
    const stored = await running.db.selectFrom("conversations").select("title").executeTakeFirstOrThrow();
    assert.equal(stored.title, "Synthetic private title");
  });
}

test(
  "should start without a model and read configuration from its executable env-file boundary",
  { timeout: 10_000 },
  async (t) => {
    const port = await availablePort();
    const running = await launch(
      t,
      {},
      (databaseUrl) =>
        `NODE_ENV=development\nPORT=${port}\nCORS_ORIGINS=https://from-file.example.test\nDATABASE_URL=${databaseUrl}\n`
    );
    const url = await running.ready();
    const response = await fetch(`${url}/admin/conversations`, {
      headers: { Origin: "https://from-file.example.test" },
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("Access-Control-Allow-Origin"), "https://from-file.example.test");
    running.child.kill("SIGTERM");
    assert.equal((await running.exited)[0], 0);
  }
);

test("should prioritize process configuration over the env file", { timeout: 10_000 }, async (t) => {
  const port = await availablePort();
  const running = await launch(
    t,
    (databaseUrl) => ({
      NODE_ENV: "test",
      PORT: port,
      CORS_ORIGINS: "https://from-process.example.test",
      DATABASE_URL: databaseUrl,
    }),
    "NODE_ENV=invalid\nPORT=invalid\nCORS_ORIGINS=invalid\nDATABASE_URL=invalid\n"
  );
  const url = await running.ready();
  const response = await fetch(`${url}/admin/conversations`, {
    headers: { Origin: "https://from-process.example.test" },
  });
  assert.equal(response.status, 200);
  running.child.kill("SIGTERM");
  assert.equal((await running.exited)[0], 0);
});

test("should reject missing required platform settings before listening", { timeout: 10_000 }, async (t) => {
  const running = await launch(t, {
    NODE_ENV: "",
    PORT: "",
    CORS_ORIGINS: "",
    DATABASE_URL: "",
  });
  assert.equal((await running.exited)[0], 1);
  for (const key of ["NODE_ENV", "PORT", "CORS_ORIGINS", "DATABASE_URL"])
    assert.match(running.output(), new RegExp(`${key}: required`));
  assert.doesNotMatch(running.output(), /Server running on/);
});

test(
  "should reject invalid platform settings together without exposing values or opening HTTP",
  { timeout: 10_000 },
  async (t) => {
    const running = await launch(t, {
      NODE_ENV: "invalid",
      PORT: "0",
      CORS_ORIGINS: "https://user:private-value@example.test",
      DATABASE_URL: "postgres://user:private-value@",
    });
    assert.equal((await running.exited)[0], 1);
    assert.match(running.output(), /Failed to start server:/);
    for (const key of ["NODE_ENV", "PORT", "CORS_ORIGINS", "DATABASE_URL"])
      assert.match(running.output(), new RegExp(key));
    assert.doesNotMatch(running.output(), /private-value|example\.test|Server running on/);
  }
);

test("should exit unsuccessfully for a port binding error", { timeout: 10_000 }, async (t) => {
  const occupied = createServer();
  t.onTestFinished(
    () => new Promise<void>((resolve, reject) => occupied.close((error) => (error ? reject(error) : resolve())))
  );
  occupied.listen(0);
  await once(occupied, "listening");
  const running = await launch(t, { PORT: String((occupied.address() as AddressInfo).port) });
  assert.equal((await running.exited)[0], 1);
  assert.match(running.output(), /Failed to start HTTP server:/);
  assert.match(running.output(), /EADDRINUSE/);
});

test("should reject an unreadable env file at the startup boundary", { timeout: 10_000 }, async (t) => {
  const running = await launch(t, {}, "directory");
  assert.equal((await running.exited)[0], 1);
  assert.match(running.output(), /could not be read; check the file location and permissions/);
  assert.doesNotMatch(running.output(), /Server running on/);
});
