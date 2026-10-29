/**
 * CHỌN CHỨNG TỪ — thay ô xổ xuống khi danh sách dài (đơn đặt hàng, hoá đơn NCC, phiếu nhập gốc…):
 *   ô hiển thị chứng từ đang chọn + nút "Chọn…" (và ✕ bỏ chọn) → hộp tìm kiếm: gõ tìm (số, ghi chú, mã hàng…), lọc theo ngày,
 *   nút lọc nhanh tuỳ màn, bảng đủ thông tin (kéo giãn / lọc / sắp xếp như mọi bảng), bấm đôi hoặc "Chọn" là chọn.
 * Mỗi chỗ dùng chỉ khai: các dòng, cột, ngày của dòng, chữ để tìm, câu hiển thị khi đã chọn.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Modal } from '@/components/ui';
import { DataGrid, type Column } from '@/components/DataGrid';

const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase();

export interface ChipFilter<T> { key: string; label: string; test: (row: T) => boolean; on?: boolean }

export interface ChonChungTuProps<T> {
  title: string;
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Ngày (YYYY-MM-DD) để lọc từ / đến. */
  dateOf: (row: T) => string;
  /** Chữ để tìm (số chứng từ, ghi chú, mã / tên hàng…). */
  searchOf: (row: T) => string;
  onPick: (row: T) => void;
  onClose: () => void;
  /** Nút lọc nhanh (bật / tắt), vd "Chỉ đơn còn chờ giao". */
  chips?: ChipFilter<T>[];
  /** Lựa chọn "không chọn" (vd Không theo đơn — nhập ngoài đơn). */
  noneLabel?: string;
  onNone?: () => void;
  storageKey: string;
  note?: ReactNode;
}

export function ChonChungTu<T>({ title, rows, columns, rowKey, dateOf, searchOf, onPick, onClose, chips = [], noneLabel, onNone, storageKey, note }: ChonChungTuProps<T>) {
  const [q, setQ] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(chips.map((c) => [c.key, Boolean(c.on)])));
  const [sel, setSel] = useState<T | null>(null);
  const shown = useMemo(() => {
    const words = plain(q.trim()).split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      const d = dateOf(r);
      if ((from && d < from) || (to && d > to)) return false;
      if (chips.some((c) => on[c.key] && !c.test(r))) return false;
      const text = plain(searchOf(r));
      return words.every((w) => text.includes(w));
    });
  }, [rows, q, from, to, on, chips, dateOf, searchOf]);
  return (
    <Modal wide title={title} onClose={onClose}
      footer={<>
        {noneLabel && onNone && <button className="btn" onClick={() => { onNone(); onClose(); }}>{noneLabel}</button>}
        <button className="btn btn-primary" disabled={!sel} onClick={() => { if (sel) { onPick(sel); onClose(); } }}>Chọn</button>
        <button className="btn" onClick={onClose}>Đóng</button>
      </>}>
      <div className="full">
        <div className="filters" style={{ padding: '0 0 6px' }}>
          <span className="row" style={{ alignItems: 'center', gap: 4 }}><Search size={14} />
            <input className="input" style={{ width: 320 }} autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Gõ tìm: số, ghi chú, mã / tên hàng… (nhiều từ = phải có đủ)" /></span>
          <span style={{ fontSize: 13 }}>Ngày từ</span><input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          <span style={{ fontSize: 13 }}>đến</span><input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          {chips.map((c) => <label key={c.key} className="row" style={{ gap: 4, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={Boolean(on[c.key])} onChange={(e) => setOn({ ...on, [c.key]: e.target.checked })} /> {c.label}</label>)}
          <span className="muted" style={{ fontSize: 12 }}>{shown.length} / {rows.length} chứng từ · bấm đôi để chọn</span>
        </div>
        {note && <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{note}</div>}
        <DataGrid storageKey={storageKey} rows={shown} rowKey={rowKey} columns={columns} maxHeight="55vh" onSelect={setSel}
          onRowDoubleClick={(r) => { onPick(r); onClose(); }} emptyText={rows.length ? 'Không có chứng từ khớp điều kiện tìm' : 'Chưa có chứng từ nào'} />
      </div>
    </Modal>
  );
}

/** Ô hiển thị chứng từ đang chọn + nút mở hộp chọn + nút bỏ chọn. */
export function OChonChungTu({ text, placeholder, onOpen, onClear, disabled, count }: { text?: string; placeholder: string; onOpen: () => void; onClear?: () => void; disabled?: boolean; count?: number }) {
  return (
    <div className="row" style={{ gap: 4, alignItems: 'center' }}>
      <button type="button" className="input" disabled={disabled} onClick={onOpen} style={{ flex: 1, textAlign: 'left', cursor: disabled ? 'default' : 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        title={text || placeholder}>
        {text ? <span>{text}</span> : <span className="muted">{placeholder}</span>}
      </button>
      {!disabled && <button type="button" className="btn btn-sm" onClick={onOpen}>Chọn…{count !== undefined ? ` (${count})` : ''}</button>}
      {!disabled && text && onClear && <button type="button" className="btn btn-sm" title="Bỏ chọn" onClick={onClear}><X size={12} /></button>}
    </div>
  );
}
