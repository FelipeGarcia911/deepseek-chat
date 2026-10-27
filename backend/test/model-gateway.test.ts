import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { ModelError, requireCapability, type ModelErrorKind } from "../src/models/gateway";
import { FakeChatModel, FakeEmbeddingModel } from "./support/fake-models";
import { describeChatModelContract, describeEmbeddingModelContract } from "./support/model-contract";

describeChatModelContract("fake", () => new FakeChatModel());
describeChatModelContract(
  "fake without streaming or usage",
  () => new FakeChatModel({ capabilities: { streaming: false, usageReporting: false } })
);
describeEmbeddingModelContract("fake", () => new FakeEmbeddingModel());

describe("model errors", () => {
  it.each<[ModelErrorKind, boolean]>([
    ["unavailable", true],
    ["timeout", true],
    ["rate_limited", true],
    ["authentication", false],
    ["invalid_request", false],
    ["model_not_found", false],
    ["invalid_response", false],
    ["unsupported_capability", false],
    ["cancelled", false],
  ])("should mark %s failures as retryable %s", (kind, retryable) => {
    const cause = new Error("Synthetic provider failure");
    const error = new ModelError(kind, "Synthetic message", cause);
    assert.deepEqual([error.retryable, error.kind, error.cause, error.name], [retryable, kind, cause, "ModelError"]);
  });

  it("should name the provider, model and capability when a capability is missing", () => {
    const model = new FakeChatModel({ capabilities: { vision: false } });
    assert.throws(
      () => requireCapability(model, "vision"),
      (error) =>
        error instanceof ModelError &&
        error.kind === "unsupported_capability" &&
        error.message === "fake/fake-chat does not support vision."
    );
    assert.doesNotThrow(() => requireCapability(model, "streaming"));
  });
});

describe("deterministic fake models", () => {
  it("should echo the last user message, respect the output limit and record requests", async () => {
    const model = new FakeChatModel();
    const result = await model.generate({
      messages: [
        { role: "user", content: "First question" },
        { role: "assistant", content: "First answer" },
        { role: "user", content: "Second question here" },
      ],
      parameters: { maxOutputTokens: 2 },
    });
    assert.deepEqual(result, {
      model: { provider: "fake", model: "fake-chat" },
      content: "Echo: Second",
      finishReason: "length",
      usage: { inputTokens: 7, outputTokens: 2 },
    });
    assert.equal(model.requests.length, 1);
  });

  it("should replay scripted replies and scripted provider failures", async () => {
    const failure = new ModelError("timeout", "Synthetic timeout");
    const model = new FakeChatModel({
      reply: (request) => (request.messages.at(0)?.content === "fail" ? failure : "Scripted answer"),
    });
    assert.equal((await model.generate({ messages: [{ role: "user", content: "hi" }] })).content, "Scripted answer");
    await assert.rejects(model.generate({ messages: [{ role: "user", content: "fail" }] }), failure);
    assert.equal((await model.generate({ messages: [] })).content, "Scripted answer");
  });

  it("should stop streaming with a cancelled error when aborted midway", async () => {
    const controller = new AbortController();
    const received: string[] = [];
    const stream = new FakeChatModel({ reply: () => "one two three" }).stream({
      messages: [{ role: "user", content: "count" }],
      signal: controller.signal,
    });
    await assert.rejects(
      (async () => {
        for await (const event of stream) {
          if (event.type === "delta") received.push(event.text);
          controller.abort();
        }
      })(),
      (error) => error instanceof ModelError && error.kind === "cancelled"
    );
    assert.deepEqual(received, ["one"]);
  });

  it("should fail predictably after a scripted number of streamed chunks", async () => {
    const failure = new ModelError("unavailable", "Synthetic disconnect");
    const model = new FakeChatModel({ reply: () => "one two three", failStream: { afterDeltas: 2, error: failure } });
    const received: string[] = [];
    await assert.rejects(
      (async () => {
        for await (const event of model.stream({ messages: [{ role: "user", content: "count" }] })) {
          if (event.type === "delta") received.push(event.text);
        }
      })(),
      failure
    );
    assert.deepEqual(received, ["one", " two"]);
  });

  it("should describe its embedding dimension", () => {
    assert.equal(new FakeEmbeddingModel(4).dimensions, 4);
  });
});
