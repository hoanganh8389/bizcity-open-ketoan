/**
 * Màn hình của phân hệ Kho. Đường dẫn là duy nhất trong cả phần mềm: menu phân hệ khác trỏ tới cũng mở đúng màn này.
 * Thêm màn: import + một <Route> ở đây, mục menu ở menu.ts cùng thư mục.
 */
import { Route } from 'react-router-dom';
import { ChuyenKhoPage } from './chuyen-kho/ChuyenKhoPage';
import { CostingPage, ItemLedgerPage, StockMovementPage } from './inventory/InventoryPages';
import { GrossProfitPage, ProfitByDepartmentPage, StockTransfersPage } from './reports/GoodsReportPages';

export const khoRoutes = (
  <>
    <Route path="kho/chuyen-kho" element={<ChuyenKhoPage />} />
    <Route path="nghiep-vu/tinh-gia-von" element={<CostingPage />} />
    <Route path="bao-cao/nhap-xuat-ton" element={<StockMovementPage />} />
    <Route path="bao-cao/so-chi-tiet-hang-hoa" element={<ItemLedgerPage />} />
    <Route path="ban-hang/lai-gop" element={<GrossProfitPage />} />
    <Route path="bao-cao/chuyen-kho" element={<StockTransfersPage />} />
    <Route path="bao-cao/ket-qua-theo-cua-hang" element={<ProfitByDepartmentPage />} />
  </>
);
