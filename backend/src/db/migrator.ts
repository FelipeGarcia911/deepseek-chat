import type { Kysely } from "kysely";
import { Migrator } from "kysely/migration";
import * as createWorkspacesAndEnvironments from "./migrations/0001_create_workspaces_and_environments";
import * as createAssistantReleaseModel from "./migrations/0002_create_assistant_release_model";
import * as hardenReleaseModelInvariants from "./migrations/0003_harden_release_model_invariants";
import * as createConversationsMessagesRuns from "./migrations/0004_create_conversations_messages_runs";
import * as hardenRunResponseInvariants from "./migrations/0005_harden_run_response_invariants";
import * as addRunPromptTrace from "./migrations/0006_add_run_prompt_trace";

const migrations = {
  "0001_create_workspaces_and_environments": createWorkspacesAndEnvironments,
  "0002_create_assistant_release_model": createAssistantReleaseModel,
  "0003_harden_release_model_invariants": hardenReleaseModelInvariants,
  "0004_create_conversations_messages_runs": createConversationsMessagesRuns,
  "0005_harden_run_response_invariants": hardenRunResponseInvariants,
  "0006_add_run_prompt_trace": addRunPromptTrace,
};

export function createMigrator<T>(db: Kysely<T>) {
  return new Migrator({ db, provider: { getMigrations: async () => migrations } });
}

export async function migrateToLatest<T>(db: Kysely<T>): Promise<string[]> {
  const { error, results = [] } = await createMigrator(db).migrateToLatest();
  if (error) throw error;
  return results.map((result) => result.migrationName);
}

export async function pendingMigrations<T>(db: Kysely<T>): Promise<string[]> {
  const migrationInfo = await createMigrator(db).getMigrations();
  return migrationInfo.filter((migration) => !migration.executedAt).map((migration) => migration.name);
}
