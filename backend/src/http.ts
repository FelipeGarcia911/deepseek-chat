import { randomUUID } from "node:crypto";
import { errorCatalog, problemContentType, type ErrorCode, type ProblemDetails } from "@chat-app/shared";
import type { ErrorRequestHandler, Request, RequestHandler, Response } from "express";
import { isDatabaseUnavailable } from "./db/database";
import { AppError } from "./errors";

interface Schema {
  safeParse(
    input: unknown
  ):
    | { success: true; data: unknown }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
}

export const assignRequestId: RequestHandler = (_req, res, next) => {
  res.locals.requestId = randomUUID();
  res.set("X-Request-Id", res.locals.requestId);
  next();
};

export function sendProblem(res: Response, code: ErrorCode, detail: string, errors?: ProblemDetails["errors"]): void {
  const { status, title } = errorCatalog[code];
  const problem: ProblemDetails = { type: "about:blank", title, status, code, detail, requestId: res.locals.requestId };
  if (errors) problem.errors = errors;
  res.status(status).type(problemContentType).json(problem);
}

export function validate(schemas: { params?: Schema; query?: Schema; body?: Schema }): RequestHandler {
  return (req, res, next) => {
    const errors: NonNullable<ProblemDetails["errors"]> = [];
    for (const part of ["params", "query", "body"] as const) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part]);
      if (result.success) req[part] = result.data as never;
      else
        for (const issue of result.error.issues)
          errors.push({ path: [part, ...issue.path].join("."), message: issue.message });
    }
    if (errors.length) sendProblem(res, "VALIDATION_FAILED", "The request contains invalid fields.", errors);
    else next();
  };
}

export function handle(handler: (req: Request, res: Response) => Promise<void>): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

export const notFound: RequestHandler = (_req, res) => {
  sendProblem(res, "NOT_FOUND", "No route matches this request.");
};

function isClientBodyError(error: unknown): error is { status: number; type: string } {
  const candidate = error as { status?: unknown; type?: unknown; expose?: unknown } | null;
  return (
    typeof candidate?.status === "number" &&
    candidate.status < 500 &&
    candidate.expose === true &&
    typeof candidate.type === "string"
  );
}

export const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof AppError) {
    if (errorCatalog[error.code].status >= 500) console.error(`Request ${res.locals.requestId} failed:`, error);
    sendProblem(res, error.code, error.message);
    return;
  }
  if (isClientBodyError(error)) {
    if (error.type === "entity.too.large") sendProblem(res, "PAYLOAD_TOO_LARGE", "The request body is too large.");
    else sendProblem(res, "VALIDATION_FAILED", "The request body could not be parsed.");
    return;
  }
  console.error(`Request ${res.locals.requestId} failed:`, error);
  if (isDatabaseUnavailable(error)) sendProblem(res, "DEPENDENCY_UNAVAILABLE", "The database is unavailable.");
  else sendProblem(res, "INTERNAL_ERROR", "An unexpected error occurred.");
};
