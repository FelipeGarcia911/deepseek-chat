import assert from "node:assert/strict";
import request from "supertest";
import { test, vi } from "vitest";
import { createApp } from "../src/app";
import { NodeEnvironment } from "../src/config";
import type { ChatControllerDependencies } from "../src/controllers/ChatController";
import { AppError } from "../src/errors";

const cases = [
  { method: "getChats", verb: "get", route: "/list" },
  { method: "createChat", verb: "post", route: "/new" },
  { method: "getChatHistory", verb: "get", route: "/1/history" },
  { method: "deleteChat", verb: "delete", route: "/1" },
] as const;

function createTestApp(method: (typeof cases)[number]["method"], failure: () => never) {
  const unexpected = (): never => {
    throw new Error("Unexpected service operation");
  };
  const chatService: ChatControllerDependencies["chatService"] = {
    getChats: () => [],
    createChat: unexpected,
    getChatHistory: unexpected,
    deleteChat: unexpected,
    [method]: vi.fn(failure),
  };
  return { chatService, api: request(createApp({ chatService }, { nodeEnv: NodeEnvironment.Test, corsOrigins: [] })) };
}

function call(api: ReturnType<typeof request>, scenario: (typeof cases)[number]) {
  const operation = api[scenario.verb](`/api/chats${scenario.route}`);
  return scenario.verb === "post" ? operation.send({ title: "Test chat" }) : operation;
}

for (const scenario of cases) {
  test(`should return an internal error problem without details for ${scenario.method} failure and remain usable`, async () => {
    const { chatService, api } = createTestApp(scenario.method, () => {
      throw new Error("Synthetic storage failure: internal detail");
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(api, scenario).expect(500);
    assert.equal(response.body.code, "INTERNAL_ERROR");
    assert.doesNotMatch(JSON.stringify(response.body), /internal detail/);
    assert.equal(vi.mocked(chatService[scenario.method]).mock.calls.length, 1);
    assert.equal(errorLog.mock.calls.length, 1);
    assert.match(String(errorLog.mock.calls[0][0]), new RegExp(response.body.requestId));

    chatService.getChats = () => [];
    await api.get("/api/chats/list").expect(200, []);
  });

  test(`should map a typed ${scenario.method} conflict to a stable 409 problem without logging it`, async () => {
    const { api } = createTestApp(scenario.method, () => {
      throw new AppError("RUN_IN_PROGRESS", "A run is already active.");
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(api, scenario).expect(409);
    assert.equal(response.body.code, "RUN_IN_PROGRESS");
    assert.equal(response.body.detail, "A run is already active.");
    assert.equal(errorLog.mock.calls.length, 0);
  });
}

test("should strip members the response contract does not declare", async () => {
  const chatService = {
    getChats: () => [{ id: "1", title: "Stored chat", storagePath: "/private/chats.json" }],
  } as unknown as ChatControllerDependencies["chatService"];
  const api = request(createApp({ chatService }, { nodeEnv: NodeEnvironment.Test, corsOrigins: [] }));
  await api.get("/api/chats/list").expect(200, [{ id: "1", title: "Stored chat" }]);
});

test("should return an internal error problem when a response breaks its contract", async () => {
  const chatService = {
    getChats: () => [{ id: "not-numeric", title: "Stored chat" }],
  } as unknown as ChatControllerDependencies["chatService"];
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  const api = request(createApp({ chatService }, { nodeEnv: NodeEnvironment.Test, corsOrigins: [] }));
  const response = await api.get("/api/chats/list").expect(500);
  assert.equal(response.body.code, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(response.body), /not-numeric/);
  assert.equal(errorLog.mock.calls.length, 1);
});
