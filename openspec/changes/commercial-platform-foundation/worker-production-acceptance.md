# Production Worker Acceptance

Date: 2026-08-07

## Delivered

- Added an independently supervised `oneshowseo-worker.service` production process.
- Moved website audit execution from the request process to the durable `agents` queue.
- Re-authorizes the account, membership, organization, project, entitlement, and audit permission immediately before execution.
- Produces a scanned, immutable Markdown SEO audit report in tenant/project/task-scoped object storage.
- Commits the 10-Credit reservation only after successful job completion and releases it for terminal failure or cancellation.
- Exposes a real Worker heartbeat and queue backlog through `/api/health/ready`.
- Lets the workspace poll the authenticated durable task until a terminal result is available.

## Automated verification

- Build: passed.
- Lint: passed with the pre-existing unused homepage icon warning only.
- Test suite: 276 passed, 0 failed.
- Dedicated Worker test verifies task completion, report storage, clean scan state, one Credit commit, and zero remaining reservation.

## Production acceptance

- Web service: active.
- Worker service: active and enabled across restart.
- Worker readiness: `WORKERS_READY`, one active Worker, zero queued jobs after acceptance.
- Acceptance task: `c9de6e1b-8570-4809-b78e-575b5eefcfa8`.
- Job completed in one attempt with progress 100.
- Real audit completed with score 94, one page scanned, and 54 checks.
- Markdown report: 4,253 bytes, scan state `clean`.
- Credits: 10 reserved, 10 committed, 0 left reserved.
- Pre-deployment SQLite backup passed integrity validation at `/var/www/oneshowseo-backups/oneshowseo-pre-worker-20260807.sqlite`.
