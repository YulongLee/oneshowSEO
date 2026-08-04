#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi
if [[ "$#" -ne 3 ]]; then
  echo "Usage: rehearse-app-rollback.sh <release-directory> <sqlite-backup> <isolated-port>" >&2
  exit 1
fi

RELEASE_DIRECTORY="$1"
SQLITE_BACKUP="$2"
ISOLATED_PORT="$3"
case "${RELEASE_DIRECTORY}" in
  /var/www/oneshowseo-backups/pre-*) ;;
  *) echo "Release must be an explicit pre-release backup directory." >&2; exit 1 ;;
esac
if [[ ! -d "${RELEASE_DIRECTORY}" || ! -f "${SQLITE_BACKUP}" ]]; then
  echo "Release directory or SQLite backup is missing." >&2
  exit 1
fi
if [[ ! "${ISOLATED_PORT}" =~ ^[0-9]+$ ]] || (( ISOLATED_PORT < 1024 || ISOLATED_PORT > 65535 )); then
  echo "Invalid isolated port." >&2
  exit 1
fi
if ss -lnt | grep -q ":${ISOLATED_PORT} "; then
  echo "Isolated port is already in use." >&2
  exit 1
fi

REHEARSAL_DIRECTORY="$(mktemp -d /var/www/oneshowseo/data/rollback-rehearsal.XXXXXX)"
PROCESS_ID=""
cleanup() {
  fuser -k "${ISOLATED_PORT}/tcp" >/dev/null 2>&1 || true
  if [[ -n "${PROCESS_ID}" ]] && kill -0 "${PROCESS_ID}" 2>/dev/null; then
    kill "${PROCESS_ID}" 2>/dev/null || true
    wait "${PROCESS_ID}" 2>/dev/null || true
  fi
  rm -rf "${REHEARSAL_DIRECTORY}"
}
trap cleanup EXIT

install -m 0600 -o oneshowseo -g oneshowseo "${SQLITE_BACKUP}" "${REHEARSAL_DIRECTORY}/oneshowseo.sqlite"
touch "${REHEARSAL_DIRECTORY}/rollback.log"
chown oneshowseo:oneshowseo "${REHEARSAL_DIRECTORY}/rollback.log"

runuser -u oneshowseo -- env \
  PATH=/opt/node-v22/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin \
  NODE_ENV=production \
  PORT="${ISOLATED_PORT}" \
  APP_URL="http://127.0.0.1:${ISOLATED_PORT}" \
  DATABASE_PATH="${REHEARSAL_DIRECTORY}/oneshowseo.sqlite" \
  NODE_NO_WARNINGS=1 \
  /opt/node-v22/bin/npm --prefix "${RELEASE_DIRECTORY}" start >"${REHEARSAL_DIRECTORY}/rollback.log" 2>&1 &
PROCESS_ID="$!"

for _ in $(seq 1 25); do
  if curl --fail --silent --show-error --max-time 2 "http://127.0.0.1:${ISOLATED_PORT}/login" >/dev/null 2>&1; then
    printf '{"release":"%s","port":%s,"loginStatus":200,"liveServiceStatus":"%s"}\n' \
      "${RELEASE_DIRECTORY}" "${ISOLATED_PORT}" "$(systemctl is-active oneshowseo.service)"
    exit 0
  fi
  if ! kill -0 "${PROCESS_ID}" 2>/dev/null; then
    tail -n 40 "${REHEARSAL_DIRECTORY}/rollback.log" >&2
    exit 1
  fi
  sleep 1
done

tail -n 40 "${REHEARSAL_DIRECTORY}/rollback.log" >&2
exit 1
