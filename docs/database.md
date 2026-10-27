# PostgreSQL database

**Status:** P2.2, October 27, 2026. Follows
[ADR-003](adr/003-use-kysely-with-sql-first-migrations.md): Kysely over
node-postgres, SQL-first migrations, generated types and forward-only policy.
Conversations still use the JSON file store until P2.4.

## Local setup

[docker-compose.yml](../docker-compose.yml) runs PostgreSQL 18 with pgvector,
bound to `127.0.0.1:5432`, with local-only credentials `chat_app/chat_app`.

```sh
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
```

`backend/.env` needs `DATABASE_URL`; the example matches Compose. Data lives in
the `postgres-data` volume. `docker compose down -v` deletes it.

## Commands

| Command           | Effect                                                                                                                                                          |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm db:migrate` | Applies pending migrations in one transaction under Kysely's migration lock. Prints what it applied.                                                            |
| `pnpm db:seed`    | Idempotently ensures the `default` Workspace and its `development`, `staging` and `production` Environments.                                                    |
| `pnpm db:reset`   | Drops and recreates the `public` schema, then migrates and seeds. Allowed only when `NODE_ENV` is `development` or `test`; missing or other values are refused. |
| `pnpm db:types`   | Regenerates [backend/src/db/schema.ts](../backend/src/db/schema.ts) from the migrated database.                                                                 |

The API never migrates or seeds on startup. Production runs the compiled
`node dist/db/cli.js migrate` explicitly before starting the new version (P8.4).

## Adding a migration

1. Add `backend/src/db/migrations/NNNN_description.ts` exporting `up`, with SQL
   through Kysely's `sql` template, and register it in
   [migrator.ts](../backend/src/db/migrator.ts). The explicit list works the
   same under ts-node and compiled output.
2. Run `pnpm db:migrate`, then `pnpm db:types`, and commit the regenerated
   schema with the migration.
3. Write code that uses the new tables only after regenerating types.

Never edit a migration that ran outside your machine; add a corrective one.
The generated `schema.ts` is excluded from Prettier so `--verify` compares the
exact generator output. Column names stay `snake_case` in TypeScript, exactly
as in SQL.

## Health endpoints

| Endpoint            | Meaning                                                                                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health/live`  | The process serves HTTP. Never touches the database: `200 { "status": "ok" }`.                                                                                            |
| `GET /health/ready` | The database answers and has no pending migrations: `200 { "status": "ready" }`, otherwise a 503 `DEPENDENCY_UNAVAILABLE` problem whose `detail` says which check failed. |

[HealthService](../backend/src/services/HealthService.ts) implements both checks behind [HealthController](../backend/src/controllers/HealthController.ts) and [HealthRoutes](../backend/src/routes/HealthRoutes.ts), mounted at `/health` before CORS. Readiness only reads migration state; it never creates migration tables. Any failure while connecting or reading migration state is a 503, never a 500. The
pool times out new connections after 2 seconds, lets the process exit when idle,
and logs instead of crashing when the server closes an idle connection.

Composition creates one `Database` and returns `{ app, close }`; every service
and repository receives that same instance. On SIGTERM or SIGINT the server
stops accepting connections, waits for active requests, then closes the pool
and logs `Database connections closed`, all within the 10-second deadline.

## Schema so far

| Table          | Purpose and constraints                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `workspaces`   | `uuidv7()` id, unique lowercase `slug`, `name` of 1–120 characters. The seed owns the `default` row.          |
| `environments` | `uuidv7()` id, `workspace_id` foreign key, `key` limited to the three MVP environments, unique per Workspace. |

| `assistants` | `uuidv7()` id, `slug` of 3–63 lowercase characters unique per Workspace, `name` of 1–120 characters, `status` `active` or `archived`. |
| `assistant_drafts` | One row per Assistant (primary key `assistant_id`). Mutable: `revision` starts at 1, `instructions` up to 20,000 characters, `settings` JSON object. |
| `assistant_versions` | Immutable: updates and deletes are rejected by trigger. `version_number` unique per Assistant, `source_draft_revision`, snapshot of instructions and settings, `published_by`. |
| `deployments` | Immutable, append-only audit of promotions and rollbacks: target Version, Environment, optional `previous_deployment_id`, `deployed_by`. |
| `active_deployments` | The moving lookup. Primary key `(assistant_id, environment_id)`, so each Assistant has at most one active Deployment per Environment. |

Ownership is enforced with composite foreign keys that include `workspace_id`
and, where relevant, `assistant_id` and `environment_id`. A Draft or Version
cannot belong to an Assistant of another Workspace; a Deployment cannot target
another Assistant's Version or another Workspace's Environment; a previous
Deployment and the active lookup must match the same Assistant and Environment.
Named constraints (`deployments_version_fkey`, `active_deployments_deployment_fkey`
and others) keep violations recognizable. `updated_at` is maintained by a
`set_updated_at` trigger; immutable rows fail with SQLSTATE `23001`
(`restrict_violation`). Migration `0003_harden_release_model_invariants` adds defense in depth:
`assistants.id`, `workspace_id` and `slug` never change (the slug is the stable
public URL); a Draft never changes `assistant_id` or `workspace_id`, and every
update must advance `revision` by exactly one; a Deployment cannot name itself
as its previous Deployment; and the active lookup may only change
`deployment_id`, never its Assistant, Environment or Workspace. Use cases still
filter by the expected revision to detect concurrent edits; the trigger makes
the sequence itself impossible to corrupt. Model Profile and knowledge references arrive with P4.4
and P6. Writing these rows through use cases (revision checks, version
numbering, moving the lookup atomically) belongs to P2.5 and P5.

## TypeScript and module format

Kysely 0.29 is published only as ESM. The backend still compiles to CommonJS,
which Node 26 loads with `require(esm)`. The backend uses TypeScript 5.9 with
`module` and `moduleResolution` set to `nodenext`, so TypeScript resolves
package subpaths such as `kysely/migration`.

## Tests

Database tests need PostgreSQL. Each test creates its own empty database
named `chat_app_test_<uuid>` through `TEST_DATABASE_URL` (default: the Compose
database), and drops it with `force` when the test finishes. Tests prove that a
clean database builds from migrations, that a failing migration applies
nothing, that seed is idempotent, that constraints reject invalid rows, and
that readiness follows migration state.
