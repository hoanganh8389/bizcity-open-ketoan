/**
 * Bảng giá bán (DM14): một bảng giá công ty + các bảng giá chi nhánh, và chi nhánh nào áp bảng giá nào.
 * Chọn một bảng giá → phần dưới (PriceRowsPanel) là lưới giá mọi mặt hàng × ĐVT, sửa ngay trên ô. Giá cũng sửa được ở
 * form mặt hàng (DM10, thẻ ĐVT & giá bán). Chi nhánh chưa gán bảng giá = theo bảng giá công ty.
 * Luật lấy giá khi bán: hàng chính chỉ lấy giá công ty; hàng thường ưu tiên giá bảng giá chi nhánh, thiếu mới lấy giá công ty.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { useBranches } from '@/components/filters';
import { HelpDrawer } from '@/components/HelpDrawer';
import { CayDonVi } from '@/components/CayDonVi';
import { useOrgTree } from '@/lib/orgUnits';
import { PriceRowsPanel } from './PriceRowsPanel';
import { PrintButton } from '@/components/print';
import { PRICE_LIST_TEMPLATES, loadQuote } from './priceListPrint';

interface PriceList { code: string; name: string; isCompany: boolean; isActive: boolean; note: string; branchCodes: string[]; pricedRows: number }
type Editing = Partial<PriceList> & { isNew?: boolean };

export function PriceListsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [sel, setSel] = useState<PriceList | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const q = useQuery({ queryKey: ['price-lists'], queryFn: () => api.get<PriceList[]>('/api/v1/catalog/price-lists') });
  const branches = useBranches().data ?? [];
  const branchName = useMemo(() => new Map(branches.map((b) => [b.code, b.name])), [branches]);
  const unassigned = useMemo(() => {
    const has = new Set((q.data ?? []).flatMap((l) => l.branchCodes));
    return branches.filter((b) => b.isActive && !has.has(b.code));
  }, [q.data, branches]);
  const shown = sel ?? (q.data ?? []).find((l) => l.isCompany && l.isActive) ?? q.data?.[0] ?? null;
  const del = useMutation({
    mutationFn: (code: string) => api.delete(`/api/v1/catalog/price-lists/${encodeURIComponent(code)}`),
    onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['price-lists'] }); },
  });

  const columns: Column<PriceList>[] = [
    { key: 'code', header: 'Mã bảng giá', type: 'code', width: 130 },
    { key: 'name', header: 'Tên bảng giá', width: 260 },
    { key: 'isCompany', header: 'Bảng giá công ty', type: 'check', width: 110 },
    // [2026-11-17 11:32 AM kiennt] DM14 — chi nhánh chưa gán bảng giá hiện luôn ở dòng bảng giá công ty, kèm "(chưa gán)", thay dòng chữ riêng dưới bảng (đóng góp)
    { key: 'branches', header: 'Chi nhánh áp dụng', width: 420, value: (l) => [...l.branchCodes.map((c) => `${c} ${branchName.get(c) ?? ''}`.trim()), ...(l.isCompany ? unassigned.map((b) => `${b.code} (chưa gán)`) : [])].join(', ') },
    { key: 'pricedRows', header: 'Số ô giá', type: 'number', width: 90 },
    { key: 'note', header: 'Ghi chú', width: 200 },
    { key: 'isActive', header: 'Đang dùng', type: 'check', width: 80 },
  ];

  return (
    <>
      <PageHeader title="Bảng giá bán" code="DM14" subtitle="Bảng giá công ty, bảng giá chi nhánh và giá từng mặt hàng" helpKey="bang-gia" />
      <div className="card">
        <CatalogToolbar
          trash={{ catalog: 'price-lists', title: 'Bảng giá', sel: sel ? { key: sel.code, label: sel.name } : null }}
          phai
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, isActive: true, branchCodes: [] })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Xoá bảng giá ${sel.code} - ${sel.name}? Giá đã khai ở bảng giá này bị xoá theo.`)) del.mutate(sel.code); }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
          extra={<><PrintButton screen="DM14" label="In bảng giá" templates={PRICE_LIST_TEMPLATES} disabled={!sel} title="In bảng giá đang chọn (mọi mặt hàng có giá) — mũi tên để chọn mẫu báo giá" getDocs={async () => (sel ? [await loadQuote(qc, sel)] : [])} /></>}
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid storageKey="dm14-v1" exportName="bang-gia" exportRef={exportRef} rows={q.data ?? []} rowKey={(l) => l.code} maxHeight="240px"
            onSelect={setSel} onRowDoubleClick={(l) => canWrite && setEditing(l)} rowClassName={(l) => (l.isActive ? '' : 'muted')} footerLabel={false}
            emptyText="Chưa có bảng giá. Thêm bảng giá công ty trước, rồi các bảng giá chi nhánh." columns={columns} />
        )}
      </div>
      {/* [2026-11-17 11:32 AM kiennt] DM14 — chưa chọn dòng nào thì hiện giá của bảng giá công ty (thay ô "Bấm chọn một bảng giá…") (đóng góp) */}
      {shown && <PriceRowsPanel key={shown.code} code={shown.code} name={shown.name} canWrite={canWrite} />}
      {editing && <PriceListForm value={editing} lists={q.data ?? []} onClose={() => setEditing(null)} />}
    </>
  );
}

function PriceListForm({ value, lists, onClose }: { value: Editing; lists: PriceList[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState<Editing>(value);
  const [text, setText] = useState('');
  const [help, setHelp] = useState(false);
  const branches = useBranches().data ?? [];
  const set = (p: Partial<Editing>) => setV((x) => ({ ...x, ...p }));
  // Chi nhánh đang áp bảng giá khác — gán sang đây thì rời bảng giá cũ (mỗi chi nhánh một bảng giá).
  const owner = useMemo(() => {
    const m = new Map<string, PriceList>();
    lists.filter((l) => l.code !== value.code).forEach((l) => l.branchCodes.forEach((b) => m.set(b, l)));
    return m;
  }, [lists, value.code]);
  const picked = new Set(v.branchCodes ?? []);
  const toggle = (code: string) => set({ branchCodes: picked.has(code) ? [...picked].filter((c) => c !== code) : [...picked, code] });
  const t = text.trim().toLowerCase();
  // [2026-11-17 11:37 AM kiennt] DM14 — chọn chi nhánh theo cây sơ đồ tổ chức (tích một nhóm = cả nhóm); chi nhánh chưa gắn sơ đồ tích ở danh sách dưới cây;
  // đơn vị chưa có sơ đồ tổ chức thì danh sách phẳng như cũ (đóng góp)
  const org = useOrgTree();
  const coCay = Boolean(org.data?.nodes.length);
  const trongCay = useMemo(() => new Set((org.data?.branches ?? []).filter((b) => b.orgCode).map((b) => b.code)), [org.data]);
  // [2026-11-17 11:43 AM kiennt] DM14 — chưa có sơ đồ tổ chức: cây theo phân cấp kho tổng → cửa hàng (MH15, GET /stock/hierarchy); lỗi / không quyền thì danh sách phẳng (đóng góp)
  const phanCap = useQuery({ queryKey: ['stock-hierarchy'], enabled: org.isSuccess && !coCay, retry: false, staleTime: 60_000,
    queryFn: () => api.get<{ branches: { code: string; name: string; level: string; parentCode: string | null; isActive: boolean }[] }>('/api/v1/stock/hierarchy') });
  const nhomPhanCap = useMemo(() => {
    const ds = (phanCap.data?.branches ?? []).filter((b) => b.isActive || picked.has(b.code));
    if (!ds.some((b) => b.level === 'branch')) return null;
    const nhom = ds.filter((b) => b.level === 'branch').map((p) => ({ key: p.code, label: `${p.code} ${p.name}`, items: [p, ...ds.filter((c) => c.level === 'shop' && c.parentCode === p.code)] }));
    const xep = new Set(nhom.flatMap((g) => g.items.map((x) => x.code)));
    const con = ds.filter((b) => !xep.has(b.code));
    return con.length ? [...nhom, { key: '', label: 'Chưa xếp', items: con }] : nhom;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phanCap.data, v.branchCodes]);
  const shown = branches.filter((b) => (b.isActive || picked.has(b.code)) && (!coCay || !trongCay.has(b.code)) && (!t || b.code.toLowerCase().includes(t) || b.name.toLowerCase().includes(t)));
  const chuyenSang = [...picked].filter((c) => owner.has(c));

  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: async () => {
      const code = (v.code ?? '').trim();
      await api.put(`/api/v1/catalog/price-lists/${encodeURIComponent(code)}`, { name: v.name ?? '', isCompany: v.isCompany ?? false, isActive: v.isActive ?? true, note: v.note ?? '' });
      await api.put(`/api/v1/catalog/price-lists/${encodeURIComponent(code)}/branches`, { branchCodes: [...picked] });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['price-lists'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });

  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} wide title="Bảng giá bán" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code?.trim() || !v.name?.trim()} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Thoát</button></>}>
      <fieldset className="fgroup">
        <legend>Bảng giá</legend>
        <Field label="Mã bảng giá (*)"><input className="input mono" value={v.code ?? ''} disabled={!value.isNew} onChange={(e) => set({ code: e.target.value.trim() })} autoFocus /></Field>
        <Field label="Tên bảng giá (*)"><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
        <Field label=" " hint="Chỉ một bảng giá công ty; tích ở đây thì bảng giá công ty cũ thành bảng giá thường">
          <label className="checkbox"><input type="checkbox" checked={v.isCompany ?? false} onChange={(e) => set({ isCompany: e.target.checked })} /> Bảng giá công ty</label>
        </Field>
        <Field label=" "><label className="checkbox"><input type="checkbox" checked={v.isActive ?? true} onChange={(e) => set({ isActive: e.target.checked })} /> Đang dùng</label></Field>
        <Field label="Ghi chú" full><input className="input" value={v.note ?? ''} onChange={(e) => set({ note: e.target.value })} /></Field>
      </fieldset>
      <fieldset className="fgroup">
        <legend>Chi nhánh áp dụng ({picked.size}) <button type="button" className="btn btn-xs btn-help" data-view-ok onClick={() => setHelp(true)}>? Hướng dẫn</button></legend>
        <div className="full">
          {coCay && <CayDonVi tree={org.data} showBranches checkable picked={[...picked]} onPick={(b) => set({ branchCodes: b })} height={300} openLevel={2} />}
          {!coCay && nhomPhanCap && <CayPhanCap nhom={nhomPhanCap} picked={picked} onChange={(codes) => set({ branchCodes: codes })} />}
          {((!coCay && !nhomPhanCap) || (coCay && (shown.length > 0 || t))) && <>
            {coCay && <div className="muted" style={{ fontSize: 12, margin: '8px 0 4px' }}>Chưa gắn sơ đồ tổ chức</div>}
            {(!coCay || branches.length > 12) && (
              <div className="row" style={{ gap: 8, marginBottom: 6 }}>
                <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tìm chi nhánh: mã, tên" />
                <button type="button" className="btn btn-sm" onClick={() => set({ branchCodes: [...new Set([...picked, ...shown.map((b) => b.code)])] })}>Chọn hết đang hiện</button>
                <button type="button" className="btn btn-sm" onClick={() => set({ branchCodes: [...picked].filter((c) => !shown.some((b) => b.code === c)) })}>Bỏ hết đang hiện</button>
              </div>
            )}
            <div style={{ maxHeight: coCay ? 140 : 300, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 4, padding: 6, columns: 2 }}>
              {shown.map((b) => (
                <label key={b.code} className="checkbox" style={{ display: 'flex', gap: 6, padding: '2px 0', breakInside: 'avoid' }}>
                  <input type="checkbox" checked={picked.has(b.code)} onChange={() => toggle(b.code)} />
                  <span><span className="mono">{b.code}</span> {b.name}</span>
                </label>
              ))}
              {!shown.length && <div className="muted">Không có chi nhánh</div>}
            </div>
          </>}
          {chuyenSang.length > 0 && (
            <div className="muted" style={{ fontSize: 12, marginTop: 6 }} title="Mỗi chi nhánh một bảng giá: ghi xong các chi nhánh này rời bảng giá cũ">
              Chuyển từ bảng giá khác sang đây: {chuyenSang.map((c) => `${c} (${owner.get(c)!.name})`).join(', ')}
            </div>
          )}
        </div>
      </fieldset>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
      {help && <HelpDrawer guideKey="bang-gia" onClose={() => setHelp(false)} />}
    </Modal>
  );
}

// [2026-11-17 11:43 AM kiennt] DM14 — cây chọn chi nhánh theo phân cấp kho tổng → cửa hàng: tích nhóm = chọn cả nhóm, ô gạch ngang = chọn một phần (đóng góp)
type NhomCN = { key: string; label: string; items: { code: string; name: string }[] };
function OTich({ state, onChange }: { state: 'on' | 'off' | 'some'; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'some'; }, [state]);
  return <input ref={ref} type="checkbox" checked={state === 'on'} onChange={onChange} />;
}
function CayPhanCap({ nhom, picked, onChange }: { nhom: NhomCN[]; picked: Set<string>; onChange: (codes: string[]) => void }) {
  const [dong, setDong] = useState<Set<string>>(new Set());
  const trangThai = (g: NhomCN) => { const n = g.items.filter((x) => picked.has(x.code)).length; return n === 0 ? 'off' : n === g.items.length ? 'on' : 'some'; };
  const tichNhom = (g: NhomCN) => {
    const on = trangThai(g) !== 'on';
    const s = new Set(picked);
    for (const x of g.items) { if (on) s.add(x.code); else s.delete(x.code); }
    onChange([...s]);
  };
  const tich = (code: string) => { const s = new Set(picked); if (s.has(code)) s.delete(code); else s.add(code); onChange([...s]); };
  const tatCa = nhom.flatMap((g) => g.items);
  const ttTatCa = tatCa.every((x) => picked.has(x.code)) ? 'on' : tatCa.some((x) => picked.has(x.code)) ? 'some' : 'off';
  // [2026-11-17 11:57 AM kiennt] DM14 — cây dễ nhìn: mỗi cấp một dòng, thụt lề + đường nối dọc, dòng nhóm có nền, kho tổng có nhãn (đóng góp)
  const dong1: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, minHeight: 26 };
  return (
    <div style={{ maxHeight: 320, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 4, padding: '4px 8px' }}>
      <label className="checkbox" style={{ ...dong1, fontWeight: 600 }}>
        <OTich state={ttTatCa} onChange={() => onChange(ttTatCa === 'on' ? [...picked].filter((c) => !tatCa.some((x) => x.code === c)) : [...new Set([...picked, ...tatCa.map((x) => x.code)])])} /> Tất cả chi nhánh
      </label>
      <div style={{ marginLeft: 7, paddingLeft: 12, borderLeft: '1px solid var(--line)' }}>
        {nhom.map((g) => (
          <div key={g.key || '_'}>
            <div style={{ ...dong1, background: 'var(--surface-2, #f3f6fa)', borderRadius: 4, padding: '0 6px', margin: '2px 0' }}>
              <button type="button" className="btn btn-xs btn-ghost" style={{ width: 18, height: 18, padding: 0, lineHeight: 1 }} title={dong.has(g.key) ? 'Mở nhóm' : 'Thu nhóm'}
                onClick={() => setDong((s) => { const n = new Set(s); if (n.has(g.key)) n.delete(g.key); else n.add(g.key); return n; })}>{dong.has(g.key) ? '▸' : '▾'}</button>
              <label className="checkbox" style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                <OTich state={trangThai(g)} onChange={() => tichNhom(g)} /> {g.label}
              </label>
              <span className="muted" style={{ fontSize: 12 }}>{g.items.filter((x) => picked.has(x.code)).length}/{g.items.length}</span>
            </div>
            {!dong.has(g.key) && (
              <div style={{ marginLeft: 15, paddingLeft: 14, borderLeft: '1px dashed var(--line)' }}>
                {g.items.map((x) => (
                  <label key={x.code} className="checkbox" style={dong1}>
                    <input type="checkbox" checked={picked.has(x.code)} onChange={() => tich(x.code)} />
                    <span><span className="mono">{x.code}</span> {x.name}{x.code === g.key && <span className="muted" style={{ fontSize: 12 }}> · kho tổng</span>}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

