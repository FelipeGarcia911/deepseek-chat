import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table workspaces (
      id uuid primary key default uuidv7(),
      slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
      name text not null check (length(name) between 1 and 120),
      created_at timestamptz not null default now()
    )
  `.execute(db);
  await sql`
    create table environments (
      id uuid primary key default uuidv7(),
      workspace_id uuid not null references workspaces (id),
      key text not null check (key in ('development', 'staging', 'production')),
      created_at timestamptz not null default now(),
      unique (workspace_id, key)
    )
  `.execute(db);
}
