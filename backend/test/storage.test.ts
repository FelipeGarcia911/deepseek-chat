import fs from "node:fs/promises";
import { beforeEach, expect, it, vi } from "vitest";
import { AppError } from "../src/errors";
import ConversationService from "../src/services/ConversationService";

const stored = [
  {
    id: "known",
    title: "Stored chat",
    createdAt: "2026-10-26T12:00:00.000Z",
    messages: [{ id: "m-1", role: "user", content: "Stored question", createdAt: "2026-10-26T12:00:01.000Z" }],
  },
  { id: "other", title: "Other chat", createdAt: "2026-10-26T12:05:00.000Z", messages: [] },
];

beforeEach(() => {
  vi.spyOn(fs, "readFile").mockResolvedValue("[]");
  vi.spyOn(fs, "writeFile").mockResolvedValue();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

it("should restore stored conversations newest first and return no messages for an unknown one", async () => {
  vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(stored));
  const service = new ConversationService("synthetic.json");
  await service.initialize();
  expect(service.listConversations().map(({ id }) => id)).toEqual(["other", "known"]);
  expect(service.getMessages("known")).toEqual(stored[0].messages);
  expect(service.getMessages("missing")).toBeUndefined();
  const answer = await service.appendMessage("known", "assistant", "Stored answer");
  expect(answer).toMatchObject({ role: "assistant", content: "Stored answer" });
  expect(service.getMessages("known")).toHaveLength(2);
  expect(fs.writeFile).toHaveBeenCalledWith("synthetic.json", expect.stringContaining("Stored answer"));
  expect(await service.deleteConversation("known")).toBe(true);
  expect(service.listConversations().map(({ id }) => id)).toEqual(["other"]);
});

it("should create conversations with generated identifiers and timestamps", async () => {
  const service = new ConversationService("synthetic.json");
  await service.initialize();
  const first = await service.createConversation("First");
  const second = await service.createConversation("Second");
  expect(first.id).not.toBe(second.id);
  expect(new Date(first.createdAt).toISOString()).toBe(first.createdAt);
  expect(service.listConversations()).toEqual([second, first]);
});

it.each(["null", "invalid json"])("should recover an empty store from %s content", async (content) => {
  vi.mocked(fs.readFile).mockResolvedValue(content);
  const service = new ConversationService("synthetic.json");
  await service.initialize();
  expect(service.listConversations()).toEqual([]);
});

it("should recover from a read failure and ignore writes for an unknown conversation", async () => {
  vi.mocked(fs.readFile).mockRejectedValue(new Error("Synthetic read failure"));
  const service = new ConversationService("synthetic.json");
  await service.initialize();
  expect(await service.appendMessage("missing", "user", "Unused question")).toBeUndefined();
  expect(await service.deleteConversation("missing")).toBe(false);
  expect(console.warn).toHaveBeenCalledOnce();
  expect(service.listConversations()).toEqual([]);
  expect(fs.writeFile).not.toHaveBeenCalled();
});

it("should reject write failures as an unavailable dependency without keeping unsaved changes", async () => {
  vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify([stored[1]]));
  vi.mocked(fs.writeFile).mockRejectedValue(new Error("Synthetic write failure"));
  const service = new ConversationService("synthetic.json");
  await service.initialize();
  const failure = { code: "DEPENDENCY_UNAVAILABLE", cause: expect.any(Error) };
  await expect(service.createConversation("Unsaved chat")).rejects.toMatchObject(failure);
  await expect(service.deleteConversation("other")).rejects.toBeInstanceOf(AppError);
  await expect(service.appendMessage("other", "user", "Unsaved question")).rejects.toMatchObject(failure);
  expect(service.listConversations()).toEqual([{ id: "other", title: "Other chat", createdAt: stored[1].createdAt }]);
  expect(service.getMessages("other")).toEqual([]);
});
