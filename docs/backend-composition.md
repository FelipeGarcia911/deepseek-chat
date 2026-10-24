# Backend construction and process lifecycle

Task: P0.2 in the [roadmap](roadmap.md). This refactor creates a testable
application boundary while retaining the existing chat routes and JSON store.

## Acceptance criteria

- Importing application modules does not open a port, load environment files,
  create global service instances or read chat storage.
- Express can be constructed with explicit controller dependencies.
- The executable entry point owns startup and shutdown.
- Existing routes work with an injected model, including dependency failure.

## Responsibilities

| File                                        | Responsibility                                                                                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `backend/src/app.ts`                        | `createApp(dependencies)` constructs Express middleware, a controller and routers. It returns an app without listening.                                |
| `backend/src/composition.ts`                | `createApplication()` creates the real JSON and Ollama services, awaits storage initialization and supplies them to `createApp`.                       |
| `backend/src/server.ts`                     | Loads `.env`, requests the composed app, starts HTTP and handles startup failure, SIGTERM and SIGINT. Importing the file does not execute startup.     |
| `backend/src/controllers/ChatController.ts` | Receives the narrow service methods it uses through `ChatControllerDependencies`. Handler arrow functions retain the instance when Express calls them. |
| `backend/src/routes/`                       | Router factories register handlers from the supplied controller instead of importing a global instance.                                                |
| `backend/src/services/`                     | Exports service classes; constructors receive their settings and do not load `.env` or start file reads.                                               |

The composition root is the place where concrete implementations are selected
and connected. Production uses the existing file store and Ollama client;
tests use temporary file stores and deterministic model substitutes. No DI
container is needed: passing objects through constructors and functions makes
the wiring visible.

Controller dependencies currently use TypeScript `Pick` to describe only the
existing public service methods; the `ChatServiceMethod` enum names the allowed
chat-service keys. Type-only imports disappear at compilation,
so importing a controller does not construct either service. This is a small
preparatory boundary; provider-independent model contracts and repository
interfaces remain in their respective roadmap phases.

## Initialization and shutdown

Startup order is explicit:

1. Load environment values from the process working directory.
2. Construct services with the storage path, Ollama URL and model name.
3. Await the initial chat-history load.
4. Construct Express and open the HTTP listener.

Awaiting storage initialization removes the race between the first HTTP
request and the initial file read. The existing path calculation is retained:
`LOGS_PATH` is resolved with `path.join` relative to the services directory.
The default remains `../logs/chats.json`. Typed configuration and path-policy
improvements belong to P0.3 and the persistence work.

SIGTERM and SIGINT stop new connections and allow active HTTP requests to
complete. After the server closes, signal handlers and the shutdown timer are
removed. A fixed ten-second grace period bounds shutdown; exceeding it forces
connections closed and exits unsuccessfully. Missing required model settings
or a listener binding error also produces exit code 1.

The runtime behavior remains HTTP JSON without streaming. The generic Express
error message is now English (`Internal server error`); existing controller
error responses retain their messages and status codes. Successful requests
no longer print message or model-response content to the console. Structured
logging, comprehensive redaction, cancellation of upstream generation and
configurable model timeouts remain future work.

## Running the checks

From the repository root:

```sh
nvm use
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

`pnpm test` builds internal libraries, compiles the backend and runs its
`test/*.test.cjs` files with Node's built-in test runner. No test dependency
was added. Tests use generated JavaScript so they exercise the same module
format as production. Full backend/frontend test foundations remain P0.4;
existing linting still covers only the frontend until P0.5.

The focused regression tests cover:

- Imports without listeners, storage reads or environment loading.
- List, create, history, delete and successful message requests.
- Persisted user/assistant messages and existing invalid-input responses.
- Injected model failure and independent app instances.
- SIGTERM/SIGINT draining an active generation against a local fake provider.
- Startup failure from missing model settings or an occupied port.
- Exclusion of synthetic message and response text from successful request logs.

HTTP tests open ephemeral local ports and remove temporary files and processes
on completion. They require no running Ollama instance or real model. This
makes dependency injection observable: model failure is controlled by the test
rather than by the developer's local machine.

## Remaining limits

The file store still replaces the entire history, treats read errors as an
empty store and logs write failures without propagating them. This task does
not make it safe for concurrent writers or multiple API processes. Controllers
still orchestrate persistence and generation, and broad error handling remains.
Those changes belong to the contracts, persistence and model-gateway phases.
The existing Vite bundle-size warning also remains.

References: [Express application API](https://expressjs.com/en/4x/api/),
[Express graceful shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown/),
[Node HTTP server lifecycle](https://nodejs.org/api/http.html#serverclosecallback)
and [Node test runner](https://nodejs.org/api/test.html).

## Verification result

All ten backend regression and lifecycle tests passed with Node 26.12.1.
The ts-node development entry also started and returned the initialized chat
list. Formatting checks, local documentation links, workspace typecheck,
existing lint and the full build passed. The existing Vite size warning
remains; no real Ollama instance was required for these checks.
