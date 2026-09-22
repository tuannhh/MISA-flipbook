#!/usr/bin/env bash
# Destructive restore for a maintenance or isolated drill stack. This script demands
# an explicit confirmation flag and never runs as part of normal application startup.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
POSTGRES_USER="${POSTGRES_USER:-misa_admin}"
POSTGRES_DB="${POSTGRES_DB:-misa_flipbook}"
STORAGE_VOLUME="${STORAGE_VOLUME:-misa-flipbook_storage_data}"
WRITERS=(api dispatcher worker-convert pdf-worker)
INPUT=""
CONFIRMED=false

usage() {
  echo "Usage: $0 --input BACKUP_DIRECTORY --confirm-restore"
  echo "Restores db.dump and storage.tar.gz after erasing the selected stack's current database objects and storage volume."
}

while (($#)); do
  case "$1" in
    --input) INPUT="${2:?--input needs a backup directory}"; shift ;;
    --confirm-restore) CONFIRMED=true ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done

[[ "$CONFIRMED" == true && -n "$INPUT" ]] || { usage >&2; exit 2; }
[[ -f "$INPUT/db.dump" && -f "$INPUT/storage.tar.gz" && -f "$INPUT/SHA256SUMS" ]] || {
  echo "Backup directory must contain db.dump, storage.tar.gz and SHA256SUMS." >&2; exit 1;
}
command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }

if command -v sha256sum >/dev/null; then
  (cd "$INPUT" && sha256sum -c SHA256SUMS)
else
  (cd "$INPUT" && shasum -a 256 -c SHA256SUMS)
fi

cd "$COMPOSE_DIR"
declare -a RUNNING_WRITERS=()
for service in "${WRITERS[@]}"; do
  if [[ -n "$(docker compose ps -q "$service")" ]] && [[ "$(docker compose ps --status running -q "$service")" != "" ]]; then
    RUNNING_WRITERS+=("$service")
  fi
done
restore_writers() {
  if ((${#RUNNING_WRITERS[@]})); then docker compose start "${RUNNING_WRITERS[@]}" >/dev/null || true; fi
}
trap restore_writers EXIT

if ((${#RUNNING_WRITERS[@]})); then
  echo "==> Stopping writers: ${RUNNING_WRITERS[*]}"
  docker compose stop "${RUNNING_WRITERS[@]}"
fi

POSTGRES_CID="$(docker compose ps -q postgres)"
[[ -n "$POSTGRES_CID" ]] || { echo "Postgres container is not available." >&2; exit 1; }

echo "==> Restoring PostgreSQL dump"
docker cp "$INPUT/db.dump" "$POSTGRES_CID:/tmp/misa-flipbook-restore.dump"
docker compose exec -T postgres pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges /tmp/misa-flipbook-restore.dump
docker compose exec -T postgres rm -f /tmp/misa-flipbook-restore.dump

echo "==> Replacing storage volume contents"
RESTORE_CID="$(docker create -v "$STORAGE_VOLUME:/data" alpine sh -c 'find /data -mindepth 1 -maxdepth 1 -exec rm -rf -- {} + && mkdir -p /tmp/restore && tar xzf /tmp/storage.tar.gz -C /data')"
cleanup_restore() { docker rm -f "$RESTORE_CID" >/dev/null 2>&1 || true; }
trap 'cleanup_restore; restore_writers' EXIT
docker cp "$INPUT/storage.tar.gz" "$RESTORE_CID:/tmp/storage.tar.gz"
docker start -a "$RESTORE_CID" >/dev/null
cleanup_restore
trap restore_writers EXIT

echo "==> Restore complete. Writers will be restarted if they were running before this command."
