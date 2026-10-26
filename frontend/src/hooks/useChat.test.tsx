import { configureStore } from "@reduxjs/toolkit";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import useChat from "./useChat";
import service from "../services/Conversations";
import reducer from "../store/reducers/Chat";

it("should ignore empty or unknown-chat input and dispatch only a valid question", async () => {
  vi.spyOn(service, "listMessages").mockResolvedValue([]);
  const send = vi.spyOn(service, "sendMessage").mockRejectedValue(new Error("MODEL_NOT_CONFIGURED"));
  const store = configureStore({
    reducer: { chat: reducer },
    preloadedState: {
      chat: {
        chats: [{ id: "known", title: "Synthetic chat", createdAt: "2026-10-26T12:00:00.000Z", messages: [] }],
        isLoadingChats: false,
        isSendingMessage: false,
      },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result, rerender } = renderHook(({ id }) => useChat(id), { initialProps: { id: "known" }, wrapper });
  await act(async () => {
    await result.current.sendMessage("  ");
  });
  expect(send).not.toHaveBeenCalled();
  await act(async () => {
    await result.current.sendMessage("Synthetic question");
  });
  expect(send).toHaveBeenCalledExactlyOnceWith("known", "Synthetic question");
  expect(result.current.isSendingMessage).toBe(false);
  rerender({ id: "missing" });
  await act(async () => {
    await result.current.sendMessage("Unused question");
  });
  expect(send).toHaveBeenCalledOnce();
});
