## ADDED Requirements

### Requirement: Honest production experience
Every visible metric and action SHALL be backed by a real authorized source/effect or show an explicit bilingual demo, unavailable, syncing, stale, permission-required, no-data, or error state.

#### Scenario: UI action has no enabled backend capability
- **WHEN** a customer activates an unimplemented or release-disabled control
- **THEN** the platform SHALL explain its current state and recovery or availability path and SHALL NOT show mock success

#### Scenario: Metric source is unavailable
- **WHEN** the required provider or run has no usable snapshot
- **THEN** the platform SHALL show provenance-aware unavailable or stale state and SHALL NOT substitute sample customer data

### Requirement: End-to-end operational correlation
Requests, tasks, jobs, agent runs, provider calls, approvals, artifacts, usage, billing events, notifications, and webhooks SHALL carry traceable correlation identifiers and structured status metrics.

#### Scenario: Support investigates a failed task
- **WHEN** an authorized support operator opens a task incident
- **THEN** the platform SHALL present a redacted cross-system timeline, tenant scope, stable error class, settlement state, and permitted recovery actions

### Requirement: Immutable and scoped audit history
Security, commercial, administrative, approval, credential, project, membership, API, and destructive actions SHALL create append-only audit events with actor, tenant, target, reason where required, outcome, time, policy/version, and correlation.

#### Scenario: Support performs an elevated action
- **WHEN** an authorized support role changes customer-accessible state
- **THEN** the platform SHALL require a reason, enforce the support scope, notify according to policy, and record the action without secrets or unrestricted content

### Requirement: Privacy, retention, export, and deletion operations
The platform SHALL enforce documented tenant-aware retention, legal hold, customer export, credential erasure, artifact expiry, and account/project deletion workflows.

#### Scenario: Customer requests an export
- **WHEN** an authorized owner requests an organization export
- **THEN** the platform SHALL produce an auditable scoped artifact that excludes credentials, hashes, internal security metadata, unrelated tenants, and prohibited provider data

#### Scenario: Destructive deletion is release-disabled
- **WHEN** a user requests irreversible deletion before required policy and operational gates are enabled
- **THEN** the platform SHALL deny the destructive action honestly and provide the approved support or retention path

### Requirement: Commercial release gates
Production enablement of billing, integrations, API/MCP, agents, or autonomous execution SHALL require passing migration, authorization, tenant-isolation, idempotency, secret, browser, accessibility, localization, load, backup/restore, monitoring, and rollback gates appropriate to the capability.

#### Scenario: Capability rollout begins
- **WHEN** operators enable a new commercial capability for a cohort
- **THEN** the platform SHALL record the version, schema, flags, tests, health, backup, rollback, owners, and observation criteria and SHALL support immediate server-side disable

### Requirement: Resilient backups and health
The platform SHALL provide tested database and artifact backups, recovery objectives, liveness/readiness checks, dependency health, alerts, and documented incident/rollback procedures.

#### Scenario: Production dependency becomes unhealthy
- **WHEN** database, queue, object storage, email, payment, or a provider adapter fails readiness policy
- **THEN** affected work SHALL fail closed or degrade honestly, alerts SHALL identify the dependency, and unrelated safe capabilities SHALL remain available
