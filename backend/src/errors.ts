import type { ErrorCode } from "@chat-app/shared";

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}
