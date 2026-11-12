/**
 * Danh mục mặt hàng (DM10). Cây nhóm hàng (DM11) ở NhomHangPage.tsx.
 * DM10: cây nhóm hàng bên trái; lưới Mã hàng · Tên hàng · Ghi chú · Nhóm hàng · ĐVT · Ngành hàng · Nhãn hàng · Mã VAT ra ·
 * Mã VAT vào · Nhóm hạch toán · Theo dõi. Đây là danh mục hàng CHUẨN: thêm / sửa ở form trọn (ProductFullForm — thông tin,
 * đơn vị tính + tỉ lệ, giá bảng giá công ty / chi nhánh, cờ trạng thái); hệ thống bán hàng kéo về qua /api/v1/catalog/feed.
 */
import { useMemo, useRef, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useThemTuDiaChi } from '@/lib/themNhanh';
import { PageHeader } from '@/components/PageHeader';
import { ErrorBox, Field, Loading, Modal, Pager } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';
import { CatalogToolbar } from '@/components/CatalogToolbar';
import { NutNhapExcel } from '@/components/NhapExcelWizard';
import { nhapLoai } from '@/lib/nhapExcel';
import { GroupTree } from '../posting/ProductAccountsPage';
import { ProductFullForm } from './ProductFullForm';
// [2026-11-07 05:50 PM Nguyễn Văn Thủy] PHASE-026 — mã số cha – con GĐ 1: cột Biến thể cạnh mã, lọc theo biến thể, Loại hàng (đóng góp)
import { PrintButton } from '@/components/print';
import { PRODUCT_LABEL_TEMPLATES, loadLabelItems } from './productPrint';
// [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — D024-3: dải báo cáo mặt hàng tự thêm, kích hoạt hàng loạt mặt hàng nháp
import { AutoCreatedBanner, BulkActivateModal } from './autoCreate';
// [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1: nút Hành trình (truy vết vòng đời) cho mặt hàng đang chọn
import { Link } from 'react-router-dom';

export type ClassKind = 'brand' | 'industry' | 'group' | 'type';
interface ItemClass { code: string; name: string; parentCode: string | null; isActive: boolean; products: number; skuCode?: string }
const trangThai = (p: { isActive: boolean; isDraft?: boolean }) => (!p.isActive ? 'Ngừng hoạt động' : p.isDraft ? 'Chờ duyệt' : 'Đang hoạt động');

interface Product {
  sku: string; name: string; unit: string; postingGroupCode: string | null; createdAt?: string; createdBy?: string; updatedAt?: string; updatedBy?: string;
  brandCode: string | null; industryCode: string | null; groupCode: string | null; typeCode: string | null; isActive: boolean; sourceSystem: string;
  /** Nháp (PHASE-024 S024-28): còn lỗi chặn, chưa dùng được trên chứng từ. */
  isDraft?: boolean; draftCodes?: string[];
  note: string; exciseRate: number | null; taxOutCode: string | null; taxInCode: string | null;
  /** Mã hàng cha (họ mã 1 cấp). */
  parentSku?: string | null;
  variantCode?: string;
  sendToTax?: boolean; // [2026-11-09 07:30 PM Nguyễn Văn Thủy] PHASE-026 — ô Gửi lên thuế (0093) (đóng góp)
}
interface PostingGroup { code: string; name: string; isDefault: boolean }

export const useClasses = (kind: ClassKind) => useQuery({ queryKey: ['item-classes', kind], queryFn: () => api.get<ItemClass[]>(`/api/v1/item-classes/${kind}`), staleTime: 60_000 });
const SOURCE: Record<string, string> = { document: 'Tự thêm từ chứng từ', manual: 'Kế toán thêm', default: 'Dữ liệu gốc' };

/** Đường dẫn cây (cha / con / …) của một mã phân loại. */
/** Form mặt hàng mở được từ bất kỳ màn nào (phiếu, bảng giá…): tự tải phân loại hàng. sku null = thêm mới. */
export function ProductEditor({ sku, onClose, startTab, startEditing, initial, onSaved }: { sku: string | null; onClose: () => void; startTab?: string; startEditing?: boolean; initial?: { name?: string; groupCode?: string | null }; onSaved?: (sku: string) => void }) {
  const classes = { brand: useClasses('brand'), industry: useClasses('industry'), group: useClasses('group'), type: useClasses('type') };
  const groupPath = useMemo(() => pathOf(classes.group.data ?? []), [classes.group.data]);
  return <ProductFullForm sku={sku} classes={{ brand: classes.brand.data ?? [], industry: classes.industry.data ?? [], group: classes.group.data ?? [], type: classes.type.data ?? [] }} groupPath={groupPath} onClose={onClose} startTab={startTab} startEditing={startEditing} initial={initial} onSaved={onSaved} />;
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

/** Danh mục lớn không tải hết về trình duyệt: mỗi trang tối đa ngần này mặt hàng, ít hơn thì không hiện thanh trang. */
const TRANG_MAT_HANG = 5000;

export function ProductsPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const canWrite = can('catalog:write');
  const [search, setSearch] = useState('');
  const [applied, setApplied] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [f, setF] = useState<Record<string, string>>({ postingGroup: '', status: 'all', variant: '' });
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<(Partial<Product> & { isNew?: boolean }) | null>(null);
  const [sel, setSel] = useState<Product | null>(null);
  useThemTuDiaChi(() => setEditing({ isNew: true, groupCode: group }), canWrite);
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
  const params = { search: applied, page, pageSize: TRANG_MAT_HANG, group: group ?? undefined, ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)) };
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
  const [bulk, setBulk] = useState(false);
  const columns: Column<Product>[] = [
    { key: 'sku', header: 'Mã hàng', type: 'code', width: 150, render: (p) => (isChild(p)
      ? <span style={{ paddingLeft: 14 }} title={`Mã con của ${fam.parent.get(p.sku)} (họ mã)`}><span className="muted">└ </span>{p.sku}</span>
      : <span>{p.sku}{fam.kids.get(p.sku)?.length ? <span className="badge badge-gray" style={{ marginLeft: 4, fontSize: 10 }} title={`Mã cha của: ${fam.kids.get(p.sku)!.map((k) => k.sku).join(', ')}`}>+{fam.kids.get(p.sku)!.length}</span> : null}</span>) },
    { key: 'name', header: 'Tên hàng', width: 280, render: (p) => <>{p.isDraft && <span className="badge badge-warn" style={{ marginRight: 6 }} title={`Nháp — chưa dùng được trên chứng từ. Còn thiếu: ${(p.draftCodes ?? []).join(', ')}`}>Nháp</span>}{isChild(p) ? <span style={{ paddingLeft: 14 }} className="muted">{p.name}</span> : p.name}</> },
    { key: 'groupCode', header: 'Nhóm hàng', width: 320, value: (p) => groupPath(p.groupCode) },
    { key: 'unit', header: 'ĐVT', width: 70 },
    // [2026-11-12 Nguyễn Văn Thủy] một cột Thuế GTGT (%) thay Mã VAT ra / vào, TTĐB (đóng góp)
    { key: 'taxOutCode', header: 'Thuế GTGT (%)', width: 100, title: 'Thuế suất GTGT bán ra', value: (p) => ({ KCT: 'KCT', R00K: 'KCT', R00: '0%', R05: '5%', R08: '8%', R10: '10%' } as Record<string, string>)[p.taxOutCode ?? ''] ?? (p.taxOutCode ?? '') },
    { key: 'postingGroupCode', header: 'Nhóm hạch toán (cũ)', type: 'code', width: 120, hidden: true, value: (p) => p.postingGroupCode ?? '(mặc định)' },
    // [2026-11-12 Nguyễn Văn Thủy] Trạng thái sản phẩm thay ô Theo dõi: Đang hoạt động / Chờ duyệt / Ngừng hoạt động (đóng góp)
    // [2026-11-12 Nguyễn Văn Thủy] truy vết: người tạo, lúc tạo (0114) (đóng góp)
    { key: 'createdBy', header: 'Người tạo', width: 140, title: 'Người thêm mặt hàng; "Hệ thống (…)" = thêm tự động', value: (p) => p.createdBy ?? '' },
    { key: 'createdAt', header: 'Lúc tạo', width: 140, title: 'Thời điểm thêm mặt hàng', value: (p) => (p.createdAt ? new Date(p.createdAt).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') },
    { key: 'updatedBy', header: 'Người sửa', width: 140, title: 'Người sửa lần cuối', value: (p) => p.updatedBy ?? '' },
    { key: 'updatedAt', header: 'Lúc sửa', width: 140, title: 'Thời điểm sửa lần cuối', value: (p) => (p.updatedAt ? new Date(p.updatedAt).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') },
    { key: 'isActive', header: 'Trạng thái', width: 130, title: 'Đang hoạt động · Chờ duyệt (mặt hàng nháp, chưa dùng được trên chứng từ) · Ngừng hoạt động', value: (p) => trangThai(p), render: (p) => <span className={`badge ${!p.isActive ? 'badge-gray' : p.isDraft ? 'badge-warn' : 'badge-ok'}`}>{trangThai(p)}</span> },
    { key: 'sourceSystem', header: 'Nguồn', width: 130, hidden: true, value: (p) => SOURCE[p.sourceSystem] ?? p.sourceSystem },
  ];

  return (
    <>
      <PageHeader title="Quản lý mặt hàng" code="DM10" subtitle="Danh mục hàng chuẩn: thông tin, đơn vị tính + tỉ lệ quy đổi, giá bán bảng giá công ty / chi nhánh, trạng thái bán — hệ thống bán hàng kéo về" helpKey="mat-hang" />
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
                <NutNhapExcel loai={nhapLoai('mat-hang')!} disabled={!canWrite} />
                <span className="row" style={{ gap: 4 }} title="In tem mã vạch / tem kệ: chọn phạm vi và số tem mỗi mã, mũi tên cạnh nút In tem để chọn mẫu (3–8 cột, tem kệ)">
                  <select className="select input" style={{ height: 30 }} value={labelScope} onChange={(e) => setLabelScope(e.target.value as 'sel' | 'view')}>
                    <option value="sel">Tem: mã đang chọn</option><option value="view">Tem: mọi dòng đang hiện</option>
                  </select>
                  <input className="input num" type="number" min={1} max={500} style={{ width: 52, height: 30 }} value={labelCopies} title="Số tem mỗi mặt hàng" onChange={(e) => setLabelCopies(Math.max(1, Math.min(500, Math.floor(Number(e.target.value)) || 1)))} />
                  <PrintButton screen="DM10" label="In tem" templates={PRODUCT_LABEL_TEMPLATES} disabled={labelScope === 'sel' && !sel} getDocs={labelDocs} />
                </span>
                <span className="spacer" />
                <form className="row" style={{ gap: 4 }} onSubmit={(e) => { e.preventDefault(); setApplied(search.trim()); setPage(1); }}>
                  <input className="input" style={{ width: 220, height: 30 }} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm nhanh: mã, tên" />
                  <button className="btn btn-sm" type="submit">Tìm</button>
                </form>
                <span className="seg" role="tablist" title="Mặt hàng thêm trong ngày hôm nay (mới nhất trên cùng)">
                  <button type="button" className={`btn btn-sm${!f.createdFrom ? ' btn-primary' : ''}`} onClick={() => set({ createdFrom: '' })}>Tất cả</button>
                  <button type="button" className={`btn btn-sm${f.createdFrom ? ' btn-primary' : ''}`} onClick={() => set({ createdFrom: new Date(Date.now() + 7 * 3_600_000).toISOString().slice(0, 10) })}>Thêm hôm nay</button>
                </span>
                <select className="select input" style={{ height: 30 }} value={f.status} onChange={(e) => set({ status: e.target.value })}>
                  <option value="all">Mọi trạng thái</option><option value="active">Đang hoạt động</option><option value="draft">Chờ duyệt</option><option value="inactive">Ngừng hoạt động</option>
                </select>
              </>
            }
          />
          <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
          <AutoCreatedBanner />
          {q.isLoading ? <Loading /> : (
            <DataGrid
              storageKey="dm10-v3"
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
          {Number(q.data?.meta?.total ?? 0) > TRANG_MAT_HANG && <Pager page={page} pageSize={TRANG_MAT_HANG} total={Number(q.data?.meta?.total)} onPage={setPage} />}
        </div>
      </div>
      {editing && <ProductFullForm sku={editing.isNew ? null : editing.sku ?? null} initial={editing.isNew ? { groupCode: editing.groupCode ?? null } : undefined} classes={{ brand: classes.brand.data ?? [], industry: classes.industry.data ?? [], group: classes.group.data ?? [], type: classes.type.data ?? [] }} groupPath={groupPath} onClose={() => setEditing(null)} />}
    </>
  );
}
