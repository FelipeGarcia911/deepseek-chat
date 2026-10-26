# Internal libraries

This stage prepares the packages and verifies their imports. The
`src/index.ts` entry points contain `export {}`: no components, types,
utilities or validation logic have been moved yet. The administration surface will be added later within the existing React
application.

## Dependencies

```text
frontend -> @chat-app/ui
frontend -> @chat-app/shared
backend  -> @chat-app/shared
```

`packages/ui` is the future React library for chat and admin. It declares
React and React DOM as peerDependencies: consuming applications must provide
compatible versions. This avoids treating React as a private copy owned by
the library. React types and TypeScript are development tools.

`packages/shared` will contain code shared by browser and server. Its TypeScript
configuration includes neither DOM nor Node global types: using `window`,
`document` or `process` produces a type error. It also does not depend on React,
Express or any application. This directs the package toward portable functions,
data contracts and validation. Credentials and server-only logic must remain
in the backend.

## Linking

Consumer manifests declare `"@chat-app/shared": "workspace:*"`, and the frontend
also declares UI. pnpm links the local directories and requires the package
to exist within the workspace. These packages are neither published nor
fetched from a registry. All packages are private.

Applications import by package name rather than paths such as
`../../packages/shared/src`. Each package exposes its public API through
index.ts, and its manifest defines the entry point through exports. Code added
in the next stage must be exported from that entry point.

The current imports are side-effect imports:

```ts
// Frontend
import "@chat-app/ui";
import "@chat-app/shared";

// Backend
import "@chat-app/shared";
```

They verify resolution and integration without inventing components or business
functions. Since the entry points are empty, they do not change application
behavior. Only the frontend consumes UI; the backend consumes shared.

## Compilation and formats

UI generates ESM and type declarations in packages/ui/dist. Shared generates
ESM in dist/esm and CommonJS in dist/cjs from the same source code:

- Vite and the frontend select shared's `import` entry.
- The current backend compiles to CommonJS and selects the `require` entry.
- Each entry has its own .d.ts declarations.
- Shared's types field lets the backend retain its existing TypeScript
  resolution; changing its module system is unnecessary.

Shared's small compile.mjs script runs TypeScript for both formats and writes
a package.json with type: commonjs in dist/cjs. That file tells Node to treat
those .js files as CommonJS even though the package itself is ESM. In watch
mode, the script keeps both compilers running and stops them on shutdown.

Within the libraries, relative imports between future TypeScript files must
use the output .js extension so they also work as ESM in Node. No Vite aliases
or TypeScript paths are required.

## Commands from the repository root

```sh
nvm use
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm lint
pnpm dev
```

`pnpm build` respects the dependency graph: it compiles libraries before their
consumers. `pnpm typecheck` builds libraries first because consumers need their
type declarations even in a clean checkout. Existing linting still checks
the frontend.

`pnpm dev` performs an initial package build and then runs all servers and
compilers in parallel. Library changes are recompiled; the backend watches
shared's dist/cjs directory and restarts when it changes. Generated dist
files are ignored by Git.

`pnpm dev:frontend` includes the frontend and its libraries; `pnpm dev:backend`
includes the backend and shared. Dependencies are selected with pnpm's `...`
filter suffix. Ctrl+C stops the group.

The future admin surface lives in the existing React application under
`/admin/*`; public chat uses `/c/:assistantSlug`. Shared UI components serve
both surfaces without introducing another workspace application.

References: [pnpm filtering](https://pnpm.io/filtering) and
[TypeScript modules](https://www.typescriptlang.org/docs/handbook/modules/reference.html).

## Stage validation

The following checks passed with Node 26.12.1 and pnpm 12.14.0:

- Frozen-lockfile installation; registry package versions were preserved.
  The lockfile includes local links and resolves Vite's Node types peer in
  the new graph.
- Build and type checking for all four packages.
- Existing frontend linting.
- ESM imports of UI/shared from the frontend and require of shared from the backend.
- Development startup without previously generated library dist directories.
- Vite resolution of both libraries while transforming App.tsx.
- Recompilation of UI and both shared formats after content changes, together
  with backend restart and its HTTP response.
- HTTP response from the compiled backend with shared linked.

Temporary verification changes were restored, and processes were stopped.
The existing Vite bundle-size warning remains. Ollama generation integration
was outside the scope of these checks.
