# Research Agent requirements

## Requirement: Evidence-first research

The Research Agent SHALL consume platform-scoped execution and integration references and SHALL emit source-attributed, freshness-labelled, digest-protected evidence and artifacts.

#### Scenario: Required source unavailable

- **WHEN** a required source is unavailable, expired, denied, or outside the outbound allow-list
- **THEN** the agent emits a localized dependency error with no fabricated evidence and no final usage beyond actual metered work

## Requirement: Platform ownership

The agent SHALL use the existing identity, entitlements, credits, task runtime, artifacts, approvals, integrations, notifications, API/MCP, audit, observability, and rollout services and SHALL NOT create duplicate commercial persistence.
