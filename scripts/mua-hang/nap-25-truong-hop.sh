#!/usr/bin/env bash
# [2026-10-31 05:07 PM Johnny Chu - Chu Hoàng Anh] R-REV — chuyển về scripts/mua-hang/ (công cụ phân hệ); bỏ bước làm sạch sổ: nạp vào đơn vị mới.
# [2026-10-30 04:56 PM Nguyễn Văn Thủy] R-SIG — ký bù (commit 392d97e, đóng góp): nạp 25 trường hợp mua hàng (db/seeds/mua-hang-25th) vào một đơn vị qua API, kiểm kết quả mong đợi.
# =============================================================================
# Nạp 25 trường hợp mua hàng (db/seeds/mua-hang-25th/kich-ban.json — chép từ Google Sheet 25 trường hợp) vào MỘT đơn vị:
# khai chính sách, lập + duyệt phiếu qua đúng API của giao diện, theo thứ tự TH01 → TH25; xong thì kiểm từng số
# "Kết quả mong đợi" của file và in ĐẠT / LỆCH.
#
#   ./scripts/mua-hang/nap-25-truong-hop.sh              # XEM TRƯỚC: danh sách case, kiểm đơn vị đã sạch chưa (không ghi gì)
#   ./scripts/mua-hang/nap-25-truong-hop.sh <đơn vị mới> --chay   # nạp thật
#
# Đơn vị nạp phải là đơn vị MỚI (chưa có chứng từ / chính sách mua hàng): lập bằng seed (SEED_TENANT_CODE=<mã> npm run db:seed -w @ketoan/api) hoặc trên bản test (scripts/tao-ban-test.sh). Không làm sạch sổ để nạp lại — sổ chỉ thêm (R-LEDGER-1, docs/audits/REVIEW-2026-10-31-THUY.md §8).
# Kết quả chi tiết (từng số file ↔ sổ, chỗ tool phải điều chỉnh): backups/nap-25-truong-hop-<giờ>.json
# Cần bản cài đã cập nhật code mới (./scripts/cap-nhat.sh) để container API có tệp kịch bản.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/../.."

[ -f .env ] || { echo "Chưa có tệp .env" >&2; exit 1; }
envval() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '[:space:]"' || true; }
TENANT="${1:-$(envval WP_SSO_TENANT)}"
[ "$TENANT" = "--chay" ] && { echo "Ghi mã đơn vị trước --chay, vd: ./scripts/mua-hang/nap-25-truong-hop.sh <mã> --chay" >&2; exit 1; }
[ -n "$TENANT" ] || { echo "Chưa biết đơn vị: truyền mã đơn vị, vd. ./scripts/mua-hang/nap-25-truong-hop.sh <mã>" >&2; exit 1; }
CHAY=0; [ "${2:-}" = "--chay" ] && CHAY=1

# </dev/null: lệnh kiểm không được đọc stdin (nếu không nó "ăn" mất dòng xác nhận khi đưa vào qua ống, vd printf 'NAP tgs' | …)
docker compose exec -T api test -f /app/db/seeds/mua-hang-25th/kich-ban.json </dev/null \
  || { echo "Container API chưa có kịch bản 25 trường hợp — chạy ./scripts/cap-nhat.sh trước." >&2; exit 1; }

if [ "$CHAY" = "1" ]; then
  read -r -p "Nạp 25 trường hợp vào sổ THẬT của đơn vị $TENANT? Gõ NAP $TENANT để tiếp tục: " OK
  [ "$OK" = "NAP $TENANT" ] || { echo "Đã huỷ."; exit 1; }
fi

# Chạy trong container API (có sẵn pg, jose, DATABASE_URL, JWT_SECRET; gọi API nội bộ 127.0.0.1:4100).
docker compose exec -T -e NAP_TENANT="$TENANT" -e NAP_CHAY="$CHAY" -w /app/apps/api api node --input-type=module - < scripts/mua-hang/nap-25-truong-hop.mjs

if [ "$CHAY" = "1" ]; then
  mkdir -p backups
  OUT="backups/nap-25-truong-hop-$(date +%Y%m%d-%H%M%S).json"
  docker compose cp api:/app/apps/api/data/nap-25-truong-hop.json "$OUT" >/dev/null && echo "Đã chép kết quả: $OUT"
fi
