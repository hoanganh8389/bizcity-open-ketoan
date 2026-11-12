// [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — màn Nhóm hàng (DM11) làm lại gọn: cây trái, form trên, lưới nhóm con dưới; bỏ các thẻ ngành / nhãn / loại (đóng góp)
// [2026-11-12 Nguyễn Văn Thủy] DM11 tối giản: một ô Mã nhóm hàng (ghép vào mã hàng, đúng độ dài theo cấp), bỏ Xoá / Đầu mã hàng,
//   thêm người tạo / sửa, thời gian, thẻ Lịch sử (0116) (đóng góp)
/**
 * NHÓM HÀNG (DM11) — một cây: Nhóm hàng → cấp 1 → cấp 2 → cấp 3.
 *   Thanh nút: Thêm (nhóm con của nhóm đang chọn) · Sửa · Ghi · Hoãn · Nạp · Xuất · Nhập Excel. Không có Xoá: bỏ tích Đang dùng để ngừng.
 *   Form: Thuộc nhóm, Mã nhóm hàng, Tên nhóm hàng, Đang dùng. Mã nội bộ của nhóm tự cấp, không hiện.
 *   Dưới: Nhóm con | Lịch sử.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, FileDown, Pencil, Plus, RefreshCw, Search, Undo2 } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import { CayNhomHang, indexNhom, MA_NGAN_DAI, useNhomHang, type NhomHang } from '@/components/CayNhomHang';
import './lich-su.css';

type Form = { skuCode: string; name: string; parentCode: string | null; isActive: boolean };
const GOI_Y = 'Cấp 1: 2 chữ số, không bắt đầu bằng 0 · Cấp 2: 3 ký tự · Cấp 3: 1 ký tự (cấp 2, 3: chữ hoặc số)';
const luc = (d?: string | null) => (d ? new Date(d).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');

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
  const [f, setF] = useState<Form>({ skuCode: '', name: '', parentCode: null, isActive: true });
  const [tab, setTab] = useState<'con' | 'lich-su'>('con');
  const [moving, setMoving] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const exportRef = useRef<(() => void) | null>(null);

  const shown: Form = mode ? f : node ? { skuCode: node.skuCode ?? '', name: node.name, parentCode: ix.parentOf(node.code), isActive: node.isActive } : { skuCode: '', name: '', parentCode: null, isActive: true };
  const lv = mode ? ix.level(f.parentCode) + 1 : node ? ix.level(node.code) : 0;
  const len = MA_NGAN_DAI[lv];
  const rows = sel ? ix.kids.get(sel) ?? [] : ix.roots;

  /** Gợi ý khi thêm: mã nhóm = số kế tiếp trong các nhóm cùng cha, đủ độ dài của cấp (cấp 1 không bắt đầu bằng 0). */
  const suggest = (parentCode: string | null): Form => {
    const n = MA_NGAN_DAI[ix.level(parentCode) + 1];
    const sib = (parentCode ? ix.kids.get(parentCode) ?? [] : ix.roots).map((c) => c.skuCode ?? '').filter((x) => n && x.length === n && /^\d+$/.test(x)).map(Number);
    const start = ix.level(parentCode) === 0 ? 9 : 0; // cấp 1: từ 10
    const next = n ? String(Math.max(start, ...sib) + 1).padStart(n, '0') : '';
    return { skuCode: n && next.length === n ? next : '', name: '', parentCode, isActive: true };
  };

  /** Lỗi chặn ghi — báo đỏ ngay dưới ô. */
  const loiMa = (() => {
    if (!mode || !len) return '';
    const v = f.skuCode;
    if (!v) return `Nhập mã nhóm cấp ${lv}: ${len} ký tự`;
    if (!/^[A-Z0-9]+$/.test(v)) return 'Mã nhóm chỉ gồm chữ và số';
    if (v.length !== len) return `Mã nhóm cấp ${lv} phải đúng ${len} ký tự (đang ${v.length})`;
    if (lv === 1 && !/^[1-9][0-9]$/.test(v)) return 'Mã nhóm cấp 1 chỉ gồm 2 chữ số, không bắt đầu bằng 0';
    const sib = (f.parentCode ? ix.kids.get(f.parentCode) ?? [] : ix.roots).find((c) => c.code !== (mode === 'edit' ? node?.code : '') && c.skuCode === v);
    if (sib) return `Mã ${v} đã dùng cho nhóm "${sib.name}" cùng cấp`;
    return '';
  })();
  const problem = mode && !f.name.trim() ? 'Nhập tên nhóm hàng' : loiMa;

  const done = (text: string, code?: string | null) => { void qc.invalidateQueries({ queryKey: ['item-classes'] }); void qc.invalidateQueries({ queryKey: ['item-class-history'] }); setMode(null); setMsg({ ok: true, text }); if (code !== undefined) setSel(code); };
  const fail = (e: unknown) => setMsg({ ok: false, text: errorText(e) });
  const save = useMutation({
    mutationFn: async () => {
      // Mã nội bộ của nhóm mới: số lớn nhất + 1 (không hiện ra).
      const nums = (q.data ?? []).map((c) => Number(c.code)).filter((n) => Number.isInteger(n));
      const code = mode === 'add' ? String((nums.length ? Math.max(...nums) : 0) + 1) : node!.code;
      await api.put(`/api/v1/item-classes/group/${encodeURIComponent(code)}${mode === 'add' ? '?new=1' : ''}`,
        { name: f.name.trim(), parentCode: f.parentCode || undefined, isActive: f.isActive, skuCode: f.skuCode });
      return code;
    },
    onSuccess: (code) => done('Đã ghi.', code), onError: fail,
  });

  const cols: Column<NhomHang>[] = [
    { key: 'skuCode', header: 'Mã nhóm hàng', type: 'code', width: 110, title: 'Mã ghép vào đầu mã hàng — cấp 1: 2 ký tự, cấp 2: 3, cấp 3: 1' },
    { key: 'name', header: 'Tên nhóm hàng', width: 260 },
    { key: 'level', header: 'Cấp', type: 'number', width: 55, value: (c) => ix.level(c.code) },
    { key: 'path', header: 'Đường dẫn', width: 340, value: (c) => ix.path(c.code) },
    { key: 'products', header: 'Số mặt hàng', type: 'number', width: 95, sum: true, title: 'Số mặt hàng gắn đúng nhóm này (không cộng nhóm con)' },
    { key: 'isActive', header: 'Đang dùng', type: 'check', width: 75 },
    { key: 'createdBy', header: 'Người tạo', width: 130 },
    { key: 'createdAt', header: 'Lúc tạo', width: 130, value: (c) => luc(c.createdAt) },
    { key: 'updatedBy', header: 'Người sửa', width: 130 },
    { key: 'updatedAt', header: 'Lúc sửa', width: 130, value: (c) => (c.updatedBy ? luc(c.updatedAt) : '') },
  ];
  const editable = Boolean(mode);
  const set = (p: Partial<Form>) => setF((x) => ({ ...x, ...p }));

  return (
    <>
      <PageHeader title="Nhóm hàng" code="DM11" helpKey="nhom-hang" subtitle="Cây nhóm hàng — mã hàng ghép từ mã nhóm cấp 1, 2, 3" />
      <div className="card">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '8px 12px' }}>
          {canWrite && <button className="btn btn-sm" disabled={editable} title="Thêm nhóm con dưới nhóm đang chọn (chưa chọn: thêm nhóm cấp 1)" onClick={() => { setF(suggest(sel)); setMode('add'); setMsg(null); }}><Plus size={14} /> Thêm</button>}
          {canWrite && <button className="btn btn-sm" disabled={editable || !node} onClick={() => { setF(shown); setMode('edit'); setMsg(null); }}><Pencil size={14} /> Sửa</button>}
          {canWrite && <button className="btn btn-sm btn-primary" disabled={!editable || save.isPending} title={problem} onClick={() => (problem ? setMsg({ ok: false, text: problem }) : save.mutate())}><Check size={14} /> Ghi</button>}
          {canWrite && <button className="btn btn-sm" disabled={!editable} onClick={() => setMode(null)}><Undo2 size={14} /> Hoãn</button>}
          <button className="btn btn-sm" disabled={editable} onClick={() => void q.refetch()}><RefreshCw size={14} /> Nạp</button>
          <button className="btn btn-sm" onClick={() => exportRef.current?.()}><FileDown size={14} /> Xuất</button>
          {canWrite && <NutNhapExcel loai={nhapLoai('nhom-hang')!} disabled={editable} />}
        </div>
        {msg && <div className={`alert ${msg.ok ? 'alert-ok' : 'alert-bad'}`} style={{ margin: '0 12px 8px' }}>{msg.text}</div>}
        <ErrorBox error={q.error ? errorText(q.error) : null} />
        {q.isLoading ? <Loading /> : (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 300px) 1fr', gap: 12, padding: '0 12px 12px' }}>
            <div>
              <div style={{ fontWeight: 700, margin: '2px 0 6px' }}>Danh mục nhóm hàng</div>
              <CayNhomHang list={q.data} selected={sel} onSelect={(c) => { if (editable) return; setSel(c); setMsg(null); }} height="calc(100vh - 250px)" />
            </div>
            <div style={{ minWidth: 0 }}>
              <fieldset className="fgroup" style={{ marginTop: 0 }}>
                <legend>{mode === 'add' ? `Thêm nhóm cấp ${lv}` : mode === 'edit' ? `Sửa nhóm cấp ${lv}` : node ? `Nhóm cấp ${lv}` : 'Chọn một nhóm trên cây'}</legend>
                <Field label="Thuộc nhóm" full>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <input className="input" readOnly value={shown.parentCode ? ix.path(shown.parentCode) : node || mode ? 'Nhóm hàng (cấp 1)' : ''} style={{ flex: 1 }} />
                    {mode === 'edit' && <button type="button" className="btn btn-sm" title="Chuyển sang nhóm khác" onClick={() => setMoving(true)}><Search size={14} /></button>}
                  </div>
                </Field>
                <Field label="Mã nhóm hàng (*)" tip={GOI_Y}>
                  <input className="input mono" value={shown.skuCode} readOnly={!editable || !len} maxLength={len || 20} placeholder={len ? `${len} ký tự` : ''}
                    onChange={(e) => set({ skuCode: e.target.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase() })} />
                  {editable && loiMa
                    ? <div className="neg" style={{ fontSize: 12.5, marginTop: 3, fontWeight: 600 }}>{loiMa}</div>
                    : <div className="muted" style={{ fontSize: 12, marginTop: 3 }}>{lv > 3 ? 'Cấp 4 trở đi không ghép vào mã hàng' : GOI_Y}</div>}
                </Field>
                <Field label="Tên nhóm hàng (*)"><input className="input" value={shown.name} readOnly={!editable} autoFocus={editable} onChange={(e) => set({ name: e.target.value })} /></Field>
                <Field label=" "><label className="checkbox"><input type="checkbox" checked={shown.isActive} disabled={!editable} onChange={(e) => set({ isActive: e.target.checked })} /> Đang dùng</label></Field>
                {!mode && node && (
                  <div className="full muted" style={{ fontSize: 12.5 }}>
                    Tạo: <b>{node.createdBy || '—'}</b>{node.createdAt ? ` lúc ${luc(node.createdAt)}` : ''} · Sửa lần cuối: <b>{node.updatedBy || '—'}</b>{node.updatedBy && node.updatedAt ? ` lúc ${luc(node.updatedAt)}` : ''}
                  </div>
                )}
              </fieldset>
              <div className="tabs" role="tablist" style={{ margin: '8px 0 4px' }}>
                <button role="tab" className={`tab ${tab === 'con' ? 'active' : ''}`} onClick={() => setTab('con')}>{node ? `Nhóm con của "${node.name}"` : 'Nhóm cấp 1'} ({rows.length})</button>
                <button role="tab" className={`tab ${tab === 'lich-su' ? 'active' : ''}`} disabled={!node} onClick={() => setTab('lich-su')}>Lịch sử</button>
              </div>
              {tab === 'lich-su' && node
                ? <LichSuNhom code={node.code} />
                : <DataGrid storageKey="dm11-v4" exportName="nhom-hang" exportRef={exportRef} rows={rows} rowKey={(c) => c.code} columns={cols} footerLabel="Tổng"
                    onRowDoubleClick={(c) => { if (!editable) setSel(c.code); }} rowClassName={(c) => (c.isActive ? '' : 'muted')}
                    emptyText={sel ? 'Nhóm này chưa có nhóm con — bấm Thêm để thêm' : 'Chưa có nhóm hàng — bấm Thêm để thêm nhóm cấp 1'} />}
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

/** Lịch sử thêm / sửa một nhóm: ai, lúc nào, đổi gì. */
function LichSuNhom({ code }: { code: string }) {
  const h = useQuery({ queryKey: ['item-class-history', code], queryFn: () => api.get<{ at: string; by: string; action: string; changes: string }[]>(`/api/v1/item-classes/group/${encodeURIComponent(code)}/history`) });
  if (h.isLoading) return <Loading />;
  if (h.error) return <ErrorBox error={errorText(h.error)} />;
  if (!h.data?.length) return <div className="muted" style={{ padding: 8 }}>Chưa có thay đổi nào được ghi (lịch sử ghi từ 12/11/2026).</div>;
  return (
    <div className="ls-wrap">
      {h.data.map((e, i) => (
        <div key={i} className="ls-row">
          <div className="ls-meta"><span className="ls-time">{luc(e.at)}</span><span className="ls-by">{e.by}</span></div>
          <div className="ls-body"><div className="ls-head">{e.action === 'create' ? 'Thêm mới' : 'Sửa'}</div><ul>{e.changes.split('\n').map((x, j) => <li key={j}>{x}</li>)}</ul></div>
        </div>
      ))}
    </div>
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
        <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Chọn "Nhóm hàng" (gốc) để thành nhóm cấp 1. Đổi cấp thì mã nhóm phải nhập lại theo cấp mới; mã hàng đã có không đổi.</div>
      </div>
    </Modal>
  );
}
