import { randomUUID } from "node:crypto";
import { errorCatalog, problemContentType, type ErrorCode, type ProblemDetails } from "@chat-app/shared";
import type { ErrorRequestHandler, Request, RequestHandler, Response } from "express";
import { isDatabaseUnavailable } from "./db/database";
import { AppError } from "./errors";

interface Schema<T> {
  safeParse(
    input: unknown
  ): { success: true; data: T } | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } };
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

export function parse<T>(schema: Schema<T>, input: unknown, part: "params" | "query" | "body"): T {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const errors = result.error.issues.map((issue) => ({
    path: [part, ...issue.path].join("."),
    message: issue.message,
  }));
  throw new AppError("VALIDATION_FAILED", "The request contains invalid fields.", { errors });
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
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "type" in error &&
    "expose" in error &&
    typeof error.status === "number" &&
    error.status < 500 &&
    error.expose === true &&
    typeof error.type === "string"
  );
}

export const handleError: ErrorRequestHandler = (error: unknown, _req, res, _next) => {
  if (error instanceof AppError) {
    if (errorCatalog[error.code].status >= 500) console.error(`Request ${res.locals.requestId} failed:`, error);
    sendProblem(res, error.code, error.message, error.details.errors);
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
