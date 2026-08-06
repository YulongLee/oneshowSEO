# Research Agent

## Why

OneShowSEO needs a read-only first production agent that turns approved public and connected search data into traceable research evidence without duplicating platform tenancy, billing, execution, integration, approval, or observability infrastructure.

## What changes

- Add a versioned `research.agent` manifest and research capability implemented through Agent SDK v1.
- Acquire only allow-listed public/project sources and authorized GSC references.
- Produce freshness-labelled evidence, normalized topic/entity findings, artifacts, and metered usage.
- Require the shared certification and progressive-rollout gates before production enablement.

## Out of scope

Publishing, editing customer sites, maintaining balances, owning credentials, or implementing a separate job queue.
