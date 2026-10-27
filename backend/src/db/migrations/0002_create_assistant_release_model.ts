import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`alter table environments add unique (workspace_id, id)`.execute(db);

  await sql`
    create function set_updated_at() returns trigger language plpgsql as $$
    begin
      new.updated_at = now();
      return new;
    end
    $$
  `.execute(db);

  await sql`
    create function reject_mutation() returns trigger language plpgsql as $$
    begin
      raise exception '% rows are immutable', tg_table_name using errcode = 'restrict_violation';
    end
    $$
  `.execute(db);

  await sql`
    create table assistants (
      id uuid primary key default uuidv7(),
      workspace_id uuid not null references workspaces (id),
      slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 63),
      name text not null check (length(name) between 1 and 120),
      status text not null default 'active' check (status in ('active', 'archived')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      unique (workspace_id, slug),
      unique (workspace_id, id)
    )
  `.execute(db);

  await sql`
    create table assistant_drafts (
      assistant_id uuid primary key,
      workspace_id uuid not null,
      revision integer not null default 1 check (revision > 0),
      instructions text not null default '' check (length(instructions) <= 20000),
      settings jsonb not null default '{}' check (jsonb_typeof(settings) = 'object'),
      updated_at timestamptz not null default now(),
      constraint assistant_drafts_assistant_fkey
        foreign key (workspace_id, assistant_id) references assistants (workspace_id, id)
    )
  `.execute(db);

  await sql`
    create table assistant_versions (
      id uuid primary key default uuidv7(),
      workspace_id uuid not null,
      assistant_id uuid not null,
      version_number integer not null check (version_number > 0),
      source_draft_revision integer not null check (source_draft_revision > 0),
      instructions text not null check (length(instructions) <= 20000),
      settings jsonb not null check (jsonb_typeof(settings) = 'object'),
      published_by text not null check (length(published_by) between 1 and 200),
      created_at timestamptz not null default now(),
      constraint assistant_versions_assistant_fkey
        foreign key (workspace_id, assistant_id) references assistants (workspace_id, id),
      unique (assistant_id, version_number),
      unique (workspace_id, assistant_id, id)
    )
  `.execute(db);

  await sql`
    create table deployments (
      id uuid primary key default uuidv7(),
      workspace_id uuid not null,
      assistant_id uuid not null,
      environment_id uuid not null,
      assistant_version_id uuid not null,
      previous_deployment_id uuid,
      deployed_by text not null check (length(deployed_by) between 1 and 200),
      created_at timestamptz not null default now(),
      constraint deployments_environment_fkey
        foreign key (workspace_id, environment_id) references environments (workspace_id, id),
      constraint deployments_version_fkey
        foreign key (workspace_id, assistant_id, assistant_version_id)
        references assistant_versions (workspace_id, assistant_id, id),
      unique (workspace_id, assistant_id, environment_id, id),
      constraint deployments_previous_fkey
        foreign key (workspace_id, assistant_id, environment_id, previous_deployment_id)
        references deployments (workspace_id, assistant_id, environment_id, id)
    )
  `.execute(db);

  await sql`
    create table active_deployments (
      assistant_id uuid not null,
      environment_id uuid not null,
      workspace_id uuid not null,
      deployment_id uuid not null,
      updated_at timestamptz not null default now(),
      primary key (assistant_id, environment_id),
      constraint active_deployments_deployment_fkey
        foreign key (workspace_id, assistant_id, environment_id, deployment_id)
        references deployments (workspace_id, assistant_id, environment_id, id)
    )
  `.execute(db);

  for (const table of ["assistants", "assistant_drafts", "active_deployments"]) {
    await sql`
      create trigger set_updated_at before update on ${sql.table(table)}
      for each row execute function set_updated_at()
    `.execute(db);
  }
  for (const table of ["assistant_versions", "deployments"]) {
    await sql`
      create trigger reject_mutation before update or delete on ${sql.table(table)}
      for each row execute function reject_mutation()
    `.execute(db);
  }
}
