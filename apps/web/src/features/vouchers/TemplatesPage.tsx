/**
 * Bút toán mẫu (BT01) và bút toán lặp (BT02).
 *  - Mẫu: phiếu thu / chi / báo có / báo nợ / phiếu kế toán dựng sẵn; soạn bằng chính hộp lập phiếu (chế độ mẫu).
 *  - Lặp: lịch sinh phiếu từ mẫu (tháng / quý / năm). Màn liệt kê các kỳ đến hạn chưa sinh; người dùng chọn rồi bấm
 *    "Sinh phiếu" — mỗi kỳ sinh đúng một phiếu, bấm lại không sinh trùng.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { RECURRENCE_FREQUENCIES, VOUCHER_TYPES, type RecurrenceFrequency, type VoucherTemplateInput, type VoucherType } from '@ketoan/contracts';
import { api, errorText } from '@/lib/api';
import { money } from '@/lib/format';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { Empty, ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ListPicker } from '@/components/pickers';
import { SearchFilter, searchRows, useBranches, BranchPicker } from '@/components/filters';
import { VOUCHER_META, VoucherForm, type TemplateDraft } from './VoucherForm';

export interface Template { code: string; name: string; docType: VoucherType; isActive: boolean; voucher: VoucherTemplateInput; lineCount: number; total: number }
interface Recurrence {
  id: string; templateCode: string; templateName: string; docType: VoucherType; name: string; frequency: RecurrenceFrequency; frequencyLabel: string;
  dayOfMonth: number; startMonth: string; endMonth: string | null; branchCode: string | null; isActive: boolean; runs: number; lastPeriod: string | null;
}
interface Due { recurrenceId: string; period: string; periodLabel: string; docDate: string; name: string; templateCode: string; docType: VoucherType; branchCode: string; description: string; total: number; problem: string | null }
interface GenResult { recurrenceId: string; period: string; ok: boolean; docNo?: string; error?: string }

export const useTemplates = (docType?: VoucherType) =>
  useQuery({ queryKey: ['voucher-templates', docType ?? 'all'], queryFn: () => api.get<Template[]>('/api/v1/voucher-templates', docType ? { docType, status: 'active' } : {}), staleTime: 30_000 });
const lastDayOfMonth = () => { const d = new Date(); const e = new Date(d.getFullYear(), d.getMonth() + 1, 0); return `${e.getFullYear()}-${String(e.getMonth() + 1).padStart(2, '0')}-${String(e.getDate()).padStart(2, '0')}`; };
const monthText = (m: string | null) => (m ? `${m.slice(5)}/${m.slice(0, 4)}` : '');

export function VoucherTemplatesPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [docType, setDocType] = useState('');
  const [editing, setEditing] = useState<{ type: VoucherType; draft: TemplateDraft } | null>(null);
  const [newType, setNewType] = useState<VoucherType | null>(null);
  const q = useTemplates();
  const rows = searchRows((q.data ?? []).filter((t) => !docType || t.docType === docType), search, (t) => `${t.code} ${t.name} ${t.voucher.description}`);
  return (
    <>
      <PageHeader title="Bút toán mẫu" code="BT01" subtitle="Phiếu dựng sẵn để lập nhanh hoặc lặp định kỳ: thuê nhà, phân bổ, trích trước, lương…" helpKey="but-toan-mau"
        actions={can('documents:write') && <button className="btn btn-primary" onClick={() => setNewType('manual')}><Plus size={16} /> Thêm mẫu</button>} />
      <div className="card">
        <div className="filters">
          <SearchFilter value={search} onChange={setSearch} />
          <div className="field">
            <label>Loại phiếu</label>
            <select className="select input" value={docType} onChange={(e) => setDocType(e.target.value)}>
              <option value="">Tất cả</option>{VOUCHER_TYPES.map((t) => <option key={t} value={t}>{VOUCHER_META[t].title}</option>)}
            </select>
          </div>
        </div>
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : !rows.length ? <Empty text="Chưa có bút toán mẫu. Bấm Thêm mẫu, chọn loại phiếu rồi soạn như lập phiếu thường." /> : (
          <DataGrid storageKey="bt01" rows={rows} rowKey={(t) => t.code} footerLabel={false}
            onRowClick={(t) => can('documents:write') && setEditing({ type: t.docType, draft: { code: t.code, name: t.name, isActive: t.isActive, isNew: false, voucher: t.voucher } })}
            columns={[
              { key: 'code', header: 'Mã mẫu', type: 'code' },
              { key: 'name', header: 'Tên mẫu' },
              { key: 'docType', header: 'Loại phiếu', value: (t) => VOUCHER_META[t.docType].title },
              { key: 'description', header: 'Diễn giải', value: (t) => t.voucher.description },
              { key: 'branch', header: 'Chi nhánh', type: 'code', value: (t) => t.voucher.branchCode },
              { key: 'lineCount', header: 'Số dòng', type: 'number' },
              { key: 'total', header: 'Số tiền mẫu', type: 'money', showZero: true },
              { key: 'isActive', header: 'Trạng thái', value: (t) => (t.isActive ? 'Đang dùng' : 'Ngừng dùng') },
            ] satisfies Column<Template>[]} />
        )}
      </div>
      {newType && (
        <Modal title="Thêm bút toán mẫu" onClose={() => setNewType(null)}
          footer={<><button className="btn" onClick={() => setNewType(null)}>Đóng</button><button className="btn btn-primary" onClick={() => { setEditing({ type: newType, draft: { code: '', name: '', isActive: true, isNew: true } }); setNewType(null); }}>Tiếp tục</button></>}>
          <Field label="Loại phiếu" full>
            <select className="select input" value={newType} onChange={(e) => setNewType(e.target.value as VoucherType)}>
              {VOUCHER_TYPES.map((t) => <option key={t} value={t}>{VOUCHER_META[t].title}</option>)}
            </select>
          </Field>
        </Modal>
      )}
      {editing && <VoucherForm type={editing.type} template={editing.draft} onClose={() => setEditing(null)} onSaved={() => setEditing(null)} />}
    </>
  );
}

export function VoucherRecurrencesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const [to, setTo] = useState(lastDayOfMonth());
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<GenResult[] | null>(null);
  const [editing, setEditing] = useState<Partial<Recurrence> | null>(null);
  const recs = useQuery({ queryKey: ['voucher-recurrences'], queryFn: () => api.get<Recurrence[]>('/api/v1/voucher-recurrences') });
  const due = useQuery({ queryKey: ['voucher-recurrences', 'due', to], queryFn: () => api.get<Due[]>('/api/v1/voucher-recurrences/due', { to }) });
  const key = (d: { recurrenceId: string; period: string }) => `${d.recurrenceId}|${d.period}`;
  const ready = (due.data ?? []).filter((d) => !d.problem);
  const gen = useMutation({
    mutationFn: () => api.post<GenResult[]>('/api/v1/voucher-recurrences/generate', { items: ready.filter((d) => picked.has(key(d))).map((d) => ({ recurrenceId: d.recurrenceId, period: d.period })) }),
    onSuccess: (r) => {
      setResults(r); setPicked(new Set());
      void qc.invalidateQueries({ queryKey: ['voucher-recurrences'] }); void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
  const toggleAll = (on: boolean) => setPicked(on ? new Set(ready.map(key)) : new Set());
  return (
    <>
      <PageHeader title="Bút toán lặp" code="BT02" subtitle="Sinh phiếu định kỳ từ bút toán mẫu; mỗi kỳ chỉ sinh một lần" helpKey="but-toan-mau"
        actions={can('documents:write') && <button className="btn btn-primary" onClick={() => setEditing({ frequency: 'monthly', dayOfMonth: 1, isActive: true })}><Plus size={16} /> Thêm lịch lặp</button>} />
      <div className="card">
        <h3 style={{ margin: '14px 16px 4px', fontSize: 14 }}>Kỳ đến hạn chưa sinh phiếu</h3>
        <div className="filters">
          <div className="field"><label>Đến ngày</label><input type="date" className="input" value={to} onChange={(e) => { setTo(e.target.value); setPicked(new Set()); }} /></div>
          {can('documents:write') && (
            <div className="field"><label>&nbsp;</label>
              <button className="btn btn-primary" disabled={!picked.size || gen.isPending} onClick={() => gen.mutate()}>Sinh {picked.size || ''} phiếu đã chọn</button>
            </div>
          )}
        </div>
        <ErrorBox error={due.error ? errorText(due.error) : gen.error ? errorText(gen.error) : null} />
        {results && (
          <div className={`alert ${results.every((r) => r.ok) ? 'alert-ok' : 'alert-warn'}`} style={{ marginBottom: 10 }}>
            Đã sinh {results.filter((r) => r.ok).length} phiếu{results.some((r) => r.ok) && <>: {results.filter((r) => r.ok).map((r) => r.docNo).join(', ')}</>}.
            {results.filter((r) => !r.ok).map((r) => <div key={key(r)}>Kỳ {r.period}: {r.error}</div>)}
          </div>
        )}
        {due.isLoading ? <Loading /> : !due.data?.length ? <Empty text="Không có kỳ nào đến hạn chưa sinh phiếu." /> : (
          <div className="table-wrap"><table className="grid">
            <thead>
              <tr>
                <th style={{ width: 32 }}><input type="checkbox" checked={ready.length > 0 && picked.size === ready.length} onChange={(e) => toggleAll(e.target.checked)} /></th>
                <th>Ngày phiếu</th><th>Kỳ</th><th>Bút toán lặp</th><th>Loại phiếu</th><th>Chi nhánh</th><th>Diễn giải</th><th className="num">Số tiền</th><th>Ghi chú</th>
              </tr>
            </thead>
            <tbody>
              {due.data.map((d) => (
                <tr key={key(d)}>
                  <td><input type="checkbox" disabled={Boolean(d.problem)} checked={picked.has(key(d))} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(key(d)); else n.delete(key(d)); return n; })} /></td>
                  <td>{d.docDate.split('-').reverse().join('/')}</td><td>{d.periodLabel}</td><td>{d.name}</td><td>{VOUCHER_META[d.docType].title}</td>
                  <td className="mono">{d.branchCode}</td><td>{d.description}</td><td className="num">{money(d.total)}</td>
                  <td className={d.problem ? 'text-bad' : 'muted'}>{d.problem ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
      <div className="card">
        <h3 style={{ margin: '14px 16px 4px', fontSize: 14 }}>Lịch lặp</h3>
        <ErrorBox error={recs.error ? errorText(recs.error) : null} />
        {recs.isLoading ? <Loading /> : !recs.data?.length ? <Empty text="Chưa có lịch lặp. Tạo bút toán mẫu (BT01) trước, rồi bấm Thêm lịch lặp." /> : (
          <DataGrid storageKey="bt02" rows={recs.data} rowKey={(r) => r.id} footerLabel={false} onRowClick={(r) => can('documents:write') && setEditing(r)}
            columns={[
              { key: 'name', header: 'Tên' },
              { key: 'templateCode', header: 'Mẫu', type: 'code' },
              { key: 'docType', header: 'Loại phiếu', value: (r) => VOUCHER_META[r.docType].title },
              { key: 'frequencyLabel', header: 'Chu kỳ', value: (r) => `${r.frequencyLabel}, ngày ${r.dayOfMonth}` },
              { key: 'startMonth', header: 'Từ tháng', value: (r) => monthText(r.startMonth) },
              { key: 'endMonth', header: 'Đến tháng', value: (r) => monthText(r.endMonth) || 'Không giới hạn' },
              { key: 'branchCode', header: 'Chi nhánh', type: 'code', value: (r) => r.branchCode ?? '(theo mẫu)' },
              { key: 'runs', header: 'Đã sinh', type: 'number' },
              { key: 'lastPeriod', header: 'Kỳ gần nhất', value: (r) => monthText(r.lastPeriod) },
              { key: 'isActive', header: 'Trạng thái', value: (r) => (r.isActive ? 'Đang chạy' : 'Ngừng') },
            ] satisfies Column<Recurrence>[]} />
        )}
      </div>
      {editing && <RecurrenceForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function RecurrenceForm({ value, onClose }: { value: Partial<Recurrence>; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<Recurrence>) => setV((x) => ({ ...x, ...p }));
  const templates = useTemplates().data ?? [];
  const { data: branches } = useBranches();
  const body = () => ({ templateCode: v.templateCode ?? '', name: v.name === v.templateName ? '' : v.name ?? '', frequency: v.frequency ?? 'monthly', dayOfMonth: Number(v.dayOfMonth) || 1, startMonth: v.startMonth ?? '', endMonth: v.endMonth || undefined, branchCode: v.branchCode || undefined, isActive: v.isActive ?? true });
  const done = () => { void qc.invalidateQueries({ queryKey: ['voucher-recurrences'] }); onClose(); };
  const viewAgain = useViewAgain();
  const save = useMutation({ mutationFn: () => (v.id ? api.put(`/api/v1/voucher-recurrences/${v.id}`, body()) : api.post('/api/v1/voucher-recurrences', body())), onSuccess: () => { if (v.id) { void qc.invalidateQueries({ queryKey: ['voucher-recurrences'] }); viewAgain[1](); } else done(); } });
  const del = useMutation({ mutationFn: () => api.delete(`/api/v1/voucher-recurrences/${v.id}`), onSuccess: done });
  return (
    <Modal viewAgain={viewAgain} viewFirst={Boolean(value.id)} title={v.id ? `Sửa lịch lặp ${v.name}` : 'Thêm lịch lặp'} onClose={onClose}
      footer={<>
        {v.id && !v.runs && <button data-view-ok className="btn btn-danger" style={{ marginRight: 'auto' }} disabled={del.isPending} onClick={() => del.mutate()}>Xoá</button>}
        <button className="btn" onClick={onClose}>Đóng</button>
        <button className="btn btn-primary" disabled={save.isPending || !v.templateCode || !v.startMonth} onClick={() => save.mutate()}>Ghi</button>
      </>}>
      <Field label="Bút toán mẫu" full>
        <ListPicker items={templates.filter((t) => t.isActive || t.code === v.templateCode).map((t) => ({ code: t.code, name: `${t.name} (${VOUCHER_META[t.docType].title.toLowerCase()})` }))} value={v.templateCode ?? ''} onChange={(templateCode) => set({ templateCode })} placeholder="Bấm để chọn" />
      </Field>
      <Field label="Tên lịch" hint="Trống = tên mẫu"><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Chi nhánh" hint="Trống = chi nhánh trên mẫu">
        <BranchPicker activeOnly value={v.branchCode ?? ''} onChange={(c) => set({ branchCode: c || null })} placeholder="(Theo mẫu)" />
      </Field>
      <Field label="Chu kỳ">
        <select className="select input" value={v.frequency ?? 'monthly'} onChange={(e) => set({ frequency: e.target.value as RecurrenceFrequency })}>
          {Object.entries(RECURRENCE_FREQUENCIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="Ngày trong tháng" hint="Tháng ngắn hơn lấy ngày cuối tháng"><input type="number" min={1} max={31} className="input" value={v.dayOfMonth ?? 1} onChange={(e) => set({ dayOfMonth: Number(e.target.value) })} /></Field>
      <Field label="Từ tháng" hint="Quý / năm: tính từ tháng này"><input type="month" className="input" value={v.startMonth ?? ''} onChange={(e) => set({ startMonth: e.target.value })} /></Field>
      <Field label="Đến tháng" hint="Trống = không giới hạn"><input type="month" className="input" value={v.endMonth ?? ''} onChange={(e) => set({ endMonth: e.target.value || null })} /></Field>
      <Field label="Trạng thái"><label className="checkbox"><input type="checkbox" checked={v.isActive ?? true} onChange={(e) => set({ isActive: e.target.checked })} /> Đang chạy</label></Field>
      {(save.error || del.error) && <div className="alert alert-bad full">{errorText(save.error ?? del.error)}</div>}
    </Modal>
  );
}
