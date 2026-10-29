/**
 * Hoá đơn lấy từ cổng hoá đơn điện tử của cơ quan thuế (THUE01) và cảnh báo rủi ro (THUE02, THUE02).
 * Hàm chuẩn hoá dùng chung cho giao diện (đọc tệp) và máy chủ (đối chiếu với sổ hoá đơn).
 */
import { z } from 'zod';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');

/** Trạng thái hoá đơn trên cổng, gom về 4 nhóm như sổ hoá đơn. */
export const AUTHORITY_INVOICE_STATUSES = ['valid', 'replaced', 'adjusted', 'cancelled'] as const;
export const AUTHORITY_INVOICE_STATUS_LABELS: Record<(typeof AUTHORITY_INVOICE_STATUSES)[number], string> = {
  valid: 'Hợp lệ',
  replaced: 'Đã bị thay thế',
  adjusted: 'Đã bị điều chỉnh',
  cancelled: 'Đã huỷ / xoá bỏ',
};

export const RISK_KINDS = {
  stopped: 'Ngừng hoạt động',
  absconded: 'Bỏ địa chỉ kinh doanh / bỏ trốn',
  suspended: 'Tạm ngừng kinh doanh',
  high_risk: 'Rủi ro cao về thuế',
  other: 'Khác',
} as const;
export type RiskKind = keyof typeof RISK_KINDS;

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');

/** Đổi trạng thái nguyên văn trên cổng ("Hóa đơn đã bị thay thế"…) về nhóm. */
export function authorityStatusOf(text: string): (typeof AUTHORITY_INVOICE_STATUSES)[number] {
  const p = plain(text);
  if (p.includes('xoabo') || p.includes('dahuy') || p.includes('huybo')) return 'cancelled';
  if (p.includes('bithaythe')) return 'replaced';
  if (p.includes('bidieuchinh')) return 'adjusted';
  return 'valid';
}

/**
 * Khoá so khớp một hoá đơn: "ký hiệu 6 ký tự|số không có số 0 đầu".
 * Chấp nhận các cách ghi: ký hiệu có mẫu số đứng đầu (1C26TAA), số hoá đơn dính ký hiệu (C26TAA55607), số có số 0 đầu (00055607).
 */
export function invoiceKey(serial: string, invoiceNo: string): string {
  let s = (serial ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let n = (invoiceNo ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const glued = /^([0-9]?[A-Z][0-9]{2}[A-Z]{3})([0-9]+)$/.exec(n);
  if (glued) {
    s = glued[1]!;
    n = glued[2]!;
  }
  if (s.length === 7 && /^[0-9]/.test(s)) s = s.slice(1);
  if (s.length > 6) s = s.slice(-6);
  n = n.replace(/^0+(?=\d)/, '');
  return `${s}|${n}`;
}

/**
 * Kiểm tra chữ số cuối của mã số thuế 10 số (mã chi nhánh -xxx bỏ qua). Trả về null nếu đúng, câu báo lỗi nếu sai.
 * Chữ số kiểm tra = 10 − (tổng 9 số đầu nhân trọng số 31, 29, 23, 19, 17, 13, 7, 5, 3) mod 11.
 */
export function taxCodeProblem(taxCode: string): string | null {
  const t = (taxCode ?? '').trim();
  if (!t) return null;
  const m = /^(\d{10})(-\d{3})?$/.exec(t.replace(/\s/g, ''));
  if (!m) return 'Mã số thuế không đúng dạng 10 số (hoặc 10 số -xxx)';
  const d = m[1]!.split('').map(Number);
  const w = [31, 29, 23, 19, 17, 13, 7, 5, 3];
  const check = 10 - (w.reduce((s, x, i) => s + x * d[i]!, 0) % 11);
  if (check === 10 || check !== d[9]) return 'Mã số thuế sai chữ số kiểm tra';
  return null;
}

export const authorityInvoiceInputSchema = z.object({
  sellerTaxCode: z.string().trim().max(20).default(''),
  sellerName: z.string().trim().max(500).default(''),
  buyerTaxCode: z.string().trim().max(20).default(''),
  buyerName: z.string().trim().max(500).default(''),
  invoiceForm: z.string().trim().max(20).default(''),
  invoiceSerial: z.string().trim().min(1, 'Thiếu ký hiệu hoá đơn').max(20),
  invoiceNo: z.string().trim().min(1, 'Thiếu số hoá đơn').max(30),
  invoiceDate: day,
  totalBeforeTax: z.number().finite().default(0),
  totalTax: z.number().finite().default(0),
  totalAmount: z.number().finite().default(0),
  statusText: z.string().trim().max(200).default(''),
  checkResult: z.string().trim().max(500).default(''),
});
export type AuthorityInvoiceInput = z.infer<typeof authorityInvoiceInputSchema>;

export const authorityImportSchema = z.object({
  direction: z.enum(['input', 'output']),
  source: z.enum(['excel', 'xml']),
  fileName: z.string().trim().max(255).default(''),
  invoices: z.array(authorityInvoiceInputSchema).min(1).max(10000),
});

export const riskyTaxpayerInputSchema = z.object({
  taxCode: z.string().trim().min(10).max(20),
  name: z.string().trim().max(500).default(''),
  risk: z.enum(Object.keys(RISK_KINDS) as [RiskKind, ...RiskKind[]]),
  effectiveDate: day.nullable().default(null),
  source: z.string().trim().max(500).default(''),
  note: z.string().trim().max(1000).default(''),
});
export type RiskyTaxpayerInput = z.infer<typeof riskyTaxpayerInputSchema>;
