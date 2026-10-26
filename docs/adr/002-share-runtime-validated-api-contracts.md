# ADR-002: Share runtime-validated API contracts in a TypeScript package

**Status:** Accepted; implementation starts in P1.4.
**Date:** 2026-10-26.
**Source:** [Roadmap P1.3](../roadmap.md).

## Context

The prototype exposes JSON over HTTP under `/api/chats`. Its contract exists only
as duplicated, hand-written assumptions: the backend reads `req.body.title`
without a schema, the frontend declares its own `Chat` and `Message` interfaces,
errors are free-form `{ error }` strings, and identifiers come from
`Date.now()`. Nothing fails when one side changes and the other does not.

The MVP adds an authenticated control plane and a public runtime with different
evolution rates ([ADR-001](001-use-modular-monolith.md), P1.5). The
[lifecycle rules](../lifecycle.md) also require contract-level answers for
request identity, revision conflicts and idempotent replays. Both consumers are
TypeScript, live in this monorepo and deploy together. `@chat-app/shared` already
builds ESM and CommonJS for the frontend and backend
([internal packages](../internal-packages.md)).

## Decision drivers

- One source of truth for request, response, error and event shapes.
- Runtime validation at the trust boundary, not only compile-time types.
- Drift between frontend and backend fails `pnpm typecheck` or tests in CI.
- Small toolchain: no generator step or checked-in generated code to keep in sync.
- Keep a path to a published, language-neutral description if a non-TypeScript
  consumer appears.

## Considered alternatives

| Alternative                                                       | Benefit                                                                                          | Cost or limitation                                                                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenAPI document as the source, generated TypeScript client       | Language-neutral, standard tooling, documentation and mock servers.                              | YAML/JSON spec plus a generator and generated code in the build; server validation needs another library reading the spec; spec and handlers can still diverge.  |
| OpenAPI generated from backend code annotations, client from that | Spec stays near handlers.                                                                        | Annotations are not validation; two generation steps; the frontend depends on a backend build artifact.                                                          |
| Shared TypeScript types only                                      | Zero dependencies, trivial to start.                                                             | Types vanish at runtime: no input validation, no response checking, P1.4 would duplicate rules by hand.                                                          |
| RPC framework with inferred types (for example tRPC)              | End-to-end inference without a schema file.                                                      | Couples the public runtime URL to an RPC protocol; awkward for stable public routes, SSE streaming and standard HTTP semantics such as status codes and caching. |
| **Shared runtime schemas in `@chat-app/shared`, types inferred**  | One definition validates input on the server and responses in the client; types follow for free. | TypeScript-only consumers; adds a schema library to both bundles; package discipline needed so only wire contracts, not domain entities, live there.             |

## Decision

Use **REST-style JSON over HTTP** and define every wire contract as a **Zod schema
in `@chat-app/shared`**. TypeScript types are inferred with `z.infer`; nobody
writes a parallel interface by hand.

- The backend validates every request (params, query, body, headers it relies on)
  against the schema before a use case runs, and parses every success response
  DTO with its response schema before sending it. Parsing strips members the
  contract does not declare, so internal fields cannot leak, and rejects values
  the contract cannot represent. A failure is a server bug: it becomes
  `INTERNAL_ERROR` and is logged, instead of being discovered by the frontend.
- The frontend parses responses with the same schemas in its HTTP service, so
  an incompatible backend fails loudly in one place instead of deep in the UI.
- Streaming events (P3.4) are schemas too: a discriminated union on `type`.
- Contracts are grouped by surface (`admin`, `runtime`, common conventions) and
  exported from the package entry point. They describe the wire, not domain
  entities: backend modules map domain records to contract shapes and keep
  persistence fields, secrets and internal states out of them.
- A contract change and its backend/frontend consumers change in the same pull
  request. CI typecheck and tests are the drift check.

Zod is selected because it validates at runtime, infers types, runs in both
browser and Node without DOM or Node globals, and can emit JSON Schema
(`z.toJSONSchema`) if an OpenAPI document becomes necessary. The dependency is
added to `@chat-app/shared` in P1.4, not in this documentation change.

## Conventions

### Resources, naming and versioning

- Base paths are `/api/v1/admin/...` for the control plane and
  `/api/v1/runtime/...` for public conversations (introduced by P1.5).
- Plural nouns for collections, explicit sub-resources or verbs for commands that
  are not plain updates: `POST /assistants/{assistantId}/versions` publishes,
  `POST /assistants/{assistantId}/environments/{environment}/deployments`
  promotes or rolls back.
- JSON members use `camelCase`. Timestamps are RFC 3339 UTC strings
  (`createdAt`). Enum values are lowercase strings that match
  [lifecycle labels](../lifecycle.md) (`succeeded`, `archived`, `production`).
- Message authorship uses `role: "user" | "assistant"`; the legacy `"bot"`
  sender is not used in new contracts.
- Within `v1`, only additive changes are allowed: new optional request members,
  new response members and new error codes. Clients ignore unknown response
  members. Removing or changing the meaning of a member requires `v2`.

### Identifiers

- Server-generated **UUIDv7** strings in canonical lowercase form, for every
  entity. They are time-ordered, which suits PostgreSQL B-tree indexes, and
  carry no business meaning. Clients treat them as opaque.
- The entity's own identifier is `id`; references are `<entity>Id`
  (`assistantId`, `assistantVersionId`, `conversationId`, `runId`).
- `workspaceId` may appear in responses but is never accepted from a client as
  scope ([domain invariant 2](../domain.md#workspace-invariants-without-multitenancy)).
- Assistant Versions also expose a per-Assistant integer `versionNumber` for
  display; it is not used for lookups.
- The Assistant `slug` is the only human-readable identifier in a URL:
  lowercase letters, digits and single hyphens, 3–63 characters, used by
  `/c/{assistantSlug}` and the runtime resolver.
- Path identifiers are validated as UUIDs before lookup; a malformed identifier
  is a validation failure, a well-formed unknown one is `NOT_FOUND`.

### Error envelope

Errors use [RFC 9457 problem details](https://www.rfc-editor.org/rfc/rfc9457)
with `Content-Type: application/problem+json` and two extension members:
a stable `code` and the `requestId` that is also returned in the
`X-Request-Id` header.

The MVP uses `"type": "about:blank"`, which RFC 9457 defines as "no semantics
beyond the HTTP status". `title` is therefore the standard
[RFC 9110 reason phrase](https://www.rfc-editor.org/rfc/rfc9110#section-15) of
the status (`Bad Request`, `Conflict`), never a problem-specific text. Problem
meaning lives in `code`; `detail` explains this occurrence. Publishing a
dereferenceable `type` URI per problem, with its own title, requires amending
this ADR.

```json
{
  "type": "about:blank",
  "title": "Bad Request",
  "status": 400,
  "code": "VALIDATION_FAILED",
  "detail": "The request contains invalid fields.",
  "requestId": "0192f1c4-8a1e-7c3a-9d52-3b0f6c1e2a47",
  "errors": [{ "path": "title", "message": "Must be at most 120 characters." }]
}
```

Clients branch on `code`, never on `title` or `detail`. `errors` appears only for
validation failures. Stack traces, SQL, provider responses and secrets never
appear in a problem body. An unknown `code` is handled by its HTTP status class.

Initial code catalog; P1.4 implements it in
[`packages/shared/src/errors.ts`](../../packages/shared/src/errors.ts) and later
tasks extend it:

| Code                     | Status | Meaning                                                                        |
| ------------------------ | ------ | ------------------------------------------------------------------------------ |
| `VALIDATION_FAILED`      | 400    | Params, query, headers or body do not match the schema.                        |
| `UNAUTHENTICATED`        | 401    | Admin operation without a valid session (P4.1).                                |
| `ORIGIN_NOT_ALLOWED`     | 403    | Browser origin is not in `CORS_ORIGINS`; added by P1.4.                        |
| `NOT_FOUND`              | 404    | Resource is absent or not visible in the caller's scope.                       |
| `REVISION_CONFLICT`      | 409    | `expectedRevision` or the expected deployment no longer matches current state. |
| `INVALID_STATE`          | 409    | The lifecycle forbids the command (archived Assistant, closed Conversation).   |
| `RUN_IN_PROGRESS`        | 409    | The Conversation already has a nonterminal Run.                                |
| `REQUEST_IN_PROGRESS`    | 409    | A request with the same idempotency key is still executing.                    |
| `IDEMPOTENCY_KEY_REUSED` | 422    | The idempotency key was already used with a different payload.                 |
| `PAYLOAD_TOO_LARGE`      | 413    | Body exceeds the documented limit.                                             |
| `RATE_LIMITED`           | 429    | Runtime limit exceeded; `Retry-After` is set.                                  |
| `MODEL_NOT_CONFIGURED`   | 503    | No usable Model Profile; existing behavior, moved into the envelope.           |
| `DEPENDENCY_UNAVAILABLE` | 503    | Database, storage or model provider failed or timed out.                       |
| `INTERNAL_ERROR`         | 500    | Unexpected failure; details stay in server logs correlated by `requestId`.     |

### Concurrency and idempotency

- Commands that depend on read state carry the expected value in the body:
  `expectedRevision` for Draft save and publish, `expectedDeploymentId`
  (nullable for the first promotion) for promote and rollback. A mismatch returns
  `REVISION_CONFLICT` with no durable change.
- Commands that create durable work — publish, promote, rollback, start a
  Conversation and send a Message (which creates a Run) — require an
  `Idempotency-Key` header containing a client-generated UUID, following the
  [IETF Idempotency-Key draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/).
  The draft is not a final RFC, so this ADR states the rules this API enforces.
  A repeat with the same scope and fingerprint returns the original status and
  body without new work; the same scope with a different fingerprint returns
  `IDEMPOTENCY_KEY_REUSED`; a repeat while the first is running returns
  `REQUEST_IN_PROGRESS`. Keys are retained for at least 24 hours. Storage of
  keys belongs to P2.
- The public runtime may have no authenticated caller, so the scope is defined
  per operation from server-resolved identities, never from client-supplied
  scope fields:

  | Operation                 | Idempotency scope                                      |
  | ------------------------- | ------------------------------------------------------ |
  | Admin commands (publish)  | Workspace + authenticated actor + operation            |
  | Start public Conversation | Workspace + Assistant (resolved from slug) + operation |
  | Send Message              | Workspace + Conversation + operation                   |
  | Promote and rollback      | Workspace + Assistant + Environment + operation        |

- The fingerprint is the method, the resolved target resource and the
  schema-normalized request payload. A stored response is returned only when the
  key **and** the scope match; a key seen under a different scope is a separate
  key and never replays another scope's response.

### Pagination

Collections use opaque cursor pagination:

```http
GET /api/v1/admin/assistants?limit=20&cursor=eyJ...
```

```json
{ "items": [], "nextCursor": null }
```

- `limit` defaults to 20 and is capped at 100; larger values are a validation
  failure, not silently clamped.
- `nextCursor` is `null` on the last page. Cursors are opaque strings encoding
  the sort key plus `id` as tie-breaker; clients never build or inspect them.
- Each collection has one documented stable order: newest first for
  administrative lists, conversation sequence ascending for Messages.
- No total counts in the MVP; they are expensive and unnecessary for the
  planned screens.

## Consequences

Frontend and backend cannot silently disagree: a changed schema breaks the
consumer at typecheck or at the response parse, and both change in one pull
request. P1.4 gets its validation rules from the same definitions instead of
writing them twice. The single source also documents limits (title length,
message size) next to the shape.

The contract is TypeScript-only. There is no published OpenAPI document,
interactive explorer or client for other languages until one is generated.
Zod adds weight to the frontend bundle and runs on every parsed response; both
are acceptable for an administration UI and a chat client and can be measured.
`@chat-app/shared` must stay a wire-contract package: reviews reject domain
entities, persistence models and server-only logic there.

### Migration of the prototype

- P1.4 adds Zod to `@chat-app/shared`, defines schemas for the existing chat
  endpoints and the problem-details envelope, validates in one backend
  middleware, maps errors in one handler and makes the frontend parse responses
  and surface failures instead of returning empty lists.
- P1.5 moves routes to `/api/v1/admin` and `/api/v1/runtime` and replaces the
  prototype contracts without backward compatibility: UUID identifiers,
  `role`/`content` messages with `createdAt`, `{ items, nextCursor }` pages and
  the assistant `Message` as the send response. `/api/chats`, `Date.now()`
  identifiers and `sender: "bot"` are removed; existing JSON files in the old
  shape are not migrated. Until P2, the JSON store uses random UUIDs; PostgreSQL
  then generates UUIDv7.
- `{ error }` and `{ code, error }` bodies are replaced by problem details in
  P1.4; no client outside this repository depends on them.

## Reconsideration

Generate an OpenAPI document from the Zod schemas when a consumer outside this
repository, a non-TypeScript client or public API documentation becomes a
requirement. Moving to a spec-first workflow requires another ADR. A schema
library change is a contained refactor inside `@chat-app/shared` and its two
adapters as long as these conventions remain unchanged.

## References

- [RFC 9457: Problem Details for HTTP APIs](https://www.rfc-editor.org/rfc/rfc9457).
- [RFC 9562: UUIDs, including version 7](https://www.rfc-editor.org/rfc/rfc9562).
- [IETF draft: The Idempotency-Key HTTP header field](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/).
- [Zod documentation](https://zod.dev/).
- [OpenAPI Specification](https://spec.openapis.org/oas/latest.html).
- [Domain glossary](../domain.md), [lifecycle rules](../lifecycle.md) and
  [ADR-001](001-use-modular-monolith.md).
