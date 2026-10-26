import assert from "node:assert/strict";
import { test } from "vitest";
import { parseFrontendConfig } from "../src/config/schema.ts";

test("should preserve custom origins and path prefixes while removing trailing slashes", () => {
  const config = parseFrontendConfig({ VITE_API_BASE_URL: " https://gateway.example.test/platform/api/// " });
  assert.deepEqual(config, { apiBaseUrl: "https://gateway.example.test/platform/api" });
  assert.equal(Object.isFrozen(config), true);
  assert.equal(
    parseFrontendConfig({ VITE_API_BASE_URL: "https://gateway.example.test/" }).apiBaseUrl,
    "https://gateway.example.test"
  );
});

for (const value of [undefined, "", " ", null, false, 4000]) {
  test(`should reject missing or non-string API URL ${JSON.stringify(value)}`, () => {
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
  test(`should reject invalid API URL ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => parseFrontendConfig({ VITE_API_BASE_URL: value }),
      /VITE_API_BASE_URL must be an HTTP\(S\) or root-relative API base URL/
    );
  });
}

test("should omit supplied URLs from frontend configuration errors", () => {
  assert.throws(
    () => parseFrontendConfig({ VITE_API_BASE_URL: "https://user:private-value@example.test/api" }),
    (error) => {
      assert.ok(error instanceof Error);
      assert.doesNotMatch(error.message, /private-value|user:|example\.test/);
      return true;
    }
  );
});

test("should support root-relative API paths and normalize their trailing slashes", () => {
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
