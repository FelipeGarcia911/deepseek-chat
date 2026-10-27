import { AppError } from "./errors";

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export const encodeCursor = (value: string) => Buffer.from(value).toString("base64url");

export function decodeCursor(cursor: string, pattern: RegExp): string {
  const value = Buffer.from(cursor, "base64url").toString();
  if (!pattern.test(value)) throw new AppError("VALIDATION_FAILED", "The cursor is invalid.");
  return value;
}

export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => string): Page<T> {
  const items = rows.slice(0, limit);
  const last = items[items.length - 1];
  return { items, nextCursor: rows.length > limit ? encodeCursor(cursorOf(last)) : null };
}
