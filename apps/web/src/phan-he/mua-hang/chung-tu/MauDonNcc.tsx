/**
 * MẪU ĐƠN ĐẶT HÀNG GỬI NCC — đúng mẫu Excel bộ phận mua hàng đang dùng (NCC chỉ nhận mẫu này):
 *   tiêu đề "ĐƠN ĐẶT HÀNG"; khối Mã NPP / Tên NPP / Địa chỉ / Điện thoại; Ngày - giờ ĐH / Ngày giao hàng / Giao tại kho;
 *   dòng "Bộ phận mua hàng đề nghị…"; bảng 17 cột: STT, Mã SP, Mã vạch, Tên SP, Quy cách ĐVT/thùng, ĐVT, Đơn giá chưa VAT,
 *   SL Mua / KM, SL cần nhập (nền cam), Tồn kho (nền vàng), SL mua chưa nhập kho, Phân tích thông minh, % CK, Thành tiền CK,
 *   Thành tiền sau CK, Ghi chú; dòng "A – TỔNG TRỊ GIÁ HÀNG ĐẶT"; cuối: ghi chú đơn + tổng tiền.
 * XemMauNcc: xem ngay trên web (màu như Excel); xuatMauNcc: tải tệp .xlsx có màu, khổ ngang, Times New Roman.
 */
import { TAX_RATE, type PDoc, type PLine } from '@ketoan/contracts/mua-hang';
import { Modal } from '@/components/ui';

export interface MauNccInfo { code: string; name: string; address?: string; phone?: string; branchName: string; warehouse?: string }
interface Row { stt: number; sku: string; barcode: string; name: string; pack: string; unit: string; price: number; buy: number; gift: number; need: number | ''; stock: number | ''; pending: number | ''; analysis: [string, string][]; pct: number | ''; ck: number; after: number; note: string; newItem: boolean }

const fmt = (n: number | '' | undefined) => (n === '' || n === undefined || n === null ? '' : Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 }));
const dmy = (d?: string) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '');
/** Giờ đặt hàng: giờ lập đơn (đơn chưa ghi thì giờ hiện tại) + ngày đơn. */
const orderTime = (doc: PDoc) => `${(doc.createdAt ? new Date(doc.createdAt) : new Date()).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} ${dmy(doc.docDate)}`;

function rowsOf(doc: PDoc): { rows: Row[]; before: number; ck: number; after: number; qty: number } {
  const gifts = new Map<string, number>();
  for (const l of doc.lines.filter((x) => x.lineType !== 'buy')) gifts.set(l.sku || l.name, (gifts.get(l.sku || l.name) ?? 0) + l.qty);
  let before = 0, ckSum = 0, qty = 0;
  const rows = doc.lines.filter((l) => l.lineType === 'buy').map((l: PLine, i): Row => {
    const rate = TAX_RATE[l.taxCode] ?? 0;
    const price = doc.priceIncludesVat ? Math.round(l.price / (1 + rate / 100)) : l.price;
    const gross = Math.round(price * l.qty);
    const ck = l.discountPct ? Math.round((gross * l.discountPct) / 100) : Math.round(l.discountAmt ?? 0);
    before += gross; ckSum += ck; qty += l.qty;
    const s = l.stockInfo ?? {};
    const a: [string, string][] = l.stockInfo ? [['BH tháng liền kề', fmt(s.banThangTruoc)], ['Doanh số 1 tuần', fmt(s.banShop)], ['Tồn max kho', fmt(s.maxKho)], ['Hàng đang đi đường', fmt(s.diDuong)], ['Tồn max shop', fmt(s.maxShop)], ['Tồn shop', fmt(s.tonShop)]] : [];
    return {
      stt: i + 1, sku: l.sku || (l.nccSku ? `(NCC: ${l.nccSku})` : 'HÀNG MỚI'), barcode: l.barcode ?? '', name: l.name || l.nccName || '', pack: l.pack ? fmt(l.pack) : '', unit: l.unit, price, buy: l.qty, gift: gifts.get(l.sku || l.name) ?? 0,
      need: s.need ?? '', stock: s.tonKho ?? '', pending: s.dangDat ?? '', analysis: a, pct: l.discountPct ?? '', ck, after: gross - ck, note: l.note ?? '', newItem: !l.sku,
    };
  });
  const ordDisc = doc.orderDiscount?.pct ? Math.round(((before - ckSum) * doc.orderDiscount.pct) / 100) : Math.round(doc.orderDiscount?.amount ?? 0);
  return { rows, before, ck: ckSum + ordDisc, after: before - ckSum - ordDisc, qty };
}

/* ------------------------------------------------------------------ xem trên web */

const C = { need: '#FFC000', stock: '#FFF200', head: '#ffffff', line: '#111827' };
const cell: React.CSSProperties = { border: `1px solid ${C.line}`, padding: '3px 5px', fontFamily: '"Times New Roman", serif', fontSize: 13, verticalAlign: 'middle' };

export function XemMauNcc({ doc, info, onClose, onExport }: { doc: PDoc; info: MauNccInfo; onClose: () => void; onExport: () => void }) {
  const t = rowsOf(doc);
  const hd = (x: React.ReactNode, o: React.CSSProperties = {}, span: { r?: number; c?: number } = {}) => <th rowSpan={span.r} colSpan={span.c} style={{ ...cell, fontWeight: 700, textAlign: 'center', background: C.head, ...o }}>{x}</th>;
  return (
    <Modal wide title={`Mẫu đơn đặt hàng gửi NCC — ${doc.docNo || 'đơn mới'}`} onClose={onClose} footer={<><button className="btn btn-primary" onClick={onExport}>Xuất Excel đúng mẫu</button><button className="btn" onClick={() => window.print()}>In</button><button className="btn" onClick={onClose}>Đóng</button></>}>
      <div className="full" style={{ overflow: 'auto', maxHeight: '70vh', background: '#fff', padding: 12, border: '1px solid var(--line)' }}>
        <div style={{ textAlign: 'center', fontFamily: '"Times New Roman", serif', fontSize: 24, fontWeight: 700, marginBottom: 10 }}>ĐƠN ĐẶT HÀNG</div>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontFamily: '"Times New Roman", serif', fontSize: 14, marginBottom: 8 }}><tbody>
          {[['Mã NPP:', info.code, 'Ngày - giờ ĐH', orderTime(doc)], ['Tên NPP:', info.name, 'Ngày Giao hàng', dmy(doc.deliveryDate)], ['Địa chỉ', info.address ?? '', 'Giao tại kho:', info.warehouse || info.branchName], ['Điện thoại NPP:', info.phone ?? '', '', '']].map(([a, b, c, d]) => (
            <tr key={a}><td style={{ fontWeight: 700, width: 130 }}>{a}</td><td style={{ background: '#F3F4F6', borderBottom: '1px dotted #111' }}>{b}</td><td style={{ width: 20 }} /><td style={{ fontWeight: 700, width: 140 }}>{c}</td><td style={{ background: '#F3F4F6', borderBottom: c ? '1px dotted #111' : 0, fontWeight: c === 'Ngày Giao hàng' ? 700 : 400, width: 260 }}>{d}</td></tr>
          ))}
        </tbody></table>
        <div style={{ fontFamily: '"Times New Roman", serif', fontStyle: 'italic', fontWeight: 700, borderBottom: '1px solid #111', paddingBottom: 4, marginBottom: 6 }}>Bộ phận mua hàng đề nghị Quý Nhà phân phối xuất hàng và hóa đơn khi giao hàng :</div>
        <table style={{ borderCollapse: 'collapse', minWidth: 1500 }}>
          <thead>
            <tr>{hd('STT', {}, { r: 2 })}{hd('Mã SP', {}, { r: 2 })}{hd('Mã vạch', {}, { r: 2 })}{hd('Tên sản phẩm', { minWidth: 280 }, { r: 2 })}{hd(<>Quy cách<br />ĐVT/thùng</>, {}, { r: 2 })}{hd('ĐVT', {}, { r: 2 })}{hd(<>Đơn giá chưa<br />VAT</>, {}, { r: 2 })}{hd('Số lượng', {}, { c: 2 })}
              {hd(<>Số lượng<br />cần nhập<br />tháng này</>, { background: C.need }, { r: 2 })}{hd('Tồn kho', { background: C.stock }, { r: 2 })}{hd(<>SL mua<br />chưa nhập kho</>, {}, { r: 2 })}{hd(<>Phân tích<br />thông minh</>, { minWidth: 170 }, { r: 2 })}{hd(<>% chiết<br />khấu</>, {}, { r: 2 })}{hd(<>Thành<br />tiền CK</>, {}, { r: 2 })}{hd(<>Thành tiền sau<br />CK</>, {}, { r: 2 })}{hd('Ghi chú', { minWidth: 180 }, { r: 2 })}</tr>
            <tr>{hd('Mua')}{hd('KM')}</tr>
            <tr style={{ fontStyle: 'italic', fontSize: 12 }}>{['1', '', '', '2', '3', '4', '5', '6', '7', '', '', '', '', '8', '9', '10= 5 x 6 -9', ''].map((x, i) => <td key={i} style={{ ...cell, textAlign: 'center', fontWeight: 700, background: i === 9 ? C.need : i === 10 ? C.stock : '#fff' }}>{x}</td>)}</tr>
          </thead>
          <tbody>
            <tr><td style={{ ...cell, fontWeight: 700 }}>A</td><td colSpan={14} style={{ ...cell, fontWeight: 700 }}>TỔNG TRỊ GIÁ HÀNG ĐẶT</td><td colSpan={2} style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{fmt(t.after)}</td></tr>
            {t.rows.map((r) => (
              <tr key={r.stt}>
                <td style={{ ...cell, textAlign: 'center' }}>{r.stt}</td><td style={{ ...cell, color: r.newItem ? '#b42318' : undefined }}>{r.sku}</td><td style={cell}>{r.barcode}</td><td style={cell}>{r.name}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{r.pack}</td><td style={{ ...cell, textAlign: 'center' }}>{r.unit}</td><td style={{ ...cell, textAlign: 'right' }}>{fmt(r.price)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{fmt(r.buy)}</td><td style={{ ...cell, textAlign: 'right' }}>{r.gift ? fmt(r.gift) : ''}</td>
                <td style={{ ...cell, textAlign: 'right', background: C.need, fontWeight: 700 }}>{fmt(r.need)}</td><td style={{ ...cell, textAlign: 'right', background: C.stock }}>{fmt(r.stock)}</td><td style={{ ...cell, textAlign: 'right' }}>{fmt(r.pending)}</td>
                <td style={{ ...cell, background: '#F8FBFF', fontFamily: 'Arial', fontSize: 11 }}>{r.analysis.map(([k, v]) => <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span>{k}</span><b>{v}</b></div>)}</td>
                <td style={{ ...cell, textAlign: 'right' }}>{fmt(r.pct)}</td><td style={{ ...cell, textAlign: 'right' }}>{r.ck ? fmt(r.ck) : ''}</td><td style={{ ...cell, textAlign: 'right', fontWeight: 700, background: '#F8FAFC' }}>{fmt(r.after)}</td><td style={cell}>{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 16, marginTop: 12, fontFamily: '"Times New Roman", serif' }}>
          <div style={{ border: '1px solid #111', padding: 6, minHeight: 70 }}><b>Ghi chú đơn đặt hàng</b><div style={{ whiteSpace: 'pre-wrap' }}>{doc.note}</div></div>
          <table style={{ borderCollapse: 'collapse' }}><tbody>
            {[['Tổng tiền hàng chưa CK', t.before], ['Tổng chiết khấu', t.ck], ['Tổng sau CK', t.after], ['Tổng SL mua', t.qty]].map(([a, b]) => <tr key={a as string}><td style={cell}>{a}</td><td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{fmt(b as number)}</td></tr>)}
            {doc.budget ? <tr><td style={cell}>Ngân sách mua · {doc.budget - t.after >= 0 ? 'còn' : 'vượt'}</td><td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: doc.budget - t.after >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(Math.abs(doc.budget - t.after))}</td></tr> : null}
          </tbody></table>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ xuất Excel đúng mẫu */

export async function xuatMauNcc(doc: PDoc, info: MauNccInfo): Promise<void> {
  const ExcelJS = (await import('exceljs')).default;
  const t = rowsOf(doc);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ERP mua hàng';
  const ws = wb.addWorksheet('Don dat hang', { views: [{ showGridLines: false, state: 'frozen', ySplit: 11 }], pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.15, footer: 0.15 } } });
  ws.columns = [6, 16, 18, 58, 8, 8, 15, 11, 9, 15, 11, 15, 26, 9, 11, 18, 32].map((width) => ({ width }));
  const argb = (h: string) => `FF${h.replace('#', '').toUpperCase()}`;
  const fill = (h: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: argb(h) } });
  const side = { style: 'thin' as const, color: { argb: argb('#111827') } };
  const border = { top: side, left: side, bottom: side, right: side };
  const font = (o: Partial<{ size: number; bold: boolean; italic: boolean; name: string; color: string }> = {}) => ({ name: o.name ?? 'Times New Roman', size: o.size ?? 11, bold: o.bold, italic: o.italic, color: { argb: argb(o.color ?? '#000000') } });
  type Style = Partial<{ font: ReturnType<typeof font>; alignment: Record<string, unknown>; fill: ReturnType<typeof fill>; border: typeof border | Record<string, unknown>; numFmt: string }>;
  const style = (c: { font?: unknown; alignment?: unknown; fill?: unknown; border?: unknown; numFmt?: string }, s: Style) => { Object.assign(c, s); };
  const merge = (r1: number, c1: number, r2: number, c2: number, value: unknown, s: Style = {}) => {
    if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
    const c = ws.getCell(r1, c1); c.value = value as never; style(c, s);
    for (let r = r1; r <= r2; r++) for (let k = c1; k <= c2; k++) if (s.border) ws.getCell(r, k).border = s.border as never;
  };
  const head: Style = { font: font({ bold: true }), alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }, fill: fill('#FFFFFF'), border };
  const data: Style = { font: font(), alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }, border };
  const right: Style = { ...data, alignment: { vertical: 'middle', horizontal: 'right', wrapText: true }, numFmt: '#,##0.##' };
  const left: Style = { ...data, alignment: { vertical: 'middle', horizontal: 'left', wrapText: true } };
  const money: Style = { ...right, numFmt: '#,##0' };
  ws.getRow(1).height = 31;
  merge(1, 1, 1, 17, 'ĐƠN ĐẶT HÀNG', { font: font({ size: 20, bold: true }), alignment: { vertical: 'middle', horizontal: 'center' } });
  const label: Style = { font: font({ bold: true }), alignment: { vertical: 'middle', horizontal: 'left' } };
  const input: Style = { font: font(), alignment: { vertical: 'middle', horizontal: 'left', wrapText: true }, fill: fill('#F3F4F6'), border: { bottom: { style: 'dotted', color: { argb: argb('#111827') } } } };
  ([[3, 'Mã NPP:', info.code], [4, 'Tên NPP:', info.name], [5, 'Địa chỉ', info.address ?? ''], [6, 'Điện thoại NPP:', info.phone ?? '']] as const).forEach(([r, a, b]) => { merge(r, 1, r, 1, a, label); merge(r, 2, r, 9, b, input); });
  ([[3, 'Ngày - giờ ĐH', orderTime(doc)], [4, 'Ngày Giao hàng', dmy(doc.deliveryDate)], [5, 'Giao tại kho:', info.warehouse || info.branchName]] as const).forEach(([r, a, b]) => {
    merge(r, 11, r, 12, a, label); merge(r, 13, r, 16, b, r === 4 ? { ...input, font: font({ bold: true }) } : input);
  });
  ws.getRow(7).height = 22;
  merge(7, 1, 7, 17, 'Bộ phận mua hàng đề nghị Quý Nhà phân phối xuất hàng và hóa đơn khi giao hàng :', { font: font({ bold: true, italic: true }), alignment: { vertical: 'middle', horizontal: 'left' }, border: { bottom: side } });
  ws.getRow(8).height = 44; ws.getRow(9).height = 24;
  const H: [number, string, string?][] = [[1, 'STT'], [2, 'Mã SP'], [3, 'Mã vạch'], [4, 'Tên sản phẩm'], [5, 'Quy cách\nĐVT/thùng'], [6, 'ĐVT'], [7, 'Đơn giá chưa\nVAT'], [10, 'Số lượng\ncần nhập\ntháng này', '#FFC000'], [11, 'Tồn kho', '#FFF200'], [12, 'SL mua\nchưa nhập kho'], [13, 'Phân tích\nthông minh'], [14, '% chiết\nkhấu'], [15, 'Thành\ntiền CK'], [16, 'Thành tiền sau\nCK'], [17, 'Ghi chú']];
  for (const [c, text, bg] of H) merge(8, c, 9, c, text, bg ? { ...head, fill: fill(bg) } : head);
  merge(8, 8, 8, 9, 'Số lượng', head); merge(9, 8, 9, 8, 'Mua', head); merge(9, 9, 9, 9, 'KM', head);
  ws.getRow(10).height = 18;
  for (let c = 1; c <= 17; c++) style(ws.getCell(10, c), { ...data, font: font({ size: 10, italic: true, bold: true }), fill: fill(c === 10 ? '#FFC000' : c === 11 ? '#FFF200' : '#FFFFFF') });
  ([[1, '1'], [4, '2'], [5, '3'], [6, '4'], [7, '5'], [8, '6'], [9, '7'], [14, '8'], [15, '9'], [16, '10= 5 x 6 -9']] as const).forEach(([c, v]) => { ws.getCell(10, c).value = v; });
  ws.getRow(11).height = 20;
  for (let c = 1; c <= 17; c++) style(ws.getCell(11, c), { ...left, font: font({ bold: true }) });
  ws.getCell(11, 1).value = 'A';
  merge(11, 2, 11, 15, 'TỔNG TRỊ GIÁ HÀNG ĐẶT', { ...left, font: font({ bold: true }) });
  merge(11, 16, 11, 17, t.after, { ...money, font: font({ bold: true }) });
  let r = 12;
  for (const x of t.rows) {
    ws.getRow(r).height = x.analysis.length ? 74 : 22;
    const vals: unknown[] = [x.stt, x.sku, x.barcode, x.name, x.pack ? Number(String(x.pack).replace(/\./g, '').replace(',', '.')) : '', x.unit, x.price, x.buy, x.gift || '', x.need, x.stock, x.pending, x.analysis.map(([k, v]) => `${k}: ${v}`).join('\n'), x.pct, x.ck || '', x.after, x.note];
    vals.forEach((v, i) => { const c = ws.getCell(r, i + 1); c.value = v as never; style(c, data); });
    for (const c of [2, 3, 4, 13, 17]) style(ws.getCell(r, c), left);
    for (const c of [5, 8, 9, 10, 11, 12, 14]) style(ws.getCell(r, c), right);
    for (const c of [7, 15, 16]) style(ws.getCell(r, c), money);
    style(ws.getCell(r, 10), { ...right, fill: fill('#FFC000'), font: font({ bold: true }) });
    style(ws.getCell(r, 11), { ...right, fill: fill('#FFF200') });
    style(ws.getCell(r, 13), { ...left, font: font({ name: 'Arial', size: 8, color: '#111827' }), fill: fill('#F8FBFF') });
    style(ws.getCell(r, 16), { ...money, font: font({ bold: true }), fill: fill('#F8FAFC') });
    if (x.newItem) style(ws.getCell(r, 2), { ...left, font: font({ color: '#B42318', bold: true }) });
    r++;
  }
  r += 1;
  merge(r, 1, r, 11, 'Ghi chú đơn đặt hàng', { font: font({ name: 'Arial', size: 10, bold: true, color: '#334155' }), alignment: { vertical: 'middle', horizontal: 'left' }, fill: fill('#F8FAFC'), border });
  merge(r + 1, 1, r + 4, 11, doc.note ?? '', { font: font({ name: 'Arial', size: 10, color: '#334155' }), alignment: { vertical: 'top', horizontal: 'left', wrapText: true }, border });
  ([['Tổng tiền hàng chưa CK', t.before], ['Tổng chiết khấu', t.ck], ['Tổng sau CK', t.after], ['Tổng SL mua', t.qty]] as const).forEach(([a, b], i) => {
    merge(r + i, 12, r + i, 15, a, left);
    merge(r + i, 16, r + i, 17, b, { ...(i === 3 ? right : money), font: font({ bold: true }) });
  });
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = `${doc.docNo || 'don-dat-hang'}-${info.code}.xlsx`; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
