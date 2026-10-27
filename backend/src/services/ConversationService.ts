import type { ConversationSummary, Message, PageQuery } from "@chat-app/shared";
import type { Transaction } from "kysely";
import type { Database } from "../db/database";
import type { DB } from "../db/schema";
import { defaultWorkspaceSlug } from "../db/seed";
import { AppError } from "../errors";
import { decodeCursor, toPage, type Page } from "../pagination";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sequencePattern = /^[1-9]\d{0,9}$/;

type RunOutcome = "failed" | "cancelled" | "expired";

interface ConversationRow {
  id: string;
  assistant_id: string;
  title: string;
  status: string;
  created_at: Date;
}

interface MessageRow {
  id: string;
  role: string;
  content: string;
  sequence: number;
  created_at: Date;
}

const conversationNotFound = () => new AppError("NOT_FOUND", "Conversation not found.");

function toSummary(row: ConversationRow): ConversationSummary {
  return {
    id: row.id,
    assistantId: row.assistant_id,
    title: row.title,
    status: row.status as ConversationSummary["status"],
    createdAt: row.created_at.toISOString(),
  };
}

function toMessage(row: MessageRow): Message {
  return {
    id: row.id,
    role: row.role as Message["role"],
    content: row.content,
    createdAt: row.created_at.toISOString(),
  };
}

const messageColumns = ["id", "role", "content", "sequence", "created_at"] as const;

class ConversationService {
  constructor(private readonly db: Database) {}

  private workspaceId(db: Database | Transaction<DB> = this.db) {
    return db.selectFrom("workspaces").select("id").where("slug", "=", defaultWorkspaceSlug);
  }

  private conversations(db: Database | Transaction<DB> = this.db) {
    return db
      .selectFrom("conversations")
      .select(["id", "workspace_id", "assistant_id", "title", "status", "created_at"])
      .where("workspace_id", "=", this.workspaceId(db));
  }

  async listConversations({ limit, cursor }: PageQuery): Promise<Page<ConversationSummary>> {
    let query = this.conversations()
      .orderBy("id", "desc")
      .limit(limit + 1);
    if (cursor) query = query.where("id", "<", decodeCursor(cursor, uuidPattern));
    const page = toPage(await query.execute(), limit, (row) => row.id);
    return { items: page.items.map(toSummary), nextCursor: page.nextCursor };
  }

  async getConversation(conversationId: string): Promise<ConversationSummary | undefined> {
    const row = await this.conversations().where("id", "=", conversationId).executeTakeFirst();
    return row && toSummary(row);
  }

  async createConversation(assistantSlug: string, title: string): Promise<ConversationSummary> {
    return this.db.transaction().execute(async (trx) => {
      const assistant = await trx
        .selectFrom("assistants as a")
        .leftJoin("environments as e", (join) =>
          join.onRef("e.workspace_id", "=", "a.workspace_id").on("e.key", "=", "production")
        )
        .leftJoin("active_deployments as ad", (join) =>
          join.onRef("ad.assistant_id", "=", "a.id").onRef("ad.environment_id", "=", "e.id")
        )
        .leftJoin("deployments as d", "d.id", "ad.deployment_id")
        .select(["a.id", "a.workspace_id", "a.status", "d.assistant_version_id"])
        .where("a.workspace_id", "=", this.workspaceId(trx))
        .where("a.slug", "=", assistantSlug)
        .forShare("a")
        .executeTakeFirst();
      if (!assistant) throw new AppError("NOT_FOUND", "Assistant not found.");
      if (assistant.status !== "active") throw new AppError("INVALID_STATE", "The assistant is archived.");
      if (!assistant.assistant_version_id) {
        throw new AppError("INVALID_STATE", "The assistant has no production deployment.");
      }
      const row = await trx
        .insertInto("conversations")
        .values({
          workspace_id: assistant.workspace_id,
          assistant_id: assistant.id,
          target_kind: "version",
          assistant_version_id: assistant.assistant_version_id,
          title,
        })
        .returning(["id", "assistant_id", "title", "status", "created_at"])
        .executeTakeFirstOrThrow();
      return toSummary(row);
    });
  }

  async listMessages(conversationId: string, { limit, cursor }: PageQuery): Promise<Page<Message> | undefined> {
    if (!(await this.getConversation(conversationId))) return undefined;
    let query = this.db
      .selectFrom("messages")
      .select(messageColumns)
      .where("conversation_id", "=", conversationId)
      .orderBy("sequence")
      .limit(limit + 1);
    if (cursor) query = query.where("sequence", ">", Number(decodeCursor(cursor, sequencePattern)));
    const page = toPage(await query.execute(), limit, (row) => String(row.sequence));
    return { items: page.items.map(toMessage), nextCursor: page.nextCursor };
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom("conversations")
      .where("id", "=", conversationId)
      .where("workspace_id", "=", this.workspaceId())
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  private async lockOpenConversation(trx: Transaction<DB>, conversationId: string) {
    const conversation = await this.conversations(trx).where("id", "=", conversationId).forUpdate().executeTakeFirst();
    if (!conversation) throw conversationNotFound();
    if (conversation.status !== "open") throw new AppError("INVALID_STATE", "The conversation is closed.");
    return conversation;
  }

  private async nextSequence(trx: Transaction<DB>, conversationId: string): Promise<number> {
    const { last } = await trx
      .selectFrom("messages")
      .select((eb) => eb.fn.max("sequence").as("last"))
      .where("conversation_id", "=", conversationId)
      .executeTakeFirstOrThrow();
    return (last ?? 0) + 1;
  }

  async acceptUserMessage(conversationId: string, content: string): Promise<{ message: Message; runId: string }> {
    return this.db.transaction().execute(async (trx) => {
      const conversation = await this.lockOpenConversation(trx, conversationId);
      const active = await trx
        .selectFrom("runs")
        .select("id")
        .where("conversation_id", "=", conversationId)
        .where("status", "in", ["accepted", "running"])
        .executeTakeFirst();
      if (active) throw new AppError("RUN_IN_PROGRESS", "The conversation already has a run in progress.");
      const message = await trx
        .insertInto("messages")
        .values({
          workspace_id: conversation.workspace_id,
          conversation_id: conversationId,
          sequence: await this.nextSequence(trx, conversationId),
          role: "user",
          content,
        })
        .returning(messageColumns)
        .executeTakeFirstOrThrow();
      const run = await trx
        .insertInto("runs")
        .values({
          workspace_id: conversation.workspace_id,
          conversation_id: conversationId,
          trigger_message_id: message.id,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      return { message: toMessage(message), runId: run.id };
    });
  }

  async startRun(runId: string, model: { provider: string; model: string }): Promise<void> {
    const result = await this.db
      .updateTable("runs")
      .set({ status: "running", started_at: new Date(), provider: model.provider, model: model.model })
      .where("id", "=", runId)
      .where("status", "=", "accepted")
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) throw new AppError("INVALID_STATE", "The run is not waiting to start.");
  }

  async completeRun(runId: string, result: { content: string; usage?: Record<string, number> }): Promise<Message> {
    return this.db.transaction().execute(async (trx) => {
      const owner = await trx.selectFrom("runs").select("conversation_id").where("id", "=", runId).executeTakeFirst();
      if (!owner) throw new AppError("NOT_FOUND", "Run not found.");
      const conversation = await this.conversations(trx)
        .where("id", "=", owner.conversation_id)
        .forUpdate()
        .executeTakeFirstOrThrow();
      const run = await trx
        .selectFrom("runs")
        .select("status")
        .where("id", "=", runId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      if (run.status === "succeeded") {
        const existing = await trx
          .selectFrom("messages")
          .select(messageColumns)
          .where("run_id", "=", runId)
          .executeTakeFirstOrThrow();
        return toMessage(existing);
      }
      if (run.status !== "running") throw new AppError("INVALID_STATE", `The run is ${run.status}.`);
      await trx
        .updateTable("runs")
        .set({ status: "succeeded", finished_at: new Date(), usage: result.usage ?? null })
        .where("id", "=", runId)
        .execute();
      const message = await trx
        .insertInto("messages")
        .values({
          workspace_id: conversation.workspace_id,
          conversation_id: conversation.id,
          sequence: await this.nextSequence(trx, conversation.id),
          role: "assistant",
          content: result.content,
          run_id: runId,
        })
        .returning(messageColumns)
        .executeTakeFirstOrThrow();
      return toMessage(message);
    });
  }

  async finishRun(runId: string, outcome: RunOutcome, error?: { code: string; message: string }): Promise<void> {
    const result = await this.db
      .updateTable("runs")
      .set({
        status: outcome,
        finished_at: new Date(),
        error_code: error?.code ?? null,
        error_message: error?.message ?? null,
      })
      .where("id", "=", runId)
      .where("status", "in", ["accepted", "running"])
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) === 0) throw new AppError("INVALID_STATE", "The run has already finished.");
  }
}

export default ConversationService;
