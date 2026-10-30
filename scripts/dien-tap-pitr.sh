#!/usr/bin/env bash
# =============================================================================
# DIỄN TẬP PITR (R-BAK-2, R-BAK-3; G3-07): chứng minh khôi phục được tới MỘT THỜI ĐIỂM và đo RTO / RPO thật — trên container
# tạm, không đụng CSDL đang chạy.
#
#   1. Dựng PostgreSQL nguồn tạm, bật lưu WAL giống infrastructure/backup/docker-compose.pitr.yml.
#   2. Chép dữ liệu thật vào (pg_dump của SRC_DB trong service db) → sổ, chứng từ, chuỗi bằng chứng có thật.
#   3. Sao lưu gốc (pg_basebackup). Ghi tiếp: dấu "trước mốc" → chụp thời điểm T → dấu "sau mốc" + một "sự cố" (xoá bảng thử).
#   4. Bỏ máy nguồn (dừng container) — coi như mất máy.
#   5. Khôi phục bản gốc + WAL tới T vào container mới; đo RTO (từ lúc bắt đầu khôi phục tới lúc nhận kết nối ghi).
#   6. Kiểm: có dấu "trước mốc", KHÔNG có dấu "sau mốc", bảng bị xoá còn nguyên; số bút toán = lúc T; lane diagnostics của bộ kiểm
#      chuẩn (Nợ = Có, số dư ngày, đảo một lần, mồ côi, chuỗi bằng chứng, trigger bảo vệ sổ) trên bản khôi phục.
#   7. Ghi kết quả vào backups/dien-tap-pitr.log; dọn container, ổ tạm.
#
#   ./scripts/dien-tap-pitr.sh                 dữ liệu từ CSDL ketoan
#   SRC_DB=ketoan_test ./scripts/dien-tap-pitr.sh
# Mã thoát 0 = ĐẠT. Biên bản: chép phần "KẾT QUẢ" vào docs/audits/PITR-<ngày>.md (G3-07).
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1

SRC_DB="${SRC_DB:-ketoan}"
IMG="${PITR_IMAGE:-postgres:16-alpine}"
P="ketoan-pitr-$(date +%s)"
VOL="$P-backup"
DST_VOL="$P-dst"
SRC="$P-src"
DST="$P-dst"
mkdir -p backups
LOG="backups/dien-tap-pitr.log"

cleanup() {
  docker rm -f "$SRC" "$DST" >/dev/null 2>&1 || true
  docker volume rm "$VOL" "$DST_VOL" >/dev/null 2>&1 || true
}
trap cleanup EXIT
q() { docker exec -i "$1" psql -U ketoan -d ketoan -v ON_ERROR_STOP=1 -Atq "${@:2}"; }
ready() { for _ in $(seq 1 120); do docker exec "$1" pg_isready -U ketoan -d ketoan >/dev/null 2>&1 && return 0; sleep 1; done; return 1; }

echo "== 1. Nguồn tạm có lưu WAL"
docker volume create "$VOL" >/dev/null
docker run --rm -v "$VOL:/backup" "$IMG" sh -c 'mkdir -p /backup/wal /backup/base && chown -R postgres:postgres /backup && chmod 700 /backup/wal /backup/base'
docker run -d --name "$SRC" -e POSTGRES_USER=ketoan -e POSTGRES_PASSWORD=ketoan -e POSTGRES_DB=ketoan -e TZ=Asia/Ho_Chi_Minh \
  -v "$VOL:/backup" "$IMG" postgres -c wal_level=replica -c archive_mode=on \
  -c 'archive_command=test ! -f /backup/wal/%f && cp %p /backup/wal/%f' -c archive_timeout=60 -c timezone=Asia/Ho_Chi_Minh >/dev/null
ready "$SRC"
sleep 2; ready "$SRC" # image khởi động lại một lần sau initdb

echo "== 2. Chép dữ liệu $SRC_DB vào nguồn tạm"
docker compose exec -T db pg_dump -U ketoan -d "$SRC_DB" --no-owner --no-privileges | q "$SRC" >/dev/null
LEDGER_SRC="$(q "$SRC" -c 'SELECT count(*) FROM ledger_entries')"
echo "   bút toán: $LEDGER_SRC; dung lượng: $(q "$SRC" -c "SELECT pg_size_pretty(pg_database_size('ketoan'))")"

echo "== 3. Sao lưu gốc, ghi tiếp, chụp mốc T"
T0=$(date +%s)
docker exec -u postgres "$SRC" pg_basebackup -U ketoan -D /backup/base/b1 -Ft -z -X stream -c fast
BASE_SEC=$(( $(date +%s) - T0 ))
BASE_SIZE="$(docker exec "$SRC" du -sh /backup/base/b1 | cut -f1)"
q "$SRC" -c "CREATE TABLE pitr_probe (note text PRIMARY KEY, at timestamptz DEFAULT clock_timestamp()); CREATE TABLE pitr_victim AS SELECT g AS n FROM generate_series(1, 1000) g;"
q "$SRC" -c "INSERT INTO pitr_probe(note) VALUES ('truoc-moc')"
sleep 2
TARGET="$(q "$SRC" -c 'SELECT clock_timestamp()::text')"
LEDGER_T="$(q "$SRC" -c 'SELECT count(*) FROM ledger_entries')"
sleep 2
q "$SRC" -c "INSERT INTO pitr_probe(note) VALUES ('sau-moc'); DROP TABLE pitr_victim;"
q "$SRC" -c 'SELECT pg_switch_wal()' >/dev/null
for _ in $(seq 1 60); do
  [ "$(q "$SRC" -c "SELECT (last_archived_time > now() - interval '30 seconds')::int FROM pg_stat_archiver")" = "1" ] && break; sleep 1
done
ARCHIVED="$(q "$SRC" -c "SELECT archived_count || ' đoạn WAL, lỗi ' || failed_count FROM pg_stat_archiver")"
echo "   mốc T = $TARGET; bản gốc $BASE_SIZE ($BASE_SEC giây); WAL: $ARCHIVED"

echo "== 4. Mất máy nguồn"
docker stop "$SRC" >/dev/null

echo "== 5. Khôi phục tới T"
R0=$(date +%s)
docker volume create "$DST_VOL" >/dev/null
docker run --rm -v "$VOL:/backup" -v "$DST_VOL:/var/lib/postgresql/data" -e TARGET="$TARGET" "$IMG" sh -c '
  set -e; D=/var/lib/postgresql/data
  tar xzf /backup/base/b1/base.tar.gz -C "$D"; mkdir -p "$D/pg_wal"; tar xzf /backup/base/b1/pg_wal.tar.gz -C "$D/pg_wal"
  { echo "restore_command = '"'"'cp /backup/wal/%f %p'"'"'"; echo "recovery_target_time = '"'"'$TARGET'"'"'"; echo "recovery_target_action = '"'"'promote'"'"'"; } >> "$D/postgresql.auto.conf"
  touch "$D/recovery.signal"; chown -R postgres:postgres "$D"; chmod 700 "$D"'
docker run -d --name "$DST" -e TZ=Asia/Ho_Chi_Minh -v "$DST_VOL:/var/lib/postgresql/data" -v "$VOL:/backup" "$IMG" >/dev/null
ready "$DST"
for _ in $(seq 1 120); do [ "$(q "$DST" -c 'SELECT pg_is_in_recovery()')" = "f" ] && break; sleep 1; done
RTO=$(( $(date +%s) - R0 ))

echo "== 6. Kiểm bản khôi phục"
FAIL=0
check() { if [ "$2" = "$3" ]; then echo "   ĐẠT  $1"; else echo "   SAI  $1 (mong '$3', có '$2')"; FAIL=1; fi; }
check "còn dấu trước mốc" "$(q "$DST" -c "SELECT count(*) FROM pitr_probe WHERE note = 'truoc-moc'")" "1"
check "không có dấu sau mốc" "$(q "$DST" -c "SELECT count(*) FROM pitr_probe WHERE note = 'sau-moc'")" "0"
check "bảng bị xoá sau mốc còn nguyên" "$(q "$DST" -c 'SELECT count(*) FROM pitr_victim')" "1000"
check "số bút toán = lúc T" "$(q "$DST" -c 'SELECT count(*) FROM ledger_entries')" "$LEDGER_T"
check "nhận ghi (đã thôi phục hồi)" "$(q "$DST" -c 'SELECT pg_is_in_recovery()')" "f"
DIAG="$(BIZCITY_PSQL="docker exec -i $DST psql -U ketoan -d ketoan" node tests/conformance/selfcheck.mjs 2>&1 \
  | grep -E ' DG-(LEDGER-[1-4]|EVD-1|DB-2|EVENT-1) ' || true)"
[ -n "$DIAG" ] || { echo "   SAI  không chạy được lane diagnostics trên bản khôi phục"; FAIL=1; }
echo "$DIAG"
echo "$DIAG" | grep -qE '✘ DG-(LEDGER|EVD|DB-2)' && { echo "   SAI  lane diagnostics trên bản khôi phục"; FAIL=1; }

RESULT=$([ $FAIL = 0 ] && echo ĐẠT || echo "KHÔNG ĐẠT")
echo
echo "== KẾT QUẢ: $RESULT"
echo "   nguồn: $SRC_DB, $LEDGER_SRC bút toán; bản gốc $BASE_SIZE trong $BASE_SEC giây"
echo "   RTO đo được: $RTO giây (khôi phục bản gốc + WAL tới T, tới lúc nhận ghi) — mục tiêu R-BAK-2 ≤ 4 giờ"
echo "   RPO: ≤ archive_timeout = 60 giây (WAL lưu mỗi đoạn đầy hoặc mỗi 60 giây) — mục tiêu ≤ 15 phút"
echo "$(date '+%F %T') $RESULT src=$SRC_DB ledger=$LEDGER_SRC base=$BASE_SIZE/${BASE_SEC}s rto=${RTO}s target=$TARGET" >> "$LOG"
[ $FAIL = 0 ]
