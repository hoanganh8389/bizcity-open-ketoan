/**
 * Bảng giá bán (DM14): một bảng giá công ty + các bảng giá chi nhánh, và chi nhánh nào áp bảng giá nào.
 * Chọn một bảng giá → phần dưới (PriceRowsPanel) là lưới giá mọi mặt hàng × ĐVT, sửa ngay trên ô. Giá cũng sửa được ở
 * form mặt hàng (DM10, thẻ ĐVT & giá bán). Chi nhánh chưa gán bảng giá = theo bảng giá công ty.
 * Luật lấy giá khi bán: hàng chính chỉ lấy giá công ty; hàng thường ưu tiên giá bảng giá chi nhánh, thiếu mới lấy giá công ty.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { useBranches } from '@/components/filters';
import { HelpDrawer } from '@/components/HelpDrawer';
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
  const del = useMutation({
    mutationFn: (code: string) => api.delete(`/api/v1/catalog/price-lists/${encodeURIComponent(code)}`),
    onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['price-lists'] }); },
  });

  const columns: Column<PriceList>[] = [
    { key: 'code', header: 'Mã bảng giá', type: 'code', width: 130 },
    { key: 'name', header: 'Tên bảng giá', width: 260 },
    { key: 'isCompany', header: 'Bảng giá công ty', type: 'check', width: 110 },
    { key: 'branches', header: 'Chi nhánh áp dụng', width: 420, value: (l) => (l.isCompany && !l.branchCodes.length ? '(chi nhánh chưa gán bảng giá)' : l.branchCodes.map((c) => `${c} ${branchName.get(c) ?? ''}`.trim()).join(', ')) },
    { key: 'pricedRows', header: 'Số ô giá', type: 'number', width: 90 },
    { key: 'note', header: 'Ghi chú', width: 200 },
    { key: 'isActive', header: 'Đang dùng', type: 'check', width: 80 },
  ];

  return (
    <>
      <PageHeader title="Bảng giá bán" code="DM14" subtitle="Bảng giá công ty và bảng giá chi nhánh, chi nhánh áp bảng giá nào; chọn một bảng giá để xem và sửa giá từng mặt hàng ở dưới" helpKey="bang-gia" />
      <div className="card">
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, isActive: true, branchCodes: [] })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Xoá bảng giá ${sel.code} - ${sel.name}? Giá đã khai ở bảng giá này bị xoá theo.`)) del.mutate(sel.code); }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
          extra={<><span className="spacer" /><PrintButton screen="DM14" templates={PRICE_LIST_TEMPLATES} disabled={!sel} title="In bảng giá đang chọn (mọi mặt hàng có giá) — mũi tên để chọn mẫu báo giá" getDocs={async () => (sel ? [await loadQuote(qc, sel)] : [])} /></>}
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid storageKey="dm14-v1" exportName="bang-gia" exportRef={exportRef} rows={q.data ?? []} rowKey={(l) => l.code} maxHeight="240px"
            onSelect={setSel} onRowDoubleClick={(l) => canWrite && setEditing(l)} rowClassName={(l) => (l.isActive ? '' : 'muted')} footerLabel={false}
            emptyText="Chưa có bảng giá. Thêm bảng giá công ty trước, rồi các bảng giá chi nhánh." columns={columns} />
        )}
        {unassigned.length > 0 && (
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {unassigned.length} chi nhánh chưa gán bảng giá → bán theo bảng giá công ty: {unassigned.slice(0, 30).map((b) => b.code).join(', ')}{unassigned.length > 30 ? '…' : ''}
          </div>
        )}
      </div>
      {sel ? <PriceRowsPanel key={sel.code} code={sel.code} name={sel.name} canWrite={canWrite} />
        : <div className="card muted" style={{ marginTop: 10 }}>Bấm chọn một bảng giá ở trên để xem / sửa giá từng mặt hàng.</div>}
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
  const shown = branches.filter((b) => (b.isActive || picked.has(b.code)) && (!t || b.code.toLowerCase().includes(t) || b.name.toLowerCase().includes(t)));

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
        <legend>Chi nhánh áp dụng ({picked.size})</legend>
        <div className="full">
          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
            Chi nhánh ở danh mục Chi nhánh (DM02). Website cửa hàng có cùng mã chi nhánh sẽ bán theo bảng giá này; chi nhánh chưa gán bảng giá nào thì theo bảng giá công ty.{' '}
            <button type="button" className="btn btn-xs btn-help" onClick={() => setHelp(true)}>? Hướng dẫn</button>
          </div>
          <div className="row" style={{ gap: 8, marginBottom: 6 }}>
            <input className="input" style={{ flex: 1 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tìm chi nhánh: mã, tên" />
            <button type="button" className="btn btn-sm" onClick={() => set({ branchCodes: [...new Set([...picked, ...shown.map((b) => b.code)])] })}>Chọn hết đang hiện</button>
            <button type="button" className="btn btn-sm" onClick={() => set({ branchCodes: [...picked].filter((c) => !shown.some((b) => b.code === c)) })}>Bỏ hết đang hiện</button>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 4, padding: 6, columns: 2 }}>
            {shown.map((b) => {
              const other = owner.get(b.code);
              return (
                <label key={b.code} className="checkbox" style={{ display: 'flex', gap: 6, padding: '2px 0', breakInside: 'avoid' }}>
                  <input type="checkbox" checked={picked.has(b.code)} onChange={() => toggle(b.code)} />
                  <span><span className="mono">{b.code}</span> {b.name}{other && <span className="muted" style={{ fontSize: 12 }}> · đang ở {other.name}{picked.has(b.code) ? ' (sẽ chuyển sang đây)' : ''}</span>}</span>
                </label>
              );
            })}
            {!shown.length && <div className="muted">Không có chi nhánh</div>}
          </div>
        </div>
      </fieldset>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
      {help && <HelpDrawer guideKey="bang-gia" onClose={() => setHelp(false)} />}
    </Modal>
  );
}
