import { waitFor } from "@testing-library/react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import service from "./services/Chat";

vi.mock("react-dom/client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-dom/client")>();
  return { ...actual, createRoot: vi.fn(actual.createRoot) };
});

it("should mount the application into the root element", async (t) => {
  vi.spyOn(service, "fetchChats").mockResolvedValue([]);
  const container = document.createElement("div");
  container.id = "root";
  document.body.append(container);
  t.onTestFinished(async () => {
    await act(async () => {
      vi.mocked(createRoot).mock.results[0]?.value.unmount();
    });
    container.remove();
  });
  await act(async () => {
    await import("./main");
  });
  await waitFor(() => expect(container).toHaveTextContent("Deepseek Chat UI"));
  expect(createRoot).toHaveBeenCalledWith(container);
});
