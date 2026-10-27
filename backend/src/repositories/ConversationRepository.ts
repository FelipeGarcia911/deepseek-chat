import type { ConversationSummary, Message } from "@chat-app/shared";
import type { Selectable, Transaction } from "kysely";
import { z } from "zod";
import type { Database } from "../db/database";
import type { DB } from "../db/schema";
import { defaultWorkspaceSlug } from "../db/seed";
import type {
  AssistantTarget,
  ConversationStore,
  LockedConversation,
  RunChanges,
  RunContext,
  RunStatus,
  StoredMessage,
  UnitOfWork,
} from "../services/ConversationService";

type Executor = Database | Transaction<DB>;

const VersionTarget = z.object({ assistant_version_id: z.string(), instructions: z.string() });
const DraftSnapshotTarget = z.object({
  draft_snapshot: z.object({ instructions: z.string(), revision: z.number().int().positive() }),
});

const conversationColumns = ["id", "workspace_id", "assistant_id", "title", "status", "created_at"] as const;
const messageColumns = ["id", "role", "content", "sequence", "created_at"] as const;

function toSummary(
  row: Pick<Selectable<DB["conversations"]>, "id" | "assistant_id" | "title" | "status" | "created_at">
): ConversationSummary {
  return {
    id: row.id,
    assistantId: row.assistant_id,
    title: row.title,
    status: row.status,
    createdAt: row.created_at.toISOString(),
  };
}

function toMessage(
  row: Pick<Selectable<DB["messages"]>, "id" | "role" | "content" | "sequence" | "created_at">
): StoredMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    sequence: row.sequence,
    createdAt: row.created_at.toISOString(),
  };
}

export class ConversationRepository implements ConversationStore {
  constructor(private readonly db: Executor) {}

  private workspaceId() {
    return this.db.selectFrom("workspaces").select("id").where("slug", "=", defaultWorkspaceSlug);
  }

  private conversations() {
    return this.db
      .selectFrom("conversations")
      .select(conversationColumns)
      .where("workspace_id", "=", this.workspaceId());
  }

  async listConversations(limit: number, beforeId?: string): Promise<ConversationSummary[]> {
    let query = this.conversations().orderBy("id", "desc").limit(limit);
    if (beforeId) query = query.where("id", "<", beforeId);
    return (await query.execute()).map(toSummary);
  }

  async findConversation(conversationId: string): Promise<ConversationSummary | undefined> {
    const row = await this.conversations().where("id", "=", conversationId).executeTakeFirst();
    return row && toSummary(row);
  }

  async lockConversation(conversationId: string): Promise<LockedConversation | undefined> {
    const row = await this.conversations().where("id", "=", conversationId).forUpdate().executeTakeFirst();
    return row && { ...toSummary(row), workspaceId: row.workspace_id };
  }

  async findAssistantTarget(assistantSlug: string): Promise<AssistantTarget | undefined> {
    const row = await this.db
      .selectFrom("assistants as a")
      .leftJoin("environments as e", (join) =>
        join.onRef("e.workspace_id", "=", "a.workspace_id").on("e.key", "=", "production")
      )
      .leftJoin("active_deployments as ad", (join) =>
        join.onRef("ad.assistant_id", "=", "a.id").onRef("ad.environment_id", "=", "e.id")
      )
      .leftJoin("deployments as d", "d.id", "ad.deployment_id")
      .select(["a.id", "a.workspace_id", "a.status", "d.assistant_version_id"])
      .where("a.workspace_id", "=", this.workspaceId())
      .where("a.slug", "=", assistantSlug)
      .forShare("a")
      .executeTakeFirst();
    return (
      row && {
        assistantId: row.id,
        workspaceId: row.workspace_id,
        status: row.status,
        versionId: row.assistant_version_id,
      }
    );
  }

  async insertConversation(target: {
    workspaceId: string;
    assistantId: string;
    versionId: string;
    title: string;
  }): Promise<ConversationSummary> {
    const row = await this.db
      .insertInto("conversations")
      .values({
        workspace_id: target.workspaceId,
        assistant_id: target.assistantId,
        target_kind: "version",
        assistant_version_id: target.versionId,
        title: target.title,
      })
      .returning(conversationColumns)
      .executeTakeFirstOrThrow();
    return toSummary(row);
  }

  async deleteConversation(conversationId: string): Promise<boolean> {
    const result = await this.db
      .deleteFrom("conversations")
      .where("id", "=", conversationId)
      .where("workspace_id", "=", this.workspaceId())
      .executeTakeFirst();
    return Number(result.numDeletedRows) > 0;
  }

  async listMessages(conversationId: string, limit: number, afterSequence?: number): Promise<StoredMessage[]> {
    let query = this.db
      .selectFrom("messages")
      .select(messageColumns)
      .where("conversation_id", "=", conversationId)
      .orderBy("sequence")
      .limit(limit);
    if (afterSequence !== undefined) query = query.where("sequence", ">", afterSequence);
    return (await query.execute()).map(toMessage);
  }

  async appendMessage(message: {
    workspaceId: string;
    conversationId: string;
    role: Message["role"];
    content: string;
    runId?: string;
  }): Promise<StoredMessage> {
    const { last } = await this.db
      .selectFrom("messages")
      .select((eb) => eb.fn.max("sequence").as("last"))
      .where("conversation_id", "=", message.conversationId)
      .executeTakeFirstOrThrow();
    const row = await this.db
      .insertInto("messages")
      .values({
        workspace_id: message.workspaceId,
        conversation_id: message.conversationId,
        sequence: (last ?? 0) + 1,
        role: message.role,
        content: message.content,
        run_id: message.runId ?? null,
      })
      .returning(messageColumns)
      .executeTakeFirstOrThrow();
    return toMessage(row);
  }

  async hasActiveRun(conversationId: string): Promise<boolean> {
    const run = await this.db
      .selectFrom("runs")
      .select("id")
      .where("conversation_id", "=", conversationId)
      .where("status", "in", ["accepted", "running"])
      .executeTakeFirst();
    return Boolean(run);
  }

  async insertRun(run: { workspaceId: string; conversationId: string; triggerMessageId: string }): Promise<string> {
    const row = await this.db
      .insertInto("runs")
      .values({
        workspace_id: run.workspaceId,
        conversation_id: run.conversationId,
        trigger_message_id: run.triggerMessageId,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async findRun(runId: string, lock = false): Promise<{ conversationId: string; status: RunStatus } | undefined> {
    let query = this.db.selectFrom("runs").select(["conversation_id", "status"]).where("id", "=", runId);
    if (lock) query = query.forUpdate();
    const row = await query.executeTakeFirst();
    return row && { conversationId: row.conversation_id, status: row.status };
  }

  async updateRun(runId: string, from: RunStatus[], changes: RunChanges): Promise<boolean> {
    const result = await this.db
      .updateTable("runs")
      .set({
        status: changes.status,
        started_at: changes.startedAt,
        finished_at: changes.finishedAt,
        provider: changes.provider,
        model: changes.model,
        usage: changes.usage,
        error_code: changes.errorCode,
        error_message: changes.errorMessage,
        prompt_trace: changes.promptTrace === undefined ? undefined : { ...changes.promptTrace },
      })
      .where("id", "=", runId)
      .where("status", "in", from)
      .executeTakeFirst();
    return Number(result.numUpdatedRows) > 0;
  }

  async findResponse(runId: string): Promise<StoredMessage | undefined> {
    const row = await this.db
      .selectFrom("messages")
      .select(messageColumns)
      .where("run_id", "=", runId)
      .executeTakeFirst();
    return row && toMessage(row);
  }

  async findRunContext(runId: string): Promise<RunContext | undefined> {
    const run = await this.db
      .selectFrom("runs as r")
      .innerJoin("conversations as c", "c.id", "r.conversation_id")
      .innerJoin("messages as m", "m.id", "r.trigger_message_id")
      .leftJoin("assistant_versions as v", "v.id", "c.assistant_version_id")
      .select([
        "r.status",
        "r.conversation_id",
        "m.sequence",
        "c.target_kind",
        "c.assistant_version_id",
        "c.draft_snapshot",
        "v.instructions",
      ])
      .where("r.id", "=", runId)
      .where("c.workspace_id", "=", this.workspaceId())
      .executeTakeFirst();
    if (!run) return undefined;
    const history = await this.db
      .selectFrom("messages")
      .select(["id", "role", "content"])
      .where("conversation_id", "=", run.conversation_id)
      .where("sequence", "<=", run.sequence)
      .orderBy("sequence")
      .execute();
    if (run.target_kind === "version") {
      const version = VersionTarget.parse(run);
      return {
        status: run.status,
        target: {
          kind: "version",
          assistantVersionId: version.assistant_version_id,
          instructions: version.instructions,
        },
        history,
      };
    }
    const { draft_snapshot: snapshot } = DraftSnapshotTarget.parse(run);
    return {
      status: run.status,
      target: { kind: "draft_snapshot", draftRevision: snapshot.revision, instructions: snapshot.instructions },
      history,
    };
  }
}

export function createUnitOfWork(db: Database): UnitOfWork {
  return (work) => db.transaction().execute((trx) => work(new ConversationRepository(trx)));
}
