import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    alter table runs
      add column prompt_trace jsonb check (jsonb_typeof(prompt_trace) = 'object'),
      add constraint runs_started_requires_prompt_trace check (prompt_trace is not null or status not in ('running', 'succeeded'))
  `.execute(db);
}
