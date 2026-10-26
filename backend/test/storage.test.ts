import fs from "node:fs/promises";
import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "../src/errors";
import ChatService from "../src/services/ChatService";

beforeEach(() => {
  vi.spyOn(fs, "readFile").mockResolvedValue("[]");
  vi.spyOn(fs, "writeFile").mockResolvedValue();
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

it("should restore stored messages and return no history for an unknown chat", async () => {
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
  expect(service.getChatHistory("missing")).toBeUndefined();
  await service.saveMessage("known", "bot", "Stored answer");
  expect(service.getChatHistory("known")).toHaveLength(2);
  expect(fs.writeFile).toHaveBeenCalledWith("synthetic.json", expect.stringContaining("Stored answer"));
  expect(await service.deleteChat("known")).toBe(true);
  expect(service.getChats()).toEqual([{ id: "other", title: "Other chat" }]);
});

it.each(["null", "invalid json"])("should recover an empty store from %s content", async (content) => {
  vi.mocked(fs.readFile).mockResolvedValue(content);
  const service = new ChatService("synthetic.json");
  await service.initialize();
  expect(service.getChats()).toEqual([]);
});

it("should recover from a read failure and ignore writes for an unknown chat", async () => {
  vi.mocked(fs.readFile).mockRejectedValue(new Error("Synthetic read failure"));
  const service = new ChatService("synthetic.json");
  await service.initialize();
  await service.saveMessage("missing", "user", "Unused question");
  expect(await service.deleteChat("missing")).toBe(false);
  expect(console.warn).toHaveBeenCalledOnce();
  expect(service.getChats()).toEqual([]);
  expect(fs.writeFile).not.toHaveBeenCalled();
});

it("should reject write failures as an unavailable dependency without keeping unsaved changes", async () => {
  vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify([{ id: "1", title: "Stored chat", messages: [] }]));
  vi.mocked(fs.writeFile).mockRejectedValue(new Error("Synthetic write failure"));
  const service = new ChatService("synthetic.json");
  await service.initialize();
  const failure = { code: "DEPENDENCY_UNAVAILABLE", cause: expect.any(Error) };
  await expect(service.createChat("Unsaved chat")).rejects.toMatchObject(failure);
  await expect(service.deleteChat("1")).rejects.toBeInstanceOf(AppError);
  await expect(service.saveMessage("1", "user", "Unsaved question")).rejects.toMatchObject(failure);
  expect(service.getChats()).toEqual([{ id: "1", title: "Stored chat" }]);
  expect(service.getChatHistory("1")).toEqual([]);
});
