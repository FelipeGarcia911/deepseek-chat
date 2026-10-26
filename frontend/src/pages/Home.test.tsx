import { configureStore } from "@reduxjs/toolkit";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import Home from "./Home";
import ChatService from "../services/Chat";
import type { Chat } from "../services/Chat";
import chatReducer from "../store/reducers/Chat";

function renderHome() {
  const store = configureStore({ reducer: { chat: chatReducer } });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/chat/test-chat" element={<h1>Created conversation</h1>} />
        </Routes>
      </MemoryRouter>
    </Provider>
  );
  return store;
}

describe("conversation creation", () => {
  it("should disable the form while saving, store the chat and navigate on success", async () => {
    let finish!: (chat: Chat) => void;
    const pending = new Promise<Chat>((resolve) => {
      finish = resolve;
    });
    const createChat = vi.spyOn(ChatService, "createChat").mockReturnValue(pending);
    const user = userEvent.setup();
    const store = renderHome();

    await user.type(screen.getByRole("textbox"), "Test conversation");
    await user.click(screen.getByRole("button", { name: "Crear Chat" }));

    expect(createChat).toHaveBeenCalledExactlyOnceWith("Test conversation");
    expect(screen.getByRole("textbox")).toBeDisabled();
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();

    const chat: Chat = { id: "test-chat", title: "Test conversation", messages: [] };
    finish(chat);

    expect(await screen.findByRole("heading", { name: "Created conversation" })).toBeInTheDocument();
    expect(store.getState().chat.chats).toEqual([chat]);
  });

  it("should keep the form usable and create no chat when the service fails", async () => {
    const createChat = vi.spyOn(ChatService, "createChat").mockResolvedValue(null);
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();
    const store = renderHome();

    await user.type(screen.getByRole("textbox"), "Test conversation");
    await user.click(screen.getByRole("button", { name: "Crear Chat" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Crear Chat" })).toBeEnabled();
    });
    expect(createChat).toHaveBeenCalledExactlyOnceWith("Test conversation");
    expect(errorLog).toHaveBeenCalledOnce();
    expect(screen.getByRole("textbox")).toHaveValue("Test conversation");
    expect(screen.queryByRole("heading", { name: "Created conversation" })).toBeNull();
    expect(store.getState().chat.chats).toEqual([]);
  });
});

it("should ignore blank titles and create a conversation with Enter", async () => {
  const createChat = vi
    .spyOn(ChatService, "createChat")
    .mockResolvedValue({ id: "test-chat", title: "Keyboard chat", messages: [] });
  const user = userEvent.setup();
  renderHome();
  await user.click(screen.getByRole("button", { name: "Crear Chat" }));
  expect(createChat).not.toHaveBeenCalled();
  await user.type(screen.getByRole("textbox"), "Keyboard chat{Enter}");
  expect(await screen.findByRole("heading", { name: "Created conversation" })).toBeVisible();
  expect(createChat).toHaveBeenCalledExactlyOnceWith("Keyboard chat");
});
