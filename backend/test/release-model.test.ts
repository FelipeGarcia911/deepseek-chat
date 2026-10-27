import assert from "node:assert/strict";
import { sql } from "kysely";
import { test, type TestContext } from "vitest";
import type { Database } from "../src/db/database";
import { migrateToLatest } from "../src/db/migrator";
import { seed } from "../src/db/seed";
import { createEmptyDatabase } from "./database";

const immutable = { code: "23001" };

async function releaseFixture(t: TestContext) {
  const { db } = await createEmptyDatabase(t);
  await migrateToLatest(db);
  await seed(db);
  const workspace = await db.selectFrom("workspaces").select("id").executeTakeFirstOrThrow();
  const environments = Object.fromEntries(
    (await db.selectFrom("environments").select(["id", "key"]).execute()).map(({ key, id }) => [key, id])
  );
  const createAssistant = (slug: string, workspaceId = workspace.id) =>
    db
      .insertInto("assistants")
      .values({ workspace_id: workspaceId, slug, name: `Assistant ${slug}` })
      .returning("id")
      .executeTakeFirstOrThrow()
      .then(({ id }) => id);
  const publish = (assistantId: string, versionNumber: number) =>
    db
      .insertInto("assistant_versions")
      .values({
        workspace_id: workspace.id,
        assistant_id: assistantId,
        version_number: versionNumber,
        source_draft_revision: 1,
        instructions: `Version ${versionNumber}`,
        settings: { temperature: 0.2 },
        published_by: "admin",
      })
      .returning("id")
      .executeTakeFirstOrThrow()
      .then(({ id }) => id);
  const deploy = (
    assistantId: string,
    versionId: string,
    environmentId: string,
    previousDeploymentId: string | null = null
  ) =>
    db
      .insertInto("deployments")
      .values({
        workspace_id: workspace.id,
        assistant_id: assistantId,
        environment_id: environmentId,
        assistant_version_id: versionId,
        previous_deployment_id: previousDeploymentId,
        deployed_by: "admin",
      })
      .returning("id")
      .executeTakeFirstOrThrow()
      .then(({ id }) => id);
  return { db, workspaceId: workspace.id, environments, createAssistant, publish, deploy };
}

async function rejects(query: { execute(): Promise<unknown> }, expected: object | RegExp) {
  await assert.rejects(query.execute(), expected);
}

function activeLookup(db: Database, values: { assistantId: string; environmentId: string; deploymentId: string }) {
  return db.insertInto("active_deployments").values({
    workspace_id: sql<string>`(select id from workspaces where slug = 'default')`,
    assistant_id: values.assistantId,
    environment_id: values.environmentId,
    deployment_id: values.deploymentId,
  });
}

test("should keep drafts editable while advancing their revision and update time", async (t) => {
  const { db, workspaceId, createAssistant } = await releaseFixture(t);
  const assistantId = await createAssistant("support");
  const created = await db
    .insertInto("assistant_drafts")
    .values({ assistant_id: assistantId, workspace_id: workspaceId })
    .returningAll()
    .executeTakeFirstOrThrow();
  assert.equal(created.revision, 1);
  assert.deepEqual(created.settings, {});
  const saved = await db
    .updateTable("assistant_drafts")
    .set({ instructions: "Answer politely.", settings: { temperature: 0.5 }, revision: created.revision + 1 })
    .where("assistant_id", "=", assistantId)
    .where("revision", "=", created.revision)
    .returningAll()
    .executeTakeFirstOrThrow();
  assert.equal(saved.revision, 2);
  assert.equal(saved.instructions, "Answer politely.");
  assert.ok(saved.updated_at > created.updated_at);
  const stale = await db
    .updateTable("assistant_drafts")
    .set({ instructions: "Stale edit", revision: 2 })
    .where("assistant_id", "=", assistantId)
    .where("revision", "=", 1)
    .executeTakeFirst();
  assert.equal(stale.numUpdatedRows, 0n);
  await rejects(
    db.insertInto("assistant_drafts").values({ assistant_id: assistantId, workspace_id: workspaceId }),
    /assistant_drafts_pkey/
  );
  await rejects(
    db
      .updateTable("assistant_drafts")
      .set({ settings: sql`'[]'::jsonb`, revision: saved.revision + 1 })
      .where("assistant_id", "=", assistantId),
    /assistant_drafts_settings_check/
  );
});

test("should reject updates and deletes of published versions and deployments", async (t) => {
  const { db, environments, createAssistant, publish, deploy } = await releaseFixture(t);
  const assistantId = await createAssistant("support");
  const versionId = await publish(assistantId, 1);
  const deploymentId = await deploy(assistantId, versionId, environments.production);
  await rejects(
    db.updateTable("assistant_versions").set({ instructions: "Edited" }).where("id", "=", versionId),
    immutable
  );
  await rejects(db.deleteFrom("assistant_versions").where("id", "=", versionId), immutable);
  await rejects(
    db.updateTable("deployments").set({ deployed_by: "someone" }).where("id", "=", deploymentId),
    immutable
  );
  await rejects(db.deleteFrom("deployments").where("id", "=", deploymentId), immutable);
  const version = await db
    .selectFrom("assistant_versions")
    .selectAll()
    .where("id", "=", versionId)
    .executeTakeFirstOrThrow();
  assert.equal(version.instructions, "Version 1");
});

test("should number versions uniquely within each assistant", async (t) => {
  const { createAssistant, publish } = await releaseFixture(t);
  const first = await createAssistant("support");
  const second = await createAssistant("sales");
  await publish(first, 1);
  await publish(first, 2);
  await publish(second, 1);
  await assert.rejects(publish(first, 2), /assistant_versions_assistant_id_version_number_key/);
  await assert.rejects(publish(first, 0), /assistant_versions_version_number_check/);
});

test("should keep at most one active deployment per assistant and environment while the lookup moves", async (t) => {
  const { db, environments, createAssistant, publish, deploy } = await releaseFixture(t);
  const assistantId = await createAssistant("support");
  const first = await deploy(assistantId, await publish(assistantId, 1), environments.production);
  const second = await deploy(assistantId, await publish(assistantId, 2), environments.production, first);
  const staging = await deploy(assistantId, await publish(assistantId, 3), environments.staging);
  await activeLookup(db, { assistantId, environmentId: environments.production, deploymentId: first }).execute();
  await activeLookup(db, { assistantId, environmentId: environments.staging, deploymentId: staging }).execute();
  await rejects(
    activeLookup(db, { assistantId, environmentId: environments.production, deploymentId: second }),
    /active_deployments_pkey/
  );
  await db
    .updateTable("active_deployments")
    .set({ deployment_id: second })
    .where("assistant_id", "=", assistantId)
    .where("environment_id", "=", environments.production)
    .execute();
  const active = await db
    .selectFrom("active_deployments")
    .select(["environment_id", "deployment_id"])
    .where("assistant_id", "=", assistantId)
    .orderBy("environment_id")
    .execute();
  assert.deepEqual(
    new Map(active.map((row) => [row.environment_id, row.deployment_id])),
    new Map([
      [environments.production, second],
      [environments.staging, staging],
    ])
  );
  assert.equal((await db.selectFrom("deployments").select("id").execute()).length, 3);
});

test("should reject references across workspaces, assistants and environments", async (t) => {
  const { db, workspaceId, environments, createAssistant, publish, deploy } = await releaseFixture(t);
  const other = await db
    .insertInto("workspaces")
    .values({ slug: "other", name: "Other workspace" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const otherEnvironment = await db
    .insertInto("environments")
    .values({ workspace_id: other.id, key: "production" })
    .returning("id")
    .executeTakeFirstOrThrow();
  const support = await createAssistant("support");
  const sales = await createAssistant("sales");
  const foreignAssistant = await createAssistant("foreign", other.id);
  const supportVersion = await publish(support, 1);
  const salesVersion = await publish(sales, 1);
  const stagingDeployment = await deploy(support, supportVersion, environments.staging);

  await rejects(
    db.insertInto("assistant_drafts").values({ assistant_id: foreignAssistant, workspace_id: workspaceId }),
    /assistant_drafts_assistant_fkey/
  );
  await assert.rejects(deploy(support, salesVersion, environments.production), /deployments_version_fkey/);
  await assert.rejects(deploy(support, supportVersion, otherEnvironment.id), /deployments_environment_fkey/);
  await assert.rejects(
    deploy(support, supportVersion, environments.production, stagingDeployment),
    /deployments_previous_fkey/
  );
  await rejects(
    activeLookup(db, { assistantId: support, environmentId: environments.production, deploymentId: stagingDeployment }),
    /active_deployments_deployment_fkey/
  );
});

test("should enforce assistant slugs, names and status in the database", async (t) => {
  const { db, workspaceId, createAssistant } = await releaseFixture(t);
  const other = await db
    .insertInto("workspaces")
    .values({ slug: "other", name: "Other workspace" })
    .returning("id")
    .executeTakeFirstOrThrow();
  await createAssistant("support");
  await createAssistant("support", other.id);
  for (const slug of ["support", "ab", "Support", "two--hyphens", `x${"y".repeat(63)}`]) {
    await assert.rejects(createAssistant(slug), /assistants_/);
  }
  await rejects(
    db.insertInto("assistants").values({ workspace_id: workspaceId, slug: "nameless", name: "" }),
    /assistants_name_check/
  );
  await assert.rejects(
    sql`insert into assistants (workspace_id, slug, name, status) values (${workspaceId}, 'deleted', 'Deleted', 'deleted')`.execute(
      db
    ),
    /assistants_status_check/
  );
  const archived = await db
    .updateTable("assistants")
    .set({ status: "archived" })
    .where("slug", "=", "support")
    .where("workspace_id", "=", workspaceId)
    .returning(["status", "created_at", "updated_at"])
    .executeTakeFirstOrThrow();
  assert.equal(archived.status, "archived");
  assert.ok(archived.updated_at > archived.created_at);
});

test("should keep assistant identity, workspace and slug immutable while name and status stay editable", async (t) => {
  const { db, createAssistant } = await releaseFixture(t);
  const assistantId = await createAssistant("support");
  const other = await db
    .insertInto("workspaces")
    .values({ slug: "other", name: "Other workspace" })
    .returning("id")
    .executeTakeFirstOrThrow();
  for (const change of [
    { slug: "renamed" },
    { workspace_id: other.id },
    { id: "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47" },
  ]) {
    await rejects(db.updateTable("assistants").set(change).where("id", "=", assistantId), immutable);
  }
  const updated = await db
    .updateTable("assistants")
    .set({ name: "Customer support", status: "archived" })
    .where("id", "=", assistantId)
    .returning(["slug", "name", "status"])
    .executeTakeFirstOrThrow();
  assert.deepEqual(updated, { slug: "support", name: "Customer support", status: "archived" });
});

test("should require each draft save to advance the revision by exactly one and keep its owner", async (t) => {
  const { db, workspaceId, createAssistant } = await releaseFixture(t);
  const assistantId = await createAssistant("support");
  const otherAssistant = await createAssistant("sales");
  await db.insertInto("assistant_drafts").values({ assistant_id: assistantId, workspace_id: workspaceId }).execute();
  const draft = db.updateTable("assistant_drafts").where("assistant_id", "=", assistantId);
  for (const revision of [1, 3, 0]) {
    await rejects(draft.set({ instructions: "Skipped", revision }), /revision must advance from 1 to 2/);
  }
  await rejects(draft.set({ instructions: "No revision change" }), /revision must advance/);
  await rejects(draft.set({ assistant_id: otherAssistant, revision: 2 }), immutable);
  await rejects(draft.set({ workspace_id: sql<string>`gen_random_uuid()`, revision: 2 }), immutable);
  const saved = await draft.set({ instructions: "Saved", revision: 2 }).returning("revision").executeTakeFirstOrThrow();
  assert.equal(saved.revision, 2);
  await rejects(draft.set({ revision: 1 }), /revision must advance from 2 to 3/);
});

test("should reject a deployment that names itself as its previous deployment", async (t) => {
  const { db, workspaceId, environments, createAssistant, publish } = await releaseFixture(t);
  const assistantId = await createAssistant("support");
  const versionId = await publish(assistantId, 1);
  const id = "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47";
  await rejects(
    db.insertInto("deployments").values({
      id,
      workspace_id: workspaceId,
      assistant_id: assistantId,
      environment_id: environments.production,
      assistant_version_id: versionId,
      previous_deployment_id: id,
      deployed_by: "admin",
    }),
    /deployments_previous_not_self/
  );
});

test("should let the active lookup move only its deployment, never its scope", async (t) => {
  const { db, environments, createAssistant, publish, deploy } = await releaseFixture(t);
  const assistantId = await createAssistant("support");
  const otherAssistant = await createAssistant("sales");
  const first = await deploy(assistantId, await publish(assistantId, 1), environments.production);
  const second = await deploy(assistantId, await publish(assistantId, 2), environments.production, first);
  await activeLookup(db, { assistantId, environmentId: environments.production, deploymentId: first }).execute();
  const lookup = db
    .updateTable("active_deployments")
    .where("assistant_id", "=", assistantId)
    .where("environment_id", "=", environments.production);
  for (const change of [
    { environment_id: environments.staging },
    { assistant_id: otherAssistant },
    { workspace_id: sql<string>`gen_random_uuid()` },
  ]) {
    await rejects(lookup.set(change), immutable);
  }
  const moved = await lookup.set({ deployment_id: second }).returning("deployment_id").executeTakeFirstOrThrow();
  assert.equal(moved.deployment_id, second);
});
