/**
 * Người mua trên hoá đơn điện tử của đơn máy bán (phiếu NT-BH-010, NT-BH-034) — hàm thuần, không đọc CSDL. Luật bắt buộc làm y POS cũ
 * (`taxBuyerRequirement` trong tgs_pos/assets/js/pos-tax-lookup.js): máy bán React kiểm trước, máy chủ kiểm lại cùng luật.
 * - Mã số thuế / căn cước: 10 số (doanh nghiệp), 12 số (căn cước công dân, dùng thay MST từ 01/7/2025), 13 số (chi nhánh, có thể viết
 *   10 số + "-" + 3 số).
 * - Có mã: tên người mua không được là nhãn nội bộ "Khách lẻ" (hoá đơn bán cho đơn vị không ghi "Bán cho người tiêu dùng"); bắt buộc địa chỉ.
 * - Mã 12 số: bắt buộc email (đường duy nhất giao hoá đơn cho khách cá nhân).
 * - Email đã gõ thì phải đúng định dạng.
 * Trả lỗi đầu tiên theo thứ tự ô trên form (mã → tên → địa chỉ → email) để thu ngân sửa từng ô từ trên xuống.
 */
// [2026-11-19 Võ Hoàng] NGHIEM-THU — NT-BH-034: luật bắt buộc người mua hoá đơn như POS cũ, MST 10 / 12 / 13 số (đóng góp)

/** Nhãn ghi trên hoá đơn khi không có tên người mua (bán lẻ) — trùng `TGS_RETAIL_BUYER_LABEL` của website. */
export const RETAIL_BUYER_LABEL = 'Bán cho người tiêu dùng';

/** Khuôn mã số thuế / căn cước nhận ở máy chủ: 10, 12, 13 số (13 số có thể viết 10-3). */
export const TAX_CODE_RE = /^(\d{10}|\d{12}|\d{13}|\d{10}-\d{3})$/;
export const TAX_CODE_MESSAGE = 'Mã số thuế phải có 10 số, 12 số nếu là căn cước công dân, hoặc 13 số nếu là chi nhánh';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Chỉ còn chữ số của mã (bỏ gạch, khoảng trắng). */
export const taxDigits = (code: string | null | undefined): string => String(code ?? '').replace(/\D/g, '');

/** Tên có phải nhãn nội bộ ("Khách lẻ", "khach hang le", "Khách vãng lai") hoặc trống — trùng `tgsIsPlaceholderBuyerName` của website. */
export function isPlaceholderBuyerName(name: string | null | undefined): boolean {
  const s = String(name ?? '').trim();
  if (!s) return true;
  const f = s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/\s+/g, ' ');
  return ['khach le', 'khach hang le', 'khach vang lai'].includes(f);
}

export type InvoiceBuyerInput = { name?: string; companyName?: string; address?: string; email?: string; phone?: string; taxCode?: string };
export type BuyerField = 'taxCode' | 'name' | 'address' | 'email';
export type BuyerProblem = { field: BuyerField; message: string } | null;

/**
 * Ô thiếu / sai đầu tiên của người mua hoá đơn; null = gửi được. Không mã số thuế → chỉ kiểm email (nếu gõ).
 * Máy chủ nhận đơn thiếu tên người mua khi có tên công ty (máy bán cũ / hợp đồng NT-BH-010 chỉ gửi tên đơn vị); tên gửi lên là nhãn
 * "Khách lẻ" thì luôn từ chối.
 */
export function invoiceBuyerProblem(b: InvoiceBuyerInput): BuyerProblem {
  const email = (b.email ?? '').trim();
  const emailOk = EMAIL_RE.test(email);
  const raw = (b.taxCode ?? '').trim();
  if (!raw) return email && !emailOk ? { field: 'email', message: 'Email chưa đúng định dạng — sửa lại hoặc xoá trống' } : null;
  if (!TAX_CODE_RE.test(raw)) return { field: 'taxCode', message: TAX_CODE_MESSAGE };
  const digits = taxDigits(raw);
  const name = (b.name ?? '').trim();
  if (name ? isPlaceholderBuyerName(name) : !(b.companyName ?? '').trim()) {
    return {
      field: 'name',
      message: name
        ? `Đã nhập mã số thuế — không được để "${name}". Nhập tên người mua hàng cụ thể (hoá đơn bán cho đơn vị không ghi "${RETAIL_BUYER_LABEL}")`
        : 'Đã nhập mã số thuế — phải nhập Tên khách hàng để ghi vào dòng Họ tên người mua trên hoá đơn',
    };
  }
  if (!(b.address ?? '').trim()) return { field: 'address', message: 'Đã nhập mã số thuế — phải nhập Địa chỉ để ghi lên hoá đơn' };
  if (digits.length === 12) {
    if (!email) return { field: 'email', message: 'Mã căn cước cá nhân — phải nhập Email để hệ thống gửi hoá đơn cho khách' };
    if (!emailOk) return { field: 'email', message: 'Email chưa đúng định dạng — hoá đơn sẽ không gửi tới được khách' };
    return null;
  }
  if (email && !emailOk) return { field: 'email', message: 'Email chưa đúng định dạng — sửa lại hoặc xoá trống' };
  return null;
}
