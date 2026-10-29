/**
 * Màn hình của phân hệ Thuế. Đường dẫn là duy nhất trong cả phần mềm: menu phân hệ khác trỏ tới cũng mở đúng màn này.
 * Thêm màn: import + một <Route> ở đây, mục menu ở menu.ts cùng thư mục.
 */
import { Route } from 'react-router-dom';
import { LongTermPage, NotesPage, VatReturnPage } from './statements/StatementPages';
import { AuthorityInvoicesPage } from './tax/AuthorityInvoicesPage';
import { CitReturnPage } from './tax/CitReturnPage';
import { InvoiceRisksPage } from './tax/InvoiceRisksPage';
import { SalesInvoicesPage } from './tax/SalesInvoicesPage';
import { TaxInfoPage } from './tax/TaxInfoPage';
import { TaxpayerPage } from './tax/TaxpayerPage';

export const thueRoutes = (
  <>
    <Route path="thue/bo-sung-thong-tin" element={<TaxInfoPage />} />
    <Route path="thue/quyet-toan-tndn" element={<CitReturnPage />} />
    <Route path="thue/nguoi-nop-thue" element={<TaxpayerPage />} />
    <Route path="thue/hoa-don-co-quan-thue" element={<AuthorityInvoicesPage />} />
    <Route path="thue/hoa-don-rui-ro" element={<InvoiceRisksPage />} />
    <Route path="thue/to-khai-gtgt" element={<VatReturnPage />} />
    <Route path="bao-cao/thuyet-minh" element={<NotesPage />} />
    <Route path="bao-cao/phan-loai-dai-han" element={<LongTermPage />} />
    <Route path="thue/bang-ke-mua-vao" element={<SalesInvoicesPage key="input" direction="input" />} />
    <Route path="thue/bang-ke-ban-ra" element={<SalesInvoicesPage key="output" />} />
  </>
);
