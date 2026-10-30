// @bizcity-layer K kernel/config
/**
 * Cấu hình hạch toán: lý do, nhóm hạch toán mặt hàng, hình thức thanh toán,
 * tài khoản ngầm định, loại thuế, mặt hàng.
 *
 * `loadPostingConfig` nạp toàn bộ cấu hình của một đơn vị vào bộ nhớ một lần cho
 * mỗi lượt định khoản (cấu hình nhỏ, đọc nhiều). Có `asOf` (ngày hạch toán): chọn phiên bản chính sách kế toán áp cho
 * ngày đó (ADR-0009, ./policy.ts) và trả `policyVersion` để ghi vào posting_log / ledger_entries.
 */
import type { Db } from '../../db/client.js';
import { toNumber } from '../../db/client.js';
import { seedProduct } from '../default-data/default-data.service.js';
import type { Account, PaymentMethod, PostingReason, ProductPostingGroup } from '../../db/types.js';
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
      skus.length
        ? db.selectFrom('products').select(['sku', 'posting_group_code', 'tax_out_code']).where('tenant_id', '=', tenantId).where('sku', 'in', skus).execute()
        : Promise.resolve([]),
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
