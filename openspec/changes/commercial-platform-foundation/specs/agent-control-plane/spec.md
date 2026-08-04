## ADDED Requirements

### Requirement: Versioned agent registry
The platform SHALL register each agent by immutable key and version with localized metadata, capabilities, input/output schemas, required integrations, entitlements, risk classes, and supported scheduling modes.

#### Scenario: Agent version is enabled for a project
- **WHEN** an authorized manager enables a compatible agent version and all dependencies are satisfied
- **THEN** the platform SHALL persist the versioned project configuration and expose an auditable ready state

#### Scenario: Agent dependency is unavailable
- **WHEN** an agent requires an entitlement, integration, permission, or platform service that is absent or unhealthy
- **THEN** Agent Center SHALL show a localized blocked or degraded state and SHALL NOT claim the agent is running

### Requirement: Platform-agent boundary
Agents MUST consume versioned platform execution contracts and MUST NOT implement or bypass platform identity, permissions, credits, schedules, approvals, secret storage, artifact authorization, or audit settlement.

#### Scenario: Agent requests platform context
- **WHEN** a job is dispatched to an agent
- **THEN** the platform SHALL provide only the authorized tenant/project/task context and opaque integration or artifact references required by the capability

#### Scenario: Agent returns a recommendation
- **WHEN** an agent produces a recommendation or change set
- **THEN** the platform SHALL validate its declared schema and route it through the task and approval lifecycle rather than allowing an ungoverned external mutation

### Requirement: Agent configuration and scheduling
Authorized users SHALL configure enabled capabilities, schedules, time windows, locale, risk policy, and platform-owned limits per project with version history and concurrency control.

#### Scenario: Schedule fires twice
- **WHEN** duplicate scheduler delivery occurs for the same agent, project, and schedule window
- **THEN** the platform SHALL create at most one active idempotent run

### Requirement: Agent health and run transparency
Agent Center SHALL show persisted status, current step, progress, version, configuration state, last/next run, recent runs, performance, cost, and redacted logs using real run data and freshness metadata.

#### Scenario: No agent has run
- **WHEN** a configured agent has no execution history
- **THEN** Agent Center SHALL show a localized ready/not-run state and SHALL NOT fabricate uptime, success rate, discoveries, or activity

#### Scenario: Agent run fails
- **WHEN** an agent run fails or is quarantined
- **THEN** the platform SHALL persist a stable redacted error class, correlation ID, retry eligibility, settled usage state, and authorized recovery action

### Requirement: Agent-specific logic remains independently owned
The platform SHALL NOT store agent prompts, proprietary SEO algorithms, unrestricted reasoning traces, or domain implementation inside shared configuration or commercial modules.

#### Scenario: New Keyword Agent version is introduced
- **WHEN** an agent developer deploys a compatible Keyword Agent version
- **THEN** the platform SHALL adopt only its manifest and versioned contracts while the keyword logic remains in the agent-owned implementation
