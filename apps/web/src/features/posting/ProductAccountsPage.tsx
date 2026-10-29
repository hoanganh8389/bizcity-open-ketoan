/**
 * Mặt hàng – tài khoản (ACC17).
 *  - Trái: cây nhóm hàng; bấm một nhóm để xem mặt hàng của nhóm và các nhóm con.
 *  - Phải: lưới Mã hàng · Tên hàng · Ghi chú · TK kho · TK giá vốn · TK doanh thu · TK chiết khấu · TK hàng bán trả lại ·
 *    Mã VAT ra · Thuế TTĐB · Mã VAT vào. Bấm đúp vào ô để sửa ngay trên lưới; dòng đã sửa tô màu; bấm Ghi để lưu.
 *  - "Gán cùng giá trị": đặt một cột cho mọi dòng đang hiện (sau khi lọc ở hàng lọc của lưới).
 *  - Nhập Excel theo tiêu đề cột; "Tạo mẫu nhập liệu" = xuất lưới đang xem.
 *  - Thẻ "Nhóm hạch toán": các bộ tài khoản. Sửa tài khoản của mặt hàng thì phần mềm gán mặt hàng sang nhóm có
 *    đúng bộ tài khoản đó (chưa có thì tự tạo nhóm NHT-Txxx), nên bộ định khoản luôn đọc theo nhóm.
 */
import { useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Copy, RefreshCw, Save, Undo2 } from 'lucide-react';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Loading, Modal, Field } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ExcelImport, type ImportResult } from '@/components/ExcelImport';
import { plain, useAccountList } from '@/components/pickers';
import { GroupsPanel } from './GroupsPage';

interface Item {
  sku: string; name: string; unit: string; note: string; exciseRate: number | null; postingGroupCode: string | null; effectiveGroup: string | null;
  taxOutCode: string | null; taxInCode: string | null; groupCode: string | null; isActive: boolean;
  inventoryAccount: string | null; cogsAccount: string | null; revenueAccount: string | null; discountAccount: string | null; salesReturnAccount: string | null;
}
interface ItemClass { code: string; name: string; parentCode: string | null; products: number }
interface TaxCode { code: string; name: string; direction: string; isActive: boolean }
type EditKey = 'note' | 'inventoryAccount' | 'cogsAccount' | 'revenueAccount' | 'discountAccount' | 'salesReturnAccount' | 'taxOutCode' | 'exciseRate' | 'taxInCode';
type Patch = Partial<Record<EditKey, string>>;

const EDIT_COLS: { key: EditKey; header: string; width: number; kind: 'text' | 'account' | 'taxOut' | 'taxIn' | 'number' }[] = [
  { key: 'note', header: 'Ghi chú', width: 170, kind: 'text' },
  { key: 'inventoryAccount', header: 'TK kho', width: 85, kind: 'account' },
  { key: 'cogsAccount', header: 'TK giá vốn', width: 90, kind: 'account' },
  { key: 'revenueAccount', header: 'TK doanh thu', width: 100, kind: 'account' },
  { key: 'discountAccount', header: 'TK chiết khấu', width: 100, kind: 'account' },
  { key: 'salesReturnAccount', header: 'TK hàng bán trả lại', width: 130, kind: 'account' },
  { key: 'taxOutCode', header: 'Mã VAT ra', width: 90, kind: 'taxOut' },
  { key: 'exciseRate', header: 'Thuế TTĐB', width: 85, kind: 'number' },
  { key: 'taxInCode', header: 'Mã VAT vào', width: 95, kind: 'taxIn' },
];
const raw = (it: Item, k: EditKey): string => (k === 'exciseRate' ? (it.exciseRate === null ? '' : String(it.exciseRate)) : String(it[k] ?? ''));

export function ProductAccountsPage() {
  const [tab, setTab] = useState<'items' | 'groups'>('items');
  return (
    <>
      <PageHeader title="Mặt hàng – tài khoản" code="ACC17" subtitle="Tài khoản kho, giá vốn, doanh thu, chiết khấu, hàng bán trả lại và loại thuế của từng mặt hàng" helpKey="nhom-hach-toan" />
      <div className="tabs" role="tablist" style={{ marginBottom: 8 }}>
        <button role="tab" className={`tab ${tab === 'items' ? 'active' : ''}`} onClick={() => setTab('items')}>Mặt hàng – tài khoản</button>
        <button role="tab" className={`tab ${tab === 'groups' ? 'active' : ''}`} onClick={() => setTab('groups')}>Nhóm hạch toán</button>
      </div>
      {tab === 'items' ? <ItemsPanel /> : <GroupsPanel />}
    </>
  );
}

function ItemsPanel() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('settings:write');
  const [group, setGroup] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [changes, setChanges] = useState<Record<string, Patch>>({});
  const [editing, setEditing] = useState<{ sku: string; key: EditKey } | null>(null);
  const [bulk, setBulk] = useState(false);
  const [result, setResult] = useState<{ updated: number; createdGroups: string[]; errors: string[] } | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const viewRef = useRef<Item[]>([]);

  const classes = useQuery({ queryKey: ['item-classes', 'group'], queryFn: () => api.get<ItemClass[]>('/api/v1/item-classes/group'), staleTime: 300_000 });
  const taxes = useQuery({ queryKey: ['tax-codes'], queryFn: () => api.get<TaxCode[]>('/api/v1/tax-codes'), staleTime: 60_000 }).data ?? [];
  const accounts = useAccountList().data ?? [];
  const q = useQuery({
    queryKey: ['product-accounts', group, applied],
    queryFn: () => api.getPage<Item[]>('/api/v1/product-accounts', { group: group ?? undefined, search: applied || undefined }),
  });
  const items = q.data?.data ?? [];
  const dirty = Object.keys(changes).length;

  const value = (it: Item, k: EditKey) => changes[it.sku]?.[k] ?? raw(it, k);
  const setCell = (it: Item, k: EditKey, v: string) => setChanges((c) => {
    const next = { ...(c[it.sku] ?? {}) };
    if (v === raw(it, k)) delete next[k]; else next[k] = v;
    const out = { ...c };
    if (Object.keys(next).length) out[it.sku] = next; else delete out[it.sku];
    return out;
  });

  const save = useMutation({
    mutationFn: async (list: Record<string, Patch>) => {
      const body = Object.entries(list).map(([sku, p]) => {
        const x: Record<string, unknown> = { sku };
        for (const [k, v] of Object.entries(p)) {
          if (k === 'exciseRate') x.exciseRate = v === '' ? null : Number(v.replace(',', '.'));
          else if (k === 'note') x.note = v;
          else x[k] = v === '' ? null : v.trim();
        }
        return x;
      });
      const out = { updated: 0, createdGroups: [] as string[], errors: [] as string[] };
      for (let i = 0; i < body.length; i += 5000) {
        const r = await api.put<{ updated: number; createdGroups: string[]; errors: string[] }>('/api/v1/product-accounts', { items: body.slice(i, i + 5000) });
        out.updated += r.updated; out.createdGroups.push(...r.createdGroups); out.errors.push(...r.errors);
      }
      return out;
    },
    onSuccess: (r, list) => {
      setResult(r);
      // Dòng lỗi giữ lại để sửa tiếp; dòng đã ghi bỏ khỏi danh sách thay đổi.
      const bad = new Set(r.errors.map((e) => e.split(':')[0]!));
      setChanges(Object.fromEntries(Object.entries(list).filter(([sku]) => bad.has(sku))));
      void qc.invalidateQueries({ queryKey: ['product-accounts'] });
      void qc.invalidateQueries({ queryKey: ['groups'] });
    },
  });

  const importRows = async (rows: Record<string, string>[]): Promise<ImportResult> => {
    const list: Record<string, Patch> = {};
    for (const r of rows) {
      const p: Patch = {};
      for (const c of EDIT_COLS) if (r[c.key] !== undefined && r[c.key] !== '') p[c.key] = r[c.key];
      if (Object.keys(p).length) list[r.sku!] = p;
    }
    const r = await save.mutateAsync(list);
    return { updated: r.updated, skipped: rows.length - r.updated - r.errors.length, errors: [...r.errors, ...(r.createdGroups.length ? [`Đã tạo nhóm hạch toán mới: ${r.createdGroups.join(', ')}`] : [])] };
  };

  const accountList = useMemo(() => accounts.filter((a) => a.isPosting && a.isActive !== false), [accounts]);
  const editor = (it: Item, c: (typeof EDIT_COLS)[number]) => {
    const v = value(it, c.key);
    const done = (x: string) => { setCell(it, c.key, x); setEditing(null); };
    const keys = (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => { if (e.key === 'Enter') done((e.target as HTMLInputElement).value); if (e.key === 'Escape') setEditing(null); };
    if (c.kind === 'taxOut' || c.kind === 'taxIn') {
      const dir = c.kind === 'taxOut' ? 'output' : 'input';
      return (
        <select autoFocus className="cell-edit" defaultValue={v} onChange={(e) => done(e.target.value)} onBlur={(e) => done(e.target.value)} onKeyDown={keys}>
          <option value="">(trống)</option>
          {taxes.filter((t) => t.direction === dir && (t.isActive || t.code === v)).map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}
        </select>
      );
    }
    return <input autoFocus className={`cell-edit ${c.kind === 'number' ? 'num' : ''}`} list={c.kind === 'account' ? 'acc17-accounts' : undefined} defaultValue={v} onBlur={(e) => done(e.target.value)} onKeyDown={keys} />;
  };

  const columns: Column<Item>[] = [
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 110 },
    { key: 'name', header: 'Tên hàng', width: 260 },
    ...EDIT_COLS.map((c): Column<Item> => ({
      key: c.key, header: c.header, width: c.width, type: c.kind === 'account' || c.kind === 'taxOut' || c.kind === 'taxIn' ? 'code' : undefined,
      value: (it) => value(it, c.key),
      render: (it) => (editing?.sku === it.sku && editing.key === c.key ? editor(it, c) : (
        <span className={`cell-view ${changes[it.sku]?.[c.key] !== undefined ? 'changed' : ''}`} onDoubleClick={(e) => { e.stopPropagation(); if (canWrite) setEditing({ sku: it.sku, key: c.key }); }} title={canWrite ? 'Bấm đúp để sửa' : undefined}>
          {value(it, c.key) || ' '}
        </span>
      )),
    })),
    { key: 'unit', header: 'ĐVT', width: 70, hidden: true },
    { key: 'effectiveGroup', header: 'Nhóm hạch toán', type: 'code', width: 110, hidden: true },
    { key: 'groupCode', header: 'Nhóm hàng', type: 'code', width: 90, hidden: true },
  ];

  return (
    <div className="acc17">
      <datalist id="acc17-accounts">{accountList.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}</datalist>
      <div className="card acc17-tree">
        <div className="acc17-tree-head">Nhóm hàng</div>
        {classes.isLoading ? <Loading /> : <GroupTree classes={classes.data ?? []} value={group} onChange={(g) => { setGroup(g); setEditing(null); }} />}
      </div>
      <div className="card acc17-main">
        <div className="catalog-toolbar">
          <button className="btn btn-sm" disabled={!canWrite || !dirty || save.isPending} onClick={() => save.mutate(changes)} title="Lưu các ô đã sửa"><Save size={14} /> Ghi{dirty ? ` (${dirty})` : ''}</button>
          <button className="btn btn-sm" disabled={!dirty} onClick={() => { if (window.confirm('Bỏ mọi ô đã sửa chưa ghi?')) setChanges({}); }}><Undo2 size={14} /> Huỷ thay đổi</button>
          <button className="btn btn-sm" disabled={!canWrite || !items.length} onClick={() => setBulk(true)} title="Đặt một cột cho mọi dòng đang hiện"><Copy size={14} /> Gán cùng giá trị</button>
          <button className="btn btn-sm" disabled={q.isFetching} onClick={() => void q.refetch()} title="Nạp lại dữ liệu mới nhất từ máy chủ"><RefreshCw size={14} className={q.isFetching ? 'spin' : undefined} /> {q.isFetching ? 'Đang nạp…' : 'Nạp'}</button>
          <ExcelImport columns={[{ key: 'sku', header: 'Mã hàng' }, ...EDIT_COLS.map((c) => ({ key: c.key, header: c.header }))]} keyColumn="sku" disabled={!canWrite} onImport={importRows} onTemplate={() => exportRef.current?.()} />
          <span className="spacer" />
          <form className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); }}>
            <input className="input" style={{ width: 220, height: 30 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm mã, tên, ghi chú (mọi nhóm)" />
            <button className="btn btn-sm" type="submit">Tìm</button>
          </form>
        </div>
        {result && (
          <div className={`alert ${result.errors.length ? 'alert-bad' : 'alert-ok'}`} style={{ margin: 8 }}>
            Đã ghi {result.updated.toLocaleString('vi-VN')} mặt hàng.{result.createdGroups.length ? ` Tạo nhóm hạch toán mới: ${result.createdGroups.join(', ')}.` : ''}
            {result.errors.length > 0 && <div style={{ maxHeight: 140, overflow: 'auto', marginTop: 4 }}>{result.errors.slice(0, 100).map((e, i) => <div key={i}>{e}</div>)}</div>}
            <button className="btn btn-sm btn-ghost" style={{ marginLeft: 8 }} onClick={() => setResult(null)}>Ẩn</button>
          </div>
        )}
        <ErrorBox error={q.error ? errorText(q.error) : save.error ? errorText(save.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid
            storageKey="acc17-items"
            exportName="mat-hang-tai-khoan"
            groupable
            exportRef={exportRef}
            viewRef={viewRef}
            rows={items}
            rowKey={(it) => it.sku}
            rowClassName={(it) => [changes[it.sku] ? 'row-changed' : '', it.isActive ? '' : 'muted'].join(' ')}
            footerLabel={false}
            note={group ? undefined : 'mọi nhóm hàng'}
            emptyText="Không có mặt hàng nào trong nhóm này"
            columns={columns}
          />
        )}
      </div>
      {bulk && (
        <BulkDialog
          count={viewRef.current.length}
          taxes={taxes}
          onClose={() => setBulk(false)}
          onApply={(k, v) => {
            setChanges((c) => {
              const out = { ...c };
              for (const it of viewRef.current) {
                const next = { ...(out[it.sku] ?? {}) };
                if (v === raw(it, k)) delete next[k]; else next[k] = v;
                if (Object.keys(next).length) out[it.sku] = next; else delete out[it.sku];
              }
              return out;
            });
            setBulk(false);
          }}
        />
      )}
    </div>
  );
}

/** Cây nhóm hàng: bấm để chọn, mũi tên để mở / thu nhóm con (dùng chung cho DM10). */
export function GroupTree({ classes, value, onChange }: { classes: ItemClass[]; value: string | null; onChange: (code: string | null) => void }) {
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [q, setQ] = useState('');
  const children = useMemo(() => {
    const m = new Map<string, ItemClass[]>();
    const codes = new Set(classes.map((c) => c.code));
    for (const c of classes) {
      const p = c.parentCode && codes.has(c.parentCode) && c.parentCode !== c.code ? c.parentCode : '';
      if (!m.has(p)) m.set(p, []);
      m.get(p)!.push(c);
    }
    for (const l of m.values()) l.sort((a, b) => a.name.localeCompare(b.name, 'vi'));
    return m;
  }, [classes]);
  const s = plain(q.trim());
  // Đang tìm: chỉ hiện nhóm khớp (tên / mã, không dấu) và các nhóm cha dẫn tới nó; nhóm khớp hiện cả nhánh con bên dưới.
  const shown = useMemo(() => {
    if (!s) return null;
    const keep = new Set<string>(); // được hiện: nhóm khớp, nhóm cha dẫn tới nó, nhánh con của nó
    const path = new Set<string>(); // nhóm khớp và nhóm cha dẫn tới nó — mở sẵn tới đây
    const visit = (c: ItemClass, seen: Set<string>): boolean => {
      if (seen.has(c.code)) return false; // dữ liệu lỗi có vòng cha – con
      seen.add(c.code);
      const self = plain(c.name).includes(s) || plain(c.code).includes(s);
      const kids = children.get(c.code) ?? [];
      let any = false;
      for (const k of kids) if (visit(k, seen)) any = true;
      if (self) { const all = (x: ItemClass) => { if (keep.has(x.code)) return; keep.add(x.code); (children.get(x.code) ?? []).forEach(all); }; all(c); }
      if (self || any) { keep.add(c.code); path.add(c.code); }
      return self || any;
    };
    for (const c of children.get('') ?? []) visit(c, new Set());
    return { keep, path };
  }, [s, children]);
  const node = (c: ItemClass, depth: number): React.ReactNode => {
    if (shown && !shown.keep.has(c.code)) return null;
    const kids = children.get(c.code) ?? [];
    // Đang tìm: mở sẵn đường tới nhóm khớp; nhóm con của nhóm khớp vẫn bấm mũi tên mở được.
    const isOpen = open.has(c.code) || Boolean(shown && kids.some((k) => shown.path.has(k.code)));
    return (
      <div key={c.code}>
        <div className={`tree-node ${value === c.code ? 'active' : ''}`} style={{ paddingLeft: 4 + depth * 14 }} onClick={() => onChange(c.code)}>
          <span className="tree-toggle" onClick={(e) => { e.stopPropagation(); setOpen((o) => { const n = new Set(o); if (n.has(c.code)) n.delete(c.code); else n.add(c.code); return n; }); }}>
            {kids.length ? (isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : null}
          </span>
          <span className="tree-label">{c.name}</span>
          {c.products > 0 && <span className="muted tree-n">{c.products}</span>}
        </div>
        {isOpen && kids.map((k) => node(k, depth + 1))}
      </div>
    );
  };
  return (
    <div className="tree">
      <input className="input" style={{ height: 28, marginBottom: 6 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Tìm nhóm…" />
      <div className={`tree-node ${value === null ? 'active' : ''}`} onClick={() => onChange(null)}><span className="tree-toggle" /><b>Nhóm hàng</b></div>
      {(children.get('') ?? []).map((c) => node(c, 1))}
      {shown && !shown.keep.size && <div className="muted" style={{ padding: '6px 4px', fontSize: 12.5 }}>Không có nhóm nào khớp "{q.trim()}"</div>}
    </div>
  );
}

function BulkDialog({ count, taxes, onClose, onApply }: { count: number; taxes: TaxCode[]; onClose: () => void; onApply: (k: EditKey, v: string) => void }) {
  const [k, setK] = useState<EditKey>('inventoryAccount');
  const [v, setV] = useState('');
  const col = EDIT_COLS.find((c) => c.key === k)!;
  return (
    <Modal title="Gán cùng giá trị" onClose={onClose}
      footer={<><button className="btn btn-primary" onClick={() => onApply(k, v.trim())}>Gán cho {count.toLocaleString('vi-VN')} dòng</button><button className="btn" onClick={onClose}>Đóng</button></>}>
      <Field label="Cột"><select className="select input" value={k} onChange={(e) => { setK(e.target.value as EditKey); setV(''); }}>{EDIT_COLS.map((c) => <option key={c.key} value={c.key}>{c.header}</option>)}</select></Field>
      <Field label="Giá trị" hint="Để trống = xoá giá trị của cột">
        {col.kind === 'taxOut' || col.kind === 'taxIn'
          ? <select className="select input" value={v} onChange={(e) => setV(e.target.value)}><option value="">(trống)</option>{taxes.filter((t) => t.direction === (col.kind === 'taxOut' ? 'output' : 'input')).map((t) => <option key={t.code} value={t.code}>{t.code} — {t.name}</option>)}</select>
          : <input className="input" list={col.kind === 'account' ? 'acc17-accounts' : undefined} value={v} onChange={(e) => setV(e.target.value)} />}
      </Field>
      <div className="muted full">Áp dụng cho các dòng đang hiện trên lưới (sau khi lọc). Kiểm tra rồi bấm Ghi để lưu.</div>
    </Modal>
  );
}
