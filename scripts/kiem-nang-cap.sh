#!/usr/bin/env bash
# [2026-10-30 01:11 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — tuyên bố tối thượng, 7 nguyên tắc AP, ba lớp kiểm soát, ma trận tuân thủ, kiểm nâng cấp migration.
# =============================================================================
# KIỂM NÂNG CẤP (R-DB-15, docs/rules/RULE-DATABASE.md): migration của bản mới phải chạy được trên CSDL ĐÃ CÓ DỮ LIỆU
# của bản trước, và sổ sau nâng cấp vẫn đúng. Bổ sung cho job CI "test" (migration trên CSDL sạch).
#
#   1. Lấy mã nguồn bản trước bằng git worktree (mặc định: tag v* mới nhất; chưa có tag thì origin/main, rồi main).
#   2. CSDL tạm ketoan_nang_cap: chạy migration + dữ liệu khởi tạo CỦA BẢN TRƯỚC.
#   3. Chạy migration CỦA BẢN NÀY lên trên (runner apps/api/src/db/migrate.ts: tệp đổi tên, tệp nền… — R-DB-3).
#   4. Lane diagnostics của bộ kiểm chuẩn trên CSDL đã nâng cấp (migration đủ, trigger bảo vệ, Nợ = Có, chuỗi bằng chứng…).
#   5. Xoá worktree và CSDL tạm.
#
#   ./scripts/kiem-nang-cap.sh [git-ref]
#   Biến: DB_URL_BASE (mặc định postgres://ketoan:ketoan@localhost:5434 — cổng của docker compose máy dev; CI: localhost:5432)
#         PSQL (lệnh psql cho lane diagnostics; mặc định qua container db của docker compose)
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

REF="${1:-}"
if [ -z "$REF" ]; then
  REF="$(git describe --tags --abbrev=0 --match 'v*' 2>/dev/null || true)"
  [ -n "$REF" ] || { git rev-parse -q --verify origin/main >/dev/null && REF=origin/main || REF=main; }
fi
BASE="${DB_URL_BASE:-postgres://ketoan:ketoan@localhost:5434}"
DB=ketoan_nang_cap
URL="$BASE/$DB"
PSQL="${PSQL:-docker compose exec -T db psql -U ketoan -d $DB}"
WT="$(mktemp -d)"

# Tạo / xoá CSDL tạm bằng gói pg của apps/api (không cần psql trên máy chạy).
admin() { (cd "$ROOT/apps/api" && node -e "
  const pg = require('pg'); const c = new pg.Client({ connectionString: process.argv[1] + '/postgres' });
  c.connect().then(() => c.query(process.argv[2])).then(() => c.end(), (e) => { console.error(e.message); process.exit(1); });" "$BASE" "$1"); }
cleanup() {
  git worktree remove --force "$WT" >/dev/null 2>&1 || rm -rf "$WT"
  admin "DROP DATABASE IF EXISTS $DB" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== Kiểm nâng cấp: $(git rev-parse --short "$REF") ($REF) → $(git rev-parse --short HEAD) (đang làm)"
admin "DROP DATABASE IF EXISTS $DB"
admin "CREATE DATABASE $DB"

echo "-- 1. Bản trước: cài thư viện, migration + dữ liệu khởi tạo"
git worktree add --detach "$WT" "$REF" >/dev/null
(
  cd "$WT"
  npm ci --no-audit --no-fund --loglevel=error >/dev/null
  npm run build -w @ketoan/contracts >/dev/null
  DATABASE_URL="$URL" SEED_TENANT_CODE=nangcap SEED_ADMIN_PASSWORD='NangCap@123' npm run db:seed >/dev/null
)
OLD="$(cd "$WT" && git ls-files db/migrations | grep -c '\.sql$' || true)"
echo "   bản trước có $OLD tệp migration"

# Dữ liệu sổ thật của bản trước (R-DIAG-7: đạt rỗng không phải đạt): bật API bản trước, nạp preset chứng từ mẫu qua chính API đó
# (đi một cửa POST /documents của bản trước) → có bút toán, sổ phụ, nhật ký để kiểm sau nâng cấp.
PORT_OLD="${PORT_OLD:-4197}"
(cd "$WT/apps/api" && exec env DATABASE_URL="$URL" PORT="$PORT_OLD" HOST=127.0.0.1 NODE_ENV=development node --import tsx src/main.ts > "$WT/api-cu.log" 2>&1) &
API_PID=$!
for _ in $(seq 1 60); do curl -sf "http://127.0.0.1:$PORT_OLD/api/v1/system/health" >/dev/null 2>&1 && break; sleep 1; done
LOADED=0
BIZCITY_PASSWORD='NangCap@123' node scripts/cai-preset.mjs thuong-mai-ban-le --api "http://127.0.0.1:$PORT_OLD" \
  --tenant nangcap --email admin@ketoan.local --skip-capabilities > "$WT/preset.log" 2>&1 || LOADED=$?
grep -E "✔ chứng từ|✘|Xong" "$WT/preset.log" || true
kill "$API_PID" >/dev/null 2>&1 || true
wait "$API_PID" 2>/dev/null || true
if [ "$LOADED" != 0 ]; then
  echo "✘ Không nạp được dữ liệu mẫu vào bản trước ($REF): bản đó không chạy được trên CSDL sạch, hoặc API cũ khác khuôn. Nhật ký API:" >&2
  grep -o '"msg":"[^"]*"' "$WT/api-cu.log" | sort | uniq -c | tail -5 >&2
  exit 1
fi

echo "-- 2. Bản này: migration lên trên dữ liệu cũ"
DATABASE_URL="$URL" npm run db:migrate -w @ketoan/api 2>&1 | grep -E "Áp|áp|mới nhất|ghi nhận|LỖI|Error" || true

echo "-- 3. Toàn vẹn sau nâng cấp (lane diagnostics)"
node tests/conformance/selfcheck.mjs --lane diagnostics --psql "$PSQL" --out "$WT/.kiem-nang-cap-output"
echo "== Kiểm nâng cấp: ĐẠT"
