## ADDED Requirements

### Requirement: Scoped developer credentials
The platform SHALL issue organization-owned API and MCP credentials with explicit scopes, project restrictions, expiry, status, rate-limit plan, creator, and last-used metadata.

#### Scenario: API key is generated
- **WHEN** an authorized member creates a key within entitlements
- **THEN** the platform SHALL display the plaintext once, store only a secure hash and masked prefix, and audit the scopes and creator

#### Scenario: API key is revoked
- **WHEN** an authorized user revokes a key
- **THEN** all subsequent REST, MCP, and webhook-management requests using that key SHALL fail without affecting unrelated keys

### Requirement: Shared authorization and contracts
Web, public API, and MCP operations SHALL call the same tenant authorization, entitlement, idempotency, task, approval, usage, and audit services.

#### Scenario: MCP tool starts an agent task
- **WHEN** a scoped MCP client requests a permitted project capability
- **THEN** the platform SHALL create the same governed task used by the customer UI and return its stable task reference and state

### Requirement: Stable versioned API behavior
Public APIs SHALL provide versioned resource contracts, pagination, validation, stable error codes, correlation IDs, and safe deprecation policy.

#### Scenario: Invalid request is submitted
- **WHEN** an API or MCP client sends an invalid or unsupported payload
- **THEN** the platform SHALL reject it before side effects with field-safe validation and a stable machine-readable error

### Requirement: Rate limiting and idempotency
API and MCP access SHALL enforce credential, organization, project, endpoint, and cost-aware limits and support idempotency for mutation and execution requests.

#### Scenario: Client retries after a timeout
- **WHEN** a client repeats an equivalent mutation with the same valid idempotency key
- **THEN** the platform SHALL return the existing operation and SHALL NOT duplicate tasks, approvals, artifacts, external calls, or usage settlement

#### Scenario: Limit is exceeded
- **WHEN** a credential exceeds its effective request or cost limit
- **THEN** the platform SHALL reject additional work with a stable retry state before contacting downstream agents or providers

### Requirement: Signed webhook delivery
The platform SHALL sign webhook payloads, include event and delivery IDs, prevent replay, retry transient failures with backoff, and quarantine exhausted deliveries.

#### Scenario: Webhook endpoint repeatedly fails
- **WHEN** delivery exhausts the configured retry policy
- **THEN** the delivery SHALL enter a visible failed/quarantined state and authorized users SHALL be able to inspect redacted attempts and retry it safely
