/**
 * Danh mục mặt hàng (DM10) và phân loại hàng hoá (DM11: nhóm hàng, ngành hàng, nhãn hàng, loại hàng).
 * DM10: cây nhóm hàng bên trái; lưới Mã hàng · Tên hàng · Ghi chú · Nhóm hàng · ĐVT · Ngành hàng · Nhãn hàng · Mã VAT ra ·
 * Mã VAT vào · Nhóm hạch toán · Theo dõi. Đây là danh mục hàng CHUẨN: thêm / sửa ở form trọn (ProductFullForm — thông tin,
 * đơn vị tính + tỉ lệ, giá bảng giá công ty / chi nhánh, cờ trạng thái); hệ thống bán hàng kéo về qua /api/v1/catalog/feed.
 */
import { useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText, ALL_ROWS } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, useViewAgain } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { ExcelImport, type ImportColumn } from '@/components/ExcelImport';
import { ListPicker } from '@/components/pickers';
import { GroupTree } from '../posting/ProductAccountsPage';
import { ProductFullForm } from './ProductFullForm';
import { PrintButton } from '@/components/print';
import { PRODUCT_LABEL_TEMPLATES, loadLabelItems } from './productPrint';

export type ClassKind = 'brand' | 'industry' | 'group' | 'type';
const KINDS: [ClassKind, string][] = [['group', 'Nhóm hàng'], ['industry', 'Ngành hàng'], ['brand', 'Nhãn hàng'], ['type', 'Loại hàng']];
const LEVEL_NAME: Record<number, string> = { 1: '1 · Ngành', 2: '2 · Nhãn', 3: '3 · Nhóm sản phẩm' };
interface ItemClass { code: string; name: string; parentCode: string | null; isActive: boolean; products: number; skuCode?: string }
interface Product {
  sku: string; name: string; unit: string; postingGroupCode: string | null;
  brandCode: string | null; industryCode: string | null; groupCode: string | null; typeCode: string | null; isActive: boolean; sourceSystem: string;
  note: string; exciseRate: number | null; taxOutCode: string | null; taxInCode: string | null;
  /** Mã hàng cha (họ mã 1 cấp). */
  parentSku?: string | null;
}
interface PostingGroup { code: string; name: string; isDefault: boolean }

/** Nhập Excel mặt hàng (DM10): cột theo tiêu đề; nhóm / ngành / nhãn / loại ghi mã hoặc tên trong danh mục. */
const IMPORT_COLS: ImportColumn[] = [
  { key: 'sku', header: 'Mã hàng' }, { key: 'name', header: 'Tên hàng' }, { key: 'unit', header: 'ĐVT' },
  { key: 'groupCode', header: 'Nhóm hàng' }, { key: 'industryCode', header: 'Ngành hàng' }, { key: 'brandCode', header: 'Nhãn hàng' }, { key: 'typeCode', header: 'Loại hàng' },
  { key: 'postingGroupCode', header: 'Nhóm hạch toán' }, { key: 'taxOutCode', header: 'Mã VAT ra' }, { key: 'taxInCode', header: 'Mã VAT vào' },
  { key: 'note', header: 'Ghi chú' }, { key: 'isActive', header: 'Theo dõi' },
];
interface ImportOut { created: number; updated: number; failed: number; rows: { row: number; sku: string; action: 'create' | 'update' | 'error'; errors: string[]; values: Record<string, string>; before?: Record<string, string> }[] }
const importCall = (rows: Record<string, string>[], dryRun: boolean) => api.post<ImportOut>('/api/v1/catalog/products/import', {
  dryRun, rows: rows.map(({ _row, ...r }) => ({ ...r, row: Number(_row), sku: r.sku ?? '' })),
});
const importErrors = (o: ImportOut) => o.rows.flatMap((r) => r.errors.map((text) => ({ row: r.row, key: r.sku, text })));

/** File mẫu: dòng tiêu đề + 2 dòng ví dụ, sheet "Hướng dẫn" ghi cách điền. */
async function downloadImportTemplate() {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    IMPORT_COLS.map((c) => c.header),
    ['MAU-001', 'Sữa bột mẫu 400g', 'Hộp', '', '', '', '', '', '', '', 'Dòng ví dụ — xoá trước khi nhập', 'Có'],
    ['MAU-002', 'Khăn ướt mẫu 80 tờ', 'Gói', '', '', '', '', '', '', '', '', 'Có'],
  ]);
  ws['!cols'] = IMPORT_COLS.map((c) => ({ wch: c.key === 'name' || c.key === 'note' ? 32 : 14 }));
  XLSX.utils.book_append_sheet(wb, ws, 'Mặt hàng');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Cột', 'Cách điền'],
    ['Mã hàng', 'Bắt buộc, không có khoảng trắng. Mã đã có → cập nhật; mã chưa có → thêm mới.'],
    ['Tên hàng, ĐVT', 'Bắt buộc với mặt hàng mới. Mặt hàng đã có: để trống = giữ nguyên; ĐVT không đổi qua Excel (đổi ở form mặt hàng).'],
    ['Nhóm / Ngành / Nhãn / Loại hàng', 'Ghi mã hoặc đúng tên đã có trong danh mục phân loại. Để trống = giữ nguyên.'],
    ['Nhóm hạch toán, Mã VAT ra / vào', 'Mã đã có trong hệ thống. Để trống = giữ nguyên (mặt hàng mới: nhóm mặc định).'],
    ['Theo dõi', 'Có / Không. Để trống = giữ nguyên (mặt hàng mới: Có).'],
    ['', 'Bấm Nhập Excel: phần mềm kiểm tra từng dòng và liệt kê dòng lỗi TRƯỚC khi ghi; bấm Ghi thì chỉ ghi dòng đúng.'],
  ]), 'Hướng dẫn');
  XLSX.writeFile(wb, 'mau-nhap-mat-hang.xlsx');
}

export const useClasses = (kind: ClassKind) => useQuery({ queryKey: ['item-classes', kind], queryFn: () => api.get<ItemClass[]>(`/api/v1/item-classes/${kind}`), staleTime: 60_000 });
const SOURCE: Record<string, string> = { document: 'Tự thêm từ chứng từ', manual: 'Kế toán thêm', default: 'Dữ liệu gốc' };

/** Đường dẫn cây (cha / con / …) của một mã phân loại. */
/** Form mặt hàng mở được từ bất kỳ màn nào (phiếu, bảng giá…): tự tải phân loại hàng. sku null = thêm mới. */
export function ProductEditor({ sku, onClose, startTab, startEditing }: { sku: string | null; onClose: () => void; startTab?: string; startEditing?: boolean }) {
  const classes = { brand: useClasses('brand'), industry: useClasses('industry'), group: useClasses('group'), type: useClasses('type') };
  const groupPath = useMemo(() => pathOf(classes.group.data ?? []), [classes.group.data]);
  return <ProductFullForm sku={sku} classes={{ brand: classes.brand.data ?? [], industry: classes.industry.data ?? [], group: classes.group.data ?? [], type: classes.type.data ?? [] }} groupPath={groupPath} onClose={onClose} startTab={startTab} startEditing={startEditing} />;
}

/** Đường dẫn trong cây: cấp 1 / cấp 2 / … — ghép theo tên (mặc định) hoặc theo mã. */
export function pathOf(list: { code: string; name: string; parentCode: string | null }[], by: 'name' | 'code' = 'name') {
  const byCode = new Map(list.map((c) => [c.code, c]));
  const memo = new Map<string, string>();
  const path = (code: string | null, depth = 0): string => {
    if (!code) return '';
    if (memo.has(code)) return memo.get(code)!;
    const c = byCode.get(code);
    if (!c) return code;
    const p = c.parentCode && c.parentCode !== code && depth < 20 ? path(c.parentCode, depth + 1) : '';
    const own = by === 'code' ? c.code : c.name;
    const out = p ? `${p} / ${own}` : own;
    memo.set(code, out);
    return out;
  };
  return path;
}

export function ProductsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({ postingGroup: '', status: 'all' });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<(Partial<Product> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<Product | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const viewRef = useRef<Product[]>([]);
  // In tem: mặt hàng đang chọn hoặc mọi dòng đang hiện trên lưới (sau tìm, lọc); số tem mỗi mã.
  const [labelScope, setLabelScope] = useState<'sel' | 'view'>('sel');
  const [labelCopies, setLabelCopies] = useState(1);
  const labelDocs = async () => {
    const list = labelScope === 'sel' ? (sel ? [sel] : []) : viewRef.current;
    if (!list.length) return [];
    if (list.length > 200 && !window.confirm(`In tem cho ${list.length.toLocaleString('vi-VN')} mặt hàng (× ${labelCopies} tem)? Phải nạp chi tiết từng mặt hàng nên hơi lâu.`)) return [];
    return loadLabelItems(list.map((p) => p.sku), labelCopies);
  };
  const classes = { brand: useClasses('brand'), industry: useClasses('industry'), group: useClasses('group'), type: useClasses('type') };
  const groups = useQuery({ queryKey: ['groups'], queryFn: () => api.get<PostingGroup[]>('/api/v1/posting/groups'), staleTime: 60_000 });
  const params = { search: applied, page, pageSize: ALL_ROWS, group: group ?? undefined, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) };
  const q = useQuery({ queryKey: ['products', params], queryFn: () => api.getPage<Product[]>('/api/v1/products', params), placeholderData: keepPreviousData });
  const groupPath = useMemo(() => pathOf(classes.group.data ?? []), [classes.group.data]);
  const nameOf = (k: ClassKind, c: string | null) => (c ? classes[k].data?.find((x) => x.code === c)?.name ?? c : '');
  const set = (patch: Record<string, string>) => { setF((x) => ({ ...x, ...patch })); setPage(1); };
  const del = useMutation({ mutationFn: (sku: string) => api.delete(`/api/v1/products/${encodeURIComponent(sku)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['products'] }); } });

  // HỌ MÃ (1 cấp, mã cha lưu ở mặt hàng — quét theo mã hoặc chọn tay): mã con xếp ngay dưới mã cha, thụt vào; mã cha ghi số mã con.
  // Mã cha không có trong danh sách đang lọc thì mã con hiện như thường. Phân tích đặt hàng cộng dồn cả họ vào mã cha.
  const fam = useMemo(() => {
    const list = q.data?.data ?? [];
    const cat = new Set(list.map((p) => p.sku));
    const parent = new Map(list.map((p) => [p.sku, p.parentSku && cat.has(p.parentSku) ? p.parentSku : p.sku]));
    const kids = new Map<string, Product[]>();
    for (const p of list) { const par = parent.get(p.sku)!; if (par !== p.sku) kids.set(par, [...(kids.get(par) ?? []), p]); }
    const rows: Product[] = [];
    for (const p of list) if (parent.get(p.sku) === p.sku) rows.push(p, ...(kids.get(p.sku) ?? []));
    return { rows, parent, kids };
  }, [q.data]);
  const isChild = (p: Product) => fam.parent.get(p.sku) !== p.sku;
  const [scan, setScan] = useState<{ pw: string; busy?: boolean; msg?: string; ok?: boolean } | null>(null);
  const runScan = async () => {
    if (!scan) return;
    setScan({ ...scan, busy: true, msg: undefined });
    try {
      const r = await api.post<{ updated: number; families: number; children: number }>('/api/v1/catalog/products/scan-parents', { overwrite: false, password: scan.pw });
      setScan({ pw: '', ok: true, msg: `Đã cập nhật ${r.updated} mã. Hiện có ${r.families} mã cha, ${r.children} mã con.` });
      void qc.invalidateQueries({ queryKey: ['products'] });
    } catch (e) { setScan({ ...scan, busy: false, ok: false, msg: errorText(e) }); }
  };
  const columns: Column<Product>[] = [
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 150, render: (p) => (isChild(p)
      ? <span style={{ paddingLeft: 14 }} title={`Mã con của ${fam.parent.get(p.sku)} (họ mã)`}><span className="muted">└ </span>{p.sku}</span>
      : <span>{p.sku}{fam.kids.get(p.sku)?.length ? <span className="badge badge-gray" style={{ marginLeft: 4, fontSize: 10 }} title={`Mã cha của: ${fam.kids.get(p.sku)!.map((k) => k.sku).join(', ')}`}>+{fam.kids.get(p.sku)!.length}</span> : null}</span>) },
    { key: 'name', header: 'Tên hàng', width: 280, render: (p) => (isChild(p) ? <span style={{ paddingLeft: 14 }} className="muted">{p.name}</span> : p.name) },
    { key: 'note', header: 'Ghi chú', width: 180 },
    { key: 'groupCode', header: 'Nhóm hàng', width: 320, value: (p) => groupPath(p.groupCode) },
    { key: 'unit', header: 'ĐVT', width: 70 },
    { key: 'industryCode', header: 'Ngành hàng', width: 140, value: (p) => nameOf('industry', p.industryCode) },
    { key: 'brandCode', header: 'Nhãn hàng', width: 140, value: (p) => nameOf('brand', p.brandCode) },
    { key: 'taxOutCode', header: 'Mã VAT ra', type: 'code', width: 90 },
    { key: 'taxInCode', header: 'Mã VAT vào', type: 'code', width: 95 },
    { key: 'exciseRate', header: 'Thuế TTĐB', type: 'number', width: 85 },
    { key: 'postingGroupCode', header: 'Nhóm hạch toán', type: 'code', width: 120, value: (p) => p.postingGroupCode ?? '(mặc định)' },
    { key: 'isActive', header: 'Theo dõi', type: 'check', width: 70 },
    { key: 'typeCode', header: 'Loại hàng', width: 120, hidden: true, value: (p) => nameOf('type', p.typeCode) },
    { key: 'sourceSystem', header: 'Nguồn', width: 130, hidden: true, value: (p) => SOURCE[p.sourceSystem] ?? p.sourceSystem },
  ];

  return (
    <>
      <PageHeader title="Mặt hàng" code="DM10" subtitle="Danh mục hàng chuẩn: thông tin, đơn vị tính + tỉ lệ quy đổi, giá bán bảng giá công ty / chi nhánh, trạng thái bán — hệ thống bán hàng kéo về" helpKey="mat-hang" />
      <div className="acc17">
        <div className="card acc17-tree">
          <div className="acc17-tree-head">Nhóm hàng</div>
          {classes.group.isLoading ? <Loading /> : <GroupTree classes={classes.group.data ?? []} value={group} onChange={(g) => { setGroup(g); setPage(1); }} />}
        </div>
        <div className="card acc17-main">
          <CatalogToolbar
            canWrite={canWrite}
            hasSelection={Boolean(sel)}
            busy={del.isPending}
            onAdd={() => setEditing({ isNew: true, groupCode: group })}
            onEdit={() => sel && setEditing(sel)}
            onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá mặt hàng ${sel.sku} - ${sel.name}?`)) del.mutate(sel.sku); }}
            onRefresh={() => q.refetch()}
            onExport={() => exportRef.current?.()}
            extra={
              <>
                <ExcelImport
                  columns={IMPORT_COLS} keyColumn="sku" disabled={!canWrite} buttonLabel="Nhập Excel"
                  onTemplate={() => void downloadImportTemplate()}
                  hint="Mã đã có → cập nhật (ô trống giữ nguyên); mã chưa có → thêm mới (bắt buộc Tên hàng, ĐVT)."
                  onCheck={async (rows) => { const o = await importCall(rows, true); return { ok: o.created + o.updated, okText: `${o.created} thêm mới, ${o.updated} cập nhật`, errors: importErrors(o),
                    preview: { columns: IMPORT_COLS, rows: o.rows.map((r) => ({ row: r.row, status: r.action, values: r.values, before: r.before, errors: r.errors })) } }; }}
                  onImport={async (rows) => {
                    const o = await importCall(rows, false);
                    void qc.invalidateQueries({ queryKey: ['products'] });
                    return { updated: o.created + o.updated, errors: importErrors(o).map((e) => `Dòng ${e.row} (${e.key || 'thiếu mã'}): ${e.text}`) };
                  }}
                />
                {canWrite && <button className="btn btn-sm" title="Quét họ mã theo mã: mã 9 số + đuôi (Z, Q, K, M, B…; trừ T có tem) là mã con của mã gốc có trong danh mục. Giữ mã cha đã chọn tay." onClick={() => setScan({ pw: '' })}>Quét cha – con theo mã</button>}
                <span className="row" style={{ gap: 4 }} title="In tem mã vạch / tem kệ: chọn phạm vi và số tem mỗi mã, mũi tên cạnh nút In tem để chọn mẫu (3–8 cột, tem kệ)">
                  <select className="select input" style={{ height: 30 }} value={labelScope} onChange={(e) => setLabelScope(e.target.value as 'sel' | 'view')}>
                    <option value="sel">Tem: mã đang chọn</option><option value="view">Tem: mọi dòng đang hiện</option>
                  </select>
                  <input className="input num" type="number" min={1} max={500} style={{ width: 52, height: 30 }} value={labelCopies} title="Số tem mỗi mặt hàng" onChange={(e) => setLabelCopies(Math.max(1, Math.min(500, Math.floor(Number(e.target.value)) || 1)))} />
                  <PrintButton screen="DM10" label="In tem" templates={PRODUCT_LABEL_TEMPLATES} disabled={labelScope === 'sel' && !sel} getDocs={labelDocs} />
                </span>
                <span className="spacer" />
                <form className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); setPage(1); }}>
                  <input className="input" style={{ width: 220, height: 30 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm nhanh: mã, tên, ghi chú" />
                  <button className="btn btn-sm" type="submit">Tìm</button>
                </form>
                <select className="select input" style={{ height: 30 }} value={f.postingGroup} onChange={(e) => set({ postingGroup: e.target.value })}>
                  <option value="">Mọi nhóm hạch toán</option><option value="-">(Chưa gán — nhóm mặc định)</option>
                  {(groups.data ?? []).map((g) => <option key={g.code} value={g.code}>{g.code} — {g.name}</option>)}
                </select>
                <select className="select input" style={{ height: 30 }} value={f.status} onChange={(e) => set({ status: e.target.value })}>
                  <option value="all">Tất cả</option><option value="active">Đang theo dõi</option><option value="inactive">Ngừng</option>
                </select>
              </>
            }
          />
          <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
          {q.isLoading ? <Loading /> : (
            <DataGrid
              storageKey="dm10-v2"
              exportName="mat-hang"
              groupable
              exportRef={exportRef}
              viewRef={viewRef}
              rows={fam.rows}
              rowKey={(p) => p.sku}
              onSelect={setSel}
              onRowDoubleClick={(p) => canWrite && setEditing(p)}
              rowClassName={(p) => (p.isActive ? '' : 'muted')}
              footerLabel={false}
              note="tìm nhanh, lọc ở trên tải lại từ máy chủ"
              emptyText="Chưa có mặt hàng. Bấm Quay về dữ liệu gốc để nạp danh mục mặt hàng chuẩn của công ty; mặt hàng mới cũng tự thêm khi chứng từ mang mã hàng mới hoặc hệ thống bán hàng đồng bộ qua API."
              columns={columns}
            />
          )}
        </div>
      </div>
      {scan && (
        <Modal title="Quét cha – con theo mã (công cụ)" onClose={() => setScan(null)}
          footer={<><button className="btn btn-primary" disabled={scan.busy || !scan.pw} onClick={() => void runScan()}>{scan.busy ? 'Đang quét…' : 'Chạy'}</button><button className="btn" onClick={() => setScan(null)}>Đóng</button></>}>
          <div className="full" style={{ fontSize: 13, marginBottom: 8 }}>Mã 9 số + đuôi (Z, Q, K, M, B…; trừ T có tem) nhận mã gốc làm <b>mã cha</b> nếu mã gốc có trong danh mục. Mã cha đã chọn tay ở form mặt hàng <b>được giữ nguyên</b>.</div>
          <Field label="Mật khẩu công cụ" full><input className="input" type="text" name="tool-key" autoComplete="off" data-lpignore="true" data-1p-ignore style={{ WebkitTextSecurity: 'disc' } as React.CSSProperties} value={scan.pw} autoFocus onChange={(e) => setScan({ ...scan, pw: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && scan.pw && void runScan()} /></Field>
          {scan.msg && <div className={`alert ${scan.ok ? 'alert-ok' : 'alert-bad'} full`} style={{ marginTop: 8 }}>{scan.msg}</div>}
        </Modal>
      )}
      {editing && <ProductFullForm sku={editing.isNew ? null : editing.sku ?? null} initial={editing.isNew ? { groupCode: editing.groupCode ?? null } : undefined} classes={{ brand: classes.brand.data ?? [], industry: classes.industry.data ?? [], group: classes.group.data ?? [], type: classes.type.data ?? [] }} groupPath={groupPath} onClose={() => setEditing(null)} />}
    </>
  );
}

/** Phân loại hàng hoá (DM11): nhóm hàng (cây), ngành hàng, nhãn hàng, loại hàng. */
export function ItemClassesPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [kind, setKind] = useState<ClassKind>('group');
  const [editing, setEditing] = useState<(Partial<ItemClass> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<ItemClass | null>(null);
  const exportRef = useRef<(() => void) | null>(null);
  const q = useClasses(kind);
  const label = KINDS.find(([k]) => k === kind)![1];
  const path = useMemo(() => pathOf(q.data ?? []), [q.data]);
  const codePath = useMemo(() => pathOf(q.data ?? [], 'code'), [q.data]);
  // Cấp trong cây nhóm hàng (1 ngành · 2 nhãn · 3 nhóm sản phẩm) — nút gốc chung tên "Nhóm hàng" không tính.
  const levelOf = useMemo(() => {
    const by = new Map((q.data ?? []).map((c) => [c.code, c]));
    const memo = new Map<string, number>();
    const f = (code: string, seen = new Set<string>()): number => {
      if (memo.has(code)) return memo.get(code)!;
      const c = by.get(code);
      if (!c || seen.has(code)) return 0;
      seen.add(code);
      const n = c.parentCode ? f(c.parentCode, seen) + 1 : /^nhóm hàng$/i.test(c.name.trim()) ? 0 : 1;
      memo.set(code, n);
      return n;
    };
    return f;
  }, [q.data]);
  // Nhóm hàng là cây: xếp cha – con (con ngay dưới cha, anh em theo tên), thụt lề theo cấp — dễ nhìn ngành → nhãn → nhóm.
  const treeRows = useMemo(() => {
    const list = q.data ?? [];
    if (kind !== 'group') return list;
    const codes = new Set(list.map((c) => c.code));
    const kids = new Map<string, ItemClass[]>();
    const roots: ItemClass[] = [];
    for (const c of list) (c.parentCode && codes.has(c.parentCode) ? (kids.get(c.parentCode) ?? kids.set(c.parentCode, []).get(c.parentCode)!) : roots).push(c);
    const byName = (a: ItemClass, b: ItemClass) => a.name.localeCompare(b.name, 'vi');
    const out: ItemClass[] = [];
    const seen = new Set<string>();
    const walk = (c: ItemClass) => { if (seen.has(c.code)) return; seen.add(c.code); out.push(c); for (const k of (kids.get(c.code) ?? []).sort(byName)) walk(k); };
    roots.sort(byName).forEach(walk);
    for (const c of list) if (!seen.has(c.code)) out.push(c);
    return out;
  }, [q.data, kind]);
  const indent = (c: ItemClass) => (kind === 'group' ? Math.max(0, levelOf(c.code) - 1) : 0);
  const viewAgain = useViewAgain();
  const save = useMutation({
    mutationFn: (c: Partial<ItemClass> & { isNew?: boolean }) => api.put(`/api/v1/item-classes/${kind}/${encodeURIComponent((c.code ?? '').trim())}${c.isNew ? '?new=1' : ''}`, { name: c.name ?? '', parentCode: c.parentCode || undefined, isActive: c.isActive ?? true, ...(kind === 'group' ? { skuCode: c.skuCode ?? '' } : {}) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['item-classes', kind] }); if (editing?.isNew) setEditing(null); else viewAgain[1](); },
  });
  const del = useMutation({ mutationFn: (code: string) => api.delete(`/api/v1/item-classes/${kind}/${encodeURIComponent(code)}`), onSuccess: () => { setSel(null); void qc.invalidateQueries({ queryKey: ['item-classes', kind] }); } });
  /** Suy mã SKU nhóm hàng chưa khai từ mã hàng đang có: xem trước rồi hỏi áp dụng. */
  const infer = useMutation({
    mutationFn: async () => {
      const pre = await api.post<{ rows: { code: string; name: string; level: number; skuCode: string; votes: number; total: number }[] }>('/api/v1/catalog/sku-codes/infer', { apply: false });
      if (!pre.rows.length) { window.alert('Mọi nhóm hàng có mặt hàng đều đã khai mã SKU'); return; }
      const lack = pre.rows.filter((r) => r.votes < r.total).length;
      const sample = pre.rows.slice(0, 8).map((r) => `  cấp ${r.level} · ${r.name}: ${r.skuCode}`).join('\n');
      if (!window.confirm(`Suy được mã SKU cho ${pre.rows.length} nhóm hàng${lack ? ` (${lack} nhóm có mã hàng lệch, lấy mã chiếm đa số)` : ''}:\n${sample}${pre.rows.length > 8 ? '\n  …' : ''}\n\nÁp dụng?`)) return;
      await api.post('/api/v1/catalog/sku-codes/infer', { apply: true });
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['item-classes'] }),
  });
  const e = editing;
  return (
    <>
      <PageHeader title="Phân loại hàng hoá" code="DM11" subtitle="Nhóm hàng (cây cha – con), ngành hàng, nhãn hàng, loại hàng gắn trên mặt hàng để báo cáo phân tích theo nhóm hàng" helpKey="mat-hang" />
      <div className="tabs" role="tablist" style={{ marginBottom: 8 }}>{KINDS.map(([k, l]) => <button key={k} role="tab" className={`tab ${kind === k ? 'active' : ''}`} onClick={() => { setKind(k); setSel(null); }}>{l}</button>)}</div>
      <div className="card">
        <CatalogToolbar
          canWrite={canWrite}
          hasSelection={Boolean(sel)}
          busy={del.isPending}
          onAdd={() => setEditing({ isNew: true, isActive: true, parentCode: sel?.code ?? null })}
          onEdit={() => sel && setEditing(sel)}
          onDelete={() => { if (sel && window.confirm(`Bạn có chắc chắn muốn xoá ${label.toLowerCase()} ${sel.code} - ${sel.name}?`)) del.mutate(sel.code); }}
          onRefresh={() => q.refetch()}
          onExport={() => exportRef.current?.()}
          extra={kind === 'group' && canWrite ? <><span className="spacer" /><button className="btn btn-sm" disabled={infer.isPending} onClick={() => infer.mutate()} title="Điền đoạn mã cho các nhóm chưa có, lấy từ mã hàng đang có trong nhóm (vd nhóm Vinamilk có mã 110053024 → cấp 1 = 11, cấp 2 = 005, cấp 3 = 3). Không cần bấm: sinh mã hàng cũng tự làm việc này">Tự điền đoạn mã từ mã hàng đang có</button></> : undefined}
        />
        <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : infer.error ? errorText(infer.error) : null} />
        {q.isLoading ? <Loading /> : (
          <DataGrid key={kind} storageKey={`dm11-${kind}-v2`} exportName={`phan-loai-${kind}`} groupable exportRef={exportRef} rows={treeRows} rowKey={(c) => c.code}
            onSelect={setSel} onRowDoubleClick={(c) => canWrite && setEditing(c)} rowClassName={(c) => (c.isActive ? '' : 'muted')} footerLabel={false}
            emptyText={`Chưa có ${label.toLowerCase()} nào. Đồng bộ mặt hàng qua API kèm mã phân loại thì danh mục tự thêm.`}
            columns={[
              { key: 'code', header: `Mã ${label.toLowerCase()}`, type: 'code', width: 120 },
              { key: 'name', header: `Tên ${label.toLowerCase()}`, width: 300, render: (c) => (indent(c) ? <span style={{ paddingLeft: indent(c) * 18 }}><span className="muted">└ </span>{c.name}</span> : <b>{c.name}</b>) },
              { key: 'path', header: 'Path', width: 420, value: (c) => path(c.code) },
              { key: 'parentCode', header: 'Thuộc', type: 'code', width: 160, value: (c) => codePath(c.parentCode) },
              ...(kind === 'group' ? [{ key: 'level', header: 'Cấp', width: 110, value: (c: ItemClass) => LEVEL_NAME[levelOf(c.code)] ?? `cấp ${levelOf(c.code)}` } as Column<ItemClass>,
                { key: 'skuCode', header: 'Đoạn mã trong mã hàng', type: 'code', width: 150 } as Column<ItemClass>] : []),
              { key: 'products', header: 'Số mặt hàng', type: 'number', width: 100 },
              { key: 'inactive', header: 'Ngừng dùng', type: 'check', width: 85, hidden: true, value: (c) => !c.isActive },
            ] satisfies Column<ItemClass>[]} />
        )}
      </div>
      {e && (
        <Modal viewAgain={viewAgain} viewFirst={!e.isNew} title={label} onClose={() => setEditing(null)}
          footer={<><button className="btn btn-primary" disabled={save.isPending || !e.code?.trim() || !e.name} onClick={() => save.mutate(e)}>Ghi</button><button className="btn" onClick={() => setEditing(null)}>Thoát</button></>}>
          <Field label={`Mã ${label.toLowerCase()} (*)`}><input className="input mono" value={e.code ?? ''} disabled={!e.isNew} onChange={(ev) => setEditing({ ...e, code: ev.target.value })} autoFocus /></Field>
          <Field label={`Tên ${label.toLowerCase()}`}><input className="input" value={e.name ?? ''} onChange={(ev) => setEditing({ ...e, name: ev.target.value })} /></Field>
          <Field label="Phân cấp (thuộc)" full><ListPicker items={(q.data ?? []).filter((c) => c.code !== e.code).map((c) => ({ code: c.code, name: path(c.code) }))} value={e.parentCode ?? ''} onChange={(p) => setEditing({ ...e, parentCode: p || null })} placeholder="Không có (cấp 1)" nameFirst /></Field>
          {kind === 'group' && (() => {
            const lv = e.parentCode ? levelOf(e.parentCode) + 1 : 1;
            const ex = ['', 'Cấp 1 — ngành: 2 số (11 Sữa bột, 19 Bỉm/tã) · quà khuyến mại: Q', 'Cấp 2 — nhãn: 3 số (005 Vinamilk, 006 Abbott)', 'Cấp 3 — nhóm sản phẩm: 1 số (3 Sữa công thức trẻ em, 8 Combo)'][lv] ?? 'Nhóm sâu hơn cấp 3: không ghép vào mã (mã lấy theo nhóm cấp 3 chứa nó)';
            return <Field label="Đoạn mã trong mã hàng" hint={`${ex}. Mã hàng = cấp 1 + cấp 2 + cấp 3 + số thứ tự (vd 11 · 005 · 3 · 024 = 110053024). Để trống: sinh mã tự điền theo mã hàng đang có / số kế tiếp.`}><input className="input mono" value={e.skuCode ?? ''} placeholder="tự điền khi sinh mã" onChange={(ev) => setEditing({ ...e, skuCode: ev.target.value.trim().toUpperCase() })} /></Field>;
          })()}
          <Field label=" "><label className="checkbox"><input type="checkbox" checked={e.isActive ?? true} onChange={(ev) => setEditing({ ...e, isActive: ev.target.checked })} /> Đang dùng</label></Field>
          {save.error && <div className="alert alert-bad full">{errorText(save.error)}</div>}
        </Modal>
      )}
    </>
  );
}
