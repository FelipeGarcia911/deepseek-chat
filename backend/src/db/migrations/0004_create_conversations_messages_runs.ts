import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create table conversations (
      id uuid primary key default uuidv7(),
      workspace_id uuid not null,
      assistant_id uuid not null,
      target_kind text not null check (target_kind in ('version', 'draft_snapshot')),
      assistant_version_id uuid,
      draft_snapshot jsonb,
      title text not null check (length(title) between 1 and 120),
      status text not null default 'open' check (status in ('open', 'closed')),
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      constraint conversations_target_check check (
        (target_kind = 'version' and assistant_version_id is not null and draft_snapshot is null)
        or (target_kind = 'draft_snapshot' and assistant_version_id is null and jsonb_typeof(draft_snapshot) = 'object')
      ),
      constraint conversations_assistant_fkey
        foreign key (workspace_id, assistant_id) references assistants (workspace_id, id),
      constraint conversations_version_fkey
        foreign key (workspace_id, assistant_id, assistant_version_id)
        references assistant_versions (workspace_id, assistant_id, id),
      unique (workspace_id, id)
    )
  `.execute(db);

  await sql`
    create table messages (
      id uuid primary key default uuidv7(),
      workspace_id uuid not null,
      conversation_id uuid not null,
      sequence integer not null check (sequence > 0),
      role text not null check (role in ('user', 'assistant')),
      content text not null check (length(content) between 1 and 100000),
      run_id uuid unique,
      created_at timestamptz not null default now(),
      constraint messages_conversation_fkey
        foreign key (workspace_id, conversation_id) references conversations (workspace_id, id) on delete cascade,
      constraint messages_response_run_check check ((role = 'assistant') = (run_id is not null)),
      unique (conversation_id, sequence),
      unique (workspace_id, conversation_id, id)
    )
  `.execute(db);

  await sql`
    create table runs (
      id uuid primary key default uuidv7(),
      workspace_id uuid not null,
      conversation_id uuid not null,
      trigger_message_id uuid not null,
      status text not null default 'accepted'
        check (status in ('accepted', 'running', 'succeeded', 'failed', 'cancelled', 'expired')),
      provider text,
      model text,
      error_code text,
      error_message text check (length(error_message) <= 2000),
      usage jsonb check (jsonb_typeof(usage) = 'object'),
      accepted_at timestamptz not null default now(),
      started_at timestamptz,
      finished_at timestamptz,
      constraint runs_conversation_fkey
        foreign key (workspace_id, conversation_id) references conversations (workspace_id, id) on delete cascade,
      constraint runs_trigger_message_fkey
        foreign key (workspace_id, conversation_id, trigger_message_id)
        references messages (workspace_id, conversation_id, id) on delete cascade,
      constraint runs_finished_check check ((status in ('accepted', 'running')) = (finished_at is null)),
      constraint runs_error_check check ((status in ('failed', 'expired')) = (error_code is not null)),
      unique (workspace_id, conversation_id, id)
    )
  `.execute(db);

  await sql`
    create unique index runs_one_active_per_conversation on runs (conversation_id)
    where status in ('accepted', 'running')
  `.execute(db);

  await sql`
    alter table messages add constraint messages_run_fkey
    foreign key (workspace_id, conversation_id, run_id) references runs (workspace_id, conversation_id, id)
  `.execute(db);

  await sql`
    create function check_run_transition() returns trigger language plpgsql as $$
    begin
      if tg_op = 'INSERT' then
        if new.status <> 'accepted' then
          raise exception 'runs must start as accepted' using errcode = 'check_violation';
        end if;
        if not exists (select 1 from messages where id = new.trigger_message_id and role = 'user') then
          raise exception 'runs must be triggered by a user message' using errcode = 'check_violation';
        end if;
        return new;
      end if;
      if old.status not in ('accepted', 'running') then
        raise exception 'run % is terminal', old.id using errcode = 'restrict_violation';
      end if;
      if new.status <> old.status and not (
        (old.status = 'accepted' and new.status in ('running', 'failed', 'cancelled', 'expired'))
        or (old.status = 'running' and new.status in ('succeeded', 'failed', 'cancelled', 'expired'))
      ) then
        raise exception 'run cannot move from % to %', old.status, new.status using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `.execute(db);

  await sql`
    create function check_response_run() returns trigger language plpgsql as $$
    begin
      if new.run_id is not null and not exists (
        select 1 from runs where id = new.run_id and status = 'succeeded'
      ) then
        raise exception 'assistant messages require a succeeded run' using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `.execute(db);

  await sql`
    create trigger set_updated_at before update on conversations
    for each row execute function set_updated_at()
  `.execute(db);
  await sql`
    create trigger reject_identity_change before update on conversations
    for each row execute function reject_identity_change(
      'id', 'workspace_id', 'assistant_id', 'target_kind', 'assistant_version_id', 'draft_snapshot', 'created_at'
    )
  `.execute(db);
  await sql`
    create trigger reject_mutation before update on messages
    for each row execute function reject_mutation()
  `.execute(db);
  await sql`
    create trigger check_response_run before insert on messages
    for each row execute function check_response_run()
  `.execute(db);
  await sql`
    create trigger check_run_transition before insert or update on runs
    for each row execute function check_run_transition()
  `.execute(db);
  await sql`
    create trigger reject_identity_change before update on runs
    for each row execute function reject_identity_change('id', 'workspace_id', 'conversation_id', 'trigger_message_id')
  `.execute(db);
}
