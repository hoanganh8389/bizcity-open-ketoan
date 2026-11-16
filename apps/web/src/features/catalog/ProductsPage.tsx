/**
 * Danh mục mặt hàng (DM10). Cây nhóm hàng (DM11) ở NhomHangPage.tsx.
 * DM10: cây nhóm hàng bên trái; lưới Mã hàng · Tên hàng · Ghi chú · Nhóm hàng · ĐVT · Ngành hàng · Nhãn hàng · Mã VAT ra ·
 * Mã VAT vào · Nhóm hạch toán · Theo dõi. Đây là danh mục hàng CHUẨN: thêm / sửa ở form trọn (ProductFullForm — thông tin,
 * đơn vị tính + tỉ lệ, giá bảng giá công ty / chi nhánh, cờ trạng thái); hệ thống bán hàng kéo về qua /api/v1/catalog/feed.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Tag } from 'lucide-react';
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
import { GroupTree } from './GroupTree';
import { ProductFullForm } from './ProductFullForm';
// [2026-11-07 05:50 PM Nguyễn Văn Thủy] PHASE-026 — mã số cha – con GĐ 1: cột Biến thể cạnh mã, lọc theo biến thể, Loại hàng (đóng góp)
import { PrintButton, resolveScreen, useEffectivePrintSettings } from '@/components/print';
import { PRODUCT_LABEL_TEMPLATES, loadLabelItems, type LabelItem } from './productPrint';
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
  const [group, setGroup] = useState<string | null>(null);
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
  // [2026-11-16 kiennt] bỏ thanh lọc trên (tìm, ngày thêm, trạng thái): lọc theo từng cột ở bảng (đóng góp)
  const params = { page, pageSize: TRANG_MAT_HANG, group: group ?? undefined, status: 'all' };
  const q = useQuery({ queryKey: ['products', params], queryFn: () => api.getPage<Product[]>('/api/v1/products', params), placeholderData: keepPreviousData });
  const groupPath = useMemo(() => pathOf(classes.group.data ?? []), [classes.group.data]);
  const nameOf = (k: ClassKind, c: string | null) => (c ? classes[k].data?.find((x) => x.code === c)?.name ?? c : '');
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
    // [2026-11-16 kiennt] dễ nhìn: Nhóm hàng hiện tên nhóm cuối (rê chuột xem đường dẫn; lọc vẫn theo cả đường dẫn); cột tạo ẩn, "Lúc" → "Ngày" (đóng góp)
    { key: 'groupCode', header: 'Nhóm hàng', width: 200, value: (p) => groupPath(p.groupCode), render: (p) => { const full = groupPath(p.groupCode); return <span title={full}>{full.split(' / ').pop()}</span>; } },
    { key: 'unit', header: 'ĐVT', width: 70 },
    // [2026-11-12 Nguyễn Văn Thủy] một cột Thuế GTGT (%) thay Mã VAT ra / vào, TTĐB (đóng góp)
    { key: 'taxOutCode', header: 'Thuế GTGT (%)', width: 100, title: 'Thuế suất GTGT bán ra', value: (p) => ({ KCT: 'KCT', R00K: 'KCT', R00: '0%', R05: '5%', R08: '8%', R10: '10%' } as Record<string, string>)[p.taxOutCode ?? ''] ?? (p.taxOutCode ?? '') },
    { key: 'postingGroupCode', header: 'Nhóm hạch toán (cũ)', type: 'code', width: 120, hidden: true, value: (p) => p.postingGroupCode ?? '(mặc định)' },
    // [2026-11-12 Nguyễn Văn Thủy] Trạng thái sản phẩm thay ô Theo dõi: Đang hoạt động / Chờ duyệt / Ngừng hoạt động (đóng góp)
    // [2026-11-12 Nguyễn Văn Thủy] truy vết: người tạo, lúc tạo (0114) (đóng góp)
    { key: 'isActive', header: 'Trạng thái', width: 130, title: 'Đang hoạt động · Chờ duyệt (mặt hàng nháp, chưa dùng được trên chứng từ) · Ngừng hoạt động', value: (p) => trangThai(p), render: (p) => <span className={`badge ${!p.isActive ? 'badge-gray' : p.isDraft ? 'badge-warn' : 'badge-ok'}`}>{trangThai(p)}</span> },
    { key: 'createdBy', header: 'Người tạo', width: 140, hidden: true, title: 'Người thêm mặt hàng; "Hệ thống (…)" = thêm tự động', value: (p) => p.createdBy ?? '' },
    { key: 'createdAt', header: 'Ngày tạo', width: 140, hidden: true, title: 'Thời điểm thêm mặt hàng', value: (p) => (p.createdAt ? new Date(p.createdAt).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') },
    { key: 'updatedBy', header: 'Người sửa', width: 140, title: 'Người sửa lần cuối', value: (p) => p.updatedBy ?? '' },
    { key: 'updatedAt', header: 'Ngày sửa', width: 140, title: 'Thời điểm sửa lần cuối', value: (p) => (p.updatedAt ? new Date(p.updatedAt).toLocaleString('vi-VN', { hour12: false, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '') },
    { key: 'sourceSystem', header: 'Nguồn', width: 130, hidden: true, value: (p) => SOURCE[p.sourceSystem] ?? p.sourceSystem },
  ];

  const [treeOpen, setTreeOpen] = useState(() => { try { return localStorage.getItem('dm10-cay-mo') !== '0'; } catch { return true; } });
  const [treeW, setTreeW] = useState(() => { try { const w = Number(localStorage.getItem('dm10-cay-rong')); return w >= 160 && w <= 700 ? w : 280; } catch { return 280; } });
  const saveTree = (open: boolean, w: number) => { setTreeOpen(open); setTreeW(w); try { localStorage.setItem('dm10-cay-mo', open ? '1' : '0'); localStorage.setItem('dm10-cay-rong', String(w)); } catch { /* bỏ qua */ } };
  const keoTree = (e: React.MouseEvent) => {
    e.preventDefault();
    const x0 = e.clientX, w0 = treeW;
    document.body.style.userSelect = 'none'; // kéo không bôi đen chữ
    let w = w0;
    const move = (ev: MouseEvent) => { w = Math.min(700, Math.max(160, w0 + ev.clientX - x0)); setTreeW(w); };
    const up = () => { document.body.style.userSelect = ''; window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); saveTree(true, w); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };
  return (
    <>
      <PageHeader title="Quản lý mặt hàng" code="DM10" subtitle="Danh mục hàng chuẩn: thông tin, đơn vị tính + tỉ lệ quy đổi, giá bán bảng giá công ty / chi nhánh, trạng thái bán — hệ thống bán hàng kéo về" helpKey="mat-hang" />
      {/* [2026-11-17 Nguyễn Văn Thủy] khung Nhóm hàng kéo giãn được (mép phải) và thu gọn / mở; nhớ theo trình duyệt (đóng góp) */}
      <div className="acc17" style={{ gridTemplateColumns: `${treeOpen ? treeW : 28}px minmax(0, 1fr)` }}>
        {treeOpen ? (
          <div className="card acc17-tree" style={{ position: 'relative' }}>
            <div className="acc17-tree-head row" style={{ alignItems: 'center' }}>
              <span>Nhóm hàng</span>
              <button type="button" className="btn btn-xs" style={{ marginLeft: 'auto' }} title="Thu gọn khung nhóm hàng" onClick={() => saveTree(false, treeW)}>«</button>
            </div>
            {classes.group.isLoading ? <Loading /> : <GroupTree classes={classes.group.data ?? []} value={group} onChange={(g) => { setGroup(g); setPage(1); }} />}
            <div title="Kéo để giãn / co" onMouseDown={keoTree} style={{ position: 'absolute', top: 0, right: -6, width: 10, height: '100%', cursor: 'col-resize' }} />
          </div>
        ) : (
          <button type="button" className="card" title={group ? `Mở khung nhóm hàng (đang lọc: ${group})` : 'Mở khung nhóm hàng'} onClick={() => saveTree(true, treeW)}
            style={{ height: 160, padding: 0, cursor: 'pointer', writingMode: 'vertical-rl', fontWeight: 600, background: group ? 'var(--brand-50, #e8f0fe)' : undefined }}>» Nhóm hàng</button>
        )}
        <div className="card acc17-main">
          <CatalogToolbar
            phai
            trash={{ catalog: 'products', title: 'Mặt hàng', sel: sel ? { key: sel.sku, label: sel.name } : null }}
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
                <NutInTem sel={sel} viewCount={() => viewRef.current.length} scope={labelScope} setScope={setLabelScope} copies={labelCopies} setCopies={setLabelCopies} getDocs={labelDocs} />
              </>
            }
          />
          <ErrorBox error={q.error ? errorText(q.error) : del.error ? errorText(del.error) : null} />
          <AutoCreatedBanner />
          {q.isLoading ? <Loading /> : (
            <DataGrid
              storageKey="dm10-v4"
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

// [2026-11-16 kiennt] In tem gọn: một nút "In tem ▾" mở bảng nhỏ chọn phạm vi, số tem mỗi mã, mẫu tem (đóng góp)
/**
 * Bảng luôn gắn trong cây (chỉ ẩn / hiện) để lệnh in đang chạy của PrintButton không bị gỡ khi đóng bảng.
 * Bấm ra ngoài thì đóng. Mẫu tem chọn ở ô Mẫu tem (nhớ làm mặc định khi in).
 */
function NutInTem({ sel, viewCount, scope, setScope, copies, setCopies, getDocs }: {
  sel: Product | null; viewCount: () => number; scope: 'sel' | 'view'; setScope: (s: 'sel' | 'view') => void;
  copies: number; setCopies: (n: number) => void; getDocs: () => Promise<LabelItem[]>;
}) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLSpanElement>(null);
  // Mẫu tem chọn ngay trong bảng (ô chọn), không mở thêm danh sách mẫu thứ hai; mẫu tắt ở HT05 không hiện.
  const resolved = resolveScreen('DM10', PRODUCT_LABEL_TEMPLATES, useEffectivePrintSettings().data);
  // Thứ tự: mẫu vừa chọn ở ô → mặc định đặt ở HT05 → mẫu nhớ trên máy → mẫu đầu (như PrintButton).
  const [mau, setMau] = useState('');
  const coMau = (id: string | null | undefined) => (id && resolved.templates.some((x) => x.template.id === id) ? id : undefined);
  const nho = (() => { try { return window.localStorage.getItem('print-default:DM10'); } catch { return null; } })();
  const mauId = coMau(mau) ?? coMau(resolved.defaultId) ?? coMau(nho) ?? resolved.templates[0]?.template.id ?? '';
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { const t = e.target as HTMLElement; if (!box.current?.contains(t)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const n = scope === 'sel' ? (sel ? 1 : 0) : viewCount();
  return (
    <span className="in-tem" ref={box}>
      <button type="button" className={`btn btn-sm${open ? ' active' : ''}`} aria-expanded={open} title="In tem mã vạch / tem kệ" onClick={() => setOpen((o) => !o)}><Tag size={14} /> In tem <ChevronDown size={13} /></button>
      <div className="in-tem-pop" hidden={!open} data-view-ok>
        <b>In tem mã vạch</b>
        <label className="radio"><input type="radio" name="in-tem-pham-vi" checked={scope === 'sel'} onChange={() => setScope('sel')} /> Mã đang chọn{sel ? <span className="muted mono"> {sel.sku}</span> : <span className="muted"> (chưa chọn)</span>}</label>
        <label className="radio"><input type="radio" name="in-tem-pham-vi" checked={scope === 'view'} onChange={() => setScope('view')} /> Mọi dòng đang hiện <span className="muted">({viewCount().toLocaleString('vi-VN')})</span></label>
        <label className="in-tem-so">Mẫu tem
          <select className="select input" value={mauId} onChange={(e) => setMau(e.target.value)}>
            {resolved.templates.map((x) => <option key={x.template.id} value={x.template.id}>{x.template.name}</option>)}
          </select>
        </label>
        <label className="in-tem-so">Số tem mỗi mã
          <input className="input num" type="number" min={1} max={500} value={copies} onChange={(e) => setCopies(Math.max(1, Math.min(500, Math.floor(Number(e.target.value)) || 1)))} />
        </label>
        <div className="in-tem-foot">
          <span className="muted">{n ? `${(n * copies).toLocaleString('vi-VN')} tem` : 'Chưa có mã để in'}</span>
          <PrintButton screen="DM10" label="In tem" small templateId={mauId} templates={PRODUCT_LABEL_TEMPLATES} disabled={!n} getDocs={getDocs} />
        </div>
      </div>
    </span>
  );
}
