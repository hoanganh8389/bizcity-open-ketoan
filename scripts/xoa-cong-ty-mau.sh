#!/usr/bin/env bash
# [2026-11-17 09:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-7 B5b (ADR-0034, RULE-LEDGER E3): xoá Công ty Mẫu — chỉ đơn vị is_sample, sao lưu + câu xác nhận trước, ghi backups/xoa-cong-ty-mau.log
# =============================================================================
# Xoá HẲN Công ty Mẫu (đơn vị tenants.is_sample, dữ liệu hư cấu) — cả đơn vị: chứng từ, sổ, danh mục, người dùng, cấu hình.
#
#   ./scripts/xoa-cong-ty-mau.sh          # mã mặc định: SAMPLE_TENANT_CODE trong .env, không có thì "mau"
#   ./scripts/xoa-cong-ty-mau.sh mau      # chỉ định mã
#
# Chỉ chạy được trên đơn vị is_sample: SQL tự kiểm trong cùng giao dịch, đơn vị thật → báo lỗi, không xoá gì (ADR-0034).
# Trước khi xoá luôn sao lưu (./scripts/sao-luu.sh). Sau khi xoá: bản cài vẫn chạy; bật BIZCITY_SAMPLE_ON_DEMAND=1 để
# tạo lại Công ty Mẫu ở Thiết lập nhanh (TI15).
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Chưa có tệp .env" >&2; exit 1; }
envval() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '[:space:]"' || true; }
CODE="${1:-$(envval SAMPLE_TENANT_CODE)}"; CODE="${CODE:-mau}"
[[ "$CODE" =~ ^[A-Za-z0-9_-]{1,64}$ ]] || { echo "Mã đơn vị không hợp lệ: $CODE" >&2; exit 1; }

PSQL=(docker compose exec -T db psql -U ketoan -d ketoan -v ON_ERROR_STOP=1 -v tenant="$CODE")
INFO="$(printf "SELECT t.is_sample || '|' || (SELECT COUNT(*) FROM accounting_events WHERE tenant_id = t.id) || '|' || (SELECT COUNT(*) FROM ledger_entries WHERE tenant_id = t.id) || '|' || (SELECT COUNT(*) FROM inventory_movements WHERE tenant_id = t.id) FROM tenants t WHERE t.code = :'tenant';\n" | "${PSQL[@]}" -At)"
[ -n "$INFO" ] || { echo "Không có đơn vị mã \"$CODE\"." >&2; exit 1; }
IFS='|' read -r SAMPLE EV LE IM <<< "$INFO"
[ "$SAMPLE" = "t" ] || { echo "Đơn vị \"$CODE\" KHÔNG phải Công ty Mẫu (is_sample) — script này không xoá đơn vị thật." >&2; exit 1; }
echo "Công ty Mẫu $CODE — chứng từ: $EV · bút toán: $LE · dòng thẻ kho: $IM. Sẽ xoá CẢ đơn vị (dữ liệu hư cấu)."
PHRASE="XOA CONG TY MAU $CODE"
read -r -p "Gõ $PHRASE để xoá: " OK
[ "$OK" = "$PHRASE" ] || { echo "Đã huỷ, không xoá gì."; exit 1; }

echo "== 1. Sao lưu trước khi xoá"
./scripts/sao-luu.sh
BACKUP="$(ls -t backups/*.sql.gz 2>/dev/null | head -1 || true)"

echo "== 2. Xoá Công ty Mẫu $CODE (một giao dịch; tự kiểm is_sample, đếm lại sau xoá)"
OUT="$("${PSQL[@]}" < scripts/xoa-cong-ty-mau.sql 2>&1)" || { echo "$OUT" >&2; echo "Lỗi — giao dịch đã huỷ, không xoá gì." >&2; exit 1; }
echo "$OUT" | grep -E "dòng|Đã xoá" || true

mkdir -p backups
printf '%s\txoa-cong-ty-mau\t%s\tchung-tu=%s but-toan=%s the-kho=%s\tsao-luu=%s\n' "$(date -Iseconds)" "$CODE" "$EV" "$LE" "$IM" "${BACKUP:-?}" >> backups/xoa-cong-ty-mau.log
echo "✓ Đã xoá Công ty Mẫu $CODE. Bằng chứng: backups/xoa-cong-ty-mau.log, bản sao lưu ${BACKUP:-?}"
