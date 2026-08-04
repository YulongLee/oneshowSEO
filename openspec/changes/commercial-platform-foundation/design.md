## Context

OneShowSEO currently combines a polished bilingual prototype, authentication, SQLite persistence, API routes, several real audit/research operations, and many presentation-only product modules in one deployable application. This is enough to validate the product direction, but not yet a safe foundation for multiple paid tenants, background agents, third-party credentials, payment settlement, high-risk publishing, or horizontal growth.

The primary stakeholders are customers and their teams, OneShowSEO operators and support staff, finance/operations, agent developers, and external integration providers. The immediate constraint is to preserve the current product prototype and URLs while replacing screen-by-screen state with shared commercial sources of truth.

The central boundary is:

- **Platform control plane:** identity, tenants, projects, RBAC, plans, entitlements, credits, billing, integrations, secrets, agent registry/configuration, scheduling, tasks/jobs, approvals, files, notifications, API/MCP, audit, and operations.
- **Agent domain plane:** SEO prompts, crawling/check logic, keyword algorithms, competitor logic, content generation rules, publishing decisions, GEO measurement, analytics interpretation, and agent-specific result schemas.

Agents may depend on platform contracts. The platform MUST NOT depend on the internal implementation of a specific agent.

## Goals / Non-Goals

**Goals:**

- Create a commercially safe, multi-tenant foundation matching the current product information architecture.
- Let every current screen read a real source of truth or show an explicit bilingual unavailable/demo/empty state.
- Provide stable versioned contracts so each agent can be implemented and deployed incrementally.
- Make background work durable, observable, idempotent, quota-aware, approval-aware, and recoverable.
- Make customer secrets, tenant data, billing actions, and administrative actions least-privilege and auditable.
- Preserve current routes and migrate existing accounts/projects without a big-bang rewrite.

**Non-Goals:**

- Implement any agent's SEO reasoning or external data collection.
- Split the application into many independently deployed microservices in the first release.
- Enable live payments or autonomous high-risk publishing before separate launch gates pass.
- Promise real provider-derived metrics without an active, healthy, authorized provider connection.
- Replace the current visual design or bilingual product structure.

## Decisions

### 1. Start with a modular monolith plus independently supervised workers

The first commercial architecture SHALL use one TypeScript codebase divided into bounded platform modules, one web/API process, and one or more worker processes. Modules communicate through typed application services, durable commands/events, and versioned DTOs—not cross-module table writes.

This provides transactional consistency and operational simplicity while the team is small. Extracting a module into a service later remains possible because ownership and contracts are explicit.

**Alternative considered:** immediate microservices. Rejected for the foundation phase because distributed transactions, service discovery, multi-service observability, and deployment coordination add risk before traffic and team boundaries justify them.

### 2. Define bounded contexts and single data owners

| Context | Owns | Does not own |
| --- | --- | --- |
| Identity & Tenancy | accounts, organizations, sessions, memberships, roles, invitations | project SEO data |
| Project Governance | projects, domains, settings, goals, team access mapping | provider secrets, agent algorithms |
| Commerce | plans, prices, subscriptions, entitlements, credit ledger, usage, invoices | payment-card data |
| Agent Control Plane | agent definitions, versions, capabilities, configuration refs, schedules, health, run metadata | prompts and agent domain logic |
| Execution | tasks, jobs, attempts, progress, cancellation, artifacts, idempotency | billing policy, agent implementation |
| Approval | recommendations, evidence refs, change sets, risk, decisions, execution/rollback refs | direct provider credentials |
| Integration Vault | connection metadata, encrypted credentials, OAuth state, scopes, sync cursors, health | customer-visible raw secrets |
| Developer Platform | API clients, keys, scopes, MCP clients, rate limits, webhooks, deliveries | internal admin sessions |
| Operations | audit events, notifications, flags, incidents, support actions, retention jobs, health | unrestricted customer content |

Every record includes immutable opaque IDs, tenant scope where applicable, timestamps, version/concurrency metadata, and correlation identifiers.

### 3. Use PostgreSQL as the production source of truth

PostgreSQL SHALL be the target production database for multi-tenant commercial state, transactions, row locking, migrations, reporting replicas, and backup/restore. SQLite remains supported for local development and as a transitional import source.

The current pre-commercial phase uses PostgreSQL 16 on the existing application server, bound to localhost only, with separate application, migration, and worker roles. This keeps the foundation testable without introducing a managed-service cost before the product is ready. Before accepting paid commercial workloads, the same versioned schemas and migration tooling SHALL be moved to managed PostgreSQL with private-network access, automated backups, point-in-time recovery, monitoring, and a rehearsed restore. The local instance is a staging bridge, not the final high-availability topology.

All schema changes are versioned, additive first, reversible where possible, and applied separately from application startup. Tenant identifiers and indexes are mandatory on tenant-scoped tables. Database access is repository-scoped by bounded context; authorization is enforced at the service boundary and reinforced by query scope.

**Alternative considered:** retain SQLite in production. Rejected as the target because a single local file and process-level write model constrain multi-instance workers, failover, operational tooling, and concurrent commercial workloads.

### 4. Use a transactional outbox and durable leased jobs

User/API actions write domain state, usage reservation, job intent, and outbox events in one database transaction. Workers claim jobs with bounded leases, heartbeat, persist attempts/progress, and recover expired leases. Redis MAY provide low-latency wake-up, caching, and distributed rate limiting, but PostgreSQL remains the job and settlement source of truth.

Every command accepts or derives an idempotency key. Terminal transitions and credit settlement are compare-and-set operations so retries cannot double-publish, double-create artifacts, double-charge, or double-refund.

**Alternative considered:** in-process timers. Rejected because application restarts can lose work and cannot safely coordinate multiple workers.

### 5. Make Agent Center a registry and control plane

Each agent registers an immutable key, version, localized metadata, capability manifest, accepted input schema, produced output/event schemas, required integrations, required entitlements, risk classes, and supported schedule modes. Project-level configuration references the registry version and contains only platform-owned configuration; prompts and domain rules stay in the agent package/service.

The common execution contract contains tenant/project/user context, task and run IDs, locale, capability, bounded inputs or artifact references, integration references, deadline, cancellation token, and idempotency key. Results contain normalized status, progress, evidence/artifact references, recommendation/change-set references, usage, redacted errors, and agent-version metadata.

Agent memory is not an unrestricted shared transcript. The platform stores typed, tenant-scoped memory references with retention and provenance; each agent owns interpretation.

### 6. Separate recommendations, approval decisions, and execution

Agent output cannot mutate a customer website directly. It creates a recommendation with evidence, confidence, impact hypothesis, proposed change set, risk class, cost estimate, expiry, and rollback requirements.

Approval policy evaluates organization, project, capability, risk, environment, assignee, and entitlement. High-risk/destructive/external-publication actions always require explicit human approval in the foundation release. Approved execution creates a new idempotent task; the original proposal and decision remain immutable.

### 7. Treat commerce as an append-only ledger plus entitlement snapshots

Plans and prices are catalog records. Subscription state produces effective entitlement snapshots (projects, seats, agents, integrations, API access, storage, retention, rate limits, and monthly credits). Credits use an append-only ledger with reservation, commit, release, grant, expiry, refund, and adjustment entries correlated to one task/usage event.

Payment-provider webhooks are verified, deduplicated, persisted, and processed asynchronously. OneShowSEO stores provider customer/payment-method references and invoice metadata, never raw card data. Until live billing is gated on, the UI returns a server-controlled unavailable state and does not simulate payment success.

### 8. Build an encrypted integration vault

OAuth tokens and API keys are encrypted with authenticated encryption using a production master key outside the application database. APIs return only connection IDs, scopes, state, masked hints, timestamps, and coarse health. Decrypted values exist only inside bounded provider adapters for the duration of a call.

Provider adapters enforce tenant ownership, allowlisted endpoint policies, SSRF/redirect/DNS protections, timeout and retry policy, rate limits, normalized errors, rotation/revocation, and secret-free logging. Administrators can inspect health and metadata but cannot retrieve customer secrets.

### 9. Expose a versioned BFF, public API, and MCP facade over the same services

The web application uses server-side application services/BFF routes. Public REST `/api/v1` and MCP tools call the same authorization, entitlement, idempotency, execution, and audit services. API keys are hashed at rest, scoped by organization/project/action, optionally expiring, individually revocable, and shown only once.

Webhook deliveries are signed, replay-protected, retried with backoff, and quarantined after exhaustion. Public response envelopes use stable error codes, correlation IDs, pagination, and localized user-safe messages; internal/provider errors never cross the boundary.

### 10. Store files and reports outside the relational database

Generated reports, crawl evidence, imports, exports, content assets, and other large artifacts use object storage under tenant/project-scoped immutable keys. The database stores ownership, hash, MIME type, size, retention class, scan status, and signed-access metadata. Upload/download URLs are short-lived and authorized server-side.

The existing Aliyun OSS bucket can be used through a provider-neutral object-store adapter with a dedicated `oneshowseo/` prefix and least-privilege credentials. Previously exposed credentials must be rotated before commercial use.

### 11. Use an honest metric provenance contract

Every customer-visible metric records source type, source connection, captured-at time, freshness, completeness/confidence, and scope. UI states are exactly: real/fresh, real/stale, syncing, unavailable, permission-required, no-data, error, or explicitly labelled demo. Production SHALL NOT silently fall back to sample values.

Overview cards aggregate from source-owned snapshots; they do not invent cross-module totals. Chinese and English labels, empty states, errors, time zones, units, and accessibility text are part of acceptance criteria.

### 12. Make operations and support first-class, scoped capabilities

Structured logs, traces, metrics, audit events, and alerts share correlation IDs across requests, jobs, provider calls, usage, approvals, and webhooks. Audit events are append-only and redact secrets/content by policy. Administrative roles are separated into platform admin, support, finance, security, and operations scopes; sensitive support actions require a reason and are recorded.

Health checks distinguish liveness, readiness, database, queue, object storage, email, billing, and provider adapters. Backups, point-in-time recovery, retention, export, deletion workflows, incident procedures, and one-step feature disable/rollback are release requirements rather than later documentation.

### 13. Deployment topology and progressive rollout

Initial production topology:

- Nginx/CDN/WAF → stateless web/API instances.
- Worker supervisor → one or more durable job workers.
- Pre-commercial: localhost-only PostgreSQL 16 on the current server → authoritative foundation test state.
- Paid launch: managed PostgreSQL on the private network → authoritative commercial state.
- Redis → cache, wake-up, distributed throttling, and short-lived coordination only.
- Aliyun OSS → tenant-scoped artifacts and reports.
- External email, payment, analytics/search/CMS providers through adapters.
- Central logs, metrics, traces, alerts, and error reporting.

Capabilities are server-side feature flagged by environment, plan, tenant cohort, project, and agent version. Schema deployment precedes code deployment; flags remain off until migrations, security tests, provider health, browser acceptance, backup, monitoring, and rollback evidence pass.

## Risks / Trade-offs

- **[Current prototype implies more functionality than the backend provides]** → Build an action/metric coverage matrix and replace every unbacked state with explicit localized availability states before charging customers.
- **[Migrating SQLite data can corrupt ownership or billing state]** → Use repeatable import tooling, row counts/hashes, shadow reads, immutable backups, tenant invariants, and rehearsed rollback.
- **[A modular monolith can degrade into tight coupling]** → Enforce module-owned repositories, typed contracts, architecture tests, and prohibit cross-context table access.
- **[Durable execution adds operational complexity]** → Start with PostgreSQL leases/outbox, bounded states, strong dashboards, and run restart/idempotency fault tests before enabling agents.
- **[Provider and payment failures are outside platform control]** → Normalize failures, use circuit breakers/bounded retry, show honest state, preserve idempotency, and separate availability from unrelated capabilities.
- **[Customer secrets or SEO content may leak through logs/support]** → Centralize redaction, encrypt secrets, minimize retention, scan serializers/exports, and include negative security tests.
- **[Automatic SEO changes can damage customer sites]** → Require evidence, risk classification, preview, approval, scoped credentials, post-change verification, and rollback records.
- **[PostgreSQL/Redis/object storage increase cost]** → Phase infrastructure with commercial milestones; keep adapters simple and avoid service extraction until measured demand.
- **[Bilingual UX can drift]** → Use message keys, locale-complete CI checks, common status vocabulary, and browser acceptance in both languages.

## Migration Plan

1. Freeze and document the existing route, action, schema, user/project, billing, and deployment baseline; back up SQLite and production configuration.
2. Introduce module boundaries, typed IDs/contracts, feature flags, correlation IDs, audit primitives, and honest UI states without changing URLs.
3. Provision localhost-only PostgreSQL for the pre-commercial phase, then add object storage adapters, additive schemas, and repeatable SQLite-to-PostgreSQL imports in staging.
4. Move identity, tenancy, projects, memberships, and sessions; verify ownership and dual-read consistency before switching the source of truth.
5. Move plan/entitlement/usage/ledger state, then enforce limits in shadow mode before hard enforcement.
6. Introduce transactional outbox, durable tasks/jobs, artifacts, notifications, and worker supervision; migrate existing task history without re-execution or recharging.
7. Introduce Agent Center contracts and Approval Center runtime with no agent domain execution enabled.
8. Introduce encrypted integrations, API/MCP keys, webhooks, and operational administration behind feature flags.
9. Run cross-tenant, authorization, idempotency, restart, secret, billing sandbox, migration, accessibility, bilingual browser, backup/restore, load, and rollback gates.
10. Cut over by cohort, monitor commercial and technical SLIs, and retain the prior application/database snapshot until the observation window closes.

Rollback disables new writes/agents/integrations first, drains or quarantines jobs, restores the prior application version, and switches reads/writes to the verified prior source. Additive tables may remain; ledger and externally executed actions are never blindly rolled back and instead receive compensating, audited entries.

## Open Questions

- Which legal billing entity, currencies, tax jurisdictions, invoice rules, and payment providers are required for the first paid market?
- Is the first commercial deployment China-only, global, or region-partitioned, and what data-residency/ICP/privacy obligations apply?
- Which managed PostgreSQL, Redis, secret-management, logging, and monitoring products will replace the local pre-commercial services before paid launch?
- What are the initial plan limits and cost units for pages crawled, keywords tracked, model tokens, storage, API calls, and team seats?
- Which integrations are launch-critical: GSC, GA4, Bing Webmaster, Baidu, WordPress, Webflow, DataForSEO, email, or notification channels?
- Which agent actions, if any, may become low-risk auto-executable after post-launch evidence, and what rollback SLA is required?
