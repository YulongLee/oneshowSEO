## ADDED Requirements

### Requirement: Governed project lifecycle
The platform SHALL let entitled organization members create, configure, archive, restore, and delete projects according to role, plan, retention, and approval policy.

#### Scenario: Member creates a project
- **WHEN** an authorized member submits a unique valid website within the organization's project entitlement
- **THEN** the platform SHALL create the project with locale, market, timezone, goals, approval policy, owner, and immutable audit correlation

#### Scenario: Project limit is reached
- **WHEN** an organization at its project limit requests another project
- **THEN** the platform SHALL reject creation without side effects and show localized upgrade or cleanup options

### Requirement: Project-scoped team access
Project reads and actions SHALL require an active organization membership plus project access or an organization-wide permission.

#### Scenario: Team member loses project access
- **WHEN** an authorized manager removes a member from a project
- **THEN** subsequent project requests, jobs, exports, and provider actions by that member SHALL be denied while historical audit attribution remains intact

### Requirement: Project configuration source of truth
Project Settings SHALL be the authoritative customer interface for domain, locale, market, timezone, search engines, business type, goals, approval policy, and enabled platform capabilities.

#### Scenario: Settings are updated concurrently
- **WHEN** two authorized clients update the same project version
- **THEN** the platform SHALL accept at most one conflicting update and require the other client to reload the current version

#### Scenario: Invalid or unsafe domain is submitted
- **WHEN** a project URL contains unsupported schemes, embedded credentials, or an invalid host
- **THEN** the platform SHALL reject it before persistence or network access

### Requirement: Safe project deletion
Destructive project deletion MUST use explicit confirmation, authorization, retention policy, cancellation of future work, credential detachment, and an immutable deletion audit.

#### Scenario: Project has running or approved external changes
- **WHEN** an owner requests deletion while work can still mutate an external system
- **THEN** the platform SHALL block or safely cancel the work before deletion proceeds and SHALL report unresolved external effects

### Requirement: Real project health
Project Center health, status, agent indicators, trends, tags, team, and recent activity SHALL derive from persisted project-scoped sources with provenance and freshness.

#### Scenario: No health data exists
- **WHEN** a new project has not completed the required platform or agent runs
- **THEN** the interface SHALL show a localized no-data or setup-required state and SHALL NOT display sample health scores or trends
