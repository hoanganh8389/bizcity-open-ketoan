#!/usr/bin/env bash
# [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
# =============================================================================
# Sao lưu cơ sở dữ liệu kế toán ra tệp nén.
#
#   ./scripts/sao-luu.sh              sao lưu vào ./backups (hoặc $BACKUP_DIR)
#   BACKUP_KEEP=30 ./scripts/sao-luu.sh   giữ 30 bản gần nhất (mặc định 14)
#
# Chạy hằng đêm bằng cron (ví dụ 01:30):
#   30 1 * * * cd /www/wwwroot/tgs-ketoan && ./scripts/sao-luu.sh >> backups/sao-luu.log 2>&1
#
# Khôi phục một bản (GHI ĐÈ toàn bộ dữ liệu hiện có — dừng api trước):
#   docker compose stop api
#   gunzip -c backups/ketoan-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T db psql -U ketoan -d ketoan
#   docker compose start api
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

DIR="${BACKUP_DIR:-./backups}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$DIR"
FILE="$DIR/ketoan-$(date +%Y%m%d-%H%M%S).sql.gz"

# --clean --if-exists: tệp sao lưu tự xoá bảng cũ trước khi tạo lại, nên khôi phục được lên cơ sở dữ liệu đang có.
docker compose exec -T db pg_dump -U ketoan -d ketoan --clean --if-exists --no-owner | gzip > "$FILE.tmp"

# Tệp quá nhỏ nghĩa là pg_dump lỗi: không giữ, không xoá các bản cũ.
if [ "$(stat -c%s "$FILE.tmp")" -lt 2000 ]; then
  rm -f "$FILE.tmp"
  echo "$(date '+%F %T') LỖI: bản sao lưu rỗng, kiểm tra container db" >&2
  exit 1
fi
mv "$FILE.tmp" "$FILE"
echo "$(date '+%F %T') Đã sao lưu: $FILE ($(du -h "$FILE" | cut -f1))"

# Chỉ giữ KEEP bản gần nhất.
ls -1t "$DIR"/ketoan-*.sql.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f

# Tệp dữ liệu của API (dữ liệu huấn luyện trợ lý + ảnh) — nén riêng, giữ cùng số bản.
# Khôi phục: docker compose exec -T api sh -c 'tar xzf - -C /app/apps/api/data' < backups/tep-YYYYMMDD-HHMMSS.tar.gz
DFILE="$DIR/tep-$(date +%Y%m%d-%H%M%S).tar.gz"
if docker compose exec -T api sh -c 'cd /app/apps/api/data 2>/dev/null && tar czf - .' > "$DFILE.tmp" 2>/dev/null; then
  mv "$DFILE.tmp" "$DFILE"
  echo "$(date '+%F %T') Đã sao lưu tệp dữ liệu: $DFILE ($(du -h "$DFILE" | cut -f1))"
else
  rm -f "$DFILE.tmp"
  echo "$(date '+%F %T') Bỏ qua tệp dữ liệu (container api chưa chạy hoặc chưa có thư mục data)" >&2
fi
ls -1t "$DIR"/tep-*.tar.gz 2>/dev/null | tail -n +"$((KEEP + 1))" | xargs -r rm -f
