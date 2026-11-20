// [2026-11-20 Nguyễn Văn Thủy] Xuất Excel cơ cấu một bảng: 3 sheet Đơn vị / Phân kho / Bộ phận — cũng là mẫu nhập lại (đóng góp)
/**
 * Cột gọn, đọc là hiểu: Mã – Tên – Thuộc – Đường dẫn (theo tên) trước, thông tin phụ sau; Có / Không thay cho ký hiệu.
 * Cột "Đường dẫn" chỉ để đọc (nhập lại không dùng). Thuộc (mã) = mã đơn vị cha / đơn vị chứa.
 * Nhập lại: lib/nhapExcelDanhMuc.ts (co-cau = Đơn vị, kho-co-cau = Phân kho, phong-ban = Bộ phận), mỗi loại tự chọn đúng sheet.
 */
import type { CC } from './du-lieu';
import { duongTen, ngung, tenCap } from './du-lieu';

const co = (b: boolean) => (b ? 'Có' : 'Không');

export const SHEET_CO_CAU = {
  donVi: { name: 'Đơn vị', head: ['Mã', 'Tên', 'Tên gọi cấp', 'Thuộc (mã)', 'Đường dẫn', 'MST', 'Tên in chứng từ', 'Địa chỉ', 'Điện thoại', 'Đang hoạt động'], cols: [12, 34, 14, 12, 50, 16, 34, 36, 14, 14] },
  kho: { name: 'Phân kho', head: ['Mã phân kho', 'Tên phân kho', 'Thuộc (mã)', 'Đường dẫn', 'Loại kho', 'Mặc định', 'Đang hoạt động'], cols: [14, 30, 12, 50, 10, 10, 14] },
  boPhan: { name: 'Bộ phận', head: ['Mã bộ phận', 'Tên bộ phận', 'Thuộc (mã)', 'Bộ phận cha (mã)', 'Đường dẫn', 'Đang hoạt động'], cols: [14, 32, 12, 16, 50, 14] },
} as const;

export async function xuatCoCau(cc: CC) {
  const XLSX = await import('@/lib/excelChuan').then((m) => m.xlsxChuan());
  const duong = (code: string | null) => { const u = code ? cc.byCode.get(code) : null; return u ? duongTen(cc, u) : ''; };
  const data = {
    donVi: [...cc.units].sort((a, b) => a.path.localeCompare(b.path))
      .map((u) => [u.code, u.name, tenCap(u), u.parentCode ?? '', duongTen(cc, u), u.taxCode, u.companyName, u.address, u.phone, co(!ngung(u))]),
    kho: [...cc.warehouses].sort((a, b) => duong(a.branchCode).localeCompare(duong(b.branchCode)) || a.code.localeCompare(b.code))
      .map((w) => [w.code, w.name, w.branchCode, duong(w.branchCode), w.typeCode, co(w.isDefault), co(w.isActive)]),
    // cha trước con (nhập lại theo thứ tự dòng)
    boPhan: cc.xepCay([...cc.departments].sort((a, b) => duong(a.branchCode).localeCompare(duong(b.branchCode)) || a.code.localeCompare(b.code)))
      .map((d) => [d.code, d.name, d.branchCode ?? '', cc.chaBp(d)?.code ?? '', duong(d.branchCode), co(d.isActive)]),
  };
  const wb = XLSX.utils.book_new();
  for (const k of Object.keys(SHEET_CO_CAU) as (keyof typeof SHEET_CO_CAU)[]) {
    const ws = XLSX.utils.aoa_to_sheet([[...SHEET_CO_CAU[k].head], ...data[k]] as unknown as string[][]);
    ws['!cols'] = SHEET_CO_CAU[k].cols.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, SHEET_CO_CAU[k].name);
  }
  XLSX.writeFile(wb, 'co-cau-to-chuc.xlsx');
}
