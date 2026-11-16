#!/usr/bin/env bash
# [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
# [2026-11-13 08:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-9: kiểm bản sao lưu vừa tạo (hỏng thì dừng), in sắp đổi gì (commit, migration, db/seeds, SEEDS_DIR, bộ giả lập), hỏi xác nhận (--yes), lỗi thì in lệnh lùi
# [2026-11-14 01:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-11: SEEDS_DIR đặt mà thư mục không có / thiếu tệp so với db/seeds của bản mới → dừng trước khi kéo mã
# =============================================================================
# Cập nhật phần mềm trên máy chủ: sao lưu → kiểm bản sao lưu → xem sắp đổi gì → xác nhận → lấy code mới → dựng lại → kiểm tra.
#
#   ./scripts/cap-nhat.sh          hỏi xác nhận trước khi lấy code mới
#   ./scripts/cap-nhat.sh --yes    không hỏi (bắt buộc khi chạy không có bàn phím: cron, CI, ssh không tty)
#
# Cơ sở dữ liệu nâng cấp bằng job db-migrate (chạy các file db/migrations chưa áp + seed) TRƯỚC khi API khởi động.
# Job lỗi thì API không khởi động: script in đúng lệnh lùi về commit cũ và khôi phục bản sao lưu vừa tạo.
# Sổ tay: docs/ops/SAO-LUU-KHOI-PHUC.md
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

YES=0
for a in "$@"; do
  case "$a" in
    --yes|-y) YES=1 ;;
    *) echo "Tham số lạ: $a (dùng: ./scripts/cap-nhat.sh [--yes])" >&2; exit 2 ;;
  esac
done

[ -f .env ] || { echo "Chưa có tệp .env (sao chép từ .env.example rồi sửa)" >&2; exit 1; }

echo "== 1. Sao lưu cơ sở dữ liệu"
BACKUP_FILE=""
if docker compose ps --status running db 2>/dev/null | grep -q db; then
  ./scripts/sao-luu.sh
  BACKUP_FILE="$(ls -1t "${BACKUP_DIR:-./backups}"/ketoan-*.sql.gz 2>/dev/null | head -1 || true)"
  [ -n "$BACKUP_FILE" ] || { echo "LỖI: không tìm thấy bản sao lưu vừa tạo — DỪNG, chưa đổi gì." >&2; exit 1; }
  echo "   Kiểm bản sao lưu vừa tạo:"
  if ! ./scripts/sao-luu.sh --kiem "$BACKUP_FILE"; then
    echo "LỖI: bản sao lưu $BACKUP_FILE không dùng được — DỪNG, chưa đổi gì. Sửa sao lưu trước khi nâng cấp." >&2
    exit 1
  fi
else
  echo "   (cơ sở dữ liệu chưa chạy: lần cài đầu, bỏ qua sao lưu)"
fi

echo "== 2. Sắp đổi gì"
git fetch --quiet
UPSTREAM="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
[ -n "$UPSTREAM" ] || { echo "LỖI: nhánh hiện tại chưa theo dõi nhánh nào trên máy chủ git (git branch -u origin/main)" >&2; exit 1; }
INCOMING="$(git rev-list --count 'HEAD..@{u}')"
echo "   Nhánh $UPSTREAM: $INCOMING commit mới"
NEW_MIGRATIONS="$(git diff --name-only --diff-filter=A HEAD '@{u}' -- db/migrations)"
if [ -n "$NEW_MIGRATIONS" ]; then
  echo "   Migration mới ($(printf '%s\n' "$NEW_MIGRATIONS" | wc -l | tr -d ' ')) — db-migrate sẽ áp vào CSDL, không tự lùi được (lùi = khôi phục bản sao lưu):"
  printf '      %s\n' $NEW_MIGRATIONS
else
  echo "   Migration mới: không có"
fi
SEED_CHANGES="$(git diff --name-status HEAD '@{u}' -- db/seeds)"
if [ -n "$SEED_CHANGES" ]; then
  echo "   Tệp db/seeds đổi:"
  printf '%s\n' "$SEED_CHANGES" | sed 's/^/      /'
else
  echo "   Tệp db/seeds đổi: không có"
fi
SEEDS_DIR_VAL="$(grep -E '^SEEDS_DIR=.+' .env | tail -1 | cut -d= -f2- || true)"
if [ -n "$SEEDS_DIR_VAL" ]; then
  echo "   SEEDS_DIR trong .env: $SEEDS_DIR_VAL (dữ liệu gốc của công ty, ngoài repo; compose gắn chỉ đọc vào api / db-migrate)"
  # [2026-11-14 01:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-11: thư mục phải có và đủ tệp so với db/seeds của bản mới — Docker không được tự tạo thư mục rỗng, không lấy bù tệp giả lập
  if [ ! -d "$SEEDS_DIR_VAL" ]; then
    echo "LỖI: SEEDS_DIR=$SEEDS_DIR_VAL không phải thư mục trên máy này — DỪNG, chưa đổi gì (Docker sẽ tạo thư mục rỗng thay vào)." >&2
    exit 1
  fi
  THIEU=""
  for f in $(git ls-tree -r --name-only '@{u}' db/seeds/ | grep -vE '(^|/)README\.md$' || true); do
    rel="${f#db/seeds/}"
    [ -f "$SEEDS_DIR_VAL/$rel" ] || THIEU="$THIEU $rel"
  done
  if [ -n "$THIEU" ]; then
    echo "LỖI: thư mục SEEDS_DIR thiếu $(echo $THIEU | wc -w | tr -d ' ') tệp có trong db/seeds của bản mới:" >&2
    printf '      %s\n' $THIEU >&2
    echo "      Chép các tệp đó từ db/seeds (bản mới) rồi thay bằng dữ liệu của công ty nếu cần — DỪNG, chưa đổi gì." >&2
    exit 1
  fi
  echo "   Thư mục SEEDS_DIR đủ tệp so với db/seeds của bản mới."
else
  echo "   SEEDS_DIR trong .env: chưa đặt (dữ liệu gốc đọc từ db/seeds của repo)"
  # Bộ db/seeds của bản sắp lấy về có tệp giả lập (dòng đầu "_nguon": "gia-lap", S030-53) không?
  GIA_LAP=""
  for f in $(git ls-tree --name-only '@{u}' db/seeds/ | grep '\.jsonl$' || true); do
    if git show "@{u}:$f" 2>/dev/null | head -1 | grep -q '"_nguon": *"gia-lap"'; then GIA_LAP="$GIA_LAP $(basename "$f")"; fi
  done
  if [ -n "$GIA_LAP" ]; then
    echo "   CẢNH BÁO: db/seeds là bộ dữ liệu mẫu GIẢ LẬP ($(echo $GIA_LAP | wc -w | tr -d ' ') tệp:$GIA_LAP)."
    echo "             Bấm \"Quay về dữ liệu gốc\" (TI08) khi chưa đặt SEEDS_DIR sẽ nạp danh mục giả lập (đối tượng, nhân viên,"
    echo "             ngân hàng, mặt hàng…) vào đơn vị thật. Đặt SEEDS_DIR tới bộ danh mục của công ty — xem db/seeds/README.md."
  fi
fi

if [ "$YES" != 1 ]; then
  if [ -t 0 ]; then
    read -r -p "Tiếp tục nâng cấp? (c/K) " ANS
    case "$ANS" in c|C|co|có|y|Y|yes) ;; *) echo "Đã huỷ — chưa đổi gì (bản sao lưu vẫn giữ: ${BACKUP_FILE:-không có})."; exit 0 ;; esac
  else
    echo "Không có bàn phím để xác nhận (chạy từ cron / ống dẫn): thêm --yes nếu đã xem phần \"Sắp đổi gì\" ở trên. Chưa đổi gì." >&2
    exit 1
  fi
fi

OLD_COMMIT="$(git rev-parse HEAD)"
# In đúng lệnh lùi về bản trước khi nâng cấp (commit cũ + bản sao lưu vừa tạo).
in_lenh_lui() {
  echo "" >&2
  echo "== LỆNH LÙI về bản trước khi nâng cấp (chạy lần lượt từ $(pwd)):" >&2
  echo "   git checkout $OLD_COMMIT" >&2
  if [ -n "$BACKUP_FILE" ]; then
    echo "   docker compose stop api" >&2
    echo "   gunzip -c $BACKUP_FILE | docker compose exec -T db psql -U ketoan -d ketoan    # GHI ĐÈ CSDL bằng bản vừa sao lưu" >&2
  else
    echo "   (không có bản sao lưu: lần cài đầu)" >&2
  fi
  echo "   docker compose up -d --build" >&2
  echo "   Sau khi sửa xong: git checkout <nhánh> && ./scripts/cap-nhat.sh. Sổ tay: docs/ops/SAO-LUU-KHOI-PHUC.md" >&2
}

echo "== 3. Lấy code mới"
BEFORE="$(git rev-parse --short HEAD)"
if ! git pull --ff-only; then
  echo "LỖI: git pull --ff-only không chạy được (máy chủ có sửa tay hoặc lệch nhánh) — chưa đổi gì." >&2
  exit 1
fi
echo "   $BEFORE → $(git rev-parse --short HEAD)"

# [2026-11-01 10:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — P0-3 (AUDIT-2026-11-01): bản cài cũ chưa có DB_APP_PASSWORD thì thêm (sau git pull, trước compose) — API chuyển sang ketoan_app
# Từ P0-3 API luôn chạy bằng vai trò thường ketoan_app; docker-compose.yml dừng nếu thiếu DB_APP_PASSWORD. Thêm một lần, không ghi đè.
if ! grep -q '^DB_APP_PASSWORD=..*' .env; then
  sed -i.bak '/^DB_APP_PASSWORD=$/d' .env && rm -f .env.bak
  printf 'DB_APP_PASSWORD=%s\n' "$(head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | cut -c1-32)" >> .env
  echo "   Thêm DB_APP_PASSWORD vào .env — API chạy bằng vai trò ketoan_app (không superuser, RLS có hiệu lực)"
fi

echo "== 4. Dựng lại, nâng cấp cơ sở dữ liệu (db-migrate), khởi động"
if ! docker compose up -d --build; then
  echo "LỖI khi khởi động. Nhật ký nâng cấp cơ sở dữ liệu (db-migrate):" >&2
  docker compose logs --tail 60 db-migrate >&2 || true
  in_lenh_lui
  exit 1
fi
docker compose logs --since 10m db-migrate 2>/dev/null | grep -iE "migration|mới nhất|lỗi" || true

echo "== 5. Chờ máy chủ API lên khoẻ"
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
in_lenh_lui
exit 1
