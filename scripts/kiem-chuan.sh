#!/usr/bin/env bash
# =============================================================================
# Kiểm chuẩn framework bằng grep (không cần CSDL) — bước "guard" của CI, chạy được trên máy dev.
#
#   bash scripts/kiem-chuan.sh
#
# Mỗi quy tắc in tệp:dòng vi phạm. Có vi phạm → thoát 1. Luật: docs/00-CANON.md, chi tiết docs/ops/CI-CD.md §2.
# Danh sách nợ (DEBT_*) là chỗ đang được tạm cho phép; xoá phần tử khi đã sửa để quy tắc tự chặt lại.
# =============================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

SRC=apps/api/src
FAIL=0

# Nợ R-LEDGER-4 / audit A-01 (vouchers, closing, assets, costing gọi thẳng ledgerService): hết 2026-10-30, PHASE-004 — các
# dịch vụ đó ghi sổ qua eventStore (modules/documents/event-store.ts). Không còn danh sách miễn trừ.
# Nợ R-DB-3 / audit A-03: đã sửa 2026-10-30 (0028_thue_kkkn → 0031). Để trống: mọi trùng số đều chặn.
DEBT_MIGRATION_DUP=''
# Ngoại lệ E2 (R-LEDGER): định khoản lại cập nhật thông tin đầu bút toán tại chỗ.
E2_HEADER_UPDATE="^$SRC/modules/posting/posting.service.ts:[0-9]+:.*updateTable\('ledger_entries'\)"

rule() { echo; echo "── $1"; }
# check <tên> <kết quả grep đã lọc>: rỗng = đạt.
check() { if [ -n "$1" ]; then echo "$1"; FAIL=1; else echo "  ok${2:+ $2}"; fi; }
warn() { [ -n "$2" ] && { echo "  (cảnh báo) $1"; echo "$2"; }; }

rule "R-LEDGER-4: chỉ modules/ledger ghi bảng ledger_* (trừ E2)"
check "$(grep -rnE "(insertInto|updateTable|deleteFrom)\('ledger_|(INSERT INTO|UPDATE|DELETE FROM) ledger_" "$SRC" --include=*.ts \
  | grep -v "^$SRC/modules/ledger/" | grep -vE "$E2_HEADER_UPDATE")"

rule "R-EVENT-2: chỉ modules/documents thêm accounting_events / accounting_event_versions / posting_log"
check "$(grep -rnE "insertInto\('(accounting_events|accounting_event_versions|posting_log)'\)|INSERT INTO (accounting_events|accounting_event_versions|posting_log)\b" "$SRC" --include=*.ts \
  | grep -v "^$SRC/modules/documents/")"
warn "cập nhật accounting_events ngoài modules/documents (nên qua documentRepository):" \
  "$(grep -rnE "updateTable\('accounting_events'\)" "$SRC" --include=*.ts | grep -v "^$SRC/modules/documents/")"

rule "R-LEDGER-4: chỉ posting / documents / ledger gọi ledgerService (nơi khác đi postDocumentIn hoặc eventStore)"
check "$(grep -rnE "ledgerService\.[A-Za-z]+\(" "$SRC" --include=*.ts \
  | grep -vE "^$SRC/modules/(ledger|posting|documents)/")"

rule "R-LEDGER E1–E4: cờ thoát trigger chỉ ở chỗ được phép"
check "$( {
  grep -rnE "cost_overwrite" apps packages scripts --include=*.ts --include=*.mjs --include=*.sh \
    | grep -vE "^($SRC/modules/ledger/|apps/api/test/|scripts/kiem-chuan.sh)"
  grep -rnE "allow_ledger_purge" apps packages scripts --include=*.ts --include=*.mjs --include=*.sh \
    | grep -vE "^(apps/api/test/|scripts/kiem-chuan.sh)"
  grep -rnE "session_replication_role" apps packages scripts --include=*.ts --include=*.mjs --include=*.sh \
    | grep -vE "^(scripts/xoa-chung-tu.sh|scripts/kiem-chuan.sh|apps/api/test/)"
} )"

rule "R-DB-3: số migration không trùng"
BAD=""
for d in $(ls db/migrations | grep -E '^[0-9]{4}_' | cut -c1-4 | sort | uniq -d); do
  files=$(ls db/migrations | grep "^$d" | tr '\n' ' ')
  if [[ " $DEBT_MIGRATION_DUP " == *" $d "* ]]; then echo "  (cảnh báo) trùng số $d — nợ A-03: $files"
  else BAD+="trùng số migration $d: $files"$'\n'; fi
done
check "${BAD%$'\n'}"

rule "R-QG-8: không còn test .only / .skip"
check "$(grep -rnE "\b(it|describe|test)\.(only|skip)\(" apps/api/test --include=*.ts)"

echo
if [ "$FAIL" = 0 ]; then echo "KẾT QUẢ: ĐẠT"; else echo "KẾT QUẢ: KHÔNG ĐẠT"; fi
exit "$FAIL"
