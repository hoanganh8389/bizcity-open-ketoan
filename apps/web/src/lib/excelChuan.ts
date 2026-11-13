// [2026-11-11 Nguyễn Văn Thủy] XUẤT EXCEL CHUẨN cho mọi màn: kẻ ô, tiêu đề cột nền xám, số có phân cách, độ rộng cột theo nội dung (đóng góp)
/**
 * Một nơi định dạng tệp Excel xuất ra (báo cáo, bảng kê, tờ khai, tệp mẫu nhập liệu) theo kiểu tệp của phần mềm kế toán mẫu:
 *   - phông Times New Roman 11; dòng tiêu đề trên cùng đậm cỡ 14, căn giữa, trải hết bề ngang bảng; các dòng dưới tiêu đề nghiêng;
 *   - mỗi BẢNG (khối dòng liền nhau, bắt đầu bằng dòng tiêu đề cột) kẻ ô mảnh; dòng tiêu đề cột đậm, nền xám, căn giữa, xuống dòng;
 *   - dòng một ô trong bảng (tên nhóm: "1. Hàng hóa…", "I. …") trải hết bề ngang, đậm; dòng "Tổng …" / "Cộng …" đậm;
 *   - số: #,##0 (số lẻ #,##0.##), âm trong ngoặc đơn; mã số (MST, số hoá đơn, mã hàng) truyền dạng chữ thì giữ nguyên chữ;
 *   - độ rộng cột tính theo nội dung (6–60 ký tự); bảng đầu tiên cố định dòng tiêu đề cột khi cuộn.
 * KHÔNG thêm / bớt / dời dòng, cột: tệp mẫu nhập liệu vẫn đọc lại đúng vị trí.
 * Cách dùng: luuExcel('ten-tep.xlsx', [{ name: 'Sheet', rows: aoa }]) — rows là mảng hai chiều như trước (aoa).
 */
export type O = string | number | boolean | null | undefined;
export interface SheetChuan {
  name: string;
  rows: O[][];
  /** Độ rộng cột (số ký tự); không truyền thì tự tính. */
  widths?: number[];
  /** Dòng (0-based) chắc chắn là tiêu đề cột — dùng khi tự dò không đúng (vd tệp mẫu chỉ có một cột). */
  headerRows?: number[];
  /** Định dạng số riêng theo cột (0-based), vd '#,##0.###' cho số lượng. */
  numFmt?: Record<number, string>;
  /** Ô gộp (0-based, gồm cả hai đầu): [dòng đầu, cột đầu, dòng cuối, cột cuối] — vd tiêu đề cột hai tầng. */
  merges?: [number, number, number, number][];
  /** Thân bảng là dữ liệu thuần (danh sách màn hình): không coi dòng một ô là tên nhóm. */
  plainBody?: boolean;
}

const BORDER = { top: { style: 'thin' as const }, left: { style: 'thin' as const }, bottom: { style: 'thin' as const }, right: { style: 'thin' as const } };
const FONT = 'Times New Roman';
const empty = (v: O) => v === null || v === undefined || v === '';
const filled = (r: O[]) => r.filter((v) => !empty(v)).length;
const isText = (v: O) => typeof v === 'string' && !/^-?[\d.,]+$/.test(v.trim());
const TONG = /^\s*(tổng|cộng|tong cong)/i;

export async function luuExcel(file: string, sheets: SheetChuan[]) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const sh of sheets) {
    let name = sh.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet';
    while (used.has(name)) name = `${name.slice(0, 28)}_${used.size}`;
    used.add(name);
    const ws = wb.addWorksheet(name);
    const rows = sh.rows.map((r) => (r ?? []).map((v) => (typeof v === 'boolean' ? (v ? 'x' : '') : v)));
    const width = Math.max(1, ...rows.map((r) => r.length));

    // Phân vai từng dòng: tiêu đề trên cùng, tiêu đề cột, thân bảng, dòng ngoài bảng.
    type Role = 'title' | 'sub' | 'head' | 'body' | 'group' | 'total' | 'note' | 'blank';
    const role: Role[] = [];
    let inTable = false;
    let seenTable = false;
    let firstHead = -1;
    rows.forEach((r, i) => {
      const n = filled(r);
      if (!n) { role.push('blank'); inTable = false; return; }
      const forced = sh.headerRows?.includes(i);
      const auto = !sh.headerRows && !inTable && n >= 2 && r.every((v) => empty(v) || isText(v));
      if (forced || auto) {
        // Dòng tiêu đề cột (tiêu đề hai tầng: dòng chữ ngay sau dòng tiêu đề cũng là tiêu đề).
        role.push('head'); inTable = true; seenTable = true; if (firstHead < 0) firstHead = i; return;
      }
      if (inTable) {
        if (n === 1 && !empty(r[0]) && !sh.plainBody) role.push(TONG.test(String(r[0])) ? 'total' : 'group');
        else role.push(TONG.test(String(r.find((v) => !empty(v)) ?? '')) ? 'total' : 'body');
        return;
      }
      if (!seenTable && n === 1) { role.push(rows.slice(0, i).some((x) => filled(x)) ? 'sub' : 'title'); return; }
      role.push('note');
    });
    // Bề ngang bảng = số cột lớn nhất của các dòng trong bảng.
    const tableWidth = Math.max(1, ...rows.filter((_, i) => ['head', 'body', 'total'].includes(role[i]!)).map((r) => r.length), width);

    rows.forEach((r, i) => {
      const row = ws.addRow(r.map((v) => (empty(v) ? null : v)));
      const rl = role[i]!;
      if (rl === 'title' || rl === 'sub') {
        ws.mergeCells(i + 1, 1, i + 1, tableWidth);
        const c = row.getCell(1);
        c.font = { name: FONT, size: rl === 'title' ? 14 : 11, bold: rl === 'title', italic: rl === 'sub' };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        row.height = rl === 'title' ? 22 : 16;
        return;
      }
      if (rl === 'blank') return;
      if (rl === 'note') {
        // Ngoài bảng: dòng một ô ở cột đầu là tên mục (đậm); đoạn chữ / dòng tổng cuối bảng kê để thường, số có phân cách.
        const heading = filled(r) === 1 && !empty(r[0]);
        row.eachCell({ includeEmpty: false }, (c) => { c.font = { name: FONT, size: 11, bold: heading || TONG.test(String(r[0] ?? '')) }; if (typeof c.value === 'number') c.numFmt = '#,##0;(#,##0)'; });
        return;
      }
      if (rl === 'group' || (rl === 'total' && filled(r) === 1)) {
        ws.mergeCells(i + 1, 1, i + 1, tableWidth);
        const c = row.getCell(1);
        c.font = { name: FONT, size: 11, bold: true };
        c.alignment = { vertical: 'middle', wrapText: true };
        c.border = BORDER;
        return;
      }
      for (let ci = 1; ci <= tableWidth; ci++) {
        const c = row.getCell(ci);
        c.border = BORDER;
        if (rl === 'head') {
          c.font = { name: FONT, size: 11, bold: true };
          c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD3D3D3' } };
          c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          continue;
        }
        c.font = { name: FONT, size: 11, bold: rl === 'total' };
        if (typeof c.value === 'number') {
          c.numFmt = sh.numFmt?.[ci - 1] ?? (Number.isInteger(c.value) ? '#,##0;(#,##0)' : '#,##0.##;(#,##0.##)');
          c.alignment = { horizontal: 'right', vertical: 'middle' };
        } else c.alignment = { vertical: 'middle', wrapText: true };
      }
    });

    for (const [r1, c1, r2, c2] of sh.merges ?? []) { try { ws.mergeCells(r1 + 1, c1 + 1, r2 + 1, c2 + 1); } catch { /* trùng ô gộp: bỏ qua */ } }
    // Độ rộng cột theo nội dung (bỏ dòng tiêu đề trên cùng / dòng nhóm trải ngang).
    for (let ci = 0; ci < tableWidth; ci++) {
      let w = sh.widths?.[ci];
      if (!w) {
        w = 6;
        rows.forEach((r, i) => {
          if (!['head', 'body', 'total'].includes(role[i]!)) return;
          const v = r[ci];
          if (empty(v)) return;
          // Dòng tổng: chỉ tính ô số (nhãn "Tổng doanh thu …" dài không kéo giãn cột).
          if (role[i] === 'total' && typeof v !== 'number') return;
          const len = typeof v === 'number' ? Math.abs(Math.round(v)).toLocaleString('vi-VN').length + 2 : String(v).length;
          w = Math.max(w!, role[i] === 'head' ? Math.min(len, 22) : len);
        });
        w = Math.min(60, w + 2);
      }
      ws.getColumn(ci + 1).width = w;
    }
    if (firstHead >= 0 && rows.filter((_, i) => role[i] === 'head').length <= 2 && !rows.some((_, i) => i > firstHead + 2 && role[i] === 'head')) {
      const lastHead = role.lastIndexOf('head');
      ws.views = [{ state: 'frozen', ySplit: lastHead + 1 }];
    }
  }
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url; a.download = file.endsWith('.xlsx') ? file : `${file}.xlsx`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Giá trị bất kỳ → giá trị ô: ngày thành dd/mm/yyyy, đối tượng thành chữ. */
function oCell(v: unknown): O {
  if (v === null || v === undefined || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
  if (v instanceof Date) return `${String(v.getDate()).padStart(2, '0')}/${String(v.getMonth() + 1).padStart(2, '0')}/${v.getFullYear()}`;
  return String(v);
}

/** Đổi mảng đối tượng (kiểu json_to_sheet) thành mảng hai chiều: dòng đầu là tên cột. */
export function tuDoiTuong(list: Record<string, O>[]): O[][] {
  const keys = list.length ? Object.keys(list[0]!) : [];
  return [keys, ...list.map((o) => keys.map((k) => o[k]))];
}

/**
 * Lớp thay thế cùng tên hàm với thư viện xlsx (book_new, aoa_to_sheet, json_to_sheet, book_append_sheet, writeFile, '!cols')
 * cho các chỗ xuất đã viết theo kiểu cũ: đổi dòng nạp thư viện là có định dạng chuẩn, không phải viết lại logic.
 */
type WsChuan = { rows: O[][]; '!cols'?: { wch?: number }[]; '!merges'?: { s: { r: number; c: number }; e: { r: number; c: number } }[]; headerRows?: number[] };
type WbChuan = { sheets: SheetChuan[] };
export function xlsxChuan() {
  return {
    utils: {
      book_new: (): WbChuan => ({ sheets: [] }),
      aoa_to_sheet: (rows: unknown[][]): WsChuan => ({ rows: rows.map((r) => r.map(oCell)) }),
      json_to_sheet: (list: Record<string, unknown>[]): WsChuan => ({ rows: tuDoiTuong(list.map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, oCell(v)])))) }),
      book_append_sheet: (wb: WbChuan, ws: WsChuan, name: string) => {
        wb.sheets.push({ name, rows: ws.rows, widths: ws['!cols']?.map((c) => c.wch ?? 0), headerRows: ws.headerRows, merges: ws['!merges']?.map((m) => [m.s.r, m.s.c, m.e.r, m.e.c] as [number, number, number, number]) });
      },
    },
    writeFile: (wb: WbChuan, file: string) => luuExcel(file, wb.sheets),
  };
}
