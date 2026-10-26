import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseFrontendConfig } from "../src/config/schema.ts";

test("frontend configuration preserves custom origins and path prefixes while removing trailing slashes", () => {
  const config = parseFrontendConfig({ VITE_API_BASE_URL: " https://gateway.example.test/platform/api/// " });
  assert.deepEqual(config, { apiBaseUrl: "https://gateway.example.test/platform/api" });
  assert.equal(Object.isFrozen(config), true);
  assert.equal(
    parseFrontendConfig({ VITE_API_BASE_URL: "https://gateway.example.test/" }).apiBaseUrl,
    "https://gateway.example.test"
  );
});

for (const value of [undefined, "", " ", null, false, 4000]) {
  test(`frontend rejects missing or non-string API URL ${JSON.stringify(value)}`, () => {
    assert.throws(() => parseFrontendConfig({ VITE_API_BASE_URL: value }), /VITE_API_BASE_URL is required/);
  });
}

for (const value of [
  "//other.example.test/api",
  "http:example.test",
  "ftp://example.test/api",
  "file:///tmp/api",
  "https://user:secret@example.test/api",
  "https://example.test/api?token=secret",
  "https://example.test/api#fragment",
  "https://example.test/api?",
  "https://example.test/api#",
  "http://localhost:4000/api # comment",
]) {
  test(`frontend rejects invalid API URL ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => parseFrontendConfig({ VITE_API_BASE_URL: value }),
      /VITE_API_BASE_URL must be an HTTP\(S\) or root-relative API base URL/
    );
  });
}

test("frontend configuration errors never echo the supplied URL", () => {
  assert.throws(
    () => parseFrontendConfig({ VITE_API_BASE_URL: "https://user:private-value@example.test/api" }),
    (error) => {
      assert.doesNotMatch(error.message, /private-value|user:|example\.test/);
      return true;
    }
  );
});

test("the frontend example has one clean public API base URL", () => {
  const example = readFileSync(new URL("../.env.example", import.meta.url), "utf8");
  const entries = example.split("\n").filter((line) => line && !line.startsWith("#"));
  assert.deepEqual(entries, ["VITE_API_BASE_URL=http://localhost:4000/api"]);
  assert.doesNotThrow(() => parseFrontendConfig({ VITE_API_BASE_URL: entries[0].split("=")[1] }));
});

test("frontend configuration supports root-relative API paths and normalizes their trailing slashes", () => {
  assert.deepEqual(parseFrontendConfig({ VITE_API_BASE_URL: "/platform/api///" }), { apiBaseUrl: "/platform/api" });
  assert.deepEqual(parseFrontendConfig({ VITE_API_BASE_URL: "/" }), { apiBaseUrl: "" });
  for (const value of [
    "api",
    "//other.example.test/api",
    "/\\other.example.test/api",
    "/api?secret=value",
    "/api#fragment",
  ]) {
    assert.throws(() => parseFrontendConfig({ VITE_API_BASE_URL: value }), /VITE_API_BASE_URL/);
  }
});
