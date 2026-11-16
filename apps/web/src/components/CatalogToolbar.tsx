/**
 * Thanh nút chung của màn danh mục: Thêm · Sửa · Xoá · Nạp · Xuất.
 * Phím tắt (chỉ khi màn đang hiện): Ctrl+N / Ctrl+Insert thêm, Ctrl+E sửa, Ctrl+Delete xoá, F5 nạp lại, Ctrl+F8 xuất Excel.
 * Sửa / Xoá làm trên dòng đang chọn của bảng; bấm đúp một dòng cũng là Sửa.
 * Bố cục danh mục (`phai` hoặc có `left`): `left` (vd chọn kiểu xem) bên trái, các nút chức năng dồn sang lề phải, nút cao 28px;
 * không có nút Sửa — bấm đúp dòng mở hộp thoại chi tiết, sửa ở đó (Ctrl+E vẫn dùng được); nút In màn đang xem đứng cạnh Xuất
 * (nút In ở tiêu đề trang tự ẩn).
 */
import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Pencil, Plus, Printer, RefreshCw } from 'lucide-react';
import { openNextInEdit } from '@/components/ui';
import { ThungRacDanhMuc } from '@/components/ThungRacDanhMuc';

export function CatalogToolbar({ onAdd, onEdit, onDelete, onRefresh, onExport, canWrite, hasSelection, busy, extra, left, phai, trash }: {
  onAdd?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  /** Nạp lại: trả về Promise (ví dụ q.refetch()) thì nút quay đến khi xong và báo giờ nạp. */
  onRefresh?: () => unknown;
  onExport?: () => void;
  canWrite: boolean;
  hasSelection: boolean;
  busy?: boolean;
  extra?: React.ReactNode;
  left?: React.ReactNode;
  /** Dồn nút chức năng sang lề phải dù không có `left`. */
  phai?: boolean;
  /** [2026-11-17 Nguyễn Văn Thủy] Xoá / Thùng rác / Xoá hết chung (catalog-trash) (đóng góp) */
  trash?: { catalog: string; title: string; sel?: { key: string; label?: string } | null };
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [loadedAt, setLoadedAt] = useState<string | null>(null);
  const refresh = async () => {
    if (!onRefresh || loading) return;
    setLoading(true);
    try { await onRefresh(); setLoadedAt(new Date().toLocaleTimeString('vi-VN')); } finally { setLoading(false); }
  };
  const handlers = useRef({ onAdd, onEdit, onDelete, onRefresh: onRefresh ? () => void refresh() : undefined, onExport, canWrite, hasSelection });
  handlers.current = { onAdd, onEdit, onDelete, onRefresh: onRefresh ? () => void refresh() : undefined, onExport, canWrite, hasSelection };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!ref.current || ref.current.offsetParent === null) return; // thẻ đang ẩn
      if (document.querySelector('.modal-mask')) return; // đang mở form
      const h = handlers.current;
      const run = (fn?: () => void, ok = true) => { if (fn && ok) { e.preventDefault(); fn(); } };
      if (e.key === 'F5' && !e.ctrlKey) return run(h.onRefresh);
      if (!e.ctrlKey) return;
      if (e.key === 'n' || e.key === 'N' || e.key === 'Insert') return run(h.onAdd, h.canWrite);
      if (e.key === 'e' || e.key === 'E') return run(h.onEdit && (() => { openNextInEdit(); h.onEdit?.(); }), h.canWrite && h.hasSelection);
      // [2026-11-12 Nguyễn Văn Thủy] tạm không cho xoá ở danh mục (đóng góp)
      if (e.key === 'Delete') return;
      if (e.key === 'F8') return run(h.onExport);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  const danhMuc = Boolean(left || phai);
  return (
    <div className={`catalog-toolbar${danhMuc ? ' canh-phai' : ''}`} ref={ref}>
      {/* [2026-11-16 kiennt] phần bên trái tuỳ chọn, nút chức năng sang lề phải (đóng góp) */}
      {left}{danhMuc && <span className="spacer" />}
      {onAdd && <button className="btn btn-sm btn-primary" disabled={!canWrite} onClick={onAdd} title="Thêm (Ctrl+N)"><Plus size={14} /> Thêm</button>}
      {onEdit && !danhMuc && <button className="btn btn-sm" disabled={!canWrite || !hasSelection} onClick={() => { openNextInEdit(); onEdit(); }} title="Sửa dòng đang chọn (Ctrl+E) — mở thẳng chế độ sửa; bấm đúp dòng để xem"><Pencil size={14} /> Sửa</button>}
      {onRefresh && <button className="btn btn-sm" disabled={loading} onClick={() => void refresh()} title="Nạp lại dữ liệu mới nhất từ máy chủ (F5)"><RefreshCw size={14} className={loading ? 'spin' : undefined} /> {loading ? 'Đang nạp…' : 'Nạp'}</button>}
      {onExport && <button className="btn btn-sm" onClick={onExport} title="Xuất Excel (Ctrl+F8)"><FileSpreadsheet size={14} /> Xuất</button>}
      {danhMuc && <button className="btn btn-sm" onClick={() => window.print()} title="In màn hình đang xem"><Printer size={14} /> In</button>}
      {trash && <ThungRacDanhMuc catalog={trash.catalog} title={trash.title} sel={trash.sel} />}
      {/* [2026-11-16 kiennt] màn danh mục không hiện dòng "Đã nạp lúc…" — nút Nạp quay khi đang nạp là đủ (đóng góp) */}
      {loadedAt && !loading && !danhMuc && <span className="refresh-note">Đã nạp lúc {loadedAt}</span>}
      {extra}
    </div>
  );
}
