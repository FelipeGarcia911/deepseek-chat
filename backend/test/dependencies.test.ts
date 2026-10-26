import assert from "node:assert/strict";
import request from "supertest";
import { test, vi } from "vitest";
import { createApp } from "../src/app";
import { NodeEnvironment } from "../src/config";
import type { ConversationControllerDependencies } from "../src/controllers/ConversationController";
import { AppError } from "../src/errors";

type ConversationServiceStub = ConversationControllerDependencies["conversationService"];

const conversationId = "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47";
const cases = [
  { method: "listConversations", verb: "get", route: "/admin/conversations" },
  { method: "createConversation", verb: "post", route: "/runtime/conversations" },
  { method: "getMessages", verb: "get", route: `/runtime/conversations/${conversationId}/messages` },
  { method: "deleteConversation", verb: "delete", route: `/admin/conversations/${conversationId}` },
] as const;

function appWith(conversationService: ConversationServiceStub) {
  return request(createApp({ conversationService }, { nodeEnv: NodeEnvironment.Test, corsOrigins: [] }));
}

function createTestApp(method: (typeof cases)[number]["method"], failure: () => never) {
  const unexpected = (): never => {
    throw new Error("Unexpected service operation");
  };
  const conversationService: ConversationServiceStub = {
    listConversations: () => [],
    createConversation: unexpected,
    getMessages: unexpected,
    deleteConversation: unexpected,
    [method]: vi.fn(failure),
  };
  return { conversationService, api: appWith(conversationService) };
}

function call(api: ReturnType<typeof request>, scenario: (typeof cases)[number]) {
  const operation = api[scenario.verb](`/api/v1${scenario.route}`);
  return scenario.verb === "post" ? operation.send({ title: "Test chat" }) : operation;
}

for (const scenario of cases) {
  test(`should return an internal error problem without details for ${scenario.method} failure and remain usable`, async () => {
    const { conversationService, api } = createTestApp(scenario.method, () => {
      throw new Error("Synthetic storage failure: internal detail");
    });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await call(api, scenario).expect(500);
    assert.equal(response.body.code, "INTERNAL_ERROR");
    assert.doesNotMatch(JSON.stringify(response.body), /internal detail/);
    assert.equal(vi.mocked(conversationService[scenario.method]).mock.calls.length, 1);
    assert.equal(errorLog.mock.calls.length, 1);
    assert.match(String(errorLog.mock.calls[0][0]), new RegExp(response.body.requestId));

    conversationService.listConversations = () => [];
    await api.get("/api/v1/admin/conversations").expect(200, { items: [], nextCursor: null });
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
  const summary = { id: conversationId, title: "Stored chat", createdAt: "2026-10-26T12:00:00.000Z" };
  const api = appWith({
    listConversations: () => [{ ...summary, storagePath: "/private/conversations.json" }],
  } as unknown as ConversationServiceStub);
  await api.get("/api/v1/admin/conversations").expect(200, { items: [summary], nextCursor: null });
});

test("should return an internal error problem when a response breaks its contract", async () => {
  const api = appWith({
    listConversations: () => [{ id: "not-a-uuid", title: "Stored chat", createdAt: "yesterday" }],
  } as unknown as ConversationServiceStub);
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await api.get("/api/v1/admin/conversations").expect(500);
  assert.equal(response.body.code, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(response.body), /not-a-uuid/);
  assert.equal(errorLog.mock.calls.length, 1);
});
