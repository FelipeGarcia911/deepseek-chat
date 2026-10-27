# Automated test foundations

P0.4 migrates the P0.2/P0.3 regression suite to TypeScript and one runner,
Vitest, across both applications. The goal is sustainable protection of
observable behavior and important decisions. Test count alone is not a
quality measure.

## Mandatory test rules

These rules also appear in the root [AGENTS.md](../AGENTS.md) so future agent
sessions apply them automatically.

1. Do not add comments to test files or setup. Use descriptive names and
   readable assertions; keep explanations in this document.
2. Start every `test` and `it` name with `should`, followed by the expected
   behavior in English, including generated and parameterized names.
3. Require at least **90% statements, branches, functions and lines**, for
   each application and every production source file. Include source files
   even when no test imports them. Exclude only declarations and test code.
   Never lower thresholds or hide untested code to pass coverage.

Run `pnpm test:coverage` to enforce the thresholds and generate text, JSON
summary and HTML reports under each application's ignored `coverage/`
directory. The command runs both applications and `@chat-app/shared` even if
one fails. Ordinary `pnpm test` runs behavior checks without collecting
coverage; its success alone does not satisfy the coverage requirement.
`@chat-app/ui` must meet the same rule when it gains behavior.

Backend tests need the Compose PostgreSQL (`docker compose up -d --wait`) or a
server named by `TEST_DATABASE_URL`. Each database test creates and drops its
own database; see [database](database.md#tests).

Run the complete suite from the repository root:

```sh
pnpm test
```

The root script builds the internal libraries and runs `vitest run` in both
applications. Tests import TypeScript from `src` directly. Only the backend
process suite builds and launches the compiled executable, because startup,
dotenv and operating-system signals are part of that suite's contract.

## Tooling and compatibility

- **Vitest 5.0.5** runs Node and DOM tests, transforms TypeScript/TSX, supplies
  spies and cleanup hooks, and supports watch mode.
- **Vite 6.4.5** satisfies Vitest 5's Vite >=6.4 requirement. Vite remains on
  major version 6; the React plugin remains on its existing major version.
  The development-configuration and production-build regressions verify this
  toolchain update.
- **Supertest** exercises real Express apps without manually choosing a port,
  opening a listener or constructing URLs in HTTP tests. Internally it can
  bind an ephemeral listener, so it still needs permission to use local
  sockets. It does not start the production server process.
- **React Testing Library** renders real components and queries the DOM by
  role or visible text. **user-event** simulates typing and clicking.
- **jest-dom** adds readable assertions such as `toHaveValue`, `toBeDisabled`
  and `toBeInTheDocument`. **jsdom** supplies the DOM inside Node.

No Playwright, Cypress, MSW, model-provider double or second test runner is
introduced. Node's assertion library remains usable inside Vitest tests;
assertions and test runners have separate responsibilities.

See the official [Vitest guide](https://vitest.dev/guide/),
[Supertest documentation](https://github.com/forwardemail/supertest),
[React Testing Library](https://testing-library.com/docs/react-testing-library/intro/),
[user-event](https://testing-library.com/docs/user-event/intro/) and
[jest-dom](https://github.com/testing-library/jest-dom#with-vitest) documentation.

## Test pyramid and regression coverage

| Layer                     | Environment                                           | Existing behavior protected                                                                                                                                                                                                                                                                         |
| ------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit                      | Node                                                  | Backend/frontend configuration validation, accumulated errors, normalization, immutability and rejected-generation state. No network, files or child processes.                                                                                                                                     |
| HTTP integration          | Node, Supertest, real Express and ConversationService | Conversation creation for published, archived and undeployed Assistants, list/messages/deletion, cursor pagination, admin/runtime route separation, CORS, input validation, generation's 503 without history changes and isolation of two applications. Each test uses its own PostgreSQL database. |
| Contract                  | Node and the shared Zod schemas                       | UUID identifiers, title and message limits, page limits and cursors, rejection of prototype message shapes, strict request bodies, response shapes and tolerance of unknown problem codes.                                                                                                          |
| Dependency failure        | Node, Supertest and a failing service stub            | An untyped service failure produces `INTERNAL_ERROR` without internal details; a typed error keeps its stable code and status; the application remains usable.                                                                                                                                      |
| Component                 | jsdom and real React components                       | Button/Enter submission, empty input, Shift+Enter, message display, assistant Markdown, loading, conversation creation/navigation and recovery after creation failure.                                                                                                                              |
| Process/build integration | Node, child processes and local HTTP fixtures         | Imports without application side effects, executable env-file loading, process precedence, startup errors, port conflicts, SIGINT/SIGTERM draining, frontend service URL selection and production bundling.                                                                                         |

End-to-end browser testing is deferred. jsdom does not check layout, CSS
appearance or browser rendering. The setup supplies a no-op `scrollIntoView`
because jsdom has no scrolling layout engine; tests do not assert scrolling.

The 89 P0.2/P0.3 checks retain their intent. Configuration example-file checks
now belong to environment integration suites, keeping the parser unit suites
free from filesystem reads. Import regressions load source modules in a fresh
process; lifecycle regressions intentionally execute the built server.

Generation remains unavailable: HTTP returns `503 MODEL_NOT_CONFIGURED`,
without saving input or contacting a model. Successful chat flow here means
conversation CRUD, not successful generation. The frontend service regression
checks that the 503 is propagated. A Redux test additionally confirms that a
rejected generation clears loading and adds no assistant answer. The
prototype's optimistic user bubble remains client-only. Model Gateway
contracts and provider doubles belong to P3.1.

## Test doubles: choose the smallest useful substitution

- A **stub** supplies a controlled result or error. The failing backend
  service is a stub, as is Home's controlled creation result.
- A **fake** is a simplified working implementation, such as an in-memory
  repository. P0.4 does not need a fake repository or model provider.
- A **spy** records calls. `vi.spyOn` can also temporarily replace a method's
  implementation, combining observation with a stub.
- A **mock** checks an expected interaction, such as asserting that a service
  was called once with the entered title.

Do not replace router, controller and storage together in the CRUD test:
that would stop checking whether those pieces actually integrate. Keep the
real PostgreSQL-backed service for successful HTTP flows, and inject a failing
service only when testing error handling. The stub tests exercise a
service throwing. A separate HTTP test points the application at a closed port
and checks that an unreachable database is a `DEPENDENCY_UNAVAILABLE` problem.
Persistence tests in `conversations.test.ts` run concurrent message admission
and completion against the real database to prove that only one Run is accepted
and only one response is stored.

Backend layers are tested at their natural boundary:

- **Repository integration** (`conversation-repository.test.ts`) runs every
  query against real PostgreSQL. Repositories are never faked in these tests.
- **Application service units** (`conversation-service.test.ts`) use a complete
  typed fake store whose unused methods throw. They cover rules that are hard to
  provoke through a real database, such as a row disappearing between two reads.
- **HTTP** tests stub the service only for error mapping; successful flows use
  the real stack.

Model providers are tested through reusable contract suites in
`backend/test/support/model-contract.ts`. Each suite registers the behavior any
provider must guarantee; `model-gateway.test.ts` runs it against the
deterministic fakes, and each real adapter will run the same suite.

Tests follow the repository rule against type assertions: invalid values for
`CHECK` constraints are inserted with raw SQL, Node addresses are narrowed with
`assert.ok`, and fakes implement every method instead of being cast.

Supertest starts a server when a request is created, so tests that loop over
several requests store functions that create them, not the requests themselves.

## Reading a test

Use arrange, act, assert:

1. **Arrange:** Render Home with a new Redux store, a MemoryRouter and a
   controlled creation promise. The component, thunk, reducer and router are
   real; only the HTTP service method is replaced.
2. **Act:** Type a title and click Create Chat. While the promise is pending,
   assert that the form is disabled and its loading indicator exists.
3. **Assert:** Resolve the promise and await the destination heading. Check
   that the conversation was added to the store. In the failure case, return
   null, matching the current service contract, and check that the title is
   preserved, the form is usable and no conversation or navigation occurs.

This test protects observable behavior without depending on private component
state or CSS classes. The current creation UI logs errors; it does not yet
show a visible error message. Existing Spanish UI labels remain lookup values,
while test descriptions, identifiers and documentation are English.

## Configuration, isolation and cleanup

`backend/vitest.config.mts` runs backend tests in Node. Its `.mts` extension
keeps the tool configuration ESM while the production backend remains CommonJS.
`frontend/vitest.config.ts` defines two Vitest projects:

- `node`: parser, Redux, environment, HTTP-service and build regressions.
- `ui`: TSX components in jsdom, with Testing Library cleanup and jest-dom.

Both frontend projects have an explicit public `/api` test configuration.
Tests of a custom API location override and restore it. They do not depend on
the developer's env file to select the component-test API URL. The separate
Vite regressions still exercise real configuration validation and bundling.

Vitest transforms TypeScript but does not replace type checking. Each app has
`tsconfig.test.json`, included in its `typecheck` script. The backend build
includes only `src`; tests do not enter its deployment output.

Tests use fresh Redux stores and per-test PostgreSQL databases, restore spies and env
overrides, close HTTP/Vite fixtures and terminate child processes. Process
fixtures wait for stdout/exit events instead of sleeps. Timeouts are failure
bounds, not synchronization delays. Only lifecycle tests and the frontend's
local HTTP-service fixture manage ports explicitly. No test requires internet,
Ollama, provider credentials or personal conversation data.

## Commands

Run from the repository root:

```sh
# Complete suite with library prerequisites.
pnpm test

# Backend: compile internal packages first on a clean checkout.
pnpm build:packages
pnpm --filter backend test
pnpm --filter backend test:watch

# All frontend tests, or one environment only.
pnpm --filter frontend test
pnpm --filter frontend test:node
pnpm --filter frontend test:ui
pnpm --filter frontend test:ui:watch

# One test file.
pnpm --filter frontend test:ui src/pages/Home.test.tsx

# Check application and test types.
pnpm typecheck
```

`vitest run` exits with 0 on success and nonzero on failed assertions or setup.
`pnpm test` propagates failures; watch mode is an explicit development command.

## Verification

The migrated baseline contains 102 passing checks: 67 backend, 27 frontend
Node and 8 React checks. The additional cases cover missing behavior; preserving
the existing regression contracts is the migration's main safeguard.
Frozen offline installation, changed-file formatting, typecheck, current lint
and production builds pass. The suite also passes with shuffled execution
using seed `20261026`. A deliberate temporary failing assertion confirmed that
root `pnpm test` propagates exit code 1; that probe was removed afterward.
Backend lint and a unified root verification command remain P0.5 work.
The existing frontend bundle-size warning remains outside this task.

## Coverage baseline after adopting the 90% rule

At the initial P0.4 commit, behavior checks passed but coverage did not yet
meet the new gate. The follow-up section below records its resolution.

| Application | Statements | Branches | Functions | Lines  |
| ----------- | ---------- | -------- | --------- | ------ |
| Backend     | 69.72%     | 72.05%   | 68.29%    | 70.34% |
| Frontend    | 37.50%     | 56.62%   | 32.83%    | 39.24% |

These are aggregate measurements; the gate also checks every file. Missing
coverage includes storage error paths, application composition, frontend
services, reducers and several components. The executable's subprocess
regressions are not merged into the Vitest worker's coverage report, so
`server.ts` reports 0% despite those behavior checks passing. The Vite SSR
service regression also runs outside the normal Vitest module pipeline.
Those paths need measured coverage before the gate can pass; they must not
be excluded to inflate the result.

## P0.4 coverage follow-up

The initial coverage gap above is resolved by the complementary test change.
All production files remain included, including the unused Web Vitals helper;
thresholds and coverage exclusions are unchanged. The suite has 131 passing
checks: 79 backend and 52 frontend.

| Application | Statements | Branches | Functions | Lines  |
| ----------- | ---------- | -------- | --------- | ------ |
| Backend     | 98.37%     | 98.52%   | 97.56%    | 98.25% |
| Frontend    | 100%       | 98.79%   | 100%      | 100%   |

Every source file meets all four 90% thresholds. Remaining uncovered source
includes the executable-only startup catch and one defensive input fallback;
those remain in the denominator.

`main` is explicitly exported from `server.ts` so source-level startup tests
can invoke the same lifecycle logic as the executable. Importing it still
starts nothing. Tests supply a controlled HTTP server and fake clock to check
signal cleanup, idempotent shutdown, listener/close failures and the forced
shutdown deadline. Existing subprocess tests independently retain coverage of
actual startup, dotenv and operating-system signals. No subprocess coverage
is claimed or silently merged; direct source tests measure the shared logic.

Frontend service and Redux tests check existing client response handling with
controlled transport/service results. They do not introduce a ModelProvider
contract or assert that the deployed generation endpoint succeeds. App-level
component tests exercise the real router, store, layout, sidebar and history.
Storage tests cover restoration, missing/invalid data, unknown conversations
and the prototype's logged write failures.

The generation HTTP test allows only loopback destinations and checks the
unchanged history and 503 contract. It does not depend on how many internal
HTTP requests Supertest uses.

## P0.5 quality gate integration

`pnpm verify` includes coverage after format, lint and typecheck, before the
production build. See [quality gates](quality-gates.md) for the full sequence
and current results. P0.5 retires the unused Web Vitals helper, dependency and
its three tests together. The globals follow-up adds two boundary regression
checks; 130 checks pass and every production file still
meets all four 90% thresholds. The P0.4 follow-up above remains an independent
verification with Web Vitals included.
