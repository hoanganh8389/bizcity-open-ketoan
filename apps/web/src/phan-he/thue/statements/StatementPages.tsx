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
const MANUAL = ['21', '22', '23a', '24a', '25', '32b', '34a', '37', '38', '39a', '40b', '42'] as const;
type Manual = Partial<Record<(typeof MANUAL)[number], number>>;

/** Cùng công thức với máy chủ (vat-return.service.ts → computeForm) để số đổi ngay khi gõ. */
function computeForm(auto: Record<string, number>, manual: Manual): Record<string, number> {
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

interface FormLine { stt: string; name: string; value?: string; tax?: string; bold?: boolean }
interface Khbs { rows: { code: string; name: string; declared: number; adjusted: number; diff: number }[]; payableIncrease: number; payableDecrease: number; carriedDiff: number; deadline: string; payDate: string; lateDays: number; lateRate: number; lateInterest: number }
interface SavedReturn { periodKind: 'month' | 'quarter'; year: number; period: number; label: string; scope: string; status: 'draft' | 'final'; revision: number; lateInterest: number; payable: number; carried: number; outputTax: number; deductible: number; updatedBy: string; updatedAt: string }
interface VatData {
  form: FormLine[]; label: string; from: string; to: string; scope: string;
  values: Record<string, number>; auto: Record<string, number>; manual: Manual;
  saved: { status: 'draft' | 'final'; revision: number; values: Record<string, number>; updatedBy: string; updatedAt: string } | null;
  revisions: { revision: number; status: string; values: Record<string, number>; supplement: Khbs | null; updatedBy: string; updatedAt: string }[];
  deadline: string;
  previous: { status: string; carried43: number | null } | null;
  breakdown: { direction: string; group: string; rate: number; amount: number; tax: number; invoices: number; line: string }[];
  reduced: { rows: { name: string; amount: number; rateBefore: number; rateAfter: number; tax: number; reducedTax: number }[]; totals: { amount: number; tax: number; reducedTax: number } };
  bigPurchases: { invoiceNo: string; serial: string; date: string; seller: string; taxCode: string; docNo: string; branchCode: string; total: number; tax: number }[];
  ledger: { input: number; output: number; carried: number; inputDiff: number; outputDiff: number };
}

export function VatReturnPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const now = new Date();
  const [f, setF] = useState({ periodKind: 'month' as 'month' | 'quarter', year: now.getFullYear(), period: now.getMonth() + 1, branchCodes: '' });
  const [tab, setTab] = useState<'phu-luc' | 'mua-vao' | 'thue-suat' | 'so-cai'>('phu-luc');
  const [supplementing, setSupplementing] = useState(false);
  const q = useQuery({ queryKey: ['vat-return', f], queryFn: () => api.get<VatData>('/api/v1/vat-returns/build', f) });
  const d = q.data;
  const [manual, setManual] = useState<Manual>({});
  useEffect(() => { if (d) setManual(d.manual); }, [d]);
  // Đã lưu chính thức: hiện đúng số đã lưu (không tự tính lại theo hoá đơn), so với số tính lại để biết có cần khai bổ sung.
  const final = d?.saved?.status === 'final';
  const recomputed = useMemo(() => (d ? computeForm(d.auto, manual) : {}), [d, manual]);
  const values = final && d?.saved ? d.saved.values : recomputed;
  const changed = final && d ? ['24', '25', '28', '35', '36', '40', '43'].filter((k) => Math.round(recomputed[k] ?? 0) !== Math.round(d.saved!.values[k] ?? 0)) : [];
  const saved = useQuery({ queryKey: ['vat-returns'], queryFn: () => api.get<SavedReturn[]>('/api/v1/vat-returns') });
  const save = useMutation({
    mutationFn: (status: 'draft' | 'final') => api.put('/api/v1/vat-returns', { periodKind: f.periodKind, year: f.year, period: f.period, branchCodes: f.branchCodes ? f.branchCodes.split(',') : undefined, status, manual }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['vat-return'] }); void qc.invalidateQueries({ queryKey: ['vat-returns'] }); },
  });
  const editable = (k?: string) => Boolean(k && (MANUAL as readonly string[]).includes(k)) && can('documents:write') && !final;
  const cell = (k?: string) => {
    if (!k) return null;
    if (k === '21') return <input type="checkbox" checked={Boolean(manual['21'])} disabled={!editable(k)} onChange={(e) => setManual((m) => ({ ...m, '21': e.target.checked ? 1 : 0 }))} />;
    if (editable(k)) {
      const val = manual[k as keyof Manual];
      return (
        <input className="input num" style={{ width: 150 }} inputMode="numeric" value={val === undefined ? '' : money(val, { blankZero: false })}
          placeholder={k === '25' ? money(d?.auto['25'] ?? values['24'] ?? 0, { blankZero: false }) : '0'}
          onChange={(e) => { const s = e.target.value.replace(/[^\d-]/g, ''); setManual((m) => ({ ...m, [k]: s === '' ? undefined : Number(s) })); }} />
      );
    }
    return <Money value={values[k] ?? 0} blankZero={false} />;
  };
  const exportExcel = async () => {
    if (!d) return;
    const XLSX = await import('xlsx');
    const rows = [['TỜ KHAI THUẾ GIÁ TRỊ GIA TĂNG (Mẫu số 01/GTGT)'], [`Kỳ tính thuế: ${d.label}`], [], ['STT', 'Chỉ tiêu', 'Mã chỉ tiêu (giá trị)', 'Giá trị HHDV (chưa thuế)', 'Mã chỉ tiêu (thuế)', 'Thuế GTGT'],
      ...d.form.map((l) => [l.stt, l.name, l.value ? `[${l.value}]` : '', l.value ? values[l.value] ?? 0 : '', l.tax ? `[${l.tax}]` : '', l.tax ? values[l.tax] ?? 0 : ''])];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), '01-GTGT');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Tên hàng hoá, dịch vụ', 'Giá trị chưa thuế', 'Thuế suất quy định', 'Thuế suất sau giảm', 'Thuế GTGT được giảm'], ...d.reduced.rows.map((r) => [r.name, r.amount, '10%', '8%', r.reducedTax])]), 'Phu luc giam thue');
    XLSX.writeFile(wb, `to-khai-01-gtgt-${f.year}-${f.periodKind === 'month' ? 'T' : 'Q'}${f.period}.xlsx`);
  };
  const years = Array.from({ length: 6 }, (_, i) => now.getFullYear() - 3 + i);

  return (
    <>
      <PageHeader title="Tờ khai thuế GTGT" code="ACC66" subtitle="Mẫu 01/GTGT — phương pháp khấu trừ; số liệu lấy từ sổ hoá đơn mua vào, bán ra" helpKey="to-khai-gtgt"
        actions={<>
          <button className="btn" disabled={!d} onClick={() => void exportExcel()}><Download size={16} /> Xuất Excel</button>
          {can('documents:write') && !final && <button className="btn" disabled={!d || save.isPending} onClick={() => save.mutate('draft')}>Lưu nháp</button>}
          {can('documents:write') && !final && <button className="btn btn-primary" disabled={!d || save.isPending} onClick={() => save.mutate('final')}>Lưu chính thức</button>}
          {can('documents:write') && final && changed.length > 0 && <button className="btn btn-primary" onClick={() => setSupplementing(true)}>Lập tờ khai bổ sung</button>}
          {can('documents:write') && final && <button className="btn" disabled={save.isPending} onClick={() => window.confirm('Mở lại tờ khai đã lưu chính thức để sửa? Chỉ dùng khi CHƯA nộp tờ khai này cho cơ quan thuế. Tờ khai chuyển về bản nháp, số được tính lại theo hoá đơn hiện tại.') && save.mutate('draft')}>Mở lại để sửa</button>}
        </>} />
      <FilterLayout
        print={<PrintButton screen="ACC66" templates={VAT_RETURN_TEMPLATES} disabled={!d}
          getDocs={() => (d ? [{ label: d.label, from: d.from, to: d.to, branchCodes: f.branchCodes, status: d.saved?.status ?? null, revision: d.saved?.revision ?? 0, form: d.form, values, reduced: d.reduced }] : [])} />}
        filters={
          <>
            <div className="field">
              <label>Kỳ khai</label>
              <select className="select input w-sm" value={f.periodKind} onChange={(e) => setF((x) => ({ ...x, periodKind: e.target.value as 'month' | 'quarter', period: 1 }))}>
                <option value="month">Tháng</option><option value="quarter">Quý</option>
              </select>
            </div>
            <div className="field">
              <label>{f.periodKind === 'month' ? 'Tháng' : 'Quý'}</label>
              <select className="select input w-sm" value={f.period} onChange={(e) => setF((x) => ({ ...x, period: Number(e.target.value) }))}>
                {Array.from({ length: f.periodKind === 'month' ? 12 : 4 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
            </div>
            <div className="field">
              <label>Năm</label>
              <select className="select input w-sm" value={f.year} onChange={(e) => setF((x) => ({ ...x, year: Number(e.target.value) }))}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
            </div>
            <BranchSelect value={f.branchCodes} onChange={(branchCodes) => setF((x) => ({ ...x, branchCodes }))} label="Chi nhánh (trống = cả đơn vị)" />
          </>
        }
      >
        <div className="card">
          {saved.data && saved.data.length > 0 && (
            <details className="card-body" style={{ paddingTop: 0, paddingBottom: 8 }} open={!d?.saved}>
              <summary>Các tờ khai đã lưu ({saved.data.length}) — bấm một dòng để mở</summary>
              <table className="grid" style={{ marginTop: 6, maxWidth: 980 }}>
                <thead><tr><th>Kỳ</th><th>Phạm vi</th><th>Trạng thái</th><th className="num">Thuế đầu ra [35]</th><th className="num">Được khấu trừ [25]</th><th className="num">Phải nộp [40]</th><th className="num">Còn khấu trừ [43]</th><th>Lưu lúc</th></tr></thead>
                <tbody>
                  {saved.data.map((s) => (
                    <tr key={`${s.periodKind}-${s.year}-${s.period}-${s.scope}-${s.revision}`} className={`clickable ${s.periodKind === f.periodKind && s.year === f.year && s.period === f.period && s.scope === (f.branchCodes ? f.branchCodes.split(',').sort().join(',') : '') ? 'active' : ''}`}
                      onClick={() => setF({ periodKind: s.periodKind, year: s.year, period: s.period, branchCodes: s.scope })}>
                      <td>{s.label}{s.revision > 0 ? ` — bổ sung lần ${s.revision}` : ''}</td><td>{s.scope || 'Cả đơn vị'}</td>
                      <td><span className={`badge ${s.status === 'final' ? 'badge-ok' : 'badge-gray'}`}>{s.status === 'final' ? 'Chính thức' : 'Nháp'}</span></td>
                      <td className="num"><Money value={s.outputTax} /></td><td className="num"><Money value={s.deductible} /></td>
                      <td className="num"><Money value={s.payable} /></td><td className="num"><Money value={s.carried} /></td>
                      <td>{new Date(s.updatedAt).toLocaleString('vi-VN')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : null} />
          {save.isSuccess && <div className="alert alert-ok" style={{ margin: 12 }}>Đã lưu tờ khai.</div>}
          {q.isLoading || !d ? <Loading /> : (
            <>
              <div className="card-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
                <span>Kỳ tính thuế: <b>{d.label}</b> ({date(d.from)} – {date(d.to)})</span>
                {d.saved ? <span className={`badge ${d.saved.status === 'final' ? 'badge-ok' : 'badge-gray'}`} style={{ marginLeft: 10 }}>{d.saved.status === 'final' ? (d.saved.revision > 0 ? `Đã khai bổ sung lần ${d.saved.revision}` : 'Đã lưu chính thức') : 'Bản nháp'}</span> : <span className="badge badge-gray" style={{ marginLeft: 10 }}>Chưa lưu</span>}
                <span className="muted" style={{ marginLeft: 10 }}>Hạn nộp: {date(d.deadline)}</span>
                {d.previous?.carried43 !== null && d.previous?.carried43 !== undefined && <span className="muted" style={{ marginLeft: 10 }}>Kỳ trước còn được khấu trừ chuyển sang [43]: {money(d.previous.carried43, { blankZero: false })}</span>}
                <p className="muted" style={{ margin: '6px 0 0' }}>
                  Ô có khung là chỉ tiêu nhập tay. [25] để trống = [24] trừ thuế của hoá đơn đã đánh dấu không được khấu trừ ở màn Bổ sung thông tin thuế (ACC78).
                  Hoá đơn xếp vào kỳ theo kỳ kê khai chọn ở ACC78, không thì theo ngày hoá đơn.
                  Hàng giảm thuế còn 8% kê vào dòng 10% ([32], [33]) kèm phụ lục giảm thuế. Nộp tờ khai qua cổng thuế điện tử: nhập lại số hoặc nhập từ tệp Excel.
                </p>
              </div>
              {final && changed.length > 0 && (
                <div className="alert alert-warn" style={{ margin: '0 12px 8px' }}>
                  Hoá đơn của kỳ đã thay đổi sau khi lưu chính thức: chỉ tiêu {changed.map((k) => `[${k}] lưu ${money(d.saved!.values[k] ?? 0, { blankZero: false })} → tính lại ${money(recomputed[k] ?? 0, { blankZero: false })}`).join('; ')}.
                  Đã nộp tờ khai thì bấm "Lập tờ khai bổ sung"; chưa nộp thì bấm "Mở lại để sửa" rồi lưu lại.
                </div>
              )}
              {final && <div className="muted" style={{ margin: '0 12px 8px' }}>Tờ khai đã lưu chính thức{d.saved?.updatedBy ? ` bởi ${d.saved.updatedBy}` : ''}{d.saved?.updatedAt ? ` lúc ${new Date(d.saved.updatedAt).toLocaleString('vi-VN')}` : ''}: số dưới đây là số đã lưu, không tự đổi theo hoá đơn.</div>}
              {d.revisions.some((r) => r.supplement) && (
                <details className="card-body" style={{ paddingTop: 0 }}>
                  <summary>Các lần khai bổ sung ({d.revisions.filter((r) => r.supplement).length})</summary>
                  {d.revisions.filter((r) => r.supplement).map((r) => <KhbsTable key={r.revision} revision={r.revision} khbs={r.supplement!} />)}
                </details>
              )}
              <div className="table-wrap">
                <table className="grid vat-form">
                  <thead><tr><th style={{ width: 50 }}>STT</th><th>Chỉ tiêu</th><th style={{ width: 70 }}>Mã</th><th className="num" style={{ width: 190 }}>Giá trị HHDV (chưa thuế)</th><th style={{ width: 70 }}>Mã</th><th className="num" style={{ width: 190 }}>Thuế GTGT</th></tr></thead>
                  <tbody>
                    {d.form.map((l, i) => (
                      <tr key={i} className={l.bold ? 'bold' : ''}>
                        <td>{l.stt}</td>
                        <td>{l.name}</td>
                        <td className="mono">{l.value ? `[${l.value}]` : ''}</td>
                        <td className="num">{cell(l.value)}</td>
                        <td className="mono">{l.tax ? `[${l.tax}]` : ''}</td>
                        <td className="num">{cell(l.tax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="tabs" style={{ marginTop: 12 }}>
                {([['phu-luc', `Phụ lục giảm thuế 8% (${d.reduced.rows.length})`], ['mua-vao', `Hoá đơn mua vào từ 5 triệu (${d.bigPurchases.length})`], ['thue-suat', 'Chi tiết theo thuế suất'], ['so-cai', 'Đối chiếu sổ cái']] as const).map(([k, l]) => (
                  <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
                ))}
              </div>
              {tab === 'phu-luc' && (d.reduced.rows.length ? (
                <DataGrid storageKey="acc66-giam-thue" rows={d.reduced.rows} rowKey={(r) => r.name} exportName="phu-luc-giam-thue-gtgt"
                  columns={[
                    { key: 'name', header: 'Tên hàng hoá, dịch vụ' },
                    { key: 'amount', header: 'Giá trị chưa thuế', type: 'money', sum: true },
                    { key: 'rateBefore', header: 'Thuế suất quy định', value: () => '10%' },
                    { key: 'rateAfter', header: 'Thuế suất sau giảm', value: () => '8%' },
                    { key: 'tax', header: 'Thuế GTGT 8%', type: 'money', sum: true },
                    { key: 'reducedTax', header: 'Thuế GTGT được giảm (2%)', type: 'money', sum: true, bold: true },
                  ] satisfies Column<VatData['reduced']['rows'][number]>[]} />
              ) : <Empty text="Kỳ này không có hàng bán ra thuế suất 8%" />)}
              {tab === 'mua-vao' && (d.bigPurchases.length ? (
                <DataGrid storageKey="acc66-mua-vao" rows={d.bigPurchases} rowKey={(r, i) => `${r.serial}-${r.invoiceNo}-${i}`} exportName="hoa-don-mua-vao-tu-5-trieu"
                  note="cần chứng từ thanh toán không dùng tiền mặt mới được khấu trừ"
                  columns={[
                    { key: 'date', header: 'Ngày HĐ', type: 'date' },
                    { key: 'serial', header: 'Ký hiệu', type: 'code' },
                    { key: 'invoiceNo', header: 'Số HĐ', type: 'code' },
                    { key: 'seller', header: 'Người bán' },
                    { key: 'taxCode', header: 'Mã số thuế', type: 'code' },
                    { key: 'docNo', header: 'Số chứng từ', type: 'code' },
                    { key: 'branchCode', header: 'Chi nhánh', type: 'code' },
                    { key: 'total', header: 'Tổng thanh toán', type: 'money', sum: true },
                    { key: 'tax', header: 'Thuế GTGT', type: 'money', sum: true },
                  ] satisfies Column<VatData['bigPurchases'][number]>[]} />
              ) : <Empty text="Không có hoá đơn mua vào từ 5 triệu đồng trong kỳ" />)}
              {tab === 'thue-suat' && (
                <DataGrid storageKey="acc66-thue-suat" rows={d.breakdown} rowKey={(r, i) => `${r.direction}-${r.group}-${i}`} footerLabel={false}
                  columns={[
                    { key: 'direction', header: 'Chiều', value: (r) => (r.direction === 'input' ? 'Mua vào' : 'Bán ra') },
                    { key: 'group', header: 'Nhóm bảng kê', type: 'code' },
                    { key: 'rate', header: 'Thuế suất', value: (r) => `${r.rate}%` },
                    { key: 'invoices', header: 'Số hoá đơn', type: 'number' },
                    { key: 'amount', header: 'Giá trị chưa thuế', type: 'money' },
                    { key: 'tax', header: 'Thuế GTGT', type: 'money' },
                    { key: 'line', header: 'Lên chỉ tiêu', type: 'code' },
                  ] satisfies Column<VatData['breakdown'][number]>[]} />
              )}
              {tab === 'so-cai' && (
                <div className="card-body">
                  <table className="grid" style={{ maxWidth: 760 }}>
                    <thead><tr><th>So sánh với sổ kế toán</th><th className="num">Tờ khai</th><th className="num">Sổ cái</th><th className="num">Chênh lệch</th></tr></thead>
                    <tbody>
                      <tr><td>Thuế GTGT mua vào [24] — phát sinh Nợ 133</td><td className="num"><Money value={values['24'] ?? 0} blankZero={false} /></td><td className="num"><Money value={d.ledger.input} blankZero={false} /></td><td className="num"><Money value={(values['24'] ?? 0) - d.ledger.input} blankZero={false} /></td></tr>
                      <tr><td>Thuế GTGT bán ra [28] — phát sinh Có 33311</td><td className="num"><Money value={values['28'] ?? 0} blankZero={false} /></td><td className="num"><Money value={d.ledger.output} blankZero={false} /></td><td className="num"><Money value={(values['28'] ?? 0) - d.ledger.output} blankZero={false} /></td></tr>
                      <tr><td>Thuế còn được khấu trừ kỳ trước [22] — dư Nợ 133 đầu kỳ</td><td className="num"><Money value={values['22'] ?? 0} blankZero={false} /></td><td className="num"><Money value={d.ledger.carried} blankZero={false} /></td><td className="num"><Money value={(values['22'] ?? 0) - d.ledger.carried} blankZero={false} /></td></tr>
                    </tbody>
                  </table>
                  <p className="muted">Chênh lệch thường do hoá đơn điều chỉnh, hoá đơn khai bổ sung kỳ khác, hoặc bút toán thuế nhập tay không kèm hoá đơn. Kiểm tra ở Bảng kê mua vào / bán ra (ACC64, ACC65).</p>
                </div>
              )}
            </>
          )}
        </div>
      </FilterLayout>
      {supplementing && d && <SupplementDialog f={f} manual={manual} label={d.label} onClose={() => setSupplementing(false)} onSaved={() => { setSupplementing(false); void qc.invalidateQueries({ queryKey: ['vat-return'] }); void qc.invalidateQueries({ queryKey: ['vat-returns'] }); }} />}
    </>
  );
}

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
function SupplementDialog({ f, manual, label, onClose, onSaved }: { f: { periodKind: 'month' | 'quarter'; year: number; period: number; branchCodes: string }; manual: Manual; label: string; onClose: () => void; onSaved: () => void }) {
  const [payDate, setPayDate] = useState(defaultTo());
  const body = { periodKind: f.periodKind, year: f.year, period: f.period, branchCodes: f.branchCodes ? f.branchCodes.split(',') : undefined, manual, payDate };
  const preview = useQuery({ queryKey: ['vat-supplement', body], queryFn: () => api.put<{ revision: number; supplement: Khbs }>('/api/v1/vat-returns/supplement', { ...body, dryRun: true }) });
  const save = useMutation({ mutationFn: () => api.put('/api/v1/vat-returns/supplement', { ...body, dryRun: false }), onSuccess: onSaved });
  const p = preview.data;
  const exportExcel = async () => {
    if (!p) return;
    const XLSX = await import('xlsx');
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
    const XLSX = await import('xlsx');
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

