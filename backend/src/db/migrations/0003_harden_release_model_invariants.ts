import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create function reject_identity_change() returns trigger language plpgsql as $$
    declare
      column_name text;
    begin
      foreach column_name in array tg_argv loop
        if to_jsonb(new) -> column_name is distinct from to_jsonb(old) -> column_name then
          raise exception '%.% is immutable', tg_table_name, column_name using errcode = 'restrict_violation';
        end if;
      end loop;
      return new;
    end
    $$
  `.execute(db);

  await sql`
    create function require_next_draft_revision() returns trigger language plpgsql as $$
    begin
      if new.revision <> old.revision + 1 then
        raise exception 'assistant_drafts.revision must advance from % to %', old.revision, old.revision + 1
          using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `.execute(db);

  await sql`
    create trigger reject_identity_change before update on assistants
    for each row execute function reject_identity_change('id', 'workspace_id', 'slug')
  `.execute(db);
  await sql`
    create trigger reject_identity_change before update on assistant_drafts
    for each row execute function reject_identity_change('assistant_id', 'workspace_id')
  `.execute(db);
  await sql`
    create trigger reject_identity_change before update on active_deployments
    for each row execute function reject_identity_change('assistant_id', 'environment_id', 'workspace_id')
  `.execute(db);
  await sql`
    create trigger require_next_draft_revision before update on assistant_drafts
    for each row execute function require_next_draft_revision()
  `.execute(db);

  await sql`
    alter table deployments add constraint deployments_previous_not_self
    check (previous_deployment_id is null or previous_deployment_id <> id)
  `.execute(db);
}
