import axios from "axios";
import { expect, it, vi } from "vitest";
import service from "../src/services/Conversations";

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
  const post = vi.spyOn(axios, "post").mockResolvedValueOnce({ data: summary }).mockResolvedValueOnce({ data: answer });
  const remove = vi.spyOn(axios, "delete").mockResolvedValue({ status: 204, data: "" });
  expect(await service.listConversations()).toEqual([{ ...summary, messages: [] }]);
  expect(await service.listMessages(id)).toEqual([question]);
  expect(await service.createConversation("support", summary.title)).toEqual({ ...summary, messages: [] });
  expect(await service.sendMessage(id, "Synthetic question")).toEqual(answer);
  await service.deleteConversation(id);
  const params = { params: { limit: 100, cursor: undefined } };
  expect(get.mock.calls).toEqual([
    ["/api/v1/admin/conversations", params],
    [`/api/v1/runtime/conversations/${id}/messages`, params],
  ]);
  expect(post.mock.calls).toEqual([
    ["/api/v1/runtime/assistants/support/conversations", { title: summary.title }],
    [`/api/v1/runtime/conversations/${id}/messages`, { content: "Synthetic question" }],
  ]);
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
  await expect(service.sendMessage(id, "Synthetic question")).rejects.toBe(error);
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
  await expect(service.sendMessage(id, "Synthetic question")).rejects.toThrow();
  await expect(service.deleteConversation(id)).rejects.toThrow("Expected 204 No Content, received 200.");
});
