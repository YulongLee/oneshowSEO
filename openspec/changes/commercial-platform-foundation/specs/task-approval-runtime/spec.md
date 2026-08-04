## ADDED Requirements

### Requirement: Durable task and job lifecycle
Manual, scheduled, API, MCP, approval, and agent-triggered work SHALL use one persisted task/job model with queued, running, retrying, waiting-approval, completed, failed, cancelled, and quarantined states.

#### Scenario: Worker restarts during execution
- **WHEN** a worker stops and its lease expires before terminal completion
- **THEN** another eligible worker SHALL recover the job according to retry policy without duplicating external effects, artifacts, or charges

#### Scenario: User cancels cancellable work
- **WHEN** an authorized user cancels a non-terminal task
- **THEN** the platform SHALL signal cancellation, prevent new attempts, settle reservations exactly once, and preserve the audit trail

### Requirement: Idempotent execution and settlement
Every task, job attempt, artifact, external mutation, notification, webhook, and usage settlement SHALL be correlated and idempotent within its defined scope.

#### Scenario: Request is retried by a client
- **WHEN** the same authorized action is submitted with the same idempotency key and equivalent payload
- **THEN** the platform SHALL return the existing operation result or state instead of creating duplicate work

### Requirement: Evidence-based approval
Recommendations SHALL contain source provenance, captured time, evidence references, confidence, impact hypothesis, risk, proposed changes, estimated cost, expiry, and rollback requirements before approval.

#### Scenario: Reviewer opens an approval
- **WHEN** an authorized reviewer selects a pending recommendation
- **THEN** Approval Center SHALL show the current and proposed state, evidence, agent/version, project, risk, confidence, cost, and execution consequences in the selected locale

#### Scenario: Evidence is stale or unavailable
- **WHEN** required evidence has expired, changed, or cannot be authorized
- **THEN** the platform SHALL block approval or require regeneration and SHALL NOT execute the stale change set

### Requirement: Risk-based approval policy
Approval requirements SHALL be evaluated server-side from organization, project, capability, environment, risk class, actor, and entitlement policy.

#### Scenario: High-risk action is submitted
- **WHEN** an action can publish externally, modify indexing directives, delete content, change credentials, or cause another configured high-risk effect
- **THEN** the platform SHALL require explicit authorized human approval and SHALL NOT auto-approve it in the foundation release

### Requirement: Immutable decisions and reversible execution records
Approve, reject, request-changes, defer, execute, fail, verify, and rollback decisions SHALL retain actor, reason, timestamp, policy version, correlation, and immutable proposal version.

#### Scenario: Approved change executes
- **WHEN** an approved change set is executed successfully
- **THEN** the platform SHALL record the external result, before/after evidence, verification state, usage settlement, and available rollback metadata without altering the original decision

### Requirement: Authorized artifacts and progress
Task outputs and reports SHALL be tenant/project-scoped artifacts with hashes, provenance, retention, malware/content scan state, and short-lived authorized access.

#### Scenario: Another tenant requests an artifact URL
- **WHEN** an actor outside the owning tenant attempts to retrieve or refresh artifact access
- **THEN** the platform SHALL deny the request without revealing object-storage keys or artifact metadata
