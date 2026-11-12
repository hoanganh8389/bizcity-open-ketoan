/**
 * Màn hình của phân hệ Kho. Đường dẫn là duy nhất trong cả phần mềm: menu phân hệ khác trỏ tới cũng mở đúng màn này.
 * Thêm màn: import + một <Route> ở đây, mục menu ở menu.ts cùng thư mục.
 */
import { Route } from 'react-router-dom';
import { ChuyenKhoPage } from './chuyen-kho/ChuyenKhoPage';
import { KiemKePage } from './kiem-ke/KiemKePage';
import { CostingPage, ItemLedgerPage, StockMovementPage } from './inventory/InventoryPages';
import { DoiChieuKhoSoCaiPage } from './inventory/DoiChieuKhoSoCaiPage';
import { CongThucGiaVonPage } from './inventory/CongThucGiaVonPage';
// [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1: Hành trình mặt hàng (ACC95)
import { HanhTrinhMatHangPage } from './hanh-trinh/HanhTrinhMatHangPage';
import { GrossProfitPage, ProfitByDepartmentPage, StockTransfersPage } from './reports/GoodsReportPages';
// [2026-11-10 06:30 PM Nguyễn Văn Thủy] PHASE-026 — tồn theo lô (đóng góp)
import { TonTheoLoPage } from '@/features/lots/TonTheoLoPage';

export const khoRoutes = (
  <>
    <Route path="kho/chuyen-kho" element={<ChuyenKhoPage />} />
    <Route path="kho/kiem-ke" element={<KiemKePage />} />
    <Route path="kho/ton-theo-lo" element={<TonTheoLoPage />} />
    <Route path="nghiep-vu/tinh-gia-von" element={<CostingPage />} />
    <Route path="nghiep-vu/cong-thuc-gia-von" element={<CongThucGiaVonPage />} />
    <Route path="bao-cao/nhap-xuat-ton" element={<StockMovementPage />} />
    <Route path="bao-cao/so-chi-tiet-hang-hoa" element={<ItemLedgerPage key="acc82" />} />
    <Route path="kho/the-kho" element={<ItemLedgerPage key="kho06" theKho />} />
    <Route path="kho/doi-chieu-so-cai" element={<DoiChieuKhoSoCaiPage />} />
    <Route path="bao-cao/hanh-trinh-mat-hang" element={<HanhTrinhMatHangPage />} />
    <Route path="ban-hang/lai-gop" element={<GrossProfitPage />} />
    <Route path="bao-cao/chuyen-kho" element={<StockTransfersPage />} />
    <Route path="bao-cao/ket-qua-theo-cua-hang" element={<ProfitByDepartmentPage />} />
  </>
);
