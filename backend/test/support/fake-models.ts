import {
  ModelError,
  requireCapability,
  type ChatCapabilities,
  type ChatModel,
  type ChatRequest,
  type ChatResult,
  type ChatStreamEvent,
  type EmbeddingModel,
  type EmbeddingRequest,
  type EmbeddingResult,
} from "../../src/models/gateway";

const allCapabilities: ChatCapabilities = {
  streaming: true,
  toolCalling: false,
  structuredOutput: false,
  vision: false,
  usageReporting: true,
};

const words = (text: string) => text.split(/\s+/).filter(Boolean);

function throwIfAborted(signal: AbortSignal | undefined) {
  if (signal?.aborted) throw new ModelError("cancelled", "The request was cancelled.", signal.reason);
}

export class FakeChatModel implements ChatModel {
  readonly provider = "fake";
  readonly model = "fake-chat";
  readonly capabilities: ChatCapabilities;
  readonly requests: ChatRequest[] = [];

  constructor(
    private readonly options: {
      capabilities?: Partial<ChatCapabilities>;
      reply?: (request: ChatRequest) => string | ModelError;
      failStream?: { afterDeltas: number; error: ModelError };
      holdAfterDeltas?: number;
    } = {}
  ) {
    this.capabilities = { ...allCapabilities, ...options.capabilities };
  }

  private respond(request: ChatRequest): ChatResult {
    this.requests.push(request);
    throwIfAborted(request.signal);
    const lastUser = request.messages.filter((message) => message.role === "user").at(-1);
    const reply = this.options.reply?.(request) ?? `Echo: ${lastUser?.content ?? ""}`;
    if (reply instanceof ModelError) throw reply;
    const limit = request.parameters?.maxOutputTokens;
    const tokens = words(reply);
    const kept = limit === undefined ? tokens : tokens.slice(0, limit);
    const usage = this.capabilities.usageReporting
      ? {
          inputTokens: request.messages.reduce((sum, message) => sum + words(message.content).length, 0),
          outputTokens: kept.length,
        }
      : undefined;
    return {
      model: { provider: this.provider, model: this.model },
      content: kept.join(" "),
      finishReason: kept.length < tokens.length ? "length" : "stop",
      usage,
    };
  }

  async generate(request: ChatRequest): Promise<ChatResult> {
    return this.respond(request);
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    requireCapability(this, "streaming");
    const result = this.respond(request);
    const failure = this.options.failStream;
    for (const [index, word] of words(result.content).entries()) {
      if (index === this.options.holdAfterDeltas && !request.signal?.aborted) {
        await new Promise((resolve) => request.signal?.addEventListener("abort", resolve, { once: true }));
      }
      throwIfAborted(request.signal);
      if (failure && index === failure.afterDeltas) throw failure.error;
      yield { type: "delta", text: index === 0 ? word : ` ${word}` };
    }
    yield { type: "done", result };
  }
}

export class FakeEmbeddingModel implements EmbeddingModel {
  readonly provider = "fake";
  readonly model = "fake-embedding";

  constructor(readonly dimensions = 8) {}

  async embed({ inputs, signal }: EmbeddingRequest): Promise<EmbeddingResult> {
    throwIfAborted(signal);
    if (inputs.length === 0) throw new ModelError("invalid_request", "At least one input is required.");
    const vectors = inputs.map((input) =>
      Array.from({ length: this.dimensions }, (_, slot) => {
        let hash = slot + 1;
        for (const character of input) hash = (hash * 31 + character.charCodeAt(0)) % 9973;
        return hash / 9973;
      })
    );
    return {
      model: { provider: this.provider, model: this.model },
      vectors,
      usage: { inputTokens: inputs.reduce((sum, input) => sum + words(input).length, 0) },
    };
  }
}
