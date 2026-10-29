/**
 * Màn danh sách phiếu nhập tay theo loại: phiếu thu, chi, báo có, báo nợ, phiếu kế toán.
 * Cả năm loại dùng chung khung danh sách CashVouchersPage (bảng lọc trái, thanh nút Thêm / Sửa / Copy / Xóa…);
 * form mở ra là CashVoucherForm (phiếu tiền) hoặc ManualVoucherForm (phiếu kế toán).
 */
import type { VoucherType } from '@ketoan/contracts';
import { CashVouchersPage } from './CashVouchersPage';

export function VouchersPage({ type }: { type: VoucherType }) {
  return <CashVouchersPage type={type} />;
}
