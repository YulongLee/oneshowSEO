## ADDED Requirements

### Requirement: Tenant-scoped provider connections
The platform SHALL manage provider connections by organization/project, provider type, granted scopes, state, owner, environment, health, sync cursor, and timestamps.

#### Scenario: User connects a supported provider
- **WHEN** an authorized member completes a valid OAuth or API-key connection within entitlements
- **THEN** the platform SHALL bind the connection to the selected tenant/project and expose only non-sensitive metadata and coarse health

### Requirement: Encrypted credential lifecycle
API keys, refresh tokens, client secrets, and equivalent credentials MUST be encrypted at rest with authenticated encryption and a production master key outside the application database.

#### Scenario: Credential is saved
- **WHEN** a valid credential is submitted
- **THEN** the platform SHALL encrypt it with unique authenticated metadata, return only an opaque connection ID and masked hint, and exclude plaintext/ciphertext from browser state, logs, analytics, audit payloads, and exports

#### Scenario: Credential is rotated or revoked
- **WHEN** an authorized user rotates, disconnects, or deletes a connection
- **THEN** prior credential material SHALL stop authorizing new calls and the lifecycle event SHALL be audited without revealing the secret

### Requirement: Safe provider adapter execution
Provider adapters SHALL enforce ownership, entitlement, scopes, allowlisted endpoint policy, HTTPS, SSRF and redirect protections, timeouts, bounded retry, rate limits, and normalized redacted errors.

#### Scenario: Endpoint resolves to an unsafe address
- **WHEN** a configured or redirected endpoint targets loopback, private, link-local, metadata, multicast, embedded credentials, or another disallowed destination
- **THEN** the platform SHALL reject the request before transmitting customer credentials

### Requirement: Honest integration health and synchronization
Integration screens SHALL show persisted connected, disconnected, syncing, healthy, degraded, expired, permission-required, rate-limited, or error states with freshness and recovery actions.

#### Scenario: Provider permission is revoked externally
- **WHEN** a sync receives an authorization or scope failure
- **THEN** the platform SHALL mark the connection permission-required, stop unauthorized retries, notify permitted users, and avoid displaying stale data as current

### Requirement: Administrator secret separation
Platform administrators and support staff SHALL NOT retrieve customer credential plaintext, ciphertext, encryption nonces, provider authorization headers, or raw provider error bodies.

#### Scenario: Administrator inspects connection health
- **WHEN** an authorized operator views an integration incident
- **THEN** the platform SHALL expose only tenant-safe metadata, coarse failure class, timing, correlation, and remediation state
