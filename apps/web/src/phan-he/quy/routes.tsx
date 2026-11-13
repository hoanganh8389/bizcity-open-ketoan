/**
 * Màn hình của phân hệ Quỹ. Đường dẫn là duy nhất trong cả phần mềm: menu phân hệ khác trỏ tới cũng mở đúng màn này.
 * Thêm màn: import + một <Route> ở đây, mục menu ở menu.ts cùng thư mục.
 */
import { Route } from 'react-router-dom';
import { PaymentRequestsPage } from './debts/PaymentRequestsPage';
import { BankBalancesPage, InternalTransferPage } from './reports/TienGuiPages';
import { DongTienPage } from './reports/DongTienPage';

export const quyRoutes = (
  <>
    <Route path="cong-no/yeu-cau-thanh-toan" element={<PaymentRequestsPage />} />
    <Route path="quy/so-du-ngan-hang" element={<BankBalancesPage />} />
    <Route path="quy/chuyen-tien-noi-bo" element={<InternalTransferPage />} />
    <Route path="quy/dong-tien" element={<DongTienPage />} />
  </>
);
