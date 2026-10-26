import { configureStore } from "@reduxjs/toolkit";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Provider } from "react-redux";
import { beforeEach, expect, it, vi } from "vitest";
import App from "./App";
import service from "./services/Conversations";
import reducer from "./store/reducers/Chat";

beforeEach(() => {
  window.history.replaceState({}, "", "/");
  vi.spyOn(service, "listConversations").mockResolvedValue([
    { id: "known", title: "Existing chat", createdAt: "2026-10-26T12:00:00.000Z", messages: [] },
  ]);
  vi.spyOn(service, "listMessages").mockResolvedValue([
    { id: "m-1", role: "user", content: "Stored question", createdAt: "2026-10-26T12:00:00.000Z" },
  ]);
  vi.spyOn(service, "createConversation").mockImplementation(async (title) => ({
    id: "created",
    title,
    createdAt: "2026-10-26T12:00:00.000Z",
    messages: [],
  }));
  vi.spyOn(service, "deleteConversation").mockResolvedValue();
});

function renderApp() {
  const store = configureStore({ reducer: { chat: reducer } });
  render(
    <Provider store={store}>
      <App />
    </Provider>
  );
  return store;
}

it("should list conversations, open history and delete a conversation without navigating to its chat again", async () => {
  const user = userEvent.setup();
  const store = renderApp();
  expect(screen.getByRole("link", { name: "Deepseek Chat UI" })).toHaveAttribute("href", "/");
  await user.click(await screen.findByText("Existing chat"));
  expect(await screen.findByText("Stored question")).toBeVisible();
  expect(window.location.pathname).toBe("/chat/known");
  await user.click(screen.getByRole("button", { name: "Delete Existing chat" }));
  expect(await screen.findByRole("button", { name: "Crear Chat" })).toBeEnabled();
  expect(window.location.pathname).toBe("/");
  expect(store.getState().chat.chats).toEqual([]);
});

it("should create from the sidebar and return home with the home control", async () => {
  const user = userEvent.setup();
  renderApp();
  await user.click(await screen.findByText("Existing chat"));
  await screen.findByText("Stored question");
  await user.click(screen.getByRole("button", { name: "+ New Chat" }));
  expect(await screen.findByText("New Chat")).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Go to home" }));
  expect(screen.getByRole("button", { name: "Crear Chat" })).toBeEnabled();
});

it("should show loading while conversations are fetched and display an unknown-chat state afterward", async () => {
  window.history.replaceState({}, "", "/chat/missing");
  let finish!: (chats: []) => void;
  vi.mocked(service.listConversations).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    })
  );
  renderApp();
  expect(screen.getAllByRole("progressbar")).toHaveLength(2);
  finish([]);
  expect(await screen.findByText("❌ Chat no encontrado.")).toBeVisible();
  await waitFor(() => expect(screen.queryByRole("progressbar")).not.toBeInTheDocument());
});

it("should keep the current conversation when deletion fails", async () => {
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.mocked(service.deleteConversation).mockRejectedValue(new Error("Synthetic delete failure"));
  const user = userEvent.setup();
  renderApp();
  await user.click(await screen.findByText("Existing chat"));
  await screen.findByText("Stored question");
  await user.click(screen.getByRole("button", { name: "Delete Existing chat" }));
  await waitFor(() => expect(error).toHaveBeenCalled());
  expect(window.location.pathname).toBe("/chat/known");
  expect(screen.getByText("Existing chat")).toBeVisible();
});
