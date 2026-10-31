#!/usr/bin/env bash
# [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
# =============================================================================
# Tạo một bản cài phần mềm kế toán RIÊNG (vd. bản test cho trang quản trị test) từ bản cài đang chạy:
# dùng chung code (cùng git), KHÁC dữ liệu (ổ Docker riêng theo tên dự án), cổng, khoá bí mật, tên miền.
#
# Chạy TRONG THƯ MỤC BẢN CÀI NGUỒN (sổ nội bộ → bản test nội bộ; sổ thuế → bản test sổ thuế):
#   ./scripts/tao-ban-test.sh <thư mục đích> <tên dự án Docker> <cổng web> <cổng db> <địa chỉ trang quản trị> <địa chỉ phần mềm kế toán> [tax]
# Ví dụ:
#   cd /www/wwwroot/tgs-ketoan
#   ./scripts/tao-ban-test.sh /www/wwwroot/tgs-ketoan-uat ketoan-uat 8090 5436 https://tgs-soft-uat.thegioisua.com https://ketoan.tgs-soft-uat.thegioisua.com
#   cd /www/wwwroot/tgs-ketoan-thue
#   ./scripts/tao-ban-test.sh /www/wwwroot/tgs-ketoan-uat-thue ketoan-uat-thue 8091 5437 https://tgs-soft-uat.thegioisua.com https://ketoanthue.tgs-soft-uat.thegioisua.com tax
#
# Làm gì:
#   1. Sao lưu bản nguồn (./scripts/sao-luu.sh) — lấy bản này nạp vào bản mới (danh mục, người dùng, chứng từ y như nguồn).
#   2. Chép code sang thư mục đích (không chép backups), viết .env mới: tên dự án, cổng, khoá JWT / mật khẩu CSDL /
#      khoá SSO mới, địa chỉ trang quản trị + phần mềm kế toán mới, BOOK_MODE.
#   3. Bật CSDL mới, nạp bản sao lưu, dựng và bật API + web, chờ API khoẻ.
# Bản nguồn KHÔNG bị đụng (không dừng, không sửa). Sau đó: muốn sổ trống thì chạy ./scripts/xoa-chung-tu.sh ở thư mục đích.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
SRC="$(pwd)"

[ $# -ge 6 ] || { sed -n '2,25p' "$0"; exit 1; }
DEST="$1"; PROJECT="$2"; WEB_PORT="$3"; DB_PORT="$4"; WP_URL="${5%/}"; ERP_URL="${6%/}"; MODE="${7:-internal}"
[ "$MODE" = "tax" ] || MODE="internal"
[ -e "$DEST" ] && { echo "Thư mục đích đã có: $DEST — chọn thư mục khác (không ghi đè)." >&2; exit 1; }
[ -f .env ] || { echo "Bản nguồn chưa có .env" >&2; exit 1; }
for p in "$WEB_PORT" "$DB_PORT"; do
  if (ss -ltn 2>/dev/null || netstat -ltn 2>/dev/null) | grep -q ":$p\b"; then echo "Cổng $p đang có chương trình dùng — chọn cổng khác." >&2; exit 1; fi
done
command -v openssl >/dev/null || { echo "Thiếu openssl" >&2; exit 1; }

echo "== 1. Sao lưu bản nguồn ($SRC)"
./scripts/sao-luu.sh
DUMP="$(ls -1t backups/ketoan-*.sql.gz | head -1)"
echo "   Dùng bản sao lưu: $DUMP"

echo "== 2. Chép code sang $DEST"
mkdir -p "$DEST"
if command -v rsync >/dev/null; then
  rsync -a --exclude backups/ --exclude node_modules/ ./ "$DEST/"
else
  tar --exclude=./backups --exclude=./node_modules -cf - . | tar -xf - -C "$DEST"
fi
mkdir -p "$DEST/backups"
cp "$DUMP" "$DEST/backups/nguon-$(basename "$DUMP")"

cd "$DEST"
setenv() { # setenv KEY VALUE — thay dòng KEY=… hoặc thêm cuối tệp
  local k="$1" v="$2" tmp; tmp="$(mktemp)"
  awk -v k="$k" -v v="$v" 'BEGIN{d=0} $0 ~ "^"k"=" {print k"="v; d=1; next} {print} END{if(!d) print k"="v}' .env > "$tmp" && cat "$tmp" > .env && rm -f "$tmp"
}
setenv COMPOSE_PROJECT_NAME "$PROJECT"
setenv WEB_PORT "$WEB_PORT"
setenv DB_PORT "$DB_PORT"
setenv BOOK_MODE "$MODE"
setenv ENV_LABEL "BẢN TEST"
setenv JWT_SECRET "$(openssl rand -hex 32)"
setenv DB_PASSWORD "$(openssl rand -hex 16)"
setenv WP_SSO_SECRET "$(openssl rand -hex 32)"
setenv CORS_ORIGINS "$ERP_URL"
if [ "$MODE" = "tax" ]; then
  # Sổ thuế đăng nhập riêng (mật khẩu của phần mềm).
  setenv WP_SSO_LOGIN_URL ""
else
  setenv WP_SSO_LOGIN_URL "$WP_URL/wp-admin/admin-post.php?action=tgs_acc_sso_go"
fi
setenv WP_EMBED_URL 
chmod 600 .env

echo "== 3. Bật CSDL mới (dự án Docker: $PROJECT), nạp dữ liệu"
docker compose up -d db
for i in $(seq 1 40); do
  docker compose exec -T db pg_isready -U ketoan -d ketoan >/dev/null 2>&1 && break
  sleep 2
done
gunzip -c "backups/nguon-$(basename "$DUMP")" | docker compose exec -T db psql -q -U ketoan -d ketoan -v ON_ERROR_STOP=0 >/dev/null
echo "   Đã nạp dữ liệu."

echo "== 4. Dựng và bật API + web"
docker compose up -d --build
for i in $(seq 1 60); do
  STATE="$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q api)" 2>/dev/null || echo starting)"
  [ "$STATE" = "healthy" ] && break
  sleep 3
done
docker compose ps
echo
echo "Xong bản cài $DEST (sổ: $MODE, web: cổng $WEB_PORT)."
echo "Việc còn lại:"
echo "  - aaPanel: tạo site $(echo "$ERP_URL" | sed 's#https\?://##'), Reverse proxy về http://127.0.0.1:$WEB_PORT, bật SSL."
echo "  - Trang quản trị test ($WP_URL): Cổng kế toán → địa chỉ $ERP_URL, khoá SSO = WP_SSO_SECRET trong $DEST/.env"
echo "    (xem bằng: grep WP_SSO_SECRET $DEST/.env), mã đơn vị: $(grep -E '^WP_SSO_TENANT=' .env | cut -d= -f2-)."
echo "  - Muốn sổ trống để test từ đầu: cd $DEST && ./scripts/xoa-chung-tu.sh"
