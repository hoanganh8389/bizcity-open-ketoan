// @bizcity-layer P ui-kit
// [2026-11-08 12:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-47 (ADR-0032 D-LIB-7, PHASE-030 · 26 §4 điểm ①): LibraryPicker — ô chọn theo thư viện bizcity_library@1; chỉ mục còn dùng, giá trị tại ngày, nhãn chưa duyệt / ngừng dùng, tìm không dấu ở máy chủ
/**
 * Ô chọn dùng chung cho mọi trường lấy từ thư viện (tham số pháp lý, ngày nghỉ, mã chức năng…):
 *
 *   <LibraryPicker library="vn.tham-so-phap-ly" value={code} onChange={(v, row) => …} at={docDate} />
 *
 * Gọi `GET /api/v1/libraries/:id/items?q=&at=&group=&limit=` (core.library.items) — máy chủ tìm không dấu, lọc theo ngày, dựng
 * nhãn theo `selector` của thư viện. Ô chọn KHÔNG chặn: chặn / cảnh báo là việc của bộ kiểm (`core.library.validate`, action,
 * cửa nạp — 26 §4). Mục ngừng dùng chỉ hiện khi ô đang giữ giá trị cũ (`showDeprecated`).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useApi } from './index';

/** Một dòng ô chọn — khuôn `SelectorRow` của bizcity_library@1 §9. */
export interface LibraryRow {
  value: unknown;
  label: string;
  group?: string;
  hint?: string;
  deprecated: boolean;
  verified: boolean;
  valueAt?: unknown;
  item: Record<string, unknown>;
}

export interface LibraryItemsResult {
  library: { id: string; version: string; hash: string };
  at: string;
  total: number;
  rows: LibraryRow[];
}

export interface LibraryPickerProps {
  /** id thư viện, vd `vn.tham-so-phap-ly`. */
  library: string;
  /** Giá trị đang giữ (thường là mã mục). */
  value: string | null | undefined;
  onChange: (value: string | null, row: LibraryRow | null) => void;
  /** Ngày đọc giá trị (ngày chứng từ); bỏ trống = hôm nay. */
  at?: string;
  /** Lọc theo nhóm của thư viện. */
  group?: string;
  placeholder?: string;
  disabled?: boolean;
  /** Hiện cả mục ngừng dùng (khi sửa dữ liệu cũ). */
  showDeprecated?: boolean;
  /** Số dòng tối đa (mặc định 20). */
  limit?: number;
}

const fmtValue = (v: unknown): string => (typeof v === 'number' ? v.toLocaleString('vi-VN') : v === undefined || v === null ? '' : String(v));

/** Đợi người gõ dừng 250 ms rồi mới hỏi máy chủ. */
function useDebounced<T>(v: T, ms = 250): T {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

export function LibraryPicker({ library, value, onChange, at, group, placeholder, disabled, showDeprecated, limit = 20 }: LibraryPickerProps) {
  const api = useApi();
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const q = useDebounced(text);
  const box = useRef<HTMLDivElement>(null);
  const query = useQuery({
    queryKey: ['library-picker', library, q, at ?? '', group ?? '', showDeprecated ? 'all' : 'active', limit],
    queryFn: () => api.get<LibraryItemsResult>(`/api/v1/libraries/${encodeURIComponent(library)}/items`, {
      q: q || undefined, at, group, status: showDeprecated ? 'all' : undefined, limit,
    }),
    enabled: open && !disabled,
    staleTime: 60_000,
  });
  // Nhãn của giá trị đang giữ: tìm đúng mã đó một lần.
  const current = useQuery({
    queryKey: ['library-picker', library, 'value', value ?? '', at ?? ''],
    queryFn: () => api.get<LibraryItemsResult>(`/api/v1/libraries/${encodeURIComponent(library)}/items`, { q: value ?? undefined, at, status: 'all', limit: 5 }),
    enabled: !!value,
    staleTime: 60_000,
  });
  const currentRow = useMemo(() => current.data?.rows.find((r) => String(r.value) === String(value)) ?? null, [current.data, value]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const pick = (row: LibraryRow | null) => {
    onChange(row ? String(row.value) : null, row);
    setText('');
    setOpen(false);
  };

  return (
    <div ref={box} style={{ position: 'relative', minWidth: 0 }}>
      <input
        className="input"
        style={{ width: '100%' }}
        disabled={disabled}
        value={open ? text : currentRow ? currentRow.label : value ?? ''}
        placeholder={placeholder ?? 'Gõ để tìm (không dấu cũng được)…'}
        onFocus={() => setOpen(true)}
        onChange={(e) => { setText(e.target.value); setOpen(true); }}
        onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
        aria-label={`Chọn từ thư viện ${library}`}
      />
      {currentRow && !open ? (
        <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
          {currentRow.valueAt !== undefined ? <>giá trị tại ngày: <strong>{fmtValue(currentRow.valueAt)}</strong> · </> : null}
          {currentRow.deprecated ? <span className="badge badge-warn">ngừng dùng</span> : null}
          {!currentRow.verified ? <span className="badge badge-gray">chưa duyệt</span> : null}
        </div>
      ) : null}
      {open && !disabled ? (
        <div className="card" role="listbox" style={{ position: 'absolute', zIndex: 30, left: 0, right: 0, marginTop: 4, maxHeight: 300, overflowY: 'auto', padding: 4 }}>
          {query.isLoading ? <div className="muted" style={{ padding: 8 }}>Đang tìm…</div> : null}
          {query.error ? <div className="muted" style={{ padding: 8 }}>Không đọc được thư viện {library}</div> : null}
          {query.data && !query.data.rows.length ? <div className="muted" style={{ padding: 8 }}>Không có mục khớp — bộ kiểm sẽ gợi ý mục gần nhất (LIB-UNKNOWN-001)</div> : null}
          {query.data?.rows.map((r) => (
            <button
              key={String(r.value)}
              type="button"
              role="option"
              aria-selected={String(r.value) === String(value)}
              onClick={() => pick(r)}
              style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 8, padding: '6px 8px', background: 'none', border: 0, textAlign: 'left', cursor: 'pointer', borderRadius: 6 }}
            >
              <span style={{ minWidth: 0 }}>
                {r.label}
                {r.hint ? <span className="muted" style={{ display: 'block', fontSize: 12 }}>{r.hint}</span> : null}
              </span>
              <span style={{ whiteSpace: 'nowrap', fontSize: 12 }}>
                {r.valueAt !== undefined ? <strong>{fmtValue(r.valueAt)} </strong> : null}
                {r.deprecated ? <span className="badge badge-warn">ngừng dùng</span> : null}
                {!r.verified ? <span className="badge badge-gray">chưa duyệt</span> : null}
              </span>
            </button>
          ))}
          {query.data ? <div className="muted" style={{ fontSize: 11, padding: '4px 8px' }}>{library}@{query.data.library.version} · tại {query.data.at} · {query.data.total} mục</div> : null}
          {value ? <button type="button" className="btn btn-xs" style={{ margin: 4 }} onClick={() => pick(null)}>Bỏ chọn</button> : null}
        </div>
      ) : null}
    </div>
  );
}
