/**
 * CÁC MẪU CHUẨN dùng chung nhiều màn — mỗi mẫu nhận dữ liệu đã chuẩn hoá, màn chỉ việc đổi chứng từ của mình sang dạng đó.
 * Sửa bố cục một mẫu ở đây là mọi màn dùng mẫu đó đổi theo.
 *
 *   CashForm    Phiếu thu 01-TT / Phiếu chi 02-TT       (ACC51, ACC52, MH03 trả tiền / chi phí, CN04…)
 *   StockForm   Phiếu nhập kho 01-VT / xuất kho 02-VT   (BH10, BH11, BH06, MH03 nhập mua / xuất quà…)
 *   UncForm     Ủy nhiệm chi                            (ACC53, MH03, Q2, CN05)
 *   BillForm    Phiếu giấy cuộn 80mm                    (BH10, BH11, MH03 trả hàng)
 *   LedgerForm  Sổ / báo cáo dạng bảng nhiều trang      (sổ kế toán, công nợ, quỹ, kho, thuế…)
 */
import type { ReactNode } from 'react';
import { date } from '@/lib/format';
import { Dots, Fields, Foot, OrgHead, Signs, Table, Title, m, mb, qty, sumQty, words, type Col, type Row, type Sign } from './blocks';
import type { PrintCtx } from './PrintHost';
import { usePrintOverrides } from './overrides';

/* ------------------------------------------------------------------ Phiếu thu / chi */

/** Một dòng góc Nợ / Có: tài khoản (hoặc nhãn "Thuế") và số tiền. */
export type AccAmount = [string, number];
export interface CashData {
  kind: 'receipt' | 'payment';
  branchCode: string; docNo: string; date: string;
  /** Họ tên người nộp / nhận tiền. */
  person: string; unit?: string; address?: string; reason: string;
  amount: number;
  /** Góc Nợ / Có; rỗng thì in dòng chấm để ghi tay. */
  debit: AccAmount[]; credit: AccAmount[];
  /** Dòng thêm sau "Số tiền" (vd chiết khấu thanh toán). */
  extraRows?: Row[];
  /** Phiếu chi chung: bảng diễn giải thay cho dòng "Số tiền". */
  table?: ReactNode;
  attach?: ReactNode;
  signs: Sign[];
  /** In 2 liên trên một tờ A4: số thứ tự liên. */
  half?: number;
  footText?: string;
}

export const CASH_SIGNS: Record<CashData['kind'], Sign[]> = {
  receipt: [{ title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }, { title: 'Kế toán trưởng' }, { title: 'Người nộp tiền' }, { title: 'Người lập phiếu' }, { title: 'Thủ quỹ' }],
  payment: [{ title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }, { title: 'Kế toán trưởng' }, { title: 'Thủ quỹ' }, { title: 'Người lập phiếu' }, { title: 'Người nhận tiền' }],
};

/** Góc Nợ / Có kèm số tiền như phiếu HTsoft ("Nợ: 1111 231.000.000"). */
export function AccSide({ debit, credit }: { debit: AccAmount[]; credit: AccAmount[] }) {
  const row = (label: string, xs: AccAmount[]) => <div className="pd-acc"><span>{label}</span><span>{xs.length ? xs.map(([a, n]) => <div key={a}>{a}<i>{m(n)}</i></div>) : '..........'}</span></div>;
  return <>{row('Nợ:', debit)}{row('Có:', credit)}</>;
}

/** Phiếu thu 01-TT / Phiếu chi 02-TT (rdlcPhieuThu / rdlcPhieuChi, Phieuchi.rpt, Phieuchichung.rpt). */
export function CashForm({ c, ctx }: { c: CashData; ctx: PrintCtx }) {
  const rec = c.kind === 'receipt';
  return (
    <div className={c.half ? 'pd-half' : undefined}>
      <OrgHead ctx={ctx} branchCode={c.branchCode} form={rec ? 'Mẫu số 01 - TT' : 'Mẫu số 02 - TT'} />
      <Title title={rec ? 'PHIẾU THU' : 'PHIẾU CHI'} date={c.date} copy={c.half} copies={c.half ? 2 : undefined} copyLabels={['Lưu', rec ? 'Giao người nộp tiền' : 'Giao người nhận tiền']}
        side={<><div>Quyển số: ..........</div><div>Số: <b>{c.docNo}</b></div><AccSide debit={c.debit} credit={c.credit} /></>} />
      <Fields rows={[
        [rec ? 'Họ và tên người nộp tiền' : 'Họ và tên người nhận tiền', c.person],
        ...(c.unit && c.unit !== c.person ? [['Đơn vị', c.unit] as Row] : []),
        ['Địa chỉ', c.address ?? ''],
        [rec ? 'Lý do nộp' : 'Lý do chi', c.reason],
        ...(c.table ? [] : [['Số tiền', <><b>{m(c.amount)}</b> đồng &nbsp;<i>(Viết bằng chữ): {words(c.amount)}</i></>] as Row]),
        ...(c.extraRows ?? []),
        ...(c.table ? [] : [['Kèm theo', <>{c.attach || '..........'} &nbsp;Chứng từ gốc</>] as Row]),
      ]} />
      {c.table && <>{c.table}<div className="pd-words">Số tiền viết bằng chữ: <i>{words(c.amount)}</i></div><div className="pd-words">Kèm theo: {c.attach || '..........'} &nbsp;Chứng từ gốc</div></>}
      <Signs date={c.date} items={c.signs} />
      <div className="pd-words">Đã nhận đủ số tiền (viết bằng chữ): <Dots w="60%" /></div>
      <div className="pd-note">+ Tỷ giá ngoại tệ (vàng bạc, đá quý): .................... + Số tiền quy đổi: ....................</div>
      {!c.half && <Foot ctx={ctx} text={c.footText} />}
    </div>
  );
}

/** Hai liên của một phiếu trên một tờ A4, ngăn bằng đường cắt. */
export const TwoCopies = ({ render }: { render: (copy: number) => ReactNode }) => <>{render(1)}<div className="pd-cut" />{render(2)}</>;

/* ------------------------------------------------------------------ Phiếu nhập / xuất kho */

export interface StockLine { sku: string; name: ReactNode; unit: string; qty: number; actual?: number; price?: number; amount?: number; lot?: string }
export interface StockData {
  dir: 'in' | 'out';
  branchCode: string; docNo: string; date: string;
  /** Người giao (nhập) / người nhận hàng (xuất). */
  person: string; reason: string; warehouse: string; note?: string;
  lines: StockLine[];
  /**
   *  value  có đơn giá, thành tiền, tổng bằng chữ;
   *  blank  cột giá để trống cho kế toán ghi giá vốn;
   *  none   phiếu cho thủ kho: thay cột giá bằng Số lô / HSD và Ghi chú.
   */
  price: 'value' | 'blank' | 'none';
  debit?: string; credit?: string;
  totalNote?: ReactNode; attach?: string;
  signs?: Sign[];
  compact?: boolean;
}

const STOCK_SIGNS: Record<StockData['dir'], Sign[]> = {
  in: [{ title: 'Người lập phiếu' }, { title: 'Người giao hàng' }, { title: 'Thủ kho' }, { title: 'Kế toán trưởng', note: '(Hoặc bộ phận có nhu cầu nhập)' }],
  out: [{ title: 'Người lập phiếu' }, { title: 'Người nhận hàng' }, { title: 'Thủ kho' }, { title: 'Kế toán trưởng', note: '(Hoặc bộ phận có nhu cầu xuất)' }, { title: 'Giám đốc' }],
};

/** Phiếu nhập kho 01-VT / Phiếu xuất kho 02-VT (rptPhieunhapkho*.rpt). */
export function StockForm({ s, ctx }: { s: StockData; ctx: PrintCtx }) {
  const inn = s.dir === 'in';
  const total = s.lines.reduce((a, l) => a + (l.amount ?? 0), 0);
  const head: Col<StockLine>[] = [{ h: 'STT', w: 28, center: true, v: (_, i) => i + 1 }];
  const qtyCols: Col<StockLine>[] = [
    { h: 'SL theo chứng từ', w: 58, num: true, v: (l) => qty(l.qty) },
    { h: inn ? 'SL thực nhập' : 'SL thực xuất', w: 58, num: true, v: (l) => qty(l.actual) },
  ];
  const cols: Col<StockLine>[] = s.price === 'none' ? [
    ...head,
    { h: 'Mã số', w: 84, v: (l) => l.sku },
    { h: 'Tên, nhãn hiệu, quy cách hàng hoá', v: (l) => l.name },
    { h: 'ĐVT', w: 42, center: true, v: (l) => l.unit },
    { h: 'Số lô / HSD', w: 100, v: (l) => l.lot ?? '' },
    ...qtyCols,
    { h: 'Ghi chú', w: 90, v: () => '' },
  ] : [
    ...head,
    { h: 'Tên, nhãn hiệu, quy cách, phẩm chất vật tư, dụng cụ, sản phẩm, hàng hoá', v: (l) => <>{l.name}{l.lot ? <div className="pd-bill-sub">{l.lot}</div> : null}</> },
    { h: 'Mã số', w: s.compact ? 70 : 84, v: (l) => l.sku },
    { h: 'ĐVT', w: 42, center: true, v: (l) => l.unit },
    ...qtyCols,
    { h: 'Đơn giá', w: 74, num: true, v: (l) => (s.price === 'value' ? mb(l.price ?? (l.qty && l.amount ? Math.round(l.amount / l.qty) : 0)) : '') },
    { h: 'Thành tiền', w: 88, num: true, v: (l) => (s.price === 'value' ? mb(l.amount) : '') },
  ];
  const n = s.price === 'none' ? 5 : 4;
  const foot = <tr><td colSpan={n} className="c">Cộng</td><td className="num">{qty(sumQty(s.lines))}</td>{cols.slice(n + 1).map((_, i) => <td key={i} className="num">{s.price === 'value' && i === cols.length - n - 2 ? m(total) : ''}</td>)}</tr>;
  return (
    <>
      <OrgHead ctx={ctx} branchCode={s.branchCode} form={inn ? 'Mẫu số 01 - VT' : 'Mẫu số 02 - VT'} />
      <Title title={inn ? 'PHIẾU NHẬP KHO' : 'PHIẾU XUẤT KHO'} date={s.date} no={s.docNo}
        side={s.price === 'none' ? undefined : <><div>Nợ: {s.debit || '..........'}</div><div>Có: {s.credit || '..........'}</div></>} />
      <Fields rows={[
        [inn ? 'Họ và tên người giao' : 'Họ và tên người nhận hàng', s.person],
        [inn ? 'Theo' : 'Lý do xuất kho', s.reason],
        [inn ? 'Nhập tại kho' : 'Xuất tại kho (ngăn lô)', s.warehouse],
        ...(s.note && !s.compact ? [['Ghi chú', s.note] as Row] : []),
      ]} />
      <Table compact={s.compact} rows={s.lines} minRows={s.compact ? 0 : 3} cols={cols} foot={foot} />
      {s.price !== 'none' && <div className="pd-words">Tổng số tiền (viết bằng chữ): {s.price === 'value' ? <i>{words(total)}</i> : <Dots w="62%" />}{s.totalNote}</div>}
      <div className="pd-words">Số chứng từ gốc kèm theo: {s.attach || '..........'}</div>
      <Signs date={s.date} items={s.signs ?? STOCK_SIGNS[s.dir]} />
      {!s.compact && <Foot ctx={ctx} />}
    </>
  );
}

/* ------------------------------------------------------------------ Ủy nhiệm chi */

export interface UncParty { name: string; accountNo?: string; bankName?: string; bankBranch?: string; address?: string }
export interface UncData { no: string; date?: string; payer: UncParty; payee: UncParty; amount: number; description: string; note?: ReactNode }

/** Ủy nhiệm chi — bố cục chung mẫu các ngân hàng (rdlcPhieuBaoNoVCBCP / NHCT05 / NHND2x / TPB, rptUNC001…003). */
export function UncForm({ u }: { u: UncData }) {
  const bankText = (p: UncParty) => (p.bankName ? `${p.bankName}${p.bankBranch ? ` — ${p.bankBranch}` : ''}` : '');
  return (
    <>
      <div className="pd-row">
        <div><b>{u.payer.bankName || 'NGÂN HÀNG'}</b>{u.payer.bankBranch ? <div>Chi nhánh {u.payer.bankBranch}</div> : null}</div>
        <div className="pd-right">Số / No: <b>{u.no || '..........'}</b><div>Lập ngày / Date: {u.date ? date(u.date) : '...../...../.........'}</div></div>
      </div>
      <Title title="ỦY NHIỆM CHI" sub={<span className="pd-note">PAYMENT ORDER — Chuyển khoản, chuyển tiền thư, điện</span>} />
      <div className="pd-box">
        <Fields rows={[['Tên đơn vị trả tiền (Payer)', <b>{u.payer.name}</b>], ['Số tài khoản (Account No.)', u.payer.accountNo ?? ''], ['Tại ngân hàng (At bank)', bankText(u.payer)]]} />
      </div>
      <div className="pd-box" style={{ marginTop: 6 }}>
        <Fields rows={[
          ['Tên đơn vị nhận tiền (Payee)', u.payee.name ? <b>{u.payee.name}</b> : ''],
          ['Số tài khoản (Account No.)', u.payee.accountNo ?? ''],
          ['Tại ngân hàng (At bank)', bankText(u.payee)],
          ...(u.payee.address !== undefined ? [['Địa chỉ', u.payee.address] as Row] : []),
        ]} />
      </div>
      <div className="pd-row" style={{ marginTop: 6 }}>
        <div style={{ flex: 1 }}><Fields rows={[['Số tiền bằng chữ (Amount in words)', <i>{words(u.amount)}</i>], ['Nội dung (Details of payment)', u.description]]} /></div>
        <div className="pd-box pd-center" style={{ minWidth: 170 }}>SỐ TIỀN BẰNG SỐ<br /><span className="pd-note">(Amount in figures)</span><div style={{ fontSize: '1.3em' }}><b>{m(u.amount)}</b></div></div>
      </div>
      <div className="pd-center" style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr' }}><b>ĐƠN VỊ TRẢ TIỀN</b><b>NGÂN HÀNG A</b><b>NGÂN HÀNG B</b></div>
      <Signs keep items={[{ title: 'Kế toán', note: '(Accountant)' }, { title: 'Chủ tài khoản', note: '(Account holder)' }, { title: 'Ghi sổ ngày', note: '..........' }, { title: 'Ghi sổ ngày', note: '..........' }]} />
      {u.note && <div className="pd-note">{u.note}</div>}
    </>
  );
}

/* ------------------------------------------------------------------ Phiếu giấy cuộn 80mm */

export interface BillData {
  branchCode: string; title: string; docNo: string; date: string;
  /** Các dòng đầu phiếu: "KH: Khách lẻ", "Lý do: …". */
  info: string[];
  lines: { name: string; sub: string; amount: number }[];
  /** Phần cộng: [nhãn, số tiền, in đậm]. */
  totals: [string, number, boolean?][];
  footer?: ReactNode;
}

/** Phiếu giấy cuộn 80mm (rptBanhoadon8cm.rpt, rptMuahoantra_8cm.rpt). */
export function BillForm({ b, ctx }: { b: BillData; ctx: PrintCtx }) {
  const ov = usePrintOverrides();
  return (
    <div className="pd-bill">
      <div className="pd-center"><b>{ctx.org.name}</b><div>{ctx.branchName(b.branchCode)}</div>{ctx.org.address && <div>{ctx.org.address}</div>}{ctx.org.phone && <div>ĐT: {ctx.org.phone}</div>}</div>
      <h1 className="pd-center">{ov.title || b.title}</h1>
      <div>Số: {b.docNo} · {date(b.date)}</div>
      {b.info.map((x, i) => <div key={i}>{x}</div>)}
      <table className="pd-bill-lines">
        <tbody>{b.lines.map((l, i) => <tr key={i}><td>{l.name}<div className="pd-bill-sub">{l.sub}</div></td><td className="pd-right">{m(l.amount)}</td></tr>)}</tbody>
      </table>
      {b.totals.map(([k, v, bold], i) => <div key={i} className="pd-row">{bold ? <><b>{k}</b><b>{m(v)}</b></> : <><span>{k}</span><span>{m(v)}</span></>}</div>)}
      {b.footer}
    </div>
  );
}

/* ------------------------------------------------------------------ Sổ / báo cáo dạng bảng */

/** Một cột của sổ. group: tiêu đề tầng trên (vd "Số phát sinh" trên hai cột Nợ / Có); sum: cột có dòng cộng tự tính. */
export interface LedgerCol<R> { key: string; h: ReactNode; group?: string; w?: number | string; num?: boolean; center?: boolean; v: (r: R, i: number) => ReactNode; sum?: (r: R) => number }
/** Dòng thêm trước / sau bảng (số dư đầu kỳ, cộng phát sinh, số dư cuối kỳ…): nhãn + giá trị theo key cột. */
export interface LedgerExtra { label: ReactNode; cells?: Record<string, ReactNode>; strong?: boolean }
export interface LedgerData<R> {
  title: string;
  /** Mẫu sổ, vd "Mẫu số S03a-DN"; trống thì không in khối mẫu số. */
  form?: string;
  /** Căn cứ ban hành dưới mẫu số; mặc định FORM_NOTE (chế độ kế toán hiện hành); mẫu thuế truyền câu riêng, '' = không in. */
  formNote?: string;
  branchCode?: string;
  from?: string; to?: string;
  /** Dòng kỳ tự ghi thay cho "Từ ngày … đến ngày …" (vd "Tại ngày 31/10/2026"). */
  period?: ReactNode;
  /** Thông tin dưới tiêu đề: tài khoản, đối tượng, chi nhánh đã lọc… */
  info?: Row[];
  cols: LedgerCol<R>[];
  rows: R[];
  before?: LedgerExtra[];
  after?: LedgerExtra[];
  /** Nhãn dòng cộng tự tính từ các cột có sum; false = không có. */
  total?: string | false;
  /** Nhóm dòng: tiêu đề nhóm + dòng cộng nhóm (cột có sum). */
  groupBy?: { key: (r: R) => string; label: (key: string, rows: R[]) => ReactNode; subtotal?: string };
  signs?: Sign[] | false;
  /** In "Sổ này có … trang… / Ngày mở sổ" (các sổ kế toán). */
  bookNote?: boolean;
  note?: ReactNode;
}

export const BOOK_SIGNS: Sign[] = [{ title: 'Người ghi sổ' }, { title: 'Kế toán trưởng' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }];

/** Sổ / báo cáo dạng bảng nhiều trang (rdlcSoNhatKyChung, rdlcSoQuyTienMat, rdlcSoChiTietTaiKhoan…). */
export function LedgerForm<R>({ d, ctx }: { d: LedgerData<R>; ctx: PrintCtx }) {
  const ov = usePrintOverrides();
  const cols = d.cols;
  // Ô nhãn của dòng thêm / dòng cộng trải từ cột đầu tới trước cột số liệu đầu tiên.
  const span = (cells: Record<string, ReactNode> = {}, sums = false) => {
    const i = cols.findIndex((c) => c.key in cells || (sums && c.sum));
    return i < 0 ? cols.length : Math.max(1, i);
  };
  const extraRow = (x: LedgerExtra, k: string, sums?: R[]) => {
    const cells: Record<string, ReactNode> = { ...(x.cells ?? {}) };
    if (sums) for (const c of cols) if (c.sum && !(c.key in cells)) cells[c.key] = m(sums.reduce((a, r) => a + c.sum!(r), 0));
    const n = span(cells, Boolean(sums));
    return (
      <tr key={k} className={x.strong ? 'pd-strong' : undefined}>
        <td colSpan={n} className={x.strong ? 'c' : undefined}>{x.label}</td>
        {cols.slice(n).map((c) => <td key={c.key} className={c.num ? 'num' : c.center ? 'c' : undefined}>{cells[c.key] ?? ''}</td>)}
      </tr>
    );
  };
  const body = (rs: R[], start: number) => rs.map((r, i) => <tr key={`r${start + i}`}>{cols.map((c) => <td key={c.key} className={c.num ? 'num' : c.center ? 'c' : undefined}>{c.v(r, start + i)}</td>)}</tr>);
  const rowsOut: ReactNode[] = [];
  (d.before ?? []).forEach((x, i) => rowsOut.push(extraRow(x, `b${i}`)));
  if (d.groupBy) {
    const map = new Map<string, R[]>();
    for (const r of d.rows) { const k = d.groupBy.key(r); map.set(k, [...(map.get(k) ?? []), r]); }
    let n = 0;
    for (const [k, rs] of map) {
      rowsOut.push(<tr key={`g${k}`} className="pd-group"><td colSpan={cols.length}>{d.groupBy.label(k, rs)}</td></tr>);
      rowsOut.push(...body(rs, n)); n += rs.length;
      if (d.groupBy.subtotal) rowsOut.push(extraRow({ label: d.groupBy.subtotal }, `s${k}`, rs));
    }
  } else rowsOut.push(...body(d.rows, 0));
  if (d.total !== false && cols.some((c) => c.sum)) rowsOut.push(extraRow({ label: d.total ?? 'Tổng cộng', strong: true }, 'tot', d.rows));
  (d.after ?? []).forEach((x, i) => rowsOut.push(extraRow({ strong: true, ...x }, `a${i}`)));

  // Tiêu đề hai tầng: cột cùng group gộp một ô tầng trên; cột không group kéo dài hai tầng.
  const twoRows = cols.some((c) => c.group);
  const top: ReactNode[] = [];
  for (let i = 0; i < cols.length; i++) {
    const c = cols[i]!;
    if (!c.group) { top.push(<th key={c.key} rowSpan={twoRows ? 2 : 1} style={{ width: c.w }}>{c.h}</th>); continue; }
    let j = i; while (j + 1 < cols.length && cols[j + 1]!.group === c.group) j++;
    top.push(<th key={c.key} colSpan={j - i + 1}>{c.group}</th>); i = j;
  }
  const period = d.period ?? (d.from || d.to ? `Từ ngày ${date(d.from)} đến ngày ${date(d.to)}` : '');
  return (
    <div className="pd-ledger">
      <OrgHead ctx={ctx} branchCode={d.branchCode} form={d.form} formNote={d.formNote} />
      <div className="pd-title" style={{ margin: '6px 0' }}><h1>{ov.title || d.title}</h1>{period && <div className="pd-date">{period}</div>}</div>
      {d.info && d.info.length > 0 && <Fields rows={d.info} />}
      <table className="pd-table compact">
        <thead>
          <tr>{top}</tr>
          {twoRows && <tr>{cols.filter((c) => c.group).map((c) => <th key={c.key} style={{ width: c.w }}>{c.h}</th>)}</tr>}
        </thead>
        <tbody>{rowsOut}</tbody>
      </table>
      {d.note && <div className="pd-note">{d.note}</div>}
      {d.bookNote && <div className="pd-note">- Sổ này có .... trang, đánh số từ trang 01 đến trang .... &nbsp; - Ngày mở sổ: ....................</div>}
      {d.signs !== false && <Signs date={true} items={d.signs ?? BOOK_SIGNS} />}
      <Foot ctx={ctx} />
    </div>
  );
}
