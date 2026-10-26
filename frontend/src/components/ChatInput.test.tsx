import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import ChatInput from "./ChatInput";

describe("ChatInput", () => {
  it("should send the entered message on click and clear the field", async () => {
    const sendMessage = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput sendMessage={sendMessage} />);

    await user.type(screen.getByRole("textbox"), "Synthetic question");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith("Synthetic question");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("should send on Enter without submitting twice", async () => {
    const sendMessage = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput sendMessage={sendMessage} />);

    await user.type(screen.getByRole("textbox"), "Keyboard question{Enter}{Enter}");

    expect(sendMessage).toHaveBeenCalledExactlyOnceWith("Keyboard question");
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("should not send blank or whitespace-only input", async () => {
    const sendMessage = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput sendMessage={sendMessage} />);

    await user.click(screen.getByRole("button", { name: "Enviar" }));
    await user.type(screen.getByRole("textbox"), "   {Enter}");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("should not send when Shift+Enter is pressed", async () => {
    const sendMessage = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput sendMessage={sendMessage} />);

    await user.type(screen.getByRole("textbox"), "Draft question");
    await user.keyboard("{Shift>}{Enter}{/Shift}");

    expect(sendMessage).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox")).toHaveValue("Draft question");
  });
});
