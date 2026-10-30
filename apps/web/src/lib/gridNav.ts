/**
 * Đi lại giữa các ô nhập của bảng bằng phím mũi tên, như Excel: gắn `onKeyDown={gridNav}` vào <tbody>.
 *   ↑ / ↓ : sang ô cùng cột ở dòng trên / dưới (cả ô chọn — mở danh sách bằng Alt+↓).
 *   ← / → : sang ô trước / sau trong dòng khi con trỏ đã ở đầu / cuối chữ (ô đang bôi đen cả = sang luôn).
 * Bỏ qua ô ngày, ô tích, phím có Ctrl / Alt / Shift.
 */
import type { KeyboardEvent } from 'react';

const FOCUSABLE = 'input:not([type="checkbox"]):not([type="radio"]):not([type="date"]):not([disabled]):not([readonly]), select:not([disabled])';

const focusEl = (f: HTMLElement | undefined) => {
  if (!f) return false;
  f.focus();
  if (f instanceof HTMLInputElement) requestAnimationFrame(() => f.select());
  return true;
};

export function gridNav(e: KeyboardEvent<HTMLElement>) {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const k = e.key;
  if (k !== 'ArrowUp' && k !== 'ArrowDown' && k !== 'ArrowLeft' && k !== 'ArrowRight') return;
  const el = e.target as HTMLElement;
  if (!el.matches?.(FOCUSABLE)) return;
  const td = el.closest('td');
  const tr = td?.parentElement;
  if (!td || !tr) return;
  if (k === 'ArrowLeft' || k === 'ArrowRight') {
    if (el instanceof HTMLInputElement && el.selectionStart !== null) {
      const atStart = el.selectionStart === 0, atEnd = el.selectionEnd === el.value.length;
      if ((k === 'ArrowLeft' && !atStart) || (k === 'ArrowRight' && !atEnd)) return;
    }
    const all = [...tr.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (focusEl(all[all.indexOf(el) + (k === 'ArrowLeft' ? -1 : 1)])) e.preventDefault();
    return;
  }
  // ↑ / ↓: cùng cột (cùng thứ tự ô nhập trong cột), dòng gần nhất có ô nhập ở cột đó.
  const col = [...tr.children].indexOf(td);
  const inCell = [...td.querySelectorAll<HTMLElement>(FOCUSABLE)].indexOf(el);
  let row: Element | null = tr;
  while ((row = k === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling)) {
    const cells = [...(row.children[col]?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (cells.length) { focusEl(cells[Math.min(inCell, cells.length - 1)]); e.preventDefault(); return; }
  }
}
