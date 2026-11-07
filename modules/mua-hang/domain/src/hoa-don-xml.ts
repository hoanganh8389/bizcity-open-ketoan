// [2026-11-06 10:15 PM Nguyễn Văn Thủy] MH22 — đọc hoá đơn điện tử XML của cổng thuế ra khuôn ParsedInvoice; hàm thuần, không gắn thư viện XML (đóng góp)
/**
 * ĐỌC HOÁ ĐƠN ĐIỆN TỬ XML (khuôn HDon của cơ quan thuế) ra ParsedInvoice. Máy chủ phân tích XML thành cây rồi đưa vào đây.
 *   TChat  1 hàng hoá · 2 khuyến mại (hàng tặng) · 3 chiết khấu thương mại · 4 ghi chú
 *   Dòng chiết khấu không phải hàng: cộng vào tổng chiết khấu, giữ nguyên văn trong data. Dòng ghi chú chỉ giữ trong data.
 *   Hoá đơn chỉ có chiết khấu: giữ thành dòng giảm tiền (số lượng -1) để không mất số âm của hoá đơn.
 *   Dòng hàng không số lượng mà trừ đi mới khớp tổng trên hoá đơn: NCC ghi sai loại, tính là chiết khấu.
 *   Dòng dịch vụ không ghi số lượng: coi là 1, đơn giá = thành tiền.
 */
import { invoiceNoShown, type ParsedInvoice } from './hoa-don.js';

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
  discountLines: { name: string; amount: number; taxRate: number | null }[];
  noteLines: string[];
  /** Phần mềm đã xử lý gì đặc biệt với hoá đơn này, ghi vào ghi chú để kế toán biết. */
  notices: string[];
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

  // Lưu số đúng như cổng thuế hiện: 00002328 là 2328. Số nguyên văn vẫn nằm trong tệp XML gốc đính kèm.
  const no = invoiceNoShown(text(head.SHDon));
  const sellerTaxCode = text(seller.MST);
  const date = text(head.NLap).slice(0, 10);
  if (!no) throw new Error('Hoá đơn thiếu số (SHDon)');
  if (!sellerTaxCode) throw new Error('Hoá đơn thiếu mã số thuế người bán');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Ngày lập hoá đơn không đọc được: "${text(head.NLap)}"`);

  const lines: ParsedInvoice['lines'] = [];
  const discountLines: GdtInvoice['discountLines'] = [];
  const noteLines: string[] = [];
  const noQtyLines: ParsedInvoice['lines'] = [];
  for (const r of rows) {
    const kind = text(r.TChat) || '1';
    const name = text(r.THHDVu);
    const amount = num(r.ThTien);
    if (kind === '4') { if (name) noteLines.push(name); continue; }
    // Có NCC ghi chiết khấu số dương, có NCC ghi số âm: đều là giảm tiền.
    if (kind === '3') { discountLines.push({ name, amount: Math.abs(amount), taxRate: gdtTaxRate(r.TSuat) }); continue; }
    let qty = num(r.SLuong);
    let price = num(r.DGia);
    if (!qty && !amount && kind === '1') { if (name) noteLines.push(name); continue; }
    const noQty = !qty;
    if (!qty) { qty = amount < 0 ? -1 : 1; price = price || Math.abs(amount); }
    if (price < 0) { qty = -qty; price = -price; }
    const line: ParsedInvoice['lines'][number] = {
      nccSku: text(r.MHHDVu).slice(0, 100), nccName: name.slice(0, 500), nccUnit: text(r.DVTinh).slice(0, 50), qty, price,
      discountAmount: num(r.STCKhau), amount, taxRate: gdtTaxRate(r.TSuat), isGift: kind === '2',
      ...(has(r.TThue) ? { taxAmount: num(r.TThue) } : {}),
    };
    lines.push(line);
    if (noQty && kind === '1' && amount > 0) noQtyLines.push(line);
  }

  const notices: string[] = [];
  const goods = () => lines.filter((l) => !l.isGift).reduce((s, l) => s + (l.amount ?? 0), 0);
  const sumDiscount = () => discountLines.reduce((s, d) => s + d.amount, 0);
  // NCC ghi dòng chiết khấu nhưng để loại hàng hoá, không số lượng: chỉ coi là chiết khấu khi trừ các dòng đó mới khớp tổng trên hoá đơn.
  if (has(pay.TgTCThue) && noQtyLines.length) {
    const header = num(pay.TgTCThue);
    const asGoods = goods() - sumDiscount();
    const free = noQtyLines.reduce((s, l) => s + (l.amount ?? 0), 0);
    if (Math.abs(asGoods - header) > 10 && Math.abs(asGoods - 2 * free - header) <= 10) {
      for (const l of noQtyLines) {
        lines.splice(lines.indexOf(l), 1);
        discountLines.push({ name: l.nccName, amount: l.amount ?? 0, taxRate: l.taxRate ?? null });
      }
      notices.push('Có dòng chiết khấu NCC ghi như dòng hàng: đã tính là chiết khấu vì khớp tổng trên hoá đơn');
    }
  }
  // Hoá đơn chỉ có chiết khấu (tích luỹ doanh số...): giữ thành dòng giảm tiền để số âm của hoá đơn không mất.
  const onlyDiscount = !lines.length && discountLines.length > 0;
  if (onlyDiscount) {
    for (const d of discountLines) lines.push({ nccSku: '', nccName: d.name.slice(0, 500), nccUnit: '', qty: -1, price: d.amount, discountAmount: 0, amount: -d.amount, taxRate: d.taxRate, isGift: false });
    discountLines.length = 0;
    notices.push('Hoá đơn chiết khấu thương mại, không có hàng: không lập phiếu nhập');
  }
  if (!lines.length) throw new Error('Hoá đơn không có dòng hàng nào đọc được');

  const discount = sumDiscount();
  const warnings: string[] = [];
  const paid = goods() - discount;
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
    discountLines, noteLines, notices, warnings,
  };
}

export interface GdtHeader {
  form?: string; series?: string; no: string; date: string; sellerTaxCode: string; sellerName?: string; sellerAddress?: string; buyerTaxCode?: string; buyerName?: string;
  totalBeforeTax: number; totalTax: number; total: number;
}

/**
 * Hoá đơn không mã: cổng thuế chỉ có bản xem, không có XML. Lấy đúng đầu hoá đơn và tổng tiền của cổng thuế, gộp thành một dòng;
 * không đọc dòng hàng từ HTML để khỏi sai. Thuế suất chỉ ghi khi khớp đúng một mức, còn lại để trống và giữ nguyên tiền thuế.
 */
export function gdtInvoiceFromHeader(h: GdtHeader): GdtInvoice {
  const no = invoiceNoShown(h.no);
  if (!no) throw new Error('Hoá đơn thiếu số');
  if (!h.sellerTaxCode) throw new Error('Hoá đơn thiếu mã số thuế người bán');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(h.date)) throw new Error(`Ngày lập hoá đơn không đọc được: "${h.date}"`);
  const before = h.totalBeforeTax, tax = h.totalTax;
  const rate = [0, 5, 8, 10].find((r) => Math.abs((before * r) / 100 - tax) <= 2) ?? null;
  return {
    parsed: {
      form: h.form ?? '', series: h.series ?? '', no, date: h.date, sellerTaxCode: h.sellerTaxCode, sellerName: h.sellerName ?? '', buyerTaxCode: h.buyerTaxCode ?? '',
      totalBeforeTax: before, totalTax: tax, total: h.total, totalDiscount: 0,
      lines: [{ nccSku: '', nccName: 'Hàng hoá, dịch vụ theo hoá đơn (xem bản đính kèm)', nccUnit: '', qty: before < 0 ? -1 : 1, price: Math.abs(before), discountAmount: 0, amount: before, taxRate: rate, taxAmount: tax, isGift: false }],
    },
    sellerAddress: h.sellerAddress ?? '', buyerName: h.buyerName ?? '', mccqt: '', currency: 'VND', related: null, discountLines: [], noteLines: [],
    notices: ['Hoá đơn không mã, cổng thuế không có XML: số tiền theo cổng thuế, dòng hàng xem bản đính kèm'], warnings: [],
  };
}

/** Hai MST cùng một đơn vị: bỏ đuôi chi nhánh ("0106933743-008" và "0106933743"). */
export const sameTaxRoot = (a: string, b: string) => a.trim().split('-')[0] === b.trim().split('-')[0];
