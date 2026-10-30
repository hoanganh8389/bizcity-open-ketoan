#!/usr/bin/env bash
# =============================================================================
# Làm sạch dữ liệu phân hệ MUA HÀNG của một đơn vị — trước khi nạp lại 25 trường hợp (scripts/nap-25-truong-hop.sh).
#
#   ./scripts/lam-sach-mua-hang.sh              # XEM TRƯỚC: đếm những gì sẽ xoá / giữ, không đổi gì (đơn vị: WP_SSO_TENANT)
#   ./scripts/lam-sach-mua-hang.sh tgs          # xem trước cho đơn vị tgs
#   ./scripts/lam-sach-mua-hang.sh tgs --chay   # xoá thật: gõ xác nhận → sao lưu → dừng API → xoá → kiểm → bật API
#
# Xoá / giữ gì: xem đầu tệp scripts/lam-sach-mua-hang.sql. Tóm tắt: xoá mọi chứng từ + chính sách mua hàng, hoá đơn NCC và
# chứng từ kế toán chúng sinh ra; GIỮ chứng từ kéo từ trang quản trị, cân tồn khởi đầu, giá mua NCC, tồn max, danh mục.
# Có lỗi hoặc kiểm sau xoá không đạt (sổ không cân) → huỷ cả giao dịch, không xoá gì. Khôi phục: xem scripts/sao-luu.sh.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Chưa có tệp .env" >&2; exit 1; }
envval() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '[:space:]"' || true; }
TENANT="${1:-$(envval WP_SSO_TENANT)}"
[ "$TENANT" = "--chay" ] && { echo "Ghi mã đơn vị trước --chay, vd: ./scripts/lam-sach-mua-hang.sh tgs --chay" >&2; exit 1; }
[ -n "$TENANT" ] || { echo "Chưa biết đơn vị: truyền mã đơn vị, vd. ./scripts/lam-sach-mua-hang.sh tgs" >&2; exit 1; }
RUN="${2:-}"

PSQL=(docker compose exec -T db psql -U ketoan -d ketoan -v ON_ERROR_STOP=1 -v tenant="$TENANT")
echo "Bản cài: $(pwd)  (dự án Docker: $(docker compose config 2>/dev/null | grep -E '^name:' | cut -d' ' -f2))"
FOUND="$(printf "SELECT COUNT(*) FROM tenants WHERE code = :'tenant';\n" | "${PSQL[@]}" -At)"
[ "$FOUND" = "1" ] || { echo "Không có đơn vị mã \"$TENANT\"." >&2; exit 1; }

if [ "$RUN" != "--chay" ]; then
  echo "== XEM TRƯỚC (không đổi gì) — đơn vị $TENANT"
  "${PSQL[@]}" -v chay=0 < scripts/lam-sach-mua-hang.sql
  echo
  echo "Chỉ là xem trước. Xoá thật: ./scripts/lam-sach-mua-hang.sh $TENANT --chay"
  exit 0
fi

echo "== Đơn vị $TENANT — xem lại số lượng trước khi xoá"
"${PSQL[@]}" -v chay=0 < scripts/lam-sach-mua-hang.sql | sed -n '/== Sẽ xoá/,/== Số dư đầu kỳ/p'
PHRASE="XOA MUA HANG $TENANT"
read -r -p "Gõ $PHRASE để xoá: " OK
[ "$OK" = "$PHRASE" ] || { echo "Đã huỷ, không xoá gì."; exit 1; }

echo "== 1. Sao lưu trước khi xoá"
./scripts/sao-luu.sh

echo "== 2. Dừng API (không cho ghi trong lúc xoá)"
docker compose stop api
trap 'echo "== Bật lại API"; docker compose start api' EXIT

echo "== 3. Xoá"
"${PSQL[@]}" -v chay=1 < scripts/lam-sach-mua-hang.sql | sed -n '/== Kiểm sau xoá/,$p'

# Nhật ký mua hàng (MH10) đọc từ tệp JSONL: cất sang thư mục riêng (không xoá) để màn nhật ký bắt đầu lại từ đầu.
STAMP="$(date +%Y%m%d-%H%M%S)"
TID="$(printf "SELECT id FROM tenants WHERE code = :'tenant';\n" | "${PSQL[@]}" -At)"
docker compose run --rm --no-deps -T --entrypoint sh api -c \
  "d=/app/apps/api/data/mua-hang/$TID; if [ -d \"\$d\" ]; then mkdir -p /app/apps/api/data/mua-hang-cu && mv \"\$d\" /app/apps/api/data/mua-hang-cu/$TENANT-$STAMP && echo 'Đã cất nhật ký mua hàng cũ: mua-hang-cu/$TENANT-$STAMP'; fi" || echo "(Không cất được nhật ký mua hàng cũ — bỏ qua)"

echo "Xong. Nạp 25 trường hợp: ./scripts/nap-25-truong-hop.sh $TENANT"
