import { describe, expect, it, vi } from "vitest";
import ConversationService, { type AssistantTarget, type ConversationStore } from "../src/services/ConversationService";

const id = "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47";
const open = { id, assistantId: id, title: "Chat", status: "open" as const, createdAt: "2026-10-27T12:00:00.000Z" };
const unexpected = async (): Promise<never> => {
  throw new Error("Unexpected store call");
};

function serviceWith(overrides: Partial<ConversationStore>) {
  const store: ConversationStore = {
    listConversations: unexpected,
    findConversation: unexpected,
    lockConversation: unexpected,
    findAssistantTarget: unexpected,
    insertConversation: unexpected,
    deleteConversation: unexpected,
    listMessages: unexpected,
    appendMessage: unexpected,
    hasActiveRun: unexpected,
    insertRun: unexpected,
    findRun: unexpected,
    updateRun: unexpected,
    findResponse: unexpected,
    ...overrides,
  };
  return new ConversationService({ store, transaction: (work) => work(store) });
}

const targets: [AssistantTarget | undefined, string, string][] = [
  [undefined, "NOT_FOUND", "Assistant not found."],
  [
    { assistantId: id, workspaceId: id, status: "archived", versionId: id },
    "INVALID_STATE",
    "The assistant is archived.",
  ],
  [
    { assistantId: id, workspaceId: id, status: "active", versionId: null },
    "INVALID_STATE",
    "The assistant has no production deployment.",
  ],
];

describe("conversation rules", () => {
  it.each(targets)("should refuse to start a conversation for target %o", async (target, code, message) => {
    const insertConversation = vi.fn(unexpected);
    const service = serviceWith({ findAssistantTarget: async () => target, insertConversation });
    await expect(service.createConversation("support", "Chat")).rejects.toMatchObject({ code, message });
    expect(insertConversation).not.toHaveBeenCalled();
  });

  it("should check that a conversation exists and is open before reporting the missing model", async () => {
    const findConversation = vi
      .fn<ConversationStore["findConversation"]>()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ ...open, status: "closed" })
      .mockResolvedValueOnce(open);
    const service = serviceWith({ findConversation });
    for (const code of ["NOT_FOUND", "INVALID_STATE", "MODEL_NOT_CONFIGURED"]) {
      await expect(service.sendMessage(id, "Question")).rejects.toMatchObject({ code });
    }
  });

  it("should reject a second run while one is active without writing a message", async () => {
    const appendMessage = vi.fn(unexpected);
    const service = serviceWith({
      lockConversation: async () => ({ ...open, workspaceId: id }),
      hasActiveRun: async () => true,
      appendMessage,
    });
    await expect(service.acceptUserMessage(id, "Question")).rejects.toMatchObject({ code: "RUN_IN_PROGRESS" });
    expect(appendMessage).not.toHaveBeenCalled();
  });

  it("should refuse run transitions the store did not apply", async () => {
    const service = serviceWith({ updateRun: async () => false });
    await expect(service.startRun(id, { provider: "ollama", model: "llama3" })).rejects.toMatchObject({
      code: "INVALID_STATE",
    });
    await expect(service.finishRun(id, { outcome: "cancelled" })).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("should report a run whose conversation or row disappeared as not found", async () => {
    const running = { conversationId: id, status: "running" as const };
    const withoutConversation = serviceWith({ findRun: async () => running, lockConversation: async () => undefined });
    await expect(withoutConversation.completeRun(id, { content: "Answer" })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const withoutRun = serviceWith({
      findRun: vi.fn<ConversationStore["findRun"]>().mockResolvedValueOnce(running).mockResolvedValueOnce(undefined),
      lockConversation: async () => ({ ...open, workspaceId: id }),
    });
    await expect(withoutRun.completeRun(id, { content: "Answer" })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("should not invent a response for a succeeded run that has none", async () => {
    const service = serviceWith({
      findRun: async () => ({ conversationId: id, status: "succeeded" }),
      lockConversation: async () => ({ ...open, workspaceId: id }),
      findResponse: async () => undefined,
    });
    await expect(service.completeRun(id, { content: "Answer" })).rejects.toMatchObject({
      code: "INVALID_STATE",
      message: "The run is succeeded.",
    });
  });

  it("should reject cursors that do not decode to the expected key", async () => {
    const service = serviceWith({ findConversation: async () => open });
    await expect(service.listConversations({ limit: 20, cursor: "bm90LWEtdXVpZA" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(service.listMessages(id, { limit: 20, cursor: "MA" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
  });
});
