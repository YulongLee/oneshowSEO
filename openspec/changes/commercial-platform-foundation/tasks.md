## 1. Baseline and architecture guardrails

- [x] 1.1 Inventory every public, customer, administrator, API, and MCP route and classify each visible metric/action as real, demo-labelled, unavailable, or missing
- [x] 1.2 Record production commit, flags, services, SQLite schema/counts, users/projects/tasks/usage invariants, integrations, secrets inventory, backups, and rollback procedure without copying secrets into Git
- [x] 1.3 Create platform bounded-context modules, typed identifiers, service/repository boundaries, and architecture tests that reject cross-context persistence access
- [x] 1.4 Define versioned response/error envelopes, correlation IDs, pagination, provenance/freshness states, locale keys, and concurrency metadata
- [x] 1.5 Add server-controlled feature flags by environment, plan, organization cohort, project, capability, and agent version with audited changes
- [x] 1.6 Replace all production mock-success and fabricated customer metrics with real, stale, syncing, unavailable, permission-required, no-data, error, or explicit demo states in Chinese and English

## 2. Production data foundation and migration

- [x] 2.1 Provision localhost-only PostgreSQL for the pre-commercial phase, create separate least-privilege application/migration/worker roles, document connection and rotation policy, and require managed PostgreSQL before paid launch
- [x] 2.2 Add a versioned migration runner with expand/migrate/contract discipline, transactional locks, forward checks, and rollback metadata
- [x] 2.3 Create organization, membership, role, invitation, project, project-access, session, entitlement, ledger, audit, and feature-flag schemas with tenant indexes and constraints
- [x] 2.4 Build a repeatable SQLite-to-PostgreSQL importer with ID preservation, row counts, hashes, ownership validation, dry-run, resume, and immutable migration reports
- [x] 2.5 Add staging shadow reads and parity checks for authentication, users, projects, tasks, findings, research, approvals, usage, billing, and API access
- [x] 2.6 Rehearse local logical backup/restore, migration rollback, and isolated application rollback against a production-sized sanitized snapshot, and retain managed point-in-time restore as a paid-launch gate

## 3. Identity, tenancy, projects, and team

- [x] 3.1 Migrate registration, email verification, login, password recovery, logout, session rotation/revocation, and safe return destinations into the identity context
- [x] 3.2 Add organization creation/switching, active context, owner safeguards, account status, and tenant-aware session authorization
- [x] 3.3 Implement permission primitives for owner, admin, SEO manager, content manager, editor, writer, analyst, viewer, support, finance, operations, security, and platform admin
- [x] 3.4 Implement expiring single-use invitations, seat enforcement, project scopes, accept/cancel/expire flows, and membership suspension/revocation
- [x] 3.5 Migrate Project Center and Project Settings to real project lifecycle, domain validation, versioned settings, goals, approval mode, limits, archive, restore, and safe deletion gates
- [x] 3.6 Migrate Team to real members, teams, roles, project access, invites, activity, pagination, filters, and localized empty/error states
- [x] 3.7 Add automated cross-tenant, role-matrix, session, invitation, concurrent-update, guessed-ID, export, and administrator-boundary tests
- [ ] 3.8 Run Chinese and English browser acceptance for registration, verification, recovery, workspace/admin routing, project creation/settings, team invitation, revocation, and limit states

## 4. Commercial entitlements, credits, and billing

- [x] 4.1 Define versioned plan/price catalog, currencies, trials, projects, seats, agents, pages, keywords, API, storage, retention, and support entitlements
- [x] 4.2 Implement effective-entitlement resolution with organization overrides, suspension, grace, downgrade, and server-side enforcement at every protected action
- [x] 4.3 Implement append-only credit ledger, balance projection, reservation/commit/release/grant/expiry/refund/adjustment entries, and task/price-version correlation
- [x] 4.4 Implement usage event ingestion, deduplication, aggregation, pending/final states, billing periods, limit alerts, and admin reconciliation
- [x] 4.5 Migrate Billing and Upgrade Plan pages to real plan, usage, limits, renewal, invoices, payment-method references, and explicit live-payment availability
- [x] 4.6 Add payment-provider interface, signed/deduplicated webhook inbox, subscription/invoice state machine, sandbox adapter, and reconciliation jobs while keeping live checkout disabled
- [x] 4.7 Add property and concurrency tests proving retries cannot double-reserve, double-charge, double-release, double-refund, or exceed hard entitlements
- [ ] 4.8 Complete finance/security review, sandbox browser acceptance, invoice export validation, and launch decision for each currency/payment method

## 5. Durable execution, artifacts, notifications, and audit

- [x] 5.1 Create task, job, attempt, lease, progress, cancellation, idempotency, outbox, inbox, artifact, notification, and audit-event schemas and repositories
- [ ] 5.2 Implement transactional task creation with authorization, entitlement check, usage reservation, job intent, and outbox event in one transaction
- [ ] 5.3 Implement supervised workers with claim, lease, heartbeat, bounded retry/backoff, cancellation, expired-lease recovery, quarantine, and graceful shutdown
- [ ] 5.4 Implement idempotent terminal settlement for task status, artifacts, notifications, provider/external effects, and credit commit/release
- [ ] 5.5 Implement provider-neutral object storage with tenant/project prefixes, hashes, MIME/size policy, scanning state, retention, and short-lived authorized URLs
- [ ] 5.6 Implement bilingual in-app/email notification preferences, delivery state, deduplication, redaction, and recovery links
- [ ] 5.7 Migrate Tasks, Content Library, Knowledge Base, and Reports to the shared task/artifact sources without re-running or recharging history
- [ ] 5.8 Run worker crash, process restart, duplicate delivery, network timeout, cancellation, quarantine, artifact authorization, and settlement fault-injection tests

## 6. Agent Center platform contracts

- [ ] 6.1 Define and validate the agent manifest schema for key, version, localized metadata, capabilities, input/output/events, dependencies, entitlements, risks, schedules, and compatibility
- [ ] 6.2 Implement agent registry, immutable versions, project enablement/configuration, feature gating, version history, and optimistic concurrency
- [ ] 6.3 Define the platform-to-agent execution envelope and agent-to-platform progress/evidence/recommendation/artifact/usage/error envelopes with contract fixtures
- [ ] 6.4 Implement project agent schedules, time windows, time zones, deduplicated schedule firing, pause/resume, and next-run calculation
- [ ] 6.5 Implement Agent Center real status, dependency readiness, current step, progress, recent runs, logs, costs, performance, and not-run/degraded states
- [ ] 6.6 Add typed tenant-scoped agent memory references with provenance, retention, authorization, and deletion behavior without storing unrestricted reasoning traces
- [ ] 6.7 Create a no-op/synthetic reference agent to validate contracts, jobs, progress, costs, artifacts, failures, and scheduling without implementing SEO logic
- [ ] 6.8 Run manifest compatibility, cross-tenant, schedule duplication, version rollback, unavailable dependency, and bilingual browser acceptance tests

## 7. Approval Center and governed change execution

- [ ] 7.1 Create recommendation, evidence reference, change set, risk, policy, decision, assignee, execution, verification, and rollback schemas with immutable versions
- [ ] 7.2 Implement server-side approval policy evaluation by organization, project, capability, environment, risk, actor, entitlement, and expiry
- [ ] 7.3 Implement approve, reject, request changes, defer, reassign, expire, and bulk-safe operations with permission, reason, concurrency, and audit checks
- [ ] 7.4 Implement approved execution as a new idempotent task with usage reservation and external-effect/verification/rollback records
- [ ] 7.5 Migrate Approval Center to real queue, filters, evidence, provenance, before/after preview, impact hypothesis, cost, timeline, assignee, and localized states
- [ ] 7.6 Enforce mandatory human approval for publication, indexing directives, deletion, credential changes, destructive actions, and all configured high-risk capabilities
- [ ] 7.7 Add stale-evidence, changed-target, duplicate approval, concurrent decision, unauthorized reviewer, execution failure, partial external effect, verification, and rollback tests

## 8. Integrations and secret vault

- [ ] 8.1 Define provider catalog and adapter contracts for OAuth/API key, scopes, health, sync, cursor, rate limit, normalized error, disconnect, and deletion
- [ ] 8.2 Provision a production encryption master key or managed secret service and implement authenticated record encryption, rotation, versioning, and fail-closed behavior
- [ ] 8.3 Implement organization/project connection lifecycle with masked metadata, least privilege, ownership, entitlement, connection tests, status, and audit
- [ ] 8.4 Implement outbound HTTPS allowlists, SSRF/private/metadata/DNS/redirect protections, timeouts, circuit breakers, bounded retry, and credential-safe forwarding
- [ ] 8.5 Implement initial launch-critical provider adapters selected from GSC, GA4, Bing/Baidu, rank provider, WordPress/Webflow, email, and notifications
- [ ] 8.6 Migrate Integrations UI and administrator provider-health views to real connections, setup flows, activity, health, expiry, permission, and unavailable states
- [ ] 8.7 Rotate every previously exposed OSS/provider credential, use a dedicated `oneshowseo/` prefix and least-privilege account, and verify old credentials are invalid
- [ ] 8.8 Run encryption, serializer, log/export, cross-tenant, rotation, revocation, SSRF, redirect, DNS, timeout, rate-limit, and provider sandbox tests

## 9. API, MCP, and webhooks

- [ ] 9.1 Define and publish versioned REST resource contracts, scopes, error codes, pagination, idempotency, deprecation, and correlation behavior
- [ ] 9.2 Implement one-time-display hashed API keys with organization/project scopes, expiry, rotation, revocation, last-used, creator, and rate-limit policy
- [ ] 9.3 Implement MCP server discovery and tools over the same authorization, entitlement, task, approval, usage, and audit application services
- [ ] 9.4 Implement credential/tenant/project/endpoint/cost-aware distributed rate limiting and stable retry metadata
- [ ] 9.5 Implement signed webhook endpoints, event subscriptions, replay protection, delivery inbox/outbox, backoff, quarantine, inspection, and safe retry
- [ ] 9.6 Migrate API & MCP UI to real keys, usage, rate limits, endpoint documentation, webhook state, SDK examples, and localized unavailable states
- [ ] 9.7 Add API/MCP contract, scope, guessed-ID, key hash/redaction, rate-limit, duplicate request, replay, webhook signature, and backward-compatibility tests

## 10. Administration, observability, privacy, and release

- [ ] 10.1 Implement separated platform admin, support, finance, operations, and security permissions with reason-required elevated actions and immutable audits
- [ ] 10.2 Expand administrator UI for tenant/user status, entitlements, ledger reconciliation, provider health, jobs/quarantine, flags, incidents, notifications, and audit search without secret access
- [ ] 10.3 Add structured logs, metrics, traces, error reporting, dashboards, SLIs/SLOs, alerts, correlation timelines, and secret/content redaction tests
- [ ] 10.4 Implement organization export, retention, legal hold, artifact expiry, credential erasure, and project/account deletion workflows with release gates
- [ ] 10.5 Add health endpoints for liveness, readiness, database, workers, object storage, email, billing, and provider adapters with honest dependency degradation
- [ ] 10.6 Run production-like load, concurrency, failover, recovery-time, backup/restore, retention, export/deletion, and support-operation tests
- [ ] 10.7 Run complete Chinese/English desktop/mobile browser acceptance, keyboard/focus/screen-reader/reduced-motion checks, and visible-action backend coverage
- [ ] 10.8 Deploy schema and application with commercial flags off, verify migration invariants and rollback, then enable internal, canary, and paid cohorts with recorded observation criteria
- [ ] 10.9 Push the validated release and record commit, migrations, backups, tests, health, flags, monitoring, owners, rollout, incident contacts, and one-step rollback evidence

## 11. Agent implementation handoff

- [ ] 11.1 Publish the supported agent SDK/contracts, synthetic-agent fixtures, local development harness, security rules, usage policy, and certification checklist
- [ ] 11.2 Create separate OpenSpec changes for Research Agent and SEO Audit Agent using the completed platform contracts and no duplicated commercial infrastructure
- [ ] 11.3 Define the onboarding order and data-source prerequisites for Keyword, Content, Publish, GEO, and Analytics agents after the first two agents pass certification
- [ ] 11.4 Require every agent release to pass capability contract, tenant isolation, permissions, idempotency, usage, evidence, approval, failure, localization, observability, and rollback gates
