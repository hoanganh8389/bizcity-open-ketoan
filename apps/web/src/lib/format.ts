/**
 * Định dạng hiển thị: tiền (dấu chấm hàng nghìn kiểu Việt Nam), ngày dd/mm/yyyy.
 */
const moneyFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });
const moneyFmt2 = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

/** 1234567 → "1.234.567"; 0 → "" khi blankZero (bảng số liệu kế toán thường để trống ô 0). */
export function money(v: number | null | undefined, opts: { blankZero?: boolean; decimals?: boolean } = {}): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  if (v === 0 && opts.blankZero) return '';
  return (opts.decimals ? moneyFmt2 : moneyFmt).format(v);
}

/** Đơn giá: giữ số lẻ (tới 4 chữ số, bỏ số 0 thừa) — 506018.52 → "506.018,52". Thành tiền vẫn tròn đồng (money). */
const priceFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 4 });
export function price(v: number | null | undefined, opts: { blankZero?: boolean } = {}): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '';
  if (v === 0 && opts.blankZero) return '';
  return priceFmt.format(v);
}

/** Làm tròn đơn giá sau khi quy đổi (gồm / chưa thuế, đổi ĐVT): giữ 4 chữ số lẻ, không ép về đồng. */
export const roundPrice = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Đọc số người dùng gõ / dán theo kiểu Việt Nam: dấu chấm hàng nghìn, dấu phẩy thập phân ("506.018,52").
 * Không có dấu phẩy: "506.019" (nhóm 3 chữ số) là hàng nghìn, còn "506018.52" (dán từ Excel) là thập phân.
 * Trống → null. Làm tròn tới `decimals` chữ số lẻ.
 */
export function parseNum(s: string, decimals = 4): number | null {
  let t = String(s).replace(/[\s ]/g, '').replace(/[^\d.,-]/g, '');
  if (t === '' || t === '-') return null;
  if (t.includes(',')) {
    t = t.replace(/\./g, '');
    const i = t.lastIndexOf(',');
    t = `${t.slice(0, i).replace(/,/g, '')}.${t.slice(i + 1)}`;
  } else {
    const parts = t.split('.');
    if (parts.length > 1 && !(parts.length === 2 && parts[1]!.length !== 3)) t = parts.join('');
  }
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  const k = 10 ** decimals;
  return Math.round(n * k) / k;
}

/** "2026-10-05" → "05/10/2026" */
export function date(v: string | null | undefined): string {
  if (!v) return '';
  const s = String(v).slice(0, 10);
  const [y, m, d] = s.split('-');
  return y && m && d ? `${d}/${m}/${y}` : s;
}

export function dateTime(v: string | Date | null | undefined): string {
  if (!v) return '';
  const d = new Date(v);
  return d.toLocaleString('vi-VN', { hour12: false });
}

/** Ngày hôm nay dạng YYYY-MM-DD (giờ máy). */
export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function firstDayOfMonth(): string {
  return `${today().slice(0, 7)}-01`;
}

/* ---------------------------------------------------------------------------
 * Kỳ xem báo cáo.
 * - PERIOD_PRESETS: các kỳ chọn nhanh ở ô lọc (tháng này, tháng trước, quý, năm…).
 * - Kỳ người dùng chọn gần nhất được nhớ trong phiên làm việc (sessionStorage), để mở
 *   báo cáo khác vẫn đúng kỳ đang xem, không phải chọn lại ngày.
 * ------------------------------------------------------------------------- */
const iso = (d: Date): string => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const monthRange = (y: number, m: number, months = 1): [string, string] => [iso(new Date(y, m, 1)), iso(new Date(y, m + months, 0))];

export const PERIOD_PRESETS: { key: string; label: string; range: () => [string, string] }[] = [
  { key: 'today', label: 'Hôm nay', range: () => [today(), today()] },
  { key: 'this-month', label: 'Tháng này', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), n.getMonth(), 1)), today()]; } },
  { key: 'last-month', label: 'Tháng trước', range: () => { const n = new Date(); return monthRange(n.getFullYear(), n.getMonth() - 1); } },
  { key: 'this-quarter', label: 'Quý này', range: () => { const n = new Date(); return [iso(new Date(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3, 1)), today()]; } },
  { key: 'last-quarter', label: 'Quý trước', range: () => { const n = new Date(); return monthRange(n.getFullYear(), Math.floor(n.getMonth() / 3) * 3 - 3, 3); } },
  { key: 'this-year', label: 'Năm nay', range: () => [`${new Date().getFullYear()}-01-01`, today()] },
  { key: 'last-year', label: 'Năm trước', range: () => { const y = new Date().getFullYear() - 1; return [`${y}-01-01`, `${y}-12-31`]; } },
];

const PERIOD_KEY = 'ketoan.period';
function storedPeriod(): { from: string; to: string } | null {
  try {
    const v = JSON.parse(sessionStorage.getItem(PERIOD_KEY) ?? 'null');
    return v && /^\d{4}-\d{2}-\d{2}$/.test(v.from) && /^\d{4}-\d{2}-\d{2}$/.test(v.to) ? v : null;
  } catch {
    return null;
  }
}
/** Nhớ kỳ vừa chọn cho các màn mở sau. */
export function rememberPeriod(from: string, to: string): void {
  try { sessionStorage.setItem(PERIOD_KEY, JSON.stringify({ from, to })); } catch { /* chế độ riêng tư: bỏ qua */ }
}
/**
 * Ngày bắt đầu mặc định của ô lọc: kỳ đã chọn gần nhất trong phiên, chưa chọn thì HÔM NAY — màn danh sách, nhật ký
 * mở ra chỉ tải số liệu trong ngày cho nhẹ, đỡ rối. Báo cáo theo kỳ (báo cáo tài chính, cân đối, thuế, nhập xuất tồn…)
 * dùng periodFrom().
 */
export const defaultFrom = (): string => storedPeriod()?.from ?? today();
/** Ngày bắt đầu mặc định của báo cáo theo kỳ: kỳ đã chọn gần nhất, chưa chọn thì đầu tháng này. */
export const periodFrom = (): string => storedPeriod()?.from ?? firstDayOfMonth();
/** Ngày kết thúc mặc định của ô lọc: kỳ đã chọn gần nhất, chưa chọn thì hôm nay. */
export const defaultTo = (): string => storedPeriod()?.to ?? today();
