# React application

This workspace contains the single React application for the platform's future
public chat and administration surfaces. It uses Vite, TypeScript, Material UI
and Redux. The prototype currently exposes `/` and `/chat/:id`.

Install and run commands from the repository root, not from this directory.
Follow the [root setup instructions](../README.md#prerequisites-and-setup)
to select Node/pnpm, install the shared lockfile and prepare environment files.

```sh
pnpm dev:frontend
pnpm --filter frontend test
pnpm verify
```

`pnpm dev:frontend` builds and watches the internal libraries as well as Vite.
The default browser URL is `http://localhost:5173`. Start the backend separately
with `pnpm dev:backend`, or use root `pnpm dev` for both applications.

`VITE_API_BASE_URL` is required and public. The local example points at
`http://localhost:4000/api`; a root-relative `/api` needs a deployment route or
reverse proxy, which the development server does not provide automatically.
Values are embedded in production bundles. See [configuration](../docs/configuration.md).

Generation remains unavailable with `503 MODEL_NOT_CONFIGURED`. Conversation
creation, listing, history and deletion require no model. See the root README
for current behavior, [test foundations](../docs/testing.md) for component tests
and [quality gates](../docs/quality-gates.md) for lint, types and coverage.
