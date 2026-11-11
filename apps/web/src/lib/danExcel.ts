// [2026-11-11 Nguyễn Văn Thủy] DÁN TỪ EXCEL (Ctrl + V) vào lưới dòng chứng từ — đọc clipboard thành bảng ô (đóng góp)
/**
 * Excel / Google Sheets chép ra clipboard dạng chữ: ô cách nhau bằng Tab, dòng cách nhau bằng xuống dòng; ô có xuống dòng
 * bên trong thì bọc trong ngoặc kép (" thành ""). `bangDan` trả bảng ô; dán MỘT ô (không có Tab, không có xuống dòng) trả null
 * để ô đang gõ dán như bình thường.
 */
export function bangDan(text: string): string[][] | null {
  const t = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '');
  if (!t.includes('\t') && !t.includes('\n')) return null;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]!;
    if (quoted) {
      if (ch === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows.map((r) => r.map((c) => c.trim())).filter((r) => r.some(Boolean));
}

/** Chữ không dấu, thường — để nhận dòng tiêu đề (Mã hàng, TK Nợ, Số tiền…). */
export const khongDau = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();

/** Ô là số (dấu chấm / phẩy ngăn nghìn hoặc thập phân, kèm % / đ): 1.250.000 · 12,5 · 3% → số; không phải số → NaN. */
export function soDan(v: string): number {
  let t = v.replace(/[\s%đ₫]/g, '');
  if (!t || !/^-?[\d.,]+$/.test(t)) return NaN;
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '');
  else if (t.includes('.') && t.includes(',')) { const dec = t.lastIndexOf(',') > t.lastIndexOf('.') ? ',' : '.'; t = t.split(dec === ',' ? '.' : ',').join('').replace(',', '.'); }
  else t = t.replace(',', '.');
  return Number(t);
}
