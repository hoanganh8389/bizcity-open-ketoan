// [2026-11-21 Nguyễn Văn Thủy] Chi nhánh + hợp đồng xuyên suốt: cột / nhãn dùng chung cho mọi danh sách, hộp chọn chứng từ mua hàng (đóng góp)
/**
 * Mọi chỗ hiện chứng từ mua hàng ghi rõ: chi nhánh (mã · tên) và hợp đồng (số hợp đồng, hoặc "không theo HĐ").
 * Dùng chung để các màn nhìn giống nhau, không mỗi màn một kiểu.
 */
import type { Column } from '@/components/DataGrid';

type CoCnHd = { branchCode: string; contractCode?: string | null };
type Ten = { branchName: (c: string) => string };

/** "CN 12000 · Bắc Giang". */
export const nhanCn = (b: string, names: Ten) => `CN ${b}${names.branchName(b) && names.branchName(b) !== b ? ` · ${names.branchName(b)}` : ''}`;
/** "HĐ 2222" hoặc "không theo HĐ". */
export const nhanHd = (c?: string | null) => (c ? `HĐ ${c}` : 'không theo HĐ');
/** Phần đuôi gắn sau số chứng từ: " · CN 12000 · HĐ 2222". */
export const duoiCnHd = (d: CoCnHd, names: Ten) => ` · CN ${d.branchCode} · ${nhanHd(d.contractCode)}`;

export function cotChiNhanh<T extends CoCnHd>(names: Ten, width = 170): Column<T> {
  return { key: 'branchCode', header: 'Chi nhánh', width, title: 'Chi nhánh của chứng từ', value: (d) => `${d.branchCode} · ${names.branchName(d.branchCode)}` };
}
export function cotHopDong<T extends CoCnHd>(width = 120): Column<T> {
  return {
    key: 'contractCode', header: 'Hợp đồng', width, title: 'Số hợp đồng mua của chứng từ (MH29) — trống = không theo hợp đồng',
    value: (d) => d.contractCode || 'Không theo HĐ',
    render: (d) => (d.contractCode ? <span className="mono">{d.contractCode}</span> : <span className="muted">không theo HĐ</span>),
  };
}
