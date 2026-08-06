# Commercial platform foundation release — 2026-08-06

## Release identity

- Application release: `1af23f7` (rollout control), based on `ad2cd4c` (database-backed agent gate) and `5e834ba` (migration 0026 and Agent SDK handoff).
- Repository/branch: `YulongLee/oneshowSEO`, `main`; pushed successfully.
- Production: `/var/www/oneshowseo`, `oneshowseo.service`, public origin `https://oneshowseo.com`.
- Database migrations: `0001` through `0026` applied; pending count `0`.
- Restore points: `/var/backups/oneshowtools/pre-5e834ba-20260806T121052Z`, `/var/backups/oneshowtools/pre-ad2cd4c-20260806T121845Z`, and `/var/backups/oneshowtools/pre-1af23f7-20260806T122957Z` (SQLite and PostgreSQL snapshots; environment backup retained separately where required).

## Validation evidence

- Final full regression: `266/266` passed, including production-like concurrency, identity/team browser coverage, Agent Center controls, invoice export safety, and backup/restore; dedicated release suite passed `31/31`.
- SDK/Agent contract gate: `16/16` passed; rollout and database-backed Agent gate: `7/7` passed; lint and production build passed.
- Browser: public production page loaded in Chinese and English at desktop and 390×844 mobile sizes. Navigation/primary CTA/language actions remained visible at the applicable breakpoint. Automated accessibility acceptance passed document language, switch state, focus-visible CSS, live status/alert semantics, modal semantics, reduced-motion handling, responsive action retention, and visible-action backend wiring.
- Public and localhost homepage/liveness/readiness returned HTTP 200 after restart. Required SQLite and PostgreSQL dependencies are ready; object storage is ready. Optional worker, live billing, and provider dependencies remain explicitly not configured; email remains configured-but-unverified, so aggregate readiness is honestly `degraded` with `ready: true`.

## Flags and rollout

- `billing.live`: production environment `false`; `BILLING_LIVE_ENABLED` is also not enabled. No real payment collection was opened.
- `agents.execution`: global `false`; internal organization enabled; canary organization enabled; `plan:pro` enabled at rule version 3.
- Audited progression: `off → internal → canary → paid`, three immutable rollout events under correlation `release:1af23f7`.
- Paid means an eligible plan cohort may enable a certified Agent. It does not mean checkout or payment collection is active, and no unimplemented SEO Agent was registered by this release.
- Observation criteria: 30-minute minimum window, at least 100 requests, error rate ≤1%, p95 ≤1500 ms, ledger mismatch exactly 0, immediate disable on alert.

## Ownership and incident handling

- Release owner: platform administration.
- Runtime/database owner: operations.
- Authorization/credential incident owner: security.
- Credits/ledger/payment-state owner: finance; live-payment launch remains a separate finance/security decision.
- Monitoring: `/api/health/ready`, dependency detail, correlated telemetry/SLO alerts, service journal, jobs/quarantine and ledger reconciliation consoles.
- Incident contact path: the active platform-admin assignment is primary; operations, security, and finance assignments are routed through the separated administrator roles and immutable elevated-action audit.

## One-step rollback evidence

The paid-plan rule was changed `true → false → true` during release rehearsal and ended at version 3, proving version-checked disable and restore. For an incident, run the checked-in `npm run release:disable` command with the release/operator/cohort environment values; one invocation disables internal, canary, and paid rules and records the rollout as off. Application rollback uses the retained pre-release commit/snapshots; additive migration 0026 stays in place until audit retention permits removal.
