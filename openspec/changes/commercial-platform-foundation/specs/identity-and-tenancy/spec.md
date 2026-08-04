## ADDED Requirements

### Requirement: Organization-scoped identity
The platform SHALL associate every authenticated commercial action with one active user, one active organization, and an authorized membership while preserving separate public and administrator sessions.

#### Scenario: User enters the customer workspace
- **WHEN** a verified active user requests the workspace with an active organization membership
- **THEN** the platform SHALL establish the organization context and route the user to the customer workspace regardless of platform administrator status

#### Scenario: User explicitly enters administration
- **WHEN** a platform administrator requests the administrator route
- **THEN** the platform SHALL require an administrator-scoped authorization check independent of customer workspace access

### Requirement: Tenant isolation
Every tenant-scoped read, write, export, task, file, integration, metric, and API operation MUST enforce organization and project ownership on the server.

#### Scenario: Member requests another tenant's resource
- **WHEN** an authenticated member supplies an identifier owned by another organization
- **THEN** the platform SHALL deny the operation without revealing the resource's existence or metadata

#### Scenario: Identifier is guessed through API or MCP
- **WHEN** a valid API or MCP credential references a resource outside its organization or project scopes
- **THEN** the platform SHALL return a stable authorization failure and record a redacted security event

### Requirement: Role and membership lifecycle
The platform SHALL support owner, administrator, SEO manager, content manager, editor, writer, analyst, and viewer responsibilities through explicit permissions, project scopes, invitations, suspension, and revocation.

#### Scenario: Owner invites a member
- **WHEN** an authorized owner sends a valid invitation within the seat entitlement
- **THEN** the platform SHALL create an expiring single-use invitation with selected organization and project permissions and an auditable inviter

#### Scenario: Membership is suspended
- **WHEN** an authorized owner or administrator suspends a membership
- **THEN** new sessions and protected actions for that membership SHALL be denied and active organization-scoped sessions SHALL be revoked

### Requirement: Commercial authentication lifecycle
Registration and password recovery SHALL require email verification, and sessions SHALL support secure rotation, expiry, logout, revocation, rate limits, and security audit correlation.

#### Scenario: User registers with an email code
- **WHEN** a user submits a valid unexpired single-use verification code and compliant credentials
- **THEN** the platform SHALL create one verified account and initial organization atomically and SHALL NOT store or return the plaintext password or code

#### Scenario: Authentication is rate-limited
- **WHEN** an actor exceeds configured login, verification, resend, registration, or recovery limits
- **THEN** the platform SHALL reject the attempt with a stable retry state without disclosing account existence

### Requirement: Bilingual identity states
All customer-visible authentication, invitation, membership, session, and account lifecycle states SHALL have complete Simplified Chinese and English messages.

#### Scenario: Session expires in either locale
- **WHEN** a protected customer request finds an expired or revoked session
- **THEN** the platform SHALL show the localized sign-in recovery path and preserve only a safe same-origin return destination
