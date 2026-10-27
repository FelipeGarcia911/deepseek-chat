import { sql, type Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    create function check_run_response_count() returns trigger language plpgsql as $$
    declare
      current_status text;
      responses integer;
    begin
      select status into current_status from runs where id = new.id;
      if not found then
        return null;
      end if;
      select count(*) into responses from messages where run_id = new.id;
      if current_status = 'succeeded' and responses <> 1 then
        raise exception 'succeeded run % must have exactly one response', new.id using errcode = 'check_violation';
      end if;
      if current_status <> 'succeeded' and responses > 0 then
        raise exception 'run % is % but has a response', new.id, current_status using errcode = 'check_violation';
      end if;
      return null;
    end
    $$
  `.execute(db);

  await sql`
    create constraint trigger check_run_response_count after insert or update on runs
    deferrable initially deferred
    for each row execute function check_run_response_count()
  `.execute(db);

  await sql`
    create function reject_direct_history_delete() returns trigger language plpgsql as $$
    begin
      if exists (select 1 from conversations where id = old.conversation_id) then
        raise exception '% rows can only be deleted with their conversation', tg_table_name
          using errcode = 'restrict_violation';
      end if;
      return old;
    end
    $$
  `.execute(db);

  for (const table of ["messages", "runs"]) {
    await sql`
      create trigger reject_direct_history_delete before delete on ${sql.table(table)}
      for each row execute function reject_direct_history_delete()
    `.execute(db);
  }
}
