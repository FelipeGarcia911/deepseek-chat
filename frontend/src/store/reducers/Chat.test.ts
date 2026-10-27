import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import ChatService from "../../services/Conversations";
import reducer, { sendMessage, fetchChats, createChat, fetchChatHistory, deleteChat, addUserMessage } from "./Chat";

describe("chat state", () => {
  it("should clear loading after a rejected generation without fabricating an assistant answer", async () => {
    const service = vi.spyOn(ChatService, "sendMessage").mockRejectedValue(new Error("MODEL_NOT_CONFIGURED"));
    const store = configureStore({
      reducer: { chat: reducer },
      preloadedState: {
        chat: {
          chats: [
            {
              id: "test-chat",
              assistantId: "assistant-1",
              status: "open" as const,
              title: "Test chat",
              createdAt: "2026-10-26T12:00:00.000Z",
              messages: [],
            },
          ],
          isLoadingChats: false,
          isSendingMessage: false,
        },
      },
    });

    const pending = store.dispatch(sendMessage({ chatId: "test-chat", message: "Synthetic question" }));
    expect(store.getState().chat.isSendingMessage).toBe(true);
    const result = await pending;

    expect(sendMessage.rejected.match(result)).toBe(true);
    expect(service).toHaveBeenCalledExactlyOnceWith("test-chat", "Synthetic question");
    expect(store.getState().chat.isSendingMessage).toBe(false);
    expect(store.getState().chat.chats[0].messages).toEqual([
      expect.objectContaining({ role: "user", content: "Synthetic question" }),
    ]);
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
  const message = {
    id: "m-1",
    role: "user" as const,
    content: "Stored question",
    createdAt: "2026-10-26T12:00:00.000Z",
  };
  const reply = {
    id: "m-2",
    role: "assistant" as const,
    content: "Synthetic result",
    createdAt: "2026-10-26T12:00:00.000Z",
  };
  vi.spyOn(ChatService, "listConversations").mockResolvedValue([chat]);
  vi.spyOn(ChatService, "createConversation").mockResolvedValue({ ...chat, id: "chat-2" });
  vi.spyOn(ChatService, "listMessages").mockResolvedValue([message]);
  vi.spyOn(ChatService, "deleteConversation").mockResolvedValue();
  vi.spyOn(ChatService, "sendMessage").mockResolvedValue(reply);
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
  expect(store.getState().chat).toEqual({ chats: [], isLoadingChats: false, isSendingMessage: false });
  expect(console.error).toHaveBeenCalledOnce();
});

it("should ignore message and history updates for a chat that no longer exists", () => {
  let state = reducer(undefined, addUserMessage({ chatId: "missing", message: "Synthetic question" }));
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
});
