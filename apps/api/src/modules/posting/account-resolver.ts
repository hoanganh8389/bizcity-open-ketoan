// @bizcity-layer K kernel/posting
/**
 * Tra tài khoản cho bộ định khoản theo thứ tự ưu tiên:
 *
 *   tài khoản đối ứng  : lý do.counter_account  → ngầm định "receivable"
 *   tài khoản doanh thu: lý do.revenue_account  → nhóm hạch toán của mặt hàng.revenue_account
 *   tài khoản trả lại  : lý do.revenue_account  → nhóm hạch toán.sales_return_account
 *   tài khoản giá vốn  : lý do.expense_account  → nhóm hạch toán.cogs_account
 *                        (hàng tặng + cờ giftCostToPromotion → ngầm định "promotion_expense")
 *   tài khoản kho      : nhóm hạch toán.inventory_account
 *   tài khoản thuế ra  : loại thuế.account_code → ngầm định "tax_output"
 *   tài khoản thuế vào : loại thuế.account_code → ngầm định "tax_input"
 *   phải trả NCC       : lý do.counter_account  → ngầm định "payable"
 *   hàng đang chuyển   : lý do.counter_account  → ngầm định "goods_in_transit"
 *   điều chỉnh kho     : lý do.counter_account  → ngầm định "stock_surplus" (tăng) / "stock_shortage" (giảm)
 *   tài khoản tiền     : hình thức thanh toán.account_code (đối tượng: hình thức.partner_code → khách);
 *                        chuyển tiền có mã ngân hàng → tài khoản ngân hàng.account_code
 *
 * Thiếu cấu hình → ném lỗi có danh sách chỗ thiếu, để người dùng sửa ở màn Cấu hình.
 */
import type { PostingReason, ProductPostingGroup } from '../../db/types.js';
import { Errors } from '../../core/errors.js';
import type { PostingConfig, TaxCodeConfig } from '../posting-config/posting-config.repository.js';

export class AccountResolver {
  private readonly missing = new Set<string>();

  constructor(private readonly cfg: PostingConfig) {}

  /** Lý do theo mã; không truyền mã thì lấy lý do có cờ default = docType. */
  reason(code: string | undefined, docType: string): PostingReason {
    if (code) {
      const r = this.cfg.reasons.get(code);
      if (!r) throw Errors.posting(`Lý do ${code} chưa khai báo trong Cấu hình hạch toán`);
      return r;
    }
    for (const r of this.cfg.reasons.values()) {
      if ((r.flags as Record<string, unknown>)?.default === docType) return r;
    }
    throw Errors.posting(`Chưa có lý do mặc định cho loại chứng từ ${docType} (đặt cờ "default": "${docType}" trên một lý do)`);
  }

  /** Lý do có cờ default = key; không có thì undefined (không báo lỗi). */
  defaultReason(key: string): PostingReason | undefined {
    for (const r of this.cfg.reasons.values()) {
      if ((r.flags as Record<string, unknown>)?.default === key) return r;
    }
    return undefined;
  }

  groupForSku(sku: string): ProductPostingGroup {
    const product = sku ? this.cfg.products.get(sku) : undefined;
    const code = product?.postingGroupCode;
    const group = (code && this.cfg.groups.get(code)) || this.cfg.defaultGroup;
    if (!group) throw Errors.posting('Chưa có nhóm hạch toán mặt hàng mặc định');
    return group;
  }

  counterAccount(reason: PostingReason): string {
    return reason.counter_account ?? this.fromDefault('receivable', `tài khoản đối ứng của lý do ${reason.code}`);
  }

  revenueAccount(reason: PostingReason, group: ProductPostingGroup): string {
    return reason.revenue_account ?? group.revenue_account;
  }

  salesReturnAccount(reason: PostingReason, group: ProductPostingGroup): string {
    return reason.revenue_account ?? group.sales_return_account;
  }

  cogsAccount(reason: PostingReason, group: ProductPostingGroup, isGift: boolean): string {
    const flags = (reason.flags ?? {}) as Record<string, unknown>;
    if (isGift && flags.giftCostToPromotion) return this.fromDefault('promotion_expense', 'tài khoản chi phí hàng khuyến mãi');
    return reason.expense_account ?? group.cogs_account;
  }

  taxCode(code: string): TaxCodeConfig {
    const t = this.cfg.taxCodes.get(code);
    if (!t) {
      this.missing.add(`Loại thuế ${code} chưa khai báo`);
      return { code, name: code, rate: 0, direction: 'output', accountCode: null, reportGroup: 'KCT' };
    }
    return t;
  }

  outputTaxAccount(code: string): string {
    return this.taxCode(code).accountCode ?? this.fromDefault('tax_output', 'tài khoản thuế GTGT đầu ra');
  }

  /** Tài khoản thuế đầu vào. Có tiền thuế mà mã là thuế ĐẦU RA (R08…) thì báo thiếu cấu hình: mua vào phải dùng mã V… (1331). */
  inputTaxAccount(code: string, taxAmount = 0): string {
    const t = this.taxCode(code);
    if (taxAmount && t.direction === 'output' && this.cfg.taxCodes.has(code)) {
      this.missing.add(`Loại thuế ${code} là thuế GTGT đầu ra — phiếu mua / trả NCC phải dùng mã thuế đầu vào (V05, V08, V10…)`);
    }
    return t.accountCode ?? this.fromDefault('tax_input', 'tài khoản thuế GTGT đầu vào');
  }

  /** Tài khoản ngầm định theo khoá, chỉ để so sánh (thiếu thì undefined, không ghi vào danh sách thiếu cấu hình). */
  peekDefault(key: string): string | undefined {
    return this.cfg.defaults.get(key) || undefined;
  }

  /** Tài khoản ngầm định theo khoá (thiếu thì ghi vào danh sách thiếu cấu hình). */
  defaultAccount(key: string, label: string): string {
    return this.fromDefault(key, label);
  }

  /** Tài khoản đối ứng có tài khoản ngầm định riêng cho loại chứng từ (phải trả NCC, hàng đang chuyển…). */
  counterOr(reason: PostingReason, defaultKey: string, label: string, fallbackKey?: string): string {
    if (reason.counter_account) return reason.counter_account;
    if (fallbackKey && !this.cfg.defaults.get(defaultKey) && this.cfg.defaults.get(fallbackKey)) return this.fromDefault(fallbackKey, label);
    return this.fromDefault(defaultKey, label);
  }

  /**
   * Tài khoản tiền của hình thức thanh toán. partnerId: đối tượng nhận tiền hộ (QR, thẻ vào tài khoản công ty
   * → Nợ 13681 chi tiết công ty) — null thì dòng tiền gắn khách / nhà cung cấp như cũ.
   */
  paymentAccount(methodCode: string): { account: string; isReceivable: boolean; partnerId: string | null } {
    const m = this.cfg.paymentMethods.get(methodCode);
    if (!m) {
      this.missing.add(`Hình thức thanh toán ${methodCode} chưa khai báo`);
      return { account: '', isReceivable: false, partnerId: null };
    }
    let partnerId: string | null = null;
    if (m.partner_code) {
      partnerId = this.cfg.methodPartners?.get(m.partner_code) ?? null;
      if (!partnerId) this.missing.add(`Đối tượng nhận hộ ${m.partner_code} của hình thức ${methodCode} chưa có trong danh mục đối tượng`);
    }
    return { account: m.account_code, isReceivable: m.is_receivable, partnerId };
  }

  /** Tài khoản kế toán của tài khoản ngân hàng theo mã (danh mục Tài khoản ngân hàng). */
  bankAccount(code: string): string {
    const acc = this.cfg.bankAccounts.get(code);
    if (!acc) {
      this.missing.add(`Tài khoản ngân hàng ${code} chưa khai báo (hoặc đã ngừng dùng)`);
      return '';
    }
    return acc;
  }

  /** Gọi sau khi dựng xong: còn thiếu cấu hình thì ném một lỗi gộp. */
  assertComplete(): void {
    if (this.missing.size) throw Errors.posting('Thiếu cấu hình hạch toán', [...this.missing]);
  }

  private fromDefault(key: string, label: string): string {
    const acc = this.cfg.defaults.get(key);
    if (!acc) {
      this.missing.add(`Chưa đặt ${label} (tài khoản ngầm định "${key}")`);
      return '';
    }
    return acc;
  }
}
