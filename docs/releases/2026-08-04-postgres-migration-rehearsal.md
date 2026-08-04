# PostgreSQL foundation migration rehearsal

Date: 2026-08-04 CST
Scope: OpenSpec `commercial-platform-foundation` tasks 2.2–2.6
No secrets, personal data, password hashes, or unrestricted customer content are included in this record.

## Evidence

- PostgreSQL migrations `0001`, `0002`, and `0003` applied with no pending migration and stable checksums.
- SQLite backup integrity: `ok`.
- Import dry-run: zero ownership issues.
- Preserved production snapshot counts: 3 accounts, 4 sessions, 1 project, and 14 audit events.
- Import resume test: one completed import run, four completed steps, one immutable mode-`0600` report, and zero project ownership mismatches.
- Shadow parity: 10 required categories, 19 table metrics, and zero count/hash mismatches.
- Runtime privileges: application and worker roles have schema usage and table access but no schema-create privilege.
- Logical PostgreSQL restore rehearsal: completed in approximately one second with 3 migrations, 3 accounts, 1 project, 1 import report, and 1 shadow snapshot.
- Restored migration fingerprint: `2d13703cc6100376b47ba9288a0dc2cf`.
- Isolated prior-application rehearsal: `/login` returned HTTP 200 on port 8790; the isolated listener was closed afterward.
- Live `postgresql`, `oneshowseo.service`, and `oneshowtools.service` remained active throughout.

## Retained rollback material

- Consistent pre-import SQLite backup: `/var/www/oneshowseo-backups/pre-postgres-import-20260804.sqlite`
- PostgreSQL custom-format backup: `/var/www/oneshowseo-backups/postgres-foundation-20260804.dump`
- Immutable import report directory: `/var/www/oneshowseo-backups/postgres-import-reports`
- Prior application release used for the isolated rehearsal: `/var/www/oneshowseo-backups/pre-6ed67c7-20260804-184837`

These paths are server-side operational references, not public download locations.

## Remaining paid-launch gate

The current server-local PostgreSQL phase cannot represent managed point-in-time recovery or multi-zone failover. Before accepting paid workloads, the managed PostgreSQL target must pass private-network connectivity, automated backup, PITR, restore-time, monitoring, credential rotation, cutover, and rollback rehearsals. Until then, commercial/agent cutover flags remain disabled and the customer application continues using SQLite.
