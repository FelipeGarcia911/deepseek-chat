# Repository rules

Write code, test names and documentation in English.

## Types

- Do not use type assertions in production code or tests: no `as Type`, `as unknown as`, or non-null `!`. Parse untrusted input with the shared schemas, narrow with type guards (`instanceof`, `in`, `typeof`, `assert.ok`), or build complete typed fakes. `as const` is allowed.

## Tests

- Do not add comments to test files or test setup. Express intent through descriptive names and readable assertions. Put explanations in `docs/testing.md`.
- Every `test` or `it` name must start with `should` followed by the expected behavior. This includes parameterized and dynamically generated names.
- Maintain at least 90% coverage for statements, branches, functions and lines, globally and for every production source file. Include untested source files in the report.
- Do not lower thresholds, narrow coverage to tested files or add coverage-ignore directives to make a report pass.
- Use meaningful behavior tests. Follow the isolation and cleanup rules in `docs/testing.md`.
