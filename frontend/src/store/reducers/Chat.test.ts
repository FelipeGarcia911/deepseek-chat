import { configureStore } from "@reduxjs/toolkit";
import { describe, expect, it, vi } from "vitest";
import ChatService from "../../services/Chat";
import reducer, { sendMessage } from "./Chat";

describe("chat state", () => {
  it("should clear loading after a rejected generation without fabricating an assistant answer", async () => {
    const service = vi.spyOn(ChatService, "sendMessage").mockRejectedValue(new Error("MODEL_NOT_CONFIGURED"));
    const store = configureStore({
      reducer: { chat: reducer },
      preloadedState: {
        chat: {
          chats: [{ id: "test-chat", title: "Test chat", messages: [] }],
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
    expect(store.getState().chat.chats[0].messages).toEqual([{ sender: "user", text: "Synthetic question" }]);
  });
});
