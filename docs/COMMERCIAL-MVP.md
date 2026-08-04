# OneShowSEO Commercial MVP

## Product promise

OneShowSEO turns a website into a daily, reviewable SEO operating loop. Every number shown to users must come from a stored observation, provider response, or completed execution record.

## Core lifecycle

1. Create project: domain, market, language, goal, competitors and approval mode.
2. Platform data readiness: administrators configure provider credentials centrally; customer workspaces never receive provider secrets.
3. Run baseline: crawl pages and record technical/on-page findings.
4. Prioritize: convert findings and opportunities into scored tasks.
5. Approve: require review for content, metadata, internal-link, schema and publish changes.
6. Execute: produce a change set or publishing handoff with an immutable run record.
7. Verify: check the target after execution and record whether the expected state exists.
8. Learn: compare outcomes and adjust task priority without inventing performance data.

## Commercial modules

### Account and tenant

- Verified email authentication, password reset, sessions, roles and status.
- Organization/project ownership and strict project-scoped queries.
- Trial and paid plan entitlements with server-side usage enforcement.

### Projects

- Website, market, language, timezone, business goal and approval mode.
- Customer-facing evidence coverage without provider credential controls or secret metadata.

### Website audit

- Immutable audit run with status, timing, page count and score.
- Findings with severity, category, evidence, affected URL and recommended action.

### Opportunity and task center

- Findings, provider signals and content opportunities become prioritized tasks.
- Status lifecycle: proposed, approved, running, completed, failed and dismissed.

### Content and change sets

- Briefs, drafts and page mappings are separate from published content.
- Every proposed change records before/after values and approval history.

### Automation

- Daily schedule per project, next-run time, last-run result and failure reason.
- High-risk changes always require approval.

### Billing and usage

- Plan, trial dates, monthly limits and usage ledger.
- Payment checkout remains disabled until a real merchant provider is configured.

### Administration

- Real users, projects, runs, failures, usage and audit events only.
- No simulated platform KPIs or tenant rows in production screens.
- Provider credentials are encrypted at rest with `DATA_SOURCE_ENCRYPTION_KEY`, write-only in the browser, and managed only by administrators.

## Provider readiness

- Public crawl: available without credentials.
- OpenSEO MCP: available to the Codex operator, not yet exposed as a server runtime provider.
- PageSpeed, GSC, GA4, Baidu, DataForSEO, backlinks and CMS provider credentials are configured in the administrator console.
- Set `DATA_SOURCE_ENCRYPTION_KEY` to a random secret of at least 24 characters before saving any provider credential.
- Configured values are never returned by the administrator API; blank fields retain the existing encrypted value.
- Customer workspaces see coverage and capability status only, not provider configuration details.
- Payments: blocked until Alipay/WeChat/Stripe merchant credentials and webhook verification are configured.
