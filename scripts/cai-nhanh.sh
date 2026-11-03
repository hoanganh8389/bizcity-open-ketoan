#!/usr/bin/env bash
# [2026-11-01 01:01 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — cài nhanh localhost: tạo .env có bí mật ngẫu nhiên, tự nhận Docker Desktop, bật giám sát tuỳ chọn, chờ sẵn sàng.
# [2026-11-01 01:14 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — --giam-sat tự sinh vai trò exporter chỉ đọc ketoan_monitor (S018-5b).
# =============================================================================
# Cài nhanh open-ketoan trên một máy (localhost) bằng Docker.
#
# [2026-11-04 04:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — S018-21: giám sát BẬT MẶC ĐỊNH (chủ dự án: "on by default"); tắt bằng --khong-giam-sat
#   bash scripts/cai-nhanh.sh                    # ứng dụng kế toán + giám sát (Prometheus, Alertmanager, Grafana, Loki, Tempo)
#   bash scripts/cai-nhanh.sh --khong-giam-sat   # chỉ ứng dụng (db + migration + api + web) — máy nhỏ, thử nhanh
#   GIAM_SAT=0 bash scripts/cai-nhanh.sh         # như --khong-giam-sat (--giam-sat vẫn được nhận, không đổi gì)
#
# - Chưa có .env: chép .env.example, sinh JWT_SECRET ngẫu nhiên. Đã có .env: KHÔNG ghi đè, chỉ thêm biến còn thiếu.
# - Giám sát: thêm GRAFANA_ADMIN_PASSWORD ngẫu nhiên nếu .env chưa có (biến bắt buộc của bộ giám sát) và ghi COMPOSE_FILE vào .env để
#   mọi lệnh "docker compose up / down / logs" sau này dùng đúng bộ tệp (không cần gõ lại -f).
# - Docker Desktop (Windows / macOS): tự ghép infrastructure/monitoring/docker-compose.desktop.yml.
# - Chỉ dùng cho máy thử / máy cá nhân. Máy chủ thật: docs/trien-khai.md, docs/ops/DEPLOY.md.
# Chạy từ gốc kho. Windows: dùng Git Bash.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
GIAM_SAT="${GIAM_SAT:-1}"
for a in "$@"; do
  case "$a" in
    --giam-sat) GIAM_SAT=1 ;;
    --khong-giam-sat) GIAM_SAT=0 ;;
    -h|--help) sed -n '5,/Chạy từ gốc kho/p' "$0" | grep -v '^# \[20'; exit 0 ;;
    *) echo "Không hiểu tham số: $a (dùng --khong-giam-sat hoặc --help)" >&2; exit 2 ;;
  esac
done

command -v docker >/dev/null || { echo "Chưa có Docker. Cài Docker Desktop (Windows / macOS) hoặc Docker Engine (Linux) rồi chạy lại." >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker chưa chạy. Mở Docker Desktop / khởi động dịch vụ docker rồi chạy lại." >&2; exit 1; }

ngau_nhien() { head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-"$1"; }
dat_bien() { # dat_bien TÊN GIÁ_TRỊ — thay dòng TÊN=… nếu có, không thì thêm cuối tệp
  if grep -q "^$1=" .env; then sed "s|^$1=.*|$1=$2|" .env > .env.tmp && mv .env.tmp .env; else printf '%s=%s\n' "$1" "$2" >> .env; fi
}

if [ ! -f .env ]; then
  cp .env.example .env
  dat_bien JWT_SECRET "$(ngau_nhien 48)"
  dat_bien DB_APP_PASSWORD "$(ngau_nhien 32)"
  echo "✓ Tạo .env, JWT_SECRET và DB_APP_PASSWORD ngẫu nhiên"
else
  echo "• Đã có .env — giữ nguyên"
  if grep -q '^JWT_SECRET=doi-thanh-chuoi' .env; then echo "  ! JWT_SECRET vẫn là giá trị mẫu — nên đổi trước khi dùng thật"; fi
  # [2026-11-01 10:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — P0-3: bản cài cũ chưa có DB_APP_PASSWORD → thêm, API chuyển sang vai trò ketoan_app ở lần chạy này
  if ! grep -q '^DB_APP_PASSWORD=..*' .env; then
    dat_bien DB_APP_PASSWORD "$(ngau_nhien 32)"
    echo "✓ Thêm DB_APP_PASSWORD ngẫu nhiên — API chạy bằng vai trò ketoan_app (không superuser, RLS có hiệu lực)"
  fi
fi

FILES=(-f docker-compose.yml)
if [ "$GIAM_SAT" = 1 ]; then
  if ! grep -q '^GRAFANA_ADMIN_PASSWORD=..*' .env; then
    { echo; echo "# Mật khẩu quản trị Grafana (đăng nhập admin tại http://127.0.0.1:3000)"; } >> .env
    dat_bien GRAFANA_ADMIN_PASSWORD "$(ngau_nhien 24)"
    echo "✓ Thêm GRAFANA_ADMIN_PASSWORD ngẫu nhiên vào .env"
  fi
  # postgres-exporter dùng vai trò chỉ đọc thống kê ketoan_monitor (job db-migrate tạo), không dùng vai trò sở hữu.
  if ! grep -q '^PG_EXPORTER_PASSWORD=..*' .env; then
    { echo; echo "# postgres-exporter: vai trò chỉ đọc thống kê (pg_monitor), job db-migrate tự tạo"; } >> .env
    dat_bien PG_EXPORTER_USER ketoan_monitor
    dat_bien PG_EXPORTER_PASSWORD "$(ngau_nhien 24)"
    echo "✓ Thêm vai trò exporter chỉ đọc ketoan_monitor vào .env"
  fi
  FILES+=(-f infrastructure/monitoring/docker-compose.monitoring.yml)
  if docker info --format '{{.OperatingSystem}}' 2>/dev/null | grep -qi 'docker desktop'; then
    FILES+=(-f infrastructure/monitoring/docker-compose.desktop.yml)
    echo "• Docker Desktop: dùng tệp ghép docker-compose.desktop.yml (node-exporter không dùng rslave)"
  fi
fi

# [2026-11-04 04:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — S018-21: nhớ bộ tệp compose trong .env — "docker compose down / logs / up" gõ trần sau này khớp với lần cài
# (trước đây chỉ lệnh up của script có -f; down trần để lại các dịch vụ giám sát chạy). Tắt giám sát thì xoá dòng cũ, không để bật lại ngầm.
bo_tep=""; for t in "${FILES[@]}"; do [ "$t" != "-f" ] && bo_tep="${bo_tep:+$bo_tep:}$t"; done
grep -vE '^(COMPOSE_FILE|COMPOSE_PATH_SEPARATOR)=' .env > .env.tmp || true; mv .env.tmp .env
if [ "$GIAM_SAT" = 1 ]; then
  { echo "COMPOSE_PATH_SEPARATOR=:"; echo "COMPOSE_FILE=$bo_tep"; } >> .env
fi

echo "→ docker compose ${FILES[*]} up -d --build"
if [ "${DRY_RUN:-0}" = 1 ]; then docker compose "${FILES[@]}" config --quiet && echo "✓ DRY_RUN: cấu hình hợp lệ, không khởi động"; exit 0; fi
docker compose "${FILES[@]}" up -d --build

doc_bien() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- ; }
PORT="$(doc_bien WEB_PORT)"; PORT="${PORT:-8088}"
echo "→ Chờ ứng dụng sẵn sàng (migration, trigger bảo vệ sổ, CSDL ghi được)…"
for _ in $(seq 1 90); do
  if curl -fsS "http://localhost:$PORT/api/v1/system/health/ready" >/dev/null 2>&1; then OK=1; break; fi
  sleep 2
done
if [ "${OK:-0}" != 1 ]; then echo "! Chưa sẵn sàng sau 3 phút. Xem: docker compose logs --tail=100 db-migrate api" >&2; exit 1; fi

TEN="$(doc_bien SEED_TENANT_CODE)"; EMAIL="$(doc_bien SEED_ADMIN_EMAIL)"; MK="$(doc_bien SEED_ADMIN_PASSWORD)"
echo
echo "✓ Sẵn sàng"
echo "  Ứng dụng      http://localhost:$PORT   (đơn vị ${TEN:-demo} · ${EMAIL:-admin@ketoan.local} · ${MK:-Admin@123} — đổi mật khẩu ngay)"
echo "  Tài liệu API  http://localhost:$PORT/api/docs"
if [ "$GIAM_SAT" = 1 ]; then
  echo "  Grafana       http://127.0.0.1:3000    (admin · mật khẩu: dòng GRAFANA_ADMIN_PASSWORD trong .env)"
  echo "  Prometheus    http://127.0.0.1:9090"
  echo "  Bàn điều tra  Nhà phát triển → Nhật ký / Tra mã (Loki, Tempo đã nối sẵn). Tắt giám sát: bash scripts/cai-nhanh.sh --khong-giam-sat"
else
  echo "  Giám sát      ĐÃ TẮT — Bàn điều tra sẽ báo \"chưa bật\" ở Nhật ký / Tra mã. Bật: bash scripts/cai-nhanh.sh"
fi
echo "  Dữ liệu mẫu theo ngành (tuỳ chọn): BIZCITY_PASSWORD='${MK:-Admin@123}' node scripts/cai-preset.mjs thuong-mai-ban-le --api http://localhost:$PORT --tenant ${TEN:-demo} --email ${EMAIL:-admin@ketoan.local}"
