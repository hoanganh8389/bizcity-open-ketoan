/**
 * ĐƠN VỊ TÍNH — các phép tính dùng chung (form mặt hàng, phiếu, báo cáo).
 *   - Lưu: mỗi ĐVT một tỉ lệ về ĐVT nhỏ nhất (product_units.ratio): Lon 1 · Lốc 4 · Thùng 48.
 *   - Khai / hiển thị theo ĐVT TRUNG GIAN như NCC nói: "1 Thùng = 12 Lốc" → tỉ lệ 12 × 4 = 48.
 *   - Giá gợi ý theo tỉ lệ: biết giá một ĐVT thì suy ra ĐVT khác (giá ÷ tỉ lệ biết × tỉ lệ cần).
 */
export interface UnitRatio { unit: string; ratio: number }

const same = (a?: string, b?: string) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
const r6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** Các ĐVT xếp từ nhỏ đến lớn (bỏ dòng chưa có tên / tỉ lệ). */
export const sortUnits = <T extends UnitRatio>(units: T[]): T[] => units.filter((u) => u.unit.trim() && u.ratio > 0).sort((a, b) => a.ratio - b.ratio);

/** ĐVT nhỏ nhất (tỉ lệ 1). */
export const baseOf = (units: UnitRatio[]) => units.find((u) => Number(u.ratio) === 1);

/**
 * ĐVT trung gian mặc định để hiển thị một ĐVT: ĐVT lớn nhất nhỏ hơn nó mà chia hết (Thùng 48 → Lốc 4, vì 48 chia hết cho 4).
 * Không có thì là ĐVT nhỏ nhất.
 */
export function refOf(units: UnitRatio[], u: UnitRatio): UnitRatio | undefined {
  const smaller = sortUnits(units).filter((x) => !same(x.unit, u.unit) && x.ratio < u.ratio);
  return [...smaller].reverse().find((x) => x.ratio > 1 && Math.abs(u.ratio / x.ratio - Math.round(u.ratio / x.ratio)) < 1e-9) ?? baseOf(units) ?? smaller[0];
}

/** "1 Thùng = 12 Lốc = 48 Lon" — chuỗi từ ĐVT lớn nhất xuống nhỏ nhất qua từng cấp trung gian. */
export function chainText(units: UnitRatio[]): string {
  const list = sortUnits(units);
  if (list.length < 2) return list[0] ? `${list[0].unit} (ĐVT nhỏ nhất)` : '';
  const top = list[list.length - 1]!;
  const parts = [`1 ${top.unit}`];
  for (let i = list.length - 2; i >= 0; i--) parts.push(`${r6(top.ratio / list[i]!.ratio).toLocaleString('vi-VN')} ${list[i]!.unit}`);
  return parts.join(' = ');
}

/** Giá một ĐVT suy ra từ giá đã biết của ĐVT khác (cùng bảng giá). Làm tròn đồng. */
export function suggestPrice(units: UnitRatio[], known: { unit: string; price: number | null | undefined }[], unit: string): number | undefined {
  const target = units.find((u) => same(u.unit, unit));
  if (!target || !(target.ratio > 0)) return undefined;
  // Ưu tiên ĐVT nhỏ nhất đã có giá (sai số làm tròn ít nhất).
  const src = sortUnits(units).map((u) => ({ u, p: known.find((k) => same(k.unit, u.unit))?.price })).find((x) => x.p !== null && x.p !== undefined && x.p > 0 && !same(x.u.unit, unit));
  return src ? Math.round((src.p! / src.u.ratio) * target.ratio) : undefined;
}

/** Kiểm bộ ĐVT (cùng luật máy chủ): trả câu lỗi theo từng dòng (index) + lỗi chung. */
export function unitProblems(units: UnitRatio[]): { rows: Record<number, string>; general: string[] } {
  const rows: Record<number, string> = {};
  const seen = new Map<string, number>();
  units.forEach((u, i) => {
    const n = u.unit.trim().toLowerCase();
    if (!n) { rows[i] = 'Chưa chọn tên ĐVT'; return; }
    if (seen.has(n)) rows[i] = `Trùng với dòng ${seen.get(n)! + 1}`;
    else seen.set(n, i);
    if (!(u.ratio > 0)) rows[i] ??= 'Chưa nhập quy đổi';
  });
  const bases = units.filter((u) => u.unit.trim() && Number(u.ratio) === 1);
  const general: string[] = [];
  if (!bases.length) general.push('Cần đúng một ĐVT nhỏ nhất (tỉ lệ 1)');
  if (bases.length > 1) general.push(`Chỉ được một ĐVT nhỏ nhất — đang có: ${bases.map((b) => b.unit).join(', ')}`);
  return { rows, general };
}
