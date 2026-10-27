import dotenv from "dotenv";
import { sql } from "kysely";
import { isDatabaseUrl } from "../config";
import { createDatabase } from "./database";
import { migrateToLatest } from "./migrator";
import { seed } from "./seed";

const commands = ["migrate", "seed", "reset"];

export async function runDatabaseCommand(
  command: string | undefined,
  environment: Readonly<NodeJS.ProcessEnv>,
  log: (message: string) => void = console.log
): Promise<void> {
  if (!command || !commands.includes(command)) throw new Error(`Usage: db <${commands.join("|")}>`);
  const databaseUrl = environment.DATABASE_URL?.trim() ?? "";
  if (!isDatabaseUrl(databaseUrl)) {
    throw new Error("DATABASE_URL: must be a postgres:// or postgresql:// URL with a host and database name.");
  }
  if (command === "reset" && environment.NODE_ENV === "production") {
    throw new Error("db reset is disabled when NODE_ENV is production.");
  }

  const db = createDatabase(databaseUrl);
  try {
    if (command === "reset") {
      await sql`drop schema public cascade`.execute(db);
      await sql`create schema public`.execute(db);
      log("Dropped and recreated the public schema.");
    }
    if (command !== "seed") {
      const applied = await migrateToLatest(db);
      log(applied.length ? `Applied migrations: ${applied.join(", ")}.` : "Database schema is up to date.");
    }
    if (command !== "migrate") {
      await seed(db);
      log("Seed data is present.");
    }
  } finally {
    await db.destroy();
  }
}

export async function main(argv: readonly string[]): Promise<void> {
  dotenv.config();
  try {
    await runDatabaseCommand(argv[2], process.env);
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}

if (require.main === module) void main(process.argv);
