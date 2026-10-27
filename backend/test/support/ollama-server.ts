import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingHttpHeaders, type ServerResponse } from "node:http";
import { z } from "zod";

export const OllamaRequest = z.object({
  model: z.string(),
  messages: z.array(z.object({ role: z.string(), content: z.string() })),
  stream: z.boolean(),
  options: z
    .object({ temperature: z.number().optional(), top_p: z.number().optional(), num_predict: z.number().optional() })
    .optional(),
});
export type OllamaRequest = z.infer<typeof OllamaRequest>;

export type OllamaHandler = (request: OllamaRequest, response: ServerResponse) => void;

export async function startOllamaServer(handler: OllamaHandler) {
  const received: { path: string | undefined; body: OllamaRequest; headers: IncomingHttpHeaders }[] = [];
  const server = createServer(async (req, res) => {
    let text = "";
    for await (const chunk of req) text += chunk;
    const body = OllamaRequest.parse(JSON.parse(text));
    received.push({ path: req.url, body, headers: req.headers });
    handler(body, res);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return {
    baseUrl: `http://127.0.0.1:${address.port}/api`,
    received,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export const realisticOllama: OllamaHandler = (request, response) => {
  if (request.model === "missing") {
    response.writeHead(404, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ error: `model '${request.model}' not found` }));
    return;
  }
  const lastUser = request.messages.filter((message) => message.role === "user").at(-1);
  const words = `Echo: ${lastUser?.content ?? ""}`.split(" ");
  const limit = request.options?.num_predict ?? words.length;
  const kept = words.slice(0, limit);
  const final = {
    model: `${request.model}:latest`,
    done: true,
    done_reason: kept.length < words.length ? "length" : "stop",
    prompt_eval_count: request.messages.length * 3,
    eval_count: kept.length,
  };
  if (!request.stream) {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ ...final, message: { role: "assistant", content: kept.join(" ") } }));
    return;
  }
  response.writeHead(200, { "Content-Type": "application/x-ndjson" });
  for (const [index, word] of kept.entries()) {
    const content = index === 0 ? word : ` ${word}`;
    response.write(`${JSON.stringify({ model: final.model, message: { role: "assistant", content }, done: false })}\n`);
  }
  response.end(`${JSON.stringify({ ...final, message: { role: "assistant", content: "" } })}\n`);
};
