import axios from "axios";
import { expect, it, vi } from "vitest";
import service from "../src/services/Chat";

it("should request each conversation operation with the configured API base", async () => {
  const summary = { id: "1", title: "Synthetic chat" };
  const get = vi
    .spyOn(axios, "get")
    .mockResolvedValueOnce({ data: [summary] })
    .mockResolvedValueOnce({ data: [{ sender: "user", text: "Stored question" }] });
  const post = vi
    .spyOn(axios, "post")
    .mockResolvedValueOnce({ data: summary })
    .mockResolvedValueOnce({ data: { response: "Synthetic response" } });
  const remove = vi.spyOn(axios, "delete").mockResolvedValue({ data: { message: "Chat deleted successfully." } });
  expect(await service.fetchChats()).toEqual([{ ...summary, messages: [] }]);
  expect(await service.getChatHistory("1")).toEqual([{ sender: "user", text: "Stored question" }]);
  expect(await service.createChat(summary.title)).toEqual({ ...summary, messages: [] });
  expect(await service.sendMessage("1", "Synthetic question")).toBe("Synthetic response");
  await service.deleteChat("1");
  expect(get.mock.calls).toEqual([["/api/chats/list"], ["/api/chats/1/history"]]);
  expect(post.mock.calls).toEqual([
    ["/api/chats/new", { title: summary.title }],
    ["/api/chats/1/message", { message: "Synthetic question" }],
  ]);
  expect(remove).toHaveBeenCalledWith("/api/chats/1");
});

it("should propagate request failures instead of returning empty results", async () => {
  const error = new Error("Synthetic request failure");
  vi.spyOn(axios, "get").mockRejectedValue(error);
  vi.spyOn(axios, "post").mockRejectedValue(error);
  vi.spyOn(axios, "delete").mockRejectedValue(error);
  await expect(service.fetchChats()).rejects.toBe(error);
  await expect(service.getChatHistory("1")).rejects.toBe(error);
  await expect(service.createChat("Synthetic chat")).rejects.toBe(error);
  await expect(service.deleteChat("1")).rejects.toBe(error);
  await expect(service.sendMessage("1", "Synthetic question")).rejects.toBe(error);
});

it("should reject responses that do not match the shared contract", async () => {
  vi.spyOn(axios, "get")
    .mockResolvedValueOnce({ data: [{ id: "not-numeric", title: "Synthetic chat" }] })
    .mockResolvedValueOnce({ data: [{ sender: "system", text: "Unexpected" }] });
  vi.spyOn(axios, "post").mockResolvedValue({ data: { title: "Missing identifier" } });
  vi.spyOn(axios, "delete").mockResolvedValue({ data: {} });
  await expect(service.fetchChats()).rejects.toThrow(/legacy numeric chat identifier/);
  await expect(service.getChatHistory("1")).rejects.toThrow();
  await expect(service.createChat("Synthetic chat")).rejects.toThrow();
  await expect(service.sendMessage("1", "Synthetic question")).rejects.toThrow();
  await expect(service.deleteChat("1")).rejects.toThrow();
});
