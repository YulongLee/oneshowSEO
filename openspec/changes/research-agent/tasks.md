## 1. Research Agent implementation

- [x] 1.1 Define bilingual manifest, schemas, entitlements, risks, provider dependencies, and compatibility
- [x] 1.2 Implement allow-listed source acquisition with freshness, provenance, digest, robots, and rate policy
- [x] 1.3 Produce normalized evidence and research artifacts through SDK v1 envelopes
- [x] 1.4 Add idempotent usage, cancellation, retry, dependency-degraded, and localized failure behavior
- [x] 1.5 Pass all eleven Agent certification gates with synthetic and provider-sandbox fixtures
- [ ] 1.6 Roll out off → internal → canary → eligible plan with recorded SLO observation and one-step disable

Implementation evidence: `platform/modules/agents/research-agent.ts`, `lib/research-execution.ts`, `lib/production-worker.ts`, `tests/research-agent.test.ts`, `tests/research-execution.test.ts`, and `tests/research-production-worker.test.ts`. Item 1.6 remains open until the production rollout and online acceptance below are recorded.
