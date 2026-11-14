#!/usr/bin/env bash
# [2026-11-13 08:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-9: khôi phục thử vào CSDL tạm ketoan_khoi_phuc_thu, đếm dòng bảng chính, kiểm Nợ = Có, xoá CSDL tạm
# =============================================================================
# KHÔI PHỤC THỬ một bản sao lưu: nạp vào CSDL TẠM trong container db (không bao giờ vào CSDL đang chạy), đếm dòng các bảng
# chính, kiểm tổng Nợ = tổng Có và từng bút toán cân, rồi xoá CSDL tạm (cả khi lỗi giữa chừng).
#
#   ./scripts/khoi-phuc-thu.sh backups/ketoan-YYYYMMDD-HHMMSS.sql.gz
#   ./scripts/khoi-phuc-thu.sh                     bản mới nhất trong ./backups (hoặc $BACKUP_DIR)
#
# Mã thoát 0 = khôi phục được và sổ cân. Kiểm sâu hơn (lane diagnostics của bộ kiểm chuẩn, so số dòng với nguồn):
# scripts/kiem-khoi-phuc.sh. Sổ tay: docs/ops/SAO-LUU-KHOI-PHUC.md
# =============================================================================
set -euo pipefail

FILE="${1:-}"
# Đường dẫn tương đối tính theo thư mục người gọi, trước khi chuyển về gốc repo.
if [ -n "$FILE" ] && [ "${FILE#/}" = "$FILE" ]; then FILE="$PWD/$FILE"; fi
cd "$(dirname "$0")/.."

LIVE_DB="${LIVE_DB:-ketoan}"                       # POSTGRES_DB của service db (docker-compose.yml)
TMP_DB="${KHOI_PHUC_DB:-ketoan_khoi_phuc_thu}"
DB_USER="${DB_USER:-ketoan}"

if [ "$TMP_DB" = "$LIVE_DB" ] || [ "$TMP_DB" = "postgres" ] || [ "$TMP_DB" = "template0" ] || [ "$TMP_DB" = "template1" ]; then
  echo "TỪ CHỐI: CSDL đích \"$TMP_DB\" trùng CSDL đang chạy / CSDL hệ thống — khôi phục thử chỉ nạp vào CSDL tạm." >&2
  exit 2
fi
case "$TMP_DB" in
  *khoi_phuc*) ;;
  *) echo "TỪ CHỐI: tên CSDL tạm phải chứa \"khoi_phuc\" (đang là \"$TMP_DB\") — tránh xoá nhầm CSDL khác." >&2; exit 2 ;;
esac
[[ "$TMP_DB" =~ ^[a-z_][a-z0-9_]*$ ]] || { echo "TỪ CHỐI: tên CSDL tạm không hợp lệ: $TMP_DB" >&2; exit 2; }

if [ -z "$FILE" ]; then
  FILE="$(ls -1t "${BACKUP_DIR:-./backups}"/ketoan-*.sql.gz 2>/dev/null | head -1 || true)"
  [ -n "$FILE" ] || { echo "Không có bản sao lưu (chạy ./scripts/sao-luu.sh trước, hoặc chỉ tệp)" >&2; exit 2; }
fi

# Kiểm tệp trước (không chạm CSDL): hỏng thì không cần nạp.
./scripts/sao-luu.sh --kiem "$FILE"

PSQL=(docker compose exec -T db psql -U "$DB_USER" -v ON_ERROR_STOP=1 -q)
q() { docker compose exec -T db psql -U "$DB_USER" -d "$TMP_DB" -v ON_ERROR_STOP=1 -At -c "$1"; }

cleanup() {
  "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $TMP_DB WITH (FORCE)" >/dev/null 2>&1 \
    && echo "   đã xoá CSDL tạm $TMP_DB" \
    || echo "CẢNH BÁO: chưa xoá được CSDL tạm $TMP_DB — xoá tay: docker compose exec -T db psql -U $DB_USER -d postgres -c 'DROP DATABASE $TMP_DB'" >&2
}

echo "== Khôi phục thử: $FILE → CSDL tạm $TMP_DB (CSDL đang chạy $LIVE_DB không bị chạm)"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $TMP_DB WITH (FORCE)" -c "CREATE DATABASE $TMP_DB"
trap cleanup EXIT

START=$(date +%s)
gunzip -c "$FILE" | "${PSQL[@]}" -d "$TMP_DB" > /dev/null
echo "   nạp xong sau $(( $(date +%s) - START )) giây"

echo "== Số dòng các bảng chính"
for t in tenants accounting_events ledger_entries ledger_lines partners products items document_attachments; do
  if [ "$(q "SELECT to_regclass('public.$t') IS NOT NULL")" = "t" ]; then
    printf '   %-22s %s\n' "$t" "$(q "SELECT count(*) FROM public.$t")"
  else
    printf '   %-22s %s\n' "$t" "(không có bảng)"
  fi
done

echo "== Nợ = Có (ledger_lines.debit / credit)"
# Tổng toàn sổ và số bút toán lệch (mỗi entry_id phải cân).
read -r SUM_DEBIT SUM_CREDIT BAD_ENTRIES <<< "$(q "
  SELECT coalesce(sum(debit),0) || ' ' || coalesce(sum(credit),0) || ' ' ||
         (SELECT count(*) FROM (SELECT entry_id FROM public.ledger_lines GROUP BY entry_id HAVING sum(debit) <> sum(credit)) x)
  FROM public.ledger_lines")"
echo "   tổng Nợ  $SUM_DEBIT"
echo "   tổng Có  $SUM_CREDIT"
STATUS=0
if [ "$SUM_DEBIT" != "$SUM_CREDIT" ] || [ "$BAD_ENTRIES" != "0" ]; then
  echo "✘ Sổ KHÔNG cân: lệch tổng hoặc $BAD_ENTRIES bút toán lệch Nợ / Có" >&2
  STATUS=1
else
  echo "✔ Sổ cân: tổng Nợ = tổng Có, không bút toán nào lệch"
fi

echo "== Khôi phục thử: $([ "$STATUS" = 0 ] && echo "ĐẠT" || echo "KHÔNG ĐẠT")"
exit "$STATUS"
