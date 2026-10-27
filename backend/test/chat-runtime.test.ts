import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import type { MessageStreamEvent } from "@chat-app/shared";
import request from "supertest";
import { test, type TestContext } from "vitest";
import { createApp } from "../src/app";
import { NodeEnvironment } from "../src/config";
import type { Database } from "../src/db/database";
import { ModelError, type ChatModel, type ChatRequest, type ChatStreamEvent } from "../src/models/gateway";
import { ConversationRepository, createUnitOfWork } from "../src/repositories/ConversationRepository";
import ChatRuntimeService, {
  unconfiguredModelResolver,
  type RunModelResolver,
} from "../src/runtime/ChatRuntimeService";
import ConversationService from "../src/services/ConversationService";
import HealthService from "../src/services/HealthService";
import { createMigratedDatabase, publishAssistant } from "./database";
import { FakeChatModel } from "./support/fake-models";

async function runtimeFixture(t: TestContext, model: ChatModel) {
  const { db } = await createMigratedDatabase(t);
  await publishAssistant(db, "support");
  const conversations = new ConversationService({
    store: new ConversationRepository(db),
    transaction: createUnitOfWork(db),
  });
  const resolved: string[] = [];
  const models: RunModelResolver = {
    async resolve(conversationId) {
      resolved.push(conversationId);
      return model;
    },
  };
  const runtime = new ChatRuntimeService({ conversations, models });
  const conversation = await conversations.createConversation("support", "Runtime chat");
  return { db, conversations, runtime, conversation, resolved };
}

async function collect(events: AsyncIterable<MessageStreamEvent>) {
  const received: MessageStreamEvent[] = [];
  for await (const event of events) received.push(event);
  return received;
}

async function stored(db: Database) {
  const messages = await db.selectFrom("messages").select(["role", "content", "run_id"]).orderBy("sequence").execute();
  const runs = await db
    .selectFrom("runs")
    .select(["status", "provider", "model", "error_code", "prompt_trace", "usage"])
    .execute();
  return { messages, runs };
}

class ScriptedModel implements ChatModel {
  readonly provider = "scripted";
  readonly model = "scripted-chat";
  readonly capabilities = {
    streaming: true,
    toolCalling: false,
    structuredOutput: false,
    vision: false,
    usageReporting: false,
  };

  constructor(private readonly events: (request: ChatRequest) => AsyncIterable<ChatStreamEvent>) {}

  async generate(): Promise<never> {
    throw new ModelError("unsupported_capability", "Scripted models only stream.");
  }

  stream(request: ChatRequest) {
    return this.events(request);
  }
}

test("should stream deltas and persist the response with its succeeded run and prompt trace", async (t) => {
  const model = new FakeChatModel({ reply: () => "Hola desde el modelo" });
  const { db, runtime, conversation, resolved } = await runtimeFixture(t, model);
  const events = await collect(await runtime.sendMessage(conversation.id, "Hola", new AbortController().signal));
  assert.deepEqual(
    events.map((event) => event.type),
    ["accepted", "delta", "delta", "delta", "delta", "completed"]
  );
  const deltas = events.flatMap((event) => (event.type === "delta" ? [event.text] : []));
  assert.equal(deltas.join(""), "Hola desde el modelo");
  const completed = events.at(-1);
  assert.ok(completed?.type === "completed");
  assert.equal(completed.message.content, "Hola desde el modelo");
  assert.deepEqual(resolved, [conversation.id]);
  assert.equal(model.requests[0].messages.at(-1)?.content, "Hola");
  const { messages, runs } = await stored(db);
  assert.deepEqual(
    messages.map(({ role, content }) => [role, content]),
    [
      ["user", "Hola"],
      ["assistant", "Hola desde el modelo"],
    ]
  );
  assert.deepEqual(
    runs.map(({ status, provider, model: name }) => [status, provider, name]),
    [["succeeded", "fake", "fake-chat"]]
  );
  const inputTokens = model.requests[0].messages.reduce(
    (total, { content }) => total + content.split(/\s+/).filter(Boolean).length,
    0
  );
  assert.deepEqual(runs[0].usage, { inputTokens, outputTokens: 4 });
  assert.ok(runs[0].prompt_trace);
});

test("should fail the run and discard partial output when the model fails mid-stream", async (t) => {
  const model = new FakeChatModel({
    reply: () => "one two three",
    failStream: { afterDeltas: 2, error: new ModelError("unavailable", "Synthetic disconnect") },
  });
  const { db, runtime, conversation } = await runtimeFixture(t, model);
  const events = await collect(await runtime.sendMessage(conversation.id, "Count", new AbortController().signal));
  assert.deepEqual(events.slice(1), [
    { type: "delta", text: "one" },
    { type: "delta", text: " two" },
    { type: "failed", runStatus: "failed", code: "unavailable", detail: "Synthetic disconnect" },
  ]);
  const { messages, runs } = await stored(db);
  assert.deepEqual(
    messages.map(({ role }) => role),
    ["user"]
  );
  assert.deepEqual([runs[0].status, runs[0].error_code], ["failed", "unavailable"]);
});

test.for([
  ["a timeout", new ModelError("timeout", "Too slow"), "expired", "timeout", "Too slow"],
  ["an unexpected error", new Error("Synthetic bug"), "failed", "invalid_response", "The run failed unexpectedly."],
] as const)("should record %s as a terminal run without a response", async ([, error, status, code, detail], t) => {
  const model = new ScriptedModel(async function* () {
    yield { type: "delta", text: "Partial" };
    throw error;
  });
  const { db, runtime, conversation } = await runtimeFixture(t, model);
  const events = await collect(await runtime.sendMessage(conversation.id, "Question", new AbortController().signal));
  assert.deepEqual(events.at(-1), { type: "failed", runStatus: status, code, detail });
  const { messages, runs } = await stored(db);
  assert.equal(messages.length, 1);
  assert.deepEqual([runs[0].status, runs[0].error_code], [status, code]);
});

test.for([
  [
    "an empty response",
    async function* (): AsyncIterable<ChatStreamEvent> {
      yield {
        type: "done",
        result: { model: { provider: "scripted", model: "scripted-chat" }, content: "  ", finishReason: "stop" },
      };
    },
    "The model returned no content.",
  ],
  [
    "a stream without a result",
    async function* (): AsyncIterable<ChatStreamEvent> {
      yield { type: "delta", text: "Partial" };
    },
    "The model stream ended without a result.",
  ],
] as const)("should treat %s as an invalid response instead of a success", async ([, events, detail], t) => {
  const { db, runtime, conversation } = await runtimeFixture(t, new ScriptedModel(events));
  const received = await collect(await runtime.sendMessage(conversation.id, "Question", new AbortController().signal));
  assert.deepEqual(received.at(-1), { type: "failed", runStatus: "failed", code: "invalid_response", detail });
  assert.equal((await stored(db)).messages.length, 1);
});

test("should cancel the run when the caller aborts during generation", async (t) => {
  const model = new FakeChatModel({ reply: () => "first second third", holdAfterDeltas: 1 });
  const { db, runtime, conversation } = await runtimeFixture(t, model);
  const abort = new AbortController();
  const received: MessageStreamEvent[] = [];
  for await (const event of await runtime.sendMessage(conversation.id, "Question", abort.signal)) {
    received.push(event);
    if (event.type === "delta") abort.abort();
  }
  assert.deepEqual(received.slice(1), [
    { type: "delta", text: "first" },
    { type: "failed", runStatus: "cancelled", code: "cancelled", detail: "The generation was cancelled." },
  ]);
  const { messages, runs } = await stored(db);
  assert.deepEqual([messages.length, runs[0].status, runs[0].error_code], [1, "cancelled", null]);
});

test("should reject before writing anything when the conversation, model or concurrency forbids it", async (t) => {
  const { db, conversations, runtime, conversation } = await runtimeFixture(t, new FakeChatModel());
  const signal = new AbortController().signal;
  const unknown = "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47";
  await assert.rejects(runtime.sendMessage(unknown, "Hi", signal), { code: "NOT_FOUND" });
  const unconfigured = new ChatRuntimeService({ conversations, models: unconfiguredModelResolver });
  await assert.rejects(unconfigured.sendMessage(conversation.id, "Hi", signal), { code: "MODEL_NOT_CONFIGURED" });
  const nonStreaming = new ChatRuntimeService({
    conversations,
    models: { resolve: async () => new FakeChatModel({ capabilities: { streaming: false } }) },
  });
  await assert.rejects(nonStreaming.sendMessage(conversation.id, "Hi", signal), {
    code: "MODEL_NOT_CONFIGURED",
    message: "fake/fake-chat cannot stream responses.",
  });
  assert.deepEqual(await stored(db), { messages: [], runs: [] });
  await conversations.acceptUserMessage(conversation.id, "Pending");
  await assert.rejects(runtime.sendMessage(conversation.id, "Hi", signal), { code: "RUN_IN_PROGRESS" });
  await db.updateTable("conversations").set({ status: "closed" }).where("id", "=", conversation.id).execute();
  await assert.rejects(runtime.sendMessage(conversation.id, "Hi", signal), { code: "INVALID_STATE" });
});

async function httpFixture(t: TestContext, model: ChatModel) {
  const fixture = await runtimeFixture(t, model);
  const app = createApp(
    {
      conversationService: fixture.conversations,
      chatRuntime: fixture.runtime,
      healthService: new HealthService(fixture.db),
    },
    { nodeEnv: NodeEnvironment.Test, corsOrigins: [] }
  );
  return { ...fixture, app };
}

function parseEvents(text: string) {
  return text
    .trim()
    .split("\n\n")
    .map((block) => {
      const [eventLine, dataLine] = block.split("\n");
      return { name: eventLine.replace("event: ", ""), data: JSON.parse(dataLine.replace("data: ", "")) };
    });
}

test("should stream server-sent events over HTTP and keep validation as problems", async (t) => {
  const { app, conversation } = await httpFixture(t, new FakeChatModel({ reply: () => "Hi there" }));
  const path = `/api/v1/runtime/conversations/${conversation.id}/messages`;
  const response = await request(app).post(path).send({ content: "Hello" }).expect(200);
  assert.match(response.headers["content-type"], /^text\/event-stream/);
  assert.equal(response.headers["cache-control"], "no-cache");
  const events = parseEvents(response.text);
  assert.deepEqual(
    events.map(({ name }) => name),
    ["accepted", "delta", "delta", "completed"]
  );
  assert.ok(events.every(({ name, data }) => name === data.type));
  assert.equal(events.at(-1)?.data.message.content, "Hi there");
  const invalid = await request(app).post(path).send({ content: " " }).expect(400);
  assert.equal(invalid.body.code, "VALIDATION_FAILED");
});

test("should abort the model and cancel the run when the HTTP client disconnects", async (t) => {
  const model = new FakeChatModel({ reply: () => "first second", holdAfterDeltas: 1 });
  const { app, db, conversation } = await httpFixture(t, model);
  const server = app.listen(0, "127.0.0.1");
  t.onTestFinished(() => new Promise<void>((resolve) => server.close(() => resolve())));
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const { port }: AddressInfo = address;
  const abort = new AbortController();
  const response = await fetch(`http://127.0.0.1:${port}/api/v1/runtime/conversations/${conversation.id}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: "Hello" }),
    signal: abort.signal,
  });
  assert.ok(response.body);
  const reader = response.body.getReader();
  let text = "";
  while (!text.includes("event: delta")) {
    const chunk = await reader.read();
    text += new TextDecoder().decode(chunk.value);
  }
  abort.abort();
  await assert.rejects(reader.read());
  await waitForRunStatus(db, "cancelled");
  assert.equal(model.requests[0].signal?.aborted, true);
  assert.equal((await stored(db)).messages.length, 1);
});

async function waitForRunStatus(db: Database, status: string) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const run = await db.selectFrom("runs").select("status").executeTakeFirst();
    if (run?.status === status) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(`Run never reached ${status}`);
}
