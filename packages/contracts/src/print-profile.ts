// [2026-11-11 Nguyễn Văn Thủy] Hồ sơ in (HT16 Báo cáo, chứng từ): thông tin đơn vị trên bản in, người ký, ngày ký (đóng góp)
/**
 * Hồ sơ in — MỘT nơi khai mọi thứ in lên đầu trang / chân trang của báo cáo, chứng từ:
 *   - company: thông tin đơn vị in trên bản in (để trống = lấy theo Thông tin đơn vị HT03);
 *   - show:    hiện / ẩn từng phần thông tin đơn vị, căn lề, lặp ở các trang sau, dòng chi nhánh;
 *   - signDate: ngày ký lấy theo cuối kỳ báo cáo / ngày chứng từ;
 *   - signers: chức danh → tiêu đề người ký + tên người ký (theo SIGNER_ROLES).
 * Lưu ở bảng print_profiles theo cả đơn vị (branch_code '') và từng chi nhánh (ghi đè). Chỉ lưu phần KHÁC mặc định;
 * đọc = mặc định ← cả đơn vị ← chi nhánh (mergePrintProfile). Thêm tuỳ chọn mới: thêm vào schema + PRINT_PROFILE_DEFAULT,
 * dữ liệu đã lưu không cần sửa.
 */
import { z } from 'zod';

/**
 * Chức danh ký (thứ tự = thứ tự hiện trên màn thiết lập). Thêm chức danh: thêm một dòng ở đây.
 * aliases: các chức danh in sẵn trên mẫu được coi là chức danh này (mẫu in không phải khai role — khung in tự khớp theo chữ).
 */
export const SIGNER_ROLES = [
  { role: 'director', label: 'Giám đốc', aliases: ['Giám đốc', 'Người đại diện theo pháp luật'] },
  { role: 'chief_accountant', label: 'Kế toán trưởng', aliases: ['Kế toán trưởng'] },
  { role: 'storekeeper', label: 'Thủ kho', aliases: ['Thủ kho'] },
  { role: 'cashier', label: 'Thủ quỹ', aliases: ['Thủ quỹ'] },
  { role: 'preparer', label: 'Người lập biểu', aliases: ['Người lập biểu', 'Người lập', 'Người ghi sổ'] },
] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number]['role'];
const signerRoleEnum = z.enum(SIGNER_ROLES.map((r) => r.role) as [SignerRole, ...SignerRole[]]);

const text = (max: number) => z.string().trim().max(max);

export const printSignerSchema = z.object({
  role: signerRoleEnum,
  /** Tiêu đề in trên bản in (vd "Giám đốc chi nhánh"); trống = theo chức danh. */
  title: text(60).default(''),
  /** Tên in dưới chữ ký; trống = để trống cho ký tay. */
  name: text(80).default(''),
});
export type PrintSigner = z.infer<typeof printSignerSchema>;

export const printProfileSchema = z.object({
  company: z.object({
    /** Tên đơn vị in trên báo cáo, chứng từ (trống = tên đơn vị ở HT03 / tên chi nhánh). */
    reportName: text(200),
    address: text(300),
    taxCode: text(20),
    phone: text(50),
    email: text(120),
    website: text(120),
    /** Tài khoản ngân hàng in trên chứng từ (số TK - ngân hàng). */
    bankAccount: text(200),
  }).partial(),
  show: z.object({
    nameAddress: z.boolean(),
    taxCode: z.boolean(),
    phone: z.boolean(),
    email: z.boolean(),
    website: z.boolean(),
    bankAccount: z.boolean(),
    logo: z.boolean(),
    align: z.enum(['left', 'center']),
    /** Lặp lại thông tin đơn vị ở các trang sau. */
    repeatOnPages: z.boolean(),
    /** In dòng tên chi nhánh dưới tên đơn vị khi in tại chi nhánh. */
    branchLine: z.boolean(),
  }).partial(),
  signDate: z.object({
    /** Báo cáo: ngày ký = ngày cuối kỳ báo cáo (false = ngày in). */
    reportPeriodEnd: z.boolean(),
    /** Chứng từ: ngày ký = ngày chứng từ (false = để trống ghi tay). */
    voucherDate: z.boolean(),
  }).partial(),
  signers: z.array(printSignerSchema).max(SIGNER_ROLES.length),
}).partial().strict();
export type PrintProfileInput = z.infer<typeof printProfileSchema>;

/** Hồ sơ đầy đủ sau khi gộp (mọi trường có giá trị). */
export interface PrintProfile {
  company: Required<NonNullable<PrintProfileInput['company']>>;
  show: Required<NonNullable<PrintProfileInput['show']>>;
  signDate: Required<NonNullable<PrintProfileInput['signDate']>>;
  /** Đủ mọi chức danh theo thứ tự SIGNER_ROLES; title đã điền chức danh khi để trống. */
  signers: PrintSigner[];
}

export const PRINT_PROFILE_DEFAULT: PrintProfile = {
  company: { reportName: '', address: '', taxCode: '', phone: '', email: '', website: '', bankAccount: '' },
  show: { nameAddress: true, taxCode: true, phone: false, email: false, website: false, bankAccount: false, logo: true, align: 'left', repeatOnPages: false, branchLine: true },
  signDate: { reportPeriodEnd: true, voucherDate: true },
  signers: SIGNER_ROLES.map((r) => ({ role: r.role, title: r.label, name: '' })),
};

/** Gộp các lớp (mặc định ← cả đơn vị ← chi nhánh): trường có giá trị ở lớp sau thắng; chuỗi rỗng ở company / signer = không ghi đè. */
export function mergePrintProfile(...layers: (PrintProfileInput | null | undefined)[]): PrintProfile {
  const out: PrintProfile = structuredClone(PRINT_PROFILE_DEFAULT);
  for (const l of layers) {
    if (!l) continue;
    for (const [k, v] of Object.entries(l.company ?? {})) if (v) (out.company as Record<string, string>)[k] = v;
    Object.assign(out.show, l.show ?? {});
    Object.assign(out.signDate, l.signDate ?? {});
    for (const s of l.signers ?? []) {
      const cur = out.signers.find((x) => x.role === s.role);
      if (!cur) continue;
      if (s.title) cur.title = s.title;
      if (s.name) cur.name = s.name;
    }
  }
  return out;
}

/** Nhãn chức danh theo mã. */
export const signerRoleLabel = (role: SignerRole) => SIGNER_ROLES.find((r) => r.role === role)?.label ?? role;

/** Chức danh của một ô ký in sẵn trên mẫu (so khớp aliases, không phân biệt hoa thường); không khớp = undefined. */
export function signerRoleOf(title: string): SignerRole | undefined {
  const t = title.trim().toLocaleLowerCase('vi');
  return SIGNER_ROLES.find((r) => r.aliases.some((a) => a.toLocaleLowerCase('vi') === t))?.role;
}
