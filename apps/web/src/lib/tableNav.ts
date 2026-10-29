/**
 * DI CHUYỂN BẰNG PHÍM TRONG BẢNG (như Excel) — cài một lần lúc mở phần mềm:
 *   - đang ở ô nhập trong bảng: ↑ / ↓ sang ô cùng cột ở dòng trên / dưới (chọn sẵn chữ để gõ đè);
 *   - Enter ở ô nhập số / chữ thường cũng xuống dòng dưới cùng cột (khi không phải ô chọn có danh sách thả xuống).
 * Bỏ qua: ô chọn có danh sách (role="combobox" — ↑ ↓ dùng cho danh sách), ô nhiều dòng, ô chọn select (↑ ↓ đổi giá trị),
 * bảng gắn data-no-nav. Bảng chỉ xem (không có ô nhập) thì không ảnh hưởng.
 */
const FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([disabled]), select:not([disabled])';

function target(el: EventTarget | null): { cell: HTMLTableCellElement; input: HTMLInputElement } | null {
  const input = el as HTMLInputElement | null;
  if (!input || input.tagName !== 'INPUT' || ['checkbox', 'radio', 'date', 'hidden'].includes(input.type)) return null;
  if (input.getAttribute('role') === 'combobox' || input.closest('[role="combobox"], .unit-pick, .picker')) return null;
  const cell = input.closest('td') as HTMLTableCellElement | null;
  if (!cell || cell.closest('table[data-no-nav]')) return null;
  return { cell, input };
}

function move(cell: HTMLTableCellElement, dir: 1 | -1): boolean {
  const row = cell.parentElement as HTMLTableRowElement;
  const section = row.parentElement as HTMLTableSectionElement;
  const rows = [...section.rows];
  for (let i = rows.indexOf(row) + dir; i >= 0 && i < rows.length; i += dir) {
    const c = rows[i]!.cells[cell.cellIndex];
    const f = c?.querySelector(FIELD) as HTMLInputElement | null;
    if (f) { f.focus(); if (typeof f.select === 'function' && f.tagName === 'INPUT') f.select(); return true; }
  }
  return false;
}

export function installTableNav() {
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || e.defaultPrevented) return;
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Enter') return;
    const t = target(e.target);
    if (!t) return;
    if (move(t.cell, e.key === 'ArrowUp' ? -1 : 1)) e.preventDefault();
  });
}
