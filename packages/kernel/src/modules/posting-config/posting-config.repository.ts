// @bizcity-layer K kernel/config
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009).
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời từ apps/api/src/modules/posting-config/posting-config.repository.ts sang packages/kernel (@bizcity/kernel, D010-7 chặng 3); import Platform qua @bizcity/platform
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

/** Phần cấu hình là chính sách (đi vào bản chụp phiên bản): dòng đang dùng. */
export async function loadPolicyRaw(db: Db, tenantId: string): Promise<PolicyRaw> {
  const [reasons, groups, paymentMethods, taxCodes, defaults, bankAccounts] = await Promise.all([
    db.selectFrom('posting_reasons').selectAll().where('tenant_id', '=', tenantId).where('is_active', '=', true).execute(),
    db.selectFrom('product_posting_groups').selectAll().where('tenant_id', '=', tenantId).execute(),
    db.selectFrom('payment_methods').selectAll().where('tenant_id', '=', tenantId).where('is_active', '=', true).execute(),
    db.selectFrom('tax_codes').select(['code', 'name', 'rate', 'direction', 'account_code', 'report_group']).where('tenant_id', '=', tenantId).where('is_active', '=', true).execute(),
    db.selectFrom('posting_defaults').select(['key', 'account_code']).where('tenant_id', '=', tenantId).execute(),
    db.selectFrom('bank_accounts').select(['code', 'account_code']).where('tenant_id', '=', tenantId).where('is_active', '=', true).execute(),
  ]);
  return { reasons, groups, paymentMethods, taxCodes: taxCodes.map((t) => ({ ...t, rate: String(t.rate) })), defaults, bankAccounts };
}

export const postingConfigRepository = {
  async loadPostingConfig(db: Db, tenantId: string, skus: string[] = [], opts: { asOf?: string; actor?: string } = {}): Promise<PostingConfig> {
    const [accounts, live, products] = await Promise.all([
      db.selectFrom('accounts').selectAll().where('tenant_id', '=', tenantId).execute(),
      loadPolicyRaw(db, tenantId),
      loadProducts(db, tenantId, skus, opts.asOf),
    ]);
    const picked = opts.asOf ? await selectPolicy(db, tenantId, live, opts.asOf, opts.actor ?? 'system') : { raw: live, version: null };
    const { reasons, groups, paymentMethods: methods, taxCodes: taxes, defaults, bankAccounts: banks } = picked.raw;
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
        taxes.map((t) => [t.code, { code: t.code, name: t.name, rate: toNumber(t.rate), direction: t.direction, accountCode: t.account_code, reportGroup: t.report_group }]),
      ),
      defaults: new Map(defaults.map((d) => [d.key, d.account_code])),
      products: withSeedProducts(skus, products.map((p) => ({ sku: p.sku, postingGroupCode: p.posting_group_code, taxOutCode: p.tax_out_code }))),
      bankAccounts: new Map(banks.map((b) => [b.code, b.account_code])),
      policyVersion: picked.version,
    };
  },
};
