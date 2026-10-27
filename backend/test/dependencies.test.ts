import assert from "node:assert/strict";
import request from "supertest";
import { test, vi } from "vitest";
import { createApp, type AppDependencies } from "../src/app";
import { NodeEnvironment } from "../src/config";
import type { ConversationControllerDependencies } from "../src/controllers/ConversationController";
import type { ConversationSummary, MessageStreamEvent } from "@chat-app/shared";
import { AppError } from "../src/errors";

type ConversationServiceStub = ConversationControllerDependencies["conversationService"];

const conversationId = "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47";
const emptyPage = { items: [], nextCursor: null };
const cases = [
  { method: "listConversations", verb: "get", route: "/admin/conversations" },
  { method: "createConversation", verb: "post", route: "/runtime/assistants/support/conversations" },
  { method: "listMessages", verb: "get", route: `/runtime/conversations/${conversationId}/messages` },
  { method: "deleteConversation", verb: "delete", route: `/admin/conversations/${conversationId}` },
] as const;

type ChatRuntimeStub = AppDependencies["chatRuntime"];

const unusedRuntime: ChatRuntimeStub = {
  sendMessage: async () => {
    throw new Error("Unexpected runtime operation");
  },
};

function appWith(
  conversationService: ConversationServiceStub,
  checkReadiness: AppDependencies["healthService"]["checkReadiness"] = async () => ({ ready: true }),
  chatRuntime: ChatRuntimeStub = unusedRuntime
) {
  return request(
    createApp(
      { conversationService, chatRuntime, healthService: { checkReadiness } },
      { nodeEnv: NodeEnvironment.Test, corsOrigins: [] }
    )
  );
}

function serviceStub(overrides: Partial<ConversationServiceStub> = {}): ConversationServiceStub {
  const unexpected = (): never => {
    throw new Error("Unexpected service operation");
  };
  return {
    listConversations: async () => emptyPage,
    createConversation: unexpected,
    listMessages: unexpected,
    deleteConversation: unexpected,
    ...overrides,
  };
}

function createTestApp(method: (typeof cases)[number]["method"], failure: () => never) {
  const conversationService = serviceStub({ [method]: vi.fn(failure) });
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

    conversationService.listConversations = async () => emptyPage;
    await api.get("/api/v1/admin/conversations").expect(200, emptyPage);
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
  const summary: ConversationSummary = {
    id: conversationId,
    assistantId: conversationId,
    title: "Stored chat",
    status: "open",
    createdAt: "2026-10-26T12:00:00.000Z",
  };
  const items = [{ ...summary, workspaceId: "internal" }];
  const api = appWith(serviceStub({ listConversations: async () => ({ items, nextCursor: null }) }));
  await api.get("/api/v1/admin/conversations").expect(200, { items: [summary], nextCursor: null });
});

test("should return an internal error problem when a response breaks its contract", async () => {
  const broken: ConversationSummary = {
    id: "not-a-uuid",
    assistantId: conversationId,
    title: "Stored chat",
    status: "open",
    createdAt: "yesterday",
  };
  const api = appWith(serviceStub({ listConversations: async () => ({ items: [broken], nextCursor: null }) }));
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  const response = await api.get("/api/v1/admin/conversations").expect(500);
  assert.equal(response.body.code, "INTERNAL_ERROR");
  assert.doesNotMatch(JSON.stringify(response.body), /not-a-uuid/);
  assert.equal(errorLog.mock.calls.length, 1);
});

test("should report liveness without consulting the database", async () => {
  const checkReadiness = vi.fn(async () => ({ ready: false as const, reason: "Unused." }));
  await appWith(serviceStub(), checkReadiness).get("/health/live").expect(200, { status: "ok" });
  assert.equal(checkReadiness.mock.calls.length, 0);
});

test("should report readiness separately from liveness", async () => {
  await appWith(serviceStub()).get("/health/ready").expect(200, { status: "ready" });
  const response = await appWith(serviceStub(), async () => ({
    ready: false,
    reason: "The database is unreachable.",
  }))
    .get("/health/ready")
    .expect(503);
  assert.equal(response.body.code, "DEPENDENCY_UNAVAILABLE");
  assert.equal(response.body.detail, "The database is unreachable.");
});

test("should end the event stream and log when the runtime fails after it started", async () => {
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  async function* failing(): AsyncGenerator<MessageStreamEvent> {
    yield { type: "delta", text: "Partial" };
    throw new Error("Synthetic finalization failure");
  }
  const api = appWith(serviceStub(), undefined, { sendMessage: async () => failing() });
  const response = await api.post(`/api/v1/runtime/conversations/${conversationId}/messages`).send({ content: "Hi" });
  assert.equal(response.status, 200);
  assert.match(response.headers["content-type"], /^text\/event-stream/);
  assert.equal(response.text, 'event: delta\ndata: {"type":"delta","text":"Partial"}\n\n');
  assert.equal(errorLog.mock.calls.length, 1);
});

test("should answer admission failures as problems before any event is streamed", async () => {
  const api = appWith(serviceStub(), undefined, {
    sendMessage: async () => {
      throw new AppError("RUN_IN_PROGRESS", "A run is already active.");
    },
  });
  const response = await api.post(`/api/v1/runtime/conversations/${conversationId}/messages`).send({ content: "Hi" });
  assert.equal(response.status, 409);
  assert.equal(response.body.code, "RUN_IN_PROGRESS");
});
