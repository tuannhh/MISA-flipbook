#!/usr/bin/env bash
# Backup DB + object storage cho MISA Flipbook (Docker Compose).
# Tu dong hoa dung quy trinh da kiem chung that trong drill P5 (xem MEMORYBANK.md muc
# "P5 - UAT va phat hanh", handoffs/HF-20260917-01.md muc Runbook) - khong doi lenh, chi
# dong goi lai thanh script chay lap lai duoc (cron/Task Scheduler).
#
# Cach dung:
#   BACKUP_DIR=/duong/dan/luu/backup ./backup.sh
#   (mac dinh BACKUP_DIR=./backups canh script nay neu khong dat bien moi truong)
#
# Yeu cau: dang chay tu may co Docker Compose stack nay dang "up" (postgres + 1 container
# bat ky co mount volume storage, vd container "api").
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$SCRIPT_DIR/../backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_DIR="$BACKUP_DIR/$TIMESTAMP"
POSTGRES_USER="${POSTGRES_USER:-misa_admin}"
POSTGRES_DB="${POSTGRES_DB:-misa_flipbook}"
STORAGE_VOLUME="${STORAGE_VOLUME:-misa-flipbook_storage_data}"

mkdir -p "$OUT_DIR"
cd "$COMPOSE_DIR"
POSTGRES_CID="$(docker compose ps -q postgres)"

echo "==> Backup DB ($POSTGRES_DB) vao $OUT_DIR/db.dump ..."
# MSYS_NO_PATHCONV=1 chi dat cho LENH co path tuyet doi BEN TRONG container (vd /tmp/...)
# - tranh Git Bash/Windows tu doi path sai truoc khi toi Docker. KHONG dat cho lenh
# "docker compose" resolve file tren host (se lam hong chinh duong dan docker-compose.yml).
MSYS_NO_PATHCONV=1 docker compose exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -Fc -d "$POSTGRES_DB" -f /tmp/backup.dump
# KHONG dat MSYS_NO_PATHCONV o day: can Git Bash tu dong doi $OUT_DIR (dang /c/Users/...)
# sang duong dan Windows that cho tham so DICH cua docker cp; tham so NGUON (CID:/tmp/...)
# khong bat dau bang "/" nen khong bi anh huong.
docker cp "$POSTGRES_CID:/tmp/backup.dump" "$OUT_DIR/db.dump"

echo "==> Backup storage volume ($STORAGE_VOLUME) vao $OUT_DIR/storage.tar.gz ..."
# MSYS_NO_PATHCONV=1 bat buoc o day: neu khong, Git Bash tu doi CA phan container-path
# (":/backup", ":/data") trong tung tham so "-v host:container" thanh duong dan Windows sai
# (da gap loi nay 1 lan khi viet script). Vi vay phai tu chuyen $OUT_DIR sang dang Windows
# that (qua cygpath) TRUOC, roi dat MSYS_NO_PATHCONV=1 de container-path duoc giu nguyen.
OUT_DIR_WIN="$(cygpath -w "$OUT_DIR")"
MSYS_NO_PATHCONV=1 docker run --rm -v "$STORAGE_VOLUME:/data:ro" -v "$OUT_DIR_WIN:/backup" \
  alpine tar czf /backup/storage.tar.gz -C /data .

DB_SIZE=$(du -h "$OUT_DIR/db.dump" | cut -f1)
STORAGE_SIZE=$(du -h "$OUT_DIR/storage.tar.gz" | cut -f1)
echo "==> Xong. db.dump=$DB_SIZE storage.tar.gz=$STORAGE_SIZE"
echo "==> Luu y: script nay CHUA tu xoa ban cu (retention) - don thu cong hoac them logic"
echo "    xoa thu muc cu hon N ngay neu dung cho lich chay tu dong dai han."
