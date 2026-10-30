/**
 * MẪU IN chứng từ mua hàng (MH03) — dựng trên khung in dùng chung (components/print), mẫu theo loại phiếu (mẫu đầu là mặc định).
 *
 * Bố cục dựng theo tên mẫu HTsoft (Crystal .rpt, chưa trích được bố cục chi tiết) và mẫu chuẩn TT200:
 *   Đơn đặt hàng            rptPhieuPO.rpt (A4) · Biên bản bàn giao hàng hoá rptBBBGTBPO.rpt (A4)
 *   Nhập mua / nhận quà     Phiếu nhập kho 01-VT có giá rptPhieunhapkho.rpt (A4), A5 ngang rptPhieunhapkhoM2.rpt, không giá rptPhieunhapkhoM3.rpt
 *   Trả hàng NCC            rptMuahoantra.rpt (A4), rptMuahoantra_8cm.rpt (giấy cuộn 80mm)
 *   Đổi hàng NCC            không có mẫu HTsoft: hàng trả đi / hàng nhận về, chênh lệch
 *   Xuất quà tặng           Phiếu xuất kho 02-VT (TT200)
 *   Ứng trước / trả tiền    Phiếu chi 02-TT Phieuchi.rpt (A5 ngang); chuyển khoản thêm Ủy nhiệm chi rptUNC001.rpt
 *   Chi phí mua hàng        Phiếu chi chung Phieuchichung.rpt; bảng phân bổ chi phí vào mã hàng
 *   Thưởng / CK cuối kỳ     Biên bản xác nhận chiết khấu / thưởng (không có mẫu HTsoft)
 * Số liệu in lấy từ máy chủ (purchaseApi.get: phiếu đã ghi + bảng tính, bút toán) — in đúng bản đã ghi, không phải bản đang sửa.
 */
import { COST_TYPES, TAX_RATE, amountTax, giftLineValue, termText, type DocCalc, type Entry, type LineCalc, type PDoc } from '@ketoan/contracts/mua-hang';
import { date } from '@/lib/format';
import { BillForm, CASH_SIGNS, CashForm, Dots, Fields, Foot, OrgHead, Signs, StockForm, Table, Title, UncForm, invoiceText, m, mb, opt, qty, sumQty, words, type BillData, type CashData, type Col, type PrintCtx, type PrintTemplate, type StockData, type UncData } from '@/components/print';
import { GIFT_SOURCE, KIND_LABEL, purchaseApi, type StoredDoc, type useNames } from '../du-lieu';
import './mauIn.css';

/** Một phiếu sẵn sàng để in: phiếu + bảng tính của máy chủ + thông tin NCC, kho, phiếu liên quan. */
export interface PhieuIn {
  doc: StoredDoc;
  calc: DocCalc;
  /** Bút toán chi tiền (Có TK tiền mặt / tiền gửi) — góc Nợ / Có của phiếu chi. */
  chiTien: Entry[];
  ncc: { code: string; name: string; address: string; taxCode: string; phone: string; bankAccount: string; bankName: string; contact: string };
  /** Số các phiếu liên quan (phiếu nhập gốc, đơn đặt…). */
  lienQuan: string[];
}

/** Nạp đủ một phiếu để in (phiếu đã ghi, bảng tính, bút toán; thông tin ngân hàng NCC khi chi chuyển khoản). */
export async function layPhieuIn(id: string, h: { names: ReturnType<typeof useNames>; docs: StoredDoc[] }): Promise<PhieuIn> {
  const { doc, analysis } = await purchaseApi.get(id);
  const unc = (doc.kind === 'payment' || doc.kind === 'prepayment') && doc.method === 'bank';
  const prof = unc && doc.partnerCode ? await purchaseApi.supplier(doc.partnerCode).catch(() => null) : null;
  const p = h.names.partner(doc.partnerCode);
  const tien = [analysis.accounts.cash, analysis.accounts.bank];
  return {
    doc, calc: analysis.calc, chiTien: analysis.entries.filter((e) => tien.includes(e.credit)),
    ncc: {
      code: doc.partnerCode, name: p?.name ?? prof?.partner.name ?? h.names.partnerName(doc.partnerCode),
      address: p?.address ?? prof?.partner.address ?? '', taxCode: p?.taxCode ?? prof?.partner.taxCode ?? '', phone: prof?.partner.phone ?? '',
      bankAccount: prof?.partner.bankAccount ?? '', bankName: prof?.partner.bankName ?? '', contact: prof?.partner.contactName ?? '',
    },
    lienQuan: (doc.refIds ?? []).map((r) => h.docs.find((d) => d.id === r)?.docNo ?? '').filter(Boolean),
  };
}

const nccText = (p: PhieuIn) => (p.ncc.name ? `${p.ncc.name}${p.ncc.code && p.ncc.code !== p.ncc.name ? ` (${p.ncc.code})` : ''}` : '');
const rate = (code?: string) => (!code ? '' : code === 'KKKN' ? 'KCT' : code in TAX_RATE ? `${TAX_RATE[code]}%` : code);
/** "Chi nhánh — kho mã · tên": phân kho của phiếu (đơn đặt: kho giao); trống = kho mặc định của chi nhánh (như sổ kho tự gán). */
const khoText = (p: PhieuIn, ctx: PrintCtx) => `${ctx.branchName(p.doc.branchCode)} — kho ${ctx.kho(p.doc.branchCode, p.doc.warehouseCode || p.doc.deliveryWarehouse)}`;
const giftLine = (l: LineCalc) => l.lineType !== 'buy';
const SETTLE: Record<NonNullable<PDoc['settle']>, string> = { offset: 'Bù trừ công nợ', pay: 'Thanh toán bổ sung phần chênh lệch', refund: 'Nhà cung cấp hoàn tiền phần chênh lệch' };

/** Tên hàng + lô / hạn dùng, đánh dấu hàng khuyến mại. */
const tenHang = (l: LineCalc) => (
  <>{l.name || l.nccName || ''}{giftLine(l) ? <i> (hàng KM)</i> : null}{(l.lotNo || l.expDate) && <div className="mh-sub">{l.lotNo ? `Lô ${l.lotNo}` : ''}{l.expDate ? ` · HSD ${date(l.expDate)}` : ''}</div>}</>
);

/** Bảng hàng có giá: đơn giá như trên phiếu (gồm hay chưa VAT), CK dòng + CK đơn phân bổ, thành tiền trước thuế, thuế. */
function priceCols(d: PDoc, compact?: boolean): Col<LineCalc>[] {
  return [
    { h: 'STT', w: 28, center: true, v: (_, i) => i + 1 },
    { h: 'Mã hàng', w: compact ? 70 : 84, v: (l) => l.sku },
    { h: 'Tên hàng hoá', v: tenHang },
    { h: 'ĐVT', w: 42, center: true, v: (l) => l.unit },
    { h: 'SL', w: 46, num: true, v: (l) => qty(l.qty) },
    { h: d.priceIncludesVat ? 'Đơn giá (gồm VAT)' : 'Đơn giá', w: 76, num: true, v: (l) => (giftLine(l) ? '' : mb(l.price)) },
    ...(compact ? [] : [{ h: 'Chiết khấu', w: 68, num: true, v: (l: LineCalc) => mb(l.lineDiscount + l.orderDiscount) }]),
    { h: 'Thành tiền trước thuế', w: 88, num: true, v: (l) => (giftLine(l) ? '' : m(l.beforeTax)) },
    { h: 'Thuế', w: 38, center: true, v: (l) => rate(l.taxCode) },
    { h: 'Tiền thuế', w: 72, num: true, v: (l) => mb(l.tax) },
  ];
}

/** Phần cộng tiền của phiếu hàng có giá. */
function TongTien({ c, label }: { c: DocCalc; label: string }) {
  const total = c.beforeTax + c.tax;
  return (
    <>
      <table className="pd-fields" style={{ width: '58%', marginLeft: 'auto' }}>
        <tbody>
          <tr><td>Tiền hàng:</td><td className="pd-right">{m(c.gross)}</td></tr>
          {c.lineDiscount + c.orderDiscount ? <tr><td>Chiết khấu (dòng + trên đơn):</td><td className="pd-right">− {m(c.lineDiscount + c.orderDiscount)}</td></tr> : null}
          <tr><td>Cộng tiền hàng trước thuế:</td><td className="pd-right">{m(c.beforeTax)}</td></tr>
          <tr><td>Tiền thuế GTGT:</td><td className="pd-right">{m(c.tax)}</td></tr>
          <tr><td><b>{label}:</b></td><td className="pd-right"><b>{m(total)}</b></td></tr>
        </tbody>
      </table>
      <div className="pd-words">Số tiền viết bằng chữ: <i>{words(total)}</i></div>
    </>
  );
}

/* ------------------------------------------------------------------ đơn đặt hàng */

/** Đơn đặt hàng / đề nghị nhập hàng (rptPhieuPO). */
function DonDatSheet({ p, ctx }: { p: PhieuIn; ctx: PrintCtx }) {
  const d = p.doc;
  return (
    <>
      <OrgHead ctx={ctx} branchCode={d.branchCode} extra={ctx.org.phone ? <div>ĐT: {ctx.org.phone}</div> : undefined} />
      <Title title="ĐƠN ĐẶT HÀNG" sub="(Đề nghị nhập hàng)" date={d.docDate} no={d.docNo} />
      <Fields rows={[
        ['Nhà cung cấp', <b>{nccText(p)}</b>],
        ...opt(p.ncc.taxCode, 'Mã số thuế', p.ncc.taxCode),
        ['Địa chỉ', p.ncc.address],
        ['Ngày giao hàng', d.deliveryDate ? date(d.deliveryDate) : ''],
        ['Giao tại (kho nhận)', khoText(p, ctx)],
        ...opt(d.term, 'Điều khoản thanh toán', d.term ? termText(d.term) : ''),
        ...opt(d.note, 'Ghi chú', d.note),
      ]} />
      <Table rows={p.calc.lines} minRows={3} cols={priceCols(d)} />
      <TongTien c={p.calc} label="Tổng cộng tiền đặt hàng" />
      <Signs date={d.docDate} items={[{ title: 'Người lập', name: d.createdByName }, { title: 'Trưởng bộ phận mua hàng' }, { title: 'Kế toán trưởng' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }]} />
      <Foot ctx={ctx} />
    </>
  );
}

/** Biên bản bàn giao hàng hoá theo đơn đặt (rptBBBGTBPO): SL đặt, SL thực giao, tình trạng ghi tay khi nhận. */
function BanGiaoSheet({ p, ctx }: { p: PhieuIn; ctx: PrintCtx }) {
  const d = p.doc;
  return (
    <>
      <OrgHead ctx={ctx} branchCode={d.branchCode} />
      <Title title="BIÊN BẢN BÀN GIAO HÀNG HOÁ" no={d.docNo} />
      <p className="mh-p">Hôm nay, {dayLower()}, tại {khoText(p, ctx)}, chúng tôi gồm:</p>
      <div className="mh-sec">BÊN GIAO (Bên A): {p.ncc.name || '..........'}</div>
      <Fields rows={[['Địa chỉ', p.ncc.address], ...opt(p.ncc.taxCode, 'Mã số thuế', p.ncc.taxCode), ['Đại diện', <><Dots /> Chức vụ: ..........................</>]]} />
      <div className="mh-sec">BÊN NHẬN (Bên B): {ctx.org.name}{ctx.branchName(d.branchCode) && ctx.branchName(d.branchCode) !== ctx.org.name ? ` — ${ctx.branchName(d.branchCode)}` : ''}</div>
      <Fields rows={[['Địa chỉ', ctx.org.address], ...opt(ctx.org.taxCode, 'Mã số thuế', ctx.org.taxCode), ['Đại diện', <><Dots /> Chức vụ: ..........................</>]]} />
      <p className="mh-p">Hai bên cùng tiến hành giao nhận hàng hoá theo đơn đặt hàng số <b>{d.docNo}</b> ngày {date(d.docDate)}{d.deliveryDate ? `, ngày giao dự kiến ${date(d.deliveryDate)}` : ''} như sau:</p>
      <Table rows={p.calc.lines} minRows={3} cols={[
        { h: 'STT', w: 28, center: true, v: (_, i) => i + 1 },
        { h: 'Mã hàng', w: 84, v: (l) => l.sku },
        { h: 'Tên hàng hoá', v: tenHang },
        { h: 'ĐVT', w: 42, center: true, v: (l) => l.unit },
        { h: 'SL đặt', w: 54, num: true, v: (l) => qty(l.qty) },
        { h: 'SL thực giao', w: 62, num: true, v: () => '' },
        { h: 'Số lô / HSD', w: 80, v: () => '' },
        { h: 'Tình trạng hàng hoá', w: 110, v: () => '' },
      ]} foot={<tr><td colSpan={4} className="c">Cộng</td><td className="num">{qty(sumQty(p.calc.lines))}</td><td /><td /><td /></tr>} />
      <p className="mh-p">Bên B đã kiểm tra số lượng, quy cách, hạn sử dụng và tình trạng hàng hoá như bảng trên. Biên bản lập thành 02 bản, mỗi bên giữ 01 bản có giá trị như nhau.</p>
      <Signs items={[{ title: 'ĐẠI DIỆN BÊN GIAO' }, { title: 'ĐẠI DIỆN BÊN NHẬN' }]} />
      <Foot ctx={ctx} />
    </>
  );
}
/** "ngày … tháng … năm …" để trống ghi tay (biên bản lập lúc giao hàng). */
const dayLower = () => 'ngày ...... tháng ...... năm ..........';

/* ------------------------------------------------------------------ nhập kho */

/** Giá trị nhập kho từng dòng: nhập mua = tiền trước thuế sau CK (hàng KM giá 0); nhận quà = giá trị hợp lý trên dòng. */
const giaTri = (p: PhieuIn, l: LineCalc) => (p.doc.kind === 'gift_in' ? giftLineValue(l) : l.beforeTax);
const theoText = (p: PhieuIn) => {
  const d = p.doc;
  if (d.kind === 'gift_in') return `Hàng tặng / quà không hoá đơn${d.gift ? ` — ${GIFT_SOURCE[d.gift.source] ?? d.gift.source}${d.gift.program ? `, chương trình ${d.gift.program}` : ''}` : ''}`;
  return [d.invoice?.no ? `Hoá đơn số ${invoiceText(d.invoice)} của ${p.ncc.name}` : '', p.lienQuan.length ? `đơn đặt ${p.lienQuan.join(', ')}` : ''].filter(Boolean).join('; ');
};

/** Phiếu nhập kho 01-VT (mẫu chung StockForm): có giá (A4 / A5 ngang) hoặc chỉ số lượng, số lô cho thủ kho. */
const nhapKho = (p: PhieuIn, ctx: PrintCtx, o: { compact?: boolean; noPrice?: boolean } = {}): StockData => {
  const d = p.doc;
  const lot = (l: LineCalc) => [l.lotNo && `Lô ${l.lotNo}`, l.expDate && `HSD ${date(l.expDate)}`].filter(Boolean).join(' · ');
  return {
    dir: 'in', branchCode: d.branchCode, docNo: d.docNo, date: d.docDate, person: nccText(p), reason: theoText(p), warehouse: khoText(p, ctx), note: d.note,
    price: o.noPrice ? 'none' : 'value', compact: o.compact, attach: d.invoice?.no ? `Hoá đơn ${invoiceText(d.invoice)}` : '',
    totalNote: d.kind === 'receipt' && p.calc.tax ? <span className="pd-note"> — chưa gồm thuế GTGT {m(p.calc.tax)}</span> : undefined,
    lines: p.calc.lines.map((l) => ({ sku: l.sku, name: <>{l.name}{giftLine(l) ? <i> (hàng KM)</i> : null}</>, unit: l.unit, qty: l.qty, amount: giaTri(p, l), lot: lot(l) })),
    signs: [{ title: 'Người lập phiếu', name: d.createdByName }, { title: 'Người giao hàng' }, { title: 'Thủ kho' }, ...(o.noPrice ? [] : [{ title: 'Kế toán trưởng', note: '(Hoặc bộ phận có nhu cầu nhập)' }])],
  };
};

/* ------------------------------------------------------------------ trả / đổi hàng */

/** Phiếu xuất trả hàng nhà cung cấp có giá, thuế (rptMuahoantra). */
function TraHangSheet({ p, ctx }: { p: PhieuIn; ctx: PrintCtx }) {
  const d = p.doc;
  return (
    <>
      <OrgHead ctx={ctx} branchCode={d.branchCode} extra={ctx.org.phone ? <div>ĐT: {ctx.org.phone}</div> : undefined} />
      <Title title="PHIẾU XUẤT TRẢ HÀNG NHÀ CUNG CẤP" date={d.docDate} no={d.docNo} />
      <Fields rows={[
        ['Nhà cung cấp', <b>{nccText(p)}</b>],
        ...opt(p.ncc.taxCode, 'Mã số thuế', p.ncc.taxCode),
        ['Địa chỉ', p.ncc.address],
        ['Xuất tại kho', khoText(p, ctx)],
        ['Lý do trả', d.reason ?? ''],
        ...opt(p.lienQuan.length, 'Theo phiếu nhập', p.lienQuan.join(', ')),
        ...opt(d.invoice?.no, 'Hoá đơn', invoiceText(d.invoice)),
        ...opt(d.note, 'Ghi chú', d.note),
      ]} />
      <Table rows={p.calc.lines} minRows={3} cols={priceCols(d)} />
      <TongTien c={p.calc} label="Tổng giá trị hàng trả (giảm công nợ)" />
      <Signs date={d.docDate} items={[{ title: 'Người lập phiếu', name: d.createdByName }, { title: 'Người nhận hàng', note: '(Đại diện NCC, ký, họ tên)' }, { title: 'Thủ kho' }, { title: 'Kế toán trưởng' }, { title: 'Giám đốc' }]} />
      <Foot ctx={ctx} />
    </>
  );
}

/** Phiếu xuất trả hàng khổ giấy cuộn 80mm (rptMuahoantra_8cm, mẫu chung BillForm). */
const traHangBill = (p: PhieuIn): BillData => {
  const d = p.doc;
  const c = p.calc;
  return {
    branchCode: d.branchCode, title: 'PHIẾU TRẢ HÀNG NCC', docNo: d.docNo, date: d.docDate, info: [`NCC: ${nccText(p)}`, ...(d.reason ? [`Lý do: ${d.reason}`] : [])],
    lines: c.lines.map((l) => ({ name: `${l.name}${giftLine(l) ? ' (KM)' : ''}`, sub: `${qty(l.qty)} ${l.unit} × ${mb(l.price)}${l.lotNo ? ` · Lô ${l.lotNo}` : ''}`, amount: l.beforeTax + l.tax })),
    totals: [['Trước thuế', c.beforeTax], ['Thuế GTGT', c.tax], ['TỔNG GIÁ TRỊ TRẢ', c.beforeTax + c.tax, true]],
    footer: <><div className="pd-row" style={{ marginTop: 8 }}><span>Người giao</span><span>Người nhận (NCC)</span></div><div style={{ height: 40 }} /></>,
  };
};

/** Phiếu đổi hàng nhà cung cấp: hàng trả đi / hàng nhận về (theo chiều dòng), chênh lệch và cách xử lý. */
function DoiHangSheet({ p, ctx }: { p: PhieuIn; ctx: PrintCtx }) {
  const d = p.doc;
  const out = p.calc.lines.filter((l) => l.dir === 'out');
  const inn = p.calc.lines.filter((l) => (l.dir ?? 'in') === 'in');
  const x = p.calc.exchange;
  const part = (title: string, ls: LineCalc[]) => ls.length ? (
    <>
      <div className="mh-sec">{title}</div>
      <Table compact rows={ls} cols={priceCols(d, true)} foot={<tr><td colSpan={4} className="c">Cộng</td><td className="num">{qty(sumQty(ls))}</td><td /><td className="num">{m(ls.reduce((s, l) => s + l.beforeTax, 0))}</td><td /><td className="num">{mb(ls.reduce((s, l) => s + l.tax, 0))}</td></tr>} />
    </>
  ) : null;
  return (
    <>
      <OrgHead ctx={ctx} branchCode={d.branchCode} />
      <Title title="PHIẾU ĐỔI HÀNG NHÀ CUNG CẤP" date={d.docDate} no={d.docNo} />
      <Fields rows={[
        ['Nhà cung cấp', <b>{nccText(p)}</b>],
        ['Địa chỉ', p.ncc.address],
        ['Tại kho', khoText(p, ctx)],
        ['Lý do đổi', d.reason ?? ''],
        ...opt(p.lienQuan.length, 'Theo phiếu nhập', p.lienQuan.join(', ')),
        ...opt(d.note, 'Ghi chú', d.note),
      ]} />
      {part('I. HÀNG TRẢ LẠI NHÀ CUNG CẤP', out)}
      {part(out.length ? 'II. HÀNG NHẬN VỀ' : 'HÀNG ĐỔI', inn)}
      {x && (
        <table className="pd-fields" style={{ width: '62%', marginLeft: 'auto', marginTop: 6 }}>
          <tbody>
            <tr><td>Giá trị hàng trả đi (gồm thuế):</td><td className="pd-right">{m(x.outBeforeTax + x.outTax)}</td></tr>
            <tr><td>Giá trị hàng nhận về (gồm thuế):</td><td className="pd-right">{m(x.inBeforeTax + x.inTax)}</td></tr>
            <tr><td><b>Chênh lệch {x.diff > 0 ? '(công ty trả thêm NCC)' : x.diff < 0 ? '(NCC trả lại công ty)' : ''}:</b></td><td className="pd-right"><b>{m(Math.abs(x.diff))}</b></td></tr>
            <tr><td>Xử lý chênh lệch:</td><td className="pd-right">{SETTLE[d.settle ?? 'offset']}</td></tr>
          </tbody>
        </table>
      )}
      {x && x.diff !== 0 && <div className="pd-words">Chênh lệch viết bằng chữ: <i>{words(Math.abs(x.diff))}</i></div>}
      <Signs date={d.docDate} items={[{ title: 'Người lập phiếu', name: d.createdByName }, { title: 'Đại diện NCC' }, { title: 'Thủ kho' }, { title: 'Kế toán trưởng' }]} />
      <Foot ctx={ctx} />
    </>
  );
}

/** Phiếu xuất kho 02-VT cho xuất quà tặng (mẫu chung StockForm): giá trị quà tạm tính (giá vốn chốt khi tính giá vốn tháng). */
const xuatQua = (p: PhieuIn, ctx: PrintCtx): StockData => {
  const d = p.doc;
  return {
    dir: 'out', branchCode: d.branchCode, docNo: d.docNo, date: d.docDate, person: '', price: 'value', warehouse: khoText(p, ctx),
    reason: `Xuất quà tặng${d.gift?.program ? ` — chương trình ${d.gift.program}` : ''}${d.note ? `; ${d.note}` : ''}`,
    totalNote: <span className="pd-note"> (giá trị tạm tính)</span>,
    lines: p.calc.lines.map((l) => ({ sku: l.sku, name: l.name, unit: l.unit, qty: l.qty, price: l.price, amount: giftLineValue(l), lot: [l.lotNo && `Lô ${l.lotNo}`, l.expDate && `HSD ${date(l.expDate)}`].filter(Boolean).join(' · ') })),
    signs: [{ title: 'Người lập phiếu', name: d.createdByName }, { title: 'Người nhận hàng' }, { title: 'Thủ kho' }, { title: 'Kế toán trưởng', note: '(Hoặc bộ phận có nhu cầu xuất)' }, { title: 'Giám đốc' }],
  };
};

/* ------------------------------------------------------------------ chi tiền */

/** Góc Nợ / Có của phiếu chi theo bút toán chi tiền (tài khoản thật của đơn vị); không có bút toán thì để trống ghi tay. */
function noCo(es: Entry[]) {
  const group = (k: 'debit' | 'credit') => { const mp = new Map<string, number>(); for (const e of es) mp.set(e[k], (mp.get(e[k]) ?? 0) + e.amount); return [...mp]; };
  return { debit: group('debit'), credit: group('credit') };
}
const lyDoChi = (p: PhieuIn) => {
  const d = p.doc;
  const head = d.kind === 'prepayment' ? `Ứng trước tiền hàng cho ${p.ncc.name}` : d.kind === 'cost' ? `Chi phí mua hàng: ${COST_TYPES[d.costType ?? 'khac']}` : `Trả tiền hàng cho ${p.ncc.name}`;
  return [head, p.lienQuan.length ? `theo phiếu ${p.lienQuan.join(', ')}` : '', d.note].filter(Boolean).join('; ');
};

/** Phiếu chi 02-TT (mẫu chung CashForm): ứng trước / trả tiền NCC (Phieuchi.rpt) — số tiền chi = số tiền trên phiếu (CKTT không chi
 *  tiền); chi phí mua hàng (Phieuchichung.rpt) — bảng diễn giải tiền trước thuế, thuế, cộng. */
function phieuChi(p: PhieuIn, ctx: PrintCtx): CashData {
  const d = p.doc;
  const base = {
    kind: 'payment' as const, branchCode: d.branchCode, docNo: d.docNo, date: d.docDate, person: p.ncc.contact, unit: nccText(p), address: p.ncc.address,
    reason: lyDoChi(p), ...noCo(p.chiTien), signs: CASH_SIGNS.payment, footText: ctx.branchName(d.branchCode),
  };
  if (d.kind !== 'cost') {
    return { ...base, amount: d.amount ?? 0, attach: p.lienQuan.length ? String(p.lienQuan.length) : '',
      extraRows: opt(d.ckttAmount, 'Chiết khấu thanh toán được hưởng', <>{m(d.ckttAmount)} đồng (trừ vào công nợ, không chi tiền)</>) };
  }
  const tax = amountTax(d);
  const rows = [{ text: lyDoChi(p), amount: d.amount ?? 0, tax }];
  return {
    ...base, amount: (d.amount ?? 0) + tax, attach: d.invoice?.no ? `Hoá đơn ${invoiceText(d.invoice)}` : '', extraRows: opt(d.invoice?.no, 'Hoá đơn', invoiceText(d.invoice)),
    table: <Table compact rows={rows} cols={[
      { h: 'STT', w: 28, center: true, v: (_, i) => i + 1 },
      { h: 'Diễn giải', v: (r) => r.text },
      { h: 'Tiền trước thuế', w: 100, num: true, v: (r) => m(r.amount) },
      { h: 'Thuế suất', w: 56, center: true, v: () => rate(d.taxCode) },
      { h: 'Tiền thuế', w: 86, num: true, v: (r) => mb(r.tax) },
      { h: 'Cộng', w: 100, num: true, v: (r) => m(r.amount + r.tax) },
    ]} foot={<tr><td colSpan={2} className="c">Tổng cộng</td><td className="num">{m(d.amount)}</td><td /><td className="num">{mb(tax)}</td><td className="num"><b>{m((d.amount ?? 0) + tax)}</b></td></tr>} />,
  };
}

/** Ủy nhiệm chi (mẫu chung UncForm, rptUNC001): tài khoản bên trả để trống ghi tay, bên nhận lấy từ hồ sơ NCC. */
const unc = (p: PhieuIn, ctx: PrintCtx): UncData => ({
  no: p.doc.docNo, date: p.doc.docDate, amount: p.doc.amount ?? 0, description: lyDoChi(p),
  payer: { name: ctx.org.name }, payee: { name: p.ncc.name, accountNo: p.ncc.bankAccount, bankName: p.ncc.bankName, address: p.ncc.address },
});

/** Bảng phân bổ chi phí mua hàng / thưởng vào từng mã hàng (phần máy chủ tính lúc lưu). */
function PhanBoSheet({ p, ctx }: { p: PhieuIn; ctx: PrintCtx }) {
  const d = p.doc;
  const rows = d.allocation ?? [];
  return (
    <>
      <OrgHead ctx={ctx} branchCode={d.branchCode} />
      <Title title={d.kind === 'cost' ? 'BẢNG PHÂN BỔ CHI PHÍ MUA HÀNG' : 'BẢNG PHÂN BỔ CHIẾT KHẤU / THƯỞNG'} date={d.docDate} no={d.docNo} />
      <Fields rows={[
        [d.kind === 'cost' ? 'Đơn vị cung cấp dịch vụ' : 'Nhà cung cấp', nccText(p)],
        ['Nội dung', d.kind === 'cost' ? `${COST_TYPES[d.costType ?? 'khac']}${d.note ? `; ${d.note}` : ''}` : d.note ?? KIND_LABEL[d.kind]],
        ['Số tiền phân bổ (trước thuế)', <b>{m(d.amount)}</b>],
        ['Tiêu thức phân bổ', d.basis === 'qty' ? 'Theo số lượng' : 'Theo giá trị hàng nhập'],
        ...opt(p.lienQuan.length, 'Các phiếu nhập', p.lienQuan.join(', ')),
      ]} />
      <Table rows={rows} minRows={3} cols={[
        { h: 'STT', w: 28, center: true, v: (_, i) => i + 1 },
        { h: 'Mã hàng', w: 100, v: (r) => r.sku },
        { h: 'Tên hàng hoá', v: (r) => r.name ?? '' },
        { h: 'Số tiền phân bổ', w: 120, num: true, v: (r) => m(r.amount) },
      ]} foot={<tr><td colSpan={3} className="c">Cộng</td><td className="num">{m(rows.reduce((s, r) => s + r.amount, 0))}</td></tr>} />
      <Signs date={d.docDate} items={[{ title: 'Người lập', name: d.createdByName }, { title: 'Kế toán trưởng' }]} />
      <Foot ctx={ctx} />
    </>
  );
}

/** Biên bản xác nhận chiết khấu / thưởng (thưởng doanh số theo chính sách hoặc chiết khấu, giảm giá sau mua). */
function ChietKhauSheet({ p, ctx }: { p: PhieuIn; ctx: PrintCtx }) {
  const d = p.doc;
  const tax = amountTax(d);
  const total = (d.amount ?? 0) + tax;
  const r = d.rebate;
  return (
    <>
      <OrgHead ctx={ctx} branchCode={d.branchCode} />
      <Title title={r ? 'BIÊN BẢN XÁC NHẬN THƯỞNG DOANH SỐ' : 'BIÊN BẢN XÁC NHẬN CHIẾT KHẤU / GIẢM GIÁ'} date={d.docDate} no={d.docNo} />
      <p className="mh-p">Hôm nay, {dayLower()}, chúng tôi gồm:</p>
      <div className="mh-sec">BÊN A (Bên bán): {p.ncc.name || '..........'}</div>
      <Fields rows={[['Địa chỉ', p.ncc.address], ...opt(p.ncc.taxCode, 'Mã số thuế', p.ncc.taxCode), ['Đại diện', <><Dots /> Chức vụ: ..........................</>]]} />
      <div className="mh-sec">BÊN B (Bên mua): {ctx.org.name}</div>
      <Fields rows={[['Địa chỉ', ctx.org.address], ...opt(ctx.org.taxCode, 'Mã số thuế', ctx.org.taxCode), ['Đại diện', <><Dots /> Chức vụ: ..........................</>]]} />
      <p className="mh-p">
        Hai bên cùng xác nhận số tiền {r ? 'thưởng' : 'chiết khấu / giảm giá'} Bên A dành cho Bên B
        {r ? <> theo chính sách <b>{r.policyCode}</b>, kỳ <b>{r.period}</b></> : null}
        {p.lienQuan.length ? <>, áp cho các phiếu nhập {p.lienQuan.join(', ')}</> : null} như sau:
      </p>
      {r?.detail.length ? <ul className="mh-p">{r.detail.map((x, i) => <li key={i}>{x}</li>)}</ul> : null}
      <Table rows={[d]} cols={[
        { h: 'Nội dung', v: () => d.note || (r ? `Thưởng doanh số kỳ ${r.period}` : 'Chiết khấu / giảm giá sau mua') },
        ...(r ? [{ h: 'Doanh số căn cứ', w: 110, num: true, v: () => mb(r.base) }, { h: 'Tỷ lệ', w: 50, center: true, v: () => (r.rate ? `${Number(r.rate).toLocaleString('vi-VN')}%` : '') }] : []),
        { h: 'Số tiền trước thuế', w: 110, num: true, v: () => m(d.amount) },
        { h: 'Thuế GTGT', w: 80, num: true, v: () => mb(tax) },
        { h: 'Cộng', w: 110, num: true, v: () => <b>{m(total)}</b> },
      ]} />
      <div className="pd-words">Số tiền viết bằng chữ: <i>{words(total)}</i></div>
      <p className="mh-p">Hình thức thanh toán: trừ vào công nợ Bên B phải trả Bên A{d.invoice?.no ? `, theo hoá đơn điều chỉnh giảm ${invoiceText(d.invoice)}` : tax ? ', Bên A xuất hoá đơn điều chỉnh giảm' : ''}. Biên bản lập thành 02 bản, mỗi bên giữ 01 bản có giá trị như nhau.</p>
      <Signs items={[{ title: 'ĐẠI DIỆN BÊN A', note: '(Ký, họ tên, đóng dấu)' }, { title: 'ĐẠI DIỆN BÊN B', note: '(Ký, họ tên, đóng dấu)' }]} />
      <Foot ctx={ctx} />
    </>
  );
}

/* ------------------------------------------------------------------ danh sách mẫu */

type T = PrintTemplate<PhieuIn>;
/** Mã mẫu duy nhất trong cả màn MH03 (mẫu mặc định nhớ theo màn, không lẫn giữa các loại phiếu). */
const NHAP: T[] = [
  { id: 'pnk', name: 'Phiếu nhập kho 01-VT có giá', paper: 'A4', source: 'rptPhieunhapkho.rpt', render: (p, c) => <StockForm s={nhapKho(p, c)} ctx={c} /> },
  { id: 'pnk-a5', name: 'Phiếu nhập kho A5 ngang', paper: 'A5L', source: 'rptPhieunhapkhoM2.rpt', render: (p, c) => <StockForm s={nhapKho(p, c, { compact: true })} ctx={c} /> },
  { id: 'pnk-sl', name: 'Phiếu nhập kho không giá (cho thủ kho)', paper: 'A4', source: 'rptPhieunhapkhoM3.rpt', render: (p, c) => <StockForm s={nhapKho(p, c, { noPrice: true })} ctx={c} /> },
];
const CHI: T = { id: 'chi', name: 'Phiếu chi 02-TT', paper: 'A5L', source: 'Phieuchi.rpt', render: (p, c) => <CashForm c={phieuChi(p, c)} ctx={c} /> };
const UNC: T = { id: 'unc', name: 'Ủy nhiệm chi', paper: 'A4', source: 'rptUNC001.rpt', render: (p, c) => <UncForm u={unc(p, c)} /> };
const PHAN_BO: T = { id: 'phan-bo', name: 'Bảng phân bổ vào mã hàng', paper: 'A4', render: (p, c) => <PhanBoSheet p={p} ctx={c} /> };

export const MAU_IN: Record<PDoc['kind'], T[]> = {
  order: [
    { id: 'po', name: 'Đơn đặt hàng / Đề nghị nhập hàng', paper: 'A4', source: 'rptPhieuPO.rpt', render: (p, c) => <DonDatSheet p={p} ctx={c} /> },
    { id: 'bbgt', name: 'Biên bản bàn giao hàng hoá', paper: 'A4', source: 'rptBBBGTBPO.rpt', render: (p, c) => <BanGiaoSheet p={p} ctx={c} /> },
  ],
  receipt: NHAP,
  gift_in: NHAP,
  return: [
    { id: 'tra', name: 'Phiếu xuất trả hàng nhà cung cấp', paper: 'A4', source: 'rptMuahoantra.rpt', render: (p, c) => <TraHangSheet p={p} ctx={c} /> },
    { id: 'tra-80', name: 'Phiếu xuất trả hàng 80mm', paper: 'roll80', source: 'rptMuahoantra_8cm.rpt', render: (p, c) => <BillForm b={traHangBill(p)} ctx={c} /> },
  ],
  exchange: [{ id: 'doi', name: 'Phiếu đổi hàng nhà cung cấp', paper: 'A4', render: (p, c) => <DoiHangSheet p={p} ctx={c} /> }],
  gift_out: [{ id: 'pxk-qua', name: 'Phiếu xuất kho 02-VT', paper: 'A4', source: 'mẫu chuẩn', render: (p, c) => <StockForm s={xuatQua(p, c)} ctx={c} /> }],
  prepayment: [CHI],
  payment: [CHI],
  cost: [{ id: 'chi-chung', name: 'Phiếu chi chung', paper: 'A5L', source: 'Phieuchichung.rpt', render: (p, c) => <CashForm c={phieuChi(p, c)} ctx={c} /> }, PHAN_BO],
  rebate: [{ id: 'bb-ck', name: 'Biên bản xác nhận chiết khấu / thưởng', paper: 'A4', render: (p, c) => <ChietKhauSheet p={p} ctx={c} /> }, PHAN_BO],
};

/** Mẫu in của một phiếu: ứng trước / trả tiền chuyển khoản thì Ủy nhiệm chi đứng đầu (mặc định), sau đó Phiếu chi. */
export function mauInCua(d: Pick<PDoc, 'kind' | 'method'>): T[] {
  if ((d.kind === 'payment' || d.kind === 'prepayment') && d.method === 'bank') return [UNC, CHI];
  return MAU_IN[d.kind];
}
