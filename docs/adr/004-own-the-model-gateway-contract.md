# ADR-004: Own the model gateway contract

**Status:** Accepted; adapters start in P3.2.
**Date:** 2026-10-27.
**Source:** [Roadmap P3.1](../roadmap.md).

## Context

Phase 3 connects Runs to real models: Ollama locally (P3.2) and one hosted
provider (P3.7), with streaming, cancellation, timeouts and context budgets.
Providers differ in more than URLs: message shapes, streaming formats, usage
reporting, error codes and supported features all vary. Knowledge ingestion
(P6) needs embeddings, which some chat models do not offer and whose dimension
must be pinned with an index.

## Decision drivers

- Conversation use cases never see a provider payload, SDK type or HTTP status.
- Unsupported behavior fails explicitly instead of being silently emulated.
- Errors carry a stable kind that resilience policy (P3.5) can act on.
- Tests run without a model server, deterministically.
- Learning value: see exactly what crosses the provider boundary.

## Considered alternatives

Versions checked against npm on 2026-10-27.

| Alternative                                            | Benefit                                                                           | Cost or limitation                                                                                                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Call provider SDKs (`ollama`, `openai`) from use cases | No abstraction to maintain.                                                       | Use cases learn each payload; switching provider rewrites runtime code; tests need a server or mocks of SDK internals.                                              |
| Vercel AI SDK (`ai` 7.x) as the internal contract      | Many providers, streaming and tool calling ready; actively maintained.            | Its types become our domain contract and evolve on its release cadence; error and capability semantics are its own; hides the boundary this project wants to learn. |
| **Own small contract, one adapter per provider**       | Only the operations we use; explicit capabilities and error kinds; trivial fakes. | We write and maintain each adapter and its streaming parser. An SDK may still be used _inside_ an adapter.                                                          |

## Decision

[`backend/src/models/gateway.ts`](../backend/src/models/gateway.ts) defines the
contract owned by the Models module:

- **`ChatModel`**: `generate(request)` and `stream(request)` over provider-neutral
  `ChatMessage`s (`system`, `user`, `assistant`) and optional
  `GenerationParameters`. Streams yield `delta` events and exactly one final
  `done` event carrying the same `ChatResult`. Every request accepts an
  `AbortSignal`.
- **`EmbeddingModel`** is a separate contract with a fixed `dimensions` and batch
  `embed`. A provider may implement one, both or neither.
- **`ChatCapabilities`** declares `streaming`, `toolCalling`,
  `structuredOutput`, `vision` and `usageReporting`. `requireCapability` turns a
  missing capability into `unsupported_capability` instead of degrading to a
  lowest common denominator. Request fields for tools, schemas and images are
  added with the first use case that needs them.
- **Results** carry the effective `ModelIdentity` (`provider`, `model`) that
  produced them, which Runs record. **`Usage`** fields are optional:
  unavailable usage is absent, never `0`.
- **`ModelError`** has a closed `kind`: `unavailable`, `timeout`,
  `rate_limited`, `authentication`, `invalid_request`, `model_not_found`,
  `invalid_response`, `unsupported_capability`, `cancelled`. Only the first three are `retryable`.
  Adapters translate every provider failure into one of these; the HTTP layer
  maps them to problem codes when runtime execution is wired (P3.4).

Deterministic fakes (scripted replies, chunks, usage, failures before or
after a given number of chunks) and a reusable contract suite live in
[`backend/test/support`](../backend/test/support). The same
`describeChatModelContract` and `describeEmbeddingModelContract` suites run
against the fakes now and against every real adapter later, asserting only what
any provider must guarantee (non-empty content, deltas equal to the final
result, cancellation, vector shape and determinism), not exact wording.

### Configuration boundary

Application and domain configuration stay provider-neutral. `ModelSelection`
(`model` plus validated `defaultParameters`) is the only model configuration an
adapter receives from outside, alongside an adapter-local resolved connection.
Provider DTOs, connection fields and option names never leave
`backend/src/models/providers/<provider>/`:

| Neutral (gateway)          | Ollama adapter (`providers/ollama`)                           |
| -------------------------- | ------------------------------------------------------------- |
| `ModelSelection.model`     | `model` in `/api/chat`                                        |
| `temperature`              | `options.temperature`                                         |
| `topP`                     | `options.top_p`                                               |
| `maxOutputTokens`          | `options.num_predict`                                         |
| `ChatMessage`              | `messages[]` with the same roles                              |
| `stream()`                 | `stream: true`, NDJSON lines                                  |
| connection (adapter-local) | `OllamaConnection`: `baseUrl`, optional `apiKey`, `timeoutMs` |

Request parameters override the selection defaults. `baseUrl` is the API root as
Ollama documents it (`http://localhost:11434/api` locally,
`https://ollama.com/api` in the cloud with `apiKey` sent as `Authorization: Bearer`);
the adapter appends `/chat`. Reasoning returned in `message.thinking` is
deliberately discarded, so hidden reasoning never reaches Runs. Persisted Model Profiles,
`connectionRef` resolution to secrets and the registry that builds the right
adapter for a profile belong to P4.4 (and P3.7 once a second provider exists);
until then use cases receive a `ChatModel` and never branch on a provider name.

## Consequences

Switching or adding a provider means one adapter plus a passing contract suite;
use cases and Runs do not change. Capability gaps become explicit errors that the
administration UI can surface when a Model Profile is selected (P4.4).

We own adapter code, including streaming parsers and error translation, and the
contract will grow as tools, structured output and vision get real use cases.
Contract suites against real providers need a running model and are opt-in.

## Reconsideration

Revisit if more than two providers are needed and adapter maintenance dominates,
or if tool calling and multimodal input grow beyond what a small contract
expresses well. Adopting an SDK would happen inside adapters first, keeping this
contract stable.

## References

- [Ports and adapters](https://alistair.cockburn.us/hexagonal-architecture/).
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md).
- [AI SDK](https://ai-sdk.dev/docs/introduction).
- [ADR-001](001-use-modular-monolith.md), [domain glossary](../domain.md) and
  [lifecycle rules](../lifecycle.md).
