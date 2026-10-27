import type { ErrorCode, ProblemDetails } from "@chat-app/shared";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details: { cause?: unknown; errors?: ProblemDetails["errors"] } = {}
  ) {
    super(message);
    this.name = "AppError";
  }
}
