// [2026-11-10 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-22 (R-BLOCK, docs/rules/RULE-BLOCKED.md): điều khiển bị chặn nói vì sao và cách gỡ — thấy được khi rê chuột, phím Tab và chạm
/**
 * Bọc MỘT điều khiển (nút, ô, mục menu). `blocked` có giá trị → điều khiển mờ (disabled + aria-disabled) và có ô giải thích
 * "Vì sao" + "Cách gỡ" (R-BLOCK-1). Nút disabled không nhận sự kiện chuột / chạm ở nhiều trình duyệt, nên sự kiện đặt ở lớp bọc
 * (tabIndex 0 để Tab tới được, R-BLOCK-2). `blocked` = null / undefined → trả nguyên điều khiển, không đổi gì.
 *
 *   <BlockedHint blocked={locked ? { why: 'Kỳ 10/2026 của CN01 đã khoá', fix: 'Nhờ kế toán trưởng mở khoá kỳ', screen: '/cau-hinh/ky-ke-toan' } : null}>
 *     <button className="btn" onClick={save}>Lưu</button>
 *   </BlockedHint>
 *
 * Lý do do máy chủ quyết thì lấy từ API (R-BLOCK-3), không đoán lại ở đây. Đang lưu / đang tải không dùng thành phần này.
 */
import { cloneElement, isValidElement, useId, useState, type CSSProperties, type ReactElement } from 'react';
import { Link } from 'react-router-dom';

export interface Blocked {
  /** Vì sao bị chặn — điều kiện cụ thể (vd "Phiếu đã ghi sổ ngày 05/10"). */
  why: string;
  /** Cách gỡ — bắt đầu bằng động từ (vd "Bỏ duyệt phiếu rồi sửa"). */
  fix?: string;
  /** Đường dẫn màn để gỡ (mã màn trong SCREENS). */
  screen?: string;
  /** Chữ của liên kết tới màn gỡ. */
  screenLabel?: string;
}

/** Một dòng chữ cho `title` / thông báo ngắn: "Vì sao. Cách gỡ." */
export const blockedText = (b: Blocked | null | undefined): string | undefined => (b ? [b.why, b.fix].filter(Boolean).join('. ') : undefined);

const pop: CSSProperties = {
  position: 'absolute', zIndex: 50, top: 'calc(100% + 6px)', left: 0, minWidth: 220, maxWidth: 340,
  background: 'var(--surface)', color: 'inherit', border: '1px solid var(--line)', borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow-pop)', padding: '8px 10px', fontSize: 12.5, lineHeight: 1.45, textAlign: 'left', whiteSpace: 'normal',
};

export function BlockedHint({ blocked, children }: { blocked?: Blocked | null; children: ReactElement }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  if (!blocked || !isValidElement(children)) return children;
  const child = cloneElement(children as ReactElement<Record<string, unknown>>, {
    disabled: true, 'aria-disabled': true, 'aria-describedby': id, title: blockedText(blocked), style: { ...((children.props as { style?: CSSProperties }).style ?? {}), pointerEvents: 'none' },
  });
  return (
    <span style={{ position: 'relative', display: 'inline-block' }} tabIndex={0} data-blocked=""
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
      onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
      onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}>
      {child}
      <span id={id} role="tooltip" style={{ ...pop, display: open ? 'block' : 'none' }}>
        <b>Vì sao: </b>{blocked.why}
        {blocked.fix ? <><br /><b>Cách gỡ: </b>{blocked.fix}</> : null}
        {blocked.screen ? <><br /><Link to={blocked.screen} onClick={(e) => e.stopPropagation()}>{blocked.screenLabel ?? 'Mở màn để gỡ'} →</Link></> : null}
      </span>
    </span>
  );
}
