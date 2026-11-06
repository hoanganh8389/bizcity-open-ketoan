// [2026-11-06 10:15 PM Nguyễn Văn Thủy] MH22 — đọc hoá đơn điện tử XML của cổng thuế ra khuôn ParsedInvoice; hàm thuần, không gắn thư viện XML (đóng góp)
/**
 * ĐỌC HOÁ ĐƠN ĐIỆN TỬ XML (khuôn HDon của cơ quan thuế) ra ParsedInvoice. Máy chủ phân tích XML thành cây rồi đưa vào đây.
 *   TChat  1 hàng hoá · 2 khuyến mại (hàng tặng) · 3 chiết khấu thương mại · 4 ghi chú
 *   Dòng chiết khấu không phải hàng: cộng vào tổng chiết khấu, giữ nguyên văn trong data. Dòng ghi chú chỉ giữ trong data.
 *   Dòng dịch vụ không ghi số lượng: coi là 1, đơn giá = thành tiền.
 */
import type { ParsedInvoice } from './hoa-don.js';

export type XmlNode = Record<string, unknown>;
export interface GdtInvoice {
  parsed: ParsedInvoice & { date: string; sellerTaxCode: string };
  sellerAddress: string;
  buyerName: string;
  /** Mã của cơ quan thuế cấp cho hoá đơn. */
  mccqt: string;
  currency: string;
  /** Hoá đơn gốc mà hoá đơn này thay thế / điều chỉnh, nếu XML có ghi. */
  related: { kind: string; form: string; series: string; no: string; date: string } | null;
  /** Dòng chiết khấu và ghi chú, giữ nguyên văn. */
  discountLines: { name: string; amount: number }[];
  noteLines: string[];
  /** Cộng dòng khác tổng ghi trên hoá đơn. */
  warnings: string[];
}

const isNode = (v: unknown): v is XmlNode => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown) => (v === null || v === undefined || typeof v === 'object' ? '' : String(v).trim());
const num = (v: unknown) => { const x = Number(text(v)); return Number.isFinite(x) ? x : 0; };
const has = (v: unknown) => text(v) !== '';
const r2 = (x: number) => Math.round(x * 100) / 100;

/** Thuế suất trên hoá đơn: "8%" → 8 · "KHAC:5.26%" → 5.26 · KCT, KKKNT, trống → null (không chịu thuế). */
export function gdtTaxRate(v: unknown): number | null {
  const m = /^(?:KHAC:)?\s*(\d+(?:[.,]\d+)?)\s*%?$/i.exec(text(v));
  return m ? Number(m[1]!.replace(',', '.')) : null;
}

/** Tìm nút HDon: gốc của tệp, hoặc nằm trong gói bọc ngoài. */
function findHDon(root: XmlNode, depth = 0): XmlNode | null {
  if (isNode(root.DLHDon)) return root;
  if (isNode(root.HDon)) return findHDon(root.HDon, depth + 1);
  if (depth >= 5) return null;
  for (const v of Object.values(root)) {
    const found = isNode(v) ? findHDon(v, depth + 1) : null;
    if (found) return found;
  }
  return null;
}

/** Cây XML → hoá đơn. Sai khuôn hoặc thiếu trường bắt buộc: báo lỗi nói rõ thiếu gì. */
export function readGdtInvoice(root: XmlNode): GdtInvoice {
  const hdon = findHDon(root);
  const dl = hdon?.DLHDon;
  if (!hdon || !isNode(dl)) throw new Error('Tệp không phải hoá đơn điện tử (không thấy HDon / DLHDon)');
  const head = isNode(dl.TTChung) ? dl.TTChung : {};
  const body = isNode(dl.NDHDon) ? dl.NDHDon : {};
  const seller = isNode(body.NBan) ? body.NBan : {};
  const buyer = isNode(body.NMua) ? body.NMua : {};
  const pay = isNode(body.TToan) ? body.TToan : {};
  const list = isNode(body.DSHHDVu) ? body.DSHHDVu.HHDVu : undefined;
  const rows = (Array.isArray(list) ? list : list === undefined ? [] : [list]).filter(isNode);

  const no = text(head.SHDon);
  const sellerTaxCode = text(seller.MST);
  const date = text(head.NLap).slice(0, 10);
  if (!no) throw new Error('Hoá đơn thiếu số (SHDon)');
  if (!sellerTaxCode) throw new Error('Hoá đơn thiếu mã số thuế người bán');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Ngày lập hoá đơn không đọc được: "${text(head.NLap)}"`);

  const lines: ParsedInvoice['lines'] = [];
  const discountLines: GdtInvoice['discountLines'] = [];
  const noteLines: string[] = [];
  for (const r of rows) {
    const kind = text(r.TChat) || '1';
    const name = text(r.THHDVu);
    const amount = num(r.ThTien);
    if (kind === '4') { if (name) noteLines.push(name); continue; }
    if (kind === '3') { discountLines.push({ name, amount }); continue; }
    let qty = num(r.SLuong);
    let price = num(r.DGia);
    if (!qty && !amount && kind === '1') { if (name) noteLines.push(name); continue; }
    if (!qty) { qty = amount < 0 ? -1 : 1; price = price || Math.abs(amount); }
    if (price < 0) { qty = -qty; price = -price; }
    lines.push({
      nccSku: text(r.MHHDVu).slice(0, 100), nccName: name.slice(0, 500), nccUnit: text(r.DVTinh).slice(0, 50), qty, price,
      discountAmount: num(r.STCKhau), amount, taxRate: gdtTaxRate(r.TSuat), isGift: kind === '2',
      ...(has(r.TThue) ? { taxAmount: num(r.TThue) } : {}),
    });
  }
  if (!lines.length) throw new Error('Hoá đơn không có dòng hàng nào đọc được');

  const discount = discountLines.reduce((s, d) => s + d.amount, 0);
  const warnings: string[] = [];
  const paid = lines.filter((l) => !l.isGift).reduce((s, l) => s + (l.amount ?? 0), 0) - discount;
  if (has(pay.TgTCThue) && Math.abs(paid - num(pay.TgTCThue)) > 10) warnings.push(`Cộng dòng ${r2(paid).toLocaleString('vi-VN')} khác tổng tiền hàng trên hoá đơn ${num(pay.TgTCThue).toLocaleString('vi-VN')}`);
  const rel = isNode(head.TTHDLQuan) ? head.TTHDLQuan : null;

  return {
    parsed: {
      form: text(head.KHMSHDon), series: text(head.KHHDon), no, date, sellerTaxCode, sellerName: text(seller.Ten), buyerTaxCode: text(buyer.MST), lines,
      totalDiscount: has(pay.TTCKTMai) ? num(pay.TTCKTMai) : r2(discount),
      ...(has(pay.TgTCThue) ? { totalBeforeTax: num(pay.TgTCThue) } : {}),
      ...(has(pay.TgTThue) ? { totalTax: num(pay.TgTThue) } : {}),
      ...(has(pay.TgTTTBSo) ? { total: num(pay.TgTTTBSo) } : {}),
    },
    sellerAddress: text(seller.DChi), buyerName: text(buyer.Ten) || text(buyer.HVTNMHang), mccqt: text(hdon.MCCQT), currency: text(head.DVTTe) || 'VND',
    related: rel ? { kind: text(rel.TCHDon), form: text(rel.KHMSHDCLQuan), series: text(rel.KHHDCLQuan), no: text(rel.SHDCLQuan), date: text(rel.NLHDCLQuan) } : null,
    discountLines, noteLines, warnings,
  };
}

/** Hai MST cùng một đơn vị: bỏ đuôi chi nhánh ("0106933743-008" và "0106933743"). */
export const sameTaxRoot = (a: string, b: string) => a.trim().split('-')[0] === b.trim().split('-')[0];
