import axios from "axios";
import { beforeEach, expect, it, vi } from "vitest";
import service from "../src/services/Chat";

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("should request each conversation operation with the configured API base", async () => {
  const chat = { id: "chat-1", title: "Synthetic chat", messages: [] };
  const get = vi
    .spyOn(axios, "get")
    .mockResolvedValueOnce({ data: [chat] })
    .mockResolvedValueOnce({ data: [] });
  const post = vi
    .spyOn(axios, "post")
    .mockResolvedValueOnce({ data: chat })
    .mockResolvedValueOnce({ data: { response: "Synthetic response" } });
  const remove = vi.spyOn(axios, "delete").mockResolvedValue({ data: {} });
  expect(await service.fetchChats()).toEqual([chat]);
  expect(await service.getChatHistory(chat.id)).toEqual([]);
  expect(await service.createChat(chat.title)).toEqual(chat);
  expect(await service.sendMessage(chat.id, "Synthetic question")).toBe("Synthetic response");
  await service.deleteChat(chat.id);
  expect(get.mock.calls).toEqual([["/api/chats/list"], ["/api/chats/chat-1/history"]]);
  expect(post.mock.calls).toEqual([
    ["/api/chats/new", { title: chat.title }],
    ["/api/chats/chat-1/message", { chatId: chat.id, message: "Synthetic question" }],
  ]);
  expect(remove).toHaveBeenCalledWith("/api/chats/chat-1");
});

it("should preserve legacy CRUD failure results and propagate generation failure", async () => {
  const error = new Error("Synthetic request failure");
  vi.spyOn(axios, "get").mockRejectedValue(error);
  vi.spyOn(axios, "post").mockRejectedValue(error);
  vi.spyOn(axios, "delete").mockRejectedValue(error);
  expect(await service.fetchChats()).toEqual([]);
  expect(await service.getChatHistory("chat-1")).toEqual([]);
  expect(await service.createChat("Synthetic chat")).toBeNull();
  await expect(service.deleteChat("chat-1")).resolves.toBeUndefined();
  await expect(service.sendMessage("chat-1", "Synthetic question")).rejects.toBe(error);
  expect(console.error).toHaveBeenCalledTimes(4);
});
