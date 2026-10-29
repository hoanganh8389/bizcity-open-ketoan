/**
 * Lý do – tài khoản (ACC18): lý do nghiệp vụ và tài khoản: tài khoản ngầm định (đối ứng), mã VAT ra / vào,
 * tài khoản nhập khẩu, khoản mục, tài khoản doanh thu, chi phí riêng, mã lưu chuyển tiền tệ, module.
 * Sửa thẳng trên lưới: bấm đúp vào ô (tên, tài khoản, mã VAT, khoản mục, mã LCTT), dòng đã sửa tô vàng, bấm Ghi để lưu.
 * Thanh nút Ghi · Huỷ thay đổi · Thêm · Sửa (form đủ tuỳ chọn) · Xoá · Nạp · Xuất, Tìm file excel để nhập, Tạo mẫu nhập liệu.
 * Các giá trị VAT, nhập khẩu, khoản mục lưu trong flags (vatOut, vatIn, importVatAccount, importDutyAccount,
 * importVatDebitAccount, costItem); khoản mục được gắn vào mọi dòng bút toán của chứng từ mang lý do.
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { ExcelImport, type ImportResult } from '@/components/ExcelImport';
import { AccountPicker, ListPicker, useAccountList } from '@/components/pickers';
import { Save, Undo2 } from 'lucide-react';

interface Reason { code: string; name: string; kind: string; counterAccount: string | null; revenueAccount: string | null; expenseAccount: string | null; cashflowCode: string | null; flags: Record<string, unknown>; isActive: boolean }
interface TaxCode { code: string; name: string; direction: string }
interface Dim { code: string; name: string; isActive: boolean }
/** Module của lý do (loại chứng từ dùng lý do). */
const MODULE: Record<string, string> = {
  out: 'Hóa đơn bán buôn(lẻ)/ Hàng mua trả lại',
  in: 'Phiếu nhập kho/ Hàng bán trả lại',
  payment: 'Phiếu chi/ Trả tiền nhà cung cấp',
  receipt: 'Phiếu thu/ Thu tiền khách hàng',
};
const DOC_DEFAULT: Record<string, string> = { sale: 'Hoá đơn bán hàng', sale_return: 'Hàng bán trả lại', receipt: 'Phiếu thu' };
const flag = (r: Reason, k: string) => (r.flags?.[k] ? String(r.flags[k]) : '');

const COLUMNS: Column<Reason>[] = [
  { key: 'name', header: 'Lý do', width: 240 },
  { key: 'code', header: 'Mã lý do', type: 'code', width: 100 },
  { key: 'counterAccount', header: 'Tài khoản ngầm định', type: 'code', width: 140 },
  { key: 'vatOut', header: 'Mã VAT ra', type: 'code', width: 100, value: (r) => flag(r, 'vatOut') },
  { key: 'vatIn', header: 'Mã VAT vào', type: 'code', width: 100, value: (r) => flag(r, 'vatIn') },
  { key: 'importVatAccount', header: 'Tài khoản VAT nhập khẩu', type: 'code', width: 160, value: (r) => flag(r, 'importVatAccount') },
  { key: 'importDutyAccount', header: 'Tài khoản thuế nhập khẩu', type: 'code', width: 160, value: (r) => flag(r, 'importDutyAccount') },
  { key: 'costItem', header: 'Mã khoản mục', type: 'code', width: 110, value: (r) => flag(r, 'costItem') },
  { key: 'importVatDebitAccount', header: 'Tài khoản nợ VAT nhập khẩu', type: 'code', width: 170, value: (r) => flag(r, 'importVatDebitAccount') },
  { key: 'revenueAccount', header: 'Tài khoản doanh thu', type: 'code', width: 130 },
  { key: 'expenseAccount', header: 'Tài khoản chi phí', type: 'code', width: 120 },
  { key: 'cashflowCode', header: 'Mã lưu chuyển tiền tệ', type: 'code', width: 140 },
  { key: 'module', header: 'Thuộc module', width: 260, value: (r) => MODULE[r.kind] ?? r.kind },
  { key: 'default', header: 'Mặc định cho', width: 130, hidden: true, value: (r) => (r.flags?.default ? DOC_DEFAULT[String(r.flags.default)] ?? String(r.flags.default) : '') },
  { key: 'postToLedger', header: 'Ghi sổ', type: 'check', width: 65, hidden: true, value: (r) => r.flags?.postToLedger !== false },
  { key: 'inactive', header: 'Ngừng dùng', type: 'check', width: 85, hidden: true, value: (r) => !r.isActive },
];
/** Cột nhập Excel: tên trường của lý do / flags. */
const FLAG_KEYS = ['vatOut', 'vatIn', 'importVatAccount', 'importDutyAccount', 'costItem', 'importVatDebitAccount'];
const IMPORT_COLS = COLUMNS.filter((c) => !['default', 'postToLedger', 'inactive'].includes(c.key)).map((c) => ({ key: c.key, header: String(c.header) }));
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Ô sửa trên lưới: cột → loại ô. Cột nằm trong flags thì ghi vào flags. */
type EditKey = 'name' | 'counterAccount' | 'vatOut' | 'vatIn' | 'importVatAccount' | 'importDutyAccount' | 'costItem' | 'importVatDebitAccount' | 'revenueAccount' | 'expenseAccount' | 'cashflowCode';
const EDIT: Record<EditKey, 'text' | 'account' | 'taxOut' | 'taxIn' | 'costItem'> = {
  name: 'text', counterAccount: 'account', vatOut: 'taxOut', vatIn: 'taxIn', importVatAccount: 'account', importDutyAccount: 'account', costItem: 'costItem',
  importVatDebitAccount: 'account', revenueAccount: 'account', expenseAccount: 'account', cashflowCode: 'text',
};
const rawOf = (r: Reason, k: EditKey): string => (FLAG_KEYS.includes(k) ? flag(r, k) : String((r as unknown as Record<string, unknown>)[k] ?? ''));
/** Áp các ô đã sửa vào lý do (ô trống = bỏ giá trị). */
function applyEdits(r: Reason, p: Partial<Record<EditKey, string>>): Reason {
  const next: Reason = { ...r, flags: { ...r.flags } };
  for (const [k, raw] of Object.entries(p) as [EditKey, string][]) {
    const v = raw.trim();
    if (FLAG_KEYS.includes(k)) { if (v) next.flags[k] = v; else delete next.flags[k]; }
    else if (k === 'name') next.name = v || r.name;
    else (next as unknown as Record<string, unknown>)[k] = v || null;
  }
  return next;
}

function bodyOf(r: Reason) {
  return { name: r.name, kind: r.kind, counterAccount: r.counterAccount || undefined, revenueAccount: r.revenueAccount || undefined, expenseAccount: r.expenseAccount || undefined, cashflowCode: r.cashflowCode || undefined, flags: r.flags ?? {}, isActive: r.isActive !== false };
}

export function ReasonsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('settings:write');
  const [editing, setEditing] = useState<(Partial<Reason> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<Reason | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const q = useQuery({ queryKey: ['reasons'], queryFn: () => api.get<Reason[]>('/api/v1/posting/reasons') });
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/posting/reasons/${encodeURIComponent(code)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['reasons'] }); } });
  const [changes, setChanges] = useState<Record<string, Partial<Record<EditKey, string>>>>({});
  const [cell, setCell] = useState<{ code: string; key: EditKey } | null>(null);
  const [saved, setSaved] = useState<{ updated: number; errors: string[] } | null>(null);
  const dirty = Object.keys(changes).length;
  const taxes = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 }).data ?? [];
  const costItems = useQuery({ queryKey: ['dimensions', 'cost_item'], queryFn: () => api.get<Dim[]>('/api/v1/dimensions/cost_item'), staleTime: 60_000 }).data ?? [];
  const value = (r: Reason, k: EditKey) => changes[r.code]?.[k] ?? rawOf(r, k);
  const setValue = (r: Reason, k: EditKey, v: string) => setChanges((c) => {
    const next = { ...(c[r.code] ?? {}) };
    if (v.trim() === rawOf(r, k)) delete next[k]; else next[k] = v;
    const out = { ...c };
    if (Object.keys(next).length) out[r.code] = next; else delete out[r.code];
    return out;
  });
  const saveGrid = useMutation({
    mutationFn: async () => {
      const have = new Map((q.data ?? []).map((r) => [r.code, r]));
      const out = { updated: 0, errors: [] as string[], failed: {} as typeof changes };
      for (const [code, p] of Object.entries(changes)) {
        const cur = have.get(code);
        if (!cur) continue;
        try { await api.put(`/api/v1/posting/reasons/${encodeURIComponent(code)}`, bodyOf(applyEdits(cur, p))); out.updated++; } catch (e) { out.errors.push(`${code}: ${errorText(e)}`); out.failed[code] = p; }
      }
      return out;
    },
    onSuccess: (r) => { setSaved({ updated: r.updated, errors: r.errors }); setChanges(r.failed); void qc.invalidateQueries({ queryKey: ['reasons'] }); },
  });
  const editor = (r: Reason, k: EditKey) => {
    const v = value(r, k);
    const done = (x: string) => { setValue(r, k, x); setCell(null); };
    const keys = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => { if (e.key === 'Enter') done((e.target as HTMLInputElement).value); if (e.key === 'Escape') setCell(null); };
    const t = EDIT[k];
    if (t === 'taxOut' || t === 'taxIn' || t === 'costItem') {
      const items = t === 'costItem' ? costItems.filter((c) => c.isActive || c.code === v).map((c) => ({ code: c.code, name: c.name }))
        : taxes.filter((x) => x.direction === (t === 'taxOut' ? 'output' : 'input')).map((x) => ({ code: x.code, name: x.name }));
      return (
        <select autoFocus className="cell-edit" defaultValue={v} onChange={(e) => done(e.target.value)} onBlur={(e) => done(e.target.value)} onKeyDown={keys}>
          <option value="">(trống)</option>{items.map((i) => <option key={i.code} value={i.code}>{i.code} — {i.name}</option>)}
        </select>
      );
    }
    return <input autoFocus className="cell-edit" list={t === 'account' ? 'acc18-accounts' : undefined} defaultValue={v} onBlur={(e) => done(e.target.value)} onKeyDown={keys} />;
  };
  const accounts = useAccountList().data ?? [];
  const columns: Column<Reason>[] = COLUMNS.map((c) => {
    if (!(c.key in EDIT)) return c;
    const k = c.key as EditKey;
    return {
      ...c, value: (r: Reason) => value(r, k),
      render: (r: Reason) => (cell?.code === r.code && cell.key === k ? editor(r, k) : (
        <span className={`cell-view ${changes[r.code]?.[k] !== undefined ? 'changed' : ''}`} onDoubleClick={(e) => { e.stopPropagation(); if (canWrite) setCell({ code: r.code, key: k }); }} title={canWrite ? 'Bấm đúp để sửa' : undefined}>{value(r, k) || ' '}</span>
      )),
    };
  });

  // Nhập Excel: cập nhật theo mã lý do; ô trống giữ nguyên; mã mới cần tên và module.
  const importRows = async (rows: Record<string, string>[]): Promise<ImportResult> => {
    const have = new Map((q.data ?? []).map((r) => [r.code, r]));
    const res: ImportResult = { updated: 0, skipped: 0, errors: [] };
    for (const x of rows) {
      const cur = have.get(x.code!);
      const kind = x.module ? Object.entries(MODULE).find(([, l]) => fold(l) === fold(x.module!))?.[0] : undefined;
      if (x.module && !kind) { res.errors.push(`${x.code}: module "${x.module}" không đúng`); continue; }
      if (!cur && (!x.name || !kind)) { res.errors.push(`${x.code}: lý do mới cần cột Lý do và Thuộc module`); continue; }
      const next: Reason = cur ? { ...cur, flags: { ...cur.flags } } : { code: x.code!, name: '', kind: kind!, counterAccount: null, revenueAccount: null, expenseAccount: null, cashflowCode: null, flags: {}, isActive: true };
      if (x.name) next.name = x.name;
      if (kind) next.kind = kind;
      if (x.counterAccount) next.counterAccount = x.counterAccount;
      if (x.revenueAccount) next.revenueAccount = x.revenueAccount;
      if (x.expenseAccount) next.expenseAccount = x.expenseAccount;
      if (x.cashflowCode) next.cashflowCode = x.cashflowCode;
      for (const k of FLAG_KEYS) if (x[k]) next.flags[k] = x[k];
      if (cur && JSON.stringify(bodyOf(cur)) === JSON.stringify(bodyOf(next))) { res.skipped!++; continue; }
      try { await api.put(`/api/v1/posting/reasons/${encodeURIComponent(next.code)}`, bodyOf(next)); res.updated++; } catch (e) { res.errors.push(`${x.code}: ${errorText(e)}`); }
    }
    void qc.invalidateQueries({ queryKey: ['reasons'] });
    return res;
  };

  return (
    <>
      <PageHeader title="Lý do – tài khoản" code="ACC18" subtitle="Ưu tiên cao nhất khi chọn tài khoản cho bút toán" helpKey="ly-do" />
      <div className="card">
        <datalist id="acc18-accounts">{accounts.filter((a) => a.isPosting && a.isActive !== false).map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</datalist>
        <div className="catalog-toolbar">
          <button className="btn btn-sm" disabled={!canWrite || !dirty || saveGrid.isPending} onClick={() => saveGrid.mutate()} title="Lưu các ô đã sửa trên lưới"><Save size={14} /> Ghi{dirty ? ` (${dirty})` : ''}</button>
          <button className="btn btn-sm" disabled={!dirty} onClick={() => { if (window.confirm('Bỏ mọi ô đã sửa chưa ghi?')) setChanges({}); }}><Undo2 size={14} /> Huỷ thay đổi</button>
        </div>
        {saved && (
          <div className={`alert ${saved.errors.length ? 'alert-bad' : 'alert-ok'}`} style={{ margin: 8 }}>
            Đã ghi {saved.updated} lý do.{saved.errors.map((e, i) => <div key={i}>{e}</div>)}
            <button className="btn btn-sm btn-ghost" style={{ marginLeft: 8 }} onClick={() => setSaved(null)}>Ẩn</button>
          </div>
        )}
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, kind: sel?.kind ?? 'out', flags: { postToLedger: true }, isActive: true })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá lý do ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
          extra={<ExcelImport columns={IMPORT_COLS} keyColumn="code" disabled={!canWrite} onImport={importRows} onTemplate={() => exportRef.current?.()} />}
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : saveGrid.error ? errorText(saveGrid.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey="acc18-v2"
            exportName="ly-do-tai-khoan"
            groupable
            exportRef={exportRef}
            rows={q.data ?? []}
            rowKey={(r) => r.code}
            onSelect={setSel}
            onRowDoubleClick={(r) => canWrite && !changes[r.code] && setEditing(r)}
            rowClassName={(r) => [changes[r.code] ? 'row-changed' : '', r.isActive ? '' : 'muted'].join(' ')}
            footerLabel={false}
            columns={columns}
          />
        )}
      </div>
      {editing && <ReasonForm value={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function ReasonForm({ value, onClose }: { value: Partial<Reason> & { isNew?: boolean }; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  const set = (p: Partial<Reason>) => setV((x) => ({ ...x, ...p }));
  const flags = v.flags ?? {};
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: () => api.put(`/api/v1/posting/reasons/${encodeURIComponent(v.code ?? '')}`, {
      name: v.name, kind: v.kind, counterAccount: v.counterAccount || undefined, revenueAccount: v.revenueAccount || undefined,
      expenseAccount: v.expenseAccount || undefined, cashflowCode: v.cashflowCode || undefined, flags, isActive: v.isActive !== false,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['reasons'] }); if (value.isNew) onClose(); else viewAgain[1](); },
  });
  const taxes = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 }).data ?? [];
  const costItems = useQuery({ queryKey: ['dimensions', 'cost_item'], queryFn: () => api.get<Dim[]>('/api/v1/dimensions/cost_item'), staleTime: 60_000 }).data ?? [];
  const setFlag = (k: string, val: string) => set({ flags: { ...flags, [k]: val || undefined } });
  const taxItems = (dir: string) => taxes.filter((t) => t.direction === dir).map((t) => ({ code: t.code, name: t.name }));
  return (
    <Modal viewAgain={viewAgain} viewFirst={!value.isNew} wide title="Lý do – tài khoản" onClose={onClose}
      footer={<><button className="btn btn-primary" disabled={save.isPending || !v.code || !v.name} onClick={() => save.mutate()}>Ghi</button><button className="btn" onClick={onClose}>Đóng</button></>}>
      <Field label="Mã lý do (*)"><input className="input mono" value={v.code ?? ''} disabled={!value.isNew} onChange={(e) => set({ code: e.target.value.trim() })} /></Field>
      <Field label="Lý do (*)"><input className="input" value={v.name ?? ''} onChange={(e) => set({ name: e.target.value })} /></Field>
      <Field label="Thuộc module"><select className="select input" value={v.kind} onChange={(e) => set({ kind: e.target.value })}>{Object.entries(MODULE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      <Field label="Tài khoản ngầm định" hint="Đối ứng công nợ / tiền; trống = ngầm định"><AccountPicker postingOnly value={v.counterAccount ?? ''} onChange={(counterAccount) => set({ counterAccount })} placeholder="Ngầm định" /></Field>
      <Field label="Mã VAT ra"><ListPicker items={taxItems('output')} value={flag(v as Reason, 'vatOut')} onChange={(x) => setFlag('vatOut', x)} placeholder="Theo mặt hàng" /></Field>
      <Field label="Mã VAT vào"><ListPicker items={taxItems('input')} value={flag(v as Reason, 'vatIn')} onChange={(x) => setFlag('vatIn', x)} placeholder="Theo mặt hàng" /></Field>
      <Field label="Tài khoản doanh thu" hint="Trống = theo mặt hàng"><AccountPicker postingOnly value={v.revenueAccount ?? ''} onChange={(revenueAccount) => set({ revenueAccount })} placeholder="Theo mặt hàng" /></Field>
      <Field label="Tài khoản chi phí" hint="Giá vốn / chi phí; trống = theo mặt hàng"><AccountPicker postingOnly value={v.expenseAccount ?? ''} onChange={(expenseAccount) => set({ expenseAccount })} placeholder="Theo mặt hàng" /></Field>
      <Field label="Tài khoản VAT nhập khẩu"><AccountPicker postingOnly value={flag(v as Reason, 'importVatAccount')} onChange={(x) => setFlag('importVatAccount', x)} /></Field>
      <Field label="Tài khoản nợ VAT nhập khẩu"><AccountPicker postingOnly value={flag(v as Reason, 'importVatDebitAccount')} onChange={(x) => setFlag('importVatDebitAccount', x)} /></Field>
      <Field label="Tài khoản thuế nhập khẩu"><AccountPicker postingOnly value={flag(v as Reason, 'importDutyAccount')} onChange={(x) => setFlag('importDutyAccount', x)} /></Field>
      <Field label="Mã khoản mục" hint="Gắn vào mọi dòng bút toán"><ListPicker items={costItems.filter((c) => c.isActive || c.code === flag(v as Reason, 'costItem')).map((c) => ({ code: c.code, name: c.name }))} value={flag(v as Reason, 'costItem')} onChange={(x) => setFlag('costItem', x)} /></Field>
      <Field label="Mã lưu chuyển tiền tệ"><input className="input mono" value={v.cashflowCode ?? ''} onChange={(e) => set({ cashflowCode: e.target.value.trim() })} /></Field>
      <Field label=" ">
        <label className="checkbox"><input type="checkbox" checked={flags.postToLedger !== false} onChange={(e) => set({ flags: { ...flags, postToLedger: e.target.checked } })} /> Ghi sổ kế toán</label>
        <label className="checkbox"><input type="checkbox" checked={v.isActive !== false} onChange={(e) => set({ isActive: e.target.checked })} /> Đang dùng</label>
      </Field>
      <Field label="Lý do mặc định cho">
        <select className="select input" value={String(flags.default ?? '')} onChange={(e) => set({ flags: { ...flags, default: e.target.value || undefined } })}>
          <option value="">(không)</option>{Object.entries(DOC_DEFAULT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </Field>
      <Field label="Tuỳ chọn" full>
        <label className="checkbox"><input type="checkbox" checked={Boolean(flags.giftCostToPromotion)} onChange={(e) => set({ flags: { ...flags, giftCostToPromotion: e.target.checked } })} /> Giá vốn hàng tặng ghi vào chi phí khuyến mãi</label>
      </Field>
      <Field label="Tính giá vốn" full hint="Cách hàng mang lý do này được đưa vào công thức giá vốn bình quân tháng (ACC49)">
        <div style={{ display: 'grid', gap: 4 }}>
          <label className="checkbox"><input type="checkbox" checked={Boolean(flags.costAtSalePrice)} onChange={(e) => set({ flags: { ...flags, costAtSalePrice: e.target.checked } })} /> Xuất theo giá trị chứng từ: giá vốn = tiền hàng trên phiếu, trừ khỏi tử và mẫu (xuất bán chi nhánh khác, xuất tặng thưởng)</label>
          <label className="checkbox"><input type="checkbox" checked={Boolean(flags.returnAtOpeningCost)} onChange={(e) => set({ flags: { ...flags, returnAtOpeningCost: e.target.checked } })} /> Hàng trả nhà cung cấp định giá theo tồn đầu (bỏ chọn: lấy thành tiền − thuế trên phiếu)</label>
          <label className="checkbox"><input type="checkbox" checked={Boolean(flags.excludeFromCost)} onChange={(e) => set({ flags: { ...flags, excludeFromCost: e.target.checked } })} /> Nhập điều chỉnh không tính vào đơn giá bình quân</label>
        </div>
      </Field>
      {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
    </Modal>
  );
}
