/**
 * Kết chuyển lãi lỗ cuối kỳ — làm theo màn HTsoft (CtrlClosingEntryList, frmClosingEntry2, frmViewClosingEntry,
 * FrmClosingEntryCatalogueList, frmClosingEntryCatalogue).
 *  - Danh sách phiếu kết chuyển: bảng lọc Từ ngày / Đến ngày / Tìm kiếm; thanh nút Thêm · Xem · Xóa · Nạp · Bút toán kết chuyển
 *    mẫu · Xuất; lưới Kỳ kế toán, Ngày tạo, Số phiếu chuyển, Chi nhánh, User, Diễn giải, Chọn (tích để Xóa nhiều phiếu).
 *  - Thêm (Kết chuyển lãi/lỗ): Năm, Kỳ kế toán, Chi nhánh kết chuyển (tích chọn), lưới danh mục bút toán kết chuyển, nút Kết chuyển.
 *    Kết chuyển lại một kỳ đã kết chuyển: bút toán cũ được đảo bằng ghi số âm rồi ghi bút toán mới.
 *  - Xem (Thông tin bút toán kết chuyển): Kỳ kế toán, Chi nhánh, UserID, Ngày lập phiếu; lưới bút toán; Xuất Excel.
 *  - Xóa: huỷ phiếu (đảo bút toán kết chuyển; sổ cái chỉ thêm, không xoá dòng).
 *  - Bút toán kết chuyển mẫu (Danh mục bút toán kết chuyển): Thêm · Sửa · Xóa · Nạp · Xuất; form Thông tin bút toán kết chuyển.
 * Thêm của ketoan: cột Tình trạng (cần kết chuyển lại, còn số dư), Nguồn kết chuyển, lịch sử phiên bản danh mục, Lợi nhuận năm trước.
 */
import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Eye, FileSpreadsheet, Plus, RefreshCw, Search, Trash2 } from 'lucide-react';
import type { ClosingRule } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { date, dateTime, today } from '@/lib/format';
import { BranchCheckList, ReportSideLayout, SideField, branchesPicked } from '@/components/ReportPanel';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { useBranches } from '@/components/filters';
import { Empty, ErrorBox, Field, Loading, Modal, Money, Pager } from '@/components/ui';
import { DocumentDetail } from '../../../features/documents/DocumentDetail';
import { AccountPicker } from '@/components/pickers';

interface PreviewLine { debitAccount: string; creditAccount: string; amount: number; description: string }
type StaleReason = 'data' | 'opening' | 'rules';
interface Residual { account: string; balance: number; reason: 'no-rule' | 'prior-period' }
interface Preview { branchCode: string; branchName: string; lines: PreviewLine[]; total: number; profit: number | null; alreadyClosed: boolean; staleReasons: StaleReason[]; blockers: string[]; residuals: Residual[] }
interface Sources { asOf: string; entryCount: number; byAccount: { account: string; debit: number; credit: number }[] }
interface Run {
  id: string; docKey: string; docNo: string; docDate: string; period: string; kind: 'month' | 'year-end'; branchCode: string; branchName: string; total: number; profit: number | null;
  status: string; version: number; postedAt: string | null; rulesVersion: number | null; sources: Sources | null; residuals: Residual[]; staleReasons: StaleReason[];
  createdBy: string; description: string;
}
interface RunResult { branchCode: string; period: string; status: 'posted' | 'empty' | 'blocked' | 'error'; docNo?: string; lines: number; total: number; profit: number | null; residuals: Residual[]; blockers?: string[]; cascaded?: boolean; message?: string }
interface RuleVersion { version: number; rules: ClosingRule[]; note: string; createdBy: string; createdAt: string }

const STALE_LABEL: Record<StaleReason, string> = {
  data: 'số liệu trong kỳ đã đổi',
  opening: 'số dư đầu 911 đã đổi (kỳ trước kết chuyển lại / huỷ)',
  rules: 'bút toán kết chuyển mẫu đã sửa',
};
const staleText = (reasons: StaleReason[]) => reasons.map((r) => STALE_LABEL[r]).join('; ');
const monthText = (p: string) => `${p.slice(5, 7)}/${p.slice(0, 4)}`;

/** Tài khoản doanh thu, chi phí, 911 còn số dư sau kết chuyển. */
function Residuals({ rows }: { rows: Residual[] }) {
  if (!rows.length) return null;
  return (
    <div className="alert alert-warn" style={{ margin: '0 16px 12px' }}>
      Sau kết chuyển còn số dư:{' '}
      {rows.map((r, i) => (
        <span key={r.account}>
          {i > 0 && ', '}<b className="mono">{r.account}</b> {r.balance > 0 ? 'dư Nợ' : 'dư Có'} <Money value={Math.abs(r.balance)} blankZero={false} />
          {' '}({r.reason === 'no-rule' ? 'chưa có bước kết chuyển' : 'số dư từ trước kỳ'})
        </span>
      ))}
      . Khai thêm bước ở nút "Bút toán kết chuyển mẫu" hoặc kiểm tra số dư đầu kỳ.
    </div>
  );
}

/** Tháng trước tháng hiện tại, dạng YYYY-MM (kỳ thường cần kết chuyển). */
function lastMonth(): string {
  const [y, m] = today().split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

export function ClosingPage() {
  return (
    <>
      <PageHeader title="Kết chuyển lãi/lỗ" code="ACC6" subtitle="Chuyển doanh thu, chi phí trong kỳ sang tài khoản xác định kết quả và lợi nhuận" helpKey="ket-chuyen" />
      <ClosingList />
    </>
  );
}

function ProfitText({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">—</span>;
  return <span className={value < 0 ? 'neg' : ''} style={{ fontWeight: 700 }}>{value < 0 ? 'Lỗ ' : 'Lãi '}<Money value={Math.abs(value)} blankZero={false} /></span>;
}

const STATUS_TEXT: Record<string, string> = { posted: 'Đã ghi sổ', cancelled: 'Đã huỷ', pending: 'Chờ ghi sổ', error: 'Lỗi' };

/** Danh sách phiếu kết chuyển (CtrlClosingEntryList của HTsoft). */
function ClosingList() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const y = Number(lastMonth().slice(0, 4));
  const [df, setDf] = useState({ from: `${y}-01-01`, to: `${y}-12-31` });
  const [f, setF] = useState(df);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [sel, setSel] = useState<Run | null>(null);
  const [adding, setAdding] = useState<{ period?: string; branchCodes?: string } | null>(null);
  const [viewing, setViewing] = useState<Run | null>(null);
  const [catalogue, setCatalogue] = useState(false);
  const [yearEnd, setYearEnd] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const viewRef = useRef<Run[]>([]);

  const runs = useQuery({ queryKey: ['closing-runs', f], queryFn: () => api.get<Run[]>('/api/v1/closing/runs', f) });
  const rows = runs.data ?? [];
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['closing-runs'] }); void qc.invalidateQueries({ queryKey: ['documents'] }); };
  const cancel = useMutation({
    mutationFn: async (v: { runs: Run[]; reason: string }) => {
      const failed: string[] = [];
      for (const r of v.runs) {
        try { await api.post('/api/v1/documents/cancel', { docKey: r.docKey, reason: v.reason }); } catch (e) { failed.push(`${r.docNo}: ${errorText(e)}`); }
      }
      return { done: v.runs.length - failed.length, failed };
    },
    onSuccess: (r) => { setChecked(new Set()); setSel(null); setNotice(`Đã xoá (huỷ) ${r.done} phiếu kết chuyển.${r.failed.length ? ` Không xoá được: ${r.failed.join('; ')}` : ''}`); refresh(); },
  });
  const search = () => {
    if (df.from > df.to) { window.alert('Từ ngày phải trước đến ngày'); return; }
    setF(df); setChecked(new Set()); setNotice(null);
    void qc.invalidateQueries({ queryKey: ['closing-runs'] });
  };
  const view = () => { if (!sel) { window.alert('Bạn chưa chọn chứng từ!'); return; } setViewing(sel); };
  const remove = () => {
    const picked = rows.filter((r) => checked.has(r.id) && r.status === 'posted');
    if (!picked.length) { window.alert('Bạn chưa tích chọn phiếu để xóa'); return; }
    if (!window.confirm(`Bạn có chắc chắn muốn xóa ${picked.length} chứng từ đã chọn không?\n\nPhiếu kết chuyển được huỷ: bút toán kết chuyển bị đảo, số dư doanh thu, chi phí của kỳ trở lại như trước.`)) return;
    const reason = window.prompt('Lý do xoá phiếu kết chuyển:', 'Xoá phiếu kết chuyển');
    if (reason?.trim()) cancel.mutate({ runs: picked, reason: reason.trim() });
  };
  const allChecked = rows.length > 0 && viewRef.current.length > 0 && viewRef.current.every((r) => checked.has(r.id));
  const toggle = (id: string, on: boolean) => setChecked((s) => { const n = new Set(s); if (on) n.add(id); else n.delete(id); return n; });

  const columns: Column<Run>[] = [
    { key: 'period', header: 'Kỳ kế toán', width: 100, value: (r) => (r.kind === 'year-end' ? `LN năm ${Number(r.period.slice(0, 4)) - 1}` : monthText(r.period)) },
    { key: 'postedAt', header: 'Ngày tạo', width: 135, value: (r) => r.postedAt ?? '', render: (r) => dateTime(r.postedAt) },
    { key: 'docNo', header: 'Số phiếu chuyển', type: 'code', width: 135 },
    { key: 'branch', header: 'Chi nhánh', width: 160, value: (r) => `${r.branchCode} — ${r.branchName}` },
    { key: 'createdBy', header: 'User', width: 110 },
    { key: 'description', header: 'Diễn giải', width: 190 },
    { key: 'total', header: 'Số tiền', type: 'money', width: 130, hidden: true },
    { key: 'profit', header: 'Kết quả', width: 140, hidden: true, value: (r) => r.profit ?? 0, render: (r) => <ProfitText value={r.profit} /> },
    {
      key: 'state', header: 'Tình trạng', width: 150, title: 'Tình trạng (thêm của ketoan)',
      value: (r) => [STATUS_TEXT[r.status] ?? r.status, r.staleReasons.length ? 'Cần kết chuyển lại' : '', r.residuals.length ? 'Còn số dư' : ''].filter(Boolean).join(', '),
      render: (r) => (
        <>
          <span className={`badge ${r.status === 'posted' ? 'badge-ok' : r.status === 'cancelled' ? '' : 'badge-warn'}`}>{STATUS_TEXT[r.status] ?? r.status}</span>
          {r.staleReasons.length > 0 && <> <span className="badge badge-bad" title={staleText(r.staleReasons)}>Cần kết chuyển lại</span></>}
          {r.residuals.length > 0 && <> <span className="badge badge-warn" title={r.residuals.map((x) => x.account).join(', ')}>Còn số dư</span></>}
        </>
      ),
    },
    // Cột Chọn ở cuối lưới như HTsoft (tích để Xóa nhiều phiếu).
    {
      key: 'chon', header: <input type="checkbox" title="Chọn tất cả đang hiện" checked={allChecked} onChange={(e) => setChecked(e.target.checked ? new Set(viewRef.current.map((r) => r.id)) : new Set())} />,
      title: 'Chọn', width: 50, noFilter: true, noSort: true,
      render: (r) => <input type="checkbox" checked={checked.has(r.id)} disabled={r.status !== 'posted'} onClick={(e) => e.stopPropagation()} onChange={(e) => toggle(r.id, e.target.checked)} />,
    },
  ];

  const panel = (
    <>
      <SideField label="Từ ngày"><input type="date" className="input" value={df.from} onChange={(e) => setDf((x) => ({ ...x, from: e.target.value }))} /></SideField>
      <SideField label="Đến ngày"><input type="date" className="input" value={df.to} min={df.from} onChange={(e) => setDf((x) => ({ ...x, to: e.target.value }))} /></SideField>
      <div className="rp-actions">
        <button type="button" className="btn btn-primary" onClick={search} disabled={runs.isFetching}><Search size={14} /> Tìm kiếm</button>
      </div>
    </>
  );

  return (
    <>
      <ReportSideLayout panel={panel}>
        <div className="card">
          <div className="catalog-toolbar">
            {can('periods:lock') && <button className="btn btn-sm" onClick={() => setAdding({})}><Plus size={14} /> Thêm</button>}
            <button className="btn btn-sm" onClick={view} title="Xem phiếu đang chọn (hoặc bấm đúp dòng)"><Eye size={14} /> Xem</button>
            {can('periods:lock') && <button className="btn btn-sm" onClick={remove} disabled={cancel.isPending} title="Xoá các phiếu đã tích ở cột Chọn"><Trash2 size={14} /> Xóa{checked.size ? ` (${checked.size})` : ''}</button>}
            <button className="btn btn-sm" onClick={() => void runs.refetch()} disabled={runs.isFetching}><RefreshCw size={14} className={runs.isFetching ? 'spin' : undefined} /> Nạp</button>
            <button className="btn btn-sm" onClick={() => setCatalogue(true)}><BookOpen size={14} /> Bút toán kết chuyển mẫu</button>
            <button className="btn btn-sm" onClick={() => exportRef.current?.()} disabled={!rows.length}><FileSpreadsheet size={14} /> Xuất</button>
            <span className="spacer" />
            {can('periods:lock') && <button className="btn btn-sm btn-ghost" onClick={() => setYearEnd(true)} title="Đầu năm mới: chuyển lợi nhuận năm nay (4212) sang lợi nhuận năm trước (4211)">Lợi nhuận năm trước</button>}
          </div>
          <ErrorBox error={runs.error ? errorText(runs.error) : cancel.error ? errorText(cancel.error) : null} />
          {notice && <div className="alert alert-ok" style={{ margin: 8 }}>{notice}</div>}
          {runs.isLoading ? <Loading /> : (
            <DataGrid
              storageKey="acc6-phieu-ket-chuyen"
              exportName="Danh sách phiếu kết chuyển"
              exportRef={exportRef}
              viewRef={viewRef}
              rows={rows}
              rowKey={(r) => r.id}
              onSelect={setSel}
              onRowDoubleClick={(r) => setViewing(r)}
              rowClassName={(r) => (checked.has(r.id) ? 'selected' : r.status === 'cancelled' ? 'muted' : '')}
              groupable
              footerLabel={false}
              emptyText="Không có phiếu kết chuyển trong khoảng ngày này"
              note={`${rows.length} phiếu · bấm đúp một dòng để xem`}
              columns={columns}
            />
          )}
        </div>
      </ReportSideLayout>
      {adding && <ClosingAddForm initialPeriod={adding.period} initialBranches={adding.branchCodes} onClose={() => setAdding(null)} onDone={(msg) => { setAdding(null); setSel(null); setNotice(msg); refresh(); }} />}
      {viewing && <ClosingViewForm run={viewing} onClose={() => setViewing(null)} onRerun={(r) => { setViewing(null); setAdding({ period: r.period, branchCodes: r.branchCode }); }} />}
      {catalogue && <CatalogueList onClose={() => setCatalogue(false)} />}
      {yearEnd && <Modal wide title="Lợi nhuận năm trước" onClose={() => setYearEnd(false)} footer={<button className="btn" onClick={() => setYearEnd(false)}>Đóng</button>}><div className="full"><YearEndTab /></div></Modal>}
    </>
  );
}

/**
 * Thêm phiếu kết chuyển (frmClosingEntry2 "Kết chuyển lãi/ lỗ"): Năm, Kỳ kế toán, Chi nhánh kết chuyển; bên phải lưới danh mục
 * bút toán kết chuyển (chạy theo thứ tự); nút Kết chuyển.
 */
function ClosingAddForm({ initialPeriod, initialBranches, onClose, onDone }: { initialPeriod?: string; initialBranches?: string; onClose: () => void; onDone: (msg: string) => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canEditRules = can('settings:write');
  const [period, setPeriod] = useState(initialPeriod ?? '');
  const [year, setYear] = useState(Number((initialPeriod ?? lastMonth()).slice(0, 4)));
  const [branchCodes, setBranchCodes] = useState(initialBranches ?? '');
  const [cascade, setCascade] = useState(false);
  const [results, setResults] = useState<RunResult[] | null>(null);
  const [seqs, setSeqs] = useState<Record<number, number>>({}); // thứ tự sửa trên lưới, theo vị trí trong danh mục
  const { data: branches = [] } = useBranches();
  const rules = useQuery({ queryKey: ['closing-rules'], queryFn: () => api.get<RulesData>('/api/v1/closing/rules') });
  // Năm và Kỳ kế toán lấy từ danh mục kỳ kế toán (như HTsoft: PeriodList), năm mới nhất trước.
  const periods = useQuery({ queryKey: ['periods', 'all'], queryFn: () => api.get<FiscalPeriod[]>('/api/v1/periods') });
  const all = periods.data ?? [];
  const years = [...new Set([...all.map((p) => p.year), ...(initialPeriod ? [Number(initialPeriod.slice(0, 4))] : [])])].sort((x, y) => y - x);
  const ofYear = all.filter((p) => p.year === year).sort((x, y) => y.month - x.month).map((p) => `${p.year}-${String(p.month).padStart(2, '0')}`);
  if (initialPeriod && Number(initialPeriod.slice(0, 4)) === year && !ofYear.includes(initialPeriod)) ofYear.unshift(initialPeriod);
  // Kỳ mặc định: tháng trước nếu có trong danh mục, không thì kỳ mới nhất của năm.
  const chosen = period && ofYear.includes(period) ? period : ofYear.includes(lastMonth()) ? lastMonth() : ofYear[0] ?? '';
  useEffect(() => { if (!periods.isLoading && years.length && !years.includes(year)) setYear(years[0]!); }, [periods.isLoading, years.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveOrder = useMutation({
    mutationFn: (next: ClosingRule[]) => api.put('/api/v1/closing/rules', { rules: next, note: 'Sửa thứ tự khi kết chuyển' }),
  });
  const run = useMutation({
    mutationFn: (codes: string[]) => api.post<RunResult[]>('/api/v1/closing/run', { period: chosen, branchCodes: codes, cascade }),
    onSuccess: (d) => {
      const bad = d.filter((r) => r.status === 'error' || r.status === 'blocked');
      // Có chi nhánh đã ghi sổ thì danh sách phía sau phải nạp lại, kể cả khi form còn mở để báo chi nhánh bị chặn.
      void qc.invalidateQueries({ queryKey: ['closing-runs'] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
      if (!bad.length) onDone(`Cập nhật thành công! Đã kết chuyển kỳ ${monthText(chosen)}: ${d.filter((r) => !r.cascaded && r.status === 'posted').length} chi nhánh ghi sổ${d.some((r) => !r.cascaded && r.status === 'empty') ? `, ${d.filter((r) => !r.cascaded && r.status === 'empty').length} chi nhánh không có số để kết chuyển` : ''}.`);
      else setResults(d);
    },
  });
  const all_rules = rules.data?.rules ?? [];
  const rows = all_rules.map((r, index) => ({ ...r, index, seq: seqs[index] ?? r.seq })).filter((r) => r.isActive).sort((a, b) => a.seq - b.seq);
  const orderChanged = Object.entries(seqs).some(([i, v]) => all_rules[Number(i)]?.seq !== v);
  // Như HTsoft: bấm Kết chuyển là chạy (có thanh chờ), xong báo "Cập nhật thành công!".
  const submit = async () => {
    if (!branchesPicked(branchCodes)) return;
    const codes = branchCodes ? branchCodes.split(',') : branches.filter((b) => b.isActive).map((b) => b.code);
    if (!codes.length) { window.alert('Bạn chưa chọn chi nhánh kết chuyển'); return; }
    if (!chosen) { window.alert('Bạn chưa chọn kỳ kế toán'); return; }
    if (!rows.length) { window.alert('Bạn chưa khai báo tài khoản kết chuyển'); return; }
    if (orderChanged) {
      // Thứ tự sửa trên lưới được lưu vào danh mục (một phiên bản mới) trước khi kết chuyển.
      try { await saveOrder.mutateAsync(all_rules.map((r, i) => ({ ...r, seq: seqs[i] ?? r.seq }))); } catch { return; }
      setSeqs({});
      void qc.invalidateQueries({ queryKey: ['closing-rules'] });
      void qc.invalidateQueries({ queryKey: ['closing-rule-versions'] });
    } else if (rules.data?.errors.length) { window.alert(`Bút toán kết chuyển mẫu chưa hợp lệ:\n${rules.data.errors.join('\n')}`); return; }
    run.mutate(codes);
  };
  type Row = (typeof rows)[number];
  const cols: Column<Row>[] = [
    {
      key: 'seq', header: 'Thứ tự', type: 'number', width: 80, showZero: true,
      render: (r) => (canEditRules
        ? <input className="input num" type="number" min={0} max={9999} value={r.seq} style={{ width: 64, padding: '1px 4px' }} title="Sửa thứ tự chạy (lưu vào danh mục khi bấm Kết chuyển)"
            onClick={(e) => e.stopPropagation()} onChange={(e) => setSeqs((x) => ({ ...x, [r.index]: Number(e.target.value) }))} />
        : r.seq),
    },
    { key: 'fromAccount', header: 'Từ tài khoản', type: 'code', width: 110 },
    { key: 'toAccount', header: 'Tới tài khoản', type: 'code', width: 110 },
    { key: 'description', header: 'Diễn giải', width: 280 },
    { key: 'includeOpening', header: 'Số dư cuối kỳ', type: 'check', width: 110 },
    { key: 'mode', header: 'Kiểu', width: 200, value: (r) => LOAI_LABEL[r.mode] },
  ];
  const busy = run.isPending || saveOrder.isPending;
  return (
    <Modal wide title="Kết chuyển lãi/ lỗ" onClose={onClose} footer={
      <>
        <button className="btn btn-primary" disabled={busy || rules.isLoading || periods.isLoading} onClick={() => void submit()}>{busy ? 'Đang kết chuyển…' : 'Kết chuyển'}</button>
        <button className="btn" onClick={onClose}>Đóng</button>
      </>
    }>
      <div className="full" style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 280px) minmax(0, 1fr)', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SideField label="Năm">
            <select className="select input" value={year} onChange={(e) => { setYear(Number(e.target.value)); setPeriod(''); setResults(null); }}>
              {years.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </SideField>
          <SideField label="Kỳ kế toán">
            <select className="select input" value={chosen} onChange={(e) => { setPeriod(e.target.value); setResults(null); }}>
              {ofYear.map((p) => <option key={p} value={p}>Tháng {monthText(p)}</option>)}
            </select>
          </SideField>
          {!periods.isLoading && !ofYear.length && <span className="muted" style={{ fontSize: 12 }}>Năm {year} chưa có kỳ kế toán (DM Kỳ kế toán và khoá sổ, ACC2).</span>}
          <span className="muted" style={{ fontSize: 12 }}>Chi nhánh kết chuyển</span>
          <BranchCheckList value={branchCodes} onChange={setBranchCodes} onRestore={initialBranches ? undefined : setBranchCodes} />
          <label className="checkbox" title="Kết chuyển xong thì kết chuyển lại luôn các tháng sau (cùng năm) đã kết chuyển, ví dụ sau khi sửa bút toán kết chuyển mẫu">
            <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} /> Kết chuyển lại các tháng sau
          </label>
        </div>
        <div style={{ minWidth: 0 }}>
          <ErrorBox error={rules.error ? errorText(rules.error) : periods.error ? errorText(periods.error) : saveOrder.error ? errorText(saveOrder.error) : run.error ? errorText(run.error) : null} />
          {orderChanged && <div className="alert alert-warn" style={{ marginBottom: 6 }}>Đã sửa thứ tự trên lưới: bấm Kết chuyển sẽ lưu thứ tự mới vào danh mục bút toán kết chuyển (phiên bản mới) rồi mới kết chuyển.</div>}
          {results && (
            <div style={{ marginBottom: 8 }}>
              {results.filter((r) => r.status === 'error' || r.status === 'blocked').map((r) => (
                <div key={`${r.branchCode}-${r.period}`} className="alert alert-bad" style={{ marginBottom: 6 }}>
                  {r.branchCode} {monthText(r.period)}: {r.status === 'blocked' ? `còn ${(r.blockers ?? []).map(monthText).join(', ')} chưa kết chuyển — kết chuyển lần lượt từng tháng.` : r.message}
                </div>
              ))}
              {results.some((r) => r.status === 'posted') && <div className="alert alert-ok">Các chi nhánh còn lại đã kết chuyển: {results.filter((r) => r.status === 'posted').map((r) => `${r.branchCode} ${monthText(r.period)}`).join(', ')}.</div>}
            </div>
          )}
          {rules.isLoading ? <Loading /> : (
            <DataGrid compact storageKey="acc6-them-but-toan" rows={rows} rowKey={(r) => String(r.index)} footerLabel={false} maxHeight="52vh" columns={cols} emptyText="Bạn chưa khai báo tài khoản kết chuyển" />
          )}
        </div>
      </div>
    </Modal>
  );
}

interface FiscalPeriod { id: string; year: number; month: number; startDate: string; endDate: string }

/** Xem phiếu kết chuyển (frmViewClosingEntry "Thông tin bút toán kết chuyển"). */
function ClosingViewForm({ run, onClose, onRerun }: { run: Run; onClose: () => void; onRerun: (r: Run) => void }) {
  const { can } = useAuth();
  const [sources, setSources] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const doc = useQuery({ queryKey: ['document', run.id], queryFn: () => api.get<{ payload: { lines?: ViewLine[] } }>(`/api/v1/documents/${run.id}`) });
  // Phiếu kết chuyển tháng và phiếu Lợi nhuận năm trước đều lưu dòng dạng cặp Nợ / Có.
  const lines = doc.data?.payload.lines ?? [];
  // Cột như HTsoft (LoadDanhMucButToanKetChuyenByIDKC): Tài khoản nợ, Tài khoản có, Diễn giải, Số tiền, Số dư cuối kỳ, Kiểu,
  // Khoản mục, Phòng ban, Hợp đồng. Phiếu kết chuyển ghi trước khi có các cột này: Số dư cuối kỳ, Kiểu, Phòng ban, Hợp đồng để trống.
  const cols: Column<ViewLine>[] = [
    { key: 'debitAccount', header: 'Tài khoản nợ', type: 'code', width: 110 },
    { key: 'creditAccount', header: 'Tài khoản có', type: 'code', width: 110 },
    { key: 'description', header: 'Diễn giải', width: 300 },
    { key: 'amount', header: 'Số tiền', type: 'money', width: 140, sum: true },
    { key: 'includeOpening', header: 'Số dư cuối kỳ', width: 110, value: (l) => (l.includeOpening ? 'Có' : ''), render: (l) => (l.includeOpening === undefined ? '' : <input type="checkbox" checked={l.includeOpening} readOnly />) },
    { key: 'mode', header: 'Kiểu', width: 260, value: (l) => (l.mode ? LOAI_LABEL[l.mode] : '') },
    { key: 'costItem', header: 'Khoản mục', type: 'code', width: 110 },
    { key: 'department', header: 'Phòng ban', type: 'code', width: 110 },
    { key: 'contract', header: 'Hợp đồng', type: 'code', width: 110 },
  ];
  return (
    <Modal wide title="Thông tin bút toán kết chuyển" onClose={onClose} footer={
      <>
        {run.sources && <button className="btn" onClick={() => setSources(true)}>Nguồn kết chuyển</button>}
        <button className="btn" onClick={() => setDetail(run.id)}>Xem chứng từ</button>
        {run.status === 'posted' && run.kind !== 'year-end' && can('periods:lock') && <button className="btn" onClick={() => onRerun(run)}>Kết chuyển lại</button>}
        <span className="spacer" />
        <button className="btn" onClick={() => exportRef.current?.()} disabled={!lines.length}><FileSpreadsheet size={14} /> Xuất Excel</button>
        <button className="btn" onClick={onClose}>Đóng</button>
      </>
    }>
      <Field label="Kỳ kế toán"><input className="input" value={run.kind === 'year-end' ? `Lợi nhuận năm ${Number(run.period.slice(0, 4)) - 1}` : `Tháng ${monthText(run.period)}`} disabled /></Field>
      <Field label="Chi nhánh"><input className="input" value={`${run.branchCode} — ${run.branchName}`} disabled /></Field>
      <Field label="UserID"><input className="input" value={run.createdBy} disabled /></Field>
      <Field label="Ngày lập phiếu"><input className="input" value={dateTime(run.postedAt)} disabled /></Field>
      <div className="full">
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="muted">Số phiếu <b className="mono">{run.docNo}</b> · ngày ghi sổ {date(run.docDate)} · lần {run.version} · {STATUS_TEXT[run.status] ?? run.status}</span>
          <span className="spacer" />
          <ProfitText value={run.profit} />
        </div>
        {run.staleReasons.length > 0 && <div className="alert alert-bad" style={{ marginBottom: 6 }}>Cần kết chuyển lại: {staleText(run.staleReasons)}.</div>}
        <Residuals rows={run.residuals} />
        <ErrorBox error={doc.error ? errorText(doc.error) : null} />
        {doc.isLoading ? <Loading /> : <DataGrid storageKey="acc6-xem-but-toan" exportName={`Phiếu kết chuyển ${run.docNo}`} exportRef={exportRef} rows={lines} rowKey={(_, i) => String(i)} footerLabel="Cộng" maxHeight="50vh" columns={cols} />}
      </div>
      {sources && <SourcesModal run={run} onClose={() => setSources(false)} onOpen={(id) => setDetail(id)} />}
      {detail && <DocumentDetail id={detail} onClose={() => setDetail(null)} />}
    </Modal>
  );
}

interface ViewLine {
  debitAccount: string; creditAccount: string; amount: number; description: string; costItem?: string | null; department?: string | null; contract?: string | null;
  mode?: ClosingRule['mode']; includeOpening?: boolean;
}
interface RulesData { rules: ClosingRule[]; isDefault: boolean; version: number | null; errors: string[]; warnings: string[] }

interface SourceRow { entryId: string; eventId: string | null; entryNo: string; docNo: string; docType: string; postingDate: string; description: string; debit: number; credit: number }

/** Nguồn của một lần kết chuyển: phát sinh từng tài khoản lúc chốt số; chọn tài khoản để xem các bút toán tạo nên số đó. */
function SourcesModal({ run, onClose, onOpen }: { run: Run; onClose: () => void; onOpen: (eventId: string) => void }) {
  const [account, setAccount] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const q = useQuery({
    queryKey: ['closing-sources', run.id, account, page],
    queryFn: () => api.get<{ total: number; page: number; pageSize: number; rows: SourceRow[] }>(`/api/v1/closing/runs/${run.id}/sources`, { account: account!, page }),
    enabled: Boolean(account),
  });
  const s = run.sources!;
  return (
    <Modal wide title={`Nguồn kết chuyển ${run.docNo}`} onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      <div className="full">
      <div className="muted" style={{ marginBottom: 8 }}>
        Chốt số lúc {dateTime(s.asOf)} · {s.entryCount.toLocaleString('vi-VN')} bút toán nguồn · quy tắc {run.rulesVersion === 0 ? 'mặc định' : run.rulesVersion === null ? '—' : `v.${run.rulesVersion}`}
        {run.staleReasons.length > 0 && <> · <span className="neg">lỗi thời: {staleText(run.staleReasons)}</span></>}
      </div>
      <table className="grid">
        <thead><tr><th>Tài khoản</th><th className="num">Phát sinh Nợ</th><th className="num">Phát sinh Có</th></tr></thead>
        <tbody>
          {s.byAccount.map((a) => (
            <tr key={a.account} className={`clickable ${account === a.account ? 'selected' : ''}`} onClick={() => { setAccount(a.account); setPage(1); }}>
              <td className="mono">{a.account}</td><td className="num"><Money value={a.debit} /></td><td className="num"><Money value={a.credit} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {account && (
        <>
          <h3 style={{ fontSize: 14, margin: '14px 0 8px' }}>Bút toán vào tài khoản {account}</h3>
          <ErrorBox error={q.error ? errorText(q.error) : null} />
          {q.isLoading ? <Loading /> : !q.data?.rows.length ? <Empty /> : (
            <>
              <table className="grid">
                <thead><tr><th>Ngày</th><th>Số bút toán</th><th>Số chứng từ</th><th>Loại</th><th>Diễn giải</th><th className="num">Nợ</th><th className="num">Có</th></tr></thead>
                <tbody>
                  {q.data.rows.map((r) => (
                    <tr key={r.entryId} className={r.eventId ? 'clickable' : ''} onClick={() => r.eventId && onOpen(r.eventId)}>
                      <td>{date(r.postingDate)}</td><td className="mono">{r.entryNo}</td><td className="mono">{r.docNo}</td><td>{r.docType}</td><td>{r.description}</td>
                      <td className="num"><Money value={r.debit} /></td><td className="num"><Money value={r.credit} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />
            </>
          )}
        </>
      )}
      </div>
    </Modal>
  );
}

/** Loại kết chuyển (như frmClosingEntryCatalogue của HTsoft). */
const LOAI_LABEL: Record<ClosingRule['mode'], string> = {
  debit: 'Kết chuyển từ tài khoản NỢ sang tài khoản CÓ',
  credit: 'Kết chuyển từ tài khoản CÓ sang tài khoản NỢ',
  balance: 'Chương trình tự xác định',
};
const LOAI_HINT: Record<ClosingRule['mode'], string> = {
  debit: 'chuyển số phát sinh Nợ của tài khoản đi (chi phí, giảm trừ doanh thu): Nợ TK đến / Có TK đi',
  credit: 'chuyển số phát sinh Có của tài khoản đi (doanh thu, thu nhập): Nợ TK đi / Có TK đến',
  balance: 'dư bên nào chuyển bên đó (911, thu nhập / chi phí khác)',
};
const MODE_LABEL = LOAI_LABEL;

/** Danh mục bút toán kết chuyển (FrmClosingEntryCatalogueList của HTsoft): Thêm · Sửa · Xóa · Nạp · Xuất. */
function CatalogueList({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { can } = useAuth();
  const editable = can('settings:write');
  const q = useQuery({ queryKey: ['closing-rules'], queryFn: () => api.get<RulesData>('/api/v1/closing/rules') });
  const [sel, setSel] = useState<{ r: ClosingRule; index: number } | null>(null);
  const [editing, setEditing] = useState<{ index: number | null } | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const exportRef = useRef<(() => void) | null>(null);
  const rules = q.data?.rules ?? [];
  const rows = rules.map((r, index) => ({ r, index })).sort((a, b) => a.r.seq - b.r.seq);
  const save = useMutation({
    mutationFn: (v: { rules: ClosingRule[]; note: string }) => api.put('/api/v1/closing/rules', { rules: [...v.rules].sort((a, b) => a.seq - b.seq), note: v.note }),
    onSuccess: () => { setSel(null); for (const k of ['closing-rules', 'closing-rule-versions', 'closing-runs']) void qc.invalidateQueries({ queryKey: [k] }); },
  });
  const code = (r: ClosingRule) => `${r.fromAccount} → ${r.toAccount}`;
  const remove = () => {
    if (!sel) return;
    if (window.confirm(`Bạn có chắc chắn muốn xóa bút toán kết chuyển ${code(sel.r)}${sel.r.description ? ` (${sel.r.description})` : ''} không?`)) save.mutate({ rules: rules.filter((_, j) => j !== sel.index), note: `Xoá ${code(sel.r)}` });
  };
  type Row = (typeof rows)[number];
  const cols: Column<Row>[] = [
    { key: 'seq', header: 'Thứ tự', type: 'number', width: 70, showZero: true, value: (x) => x.r.seq },
    { key: 'fromAccount', header: 'Từ tài khoản', type: 'code', width: 110, value: (x) => x.r.fromAccount },
    { key: 'toAccount', header: 'Tới tài khoản', type: 'code', width: 110, value: (x) => x.r.toAccount },
    { key: 'description', header: 'Diễn giải', width: 280, value: (x) => x.r.description },
    { key: 'includeOpening', header: 'Số dư cuối kỳ', type: 'check', width: 110, value: (x) => x.r.includeOpening },
    { key: 'mode', header: 'Kiểu', width: 270, value: (x) => LOAI_LABEL[x.r.mode] },
    { key: 'isActive', header: 'Áp dụng', type: 'check', width: 80, title: 'Áp dụng (thêm của ketoan)', value: (x) => x.r.isActive },
  ];
  return (
    <Modal wide title="Danh mục bút toán kết chuyển" onClose={onClose} footer={<button className="btn" onClick={onClose}>Đóng</button>}>
      <div className="full">
        <CatalogToolbar
          canWrite={editable} hasSelection={Boolean(sel)} busy={save.isPending}
          onAdd={() => setEditing({ index: null })} onEdit={() => sel && setEditing({ index: sel.index })} onDelete={remove}
          onRefresh={() => q.refetch()} onExport={() => exportRef.current?.()}
          extra={<button className="btn btn-sm btn-ghost" onClick={() => setShowHistory((x) => !x)}>{showHistory ? 'Ẩn lịch sử phiên bản' : 'Lịch sử phiên bản'}</button>}
        />
        <div className="muted" style={{ margin: '6px 0' }}>
          Phần mềm chạy lần lượt theo cột <b>Thứ tự</b>: bước sau thấy kết quả của bước trước. "Từ tài khoản" là đầu số, gồm mọi tài khoản con; "Tới tài khoản" phải là tài khoản chi tiết.
          {q.data?.isDefault && ' Đang dùng bộ mặc định; thêm / sửa thì lưu thành bộ riêng của đơn vị.'}
          {q.data && !q.data.isDefault && q.data.version !== null && ` Đang dùng phiên bản ${q.data.version}.`}
          {' '}Sửa danh mục thì các kỳ đã kết chuyển theo bộ cũ được đánh dấu "Cần kết chuyển lại".
        </div>
        {q.data?.errors.length ? <div className="alert alert-bad" style={{ marginBottom: 6 }}>Bút toán kết chuyển mẫu có lỗi, chưa kết chuyển được:<ul style={{ margin: '4px 0 0 18px' }}>{q.data.errors.map((e) => <li key={e}>{e}</li>)}</ul></div> : null}
        {q.data?.warnings.length ? <div className="alert alert-warn" style={{ marginBottom: 6 }}><ul style={{ margin: '0 0 0 18px' }}>{q.data.warnings.map((w) => <li key={w}>{w}</li>)}</ul></div> : null}
        <ErrorBox error={q.error ? errorText(q.error) : save.error && !editing ? errorText(save.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey="acc7-but-toan-ket-chuyen" exportName="Danh mục bút toán kết chuyển" exportRef={exportRef} groupable
            rows={rows} rowKey={(x) => String(x.index)} onSelect={setSel} onRowDoubleClick={(x) => editable && setEditing({ index: x.index })}
            rowClassName={(x) => (x.r.isActive ? '' : 'muted')} footerLabel={false} maxHeight="55vh" columns={cols}
          />
        )}
        {showHistory && <div style={{ paddingTop: 12 }}><RuleHistory /></div>}
      </div>
      {editing && (
        <CatalogueForm
          rules={rules} index={editing.index} saving={save.isPending} error={save.error ? errorText(save.error) : null}
          onClose={() => { setEditing(null); save.reset(); }}
          onSave={(next, note) => save.mutate({ rules: next, note }, { onSuccess: () => setEditing(null) })}
        />
      )}
    </Modal>
  );
}

/** Thông tin bút toán kết chuyển (frmClosingEntryCatalogue của HTsoft): Thông tin chung, Kiểu kết chuyển, Loại kết chuyển; Ghi / Đóng. */
function CatalogueForm({ rules, index, saving, error, onClose, onSave }: {
  rules: ClosingRule[]; index: number | null; saving: boolean; error: string | null; onClose: () => void; onSave: (rules: ClosingRule[], note: string) => void;
}) {
  const isNew = index === null;
  const closingStep = rules.find((x) => x.fromAccount.startsWith('911'));
  const nextSeq = Math.max(0, Math.min(Math.max(0, ...rules.filter((x) => !x.fromAccount.startsWith('911')).map((x) => x.seq)) + 1, closingStep ? closingStep.seq - 1 : 9999));
  const [r, setR] = useState<ClosingRule>(() => (index !== null ? rules[index]! : { seq: nextSeq, fromAccount: '', toAccount: '911', mode: 'debit', description: '', isActive: true, includeOpening: false }));
  const [problem, setProblem] = useState<string | null>(null);
  const set = (patch: Partial<ClosingRule>) => { setR((x) => ({ ...x, ...patch })); setProblem(null); };
  const submit = () => {
    const clean = { ...r, fromAccount: r.fromAccount.trim(), toAccount: r.toAccount.trim(), description: r.description.trim() };
    if (!clean.description) return setProblem('Bạn chưa nhập Diễn giải');
    if (!clean.fromAccount || !clean.toAccount) return setProblem('Bạn chưa chọn Tài khoản đi / Tài khoản đến');
    if (clean.fromAccount === clean.toAccount) return setProblem('Tài khoản kết chuyển không được trùng nhau');
    onSave(isNew ? [...rules, clean] : rules.map((x, j) => (j === index ? clean : x)), `${isNew ? 'Thêm' : 'Sửa'} ${clean.fromAccount} → ${clean.toAccount}`);
  };
  return (
    <Modal title="Thông tin bút toán kết chuyển" onClose={onClose} footer={
      <>
        <button className="btn btn-primary" disabled={saving} onClick={submit}>Ghi</button>
        <button className="btn" onClick={onClose}>Đóng</button>
      </>
    }>
      <fieldset className="full" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 14px' }}>
        <legend style={{ padding: '0 6px', fontWeight: 600 }}>Thông tin chung</legend>
        <Field label="Thứ tự tính toán" hint="Chạy từ nhỏ đến lớn; 911 → 421 luôn sau cùng"><input className="input num" type="number" min={0} max={9999} value={r.seq} onChange={(e) => set({ seq: Number(e.target.value) })} /></Field>
        <Field label="Diễn giải (*)"><input className="input" value={r.description} onChange={(e) => set({ description: e.target.value })} /></Field>
        <Field label="Tài khoản đi" hint="Đầu số, gồm mọi tài khoản con"><AccountPicker value={r.fromAccount} onChange={(fromAccount) => set({ fromAccount })} /></Field>
        <Field label="Tài khoản đến" hint="Tài khoản chi tiết"><AccountPicker postingOnly value={r.toAccount} onChange={(toAccount) => set({ toAccount })} /></Field>
      </fieldset>
      <fieldset className="full" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: '6px 24px' }}>
        <legend style={{ padding: '0 6px', fontWeight: 600 }}>Kiểu kết chuyển</legend>
        <label className="checkbox" title="Cộng cả số dư đầu kỳ của tài khoản đi (bước kết chuyển lãi lỗ 911 → 421)"><input type="radio" name="kieu" checked={r.includeOpening} onChange={() => set({ includeOpening: true })} /> Kết chuyển số dư cuối.</label>
        <label className="checkbox"><input type="radio" name="kieu" checked={!r.includeOpening} onChange={() => set({ includeOpening: false })} /> Kết chuyển số phát sinh</label>
      </fieldset>
      <fieldset className="full" style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '8px 12px', display: 'flex', flexWrap: 'wrap', gap: '6px 24px' }}>
        <legend style={{ padding: '0 6px', fontWeight: 600 }}>Loại kết chuyển</legend>
        {(['credit', 'debit', 'balance'] as const).map((m) => (
          <label key={m} className="checkbox" title={LOAI_HINT[m]}><input type="radio" name="loai" checked={r.mode === m} onChange={() => set({ mode: m })} /> {LOAI_LABEL[m]}</label>
        ))}
      </fieldset>
      <div className="full row" style={{ gap: 16 }}>
        <span className="muted" style={{ fontSize: 12 }}>{LOAI_HINT[r.mode]}</span>
        <span className="spacer" />
        <label className="checkbox"><input type="checkbox" checked={r.isActive} onChange={(e) => set({ isActive: e.target.checked })} /> Áp dụng</label>
      </div>
      {problem || error ? <div className="full alert alert-bad">{problem ?? error}</div> : null}
    </Modal>
  );
}

/** Lịch sử phiên bản bộ bút toán kết chuyển mẫu: ai sửa, lúc nào, lý do; bấm một phiên bản để xem đủ danh sách. */
function RuleHistory() {
  const q = useQuery({ queryKey: ['closing-rule-versions'], queryFn: () => api.get<RuleVersion[]>('/api/v1/closing/rules/versions') });
  const [open, setOpen] = useState<number | null>(null);
  if (q.isLoading) return <Loading />;
  if (!q.data?.length) return <Empty text="Chưa có phiên bản nào: đơn vị đang dùng bộ mặc định" />;
  return (
    <div className="table-wrap" style={{ padding: '0 12px 12px' }}>
      <table className="grid">
        <thead><tr><th>Phiên bản</th><th>Lúc</th><th>Người sửa</th><th>Lý do</th><th className="num">Số bước</th></tr></thead>
        <tbody>
          {q.data.flatMap((v) => [
            <tr key={v.version} className="clickable" onClick={() => setOpen(open === v.version ? null : v.version)}>
              <td>v.{v.version}</td><td className="muted">{dateTime(v.createdAt)}</td><td>{v.createdBy}</td><td>{v.note}</td><td className="num">{v.rules.length}</td>
            </tr>,
            open === v.version && (
              <tr key={`${v.version}-rules`}><td colSpan={5}>
                <table className="grid">
                  <thead><tr><th>Thứ tự</th><th>Từ TK</th><th>Sang TK</th><th>Cách kết chuyển</th><th>Diễn giải</th><th>Lấy số dư đầu</th><th>Áp dụng</th></tr></thead>
                  <tbody>{v.rules.map((r, i) => <tr key={i}><td>{r.seq}</td><td className="mono">{r.fromAccount}</td><td className="mono">{r.toAccount}</td><td>{MODE_LABEL[r.mode]}</td><td>{r.description}</td><td>{r.includeOpening ? 'Có' : ''}</td><td>{r.isActive ? 'Có' : 'Không'}</td></tr>)}</tbody>
                </table>
              </td></tr>
            ),
          ])}
        </tbody>
      </table>
    </div>
  );
}

interface YearEndResult { branchCode: string; status: 'posted' | 'empty' | 'preview'; docNo?: string; lines: { account: string; balance: number }[]; total: number }

/** Đầu năm mới: chuyển số dư lợi nhuận năm nay (4212) đến 31/12 năm trước sang lợi nhuận năm trước (4211), ghi ngày 01/01. */
function YearEndTab() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const { data: branches = [] } = useBranches();
  const [f, setF] = useState({ year: new Date().getFullYear(), fromAccount: '4212', toAccount: '4211' });
  const [rows, setRows] = useState<YearEndResult[] | null>(null);
  const branchCodes = branches.filter((b) => b.isActive).map((b) => b.code);
  const call = (dryRun: boolean) => api.post<YearEndResult[]>('/api/v1/closing/year-end', { ...f, branchCodes, dryRun });
  const preview = useMutation({ mutationFn: () => call(true), onSuccess: setRows });
  const run = useMutation({ mutationFn: () => call(false), onSuccess: (d) => { setRows(d); void qc.invalidateQueries({ queryKey: ['closing-runs'] }); void qc.invalidateQueries({ queryKey: ['documents'] }); } });
  const change = (patch: Partial<typeof f>) => { setF((x) => ({ ...x, ...patch })); setRows(null); };
  const shown = rows?.filter((r) => r.lines.length || r.status === 'posted') ?? [];
  const isPreview = rows?.some((r) => r.status === 'preview');
  return (
    <>
      <div className="filters">
        <div className="field"><label>Năm mới</label><input type="number" className="input" style={{ width: 100 }} value={f.year} onChange={(e) => change({ year: Number(e.target.value) })} /></div>
        <div className="field"><label>TK lợi nhuận năm nay</label><AccountPicker className="input mono" value={f.fromAccount} onChange={(fromAccount) => change({ fromAccount })} /></div>
        <div className="field"><label>TK lợi nhuận năm trước</label><AccountPicker postingOnly className="input mono" value={f.toAccount} onChange={(toAccount) => change({ toAccount })} /></div>
        <button className="btn" disabled={!branchCodes.length || preview.isPending} onClick={() => preview.mutate()}>Xem trước</button>
        {can('periods:lock') && (
          <button className="btn btn-primary" disabled={!isPreview || run.isPending} title={isPreview ? '' : 'Bấm Xem trước để kiểm tra trước khi ghi sổ'}
            onClick={() => window.confirm(`Chuyển số dư ${f.fromAccount} đến 31/12/${f.year - 1} sang ${f.toAccount}, ghi ngày 01/01/${f.year}?`) && run.mutate()}>Kết chuyển</button>
        )}
      </div>
      <div className="muted" style={{ padding: '0 16px 10px' }}>
        Làm một lần khi sang năm mới, sau khi đã kết chuyển lãi lỗ tháng 12 của năm {f.year - 1}. Chạy lại: bút toán cũ được đảo rồi ghi lại theo số mới. Huỷ: tích phiếu ở danh sách phiếu kết chuyển (kỳ LN năm {f.year - 1}) rồi bấm Xóa.
      </div>
      <ErrorBox error={preview.error ? errorText(preview.error) : run.error ? errorText(run.error) : null} />
      {rows && !isPreview && <div className="alert alert-ok" style={{ margin: 12 }}>Đã ghi sổ {rows.filter((r) => r.status === 'posted').length} chi nhánh; {rows.filter((r) => r.status === 'empty').length} chi nhánh không có số dư để chuyển.</div>}
      {rows && (shown.length === 0 ? <Empty text={`Không chi nhánh nào còn số dư ${f.fromAccount} đến 31/12/${f.year - 1}`} /> : (
        <div className="table-wrap">
          <table className="grid">
            <thead><tr><th>Chi nhánh</th><th>Tài khoản</th><th className="num">Lãi chuyển sang (dư Có)</th><th className="num">Lỗ chuyển sang (dư Nợ)</th><th>Số chứng từ</th></tr></thead>
            <tbody>
              {shown.flatMap((r) => r.lines.map((l) => (
                <tr key={`${r.branchCode}-${l.account}`}>
                  <td>{r.branchCode}</td><td className="mono">{l.account}</td>
                  <td className="num">{l.balance > 0 && <Money value={l.balance} />}</td><td className="num">{l.balance < 0 && <Money value={-l.balance} />}</td>
                  <td className="mono">{r.docNo ?? (r.status === 'preview' ? '(chưa ghi)' : '')}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}
