import type { MessageStreamEvent } from "@chat-app/shared";
import { describe, expect, it, vi } from "vitest";
import { consumeMessageStream } from "@/services/messageStream";

const createdAt = "2026-10-27T12:00:00.000Z";
const question = { id: "m-1", role: "user" as const, content: "Question", createdAt };
const answer = { id: "m-2", role: "assistant" as const, content: "Answer", createdAt };

async function* stream(...events: MessageStreamEvent[]): AsyncGenerator<MessageStreamEvent> {
  yield* events;
}

function callbacks() {
  return { onAccepted: vi.fn(), onDelta: vi.fn() };
}

describe("message stream consumption", () => {
  it("should report the accepted question and each delta in order, then return the confirmed answer", async () => {
    const handlers = callbacks();
    const order: string[] = [];
    handlers.onAccepted.mockImplementation(() => order.push("accepted"));
    handlers.onDelta.mockImplementation((text: string) => order.push(text));
    const response = await consumeMessageStream(
      stream(
        { type: "accepted", runId: "run-1", message: question },
        { type: "delta", text: "Ans" },
        { type: "delta", text: "wer" },
        { type: "completed", message: answer }
      ),
      handlers
    );
    expect(response).toEqual(answer);
    expect(handlers.onAccepted).toHaveBeenCalledExactlyOnceWith(question);
    expect(order).toEqual(["accepted", "Ans", "wer"]);
  });

  it("should stop reading at the confirmed answer", async () => {
    const handlers = callbacks();
    await consumeMessageStream(
      stream({ type: "completed", message: answer }, { type: "delta", text: "late" }),
      handlers
    );
    expect(handlers.onDelta).not.toHaveBeenCalled();
  });

  it("should reject with the run failure after reporting what arrived before it", async () => {
    const handlers = callbacks();
    await expect(
      consumeMessageStream(
        stream(
          { type: "accepted", runId: "run-1", message: question },
          { type: "delta", text: "Partial" },
          { type: "failed", runStatus: "expired", code: "timeout", detail: "The model took too long." }
        ),
        handlers
      )
    ).rejects.toThrow("The model took too long.");
    expect(handlers.onAccepted).toHaveBeenCalledOnce();
    expect(handlers.onDelta).toHaveBeenCalledExactlyOnceWith("Partial");
  });

  it("should reject a stream that ends without a result", async () => {
    await expect(
      consumeMessageStream(stream({ type: "accepted", runId: "run-1", message: question }), callbacks())
    ).rejects.toThrow("The response stream ended without a result.");
  });

  it("should propagate a failure of the underlying stream", async () => {
    const failure = new TypeError("Failed to fetch");
    async function* broken(): AsyncGenerator<MessageStreamEvent> {
      yield* [];
      throw failure;
    }
    await expect(consumeMessageStream(broken(), callbacks())).rejects.toBe(failure);
  });
});
