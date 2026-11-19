// @bizcity-layer K kernel/posting
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-11-01 04:39 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — dời sang packages/kernel (@bizcity/kernel, D010-7 chặng 3)
// [2026-11-15 Nguyễn Văn Thủy] Tài khoản chỉ lấy từ 5 nguồn của Quy tắc hạch toán; bỏ tài khoản trên lý do, theo mặt hàng, công tắc lý do (đóng góp)
/**
 * TRA TÀI KHOẢN cho bộ định khoản. Khung Nợ / Có của từng loại chứng từ nằm ở rules/*.rule.ts (bất biến); tài khoản của
 * từng chân lấy từ đúng MỘT trong năm nguồn (docs/nghiep-vu/24-quy-tac-hach-toan.md):
 *
 *   1. Tài khoản của quy tắc (posting_defaults, màn Quy tắc hạch toán ACC41): doanh thu, hàng bán trả lại, giá vốn,
 *      giá vốn hàng tặng, phải thu, phải trả, thuế mặc định, hàng đang chuyển, nội bộ, thừa / thiếu chờ xử lý…
 *   2. Hình thức thanh toán (DM05) / tài khoản ngân hàng (DM09): tài khoản tiền, công nợ của khoản thu chi.
 *   3. Loại kho của phân kho (DM18): tài khoản kho (chưa khai thì dùng TK kho của quy tắc).
 *   4. Loại thuế (ACC43): tài khoản thuế (chưa khai thì dùng TK thuế của quy tắc).
 *   5. Mục đích xuất (0140): tài khoản đối ứng của phiếu xuất kho không bán / điều chỉnh kho.
 *
 * Lý do trên chứng từ KHÔNG đổi tài khoản; chỉ còn làm nhãn và vài cờ cách tính (giá vốn theo giá bán khi bán nội bộ…).
 * Thiếu cấu hình → ném một lỗi gộp có danh sách chỗ thiếu, để người dùng sửa ở màn Quy tắc hạch toán.
 */
import type { PostingReason, ProductPostingGroup } from '@bizcity/platform/db/types';
import { Errors } from '@bizcity/platform/core/errors';
import type { PostingConfig, TaxCodeConfig } from '../posting-config/posting-config.repository.js';

/** TK tài sản cố định / XDCB dở dang (thuế đầu vào ghi 1332): 211, 213, 217, 241. NT-DM-012. */
export const isFixedAssetAccount = (account: string): boolean => /^(211|213|217|241)/.test(account);

export class AccountResolver {
  private readonly missing = new Set<string>();
  private defaultGroupCache: ProductPostingGroup | undefined;

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

  /**
   * Bộ tài khoản của dòng hàng (doanh thu, trả lại, giá vốn, kho) — lấy từ Quy tắc hạch toán, giống nhau cho mọi mặt hàng.
   * Tài khoản kho theo loại kho xem warehouseAccount().
   */
  groupForSku(_sku: string): ProductPostingGroup {
    this.defaultGroupCache ??= {
      ...(this.cfg.defaultGroup ?? {}),
      code: 'ACC41', name: 'Tài khoản ngầm định',
      revenue_account: this.fromDefault('revenue', 'tài khoản doanh thu bán hàng'),
      sales_return_account: this.fromDefault('sales_return', 'tài khoản hàng bán bị trả lại'),
      cogs_account: this.fromDefault('cogs', 'tài khoản giá vốn hàng bán'),
      inventory_account: this.fromDefault('inventory', 'tài khoản kho hàng hoá'),
    } as ProductPostingGroup;
    return this.defaultGroupCache;
  }

  /** TK kho theo loại kho của kho trên dòng (trống mã kho = kho mặc định của chi nhánh). undefined = loại kho chưa khai TK. */
  warehouseAccount(warehouseCode?: string | null, branchCode?: string | null): string | undefined {
    const code = warehouseCode || (branchCode ? this.cfg.defaultWarehouse?.get(branchCode) : undefined);
    return code ? this.cfg.warehouseAccounts?.get(code) : undefined;
  }

  /** Phải thu khách hàng của hoá đơn bán, hàng bán trả lại, thu tiền khách. */
  counterAccount(_reason?: PostingReason): string {
    return this.fromDefault('receivable', 'tài khoản phải thu khách hàng');
  }

  revenueAccount(_reason: PostingReason, group: ProductPostingGroup): string {
    return group.revenue_account;
  }

  salesReturnAccount(_reason: PostingReason, group: ProductPostingGroup): string {
    return group.sales_return_account;
  }

  /** Giá vốn: hàng tặng kèm → TK giá vốn hàng tặng của quy tắc (chưa khai thì như hàng bán). */
  cogsAccount(_reason: PostingReason, group: ProductPostingGroup, isGift: boolean): string {
    if (isGift) return this.cfg.defaults.get('gift_cogs') || group.cogs_account;
    return group.cogs_account;
  }

  /** Mục đích xuất theo mã (đang dùng); không có → lỗi gộp. */
  purposeAccount(code: string, increase: boolean): string {
    const p = this.cfg.purposes?.get(code);
    if (!p) {
      this.missing.add(`Mục đích xuất ${code} chưa khai báo (hoặc đã ngừng dùng)`);
      return '';
    }
    if (p.direction !== 'both' && p.direction !== (increase ? 'increase' : 'decrease')) {
      this.missing.add(`Mục đích ${code} dùng cho phiếu ${p.direction === 'increase' ? 'tăng' : 'giảm'} kho, không dùng cho phiếu ${increase ? 'tăng' : 'giảm'}`);
    }
    return p.accountCode;
  }

  taxCode(code: string): TaxCodeConfig {
    const t = this.cfg.taxCodes.get(code);
    if (!t) {
      this.missing.add(`Loại thuế ${code} chưa khai báo`);
      return { code, name: code, rate: 0, direction: 'output', accountCode: null, reportGroup: 'KCT' };
    }
    return t;
  }

  // [2026-11-19 kiennt] NT-DM-012 — loại thuế cố định (chiều 'both', không khai TK): TK theo Quy tắc hạch toán; mua TSCĐ → 1332;
  // kiểm hiệu lực thuế suất theo ngày chứng từ (vd 8% đến hết 31/12/2026). Mã cũ (V…, R…) ghi sổ như trước (đóng góp)
  /** Loại thuế phải còn hiệu lực ở ngày chứng từ (không truyền ngày thì không kiểm). */
  private checkTaxDate(code: string, date?: string): void {
    const t = this.cfg.taxCodes.get(code);
    if (!t || !date) return;
    const vn = (d: string) => d.split('-').reverse().join('/');
    if (t.validTo && date > t.validTo) this.missing.add(`Loại thuế ${code} (${t.name}) hết hiệu lực sau ngày ${vn(t.validTo)} — chứng từ ngày ${vn(date)} phải chọn lại loại thuế`);
    if (t.validFrom && date < t.validFrom) this.missing.add(`Loại thuế ${code} (${t.name}) chỉ có hiệu lực từ ngày ${vn(t.validFrom)}`);
  }

  outputTaxAccount(code: string, date?: string): string {
    this.checkTaxDate(code, date);
    return this.taxCode(code).accountCode ?? this.fromDefault('tax_output', 'tài khoản thuế GTGT đầu ra');
  }

  /**
   * Tài khoản thuế đầu vào. Có tiền thuế mà mã là thuế ĐẦU RA (mã cũ R08…) thì báo thiếu cấu hình.
   * goodsAccount: TK Nợ của dòng hàng — tài sản cố định (211, 213, 217, 241) thì thuế vào khoá tax_input_fixed_asset (1332 theo
   * TT 99/2025/TT-BTC); đơn vị chưa đặt khoá đó thì dùng TK thuế đầu vào. Loại thuế có khai TK riêng (mã cũ) thì dùng TK đó.
   */
  inputTaxAccount(code: string, taxAmount = 0, opts: { date?: string; goodsAccount?: string | null } = {}): string {
    const t = this.taxCode(code);
    this.checkTaxDate(code, opts.date);
    if (taxAmount && t.direction === 'output' && this.cfg.taxCodes.has(code)) {
      this.missing.add(`Loại thuế ${code} là thuế GTGT đầu ra — phiếu mua / trả NCC phải dùng loại thuế dùng chung (KCT, 0, 5, 8, 10, KKKN)`);
    }
    if (t.accountCode) return t.accountCode;
    if (opts.goodsAccount && isFixedAssetAccount(opts.goodsAccount) && this.cfg.defaults.get('tax_input_fixed_asset')) {
      return this.fromDefault('tax_input_fixed_asset', 'tài khoản thuế GTGT đầu vào của TSCĐ');
    }
    return this.fromDefault('tax_input', 'tài khoản thuế GTGT đầu vào');
  }

  /** Tài khoản của quy tắc theo khoá, chỉ để so sánh (thiếu thì undefined, không ghi vào danh sách thiếu cấu hình). */
  peekDefault(key: string): string | undefined {
    return this.cfg.defaults.get(key) || undefined;
  }

  /** Tài khoản của quy tắc theo khoá (thiếu thì ghi vào danh sách thiếu cấu hình). */
  defaultAccount(key: string, label: string): string {
    return this.fromDefault(key, label);
  }

  /** Tài khoản của quy tắc theo khoá; khoá chính chưa đặt mà có khoá dự phòng thì dùng khoá dự phòng. */
  counterOr(_reason: PostingReason | undefined, defaultKey: string, label: string, fallbackKey?: string): string {
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
      this.missing.add(`Chưa đặt ${label} (Quy tắc hạch toán, khoá "${key}")`);
      return '';
    }
    return acc;
  }
}
