# ADR-001: Use a modular monolith for the platform API

**Status:** Accepted as the target architecture; incremental implementation pending.
**Date:** 2026-10-24.
**Source:** [Roadmap P0.1](../roadmap.md).

## Context

The prototype has an Express API that mixes startup, controllers, JSON
persistence and Ollama calls. The new MVP needs Assistant configuration,
immutable versions, promotion, RAG, conversations and inspectable Runs.
We need to learn and verify these behaviors through small changes while
supporting one Workspace and one administrator.

The monorepo and its UI/shared packages address code organization and reuse.
They do not, by themselves, define backend responsibilities or determine
how many processes are deployed.

## Decision drivers

- Follow a use case and test it without depending on real AI services.
- Keep clear ownership of data and invariants, with explicit dependencies.
- Use local transactions for publishing, promotion and Run persistence.
- Limit infrastructure and operating costs while validating the product.
- Support separate public chat and administration clients sharing the runtime.

## Considered alternatives

| Alternative                                                 | Benefit                                                              | Cost or limitation                                                                                                                       |
| ----------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Continue with the current monolith without explicit modules | Less immediate structural work                                       | Increases coupling between HTTP, storage and provider code; makes testing and domain changes harder.                                     |
| Modular monolith                                            | Domain interfaces and local transactions with one backend deployment | Requires discipline to preserve boundaries; shares resources and deployment lifecycle.                                                   |
| Microservices by domain                                     | Independent deployment and scaling per service                       | Introduces internal networking, distributed consistency, operational contracts and more infrastructure before there is evidence of need. |

## Decision

Build **one modular API deployed as a unit**, initially with one Node.js/Express
process and PostgreSQL with pgvector. Separate administrative and runtime HTTP
surfaces through appropriate authentication and policies within that same API.
Chat and admin web clients may be distributed separately; they do not turn
the backend into microservices.

Organize code around identity/Workspace, Assistants/configuration, releases,
models, knowledge, conversations/runtime and inspection/evaluation, as described
in the [architecture](../architecture.md). Use cases coordinate modules through
public interfaces. Each module controls its writes and encapsulates persistence
details. Composition connects repositories, providers and exporters; the domain
does not depend on their SDKs or on Express.

Keep `@chat-app/ui` for reusable presentation and `@chat-app/shared` for portable
utilities and deliberately defined contracts. Do not move the entire domain
into shared or give clients direct access to tables.

Do not introduce network communication between modules, brokers or domain
service deployments. PostgreSQL, source storage, model providers and the
telemetry destination are dependencies outside the API process. Pending
technology choices will be resolved in their respective tasks.

## Consequences

We can build and test complete flows with fewer operational components,
atomic promotions and traceability within the same backend. Interfaces allow
incremental replacement of Ollama, JSON and other adapters.

The process, resources and deployment are shared: a runtime failure or expensive
ingestion can affect administration. We must limit concurrency, measure load
and prevent uncontrolled heavy work on the request-handling thread. A folder
per module does not prevent coupling: reviews and future boundary tests must
detect internal imports and writes outside the owning module.

We do not gain independent scaling per module or failure isolation between
services. We accept that limitation during the MVP and will document it with
latency, concurrency and recovery measurements.

## Implementation and reconsideration

P0.2 starts by separating construction, composition and startup. Subsequent
phases introduce contracts, tests, PostgreSQL and modules incrementally; this
ADR does not authorize a simultaneous rewrite or bypass roadmap phases.

Reconsider a worker or service extraction only when measurements demonstrate
persistent contention, scaling or isolation requirements that cannot be
resolved within the process. An extraction requires another ADR with explicit
data ownership, consistency, operations and cost. A new domain or folder alone
is not sufficient justification.

## References

- [Current and target architecture](../architecture.md).
- [Roadmap: MVP boundaries and execution order](../roadmap.md).
- [C4: applications, data stores and deployment details](https://c4model.com/diagrams/container).
- [ADRs: recording a decision and its rationale](https://adr.github.io/).
