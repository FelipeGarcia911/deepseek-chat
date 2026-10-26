import fs from "node:fs/promises";
import { beforeEach, expect, it, vi } from "vitest";
import ChatService from "../src/services/ChatService";

beforeEach(() => {
  vi.spyOn(fs, "readFile").mockResolvedValue("[]");
  vi.spyOn(fs, "writeFile").mockResolvedValue();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("should restore stored messages and return an empty history for an unknown chat", async () => {
  vi.mocked(fs.readFile).mockResolvedValue(
    JSON.stringify([
      { id: "known", title: "Stored chat", messages: [{ sender: "user", text: "Stored question" }] },
      { id: "other", title: "Other chat", messages: [] },
    ])
  );
  const service = new ChatService("synthetic.json");
  await service.initialize();
  expect(service.getChats()).toEqual([
    { id: "known", title: "Stored chat" },
    { id: "other", title: "Other chat" },
  ]);
  expect(service.getChatHistory("known")).toEqual([{ sender: "user", text: "Stored question" }]);
  expect(service.getChatHistory("missing")).toEqual([]);
  await service.saveMessage("known", "bot", "Stored answer");
  expect(service.getChatHistory("known")).toHaveLength(2);
  expect(fs.writeFile).toHaveBeenCalledWith("synthetic.json", expect.stringContaining("Stored answer"));
  await service.deleteChat("known");
  expect(service.getChats()).toEqual([{ id: "other", title: "Other chat" }]);
});

it.each(["null", "invalid json"])("should recover an empty store from %s content", async (content) => {
  vi.mocked(fs.readFile).mockResolvedValue(content);
  const service = new ChatService("synthetic.json");
  await service.initialize();
  expect(service.getChats()).toEqual([]);
});

it("should recover from a read failure and ignore messages for an unknown chat", async () => {
  vi.mocked(fs.readFile).mockRejectedValue(new Error("Synthetic read failure"));
  const service = new ChatService("synthetic.json");
  await service.initialize();
  await service.saveMessage("missing", "user", "Unused question");
  expect(console.warn).toHaveBeenCalledOnce();
  expect(service.getChats()).toEqual([]);
  expect(fs.writeFile).not.toHaveBeenCalled();
});

it("should report write failures while preserving the prototype's in-memory chat", async () => {
  vi.mocked(fs.writeFile).mockRejectedValue(new Error("Synthetic write failure"));
  const service = new ChatService("synthetic.json");
  await service.initialize();
  const chat = await service.createChat("Unsaved chat");
  expect(service.getChats()).toEqual([chat]);
  expect(console.error).toHaveBeenCalledWith("❌ Failed to save chats to file:", expect.any(Error));
});
