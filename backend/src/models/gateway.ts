export interface ChatCapabilities {
  streaming: boolean;
  toolCalling: boolean;
  structuredOutput: boolean;
  vision: boolean;
  usageReporting: boolean;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GenerationParameters {
  temperature?: number;
  topP?: number;
  maxOutputTokens?: number;
}

export interface ChatRequest {
  messages: ChatMessage[];
  parameters?: GenerationParameters;
  signal?: AbortSignal;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ModelIdentity {
  provider: string;
  model: string;
}

export interface ChatResult {
  model: ModelIdentity;
  content: string;
  finishReason: "stop" | "length";
  usage?: Usage;
}

export type ChatStreamEvent = { type: "delta"; text: string } | { type: "done"; result: ChatResult };

export interface ChatModel {
  readonly provider: string;
  readonly model: string;
  readonly capabilities: ChatCapabilities;
  generate(request: ChatRequest): Promise<ChatResult>;
  stream(request: ChatRequest): AsyncIterable<ChatStreamEvent>;
}

export interface EmbeddingRequest {
  inputs: string[];
  signal?: AbortSignal;
}

export interface EmbeddingResult {
  model: ModelIdentity;
  vectors: number[][];
  usage?: Usage;
}

export interface EmbeddingModel {
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  embed(request: EmbeddingRequest): Promise<EmbeddingResult>;
}

export type ModelErrorKind =
  | "unavailable"
  | "timeout"
  | "rate_limited"
  | "authentication"
  | "invalid_request"
  | "model_not_found"
  | "invalid_response"
  | "unsupported_capability"
  | "cancelled";

const retryableKinds: ReadonlySet<ModelErrorKind> = new Set(["unavailable", "timeout", "rate_limited"]);

export class ModelError extends Error {
  constructor(
    readonly kind: ModelErrorKind,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "ModelError";
  }

  get retryable(): boolean {
    return retryableKinds.has(this.kind);
  }
}

export function requireCapability(model: ChatModel, capability: keyof ChatCapabilities): void {
  if (!model.capabilities[capability]) {
    throw new ModelError("unsupported_capability", `${model.provider}/${model.model} does not support ${capability}.`);
  }
}
