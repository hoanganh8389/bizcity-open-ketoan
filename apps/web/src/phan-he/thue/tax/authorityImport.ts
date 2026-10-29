/**
 * Đọc tệp tải từ cổng hoá đơn điện tử của cơ quan thuế:
 *  - Excel "Xuất excel" ở màn tra cứu hoá đơn (mua vào hoặc bán ra): tìm dòng tiêu đề có "Số hóa đơn" trong 20 dòng đầu,
 *    gộp với dòng tiêu đề con bên dưới (nếu có), so khớp tên cột không phân biệt hoa thường, có dấu / không dấu.
 *  - XML hoá đơn điện tử theo chuẩn của cơ quan thuế (thẻ HDon / DLHDon / TTChung, NDHDon / NBan, NMua, TToan);
 *    chọn được nhiều tệp một lần. Chiều mua vào / bán ra tự nhận theo mã số thuế người bán so với MST đơn vị.
 * Mẫu cột của cổng có thể đổi: cột không nhận ra được liệt kê để người dùng biết.
 */
import type { AuthorityInvoiceInput } from '@ketoan/contracts';

const plain = (s: unknown) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]/g, '');

type Field = keyof AuthorityInvoiceInput;
/** Tên cột (đã bỏ dấu, viết liền) → trường. So khớp bằng nhau trước, sau đó "bắt đầu bằng". */
const SYNONYMS: [Field, string[]][] = [
  ['invoiceForm', ['kyhieumauso', 'mausohoadon', 'mauso']],
  ['invoiceSerial', ['kyhieuhoadon', 'kyhieu']],
  ['invoiceNo', ['sohoadon']],
  ['invoiceDate', ['ngaylap', 'ngayhoadon', 'ngaylaphoadon']],
  ['sellerTaxCode', ['mstnguoiban', 'masothuenguoiban', 'mstnban', 'mstnguoibanmstnguoixuathang']],
  ['sellerName', ['tennguoiban', 'tennban']],
  ['buyerTaxCode', ['mstnguoimua', 'masothuenguoimua', 'mstnmua', 'mstnguoimuamstnguoinhanhang']],
  ['buyerName', ['tennguoimua', 'tennmua']],
  ['totalBeforeTax', ['tongtienchuathue', 'tongtienhangchuathue', 'thanhtienchuathue']],
  ['totalTax', ['tongtienthue', 'tienthue', 'tongtienthuegtgt']],
  ['totalAmount', ['tongtienthanhtoan', 'tongcongtienthanhtoan']],
  ['statusText', ['trangthaihoadon', 'trangthai']],
  ['checkResult', ['ketquakiemtrahoadon', 'ketquakiemtra']],
];

function fieldOf(label: string): Field | null {
  if (!label) return null;
  for (const [f, list] of SYNONYMS) if (list.includes(label)) return f;
  for (const [f, list] of SYNONYMS) if (list.some((s) => s.length >= 6 && label.startsWith(s))) return f;
  return null;
}

function toDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86_400_000).toISOString().slice(0, 10);
  const s = String(v ?? '').trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${m[2]!.padStart(2, '0')}-${m[3]!.padStart(2, '0')}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return `${m[3]}-${m[2]!.padStart(2, '0')}-${m[1]!.padStart(2, '0')}`;
  return null;
}

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim().replace(/\s/g, '');
  if (!s) return 0;
  const vn = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s) || /^-?\d+,\d+$/.test(s);
  const n = Number(vn ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export interface ParsedFile { invoices: AuthorityInvoiceInput[]; problems: string[]; unknownColumns: string[]; direction?: 'input' | 'output' }

/** Đọc tệp Excel danh sách hoá đơn tải từ cổng. */
export async function readAuthorityExcel(file: File): Promise<ParsedFile> {
  const XLSX = await import('xlsx');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '', raw: true });
  const headerAt = grid.slice(0, 20).findIndex((r) => r.some((c) => plain(c) === 'sohoadon' || plain(c).startsWith('sohoadon')));
  if (headerAt < 0) return { invoices: [], problems: ['Không tìm thấy dòng tiêu đề có cột "Số hóa đơn" trong 20 dòng đầu của tệp'], unknownColumns: [] };
  const top = grid[headerAt]!.map(plain);
  const sub = (grid[headerAt + 1] ?? []).map(plain);
  // Dòng dưới là tiêu đề con nếu không có số hoá đơn mà có chữ ở cột của tiêu đề gộp.
  const hasSub = sub.some((s) => s && fieldOf(s)) && !sub.some((s, i) => top[i] === 'sohoadon' && /^\d+$/.test(s));
  const width = Math.max(top.length, hasSub ? sub.length : 0);
  const cols = new Map<Field, number>();
  const unknownColumns: string[] = [];
  for (let i = 0; i < width; i++) {
    const label = (hasSub && sub[i]) || top[i] || '';
    const f = fieldOf(label) ?? fieldOf(top[i] ?? '');
    if (f && !cols.has(f)) cols.set(f, i);
    else if (label && !f && label !== 'stt') unknownColumns.push(String((hasSub && grid[headerAt + 1]![i]) || grid[headerAt]![i]));
  }
  const problems: string[] = [];
  for (const need of ['invoiceSerial', 'invoiceNo', 'invoiceDate'] as Field[]) if (!cols.has(need)) problems.push(`Thiếu cột ${need === 'invoiceSerial' ? '"Ký hiệu hóa đơn"' : need === 'invoiceNo' ? '"Số hóa đơn"' : '"Ngày lập"'}`);
  if (problems.length) return { invoices: [], problems, unknownColumns };
  const get = (r: unknown[], f: Field) => (cols.has(f) ? r[cols.get(f)!] : '');
  const invoices: AuthorityInvoiceInput[] = [];
  grid.slice(headerAt + (hasSub ? 2 : 1)).forEach((r, i) => {
    const no = String(get(r, 'invoiceNo') ?? '').trim();
    if (!no || !/\d/.test(no)) return;
    const date = toDate(get(r, 'invoiceDate'));
    if (!date) { problems.push(`Dòng ${headerAt + (hasSub ? 3 : 2) + i}: ngày lập "${String(get(r, 'invoiceDate'))}" không đọc được`); return; }
    const beforeTax = toNum(get(r, 'totalBeforeTax'));
    const tax = toNum(get(r, 'totalTax'));
    invoices.push({
      invoiceForm: String(get(r, 'invoiceForm') ?? '').trim(), invoiceSerial: String(get(r, 'invoiceSerial') ?? '').trim(), invoiceNo: no, invoiceDate: date,
      sellerTaxCode: String(get(r, 'sellerTaxCode') ?? '').trim(), sellerName: String(get(r, 'sellerName') ?? '').trim(),
      buyerTaxCode: String(get(r, 'buyerTaxCode') ?? '').trim(), buyerName: String(get(r, 'buyerName') ?? '').trim(),
      totalBeforeTax: beforeTax, totalTax: tax, totalAmount: toNum(get(r, 'totalAmount')) || beforeTax + tax,
      statusText: String(get(r, 'statusText') ?? '').trim(), checkResult: String(get(r, 'checkResult') ?? '').trim(),
    });
  });
  return { invoices, problems, unknownColumns };
}

const text = (el: Element | null | undefined, tag: string) => el?.getElementsByTagName(tag)[0]?.textContent?.trim() ?? '';

/** Đọc các tệp XML hoá đơn điện tử. ownTaxCode: MST đơn vị, để nhận chiều mua vào / bán ra. */
export async function readAuthorityXml(files: File[], ownTaxCode: string): Promise<{ input: AuthorityInvoiceInput[]; output: AuthorityInvoiceInput[]; problems: string[] }> {
  const input: AuthorityInvoiceInput[] = [];
  const output: AuthorityInvoiceInput[] = [];
  const problems: string[] = [];
  const own = ownTaxCode.trim().slice(0, 10);
  for (const f of files) {
    const doc = new DOMParser().parseFromString(await f.text(), 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) { problems.push(`${f.name}: không đọc được XML`); continue; }
    const hdons = [...doc.getElementsByTagName('HDon')];
    if (!hdons.length) { problems.push(`${f.name}: không có thẻ HDon (không phải hoá đơn điện tử)`); continue; }
    for (const h of hdons) {
      const tt = h.getElementsByTagName('TTChung')[0];
      const nban = h.getElementsByTagName('NBan')[0];
      const nmua = h.getElementsByTagName('NMua')[0];
      const toan = h.getElementsByTagName('TToan')[0];
      const date = toDate(text(tt, 'NLap'));
      const inv: AuthorityInvoiceInput = {
        invoiceForm: text(tt, 'KHMSHDon'), invoiceSerial: text(tt, 'KHHDon'), invoiceNo: text(tt, 'SHDon'), invoiceDate: date ?? '',
        sellerTaxCode: text(nban, 'MST'), sellerName: text(nban, 'Ten'), buyerTaxCode: text(nmua, 'MST'), buyerName: text(nmua, 'Ten'),
        totalBeforeTax: toNum(text(toan, 'TgTCThue')), totalTax: toNum(text(toan, 'TgTThue')), totalAmount: toNum(text(toan, 'TgTTTBSo')),
        statusText: '', checkResult: h.getElementsByTagName('MCCQT')[0] ? 'Đã cấp mã hóa đơn' : '',
      };
      if (!inv.invoiceSerial || !inv.invoiceNo || !date) { problems.push(`${f.name}: thiếu ký hiệu, số hoặc ngày lập`); continue; }
      (own && inv.sellerTaxCode.slice(0, 10) === own ? output : input).push(inv);
    }
  }
  return { input, output, problems };
}
