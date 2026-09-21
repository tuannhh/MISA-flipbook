#!/usr/bin/env bash
# Consistent Docker backup: PostgreSQL dump and storage are captured only while all
# writers are quiesced. It is intentionally explicit because a DB dump paired with a
# concurrently changing object volume cannot be restored as one coherent flipbook.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"
POSTGRES_USER="${POSTGRES_USER:-misa_admin}"
POSTGRES_DB="${POSTGRES_DB:-misa_flipbook}"
STORAGE_VOLUME="${STORAGE_VOLUME:-misa-flipbook_storage_data}"
WRITERS=(api dispatcher worker-convert pdf-worker)
QUIESCE=false

usage() {
  echo "Usage: $0 --quiesce [--output DIRECTORY]"
  echo "  --quiesce   stop API and PDF/job writers while the DB and storage pair is captured"
  echo "  --output    parent directory for timestamped backup folders (default: $BACKUP_DIR)"
}

while (($#)); do
  case "$1" in
    --quiesce) QUIESCE=true ;;
    --output) BACKUP_DIR="${2:?--output needs a directory}"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
  shift
done

if [[ "$QUIESCE" != true ]]; then
  echo "Refusing an inconsistent backup. Re-run with --quiesce." >&2
  exit 2
fi
command -v docker >/dev/null || { echo "Docker is required." >&2; exit 1; }

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$BACKUP_DIR/$TIMESTAMP"
mkdir -p "$OUT_DIR"
cd "$COMPOSE_DIR"

declare -a RUNNING_WRITERS=()
for service in "${WRITERS[@]}"; do
  if [[ -n "$(docker compose ps -q "$service")" ]] && [[ "$(docker compose ps --status running -q "$service")" != "" ]]; then
    RUNNING_WRITERS+=("$service")
  fi
done

restore_writers() {
  if ((${#RUNNING_WRITERS[@]})); then
    docker compose start "${RUNNING_WRITERS[@]}" >/dev/null || true
  fi
}
trap restore_writers EXIT

if ((${#RUNNING_WRITERS[@]})); then
  echo "==> Quiescing writers: ${RUNNING_WRITERS[*]}"
  docker compose stop "${RUNNING_WRITERS[@]}"
fi

POSTGRES_CID="$(docker compose ps -q postgres)"
[[ -n "$POSTGRES_CID" ]] || { echo "Postgres container is not available." >&2; exit 1; }

echo "==> Writing PostgreSQL custom dump"
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc -d "$POSTGRES_DB" -f /tmp/misa-flipbook-backup.dump
docker cp "$POSTGRES_CID:/tmp/misa-flipbook-backup.dump" "$OUT_DIR/db.dump"
docker compose exec -T postgres rm -f /tmp/misa-flipbook-backup.dump

echo "==> Archiving storage volume"
ARCHIVE_CID="$(docker create -v "$STORAGE_VOLUME:/data:ro" alpine sh -c 'tar czf /tmp/storage.tar.gz -C /data .')"
cleanup_archive() { docker rm -f "$ARCHIVE_CID" >/dev/null 2>&1 || true; }
trap 'cleanup_archive; restore_writers' EXIT
docker start -a "$ARCHIVE_CID" >/dev/null
docker cp "$ARCHIVE_CID:/tmp/storage.tar.gz" "$OUT_DIR/storage.tar.gz"
cleanup_archive
trap restore_writers EXIT

if command -v sha256sum >/dev/null; then
  sha256sum "$OUT_DIR/db.dump" "$OUT_DIR/storage.tar.gz" > "$OUT_DIR/SHA256SUMS"
else
  shasum -a 256 "$OUT_DIR/db.dump" "$OUT_DIR/storage.tar.gz" > "$OUT_DIR/SHA256SUMS"
fi
cat > "$OUT_DIR/manifest.txt" <<EOF
format=misa-flipbook-docker-backup-v2
created_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)
postgres_db=$POSTGRES_DB
storage_volume=$STORAGE_VOLUME
quiesced_services=${RUNNING_WRITERS[*]:-none}
EOF

echo "==> Backup complete: $OUT_DIR"
echo "==> Verify SHA256SUMS and use restore.sh only against a maintenance/test stack."
