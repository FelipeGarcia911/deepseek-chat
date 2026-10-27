import { sql } from "kysely";
import type { Database } from "../db/database";
import { pendingMigrations } from "../db/migrator";

export type Readiness = { ready: true } | { ready: false; reason: string };

class HealthService {
  constructor(private readonly db: Database) {}

  async checkReadiness(): Promise<Readiness> {
    try {
      await sql`select 1`.execute(this.db);
    } catch {
      return { ready: false, reason: "The database is unreachable." };
    }
    const pending = await pendingMigrations(this.db);
    return pending.length
      ? { ready: false, reason: `The database has ${pending.length} pending migration(s).` }
      : { ready: true };
  }
}

export default HealthService;
