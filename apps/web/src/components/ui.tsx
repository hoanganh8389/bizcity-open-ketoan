/**
 * Thành phần giao diện nhỏ, dùng chung ở mọi màn hình.
 */
import { useKiemLoi } from './useKiemLoi';
import { Children, Fragment, isValidElement, useCallback, useEffect, useRef, useState, type InputHTMLAttributes, type ReactElement, type ReactNode, type SyntheticEvent } from 'react';
import { DockScope, MinimizeButton, useDockWindow } from '@/layout/WindowDock';
import { X } from 'lucide-react';
import { money, parseNum, price as priceText } from '@/lib/format';

/** Ô số tiền: căn phải, số âm màu đỏ, 0 để trống (mặc định). */
export function Money({ value, blankZero = true, bold }: { value: number | null | undefined; blankZero?: boolean; bold?: boolean }) {
  const v = value ?? 0;
  return <span className={`${v < 0 ? 'neg' : ''}`} style={bold ? { fontWeight: 700 } : undefined}>{money(v, { blankZero })}</span>;
}

/**
 * Ô nhập số có số lẻ (đơn giá, số lượng): đang gõ thì giữ nguyên chữ người dùng gõ (gõ được "506.018,52"),
 * rời ô thì định dạng lại. Ô cũ định dạng lại mỗi phím nên nuốt mất dấu phẩy, không gõ được số lẻ.
 * Không nhận số âm (trừ khi allowNegative). Trống → onChange(null).
 */
export function NumInput({ value, onChange, decimals = 4, allowNegative, blankZero = true, step, className = 'input num', ...rest }: {
  value: number | null | undefined; onChange: (v: number | null) => void; decimals?: number; allowNegative?: boolean; blankZero?: boolean;
  /** Có step: hiện nút ▲▼ tăng / giảm (bấm, hoặc giữ Ctrl + ↑ ↓ trong ô). Không âm trừ khi allowNegative. */
  step?: number;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState<string | null>(null);
  const shown = value === null || value === undefined || (value === 0 && blankZero) ? '' : priceText(Math.round(value * 10 ** decimals) / 10 ** decimals);
  const bump = (d: number) => { const n = Math.round(((value ?? 0) + d) * 10 ** decimals) / 10 ** decimals; setText(null); onChange(allowNegative ? n : Math.max(0, n)); };
  const input = <input {...rest} className={className} inputMode="decimal" value={text ?? shown}
    onFocus={(e) => { setText(shown); rest.onFocus?.(e); }}
    onBlur={(e) => { setText(null); rest.onBlur?.(e); }}
    onKeyDown={(e) => { if (step && e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); bump(e.key === 'ArrowUp' ? step : -step); } rest.onKeyDown?.(e); }}
    onChange={(e) => {
      const raw = allowNegative ? e.target.value : e.target.value.replace(/-/g, '');
      setText(raw);
      onChange(parseNum(raw, decimals));
    }} />;
  if (!step || rest.disabled) return input;
  return (
    <span className="num-step">
      {input}
      <span className="num-step-btns">
        <button type="button" tabIndex={-1} title={`Tăng ${step} (Ctrl + ↑)`} onClick={(e) => { e.stopPropagation(); bump(step); }}>▲</button>
        <button type="button" tabIndex={-1} title={`Giảm ${step} (Ctrl + ↓)`} onClick={(e) => { e.stopPropagation(); bump(-step); }}>▼</button>
      </span>
    </span>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  posted: { label: 'Đã ghi sổ', cls: 'badge-ok' },
  pending: { label: 'Chờ định khoản', cls: 'badge-warn' },
  error: { label: 'Lỗi', cls: 'badge-bad' },
  cancelled: { label: 'Đã huỷ', cls: 'badge-gray' },
  reversed: { label: 'Đã đảo', cls: 'badge-gray' },
  unchanged: { label: 'Không đổi', cls: 'badge-info' },
};
export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: 'badge-gray' };
  return <span className={`badge ${s.cls}`}>{s.label}</span>;
}

export function Loading({ text = 'Đang tải…' }: { text?: string }) {
  return <div className="empty">{text}</div>;
}

export function ErrorBox({ error }: { error: string | null | undefined }) {
  if (!error) return null;
  return <div className="alert alert-bad" style={{ margin: 12 }}>{error}</div>;
}

/**
 * Trạng thái trống: hình nhỏ + một câu + nút hành động (vd "+ Thêm", "Nhập từ Excel") để người dùng biết bước tiếp theo.
 * [2026-11-11 Nguyễn Văn Thủy] thêm hình và `actions` (đóng góp).
 */
export function Empty({ text = 'Không tìm thấy bản ghi nào thỏa mãn điều kiện', actions }: { text?: string; actions?: ReactNode }) {
  return (
    <div className="empty empty-state">
      <svg className="empty-art" width="72" height="60" viewBox="0 0 72 60" aria-hidden="true">
        <rect x="10" y="14" width="52" height="40" rx="5" fill="var(--brand-50)" stroke="var(--brand-500)" strokeWidth="1.5" />
        <path d="M10 22h52" stroke="var(--brand-500)" strokeWidth="1.5" />
        <rect x="18" y="29" width="22" height="3" rx="1.5" fill="var(--brand-100)" />
        <rect x="18" y="36" width="34" height="3" rx="1.5" fill="var(--brand-100)" />
        <rect x="18" y="43" width="16" height="3" rx="1.5" fill="var(--brand-100)" />
        <circle cx="56" cy="14" r="9" fill="#fff" stroke="var(--brand-500)" strokeWidth="1.5" />
        <path d="M56 10v8M52 14h8" stroke="var(--brand-600)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <div>{text}</div>
      {actions && <div className="empty-actions">{actions}</div>}
    </div>
  );
}

/** Ngăn trượt bên phải (xem chi tiết, hướng dẫn). Esc để đóng. */
export function Drawer({ title, onClose, children, narrow, actions }: { title: ReactNode; onClose: () => void; children: ReactNode; narrow?: boolean; actions?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <>
      <div className="drawer-mask" onClick={onClose} />
      <aside className={`drawer ${narrow ? 'narrow' : ''}`} role="dialog" aria-modal="true">
        <div className="drawer-head">
          <h2>{title}</h2>
          <div className="row">
            {actions}
            <button className="btn btn-ghost" onClick={onClose} aria-label="Đóng"><X size={18} /></button>
          </div>
        </div>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}

/**
 * Hộp thoại nhập liệu. `wide`: bản rộng cho phiếu có bảng nhiều cột.
 * `viewFirst` (bản ghi đã có): mở ở chế độ XEM — mọi ô nhập, nút thao tác trong thân bị khoá, chân hộp thoại chỉ có
 * [Sửa] [Thoát] (+ `viewActions`, ví dụ Xoá / In); bấm Sửa mới mở khoá và hiện chân hộp thoại của form (Ghi…).
 * Thẻ (tab), nút Hướng dẫn, liên kết và phần tử gắn data-view-ok vẫn bấm được khi đang xem.
 * Nút ở chân form gắn data-view-ok (Xoá, In, Huỷ phiếu…) tự hiện cả khi đang xem — không phải khai lại ở viewActions.
 * Mở bằng nút Sửa của thanh công cụ (openNextInEdit): vào thẳng chế độ sửa; bấm đúp dòng thì mở ở chế độ xem.
 * Phím tắt khi đang xem: Enter / F2 = Sửa (bấm đúp KHÔNG mở sửa — tránh sửa nhầm khi bấm đúp để chọn chữ).
 * `viewAgain` (từ useViewAgain): Ghi xong bản ghi đã có thì gọi viewAgain[1]() — ở lại hộp thoại, quay về chế độ xem.
 * Ctrl + S: bấm nút chính (Ghi) ở chân hộp thoại khi đang sửa.
 * [2026-11-11 Nguyễn Văn Thủy] `voucher`: hộp thoại CHỨNG TỪ — gần toàn màn, tổng tiền chữ lớn góc trên phải, dòng phím tắt ở chân (đóng góp).
 */
export interface VoucherFrame { total?: number | null; totalLabel?: string; keys?: string }
export function Modal({ title, onClose, children, footer, wide, viewFirst, viewActions, onEdit, viewAgain, voucher }: { title: ReactNode; onClose: () => void; children: ReactNode; footer: ReactNode; wide?: boolean; viewFirst?: boolean; viewActions?: ReactNode; onEdit?: () => void; viewAgain?: ViewAgain; voucher?: VoucherFrame }) {
  const [locked, setLocked] = useState(() => Boolean(viewFirst) && !takeEditIntent());
  const viewSignal = viewAgain?.[0] ?? 0;
  useEffect(() => { if (viewSignal) setLocked(true); }, [viewSignal]);
  const mask = useRef<HTMLDivElement>(null);
  // [2026-11-11 Nguyễn Văn Thủy] báo lỗi tại ô: bấm Ghi mà ô bắt buộc trống → tô đỏ, báo ở chân hộp thoại (đóng góp)
  const kl = useKiemLoi(locked);
  const edit = () => { setLocked(false); onEdit?.(); };
  // Thu nhỏ xuống thanh dưới: ẩn bằng CSS, không gỡ — dữ liệu đang nhập còn nguyên.
  const dock = useDockWindow(onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Hộp thoại lồng nhau: chỉ hộp trên cùng (đang hiện) nhận phím.
      if (mask.current !== [...document.querySelectorAll('.modal-mask:not(.is-min)')].pop()) return;
      if (e.key === 'Escape') onClose();
      else if (!locked && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const btn = mask.current?.querySelector<HTMLButtonElement>('.modal-foot .btn-primary:not(:disabled)');
        const khoa = mask.current?.querySelector<HTMLButtonElement>('.modal-foot .btn-primary:disabled');
        if (btn) { e.preventDefault(); btn.click(); } else if (khoa) { e.preventDefault(); kl.kiem(khoa); }
      } else if (locked && (e.key === 'F2' || (e.key === 'Enter' && !(e.target as HTMLElement).closest?.('button, a, textarea')))) { e.preventDefault(); edit(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, locked]); // eslint-disable-line react-hooks/exhaustive-deps
  const guard = (e: SyntheticEvent) => {
    if (!locked) return;
    const t = e.target as HTMLElement;
    if (t.closest('[data-view-ok], .tab, .tabs, .btn-help, a[href]')) return;
    if (!t.closest('input, select, textarea, button, label, [role="button"], [role="option"], [contenteditable="true"], .picker-drop')) return;
    if (e.type === 'keydown') {
      const k = e as unknown as KeyboardEvent;
      if (k.key === 'Tab' || k.key === 'Escape' || ((k.ctrlKey || k.metaKey) && (k.key === 'c' || k.key === 'a'))) return;
    }
    e.preventDefault(); e.stopPropagation();
  };
  return (
    <DockScope>
    <div className={`modal-mask${dock.minimized ? ' is-min' : ''}`} ref={mask} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide || voucher ? 'wide' : ''} ${voucher ? 'chung-tu' : ''} ${locked ? 'is-locked' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head" ref={(el) => { dock.headRef.current = el; }}>{title}{locked && <span className="badge badge-info modal-viewing">Đang xem</span>}
          {voucher && voucher.total !== undefined && <span className="ct-total" title={voucher.totalLabel ?? 'Tổng tiền thanh toán'}><small>{voucher.totalLabel ?? 'Tổng tiền thanh toán'}</small><b>{(voucher.total ?? 0).toLocaleString('vi-VN', { maximumFractionDigits: 0 })}</b></span>}
          {dock.top && <MinimizeButton onClick={dock.minimize} />}<button type="button" className="modal-x" data-view-ok onClick={onClose} aria-label="Đóng" title="Đóng (Esc)">✕</button></div>
        <div className="modal-body" ref={kl.body} {...kl.bodyProps} onClickCapture={guard} onMouseDownCapture={guard} onKeyDownCapture={guard} onPasteCapture={guard} onDropCapture={guard} onCutCapture={guard}>
          {children}
        </div>
        {voucher && <div className="ct-keys">{voucher.keys ?? 'F9 - Thêm nhanh khách hàng, nhà cung cấp, mặt hàng (khi đang ở ô chọn) · Ctrl + S - Ghi · Esc - Thoát'}</div>}
        <div className="modal-foot" {...kl.footProps}>
          {kl.banner}
          {locked ? <>
            {viewActions}{keepInView(footer)}
            <button className="btn btn-primary" onClick={edit} autoFocus title="Phím tắt: Enter / F2">Sửa</button>
            <button className="btn" onClick={onClose}>Thoát</button>
          </> : footer}
        </div>
      </div>
    </div>
    </DockScope>
  );
}

/** Nút Sửa ở thanh công cụ gọi trước khi mở form: hộp thoại viewFirst mở kế tiếp vào thẳng chế độ sửa.
 * Hết hạn sau vài giây (form tải dữ liệu xong mới mở hộp thoại) để không ảnh hưởng lần mở sau. */
let editIntentAt = 0;
export function openNextInEdit() { editIntentAt = Date.now(); }
function takeEditIntent() {
  const hit = Date.now() - editIntentAt < 8000;
  editIntentAt = 0;
  return hit;
}

type ViewAgain = readonly [number, () => void];
/** Ghi xong bản ghi đã có: `const viewAgain = useViewAgain()`, truyền `<Modal viewAgain={viewAgain}>`, lưu xong gọi `viewAgain[1]()` thay cho onClose(). */
export function useViewAgain(): ViewAgain {
  const [n, setN] = useState(0);
  const back = useCallback(() => setN((x) => x + 1), []);
  return [n, back] as const;
}

/** Các nút ở chân form gắn data-view-ok (bóc các lớp <>…</>) — hiện cả khi hộp thoại đang xem. */
function keepInView(node: ReactNode): ReactNode[] {
  const out: ReactNode[] = [];
  // toArray gắn sẵn key cho từng nút (tránh cảnh báo key khi hiện lại ở chân hộp thoại).
  Children.toArray(node).forEach((c) => {
    if (!isValidElement(c)) return;
    const el = c as ReactElement<{ children?: ReactNode; 'data-view-ok'?: unknown }>;
    if (el.type === Fragment) out.push(...keepInView(el.props.children));
    else if (el.props['data-view-ok']) out.push(el);
  });
  return out;
}

/** Ô nhập có nhãn. */
// [2026-11-09 07:00 PM Nguyễn Văn Thủy] PHASE-026 — Field.tip: giải thích để ở chú thích rê chuột, màn gọn chữ (đóng góp)
export function Field({ label, children, full, hint, tip, error, truong }: { label: string; children: ReactNode; full?: boolean; hint?: string; tip?: string; /** Lỗi của ô (viền đỏ + chữ đỏ dưới ô). */ error?: string | null; /** Tên trường gửi lên máy chủ (vd "name"): lỗi máy chủ của trường đó tô đỏ đúng ô này. */ truong?: string }) {
  return (
    <div className={`field ${full ? 'full' : ''}${error ? ' o-loi' : ''}`} title={tip} data-truong={truong}>
      <label>{label}</label>
      {children}
      {error ? <span className="o-loi-chu">{error}</span> : hint && <span className="muted" style={{ fontSize: 12 }}>{hint}</span>}
    </div>
  );
}

/** Phân trang đơn giản. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="pager">
      <span>{total.toLocaleString('vi-VN')} bản ghi</span>
      <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Trước</button>
      <span>Trang {page}/{pages}</span>
      <button className="btn btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Sau ›</button>
    </div>
  );
}
