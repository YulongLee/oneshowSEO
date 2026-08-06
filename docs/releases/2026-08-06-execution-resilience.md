# Execution resilience acceptance — 2026-08-06

## Scope

Task 5.8 validates the durable execution kernel without creating production work or charging customer Credits.

## Evidence

- Worker loss and process restart: expired leases recover with bounded backoff, old attempts time out, and only one active lease may exist.
- Network timeout: retryable provider failures enter retrying state, redact errors, and quarantine after the configured maximum.
- Duplicate delivery: task creation, terminal settlement, notifications, and email delivery return the existing result or suppress the duplicate.
- Cancellation: queued work cannot be claimed; running work observes cancellation through heartbeat and settles once.
- Quarantine: exhausted work becomes terminal and releases its reservation exactly once.
- Artifact authorization: tenant and project scope, scan state, expiry, signature, hash, MIME, size, and storage integrity all fail closed.
- Settlement fault injection: late state conflicts roll back Credits, artifacts, notifications, external effects, outbox, audit, and idempotency writes.

## Result

The focused resilience suite passed 25/25 tests. The immediately preceding complete product suite passed 126/126 tests. Production remained healthy with zero active tasks, jobs, leases, or unresolved external effects before the release.
