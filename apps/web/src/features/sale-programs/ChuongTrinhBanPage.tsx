// [2026-11-10 04:30 PM Nguyễn Văn Thủy] PHASE-026 — chương trình bán có hạn mức thay mã phụ: khai báo, hạn mức theo cửa hàng, báo cáo quản lý (đóng góp)
// [2026-11-15 10:10 AM Võ Hoàng] NGHIEM-THU — NT-BH-018: màn BH12 gộp vào BH18 Chương trình khuyến mại (module pos); đường cũ chuyển hướng — anh Hoàng quản lý phần BH12 từ 15/11 (đóng góp)
/**
 * CHƯƠNG TRÌNH BÁN (BH12) — từ 15/11/2026 không còn là màn riêng: danh sách, form hạn mức từng cửa hàng, báo cáo quản lý, thử tính đã chuyển
 * sang màn *Chương trình khuyến mại* BH18 của module pos (`modules/pos/web/screens/KhuyenMaiPage.tsx`, thẻ *Có hạn mức* / *Báo cáo hạn mức*).
 * API và dữ liệu (`/api/v1/sale-programs`, khuôn `sale.program.*@1`, tự trừ / trả hạn mức khi ghi sổ) giữ nguyên.
 * Giữ tệp này để đường cũ `/ban-hang/chuong-trinh` (đánh dấu trang, liên kết trong tài liệu) chuyển đúng chỗ.
 */
import { Navigate } from 'react-router-dom';

export function ChuongTrinhBanPage() {
  return <Navigate to="/app/pos/khuyen-mai?the=han-muc" replace />;
}
