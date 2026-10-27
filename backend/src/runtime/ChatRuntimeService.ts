import type { Message, MessageStreamEvent } from "@chat-app/shared";
import { AppError } from "../errors";
import { ModelError, type ChatMessage, type ChatModel, type ChatResult } from "../models/gateway";
import type ConversationService from "../services/ConversationService";
import type { RunCompletion } from "../services/ConversationService";

export interface RunModelResolver {
  resolve(conversationId: string): Promise<ChatModel>;
}

export const unconfiguredModelResolver: RunModelResolver = {
  async resolve() {
    throw new AppError("MODEL_NOT_CONFIGURED", "No Model Profile has been configured.");
  },
};

export interface ChatRuntimeDependencies {
  conversations: Pick<
    ConversationService,
    "requireOpenConversation" | "acceptUserMessage" | "buildRunPrompt" | "startRun" | "completeRun" | "finishRun"
  >;
  models: RunModelResolver;
}

function completionFor(error: unknown, signal: AbortSignal): RunCompletion {
  if (signal.aborted || (error instanceof ModelError && error.kind === "cancelled")) return { outcome: "cancelled" };
  const modelError =
    error instanceof ModelError ? error : new ModelError("invalid_response", "The run failed unexpectedly.", error);
  const runError = { code: modelError.kind, message: modelError.message };
  return modelError.kind === "timeout"
    ? { outcome: "expired", error: runError }
    : { outcome: "failed", error: runError };
}

function failedEvent(completion: RunCompletion): MessageStreamEvent {
  if (completion.outcome === "cancelled") {
    return { type: "failed", runStatus: "cancelled", code: "cancelled", detail: "The generation was cancelled." };
  }
  return {
    type: "failed",
    runStatus: completion.outcome,
    code: completion.error.code,
    detail: completion.error.message,
  };
}

class ChatRuntimeService {
  constructor(private readonly dependencies: ChatRuntimeDependencies) {}

  async sendMessage(
    conversationId: string,
    content: string,
    signal: AbortSignal
  ): Promise<AsyncGenerator<MessageStreamEvent>> {
    const { conversations, models } = this.dependencies;
    await conversations.requireOpenConversation(conversationId);
    const model = await models.resolve(conversationId);
    if (!model.capabilities.streaming) {
      throw new AppError("MODEL_NOT_CONFIGURED", `${model.provider}/${model.model} cannot stream responses.`);
    }
    const { message, runId } = await conversations.acceptUserMessage(conversationId, content);
    return this.execute(model, runId, message, signal);
  }

  private async *execute(
    model: ChatModel,
    runId: string,
    message: Message,
    signal: AbortSignal
  ): AsyncGenerator<MessageStreamEvent> {
    yield { type: "accepted", runId, message };
    try {
      const messages = await this.startRun(model, runId);
      for await (const event of model.stream({ messages, signal })) {
        if (event.type === "delta") {
          yield event;
        } else {
          yield { type: "completed", message: await this.completeRun(runId, event.result) };
          return;
        }
      }
      throw new ModelError("invalid_response", "The model stream ended without a result.");
    } catch (error) {
      yield await this.failRun(runId, error, signal);
    }
  }

  private async startRun(model: ChatModel, runId: string): Promise<ChatMessage[]> {
    const prompt = await this.dependencies.conversations.buildRunPrompt(runId);
    await this.dependencies.conversations.startRun(runId, {
      provider: model.provider,
      model: model.model,
      promptTrace: prompt.trace,
    });
    return prompt.messages;
  }

  private async completeRun(runId: string, result: ChatResult): Promise<Message> {
    if (!result.content.trim()) throw new ModelError("invalid_response", "The model returned no content.");
    return this.dependencies.conversations.completeRun(runId, { content: result.content, usage: result.usage });
  }

  private async failRun(runId: string, error: unknown, signal: AbortSignal): Promise<MessageStreamEvent> {
    const completion = completionFor(error, signal);
    await this.dependencies.conversations.finishRun(runId, completion);
    return failedEvent(completion);
  }
}

export default ChatRuntimeService;
