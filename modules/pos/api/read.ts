/**
 * Đọc danh mục kế toán qua khung nhìn bizcity_read.* (khai ở data.reads của manifest) — chạy trong ctx.data.module, RLS lọc
 * theo đơn vị nên không tự thêm WHERE tenant_id.
 */
import { Errors, sql, type ActionContext } from '@bizcity/module-sdk';
import type { BranchRow, CatalogItem, PaymentMethodRow } from './domain/order.js';

type Tx = Parameters<Parameters<ActionContext['data']['module']>[0]>[0];

/** Chi nhánh bán: theo mã máy gửi; không gửi thì đơn vị chỉ có một chi nhánh đang dùng mới tự chọn được. */
export async function resolveBranch(tx: Tx, code: string | undefined): Promise<BranchRow> {
  const rows = (await sql<{ code: string; name: string; tax_code: string | null; address: string | null }>`
    SELECT code, name, tax_code, address FROM bizcity_read.branches
     WHERE is_active IS NOT FALSE ${code ? sql`AND code = ${code}` : sql``}
     ORDER BY code LIMIT 2`.execute(tx)).rows;
  if (code && !rows.length) throw Errors.validation(`Không có chi nhánh ${code} trong danh mục kế toán`, { reason: 'POS_UNKNOWN_BRANCH', branchCode: code });
  if (!rows.length) throw Errors.validation('Đơn vị chưa khai chi nhánh', { reason: 'POS_UNKNOWN_BRANCH' });
  if (!code && rows.length > 1) throw Errors.validation('Đơn vị có nhiều chi nhánh — máy bán phải gửi branchCode', { reason: 'POS_BRANCH_REQUIRED' });
  const b = rows[0]!;
  return { code: b.code, name: b.name, taxCode: b.tax_code ?? '', address: b.address ?? '' };
}

export async function activePaymentMethods(tx: Tx): Promise<PaymentMethodRow[]> {
  return (await sql<PaymentMethodRow>`
    SELECT code, name FROM bizcity_read.payment_methods WHERE is_active IS NOT FALSE ORDER BY sort_order NULLS LAST, code`.execute(tx)).rows;
}

/**
 * Mặt hàng theo mã + thuế suất của mã thuế đầu ra (null khi chưa khai / mã thuế không có trong danh mục), kèm định danh
 * bất biến và hai ô Biến thể / Gửi lên thuế (khung nhìn 0102). Không đọc chữ cuối mã.
 */
export async function catalogFor(tx: Tx, skus: readonly string[]): Promise<Map<string, CatalogItem>> {
  const list = [...new Set(skus)];
  if (!list.length) return new Map();
  const rows = (await sql<{ sku: string; name: string; unit: string | null; tax_out_code: string | null; rate: string | number | null; item_id: string | null; variant_code: string | null; send_to_tax: boolean | null }>`
    SELECT p.sku, p.name, p.unit, p.tax_out_code, t.rate, p.item_id, p.variant_code, p.send_to_tax
      FROM bizcity_read.products p
      LEFT JOIN bizcity_read.tax_codes t ON t.code = p.tax_out_code AND t.is_active IS NOT FALSE
     WHERE p.sku IN (${sql.join(list)}) AND p.is_active IS NOT FALSE AND p.no_sale IS NOT TRUE`.execute(tx)).rows;
  return new Map(rows.map((r) => [r.sku, {
    sku: r.sku,
    name: r.name,
    unit: r.unit ?? '',
    taxCode: r.tax_out_code && r.rate !== null ? r.tax_out_code : null,
    taxRate: r.tax_out_code && r.rate !== null ? Number(r.rate) : null,
    itemId: r.item_id,
    variant: r.variant_code ?? 'normal',
    // Nội bộ luôn không gửi thuế (CSDL đã ép ở 0093; giữ thêm ở đây cho chắc).
    sendTax: r.send_to_tax !== false && r.variant_code !== 'internal',
  }]));
}

export async function partnerByCode(tx: Tx, code: string): Promise<{ code: string; name: string; phone: string } | null> {
  const r = (await sql<{ code: string; name: string; phone: string | null; mobile: string | null }>`
    SELECT code, name, phone, mobile FROM bizcity_read.partners WHERE code = ${code} LIMIT 1`.execute(tx)).rows[0];
  return r ? { code: r.code, name: r.name, phone: r.mobile ?? r.phone ?? '' } : null;
}

/** Ngày làm việc theo giờ Việt Nam (UTC+7). */
export function todayVn(now = Date.now()): string {
  return new Date(now + 7 * 3600_000).toISOString().slice(0, 10);
}
