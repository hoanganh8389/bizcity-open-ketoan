#!/usr/bin/env bash
# [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
# =============================================================================
# Cập nhật phần mềm trên máy chủ: sao lưu → lấy code mới → dựng lại → kiểm tra.
#
#   ./scripts/cap-nhat.sh
#
# Cơ sở dữ liệu nâng cấp bằng job db-migrate (chạy các file db/migrations chưa áp + seed) TRƯỚC khi API khởi động.
# Job lỗi thì API không khởi động: xem "docker compose logs db-migrate", và khôi phục bản sao lưu vừa tạo theo
# hướng dẫn trong scripts/sao-luu.sh nếu cần.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Chưa có tệp .env (sao chép từ .env.example rồi sửa)" >&2; exit 1; }

echo "== 1. Sao lưu cơ sở dữ liệu"
if docker compose ps --status running db 2>/dev/null | grep -q db; then
  ./scripts/sao-luu.sh
else
  echo "   (cơ sở dữ liệu chưa chạy: lần cài đầu, bỏ qua sao lưu)"
fi

echo "== 2. Lấy code mới"
BEFORE="$(git rev-parse --short HEAD)"
git pull --ff-only
echo "   $BEFORE → $(git rev-parse --short HEAD)"

# [2026-11-01 10:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — P0-3 (AUDIT-2026-11-01): bản cài cũ chưa có DB_APP_PASSWORD thì thêm (sau git pull, trước compose) — API chuyển sang ketoan_app
# Từ P0-3 API luôn chạy bằng vai trò thường ketoan_app; docker-compose.yml dừng nếu thiếu DB_APP_PASSWORD. Thêm một lần, không ghi đè.
if ! grep -q '^DB_APP_PASSWORD=..*' .env; then
  sed -i.bak '/^DB_APP_PASSWORD=$/d' .env && rm -f .env.bak
  printf 'DB_APP_PASSWORD=%s\n' "$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-32)" >> .env
  echo "   Thêm DB_APP_PASSWORD vào .env — API chạy bằng vai trò ketoan_app (không superuser, RLS có hiệu lực)"
fi

echo "== 3. Dựng lại, nâng cấp cơ sở dữ liệu (db-migrate), khởi động"
if ! docker compose up -d --build; then
  echo "LỖI khi khởi động. Nhật ký nâng cấp cơ sở dữ liệu (db-migrate):" >&2
  docker compose logs --tail 60 db-migrate >&2 || true
  exit 1
fi
docker compose logs --since 10m db-migrate 2>/dev/null | grep -iE "migration|mới nhất|lỗi" || true

echo "== 4. Chờ máy chủ API lên khoẻ"
for i in $(seq 1 40); do
  STATE="$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q api)" 2>/dev/null || echo starting)"
  if [ "$STATE" = "healthy" ]; then
    echo "   API đã sẵn sàng."
    docker compose ps
    exit 0
  fi
  sleep 3
done

echo "LỖI: API chưa lên khoẻ sau 2 phút. Nhật ký gần nhất:" >&2
docker compose logs --tail 40 api >&2
exit 1
