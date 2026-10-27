import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import type { MessageStreamEvent } from "@chat-app/shared";
import ChatService from "@/services/Conversations";
import reducer, {
  sendMessage,
  fetchChats,
  createChat,
  fetchChatHistory,
  deleteChat,
  messageAccepted,
  deltaReceived,
} from "./Chat";

const createdAt = "2026-10-26T12:00:00.000Z";
const question = { id: "m-1", role: "user" as const, content: "Synthetic question", createdAt };
const reply = { id: "m-2", role: "assistant" as const, content: "Synthetic result", createdAt };
const openChat = {
  id: "test-chat",
  assistantId: "assistant-1",
  status: "open" as const,
  title: "Test chat",
  createdAt,
};

async function* stream(...events: MessageStreamEvent[]): AsyncGenerator<MessageStreamEvent> {
  yield* events;
}

async function* rejecting(error: Error): AsyncGenerator<MessageStreamEvent> {
  yield* [];
  throw error;
}

function storeWithChat() {
  return configureStore({
    reducer: { chat: reducer },
    preloadedState: {
      chat: { chats: [{ ...openChat, messages: [] }], isLoadingChats: false, isSendingMessage: false, streaming: null },
    },
  });
}

describe("message streaming", () => {
  it("should show nothing and clear loading when the request is rejected before acceptance", async () => {
    const service = vi
      .spyOn(ChatService, "sendMessage")
      .mockImplementation(() => rejecting(new Error("MODEL_NOT_CONFIGURED")));
    const store = storeWithChat();
    const pending = store.dispatch(sendMessage({ chatId: "test-chat", message: "Synthetic question" }));
    expect(store.getState().chat.isSendingMessage).toBe(true);
    expect(sendMessage.rejected.match(await pending)).toBe(true);
    expect(service).toHaveBeenCalledExactlyOnceWith("test-chat", "Synthetic question", expect.any(AbortSignal));
    expect(store.getState().chat).toMatchObject({ isSendingMessage: false, streaming: null });
    expect(store.getState().chat.chats[0].messages).toEqual([]);
  });

  it("should add the accepted question, accumulate deltas and replace them with the confirmed answer", async () => {
    const store = storeWithChat();
    async function* events(): AsyncGenerator<MessageStreamEvent> {
      yield { type: "accepted", runId: "run-1", message: question };
      yield { type: "delta", text: "Synthetic" };
      yield { type: "delta", text: " result" };
      expect(store.getState().chat.streaming).toEqual({ chatId: "test-chat", text: "Synthetic result" });
      expect(store.getState().chat.chats[0].messages).toEqual([question]);
      yield { type: "completed", message: reply };
    }
    vi.spyOn(ChatService, "sendMessage").mockImplementation(events);
    await store.dispatch(sendMessage({ chatId: "test-chat", message: "Synthetic question" }));
    expect(store.getState().chat.chats[0].messages).toEqual([question, reply]);
    expect(store.getState().chat).toMatchObject({ isSendingMessage: false, streaming: null });
  });

  it.each([
    [
      "a failed run",
      stream(
        { type: "accepted", runId: "run-1", message: question },
        { type: "delta", text: "Part" },
        { type: "failed", runStatus: "failed", code: "unavailable", detail: "Model crashed" }
      ),
      "Model crashed",
    ],
    [
      "a stream without a result",
      stream({ type: "accepted", runId: "run-1", message: question }),
      "The response stream ended without a result.",
    ],
  ])("should discard partial output after %s and keep the accepted question", async (_label, events, message) => {
    vi.spyOn(ChatService, "sendMessage").mockImplementation(() => events);
    const store = storeWithChat();
    const result = await store.dispatch(sendMessage({ chatId: "test-chat", message: "Synthetic question" }));
    expect(sendMessage.rejected.match(result) && result.error.message).toBe(message);
    expect(store.getState().chat.chats[0].messages).toEqual([question]);
    expect(store.getState().chat.streaming).toBeNull();
  });

  it("should abort the request signal when the send is cancelled", async () => {
    let received: AbortSignal | undefined;
    vi.spyOn(ChatService, "sendMessage").mockImplementation(async function* (_id, _content, signal) {
      received = signal;
      yield { type: "accepted", runId: "run-1", message: question };
      await new Promise((resolve) => signal?.addEventListener("abort", resolve, { once: true }));
    });
    const store = storeWithChat();
    const pending = store.dispatch(sendMessage({ chatId: "test-chat", message: "Synthetic question" }));
    await vi.waitFor(() => expect(store.getState().chat.chats[0].messages).toEqual([question]));
    pending.abort();
    expect(sendMessage.rejected.match(await pending)).toBe(true);
    expect(received?.aborted).toBe(true);
    expect(store.getState().chat.streaming).toBeNull();
  });
});

it("should update conversations through successful service operations", async () => {
  const chat = {
    id: "chat-1",
    assistantId: "assistant-1",
    status: "open" as const,
    title: "Synthetic chat",
    createdAt: "2026-10-26T12:00:00.000Z",
    messages: [],
  };
  const message = { ...question, content: "Stored question" };
  vi.spyOn(ChatService, "listConversations").mockResolvedValue([chat]);
  vi.spyOn(ChatService, "createConversation").mockResolvedValue({ ...chat, id: "chat-2" });
  vi.spyOn(ChatService, "listMessages").mockResolvedValue([message]);
  vi.spyOn(ChatService, "deleteConversation").mockResolvedValue();
  vi.spyOn(ChatService, "sendMessage").mockImplementation(() =>
    stream({ type: "accepted", runId: "run-1", message: question }, { type: "completed", message: reply })
  );
  const store = configureStore({ reducer: { chat: reducer } });
  const listing = store.dispatch(fetchChats());
  expect(store.getState().chat.isLoadingChats).toBe(true);
  await listing;
  expect(store.getState().chat.isLoadingChats).toBe(false);
  await store.dispatch(createChat({ assistantSlug: "support", title: "Synthetic chat" }));
  await store.dispatch(fetchChatHistory("chat-1"));
  expect(store.getState().chat.chats[0].messages).toEqual([message]);
  await store.dispatch(sendMessage({ chatId: "chat-1", message: "Synthetic question" }));
  expect(store.getState().chat.chats[0].messages.slice(-1)[0]).toEqual(reply);
  await store.dispatch(deleteChat("chat-1"));
  expect(store.getState().chat.chats.map((item) => item.id)).toEqual(["chat-2"]);
});

it("should release loading and preserve state when service operations reject", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(ChatService, "listConversations").mockRejectedValue(new Error("Synthetic list failure"));
  vi.spyOn(ChatService, "createConversation").mockRejectedValue(new Error("Synthetic create failure"));
  vi.spyOn(ChatService, "deleteConversation").mockRejectedValue(new Error("Synthetic delete failure"));
  const store = configureStore({ reducer: { chat: reducer } });
  expect(fetchChats.rejected.match(await store.dispatch(fetchChats()))).toBe(true);
  expect(
    createChat.rejected.match(await store.dispatch(createChat({ assistantSlug: "support", title: "Synthetic chat" })))
  ).toBe(true);
  expect(deleteChat.rejected.match(await store.dispatch(deleteChat("missing")))).toBe(true);
  expect(store.getState().chat).toEqual({ chats: [], isLoadingChats: false, isSendingMessage: false, streaming: null });
  expect(console.error).toHaveBeenCalledOnce();
});

it("should ignore message and history updates for a chat that no longer exists", () => {
  let state = reducer(undefined, messageAccepted({ chatId: "missing", message: question }));
  state = reducer(state, deltaReceived("Ignored without an active stream"));
  state = reducer(state, fetchChatHistory.fulfilled({ chatId: "missing", messages: [] }, "history-1", "missing"));
  state = reducer(
    state,
    sendMessage.fulfilled(
      {
        chatId: "missing",
        response: { id: "m-3", role: "assistant", content: "Unused", createdAt: "2026-10-26T12:00:00.000Z" },
      },
      "message-1",
      {
        chatId: "missing",
        message: "Synthetic question",
      }
    )
  );
  expect(state.chats).toEqual([]);
  expect(state.streaming).toBeNull();
});
