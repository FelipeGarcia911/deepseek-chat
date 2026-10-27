import assert from "node:assert/strict";
import { test, type TestContext } from "vitest";
import { ConversationRepository, createUnitOfWork } from "../src/repositories/ConversationRepository";
import { assemblePrompt } from "../src/runtime/prompt";
import { createMigratedDatabase, publishAssistant } from "./database";

async function repositoryFixture(t: TestContext) {
  const { db } = await createMigratedDatabase(t);
  const assistant = await publishAssistant(db, "support");
  const repository = new ConversationRepository(db);
  const target = await repository.findAssistantTarget("support");
  assert.ok(target);
  const { versionId } = target;
  assert.ok(versionId);
  const create = (title: string) => repository.insertConversation({ ...target, versionId, title });
  return { db, assistant, repository, target, create };
}

test("should resolve an assistant's production target, or its absence, by slug", async (t) => {
  const { db, assistant, repository, target } = await repositoryFixture(t);
  assert.deepEqual(target, {
    assistantId: assistant.assistantId,
    workspaceId: target.workspaceId,
    status: "active",
    versionId: assistant.versionId,
  });
  const promoted = await assistant.promote(2);
  assert.equal((await repository.findAssistantTarget("support"))?.versionId, promoted);
  await publishAssistant(db, "draft-only", { deploy: false });
  assert.equal((await repository.findAssistantTarget("draft-only"))?.versionId, null);
  assert.equal(await repository.findAssistantTarget("missing"), undefined);
});

test("should list conversations newest first before a given identifier", async (t) => {
  const { repository, target, create } = await repositoryFixture(t);
  const [first, second, third] = [await create("First"), await create("Second"), await create("Third")];
  assert.deepEqual(
    (await repository.listConversations(10)).map(({ title }) => title),
    ["Third", "Second", "First"]
  );
  assert.deepEqual(await repository.listConversations(1, third.id), [second]);
  assert.deepEqual(await repository.findConversation(first.id), first);
  assert.deepEqual(await repository.lockConversation(first.id), {
    ...first,
    workspaceId: target.workspaceId,
  });
  assert.equal(await repository.findConversation("0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47"), undefined);
});

test("should append messages with increasing sequences and read them after a sequence", async (t) => {
  const { db, repository, target, create } = await repositoryFixture(t);
  const conversation = await create("Chat");
  const base = { workspaceId: target.workspaceId, conversationId: conversation.id };
  const question = await repository.appendMessage({ ...base, role: "user", content: "Question" });
  const runId = await repository.insertRun({ ...base, triggerMessageId: question.id });
  assert.equal(await repository.hasActiveRun(conversation.id), true);
  assert.equal(await repository.updateRun(runId, ["running"], { status: "succeeded" }), false);
  const prompt = await repository.findRunContext(runId);
  assert.ok(prompt);
  const promptTrace = assemblePrompt(prompt.target, prompt.history).trace;
  assert.equal(
    await repository.updateRun(runId, ["accepted"], { status: "running", startedAt: new Date(), promptTrace }),
    true
  );
  const answer = await createUnitOfWork(db)(async (store) => {
    assert.equal(await store.updateRun(runId, ["running"], { status: "succeeded", finishedAt: new Date() }), true);
    assert.deepEqual(await store.findRun(runId, true), { conversationId: conversation.id, status: "succeeded" });
    return store.appendMessage({ ...base, role: "assistant", content: "Answer", runId });
  });
  assert.equal(await repository.hasActiveRun(conversation.id), false);
  assert.deepEqual([question.sequence, answer.sequence], [1, 2]);
  assert.deepEqual(await repository.findResponse(runId), answer);
  assert.deepEqual(await repository.listMessages(conversation.id, 10, 1), [answer]);
  assert.equal(await repository.findRun("0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47"), undefined);
});

test("should report whether a conversation was deleted together with its history", async (t) => {
  const { db, repository, target, create } = await repositoryFixture(t);
  const conversation = await create("Chat");
  await repository.appendMessage({
    workspaceId: target.workspaceId,
    conversationId: conversation.id,
    role: "user",
    content: "Question",
  });
  assert.equal(await repository.deleteConversation(conversation.id), true);
  assert.equal(await repository.deleteConversation(conversation.id), false);
  assert.deepEqual(await db.selectFrom("messages").select("id").execute(), []);
});
