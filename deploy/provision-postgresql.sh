#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y postgresql postgresql-contrib

systemctl enable --now postgresql

sudo -u postgres psql --set ON_ERROR_STOP=1 <<'SQL'
ALTER SYSTEM SET listen_addresses = 'localhost';
ALTER SYSTEM SET password_encryption = 'scram-sha-256';
SQL
systemctl restart postgresql

ENV_DIR=/etc/oneshowseo
ENV_FILE="${ENV_DIR}/oneshowseo.env"
install -d -m 0750 -o root -g root "${ENV_DIR}"
touch "${ENV_FILE}"
chown root:root "${ENV_FILE}"
chmod 0600 "${ENV_FILE}"

if grep -q '^DATABASE_URL=' "${ENV_FILE}"; then
  echo "PostgreSQL credentials already exist; leaving roles and environment unchanged."
else
  APP_PASSWORD="$(openssl rand -hex 32)"
  MIGRATOR_PASSWORD="$(openssl rand -hex 32)"
  WORKER_PASSWORD="$(openssl rand -hex 32)"

  sudo -u postgres psql --set ON_ERROR_STOP=1 \
    --set app_password="${APP_PASSWORD}" \
    --set migrator_password="${MIGRATOR_PASSWORD}" \
    --set worker_password="${WORKER_PASSWORD}" <<'SQL'
CREATE ROLE oneshowseo_migrator LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'migrator_password';
CREATE ROLE oneshowseo_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'app_password';
CREATE ROLE oneshowseo_worker LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION PASSWORD :'worker_password';
CREATE DATABASE oneshowseo OWNER oneshowseo_migrator;
SQL

  sudo -u postgres psql --set ON_ERROR_STOP=1 --dbname oneshowseo <<'SQL'
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO oneshowseo_migrator;
GRANT USAGE ON SCHEMA public TO oneshowseo_app, oneshowseo_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE oneshowseo_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO oneshowseo_app, oneshowseo_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE oneshowseo_migrator IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO oneshowseo_app, oneshowseo_worker;
SQL

  ENV_TMP="$(mktemp)"
  grep -vE '^(DATABASE_URL|DATABASE_MIGRATION_URL|WORKER_DATABASE_URL)=' "${ENV_FILE}" > "${ENV_TMP}" || true
  {
    printf '\nDATABASE_URL=postgresql://oneshowseo_app:%s@127.0.0.1:5432/oneshowseo?sslmode=disable\n' "${APP_PASSWORD}"
    printf 'DATABASE_MIGRATION_URL=postgresql://oneshowseo_migrator:%s@127.0.0.1:5432/oneshowseo?sslmode=disable\n' "${MIGRATOR_PASSWORD}"
    printf 'WORKER_DATABASE_URL=postgresql://oneshowseo_worker:%s@127.0.0.1:5432/oneshowseo?sslmode=disable\n' "${WORKER_PASSWORD}"
  } >> "${ENV_TMP}"
  install -m 0600 -o root -g root "${ENV_TMP}" "${ENV_FILE}"
  rm -f "${ENV_TMP}"
fi

sudo -u postgres psql --set ON_ERROR_STOP=1 --dbname oneshowseo -c 'SELECT current_database();' >/dev/null

if ss -lnt | grep -Eq '0\.0\.0\.0:5432|\[::\]:5432'; then
  echo "PostgreSQL is unexpectedly exposed on a public listener." >&2
  exit 1
fi

systemctl is-active --quiet postgresql
systemctl is-active --quiet oneshowseo.service
systemctl is-active --quiet oneshowtools.service

echo "PostgreSQL provisioned for localhost-only access; existing application services remain active."
