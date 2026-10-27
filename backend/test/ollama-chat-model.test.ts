import assert from "node:assert/strict";
import { afterAll, beforeAll, describe, it, type TestContext } from "vitest";
import { ModelError, type ChatRequest, type ModelErrorKind } from "../src/models/gateway";
import { OllamaChatModel, type OllamaConnection } from "../src/models/providers/ollama/OllamaChatModel";
import { describeChatModelContract } from "./support/model-contract";
import { realisticOllama, startOllamaServer, type OllamaHandler } from "./support/ollama-server";

const question: ChatRequest = { messages: [{ role: "user", content: "Say hello" }] };

let emulated: Awaited<ReturnType<typeof startOllamaServer>>;
beforeAll(async () => {
  emulated = await startOllamaServer(realisticOllama);
});
afterAll(() => emulated.close());

describeChatModelContract(
  "ollama (emulated)",
  () => new OllamaChatModel({ model: "llama3.2" }, { baseUrl: emulated.baseUrl })
);

const liveBaseUrl = process.env.OLLAMA_CONTRACT_BASE_URL;
if (liveBaseUrl) {
  describeChatModelContract(
    "ollama (live)",
    () => new OllamaChatModel({ model: process.env.OLLAMA_CONTRACT_MODEL ?? "llama3.2" }, { baseUrl: liveBaseUrl })
  );
}

async function serve(t: TestContext, handler: OllamaHandler, connection: Partial<OllamaConnection> = {}) {
  const server = await startOllamaServer(handler);
  t.onTestFinished(server.close);
  const model = new OllamaChatModel({ model: "llama3.2" }, { baseUrl: server.baseUrl, ...connection });
  return { server, model };
}

async function rejectsWith(promise: Promise<unknown>, kind: ModelErrorKind, message?: RegExp) {
  await assert.rejects(
    promise,
    (error) => error instanceof ModelError && error.kind === kind && (!message || message.test(error.message))
  );
}

async function drain<T>(stream: AsyncIterable<T>) {
  const events: T[] = [];
  for await (const event of stream) events.push(event);
  return events;
}

describe("ollama request mapping", () => {
  it("should translate neutral messages and merged parameters into Ollama options", async (t) => {
    const server = await startOllamaServer(realisticOllama);
    t.onTestFinished(server.close);
    const model = new OllamaChatModel(
      { model: " llama3.2 ", defaultParameters: { temperature: 0.7, maxOutputTokens: 64 } },
      { baseUrl: `${server.baseUrl}/`, apiKey: "secret-key" }
    );
    const result = await model.generate({
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Hello there" },
      ],
      parameters: { topP: 0.9, maxOutputTokens: 2 },
    });
    assert.deepEqual(server.received[0].body, {
      model: "llama3.2",
      messages: [
        { role: "system", content: "Be brief." },
        { role: "user", content: "Hello there" },
      ],
      stream: false,
      options: { temperature: 0.7, top_p: 0.9, num_predict: 2 },
    });
    assert.equal(server.received[0].path, "/api/chat");
    assert.equal(server.received[0].headers.authorization, "Bearer secret-key");
    assert.deepEqual(result, {
      model: { provider: "ollama", model: "llama3.2:latest" },
      content: "Echo: Hello",
      finishReason: "length",
      usage: { inputTokens: 6, outputTokens: 2 },
    });
  });

  it("should request streaming and send no authorization header without an api key", async (t) => {
    const { server, model } = await serve(t, realisticOllama);
    await drain(model.stream(question));
    assert.equal(server.received[0].body.stream, true);
    assert.equal(server.received[0].headers.authorization, undefined);
  });
});

describe("ollama error translation", () => {
  it.each<[number, ModelErrorKind]>([
    [400, "invalid_request"],
    [401, "authentication"],
    [403, "authentication"],
    [404, "model_not_found"],
    [429, "rate_limited"],
    [500, "unavailable"],
    [502, "unavailable"],
    [418, "invalid_response"],
  ])("should translate HTTP %i into %s", async (status, kind) => {
    const server = await startOllamaServer((_request, response) => {
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ error: "synthetic failure" }));
    });
    const model = new OllamaChatModel({ model: "llama3.2" }, { baseUrl: server.baseUrl });
    try {
      await rejectsWith(model.generate(question), kind, new RegExp(`Ollama answered ${status}: synthetic failure`));
    } finally {
      await server.close();
    }
  });

  it("should report a missing model and an error status without a JSON body", async (t) => {
    const missing = new OllamaChatModel({ model: "missing" }, { baseUrl: emulated.baseUrl });
    await rejectsWith(missing.generate(question), "model_not_found", /model 'missing' not found/);
    const { model: bare } = await serve(t, (_request, response) => {
      response.writeHead(503);
      response.end();
    });
    await rejectsWith(bare.generate(question), "unavailable", /^Ollama answered 503$/);
  });

  it.each([
    ["malformed JSON", "{not json", /malformed JSON/],
    ["an unexpected payload", JSON.stringify({ message: { content: "no model" } }), /unexpected payload/],
    [
      "no final chunk",
      JSON.stringify({ model: "llama3.2", message: { content: "partial" }, done: false }),
      /without a final chunk/,
    ],
  ])("should reject %s as an invalid response", async (_label, payload, message) => {
    const server = await startOllamaServer((_request, response) => {
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(payload);
    });
    const model = new OllamaChatModel({ model: "llama3.2" }, { baseUrl: server.baseUrl });
    try {
      await rejectsWith(model.generate(question), "invalid_response", message);
      await rejectsWith(drain(model.stream(question)), "invalid_response", message);
    } finally {
      await server.close();
    }
  });

  it("should surface an error reported inside the stream after partial output", async (t) => {
    const { model } = await serve(t, (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/x-ndjson" });
      response.write(`${JSON.stringify({ model: "llama3.2", message: { content: "Partial" }, done: false })}\n`);
      response.end(`${JSON.stringify({ error: "model runner crashed" })}\n`);
    });
    const deltas: string[] = [];
    await rejectsWith(
      (async () => {
        for await (const event of model.stream(question)) if (event.type === "delta") deltas.push(event.text);
      })(),
      "unavailable",
      /model runner crashed/
    );
    assert.deepEqual(deltas, ["Partial"]);
  });

  it("should time out when Ollama does not answer within the connection timeout", async (t) => {
    const { model } = await serve(t, () => {}, { timeoutMs: 50 });
    await rejectsWith(model.generate(question), "timeout", /within 50 ms/);
  });

  it("should report an unreachable server as unavailable", async () => {
    const model = new OllamaChatModel({ model: "llama3.2" }, { baseUrl: "http://127.0.0.1:1/api" });
    await rejectsWith(model.generate(question), "unavailable", /unreachable/);
  });

  it("should cancel an in-flight stream when the caller aborts", async (t) => {
    const { model } = await serve(t, (_request, response) => {
      response.writeHead(200, { "Content-Type": "application/x-ndjson" });
      response.write(`${JSON.stringify({ model: "llama3.2", message: { content: "First" }, done: false })}\n`);
    });
    const controller = new AbortController();
    const deltas: string[] = [];
    await rejectsWith(
      (async () => {
        for await (const event of model.stream({ ...question, signal: controller.signal })) {
          if (event.type === "delta") deltas.push(event.text);
          controller.abort();
        }
      })(),
      "cancelled"
    );
    assert.deepEqual(deltas, ["First"]);
  });

  it("should reject an empty response body", async () => {
    const model = new OllamaChatModel(
      { model: "llama3.2" },
      { baseUrl: "http://ollama.test/api" },
      async () => new Response(null)
    );
    await rejectsWith(model.generate(question), "invalid_response", /empty body/);
  });
});

describe("ollama configuration", () => {
  it.each([
    [{ model: "" }, { baseUrl: "http://localhost:11434/api" }, /model selection: model/],
    [
      { model: "llama3.2", defaultParameters: { temperature: 5 } },
      { baseUrl: "http://localhost:11434/api" },
      /defaultParameters.temperature/,
    ],
    [{ model: "llama3.2" }, { baseUrl: "ftp://localhost:11434/api" }, /Ollama connection: baseUrl/],
    [{ model: "llama3.2" }, { baseUrl: "http://user:pass@localhost:11434/api" }, /Ollama connection: baseUrl/],
    [{ model: "llama3.2" }, { baseUrl: "http://localhost:11434/api", timeoutMs: 0 }, /Ollama connection: timeoutMs/],
  ])("should reject invalid configuration %o", (selection, connection, message) => {
    assert.throws(
      () => new OllamaChatModel(selection, { ...connection, apiKey: "top-secret" }),
      (error) =>
        error instanceof ModelError &&
        error.kind === "invalid_request" &&
        message.test(error.message) &&
        !error.message.includes("top-secret")
    );
  });

  it("should reject invalid per-request parameters before calling Ollama", async (t) => {
    const { server, model } = await serve(t, realisticOllama);
    await rejectsWith(
      model.generate({ ...question, parameters: { topP: 0 } }),
      "invalid_request",
      /generation parameters: topP/
    );
    assert.equal(server.received.length, 0);
  });
});
