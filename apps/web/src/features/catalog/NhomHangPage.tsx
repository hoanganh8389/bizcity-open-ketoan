// [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — màn Nhóm hàng (DM11) làm lại gọn: cây trái, form trên, lưới nhóm con dưới; bỏ các thẻ ngành / nhãn / loại (đóng góp)
/**
 * NHÓM HÀNG (DM11) — một cây duy nhất: Nhóm hàng → cấp 1 → cấp 2 → cấp 3 → …
 *   Thanh nút: Thêm (nhóm con của nhóm đang chọn) · Sửa · Xoá · Ghi · Nạp · Hoãn · Xuất.
 *   Trái: cây. Phải trên: Mã nhóm, Mã ngắn (mã ghép), Tên, Thuộc nhóm, Đang dùng — kèm cấp và đầu mã hàng của nhóm.
 *   Phải dưới: nhóm con của nhóm đang chọn (ô Xem: toàn bộ nhóm cấp N / tất cả).
 * Mã hàng = mã ngắn cấp 1 + cấp 2 + cấp 3 + số thứ tự (sku-rule.ts). Ý nghĩa từng cấp ghi ở Hướng dẫn (docs/huong-dan/nhom-hang.md).
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, FileDown, Pencil, Plus, RefreshCw, Search, Trash2, Undo2, Wand2 } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CayNhomHang, indexNhom, MA_NGAN_DAI, useNhomHang, type NhomHang } from '@/components/CayNhomHang';

type Form = { code: string; skuCode: string; name: string; parentCode: string | null; isActive: boolean };

export function NhomHangPage() {
  const { can } = useAuth();
  const canWrite = can('catalog:write');
  const qc = useQueryClient();
  const q = useNhomHang();
  const ix = useMemo(() => indexNhom(q.data), [q.data]);
  const [sel, setSel] = useState<string | null>(null);
  const node = sel ? ix.byCode.get(sel) ?? null : null;
  /** null = đang xem; 'add' = thêm nhóm con; 'edit' = sửa nhóm đang chọn. */
  const [mode, setMode] = useState<null | 'add' | 'edit'>(null);
  const [f, setF] = useState<Form>({ code: '', skuCode: '', name: '', parentCode: null, isActive: true });
  const [level, setLevel] = useState<number | 'all' | null>(null);
  const [moving, setMoving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const exportRef = useRef<(() => void) | null>(null);

  const shown: Form = mode ? f : node ? { code: node.code, skuCode: node.skuCode ?? '', name: node.name, parentCode: ix.parentOf(node.code), isActive: node.isActive } : { code: '', skuCode: '', name: '', parentCode: null, isActive: true };
  const lv = mode === 'add' ? ix.level(f.parentCode) + 1 : node ? ix.level(node.code) : 0;
  const len = MA_NGAN_DAI[lv];
  const prefix = (mode ? (f.parentCode ? ix.prefix(f.parentCode) : '') : node && ix.parentOf(node.code) ? ix.prefix(ix.parentOf(node.code)) : '') + (lv <= 3 ? shown.skuCode : '');

  const rows = level === 'all' ? q.data ?? [] : level !== null ? (q.data ?? []).filter((c) => ix.level(c.code) === level) : sel ? ix.kids.get(sel) ?? [] : ix.roots;
  const title = level === 'all' ? 'Tất cả nhóm' : level !== null ? `Toàn bộ nhóm cấp ${level}` : node ? ix.path(node.code) : 'Nhóm hàng';

  /** Gợi ý khi thêm: mã nhóm = số lớn nhất + 1; mã ngắn = số kế tiếp trong các nhóm cùng cha, đủ độ dài của cấp. */
  const suggest = (parentCode: string | null): Form => {
    const nums = (q.data ?? []).map((c) => Number(c.code)).filter((n) => Number.isInteger(n));
    const level1 = ix.level(parentCode) + 1;
    const n = MA_NGAN_DAI[level1];
    const sib = (parentCode ? ix.kids.get(parentCode) ?? [] : ix.roots).map((c) => c.skuCode ?? '').filter((x) => n && x.length === n && /^\d+$/.test(x)).map(Number);
    const next = n ? String((sib.length ? Math.max(...sib) : 0) + 1).padStart(n, '0') : '';
    return { code: nums.length ? String(Math.max(...nums) + 1) : '', skuCode: n && next.length === n ? next : '', name: '', parentCode, isActive: true };
  };

  /** Lỗi chặn ghi: thiếu mã / tên, mã ngắn sai độ dài, trùng mã ngắn với nhóm cùng cha. */
  const problem = (() => {
    if (!mode) return '';
    if (mode === 'add' && !f.code.trim()) return 'Nhập mã nhóm';
    if (!f.name.trim()) return 'Nhập tên nhóm';
    if (len && f.skuCode && f.skuCode.length !== len) return `Mã ngắn cấp ${lv} phải đủ ${len} ký tự`;
    const sib = (f.parentCode ? ix.kids.get(f.parentCode) ?? [] : ix.roots).find((c) => c.code !== (mode === 'edit' ? node?.code : '') && f.skuCode && c.skuCode === f.skuCode);
    if (sib && (mode === 'add' || f.skuCode !== (node?.skuCode ?? ''))) return `Mã ngắn ${f.skuCode} đã dùng cho nhóm "${sib.name}" cùng cấp`;
    return '';
  })();

  const done = (text: string, code?: string | null) => { void qc.invalidateQueries({ queryKey: ['item-classes'] }); setMode(null); setMsg({ ok: true, text }); if (code !== undefined) setSel(code); };
  const fail = (e: unknown) => setMsg({ ok: false, text: errorText(e) });
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/item-classes/group/${encodeURIComponent(mode === 'add' ? f.code.trim() : node!.code)}${mode === 'add' ? '?new=1' : ''}`,
      { name: f.name.trim(), parentCode: f.parentCode || undefined, isActive: f.isActive, skuCode: f.skuCode }),
    onSuccess: () => done('Đã ghi.', mode === 'add' ? f.code.trim() : node?.code), onError: fail,
  });
  const del = useMutation({ mutationFn: (c: NhomHang) => api.delete(`/api/v1/item-classes/group/${encodeURIComponent(c.code)}`), onSuccess: () => done('Đã xoá.', node ? ix.parentOf(node.code) : null), onError: fail });
  /** Điền mã ngắn còn thiếu theo mã hàng đang có trong nhóm: xem trước rồi hỏi. */
  const infer = useMutation({
    mutationFn: async () => {
      const pre = await api.post<{ rows: { code: string; name: string; level: number; skuCode: string }[] }>('/api/v1/catalog/sku-codes/infer', { apply: false });
      if (!pre.rows.length) { window.alert('Mọi nhóm có mặt hàng đều đã có mã ngắn'); return false; }
      const sample = pre.rows.slice(0, 8).map((r) => `  cấp ${r.level} · ${r.name}: ${r.skuCode}`).join('\n');
      if (!window.confirm(`Điền mã ngắn cho ${pre.rows.length} nhóm (lấy theo mã hàng đang có trong nhóm):\n${sample}${pre.rows.length > 8 ? '\n  …' : ''}\n\nÁp dụng?`)) return false;
      await api.post('/api/v1/catalog/sku-codes/infer', { apply: true });
      return true;
    },
    onSuccess: (r) => r && done('Đã điền mã ngắn.'), onError: fail,
  });

  const cols: Column<NhomHang>[] = [
    { key: 'code', header: 'Mã nhóm', type: 'code', width: 90 },
    { key: 'name', header: 'Tên nhóm hàng', width: 260 },
    { key: 'skuCode', header: 'Mã ngắn', type: 'code', width: 80, title: 'Đoạn mã của nhóm ghép vào mã hàng (cấp 1 → 3)' },
    { key: 'prefix', header: 'Đầu mã hàng', type: 'code', width: 110, value: (c) => (ix.level(c.code) <= 3 ? ix.prefix(c.code) : ''), title: 'Mã hàng của nhóm bắt đầu bằng = mã ngắn các cấp ghép lại; trống = còn cấp chưa có mã ngắn' },
    { key: 'level', header: 'Cấp', type: 'number', width: 60, value: (c) => ix.level(c.code) },
    { key: 'path', header: 'Path', width: 380, value: (c) => ix.path(c.code) },
    { key: 'products', header: 'Số mặt hàng', type: 'number', width: 100, sum: true, title: 'Số mặt hàng gắn đúng nhóm này (không cộng nhóm con)' },
    { key: 'isActive', header: 'Theo dõi', type: 'check', width: 70 },
  ];
  const editable = Boolean(mode);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));
  const canDelete = node && !(ix.kids.get(node.code)?.length) && node.products === 0;

  return (
    <>
      <PageHeader title="Nhóm hàng" code="DM11" helpKey="nhom-hang" subtitle="Cây nhóm hàng — mã hàng ghép từ mã ngắn các cấp; báo cáo theo mã hàng chọn được nhóm trên cây này" />
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px' }}>
          {canWrite && <button className="btn btn-sm" disabled={editable} title="Thêm nhóm con dưới nhóm đang chọn (đang ở gốc: thêm nhóm cấp 1)" onClick={() => { setF(suggest(sel)); setMode('add'); setMsg(null); }}><Plus size={14} /> Thêm</button>}
          {canWrite && <button className="btn btn-sm" disabled={editable || !node} onClick={() => { setF(shown); setMode('edit'); setMsg(null); }}><Pencil size={14} /> Sửa</button>}
          {canWrite && <button className="btn btn-sm" disabled={editable || !canDelete || del.isPending} title={node && !canDelete ? 'Nhóm còn nhóm con hoặc mặt hàng: không xoá được — bấm Sửa, bỏ tích Đang dùng để ngừng' : 'Xoá nhóm chưa có nhóm con, chưa gắn mặt hàng'}
            onClick={() => node && window.confirm(`Xoá nhóm ${node.code} - ${node.name}?`) && del.mutate(node)}><Trash2 size={14} /> Xoá</button>}
          {canWrite && <button className="btn btn-sm btn-primary" disabled={!editable || Boolean(problem) || save.isPending} title={problem} onClick={() => save.mutate()}><Check size={14} /> Ghi</button>}
          <button className="btn btn-sm" disabled={editable} onClick={() => void q.refetch()}><RefreshCw size={14} /> Nạp</button>
          {canWrite && <button className="btn btn-sm" disabled={!editable} onClick={() => setMode(null)}><Undo2 size={14} /> Hoãn</button>}
          <button className="btn btn-sm" onClick={() => exportRef.current?.()}><FileDown size={14} /> Xuất</button>
          {canWrite && <><span className="spacer" style={{ flex: 1 }} /><button className="btn btn-sm btn-ghost" disabled={editable || infer.isPending} title="Nhóm chưa có mã ngắn: lấy theo mã hàng đang có trong nhóm" onClick={() => infer.mutate()}><Wand2 size={14} /> Điền mã ngắn còn thiếu</button></>}
        </div>
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: 12, padding: '0 12px 12px' }}>
            <div>
              <div style={{ fontWeight: 700, margin: '2px 0 6px' }}>Danh mục nhóm hàng</div>
              <CayNhomHang list={q.data} selected={sel} onSelect={(c) => { if (editable) return; setSel(c); setLevel(null); setMsg(null); }} height="calc(100vh - 250px)" />
            </div>
            <div style={{ minWidth: 0 }}>
              <fieldset className="fgroup" style={{ marginTop: 0 }}>
                <legend>{mode === 'add' ? `Thêm nhóm cấp ${lv}` : mode === 'edit' ? `Sửa nhóm cấp ${lv}` : node ? `Nhóm cấp ${lv}` : 'Chọn một nhóm trên cây'}</legend>
                <Field label="Mã nhóm hàng (*)"><input className="input mono" value={shown.code} readOnly={mode !== 'add'} onChange={(e) => set({ code: e.target.value.trim() })} /></Field>
                <Field label="Mã ngắn (mã ghép)" hint={len ? `${len} ký tự` : lv > 3 ? 'Cấp này không ghép vào mã hàng' : undefined}>
                  <input className="input mono" value={shown.skuCode} readOnly={!editable} maxLength={len || 20} onChange={(e) => set({ skuCode: e.target.value.trim().toUpperCase() })} />
                </Field>
                <Field label="Tên nhóm hàng (*)"><input className="input" value={shown.name} readOnly={!editable} autoFocus={editable} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label="Đầu mã hàng"><input className="input mono" readOnly value={prefix ? `${prefix}…` : ''} title="Mã hàng của nhóm bắt đầu bằng" /></Field>
                <Field label="Thuộc nhóm" full>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input className="input" readOnly value={shown.parentCode ? ix.path(shown.parentCode) : node || mode ? 'Nhóm hàng (cấp 1)' : ''} style={{ flex: 1 }} />
                    {mode === 'edit' && <button type="button" className="btn btn-sm" title="Chuyển sang nhóm khác" onClick={() => setMoving(true)}><Search size={14} /></button>}
                  </div>
                </Field>
                <Field label=" "><label className="checkbox"><input type="checkbox" checked={shown.isActive} disabled={!editable} onChange={(e) => set({ isActive: e.target.checked })} /> Đang dùng</label></Field>
                {editable && problem && <div className="muted full" style={{ color: '#b45309' }}>{problem}</div>}
              </fieldset>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '8px 0 4px' }}>
                <b style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</b>
                <select className="select input" style={{ width: 220, height: 28, fontSize: 12.5 }} value={level === null ? '' : String(level)} onChange={(e) => setLevel(e.target.value === '' ? null : e.target.value === 'all' ? 'all' : Number(e.target.value))}>
                  <option value="">Xem: nhóm con của nhóm đang chọn</option>
                  {[1, 2, 3, 4, 5].map((l) => <option key={l} value={l}>Xem toàn bộ nhóm cấp {l}</option>)}
                  <option value="all">Xem tất cả</option>
                </select>
              </div>
              <DataGrid storageKey="dm11-v3" exportName="nhom-hang" exportRef={exportRef} rows={rows} rowKey={(c) => c.code} columns={cols} footerLabel="Tổng"
                onRowDoubleClick={(c) => { if (!editable) { setSel(c.code); setLevel(null); } }} rowClassName={(c) => (c.isActive ? '' : 'muted')}
                emptyText={sel ? 'Nhóm này chưa có nhóm con — bấm Thêm để thêm' : 'Chưa có nhóm hàng — bấm Thêm để thêm nhóm cấp 1'} />
            </div>
          </div>
        )}
      </div>
      {moving && node && (
        <ChuyenNhom list={q.data ?? []} self={node.code} current={f.parentCode} onClose={() => setMoving(false)}
          onPick={(p) => { set({ parentCode: p, skuCode: ix.level(p) + 1 === lv ? f.skuCode : '' }); setMoving(false); }} />
      )}
    </>
  );
}

/** Chọn nhóm cha mới (không chọn được chính nó và nhánh con của nó). */
function ChuyenNhom({ list, self, current, onClose, onPick }: { list: NhomHang[]; self: string; current: string | null; onClose: () => void; onPick: (code: string | null) => void }) {
  const ix = useMemo(() => indexNhom(list), [list]);
  const banned = useMemo(() => ix.subtree(self), [ix, self]);
  const [pick, setPick] = useState<string | null>(current);
  return (
    <Modal title="Chuyển sang nhóm" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={pick !== null && banned.has(pick)} onClick={() => onPick(pick)}>Chọn</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <div className="full">
        <CayNhomHang list={list.filter((c) => !banned.has(c.code))} selected={pick} onSelect={setPick} height={420} />
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Chọn "Nhóm hàng" (gốc) để thành nhóm cấp 1. Đổi cấp thì mã ngắn phải nhập lại theo cấp mới; mã hàng đã có không đổi.</div>
      </div>
    </Modal>
  );
}
