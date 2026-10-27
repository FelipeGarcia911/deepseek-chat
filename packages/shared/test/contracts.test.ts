import { describe, expect, it } from "vitest";
import {
  AssistantParams,
  ConversationPage,
  ConversationParams,
  CreateConversationRequest,
  MessagePage,
  MessageStreamEvent,
  PageQuery,
  ProblemDetails,
  SendMessageRequest,
  conversationTitleMaxLength,
  errorCatalog,
  messageMaxLength,
} from "../src/index.js";

const id = "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47";
const createdAt = "2026-10-26T12:00:00.000Z";

describe("conversation contracts", () => {
  it("should accept UUID identifiers and reject anything else", () => {
    expect(ConversationParams.parse({ conversationId: id })).toEqual({ conversationId: id });
    for (const conversationId of ["", "1730000000000", "not-a-uuid", `${id}0`, "../1"]) {
      expect(ConversationParams.safeParse({ conversationId }).success).toBe(false);
    }
  });

  it("should trim titles and enforce their length limits", () => {
    expect(CreateConversationRequest.parse({ title: "  Planning  " })).toEqual({ title: "Planning" });
    const longest = "x".repeat(conversationTitleMaxLength);
    expect(CreateConversationRequest.parse({ title: longest }).title).toHaveLength(conversationTitleMaxLength);
    for (const title of ["", "   ", "x".repeat(conversationTitleMaxLength + 1), 42, undefined]) {
      expect(CreateConversationRequest.safeParse({ title }).success).toBe(false);
    }
  });

  it("should preserve message content and reject blank, oversized or extra fields", () => {
    expect(SendMessageRequest.parse({ content: "  Hello  " })).toEqual({ content: "  Hello  " });
    expect(SendMessageRequest.safeParse({ content: "x".repeat(messageMaxLength) }).success).toBe(true);
    for (const body of [
      { content: " \n " },
      { content: "x".repeat(messageMaxLength + 1) },
      { content: "Hello", conversationId: id },
      { message: "Hello" },
      {},
    ]) {
      expect(SendMessageRequest.safeParse(body).success).toBe(false);
    }
  });

  it("should default and bound the page limit while keeping the cursor opaque", () => {
    expect(PageQuery.parse({})).toEqual({ limit: 20 });
    expect(PageQuery.parse({ limit: "100", cursor: "opaque" })).toEqual({ limit: 100, cursor: "opaque" });
    for (const query of [{ limit: "0" }, { limit: "101" }, { limit: "1.5" }, { cursor: "" }, { offset: "1" }]) {
      expect(PageQuery.safeParse(query).success).toBe(false);
    }
  });

  it("should validate pages, strip undeclared members and reject legacy message shapes", () => {
    const summary = { id, assistantId: id, title: "Chat", status: "open", createdAt };
    expect(ConversationPage.parse({ items: [{ ...summary, internal: true }], nextCursor: null })).toEqual({
      items: [summary],
      nextCursor: null,
    });
    const message = { id, role: "assistant", content: "Hi", createdAt };
    expect(MessagePage.safeParse({ items: [message], nextCursor: "next" }).success).toBe(true);
    expect(MessagePage.safeParse({ items: [{ ...message, role: "bot" }], nextCursor: null }).success).toBe(false);
    expect(MessagePage.safeParse({ items: [{ text: "Hi", sender: "user" }], nextCursor: null }).success).toBe(false);
    expect(ConversationPage.safeParse([summary]).success).toBe(false);
  });
});

describe("message stream contracts", () => {
  it("should accept each stream event and reject unknown events or run states", () => {
    const message = { id, role: "assistant", content: "Hi", createdAt };
    for (const event of [
      { type: "accepted", runId: id, message: { ...message, role: "user" } },
      { type: "delta", text: "H" },
      { type: "completed", message },
      { type: "failed", runStatus: "expired", code: "timeout", detail: "Too slow." },
    ]) {
      expect(MessageStreamEvent.parse(event)).toEqual(event);
    }
    expect(MessageStreamEvent.safeParse({ type: "token", text: "H" }).success).toBe(false);
    expect(
      MessageStreamEvent.safeParse({ type: "failed", runStatus: "succeeded", code: "x", detail: "y" }).success
    ).toBe(false);
  });
});

describe("assistant contracts", () => {
  it("should accept stable public slugs and reject anything else", () => {
    expect(AssistantParams.parse({ assistantSlug: "customer-support" })).toEqual({ assistantSlug: "customer-support" });
    for (const assistantSlug of ["ab", "Support", "two--hyphens", "-edge", `x${"y".repeat(63)}`, "with space"]) {
      expect(AssistantParams.safeParse({ assistantSlug }).success).toBe(false);
    }
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
