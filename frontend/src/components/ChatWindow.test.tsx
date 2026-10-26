import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ChatWindow from "./ChatWindow";

describe("ChatWindow", () => {
  it("should show user text literally and render assistant Markdown", () => {
    render(
      <ChatWindow
        loading={false}
        messages={[
          { id: "m-1", role: "user", content: "**User question**", createdAt: "2026-10-26T12:00:00.000Z" },
          {
            id: "m-2",
            role: "assistant",
            content: "## Assistant answer\n\nRead the [reference](https://example.test/reference).",
            createdAt: "2026-10-26T12:00:00.000Z",
          },
        ]}
      />
    );

    expect(screen.getByText("**User question**")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Assistant answer", level: 2 })).toBeVisible();
    expect(screen.getByRole("link", { name: "reference" })).toHaveAttribute("href", "https://example.test/reference");
  });

  it("should show the response loading indicator only while a request is pending", () => {
    const { rerender } = render(<ChatWindow messages={[]} loading />);

    expect(screen.getByRole("status", { name: "Generating response" })).toBeInTheDocument();

    rerender(<ChatWindow messages={[]} loading={false} />);

    expect(screen.queryByRole("status", { name: "Generating response" })).not.toBeInTheDocument();
  });
});
