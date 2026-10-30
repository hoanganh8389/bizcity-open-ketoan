#!/usr/bin/env bash
# [2026-10-30 08:42 PM Johnny Chu - Chu Hoàng Anh] PHASE-008 — PITR: lưu WAL, sao lưu gốc, diễn tập khôi phục.
# =============================================================================
# SAO LƯU GỐC cho PITR (R-BAK-2, infrastructure/backup/README.md): pg_basebackup của service db vào ổ walbackup:/backup/base.
# Cần đã bật lưu WAL (docker-compose.pitr.yml). Khôi phục tới thời điểm T = bản gốc mới nhất trước T + WAL từ đó tới T.
#
#   ./scripts/sao-luu-goc.sh                 tạo /backup/base/<ngày-giờ>/ (base.tar.gz + pg_wal.tar.gz)
#   BASE_KEEP=4 ./scripts/sao-luu-goc.sh     giữ 4 bản gốc gần nhất (mặc định 4) và xoá WAL cũ hơn bản gốc cũ nhất còn giữ
#
# Lịch đề xuất (cron): hằng tuần, Chủ nhật 02:00 — cùng lịch với kiểm khôi phục (R-BAK-3).
#   0 2 * * 0 cd /www/wwwroot/tgs-ketoan && ./scripts/sao-luu-goc.sh >> backups/sao-luu-goc.log 2>&1
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

KEEP="${BASE_KEEP:-4}"
COMPOSE=(docker compose -f docker-compose.yml -f infrastructure/backup/docker-compose.pitr.yml)
NAME="$(date +%Y%m%d-%H%M%S)"

mode="$("${COMPOSE[@]}" exec -T db psql -U ketoan -d ketoan -Atc "SHOW archive_mode")"
[ "$mode" = "on" ] || { echo "$(date '+%F %T') LỖI: db chưa bật lưu WAL (archive_mode = $mode) — xem infrastructure/backup/README.md §1" >&2; exit 2; }

START=$(date +%s)
"${COMPOSE[@]}" exec -T -u postgres db pg_basebackup -U ketoan -D "/backup/base/$NAME" -Ft -z -X stream -c fast
SIZE="$("${COMPOSE[@]}" exec -T db du -sh "/backup/base/$NAME" | cut -f1)"
echo "$(date '+%F %T') Bản gốc $NAME ($SIZE, $(( $(date +%s) - START )) giây)"

# Giữ KEEP bản gốc mới nhất; WAL cũ hơn bản gốc cũ nhất còn giữ không còn dùng được → xoá (pg_archivecleanup).
"${COMPOSE[@]}" exec -T -u postgres db sh -c "
  cd /backup/base && ls -1d */ | sed 's#/##' | sort | head -n -$KEEP | xargs -r rm -rf
  oldest=\$(ls -1d */ | sed 's#/##' | sort | head -1)
  [ -n \"\$oldest\" ] || exit 0
  label=\$(tar xzOf \"\$oldest/base.tar.gz\" backup_label 2>/dev/null | sed -n 's/^START WAL LOCATION: .* (file \\(.*\\))/\\1/p')
  [ -n \"\$label\" ] && pg_archivecleanup /backup/wal \"\$label\" || true"
echo "$(date '+%F %T') Giữ $KEEP bản gốc gần nhất; đã dọn WAL cũ hơn bản gốc cũ nhất."
