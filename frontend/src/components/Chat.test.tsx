import { configureStore } from "@reduxjs/toolkit";
import { render, screen } from "@testing-library/react";
import { Provider } from "react-redux";
import { MemoryRouter } from "react-router-dom";
import { expect, it } from "vitest";
import Chat from "./Chat";
import reducer from "../store/reducers/Chat";

it("should explain when no conversation route identifier is available", () => {
  const store = configureStore({ reducer: { chat: reducer } });
  render(
    <Provider store={store}>
      <MemoryRouter>
        <Chat />
      </MemoryRouter>
    </Provider>
  );
  expect(screen.getByText("⚠️ No hay ID de chat válido.")).toBeVisible();
});
