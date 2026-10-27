import { configureStore } from "@reduxjs/toolkit";
import { act, renderHook } from "@testing-library/react";
import { Provider } from "react-redux";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import useChat from "./useChat";
import service from "@/services/Conversations";
import reducer from "@/store/reducers/Chat";

it("should ignore empty or unknown-chat input and dispatch only a valid question", async () => {
  vi.spyOn(service, "listMessages").mockResolvedValue([]);
  const send = vi.spyOn(service, "sendMessage").mockImplementation(async function* () {
    yield* [];
    throw new Error("MODEL_NOT_CONFIGURED");
  });
  const store = configureStore({
    reducer: { chat: reducer },
    preloadedState: {
      chat: {
        chats: [
          {
            id: "known",
            assistantId: "assistant-1",
            status: "open" as const,
            title: "Synthetic chat",
            createdAt: "2026-10-26T12:00:00.000Z",
            messages: [],
          },
        ],
        isLoadingChats: false,
        isSendingMessage: false,
        streaming: null,
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
  expect(send).toHaveBeenCalledExactlyOnceWith("known", "Synthetic question", expect.any(AbortSignal));
  expect(result.current.isSendingMessage).toBe(false);
  rerender({ id: "missing" });
  await act(async () => {
    await result.current.sendMessage("Unused question");
  });
  expect(send).toHaveBeenCalledOnce();
});

it("should stop an in-flight message and expose its streamed text only for the open chat", async () => {
  vi.spyOn(service, "listMessages").mockResolvedValue([]);
  let received: AbortSignal | undefined;
  vi.spyOn(service, "sendMessage").mockImplementation(async function* (_id, _content, signal) {
    received = signal;
    yield { type: "delta", text: "Partial" };
    await new Promise((resolve) => signal?.addEventListener("abort", resolve, { once: true }));
  });
  const chat = {
    id: "known",
    assistantId: "assistant-1",
    status: "open" as const,
    title: "Synthetic chat",
    createdAt: "2026-10-26T12:00:00.000Z",
    messages: [],
  };
  const store = configureStore({
    reducer: { chat: reducer },
    preloadedState: { chat: { chats: [chat], isLoadingChats: false, isSendingMessage: false, streaming: null } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => <Provider store={store}>{children}</Provider>;
  const { result } = renderHook(() => useChat("known"), { wrapper });
  let sending: Promise<void> | undefined;
  act(() => {
    sending = result.current.sendMessage("Question");
  });
  await vi.waitFor(() => expect(result.current.streamingText).toBe("Partial"));
  await act(async () => {
    result.current.stopMessage();
    await sending;
  });
  expect(received?.aborted).toBe(true);
  expect(result.current.streamingText).toBe("");
  expect(result.current.isSendingMessage).toBe(false);
});
