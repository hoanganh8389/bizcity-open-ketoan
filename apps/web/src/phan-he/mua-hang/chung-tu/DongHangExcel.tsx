/**
 * NHẬP / XUẤT EXCEL DÒNG HÀNG của chứng từ mua (đơn đặt, nhập mua, trả hàng…) — cùng bộ cột để xuất ra sửa rồi nhập lại:
 *   Mã hàng (*) · Tên hàng (chỉ để đọc) · ĐVT · Số lượng (*) · Đơn giá · CK % · Hàng tặng · Số lô · NSX · Hạn dùng · Phân kho.
 * Phân kho: không bắt buộc, chỉ tham khảo — mọi dòng theo Phân kho ở đầu phiếu; kho trong tệp khác đầu phiếu thì xem trước ghi rõ.
 * Nhập: mã phải có trong danh mục, ĐVT phải là ĐVT đã khai của mã (trống = ĐVT mua mặc định), đơn giá trống = giá mua của NCC;
 * tên, thuế suất, nhãn vẫn lấy theo danh mục (cột Tên trong tệp bỏ qua). Khuyến mại tự áp sau khi đưa vào.
 */
import type { GuideColumn } from '../thanh-phan/ExcelGuide';
import { docNgay, xuatExcel, type ExcelImportSpec } from '../thanh-phan/NhapExcelChung';
import { P, purchaseApi } from '../du-lieu';
import { api } from '@/lib/api';
import type { LineCalc, ProductUnit } from '@ketoan/contracts/mua-hang';

export interface DongNhap { sku: string; qty: number; unit?: string; price?: number; /** Cột giá trong tệp ghi rõ gồm / chưa thuế (tệp xuất từ phiếu) — để quy đổi về loại giá của phiếu đang nhập. */ priceIncludesVat?: boolean; pct?: number; gift?: boolean; lotNo?: string; mfgDate?: string; expDate?: string; /** Cột Phân kho trong tệp — chỉ tham khảo. */ kho?: string }
export type DongHangCot = 'sku' | 'qty' | 'unit' | 'price' | 'priceInc' | 'priceEx' | 'pct' | 'gift' | 'lot' | 'mfg' | 'exp' | 'kho';
type K = DongHangCot;

const COLS: GuideColumn[] = [
  { name: 'Mã hàng', required: true, aliases: 'Mã SP, SKU', example: '100861001', note: 'Mã trong danh mục mặt hàng (mã chưa có báo đỏ, không lấy)' },
  { name: 'Tên hàng', example: 'Bimbosan Stage 1 400g', note: 'Chỉ để dễ đọc — tên lấy theo danh mục' },
  { name: 'ĐVT', aliases: 'Đơn vị tính', example: 'Thùng', note: 'Một ĐVT đã khai của mã (Lon / Lốc / Thùng…); trống = ĐVT mua mặc định' },
  { name: 'Số lượng', required: true, aliases: 'SL', example: 10, note: 'Lớn hơn 0' },
  { name: 'Đơn giá', aliases: 'Giá', example: '', note: 'Theo loại giá của phiếu (chưa / gồm thuế); trống = giá mua của NCC' },
  { name: 'CK %', aliases: 'Chiết khấu', example: '', note: 'Trống = tự áp theo chính sách' },
  { name: 'Hàng tặng', aliases: 'Tặng, Quà', example: '', note: '"có" = dòng hàng tặng (giá 0). Quà theo chương trình không cần ghi — phần mềm tự thêm' },
  { name: 'Số lô', aliases: 'Lô', example: 'L2611', note: 'Nếu mặt hàng theo dõi lô' },
  { name: 'NSX', aliases: 'Ngày sản xuất', example: '01/09/2026', note: 'dd/mm/yyyy' },
  { name: 'Hạn dùng', aliases: 'HSD, Hạn sử dụng', example: '01/09/2028', note: 'dd/mm/yyyy' },
  { name: 'Phân kho', aliases: 'Mã kho, Kho', example: '', note: 'Không bắt buộc, chỉ tham khảo — mọi dòng vào Phân kho ở đầu phiếu' },
];
const SPEC: [K, string[]][] = [
  ['sku', ['ma hang', 'ma sp', 'sku']], ['qty', ['so luong', 'sl']], ['unit', ['dvt', 'don vi tinh']], ['price', ['don gia', 'gia', 'gia tri / dvt', 'gia tri/dvt']], ['priceInc', ['don gia gom thue', 'don gia gom vat', 'don gia da gom thue']], ['priceEx', ['don gia chua thue', 'don gia chua vat']], ['pct', ['ck %', 'chiet khau', 'ck']],
  ['gift', ['hang tang', 'tang', 'qua']], ['lot', ['so lo', 'lo']], ['mfg', ['nsx', 'ngay san xuat']], ['exp', ['han dung', 'hsd', 'han su dung']], ['kho', ['phan kho', 'ma kho', 'kho']],
];
/** Số từ Excel: 258711 · 258.711 · 258,711 (dấu ngăn nghìn) · 2,5 / 2.5 (thập phân) · 506.018,52 / 506,018.52 (dấu sau cùng là thập phân) · 3% → số; trống → undefined. */
const n = (v: unknown) => {
  let t = String(v ?? '').replace(/[\s%đ]/g, '');
  if (!t) return undefined;
  if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '');
  else if (t.includes('.') && t.includes(',')) { const dec = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.'; t = t.split(dec === ',' ? '.' : ',').join('').replace(',', '.'); }
  else t = t.replace(',', '.');
  return Number(t);
};
const yes = (v: unknown) => /^(co|có|x|1|yes|true)$/i.test(String(v ?? '').trim());

export const nhapDongHang = (priceLabel: string, headerKho = ''): ExcelImportSpec<K, DongNhap> => ({
  title: 'Nhập dòng hàng từ Excel', file: 'mau-dong-hang.xlsx', keyField: 'sku', columns: COLS, spec: SPEC,
  map: (r) => {
    const sku = String(r.sku).trim(), qty = n(r.qty), pct = n(r.pct);
    // Cột giá ghi rõ loại (gồm / chưa thuế) thì nhớ loại để quy đổi; cột "Đơn giá" chung = theo loại giá của phiếu.
    const inc = String(r.priceInc ?? '').trim() !== '' ? true : String(r.priceEx ?? '').trim() !== '' ? false : undefined;
    const raw = inc === true ? r.priceInc : inc === false ? r.priceEx : r.price;
    const price = n(raw);
    if (!sku) return { error: 'thiếu mã hàng' };
    if (!qty || !(qty > 0)) return { error: `số lượng "${r.qty}" không hợp lệ` };
    if (price !== undefined && (Number.isNaN(price) || price < 0)) return { error: `đơn giá "${raw}" không hợp lệ` };
    if (pct !== undefined && (Number.isNaN(pct) || pct < 0 || pct > 100)) return { error: `CK % "${r.pct}" phải từ 0 đến 100` };
    const mfg = r.mfg ? docNgay(r.mfg) : undefined, exp = r.exp ? docNgay(r.exp) : undefined;
    if (r.mfg && !mfg) return { error: `NSX "${r.mfg}" không đọc được` };
    if (r.exp && !exp) return { error: `hạn dùng "${r.exp}" không đọc được` };
    return { value: { sku, qty, unit: String(r.unit ?? '').trim() || undefined, price, ...(inc !== undefined && price !== undefined ? { priceIncludesVat: inc } : {}), pct, gift: yes(r.gift), lotNo: String(r.lot ?? '').trim() || undefined, mfgDate: mfg, expDate: exp, kho: String(r.kho ?? '').trim() || undefined } };
  },
  check: async (list) => {
    const skus = [...new Set(list.map((x) => x.sku))];
    const [prods, units] = await Promise.all([purchaseApi.lookupProducts(skus), api.post<Record<string, ProductUnit[]>>(`${P}/units`, { skus })]);
    return list.map((x) => {
      if (!prods.some((p) => p.sku === x.sku)) return 'mã chưa có trong danh mục mặt hàng';
      const us = units[x.sku] ?? [];
      if (x.unit && us.length && !us.some((u) => u.unit.toLowerCase() === x.unit!.toLowerCase())) return `ĐVT "${x.unit}" chưa khai cho mã (có: ${us.map((u) => u.unit).join(', ')})`;
      return undefined;
    });
  },
  head: ['Mã hàng', 'ĐVT', 'SL', priceLabel, 'CK %', 'Tặng', 'Số lô', 'NSX', 'Hạn dùng', 'Phân kho (tham khảo)'],
  cells: (x) => [x.sku, x.unit ?? '(mặc định)', x.qty.toLocaleString('vi-VN'), x.price === undefined ? '(giá NCC)' : `${x.price.toLocaleString('vi-VN')}${x.priceIncludesVat === undefined ? '' : x.priceIncludesVat ? ' (gồm thuế)' : ' (chưa thuế)'}`, x.pct ?? '', x.gift ? 'có' : '', x.lotNo ?? '', dmy(x.mfgDate), dmy(x.expDate), !x.kho ? '' : headerKho && x.kho.toLowerCase() !== headerKho.toLowerCase() ? `${x.kho} ≠ đầu phiếu ${headerKho} → vào ${headerKho}` : x.kho],
  note: 'Đưa vào là thêm dòng vào cuối bảng (mã đã có vẫn thêm dòng riêng). Tên, thuế suất, nhãn theo danh mục; chiết khấu và quà theo chương trình tự áp sau khi đưa vào. Mọi dòng vào Phân kho ở đầu phiếu' + (headerKho ? ` (${headerKho})` : '') + ' — cột Phân kho trong tệp chỉ tham khảo.',
});

const dmy = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '');
/** Xuất dòng hàng ra Excel — đúng bộ cột của mẫu nhập (sửa xong nhập lại được), kèm thành tiền để đối chiếu. */
export function xuatDongHang(file: string, lines: LineCalc[], priceLabel: string, kho = '') {
  return xuatExcel(file, 'Hang hoa', lines.filter((l) => l.sku).map((l) => ({
    'Mã hàng': l.sku, 'Tên hàng': l.name, 'ĐVT': l.unit, 'Số lượng': l.qty, [priceLabel]: l.price, 'CK %': l.discountPct ?? '',
    'Hàng tặng': l.lineType === 'buy' ? '' : 'có', 'Số lô': l.lotNo ?? '', 'NSX': dmy(l.mfgDate), 'Hạn dùng': dmy(l.expDate),
    'Thành tiền chưa thuế': l.beforeTax, 'Tiền thuế': l.tax, 'Chương trình': l.program ?? '', ...(kho ? { 'Phân kho': kho } : {}),
  })));
}
