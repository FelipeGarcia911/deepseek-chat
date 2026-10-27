# AI Chat Platform

A TypeScript workspace evolving from a chat prototype into a platform for
configuring, publishing and inspecting versioned RAG Assistants. See the
[roadmap](docs/roadmap.md), [architecture](docs/architecture.md) and
[ADR-001](docs/adr/001-use-modular-monolith.md).

## Current behavior

The backend starts without a configured model. Conversations, messages and
runs are stored in PostgreSQL. A conversation is created for a published
Assistant at `/c/<assistantSlug>` and pinned to its current Production version;
until the administration screens exist (P4/P5), no Assistant is published by
default, so creation answers 404 for unknown slugs. Generation is
intentionally unavailable until Model Profiles and model-gateway contracts
are implemented. Sending a message returns:

```json
{
  "type": "about:blank",
  "title": "Service Unavailable",
  "status": 503,
  "code": "MODEL_NOT_CONFIGURED",
  "detail": "No Model Profile has been configured.",
  "requestId": "<same value as the X-Request-Id header>"
}
```

The response status is **503** with `Content-Type: application/problem+json`.
Every API error uses this [problem details envelope](docs/adr/002-share-runtime-validated-api-contracts.md#error-envelope);
clients branch on `code`. The API does not save the submitted message,
fabricate an assistant answer or call a provider. Ollama is not required to
install, run or test this stage. The frontend propagates generation failure;
its existing optimistic user bubble is client-only and is not stored by the API.

The MVP target is **one React application** with public chat at
`/c/:assistantSlug` and administration at `/admin/*`. These are surfaces in the
same application, not separate apps or deployments. P0.3 does not introduce
those screens or administrator authentication; existing prototype routes remain.

## Prerequisites and setup

- Node.js 26.12.1; use `nvm` to select the repository version.
- pnpm 12.14.0.
- Git.

Clone the repository, then run setup from its root. The HTTPS clone does not
depend on a particular personal or work SSH account:

```sh
git clone https://github.com/FelipeGarcia911/deepseek-chat.git
cd deepseek-chat
nvm install
nvm use
npm install --global pnpm@12.14.0
pnpm install --frozen-lockfile
cp -n backend/.env.example backend/.env
cp -n frontend/.env.example frontend/.env
docker compose up -d --wait
pnpm db:migrate
pnpm db:seed
```

The copy commands preserve existing files. If you already have env files,
update them to the current examples: the old global model and prototype
storage variables are not supported. No prototype data is migrated automatically.

Docker is required for PostgreSQL; see [database](docs/database.md). The
backend requires these four **platform** settings:

```dotenv
NODE_ENV=development
PORT=4000
CORS_ORIGINS=http://localhost:5173
DATABASE_URL=postgres://chat_app:chat_app@localhost:5432/chat_app
```

Ports must be integers in 1–65535. Origins are normalized HTTP(S) origins,
separated by commas; wildcards and URL paths are rejected.

The frontend requires a **public** API base, including `/api` but excluding
`/v1`:

```dotenv
VITE_API_BASE_URL=http://localhost:4000/api
```

A root-relative value such as `/api` is also supported when deployment routes
that prefix to the API. No development proxy is configured automatically.
Restart after env changes. Production frontend values are embedded during build;
changing them requires rebuilding. Never put secrets in `VITE_*` settings.
See [configuration](docs/configuration.md) for validation and precedence.

## HTTP checks

`/health/live` reports that the process serves HTTP. `/health/ready` reports
whether PostgreSQL answers and has no pending migrations; it returns 503 until
`pnpm db:migrate` has run. The conversation list exercises the database:

```sh
curl --fail http://localhost:4000/health/live
curl --fail http://localhost:4000/health/ready
curl --fail http://localhost:4000/api/v1/admin/conversations
```

The response is a page, initially `{ "items": [], "nextCursor": null }`. It does not check a model or
guarantee durable storage: the prototype file service recovers from read
errors as an empty store. Generation's deliberate 503 is not a failed startup.

## Run and verify

Run the full quality sequence with `pnpm verify`: format check, lint,
typecheck, tests with per-file 90% coverage, then production builds. See
[quality gates](docs/quality-gates.md) for what each stage proves. Use
`pnpm format` to apply repository formatting intentionally.

```sh
pnpm dev
```

This builds the internal packages, then starts their watchers and both the
frontend and backend. With the examples, open `http://localhost:5173`; the API
list endpoint is `http://localhost:4000/api/v1/admin/conversations`. Ctrl+C stops the group.
If Vite selects another port, explicitly add that origin to `CORS_ORIGINS` and
restart the backend. Requests with unknown Origin headers receive 403;
requests without Origin remain available to local tools.

| Command                                | Purpose                                                   |
| -------------------------------------- | --------------------------------------------------------- |
| `pnpm dev:frontend`                    | Run the React application and its library watchers.       |
| `pnpm dev:backend`                     | Run the API and shared-library watcher.                   |
| `pnpm build:packages`                  | Compile internal libraries.                               |
| `pnpm typecheck`                       | Check all workspace packages.                             |
| `pnpm lint`                            | Lint applications, internal libraries and tooling.        |
| `pnpm test`                            | Run backend, frontend configuration/HTTP and React tests. |
| `pnpm --filter frontend test:ui:watch` | Watch React component tests during development.           |
| `pnpm build`                           | Build libraries, the backend and the React application.   |
| `pnpm --filter backend start`          | Run the compiled API after building.                      |
| `pnpm --filter frontend preview`       | Preview the already-built frontend.                       |

Tests need no real model or provider credentials. They use temporary storage
and local ports. The existing Vite bundle-size warning remains visible and is
documented in [quality gates](docs/quality-gates.md).

## Configuration ownership and workspace

Platform environment settings configure deployment. Future Model Profiles
will own provider connections and credential references; Assistant Drafts and
Versions will own instructions, generation parameters and chatbot behavior.
Credentials stay server-side and are referenced rather than copied into
Assistant Versions. No ModelProvider interface, adapter or profile persistence
is introduced in this stage.

`frontend/` and `backend/` consume the private `packages/ui` and
`packages/shared` libraries with `workspace:*`. UI will support reusable
components across the two surfaces of the same React app. Commit the root
`pnpm-lock.yaml` when changing dependencies.

- [Internal packages](docs/internal-packages.md)
- [Backend composition and lifecycle](docs/backend-composition.md)
- [Platform configuration](docs/configuration.md)
- [Repository quality gates](docs/quality-gates.md)
- [Continuous integration](docs/continuous-integration.md)
- [Automated test foundations](docs/testing.md)
- [Repository and test rules](AGENTS.md)
- [Domain glossary and ownership](docs/domain.md)
- [Lifecycle states and invariants](docs/lifecycle.md)
- [API surfaces: admin and runtime routes](docs/api-surfaces.md)
- [ADR-002: API contract strategy](docs/adr/002-share-runtime-validated-api-contracts.md)
- [ADR-003: PostgreSQL data access](docs/adr/003-use-kysely-with-sql-first-migrations.md)
- [PostgreSQL database](docs/database.md)
- [Architecture and MVP boundaries](docs/architecture.md)
- [Execution roadmap](docs/roadmap.md)

## License

Released under the [MIT License](LICENSE).
