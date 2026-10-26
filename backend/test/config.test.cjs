const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const dotenv = require("dotenv");
const { ConfigurationError, loadConfig } = require("../dist/config");

const environment = {
  NODE_ENV: "development",
  PORT: "4000",
  CORS_ORIGINS: "http://localhost:5173",
  CHAT_STORAGE_PATH: "./data/chats.json",
};
const backendDirectory = path.resolve(__dirname, "..");

test("platform configuration is typed and deeply immutable for its scalar and origin-list values", () => {
  const config = loadConfig(environment);
  assert.deepEqual(config, {
    nodeEnv: "development",
    port: 4000,
    corsOrigins: ["http://localhost:5173"],
    chatStoragePath: path.join(backendDirectory, "data/chats.json"),
  });
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.corsOrigins));
  assert.throws(() => config.corsOrigins.push("https://unapproved.example"), TypeError);
});

test("configuration parsing does not mutate its input and normalizes and deduplicates origins", () => {
  const input = Object.freeze({
    ...environment,
    PORT: " 8081 ",
    CORS_ORIGINS: " HTTPS://EXAMPLE.TEST:443/ , http://localhost:5173,https://example.test ",
  });
  const before = { ...input };
  const config = loadConfig(input);
  assert.deepEqual(input, before);
  assert.equal(config.port, 8081);
  assert.deepEqual(config.corsOrigins, ["https://example.test", "http://localhost:5173"]);
});

for (const key of Object.keys(environment)) {
  for (const value of [undefined, "", " "]) {
    test(`platform configuration requires a non-empty ${key} (${JSON.stringify(value)})`, () => {
      assert.throws(() => loadConfig({ ...environment, [key]: value }), new RegExp(`${key}: required`));
    });
  }
}

for (const value of ["0", "-1", "65536", "3.5", "4e3", "0xFA0", "4000abc", "NaN"]) {
  test(`platform configuration rejects invalid port ${JSON.stringify(value)}`, () => {
    assert.throws(() => loadConfig({ ...environment, PORT: value }), /PORT: must be an integer from 1 to 65535/);
  });
}

test("port boundaries and all supported node environments are accepted", () => {
  assert.equal(loadConfig({ ...environment, PORT: "1" }).port, 1);
  assert.equal(loadConfig({ ...environment, PORT: "65535" }).port, 65535);
  for (const nodeEnv of ["development", "test", "production"]) {
    assert.equal(loadConfig({ ...environment, NODE_ENV: nodeEnv }).nodeEnv, nodeEnv);
  }
  assert.throws(
    () => loadConfig({ ...environment, NODE_ENV: "staging" }),
    /NODE_ENV: must be development, test or production/
  );
});

for (const value of [
  "*",
  "https://*.example.test",
  "http://*:5173",
  "https:///example.test",
  "https://example.test/.",
  "null",
  "example.test",
  "http:example.test",
  "ftp://example.test",
  "https://user:private-value@example.test",
  "https://example.test/admin",
  "https://example.test/?token=private-value",
  "https://example.test/#fragment",
  "https://example.test?",
  "https://example.test#",
  "https://example.test,",
  "https://example.test,,http://localhost:5173",
  "https://bad origin.test",
]) {
  test(`platform configuration rejects malformed CORS origins ${JSON.stringify(value)}`, () => {
    for (const nodeEnv of ["development", "production"]) {
      assert.throws(() => loadConfig({ ...environment, NODE_ENV: nodeEnv, CORS_ORIGINS: value }), /CORS_ORIGINS:/);
    }
  });
}

for (const value of ["data/", "chats.txt", "bad\0path.json", "bad\npath.json"]) {
  test(`platform configuration rejects invalid storage path ${JSON.stringify(value)}`, () => {
    assert.throws(() => loadConfig({ ...environment, CHAT_STORAGE_PATH: value }), /CHAT_STORAGE_PATH:/);
  });
}

test("storage paths resolve against the backend package rather than cwd or the services directory", () => {
  assert.equal(loadConfig(environment).chatStoragePath, path.resolve(backendDirectory, "data/chats.json"));
  const explicitBase = path.resolve("alternate-backend");
  assert.equal(loadConfig(environment, explicitBase).chatStoragePath, path.join(explicitBase, "data/chats.json"));
  const absolute = path.resolve("absolute-store.json");
  assert.equal(loadConfig({ ...environment, CHAT_STORAGE_PATH: absolute }, explicitBase).chatStoragePath, absolute);
});

test("configuration errors aggregate fields without exposing supplied values", () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: "",
        PORT: "invalid",
        CORS_ORIGINS: "https://user:private-value@example.test",
        CHAT_STORAGE_PATH: "",
      }),
    (error) => {
      assert.ok(error instanceof ConfigurationError);
      for (const key of Object.keys(environment)) assert.match(error.message, new RegExp(key));
      assert.match(error.message, /Check backend\/\.env or the process environment/);
      assert.doesNotMatch(error.message, /private-value|user:|example\.test/);
      return true;
    }
  );
});

test("the backend example contains only the required platform settings with clean values", () => {
  const example = dotenv.parse(readFileSync(path.join(__dirname, "../.env.example")));
  assert.deepEqual(example, environment);
  assert.doesNotThrow(() => loadConfig(example));
});
