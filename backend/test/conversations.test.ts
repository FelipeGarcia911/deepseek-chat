import assert from "node:assert/strict";
import { sql, type Insertable } from "kysely";
import type { DB } from "../src/db/schema";
import { test, type TestContext } from "vitest";
import type { Database } from "../src/db/database";
import { ConversationRepository, createUnitOfWork } from "../src/repositories/ConversationRepository";
import ConversationService, { type RunCompletion } from "../src/services/ConversationService";
import { createMigratedDatabase, publishAssistant } from "./database";

const firstPage = { limit: 20 };

function conversationService(db: Database) {
  return new ConversationService({ store: new ConversationRepository(db), transaction: createUnitOfWork(db) });
}

async function conversationFixture(t: TestContext) {
  const { db } = await createMigratedDatabase(t);
  const assistant = await publishAssistant(db, "support");
  const service = conversationService(db);
  const conversation = await service.createConversation("support", "Test chat");
  return { db, assistant, service, conversation };
}

async function succeed(service: ConversationService, conversationId: string, question: string, answer: string) {
  const { runId } = await service.acceptUserMessage(conversationId, question);
  await service.startRun(runId, { provider: "ollama", model: "llama3" });
  return { runId, response: await service.completeRun(runId, { content: answer, usage: { outputTokens: 3 } }) };
}

test("should keep existing conversations pinned to their version after a promotion", async (t) => {
  const { db, assistant, service, conversation } = await conversationFixture(t);
  const secondVersion = await assistant.promote(2);
  const later = await service.createConversation("support", "After promotion");
  const targets = await db.selectFrom("conversations").select(["id", "assistant_version_id"]).orderBy("id").execute();
  assert.deepEqual(targets, [
    { id: conversation.id, assistant_version_id: assistant.versionId },
    { id: later.id, assistant_version_id: secondVersion },
  ]);
  await assert.rejects(
    db
      .updateTable("conversations")
      .set({ assistant_version_id: secondVersion })
      .where("id", "=", conversation.id)
      .execute(),
    { code: "23001" }
  );
});

test("should store questions and answers in deterministic order with one succeeded run per response", async (t) => {
  const { db, service, conversation } = await conversationFixture(t);
  const first = await succeed(service, conversation.id, "First question", "First answer");
  await succeed(service, conversation.id, "Second question", "Second answer");
  const page = await service.listMessages(conversation.id, firstPage);
  assert.deepEqual(
    page.items.map(({ role, content }) => [role, content]),
    [
      ["user", "First question"],
      ["assistant", "First answer"],
      ["user", "Second question"],
      ["assistant", "Second answer"],
    ]
  );
  const rows = await db.selectFrom("messages").select(["sequence", "run_id"]).orderBy("sequence").execute();
  assert.deepEqual(
    rows.map((row) => row.sequence),
    [1, 2, 3, 4]
  );
  assert.equal(rows[1].run_id, first.runId);
  const run = await db.selectFrom("runs").selectAll().where("id", "=", first.runId).executeTakeFirstOrThrow();
  assert.equal(run.status, "succeeded");
  assert.deepEqual([run.provider, run.model, run.usage], ["ollama", "llama3", { outputTokens: 3 }]);
  assert.ok(run.started_at && run.finished_at && run.finished_at >= run.started_at);
  assert.deepEqual(await service.completeRun(first.runId, { content: "Duplicate callback" }), first.response);
  assert.equal((await db.selectFrom("messages").select("id").where("run_id", "=", first.runId).execute()).length, 1);
});

test("should page messages oldest first with an opaque cursor", async (t) => {
  const { service, conversation } = await conversationFixture(t);
  await succeed(service, conversation.id, "Question", "Answer");
  const first = await service.listMessages(conversation.id, { limit: 1 });
  assert.equal(first.items[0].content, "Question");
  const second = await service.listMessages(conversation.id, { limit: 1, cursor: first.nextCursor ?? undefined });
  assert.deepEqual([second.items[0].content, second.nextCursor], ["Answer", null]);
  await assert.rejects(service.listMessages("0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47", firstPage), { code: "NOT_FOUND" });
});

test("should admit only one run at a time when messages arrive concurrently", async (t) => {
  const { db, service, conversation } = await conversationFixture(t);
  const attempts = await Promise.allSettled(
    Array.from({ length: 5 }, (_, index) => service.acceptUserMessage(conversation.id, `Question ${index}`))
  );
  const accepted = attempts.filter((attempt) => attempt.status === "fulfilled");
  const rejected = attempts.filter((attempt) => attempt.status === "rejected");
  assert.equal(accepted.length, 1);
  assert.ok(rejected.every((attempt) => attempt.reason.code === "RUN_IN_PROGRESS"));
  const messages = await db.selectFrom("messages").select(["sequence", "role"]).execute();
  assert.deepEqual(messages, [{ sequence: 1, role: "user" }]);
  assert.equal((await db.selectFrom("runs").select("id").execute()).length, 1);
});

test("should finish failed, cancelled and expired runs without a response and keep them terminal", async (t) => {
  const { db, service, conversation } = await conversationFixture(t);
  const error = { code: "PROVIDER_TIMEOUT", message: "Synthetic failure" };
  const completions: RunCompletion[] = [
    { outcome: "failed", error },
    { outcome: "cancelled" },
    { outcome: "expired", error },
  ];
  for (const completion of completions) {
    const { runId } = await service.acceptUserMessage(conversation.id, `Will be ${completion.outcome}`);
    await service.finishRun(runId, completion);
    await assert.rejects(service.finishRun(runId, { outcome: "failed", error }), { code: "INVALID_STATE" });
    await assert.rejects(service.startRun(runId, { provider: "ollama", model: "llama3" }), { code: "INVALID_STATE" });
    await assert.rejects(service.completeRun(runId, { content: "Late answer" }), { code: "INVALID_STATE" });
    await assert.rejects(
      db.updateTable("runs").set({ status: "running", finished_at: null }).where("id", "=", runId).execute(),
      { code: "23001" }
    );
  }
  const roles = await db.selectFrom("messages").select("role").execute();
  assert.deepEqual(new Set(roles.map(({ role }) => role)), new Set(["user"]));
  await assert.rejects(service.completeRun("0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47", { content: "x" }), {
    code: "NOT_FOUND",
  });
});

test("should reject responses without a succeeded run and invalid run transitions in the database", async (t) => {
  const { db, service, conversation } = await conversationFixture(t);
  const { runId, message } = await service.acceptUserMessage(conversation.id, "Question");
  const base = {
    workspace_id: sql<string>`(select workspace_id from conversations limit 1)`,
    conversation_id: conversation.id,
  };
  await assert.rejects(
    db
      .insertInto("messages")
      .values({ ...base, sequence: 2, role: "assistant", content: "Early", run_id: runId })
      .execute(),
    /assistant messages require a succeeded run/
  );
  await assert.rejects(
    db
      .insertInto("messages")
      .values({ ...base, sequence: 2, role: "assistant", content: "Orphan" })
      .execute(),
    /messages_response_run_check/
  );
  await assert.rejects(
    db
      .insertInto("messages")
      .values({ ...base, sequence: 1, role: "user", content: "Duplicate position" })
      .execute(),
    /messages_conversation_id_sequence_key/
  );
  await assert.rejects(
    db.updateTable("runs").set({ status: "succeeded", finished_at: new Date() }).where("id", "=", runId).execute(),
    /run cannot move from accepted to succeeded/
  );
  await assert.rejects(db.updateTable("messages").set({ content: "Edited" }).where("id", "=", message.id).execute(), {
    code: "23001",
  });
  await service.finishRun(runId, { outcome: "cancelled" });
  const { runId: answered } = await succeed(service, conversation.id, "Follow-up", "Answer");
  await assert.rejects(
    db
      .insertInto("messages")
      .values({ ...base, sequence: 5, role: "assistant", content: "Second answer", run_id: answered })
      .execute(),
    /messages_run_id_key/
  );
  await assert.rejects(
    db
      .insertInto("runs")
      .values({ ...base, trigger_message_id: message.id, status: "running" })
      .execute(),
    /runs must start as accepted/
  );
  const response = await db
    .selectFrom("messages")
    .select("id")
    .where("run_id", "=", answered)
    .executeTakeFirstOrThrow();
  await assert.rejects(
    db
      .insertInto("runs")
      .values({ ...base, trigger_message_id: response.id })
      .execute(),
    /runs must be triggered by a user message/
  );
});

test("should refuse new messages in closed conversations and delete history with its conversation", async (t) => {
  const { db, service, conversation } = await conversationFixture(t);
  await succeed(service, conversation.id, "Question", "Answer");
  await db.updateTable("conversations").set({ status: "closed" }).where("id", "=", conversation.id).execute();
  await assert.rejects(service.acceptUserMessage(conversation.id, "Late question"), { code: "INVALID_STATE" });
  await assert.rejects(service.acceptUserMessage("0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47", "Nobody"), {
    code: "NOT_FOUND",
  });
  await service.deleteConversation(conversation.id);
  await assert.rejects(service.deleteConversation(conversation.id), { code: "NOT_FOUND" });
  for (const table of ["messages", "runs"] as const) {
    assert.equal((await db.selectFrom(table).select("id").execute()).length, 0);
  }
});

test("should reject conversation targets that do not match their kind or assistant", async (t) => {
  const { db, assistant } = await conversationFixture(t);
  const other = await publishAssistant(db, "sales");
  const workspaceId = sql<string>`(select id from workspaces where slug = 'default')`;
  const invalid: Pick<Insertable<DB["conversations"]>, "target_kind" | "assistant_version_id" | "draft_snapshot">[] = [
    { target_kind: "version", assistant_version_id: null },
    { target_kind: "draft_snapshot", assistant_version_id: assistant.versionId, draft_snapshot: {} },
    { target_kind: "draft_snapshot", assistant_version_id: null, draft_snapshot: "[]" },
    { target_kind: "version", assistant_version_id: other.versionId },
  ];
  for (const target of invalid) {
    await assert.rejects(
      db
        .insertInto("conversations")
        .values({ workspace_id: workspaceId, assistant_id: assistant.assistantId, title: "Invalid", ...target })
        .execute()
    );
  }
  const preview = await db
    .insertInto("conversations")
    .values({
      workspace_id: workspaceId,
      assistant_id: assistant.assistantId,
      title: "Playground",
      target_kind: "draft_snapshot",
      draft_snapshot: { instructions: "Draft", revision: 3 },
    })
    .returning("target_kind")
    .executeTakeFirstOrThrow();
  assert.equal(preview.target_kind, "draft_snapshot");
});

test("should return the same single response when a run is completed concurrently", async (t) => {
  const { db, service, conversation } = await conversationFixture(t);
  const { runId } = await service.acceptUserMessage(conversation.id, "Question");
  await service.startRun(runId, { provider: "ollama", model: "llama3" });
  const [first, second] = await Promise.all([
    service.completeRun(runId, { content: "Answer" }),
    service.completeRun(runId, { content: "Racing answer" }),
  ]);
  assert.deepEqual(first, second);
  const responses = await db.selectFrom("messages").select("content").where("run_id", "=", runId).execute();
  assert.equal(responses.length, 1);
});

test("should refuse to commit a succeeded run without its response", async (t) => {
  const { db, service, conversation } = await conversationFixture(t);
  const { runId } = await service.acceptUserMessage(conversation.id, "Question");
  await service.startRun(runId, { provider: "ollama", model: "llama3" });
  await assert.rejects(
    db.updateTable("runs").set({ status: "succeeded", finished_at: new Date() }).where("id", "=", runId).execute(),
    /succeeded run .* must have exactly one response/
  );
  const run = await db.selectFrom("runs").select("status").where("id", "=", runId).executeTakeFirstOrThrow();
  assert.equal(run.status, "running");
});

test("should reject deleting messages or runs individually while their conversation exists", async (t) => {
  const { db, service, conversation } = await conversationFixture(t);
  const { runId, response } = await succeed(service, conversation.id, "Question", "Answer");
  await assert.rejects(db.deleteFrom("messages").where("id", "=", response.id).execute(), {
    code: "23001",
    message: /messages rows can only be deleted with their conversation/,
  });
  await assert.rejects(db.deleteFrom("runs").where("id", "=", runId).execute(), {
    code: "23001",
    message: /runs rows can only be deleted with their conversation/,
  });
  assert.equal((await db.selectFrom("messages").select("id").execute()).length, 2);
  await service.deleteConversation(conversation.id);
  assert.deepEqual(await db.selectFrom("runs").select("id").execute(), []);
});
