## Why

OneShowSEO already has a strong commercial product prototype, but many screens are ahead of the underlying platform contracts and sources of truth. Before building each SEO agent, the product needs a secure multi-tenant foundation so users, projects, permissions, subscriptions, usage, tasks, approvals, integrations, APIs, and operations behave consistently and can support paid customers.

This change is a **platform-level foundation**. It deliberately separates shared commercial infrastructure from agent-specific SEO reasoning so future agents can be developed independently without duplicating identity, billing, scheduling, approvals, secret storage, or execution logic.

## What Changes

- Establish organization/workspace, user, project, membership, role, invitation, session, and tenant-isolation contracts that match the existing workspace, Projects, Team, and Project Settings prototypes.
- Establish plan catalog, trials, subscriptions, entitlements, credits, usage metering, invoices, payment-provider boundaries, limits, and upgrade/downgrade behavior for a real commercial product.
- Establish one durable task and job lifecycle for scheduled, manual, API, and agent-triggered work, including idempotency, retries, cancellation, progress, artifacts, usage settlement, and restart recovery.
- Establish Agent Center as the control plane for agent registration, configuration, schedules, capabilities, versions, health, runs, logs, memory references, cost, and feature gating—without implementing any agent's SEO logic.
- Establish Approval Center as the governed bridge between agent recommendations and external changes, including evidence, change previews, risk policy, assignees, approval states, execution records, and rollback metadata.
- Establish integration and credential management for search, analytics, ranking, CMS, AI, storage, notification, and webhook providers. Secrets remain server-side, encrypted, scoped, rotated, and audited.
- Establish versioned customer API and MCP access with scoped keys, quotas, rate limits, webhooks, idempotency, revocation, and auditability.
- Establish customer and administrator operational foundations: honest UI states, notifications, audit logs, feature flags, support controls, health metrics, job operations, backups, data retention, exports, deletion policy, and production rollout gates.
- Preserve the existing bilingual information architecture and prototypes, while replacing fabricated or inert metrics/actions with real values, an explicit demo state, or an explicit unavailable state.
- Migrate existing authentication, projects, audit/research runs, tasks, approvals, billing, API access, and administrator data through additive, backward-compatible changes.

### Delivery Phases

1. **Commercial kernel:** tenancy, identity, projects, RBAC, entitlements, metering, audit, and honest UI states.
2. **Execution kernel:** durable jobs, task lifecycle, Agent Center control plane, Approval Center, artifacts, and notifications.
3. **Ecosystem kernel:** integrations, encrypted credentials, API/MCP, webhooks, billing provider, and operational administration.
4. **Agent onboarding:** implement SEO agents one by one against the stable platform contracts, beginning with Research and SEO Audit.

### Non-Goals

- Implementing Research, Audit, Keyword, Content, Publish, GEO, or Analytics agent domain logic in this change.
- Promising live third-party data, rankings, AI mentions, traffic, invoices, or agent activity when the relevant provider is not configured.
- Enabling automatic high-risk publishing, destructive project/account deletion, or live payment collection before their separate security and rollout gates pass.
- Storing customer provider secrets, payment details, or unrestricted agent inputs/outputs in browser state, logs, analytics events, or administrator exports.
- Replacing the current visual prototype or changing its core navigation model.

## Capabilities

### New Capabilities

- `identity-and-tenancy`: Organizations, accounts, sessions, verification, membership, RBAC, invitations, tenant isolation, and account lifecycle.
- `project-and-team-governance`: Projects, settings, ownership, team access, environments, goals, limits, and project lifecycle.
- `commercial-entitlements`: Plans, trials, subscriptions, feature entitlements, credits, usage metering, invoices, and billing lifecycle.
- `agent-control-plane`: Agent registry, capability/version contracts, configurations, schedules, health, runs, logs, and feature gating without agent domain logic.
- `task-approval-runtime`: Durable tasks/jobs, approval policies, recommendation evidence, change sets, retries, settlement, artifacts, and rollback records.
- `integration-and-secret-management`: Provider connections, encrypted credentials, OAuth/API-key lifecycle, scopes, health, sync state, and secret privacy.
- `api-mcp-platform`: Versioned API and MCP access, scoped keys, rate limits, idempotency, webhooks, revocation, and usage visibility.
- `platform-operations`: Honest UI states, notifications, audit logs, administration, observability, support, privacy operations, backups, retention, and release gates.

### Modified Capabilities

None. The current repository has no baseline OpenSpec capability specifications; existing behavior is preserved and formalized through the new capabilities above.

## Impact

- **Customer product:** all current public, authentication, workspace, project, team, billing, integration, API/MCP, approval, task, and settings screens gain defined real-data contracts and release states.
- **Agent development:** each future agent must register capabilities and emit versioned tasks, progress, evidence, recommendations, artifacts, and usage through the platform interfaces; prompts and SEO algorithms remain agent-owned.
- **Data and APIs:** additive schema evolution is required for organizations, memberships, entitlements, ledgers, jobs, agent definitions/runs, approvals, integrations, secrets, API clients, webhooks, notifications, and audit events.
- **Infrastructure:** commercial deployment requires a production database and migration discipline, a durable job mechanism, encrypted secret storage, object storage for artifacts, monitoring, backups, and controlled feature rollout. SQLite remains suitable for local development and migration compatibility, not the target multi-instance source of truth.
- **Security and privacy:** every operation requires authenticated tenant scope, least-privilege authorization, secret redaction, immutable audit correlation, bounded retention, export/deletion policy, and cross-tenant negative tests.
- **Quota and billing:** every billable action must authorize entitlement and reserve/commit/release usage exactly once. Provider and payment failures must not fabricate completion, double-charge, or silently exceed limits.
- **Backward compatibility:** current URLs and customer records remain valid. Migrations are additive, APIs are versioned, and features stay behind server-controlled flags until their data, security, browser, backup, monitoring, and rollback gates pass.
- **Commercial risks addressed:** misleading prototype data, inconsistent permissions, single-process task loss, double settlement, secret leakage, tenant crossover, unsupported scale, missing audit evidence, and unsafe automatic publication.
