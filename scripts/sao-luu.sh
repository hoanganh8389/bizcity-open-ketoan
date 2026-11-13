#!/usr/bin/env bash
# [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
# [2026-11-13 08:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-9: --kiem kiểm bản sao lưu (gunzip đọc hết, đầu pg_dump, có COPY ledger_entries, đếm bảng); sao lưu xong tự kiểm, hỏng thì đổi đuôi .hong và thoát lỗi
# =============================================================================
# Sao lưu cơ sở dữ liệu kế toán ra tệp nén.
#
#   ./scripts/sao-luu.sh              sao lưu vào ./backups (hoặc $BACKUP_DIR), rồi tự kiểm bản vừa tạo
#   BACKUP_KEEP=30 ./scripts/sao-luu.sh   giữ 30 bản gần nhất (mặc định 14)
#   ./scripts/sao-luu.sh --kiem backups/ketoan-YYYYMMDD-HHMMSS.sql.gz
#                                     chỉ kiểm một bản (không chạm CSDL): đọc hết, đầu pg_dump, có sổ cái, đếm bảng
#
# Chạy hằng đêm bằng cron (ví dụ 01:30):
#   30 1 * * * cd /www/wwwroot/tgs-ketoan && ./scripts/sao-luu.sh >> backups/sao-luu.log 2>&1
#
# Khôi phục thử (CSDL tạm, không chạm CSDL đang chạy): ./scripts/khoi-phuc-thu.sh <tệp>
# Khôi phục một bản (GHI ĐÈ toàn bộ dữ liệu hiện có — dừng api trước):
#   docker compose stop api
#   gunzip -c backups/ketoan-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T db psql -U ketoan -d ketoan
#   docker compose start api
# Sổ tay đầy đủ: docs/ops/SAO-LUU-KHOI-PHUC.md
# =============================================================================
set -euo pipefail

# Kiểm một tệp sao lưu mà không chạm CSDL. In kết luận; trả 0 = dùng được, 1 = hỏng.
kiem_tep() {
  local f="$1" size header stats tables copies ledger complete
  if [ ! -f "$f" ]; then echo "✘ KHÔNG ĐẠT: không có tệp $f" >&2; return 1; fi
  size="$(wc -c < "$f" | tr -d ' ')"
  if [ "$size" -eq 0 ]; then echo "✘ KHÔNG ĐẠT: tệp rỗng (0 byte): $f" >&2; return 1; fi
  if ! gunzip -t "$f" 2>/dev/null; then
    echo "✘ KHÔNG ĐẠT: tệp nén hỏng hoặc bị cắt cụt (gunzip -t lỗi): $f" >&2; return 1
  fi
  header="$(gunzip -c "$f" | head -c 4096 | grep -c 'PostgreSQL database dump' || true)"
  if [ "$header" -eq 0 ]; then echo "✘ KHÔNG ĐẠT: không thấy đầu tệp pg_dump (\"PostgreSQL database dump\"): $f" >&2; return 1; fi
  # Một lượt đọc: số CREATE TABLE, số đoạn COPY, có đoạn COPY public.ledger_entries, có dòng kết thúc của pg_dump.
  stats="$(gunzip -c "$f" | awk '
    /^CREATE TABLE /                 { t++ }
    /^COPY /                         { c++ }
    /^COPY public\.ledger_entries /  { l = 1 }
    /^-- PostgreSQL database dump complete/ { e = 1 }
    END { printf "%d %d %d %d", t, c, l, e }')"
  read -r tables copies ledger complete <<< "$stats"
  if [ "$ledger" -ne 1 ]; then echo "✘ KHÔNG ĐẠT: thiếu đoạn dữ liệu sổ cái (COPY public.ledger_entries): $f" >&2; return 1; fi
  if [ "$complete" -ne 1 ]; then echo "✘ KHÔNG ĐẠT: thiếu dòng kết thúc của pg_dump (bản sao lưu dừng giữa chừng): $f" >&2; return 1; fi
  echo "✔ ĐẠT: $f ($(du -h "$f" | cut -f1)) — $tables bảng, $copies đoạn dữ liệu, có sổ cái"
}

if [ "${1:-}" = "--kiem" ]; then
  [ -n "${2:-}" ] || { echo "Dùng: ./scripts/sao-luu.sh --kiem <tệp .sql.gz>" >&2; exit 2; }
  kiem_tep "$2"
  exit $?
fi

cd "$(dirname "$0")/.."

DIR="${BACKUP_DIR:-./backups}"
KEEP="${BACKUP_KEEP:-14}"
mkdir -p "$DIR"
FILE="$DIR/ketoan-$(date +%Y%m%d-%H%M%S).sql.gz"

# --clean --if-exists: tệp sao lưu tự xoá bảng cũ trước khi tạo lại, nên khôi phục được lên cơ sở dữ liệu đang có.
docker compose exec -T db pg_dump -U ketoan -d ketoan --clean --if-exists --no-owner | gzip > "$FILE.tmp"

# Tệp quá nhỏ nghĩa là pg_dump lỗi: không giữ, không xoá các bản cũ.
if [ "$(wc -c < "$FILE.tmp" | tr -d ' ')" -lt 2000 ]; then
  rm -f "$FILE.tmp"
  echo "$(date '+%F %T') LỖI: bản sao lưu rỗng, kiểm tra container db" >&2
  exit 1
fi
# Kiểm bản vừa tạo trước khi nhận nó là bản mới nhất. Hỏng: đổi đuôi .hong (không bị chọn làm bản khôi phục), không xoá bản cũ.
if ! kiem_tep "$FILE.tmp"; then
  mv "$FILE.tmp" "$FILE.hong"
  echo "$(date '+%F %T') LỖI: bản sao lưu vừa tạo KHÔNG dùng được, để lại ở $FILE.hong để điều tra; các bản cũ giữ nguyên" >&2
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
