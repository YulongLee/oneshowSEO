# Agent onboarding order and prerequisites

Research Agent is first because it establishes source acquisition, provenance, freshness, and evidence quality without writing to customer properties. SEO Audit Agent follows and consumes those evidence contracts while remaining read-only. Both must pass v1 certification before later agents enter canary rollout.

| Order | Agent | Required data sources | Additional release prerequisite |
| --- | --- | --- | --- |
| 1 | Research | Public HTTPS, project domain, optional GSC | Source provenance, freshness, robots/rate policy |
| 2 | SEO Audit | Crawl artifacts, Research evidence, optional GSC/GA4 | Deterministic findings, severity rules, no direct writes |
| 3 | Keyword | Research evidence, GSC, rank provider | Locale/market mapping and keyword quotas |
| 4 | Content | Keyword plan, Knowledge Base, brand settings | Evidence citations, content policy, approval required |
| 5 | Publish | Approved content, CMS connection | Scoped write credential, preview, mandatory approval, verification and rollback |
| 6 | GEO | Research/Audit/Content evidence, public answer surfaces | Citation and attribution policy, provider availability |
| 7 | Analytics | GSC, GA4, task/usage history | Consent, metric freshness, attribution definition |

An unavailable optional source produces an explicit degraded/no-data state. A missing required source blocks execution without reserving final usage. Later agents reuse platform identity, entitlements, credits, execution, artifacts, approvals, integrations, API/MCP, audit, observability, and rollout services; they must not create parallel commercial infrastructure.
