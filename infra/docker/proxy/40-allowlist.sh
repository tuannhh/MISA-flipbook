#!/bin/sh
# Sinh /etc/nginx/allowlist.inc tu MISA_ALLOWED_CIDRS (danh sach CIDR/IP phan tach bang dau phay).
# FAIL-CLOSED: thieu hoac sai dinh dang -> nginx KHONG khoi dong (khong bao gio mo cho tat ca).
set -eu
OUT=/tmp/allowlist.inc
if [ -z "${MISA_ALLOWED_CIDRS:-}" ]; then
  echo "40-allowlist: thieu MISA_ALLOWED_CIDRS - tu choi khoi dong (fail-closed)." >&2
  exit 1
fi
: > "$OUT"
OLDIFS=$IFS; IFS=','
for raw in $MISA_ALLOWED_CIDRS; do
  cidr=$(echo "$raw" | tr -d ' \t\r\n')
  [ -z "$cidr" ] && continue
  # Chi nhan IPv4/IPv6 (co hoac khong /prefix): chan chen cau lenh nginx qua bien moi truong.
  case "$cidr" in
    *[!0-9a-fA-F:./]*) echo "40-allowlist: gia tri khong hop le: $cidr" >&2; exit 1 ;;
  esac
  echo "allow $cidr;" >> "$OUT"
done
IFS=$OLDIFS
if [ ! -s "$OUT" ]; then
  echo "40-allowlist: MISA_ALLOWED_CIDRS khong co muc hop le." >&2
  exit 1
fi
echo "deny all;" >> "$OUT"
echo "40-allowlist: da nap $(grep -c '^allow' "$OUT") muc cho phep."
