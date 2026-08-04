## ADDED Requirements

### Requirement: Server-authoritative entitlements
The platform SHALL resolve effective entitlements from the plan catalog, subscription, trial, overrides, and organization state before every protected commercial action.

#### Scenario: Feature is not included
- **WHEN** an organization requests an agent, integration, API, storage, seat, project, or retention capability not included in its effective entitlements
- **THEN** the platform SHALL deny the action without partial side effects and return a localized upgrade state

#### Scenario: Entitlement changes during queued work
- **WHEN** an entitlement is removed before queued work begins
- **THEN** the worker SHALL re-authorize before execution and release any unused reservation exactly once

### Requirement: Append-only credit and usage accounting
Billable actions MUST use correlated usage events and append-only ledger entries for reservation, commit, release, grant, expiry, refund, and adjustment.

#### Scenario: Billable task succeeds after retry
- **WHEN** the same idempotent task completes after one or more worker attempts
- **THEN** the platform SHALL commit the authorized charge exactly once and link usage, task, organization, project, price version, and ledger entries

#### Scenario: Billable task fails before producing value
- **WHEN** a reserved task reaches a non-chargeable terminal failure
- **THEN** the platform SHALL release the reservation exactly once and show the resulting balance from the ledger

### Requirement: Subscription and trial lifecycle
The platform SHALL support trial, active, past-due, cancelled, expired, and suspended commercial states with defined access, grace, downgrade, and retention behavior.

#### Scenario: Trial expires
- **WHEN** an organization's trial reaches its expiry without an active paid subscription
- **THEN** the platform SHALL apply the configured restricted state without deleting customer data and SHALL show localized renewal options

### Requirement: Payment-provider safety
Live billing SHALL process verified, deduplicated provider events and SHALL store only provider references and normalized invoice/subscription metadata, never raw payment-card data.

#### Scenario: Duplicate payment webhook arrives
- **WHEN** the same valid provider event is delivered more than once
- **THEN** the platform SHALL apply the subscription or invoice transition at most once and retain delivery evidence

#### Scenario: Live payment is disabled
- **WHEN** a customer activates checkout while commercial payment capability is release-disabled
- **THEN** the platform SHALL show an explicit server-controlled unavailable state and SHALL NOT simulate payment success or create a paid entitlement

### Requirement: Transparent billing experience
Billing, Upgrade Plan, invoices, usage, limits, credits, renewal, and pricing SHALL use server-authoritative current data, currency, tax, billing period, and plan-version metadata in Chinese and English.

#### Scenario: Usage data is delayed
- **WHEN** some metering events have not settled
- **THEN** the interface SHALL label the balance or usage as pending/stale with its captured time rather than presenting it as final
