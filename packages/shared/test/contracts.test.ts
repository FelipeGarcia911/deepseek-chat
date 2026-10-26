import { describe, expect, it } from "vitest";
import {
  ChatHistory,
  ChatList,
  ChatParams,
  CreateChatRequest,
  ProblemDetails,
  SendMessageRequest,
  chatTitleMaxLength,
  errorCatalog,
  messageMaxLength,
} from "../src/index.js";

describe("legacy chat contracts", () => {
  it("should accept numeric legacy identifiers and reject anything else", () => {
    expect(ChatParams.parse({ chatId: "1730000000000" })).toEqual({ chatId: "1730000000000" });
    for (const chatId of ["", "abc", "12a", "1".repeat(21), "../1"]) {
      expect(ChatParams.safeParse({ chatId }).success).toBe(false);
    }
  });

  it("should trim titles and enforce their length limits", () => {
    expect(CreateChatRequest.parse({ title: "  Planning  " })).toEqual({ title: "Planning" });
    expect(CreateChatRequest.parse({ title: "x".repeat(chatTitleMaxLength) }).title).toHaveLength(chatTitleMaxLength);
    for (const title of ["", "   ", "x".repeat(chatTitleMaxLength + 1), 42, undefined]) {
      expect(CreateChatRequest.safeParse({ title }).success).toBe(false);
    }
  });

  it("should preserve message text and reject blank, oversized or extra fields", () => {
    expect(SendMessageRequest.parse({ message: "  Hello  " })).toEqual({ message: "  Hello  " });
    expect(SendMessageRequest.safeParse({ message: "x".repeat(messageMaxLength) }).success).toBe(true);
    for (const body of [
      { message: " \n " },
      { message: "x".repeat(messageMaxLength + 1) },
      { message: "Hello", chatId: "1" },
      {},
    ]) {
      expect(SendMessageRequest.safeParse(body).success).toBe(false);
    }
  });

  it("should validate list and history responses", () => {
    expect(ChatList.parse([{ id: "1", title: "Chat", extra: true }])).toEqual([{ id: "1", title: "Chat" }]);
    expect(ChatHistory.safeParse([{ text: "Hi", sender: "bot" }]).success).toBe(true);
    expect(ChatHistory.safeParse([{ text: "Hi", sender: "system" }]).success).toBe(false);
  });
});

describe("error contracts", () => {
  it("should map every catalog code to an HTTP error status and title", () => {
    for (const { status, title } of Object.values(errorCatalog)) {
      expect(status).toBeGreaterThanOrEqual(400);
      expect(status).toBeLessThan(600);
      expect(title).not.toBe("");
    }
  });

  it("should use one standard reason phrase per status so codes carry the problem meaning", () => {
    const titles = new Map<number, Set<string>>();
    for (const { status, title } of Object.values(errorCatalog)) {
      titles.set(status, (titles.get(status) ?? new Set()).add(title));
    }
    expect([...titles.values()].every((set) => set.size === 1)).toBe(true);
    expect(errorCatalog.VALIDATION_FAILED.title).toBe("Bad Request");
    expect(errorCatalog.PAYLOAD_TOO_LARGE.title).toBe("Content Too Large");
  });

  it("should accept problem details with codes unknown to the client", () => {
    const problem = { type: "about:blank", title: "Future", status: 418, code: "FUTURE_CODE", requestId: "r-1" };
    expect(ProblemDetails.parse(problem)).toEqual(problem);
    expect(ProblemDetails.safeParse({ ...problem, requestId: undefined }).success).toBe(false);
  });
});
