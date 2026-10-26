# Repository quality gates

P0.5 provides one verification command from the repository root:

```sh
pnpm verify
```

Use the declared Node and pnpm versions, install from the root lockfile and
prepare the environment files as described in [README](../README.md).
Verification stops at the first failing stage and exits unsuccessfully.
It never repairs files automatically.

## What each gate proves

| Order | Command              | Responsibility                                                                                                         |
| ----- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1     | `pnpm format:check`  | Check repository formatting without rewriting files.                                                                   |
| 2     | `pnpm lint`          | Check backend, frontend, internal packages and JavaScript tooling; warnings fail verification.                         |
| 3     | `pnpm typecheck`     | Build prerequisite library declarations and check application, package and test types.                                 |
| 4     | `pnpm test:coverage` | Run behavior tests and require at least 90% statements, branches, functions and lines for each production source file. |
| 5     | `pnpm build`         | Build both applications and internal libraries for deployment.                                                         |

The coverage command already executes the complete application test suite.
`verify` therefore does not run a redundant `pnpm test` stage. For feedback
while editing, `pnpm test` still runs behavior checks without coverage.
Coverage thresholds and source inclusion remain unchanged from P0.4.

Format, lint and types address different problems. Formatting chooses a
consistent representation; lint detects suspicious constructs; types check
contracts. Tests exercise behavior. A successful build alone cannot replace
any of these checks. See [test foundations](testing.md) for isolation rules,
source-level lifecycle measurement and the test pyramid.

## Shared configuration and commands

Prettier and ESLint are development dependencies of the workspace root, with
one root configuration for each. Both applications resolve the same tools.
The existing tool versions are preserved while consolidating their ownership.

`.prettierrc.json` retains the existing application conventions: two spaces,
semicolons, double quotes, ES5 trailing commas and a 120-column print width.
`.prettierignore` excludes generated output, coverage, dependencies, local
conversation data and the machine-generated lockfile. Configuration and
Markdown documentation are formatted along with source and tests. Commit the
root lockfile when dependencies change; excluding its formatting does not
bypass frozen-install validation.

`eslint.config.mjs` uses recommended JavaScript and TypeScript rules for
applications and tooling. The common rules define no runtime globals. Separate
file scopes supply Node globals to backend, scripts, configuration and Node
tests, and browser globals to frontend source and `packages/ui/src`. Node unit
tests under `frontend/src/store` are excluded from the browser scope. React
Hooks and Fast Refresh rules apply to browser components. A browser-only
`no-restricted-globals` rule rejects Node-only globals explicitly, because
the recommended TypeScript rules disable `no-undef`. Shared library source
inherits neither runtime's globals. Generated `dist`, dependency and coverage
directories are ignored.
Unused callback parameters may use the `_` prefix; other unused identifiers
remain errors. Root lint uses `--max-warnings 0`.

The frontend application compiler explicitly loads only `vite/client` ambient
types and excludes test files/setup. The test compiler overrides that exclusion
and loads Node types; the Vite/tooling compiler explicitly loads Node types too.
Keeping tests out of the browser program prevents Vitest's transitive Node
declarations from widening production globals. The UI library already limits
ambient types to React and React DOM. Regression tests lint virtual browser,
UI and Node files, and compile a browser probe that must reject `process`,
`Buffer`, `require` and `__dirname`.

```sh
# Apply formatting intentionally, then inspect the diff.
pnpm format

# Focused application checks use the shared tools and configuration.
pnpm --filter backend lint
pnpm --filter frontend lint
pnpm --filter backend format:check
pnpm --filter frontend format:check
```

Root commands also cover the internal libraries and their compiler script.
Their entry points currently export no behavior; future implementations must
add tests and meet the same coverage policy.

## Runtime and type compatibility

The backend remains on Express 4. Its direct `@types/express` dependency also
uses major version 4, replacing the incompatible major-5 declaration. This
change aligns compilation with the runtime API; it does not migrate Express.
Frozen install, HTTP integration and lifecycle tests validate the combination.

## Web Vitals decision

The prototype's `reportWebVitals` helper was never called or connected to a
reporting destination. P0.5 removes that helper and the `web-vitals` dependency
until observability work defines a deliberate reporting boundary. Its tests
are removed with the retired behavior. No coverage exclusion or ignore
directive replaces it. The complementary P0.4 commit independently passes
coverage with the original helper and its tests still present.

## Existing frontend bundle warning

Vite reports one JavaScript chunk of approximately 623 kB minified, exceeding
its default 500 kB warning threshold. The warning remains visible: this task
does not increase `chunkSizeWarningLimit`, suppress logging or invent a
performance budget that has not been measured.

The prototype eagerly imports both pages, Material UI and Markdown support.
These are candidates for future bundle analysis, route splitting and lazy
loading. Measure initial loading and interaction costs before deciding which
split improves user experience. A passing `verify` means the configured
correctness and coverage gates pass; it does not mean the bundle warning is
resolved or that loading performance has been benchmarked.

## Verification evidence

The P0.5 suite contains 130 checks: 79 backend and 51 frontend.
All source files satisfy each 90% coverage threshold. Backend totals are
98.37% statements, 98.52% branches, 97.56% functions and 98.25% lines;
frontend totals are 100% statements, 98.73% branches, 100% functions and
100% lines. Web Vitals and its three tests are retired together; the globals
follow-up adds two regression checks for lint and TypeScript boundaries.

The full root verification sequence, a frozen offline install and focused
application format/lint commands pass. P0.6 adds [continuous integration](continuous-integration.md)
and documents clean-clone validation and the first hosted-run requirement.

References: [ESLint flat configuration](https://eslint.org/docs/latest/use/configure/configuration-files),
[typescript-eslint setup](https://typescript-eslint.io/getting-started/),
[Prettier configuration](https://prettier.io/docs/configuration),
[Vitest coverage](https://vitest.dev/guide/coverage) and
[Vite build options](https://v6.vite.dev/config/build-options#build-chunksizewarninglimit).
