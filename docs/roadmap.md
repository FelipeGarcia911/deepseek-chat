# AI Chat Platform — product, engineering and learning roadmap

**Repository:** [FelipeGarcia911/deepseek-chat](https://github.com/FelipeGarcia911/deepseek-chat)

**Reviewed revision:** `7dc3dc6380ad62683e8ca5ab22186f647e9fb493` (`main`, October 24, 2026)

**Roadmap scope:** MVP of a single-workspace platform for configuring, versioning, publishing and monitoring enterprise RAG chatbots.

**Learning goal:** understand and execute the complete lifecycle of a production-oriented AI product while producing credible portfolio evidence.

## 1. Product definition

### Product promise

> A platform to configure, version, publish and monitor production-oriented RAG chatbots.

The MVP is complete when an administrator can:

1. Create an Assistant.
2. Configure its instructions, model and generation parameters.
3. Upload documents and connect a knowledge base.
4. Test the current draft in a Playground.
5. Publish an immutable version.
6. Promote that version to Development, Staging or Production.
7. Share one stable public URL that resolves the current Production version.
8. Inspect conversations, retrieval evidence, latency, usage and failures.
9. Publish a new version or roll back without changing the public URL.

### MVP boundaries

Included:

- One administrator and one automatically created Workspace.
- Multiple Assistants.
- Draft configuration and immutable versions.
- Development, Staging and Production aliases.
- Stable public chat URLs.
- Ollama plus one production-capable hosted provider selected through an ADR.
- One knowledge base per Assistant.
- RAG with citations.
- Basic guardrails.
- Conversation and run inspection.
- Evaluation, telemetry, automated tests, CI/CD and one deployed environment.

Explicitly deferred:

- Functional multitenancy, billing, quotas and complex roles.
- WhatsApp, Slack and other external channels.
- Tools, autonomous agents and human approval workflows.
- A/B traffic splitting and advanced experimentation.
- Multiple knowledge bases per Assistant.
- Multi-agent orchestration.
- Kubernetes, microservices, Kafka and event sourcing.

## 2. Execution and learning method

Tasks are ordered by dependency. Do not begin a later phase until the previous phase exit gate passes.

For every task:

1. Read the relevant official documentation before implementation.
2. Write or confirm the acceptance criteria.
3. Record a short ADR when the decision has meaningful alternatives.
4. Implement the smallest complete vertical change.
5. Add automated tests with the implementation.
6. Run format, lint, typecheck, tests and build.
7. Document what was learned, trade-offs and remaining risks in the pull request.

Prefer one coherent commit per task. A task may use two commits when a preparatory refactor must remain independently reviewable. Avoid commits that mix unrelated formatting, dependencies and behavior.

### Definition of done for every implementation task

- Acceptance criteria pass.
- Success and relevant failure paths are tested.
- No secrets or personal message content are committed or exposed in logs.
- Public contracts and configuration changes are documented.
- Existing quality gates remain green.
- The commit and pull request explain _why_ the change exists, not only what changed.

## 3. Current baseline

Already completed at the reviewed revision:

- Node.js 26 runtime declaration.
- Migration to pnpm 12.
- Root workspace coordinating `frontend` and `backend`.
- Root development, build, typecheck and frontend lint commands.
- Reproducible root lockfile.
- Successful frontend and backend builds and type checks.
- A migration document with validation results.

Still incomplete or only partial:

- Web Vitals code exists but is not invoked or exported anywhere.
- Backend lint, tests and CI do not exist.
- The API URL remains hard-coded in the frontend.
- JSON persistence remains unsafe for concurrent or deployed execution.
- Ollama remains coupled directly to the controller.
- There is no platform domain: Assistant, Draft, Version, Environment, Deployment, Run or Knowledge Base.
- There is no streaming, RAG, evaluation, structured telemetry, authentication or deployment pipeline.

---

# Phase 0 — trustworthy engineering baseline

**Objective:** make the existing application safe to change before introducing new product concepts.

### P0.1 — Document the current and target architecture

**General description:** Create a concise architecture document containing the current containers, the target modular-monolith boundary, external dependencies, principal flows and explicit non-goals.

**Acceptance criteria:**

- `docs/architecture.md` contains current and target diagrams.
- Frontend, API, PostgreSQL/pgvector, model providers and telemetry boundaries are visible.
- MVP scope and deferred capabilities match this roadmap.
- ADR-001 records the decision to use a modular monolith.

**Technical justification and learning:** Architecture documentation establishes a shared model before code is reorganized. Learn C4-style diagrams, system boundaries and the difference between modularity and distributed deployment.

**Suggested commit:** `docs: define target platform architecture`

### P0.2 — Separate application construction from process startup

**General description:** Make the Express application constructible without opening a network port and remove global service creation from controllers.

**Acceptance criteria:**

- `app` can be imported by tests without starting a server.
- `server` is responsible only for process startup and shutdown.
- Controllers receive their dependencies through an explicit composition boundary.

**Technical justification and learning:** Testable boundaries are required for integration tests and provider substitution. Learn composition roots, dependency inversion and lifecycle management.

**Suggested commit:** `refactor(api): separate app composition from server startup`

### P0.3 — Introduce validated platform configuration and remove global model configuration

**General description:** Validate the deployed application's platform settings before startup, remove the prototype's global Ollama composition, and keep the platform usable before Model Profiles exist. Backward compatibility with the prototype is not required.

**Configuration ownership:**

- Platform environment variables configure the deployed application: node environment, HTTP port, allowed CORS origins and current chat storage path.
- Persisted Model Profiles will configure provider connections and credential references.
- Assistant Drafts and immutable Versions will configure instructions, generation parameters, knowledge and chatbot behavior.
- Provider credentials remain server-side and are referenced rather than copied into Assistant Versions.
- The MVP has one React application with public chat (`/c/:assistantSlug`) and administration (`/admin/*`) surfaces. UI boundaries do not require separate applications or deployments.

**Implementation requirements:**

- Provide a pure `loadConfig(env): AppConfig` function with no dotenv, filesystem, listener or process-environment side effects.
- Require `NODE_ENV`, `PORT`, `CORS_ORIGINS` and `CHAT_STORAGE_PATH`; do not silently replace missing or invalid values with defaults.
- Convert `PORT` to an integer in 1–65535. Normalize and deduplicate comma-separated HTTP(S) CORS origins, rejecting malformed values and wildcards.
- Resolve relative storage paths from the backend package directory, identically in source and compiled runs; support absolute paths and return immutable typed configuration, including its origin list.
- Load dotenv only at executable startup, read `process.env` once through `loadConfig`, and pass only the relevant validated settings into composition and HTTP setup.
- Rename the prototype storage setting to `CHAT_STORAGE_PATH`; remove global model/provider variables and generation parameters from platform configuration and examples.
- Remove direct Ollama service construction, its controller dependency and the unused service. Do not introduce a fallback, legacy adapter, local default model or the future ModelProvider interface.
- Keep the generation endpoint available but return `503` with `{ code: "MODEL_NOT_CONFIGURED", error: "No Model Profile has been configured." }`. Do not persist the submitted message, fabricate a response or make an external request.
- Continue supporting conversation list, creation, history and deletion without a model.
- Replace wildcard CORS with configured origins. Reject unknown origins before handlers, support appropriate requests without an Origin header, and handle preflight.
- Make `VITE_API_BASE_URL` the frontend's only API-location source. Accept HTTP(S) or supported root-relative base URLs, normalize trailing slashes, type the Vite variable and fail clearly on malformed configuration.
- Keep secrets out of `VITE_*`; validate Vite configuration before development startup and production builds as well as at the frontend configuration boundary.

**Acceptance criteria:**

- Missing, blank or invalid platform settings fail before listening with actionable errors that do not print supplied values.
- Backend services, controllers and routes do not read `process.env`; importing app, composition, controllers or configuration does not load dotenv, read files or open ports.
- The backend starts without a configured model and generation returns the documented 503 without changing history or attempting a provider request.
- CORS follows the validated allowlist, including accepted, rejected, preflight and no-Origin requests.
- Two applications can be composed with independent storage, CORS and node-environment settings.
- Tests cover valid configuration, required fields, invalid and out-of-range ports, valid/invalid origins, predictable storage paths, input immutability, startup and frontend API configuration.
- Root tests, existing lint, typecheck and build pass.
- Both environment examples have clean values and separate comments. README, configuration, composition and architecture documentation describe the new boundary, single React application and temporary unconfigured-model state.

**Out of scope:** PostgreSQL, Model Profile persistence, provider adapters, admin configuration screens, the final ModelProvider interface (P3.1), streaming, final error taxonomy (P1.4), authentication and compatibility with the old global Ollama environment settings.

**Technical justification and learning:** Platform deployment settings and versioned chatbot settings have different owners and lifecycles. Learn pure configuration boundaries, startup validation, dependency injection, CORS, immutable configuration and build-time versus runtime variables without turning a prototype provider into a global product assumption.

**Suggested commit:** `feat(config): validate platform configuration`

### P0.4 — Establish automated test foundations

**General description:** Turn the existing P0.2/P0.3 regression checks into a sustainable TypeScript, HTTP and React testing strategy. Preserving observable behavior matters more than increasing the number of tests.

**Implementation requirements:**

- Use Vitest as the single runner for both applications and migrate existing `.test.cjs`/`.test.mjs` files to `.test.ts`/`.test.tsx`, preserving their regression intent.
- Use a compatible Vite/Vitest combination. The implementation uses Vite 6.4.5 and Vitest 5.0.5, with no Vite major-version migration.
- Import source TypeScript directly for unit and HTTP tests. Compile the executable only for process/lifecycle regressions.
- Use Supertest for Express integration without manual listener or port management in HTTP tests. Supertest may bind an ephemeral local listener internally.
- Use React Testing Library, user-event, jest-dom and jsdom for real component behavior.
- Separate pure unit tests, HTTP integration, components and process/build regression tests. Keep unit tests free of network, filesystem and subprocess work.
- Keep successful HTTP integration connected to the real ChatService and temporary JSON storage. Inject a failing service when testing dependency failures; do not mock every layer.
- Include test files in typecheck and provide explicit single-run and watch commands.

**Acceptance criteria:**

- Root `pnpm test` runs backend and frontend TypeScript tests through Vitest and propagates deterministic exit codes.
- Existing configuration validation, accumulated errors, normalization, immutability, CORS, startup, shutdown, API URL and build regressions retain their coverage.
- Supertest covers create/list/history/delete, generation's stable 503 without history changes, dependency failure and isolation between two applications.
- React tests cover button/Enter submission, whitespace rejection, user messages, assistant Markdown, loading, conversation creation/navigation and recovery after a failed request.
- Rejected generation clears frontend loading and adds no fabricated assistant answer. Generation remains deliberately unavailable until Model Gateway work; no fake provider contract is introduced.
- Tests use isolated stores, dependencies and temporary data, restore mocks/environment, clean up resources, and need no internet, Ollama, sleeps or execution order.
- Typecheck, current lint, format checks and builds pass. No Playwright, Cypress or MSW is required yet.
- Test names begin with `should`, tests/setup contain no additional comments, and coverage reaches at least 90% for statements, branches, functions and lines in every production source file. `pnpm test:coverage` enforces the coverage gate; passing behavior checks alone does not complete this requirement.
- [Testing documentation](testing.md) explains the pyramid, test doubles, commands, compatibility and remaining limits. Code and documentation remain English.

**Technical justification and learning:** One runner and typed tests make future refactors easier to maintain. Learn how unit, integration and component tests protect different boundaries; distinguish stubs, fakes, spies and mocks; verify observable behavior instead of private implementation details.

**Suggested commit:** `test: establish api and web test foundations`

### P0.5 — Complete repository quality gates

**General description:** Add backend linting, consistent formatting and one root verification command.

**Implementation:** [Repository quality gates](quality-gates.md) documents shared tooling, Express 4 type alignment, Web Vitals retirement, the visible bundle-size warning and `pnpm verify`. Verification includes the unchanged per-file 90% coverage gate; the complementary P0.4 change first closes coverage independently.

**Acceptance criteria:**

- Root commands cover format check, lint, typecheck, test and build for both applications and shared tooling. `pnpm verify` runs the complete sequence and fails on insufficient coverage or lint warnings.
- Express runtime and type packages use compatible major versions.
- Web Vitals is either deliberately connected to a reporting boundary or removed until observability is implemented.
- Existing bundle-size warnings are documented rather than ignored.

**Technical justification and learning:** A build alone does not enforce maintainability. Learn static analysis, dependency compatibility and the role of fast feedback loops.

**Suggested commit:** `chore: complete repository quality gates`

### P0.6 — Add continuous integration and correct repository documentation

**General description:** Run the full verification sequence on pull requests and align the README with executable behavior.

**Implementation:** [Continuous integration](continuous-integration.md) describes the Ubuntu job, toolchain selection, unconditional frozen install, shared `pnpm verify` sequence, cache behavior and local clean-clone validation. The repository includes an MIT license; README HTTP checks explicitly distinguish the current list route from a future health contract. The [first hosted run for `0bf0579`](https://github.com/FelipeGarcia911/deepseek-chat/actions/runs/40393215009) completed successfully, satisfying the phase 0 exit gate together with clean-clone verification.

**Acceptance criteria:**

- GitHub Actions performs a frozen install, lint, typecheck, tests and build.
- Dependency caching does not bypass lockfile validation.
- README setup commands work from a clean clone.
- Health URLs and environment behavior are accurate.
- A real `LICENSE` file exists if the project remains MIT licensed.

**Technical justification and learning:** CI turns local conventions into enforceable repository policy. Learn reproducibility, workflow design and documentation as an operational interface.

**Suggested commit:** `ci: verify every pull request`

**Phase 0 exit gate:** A clean clone can be installed and fully verified with documented root commands; CI produces the same result.

---

# Phase 1 — platform domain and contracts

**Objective:** define the product language and stable contracts before persistence and screens multiply.

### P1.1 — Define the domain glossary and ownership rules

**General description:** Define Workspace, Assistant, Assistant Draft, Assistant Version, Environment, Deployment, Model Profile, Knowledge Base, Conversation, Message and Run.

**Implementation:** [Domain glossary and ownership](domain.md) defines each concept, lifecycle intent, domain parent, write-owning module, mutation rules and `workspaceId` invariants. It distinguishes the target from legacy Chat records, published-version execution from Draft Playground snapshots, and mutable Profiles/knowledge collections from published effective settings. Precise state machines and storage/contracts remain subsequent work.

**Acceptance criteria:**

- `docs/domain.md` defines every term and its lifecycle.
- “Chat” is no longer ambiguously used for both an Assistant and a Conversation.
- Each entity has one owner and clear mutable or immutable status.
- Future tenant ownership is represented by `workspaceId`, while the MVP creates only one Workspace.

**Technical justification and learning:** Ambiguous names create incorrect APIs and database schemas. Learn domain modeling, aggregates and how to preserve an extension point without implementing multitenancy.

**Suggested commit:** `docs: define platform domain model`

### P1.2 — Model state transitions

**General description:** Specify the allowed lifecycle for drafts, versions, deployments, documents, conversations and runs.

**Implementation:** [Platform lifecycle states](lifecycle.md) defines diagrams, guarded transitions, atomic results, invalid operations and race/recovery policies. Assistant responses have exact successful-Run provenance, at most one response per succeeded Run, and none for nonterminal/failed/cancelled/expired Runs; streaming output alone is not a confirmed Message.

**Acceptance criteria:**

- State diagrams cover publish, promote, roll back, ingestion, generation and failure.
- Invalid transitions are explicitly listed.
- A Conversation pins its execution target when it begins: a resolved Assistant Version for public/published previews, or an immutable Draft snapshot for Playground.
- Production promotion changes an alias, not the immutable version.
- Every committed assistant Message belongs to exactly the succeeded Run that produced it. A succeeded Run confirms at most one assistant Message; failed, cancelled and expired Runs confirm none. Completion and response linkage are atomic, including cancellation/timeout races and persistence failures.

**Technical justification and learning:** Lifecycle bugs are common when states are inferred from nullable fields. Learn explicit state machines, invariants and reproducible releases.

**Suggested commit:** `docs: specify platform lifecycle states`

### P1.3 — Decide API style and contract ownership

**General description:** Record how HTTP contracts are described, validated and shared between frontend and backend.

**Implementation:** [ADR-002](adr/002-share-runtime-validated-api-contracts.md) compares spec-first and code-first OpenAPI, shared types only, an RPC framework and shared runtime schemas. It selects Zod schemas in `@chat-app/shared` with inferred types, and defines `/api/v1` naming, UUIDv7 identifiers, RFC 9457 problem details with stable codes, expected-revision conflicts, `Idempotency-Key` replays and cursor pagination. The dependency and middleware arrive in P1.4; route namespaces in P1.5.

**Acceptance criteria:**

- ADR compares at least generated OpenAPI clients and a shared TypeScript contract package.
- One approach is selected with reasons and migration consequences.
- Error envelope, pagination and identifier conventions are defined.

**Technical justification and learning:** A control plane and a chat runtime evolve at different rates. Contract ownership prevents frontend/backend drift and accidental coupling.

**Suggested commit:** `docs: decide api contract strategy`

### P1.4 — Introduce request validation and typed errors

**General description:** Validate all existing API inputs and translate domain/dependency failures into stable HTTP responses.

**Implementation:** `@chat-app/shared` defines Zod schemas for the legacy chat routes (numeric legacy identifiers, titles of 1–120 trimmed characters, non-blank messages up to 4,000 characters, strict bodies) plus the error catalog. The backend validates params and bodies in one middleware, wraps async handlers once and maps `AppError`, body-parser and unexpected failures to RFC 9457 problems with `X-Request-Id`. Unknown chats return `NOT_FOUND`; storage writes happen before memory changes and fail as `DEPENDENCY_UNAVAILABLE`. The message route reads the chat identifier only from the path. The backend parses every success response with its schema before sending it, stripping undeclared members; the frontend parses responses with the same schemas and propagates failures. Problem titles are RFC 9110 reason phrases because `type` is `about:blank`. No current endpoint produces a conflict; the typed-error mapping is covered with `RUN_IN_PROGRESS`.

**Acceptance criteria:**

- IDs, titles and messages have explicit schemas and limits.
- The chat identifier comes from one source of truth.
- Not-found, validation, conflict, dependency and internal failures have stable codes.
- Controllers do not repeat broad `try/catch` blocks.

**Technical justification and learning:** Validation protects the domain boundary; typed errors prevent internal exceptions from becoming public contracts. Learn HTTP semantics and error taxonomy.

**Suggested commit:** `feat(api): validate requests and standardize errors`

### P1.5 — Split control-plane and runtime routes

**General description:** Establish separate route namespaces for administration and end-user chat while keeping one backend deployment.

**Acceptance criteria:**

- Administrative operations live under a versioned admin API.
- Public conversations use a separate versioned runtime API.
- Authentication expectations and rate-limit boundaries are documented for each group.
- No microservice split is introduced.

**Technical justification and learning:** The two surfaces have different security, latency and evolution requirements. Learn logical service boundaries inside a modular monolith.

**Suggested commit:** `refactor(api): separate admin and runtime contracts`

**Phase 1 exit gate:** The domain, state transitions and API conventions can explain the complete MVP flow without referring to UI implementation details.

---

# Phase 2 — durable data and application core

**Objective:** replace prototype storage with transactional persistence and domain-oriented modules.

### P2.1 — Select the PostgreSQL data-access approach

**General description:** Compare credible TypeScript database approaches and choose one for schemas, migrations, queries and tests.

**Acceptance criteria:**

- ADR compares Prisma, Drizzle and a query-builder or direct SQL alternative.
- Decision considers migrations, transactions, PostgreSQL features, type safety and learning value.
- Migration and rollback policy is documented.

**Technical justification and learning:** The choice shapes how clearly database behavior remains visible. Learn ORM trade-offs rather than selecting by popularity.

**Suggested commit:** `docs: select postgres data access strategy`

### P2.2 — Add PostgreSQL and migration infrastructure

**General description:** Create a local PostgreSQL dependency, migration runner and deterministic seed process.

**Acceptance criteria:**

- A clean database can be created entirely from versioned migrations.
- Seed creates the default Workspace and Development, Staging and Production environments.
- Startup does not silently mutate the schema.
- Database readiness is visible separately from process health.

**Technical justification and learning:** Production systems require an auditable schema history. Learn migrations, environment parity, readiness and seed boundaries.

**Suggested commit:** `feat(storage): add postgres migrations and seed data`

### P2.3 — Persist the core platform entities

**General description:** Implement the relational model for the Workspace, Assistants, Drafts, Versions, Environments and Deployments.

**Acceptance criteria:**

- Foreign keys, uniqueness, timestamps and version constraints enforce documented invariants.
- Drafts are mutable; published versions cannot be updated.
- Each environment has at most one active deployment per Assistant.
- Persistence tests prove immutability and ownership constraints.

**Technical justification and learning:** Database constraints preserve correctness even when several code paths evolve. Learn relational modeling and defense in depth.

**Suggested commit:** `feat(storage): persist assistant release model`

### P2.4 — Persist conversations, messages and runs

**General description:** Replace JSON storage with transactional conversation records connected to the deployed Assistant Version.

**Acceptance criteria:**

- Published-version Conversations pin `assistantVersionId` at creation; Draft previews need explicit snapshot targets rather than invented Version IDs.
- Message ordering is deterministic.
- A Run records status, provider/model identity, timing and errors without storing hidden reasoning.
- Assistant response Messages reference exactly one succeeded producing Run; uniqueness, ownership and atomic completion enforce at most one response per successful Run and none for other outcomes.
- Concurrent messages do not corrupt or reorder stored state.

**Technical justification and learning:** Conversation state and model execution have different lifecycles. Learn transactions, concurrency and audit-friendly execution records.

**Suggested commit:** `feat(storage): persist conversations messages and runs`

### P2.5 — Introduce repositories and application services

**General description:** Move persistence and use-case orchestration behind domain-oriented interfaces.

**Acceptance criteria:**

- Controllers contain transport translation, not business rules or SQL.
- Application services enforce state transitions.
- Repository integration tests use real PostgreSQL.
- Fake repositories are limited to focused unit tests.

**Technical justification and learning:** Separating use cases from transport and storage supports tests and later adapters without hiding domain decisions behind generic abstractions.

**Suggested commit:** `refactor(core): introduce domain application services`

### P2.6 — Retire JSON persistence safely

**General description:** Remove the file store after database parity is proven and decide whether prototype data needs migration.

**Acceptance criteria:**

- The application has one authoritative storage path.
- Existing prototype data is either migrated by a documented one-time tool or explicitly declared disposable.
- JSON storage code and obsolete environment variables are removed.

**Technical justification and learning:** Dual writes and indefinite compatibility code create hidden failure modes. Learn cutover planning and deliberate data-retention decisions.

**Suggested commit:** `refactor(storage): retire file based persistence`

**Phase 2 exit gate:** The current chat behavior works against PostgreSQL, and the new release-domain invariants are covered by integration tests.

---

# Phase 3 — model gateway and reliable chat runtime

**Objective:** make model execution configurable, provider-independent, streamable and observable.

### P3.1 — Define model capabilities and provider contracts

**General description:** Define internal contracts for chat generation, streaming, embeddings, model capabilities and provider errors.

**Acceptance criteria:**

- Application code depends on internal contracts rather than Ollama payloads.
- Chat generation and embeddings are separate capabilities.
- Capability metadata covers streaming, tool calling, structured output, vision and usage reporting.
- A deterministic fake provider supports tests.

**Technical justification and learning:** Providers differ in more than endpoint URLs. Capability modeling prevents a lowest-common-denominator abstraction and makes unsupported behavior explicit.

**Suggested commit:** `feat(ai): define model gateway contracts`

### P3.2 — Implement the Ollama adapter

**General description:** Move all Ollama request/response behavior into one adapter that implements the internal gateway.

**Acceptance criteria:**

- Controllers and use cases contain no Ollama-specific code.
- Base URL, model and safe generation parameters are configurable through a Model Profile.
- Errors are translated into gateway error types.
- Adapter contract tests cover success, invalid response, timeout and unavailable model.

**Technical justification and learning:** An adapter isolates vendor protocols while retaining a simple local development path. Learn ports/adapters and contract tests.

**Suggested commit:** `feat(ai): implement ollama model adapter`

### P3.3 — Build deterministic prompt assembly

**General description:** Construct every request from versioned instructions, conversation context and runtime policy without mutating stored history.

**Acceptance criteria:**

- System instructions are present on every request.
- Prompt inputs and policy versions are traceable.
- Raw message arrays are never mutated.
- Tests prove the exact role and ordering behavior.

**Technical justification and learning:** Reproducibility depends on knowing the complete input to the model. Learn context engineering and prompt lifecycle management.

**Suggested commit:** `feat(ai): assemble deterministic versioned context`

### P3.4 — Add streaming and cancellation

**General description:** Stream generation events from the provider through the API to the React client and propagate disconnects upstream.

**Acceptance criteria:**

- Text appears incrementally in the public and Playground chats.
- Browser cancellation or disconnect stops upstream generation.
- Completed, cancelled and failed runs have distinct terminal states.
- Partial output is handled deliberately and tested.

**Technical justification and learning:** Streaming changes transport, state management and failure semantics. Learn SSE or the selected streaming protocol, backpressure and abort propagation.

**Suggested commit:** `feat(runtime): stream and cancel model generations`

### P3.5 — Add timeout, retry and concurrency policies

**General description:** Bound model calls and protect the runtime from slow, unavailable or overloaded dependencies.

**Acceptance criteria:**

- Each provider call has a configurable timeout.
- Only explicitly retryable failures are retried with bounded backoff.
- Per-conversation concurrent generation is controlled.
- The UI receives actionable failure states rather than fabricated assistant text.

**Technical justification and learning:** LLM calls are slow and failure-prone compared with normal database operations. Learn resilience, idempotency and backpressure.

**Suggested commit:** `feat(runtime): enforce model resilience policies`

### P3.6 — Add context-budget management

**General description:** Ensure model input remains within configured limits as conversations grow.

**Acceptance criteria:**

- Request construction has an explicit token or conservative size budget.
- System instructions and recent relevant messages have documented priority.
- Truncation is deterministic and visible in Run metadata.
- Long-conversation tests prove the limit.

**Technical justification and learning:** Sending complete history eventually fails or becomes expensive. Learn context windows, token accounting and trade-offs between truncation, summaries and memory.

**Suggested commit:** `feat(runtime): enforce conversation context budgets`

### P3.7 — Select and implement one hosted provider

**General description:** Use an ADR to select OpenAI or AWS Bedrock, then implement the selected adapter to prove portability and support deployment.

**Acceptance criteria:**

- ADR compares operational fit, security, model availability, API shape, usage reporting and expected cost.
- The selected adapter passes the same contract tests as Ollama where capabilities overlap.
- Credentials are referenced securely and never stored in Assistant Versions.
- Changing Model Profile switches provider without changing conversation use cases.

**Technical justification and learning:** One local and one hosted provider provide credible evidence that the gateway is real, not speculative. Learn provider trade-offs, credential boundaries and capability negotiation.

**Suggested commit:** `feat(ai): add hosted model provider adapter`

**Phase 3 exit gate:** The same conversation use case works through Ollama and the selected hosted provider, including streaming, cancellation and failure reporting.

---

# Phase 4 — Assistant administration and Playground

**Objective:** allow an administrator to create and safely configure Assistants through the product UI.

### P4.1 — Add minimal administrator authentication

**General description:** Protect the administration surface with one production-appropriate identity flow while leaving public chat access separate.

**Acceptance criteria:**

- Unauthenticated users cannot access admin pages or APIs.
- The authenticated administrator belongs to the default Workspace.
- Sessions, logout and unauthorized API behavior are tested.
- No role-management UI or organization invitation flow is introduced.

**Technical justification and learning:** Even a single-workspace control plane changes production behavior and handles provider configuration. Learn authentication boundaries without prematurely building RBAC.

**Suggested commit:** `feat(auth): protect the administration surface`

### P4.2 — Build the Assistant list and creation flow

**General description:** Create the first administration pages for listing, creating, renaming and archiving Assistants.

**Acceptance criteria:**

- Admin can create an Assistant with a unique stable slug.
- List displays lifecycle and current environment deployments.
- Archive is reversible and does not delete conversation history.
- Empty, loading, error and success states are present.

**Technical justification and learning:** This is the first complete control-plane vertical slice. Learn product state modeling and API-driven UI behavior.

**Suggested commit:** `feat(admin): manage assistants`

### P4.3 — Build draft configuration

**General description:** Allow editing the Assistant instructions, Model Profile, generation parameters, context settings and public presentation.

**Acceptance criteria:**

- Draft changes never alter a published version.
- UI exposes only parameters supported by the selected model capability profile.
- Validation prevents invalid limits or unsupported combinations.
- Unsaved and saved state are clear.

**Technical justification and learning:** Dynamic provider capabilities must shape configuration without leaking provider payloads into the domain. Learn schema-driven forms and draft semantics.

**Suggested commit:** `feat(admin): configure assistant drafts`

### P4.4 — Add Model Profile administration

**General description:** Manage reusable provider/model settings separately from Assistant behavior.

**Acceptance criteria:**

- Admin can create and test an Ollama or hosted Model Profile.
- Profiles contain provider, model, endpoint reference and allowed defaults.
- Credentials are stored through a secret boundary, not returned to the browser.
- Dependency checks report reachable, unauthorized, unsupported and unavailable states.

**Technical justification and learning:** Separating infrastructure configuration from product behavior avoids duplicating secrets and provider settings across versions.

**Suggested commit:** `feat(admin): manage model profiles`

### P4.5 — Add a draft Playground

**General description:** Reuse the chat experience to test the mutable draft without publishing it.

**Acceptance criteria:**

- Playground clearly identifies the tested draft and model.
- Test conversations are separated from public production conversations.
- Admin can start a clean session after configuration changes.
- Run summary exposes latency, status and effective configuration.

**Technical justification and learning:** Configuration without immediate feedback creates unsafe releases. Learn preview environments and component reuse between admin and public experiences.

**Suggested commit:** `feat(admin): add assistant draft playground`

**Phase 4 exit gate:** An authenticated administrator can create an Assistant, configure a draft and test it against either available provider.

---

# Phase 5 — immutable releases and public delivery

**Objective:** create a reproducible promotion workflow and stable public chat experience.

### P5.1 — Publish immutable Assistant Versions

**General description:** Convert the current draft into a complete immutable snapshot with release metadata.

**Acceptance criteria:**

- Publish creates a monotonically identified version.
- Snapshot includes every output-affecting configuration except secret values.
- Published data cannot be modified through API or database repository methods.
- Admin can compare a draft with the latest published version.

**Technical justification and learning:** Reproduction and rollback require complete snapshots, not change logs alone. Learn immutable release artifacts and configuration provenance.

**Suggested commit:** `feat(releases): publish immutable assistant versions`

### P5.2 — Promote versions across environments

**General description:** Point Development, Staging and Production aliases to published versions.

**Acceptance criteria:**

- Only published versions can be promoted.
- Promotion is atomic and audited with actor, time and previous target.
- Admin UI shows the current version in each environment.
- Promotion does not mutate the version.

**Technical justification and learning:** Environment aliases decouple stable endpoints from releases. Learn deployment records, promotion workflows and auditability.

**Suggested commit:** `feat(releases): promote versions across environments`

### P5.3 — Implement rollback

**General description:** Restore an environment alias to a previously published compatible version.

**Acceptance criteria:**

- Admin can select and confirm a prior version.
- Rollback creates a new deployment record; history is preserved.
- New conversations use the restored version.
- Existing conversations remain pinned to the version with which they began.

**Technical justification and learning:** Rollback should be a normal deployment operation, not a database edit. Learn safe reversibility and session consistency.

**Suggested commit:** `feat(releases): support audited deployment rollback`

### P5.4 — Add the stable Production URL

**General description:** Publish each Assistant at one stable URL resolving its active Production deployment.

**Acceptance criteria:**

- `/c/:assistantSlug` resolves the current Production version when a conversation begins.
- Missing, archived or undeployed Assistants produce intentional public states.
- URL remains unchanged across promotions and rollbacks.
- Public configuration exposes branding but no internal settings or secrets.

**Technical justification and learning:** Stable addressing is the core delivery contract for customers while aliases preserve release flexibility.

**Suggested commit:** `feat(runtime): expose stable production chat urls`

### P5.5 — Add authenticated preview URLs

**General description:** Allow administrators to preview Development, Staging or a specific version without exposing those configurations publicly.

**Acceptance criteria:**

- Preview requires administrator authentication.
- URL identifies environment or version explicitly.
- Preview conversations are labeled and excluded from production analytics by default.
- Production URL cannot be coerced into loading an arbitrary version.

**Technical justification and learning:** Preview is necessary for release verification but creates a security boundary. Learn environment isolation and authorization of non-production artifacts.

**Suggested commit:** `feat(releases): add authenticated version previews`

**Phase 5 exit gate:** A draft can be published, promoted, accessed through one stable Production URL and rolled back while preserving conversation consistency.

---

# Phase 6 — knowledge base and RAG

**Objective:** ground responses in company information and make retrieval evidence inspectable and measurable.

### P6.1 — Design the knowledge and ingestion lifecycle

**General description:** Define supported formats, document states, deduplication, deletion, index versioning and failure recovery.

**Acceptance criteria:**

- ADR defines initial support for PDF, Markdown and plain text.
- Document states cover uploaded, processing, ready, failed and deleted.
- Content hash and ownership rules are documented.
- Assistant Versions reference a specific knowledge/index version.

**Technical justification and learning:** Versioning the prompt without versioning retrieved knowledge is not reproducible. Learn data lineage and ingestion state machines.

**Suggested commit:** `docs: design versioned knowledge ingestion`

### P6.2 — Add document upload and secure storage

**General description:** Allow the administrator to add and remove knowledge documents with explicit file controls.

**Acceptance criteria:**

- MIME type, extension and size are validated.
- Filenames cannot control storage paths.
- Document metadata and content hash are persisted.
- Upload UI reports progress, validation failures and processing state.

**Technical justification and learning:** File ingestion is an untrusted input boundary. Learn secure uploads, metadata handling and asynchronous UX.

**Suggested commit:** `feat(knowledge): upload and manage source documents`

### P6.3 — Implement parsing and chunking

**General description:** Extract normalized text and divide it into traceable chunks using a documented initial strategy.

**Acceptance criteria:**

- Every chunk maps to document and source location.
- Reprocessing the same content is idempotent.
- Parser failures are recoverable and visible.
- Chunking strategy and limitations are documented with examples.

**Technical justification and learning:** Retrieval quality depends heavily on chunk boundaries and metadata. Learn document parsing, idempotency and experimentable preprocessing.

**Suggested commit:** `feat(knowledge): parse and chunk documents`

### P6.4 — Add embeddings and pgvector indexing

**General description:** Generate versioned embeddings for chunks and store them in PostgreSQL with pgvector.

**Acceptance criteria:**

- Embedding provider, model and dimensions are recorded.
- Index can be rebuilt without losing source documents.
- Similarity results preserve source references.
- Index choice and expected data scale are documented.

**Technical justification and learning:** Embeddings are derived, model-dependent data and must be replaceable. Learn vector search, index trade-offs and data lineage.

**Suggested commit:** `feat(rag): index document chunks with pgvector`

### P6.5 — Implement retrieval and context assembly

**General description:** Retrieve relevant chunks, apply filters and assemble bounded model context.

**Acceptance criteria:**

- Results are restricted to the Assistant knowledge version.
- Retrieved chunk IDs, scores and timing are recorded on the Run.
- Retrieval respects an explicit item and token budget.
- Empty or low-confidence retrieval follows a defined behavior.

**Technical justification and learning:** Retrieval and generation must be independently observable. Learn semantic search, filtering, context packing and confidence limitations.

**Suggested commit:** `feat(rag): retrieve and assemble grounded context`

### P6.6 — Generate grounded answers with citations

**General description:** Require the Assistant to use retrieved evidence and expose source citations in the public chat.

**Acceptance criteria:**

- Citations resolve to source title and location.
- Unsupported claims are discouraged by policy and evaluated.
- When evidence is insufficient, the response communicates the limitation.
- Citation rendering is accessible and usable on mobile.

**Technical justification and learning:** RAG is useful only when users can inspect grounding. Learn attribution, answer-policy design and trust-oriented UX.

**Suggested commit:** `feat(rag): answer with inspectable citations`

### P6.7 — Add knowledge version publishing

**General description:** Snapshot the effective knowledge index when an Assistant Version is published.

**Acceptance criteria:**

- Publishing records an immutable knowledge/index version reference.
- Later document changes affect the draft, not active Production versions.
- Old versions remain queryable until retention policy removes them.
- Promotion detects unavailable or incompatible knowledge versions.

**Technical justification and learning:** This closes the reproducibility gap between configuration and data. Learn release coupling and derived-artifact retention.

**Suggested commit:** `feat(rag): version knowledge with assistant releases`

**Phase 6 exit gate:** A published Assistant answers from versioned company documents, shows citations and records the complete retrieval evidence used for each Run.

---

# Phase 7 — observability, evaluation, guardrails and security

**Objective:** make quality and failure measurable, then enforce safe operating boundaries.

### P7.1 — Add structured logs and correlation

**General description:** Replace ad hoc console messages with structured, privacy-aware logs joined by request, conversation and run identifiers.

**Acceptance criteria:**

- Logs are machine-readable and environment-aware.
- Request, Conversation and Run identifiers correlate the full flow.
- Message content, retrieved content, tokens and secrets are redacted by default.
- Error logs preserve useful cause and dependency information.

**Technical justification and learning:** Logs should explain failures without becoming a data-leak channel. Learn correlation, log levels and privacy-aware operations.

**Suggested commit:** `feat(observability): add structured correlated logs`

### P7.2 — Instrument traces and runtime metrics

**General description:** Trace API, database, retrieval and model stages and expose operational metrics.

**Acceptance criteria:**

- One trace connects the public request, retrieval, model call and persistence.
- Metrics cover latency, errors, cancellations, token usage and retrieval duration.
- Hidden chain-of-thought is never requested or stored.
- Telemetry can be disabled or sampled by environment.

**Technical justification and learning:** AI failures span several probabilistic and deterministic stages. Learn OpenTelemetry concepts, spans, metrics and safe GenAI telemetry.

**Suggested commit:** `feat(observability): trace chatbot execution`

### P7.3 — Build conversation and Run inspection

**General description:** Add admin views for finding conversations and understanding an individual model execution.

**Acceptance criteria:**

- Admin can filter by Assistant, environment, version, status and time.
- Run view shows timing, model, version, retrieval evidence, citations and errors.
- Sensitive content follows an explicit retention and visibility policy.
- Inspection UI does not expose credentials or hidden reasoning.

**Technical justification and learning:** Telemetry only provides product value when operators can investigate behavior. Learn operational UX and audit boundaries.

**Suggested commit:** `feat(admin): inspect conversations and runs`

### P7.4 — Create a versioned evaluation dataset

**General description:** Define representative, edge and adversarial questions with measurable expected properties.

**Acceptance criteria:**

- Dataset includes normal use, missing evidence, ambiguous questions and prompt-injection attempts.
- Expected properties distinguish retrieval relevance, groundedness, refusal and citation behavior.
- Dataset changes are reviewed and versioned.
- No production personal data is copied into the repository.

**Technical justification and learning:** “The chatbot looks good” is not a release criterion. Learn test-set design and evaluation leakage risks.

**Suggested commit:** `test(evals): add versioned assistant evaluation dataset`

### P7.5 — Implement deterministic and model-based evaluations

**General description:** Create a repeatable evaluation runner that measures retrieval and response behavior separately.

**Acceptance criteria:**

- Deterministic checks cover citations, schema, refusal and policy rules.
- Retrieval metrics measure whether expected evidence appears in top results.
- Optional model-based grading is labeled probabilistic and records grader configuration.
- Reports include quality, latency and usage, with failure examples.

**Technical justification and learning:** Combining deterministic and probabilistic evaluation avoids relying entirely on another model as judge. Learn Recall@k, groundedness and reproducible experiments.

**Suggested commit:** `feat(evals): evaluate retrieval and response quality`

### P7.6 — Add basic guardrails

**General description:** Apply bounded input, retrieval and output policies appropriate for an enterprise information chatbot.

**Acceptance criteria:**

- Input size and unsupported content are handled explicitly.
- Retrieved text is treated as untrusted data and cannot silently replace system policy.
- Output policy has observable allow, block or warn outcomes.
- Guardrail configuration is included in Assistant Versions.

**Technical justification and learning:** Prompt injection cannot be solved by one filter; trust boundaries and least privilege reduce impact. Learn layered controls and policy observability.

**Suggested commit:** `feat(security): add versioned chatbot guardrails`

### P7.7 — Add abuse, secret and privacy controls

**General description:** Protect public runtime resources and document data-handling responsibilities.

**Acceptance criteria:**

- Public endpoints have identity-aware or IP-based rate limits and payload limits.
- Provider credentials remain server-side and rotatable.
- CORS is environment-specific rather than universally open.
- Retention and deletion behavior exists for conversations and uploaded documents.
- Threat model covers prompt injection, indirect injection, data exfiltration, SSRF and denial of service/cost.

**Technical justification and learning:** A public AI endpoint can create both security and cost exposure. Learn threat modeling, secrets management, rate limiting and privacy lifecycle.

**Suggested commit:** `feat(security): enforce runtime and data protections`

**Phase 7 exit gate:** An operator can explain a failed or poor response from trace and Run data, measure it with evaluations and demonstrate the principal security controls.

---

# Phase 8 — production delivery and portfolio evidence

**Objective:** deploy the product repeatably, validate operational behavior and present the engineering decisions clearly.

### P8.1 — Create the local production-like stack

**General description:** Provide one reproducible local environment for the web app, API, PostgreSQL/pgvector and supporting dependencies.

**Acceptance criteria:**

- One documented command starts the required local stack.
- Health checks and persistent development volumes are defined.
- Application processes run from production builds in the production-like profile.
- Ollama remains optional when the hosted provider is selected.

**Technical justification and learning:** Environment drift obscures actual defects. Learn container networking, dependency readiness and production-like local verification.

**Suggested commit:** `chore: add production like local stack`

### P8.2 — Decide the cloud architecture and cost boundary

**General description:** Design the first AWS deployment and compare alternatives before provisioning resources.

**Acceptance criteria:**

- ADR covers compute, database, object storage, networking, secrets, telemetry and model provider.
- Cost drivers and a shutdown or budget policy are documented.
- Backup, migration and rollback paths are defined.
- Architecture remains a modular monolith.

**Technical justification and learning:** Cloud architecture is a set of operational and economic trade-offs, not a list of services. Learn cost-aware AWS design and managed versus self-hosted AI choices.

**Suggested commit:** `docs: design first aws deployment`

### P8.3 — Provision infrastructure as code

**General description:** Create the minimum reproducible infrastructure for one non-production public environment.

**Acceptance criteria:**

- Infrastructure can be created from versioned code.
- Database and secrets are not publicly exposed.
- Storage, logs and application resources have explicit retention or deletion behavior.
- No credentials or environment secrets are committed.

**Technical justification and learning:** Reproducibility and review are core production properties. Learn infrastructure state, IAM and network boundaries.

**Suggested commit:** `feat(infra): provision demo environment`

### P8.4 — Add controlled deployment and migrations

**General description:** Extend CI/CD to build, deploy, migrate and verify the application safely.

**Acceptance criteria:**

- Images or deployable artifacts are immutable and traceable to a commit.
- Database migrations run through an explicit controlled step.
- Deployment performs smoke and readiness checks.
- Failed deployment has a documented rollback path.

**Technical justification and learning:** Deployment is part of application correctness. Learn artifact promotion, migration sequencing and rollback.

**Suggested commit:** `ci: deploy and verify demo environment`

### P8.5 — Validate performance and recovery

**General description:** Measure the system under realistic demo load and dependency failures.

**Acceptance criteria:**

- Report includes p50/p95 latency, error rate and supported concurrency.
- Tests cover provider timeout, database interruption, cancelled generation and failed ingestion.
- Initial service-level objectives are documented.
- Limits are honest and visible in the case study.

**Technical justification and learning:** “Production-oriented” requires measured behavior and known limits. Learn load testing, SLOs and failure drills.

**Suggested commit:** `test: measure load and failure recovery`

### P8.6 — Create the demo Assistant and presentation flow

**General description:** Seed a coherent business scenario that exercises the complete product without fabricated claims.

**Acceptance criteria:**

- Demo includes source documents, draft configuration and at least two published versions.
- Script demonstrates configure, test, publish, promote, converse, inspect and roll back.
- Evaluation and telemetry results are visible.
- Setup does not depend on private company data.

**Technical justification and learning:** A technical platform needs a scenario that communicates business value. Learn product demonstration and evidence selection.

**Suggested commit:** `feat(demo): add reproducible enterprise assistant scenario`

### P8.7 — Publish the engineering case study

**General description:** Rewrite the repository presentation around the problem, architecture, decisions, evidence and known limits.

**Acceptance criteria:**

- README contains product overview, screenshots, architecture, setup and live/demo links.
- ADR index explains significant decisions and rejected alternatives.
- Quality, performance and security claims point to reproducible evidence.
- Roadmap clearly separates implemented functionality from future work.

**Technical justification and learning:** Staff-level evidence includes technical communication and honest trade-offs. Learn how to make engineering judgment reviewable.

**Suggested commit:** `docs: publish platform engineering case study`

**Phase 8 exit gate:** A reviewer can open the public URL, complete the demo flow, inspect evidence and reproduce the project from its documentation.

---

# 4. MVP release gate

The product may be labeled **MVP** when all statements below are true:

- An administrator can create and configure several Assistants.
- Drafts and published versions are separate.
- Development, Staging and Production point to immutable versions.
- Production has a stable public URL.
- Existing conversations remain pinned when Production changes.
- Ollama and one hosted provider work through the same internal gateway.
- A versioned knowledge base produces grounded responses with citations.
- Runs record effective version, model, retrieval evidence, timing, usage and status.
- Representative evaluations can be repeated and compared.
- Admin and public surfaces have appropriate authentication and abuse boundaries.
- CI validates the repository and the application is deployed from reproducible infrastructure.
- Known limitations are documented and no unsupported claim of full production readiness is made.

# 5. Post-MVP progression

These items begin only after the MVP release gate passes and evidence identifies their value:

1. Add the remaining major provider adapter, not every available provider.
2. Introduce hybrid lexical/vector retrieval and reranking if evaluation demonstrates a retrieval gap.
3. Add release evaluation gates and controlled A/B traffic.
4. Implement tools through typed capability contracts, beginning with read-only tools.
5. Add human approval before any side-effecting tool.
6. Add real multitenancy, tenant isolation tests, roles, quotas and audit logs.
7. Add embedded widget and selected external channels.
8. Consider asynchronous workers or service extraction only after measured operational need.
9. Consider agent loops only after the non-agent RAG baseline is reliable and measurable.

# 6. Recommended pull-request grouping

The exact task order remains mandatory, but closely related tasks can share a pull request when review remains clear:

| Pull request | Tasks     | Demonstrable result                                |
| ------------ | --------- | -------------------------------------------------- |
| PR 1         | P0.1–P0.3 | Testable architecture and validated configuration  |
| PR 2         | P0.4–P0.6 | Automated quality baseline and CI                  |
| PR 3         | P1.1–P1.5 | Stable product language and API boundaries         |
| PR 4         | P2.1–P2.3 | PostgreSQL and release-domain persistence          |
| PR 5         | P2.4–P2.6 | Durable conversations and complete JSON cutover    |
| PR 6         | P3.1–P3.3 | Provider-independent deterministic model execution |
| PR 7         | P3.4–P3.7 | Streaming, resilience and second provider          |
| PR 8         | P4.1–P4.5 | Usable Assistant control plane and Playground      |
| PR 9         | P5.1–P5.5 | Version, promotion, rollback and stable public URL |
| PR 10        | P6.1–P6.4 | Secure ingestion and vector index                  |
| PR 11        | P6.5–P6.7 | Versioned grounded answers with citations          |
| PR 12        | P7.1–P7.3 | Operational telemetry and inspection UI            |
| PR 13        | P7.4–P7.7 | Evaluation, guardrails and security boundary       |
| PR 14        | P8.1–P8.4 | Reproducible cloud delivery                        |
| PR 15        | P8.5–P8.7 | Performance evidence, demo and case study          |

Do not force a large task into one commit merely to match this table. Preserve reviewability and working intermediate states.

# 7. Primary references

## Repository evidence

- [Repository](https://github.com/FelipeGarcia911/deepseek-chat)
- [Current root workspace](https://github.com/FelipeGarcia911/deepseek-chat/blob/main/package.json)
- [Migration and validation notes at the reviewed revision](https://github.com/FelipeGarcia911/deepseek-chat/blob/7dc3dc6380ad62683e8ca5ab22186f647e9fb493/docs/migration-plan.md)
- [Current Express server](https://github.com/FelipeGarcia911/deepseek-chat/blob/main/backend/src/server.ts)
- [Current Chat controller](https://github.com/FelipeGarcia911/deepseek-chat/blob/main/backend/src/controllers/ChatController.ts)
- [Prototype Ollama service at the reviewed revision](https://github.com/FelipeGarcia911/deepseek-chat/blob/7dc3dc6380ad62683e8ca5ab22186f647e9fb493/backend/src/services/OllamaService.ts)
- [Current file persistence](https://github.com/FelipeGarcia911/deepseek-chat/blob/main/backend/src/services/ChatService.ts)
- [Current frontend API service](https://github.com/FelipeGarcia911/deepseek-chat/blob/main/frontend/src/services/Chat.ts)

## Technical references

- [pnpm workspaces](https://pnpm.io/workspaces)
- [PostgreSQL documentation](https://www.postgresql.org/docs/)
- [pgvector](https://github.com/pgvector/pgvector)
- [Ollama API documentation](https://docs.ollama.com/api/introduction)
- [Amazon Bedrock Converse API](https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference-call.html)
- [OpenTelemetry semantic conventions for generative AI](https://opentelemetry.io/docs/specs/semconv/gen-ai/)
- [OWASP GenAI Security Project](https://genai.owasp.org/)
- [GitHub Actions documentation](https://docs.github.com/en/actions)

# 8. First action

Start with **P0.1 — Document the current and target architecture**.

Before changing more code, create:

- `docs/architecture.md`
- `docs/adr/001-use-modular-monolith.md`

The document should describe the current application, the target modules, the MVP boundaries and the principal flow from a public message to a persisted Run. This becomes the reference against which every following task is reviewed.
