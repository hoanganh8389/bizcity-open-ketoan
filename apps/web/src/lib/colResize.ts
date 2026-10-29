/**
 * KÉO GIÃN CỘT CHO MỌI BẢNG (như Excel) — cài một lần lúc mở phần mềm, không phải sửa từng màn:
 *   - rê chuột vào mép phải tiêu đề cột → con trỏ ↔, kéo để đổi độ rộng;
 *   - bảng một hàng tiêu đề: thu nhỏ được cả dưới độ dài chữ (chữ dài thì "…"), độ rộng nhớ theo màn + tiêu đề cột;
 *   - bảng tiêu đề nhiều tầng (gộp cột): cố định độ rộng theo từng cột (<colgroup>) rồi kéo — cũng thu hẹp tới ~1 cm, không nhớ;
 *   - hẹp nhất 32px (~1 cm): chữ dài tự ẩn "…" để xem được nhiều cột không phải cuộn ngang;
 *   - bấm đúp vào mép = trả bảng về độ rộng tự động.
 * Bảng lưới DataGrid có bộ kéo riêng (dgrid-table) nên bỏ qua; bảng nào không muốn kéo thì gắn data-no-resize.
 */
const EDGE = 6;
const MIN = 32; // ~1 cm
const KEY = 'ketoan.colw.';

/** Ô tiêu đề của bảng một hàng tiêu đề không gộp cột (kéo "chặt": cố định bố cục, nhớ độ rộng); null = bảng phức tạp. */
function headerCells(table: HTMLTableElement): HTMLTableCellElement[] | null {
  const rows = table.tHead ? [...table.tHead.rows] : table.rows[0] ? [table.rows[0]] : [];
  if (rows.length !== 1) return null;
  const cells = [...rows[0]!.cells];
  if (!cells.length || cells.some((c) => c.colSpan > 1 || c.tagName !== 'TH')) return null;
  return cells as HTMLTableCellElement[];
}
const keyOf = (cells: HTMLTableCellElement[]) => KEY + location.pathname + '|' + cells.map((c) => (c.textContent ?? '').trim().slice(0, 24)).join('¦');

type Target = { th: HTMLTableCellElement; table: HTMLTableElement; cells: HTMLTableCellElement[] | null; col?: HTMLTableColElement };

/**
 * Bảng phức tạp (tiêu đề nhiều tầng): dựng <colgroup> theo dòng dữ liệu đầu tiên đủ cột, cố định bố cục, trả cột ứng với ô
 * tiêu đề đang kéo (cột có mép phải trùng mép phải ô tiêu đề).
 */
function colFor(table: HTMLTableElement, th: HTMLTableCellElement): HTMLTableColElement | undefined {
  let group = table.querySelector(':scope > colgroup[data-cr]') as HTMLTableColElement | null;
  if (!group) {
    const body = [...table.tBodies].flatMap((b) => [...b.rows]).find((r) => r.cells.length && [...r.cells].every((c) => c.colSpan === 1));
    if (!body) return undefined;
    const ws = [...body.cells].map((c) => c.getBoundingClientRect().width);
    group = document.createElement('colgroup') as unknown as HTMLTableColElement;
    group.setAttribute('data-cr', '');
    ws.forEach((w) => { const c = document.createElement('col'); c.style.width = `${Math.round(w)}px`; group!.appendChild(c); });
    table.querySelectorAll(':scope > colgroup:not([data-cr])').forEach((g) => g.remove());
    table.insertBefore(group, table.firstChild);
    table.style.tableLayout = 'fixed';
    table.style.width = `${Math.round(ws.reduce((a, b) => a + b, 0))}px`;
    table.style.minWidth = '0';
    table.setAttribute('data-resized', '');
  }
  const cols = [...group.querySelectorAll('col')] as HTMLTableColElement[];
  const left = table.getBoundingClientRect().left, right = th.getBoundingClientRect().right;
  let acc = left, best: HTMLTableColElement | undefined, gap = Infinity;
  for (const c of cols) { acc += parseFloat(c.style.width) || 0; const d = Math.abs(acc - right); if (d < gap) { gap = d; best = c; } }
  return gap < 12 ? best : undefined;
}
function targetTable(el: EventTarget | null): Target | null {
  const th = (el as HTMLElement | null)?.closest?.('th') as HTMLTableCellElement | null;
  if (!th || th.colSpan > 1) return null;
  const table = th.closest('table') as HTMLTableElement | null;
  if (!table || table.classList.contains('dgrid-table') || table.hasAttribute('data-no-resize')) return null;
  const cells = headerCells(table);
  return { th, table, cells: cells && cells.includes(th) ? cells : null };
}
const nearEdge = (th: HTMLElement, x: number) => { const r = th.getBoundingClientRect(); return r.right - x <= EDGE && r.right - x >= -2; };

function freeze(table: HTMLTableElement, cells: HTMLTableCellElement[], widths?: number[]) {
  const ws = widths ?? cells.map((c) => c.getBoundingClientRect().width);
  cells.forEach((c, i) => { c.style.width = `${Math.round(ws[i]!)}px`; });
  table.style.tableLayout = 'fixed';
  table.style.width = `${Math.round(ws.reduce((a, b) => a + b, 0))}px`;
  table.style.minWidth = '0';
  table.setAttribute('data-resized', '');
}
function unfreeze(table: HTMLTableElement) {
  table.querySelectorAll(':scope > colgroup[data-cr]').forEach((g) => g.remove());
  table.querySelectorAll('th').forEach((c) => { (c as HTMLElement).style.width = ''; (c as HTMLElement).style.minWidth = ''; });
  table.style.tableLayout = ''; table.style.width = ''; table.style.minWidth = '';
  table.removeAttribute('data-resized');
}
function save(cells: HTMLTableCellElement[]) {
  try { localStorage.setItem(keyOf(cells), JSON.stringify(cells.map((c) => Math.round(c.getBoundingClientRect().width)))); } catch { /* trình duyệt chặn lưu: bỏ qua */ }
}
function restore(table: HTMLTableElement) {
  if (table.classList.contains('dgrid-table') || table.hasAttribute('data-no-resize')) return;
  const cells = headerCells(table);
  if (!cells) return;
  let ws: number[] | null = null;
  try { ws = JSON.parse(localStorage.getItem(keyOf(cells)) ?? 'null') as number[] | null; } catch { ws = null; }
  if (ws && ws.length === cells.length && ws.every((w) => w > 0)) freeze(table, cells, ws);
}

export function installColumnResize() {
  let drag: (Target & { x: number; w: number; total: number }) | null = null;
  document.addEventListener('mousemove', (e) => {
    if (drag) {
      const w = Math.max(MIN, drag.w + e.clientX - drag.x);
      if (drag.col) drag.col.style.width = `${w}px`; else drag.th.style.width = `${w}px`;
      drag.table.style.width = `${drag.total - drag.w + w}px`;
      return;
    }
    const t = targetTable(e.target);
    document.body.classList.toggle('col-resize-hover', Boolean(t && nearEdge(t.th, e.clientX)));
  }, { passive: true });
  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const t = targetTable(e.target);
    if (!t || !nearEdge(t.th, e.clientX)) return;
    e.preventDefault(); e.stopPropagation();
    if (t.cells && !t.table.hasAttribute('data-resized')) freeze(t.table, t.cells);
    const col = t.cells ? undefined : colFor(t.table, t.th);
    if (!t.cells && !col) return;
    drag = { ...t, col, x: e.clientX, w: col ? parseFloat(col.style.width) || t.th.getBoundingClientRect().width : t.th.getBoundingClientRect().width, total: t.table.getBoundingClientRect().width };
    document.body.classList.add('col-resizing');
  }, true);
  document.addEventListener('mouseup', () => {
    if (!drag) return;
    if (drag.cells) save(drag.cells);
    drag = null;
    document.body.classList.remove('col-resizing');
  });
  // Kéo xong không coi là bấm (tránh sắp xếp / chọn dòng nhầm).
  document.addEventListener('click', (e) => { if (document.body.classList.contains('col-resize-hover') && targetTable(e.target)) e.stopPropagation(); }, true);
  document.addEventListener('dblclick', (e) => {
    const t = targetTable(e.target);
    if (!t || !nearEdge(t.th, e.clientX)) return;
    e.preventDefault(); e.stopPropagation();
    unfreeze(t.table);
    if (t.cells) try { localStorage.removeItem(keyOf(t.cells)); } catch { /* bỏ qua */ }
  }, true);
  // Bảng mới hiện ra: áp độ rộng đã nhớ (mỗi bảng một lần).
  let queued = false;
  const scan = () => {
    queued = false;
    document.querySelectorAll<HTMLTableElement>('table:not([data-cw])').forEach((t) => { t.setAttribute('data-cw', ''); restore(t); });
  };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(scan); } }).observe(document.body, { childList: true, subtree: true });
}
