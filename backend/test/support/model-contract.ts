import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { ModelError, type ChatModel, type ChatRequest, type EmbeddingModel } from "../../src/models/gateway";

const question: ChatRequest = {
  messages: [
    { role: "system", content: "Answer in one short sentence." },
    { role: "user", content: "Say hello." },
  ],
  parameters: { temperature: 0, maxOutputTokens: 32 },
};

async function rejectsWith(promise: Promise<unknown>, kind: ModelError["kind"]) {
  await assert.rejects(promise, (error) => error instanceof ModelError && error.kind === kind);
}

async function collect(model: ChatModel, request: ChatRequest) {
  const events = [];
  for await (const event of model.stream(request)) events.push(event);
  return events;
}

export function describeChatModelContract(name: string, create: () => ChatModel) {
  describe(`${name} chat model contract`, () => {
    it("should generate non-empty content with a finish reason and usage only when it reports usage", async () => {
      const model = create();
      const result = await model.generate(question);
      assert.ok(result.content.trim().length > 0);
      assert.ok(result.model.provider.length > 0 && result.model.model.length > 0);
      assert.ok(["stop", "length"].includes(result.finishReason));
      if (model.capabilities.usageReporting) assert.equal(typeof result.usage?.outputTokens, "number");
      else assert.equal(result.usage, undefined);
    });

    it("should stream deltas that add up to the final result or refuse streaming explicitly", async () => {
      const model = create();
      if (!model.capabilities.streaming) {
        await rejectsWith(collect(model, question), "unsupported_capability");
        return;
      }
      const events = await collect(model, question);
      const done = events.at(-1);
      assert.ok(done?.type === "done");
      const streamed = events.flatMap((event) => (event.type === "delta" ? [event.text] : [])).join("");
      assert.equal(streamed, done.result.content);
      assert.equal(events.filter((event) => event.type === "done").length, 1);
    });

    it("should report an aborted request as cancelled", async () => {
      const controller = new AbortController();
      controller.abort();
      await rejectsWith(create().generate({ ...question, signal: controller.signal }), "cancelled");
    });
  });
}

export function describeEmbeddingModelContract(name: string, create: () => EmbeddingModel) {
  describe(`${name} embedding model contract`, () => {
    it("should return one finite vector of the declared dimension per input, in order and deterministically", async () => {
      const model = create();
      const inputs = ["first passage", "second passage", "first passage"];
      const { vectors, model: identity } = await model.embed({ inputs });
      assert.ok(identity.provider.length > 0 && identity.model.length > 0);
      assert.equal(vectors.length, inputs.length);
      for (const vector of vectors) {
        assert.equal(vector.length, model.dimensions);
        assert.ok(vector.every(Number.isFinite));
      }
      assert.deepEqual(vectors[0], vectors[2]);
      assert.notDeepEqual(vectors[0], vectors[1]);
    });

    it("should reject an empty batch and report an aborted request as cancelled", async () => {
      const model = create();
      await rejectsWith(model.embed({ inputs: [] }), "invalid_request");
      const controller = new AbortController();
      controller.abort();
      await rejectsWith(model.embed({ inputs: ["text"], signal: controller.signal }), "cancelled");
    });
  });
}
