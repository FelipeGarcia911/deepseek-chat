# AI Chat Platform

A TypeScript workspace evolving from a chat prototype into a platform for
configuring, publishing and inspecting versioned RAG Assistants. See the
[roadmap](docs/roadmap.md), [architecture](docs/architecture.md) and
[ADR-001](docs/adr/001-use-modular-monolith.md).

## Current behavior

The backend starts without a configured model. Conversation list, creation,
history and deletion work with temporary JSON persistence. Generation is
intentionally unavailable until Model Profiles and model-gateway contracts
are implemented. Sending a message returns:

```json
{
  "code": "MODEL_NOT_CONFIGURED",
  "error": "No Model Profile has been configured."
}
```

The response status is **503**. The API does not save the submitted message,
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

From the repository root:

```sh
nvm install
nvm use
npm install --global pnpm@12.14.0
pnpm install --frozen-lockfile
cp -n backend/.env.example backend/.env
cp -n frontend/.env.example frontend/.env
```

The copy commands preserve existing files. If you already have env files,
update them to the current examples: the old global model and prototype
storage variables are not supported. No prototype data is migrated automatically.

The backend requires these four **platform** settings:

```dotenv
NODE_ENV=development
PORT=4000
CORS_ORIGINS=http://localhost:5173
CHAT_STORAGE_PATH=./data/chats.json
```

Ports must be integers in 1–65535. Origins are normalized HTTP(S) origins,
separated by commas; wildcards and URL paths are rejected. Relative storage
paths resolve from `backend/`, consistently in development and compiled runs.
The parent directory is created when needed; `backend/data/` is ignored by Git.

The frontend requires a **public** API base, including `/api` but excluding
`/chats`:

```dotenv
VITE_API_BASE_URL=http://localhost:4000/api
```

A root-relative value such as `/api` is also supported when deployment routes
that prefix to the API. No development proxy is configured automatically.
Restart after env changes. Production frontend values are embedded during build;
changing them requires rebuilding. Never put secrets in `VITE_*` settings.
See [configuration](docs/configuration.md) for validation and precedence.

## Run and verify

```sh
pnpm dev
```

This builds the internal packages, then starts their watchers and both the
frontend and backend. With the examples, open `http://localhost:5173`; the API
list endpoint is `http://localhost:4000/api/chats/list`. Ctrl+C stops the group.
If Vite selects another port, explicitly add that origin to `CORS_ORIGINS` and
restart the backend. Requests with unknown Origin headers receive 403;
requests without Origin remain available to local tools.

| Command                                | Purpose                                                        |
| -------------------------------------- | -------------------------------------------------------------- |
| `pnpm dev:frontend`                    | Run the React application and its library watchers.            |
| `pnpm dev:backend`                     | Run the API and shared-library watcher.                        |
| `pnpm build:packages`                  | Compile internal libraries.                                    |
| `pnpm typecheck`                       | Check all workspace packages.                                  |
| `pnpm lint`                            | Run current frontend lint rules; backend lint arrives in P0.5. |
| `pnpm test`                            | Run backend, frontend configuration/HTTP and React tests.      |
| `pnpm --filter frontend test:ui:watch` | Watch React component tests during development.                |
| `pnpm build`                           | Build libraries, the backend and the React application.        |
| `pnpm --filter backend start`          | Run the compiled API after building.                           |
| `pnpm --filter frontend preview`       | Preview the already-built frontend.                            |

Tests need no real model or provider credentials. They use temporary storage
and local ports. The current Vite bundle-size warning is documented and remains
outside P0.3. JSON persistence is not safe for concurrent writers; PostgreSQL
work is planned in phase 2.

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
- [Automated test foundations](docs/testing.md)
- [Repository and test rules](AGENTS.md)
- [Architecture and MVP boundaries](docs/architecture.md)
- [Execution roadmap](docs/roadmap.md)

## License

The project package metadata currently declares MIT; adding the repository
license file is tracked in P0.6.
