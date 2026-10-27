import { randomUUID } from "node:crypto";
import { Client } from "pg";
import type { TestContext } from "vitest";
import { createDatabase, type Database } from "../src/db/database";
import { migrateToLatest } from "../src/db/migrator";
import { seed } from "../src/db/seed";

export const adminDatabaseUrl = process.env.TEST_DATABASE_URL ?? "postgres://chat_app:chat_app@127.0.0.1:5432/chat_app";

async function admin<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: adminDatabaseUrl });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function createEmptyDatabase(t: TestContext) {
  const name = `chat_app_test_${randomUUID().replaceAll("-", "")}`;
  await admin((client) => client.query(`create database ${name}`));
  const url = new URL(adminDatabaseUrl);
  url.pathname = `/${name}`;
  const db = createDatabase(url.toString());
  t.onTestFinished(async () => {
    await db.destroy();
    await admin((client) => client.query(`drop database if exists ${name} with (force)`));
  });
  return { db, url: url.toString() };
}

export async function createMigratedDatabase(t: TestContext) {
  const created = await createEmptyDatabase(t);
  await migrateToLatest(created.db);
  await seed(created.db);
  return created;
}

export async function publishAssistant(
  db: Database,
  slug: string,
  { deploy = true, status = "active" }: { deploy?: boolean; status?: "active" | "archived" } = {}
) {
  const workspace = await db
    .selectFrom("workspaces")
    .select("id")
    .where("slug", "=", "default")
    .executeTakeFirstOrThrow();
  const assistant = await db
    .insertInto("assistants")
    .values({ workspace_id: workspace.id, slug, name: `Assistant ${slug}`, status })
    .returning("id")
    .executeTakeFirstOrThrow();
  const promote = async (versionNumber: number) => {
    const version = await db
      .insertInto("assistant_versions")
      .values({
        workspace_id: workspace.id,
        assistant_id: assistant.id,
        version_number: versionNumber,
        source_draft_revision: 1,
        instructions: `Version ${versionNumber}`,
        settings: {},
        published_by: "admin",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const production = await db
      .selectFrom("environments")
      .select("id")
      .where("key", "=", "production")
      .executeTakeFirstOrThrow();
    const active = await db
      .selectFrom("active_deployments")
      .select("deployment_id")
      .where("assistant_id", "=", assistant.id)
      .executeTakeFirst();
    const deployment = await db
      .insertInto("deployments")
      .values({
        workspace_id: workspace.id,
        assistant_id: assistant.id,
        environment_id: production.id,
        assistant_version_id: version.id,
        previous_deployment_id: active?.deployment_id ?? null,
        deployed_by: "admin",
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    if (active) {
      await db
        .updateTable("active_deployments")
        .set({ deployment_id: deployment.id })
        .where("assistant_id", "=", assistant.id)
        .execute();
    } else {
      await db
        .insertInto("active_deployments")
        .values({
          workspace_id: workspace.id,
          assistant_id: assistant.id,
          environment_id: production.id,
          deployment_id: deployment.id,
        })
        .execute();
    }
    return version.id;
  };
  const versionId = deploy ? await promote(1) : null;
  return { assistantId: assistant.id, versionId, promote };
}
