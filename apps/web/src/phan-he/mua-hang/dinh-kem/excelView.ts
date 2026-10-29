/**
 * ĐỌC EXCEL CÓ ĐỊNH DẠNG để xem trên web giống khi mở bằng Excel: màu nền, màu / đậm / nghiêng / gạch chân / cỡ chữ, viền, căn lề,
 * xuống dòng, gộp ô, độ rộng cột, chiều cao dòng, ẩn dòng / cột. Định dạng đọc bằng exceljs (.xlsx); chữ hiển thị lấy chữ đã định dạng
 * số / ngày của SheetJS (giống ô Excel hiện). .xls / .csv (exceljs không đọc) → chỉ chữ.
 */
import type ExcelJS from 'exceljs';

export interface XCell { text: string; style: Record<string, string>; rowSpan?: number; colSpan?: number }
export interface XSheet { name: string; colWidths: number[]; rowHeights: (number | undefined)[]; rows: (XCell | null)[][]; truncated: boolean; tabColor?: string }

const MAX_ROWS = 3000, MAX_COLS = 120;

/** Bảng màu chỉ số (indexed) chuẩn của Excel. */
const INDEXED = ['000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF', '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080', '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF', '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696', '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333'];
/** Màu chủ đề Office mặc định theo chỉ số theme của ô (0 lt1, 1 dk1, 2 lt2, 3 dk2, 4–9 accent1–6). */
const DEFAULT_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];

/** Đọc bảng màu chủ đề từ theme1.xml của tệp (thứ tự trong tệp: dk1 lt1 dk2 lt2 accent1–6 hlink folHlink → đổi về chỉ số ô). */
function themeColors(wb: ExcelJS.Workbook): string[] {
  const xml = (wb as unknown as { _themes?: Record<string, string> })._themes?.theme1;
  if (!xml) return DEFAULT_THEME;
  const pick = (tag: string) => { const m = new RegExp(`<a:${tag}>[\\s\\S]*?(?:srgbClr val="([0-9A-Fa-f]{6})"|lastClr="([0-9A-Fa-f]{6})")`).exec(xml); return (m?.[1] ?? m?.[2])?.toUpperCase(); };
  const v = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'].map(pick);
  return v.map((c, i) => c ?? DEFAULT_THEME[i]!);
}
/** Áp độ sáng (tint) như Excel: âm = tối đi, dương = sáng lên. */
function tint(hex: string, t?: number): string {
  if (!t) return hex;
  const ch = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)).map((c) => Math.round(t < 0 ? c * (1 + t) : c + (255 - c) * t));
  return ch.map((c) => Math.max(0, Math.min(255, c)).toString(16).padStart(2, '0')).join('').toUpperCase();
}
type XColor = { argb?: string; theme?: number; tint?: number; indexed?: number } | undefined;
function color(c: XColor, theme: string[]): string | undefined {
  if (!c) return undefined;
  if (c.argb) { const a = c.argb.length === 8 ? c.argb.slice(2) : c.argb; return `#${tint(a.toUpperCase(), c.tint)}`; }
  if (c.theme !== undefined) return `#${tint(theme[c.theme] ?? '000000', c.tint)}`;
  if (c.indexed !== undefined && c.indexed < INDEXED.length) return `#${INDEXED[c.indexed]}`;
  return undefined;
}
const BORDER: Record<string, string> = { thin: '1px solid', hair: '1px solid', dotted: '1px dotted', dashed: '1px dashed', dashDot: '1px dashed', dashDotDot: '1px dashed', medium: '2px solid', mediumDashed: '2px dashed', mediumDashDot: '2px dashed', mediumDashDotDot: '2px dashed', slantDashDot: '2px dashed', thick: '3px solid', double: '3px double' };

function cellStyle(s: Partial<ExcelJS.Style>, theme: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  const f = s.fill as { type?: string; pattern?: string; fgColor?: XColor; bgColor?: XColor; stops?: { color: XColor }[] } | undefined;
  if (f?.type === 'pattern' && f.pattern && f.pattern !== 'none') { const c = color(f.fgColor, theme) ?? color(f.bgColor, theme); if (c) o.background = c; }
  else if (f?.type === 'gradient' && f.stops?.length) { const c = color(f.stops[0]!.color, theme); if (c) o.background = c; }
  const fo = s.font;
  if (fo) {
    if (fo.bold) o.fontWeight = '700';
    if (fo.italic) o.fontStyle = 'italic';
    const deco = [fo.underline ? 'underline' : '', fo.strike ? 'line-through' : ''].filter(Boolean).join(' ');
    if (deco) o.textDecoration = deco;
    if (fo.size) o.fontSize = `${Math.round(fo.size * 1.333)}px`;
    const c = color(fo.color as XColor, theme); if (c && c !== '#000000') o.color = c;
    if (fo.name) o.fontFamily = `"${fo.name}", Calibri, Arial, sans-serif`;
  }
  const al = s.alignment;
  if (al) {
    if (al.horizontal && (al.horizontal as string) !== 'general') o.textAlign = al.horizontal === 'centerContinuous' ? 'center' : al.horizontal === 'distributed' || al.horizontal === 'justify' ? 'justify' : al.horizontal === 'fill' ? 'left' : al.horizontal;
    if (al.vertical) o.verticalAlign = al.vertical === 'middle' ? 'middle' : al.vertical === 'top' ? 'top' : 'bottom';
    if (al.wrapText) o.whiteSpace = 'pre-wrap';
    if (al.indent) o.paddingLeft = `${4 + al.indent * 9}px`;
  }
  const b = s.border;
  if (b) for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const e = b[side] as { style?: string; color?: XColor } | undefined;
    if (e?.style && BORDER[e.style]) o[`border${side[0]!.toUpperCase()}${side.slice(1)}`] = `${BORDER[e.style]} ${color(e.color, theme) ?? '#000'}`;
  }
  return o;
}
const colIndex = (ref: string) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n; };
const rowIndex = (ref: string) => Number(ref.replace(/\D+/g, ''));

/** Đọc tệp Excel thành các sheet có định dạng. */
export async function readStyledWorkbook(buf: ArrayBuffer, fileName: string): Promise<XSheet[]> {
  const XLSX = await import('xlsx');
  const sj = XLSX.read(buf, { type: 'array', cellDates: false });
  const isXlsx = /\.xlsx$|\.xlsm$/i.test(fileName);
  let wb: ExcelJS.Workbook | null = null;
  if (isXlsx) {
    try { const E = (await import('exceljs')).default; wb = new E.Workbook(); await wb.xlsx.load(buf); } catch { wb = null; }
  }
  const theme = wb ? themeColors(wb) : DEFAULT_THEME;
  return sj.SheetNames.map((name, si) => {
    const s = sj.Sheets[name]!;
    const range = s['!ref'] ? XLSX.utils.decode_range(s['!ref']) : { s: { r: 0, c: 0 }, e: { r: -1, c: -1 } };
    const ws = wb?.getWorksheet(name) ?? wb?.worksheets[si];
    const nRows = Math.min(range.e.r + 1, MAX_ROWS), nCols = Math.min(range.e.c + 1, MAX_COLS);
    // Gộp ô: ô trên-trái mang rowSpan / colSpan, ô bị che = null.
    const covered = new Set<string>(), span = new Map<string, [number, number]>();
    const merges: string[] = (ws as unknown as { model?: { merges?: string[] } })?.model?.merges ?? (s['!merges'] ?? []).map((m) => XLSX.utils.encode_range(m));
    for (const m of merges) {
      const [a, b] = m.split(':'); if (!a || !b) continue;
      const r1 = rowIndex(a) - 1, c1 = colIndex(a) - 1, r2 = rowIndex(b) - 1, c2 = colIndex(b) - 1;
      span.set(`${r1}|${c1}`, [r2 - r1 + 1, c2 - c1 + 1]);
      for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) if (r !== r1 || c !== c1) covered.add(`${r}|${c}`);
    }
    const hiddenCols = new Set<number>(), colWidths: number[] = [];
    for (let c = 0; c < nCols; c++) {
      const col = ws?.getColumn(c + 1);
      if (col?.hidden) hiddenCols.add(c);
      const w = col?.width ?? (s['!cols']?.[c]?.wch);
      colWidths.push(w ? Math.round(w * 7 + 5) : 64);
    }
    const rows: (XCell | null)[][] = [], rowHeights: (number | undefined)[] = [];
    for (let r = 0; r < nRows; r++) {
      const wr = ws?.getRow(r + 1);
      if (wr?.hidden) continue;
      rowHeights.push(wr?.height ? Math.round(wr.height * 1.333) : undefined);
      const out: (XCell | null)[] = [];
      for (let c = 0; c < nCols; c++) {
        if (hiddenCols.has(c)) continue;
        if (covered.has(`${r}|${c}`)) { out.push(null); continue; }
        const sc = s[XLSX.utils.encode_cell({ r, c })] as { w?: string; v?: unknown } | undefined;
        const text = sc ? (sc.w ?? (sc.v === undefined || sc.v === null ? '' : String(sc.v))) : '';
        const wc = ws?.getRow(r + 1).getCell(c + 1);
        const style = wc ? cellStyle(wc.style ?? {}, theme) : {};
        // Số căn phải như Excel khi không khai căn lề.
        if (!style.textAlign && typeof sc?.v === 'number') style.textAlign = 'right';
        const sp = span.get(`${r}|${c}`);
        out.push({ text, style, ...(sp ? { rowSpan: sp[0], colSpan: sp[1] } : {}) });
      }
      // Như Excel: chữ dài, không xuống dòng, căn trái tràn sang các ô trống bên phải (gộp hiển thị, không đổi dữ liệu).
      const widths = colWidths.filter((_, c) => !hiddenCols.has(c));
      for (let j = 0; j < out.length; j++) {
        const c = out[j];
        if (!c || !c.text || c.colSpan || c.rowSpan || c.style.whiteSpace === 'pre-wrap' || (c.style.textAlign && c.style.textAlign !== 'left')) continue;
        const px = parseFloat(c.style.fontSize ?? '15') || 15;
        let need = c.text.length * px * 0.55 + 8, have = widths[j] ?? 64, k = j + 1;
        while (have < need && k < out.length) {
          const n = out[k];
          if (!n || n.text || n.rowSpan || n.colSpan || n.style.background) break;
          have += widths[k] ?? 64; k++;
        }
        if (k > j + 1) { c.colSpan = k - j; for (let t = j + 1; t < k; t++) out[t] = null; }
      }
      rows.push(out);
    }
    const tab = (ws as unknown as { properties?: { tabColor?: XColor } })?.properties?.tabColor;
    return { name, colWidths: colWidths.filter((_, c) => !hiddenCols.has(c)), rowHeights, rows, truncated: range.e.r + 1 > MAX_ROWS || range.e.c + 1 > MAX_COLS, tabColor: color(tab, theme) };
  });
}
