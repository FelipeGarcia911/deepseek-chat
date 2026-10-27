import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { test } from "vitest";
import { loadConfig } from "../src/config";

test("should provide a backend example containing only the required platform settings with clean values", () => {
  const example = dotenv.parse(readFileSync(path.join(__dirname, "../.env.example")));
  assert.deepEqual(example, {
    NODE_ENV: "development",
    PORT: "4000",
    CORS_ORIGINS: "http://localhost:5173",
    DATABASE_URL: "postgres://chat_app:chat_app@localhost:5432/chat_app",
  });
  assert.doesNotThrow(() => loadConfig(example));
});
