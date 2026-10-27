import { ProblemDetails } from "@chat-app/shared";
import { ApiError } from "./ApiError";

interface Schema<T> {
  parse(value: unknown): T;
}

function parseEvent<T>(block: string, schema: Schema<T>): T {
  const data = block
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice("data: ".length))
    .join("\n");
  return schema.parse(JSON.parse(data));
}

async function failure(response: Response): Promise<Error> {
  const body: unknown = await response.json().catch(() => undefined);
  const problem = ProblemDetails.safeParse(body);
  return problem.success ? new ApiError(problem.data) : new Error(`Request failed with status ${response.status}.`);
}

export async function* readEventStream<T>(response: Response, schema: Schema<T>): AsyncGenerator<T> {
  if (!response.ok) throw await failure(response);
  if (!response.body) throw new Error("The event stream has no body.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (let read = await reader.read(); !read.done; read = await reader.read()) {
    buffer += decoder.decode(read.value, { stream: true });
    let end = buffer.indexOf("\n\n");
    while (end >= 0) {
      yield parseEvent(buffer.slice(0, end), schema);
      buffer = buffer.slice(end + 2);
      end = buffer.indexOf("\n\n");
    }
  }
}
