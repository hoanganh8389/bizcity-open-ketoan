/**
 * Danh sách màn hình sau khi đăng nhập (đường dẫn → màn). Mỗi thẻ làm việc dựng các route này
 * với đường dẫn riêng của thẻ (xem layout/TabWorkspace.tsx), nên nhiều màn mở cùng lúc được.
 */
import { ExportAdjustPage } from './features/documents/ExportAdjustPage';
import { ChiNhanhLamViecPage } from './features/system/ChiNhanhLamViecPage';
import { PrintTemplatesPage } from './features/system/PrintTemplatesPage';
import { DefaultDataPage } from './features/flow/DefaultDataPages';
import { Navigate, Route } from 'react-router-dom';
import { LauncherPage, ModuleHomePage } from './features/launcher/LauncherPage';
import { DocumentsPage } from './features/documents/DocumentsPage';
import { CashTransfersPage } from './features/documents/CashTransfersPage';
import { EntriesPage } from './features/ledger/EntriesPage';
import { AccountingVouchersPage } from './features/ledger/AccountingVouchersPage';
import { AccountsPage } from './features/catalog/AccountsPage';
import { BranchesPage } from './features/catalog/BranchesPage';
import { WarehousesPage } from './features/catalog/WarehousesPage';
import { UnitNamesPage } from './features/catalog/UnitNamesPage';
import { PartnerGroupsPage, PartnersPage } from './features/catalog/PartnersPage';
import { BankAccountsPage } from './features/catalog/BankAccountsPage';
import { ContractSchedulesPage } from './features/catalog/ContractSchedulesPage';
import { ItemClassesPage, ProductsPage } from './features/catalog/ProductsPage';
import { PriceListsPage } from './features/catalog/PriceListsPage';
import { VoucherRecurrencesPage, VoucherTemplatesPage } from './features/vouchers/TemplatesPage';
import { OffsetPage } from './features/vouchers/OffsetPage';
import { TenantPage } from './features/system/TenantPage';
import { TaxCodesPage } from './features/catalog/TaxCodesPage';
import { ReasonsPage } from './features/posting/ReasonsPage';
import { ProductAccountsPage } from './features/posting/ProductAccountsPage';
import { PaymentMethodsPage } from './features/posting/PaymentMethodsPage';
import { DefaultsPage } from './features/posting/DefaultsPage';
import { VouchersPage } from './features/vouchers/VouchersPage';
import { DimensionsPage } from './features/catalog/DimensionsPage';
import { UsersPage } from './features/access/UsersPage';
import { ApiKeysPage } from './features/access/ApiKeysPage';
import { AddInsPage } from './features/system/AddInsPage';
import { GuidesPage } from './features/system/GuidesPage';
import { LegalDocsPage } from './features/system/LegalDocsPage';
import { ArchitecturePage } from './features/system/ArchitecturePage';
import { keToanRoutes } from './phan-he/ke-toan/routes';
import { quyRoutes } from './phan-he/quy/routes';
import { banHangRoutes } from './phan-he/ban-hang/routes';
import { khoRoutes } from './phan-he/kho/routes';
import { taiSanRoutes } from './phan-he/tai-san/routes';
import { thueRoutes } from './phan-he/thue/routes';
import { muaHangRoutes } from './phan-he/mua-hang/routes';
import { apiRoutes } from './phan-he/api/routes';
import { ADDIN_ROUTES } from './addins/registry';

export const pageRoutes = (
  <>
    <Route path="/" element={<LauncherPage />} />
    <Route path="/app/:key" element={<ModuleHomePage />} />
    <Route path="chung-tu" element={<DocumentsPage />} />
    <Route path="quy/phieu-chuyen-tien" element={<CashTransfersPage />} />
    <Route path="so-cai/but-toan" element={<EntriesPage />} />
    <Route path="tien-ich/chung-tu-ke-toan" element={<AccountingVouchersPage key="all" mode="all" />} />
    <Route path="tien-ich/ct-mat-lien-ket" element={<AccountingVouchersPage key="unlinked" mode="unlinked" />} />
    <Route path="tien-ich/ct-lech-than-chi-tiet" element={<AccountingVouchersPage key="unbalanced" mode="unbalanced" />} />
    <Route path="tien-ich/ct-lech-phieu-goc" element={<AccountingVouchersPage key="source-diff" mode="source-diff" />} />
    {/* key khác nhau để chuyển giữa các màn dùng chung thành phần thì dựng lại, không giữ ô lọc cũ */}
    <Route path="nghiep-vu/phieu-thu" element={<VouchersPage key="receipt" type="receipt" />} />
    <Route path="nghiep-vu/phieu-chi" element={<VouchersPage key="payment" type="payment" />} />
    <Route path="nghiep-vu/phieu-bao-no" element={<VouchersPage key="bank_payment" type="bank_payment" />} />
    <Route path="nghiep-vu/phieu-bao-co" element={<VouchersPage key="bank_receipt" type="bank_receipt" />} />
    <Route path="nghiep-vu/phieu-ke-toan" element={<VouchersPage key="manual" type="manual" />} />
    <Route path="danh-muc/khoan-muc" element={<DimensionsPage key="cost_item" kind="cost_item" />} />
    <Route path="danh-muc/hop-dong" element={<DimensionsPage key="contract" kind="contract" />} />
    <Route path="danh-muc/bo-phan" element={<DimensionsPage key="department" kind="department" />} />
    <Route path="danh-muc/nhan-vien" element={<DimensionsPage key="employee" kind="employee" />} />
    <Route path="danh-muc/vu-viec" element={<DimensionsPage key="case" kind="case" />} />
    <Route path="danh-muc/du-an" element={<DimensionsPage key="project" kind="project" />} />
    <Route path="danh-muc/nguon-von" element={<DimensionsPage key="capital_source" kind="capital_source" />} />
    <Route path="danh-muc/tai-khoan" element={<AccountsPage />} />
    <Route path="danh-muc/chi-nhanh" element={<BranchesPage />} />
    <Route path="danh-muc/kho" element={<WarehousesPage />} />
    <Route path="danh-muc/don-vi-tinh" element={<UnitNamesPage />} />
    <Route path="danh-muc/doi-tuong" element={<PartnersPage />} />
    <Route path="danh-muc/khach-hang" element={<PartnersPage key="customer" fixedKind="customer" />} />
    <Route path="danh-muc/nha-cung-cap" element={<PartnersPage key="supplier" fixedKind="supplier" />} />
    <Route path="danh-muc/nhom-doi-tuong" element={<PartnerGroupsPage />} />
    <Route path="danh-muc/ngan-hang" element={<BankAccountsPage />} />
    <Route path="danh-muc/mat-hang" element={<ProductsPage />} />
    <Route path="danh-muc/nhom-ccdc" element={<DimensionsPage key="tool_group" kind="tool_group" />} />
    <Route path="danh-muc/muc-dich-su-dung" element={<DimensionsPage key="usage_purpose" kind="usage_purpose" />} />
    <Route path="nghiep-vu/but-toan-mau" element={<VoucherTemplatesPage />} />
    <Route path="nghiep-vu/but-toan-lap" element={<VoucherRecurrencesPage />} />
    <Route path="nghiep-vu/can-tru-cong-no" element={<OffsetPage />} />
    <Route path="ban-hang/xuat-dieu-chinh" element={<ExportAdjustPage />} />
    <Route path="tien-ich/du-lieu-goc" element={<DefaultDataPage />} />
    <Route path="cau-hinh/don-vi" element={<TenantPage />} />
    <Route path="cau-hinh/mau-in" element={<PrintTemplatesPage />} />
    <Route path="he-thong/chi-nhanh-lam-viec" element={<ChiNhanhLamViecPage />} />
    <Route path="danh-muc/phan-loai-hang" element={<ItemClassesPage />} />
    <Route path="danh-muc/bang-gia" element={<PriceListsPage />} />
    <Route path="bao-cao/lich-thanh-toan-hop-dong" element={<ContractSchedulesPage />} />
    <Route path="danh-muc/loai-thue" element={<TaxCodesPage />} />
    <Route path="cau-hinh/ly-do" element={<ReasonsPage />} />
    <Route path="cau-hinh/nhom-hach-toan" element={<ProductAccountsPage />} />
    <Route path="cau-hinh/hinh-thuc-thanh-toan" element={<PaymentMethodsPage />} />
    <Route path="cau-hinh/tai-khoan-ngam-dinh" element={<DefaultsPage />} />
    <Route path="cau-hinh/nguoi-dung" element={<UsersPage />} />
    <Route path="cau-hinh/khoa-api" element={<ApiKeysPage />} />
    <Route path="tien-ich/add-in" element={<AddInsPage />} />
    <Route path="tien-ich/huong-dan" element={<GuidesPage />} />
    <Route path="tien-ich/can-cu" element={<LegalDocsPage />} />
    <Route path="tien-ich/kien-truc" element={<ArchitecturePage />} />
    {ADDIN_ROUTES.map((r) => (
      <Route key={r.path} path={r.path.replace(/^\//, '')} element={r.element} />
    ))}
    {keToanRoutes}
    {quyRoutes}
    {banHangRoutes}
    {khoRoutes}
    {taiSanRoutes}
    {thueRoutes}
    {muaHangRoutes}
    {apiRoutes}
    <Route path="*" element={<Navigate to="/" replace />} />
  </>
);
