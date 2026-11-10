// @bizcity-layer M data/masterdata
// [2026-11-10 09:00 PM Nguyễn Văn Thủy] PHASE-026 — thiết kế hạch toán: lý do theo màn, sơ đồ dây chuyền định khoản (đóng góp)
// [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — bỏ màn Thiết kế hạch toán (ACC92): chỉ còn lý do dùng được ở một màn (đóng góp)
/**
 * LÝ DO THEO MÀN (screen_reasons, 0095) — chỉ dùng khi bật công tắc lý do hạch toán (bizcity.posting.use_reasons).
 * Màn nhập liệu (phiếu thu / chi) hỏi lý do dùng được: đã gán thì chỉ các lý do đó; chưa gán thì lọc theo loại lý do.
 * Định khoản khai ở Tài khoản ngầm định (ACC41); không còn sơ đồ dây chuyền, đổi nhóm hàng loạt, lịch sử riêng.
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';

export interface ScreenDef {
  key: string;
  label: string;
  /** Nhóm hiện ở cột trái. */
  area: 'Bán hàng' | 'Mua hàng' | 'Kho' | 'Tiền';
  /** Loại lý do được chọn cho màn (posting_reasons.kind). */
  kinds: string[];
  /** Cờ default của lý do mặc định (khi màn chưa gán lý do). */
  defaultFlag: string;
  note: string;
}

export const SCREENS: ScreenDef[] = [
  { key: 'sale', label: 'Bán hàng', area: 'Bán hàng', kinds: ['out'], defaultFlag: 'sale', note: 'Hoá đơn bán, phiếu bán ở quầy' },
  { key: 'sale_return', label: 'Khách trả hàng', area: 'Bán hàng', kinds: ['in'], defaultFlag: 'sale_return', note: 'Hàng bán bị trả lại' },
  { key: 'purchase', label: 'Nhập mua hàng', area: 'Mua hàng', kinds: ['in'], defaultFlag: 'purchase', note: 'Phiếu nhập mua từ nhà cung cấp' },
  { key: 'purchase_return', label: 'Trả hàng nhà cung cấp', area: 'Mua hàng', kinds: ['out'], defaultFlag: 'purchase_return', note: 'Xuất trả hàng mua' },
  { key: 'transfer', label: 'Chuyển kho', area: 'Kho', kinds: ['out'], defaultFlag: 'transfer', note: 'Chuyển hàng giữa chi nhánh, kho' },
  { key: 'stock_increase', label: 'Nhập điều chỉnh kho', area: 'Kho', kinds: ['in'], defaultFlag: 'stock_adjustment:increase', note: 'Kiểm kê thừa, nhập khác' },
  { key: 'stock_decrease', label: 'Xuất điều chỉnh kho', area: 'Kho', kinds: ['out'], defaultFlag: 'stock_adjustment:decrease', note: 'Kiểm kê thiếu, xuất huỷ, xuất dùng' },
  { key: 'cash_receipt', label: 'Phiếu thu', area: 'Tiền', kinds: ['receipt'], defaultFlag: 'customer_payment', note: 'Thu tiền khách, thu khác' },
  { key: 'cash_payment', label: 'Phiếu chi', area: 'Tiền', kinds: ['payment'], defaultFlag: 'supplier_payment', note: 'Trả tiền nhà cung cấp, chi khác' },
];
export const screenOf = (key: string) => {
  const s = SCREENS.find((x) => x.key === key);
  if (!s) throw Errors.validation(`Màn ${key} không có`);
  return s;
};

type ReasonRow = { code: string; name: string; kind: string; counter_account: string | null; revenue_account: string | null; expense_account: string | null; flags: Record<string, unknown> | null; is_active: boolean };

/** Lý do dùng được ở một màn: đã gán thì chỉ các lý do đó; chưa gán thì mọi lý do đang dùng có loại hợp với màn. */
export async function screenReasons(trx: Db, tenantId: string, key: string) {
  const s = screenOf(key);
  const assigned = (await sql<ReasonRow & { is_default: boolean }>`
    SELECT r.code, r.name, r.kind, r.counter_account, r.revenue_account, r.expense_account, r.flags, r.is_active, s.is_default
      FROM screen_reasons s JOIN posting_reasons r ON r.tenant_id = s.tenant_id AND r.code = s.reason_code
     WHERE s.tenant_id = ${tenantId} AND s.screen_key = ${key} AND r.is_active ORDER BY s.sort_order, r.code`.execute(trx)).rows;
  if (assigned.length) return { screen: s.key, assigned: true, reasons: assigned.map((r) => ({ code: r.code, name: r.name, kind: r.kind, isDefault: r.is_default })) };
  const all = (await sql<ReasonRow>`SELECT code, name, kind, flags FROM posting_reasons WHERE tenant_id = ${tenantId} AND is_active AND kind = ANY(${s.kinds}) ORDER BY code`.execute(trx)).rows;
  return { screen: s.key, assigned: false, reasons: all.map((r) => ({ code: r.code, name: r.name, kind: r.kind, isDefault: r.flags?.default === s.defaultFlag })) };
}

