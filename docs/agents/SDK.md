# OneShowSEO Agent SDK v1

Supported imports live in `platform/sdk/agents.ts`. Agent code validates a v1 bilingual manifest, receives a v1 execution envelope, and returns only validated progress, evidence, recommendation, artifact, usage, or error events. Platform IDs, correlation ID, sequence, limits, cancellation token reference, and idempotency key are mandatory.

## Local harness

Use `AgentDevelopmentHarness.run(implementation, executionFixture)` with `platform/modules/agents/fixtures/execution.json`. The harness rejects undeclared capabilities, mismatched versions, tenant/project/task correlation changes, non-contiguous sequences, invalid event schemas, and runs without a terminal completion/error event. `SyntheticReferenceAgent` is the canonical success/failure fixture and contains no SEO business logic.

## Security rules

- Never receive or emit raw passwords, OAuth tokens, API keys, private keys, unrestricted reasoning, or chain-of-thought.
- Access integrations, artifacts, and memory only through opaque platform references scoped to the execution organization and project.
- Respect deadline, cancellation, output, artifact, runtime, and usage limits. Outbound network access is platform mediated and allow-listed.
- Treat every delivery as duplicated. External effects require an idempotency key; publication, deletion, indexing, credential, and configured high-risk changes require platform approval.
- Evidence must identify its source and digest. Errors use stable localized message keys and redacted detail.

## Usage policy

Emit monotonic, deduplicated usage events using the meter and units declared by the platform price catalog. A final usage event is authoritative; retries must reuse the same usage event ID. Agents may not modify balances, entitlements, reservations, invoices, or ledgers directly.

## Certification checklist

Every release must provide exactly one passing artifact for all eleven gates enforced by `certifyAgentRelease`: capability contract, tenant isolation, permissions, idempotency, usage, evidence, approval, failure behavior, localization, observability, and rollback. Certification is recorded with an owner, timestamp, approver, agent version, and manifest version before any rollout flag can be enabled.
