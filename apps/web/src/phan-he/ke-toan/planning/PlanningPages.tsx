/**
 * Kế hoạch tài chính (KH01): kế hoạch thu / chi theo tháng × chi nhánh, điền từ khoản công nợ đến hạn và lịch hợp đồng,
 * so với thực hiện. Định mức chi phí (KH02): khai định mức theo tháng × chi nhánh × khoản mục, chép sang tháng khác,
 * so chi phí thực tế. AlertsPanel: cảnh báo ở Tổng quan (công nợ quá hạn / sắp đến hạn, kỳ hợp đồng, hợp đồng sắp hết hạn).
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { date, money, today } from '@/lib/format';
import { PageHeader } from '@/components/PageHeader';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { useBranches, BranchPicker } from '@/components/filters';
import { ListPicker, PartnerPicker } from '@/components/pickers';

const thisMonth = () => today().slice(0, 7);
const mm = (p: string) => `${p.slice(5)}/${p.slice(0, 4)}`;
const parseMoney = (s: string) => Number(s.replace(/[^\d]/g, '')) || 0;
interface Dim { code: string; name: string; isActive: boolean }
const useDepartments = () => useQuery({ queryKey: ['dimensions', 'department'], queryFn: () => api.get<Dim[]>('/api/v1/dimensions/department'), staleTime: 60_000 });
const useCostItems = () => useQuery({ queryKey: ['dimensions', 'cost_item'], queryFn: () => api.get<Dim[]>('/api/v1/dimensions/cost_item'), staleTime: 60_000 });

/* ================================================================== KH01 */

interface Plan { id: string; period: string; branchCode: string | null; direction: 'in' | 'out'; costItemCode: string | null; partnerCode: string | null; partnerName: string | null; dueDate: string | null; description: string; amount: number; source: string; updatedBy: string }
interface VsRow { period: string; branchCode: string; planIn: number; planOut: number; actualIn: number; actualOut: number; planNet: number; actualNet: number; diffIn: number; diffOut: number }
const SOURCE: Record<string, string> = { manual: 'Nhập tay', debt: 'Khoản công nợ', contract: 'Lịch hợp đồng' };

export function CashPlanPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const editable = can('documents:write');
  const [tab, setTab] = useState<'plan' | 'compare'>('plan');
  const [from, setFrom] = useState(thisMonth());
  const [to, setTo] = useState(thisMonth());
  const [editing, setEditing] = useState<Partial<Plan> | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['cash-plans', from, to], queryFn: () => api.get<Plan[]>('/api/v1/cash-plans', { from, to }), enabled: tab === 'plan' });
  const vs = useQuery({ queryKey: ['cash-plan-vs', from, to], queryFn: () => api.get<{ rows: VsRow[] }>('/api/v1/reports/cash-plan-vs-actual', { from, to }), enabled: tab === 'compare' });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['cash-plans'] }); void qc.invalidateQueries({ queryKey: ['cash-plan-vs'] }); };
  const fill = useMutation({
    mutationFn: async () => {
      const months: string[] = [];
      for (let p = from; p <= to; ) { months.push(p); const d = new Date(Date.parse(`${p}-01T00:00:00Z`)); d.setUTCMonth(d.getUTCMonth() + 1); p = d.toISOString().slice(0, 7); }
      let debts = 0; let contracts = 0;
      for (const period of months) { const r = await api.post<{ debts: number; contracts: number }>('/api/v1/cash-plans/fill', { period }); debts += r.debts; contracts += r.contracts; }
      return { debts, contracts };
    },
    onSuccess: (r) => { setMsg(`Đã điền ${r.debts} khoản công nợ đến hạn và ${r.contracts} kỳ thanh toán hợp đồng.`); refresh(); },
  });
  const del = useMutation({ mutationFn: (id: string) => api.delete(`/api/v1/cash-plans/${id}`), onSuccess: refresh });
  const rows = q.data ?? [];
  const sum = (d: 'in' | 'out') => rows.filter((r) => r.direction === d).reduce((s, r) => s + r.amount, 0);
  const columns: Column<Plan>[] = [
    { key: 'period', header: 'Tháng', value: (r) => mm(r.period), width: 80 },
    { key: 'direction', header: 'Thu / chi', value: (r) => (r.direction === 'in' ? 'Thu' : 'Chi'), width: 70 },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', value: (r) => r.branchCode ?? '(cả công ty)', width: 100 },
    { key: 'dueDate', header: 'Ngày dự kiến', type: 'date', width: 100 },
    { key: 'description', header: 'Nội dung', width: 280 },
    { key: 'partnerName', header: 'Đối tượng', width: 180 },
    { key: 'costItemCode', header: 'Khoản mục', type: 'code', width: 100 },
    { key: 'in', header: 'Dự kiến thu', type: 'money', sum: true, value: (r) => (r.direction === 'in' ? r.amount : 0) },
    { key: 'out', header: 'Dự kiến chi', type: 'money', sum: true, value: (r) => (r.direction === 'out' ? r.amount : 0) },
    { key: 'source', header: 'Nguồn', value: (r) => SOURCE[r.source] ?? r.source, width: 110 },
    ...(editable ? [{ key: 'del', header: '', width: 40, noFilter: true, noSort: true, render: (r: Plan) => <button className="btn btn-sm" title="Xoá dòng" onClick={(e) => { e.stopPropagation(); if (window.confirm('Xoá dòng kế hoạch này?')) del.mutate(r.id); }}><Trash2 size={14} /></button> } as Column<Plan>] : []),
  ];
  const vsCols: Column<VsRow>[] = [
    { key: 'period', header: 'Tháng', value: (r) => mm(r.period), width: 80 },
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', value: (r) => r.branchCode || '(cả công ty)', width: 110 },
    { key: 'planIn', header: 'Kế hoạch', band: 'Thu', type: 'money', sum: true },
    { key: 'actualIn', header: 'Thực hiện', band: 'Thu', type: 'money', sum: true },
    { key: 'diffIn', header: 'Chênh lệch', band: 'Thu', type: 'money', sum: true },
    { key: 'planOut', header: 'Kế hoạch', band: 'Chi', type: 'money', sum: true },
    { key: 'actualOut', header: 'Thực hiện', band: 'Chi', type: 'money', sum: true },
    { key: 'diffOut', header: 'Chênh lệch', band: 'Chi', type: 'money', sum: true },
    { key: 'planNet', header: 'Kế hoạch', band: 'Chênh thu – chi', type: 'money', sum: true },
    { key: 'actualNet', header: 'Thực hiện', band: 'Chênh thu – chi', type: 'money', sum: true },
  ];
  return (
    <>
      <PageHeader title="Kế hoạch thu chi" code="KH01" subtitle="Dự kiến thu – chi theo tháng, chi nhánh; điền từ công nợ đến hạn và lịch hợp đồng; so với tiền thực vào / ra" helpKey="ke-hoach-tai-chinh" />
      {msg && <div className="alert alert-ok" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="card">
        <div className="tabs" role="tablist">
          <button role="tab" className={`tab ${tab === 'plan' ? 'active' : ''}`} onClick={() => setTab('plan')}>Kế hoạch</button>
          <button role="tab" className={`tab ${tab === 'compare' ? 'active' : ''}`} onClick={() => setTab('compare')}>So với thực hiện</button>
        </div>
        <div className="filters">
          <div className="field"><label>Từ tháng</label><input type="month" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
          <div className="field"><label>Đến tháng</label><input type="month" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
          {tab === 'plan' && editable && (
            <div className="row" style={{ gap: 8, alignSelf: 'flex-end' }}>
              <button className="btn" disabled={fill.isPending} title="Điền các khoản phải thu / phải trả còn nợ có hạn trong tháng và kỳ thanh toán hợp đồng chưa trả; điền lại thì cập nhật" onClick={() => fill.mutate()}><RefreshCw size={16} /> Điền từ công nợ, hợp đồng</button>
              <button className="btn btn-primary" onClick={() => setEditing({ period: from, direction: 'out', amount: 0 })}><Plus size={16} /> Thêm dòng</button>
            </div>
          )}
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <ErrorBox error={q.error ? errorText(q.error) : vs.error ? errorText(vs.error) : fill.error ? errorText(fill.error) : del.error ? errorText(del.error) : null} />
          {tab === 'plan' ? (
            q.isLoading ? <Loading /> : (
              <>
                <div className="muted" style={{ marginBottom: 6 }}>Dự kiến thu <b>{money(sum('in'))}</b> · dự kiến chi <b>{money(sum('out'))}</b> · chênh <b>{money(sum('in') - sum('out'))}</b>. Bấm một dòng để sửa.</div>
                <DataGrid storageKey="kh01" rows={rows} rowKey={(r) => r.id} columns={columns} onRowClick={editable ? (r) => setEditing(r) : undefined} exportName={`ke-hoach-thu-chi-${from}-${to}`} />
              </>
            )
          ) : vs.isLoading ? <Loading /> : (
            <>
              <div className="muted" style={{ marginBottom: 6 }}>Thực hiện = tiền vào / ra tài khoản 111, 112, 113, không tính chuyển tiền nội bộ. Kế hoạch "cả công ty" (lịch hợp đồng không gắn chi nhánh) đứng riêng một dòng.</div>
              <DataGrid storageKey="kh01-vs" rows={vs.data?.rows ?? []} rowKey={(r) => `${r.period}|${r.branchCode}`} columns={vsCols} exportName={`thu-chi-ke-hoach-thuc-hien-${from}-${to}`} />
            </>
          )}
        </div>
      </div>
      {editing && <PlanDialog value={editing} onClose={() => setEditing(null)} onSaved={(stay) => { if (!stay) setEditing(null); refresh(); }} />}
    </>
  );
}

function PlanDialog({ value, onClose, onSaved }: { value: Partial<Plan>; onClose: () => void; onSaved: (stay: boolean) => void }) {
  const { data: branches = [] } = useBranches();
  const { data: items = [] } = useCostItems();
  const [v, setV] = useState({ period: value.period ?? thisMonth(), branchCode: value.branchCode ?? '', direction: value.direction ?? 'out', costItemCode: value.costItemCode ?? '', partnerCode: value.partnerCode ?? '', dueDate: value.dueDate ?? '', description: value.description ?? '', amount: value.amount ? money(value.amount) : '' });
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => {
      const body = { period: v.period, branchCode: v.branchCode || null, direction: v.direction, costItemCode: v.costItemCode || null, partnerCode: v.partnerCode || null, dueDate: v.dueDate || null, description: v.description, amount: parseMoney(v.amount) };
      return value.id ? api.patch(`/api/v1/cash-plans/${value.id}`, body) : api.post('/api/v1/cash-plans', body);
    },
    // Sửa dòng đã có rồi Ghi: ở lại hộp thoại, quay về chế độ xem.
    onSuccess: () => { onSaved(Boolean(value.id)); if (value.id) viewAgain[1](); },
  });
  return (
    <Modal viewAgain={viewAgain} viewFirst={Boolean(value.id)} title={value.id ? 'Sửa dòng kế hoạch' : 'Thêm dòng kế hoạch'} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Đóng</button><button className="btn btn-primary" disabled={save.isPending || !v.period} onClick={() => save.mutate()}>Ghi</button></>}>
      {value.source && value.source !== 'manual' && <div className="alert alert-warn full">Dòng điền từ {SOURCE[value.source]?.toLowerCase()}: bấm "Điền từ công nợ, hợp đồng" lần sau sẽ ghi đè số tiền, ngày.</div>}
      <Field label="Tháng"><input type="month" className="input" value={v.period} onChange={(e) => set({ period: e.target.value })} /></Field>
      <Field label="Thu / chi"><select className="select input" value={v.direction} onChange={(e) => set({ direction: e.target.value as 'in' | 'out' })}><option value="in">Thu</option><option value="out">Chi</option></select></Field>
      <Field label="Chi nhánh"><BranchPicker activeOnly value={v.branchCode} onChange={(c) => set({ branchCode: c })} placeholder="(cả công ty)" /></Field>
      <Field label="Ngày dự kiến"><input type="date" className="input" value={v.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></Field>
      <Field label="Khoản mục"><ListPicker items={items.filter((d) => d.isActive || d.code === v.costItemCode)} value={v.costItemCode} onChange={(costItemCode) => set({ costItemCode })} placeholder="Không bắt buộc" /></Field>
      <Field label="Đối tượng"><PartnerPicker activeOnly value={v.partnerCode} onChange={(partnerCode) => set({ partnerCode })} placeholder="Không bắt buộc" /></Field>
      <Field label="Nội dung" full><input className="input" value={v.description} onChange={(e) => set({ description: e.target.value })} placeholder="Ví dụ: Lương tháng, tiền điện, thu tiền khách buôn…" /></Field>
      <Field label="Số tiền"><input className="input num" inputMode="numeric" value={v.amount} onChange={(e) => set({ amount: e.target.value })} onBlur={() => set({ amount: money(parseMoney(v.amount)) })} /></Field>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}

/* ================================================================== KH02 */

interface Norm { id: string; branchCode: string | null; departmentCode: string | null; costItemCode: string; amount: number; note: string }
interface NormRow { branchCode: string; departmentCode: string; departmentName: string; costItemCode: string; costItemName: string; norm: number | null; actual: number; diff: number | null; pct: number | null; over: boolean }
type Draft = { branchCode: string; departmentCode: string; costItemCode: string; amount: string; note: string };

export function CostNormPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const editable = can('catalog:write');
  const { data: branches = [] } = useBranches();
  const { data: items = [] } = useCostItems();
  const { data: departments = [] } = useDepartments();
  const [tab, setTab] = useState<'norms' | 'compare'>('norms');
  const [period, setPeriod] = useState(thisMonth());
  const [to, setTo] = useState(thisMonth());
  const [account, setAccount] = useState('64');
  const [onlyOver, setOnlyOver] = useState(false);
  const [draft, setDraft] = useState<Draft[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['cost-norms', period], queryFn: () => api.get<Norm[]>('/api/v1/cost-norms', { period }), enabled: tab === 'norms' });
  const vs = useQuery({ queryKey: ['cost-vs-norm', period, to, account], queryFn: () => api.get<{ rows: NormRow[] }>('/api/v1/reports/cost-vs-norm', { from: period, to, account }), enabled: tab === 'compare' });
  useEffect(() => { if (q.data) setDraft(q.data.map((n) => ({ branchCode: n.branchCode ?? '', departmentCode: n.departmentCode ?? '', costItemCode: n.costItemCode, amount: money(n.amount), note: n.note }))); }, [q.data]);
  const setRow = (i: number, p: Partial<Draft>) => setDraft((d) => d.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const save = useMutation({
    mutationFn: () => {
      // Dòng bị xoá khỏi bảng: gửi số tiền 0 để bỏ định mức.
      const keep = new Set(draft.map((d) => `${d.branchCode}|${d.departmentCode}|${d.costItemCode}`));
      const removed = (q.data ?? []).filter((n) => !keep.has(`${n.branchCode ?? ''}|${n.departmentCode ?? ''}|${n.costItemCode}`)).map((n) => ({ branchCode: n.branchCode, departmentCode: n.departmentCode, costItemCode: n.costItemCode, amount: 0, note: '' }));
      const missing = draft.findIndex((d) => !d.costItemCode && parseMoney(d.amount) > 0);
      if (missing >= 0) throw new Error(`Dòng ${missing + 1}: chưa chọn khoản mục`);
      const items = [...draft.filter((d) => d.costItemCode).map((d) => ({ branchCode: d.branchCode || null, departmentCode: d.departmentCode || null, costItemCode: d.costItemCode, amount: parseMoney(d.amount), note: d.note })), ...removed];
      if (!items.length) throw new Error('Chưa có dòng định mức nào: bấm "Thêm dòng", chọn khoản mục và nhập số tiền rồi mới Ghi');
      return api.put<{ saved: number; removed: number }>('/api/v1/cost-norms', { period, items });
    },
    onSuccess: (r) => { setMsg(`Đã ghi ${r.saved} định mức${r.removed ? `, bỏ ${r.removed}` : ''}.`); void qc.invalidateQueries({ queryKey: ['cost-norms'] }); void qc.invalidateQueries({ queryKey: ['cost-vs-norm'] }); },
  });
  const copy = useMutation({
    mutationFn: (months: string[]) => api.post<{ copied: number; months: number }>('/api/v1/cost-norms/copy', { from: period, to: months }),
    onSuccess: (r) => { setMsg(`Đã chép ${r.copied} định mức sang ${r.months} tháng.`); void qc.invalidateQueries({ queryKey: ['cost-norms'] }); },
  });
  const askCopy = () => {
    const n = Number(window.prompt('Chép định mức tháng này sang bao nhiêu tháng tiếp theo? (ghi đè định mức đã có của các tháng đó)', '11'));
    if (!n || n < 1 || n > 36) return;
    const months: string[] = [];
    const d = new Date(Date.parse(`${period}-01T00:00:00Z`));
    for (let i = 0; i < n; i++) { d.setUTCMonth(d.getUTCMonth() + 1); months.push(d.toISOString().slice(0, 7)); }
    copy.mutate(months);
  };
  const vsRows = (vs.data?.rows ?? []).filter((r) => !onlyOver || r.over);
  const vsCols = useMemo<Column<NormRow>[]>(() => [
    { key: 'branchCode', header: 'Chi nhánh', type: 'code', value: (r) => r.branchCode || '(cả công ty)', width: 110 },
    { key: 'departmentCode', header: 'Bộ phận', value: (r) => (r.departmentCode ? `${r.departmentCode} — ${r.departmentName}` : ''), width: 170 },
    { key: 'costItemCode', header: 'Khoản mục', type: 'code', width: 110 },
    { key: 'costItemName', header: 'Tên khoản mục', width: 200 },
    { key: 'norm', header: 'Định mức', type: 'money', sum: true },
    { key: 'actual', header: 'Thực tế', type: 'money', sum: true },
    { key: 'diff', header: 'Vượt (+) / tiết kiệm (−)', type: 'money', sum: true, render: (r) => (r.diff === null ? <span className="muted">chưa có định mức</span> : <span className={r.over ? 'text-bad' : ''}>{money(r.diff, { blankZero: false })}</span>) },
    { key: 'pct', header: '% định mức', type: 'number', value: (r) => r.pct ?? null, render: (r) => (r.pct === null ? '' : <span className={r.over ? 'text-bad' : ''}>{r.pct}%</span>) },
  ], []);
  return (
    <>
      <PageHeader title="Định mức chi phí" code="KH02" subtitle="Định mức chi phí theo tháng × chi nhánh × bộ phận × khoản mục; so với chi phí thực tế, xem khoản vượt định mức" helpKey="ke-hoach-tai-chinh" />
      {msg && <div className="alert alert-ok" style={{ marginBottom: 12 }}>{msg}</div>}
      <div className="card">
        <div className="tabs" role="tablist">
          <button role="tab" className={`tab ${tab === 'norms' ? 'active' : ''}`} onClick={() => setTab('norms')}>Khai định mức</button>
          <button role="tab" className={`tab ${tab === 'compare' ? 'active' : ''}`} onClick={() => setTab('compare')}>Thực tế so định mức</button>
        </div>
        <div className="filters">
          <div className="field"><label>{tab === 'norms' ? 'Tháng' : 'Từ tháng'}</label><input type="month" className="input" value={period} onChange={(e) => setPeriod(e.target.value)} /></div>
          {tab === 'compare' && (
            <>
              <div className="field"><label>Đến tháng</label><input type="month" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
              <div className="field"><label>Tài khoản chi phí</label><select className="select input" value={account} onChange={(e) => setAccount(e.target.value)}><option value="64">641, 642 (bán hàng, quản lý)</option><option value="641">641 chi phí bán hàng</option><option value="642">642 chi phí quản lý</option><option value="6">Mọi tài khoản đầu 6</option></select></div>
              <label className="checkbox" style={{ alignSelf: 'flex-end', height: 34 }}><input type="checkbox" checked={onlyOver} onChange={(e) => setOnlyOver(e.target.checked)} /> Chỉ khoản vượt định mức</label>
            </>
          )}
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          <ErrorBox error={q.error ? errorText(q.error) : vs.error ? errorText(vs.error) : save.error ? errorText(save.error) : copy.error ? errorText(copy.error) : null} />
          {tab === 'norms' ? (q.isLoading ? <Loading /> : (
            <>
              <table className="grid">
                <thead><tr><th>Chi nhánh</th><th>Bộ phận</th><th>Khoản mục</th><th className="num">Định mức tháng</th><th>Ghi chú</th><th /></tr></thead>
                <tbody>
                  {draft.map((d, i) => (
                    <tr key={i}>
                      <td><BranchPicker value={d.branchCode} disabled={!editable} onChange={(c) => setRow(i, { branchCode: c })} placeholder="(cả công ty)" /></td>
                      <td><ListPicker items={departments.filter((x) => x.isActive || x.code === d.departmentCode).map((x) => ({ code: x.code, name: x.name }))} value={d.departmentCode} disabled={!editable} onChange={(departmentCode) => setRow(i, { departmentCode })} placeholder="(mọi bộ phận)" /></td>
                      <td style={{ minWidth: 220 }}><ListPicker items={items.filter((x) => x.isActive || x.code === d.costItemCode)} value={d.costItemCode} onChange={(costItemCode) => setRow(i, { costItemCode })} placeholder="Chọn khoản mục" /></td>
                      <td><input className="input num" style={{ width: 150 }} value={d.amount} disabled={!editable} onChange={(e) => setRow(i, { amount: e.target.value })} onBlur={() => setRow(i, { amount: money(parseMoney(d.amount)) })} /></td>
                      <td><input className="input" value={d.note} disabled={!editable} onChange={(e) => setRow(i, { note: e.target.value })} /></td>
                      <td>{editable && <button className="btn btn-sm" title="Bỏ dòng" onClick={() => setDraft((x) => x.filter((_, j) => j !== i))}><Trash2 size={14} /></button>}</td>
                    </tr>
                  ))}
                  {!draft.length && <tr><td colSpan={6} className="muted">Tháng {mm(period)} chưa có định mức.</td></tr>}
                </tbody>
              </table>
              {editable && (
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <button className="btn btn-sm" onClick={() => setDraft((d) => [...d, { branchCode: '', departmentCode: '', costItemCode: '', amount: '', note: '' }])}><Plus size={14} /> Thêm dòng</button>
                  <button className="btn btn-primary" disabled={save.isPending} onClick={() => save.mutate()}>Ghi định mức tháng {mm(period)}</button>
                  <button className="btn" disabled={copy.isPending || !(q.data ?? []).length} onClick={askCopy}><Copy size={16} /> Chép sang các tháng sau</button>
                </div>
              )}
              <div className="muted" style={{ marginTop: 8 }}>Định mức "cả công ty" so với tổng chi phí khoản mục đó ở mọi chi nhánh; "mọi bộ phận" so với tổng mọi bộ phận. Chi phí thực tế lấy theo khoản mục, bộ phận gắn trên dòng phiếu.</div>
            </>
          )) : vs.isLoading ? <Loading /> : (
            <DataGrid storageKey="kh02-vs" rows={vsRows} rowKey={(r) => `${r.branchCode}|${r.departmentCode}|${r.costItemCode}`} columns={vsCols} exportName={`dinh-muc-chi-phi-${period}-${to}`} exportTitle={`Chi phí thực tế so định mức từ ${mm(period)} đến ${mm(to)}`} />
          )}
        </div>
      </div>
    </>
  );
}

/* ================================================================== Cảnh báo ở Tổng quan */

interface Alerts {
  today: string;
  receivable: { overdue: { count: number; amount: number }; dueSoon: { count: number; amount: number } };
  payable: { overdue: { count: number; amount: number }; dueSoon: { count: number; amount: number } };
  contractPayments: { contractCode: string; contractName: string; seq: number; dueDate: string; amount: number; overdue: boolean }[];
  contractsExpiring: { code: string; name: string; endDate: string }[];
}

export function AlertsPanel() {
  const q = useQuery({ queryKey: ['alerts'], queryFn: () => api.get<Alerts>('/api/v1/alerts'), staleTime: 60_000 });
  const a = q.data;
  if (!a) return null;
  const items: { text: string; link: string; bad?: boolean }[] = [];
  if (a.receivable.overdue.count) items.push({ text: `${a.receivable.overdue.count} khoản phải thu quá hạn: ${money(a.receivable.overdue.amount)}`, link: '/cong-no/khoan-cong-no', bad: true });
  if (a.payable.overdue.count) items.push({ text: `${a.payable.overdue.count} khoản phải trả quá hạn: ${money(a.payable.overdue.amount)}`, link: '/cong-no/khoan-cong-no', bad: true });
  if (a.receivable.dueSoon.count) items.push({ text: `${a.receivable.dueSoon.count} khoản phải thu đến hạn trong 7 ngày: ${money(a.receivable.dueSoon.amount)}`, link: '/cong-no/khoan-cong-no' });
  if (a.payable.dueSoon.count) items.push({ text: `${a.payable.dueSoon.count} khoản phải trả đến hạn trong 7 ngày: ${money(a.payable.dueSoon.amount)}`, link: '/cong-no/khoan-cong-no' });
  for (const c of a.contractPayments) items.push({ text: `Hợp đồng ${c.contractCode}${c.contractName ? ` (${c.contractName})` : ''} kỳ ${c.seq} ${c.overdue ? 'đã quá hạn' : 'đến hạn'} ngày ${date(c.dueDate)}: ${money(c.amount)}`, link: '/bao-cao/lich-thanh-toan-hop-dong', bad: c.overdue });
  for (const c of a.contractsExpiring) items.push({ text: `Hợp đồng ${c.code} (${c.name}) hết hạn ngày ${date(c.endDate)}`, link: '/bao-cao/lich-thanh-toan-hop-dong' });
  if (!items.length) return null;
  return (
    <div className="card" style={{ marginBottom: 14, padding: '10px 16px' }}>
      <b>Cần chú ý</b>
      <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
        {items.map((x) => <li key={x.text}><Link to={x.link} className={x.bad ? 'text-bad' : ''}>{x.text}</Link></li>)}
      </ul>
    </div>
  );
}
