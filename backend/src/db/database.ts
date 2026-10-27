import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { DB } from "./schema";

export type Database = Kysely<DB>;

export function createDatabase(databaseUrl: string): Database {
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 2_000, allowExitOnIdle: true });
  pool.on("error", (error) => {
    console.warn(`Idle database connection closed: ${error.message}`);
  });
  return new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
}

const unavailableCodes = new Set(["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "57P01", "57P03", "53300"]);

export function isDatabaseUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && typeof error.code === "string") {
    if (unavailableCodes.has(error.code) || error.code.startsWith("08")) return true;
  }
  return error instanceof Error && /timeout exceeded when trying to connect|Connection terminated/.test(error.message);
}
