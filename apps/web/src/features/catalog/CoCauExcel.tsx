// [2026-11-20 Nguyễn Văn Thủy] Xuất Excel cơ cấu một bảng: 3 sheet Đơn vị / Phân kho / Bộ phận — cũng là mẫu nhập lại (đóng góp)
/**
 * Cột gọn, chỉ thứ người dùng cần. Cột "Đường dẫn" chỉ để đọc (nhập lại không dùng).
 * Nhập lại: lib/nhapExcelDanhMuc.ts (co-cau = Đơn vị, kho-co-cau = Phân kho, phong-ban = Bộ phận), mỗi loại tự chọn đúng sheet.
 */
import type { CC } from './CoCauToChucPage';
import { ngung, tenCap } from './CoCauToChucPage';

const co = (b: boolean) => (b ? 'x' : '');

export const SHEET_CO_CAU = {
  donVi: { name: 'Đơn vị', head: ['Mã', 'Tên', 'Thuộc (mã)', 'Tên gọi cấp', 'MST', 'Tên in chứng từ', 'Địa chỉ', 'Điện thoại', 'Đang hoạt động', 'Đường dẫn'], cols: [14, 36, 12, 14, 16, 36, 40, 14, 10, 40] },
  kho: { name: 'Phân kho', head: ['Mã phân kho', 'Tên phân kho', 'Thuộc (mã)', 'Loại kho', 'Mặc định', 'Đang hoạt động', 'Đường dẫn'], cols: [14, 30, 12, 10, 10, 10, 40] },
  boPhan: { name: 'Bộ phận', head: ['Mã bộ phận', 'Tên bộ phận', 'Thuộc (mã)', 'Đang hoạt động', 'Đường dẫn'], cols: [14, 34, 12, 10, 40] },
} as const;

export async function xuatCoCau(cc: CC) {
  const XLSX = await import('@/lib/excelChuan').then((m) => m.xlsxChuan());
  const duong = (code: string | null) => (code ? cc.byCode.get(code)?.path ?? '' : '');
  const data = {
    donVi: [...cc.units].sort((a, b) => a.path.localeCompare(b.path)).map((u) => [u.code, u.name, u.parentCode ?? '', tenCap(u), u.taxCode, u.companyName, u.address, u.phone, co(!ngung(u)), u.path]),
    kho: [...cc.warehouses].sort((a, b) => duong(a.branchCode).localeCompare(duong(b.branchCode)) || a.code.localeCompare(b.code)).map((w) => [w.code, w.name, w.branchCode, w.typeCode, co(w.isDefault), co(w.isActive), duong(w.branchCode)]),
    boPhan: [...cc.departments].sort((a, b) => duong(a.branchCode).localeCompare(duong(b.branchCode)) || a.code.localeCompare(b.code)).map((d) => [d.code, d.name, d.branchCode ?? '', co(d.isActive), duong(d.branchCode)]),
  };
  const wb = XLSX.utils.book_new();
  for (const k of Object.keys(SHEET_CO_CAU) as (keyof typeof SHEET_CO_CAU)[]) {
    const ws = XLSX.utils.aoa_to_sheet([[...SHEET_CO_CAU[k].head], ...data[k]] as unknown as string[][]);
    ws['!cols'] = SHEET_CO_CAU[k].cols.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, SHEET_CO_CAU[k].name);
  }
  XLSX.writeFile(wb, 'co-cau-to-chuc.xlsx');
}
