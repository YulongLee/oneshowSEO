# SEO Audit Agent requirements

## Requirement: Deterministic evidence-linked audit

The SEO Audit Agent SHALL evaluate only authorized, freshness-labelled crawl and integration inputs and SHALL attach evidence references to every finding and recommendation.

#### Scenario: Crawl is partial

- **WHEN** crawl limits, robots rules, provider failures, or cancellation make coverage incomplete
- **THEN** the report states partial coverage, records affected URLs/counts, and does not extrapolate unavailable metrics as facts

## Requirement: Governed remediation

The agent SHALL emit proposed changes as recommendations. Publication, index directives, deletion, credential changes, and other configured high-risk actions SHALL remain blocked until the existing Approval Center authorizes an idempotent platform execution with verification and rollback records.
