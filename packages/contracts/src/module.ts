// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
/**
 * PHÂN HỆ (ứng dụng) của phần mềm — Kế toán, Quỹ, Mua hàng, Bán hàng, Kho, Tài sản, Thuế, Hệ thống…
 *
 * Mỗi phân hệ khai báo một lần (modules/<key>/manifest), trang Tổng quan (lưới ứng dụng), thanh phân hệ, menu trái và
 * máy chủ (ENABLED_MODULES) cùng đọc. Thêm phân hệ mới: thêm một manifest, không sửa các chỗ đọc.
 */
export interface ModuleMeta {
  /** Mã phân hệ, cũng là đường dẫn trang chủ phân hệ /app/<key> — chữ thường, gạch ngang. */
  key: string;
  label: string;
  /** Mô tả ngắn hiện dưới biểu tượng ở trang Tổng quan. */
  description: string;
  /** Tên biểu tượng (bộ lucide), vd 'Calculator', 'ShoppingCart'. */
  icon: string;
  /** Màu nền biểu tượng (mã màu CSS). */
  color: string;
  /** Thứ tự trên trang Tổng quan và thanh phân hệ (nhỏ đứng trước). */
  order: number;
}
