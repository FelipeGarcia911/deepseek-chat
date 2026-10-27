import { z } from "zod";
import {
  GenerationParameters,
  ModelError,
  ModelSelection,
  type ChatCapabilities,
  type ChatModel,
  type ChatRequest,
  type ChatResult,
  type ChatStreamEvent,
  type ModelErrorKind,
} from "../../gateway";

export const OllamaConnection = z.strictObject({
  baseUrl: z.url({ protocol: /^https?$/ }).refine((value) => {
    const url = new URL(value);
    return !url.username && !url.password && !url.search && !url.hash;
  }, "Must not contain credentials, query or fragment."),
  apiKey: z.string().min(1).optional(),
  timeoutMs: z.number().int().min(1).max(600_000).default(60_000),
});
export type OllamaConnection = z.input<typeof OllamaConnection>;

const OllamaChunk = z.object({
  model: z.string().min(1),
  message: z.object({ content: z.string() }).optional(),
  done: z.boolean(),
  done_reason: z.string().optional(),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
});
type OllamaChunk = z.infer<typeof OllamaChunk>;

const OllamaError = z.object({ error: z.string() });

function parse<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields = result.error.issues.map((issue) => issue.path.join(".") || "(root)").join(", ");
  throw new ModelError("invalid_request", `Invalid ${label}: ${fields}.`);
}

function kindForStatus(status: number): ModelErrorKind {
  if (status === 400) return "invalid_request";
  if (status === 401 || status === 403) return "authentication";
  if (status === 404) return "model_not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "invalid_response";
}

function readJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ModelError("invalid_response", "Ollama returned malformed JSON.", error);
  }
}

function parseChunk(line: string): OllamaChunk {
  const value = readJson(line);
  const failure = OllamaError.safeParse(value);
  if (failure.success) throw new ModelError("unavailable", `Ollama failed while generating: ${failure.data.error}`);
  const chunk = OllamaChunk.safeParse(value);
  if (!chunk.success) throw new ModelError("invalid_response", "Ollama returned an unexpected payload.", chunk.error);
  return chunk.data;
}

async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    buffer += decoder.decode(read.value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield line;
      newline = buffer.indexOf("\n");
    }
  }
  const rest = (buffer + decoder.decode()).trim();
  if (rest) yield rest;
}

export class OllamaChatModel implements ChatModel {
  readonly provider = "ollama";
  readonly capabilities: ChatCapabilities = {
    streaming: true,
    toolCalling: false,
    structuredOutput: false,
    vision: false,
    usageReporting: true,
  };
  readonly model: string;
  private readonly selection: ModelSelection;
  private readonly connection: z.output<typeof OllamaConnection>;

  constructor(
    selection: z.input<typeof ModelSelection>,
    connection: OllamaConnection,
    private readonly fetchImpl: typeof fetch = fetch
  ) {
    this.selection = parse(ModelSelection, selection, "model selection");
    this.connection = parse(OllamaConnection, connection, "Ollama connection");
    this.model = this.selection.model;
  }

  private requestBody(request: ChatRequest, stream: boolean): string {
    const overrides = parse(GenerationParameters, request.parameters ?? {}, "generation parameters");
    const parameters = { ...this.selection.defaultParameters, ...overrides };
    return JSON.stringify({
      model: this.model,
      messages: request.messages.map(({ role, content }) => ({ role, content })),
      stream,
      options: { temperature: parameters.temperature, top_p: parameters.topP, num_predict: parameters.maxOutputTokens },
    });
  }

  private async *exchange(request: ChatRequest, stream: boolean): AsyncGenerator<OllamaChunk> {
    const timeout = AbortSignal.timeout(this.connection.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
    try {
      const response = await this.fetchImpl(`${this.connection.baseUrl.replace(/\/+$/, "")}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.connection.apiKey ? { Authorization: `Bearer ${this.connection.apiKey}` } : {}),
        },
        body: this.requestBody(request, stream),
        signal,
      });
      if (!response.ok) {
        const failure = OllamaError.safeParse(readJson((await response.text()) || "{}"));
        const detail = failure.success ? `: ${failure.data.error.slice(0, 500)}` : "";
        throw new ModelError(kindForStatus(response.status), `Ollama answered ${response.status}${detail}`);
      }
      if (!response.body) throw new ModelError("invalid_response", "Ollama returned an empty body.");
      for await (const line of lines(response.body)) yield parseChunk(line);
    } catch (error) {
      if (request.signal?.aborted) throw new ModelError("cancelled", "The request was cancelled.", error);
      if (timeout.aborted) {
        throw new ModelError("timeout", `Ollama did not finish within ${this.connection.timeoutMs} ms.`, error);
      }
      if (error instanceof ModelError) throw error;
      throw new ModelError("unavailable", "Ollama is unreachable.", error);
    }
  }

  private toResult(content: string, final: OllamaChunk): ChatResult {
    return {
      model: { provider: this.provider, model: final.model },
      content,
      finishReason: final.done_reason === "length" ? "length" : "stop",
      usage: { inputTokens: final.prompt_eval_count, outputTokens: final.eval_count },
    };
  }

  async generate(request: ChatRequest): Promise<ChatResult> {
    let content = "";
    for await (const chunk of this.exchange(request, false)) {
      content += chunk.message?.content ?? "";
      if (chunk.done) return this.toResult(content, chunk);
    }
    throw new ModelError("invalid_response", "Ollama ended the response without a final chunk.");
  }

  async *stream(request: ChatRequest): AsyncIterable<ChatStreamEvent> {
    let content = "";
    for await (const chunk of this.exchange(request, true)) {
      const text = chunk.message?.content ?? "";
      if (text) {
        content += text;
        yield { type: "delta", text };
      }
      if (chunk.done) {
        yield { type: "done", result: this.toResult(content, chunk) };
        return;
      }
    }
    throw new ModelError("invalid_response", "Ollama ended the stream without a final chunk.");
  }
}
