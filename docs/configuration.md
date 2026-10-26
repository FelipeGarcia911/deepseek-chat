# Validated platform configuration

Task: P0.3 in the [roadmap](roadmap.md). Environment variables configure the
deployed platform. Provider connections and chatbot behavior have separate
future owners; they are not global application settings.

## Ownership boundaries

| Owner                               | Configuration                                                                                   |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Platform environment                | Node environment, HTTP port, browser origin allowlist and current file-store location.          |
| Model Profile, persisted later      | Provider connection, model identity, capabilities and server-side credential references.        |
| Assistant Draft / immutable Version | Instructions, generation parameters, context policy, knowledge version and public presentation. |

Provider credentials will remain server-side. Versions reference credentials
rather than copying secret values. There is no Model Profile persistence,
provider adapter or ModelProvider interface in this task.

## Backend configuration

`backend/src/config.ts` exports the pure `loadConfig(env): AppConfig` parser.
It does not read `process.env`, load dotenv, inspect files or start services.
The returned object and its origin list are frozen; parsing leaves the supplied
environment object unchanged.

All four settings are required. No implicit defaults or prototype compatibility
fallbacks are provided:

| Variable            | Validation                                                                                        | Typed result                                            |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `NODE_ENV`          | `development`, `test` or `production`.                                                            | `config.nodeEnv`.                                       |
| `PORT`              | Decimal integer from 1 to 65535; zero, fractional, negative and out-of-range values are rejected. | Numeric `config.port`.                                  |
| `CORS_ORIGINS`      | Comma-separated HTTP(S) origins; no wildcards, credentials, paths, query or fragment.             | Normalized, deduplicated readonly `config.corsOrigins`. |
| `CHAT_STORAGE_PATH` | Non-empty `.json` file path without null bytes or line breaks.                                    | Absolute `config.chatStoragePath`.                      |

Outer whitespace is trimmed. Origin normalization lowercases hostnames,
removes default ports and a root trailing slash. For example,
`HTTPS://EXAMPLE.COM:443/` becomes `https://example.com`.

Relative storage paths resolve against the **backend package directory**, not
the shell working directory or services directory. `./data/chats.json` selects
`backend/data/chats.json` under both ts-node and compiled execution. Absolute
paths are supported. Composition creates the parent directory when necessary;
no prototype data is migrated automatically. The local `backend/data/` directory
is ignored by Git.

The previous prototype's storage and global model environment settings are
removed. Update existing env files to the current example instead of relying
on the old names. Unknown process variables do not configure a model.

### Startup sequence

1. `server.ts`, the executable boundary, loads dotenv from its working directory.
2. Existing process variables take priority over file values. An absent `.env`
   is allowed when the process supplies all required settings; an unreadable
   file is an actionable startup failure.
3. Startup reads `process.env` once through `loadConfig` before any composition
   or listening. Invalid fields are reported together without echoing values.
4. `createApplication(config)` receives the validated object, prepares storage
   and passes only HTTP environment/origin settings to `createApp`.

Imports remain free of startup, dotenv and filesystem side effects. Restart
backend development after changing `.env`; nodemon watches source and shared
outputs, not env files.

## CORS behavior

Configured browser origins are accepted, including preflight requests.
An unconfigured Origin receives HTTP 403 before route handlers or storage
writes. Requests without an Origin header are allowed for local tools and
server-to-server clients. The server never substitutes a wildcard allowlist,
including in production. CORS is a browser-origin boundary, not authentication;
administrator authentication remains a later task.

## Temporary generation state

The backend starts without a model. Conversation list, creation, history and
deletion remain available. Message generation currently returns:

```http
HTTP/1.1 503 Service Unavailable
Content-Type: application/problem+json
X-Request-Id: <request identifier>
```

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

This response does not save the submitted message, fabricate an assistant
answer or attempt an external request. The old direct Ollama service and its
composition are removed. No fallback model or replacement provider interface
is introduced. Model-gateway contracts begin at P3.1; profiles and assistant
configuration arrive in their roadmap phases. The frontend HTTP service
propagates generation failure rather than converting it into assistant text.
The current optimistic client-only user message is not a persisted message.

## Frontend configuration

The MVP uses **one React application** with public chat and administration
surfaces. Their expected routes are `/c/:assistantSlug` and `/admin/*`;
P0.3 does not create those screens or change the existing prototype routes.
They share the configured API base.

`frontend/src/config/schema.ts` holds the pure parser and `FrontendConfig`
type. `frontend/src/config/index.ts` exports the validated runtime `config`
from `import.meta.env`. Vite reuses the parser with `loadEnv` to reject invalid
configuration before development startup or production builds.

`VITE_API_BASE_URL` is required. It accepts an HTTP(S) URL or a root-relative
path beginning with a single `/`, without credentials, whitespace, query or
fragment. Protocol-relative URLs such as `//other-host/api` and ambiguous
relative paths such as `api` are rejected. Outer whitespace and trailing
slashes are removed. `/` represents the same-origin root.

```dotenv
VITE_API_BASE_URL=https://gateway.example.com/platform/api
```

The list request targets
`https://gateway.example.com/platform/api/chats/list`. With `/api`, it targets
`/api/chats/list` on the browser's origin. A same-origin deployment must route
that API prefix to the backend; a proxy is not added by this task. The API
base excludes `/chats`, which the HTTP service appends. No localhost fallback
exists in application code.

Vite loads env files by mode and gives existing process variables priority.
Restart Vite after changing env files. Production values are embedded at build
time; changing a deployed web server's environment does not rewrite browser
JavaScript. Rebuild to change the destination. Every `VITE_` value is public;
never use that prefix for provider credentials or other secrets.

## Setup and checks

Copy the examples for a new checkout, or update existing files manually:

```sh
cp -n backend/.env.example backend/.env
cp -n frontend/.env.example frontend/.env
pnpm dev
```

The backend needs no model service. Env-file comments appear on separate lines.
If the frontend runs on a different browser origin, update `CORS_ORIGINS`
explicitly; a Vite port fallback is not automatically authorized.

```sh
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Tests use temporary storage and local HTTP listeners. They cover pure parsing,
immutability, required fields, port ranges, origin normalization, CORS,
independent application configurations, startup failures, CRUD without a model
and side-effect-free generation rejection. Frontend tests verify API URL
consumption, clear validation errors and the production bundle. P0.4 migrates
these regressions to Vitest and adds [React component tests](testing.md);
existing lint covers the frontend until P0.5.
Typecheck alone does not validate actual deployment environment values.

References: [Express CORS](https://expressjs.com/en/resources/middleware/cors/),
[dotenv](https://github.com/motdotla/dotenv),
[Vite environment variables](https://v6.vite.dev/guide/env-and-mode).

## P0.3 verification result

All 89 tests passed with Node 26.12.1 and pnpm 12.14.0: 63 backend checks
and 26 frontend checks. Formatting, local links, frozen installation,
workspace typecheck, existing lint and the full build passed. Additional
origin cases reject wildcard hosts and URL spellings that would otherwise
normalize into a valid origin. The existing Vite bundle-size warning remains.
No live model, provider credentials or external generation request was needed.
For the current migrated suite and P0.4 verification, see [test foundations](testing.md).
