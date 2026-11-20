/**
 * Tra chính sách theo mã hàng (TC01) — logic thuần của màn: khuôn dữ liệu GET /api/v1/purchase/policy-lookup (phân hệ Mua hàng,
 * apps/api/src/phan-he/mua-hang/tra-chinh-sach.ts), chữ / màu của trạng thái, tham số gửi đi, câu tóm tắt phiếu giả.
 * Không React, không gọi API: test ở `test/`.
 */

export type TraStatus = 'ap' | 'bi-chan' | 'chua-du' | 'khong-dung';
export interface TraRow {
  code: string; name: string; kind: string; kindLabel: string; partnerCode: string;
  priority: number; exclusive: boolean; validFrom: string | null; validTo: string | null;
  status: TraStatus; reason: string; amount: number; alone: { amount: number; gift: string }; winner: boolean;
}
export interface TraResult {
  item: { sku: string; name: string; brandCode: string; units: { unit: string; ratio: number }[] };
  partners: { code: string; name: string }[];
  input: { partnerCode: string; qty: number; unit: string; price: number; priceSource: 'nhap' | 'gia-mua' | 'khong-co'; priceIncludesVat: boolean; date: string; branchCode: string };
  rows: TraRow[];
  other: { code: string; name: string; kind: string; kindLabel: string }[];
  total: { gross: number; lineDiscount: number; orderDiscount: number; after: number; realUnitCost: number; gifts: string[] };
  exclusiveNote: string;
}

/** Ô lọc của màn. Chuỗi trống = để máy chủ tự chọn (NCC đầu tiên, ĐVT mua mặc định, giá mua còn hiệu lực, hôm nay). */
export interface TraForm { sku: string; partnerCode: string; qty: string; unit: string; price: string; branchCode: string; date: string }
export const EMPTY_FORM: TraForm = { sku: '', partnerCode: '', qty: '1', unit: '', price: '', branchCode: '', date: '' };

export const STATUS_TEXT: Record<TraStatus, { text: string; badge: string }> = {
  ap: { text: 'Đang áp', badge: 'badge-ok' },
  'chua-du': { text: 'Chưa đủ điều kiện', badge: 'badge-info' },
  'bi-chan': { text: 'Bị áp riêng chặn', badge: 'badge-bad' },
  'khong-dung': { text: 'Không dùng', badge: 'badge-gray' },
};

/** Số dương từ ô nhập (chấp nhận "1.000" kiểu Việt Nam, "1,5"); không hợp lệ → undefined. */
export function parseNum(s: string): number | undefined {
  const t = s.trim();
  if (!t) return undefined;
  const n = Number(/,\d{1,3}$/.test(t) && !t.includes('.') ? t.replace(',', '.') : t.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/** Tham số gửi máy chủ: bỏ ô trống để máy chủ tự chọn. Chưa có mã → null (chưa tra). */
export function lookupQuery(f: TraForm): Record<string, string | number> | null {
  if (!f.sku.trim()) return null;
  const q: Record<string, string | number> = { sku: f.sku.trim() };
  if (f.partnerCode) q.partnerCode = f.partnerCode;
  const qty = parseNum(f.qty);
  if (qty) q.qty = qty;
  if (f.unit) q.unit = f.unit;
  const price = parseNum(f.price);
  if (price !== undefined) q.price = price;
  if (f.branchCode) q.branchCode = f.branchCode;
  if (f.date) q.date = f.date;
  return q;
}

/** Chỉ định dạng để đọc (máy chủ đã làm tròn tiền) — không làm tròn ở đây (SC-STD-5). */
const vn = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 2 });

/** Câu tóm tắt phiếu nhập giả: SL × giá = tiền hàng, CK, sau CK, giá vốn thực tế / ĐVT, quà. */
export function summaryText(r: Pick<TraResult, 'input' | 'total'>): string {
  const { input: i, total: t } = r;
  const parts = [`${vn(i.qty)} ${i.unit} × ${vn(i.price)} = ${vn(t.gross)}`];
  if (t.lineDiscount) parts.push(`CK dòng −${vn(t.lineDiscount)}`);
  if (t.orderDiscount) parts.push(`CK trên đơn −${vn(t.orderDiscount)}`);
  parts.push(`sau CK ${vn(t.after)}`);
  if (i.qty) parts.push(`giá vốn thực tế ${vn(t.realUnitCost)} / ${i.unit}`);
  if (t.gifts.length) parts.push(`quà: ${t.gifts.join('; ')}`);
  return parts.join(' · ');
}

/** Ghi chú nguồn đơn giá — giá 0 thì CK % ra 0đ, nhắc nhập giá. */
export function priceNote(i: TraResult['input']): string {
  if (i.priceSource === 'nhap') return 'Đơn giá bạn nhập';
  if (i.priceSource === 'gia-mua') return `Đơn giá lấy từ giá mua của NCC${i.priceIncludesVat ? ' (gồm VAT)' : ''}`;
  return 'Chưa có giá mua của NCC cho mã này — nhập đơn giá để thấy số tiền chiết khấu';
}

/** Đếm theo trạng thái (thẻ đầu bảng). */
export function countBy(rows: TraRow[]): Record<TraStatus, number> {
  const out: Record<TraStatus, number> = { ap: 0, 'chua-du': 0, 'bi-chan': 0, 'khong-dung': 0 };
  for (const r of rows) out[r.status]++;
  return out;
}
