## 1. Research Agent implementation

- [x] 1.1 Define bilingual manifest, schemas, entitlements, risks, provider dependencies, and compatibility
- [x] 1.2 Implement allow-listed source acquisition with freshness, provenance, digest, robots, and rate policy
- [x] 1.3 Produce normalized evidence and research artifacts through SDK v1 envelopes
- [x] 1.4 Add idempotent usage, cancellation, retry, dependency-degraded, and localized failure behavior
- [x] 1.5 Pass all eleven Agent certification gates with synthetic and provider-sandbox fixtures
- [x] 1.6 Roll out off → internal → canary → eligible plan with recorded SLO observation and one-step disable

Implementation evidence: `platform/modules/agents/research-agent.ts`, `lib/research-execution.ts`, `lib/production-worker.ts`, `tests/research-agent.test.ts`, `tests/research-execution.test.ts`, `tests/research-production-worker.test.ts`, `deploy/verify-research-flow.ts`, and `deploy/record-research-rollout.ts`. Production acceptance task `b2e11ee9-c742-47a5-a32a-c27277def286` completed with one evidence-backed opportunity, a clean report artifact, and a committed 5-Credit settlement.
