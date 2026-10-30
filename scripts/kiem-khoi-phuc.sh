#!/usr/bin/env bash
# =============================================================================
# KIỂM KHÔI PHỤC (R-BAK-3, docs/rules/RULE-INFRASTRUCTURE.md): bản sao lưu chỉ có giá trị khi khôi phục được và sổ còn đúng.
# Khôi phục một bản vào CSDL TẠM (không đụng CSDL đang chạy), chạy lane diagnostics của bộ kiểm chuẩn trên bản đó
# (Nợ = Có, số dư ngày, đảo một lần, chuỗi bằng chứng, trigger bảo vệ, migration…), so số dòng các bảng sổ với nguồn,
# rồi xoá CSDL tạm. Mã thoát 0 = bản sao lưu dùng được. Kết quả ghi thêm vào backups/kiem-khoi-phuc.log làm bằng chứng.
#
#   ./scripts/kiem-khoi-phuc.sh                         bản mới nhất trong ./backups (hoặc $BACKUP_DIR)
#   ./scripts/kiem-khoi-phuc.sh backups/ketoan-….sql.gz một bản cụ thể
#   SOURCE_DB=ketoan ./scripts/kiem-khoi-phuc.sh --fresh  sao lưu ngay SOURCE_DB rồi kiểm (so được số dòng chính xác)
#
# Lịch đề xuất: mỗi tuần một lần sau sao lưu đêm (cron), và trước mỗi lần nâng cấp (R-REL).
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

DIR="${BACKUP_DIR:-./backups}"
SOURCE_DB="${SOURCE_DB:-ketoan}"
TMP_DB="ketoan_kiem_khoi_phuc"
PSQL=(docker compose exec -T db psql -U ketoan -v ON_ERROR_STOP=1 -q)
mkdir -p "$DIR"
LOG="$DIR/kiem-khoi-phuc.log"

FILE="${1:-}"
FRESH=0
if [ "$FILE" = "--fresh" ]; then
  FRESH=1
  FILE="$DIR/kiem-$(date +%Y%m%d-%H%M%S)-$SOURCE_DB.sql.gz"
  docker compose exec -T db pg_dump -U ketoan -d "$SOURCE_DB" --clean --if-exists --no-owner | gzip > "$FILE"
elif [ -z "$FILE" ]; then
  FILE="$(ls -1t "$DIR"/ketoan-*.sql.gz 2>/dev/null | head -1 || true)"
fi
[ -n "$FILE" ] && [ -s "$FILE" ] || { echo "Không có bản sao lưu (chạy ./scripts/sao-luu.sh trước, hoặc --fresh)" >&2; exit 2; }

echo "== Kiểm khôi phục: $FILE ($(du -h "$FILE" | cut -f1))"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $TMP_DB" -c "CREATE DATABASE $TMP_DB"
cleanup() { "${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $TMP_DB" >/dev/null 2>&1 || true; }
trap cleanup EXIT

START=$(date +%s)
gunzip -c "$FILE" | "${PSQL[@]}" -d "$TMP_DB" > /dev/null
echo "   khôi phục xong sau $(( $(date +%s) - START )) giây"

count() { docker compose exec -T db psql -U ketoan -d "$1" -At -c "SELECT (SELECT count(*) FROM ledger_entries) || ' ' || (SELECT count(*) FROM ledger_lines) || ' ' || (SELECT count(*) FROM accounting_events) || ' ' || (SELECT count(*) FROM audit_logs)"; }
RESTORED="$(count "$TMP_DB")"
echo "   số dòng (bút toán, dòng sổ, sự việc, bằng chứng): $RESTORED"
STATUS=0
if [ "$FRESH" = 1 ]; then
  SOURCE="$(count "$SOURCE_DB")"
  if [ "$SOURCE" != "$RESTORED" ]; then echo "✘ số dòng lệch nguồn $SOURCE_DB: $SOURCE" >&2; STATUS=1; else echo "✔ số dòng khớp nguồn $SOURCE_DB"; fi
fi

# Toàn vẹn trên bản khôi phục: cùng mã kiểm với GET /system/diagnostics (DG-LEDGER-*, DG-EVENT-*, DG-EVD-1, DG-DB-*).
if ! node tests/conformance/selfcheck.mjs --lane diagnostics --psql "docker compose exec -T db psql -U ketoan -d $TMP_DB" --out "$DIR/kiem-khoi-phuc-output"; then
  STATUS=1
fi

RESULT=$([ "$STATUS" = 0 ] && echo "ĐẠT" || echo "KHÔNG ĐẠT")
echo "$(date '+%F %T') $RESULT $FILE rows=[$RESTORED]" >> "$LOG"
echo "== Kiểm khôi phục: $RESULT (ghi ở $LOG)"
exit "$STATUS"
