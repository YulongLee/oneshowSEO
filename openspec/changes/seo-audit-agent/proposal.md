# SEO Audit Agent

## Why

After Research Agent establishes reliable evidence, OneShowSEO needs a deterministic read-only SEO Audit Agent that evaluates project pages and connected search signals without claiming that it changes customer properties.

## What changes

- Add a versioned `seo.audit` manifest and audit capability implemented through Agent SDK v1.
- Consume authorized crawl artifacts, Research Agent evidence, and optional GSC/GA4 references.
- Produce severity-ranked findings, evidence links, remediation recommendations, reports, and metered usage.
- Route every proposed external change through the shared Approval Center and execution runtime.

## Out of scope

Automatic publication, credential custody, direct ledger mutation, separate scheduling, or duplicated commercial infrastructure.
