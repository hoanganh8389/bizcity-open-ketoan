#!/usr/bin/env bash
# [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
# =============================================================================
# Xoá SẠCH chứng từ và sổ sách của MỘT đơn vị để kéo lại từ đầu — dùng cho cả sổ nội bộ lẫn sổ thuế.
#
#   ./scripts/xoa-chung-tu.sh            # đơn vị mặc định: WP_SSO_TENANT trong .env (thường là tgs)
#   ./scripts/xoa-chung-tu.sh demo       # chỉ định mã đơn vị
#
# Xoá (chỉ của đơn vị đó): chứng từ (kể cả chờ định khoản, phiên bản, nhật ký định khoản, phiếu lập tay: phiếu thu /
#      chi / kế toán, số dư đầu…), bút toán, sổ hoá đơn, thẻ kho, công nợ và đối trừ, giá vốn đã tính, yêu cầu thanh
#      toán, chữ ký trên phiếu, khấu hao đã ghi, tờ khai đã lưu, khoá sổ kỳ, số chứng từ / số bút toán đang chạy, mốc
#      kéo chứng từ của kết nối.
# Giữ: danh mục (tài khoản, đối tượng, mặt hàng, chi nhánh, kho, lý do, hình thức thanh toán, loại thuế, tài sản…),
#      kết nối, người dùng, khoá API, cấu hình đơn vị, mẫu phiếu. Đơn vị khác (demo, đơn vị thử…) không bị đụng.
# Trước khi xoá luôn sao lưu (./scripts/sao-luu.sh) — khôi phục theo hướng dẫn trong tệp đó nếu cần.
# Sau khi xoá: vào Định khoản tự động (ACC14) bấm Kéo chứng từ để lấy lại phiếu từ trang quản trị.
# =============================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || { echo "Chưa có tệp .env" >&2; exit 1; }
envval() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '[:space:]"' || true; }
MODE="$(envval BOOK_MODE)"; MODE="${MODE:-internal}"
TENANT="${1:-$(envval WP_SSO_TENANT)}"
[ -n "$TENANT" ] || { echo "Chưa biết đơn vị: truyền mã đơn vị, vd. ./scripts/xoa-chung-tu.sh tgs" >&2; exit 1; }

# psql chỉ thay biến :'tenant' trong lệnh đọc từ stdin (không thay trong -c).
PSQL=(docker compose exec -T db psql -U ketoan -d ketoan -v ON_ERROR_STOP=1 -v tenant="$TENANT")
echo "Bản cài: $(pwd)  (sổ: $MODE, dự án Docker: $(docker compose config 2>/dev/null | grep -E '^name:' | cut -d' ' -f2))"
FOUND="$(printf "SELECT COUNT(*) FROM tenants WHERE code = :'tenant';\n" | "${PSQL[@]}" -At)"
[ "$FOUND" = "1" ] || { echo "Không có đơn vị mã \"$TENANT\"." >&2; exit 1; }
printf "SELECT 'Đơn vị ' || t.code || ' — chứng từ: ' || COUNT(e.id) || ' (lập tay: ' || COUNT(e.id) FILTER (WHERE e.source_system = 'manual') || ')'
          || ' · bút toán: ' || (SELECT COUNT(*) FROM ledger_entries WHERE tenant_id = t.id)
          || ' · dòng thẻ kho: ' || (SELECT COUNT(*) FROM inventory_movements WHERE tenant_id = t.id)
     FROM tenants t LEFT JOIN accounting_events e ON e.tenant_id = t.id WHERE t.code = :'tenant' GROUP BY t.id, t.code;\n" | "${PSQL[@]}" -At
echo "Lưu ý: phiếu LẬP TAY trong phần mềm kế toán (phiếu thu / chi / kế toán, số dư đầu…) cũng bị xoá."
PHRASE="XOA SO $TENANT"
read -r -p "Gõ $PHRASE để xoá sạch các số liệu trên: " OK
[ "$OK" = "$PHRASE" ] || { echo "Đã huỷ, không xoá gì."; exit 1; }

echo "== 1. Sao lưu trước khi xoá"
./scripts/sao-luu.sh

echo "== 2. Dừng API (không cho ghi trong lúc xoá)"
docker compose stop api

echo "== 3. Xoá chứng từ và sổ của đơn vị $TENANT"
"${PSQL[@]}" <<'SQL'
BEGIN;
-- Sổ cái chỉ được thêm (trigger chặn xoá / sửa). Riêng lệnh xoá sạch này: tắt trigger trong đúng giao dịch này
-- (khoá ngoại cũng không tự xoá theo → xoá lần lượt từng bảng, bảng con trước).
SET LOCAL session_replication_role = replica;
CREATE TEMP TABLE _t ON COMMIT DROP AS SELECT id FROM tenants WHERE code = :'tenant';
DELETE FROM debt_allocations            WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM debt_items                  WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM ledger_links                WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM ledger_lines                WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM ledger_entries              WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM ledger_balances_daily       WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM ledger_entry_sequences      WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM tax_invoice_lines           WHERE tax_invoice_id IN (SELECT id FROM tax_invoices WHERE tenant_id IN (SELECT id FROM _t));
DELETE FROM tax_invoices                WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM inventory_movements         WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM inventory_costs             WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM posting_log                 WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM payment_requests            WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM document_signatures         WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM reference_documents         WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM tax_info_patches            WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM cash_transfer_confirmations WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM asset_depreciations         WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM voucher_recurrence_runs     WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM accounting_event_versions   WHERE event_id IN (SELECT id FROM accounting_events WHERE tenant_id IN (SELECT id FROM _t));
DELETE FROM accounting_events           WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM document_sequences          WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM vat_returns                 WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM cit_returns                 WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM period_lock_events          WHERE tenant_id IN (SELECT id FROM _t);
DELETE FROM period_locks                WHERE tenant_id IN (SELECT id FROM _t);
UPDATE tenants SET settings = settings - 'connectionPulls' WHERE id IN (SELECT id FROM _t) AND settings ? 'connectionPulls';
SELECT 'Còn lại — chứng từ: ' || (SELECT COUNT(*) FROM accounting_events WHERE tenant_id IN (SELECT id FROM _t))
       || ', bút toán: ' || (SELECT COUNT(*) FROM ledger_entries WHERE tenant_id IN (SELECT id FROM _t));
COMMIT;
SQL

echo "== 4. Khởi động lại API"
docker compose start api
if [ "$MODE" = "tax" ]; then
  echo "Xong. Vào ACC14 bấm Kéo chứng từ: sổ thuế chỉ nhận phiếu bán / hoàn có số hoá đơn."
else
  echo "Xong. Vào ACC14 bấm Kéo chứng từ để lấy lại phiếu từ trang quản trị (phiếu mới duyệt tự gửi sang như thường)."
fi
