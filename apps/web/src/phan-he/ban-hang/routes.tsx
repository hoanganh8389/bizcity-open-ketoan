/**
 * Màn hình của phân hệ Bán hàng. Đường dẫn là duy nhất trong cả phần mềm: menu phân hệ khác trỏ tới cũng mở đúng màn này.
 * Thêm màn: import + một <Route> ở đây, mục menu ở menu.ts cùng thư mục.
 */
import { Route } from 'react-router-dom';
import { HangBanTraLaiPage, PhieuBanPage } from './phieu-ban/PhieuBanPages';
import { SalesDetailPage } from './sales/SalesDetailPage';
import { SalesPaymentsPage } from './sales/SalesPaymentsPage';
import { SalesReceiptsPage } from './sales/SalesReceiptsPage';
import { SalesSummaryPage } from './sales/SalesSummaryPage';
// [2026-11-10 04:30 PM Nguyễn Văn Thủy] PHASE-026 — chương trình bán có hạn mức (đóng góp)
import { ChuongTrinhBanPage } from '@/features/sale-programs/ChuongTrinhBanPage';

export const banHangRoutes = (
  <>
    <Route path="ban-hang/phieu-ban" element={<PhieuBanPage />} />
    <Route path="ban-hang/tra-lai" element={<HangBanTraLaiPage />} />
    <Route path="ban-hang/bao-cao" element={<SalesDetailPage />} />
    <Route path="ban-hang/tong-hop" element={<SalesSummaryPage />} />
    <Route path="ban-hang/thu-tien" element={<SalesPaymentsPage />} />
    <Route path="ban-hang/thu-tien-ban-hang" element={<SalesReceiptsPage />} />
    <Route path="ban-hang/chuong-trinh" element={<ChuongTrinhBanPage />} />
  </>
);
