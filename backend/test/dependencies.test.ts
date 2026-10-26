import assert from "node:assert/strict";
import request from "supertest";
import { test, vi } from "vitest";
import { createApp } from "../src/app";
import { NodeEnvironment } from "../src/config";
import type { ChatControllerDependencies } from "../src/controllers/ChatController";

const cases = [
  { method: "getChats", verb: "get", route: "/list", error: "Failed to fetch chats." },
  { method: "createChat", verb: "post", route: "/new", error: "Failed to create chat." },
  { method: "getChatHistory", verb: "get", route: "/test-chat/history", error: "Failed to retrieve chat history." },
  { method: "deleteChat", verb: "delete", route: "/test-chat", error: "Failed to delete chat." },
] as const;

for (const scenario of cases) {
  test(`should return a controlled 500 for ${scenario.method} failure and remain usable`, async () => {
    const failingMethod = vi.fn(() => {
      throw new Error("Synthetic storage failure: internal detail");
    });
    const unexpected = (): never => {
      throw new Error("Unexpected service operation");
    };
    const chatService: ChatControllerDependencies["chatService"] = {
      getChats: () => [],
      createChat: unexpected,
      getChatHistory: unexpected,
      deleteChat: unexpected,
      [scenario.method]: failingMethod,
    };
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp({ chatService }, { nodeEnv: NodeEnvironment.Test, corsOrigins: [] });
    const api = request(app);
    const operation = api[scenario.verb](`/api/chats${scenario.route}`);
    if (scenario.verb === "post") operation.send({ title: "Test chat" });
    await operation.expect(500, { error: scenario.error });
    assert.equal(failingMethod.mock.calls.length, 1);
    assert.equal(errorLog.mock.calls.length, 1);

    chatService.getChats = () => [];
    await api.get("/api/chats/list").expect(200, []);
  });
}
