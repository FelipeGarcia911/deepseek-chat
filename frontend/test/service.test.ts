import axios from "axios";
import { expect, it, vi } from "vitest";
import { ApiError } from "@/services/ApiError";
import service from "@/services/Conversations";

const id = "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47";
const createdAt = "2026-10-26T12:00:00.000Z";
const summary = { id, assistantId: id, title: "Synthetic chat", status: "open", createdAt };
const question = { id, role: "user", content: "Stored question", createdAt };
const answer = { id, role: "assistant", content: "Synthetic answer", createdAt };
const page = <T>(items: T[], nextCursor: string | null = null) => ({ data: { items, nextCursor } });

it("should send listing and deletion to the admin API and conversation traffic to the runtime API", async () => {
  const get = vi
    .spyOn(axios, "get")
    .mockResolvedValueOnce(page([summary]))
    .mockResolvedValueOnce(page([question]));
  const post = vi.spyOn(axios, "post").mockResolvedValueOnce({ data: summary });
  const remove = vi.spyOn(axios, "delete").mockResolvedValue({ status: 204, data: "" });
  expect(await service.listConversations()).toEqual([{ ...summary, messages: [] }]);
  expect(await service.listMessages(id)).toEqual([question]);
  expect(await service.createConversation("support", summary.title)).toEqual({ ...summary, messages: [] });
  await service.deleteConversation(id);
  const params = { params: { limit: 100, cursor: undefined } };
  expect(get.mock.calls).toEqual([
    ["/api/v1/admin/conversations", params],
    [`/api/v1/runtime/conversations/${id}/messages`, params],
  ]);
  expect(post.mock.calls).toEqual([["/api/v1/runtime/assistants/support/conversations", { title: summary.title }]]);
  expect(remove).toHaveBeenCalledWith(`/api/v1/admin/conversations/${id}`);
});

it("should follow cursors until every page is read", async () => {
  const second = { ...summary, id: "1d2c3b4a-0000-4000-8000-000000000000", title: "Older chat" };
  const get = vi
    .spyOn(axios, "get")
    .mockResolvedValueOnce(page([summary], "next-page"))
    .mockResolvedValueOnce(page([second]));
  expect((await service.listConversations()).map(({ title }) => title)).toEqual(["Synthetic chat", "Older chat"]);
  expect(get.mock.calls[1]).toEqual(["/api/v1/admin/conversations", { params: { limit: 100, cursor: "next-page" } }]);
});

it("should propagate request failures instead of returning empty results", async () => {
  const error = new Error("Synthetic request failure");
  vi.spyOn(axios, "get").mockRejectedValue(error);
  vi.spyOn(axios, "post").mockRejectedValue(error);
  vi.spyOn(axios, "delete").mockRejectedValue(error);
  await expect(service.listConversations()).rejects.toBe(error);
  await expect(service.listMessages(id)).rejects.toBe(error);
  await expect(service.createConversation("support", "Synthetic chat")).rejects.toBe(error);
  await expect(service.deleteConversation(id)).rejects.toBe(error);
});

it("should reject responses that do not match the shared contract", async () => {
  vi.spyOn(axios, "get")
    .mockResolvedValueOnce(page([{ ...summary, id: "1730000000000" }]))
    .mockResolvedValueOnce(page([{ text: "Hi", sender: "bot" }]));
  vi.spyOn(axios, "post").mockResolvedValue({ data: { response: "Legacy answer" } });
  vi.spyOn(axios, "delete").mockResolvedValue({ status: 200, data: { message: "Deleted" } });
  await expect(service.listConversations()).rejects.toThrow();
  await expect(service.listMessages(id)).rejects.toThrow();
  await expect(service.createConversation("support", "Synthetic chat")).rejects.toThrow();
  await expect(service.deleteConversation(id)).rejects.toThrow("Expected 204 No Content, received 200.");
});

function sse(...chunks: string[]) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(body, { headers: { "Content-Type": "text/event-stream" } });
}

async function collect(stream: AsyncIterable<unknown>) {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

it("should stream validated events from the runtime endpoint even when an event spans network chunks", async () => {
  const accepted = { type: "accepted", runId: id, message: question };
  const completed = { type: "completed", message: answer };
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      sse(
        `event: accepted\ndata: ${JSON.stringify(accepted)}\n\nevent: completed\nda`,
        `ta: ${JSON.stringify(completed)}\n\n`
      )
    );
  const signal = new AbortController().signal;
  expect(await collect(service.sendMessage(id, "Synthetic question", signal))).toEqual([accepted, completed]);
  expect(fetchSpy).toHaveBeenCalledExactlyOnceWith(`/api/v1/runtime/conversations/${id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify({ content: "Synthetic question" }),
    signal,
  });
});

it("should turn rejected stream requests into api errors or plain errors", async () => {
  const problem = {
    type: "about:blank",
    title: "Service Unavailable",
    status: 503,
    code: "MODEL_NOT_CONFIGURED",
    requestId: "r-1",
  };
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce(new Response(JSON.stringify(problem), { status: 503 }))
    .mockResolvedValueOnce(new Response("<html>", { status: 502 }))
    .mockResolvedValueOnce(new Response(null, { status: 200 }))
    .mockResolvedValueOnce(sse(`data: ${JSON.stringify({ type: "token", text: "x" })}\n\n`));
  await expect(collect(service.sendMessage(id, "Hi"))).rejects.toBeInstanceOf(ApiError);
  await expect(collect(service.sendMessage(id, "Hi"))).rejects.toThrow("Request failed with status 502.");
  await expect(collect(service.sendMessage(id, "Hi"))).rejects.toThrow("The event stream has no body.");
  await expect(collect(service.sendMessage(id, "Hi"))).rejects.toThrow();
});

it("should propagate a network failure from the stream request", async () => {
  const error = new TypeError("Failed to fetch");
  vi.spyOn(globalThis, "fetch").mockRejectedValue(error);
  await expect(collect(service.sendMessage(id, "Hi"))).rejects.toBe(error);
});
