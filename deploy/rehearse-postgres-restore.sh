#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi
if [[ "$#" -ne 2 ]]; then
  echo "Usage: rehearse-postgres-restore.sh <new-backup-file> <restore-database>" >&2
  exit 1
fi
: "${DATABASE_MIGRATION_URL:?DATABASE_MIGRATION_URL is required}"

BACKUP_FILE="$1"
RESTORE_DATABASE="$2"
if [[ "${RESTORE_DATABASE}" != oneshowseo_restore_rehearsal_* ]]; then
  echo "Restore database must use the oneshowseo_restore_rehearsal_ prefix." >&2
  exit 1
fi
if [[ -e "${BACKUP_FILE}" ]]; then
  echo "Backup destination already exists: ${BACKUP_FILE}" >&2
  exit 1
fi
if sudo -u postgres psql -Atqc "SELECT 1 FROM pg_database WHERE datname='${RESTORE_DATABASE}'" | grep -q 1; then
  echo "Restore database already exists: ${RESTORE_DATABASE}" >&2
  exit 1
fi

cleanup() {
  sudo -u postgres dropdb --if-exists "${RESTORE_DATABASE}" >/dev/null
}
trap cleanup EXIT

STARTED_AT="$(date +%s)"
pg_dump --format=custom --file="${BACKUP_FILE}" "${DATABASE_MIGRATION_URL}"
chown root:postgres "${BACKUP_FILE}"
chmod 0640 "${BACKUP_FILE}"
sudo -u postgres createdb --owner=oneshowseo_migrator "${RESTORE_DATABASE}"
sudo -u postgres pg_restore --exit-on-error --no-owner --role=oneshowseo_migrator --dbname="${RESTORE_DATABASE}" "${BACKUP_FILE}"

MIGRATIONS="$(sudo -u postgres psql -d "${RESTORE_DATABASE}" -Atqc 'SELECT count(*) FROM public.platform_schema_migrations')"
ACCOUNTS="$(sudo -u postgres psql -d "${RESTORE_DATABASE}" -Atqc 'SELECT count(*) FROM identity.accounts')"
PROJECTS="$(sudo -u postgres psql -d "${RESTORE_DATABASE}" -Atqc 'SELECT count(*) FROM project_governance.projects')"
IMPORT_REPORTS="$(sudo -u postgres psql -d "${RESTORE_DATABASE}" -Atqc 'SELECT count(*) FROM public.platform_import_reports')"
SHADOW_SNAPSHOTS="$(sudo -u postgres psql -d "${RESTORE_DATABASE}" -Atqc 'SELECT count(*) FROM public.platform_shadow_snapshots')"
MIGRATION_FINGERPRINT="$(sudo -u postgres psql -d "${RESTORE_DATABASE}" -Atqc "SELECT md5(string_agg(id || ':' || checksum, ',' ORDER BY id)) FROM public.platform_schema_migrations")"

test "${MIGRATIONS}" -ge 3
test "${ACCOUNTS}" -ge 1
test "${PROJECTS}" -ge 1
test "${IMPORT_REPORTS}" -ge 1
test "${SHADOW_SNAPSHOTS}" -ge 1

FINISHED_AT="$(date +%s)"
printf '{"backup":"%s","restoreDatabase":"%s","durationSeconds":%s,"migrations":%s,"accounts":%s,"projects":%s,"importReports":%s,"shadowSnapshots":%s,"migrationFingerprint":"%s"}\n' \
  "${BACKUP_FILE}" "${RESTORE_DATABASE}" "$((FINISHED_AT - STARTED_AT))" "${MIGRATIONS}" "${ACCOUNTS}" "${PROJECTS}" "${IMPORT_REPORTS}" "${SHADOW_SNAPSHOTS}" "${MIGRATION_FINGERPRINT}"
