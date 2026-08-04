# PostgreSQL operating policy

## Current phase

OneShowSEO uses PostgreSQL 16 on the existing application server as a pre-commercial foundation environment. PostgreSQL listens on `127.0.0.1:5432` only. It is not reachable from the public network and must not be added to the cloud security-group allowlist.

The live application continues to use SQLite until the PostgreSQL schema, importer, parity, backup/restore, and rollback gates are complete. Merely provisioning PostgreSQL does not enable a customer-facing feature.

## Roles and connections

| Role | Purpose | Privilege boundary |
| --- | --- | --- |
| `oneshowseo_migrator` | Versioned schema migrations | Owns the database and creates schema objects; no superuser, role-management, replication, or database-creation privilege |
| `oneshowseo_app` | Web/API requests | Data access granted by migration-owned default privileges; cannot create schema objects |
| `oneshowseo_worker` | Durable background execution | Data access granted by migration-owned default privileges; cannot create schema objects |

Connection URLs are stored only in `/etc/oneshowseo/oneshowseo.env` with mode `0600` and root ownership:

- `DATABASE_URL`
- `DATABASE_MIGRATION_URL`
- `WORKER_DATABASE_URL`

Values must never appear in Git, build output, logs, browser responses, support views, screenshots, or reports. Application code receives only the URL for its own role. Migration and worker credentials are not exposed to the web process unless that process explicitly requires them during a controlled deployment.

## Credential rotation

1. Generate a new cryptographically random password on the server; do not print or copy it into task output.
2. Change exactly one PostgreSQL role password using the local `postgres` operating-system account.
3. Replace the matching URL atomically in the root-owned environment file and preserve mode `0600`.
4. Restart only the consumer for that role and verify a new connection.
5. Verify the web service, worker, database health, and authentication logs; record the rotation event without its secret.
6. If verification fails, restore the prior URL from a root-only temporary backup, restart the consumer, and investigate before retrying.

Rotate credentials after suspected disclosure, administrator changes, environment cloning, and before the paid-launch managed-database cutover. Routine rotation frequency will be set with the production security policy.

## Paid-launch gate

Before accepting paid workloads, migrate to managed PostgreSQL over the cloud private network and demonstrate:

- automated backups and point-in-time recovery;
- encrypted connections and managed credential rotation;
- monitoring, alerts, capacity thresholds, and slow-query visibility;
- a production-sized restore rehearsal and measured recovery time;
- a rehearsed local-to-managed cutover and rollback;
- no public database listener or broad network allowlist.

The deployment helper at `deploy/provision-postgresql.sh` is idempotent after credentials exist and does not switch the application away from SQLite.

## SQLite import procedure

1. Create a consistent SQLite backup with `deploy/backup-sqlite.mjs`; never import a live database file plus an uncheckpointed WAL by copying files directly.
2. Run `db:pg:import:dry-run` against the immutable backup and require zero ownership issues.
3. Apply all pending PostgreSQL migrations with the migration credential.
4. Run `db:pg:import`; each logical step is transactional and a completed step is resumed rather than repeated.
5. Require matching source/target ID hashes, matching row counts for preserved entities, zero project ownership mismatches, and one immutable report.
6. Keep the application on SQLite until shadow-read parity and the separate cutover gates pass.

Import reports contain counts, hashes, and validation results rather than credentials or unrestricted customer content. Production reports are root-only and must be retained with the matching SQLite backup and migration versions.
