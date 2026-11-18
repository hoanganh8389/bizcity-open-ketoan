// [2026-11-13 Nguyễn Văn Thủy] Cơ cấu tổ chức kiểu Excel: danh sách theo loại (lọc từng cột), xuất / nhập Excel cùng một mẫu 4 sheet (đóng góp)
/**
 * Danh sách theo loại — Cơ cấu · Cửa hàng · Kho · Phòng ban · Tất cả: lưới có hàng lọc từng cột, sắp xếp, chọn cột, xuất Excel.
 * Xuất Excel: 4 sheet Cơ cấu / Cửa hàng / Kho / Phòng ban (Phòng ban có cả phòng ban riêng của cửa hàng).
 *   [2026-11-18 02:00 PM kiennt] NT-DM-007 — nhập lại bằng trình nhập chung, 4 loại (lib/nhapExcelDanhMuc.ts: co-cau, phong-ban, cua-hang, kho-co-cau),
 *   mỗi loại tự chọn đúng sheet; bỏ trình nhập riêng 4 sheet (một dòng lỗi là không ghi gì) (đóng góp)
 */
import { useMemo } from 'react';
import { DataGrid, type Column } from '@/components/DataGrid';
import { ghiChu, loaiNhan, mstOf, off, type CC, type CNode, type Loai } from './CoCauToChucPage';

export type KieuDs = 'all' | 'org' | 'branch' | 'warehouse' | 'department';
const yes = (b: boolean) => (b ? 'x' : '');
const parentOf = (cc: CC, n: CNode) => (n.parentKey ? cc.byKey.get(n.parentKey) ?? null : null);
const parentCode = (cc: CC, n: CNode) => { const p = parentOf(cc, n); return p && p.loai !== 'none' ? p.code : ''; };
const parentName = (cc: CC, n: CNode) => { const p = parentOf(cc, n); return p && p.loai !== 'none' ? p.name : ''; };

function rowsOf(cc: CC, kieu: KieuDs, showOff: boolean): CNode[] {
  const want = (n: CNode) => n.loai !== 'none' && (showOff || !off(n)) && (kieu === 'all' || (kieu === 'org' ? n.org : n.loai === kieu));
  return cc.nodes.filter(want).sort((a, b) => a.code.localeCompare(b.code));
}

/** Lưới danh sách theo loại (kiểu Excel). Bấm đúp mở hộp thoại của dòng. */
export function DanhSachLoai({ cc, kieu, showOff, onOpen, exportRef }: { cc: CC; kieu: KieuDs; showOff: boolean; onOpen: (n: CNode) => void; exportRef: { current: (() => void) | null } }) {
  const rows = useMemo(() => rowsOf(cc, kieu, showOff), [cc, kieu, showOff]);
  const count = (n: CNode, l: Loai) => cc.under(n.key).filter((x) => x.loai === l && !off(x)).length;
  const theoDoi: Column<CNode> = { key: 'isActive', header: 'Theo dõi', type: 'check', width: 70, title: 'Đang dùng', value: (n) => !off(n) };
  const cols: Record<KieuDs, Column<CNode>[]> = {
    all: [
      { key: 'loai', header: 'Loại', width: 130, value: (n) => loaiNhan(n) },
      { key: 'code', header: 'Mã', type: 'code', width: 120 },
      { key: 'name', header: 'Tên', width: 260 },
      { key: 'p', header: 'Thuộc (mã)', type: 'code', width: 110, value: (n) => parentCode(cc, n) },
      { key: 'pn', header: 'Thuộc (tên)', width: 220, value: (n) => parentName(cc, n) },
      { key: 'mst', header: 'MST', type: 'code', width: 130, value: (n) => mstOf(n) },
      { key: 'gc', header: 'Ghi chú', width: 200, value: (n) => ghiChu(n, cc) },
      theoDoi,
    ],
    org: [
      { key: 'code', header: 'Mã', type: 'code', width: 110 },
      { key: 'name', header: 'Tên', width: 280 },
      { key: 'loai', header: 'Loại', width: 120, value: (n) => loaiNhan(n) },
      { key: 'p', header: 'Thuộc (mã)', type: 'code', width: 100, value: (n) => parentCode(cc, n) },
      { key: 'pn', header: 'Thuộc (tên)', width: 220, value: (n) => parentName(cc, n) },
      { key: 'mst', header: 'MST', type: 'code', width: 130, value: (n) => n.org?.taxId ?? '' },
      { key: 'shop', header: 'Số cửa hàng', type: 'number', width: 90, title: 'Cửa hàng đang dùng trong cả nhánh', value: (n) => count(n, 'branch') },
      { key: 'kho', header: 'Số kho', type: 'number', width: 80, title: 'Kho đang dùng trong cả nhánh', value: (n) => count(n, 'warehouse') },
      { key: 'note', header: 'Mô tả', width: 200, value: (n) => n.org?.note ?? '' },
      theoDoi,
    ],
    branch: [
      { key: 'code', header: 'Mã', type: 'code', width: 110 },
      { key: 'name', header: 'Tên', width: 200 },
      { key: 'p', header: 'Thuộc cơ cấu', type: 'code', width: 100, value: (n) => parentCode(cc, n) },
      { key: 'pn', header: 'Tên cơ cấu', width: 220, value: (n) => parentName(cc, n) },
      { key: 'mst', header: 'MST', type: 'code', width: 130, value: (n) => n.branch?.taxCode ?? '' },
      { key: 'pb', header: 'Phòng ban', type: 'code', width: 100, value: (n) => n.branch?.departmentCode ?? '' },
      { key: 'cty', header: 'Tên công ty in', width: 200, value: (n) => n.branch?.companyName ?? '' },
      { key: 'dc', header: 'Địa chỉ', width: 260, value: (n) => n.branch?.address ?? '' },
      { key: 'dt', header: 'Điện thoại', type: 'code', width: 110, value: (n) => n.branch?.phone ?? '' },
      { key: 'kho', header: 'Số kho', type: 'number', width: 70, value: (n) => count(n, 'warehouse') },
      theoDoi,
    ],
    warehouse: [
      { key: 'code', header: 'Mã kho', type: 'code', width: 110 },
      { key: 'name', header: 'Tên kho', width: 200 },
      { key: 'p', header: 'Cửa hàng', type: 'code', width: 110, value: (n) => parentCode(cc, n) },
      { key: 'pn', header: 'Tên cửa hàng', width: 200, value: (n) => parentName(cc, n) },
      { key: 'lk', header: 'Loại kho', width: 150, value: (n) => [n.warehouse?.typeCode, n.warehouse?.typeName].filter(Boolean).join(' · ') },
      { key: 'md', header: 'Kho mặc định', type: 'check', width: 90, value: (n) => Boolean(n.warehouse?.isDefault) },
      { key: 'dc', header: 'Địa chỉ', width: 240, value: (n) => n.warehouse?.address ?? '' },
      theoDoi,
    ],
    department: [
      { key: 'code', header: 'Mã', type: 'code', width: 110 },
      { key: 'name', header: 'Tên', width: 240 },
      { key: 'p', header: 'Thuộc cơ cấu', type: 'code', width: 110, value: (n) => parentCode(cc, n) },
      { key: 'pn', header: 'Tên cơ cấu', width: 220, value: (n) => parentName(cc, n) },
      { key: 'note', header: 'Ghi chú', width: 240, value: (n) => n.dept?.note ?? '' },
      theoDoi,
    ],
  };
  return (
    <DataGrid storageKey={`dm16-ds-${kieu}-v1`} exportName={`co-cau-${kieu}`} exportRef={exportRef} rows={rows} rowKey={(n) => n.key} columns={cols[kieu]}
      onRowDoubleClick={onOpen} rowClassName={(n) => (off(n) ? 'muted' : '')} groupable />
  );
}

/* ------------------------------------------------------------------ mẫu Excel */

const SHEETS = {
  org: { name: 'Cơ cấu', head: ['Loại', 'Mã', 'Tên', 'Thuộc (mã)', 'MST', 'Mô tả', 'Theo dõi'], cols: [12, 14, 40, 14, 16, 30, 9] },
  branch: { name: 'Cửa hàng', head: ['Mã', 'Tên', 'Thuộc cơ cấu (mã)', 'MST', 'Phòng ban', 'Tên công ty in', 'Địa chỉ', 'Điện thoại', 'Ghi chú', 'Theo dõi'], cols: [14, 30, 18, 16, 12, 30, 40, 14, 24, 9] },
  warehouse: { name: 'Kho', head: ['Mã kho', 'Tên kho', 'Cửa hàng (mã)', 'Loại kho', 'Kho mặc định', 'Địa chỉ', 'Ghi chú', 'Theo dõi'], cols: [14, 30, 16, 10, 12, 40, 24, 9] },
  department: { name: 'Phòng ban', head: ['Mã', 'Tên', 'Thuộc cơ cấu (mã)', 'Ghi chú', 'Theo dõi'], cols: [14, 34, 18, 30, 9] },
} as const;
type SheetKey = keyof typeof SHEETS;

/** Xuất 4 sheet — cũng là mẫu để nhập lại. */
export async function xuatCoCau(cc: CC) {
  const XLSX = await import('@/lib/excelChuan').then((m) => m.xlsxChuan());
  const all = [...cc.nodes].filter((n) => n.loai !== 'none');
  const byDepth = (a: CNode, b: CNode) => a.depth - b.depth || a.code.localeCompare(b.code);
  const data: Record<SheetKey, (string | number)[][]> = {
    org: all.filter((n) => n.org).sort(byDepth).map((n) => [n.loai === 'company' ? 'Công ty' : 'Cơ cấu', n.code, n.name, parentCode(cc, n), n.org!.taxId ?? '', n.org!.note, yes(n.isActive)]),
    branch: all.filter((n) => n.branch).sort(byDepth).map((n) => { const b = n.branch!; return [b.code, b.name, parentCode(cc, n), b.taxCode, b.departmentCode ?? '', b.companyName, b.address ?? '', b.phone, b.note, yes(b.isActive)]; }),
    warehouse: all.filter((n) => n.warehouse).sort((a, b) => a.code.localeCompare(b.code)).map((n) => { const w = n.warehouse!; return [w.code, w.name, w.branchCode, w.typeCode ?? '', yes(w.isDefault), w.address, w.note, yes(w.isActive)]; }),
    // [2026-11-18 02:00 PM kiennt] NT-DM-007 — xuất MỌI phòng ban, kể cả phòng ban riêng của cửa hàng (không lên cây) — cột Phòng ban của sheet Cửa hàng trỏ tới chúng, thiếu thì tệp không nhập lại được (đóng góp)
    department: [...cc.departments].sort((a, b) => a.code.localeCompare(b.code)).map((d) => { const o = String(d.extra?.orgUnitCode ?? ''); return [d.code, d.name, o && cc.byKey.has(`o:${o}`) ? o : '', d.note, yes(d.isActive)]; }),
  };
  const wb = XLSX.utils.book_new();
  for (const k of Object.keys(SHEETS) as SheetKey[]) {
    const ws = XLSX.utils.aoa_to_sheet([[...SHEETS[k].head], ...data[k]] as unknown as string[][]);
    ws['!cols'] = SHEETS[k].cols.map((wch) => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, SHEETS[k].name);
  }
  XLSX.writeFile(wb, 'co-cau-to-chuc.xlsx');
}
