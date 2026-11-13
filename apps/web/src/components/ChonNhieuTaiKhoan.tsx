// [2026-11-13 Nguyễn Văn Thủy] Ô chọn nhiều tài khoản bằng ô tích (danh sách lọc của Tài khoản ngầm định…) (đóng góp)
/**
 * Bấm vào ô → xổ toàn bộ hệ thống tài khoản (thụt theo cấp) có ô tích và ô tìm theo số / tên.
 * Tích tài khoản tổng hợp (vd 111) = gồm mọi tài khoản con (con hiện đã tích, mờ). Giá trị: danh sách số tài khoản.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { plain, useAccountList } from './pickers';

export function ChonNhieuTaiKhoan({ value, onChange, disabled, placeholder = 'Mọi tài khoản' }: {
  value: string[]; onChange: (v: string[]) => void; disabled?: boolean; placeholder?: string;
}) {
  const { data = [] } = useAccountList();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  /** Vị trí nổi (fixed) để không bị hộp thoại cắt: mở xuống, thiếu chỗ thì mở lên. */
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number; max: number } | null>(null);
  const place = () => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    const below = window.innerHeight - r.bottom - 12, above = r.top - 12;
    const width = Math.max(r.width, 380);
    const left = Math.min(r.left, window.innerWidth - width - 8);
    setPos(below >= 260 || below >= above ? { left, width, top: r.bottom + 2, max: Math.max(160, below - 60) } : { left, width, bottom: window.innerHeight - r.top + 2, max: Math.max(160, above - 60) });
  };
  useEffect(() => {
    if (!open) return;
    place();
    const close = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !panel.current?.contains(t)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const names = useMemo(() => new Map(data.map((a) => [a.code, a.name])), [data]);
  const s = plain(q.trim());
  const rows = useMemo(() => data.filter((a) => a.isActive !== false && !a.code.startsWith('0'))
    .filter((a) => !s || a.code.startsWith(s) || plain(a.name).includes(s))
    .sort((a, b) => a.code.localeCompare(b.code)), [data, s]);
  /** Đã gồm bởi một tài khoản cha đang tích. */
  const coveredBy = (code: string) => value.find((v) => v !== code && code.startsWith(v));
  const toggle = (code: string) => {
    if (value.includes(code)) return onChange(value.filter((v) => v !== code));
    // tích cha thì bỏ các con đã tích riêng (đã gồm)
    onChange([...value.filter((v) => !v.startsWith(code)), code].sort());
  };
  return (
    <div ref={box} style={{ position: 'relative' }}>
      <div className="input" role="button" tabIndex={disabled ? -1 : 0} aria-disabled={disabled}
        style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center', minHeight: 30, cursor: disabled ? 'default' : 'pointer', background: disabled ? 'var(--surface-2, #f4f6f9)' : undefined }}
        onClick={() => !disabled && setOpen((x) => !x)} onKeyDown={(e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen((x) => !x); } }}>
        {value.length ? value.map((v) => (
          <span key={v} className="mono" title={names.get(v) ?? ''} style={{ background: 'var(--surface-2, #eef2f7)', borderRadius: 4, padding: '0 6px', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
            {v}{!disabled && <X size={11} style={{ cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); toggle(v); }} />}
          </span>
        )) : <span className="muted">{placeholder}</span>}
        {!disabled && <ChevronDown size={14} style={{ marginLeft: 'auto' }} className="muted" />}
      </div>
      {open && pos && (
        <div ref={panel} style={{ position: 'fixed', zIndex: 2000, left: pos.left, width: pos.width, top: pos.top, bottom: pos.bottom, background: 'var(--surface, #fff)', border: '1px solid var(--border, #d0d7e2)', borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,.18)' }}>
          <div style={{ padding: 6, display: 'flex', gap: 6 }}>
            <input className="input" autoFocus placeholder="Tìm số hoặc tên tài khoản" value={q} onChange={(e) => setQ(e.target.value)} />
            {value.length > 0 && <button type="button" className="btn btn-sm" onClick={() => onChange([])} title="Bỏ hết: chọn được mọi tài khoản">Bỏ hết</button>}
          </div>
          <div style={{ maxHeight: Math.min(360, pos.max), overflowY: 'auto', padding: '0 6px 6px' }}>
            {rows.slice(0, 600).map((a) => {
              const parent = coveredBy(a.code);
              const checked = value.includes(a.code) || Boolean(parent);
              return (
                <label key={a.code} className="checkbox" title={parent ? `Đã gồm trong ${parent}` : undefined}
                  style={{ display: 'flex', gap: 6, padding: '2px 0', paddingLeft: s ? 0 : Math.max(0, (a.level ?? 1) - 1) * 16, opacity: parent ? 0.55 : 1, fontWeight: a.isPosting ? undefined : 600 }}>
                  <input type="checkbox" checked={checked} disabled={Boolean(parent)} onChange={() => toggle(a.code)} />
                  <span className="mono" style={{ minWidth: 64 }}>{a.code}</span><span>{a.name}</span>
                </label>
              );
            })}
            {!rows.length && <div className="muted" style={{ padding: 6 }}>Không có tài khoản khớp</div>}
          </div>
        </div>
      )}
    </div>
  );
}
