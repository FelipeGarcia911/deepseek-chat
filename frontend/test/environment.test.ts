import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { test, vi } from "vitest";
import { readFileSync } from "node:fs";
import axios from "axios";
import { ProblemDetails } from "@chat-app/shared";
import { parseFrontendConfig } from "../src/config/schema";
import { fileURLToPath } from "node:url";
import { build, createServer as createViteServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const conversationId = "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47";
const createdAt = "2026-10-26T12:00:00.000Z";
const require = createRequire(import.meta.url);
const viteCli = path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");

for (const command of [[], ["build"]]) {
  for (const value of ["", "https://user:private-value@example.test/api"]) {
    test(`should reject invalid public configuration before Vite ${command.length ? "build" : "development"} startup`, () => {
      const result = spawnSync(process.execPath, [viteCli, ...command], {
        cwd: root,
        env: { ...process.env, VITE_API_BASE_URL: value },
        encoding: "utf8",
        timeout: 10_000,
      });
      assert.equal(result.status, 1, "Vite should fail configuration validation without starting a server");
      const output = result.stdout + result.stderr;
      assert.match(output, /Invalid frontend configuration: VITE_API_BASE_URL/);
      assert.doesNotMatch(output, /private-value/);
    });
  }
}

test("should use the configured origin and API path prefix", async (t) => {
  t.onTestFinished(() => {
    vi.unstubAllEnvs();
  });
  const paths: (string | undefined)[] = [];
  const api = createHttpServer((req, res) => {
    paths.push(req.url);
    res.setHeader("Content-Type", "application/json");
    if (req.method === "POST") {
      res.statusCode = 503;
      res.end(
        JSON.stringify({
          type: "about:blank",
          title: "Service Unavailable",
          status: 503,
          code: "MODEL_NOT_CONFIGURED",
          detail: "No Model Profile has been configured.",
          requestId: "synthetic-request-id",
        })
      );
      return;
    }
    res.end(
      JSON.stringify({
        items: [{ id: conversationId, assistantId: conversationId, title: "Test chat", status: "open", createdAt }],
        nextCursor: null,
      })
    );
  });
  t.onTestFinished(
    () => new Promise<void>((resolve, reject) => api.close((error) => (error ? reject(error) : resolve())))
  );
  api.listen(0, "127.0.0.1");
  await once(api, "listening");
  const address = api.address();
  assert.ok(address && typeof address === "object");
  vi.stubEnv("VITE_API_BASE_URL", `http://127.0.0.1:${address.port}/platform/api/`);
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
    logLevel: "silent",
  });
  t.onTestFinished(() => vite.close());
  const { default: service } = await vite.ssrLoadModule("/src/services/Conversations.ts");
  assert.deepEqual(await service.listConversations(), [
    { id: conversationId, assistantId: conversationId, title: "Test chat", status: "open", createdAt, messages: [] },
  ]);
  assert.deepEqual(paths, ["/platform/api/v1/admin/conversations?limit=100"]);
  await assert.rejects(service.sendMessage(conversationId, "Synthetic question"), (error) => {
    assert.ok(error instanceof Error);
    assert.equal(error.name, "ApiError");
    assert.equal(error.message, "No Model Profile has been configured.");
    assert.ok("problem" in error && "cause" in error);
    const problem = ProblemDetails.parse(error.problem);
    const { cause } = error;
    assert.deepEqual(
      [problem.status, problem.code, problem.requestId],
      [503, "MODEL_NOT_CONFIGURED", "synthetic-request-id"]
    );
    assert.ok(axios.isAxiosError(cause));
    return true;
  });
  assert.deepEqual(paths, [
    "/platform/api/v1/admin/conversations?limit=100",
    `/platform/api/v1/runtime/conversations/${conversationId}/messages`,
  ]);
});

test("should bundle the selected public API URL rather than the previous hard-coded URL", async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "chat-frontend-build-"));
  t.onTestFinished(async () => {
    vi.unstubAllEnvs();
    await rm(directory, { recursive: true, force: true });
  });
  vi.stubEnv("VITE_API_BASE_URL", "https://gateway.example.test/platform/api");
  await build({ root, build: { outDir: directory, emptyOutDir: true }, logLevel: "silent" });
  const assets = await readdir(path.join(directory, "assets"));
  const code = (
    await Promise.all(
      assets
        .filter((name) => name.endsWith(".js"))
        .map((name) => readFile(path.join(directory, "assets", name), "utf8"))
    )
  ).join("\n");
  assert.ok(
    code.includes("https://gateway.example.test/platform/api"),
    "The configured API URL must reach the browser bundle"
  );
  assert.ok(!code.includes("http://localhost:4000"), "The previous hard-coded API URL must not remain in the bundle");
}, 20_000);

test("should provide a frontend example with one clean public API base URL", () => {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const entries = example.split("\n").filter((line) => line && !line.startsWith("#"));
  assert.deepEqual(entries, ["VITE_API_BASE_URL=http://localhost:4000/api"]);
  assert.doesNotThrow(() => parseFrontendConfig({ VITE_API_BASE_URL: entries[0].split("=")[1] }));
});
