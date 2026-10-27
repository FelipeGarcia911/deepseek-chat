# ADR-003: Use Kysely with SQL-first migrations for PostgreSQL

**Status:** Accepted; implementation starts in P2.2.
**Date:** 2026-10-27.
**Source:** [Roadmap P2.1](../roadmap.md).

## Context

Phase 2 replaces the JSON file store with PostgreSQL. The documented rules lean
on database behavior, not only on application code:

- Short transactions with row locks and expected-revision checks for Draft save,
  publish, promote, rollback and Run completion ([lifecycle](../lifecycle.md)).
- At most one active Deployment per Assistant and Environment: a partial unique
  index or an equivalent lookup constraint.
- Immutable published Versions and append-only Deployments, defended in the
  database as well as in use cases.
- Exactly one confirmed assistant Message per succeeded Run: uniqueness and
  foreign keys that must hold under concurrency.
- Keyset pagination on `(sort key, id)` and UUIDv7 identifiers
  ([ADR-002](002-share-runtime-validated-api-contracts.md)).
- pgvector similarity search in P6.4.

The learning goal is to see what the database actually enforces. The tool should
make SQL, constraints and transaction boundaries visible rather than hide them.

## Decision drivers

- First-class access to PostgreSQL features: partial and expression indexes,
  `CHECK`, triggers, `SELECT ... FOR UPDATE`, `ON CONFLICT`, row-value comparison,
  `uuidv7()` and pgvector.
- Explicit transactions with isolation levels, usable from application services.
- Compile-time types for queries and results.
- Reviewable, versioned migrations that build a clean database from scratch.
- A stable release line; no pre-1.0 rewrite of migrations mid-project.
- Learning value: SQL stays readable in code review.

## Considered alternatives

Versions checked against npm on 2026-10-27.

| Alternative                                                        | Benefit                                                                                                                                                 | Cost or limitation                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Prisma ORM 7.10** (schema DSL, generated client, Prisma Migrate) | Mature tooling, generated migrations, high-level relation API, strong types for common CRUD.                                                            | Its own schema language between us and SQL. Partial indexes are a preview feature since 7.4; row locks, pgvector and many PostgreSQL features need raw SQL or `Unsupported` types. A client generation step. Prisma 8 is in release candidate, so a major migration is close.                                                                                                                                      |
| **Sequelize 6.37** (model classes, sequelize-cli/Umzug migrations) | Long-established ORM; associations and eager loading; managed transactions with isolation levels and `lock: UPDATE`; index `where` for partial indexes. | v6 is in maintenance while v7 has stayed in alpha for years. Models and migrations are two separate definitions that can drift, and model types are declared by hand. `where` and raw queries are loosely typed. Migrations are JavaScript with `up`/`down`, not transactional unless wrapped, and the CLI takes no lock. pgvector needs an extra type package. Generated SQL is the least visible of the options. |
| **Drizzle ORM 0.45** (TypeScript schema, drizzle-kit)              | SQL-like typed builder, schema in TypeScript with no database needed for types, generated SQL migrations, native partial indexes and pgvector.          | The stable line is 0.45 while 1.0 has been in release candidate since early 2026 with breaking changes in its tooling. Choosing either means a planned migration soon. Generated migrations still need manual SQL for triggers and data changes.                                                                                                                                                                   |
| **Kysely 0.29 + node-postgres, SQL-first migrations**              | Typed SQL builder that maps almost one-to-one to SQL; raw `sql` fragments stay typed; explicit transactions, `forUpdate`, `onConflict`.                 | No schema DSL or migration generator: migrations are written by hand. Types are generated from a migrated database with `kysely-codegen`, which needs a running PostgreSQL. Pre-1.0 version number, although the API has been stable for years.                                                                                                                                                                    |
| Direct `pg` with SQL strings                                       | Maximum visibility, no abstraction at all.                                                                                                              | No compile-time checks on queries or results; every row type is written and kept in sync by hand; composing filters and pagination is string building.                                                                                                                                                                                                                                                             |

## Decision

Use **Kysely** over **node-postgres (`pg`)** with **SQL-first migrations** on
**PostgreSQL 18** with the **pgvector** extension.

- **The database schema is the source of truth.** Migrations live in
  `backend/migrations/`, numbered and named (`0001_create_workspaces.ts`). Each
  exports an `up` that runs SQL through Kysely's `sql` template, so constraints,
  indexes and triggers read as plain SQL.
- **Types are generated, not written.** `kysely-codegen` introspects a database
  migrated from scratch and writes the `Database` interface to
  `backend/src/db/schema.ts`. CI migrates a fresh PostgreSQL, regenerates the
  file and fails if it differs from the committed one.
- **Queries use the Kysely builder.** `sql` fragments are allowed for features
  the builder does not cover, such as vector distance. Repositories (P2.5) own
  queries; controllers and use cases never write SQL.
- **Transactions are explicit.** Use cases open them with
  `db.transaction().setIsolationLevel(...).execute(...)` and pass the
  transaction handle to repositories. No model-provider call runs inside a
  transaction.
- **Identifiers come from PostgreSQL.** Primary keys default to `uuidv7()`,
  replacing the random UUIDs of the JSON store.
- **Invariants live in the database when possible.** Use foreign keys, `CHECK`,
  unique and partial unique indexes, and triggers that reject updates to
  published Versions and Deployments. Application checks give clear errors;
  database constraints are the last line of defense.

## Migration and rollback policy

1. **Forward-only.** Migrations have no `down`. Rollback scripts are rarely
   tested and cannot restore deleted data, so they give false confidence.
2. **Applied migrations are immutable.** A mistake is fixed with a new
   migration, never by editing one that ran anywhere outside a developer's
   machine.
3. **Explicit execution.** Migrations run through `pnpm db:migrate`, never on
   API startup ([P2.2](../roadmap.md)). Kysely's migrator records applied
   migrations and takes a lock, so concurrent runs cannot apply one twice.
4. **All-or-nothing runs.** Kysely applies every pending migration inside one
   transaction, so a failure leaves the schema unchanged. A statement that
   cannot run in a transaction, such as `CREATE INDEX CONCURRENTLY`, goes alone
   in its own migration and is applied by a separate run with
   `disableTransactions`.
5. **Expand, migrate, contract.** Breaking schema changes ship as separate
   releases: add the new structure, move data and readers, and drop the old
   structure only after no deployed version uses it. The previous application
   version must keep working against the expanded schema.
6. **Application rollback** means redeploying the previous application version,
   which the expand/contract rule keeps compatible. **Schema rollback** means a
   new corrective forward migration.
7. **Data loss recovery** relies on backups and point-in-time recovery of the
   deployed database, taken before migrations run in deployed environments
   (P8.4). Local databases are disposable: `pnpm db:reset` recreates them from
   migrations and seed.
8. **Seed is separate from migrations.** Migrations change structure; the
   idempotent seed creates the default Workspace and the three Environments.

## Testing

Repository and integration tests run against real PostgreSQL 18 with pgvector,
locally through Docker Compose and in CI as a service container (P2.2). The
test database is built from the same migrations. Each test isolates its data and
cleans up, following [testing rules](../testing.md). Fake repositories are
limited to focused unit tests (P2.5).

## Consequences

SQL, constraints and locking stay visible in review, and every PostgreSQL
feature the lifecycle needs is available without leaving the typed builder.
Types cannot drift from the real schema because they are generated from it and
checked in CI.

We write migrations by hand and need a running PostgreSQL to regenerate types.
There is no relation-loading API: joins and aggregation are written explicitly.
Kysely's pre-1.0 version can bring breaking changes; upgrades are deliberate and
pinned. Forward-only migrations require discipline on expand/contract.

`@chat-app/shared` keeps owning wire contracts. Generated database types stay in
the backend and are mapped to contracts by repositories; they are never
exported to the frontend.

## Reconsideration

Revisit when Drizzle 1.0 is stable and its migration format has settled, if
hand-written migrations become a measurable bottleneck, or if Kysely stops being
maintained. Changing the query layer keeps the migrations, because they are SQL.

## References

- [Kysely documentation](https://kysely.dev/) and
  [migrations](https://kysely.dev/docs/migrations).
- [kysely-codegen](https://github.com/RobinBlomberg/kysely-codegen).
- [node-postgres](https://node-postgres.com/).
- [Prisma ORM 7.4: partial indexes preview](https://www.prisma.io/blog/prisma-orm-v7-4-query-caching-partial-indexes-and-major-performance-improvements).
- [Drizzle ORM migrations](https://orm.drizzle.team/docs/migrations) and
  [latest releases](https://orm.drizzle.team/docs/latest-releases).
- [PostgreSQL 18 UUID functions](https://www.postgresql.org/docs/18/functions-uuid.html),
  [explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html)
  and [partial indexes](https://www.postgresql.org/docs/current/indexes-partial.html).
- [pgvector](https://github.com/pgvector/pgvector).
- [Domain glossary](../domain.md), [lifecycle rules](../lifecycle.md) and
  [ADR-001](001-use-modular-monolith.md).
