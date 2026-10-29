/**
 * Bảng lưới dùng chung cho mọi danh sách, sổ, báo cáo (kiểu bảng kế toán quen dùng / Excel):
 *
 *  - Hàng LỌC ngay dưới tiêu đề: gõ vào ô của cột nào thì lọc theo cột đó (không phân biệt dấu, hoa thường).
 *      Cột số: gõ `>1000`, `<0`, `>=5`, `=0`, `100..500` (khoảng), hoặc gõ số để tìm theo chữ số.
 *  - Bấm TIÊU ĐỀ cột để sắp xếp tăng → giảm → bỏ sắp xếp.
 *  - KÉO mép phải tiêu đề để giãn / thu cột; chọn ẩn / hiện cột ở nút "Cột". Bảng nhớ lại cho lần sau.
 *  - Tiêu đề và dòng TỔNG luôn hiện (dính trên / dưới); bảng rộng có thanh cuộn ngang ở đáy bảng.
 *  - Dòng tổng tự cộng lại theo các dòng ĐANG HIỆN (sau khi lọc).
 *  - Bấm một dòng: dòng được tô đậm (dòng đang chọn) và gọi onRowClick.
 *  - Nút phễu ở mỗi tiêu đề: LỌC NHANH theo danh sách giá trị của cột (tích chọn, có ô tìm) như AutoFilter của Excel.
 *  - Nút "Xuất Excel": xuất đúng những gì đang thấy (cột đang hiện, dòng đã lọc, thứ tự đã sắp) ra tệp .xlsx.
 *
 *  - NHÓM theo cột (bật groupable): kéo tiêu đề cột vào ô "Kéo một cột vào đây để nhóm theo cột đó"; kéo nhiều cột = nhóm nhiều cấp.
 *  - Cột ô tích (type 'check'): lọc gõ "x" / "có" (đang tích) hoặc "0" / "không".
 *  - Không phân trang: bảng nhận toàn bộ dòng; nhiều dòng (trên VIRTUAL_FROM) thì chỉ vẽ các dòng đang thấy trong vùng cuộn,
 *    lọc / sắp xếp / cộng tổng / xuất Excel vẫn tính trên toàn bộ.
 *
 * Dòng đặc biệt (tiêu đề nhóm, dòng cộng nhóm) khai qua rowKind: khi đang lọc hoặc sắp xếp, các dòng này
 * được ẩn để bảng thành danh sách phẳng.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Columns3, FileSpreadsheet, Filter, FilterX, X } from 'lucide-react';
import { date as fmtDate, money } from '@/lib/format';
import { Money } from './ui';

export type ColType = 'text' | 'code' | 'number' | 'money' | 'qty' | 'date' | 'check';

export interface Column<T> {
  key: string;
  header: ReactNode;
  /** Chữ dùng cho tiêu đề ở nút ẩn / hiện cột (khi header không phải chữ). */
  title?: string;
  /** Nhóm tiêu đề phía trên (hai tầng), ví dụ "Số dư đầu kỳ". Các cột liền nhau cùng band được gộp. */
  band?: string;
  type?: ColType;
  /** Giá trị dùng để lọc, sắp xếp, cộng tổng. Mặc định row[key]. */
  value?: (row: T) => string | number | boolean | null | undefined;
  /** Cách hiện ô; mặc định theo type. */
  render?: (row: T) => ReactNode;
  /** Cộng tổng ở dòng cuối (cột số). */
  sum?: boolean;
  /** Ô dòng tổng tự chọn (thay cho sum). */
  footer?: ReactNode | ((rows: T[]) => ReactNode);
  /** Số của dòng tổng tính theo cách riêng (thay cho cộng mọi dòng); dùng cả khi xuất Excel. */
  footerValue?: (rows: T[]) => number;
  width?: number;
  /** Ẩn sẵn (người dùng bật lại ở nút "Cột"). */
  hidden?: boolean;
  /** Không cho lọc / sắp xếp cột này. */
  noFilter?: boolean;
  noSort?: boolean;
  /** Ô đậm. */
  bold?: boolean | ((row: T) => boolean);
  /** Số 0 vẫn hiện (mặc định ô tiền 0 để trống). */
  showZero?: boolean;
  /** Lớp CSS của cột — gắn cho ô tiêu đề, ô dữ liệu và ô dòng tổng (tô màu cả cột). */
  className?: string;
}

export type RowKind = 'data' | 'group' | 'subtotal';

export interface DataGridProps<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T, index: number) => string;
  /** Khoá lưu độ rộng / ẩn hiện cột (mỗi bảng một khoá, ví dụ "so-quy"). */
  storageKey?: string;
  onRowClick?: (row: T) => void;
  rowKind?: (row: T) => RowKind;
  rowClassName?: (row: T) => string;
  /** Dòng tiêu đề nhóm hiện thành một ô kéo dài cả bảng với nội dung này (bỏ trống: hiện theo từng cột). */
  groupLabel?: (row: T) => ReactNode;
  /** Hiện dòng tổng; nhãn ở cột đầu. */
  footerLabel?: string | false;
  /** Dòng đứng trước dữ liệu, không bị lọc (ví dụ "Số dư đầu kỳ"). Trả về các ô theo key cột. */
  topRows?: { key: string; cells: Partial<Record<string, ReactNode>>; label?: ReactNode; className?: string }[];
  /** Dòng đứng sau dữ liệu trong phần tổng (ví dụ "Số dư cuối kỳ"). */
  bottomRows?: { key: string; cells: Partial<Record<string, ReactNode>>; label?: ReactNode }[];
  emptyText?: string;
  /** Chiều cao tối đa của vùng bảng (mặc định vừa màn hình). */
  maxHeight?: string;
  /** Ghi chú cạnh số dòng (ví dụ "lọc trong trang đang xem"). */
  note?: ReactNode;
  /** Tên tệp khi bấm "Xuất Excel" trên bảng (không cần đuôi). Mặc định theo storageKey. */
  exportName?: string;
  /** Dòng tiêu đề ghi ở đầu tệp Excel (ví dụ tên báo cáo và kỳ xem). */
  exportTitle?: string;
  /** Màn phân trang: xuất toàn bộ kết quả lọc của kỳ (không chỉ trang đang xem). Có thì nút "Xuất Excel" xuất cả kỳ. */
  onExportAll?: () => void;
  /** Bấm đúp một dòng (màn danh mục: mở form sửa). */
  onRowDoubleClick?: (row: T) => void;
  /** Báo dòng đang chọn (thanh nút Sửa / Xoá dùng). */
  onSelect?: (row: T | null) => void;
  /** Cho kéo cột vào ô nhóm để nhóm theo cột. */
  groupable?: boolean;
  /** Thanh nút ngoài bảng gọi "Xuất Excel". */
  exportRef?: { current: (() => void) | null };
  /** Các dòng dữ liệu đang hiện (sau lọc, sắp xếp) cho thao tác hàng loạt của trang. */
  viewRef?: { current: T[] };
  /** Lưới gọn trong form chi tiết: không thanh công cụ (số dòng, Xuất Excel, Cột), không hàng ô lọc, chữ và dòng nhỏ. */
  compact?: boolean;
}

type Display<T> = { kind: 'g'; key: string; label: ReactNode; count: number; level: number; open: boolean } | { kind: 'r'; r: T; i: number; level: number };

/* ------------------------------------------------------------------ tiện ích */

/** Từ số dòng này trở lên thì chỉ vẽ phần đang thấy. */
const VIRTUAL_FROM = 400;
/** Số dòng vẽ thêm trên / dưới phần đang thấy. */
const OVERSCAN = 30;

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
const isNumeric = (t?: ColType) => t === 'number' || t === 'money' || t === 'qty';
const qtyFmt = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 });

function valueOf<T>(c: Column<T>, r: T): string | number | null | undefined {
  const v = c.value ? c.value(r) : (r as Record<string, unknown>)[c.key] as string | number | boolean | null | undefined;
  if (c.type === 'check') return v ? 1 : 0;
  return v as string | number | null | undefined;
}

/** Điều kiện lọc của một ô lọc → hàm kiểm tra. */
function matcher(text: string, type?: ColType): (v: string | number | null | undefined) => boolean {
  const q = text.trim();
  if (!q) return () => true;
  if (isNumeric(type)) {
    const num = (s: string) => Number(s.replace(/\./g, '').replace(/,/g, '.').replace(/\s/g, ''));
    const range = q.match(/^(-?[\d.,]+)\s*\.\.\s*(-?[\d.,]+)$/);
    if (range) { const a = num(range[1]!); const b = num(range[2]!); return (v) => Number(v ?? 0) >= a && Number(v ?? 0) <= b; }
    const op = q.match(/^(>=|<=|<>|!=|>|<|=)\s*(-?[\d.,]+)$/);
    if (op) {
      const n = num(op[2]!);
      return (v) => {
        const x = Number(v ?? 0);
        switch (op[1]) { case '>': return x > n; case '<': return x < n; case '>=': return x >= n; case '<=': return x <= n; case '=': return x === n; default: return x !== n; }
      };
    }
    const digits = q.replace(/[.\s]/g, '');
    return (v) => String(Math.abs(Number(v ?? 0))).replace('.', ',').includes(digits.replace(/^-/, '')) || money(Number(v ?? 0)).includes(q);
  }
  const f = fold(q);
  if (type === 'check') {
    if (['1', 'x', 'c', 'co', 'true'].includes(f)) return (v) => Boolean(v);
    if (['0', 'k', 'khong', 'false'].includes(f)) return (v) => !v;
    return () => true;
  }
  if (type === 'date') return (v) => fold(fmtDate(String(v ?? ''))).includes(f) || String(v ?? '').includes(q);
  return (v) => fold(String(v ?? '')).includes(f);
}

/** Chữ hiện trên ô (dùng cho danh sách lọc nhanh). */
function textOf<T>(c: Column<T>, r: T): string {
  const v = valueOf(c, r);
  if (c.type === 'check') return v ? 'Có' : 'Không';
  if (v === null || v === undefined || v === '') return '';
  if (c.type === 'date') return fmtDate(String(v));
  if (c.type === 'money') return money(Number(v));
  if (c.type === 'number') return Number(v).toLocaleString('vi-VN');
  if (c.type === 'qty') return qtyFmt.format(Number(v));
  return String(v);
}

function headerTitle<T>(c: Column<T>): string {
  return c.title ?? (typeof c.header === 'string' ? c.header : c.key);
}

function compare(a: string | number | null | undefined, b: string | number | null | undefined, numeric: boolean): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (numeric) return Number(a ?? 0) - Number(b ?? 0);
  return String(a ?? '').localeCompare(String(b ?? ''), 'vi', { numeric: true, sensitivity: 'base' });
}

interface Saved { widths: Record<string, number>; hidden: string[] }
const loadSaved = (key?: string): Saved => {
  if (!key) return { widths: {}, hidden: [] };
  try { return { widths: {}, hidden: [], ...JSON.parse(localStorage.getItem(`ketoan.grid.${key}`) ?? '{}') }; } catch { return { widths: {}, hidden: [] }; }
};

/* ------------------------------------------------------------------ bảng */

export function DataGrid<T>(p: DataGridProps<T>) {
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [saved, setSaved] = useState<Saved>(() => loadSaved(p.storageKey));
  const [selected, setSelected] = useState<string | null>(null);
  const [chooser, setChooser] = useState(false);
  const chooserRef = useRef<HTMLDivElement>(null);
  /** Lọc nhanh theo giá trị: cột → tập chữ được giữ lại. */
  const [picks, setPicks] = useState<Record<string, Set<string>>>({});
  const [picker, setPicker] = useState<{ key: string; x: number; y: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [groups, setGroups] = useState<string[]>([]);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [dropping, setDropping] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [fitHeight, setFitHeight] = useState<number | null>(null);
  const [scroll, setScroll] = useState({ top: 0, height: 800 });
  const [rowH, setRowH] = useState(33);
  const prevRowH = useRef(0);
  // Khi in thì vẽ đủ mọi dòng.
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const on = () => setPrinting(true);
    const off = () => setPrinting(false);
    window.addEventListener('beforeprint', on);
    window.addEventListener('afterprint', off);
    return () => { window.removeEventListener('beforeprint', on); window.removeEventListener('afterprint', off); };
  }, []);

  // Chiều cao vùng bảng = phần còn lại của khung thẻ (trừ các thứ nằm sau bảng như phân trang), để thanh cuộn ngang
  // và dòng tổng luôn thấy trên màn hình. Truyền maxHeight thì dùng giá trị đó.
  useLayoutEffect(() => {
    if (p.maxHeight) return;
    const fit = () => {
      const wrap = wrapRef.current;
      const root = rootRef.current;
      if (!wrap || !root || wrap.offsetParent === null) return;
      const panel = root.closest('.ws-panel') as HTMLElement | null;
      const bottom = panel && getComputedStyle(panel).overflowY === 'auto' ? panel.getBoundingClientRect().bottom : window.innerHeight;
      const top = wrap.getBoundingClientRect().top + (panel?.scrollTop ?? 0);
      // Phần sau bảng trong cùng thẻ: phân trang, ghi chú… cộng lề dưới.
      let after = 18;
      for (let el: Element | null = root.nextElementSibling; el; el = el.nextElementSibling) after += (el as HTMLElement).offsetHeight;
      const card = root.closest('.card');
      if (card) for (let el: Element | null = card.nextElementSibling; el; el = el.nextElementSibling) if (!(el as HTMLElement).classList.contains('modal-mask')) after += (el as HTMLElement).offsetHeight;
      const h = Math.max(240, Math.floor(bottom - top - after));
      setFitHeight((old) => (old === h ? old : h));
    };
    fit();
    const ro = new ResizeObserver(fit);
    if (rootRef.current?.parentElement) ro.observe(rootRef.current.parentElement);
    window.addEventListener('resize', fit);
    return () => { ro.disconnect(); window.removeEventListener('resize', fit); };
  }, [p.maxHeight]);

  useEffect(() => {
    if (!p.storageKey) return;
    try { localStorage.setItem(`ketoan.grid.${p.storageKey}`, JSON.stringify(saved)); } catch { /* bỏ qua */ }
  }, [saved, p.storageKey]);
  useEffect(() => {
    if (!chooser) return;
    const close = (e: MouseEvent) => { if (chooserRef.current && !chooserRef.current.contains(e.target as Node)) setChooser(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [chooser]);

  const hiddenSet = new Set([...saved.hidden, ...p.columns.filter((c) => c.hidden && !saved.hidden.includes(`!${c.key}`)).map((c) => c.key)]);
  const cols = p.columns.filter((c) => !hiddenSet.has(c.key));
  const kindOf = (r: T): RowKind => p.rowKind?.(r) ?? 'data';
  const active = Object.values(filters).some((v) => v.trim()) || sort !== null || Object.keys(picks).length > 0 || groups.length > 0;

  const view = useMemo(() => {
    const tests = p.columns.filter((c) => filters[c.key]?.trim()).map((c) => ({ c, ok: matcher(filters[c.key]!, c.type) }));
    let list = p.rows.map((r, i) => ({ r, i }));
    if (active) list = list.filter(({ r }) => kindOf(r) === 'data');
    if (tests.length) list = list.filter(({ r }) => tests.every(({ c, ok }) => ok(valueOf(c, r))));
    const pickCols = p.columns.filter((c) => picks[c.key]);
    if (pickCols.length) list = list.filter(({ r }) => pickCols.every((c) => picks[c.key]!.has(textOf(c, r))));
    if (sort) {
      const c = p.columns.find((x) => x.key === sort.key);
      if (c) list = [...list].sort((a, b) => sort.dir * compare(valueOf(c, a.r), valueOf(c, b.r), isNumeric(c.type)));
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.rows, p.columns, filters, sort, active, picks]);

  const dataRows = view.filter(({ r }) => kindOf(r) === 'data').map(({ r }) => r);

  // Nhóm theo cột: dòng tiêu đề nhóm (bấm để thu / mở) rồi các dòng của nhóm.
  const display = useMemo<Display<T>[]>(() => {
    const gcols = groups.map((k) => p.columns.find((c) => c.key === k)).filter((c): c is Column<T> => Boolean(c));
    if (!gcols.length) return view.map(({ r, i }) => ({ kind: 'r' as const, r, i, level: 0 }));
    const out: Display<T>[] = [];
    const walk = (list: { r: T; i: number }[], level: number, path: string) => {
      const c = gcols[level]!;
      const buckets = new Map<string, { r: T; i: number }[]>();
      for (const x of list) { const t = textOf(c, x.r); if (!buckets.has(t)) buckets.set(t, []); buckets.get(t)!.push(x); }
      const keys = [...buckets.keys()].sort((a, b) => (sort?.key === c.key ? sort.dir : 1) * a.localeCompare(b, 'vi', { numeric: true }));
      for (const k of keys) {
        const items = buckets.get(k)!;
        const key = `${path}|${k}`;
        const open = !closed.has(key);
        out.push({ kind: 'g', key, level, open, count: items.length, label: <><b>{headerTitle(c)}:</b> {k || '(Trống)'}</> });
        if (!open) continue;
        if (level + 1 < gcols.length) walk(items, level + 1, key);
        else for (const x of items) out.push({ kind: 'r', r: x.r, i: x.i, level: level + 1 });
      }
    };
    walk(view, 0, '');
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, groups, closed, p.columns, sort]);

  // Chỉ vẽ các dòng đang thấy khi bảng dài.
  const virtual = display.length > VIRTUAL_FROM && !printing;
  const winStart = virtual ? Math.max(0, Math.floor(scroll.top / rowH) - OVERSCAN) : 0;
  const winEnd = virtual ? Math.min(display.length, Math.ceil((scroll.top + scroll.height) / rowH) + OVERSCAN) : display.length;
  const shownRows = virtual ? display.slice(winStart, winEnd) : display;
  useLayoutEffect(() => {
    if (!virtual) return;
    // Chiều cao dòng = TRUNG BÌNH các dòng đang vẽ (dòng tiêu đề nhóm, dòng có ô nhập cao thấp khác nhau). Không nhận lại giá trị
    // vừa bỏ (đo A → B → A…): tránh vẽ lại không dừng làm trắng trang khi lăn bảng dài có dòng cao thấp khác nhau.
    const trs = [...(wrapRef.current?.querySelectorAll<HTMLElement>('tbody tr.dgrid-row') ?? [])];
    const h = trs.length ? Math.round((trs.reduce((t, tr) => t + tr.getBoundingClientRect().height, 0) / trs.length) * 2) / 2 : 0;
    if (h && Math.abs(h - rowH) > 1 && Math.abs(h - prevRowH.current) > 1) { prevRowH.current = rowH; setRowH(h); }
    const w = wrapRef.current;
    if (w && w.clientHeight && Math.abs(w.clientHeight - scroll.height) > 1) setScroll({ top: w.scrollTop, height: w.clientHeight });
  });
  const showFooter = p.footerLabel !== false && cols.some((c) => c.sum || c.footer !== undefined || c.footerValue);

  const cell = (c: Column<T>, r: T): ReactNode => {
    if (c.render) return c.render(r);
    const v = valueOf(c, r);
    switch (c.type) {
      case 'money': return <Money value={Number(v ?? 0)} blankZero={!c.showZero} bold={typeof c.bold === 'function' ? c.bold(r) : c.bold} />;
      case 'number': return v === null || v === undefined || (v === 0 && !c.showZero) ? '' : Number(v).toLocaleString('vi-VN');
      case 'qty': return v || (v === 0 && c.showZero) ? qtyFmt.format(Number(v)) : '';
      case 'date': return fmtDate(v === null || v === undefined ? '' : String(v));
      case 'check': return <input type="checkbox" className="dgrid-check" checked={Boolean(v)} readOnly tabIndex={-1} />;
      default: return v === null || v === undefined ? '' : String(v);
    }
  };
  const footerCell = (c: Column<T>): ReactNode => {
    if (c.footerValue) return <Money value={c.footerValue(dataRows)} />;
    if (c.footer !== undefined) return typeof c.footer === 'function' ? (c.footer as (rows: T[]) => ReactNode)(dataRows) : c.footer;
    if (!c.sum) return null;
    const total = dataRows.reduce((s, r) => s + Math.round(Number(valueOf(c, r) ?? 0) * 100), 0) / 100;
    return c.type === 'qty' ? qtyFmt.format(total) : <Money value={total} />;
  };
  const tdClass = (c: Column<T>) => [isNumeric(c.type) ? 'num' : '', c.type === 'code' ? 'mono' : '', c.type === 'check' ? 'center' : '', c.className ?? ''].join(' ').trim();

  // Kéo giãn cột.
  const startResize = (key: string, e: React.MouseEvent<HTMLSpanElement>) => {
    e.preventDefault();
    e.stopPropagation();
    const th = (e.target as HTMLElement).parentElement!;
    const startX = e.clientX;
    const startW = th.getBoundingClientRect().width;
    const move = (ev: MouseEvent) => setSaved((s) => ({ ...s, widths: { ...s.widths, [key]: Math.max(32, Math.round(startW + ev.clientX - startX)) } }));
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  };
  const toggleCol = (c: Column<T>) => setSaved((s) => {
    const visible = !hiddenSet.has(c.key);
    let hidden = s.hidden.filter((k) => k !== c.key && k !== `!${c.key}`);
    if (visible) hidden = [...hidden, c.key];
    else if (c.hidden) hidden = [...hidden, `!${c.key}`];
    return { ...s, hidden };
  });

  // Tiêu đề hai tầng.
  const bands = cols.some((c) => c.band);
  const bandCells: { band?: string; span: number; key: string }[] = [];
  if (bands) for (const c of cols) {
    const last = bandCells[bandCells.length - 1];
    if (last && c.band && last.band === c.band) last.span += 1;
    else bandCells.push({ band: c.band, span: 1, key: c.key });
  }

  // Xuất Excel đúng những gì đang thấy: cột đang hiện, dòng sau lọc / sắp xếp, dòng tổng.
  const exportExcel = async () => {
    const XLSX = await import('xlsx');
    const head = cols.map((c) => (c.band ? `${c.band} - ${headerTitle(c)}` : headerTitle(c)));
    const cellValue = (c: Column<T>, r: T): string | number => {
      const v = valueOf(c, r);
      if (v === null || v === undefined) return '';
      if (isNumeric(c.type)) return Number(v);
      if (c.type === 'check') return v ? 'x' : '';
      if (c.type === 'date') return fmtDate(String(v));
      return String(v);
    };
    const aoa: (string | number)[][] = [];
    // Dòng đầu tệp: tiêu đề báo cáo (lấy theo tên màn đang mở nếu không truyền riêng).
    const title = p.exportTitle ?? rootRef.current?.closest('.ws-panel, .page')?.querySelector('.page-title h1')?.textContent ?? '';
    if (title) aoa.push([title], []);
    aoa.push(head);
    for (const { r } of view) aoa.push(cols.map((c) => cellValue(c, r)));
    if (showFooter) {
      aoa.push(cols.map((c, i) => {
        if (c.footerValue) return c.footerValue(dataRows);
        if (c.sum) return dataRows.reduce((t, r) => t + Math.round(Number(valueOf(c, r) ?? 0) * 100), 0) / 100;
        if (typeof c.footer === 'string' || typeof c.footer === 'number') return c.footer;
        return i === 0 ? `${p.footerLabel ?? 'Tổng cộng'}` : '';
      }));
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = cols.map((c) => ({ wch: Math.min(60, Math.max(8, Math.round((saved.widths[c.key] ?? c.width ?? (isNumeric(c.type) ? 110 : 140)) / 7))) }));
    // Định dạng số kiểu Việt Nam cho cột tiền, số lượng.
    const start = title ? 3 : 1;
    cols.forEach((c, ci) => {
      if (!isNumeric(c.type)) return;
      for (let ri = start; ri < aoa.length; ri++) {
        const ref = XLSX.utils.encode_cell({ r: ri, c: ci });
        if (ws[ref] && typeof ws[ref].v === 'number') ws[ref].z = c.type === 'qty' ? '#,##0.###' : '#,##0';
      }
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bang');
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `${p.exportName ?? p.storageKey ?? 'bang'}-${stamp}.xlsx`);
  };

  if (p.exportRef) p.exportRef.current = () => void exportExcel();
  if (p.viewRef) p.viewRef.current = dataRows;

  // Danh sách giá trị của cột đang mở lọc nhanh (tính trên các dòng dữ liệu, bỏ qua lọc của chính cột đó).
  const pickerCol = picker ? p.columns.find((c) => c.key === picker.key) : undefined;

  return (
    <div className={`dgrid ${p.compact ? 'compact' : ''}`} ref={rootRef}>
      {!p.compact && <div className="dgrid-tools">
        <span className="muted">
          {active ? `${dataRows.length.toLocaleString('vi-VN')} / ${p.rows.filter((r) => kindOf(r) === 'data').length.toLocaleString('vi-VN')} dòng` : `${dataRows.length.toLocaleString('vi-VN')} dòng`}
          {p.note ? <> · {p.note}</> : null}
        </span>
        <span className="spacer" />
        {active && <button className="btn btn-sm btn-ghost" onClick={() => { setFilters({}); setSort(null); setPicks({}); setGroups([]); }}><FilterX size={14} /> Bỏ lọc, sắp xếp</button>}
        {p.onExportAll ? (
          <>
            <button className="btn btn-sm btn-ghost" onClick={() => p.onExportAll?.()} title="Xuất toàn bộ số liệu của kỳ theo các ô lọc phía trên (mọi trang)"><FileSpreadsheet size={14} /> Xuất Excel cả kỳ</button>
            <button className="btn btn-sm btn-ghost" onClick={() => void exportExcel()} title="Xuất đúng trang đang xem (cột, dòng đang lọc)">Xuất trang này</button>
          </>
        ) : p.exportRef ? null : (
          <button className="btn btn-sm btn-ghost" onClick={() => void exportExcel()} title="Xuất bảng đang xem ra Excel (đúng cột, dòng đang lọc)"><FileSpreadsheet size={14} /> Xuất Excel</button>
        )}
        <div className="dgrid-chooser" ref={chooserRef}>
          <button className="btn btn-sm btn-ghost" onClick={() => setChooser((v) => !v)} title="Ẩn / hiện cột"><Columns3 size={14} /> Cột</button>
          {chooser && (
            <div className="dgrid-chooser-drop">
              {p.columns.map((c) => (
                <label key={c.key} className="checkbox"><input type="checkbox" checked={!hiddenSet.has(c.key)} onChange={() => toggleCol(c)} /> {headerTitle(c)}{c.band ? <span className="muted"> ({c.band})</span> : null}</label>
              ))}
              <button className="btn btn-sm" onClick={() => setSaved({ widths: {}, hidden: [] })}>Trả về mặc định</button>
            </div>
          )}
        </div>
      </div>}
      {p.groupable && (
        <div
          className={`dgrid-groupby ${dropping ? 'over' : ''}`}
          onDragOver={(e) => { if (e.dataTransfer.types.includes('text/dgrid-col')) { e.preventDefault(); setDropping(true); } }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => { e.preventDefault(); setDropping(false); const k = e.dataTransfer.getData('text/dgrid-col'); if (k && !groups.includes(k)) setGroups((g) => [...g, k]); }}
        >
          {groups.length === 0 ? <span className="muted">Kéo một cột vào đây để nhóm theo cột đó</span> : groups.map((k, gi) => {
            const c = p.columns.find((x) => x.key === k);
            return (
              <span key={k} className="dgrid-chip">
                {gi > 0 && <span className="muted">›</span>}{c ? headerTitle(c) : k}
                <button title="Bỏ nhóm theo cột này" onClick={() => setGroups((g) => g.filter((x) => x !== k))}><X size={11} /></button>
              </span>
            );
          })}
          {groups.length > 0 && (
            <>
              <span className="spacer" />
              <button className="btn btn-sm btn-ghost" onClick={() => setClosed(new Set())}>Mở hết</button>
              <button className="btn btn-sm btn-ghost" onClick={() => setClosed(new Set(display.flatMap((d) => (d.kind === 'g' && d.level === 0 ? [d.key] : []))))}>Thu hết</button>
            </>
          )}
        </div>
      )}
      <div
        className="table-wrap dgrid-wrap"
        ref={wrapRef}
        onScroll={virtual ? (e) => { const t = e.currentTarget; setScroll({ top: t.scrollTop, height: t.clientHeight }); } : undefined}
        style={p.maxHeight ? { maxHeight: p.maxHeight } : fitHeight ? { maxHeight: fitHeight } : undefined}>
        {/* Đã kéo giãn cột: bố cục cố định theo độ rộng từng cột → thu hẹp được tới ~1 cm (chữ dài tự "…"), như Excel. */}
        <table className="grid dgrid-table" style={Object.keys(saved.widths).length ? { tableLayout: 'fixed', width: cols.reduce((sum, c) => sum + (saved.widths[c.key] ?? c.width ?? (isNumeric(c.type) ? 110 : 140)), 0), minWidth: 0 } : undefined}>
          <colgroup>{cols.map((c) => <col key={c.key} style={{ width: saved.widths[c.key] ?? c.width ?? (virtual || Object.keys(saved.widths).length ? (isNumeric(c.type) ? 110 : 140) : undefined) }} />)}</colgroup>
          <thead>
            {bands && (
              <tr className="dgrid-bands">
                {bandCells.map((b) => (b.band ? <th key={b.key} colSpan={b.span} className="band">{b.band}</th> : <th key={b.key} className="band empty" />))}
              </tr>
            )}
            <tr>
              {cols.map((c) => {
                const s = sort?.key === c.key ? sort.dir : 0;
                return (
                  <th
                    key={c.key}
                    draggable={p.groupable && !c.noFilter}
                    onDragStart={(e) => { e.dataTransfer.setData('text/dgrid-col', c.key); e.dataTransfer.effectAllowed = 'copy'; }}
                    className={`${isNumeric(c.type) ? 'num' : ''} ${c.type === 'check' ? 'center' : ''} ${c.noSort ? '' : 'sortable'} ${c.className ?? ''}`}
                    onClick={() => !c.noSort && setSort(s === 0 ? { key: c.key, dir: 1 } : s === 1 ? { key: c.key, dir: -1 } : null)}
                    title={c.noSort ? undefined : 'Bấm để sắp xếp'}
                  >
                    {c.header}
                    {s === 1 && <ArrowUp size={12} className="sort-ico" />}
                    {s === -1 && <ArrowDown size={12} className="sort-ico" />}
                    {!c.noFilter && (
                      <button
                        className={`dgrid-funnel ${picks[c.key] ? 'on' : ''}`}
                        title="Lọc nhanh theo giá trị"
                        onClick={(e) => { e.stopPropagation(); const b = (e.currentTarget as HTMLElement).getBoundingClientRect(); setPicker(picker?.key === c.key ? null : { key: c.key, x: Math.min(b.left, window.innerWidth - 300), y: b.bottom + 4 }); }}
                      >
                        <Filter size={11} />
                      </button>
                    )}
                    <span className="dgrid-resize" onMouseDown={(e) => startResize(c.key, e)} onClick={(e) => e.stopPropagation()} />
                  </th>
                );
              })}
            </tr>
            {!p.compact && <tr className="dgrid-filter">
              {cols.map((c) => (
                <th key={c.key}>
                  {!c.noFilter && (
                    <input
                      size={1}
                      value={filters[c.key] ?? ''}
                      onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                      placeholder={isNumeric(c.type) ? '>, <, =…' : '🔍'}
                      className={isNumeric(c.type) ? 'num' : ''}
                    />
                  )}
                </th>
              ))}
            </tr>}
          </thead>
          <tbody>
            {!active && p.topRows?.map((t) => (
              <tr key={t.key} className={t.className ?? 'group-row'}>
                {cols.map((c, i) => <td key={c.key} className={tdClass(c)}>{i === 0 && t.label !== undefined ? t.label : t.cells[c.key] ?? null}</td>)}
              </tr>
            ))}
            {display.length === 0 && <tr><td colSpan={cols.length} className="muted" style={{ textAlign: 'center', padding: 20 }}>{p.emptyText ?? 'Không tìm thấy bản ghi nào thỏa mãn điều kiện'}</td></tr>}
            {virtual && winStart > 0 && <tr className="dgrid-spacer" style={{ height: winStart * rowH }}><td colSpan={cols.length} /></tr>}
            {shownRows.map((d) => {
              if (d.kind === 'g') {
                return (
                  <tr key={`g${d.key}`} className="dgrid-grouprow" onClick={() => setClosed((s) => { const n = new Set(s); if (n.has(d.key)) n.delete(d.key); else n.add(d.key); return n; })}>
                    <td colSpan={cols.length} style={{ paddingLeft: 8 + d.level * 18 }}>
                      {d.open ? <ChevronDown size={13} /> : <ChevronRight size={13} />} {d.label} <span className="muted">({d.count.toLocaleString('vi-VN')})</span>
                    </td>
                  </tr>
                );
              }
              const { r, i } = d;
              const k = p.rowKey(r, i);
              const kind = kindOf(r);
              const cls = [
                p.onRowClick && kind === 'data' ? 'clickable' : '',
                kind === 'group' ? 'group-row' : kind === 'subtotal' ? 'bold' : '',
                selected === k ? 'selected' : '',
                p.rowClassName?.(r) ?? '',
              ].join(' ').trim();
              return (
                <tr
                  key={k}
                  className={`dgrid-row ${cls}`}
                  onClick={() => { setSelected(k); p.onSelect?.(kind === 'data' ? r : null); if (kind === 'data') p.onRowClick?.(r); }}
                  onDoubleClick={() => { if (kind === 'data') p.onRowDoubleClick?.(r); }}
                >
                  {kind === 'group' && p.groupLabel ? <td colSpan={cols.length}>{p.groupLabel(r)}</td> : cols.map((c) => <td key={c.key} className={tdClass(c)} style={(typeof c.bold === 'function' ? c.bold(r) : c.bold) ? { fontWeight: 700 } : undefined}>{cell(c, r)}</td>)}
                </tr>
              );
            })}
            {virtual && winEnd < display.length && <tr className="dgrid-spacer" style={{ height: (display.length - winEnd) * rowH }}><td colSpan={cols.length} /></tr>}
          </tbody>
          {(showFooter || (p.bottomRows?.length && !active)) && (
            <tfoot>
              {showFooter && (
                <tr>
                  {cols.map((c, i) => <td key={c.key} className={tdClass(c)}>{i === 0 && c.footer === undefined && !c.sum && !c.footerValue ? `${p.footerLabel ?? 'Tổng cộng'}${active ? ' (đang lọc)' : ''}` : footerCell(c)}</td>)}
                </tr>
              )}
              {!active && p.bottomRows?.map((t) => (
                <tr key={t.key}>
                  {cols.map((c, i) => <td key={c.key} className={tdClass(c)}>{i === 0 && t.label !== undefined ? t.label : t.cells[c.key] ?? null}</td>)}
                </tr>
              ))}
            </tfoot>
          )}
        </table>
      </div>
      {picker && pickerCol && createPortal(
        <ValuePicker
          x={picker.x}
          y={picker.y}
          values={(() => {
            const counts = new Map<string, number>();
            for (const r of p.rows) if (kindOf(r) === 'data') { const t = textOf(pickerCol, r); counts.set(t, (counts.get(t) ?? 0) + 1); }
            return [...counts.entries()].sort((a, b) => (isNumeric(pickerCol.type) ? Number(a[0].replace(/\./g, '').replace(',', '.')) - Number(b[0].replace(/\./g, '').replace(',', '.')) : a[0].localeCompare(b[0], 'vi', { numeric: true })));
          })()}
          selected={picks[pickerCol.key]}
          onApply={(sel) => { setPicks((x) => { const n = { ...x }; if (sel) n[pickerCol.key] = sel; else delete n[pickerCol.key]; return n; }); setPicker(null); }}
          onClose={() => setPicker(null)}
        />,
        document.body,
      )}
    </div>
  );
}

/** Hộp lọc nhanh: tích chọn các giá trị của cột (có ô tìm, chọn tất cả). */
function ValuePicker({ x, y, values, selected, onApply, onClose }: { x: number; y: number; values: [string, number][]; selected?: Set<string>; onApply: (sel: Set<string> | null) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<Set<string>>(() => new Set(selected ?? values.map(([v]) => v)));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [onClose]);
  const shown = values.filter(([v]) => !q || fold(v).includes(fold(q))).slice(0, 2000);
  const allShown = shown.every(([v]) => sel.has(v));
  const toggleAll = () => setSel((s) => { const n = new Set(s); for (const [v] of shown) { if (allShown) n.delete(v); else n.add(v); } return n; });
  return (
    <div className="dgrid-picker" ref={ref} style={{ left: x, top: Math.min(y, window.innerHeight - 380) }}>
      <input autoFocus className="input" placeholder="Tìm giá trị…" value={q} onChange={(e) => setQ(e.target.value)} />
      <label className="checkbox all"><input type="checkbox" checked={allShown} onChange={toggleAll} /> (Chọn tất cả{q ? ' kết quả tìm' : ''})</label>
      <div className="dgrid-picker-list">
        {shown.map(([v, n]) => (
          <label key={v} className="checkbox"><input type="checkbox" checked={sel.has(v)} onChange={() => setSel((s) => { const x2 = new Set(s); if (x2.has(v)) x2.delete(v); else x2.add(v); return x2; })} /> <span className="v">{v || '(Trống)'}</span><span className="muted n">{n}</span></label>
        ))}
        {values.length > shown.length && !q && <div className="muted" style={{ padding: 4 }}>… gõ để tìm thêm</div>}
      </div>
      <div className="dgrid-picker-foot">
        <button className="btn btn-sm" onClick={() => onApply(null)}>Bỏ lọc cột</button>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={onClose}>Huỷ</button>
        <button className="btn btn-sm btn-primary" disabled={sel.size === 0} onClick={() => onApply(sel.size === values.length ? null : sel)}>Đồng ý</button>
      </div>
    </div>
  );
}
