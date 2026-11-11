/**
 * Báo cáo năm và thuế:
 *   VatReturnPage   Tờ khai thuế GTGT mẫu 01/GTGT (ACC66) — lấy số từ sổ hoá đơn, nhập các chỉ tiêu tay, lưu theo kỳ
 *   NotesPage       Thuyết minh báo cáo tài chính B09-DN — phần số liệu và chính sách kế toán
 *   LongTermPage    Phân loại dài hạn cho Báo cáo tình hình tài chính (phần còn trên 12 tháng của phải thu, phải trả, vay)
 */
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Plus, Trash2 } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { date, defaultTo, money } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { FilterLayout } from '@/components/ReportPanel';
import { BranchSelect, DateRange } from '@/components/filters';
import { Empty, ErrorBox, Loading, Modal, Money } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { AccountPicker, PartnerPicker } from '@/components/pickers';
import { PrintButton } from '@/components/print';
import { LONG_TERM_TEMPLATES, NOTES_TEMPLATES, VAT_RETURN_TEMPLATES } from '../mauIn/baoCaoThue';

/* ------------------------------------------------------------------ ACC66 tờ khai thuế GTGT */
export const MANUAL = ['21', '22', '23a', '24a', '25', '32b', '34a', '37', '38', '39a', '40b', '42'] as const;
export type Manual = Partial<Record<(typeof MANUAL)[number], number>>;

/** Cùng công thức với máy chủ (vat-return.service.ts → computeForm) để số đổi ngay khi gõ. */
export function computeForm(auto: Record<string, number>, manual: Manual): Record<string, number> {
  const v: Record<string, number> = { ...auto };
  for (const k of MANUAL) if (manual[k] !== undefined) v[k] = Number(manual[k]);
  for (const k of ['21', '22', '23a', '24a', '32b', '34a', '37', '38', '39a', '40b', '42']) v[k] = v[k] ?? 0;
  if (manual['25'] === undefined) v['25'] = auto['25'] ?? v['24'] ?? 0;
  const g = (k: string) => v[k] ?? 0;
  v['27'] = g('29') + g('30') + g('32') + g('32a') - g('32b');
  v['28'] = g('31') + g('33');
  v['34'] = g('26') + g('27') + g('34a');
  v['35'] = g('28');
  v['36'] = g('35') - g('25');
  const x = g('36') - g('22') + g('37') - g('38') - g('39a');
  v['40a'] = Math.max(x, 0);
  v['40'] = g('40a') - g('40b');
  v['41'] = Math.max(-x, 0);
  v['43'] = g('41') - g('42');
  return v;
}

export interface FormLine { stt: string; name: string; value?: string; tax?: string; bold?: boolean }
export interface Khbs { rows: { code: string; name: string; declared: number; adjusted: number; diff: number }[]; payableIncrease: number; payableDecrease: number; carriedDiff: number; deadline: string; payDate: string; lateDays: number; lateRate: number; lateInterest: number }
interface SavedReturn { periodKind: 'month' | 'quarter'; year: number; period: number; label: string; scope: string; status: 'draft' | 'final'; revision: number; lateInterest: number; payable: number; carried: number; outputTax: number; deductible: number; updatedBy: string; updatedAt: string }
interface VatData {
  form: FormLine[]; label: string; from: string; to: string; scope: string;
  values: Record<string, number>; auto: Record<string, number>; manual: Manual;
  saved: { status: 'draft' | 'final'; revision: number; values: Record<string, number>; updatedBy: string; updatedAt: string } | null;
  revisions: { revision: number; status: string; values: Record<string, number>; supplement: Khbs | null; updatedBy: string; updatedAt: string }[];
  deadline: string;
  previous: { status: string; carried43: number | null } | null;
  breakdown: { direction: string; group: string; rate: number; amount: number; tax: number; invoices: number; line: string }[];
  reduced: { rows: { name: string; amount: number; rateBefore: number; rateAfter: number; tax: number; reducedTax: number }[]; totals: { amount: number; tax: number; reducedTax: number };
    inputRows: { name: string; amount: number; tax: number }[]; inputTotals: { amount: number; tax: number } };
  salesList: BkRow[]; purchaseList: BkRow[];
  bigPurchases: { invoiceNo: string; serial: string; date: string; seller: string; taxCode: string; docNo: string; branchCode: string; total: number; tax: number }[];
  ledger: { input: number; output: number; carried: number; inputDiff: number; outputDiff: number };
}

/** Một dòng bảng kê 01-1 / 01-2: một hoá đơn trong một nhóm. */
export interface BkRow { id?: string; group: number; invoiceNo: string; serial: string; date: string; name: string; taxCode: string; amount: number; tax: number; branchCode: string; docNo: string }

// [2026-11-11 Nguyễn Văn Thủy] nhóm bảng kê theo mẫu 01-1/GTGT, 01-2/GTGT (đóng góp)
export const BKBR_GROUPS = ['Hàng hóa, dịch vụ không chịu thuế giá trị gia tăng (GTGT):', 'Hàng hóa, dịch vụ chịu thuế suất thuế GTGT 0%:', 'Hàng hóa, dịch vụ chịu thuế suất thuế GTGT 5%:', 'Hàng hóa, dịch vụ chịu thuế suất thuế GTGT 10%:'];
export const BKMV_GROUPS = [
  'Hàng hóa, dịch vụ dùng riêng cho SXKD chịu thuế GTGT và sử dụng cho các hoạt động cung cấp hàng hóa, dịch vụ không kê khai, nộp thuế GTGT đủ điều kiện khấu trừ thuế:',
  'Hàng hóa, dịch vụ dùng chung cho SXKD chịu thuế và không chịu thuế đủ điều kiện khấu trừ thuế:',
  'Hàng hóa, dịch vụ dùng cho dự án đầu tư đủ điều kiện được khấu trừ thuế:',
  'Hàng hóa, dịch vụ không đủ điều kiện được khấu trừ:',
];

/** Bảng kê hoá đơn theo nhóm: tiêu đề nhóm, từng hoá đơn, "Tổng nhóm n"; cột Chi nhánh để xem theo từng kho. */
export function BangKe({ rows, groups, kind }: { rows: BkRow[]; groups: string[]; kind: 'ban' | 'mua' }) {
  return (
    <div className="table-wrap" style={{ maxHeight: 'calc(100vh - 330px)', overflow: 'auto' }}>
      <table className="grid vat-bk">
        <thead>
          <tr><th rowSpan={2} style={{ width: 50 }}>STT</th><th colSpan={2}>{kind === 'ban' ? 'Hóa đơn, chứng từ bán ra' : 'Hóa đơn, chứng từ, biên lai nộp thuế'}</th>
            <th rowSpan={2}>{kind === 'ban' ? 'Tên người mua' : 'Tên người bán'}</th><th rowSpan={2} style={{ width: 130 }}>{kind === 'ban' ? 'Mã số thuế người mua' : 'MST người bán'}</th>
            <th rowSpan={2} className="num" style={{ width: 150 }}>{kind === 'ban' ? 'Doanh thu chưa có thuế GTGT' : 'Giá trị HHDV mua vào chưa có thuế'}</th>
            <th rowSpan={2} className="num" style={{ width: 130 }}>Thuế GTGT</th>
            <th rowSpan={2} style={{ width: 90 }} title="Chi nhánh / kho lập hoá đơn: xem quản trị theo nhiều chi nhánh (không có trên bảng kê nộp cơ quan thuế)">Chi nhánh</th></tr>
          <tr><th style={{ width: 100 }}>Số hóa đơn</th><th style={{ width: 110 }}>Ngày, tháng, năm lập hóa đơn</th></tr>
        </thead>
        <tbody>
          {groups.map((g, gi) => {
            const list = rows.filter((r) => r.group === gi + 1);
            return [
              <tr key={`h${gi}`} className="bold"><td colSpan={8}>{gi + 1}. {g}</td></tr>,
              ...list.map((r, i) => (
                <tr key={`${gi}-${i}`}><td className="num">{i + 1}</td><td className="mono">{r.invoiceNo}</td><td>{date(r.date)}</td><td>{r.name}</td><td className="mono">{r.taxCode}</td>
                  <td className="num"><Money value={r.amount} blankZero={false} /></td><td className="num"><Money value={r.tax} blankZero={false} /></td><td className="mono">{r.branchCode}</td></tr>
              )),
              <tr key={`t${gi}`} className="bold"><td colSpan={5}>Tổng nhóm {gi + 1}</td><td className="num"><Money value={list.reduce((x, r) => x + r.amount, 0)} blankZero={false} /></td><td className="num"><Money value={list.reduce((x, r) => x + r.tax, 0)} blankZero={false} /></td><td /></tr>,
            ];
          })}
        </tbody>
      </table>
    </div>
  );
}

// [2026-11-11 Nguyễn Văn Thủy] màn tờ khai cũ (VatReturnPage) thay bằng KhaiThuePage — theo mẫu chuẩn (đóng góp)

/** Bảng giải trình khai bổ sung (01/KHBS) của một lần bổ sung. */
function KhbsTable({ revision, khbs }: { revision: number; khbs: Khbs }) {
  return (
    <div style={{ margin: '8px 0 12px' }}>
      {revision > 0 && <div className="field-title">Bổ sung lần {revision}</div>}
      <table className="grid" style={{ maxWidth: 980 }}>
        <thead><tr><th>Chỉ tiêu điều chỉnh</th><th>Mã</th><th className="num">Số đã kê khai</th><th className="num">Số điều chỉnh</th><th className="num">Chênh lệch</th></tr></thead>
        <tbody>
          {khbs.rows.map((r) => (
            <tr key={r.code}><td>{r.name}</td><td className="mono">[{r.code}]</td><td className="num"><Money value={r.declared} blankZero={false} /></td><td className="num"><Money value={r.adjusted} blankZero={false} /></td><td className="num"><Money value={r.diff} blankZero={false} bold /></td></tr>
          ))}
        </tbody>
      </table>
      <table className="grid" style={{ maxWidth: 980, marginTop: 6 }}>
        <tbody>
          <tr><td>Số thuế phải nộp tăng thêm</td><td className="num"><Money value={khbs.payableIncrease} blankZero={false} bold /></td></tr>
          <tr><td>Số thuế phải nộp giảm</td><td className="num"><Money value={khbs.payableDecrease} blankZero={false} /></td></tr>
          <tr><td>Thuế còn được khấu trừ chuyển kỳ sau [43] thay đổi</td><td className="num"><Money value={khbs.carriedDiff} blankZero={false} /></td></tr>
          <tr><td>Hạn nộp tờ khai lần đầu / ngày nộp tiền dự kiến</td><td className="num">{date(khbs.deadline)} / {date(khbs.payDate)}</td></tr>
          <tr><td>Số ngày chậm nộp (tỷ lệ {(khbs.lateRate * 100).toLocaleString('vi-VN')}%/ngày)</td><td className="num">{khbs.lateDays.toLocaleString('vi-VN')}</td></tr>
          <tr className="bold"><td>Tiền chậm nộp</td><td className="num"><Money value={khbs.lateInterest} blankZero={false} bold /></td></tr>
        </tbody>
      </table>
    </div>
  );
}

/** Lập tờ khai bổ sung: xem trước giải trình 01/KHBS và tiền chậm nộp theo ngày nộp dự kiến, rồi lưu. */
export function SupplementDialog({ f, manual, label, onClose, onSaved }: { f: { periodKind: 'month' | 'quarter'; year: number; period: number; branchCodes: string }; manual: Manual; label: string; onClose: () => void; onSaved: () => void }) {
  const [payDate, setPayDate] = useState(defaultTo());
  const body = { periodKind: f.periodKind, year: f.year, period: f.period, branchCodes: f.branchCodes ? f.branchCodes.split(',') : undefined, manual, payDate };
  const preview = useQuery({ queryKey: ['vat-supplement', body], queryFn: () => api.put<{ revision: number; supplement: Khbs }>('/api/v1/vat-returns/supplement', { ...body, dryRun: true }) });
  const save = useMutation({ mutationFn: () => api.put('/api/v1/vat-returns/supplement', { ...body, dryRun: false }), onSuccess: onSaved });
  const p = preview.data;
  const exportExcel = async () => {
    if (!p) return;
    const XLSX = await import('@/lib/excelChuan').then((m) => m.xlsxChuan()); // [2026-11-11 Nguyễn Văn Thủy] xuất Excel định dạng chuẩn (đóng góp)
    const k = p.supplement;
    const rows = [['BẢN GIẢI TRÌNH KHAI BỔ SUNG, ĐIỀU CHỈNH (Mẫu số 01/KHBS)'], [`Tờ khai 01/GTGT kỳ ${label} — bổ sung lần ${p.revision}`], [], ['STT', 'Chỉ tiêu điều chỉnh', 'Mã chỉ tiêu', 'Số đã kê khai', 'Số điều chỉnh', 'Chênh lệch'],
      ...k.rows.map((r, i) => [i + 1, r.name, `[${r.code}]`, r.declared, r.adjusted, r.diff]), [],
      ['Số thuế phải nộp tăng thêm', '', '', '', '', k.payableIncrease], ['Số thuế phải nộp giảm', '', '', '', '', k.payableDecrease],
      ['Số ngày chậm nộp', '', '', '', '', k.lateDays], ['Tiền chậm nộp', '', '', '', '', k.lateInterest]];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '01-KHBS');
    XLSX.writeFile(wb, `01-khbs-${f.year}-${f.periodKind === 'month' ? 'T' : 'Q'}${f.period}-lan-${p.revision}.xlsx`);
  };
  return (
    <Modal wide title={`Lập tờ khai bổ sung — kỳ ${label}${p ? `, lần ${p.revision}` : ''}`} onClose={onClose}
      footer={<>
        <button className="btn" style={{ marginRight: 'auto' }} disabled={!p} onClick={() => void exportExcel()}><Download size={16} /> Xuất Excel 01/KHBS</button>
        <button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn btn-primary" disabled={!p || !p.supplement.rows.length || save.isPending} onClick={() => save.mutate()}>Lưu tờ khai bổ sung</button>
      </>}>
      <div className="full muted">
        Số điều chỉnh là tờ khai tính lại theo sổ hoá đơn hiện tại (kèm các ô nhập tay đang có trên màn). Tờ khai lần đầu và các lần bổ sung trước vẫn được giữ nguyên.
        Tiền chậm nộp = số thuế tăng thêm × 0,03% × số ngày, tính từ ngày kế tiếp hạn nộp đến ngày liền trước ngày nộp tiền.
      </div>
      <div className="field">
        <label>Ngày dự kiến nộp tiền</label>
        <input type="date" className="input" value={payDate} onChange={(e) => setPayDate(e.target.value || defaultTo())} />
      </div>
      <div className="full">
        <ErrorBox error={preview.error ? errorText(preview.error) : save.error ? errorText(save.error) : null} />
        {preview.isLoading ? <Loading /> : p && (p.supplement.rows.length ? <KhbsTable revision={0} khbs={p.supplement} /> : <Empty text="Số tính lại không khác tờ khai đã nộp: không cần khai bổ sung" />)}
        {p && p.supplement.lateInterest > 0 && <p className="muted">Hạn nộp rơi vào ngày nghỉ lễ thì lùi sang ngày làm việc kế tiếp: kiểm tra lại số ngày chậm nộp trước khi nộp.</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ B09 thuyết minh */
interface NoteTable { key: string; title: string; columns: { key: string; label: string }[]; rows: { label: string; code?: string; values: Record<string, number> }[]; note?: string }
interface NotesData { from: string; to: string; company: { name: string; taxCode: string | null; address: string | null }; general: { title: string; items: string[] }[]; tables: NoteTable[] }

/** Lời văn thuyết minh theo chữ người dùng đã sửa trực tiếp trên màn (các mục đầu của .notes-b09, mỗi ý một <li>). */
function editedGeneral(general: NotesData['general']): NotesData['general'] {
  const secs = document.querySelectorAll('.notes-b09 > section');
  return general.map((s, i) => {
    const lis = secs[i]?.querySelectorAll('li');
    return { ...s, items: s.items.map((it, j) => lis?.[j]?.textContent ?? it) };
  });
}

export function NotesPage() {
  const [f, setF] = useState({ from: `${new Date().getFullYear()}-01-01`, to: defaultTo() });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));
  const q = useQuery({ queryKey: ['notes', f], queryFn: () => api.get<NotesData>('/api/v1/reports/notes', f) });
  const d = q.data;
  const exportAll = async () => {
    if (!d) return;
    const XLSX = await import('@/lib/excelChuan').then((m) => m.xlsxChuan()); // [2026-11-11 Nguyễn Văn Thủy] xuất Excel định dạng chuẩn (đóng góp)
    const aoa: (string | number)[][] = [['THUYẾT MINH BÁO CÁO TÀI CHÍNH (Mẫu B09-DN)'], [d.company.name], [`Từ ${date(d.from)} đến ${date(d.to)}`], []];
    for (const s of d.general) { aoa.push([s.title]); for (const it of s.items) aoa.push(['', it]); aoa.push([]); }
    aoa.push(['V. THÔNG TIN BỔ SUNG CHO CÁC KHOẢN MỤC TRÌNH BÀY TRÊN BÁO CÁO TÀI CHÍNH'], []);
    for (const t of d.tables) {
      aoa.push([t.title]);
      aoa.push(['Khoản mục', 'Tài khoản', ...t.columns.map((c) => c.label)]);
      for (const r of t.rows) aoa.push([r.label, r.code ?? '', ...t.columns.map((c) => r.values[c.key] ?? 0)]);
      if (t.note) aoa.push(['', t.note]);
      aoa.push([]);
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'B09-DN');
    XLSX.writeFile(wb, `thuyet-minh-bctc-${f.to}.xlsx`);
  };
  return (
    <>
      <PageHeader title="Thuyết minh báo cáo tài chính" code="B09" subtitle="Mẫu B09-DN (Thông tư 99/2025/TT-BTC) — chính sách kế toán và số liệu chi tiết cho các khoản mục" helpKey="thuyet-minh-bctc"
        actions={<>
          <button className="btn" disabled={!d} onClick={() => void exportAll()}><Download size={16} /> Xuất Excel</button>
        </>} />
      <FilterLayout
        print={<PrintButton screen="B09" templates={NOTES_TEMPLATES} disabled={!d} getDocs={() => (d ? [{ from: d.from, to: d.to, general: editedGeneral(d.general), tables: d.tables }] : [])} />}
        filters={
          <>
            <DateRange from={f.from} to={f.to} onChange={(from, to) => set({ from, to })} />
          </>
        }
      >
        <div className="card">
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading || !d ? <Loading /> : (
            <div className="card-body notes-b09">
              <p className="muted">Phần lời văn phần mềm soạn sẵn theo cách đang hạch toán — bấm vào đoạn chữ để sửa trước khi in. Phần sự kiện sau ngày kết thúc kỳ, bên liên quan, nợ tiềm tàng… kế toán tự bổ sung.</p>
              {d.general.map((s) => (
                <section key={s.title}>
                  <h3>{s.title}</h3>
                  <ul>{s.items.map((it, i) => <li key={i} contentEditable suppressContentEditableWarning>{it}</li>)}</ul>
                </section>
              ))}
              <h3>V. Thông tin bổ sung cho các khoản mục trình bày trên báo cáo tài chính</h3>
              {d.tables.map((t) => (
                <section key={t.key} style={{ marginBottom: 18 }}>
                  <h4>{t.title}</h4>
                  {t.rows.length <= 1 && t.rows.every((r) => Object.values(r.values).every((v) => !v)) ? <p className="muted">Không có số liệu.</p> : (
                    <table className="grid">
                      <thead><tr><th>Khoản mục</th><th style={{ width: 90 }}>Tài khoản</th>{t.columns.map((c) => <th key={c.key} className="num" style={{ width: 150 }}>{c.label}</th>)}</tr></thead>
                      <tbody>
                        {t.rows.map((r, i) => (
                          <tr key={i} className={r.label === 'Cộng' ? 'bold' : ''}>
                            <td>{r.label}</td><td className="mono">{r.code}</td>
                            {t.columns.map((c) => <td key={c.key} className="num"><Money value={r.values[c.key] ?? 0} bold={r.label === 'Cộng'} /></td>)}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                  {t.note && <p className="muted" style={{ marginTop: 4 }}>{t.note}</p>}
                </section>
              ))}
            </div>
          )}
        </div>
      </FilterLayout>
    </>
  );
}

/* ------------------------------------------------------------------ Phân loại dài hạn */
interface LtRow { accountCode: string; accountName: string; partnerCode: string | null; partnerName: string | null; amount: number; note: string; balance: number; balanceSide: string; rule: string }
interface LtData { asOf: string; rows: LtRow[]; savedDates: { asOf: string; lines: number }[] }
interface Rule { prefix: string; label: string; asset: [string, string] | null; liability: [string, string] | null }
interface Draft { accountCode: string; partnerCode: string; amount: string; note: string }

export function LongTermPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const [asOf, setAsOf] = useState(defaultTo());
  const q = useQuery({ queryKey: ['long-term', asOf], queryFn: () => api.get<LtData>('/api/v1/long-term-balances', { asOf }) });
  const rules = useQuery({ queryKey: ['long-term-rules'], queryFn: () => api.get<Rule[]>('/api/v1/long-term-balances/rules'), staleTime: Infinity });
  const [lines, setLines] = useState<Draft[]>([]);
  useEffect(() => { if (q.data) setLines(q.data.rows.map((r) => ({ accountCode: r.accountCode, partnerCode: r.partnerCode ?? '', amount: money(r.amount), note: r.note }))); }, [q.data]);
  const save = useMutation({
    mutationFn: () => api.put('/api/v1/long-term-balances', { asOf, lines: lines.filter((l) => l.accountCode).map((l) => ({ accountCode: l.accountCode, partnerCode: l.partnerCode || null, amount: Number(l.amount.replace(/[^\d]/g, '')), note: l.note })) }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['long-term'] }),
  });
  const setLine = (i: number, p: Partial<Draft>) => setLines((xs) => xs.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const info = (l: Draft) => q.data?.rows.find((r) => r.accountCode === l.accountCode && (r.partnerCode ?? '') === l.partnerCode);
  const readOnly = !can('documents:write');
  return (
    <>
      <PageHeader title="Phân loại dài hạn" code="B01D" subtitle="Phần còn trên 12 tháng của phải thu, phải trả, vay tại ngày lập Báo cáo tình hình tài chính" helpKey="phan-loai-dai-han"
        actions={<>
          <PrintButton screen="B01D" templates={LONG_TERM_TEMPLATES} disabled={!q.data}
            getDocs={() => [{ asOf, rows: lines.filter((l) => l.accountCode).map((l) => { const r = info(l); return { accountCode: l.accountCode, accountName: r?.accountName ?? '', partnerCode: l.partnerCode, partnerName: r?.partnerName ?? '', amount: Number(l.amount.replace(/[^\d]/g, '')), balance: r ? r.balance : null, balanceSide: r?.balanceSide ?? '', note: l.note }; }) }]} />
          {!readOnly && <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Ghi</button>}
        </>} />
      <div className="card">
        <div className="filters">
          <div className="field"><label>Ngày lập báo cáo</label><input type="date" className="input w-md" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} /></div>
          {q.data && q.data.savedDates.length > 0 && (
            <div className="field"><label>Ngày đã khai</label>
              <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>{q.data.savedDates.map((s) => <button key={s.asOf} className={`btn btn-sm ${s.asOf === asOf ? 'btn-primary' : ''}`} onClick={() => setAsOf(s.asOf)}>{date(s.asOf)} ({s.lines})</button>)}</div>
            </div>
          )}
        </div>
        <div className="card-body" style={{ paddingTop: 6 }}>
          <p className="muted" style={{ margin: 0 }}>
            Số dư phải thu, phải trả, vay mặc định trình bày là <b>ngắn hạn</b>. Khai ở đây phần có thời hạn còn lại <b>trên 12 tháng</b> tính từ ngày lập báo cáo
            (ví dụ khoản vay trả dần: phần gốc đến hạn sau 12 tháng). Báo cáo tình hình tài chính của đúng ngày này sẽ chuyển số sang chỉ tiêu dài hạn.
            Khai cả ngày cuối năm trước để cột "Số đầu năm" cũng tách đúng. Chi phí chờ phân bổ (242) và vay dài hạn 34112 phần mềm tự tách, không cần khai.
          </p>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : null} />
        {save.isSuccess && <div className="alert alert-ok" style={{ margin: 12 }}>Đã ghi.</div>}
        {q.isLoading ? <Loading /> : (
          <div className="card-body">
            <table className="grid voucher-lines">
              <thead><tr><th style={{ width: 200 }}>Tài khoản</th><th style={{ width: 240 }}>Đối tượng (trống = cả tài khoản)</th><th className="num" style={{ width: 170 }}>Phần dài hạn</th><th className="num" style={{ width: 170 }}>Số dư thực tế</th><th>Ghi chú</th><th style={{ width: 36 }} /></tr></thead>
              <tbody>
                {lines.map((l, i) => {
                  const r = info(l);
                  return (
                    <tr key={i}>
                      <td><AccountPicker postingOnly value={l.accountCode} disabled={readOnly} onChange={(accountCode) => setLine(i, { accountCode })} /></td>
                      <td><PartnerPicker value={l.partnerCode} disabled={readOnly} onChange={(partnerCode) => setLine(i, { partnerCode })} placeholder="Tất cả" /></td>
                      <td><input className="input num" inputMode="numeric" value={l.amount} disabled={readOnly} onChange={(e) => setLine(i, { amount: e.target.value })} onBlur={() => setLine(i, { amount: l.amount ? money(Number(l.amount.replace(/[^\d]/g, ''))) : '' })} /></td>
                      <td className="num">{r ? <>{money(r.balance, { blankZero: false })} <span className="muted">dư {r.balanceSide}</span>{r.amount > r.balance && <div className="text-bad" style={{ fontSize: 12 }}>vượt số dư</div>}</> : <span className="muted">ghi để xem</span>}</td>
                      <td><input className="input" value={l.note} disabled={readOnly} onChange={(e) => setLine(i, { note: e.target.value })} placeholder="Ví dụ: hợp đồng vay số…, trả gốc từ…" /></td>
                      <td>{!readOnly && <button className="btn btn-sm btn-ghost" title="Xoá dòng" onClick={() => setLines((xs) => xs.filter((_, j) => j !== i))}><Trash2 size={15} /></button>}</td>
                    </tr>
                  );
                })}
                {lines.length === 0 && <tr><td colSpan={6} className="muted" style={{ padding: 12 }}>Chưa khai phần dài hạn nào cho ngày này — mọi số dư đang trình bày ngắn hạn.</td></tr>}
              </tbody>
            </table>
            {!readOnly && <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => setLines((xs) => [...xs, { accountCode: '', partnerCode: '', amount: '', note: '' }])}><Plus size={14} /> Thêm dòng</button>}
            {rules.data && (
              <details style={{ marginTop: 16 }}>
                <summary className="muted">Tài khoản khai được và chỉ tiêu B01 tương ứng</summary>
                <table className="grid" style={{ marginTop: 8, maxWidth: 820 }}>
                  <thead><tr><th>Đầu tài khoản</th><th>Nội dung</th><th>Dư Nợ: ngắn hạn → dài hạn</th><th>Dư Có: ngắn hạn → dài hạn</th></tr></thead>
                  <tbody>{rules.data.map((r) => <tr key={r.prefix}><td className="mono">{r.prefix}</td><td>{r.label}</td><td className="mono">{r.asset ? `${r.asset[0]} → ${r.asset[1]}` : ''}</td><td className="mono">{r.liability ? `${r.liability[0]} → ${r.liability[1]}` : ''}</td></tr>)}</tbody>
                </table>
              </details>
            )}
          </div>
        )}
      </div>
    </>
  );
}

