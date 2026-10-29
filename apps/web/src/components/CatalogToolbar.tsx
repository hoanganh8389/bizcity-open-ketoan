/**
 * Thanh nút chung của màn danh mục: Thêm · Sửa · Xoá · Nạp · Xuất.
 * Phím tắt (chỉ khi màn đang hiện): Ctrl+N / Ctrl+Insert thêm, Ctrl+E sửa, Ctrl+Delete xoá, F5 nạp lại, Ctrl+F8 xuất Excel.
 * Sửa / Xoá làm trên dòng đang chọn của bảng; bấm đúp một dòng cũng là Sửa.
 */
import { useEffect, useRef, useState } from 'react';
import { FileSpreadsheet, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { openNextInEdit } from '@/components/ui';

export function CatalogToolbar({ onAdd, onEdit, onDelete, onRefresh, onExport, canWrite, hasSelection, busy, extra }: {
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
      if (e.key === 'Delete') return run(h.onDelete, h.canWrite && h.hasSelection);
      if (e.key === 'F8') return run(h.onExport);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, []);

  return (
    <div className="catalog-toolbar" ref={ref}>
      {onAdd && <button className="btn btn-sm" disabled={!canWrite} onClick={onAdd} title="Thêm (Ctrl+N)"><Plus size={14} /> Thêm</button>}
      {onEdit && <button className="btn btn-sm" disabled={!canWrite || !hasSelection} onClick={() => { openNextInEdit(); onEdit(); }} title="Sửa dòng đang chọn (Ctrl+E) — mở thẳng chế độ sửa; bấm đúp dòng để xem"><Pencil size={14} /> Sửa</button>}
      {onDelete && <button className="btn btn-sm" disabled={!canWrite || !hasSelection || busy} onClick={onDelete} title="Xoá dòng đang chọn (Ctrl+Delete)"><Trash2 size={14} /> Xoá</button>}
      {onRefresh && <button className="btn btn-sm" disabled={loading} onClick={() => void refresh()} title="Nạp lại dữ liệu mới nhất từ máy chủ (F5)"><RefreshCw size={14} className={loading ? 'spin' : undefined} /> {loading ? 'Đang nạp…' : 'Nạp'}</button>}
      {onExport && <button className="btn btn-sm" onClick={onExport} title="Xuất Excel (Ctrl+F8)"><FileSpreadsheet size={14} /> Xuất</button>}
      {loadedAt && !loading && <span className="refresh-note">Đã nạp lúc {loadedAt}</span>}
      {extra}
    </div>
  );
}
