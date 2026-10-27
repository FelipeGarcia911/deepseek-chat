import { sql } from "kysely";
import type { Database } from "../db/database";
import { pendingMigrations } from "../db/migrator";

export type Readiness = { ready: true } | { ready: false; reason: string };

class HealthService {
  constructor(private readonly db: Database) {}

  async checkReadiness(): Promise<Readiness> {
    let pending: string[];
    try {
      await sql`select 1`.execute(this.db);
      pending = await pendingMigrations(this.db);
    } catch {
      return { ready: false, reason: "The database is unreachable or its migration state cannot be read." };
    }
    return pending.length
      ? { ready: false, reason: `The database has ${pending.length} pending migration(s).` }
      : { ready: true };
  }
}

export default HealthService;
