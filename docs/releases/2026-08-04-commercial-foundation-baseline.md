# Commercial foundation production baseline

Captured: 2026-08-04 20:14 CST / 2026-08-04 12:14 UTC
Purpose: OpenSpec `commercial-platform-foundation` task 1.2
This record intentionally contains no credential values, hashes, tokens, personal email addresses, database rows, or unrestricted customer content.

## Application and infrastructure

| Item | Baseline |
| --- | --- |
| Production domain | `https://oneshowseo.com` |
| Deployed commit | `6ed67c7f50b25692558abebb51c9ac07035a45c9` |
| Application service | `oneshowseo.service`: active and enabled |
| Reverse proxy | Nginx configuration test successful |
| Runtime | Node.js `v22.23.2` |
| Database | SQLite `/var/www/oneshowseo/data/oneshowseo.sqlite` |
| Database integrity | `PRAGMA integrity_check = ok` |
| Application filesystem | `/var/www/oneshowseo` |
| Disk at capture | 49 GiB total, 32 GiB used, 15 GiB available (69%) |
| Release backups | 3 release directories |
| Latest known rollback | `pre-6ed67c7-20260804-184837` |

## Production record invariants

These are counts only, captured read-only from the production SQLite database.

| Table | Count |
| --- | ---: |
| users | 2 |
| sessions | 2 |
| projects | 1 |
| project_members | 0 |
| project_invites | 0 |
| audit_runs | 0 |
| findings | 0 |
| seo_tasks | 0 |
| research_runs | 0 |
| research_opportunities | 0 |
| usage_events | 0 |
| billing_invoices | 0 |
| billing_payment_methods | 0 |
| billing_events | 0 |
| api_access_keys | 1 |
| api_request_events | 1 |
| api_webhooks | 0 |
| approval_decisions | 0 |
| audit_logs | 11 |

Migration acceptance MUST preserve IDs and ownership, SHALL NOT create new billable usage, SHALL NOT re-run audit/research/tasks, and SHALL preserve API-key validity until an explicit compatible rotation decision.

## Configuration inventory

The production service currently declares the following configuration names. Values were not read into this document:

- Application/runtime: `NODE_ENV`, `PORT`, `APP_URL`, `DATABASE_PATH`, `NODE_NO_WARNINGS`
- Administrative access: `ADMIN_EMAILS`
- Email delivery: `EMAIL_PROVIDER`, `EMAIL_FROM`, `EMAIL_SMTP_HOST`, `EMAIL_SMTP_PORT`, `EMAIL_SMTP_SECURE`, `EMAIL_SMTP_USER`, `EMAIL_SMTP_PASSWORD`
- Platform data-source encryption: `DATA_SOURCE_ENCRYPTION_KEY`

Not present in this baseline configuration: PostgreSQL, Redis, object-storage runtime, payment-provider, distributed tracing, managed error reporting, MCP server, or durable-worker settings. Their product surfaces must remain honestly unavailable until separately provisioned and gated.

### Post-baseline infrastructure update

On 2026-08-04, PostgreSQL 16 was provisioned on the existing server for foundation development and migration rehearsal. It listens on localhost only and has separate least-privilege application, migration, and worker roles. The customer application remains on SQLite until the versioned schema, importer, parity checks, backup/restore rehearsal, and cutover gates pass. Managed PostgreSQL remains mandatory before paid commercial launch.

## Data-source and secret posture

- Platform data-source configuration exists and uses a dedicated encryption key.
- Customer-scoped integration credentials and OAuth lifecycle are not implemented.
- Payment-provider configuration is not present; live checkout and paid entitlement mutation remain disabled.
- Previously shared OSS/provider credentials are considered exposed and MUST be rotated before any commercial object-storage integration is enabled.
- Secret values MUST remain outside Git, browser responses, logs, audits, exports, screenshots, support views, and this baseline.

## Rollback procedure baseline

1. Disable newly introduced commercial/agent/integration flags.
2. Stop accepting or starting new external-effect jobs; drain or quarantine active work.
3. Stop `oneshowseo.service`.
4. Move the current application release aside without deleting its data.
5. Restore the verified prior release directory into `/var/www/oneshowseo`.
6. Preserve or restore the matching database snapshot according to migration compatibility; never blindly reverse settled ledger or external effects.
7. Start the service, verify local health on port 8788, then verify Nginx and public login/workspace/admin redirects.
8. Record the incident, restored commit, database decision, verification evidence, and any required compensating commercial actions.

## Baseline gaps that block commercial foundation completion

- User-owned rather than organization-owned commercial data model.
- No production PostgreSQL or repeatable SQLite migration/import process.
- No append-only credit ledger or payment-provider webhook state machine.
- No durable leased worker/job runtime.
- No customer integration vault.
- No real Agent Center registry/runtime.
- Many prototype modules expose unbacked metrics and actions.
- No scoped API/MCP credential model or MCP server.
- No centralized observability, tested point-in-time recovery, or formal commercial rollout evidence.
