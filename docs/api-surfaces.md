# API surfaces

**Status:** P1.5, October 26, 2026. One Express API serves two versioned route
groups. They are logical boundaries inside the
[modular monolith](adr/001-use-modular-monolith.md), not separate services,
processes or deployments. Contracts and error conventions follow
[ADR-002](adr/002-share-runtime-validated-api-contracts.md).

## Route groups

| Group         | Base path         | Purpose                                                      | Callers                             |
| ------------- | ----------------- | ------------------------------------------------------------ | ----------------------------------- |
| Control plane | `/api/v1/admin`   | Configure and operate the product: list, inspect and delete. | `/admin/*` surface and Playground.  |
| Runtime       | `/api/v1/runtime` | Serve conversations: start one, read it and send messages.   | Public chat at `/c/:assistantSlug`. |

Current endpoints. Shapes come from
[`packages/shared/src/conversations.ts`](../packages/shared/src/conversations.ts):
identifiers are UUIDs, collections are `{ items, nextCursor }` pages with
`limit` (default 20, max 100) and opaque `cursor`, and messages are
`{ id, role, content, createdAt }`. Summaries are `{ id, assistantId, title, status, createdAt }`.

| Method   | Path                                                       | Success                                                                                |
| -------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET`    | `/api/v1/admin/conversations`                              | 200, page, newest first                                                                |
| `DELETE` | `/api/v1/admin/conversations/{conversationId}`             | 204                                                                                    |
| `POST`   | `/api/v1/runtime/assistants/{assistantSlug}/conversations` | 201, summary pinned to the Production version; 404 unknown, 409 archived or undeployed |
| `GET`    | `/api/v1/runtime/conversations/{conversationId}/messages`  | 200, page, oldest first                                                                |
| `POST`   | `/api/v1/runtime/conversations/{conversationId}/messages`  | assistant `Message`; 503 until P3                                                      |

Listing every conversation and deleting history are operator actions, so they
live in the control plane. A runtime caller only acts on a conversation it
started. The prototype React screens call both groups because the admin and
public surfaces do not exist yet. The former `/api/chats` routes and prototype
shapes were removed without compatibility aliases; delete local JSON data
written by earlier builds.

## Authentication expectations

| Group         | Now                     | Target                                                                                                      | Task |
| ------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------- | ---- |
| Control plane | **Unauthenticated.**    | Every route requires an administrator session bound to the default Workspace; otherwise `UNAUTHENTICATED`.  | P4.1 |
| Runtime       | Anonymous, as intended. | Stays anonymous. Scope comes from the trusted Assistant slug and the Conversation, never from client input. | P5.4 |

Until P4.1, anyone who can reach the API can list and delete conversations.
Do not expose this build publicly. Authenticated previews of non-Production
versions and Playground traffic belong to the control plane even though they
reuse runtime execution (P4.5, P5.5).

## Rate-limit and abuse boundaries

| Group         | Limit key                                         | Boundaries                                                                                                       | Task       |
| ------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ---------- |
| Control plane | Authenticated actor                               | Generous request rate; tighter limits only on expensive work such as uploads, ingestion and Playground runs.     | P4.1, P6.2 |
| Runtime       | Client IP plus Conversation, per Assistant budget | Conversation creation and message sending are limited; one nonterminal Run per Conversation (`RUN_IN_PROGRESS`). | P3.5, P7.7 |

Both groups already share the 32 kB JSON body limit (`PAYLOAD_TOO_LARGE`) and
the field limits in the shared schemas, such as 4,000 characters per message.
Exceeding a rate limit returns `RATE_LIMITED` with `Retry-After`. Each router in
[routes/index.ts](../backend/src/routes/index.ts) is the single insertion point
for its group's authentication and limits.

CORS is shared: both groups are called by the one React application, so both
accept the configured `CORS_ORIGINS`. Embedding the runtime on third-party
sites is not an MVP goal.
