# Backend composition and process lifecycle

P0.2 introduced explicit construction and startup boundaries. P0.3 refines them
with [platform configuration](configuration.md) and removes the prototype's
direct model composition. See the [roadmap](roadmap.md) for the task sequence.

## Responsibilities

| File                                        | Responsibility                                                                                                                              |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/config.ts`                     | Pure `loadConfig(env): AppConfig`; validation and normalization only.                                                                       |
| `backend/src/server.ts`                     | Loads dotenv at executable startup, validates the process environment once, starts HTTP and handles shutdown or startup failure.            |
| `backend/src/composition.ts`                | Receives `AppConfig`, prepares the configured storage parent, initializes `ChatService` and constructs the app. No provider is constructed. |
| `backend/src/app.ts`                        | Receives controller dependencies and only the HTTP environment/origin settings; constructs middleware and routers without listening.        |
| `backend/src/controllers/ChatController.ts` | Receives the narrow storage methods named by `ChatServiceMethod`; exposes CRUD and the explicit unconfigured-model response.                |
| `backend/src/routes/`                       | Creates routers from the supplied controller rather than importing global service instances.                                                |
| `backend/src/services/ChatService.ts`       | Receives an absolute file path and initializes storage explicitly; never reads environment variables.                                       |

The composition root chooses and connects concrete implementations. There is
no DI container and no current model dependency. Imports of app, composition,
configuration, controllers and services do not load dotenv, read storage,
create directories or open ports.

`server.ts` loads dotenv only when executed as the entry point. It passes
`process.env` once to the pure parser, then passes `AppConfig` explicitly into
composition. The parser's node environment and CORS list are passed to HTTP
setup; the storage service receives only its absolute path. Application services,
controllers and routes do not inspect process environment.

Storage is initialized before listening. Relative `CHAT_STORAGE_PATH` values
resolve from the backend package, so source and compiled execution select the
same file. `backend/data/` is ignored by Git. No prototype path fallback or
automatic data migration is provided.

## HTTP behavior

CRUD remains available without any configured model. The generation endpoint
returns HTTP 503 with code `MODEL_NOT_CONFIGURED` and an explanatory `error`
string. It does not save user input, construct an assistant answer or make an
external request. The direct Ollama service and its controller/composition
dependencies are removed. The future model contract is intentionally deferred
to P3.1, rather than replaced with a temporary adapter.

Configured CORS origins and preflight requests are accepted. Unknown origins
receive 403 before handlers run; requests without Origin remain supported.
Authentication and the final error taxonomy are separate future tasks.

## Shutdown

SIGTERM and SIGINT stop new connections and allow active HTTP requests to
complete. After the listener closes, signal handlers and the shutdown timer
are removed. The fixed ten-second grace period forces an unsuccessful exit if
requests cannot finish. Invalid configuration, unreadable env files and listener
binding failures also produce exit code 1.

## Tests and limits

`pnpm test` builds internal libraries and runs both applications' focused tests
with Vitest. Unit and Supertest HTTP tests import source TypeScript directly;
only the process suite builds the server executable. Lifecycle
tests send an incomplete JSON request, request shutdown and then complete the
body, proving that accepted requests drain without depending on a model.
Other checks cover side-effect-free imports, startup configuration, CORS,
CRUD, immutable configuration and generation rejection without persistence.

Tests use temporary files, independently composed apps and local HTTP ports.
No Ollama instance, fake model provider or provider contract is required.
Frontend/component coverage is documented in [test foundations](testing.md);
backend lint is part of the shared [quality gates](quality-gates.md).

The file store still replaces complete history, treats read errors as an empty
store and logs write failures without propagating them. It is not suitable
for concurrent writers or multiple API processes; persistence work will
replace it. Request validation, application services, authentication and
structured telemetry remain in their assigned roadmap phases. The previous
Vite bundle-size warning remains.

References: [Express application API](https://expressjs.com/en/4x/api/),
[Express graceful shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown/),
[Node HTTP lifecycle](https://nodejs.org/api/http.html#serverclosecallback),
[automated test foundations](testing.md).
