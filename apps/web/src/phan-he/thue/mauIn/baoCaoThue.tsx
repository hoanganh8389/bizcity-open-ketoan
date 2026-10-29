/**
 * MẪU IN tờ khai thuế, báo cáo năm (StatementPages.tsx), A4 dọc:
 *   ACC66  Tờ khai thuế GTGT 01/GTGT (TT80/2021): các chỉ tiêu màn đang tính / đã lưu; kèm phụ lục hàng giảm thuế 8%.
 *          RDLC_VATALL*, RDLC_VATDETAIL*, RDLC_VATALLBANGKE* của HTsoft là mẫu in hoá đơn GTGT / bảng kê kèm hoá đơn, không phải tờ khai: không có mẫu tương ứng.
 *   B09    Thuyết minh báo cáo tài chính B09-DN: lời văn (theo chữ đã sửa trên màn) và các bảng số liệu.
 *   B01D   Bảng phân loại dài hạn: các dòng đang khai trên màn.
 */
import type { ReactNode } from 'react';
import { date } from '@/lib/format';
import { Fields, Foot, LedgerForm, OrgHead, Signs, m, mb, screenTemplate, type PrintCtx, type PrintTemplate, type Row, type Sign, FORM_NOTE } from '@/components/print';

const REPORT_SIGNS: Sign[] = [{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }];
const TT80 = '(Ban hành kèm theo Thông tư số 80/2021/TT-BTC ngày 29 tháng 9 năm 2021 của Bộ trưởng Bộ Tài chính)';

/* ------------------------------------------------------------------ ACC66 */
export interface VatFormLine { stt: string; name: string; value?: string; tax?: string; bold?: boolean }
/** values: số chỉ tiêu màn đang hiện (đã lưu chính thức thì là số đã lưu); status null = chưa lưu. */
export interface VatReturnSheet {
  label: string; from: string; to: string; branchCodes: string;
  status: 'draft' | 'final' | null; revision: number;
  form: VatFormLine[]; values: Record<string, number>;
  reduced: { rows: { name: string; amount: number; tax: number; reducedTax: number }[] };
}

const Motto = () => <div className="pd-center" style={{ margin: '4px 0' }}><b>CỘNG HOÀ XÃ HỘI CHỦ NGHĨA VIỆT NAM</b><div><b>Độc lập - Tự do - Hạnh phúc</b></div><div>---------------</div></div>;
const box = (on: boolean) => <span style={{ display: 'inline-block', width: 12, height: 12, border: '1px solid #000', textAlign: 'center', lineHeight: '11px', fontSize: 10 }}>{on ? 'x' : ''}</span>;

function VatReturnDoc({ s, ctx }: { s: VatReturnSheet; ctx: PrintCtx }) {
  const cell = (k?: string): ReactNode => (!k ? '' : k === '21' ? box(Boolean(s.values['21'])) : m(s.values[k] ?? 0));
  return (
    <div className="pd-ledger">
      <OrgHead ctx={ctx} form="Mẫu số: 01/GTGT" formNote={TT80} />
      <Motto />
      <div className="pd-title" style={{ margin: '6px 0' }}>
        <h1>TỜ KHAI THUẾ GIÁ TRỊ GIA TĂNG</h1>
        <div className="pd-sub">(Áp dụng đối với người nộp thuế tính thuế theo phương pháp khấu trừ có hoạt động sản xuất kinh doanh)</div>
        <div className="pd-date">[01] Kỳ tính thuế: {s.label} (từ ngày {date(s.from)} đến ngày {date(s.to)})</div>
        <div>[02] Lần đầu {box(s.revision === 0)} &nbsp;&nbsp; [03] Bổ sung lần thứ: {s.revision > 0 ? s.revision : '....'}</div>
        {s.status !== 'final' && <div className="pd-note">({s.status === 'draft' ? 'Bản nháp' : 'Chưa lưu'} — số liệu tạm tính theo sổ hoá đơn)</div>}
      </div>
      <Fields rows={[
        ['[04] Tên người nộp thuế', <b>{ctx.org.name}</b>],
        ['[05] Mã số thuế', ctx.org.taxCode],
        ['Địa chỉ', ctx.org.address],
        ...(s.branchCodes ? [['Phạm vi chi nhánh', s.branchCodes.split(',').join(', ')] as Row] : []),
      ]} />
      <div className="pd-right pd-note">Đơn vị tiền: Đồng Việt Nam</div>
      <table className="pd-table compact">
        <thead><tr><th style={{ width: 34 }}>STT</th><th>Chỉ tiêu</th><th style={{ width: 40 }}>Mã chỉ tiêu</th><th style={{ width: 112 }}>Giá trị HHDV (chưa có thuế GTGT)</th><th style={{ width: 40 }}>Mã chỉ tiêu</th><th style={{ width: 104 }}>Thuế GTGT</th></tr></thead>
        <tbody>
          {s.form.map((l, i) => (
            <tr key={i} className={l.bold ? 'pd-strong' : undefined}>
              <td className="c">{l.stt}</td><td>{l.name}</td>
              <td className="c">{l.value ? `[${l.value}]` : ''}</td><td className={l.value === '21' ? 'c' : 'num'}>{cell(l.value)}</td>
              <td className="c">{l.tax ? `[${l.tax}]` : ''}</td><td className="num">{cell(l.tax)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="pd-note">Tôi cam đoan số liệu khai trên là đúng và chịu trách nhiệm trước pháp luật về số liệu đã khai./.</div>
      <Signs date={true} items={[
        { title: 'Nhân viên đại lý thuế', note: 'Họ và tên: .................... Chứng chỉ hành nghề số: ....................' },
        { title: 'Người nộp thuế hoặc đại diện hợp pháp của người nộp thuế', note: '(Chữ ký, ghi rõ họ tên; chức vụ và đóng dấu (nếu có) / Ký điện tử)' },
      ]} />
      <Foot ctx={ctx} />
    </div>
  );
}

export const VAT_RETURN_TEMPLATES: PrintTemplate<VatReturnSheet>[] = [
  { id: '01gtgt', name: 'Tờ khai thuế GTGT 01/GTGT', paper: 'A4', render: (s, ctx) => <VatReturnDoc s={s} ctx={ctx} /> },
  {
    id: 'giamthue', name: 'Phụ lục hàng hoá, dịch vụ được giảm thuế GTGT', paper: 'A4',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'PHỤ LỤC BẢNG KÊ GIẢM THUẾ GIÁ TRỊ GIA TĂNG', period: `Kỳ tính thuế: ${s.label} (từ ngày ${date(s.from)} đến ngày ${date(s.to)})`,
        info: [['Kèm theo', 'Tờ khai thuế GTGT mẫu số 01/GTGT'], ['Tên người nộp thuế', ctx.org.name], ['Mã số thuế', ctx.org.taxCode]], rows: s.reduced.rows, total: 'Tổng cộng',
        signs: [{ title: 'Người nộp thuế hoặc đại diện hợp pháp của người nộp thuế', note: '(Ký, ghi rõ họ tên, chức vụ và đóng dấu (nếu có))' }],
        cols: [
          { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
          { key: 'ten', h: 'Tên hàng hoá, dịch vụ', v: (r) => r.name },
          { key: 'gt', h: 'Giá trị HHDV chưa có thuế GTGT', w: 110, num: true, v: (r) => m(r.amount), sum: (r) => r.amount },
          { key: 'tsq', h: 'Thuế suất theo quy định', w: 60, center: true, v: () => '10%' },
          { key: 'tsg', h: 'Thuế suất sau giảm', w: 60, center: true, v: () => '8%' },
          { key: 'thue', h: 'Thuế GTGT được giảm', w: 100, num: true, v: (r) => m(r.reducedTax), sum: (r) => r.reducedTax },
        ],
      }} />
    ),
  },
  screenTemplate<VatReturnSheet>(),
];

/* ------------------------------------------------------------------ B09 */
export interface NotesSheet {
  from: string; to: string;
  general: { title: string; items: string[] }[];
  tables: { key: string; title: string; columns: { key: string; label: string }[]; rows: { label: string; code?: string; values: Record<string, number> }[]; note?: string }[];
}

function NotesDoc({ s, ctx }: { s: NotesSheet; ctx: PrintCtx }) {
  return (
    <div className="pd-ledger">
      <OrgHead ctx={ctx} form="Mẫu số B09-DN" formNote={FORM_NOTE} />
      <div className="pd-title" style={{ margin: '6px 0' }}><h1>BẢN THUYẾT MINH BÁO CÁO TÀI CHÍNH</h1><div className="pd-date">Từ ngày {date(s.from)} đến ngày {date(s.to)}</div></div>
      {s.general.map((g) => (
        <div key={g.title} style={{ marginTop: 6 }}>
          <b>{g.title}</b>
          <ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>{g.items.map((it, i) => <li key={i}>{it}</li>)}</ul>
        </div>
      ))}
      <div style={{ marginTop: 8 }}><b>V. Thông tin bổ sung cho các khoản mục trình bày trên báo cáo tài chính</b></div>
      {s.tables.map((t) => {
        const empty = t.rows.length <= 1 && t.rows.every((r) => Object.values(r.values).every((v) => !v));
        return (
          <div key={t.key} style={{ marginTop: 6 }}>
            <b>{t.title}</b>
            {empty ? <div className="pd-note">Không có số liệu.</div> : (
              <table className="pd-table compact">
                <thead><tr><th>Khoản mục</th><th style={{ width: 60 }}>Tài khoản</th>{t.columns.map((c) => <th key={c.key} style={{ width: 100 }}>{c.label}</th>)}</tr></thead>
                <tbody>
                  {t.rows.map((r, i) => (
                    <tr key={i} className={r.label === 'Cộng' ? 'pd-strong' : undefined}>
                      <td className={r.label === 'Cộng' ? 'c' : undefined}>{r.label}</td><td className="c">{r.code}</td>
                      {t.columns.map((c) => <td key={c.key} className="num">{mb(r.values[c.key])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {t.note && <div className="pd-note">{t.note}</div>}
          </div>
        );
      })}
      <Signs date={true} items={REPORT_SIGNS} />
      <Foot ctx={ctx} />
    </div>
  );
}

export const NOTES_TEMPLATES: PrintTemplate<NotesSheet>[] = [
  { id: 'b09', name: 'Thuyết minh báo cáo tài chính B09-DN', paper: 'A4', render: (s, ctx) => <NotesDoc s={s} ctx={ctx} /> },
  screenTemplate<NotesSheet>(),
];

/* ------------------------------------------------------------------ B01D */
export interface LongTermPrintRow { accountCode: string; accountName: string; partnerCode: string; partnerName: string; amount: number; balance: number | null; balanceSide: string; note: string }
export interface LongTermSheet { asOf: string; rows: LongTermPrintRow[] }

export const LONG_TERM_TEMPLATES: PrintTemplate<LongTermSheet>[] = [
  {
    id: 'daihan', name: 'Bảng phân loại dài hạn', paper: 'A4',
    render: (s, ctx) => (
      <LedgerForm ctx={ctx} d={{
        title: 'BẢNG PHÂN LOẠI DÀI HẠN', period: `Tại ngày ${date(s.asOf)}`, rows: s.rows, total: 'Tổng cộng', signs: REPORT_SIGNS,
        note: 'Phần phải thu, phải trả, vay có thời hạn còn lại trên 12 tháng tính từ ngày lập Báo cáo tình hình tài chính; phần còn lại trình bày ngắn hạn.',
        cols: [
          { key: 'stt', h: 'STT', w: 30, center: true, v: (_, i) => i + 1 },
          { key: 'tk', h: 'Tài khoản', w: 130, v: (r) => <>{r.accountCode}{r.accountName ? <div>{r.accountName}</div> : null}</> },
          { key: 'dt', h: 'Đối tượng', w: 140, v: (r) => (r.partnerCode ? `${r.partnerCode} ${r.partnerName}` : 'Cả tài khoản') },
          { key: 'dh', h: 'Phần dài hạn', w: 96, num: true, v: (r) => m(r.amount), sum: (r) => r.amount },
          { key: 'sd', h: 'Số dư thực tế', w: 104, num: true, v: (r) => (r.balance === null ? '' : <>{m(r.balance)}{r.balanceSide ? ` (${r.balanceSide})` : ''}</>) },
          { key: 'gc', h: 'Ghi chú', v: (r) => r.note },
        ],
      }} />
    ),
  },
  screenTemplate<LongTermSheet>(),
];
