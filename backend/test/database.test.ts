import assert from "node:assert/strict";
import { sql } from "kysely";
import { test, vi } from "vitest";
import { main, runDatabaseCommand } from "../src/db/cli";
import { createDatabase } from "../src/db/database";
import { migrateToLatest, pendingMigrations } from "../src/db/migrator";
import { environmentKeys, seed } from "../src/db/seed";
import HealthService from "../src/services/HealthService";
import { createEmptyDatabase } from "./database";

async function tableNames(db: ReturnType<typeof createDatabase>) {
  const { rows } = await sql<{ table_name: string }>`
    select table_name from information_schema.tables where table_schema = 'public' order by table_name
  `.execute(db);
  return rows.map((row) => row.table_name);
}

test("should build a clean database entirely from versioned migrations and apply them once", async (t) => {
  const { db } = await createEmptyDatabase(t);
  assert.deepEqual(await pendingMigrations(db), ["0001_create_workspaces_and_environments"]);
  assert.deepEqual(await migrateToLatest(db), ["0001_create_workspaces_and_environments"]);
  assert.deepEqual(await migrateToLatest(db), []);
  assert.deepEqual(await pendingMigrations(db), []);
  assert.deepEqual(await tableNames(db), ["environments", "kysely_migration", "kysely_migration_lock", "workspaces"]);
});

test("should seed the default workspace and its three environments idempotently", async (t) => {
  const { db } = await createEmptyDatabase(t);
  await migrateToLatest(db);
  await seed(db);
  await seed(db);
  const workspaces = await db.selectFrom("workspaces").selectAll().execute();
  assert.equal(workspaces.length, 1);
  assert.equal(workspaces[0].slug, "default");
  assert.match(workspaces[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-/);
  const environments = await db.selectFrom("environments").select(["key", "workspace_id"]).orderBy("key").execute();
  assert.deepEqual(
    environments.map((environment) => environment.key),
    [...environmentKeys].sort()
  );
  assert.ok(environments.every((environment) => environment.workspace_id === workspaces[0].id));
});

test("should enforce workspace and environment constraints in the database", async (t) => {
  const { db } = await createEmptyDatabase(t);
  await migrateToLatest(db);
  await seed(db);
  const { id } = await db.selectFrom("workspaces").select("id").executeTakeFirstOrThrow();
  const rejected = [
    db.insertInto("workspaces").values({ slug: "Not A Slug", name: "Invalid" }),
    db.insertInto("workspaces").values({ slug: "default", name: "Duplicate" }),
    db.insertInto("workspaces").values({ slug: "empty-name", name: "" }),
    db.insertInto("environments").values({ workspace_id: id, key: "qa" }),
    db.insertInto("environments").values({ workspace_id: id, key: "production" }),
    db.insertInto("environments").values({ workspace_id: "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47", key: "staging" }),
  ];
  for (const query of rejected) await assert.rejects(query.execute());
});

test("should report readiness without creating tables and only once migrations are applied", async (t) => {
  const { db } = await createEmptyDatabase(t);
  assert.deepEqual(await new HealthService(db).checkReadiness(), {
    ready: false,
    reason: "The database has 1 pending migration(s).",
  });
  assert.deepEqual(await tableNames(db), []);
  await migrateToLatest(db);
  assert.deepEqual(await new HealthService(db).checkReadiness(), { ready: true });
});

test("should report an unreachable database as not ready", async () => {
  const db = createDatabase("postgres://chat_app:chat_app@127.0.0.1:1/chat_app");
  try {
    assert.deepEqual(await new HealthService(db).checkReadiness(), {
      ready: false,
      reason: "The database is unreachable or its migration state cannot be read.",
    });
  } finally {
    await db.destroy();
  }
});

test("should migrate, seed and reset through the database command", async (t) => {
  const { db, url } = await createEmptyDatabase(t);
  const log = vi.fn();
  await runDatabaseCommand("migrate", { DATABASE_URL: url }, log);
  await runDatabaseCommand("migrate", { DATABASE_URL: url }, log);
  await runDatabaseCommand("seed", { DATABASE_URL: url }, log);
  await db.insertInto("workspaces").values({ slug: "extra", name: "Extra" }).execute();
  await runDatabaseCommand("reset", { DATABASE_URL: url, NODE_ENV: "development" }, log);
  assert.deepEqual(
    log.mock.calls.map(([message]) => message),
    [
      "Applied migrations: 0001_create_workspaces_and_environments.",
      "Database schema is up to date.",
      "Seed data is present.",
      "Dropped and recreated the public schema.",
      "Applied migrations: 0001_create_workspaces_and_environments.",
      "Seed data is present.",
    ]
  );
  const slugs = await db.selectFrom("workspaces").select("slug").execute();
  assert.deepEqual(slugs, [{ slug: "default" }]);
});

test("should refuse unknown commands and invalid URLs before connecting", async () => {
  const log = vi.fn();
  await assert.rejects(runDatabaseCommand(undefined, {}, log), /Usage: db <migrate\|seed\|reset>/);
  await assert.rejects(runDatabaseCommand("drop", {}, log), /Usage/);
  await assert.rejects(runDatabaseCommand("seed", {}, log), /DATABASE_URL: must be a postgres/);
  await assert.rejects(
    runDatabaseCommand("migrate", { DATABASE_URL: "postgres://user:private-value@" }, log),
    (error: Error) => /DATABASE_URL/.test(error.message) && !error.message.includes("private-value")
  );
  assert.equal(log.mock.calls.length, 0);
});

test("should apply no migration when one of them fails", async (t) => {
  const { db } = await createEmptyDatabase(t);
  await sql`create table workspaces (id int)`.execute(db);
  await assert.rejects(migrateToLatest(db), /already exists/);
  assert.deepEqual(await pendingMigrations(db), ["0001_create_workspaces_and_environments"]);
  assert.deepEqual(await tableNames(db), ["kysely_migration", "kysely_migration_lock", "workspaces"]);
});

test("should report command failures through the exit code instead of throwing", async (t) => {
  t.onTestFinished(() => {
    process.exitCode = undefined;
  });
  const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  await main(["node", "cli", "unknown"]);
  assert.equal(process.exitCode, 1);
  assert.match(String(errorLog.mock.calls[0][0]), /Usage: db/);
});

test("should keep working after the server closes an idle pooled connection", async (t) => {
  const { db, url } = await createEmptyDatabase(t);
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  await sql`select 1`.execute(db);
  const other = createDatabase(url);
  try {
    await sql`
      select pg_terminate_backend(pid) from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid()
    `.execute(other);
  } finally {
    await other.destroy();
  }
  await vi.waitFor(() =>
    assert.deepEqual(warn.mock.calls, [
      ["Idle database connection closed: terminating connection due to administrator command"],
    ])
  );
  assert.deepEqual(await pendingMigrations(db), ["0001_create_workspaces_and_environments"]);
});

for (const nodeEnv of [undefined, "", "staging", "production"]) {
  test(`should refuse to reset the database when NODE_ENV is ${JSON.stringify(nodeEnv)}`, async () => {
    const log = vi.fn();
    await assert.rejects(
      runDatabaseCommand("reset", { DATABASE_URL: "postgres://localhost/chat_app", NODE_ENV: nodeEnv }, log),
      /db reset is allowed only when NODE_ENV is development or test/
    );
    assert.equal(log.mock.calls.length, 0);
  });
}

test("should report not ready when the migration state cannot be read", async (t) => {
  const { db } = await createEmptyDatabase(t);
  await sql`create table kysely_migration (unexpected int)`.execute(db);
  await sql`create table kysely_migration_lock (unexpected int)`.execute(db);
  assert.deepEqual(await new HealthService(db).checkReadiness(), {
    ready: false,
    reason: "The database is unreachable or its migration state cannot be read.",
  });
});
