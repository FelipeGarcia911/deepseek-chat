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
