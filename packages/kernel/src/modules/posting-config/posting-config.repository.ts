// @bizcity-layer K kernel/config
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009).
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/posting-config/posting-config.repository.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
// [2026-11-15 Nguyễn Văn Thủy] bỏ bảng quy tắc định khoản (0096) và công tắc lý do; nạp Mục đích xuất (0140) (đóng góp)
/**
 * Cấu hình hạch toán: lý do, nhóm hạch toán mặt hàng, hình thức thanh toán,
 * tài khoản ngầm định, loại thuế, mặt hàng.
 *
 * `loadPostingConfig` nạp toàn bộ cấu hình của một đơn vị vào bộ nhớ một lần cho
 * mỗi lượt định khoản (cấu hình nhỏ, đọc nhiều). Có `asOf` (ngày hạch toán): chọn phiên bản chính sách kế toán áp cho
 * ngày đó (ADR-0009, ./policy.ts) và trả `policyVersion` để ghi vào posting_log / ledger_entries.
 */
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';
import { toNumber } from '@bizcity/platform/db/client';
import { seedProduct } from '../default-data/default-data.service.js';
import type { Account, PaymentMethod, PostingReason, ProductPostingGroup } from '@bizcity/platform/db/types';
import { selectPolicy, type PolicyRaw } from './policy.js';

export interface TaxCodeConfig {
  code: string;
  name: string;
  rate: number;
  direction: string;
  accountCode: string | null;
  reportGroup: string;
  // [2026-11-19 kiennt] NT-DM-012 — loại thuế cố định: hiệu lực, mã cũ (đóng góp)
  /** Hiệu lực của thuế suất (YYYY-MM-DD, trống = không giới hạn). */
  validFrom?: string | null;
  validTo?: string | null;
  /** Mã cũ trước NT-DM-012 (V…, R…): ghi sổ như trước. */
  isLegacy?: boolean;
}

export interface ProductConfig {
  sku: string;
  postingGroupCode: string | null;
  taxOutCode: string | null;
}

export interface PostingConfig {
  accounts: Map<string, Account>;
  reasons: Map<string, PostingReason>;
  groups: Map<string, ProductPostingGroup>;
  defaultGroup: ProductPostingGroup | undefined;
  paymentMethods: Map<string, PaymentMethod>;
  /** Mã đối tượng nhận tiền hộ của hình thức thanh toán → id đối tượng. */
  methodPartners: Map<string, string>;
  taxCodes: Map<string, TaxCodeConfig>;
  defaults: Map<string, string>;
  /** Tra mặt hàng theo sku (chỉ nạp các sku cần dùng). */
  products: Map<string, ProductConfig>;
  /** Mã tài khoản ngân hàng (danh mục Tài khoản ngân hàng, đang dùng) → tài khoản kế toán. */
  bankAccounts: Map<string, string>;
  /** Phiên bản chính sách kế toán đã dùng (chỉ khi nạp có asOf); null = cấu hình đang dùng, không chọn theo ngày. */
  policyVersion: number | null;
  /** Mục đích xuất (0140): mã → TK đối ứng của phiếu xuất kho không bán / điều chỉnh kho. */
  purposes: Map<string, { name: string; direction: string; accountCode: string }>;
  // [2026-11-13 Nguyễn Văn Thủy] TK kho theo loại kho (0128/0133): kho → TK kho chi tiết của loại; chi nhánh → kho mặc định (đóng góp)
  /** Mã kho → TK kho của loại kho (chỉ loại có TK kho là tài khoản chi tiết). Ưu tiên hơn TK kho ngầm định. */
  warehouseAccounts: Map<string, string>;
  /** Mã chi nhánh → mã kho mặc định (dòng không ghi mã kho). */
  defaultWarehouse: Map<string, string>;
}

/** Mặt hàng chưa có trong phần mềm (hoặc chưa gán nhóm / thuế): lấy theo tệp dữ liệu gốc. */
function withSeedProducts(skus: string[], rows: ProductConfig[]): Map<string, ProductConfig> {
  const map = new Map(rows.map((p) => [p.sku, p]));
  for (const sku of skus) {
    const cur = map.get(sku);
    if (cur?.postingGroupCode && cur.taxOutCode) continue;
    const seed = seedProduct(sku);
    if (seed) map.set(sku, { sku, postingGroupCode: cur?.postingGroupCode ?? seed.postingGroupCode, taxOutCode: cur?.taxOutCode ?? seed.taxOutCode });
  }
  return map;
}

// [2026-11-04 01:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-8 (R-ITEM-7, PHASE-026 · 20 §1b): định khoản theo phân loại TẠI NGÀY chứng từ
/**
 * Nhóm hạch toán và thuế bán ra của các mã hàng cần dùng. Có `asOf` (ngày hạch toán): mỗi mã → định danh có hiệu lực tại ngày đó
 * (`bizcity_item_at`, nên mã CŨ đã đổi vẫn tra ra) → bản `item_classification` có `valid_from ≤ asOf < valid_to`. Không có bản phân loại
 * (mặt hàng nháp, chưa có định danh) → dùng `products` như cũ. Không có `asOf` → `products` (giá trị hiện tại).
 * Hệ quả: đổi nhóm hạch toán từ ngày D thì chứng từ trước D vẫn định khoản — kể cả định khoản LẠI — theo nhóm cũ; sổ đã ghi không đổi.
 */
async function loadProducts(db: Db, tenantId: string, skus: string[], asOf?: string): Promise<{ sku: string; posting_group_code: string | null; tax_out_code: string | null }[]> {
  if (!skus.length) return [];
  if (!asOf) return db.selectFrom('products').select(['sku', 'posting_group_code', 'tax_out_code']).where('tenant_id', '=', tenantId).where('sku', 'in', skus).execute();
  const r = await sql<{ sku: string; posting_group_code: string | null; tax_out_code: string | null }>`
    SELECT s.sku,
           CASE WHEN ic.id IS NULL THEN p.posting_group_code ELSE ic.posting_group_code END AS posting_group_code,
           CASE WHEN ic.id IS NULL THEN p.tax_out_code ELSE ic.tax_out_code END AS tax_out_code
      FROM unnest(${skus}::text[]) AS s(sku)
      LEFT JOIN products p ON p.tenant_id = ${tenantId}::bigint AND p.sku = s.sku
      LEFT JOIN LATERAL (
        SELECT c.id, c.posting_group_code, c.tax_out_code FROM item_classification c
         WHERE c.tenant_id = ${tenantId}::bigint AND c.item_id = bizcity_item_at(${tenantId}::bigint, s.sku, ${asOf}::date)
           AND c.valid_from <= ${asOf}::date AND (c.valid_to IS NULL OR ${asOf}::date < c.valid_to)
         ORDER BY c.valid_from DESC LIMIT 1
      ) ic ON TRUE
     WHERE p.id IS NOT NULL OR ic.id IS NOT NULL`.execute(db);
  return r.rows;
}

/** Ngày (Date của driver hoặc chuỗi) → 'YYYY-MM-DD'; trống giữ null. */
const ymd = (d: unknown): string | null => (d == null ? null : d instanceof Date ? d.toISOString().slice(0, 10) : String(d).slice(0, 10));

/** Phần cấu hình là chính sách (đi vào bản chụp phiên bản): dòng đang dùng. */
export async function loadPolicyRaw(db: Db, tenantId: string): Promise<PolicyRaw> {
  const [reasons, groups, paymentMethods, taxCodes, defaults, bankAccounts] = await Promise.all([
    db.selectFrom('posting_reasons').selectAll().where('tenant_id', '=', tenantId).where('is_active', '=', true).execute(),
    db.selectFrom('product_posting_groups').selectAll().where('tenant_id', '=', tenantId).execute(),
    db.selectFrom('payment_methods').selectAll().where('tenant_id', '=', tenantId).where('is_active', '=', true).execute(),
    db.selectFrom('tax_codes').select(['code', 'name', 'rate', 'direction', 'account_code', 'report_group', 'valid_from', 'valid_to', 'is_legacy']).where('tenant_id', '=', tenantId).where('is_active', '=', true).execute(),
    db.selectFrom('posting_defaults').select(['key', 'account_code']).where('tenant_id', '=', tenantId).execute(),
    db.selectFrom('bank_accounts').select(['code', 'account_code']).where('tenant_id', '=', tenantId).where('is_active', '=', true).execute(),
  ]);
  return { reasons, groups, paymentMethods, taxCodes: taxCodes.map((t) => ({ ...t, rate: String(t.rate), valid_from: ymd(t.valid_from), valid_to: ymd(t.valid_to) })), defaults, bankAccounts };
}

export const postingConfigRepository = {
  async loadPostingConfig(db: Db, tenantId: string, skus: string[] = [], opts: { asOf?: string; actor?: string } = {}): Promise<PostingConfig> {
    const [accounts, live, products, purposes, whs] = await Promise.all([
      db.selectFrom('accounts').selectAll().where('tenant_id', '=', tenantId).execute(),
      loadPolicyRaw(db, tenantId),
      loadProducts(db, tenantId, skus, opts.asOf),
      db.selectFrom('stock_purposes').select(['code', 'name', 'direction', 'account_code']).where('tenant_id', '=', tenantId).where('is_active', '=', true).execute(),
      sql<{ code: string; branch_code: string; is_default: boolean; account: string | null }>`
        SELECT w.code, b.code AS branch_code, w.is_default,
               (SELECT a.code FROM warehouse_types t JOIN accounts a ON a.tenant_id = t.tenant_id AND a.code = t.account_prefix AND a.is_posting
                 WHERE t.tenant_id = w.tenant_id AND t.code = w.type_code AND t.account_prefix <> '' AND t.deleted_at IS NULL) AS account
          FROM warehouses w JOIN branches b ON b.id = w.branch_id WHERE w.tenant_id = ${tenantId}`.execute(db),
    ]);
    const picked = opts.asOf ? await selectPolicy(db, tenantId, live, opts.asOf, opts.actor ?? 'system') : { raw: live, version: null };
    const { reasons, groups, paymentMethods: methods, taxCodes: snapTaxes, defaults, bankAccounts: banks } = picked.raw;
    // [2026-11-19 kiennt] NT-DM-012 — loại thuế cố định (nhà nước quy định, không thuộc chính sách đơn vị): bản chụp chính sách cũ
    // (trước 0169) chưa có thì lấy từ cấu hình đang dùng, để chứng từ ghi lùi ngày vẫn chọn được KCT · 0 · 5 · 8 · 10 · KKKN (đóng góp)
    const taxes = [...snapTaxes, ...live.taxCodes.filter((t) => t.is_legacy === false && t.direction === 'both' && !snapTaxes.some((x) => x.code === t.code))];
    const partnerCodes = [...new Set(methods.map((m) => m.partner_code).filter((c): c is string => !!c))];
    const partners = partnerCodes.length
      ? await db.selectFrom('partners').select(['id', 'code']).where('tenant_id', '=', tenantId).where('code', 'in', partnerCodes).execute()
      : [];
    return {
      methodPartners: new Map(partners.map((p) => [p.code, p.id])),
      accounts: new Map(accounts.map((a) => [a.code, a])),
      reasons: new Map(reasons.map((r) => [r.code, r])),
      groups: new Map(groups.map((g) => [g.code, g])),
      defaultGroup: groups.find((g) => g.is_default),
      paymentMethods: new Map(methods.map((m) => [m.code, m])),
      taxCodes: new Map(
        taxes.map((t) => [t.code, { code: t.code, name: t.name, rate: toNumber(t.rate), direction: t.direction, accountCode: t.account_code, reportGroup: t.report_group, validFrom: t.valid_from ?? null, validTo: t.valid_to ?? null, isLegacy: t.is_legacy ?? false }]),
      ),
      defaults: new Map(defaults.map((d) => [d.key, d.account_code])),
      products: withSeedProducts(skus, products.map((p) => ({ sku: p.sku, postingGroupCode: p.posting_group_code, taxOutCode: p.tax_out_code }))),
      bankAccounts: new Map(banks.map((b) => [b.code, b.account_code])),
      policyVersion: picked.version,
      purposes: new Map(purposes.map((x) => [x.code, { name: x.name, direction: x.direction, accountCode: x.account_code }])),
      warehouseAccounts: new Map(whs.rows.filter((w) => w.account).map((w) => [w.code, w.account!])),
      defaultWarehouse: new Map(whs.rows.filter((w) => w.is_default).map((w) => [w.branch_code, w.code])),
    };
  },
};
