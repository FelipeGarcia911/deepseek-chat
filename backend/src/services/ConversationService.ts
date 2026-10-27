import type { ConversationSummary, Message, PageQuery } from "@chat-app/shared";
import { AppError } from "../errors";
import { decodeCursor, toPage, type Page } from "../pagination";

export type RunStatus = "accepted" | "running" | "succeeded" | "failed" | "cancelled" | "expired";
export type StoredMessage = Message & { sequence: number };
export type LockedConversation = ConversationSummary & { workspaceId: string };

export interface AssistantTarget {
  assistantId: string;
  workspaceId: string;
  status: "active" | "archived";
  versionId: string | null;
}

export interface RunChanges {
  status: RunStatus;
  startedAt?: Date;
  finishedAt?: Date;
  provider?: string;
  model?: string;
  usage?: Record<string, number> | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export interface ConversationStore {
  listConversations(limit: number, beforeId?: string): Promise<ConversationSummary[]>;
  findConversation(conversationId: string): Promise<ConversationSummary | undefined>;
  lockConversation(conversationId: string): Promise<LockedConversation | undefined>;
  findAssistantTarget(assistantSlug: string): Promise<AssistantTarget | undefined>;
  insertConversation(target: {
    workspaceId: string;
    assistantId: string;
    versionId: string;
    title: string;
  }): Promise<ConversationSummary>;
  deleteConversation(conversationId: string): Promise<boolean>;
  listMessages(conversationId: string, limit: number, afterSequence?: number): Promise<StoredMessage[]>;
  appendMessage(message: {
    workspaceId: string;
    conversationId: string;
    role: Message["role"];
    content: string;
    runId?: string;
  }): Promise<StoredMessage>;
  hasActiveRun(conversationId: string): Promise<boolean>;
  insertRun(run: { workspaceId: string; conversationId: string; triggerMessageId: string }): Promise<string>;
  findRun(runId: string, lock?: boolean): Promise<{ conversationId: string; status: RunStatus } | undefined>;
  updateRun(runId: string, from: RunStatus[], changes: RunChanges): Promise<boolean>;
  findResponse(runId: string): Promise<StoredMessage | undefined>;
}

export type UnitOfWork = <T>(work: (store: ConversationStore) => Promise<T>) => Promise<T>;

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const sequencePattern = /^[1-9]\d{0,9}$/;

export interface RunError {
  code: string;
  message: string;
}

export type RunCompletion = { outcome: "failed" | "expired"; error: RunError } | { outcome: "cancelled" };

const conversationNotFound = () => new AppError("NOT_FOUND", "Conversation not found.");
const toMessage = ({ sequence: _sequence, ...message }: StoredMessage): Message => message;

function requireOpen<T extends { status: ConversationSummary["status"] }>(conversation: T | undefined): T {
  if (!conversation) throw conversationNotFound();
  if (conversation.status !== "open") throw new AppError("INVALID_STATE", "The conversation is closed.");
  return conversation;
}

export interface ConversationServiceDependencies {
  store: ConversationStore;
  transaction: UnitOfWork;
}

class ConversationService {
  constructor(private readonly dependencies: ConversationServiceDependencies) {}

  private get store() {
    return this.dependencies.store;
  }

  async listConversations({ limit, cursor }: PageQuery): Promise<Page<ConversationSummary>> {
    const beforeId = cursor === undefined ? undefined : decodeCursor(cursor, uuidPattern);
    return toPage(await this.store.listConversations(limit + 1, beforeId), limit, (row) => row.id);
  }

  async createConversation(assistantSlug: string, title: string): Promise<ConversationSummary> {
    return this.dependencies.transaction(async (store) => {
      const target = await store.findAssistantTarget(assistantSlug);
      if (!target) throw new AppError("NOT_FOUND", "Assistant not found.");
      if (target.status !== "active") throw new AppError("INVALID_STATE", "The assistant is archived.");
      if (!target.versionId) throw new AppError("INVALID_STATE", "The assistant has no production deployment.");
      return store.insertConversation({
        workspaceId: target.workspaceId,
        assistantId: target.assistantId,
        versionId: target.versionId,
        title,
      });
    });
  }

  async listMessages(conversationId: string, { limit, cursor }: PageQuery): Promise<Page<Message>> {
    if (!(await this.store.findConversation(conversationId))) throw conversationNotFound();
    const afterSequence = cursor === undefined ? undefined : Number(decodeCursor(cursor, sequencePattern));
    const rows = await this.store.listMessages(conversationId, limit + 1, afterSequence);
    const page = toPage(rows, limit, (row) => String(row.sequence));
    return { items: page.items.map(toMessage), nextCursor: page.nextCursor };
  }

  async deleteConversation(conversationId: string): Promise<void> {
    if (!(await this.store.deleteConversation(conversationId))) throw conversationNotFound();
  }

  async sendMessage(conversationId: string, _content: string): Promise<Message> {
    requireOpen(await this.store.findConversation(conversationId));
    throw new AppError("MODEL_NOT_CONFIGURED", "No Model Profile has been configured.");
  }

  async acceptUserMessage(conversationId: string, content: string): Promise<{ message: Message; runId: string }> {
    return this.dependencies.transaction(async (store) => {
      const conversation = requireOpen(await store.lockConversation(conversationId));
      if (await store.hasActiveRun(conversationId)) {
        throw new AppError("RUN_IN_PROGRESS", "The conversation already has a run in progress.");
      }
      const message = await store.appendMessage({
        workspaceId: conversation.workspaceId,
        conversationId,
        role: "user",
        content,
      });
      const runId = await store.insertRun({
        workspaceId: conversation.workspaceId,
        conversationId,
        triggerMessageId: message.id,
      });
      return { message: toMessage(message), runId };
    });
  }

  async startRun(runId: string, model: { provider: string; model: string }): Promise<void> {
    const started = await this.store.updateRun(runId, ["accepted"], {
      status: "running",
      startedAt: new Date(),
      provider: model.provider,
      model: model.model,
    });
    if (!started) throw new AppError("INVALID_STATE", "The run is not waiting to start.");
  }

  async completeRun(runId: string, result: { content: string; usage?: Record<string, number> }): Promise<Message> {
    return this.dependencies.transaction(async (store) => {
      const owner = await store.findRun(runId);
      const conversation = owner && (await store.lockConversation(owner.conversationId));
      const run = conversation && (await store.findRun(runId, true));
      if (!conversation || !run) throw new AppError("NOT_FOUND", "Run not found.");
      if (run.status === "succeeded") {
        const response = await store.findResponse(runId);
        if (response) return toMessage(response);
      }
      if (run.status !== "running") throw new AppError("INVALID_STATE", `The run is ${run.status}.`);
      await store.updateRun(runId, ["running"], {
        status: "succeeded",
        finishedAt: new Date(),
        usage: result.usage ?? null,
      });
      const message = await store.appendMessage({
        workspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        role: "assistant",
        content: result.content,
        runId,
      });
      return toMessage(message);
    });
  }

  async finishRun(runId: string, completion: RunCompletion): Promise<void> {
    const error = completion.outcome === "cancelled" ? undefined : completion.error;
    const finished = await this.store.updateRun(runId, ["accepted", "running"], {
      status: completion.outcome,
      finishedAt: new Date(),
      errorCode: error?.code ?? null,
      errorMessage: error?.message ?? null,
    });
    if (!finished) throw new AppError("INVALID_STATE", "The run has already finished.");
  }
}

export default ConversationService;
