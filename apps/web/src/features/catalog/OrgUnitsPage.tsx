// [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — màn Sơ đồ tổ chức (DM16)
// [2026-11-03 02:10 PM Nguyễn Văn Thủy] SDTC — làm lại gọn như màn Sơ đồ tổ chức quen dùng: cây trái, form trên, lưới nút con dưới
// [2026-11-05 11:00 PM Nguyễn Văn Thủy] SDTC — thêm kiểu xem sơ đồ khối bên cạnh kiểu danh sách
// [2026-11-03 03:00 PM Nguyễn Văn Thủy] SDTC — bỏ ô Mã ngắn, Alias (chưa có nghĩa nghiệp vụ, không chức năng nào dùng): chỉ còn Mã, Tên, Mô tả
/**
 * SƠ ĐỒ TỔ CHỨC (DM16) — gốc Công ty → Miền → Chi nhánh → Tỉnh.
 *   Thanh nút: Thêm · Sửa · Xoá · Ghi · Nạp · Hoãn · Xuất · Nhập Excel · Quay về dữ liệu gốc (xoá chỉ được nút trống).
 *   Trái: cây. Phải trên: Mã, Tên, Mô tả của nút đang chọn. Phải dưới: các nút con (nút "Xem": toàn bộ cấp N / tất cả).
 * Chi nhánh gắn vào nút ở Danh mục chi nhánh (DM02, ô "Thuộc SĐTC"). Kho nhận hàng của mỗi chi nhánh cấp 2 phần mềm tự lấy (mã xx000).
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, FileDown, FileUp, Pencil, Plus, RefreshCw, RotateCcw, Trash2, Undo2 } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { plain } from '@/components/pickers';
import { CayDonVi } from '@/components/CayDonVi';
import { SoDoToChucChart } from './SoDoToChucChart';
import { indexOrg, invalidateOrg, useOrgTree, type OrgNode } from '@/lib/orgUnits';

type Form = { code: string; name: string; note: string; parentCode: string | null; taxId: string; validFrom: string };
const homNay = () => new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10);
const empty = (parentCode: string | null): Form => ({ code: '', name: '', note: '', parentCode, taxId: '', validFrom: homNay() });

export function OrgUnitsPage() {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const qc = useQueryClient();
  const tree = useOrgTree();
  const ix = useMemo(() => indexOrg(tree.data), [tree.data]);
  const [sel, setSel] = useState<string | null>(null);
  const node = (sel ? ix.byCode.get(sel) : null) ?? ix.root;
  /** null = đang xem; 'add' = thêm nút con; 'edit' = sửa nút đang chọn. */
  const [mode, setMode] = useState<null | 'add' | 'edit'>(null);
  const [f, setF] = useState<Form>(empty(null));
  const [level, setLevel] = useState<number | 'all' | null>(null);
  const [imp, setImp] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const [view, setView] = useState<'list' | 'chart'>('list');

  const nodeTax = (node as { taxId?: string } | null)?.taxId ?? '';
  const shown: Form = mode ? f : node ? { code: node.code, name: node.name, note: node.note, parentCode: node.parentCode, taxId: nodeTax, validFrom: homNay() } : empty(null);
  const rows = level === 'all' ? tree.data?.nodes ?? [] : level !== null ? (tree.data?.nodes ?? []).filter((n) => n.level === level) : node ? ix.kids.get(node.code) ?? [] : [];
  const title = level === 'all' ? 'Tất cả' : level !== null ? `Toàn bộ nhóm cấp ${level}` : node?.path ?? '';

  const done = (text: string, code?: string) => { invalidateOrg(qc); setMode(null); setMsg({ ok: true, text }); if (code) setSel(code); };
  const fail = (e: unknown) => setMsg({ ok: false, text: errorText(e) });
  const save = useMutation({
    mutationFn: () => {
      // [2026-11-13 Nguyễn Văn Thủy] MST đặt ở nút (vd tỉnh) + ngày hiệu lực; đổi MST = phiên bản mới, dòng cũ giữ MST cũ (0121) (đóng góp)
      const body = { name: f.name, note: f.note, taxId: f.taxId.trim(), validFrom: f.validFrom || null };
      return mode === 'add' ? api.post('/api/v1/org-units', { ...body, code: f.code.trim(), parentCode: f.parentCode }) : api.patch(`/api/v1/org-units/${encodeURIComponent(node!.code)}`, body);
    },
    onSuccess: () => done('Đã ghi.', mode === 'add' ? f.code.trim() : node?.code), onError: fail,
  });
  const del = useMutation({ mutationFn: (n: OrgNode) => api.delete(`/api/v1/org-units/${encodeURIComponent(n.code)}`), onSuccess: () => { done('Đã xoá.'); setSel(node?.parentCode ?? null); }, onError: fail });
  const restore = useMutation({
    mutationFn: async () => {
      const info = await api.get<{ nodes: number; assignments: number }>('/api/v1/org-units/defaults');
      if (!window.confirm(`Quay về dữ liệu gốc sơ đồ tổ chức?\n\nTệp gốc: ${info.nodes} nút, ${info.assignments} chi nhánh gắn nút. Nút tự thêm không còn chi nhánh sẽ bị xoá.`)) return null;
      return api.post<{ created: number; updated: number; assigned: number; removed: number }>('/api/v1/org-units/restore-defaults', { confirm: true });
    },
    onSuccess: (r) => r && done(`Đã quay về dữ liệu gốc: ${r.created + r.updated} nút, gắn ${r.assigned} chi nhánh${r.removed ? `, xoá ${r.removed} nút tự thêm` : ''}.`),
    onError: fail,
  });

  const exportExcel = async () => {
    const XLSX = await import('@/lib/excelChuan').then((m) => m.xlsxChuan()); // [2026-11-11 Nguyễn Văn Thủy] xuất Excel định dạng chuẩn (đóng góp)
    const nodes = [...(tree.data?.nodes ?? [])].sort((a, b) => a.path.localeCompare(b.path));
    const s1 = [['Mã', 'Tên', 'Mã cha', 'Mô tả', 'PATH']].concat(nodes.map((n) => [n.code, n.name, n.parentCode ?? '', n.note, n.path]));
    const s2 = [['Mã chi nhánh', 'Tên chi nhánh', 'Mã nút']].concat((tree.data?.branches ?? []).map((b) => [b.code, b.name, b.orgCode ?? '']));
    const wb = XLSX.utils.book_new();
    for (const [name, data, cols] of [['Nút', s1, [14, 40, 12, 30, 30]], ['Gắn chi nhánh', s2, [16, 36, 12]]] as const) {
      const ws = XLSX.utils.aoa_to_sheet(data as string[][]);
      ws['!cols'] = cols.map((wch) => ({ wch }));
      XLSX.utils.book_append_sheet(wb, ws, name);
    }
    XLSX.writeFile(wb, 'so-do-to-chuc.xlsx');
  };

  const cols: Column<OrgNode>[] = [
    { key: 'code', header: 'Mã SĐTC', type: 'code', width: 110 },
    { key: 'name', header: 'Tên SĐTC', width: 280 },
    { key: 'path', header: 'PATH', width: 240 },
    { key: 'note', header: 'Mô tả', width: 200 },
  ];
  const editable = Boolean(mode);
  const input = (k: keyof Form, opts: { mono?: boolean; disabled?: boolean } = {}) => (
    <input className={`input${opts.mono ? ' mono' : ''}`} value={shown[k] ?? ''} readOnly={!editable || opts.disabled} onChange={(e) => setF((x) => ({ ...x, [k]: e.target.value }))} />
  );

  return (
    <>
      <PageHeader title="Sơ đồ tổ chức" code="DM16" helpKey="so-do-to-chuc" subtitle="Công ty → Miền → Chi nhánh → Tỉnh. Chi nhánh gắn vào nút ở Danh mục chi nhánh (ô Thuộc SĐTC)" />
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px' }}>
          {canWrite && <button className="btn btn-sm" disabled={Boolean(mode) || !node} title="Thêm nút con dưới nút đang chọn" onClick={() => { setF(empty(node!.code)); setMode('add'); setMsg(null); }}><Plus size={14} /> Thêm</button>}
          {canWrite && <button className="btn btn-sm" disabled={Boolean(mode) || !node} onClick={() => { setF(shown); setMode('edit'); setMsg(null); }}><Pencil size={14} /> Sửa</button>}
          {canWrite && <button className="btn btn-sm btn-primary" disabled={!mode || !f.name.trim() || (mode === 'add' && !f.code.trim()) || save.isPending} onClick={() => save.mutate()}><Check size={14} /> Ghi</button>}
          <button className="btn btn-sm" disabled={Boolean(mode)} onClick={() => void tree.refetch()}><RefreshCw size={14} /> Nạp</button>
          {canWrite && <button className="btn btn-sm" disabled={!mode} onClick={() => setMode(null)}><Undo2 size={14} /> Hoãn</button>}
          <button className="btn btn-sm" onClick={() => void exportExcel()}><FileDown size={14} /> Xuất</button>
          {canWrite && <button className="btn btn-sm" onClick={() => setImp(true)}><FileUp size={14} /> Nhập Excel</button>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
            <button className={`btn btn-sm${view === 'list' ? ' btn-primary' : ''}`} disabled={Boolean(mode)} title="Cây, thông tin nút và lưới nút con" onClick={() => setView('list')}>Danh sách</button>
            <button className={`btn btn-sm${view === 'chart' ? ' btn-primary' : ''}`} disabled={Boolean(mode)} title="Xem toàn bộ cây dạng sơ đồ khối" onClick={() => setView('chart')}>Sơ đồ</button>
          </div>
          {can('settings:write') && <button className="btn btn-sm" disabled={restore.isPending} title="Đặt lại cây và việc gắn chi nhánh theo tệp gốc — dùng khi đã sửa lộn xộn" onClick={() => restore.mutate()}><RotateCcw size={14} /> Quay về dữ liệu gốc</button>}
        </div>
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
        <ErrorBox error={tree.error ? errorText(tree.error) : null} />
        {tree.isLoading ? <Loading /> : view === 'chart' ? (ix.root ? <SoDoToChucChart root={ix.root} kids={ix.kids} selected={node?.code ?? null} onSelect={(n) => { setSel(n.code); setLevel(null); setView('list'); }} /> : null) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: 12, padding: '0 12px 12px' }}>
            <div>
              <div style={{ fontWeight: 700, margin: '2px 0 6px' }}>Sơ đồ tổ chức</div>
              <CayDonVi tree={tree.data} selected={node?.code ?? null} onSelect={(n) => { if (mode) return; setSel(n.code); setLevel(null); }} height="calc(100vh - 250px)" openLevel={2} />
            </div>
            <div style={{ minWidth: 0 }}>
              <fieldset className="fgroup" style={{ marginTop: 0 }}>
                <legend>{mode === 'add' ? `Thêm nút con của ${f.parentCode}` : mode === 'edit' ? `Sửa ${node?.code}` : 'Thông tin'}</legend>
                <Field label="Mã (*)">{input('code', { mono: true, disabled: mode === 'edit' })}</Field>
                <Field label="Tên (*)">{input('name')}</Field>
                <Field label="MST kê khai" tip="Đặt ở nút tỉnh / chi nhánh pháp lý; shop, kho bên dưới không đặt riêng thì theo MST này. Trống = theo nút cha / công ty">
                  {editable ? <input className="input mono" value={f.taxId} placeholder="10 số hoặc 10 số-3 số" onChange={(e) => setF((x) => ({ ...x, taxId: e.target.value.replace(/[^0-9-]/g, '') }))} />
                    : <div className="input mono" style={{ background: 'var(--surface-2, #f4f6f9)' }}>{shown.taxId || '—'}</div>}
                  {editable && f.taxId && !/^[0-9]{10}(-[0-9]{3})?$/.test(f.taxId) && <div className="neg" style={{ fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>MST gồm 10 số hoặc 10 số-3 số</div>}
                </Field>
                {mode === 'edit' && f.taxId !== nodeTax && (
                  <Field label="MST mới áp dụng từ ngày" tip="Chứng từ từ ngày này ghi MST mới; chứng từ trước ngày này giữ MST cũ">
                    <input className="input" type="date" value={f.validFrom} onChange={(e) => setF((x) => ({ ...x, validFrom: e.target.value }))} />
                  </Field>
                )}
                <Field label="Mô tả" full>{input('note')}</Field>
              </fieldset>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
                <b style={{ flex: 1 }}>{title}</b>
                <select className="select input" style={{ width: 210, height: 28, fontSize: 12.5 }} value={level === null ? '' : String(level)} onChange={(e) => setLevel(e.target.value === '' ? null : e.target.value === 'all' ? 'all' : Number(e.target.value))} title="Xem các nút">
                  <option value="">Xem: nút con của nút đang chọn</option>
                  {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>Xem toàn bộ nhóm cấp {l}</option>)}
                  <option value="all">Xem tất cả</option>
                </select>
                <button className="btn btn-sm btn-ghost" onClick={() => exportRef.current?.()}>Xuất lưới</button>
              </div>
              <DataGrid storageKey="dm16-v2" exportName="so-do-to-chuc" exportRef={exportRef} rows={rows} rowKey={(n) => n.code} columns={cols}
                onRowDoubleClick={(n) => { if (!mode) { setSel(n.code); setLevel(null); } }} rowClassName={(n) => (n.isActive ? '' : 'muted')} />
            </div>
          </div>
        )}
      </div>
      {imp && <ImportForm onClose={() => setImp(false)} onSaved={(text) => { setImp(false); done(text); }} />}
    </>
  );
}

interface ImportResult { created: number; updated: number; assigned: number; renamed?: { from: string; to: string }[]; errors: { sheet: string; row: number; code: string; message: string }[]; errorCount: number; saved: boolean }
const H = (s: unknown) => plain(String(s ?? '')).replace(/[^a-z0-9]+/g, ' ').trim();
const pick = (row: Record<string, unknown>, ...names: string[]) => { for (const [k, v] of Object.entries(row)) if (names.includes(H(k))) return String(v ?? '').trim(); return ''; };

/** Nhập Excel 2 sheet (lấy mẫu bằng nút Xuất): Nút · Gắn chi nhánh. Xem trước rồi mới ghi; có lỗi thì không ghi gì. */
function ImportForm({ onClose, onSaved }: { onClose: () => void; onSaved: (text: string) => void }) {
  const [body, setBody] = useState<Record<string, unknown> | null>(null);
  const [res, setRes] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (b: Record<string, unknown>, dryRun: boolean) => {
    setBusy(true); setErr('');
    try {
      const r = await api.post<ImportResult>('/api/v1/org-units/import', { ...b, dryRun });
      setRes(r);
      if (!dryRun && r.saved) onSaved(`Đã nhập: ${r.created} nút mới, ${r.updated} nút cập nhật, gắn ${r.assigned} chi nhánh.`);
    } catch (e) { setErr(errorText(e)); } finally { setBusy(false); }
  };
  const read = async (file: File) => {
    setErr(''); setRes(null);
    const XLSX = await import('xlsx');
    const wb = XLSX.read(await file.arrayBuffer());
    const sheet = (...keys: string[]) => { const n = wb.SheetNames.find((s) => keys.some((k) => H(s).includes(k))); return n ? XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[n]!, { defval: '' }) : []; };
    const nodes = sheet('nut', 'sdtc', 'so do').map((r) => ({ code: pick(r, 'ma', 'ma sdtc', 'ma nut'), name: pick(r, 'ten', 'ten sdtc', 'ten nut'), parentCode: pick(r, 'ma cha', 'nut cha', 'cha') || null, note: pick(r, 'mo ta', 'ghi chu') })).filter((n) => n.code);
    const assignments = sheet('gan', 'chi nhanh').map((r) => ({ branchCode: pick(r, 'ma chi nhanh', 'chi nhanh', 'ma cn'), orgCode: pick(r, 'ma nut', 'ma sdtc', 'nut', 'sdtc') })).filter((a) => a.branchCode && a.orgCode);
    if (!nodes.length && !assignments.length) { setErr('Không đọc được sheet "Nút" / "Gắn chi nhánh" — dùng tệp từ nút Xuất làm mẫu.'); return; }
    const b = { nodes, assignments };
    setBody(b);
    await run(b, true);
  };
  return (
    <Modal wide title="Nhập sơ đồ tổ chức từ Excel" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={!body || !res || res.errorCount > 0 || busy} onClick={() => body && void run(body, false)}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full" style={{ fontSize: 13 }}>Tệp 2 sheet (lấy mẫu bằng nút <b>Xuất</b>): <b>Nút</b> (Mã, Tên, Mã cha, Mô tả) · <b>Gắn chi nhánh</b> (Mã chi nhánh, Mã nút). Có lỗi thì không ghi gì.</div>
      <Field label="Tệp Excel" full><input type="file" accept=".xlsx,.xls" onChange={(e) => { const file = e.target.files?.[0]; if (file) void read(file); }} /></Field>
      {busy && <Loading />}
      {err && <div className="alert alert-bad full">{err}</div>}
      {res && (
        <div className="full" style={{ fontSize: 13 }}>
          <div className={`alert ${res.errorCount ? 'alert-bad' : 'alert-ok'}`}>{res.errorCount ? `${res.errorCount} lỗi — sửa tệp rồi chọn lại.` : `Xem trước: ${res.created} nút mới, ${res.updated} nút cập nhật, gắn ${res.assigned} chi nhánh. Bấm Ghi để lưu.`}</div>
          {(res.renamed?.length ?? 0) > 0 && <div className="muted">Khớp theo 5 số đầu (shop đổi đuôi): {res.renamed!.map((x) => `${x.from} → ${x.to}`).join(' · ')}</div>}
          {res.errors.length > 0 && (
            <table className="grid" style={{ marginTop: 6 }}>
              <thead><tr><th>Sheet</th><th>Dòng</th><th>Mã</th><th>Lỗi</th></tr></thead>
              <tbody>{res.errors.slice(0, 200).map((e, i) => <tr key={i}><td>{e.sheet}</td><td>{e.row || ''}</td><td className="mono">{e.code}</td><td>{e.message}</td></tr>)}</tbody>
            </table>
          )}
        </div>
      )}
    </Modal>
  );
}
