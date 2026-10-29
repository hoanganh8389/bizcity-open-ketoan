/**
 * Màn hình của phân hệ Kế toán. Đường dẫn là duy nhất trong cả phần mềm: menu phân hệ khác trỏ tới cũng mở đúng màn này.
 * Thêm màn: import + một <Route> ở đây, mục menu ở menu.ts cùng thư mục.
 */
import { Route } from 'react-router-dom';
import { ClosingPage } from './closing/ClosingPage';
import { DashboardPage } from './dashboard/DashboardPage';
import { DebtConfirmationPage } from './debts/DebtConfirmationPage';
import { DebtItemsPage } from './debts/DebtItemsPage';
import { DebtVouchersPage } from './debts/DebtVouchersPage';
import { ReferenceDocsPage } from './debts/ReferenceDocsPage';
import { OpeningBalancesPage } from './opening/OpeningBalancesPage';
import { PeriodsPage } from './periods/PeriodsPage';
import { CashPlanPage, CostNormPage } from './planning/PlanningPages';
import { AccountLedgerPage } from './reports/AccountLedgerPage';
import { AgingDuePage } from './reports/AgingDuePage';
import { BalanceSheetPage } from './reports/BalanceSheetPage';
import { ChecksPage, ContractProfitPage, ExpensePage } from './reports/ControlPages';
import { DebtByTermPage } from './reports/DebtByTermPage';
import { DebtByEmployeePage, DebtByItemPage } from './reports/DebtPages';
import { CashByItemPage, DimensionSummaryPage, ExpenseDetailPage, ExpenseItemBranchPage } from './reports/DimensionReportPages';
import { IncomeStatementPage } from './reports/IncomeStatementPage';
import { JournalPage } from './reports/JournalPage';
import { CashFlowPage, CashJournalPage, PurchaseJournalPage, SalesJournalPage, VoucherListingPage } from './reports/JournalsPages';
import { PartnerBalancesPage } from './reports/PartnerBalancesPage';
import { CashBalancesPage, PostingSummaryPage, TaxSummaryPage } from './reports/SummaryPages';
import { TrialBalancePage } from './reports/TrialBalancePage';
import { RequirementsPage } from './requirements/RequirementsPage';

export const keToanRoutes = (
  <>
    <Route path="/bang-dieu-khien" element={<DashboardPage />} />
    <Route path="bao-cao/can-doi-phat-sinh" element={<TrialBalancePage />} />
    <Route path="bao-cao/so-chi-tiet" element={<AccountLedgerPage key="ct" />} />
    <Route path="bao-cao/cong-no" element={<PartnerBalancesPage key="acc38" />} />
    <Route path="bao-cao/cong-no-theo-nhan-vien" element={<DebtByEmployeePage />} />
    <Route path="bao-cao/cong-no-theo-mat-hang" element={<DebtByItemPage />} />
    <Route path="bao-cao/cong-no-noi-bo" element={<PartnerBalancesPage key="acc61" preset={{ account: '1368', title: 'Báo cáo công nợ nội bộ', code: 'ACC61', subtitle: 'Phải thu, phải trả nội bộ giữa các chi nhánh theo từng chi nhánh đối ứng (1368; đổi tài khoản sang 3368 để xem phải trả)' }} />} />
    <Route path="bao-cao/nhat-ky-chung" element={<JournalPage />} />
    <Route path="bao-cao/luu-chuyen-tien-te" element={<CashFlowPage />} />
    <Route path="bao-cao/bang-ke-chung-tu" element={<VoucherListingPage />} />
    <Route path="quy/so-chi-tiet-quy" element={<AccountLedgerPage key="ct-quy" preset={{ account: '111', title: 'Sổ kế toán chi tiết quỹ tiền mặt', code: 'ACC76', helpKey: 'so-quy', kind: 'detail' }} />} />
    <Route path="quy/nhat-ky-thu-tien" element={<CashJournalPage key="in" direction="in" />} />
    <Route path="quy/nhat-ky-chi-tien" element={<CashJournalPage key="out" direction="out" />} />
    <Route path="cong-no/nhat-ky-ban-hang" element={<SalesJournalPage />} />
    <Route path="bao-cao/nhat-ky-mua-hang" element={<PurchaseJournalPage />} />
    <Route path="nghiep-vu/so-du-tai-khoan" element={<OpeningBalancesPage />} />
    <Route path="nghiep-vu/ket-chuyen" element={<ClosingPage />} />
    <Route path="bao-cao/ket-qua-kinh-doanh" element={<IncomeStatementPage />} />
    <Route path="bao-cao/can-doi-ke-toan" element={<BalanceSheetPage />} />
    <Route path="bao-cao/tong-hop-chung-tu" element={<PostingSummaryPage />} />
    <Route path="quy/so-du-tien" element={<CashBalancesPage />} />
    <Route path="thue/tong-hop" element={<TaxSummaryPage />} />
    <Route path="bao-cao/chi-phi-khoan-muc" element={<ExpensePage />} />
    <Route path="bao-cao/lai-lo-hop-dong" element={<ContractProfitPage key="sum" detail={false} />} />
    <Route path="bao-cao/lai-lo-hop-dong-chi-tiet" element={<ContractProfitPage key="detail" detail />} />
    <Route path="bao-cao/tuoi-no" element={<AgingDuePage key="acc67" preset={{ code: 'ACC67', title: 'Công nợ theo tuổi nợ trước và quá hạn', subtitle: 'Số còn nợ của từng đối tượng chia theo số ngày còn tới hạn và số ngày đã quá hạn thanh toán', kind: 3 }} />} />
    <Route path="bao-cao/tuoi-no-trong-han" element={<AgingDuePage key="acc67a" preset={{ code: 'ACC67A', title: 'Công nợ theo tuổi nợ trước hạn', subtitle: 'Số còn nợ chưa tới hạn thanh toán, chia theo số ngày còn tới hạn', kind: 1 }} />} />
    <Route path="bao-cao/tuoi-no-qua-han" element={<AgingDuePage key="acc67b" preset={{ code: 'ACC67B', title: 'Công nợ theo tuổi nợ quá hạn', subtitle: 'Số còn nợ đã quá hạn thanh toán, chia theo số ngày quá hạn', kind: 2 }} />} />
    <Route path="bao-cao/cong-no-theo-han" element={<DebtByTermPage />} />
    <Route path="bao-cao/kiem-tra-chung-tu" element={<ChecksPage />} />
    <Route path="bao-cao/so-cai" element={<AccountLedgerPage key="so-cai" preset={{ account: '111', title: 'Sổ cái', code: 'ACC88', helpKey: 'so-cai', kind: 'ledger' }} />} />
    <Route path="bao-cao/cong-no-noi-bo-chi-tiet" element={<AccountLedgerPage key="acc62" preset={{ account: '1368', title: 'BCCN nội bộ chi tiết', code: 'ACC62', helpKey: 'so-chi-tiet-cong-no', kind: 'partner' }} />} />
    <Route path="bao-cao/chi-tiet-thanh-toan" element={<AccountLedgerPage key="acc81" preset={{ account: '331', title: 'Sổ chi tiết thanh toán với người bán', code: 'ACC81', helpKey: 'so-chi-tiet-cong-no', kind: 'partner' }} />} />
    <Route path="bao-cao/tien-vay" element={<AccountLedgerPage key="acc87" preset={{ account: '341', title: 'Sổ chi tiết tiền vay', code: 'ACC87', helpKey: 'so-chi-tiet-cong-no', kind: 'partner' }} />} />
    <Route path="bao-cao/nguon-von" element={<AccountLedgerPage key="acc86" preset={{ account: '411', title: 'Sổ theo dõi chi tiết nguồn vốn chủ sở hữu', code: 'ACC86', helpKey: 'so-chi-tiet', kind: 'detail' }} />} />
    <Route path="bao-cao/so-chi-tiet-cong-no" element={<AccountLedgerPage key="cong-no" preset={{ account: '131', title: 'Sổ chi tiết công nợ', code: 'ACC40', helpKey: 'so-chi-tiet-cong-no', kind: 'partner' }} />} />
    <Route path="quy/so-quy-tien-mat" element={<AccountLedgerPage key="111" preset={{ account: '111', title: 'Sổ quỹ tiền mặt', code: 'ACC55', helpKey: 'so-quy', kind: 'cash' }} />} />
    <Route path="quy/so-tien-gui" element={<AccountLedgerPage key="112" preset={{ account: '112', title: 'Tiền gửi ngân hàng', code: 'ACC56', helpKey: 'so-quy', kind: 'cash' }} />} />
    <Route path="cong-no/khoan-cong-no" element={<DebtItemsPage />} />
    <Route path="cong-no/phai-thu" element={<DebtVouchersPage key="ar" mode="ar" />} />
    <Route path="cong-no/phai-tra" element={<DebtVouchersPage key="ap" mode="ap" />} />
    <Route path="cong-no/dat-coc" element={<DebtVouchersPage key="deposit" mode="deposit" />} />
    <Route path="cong-no/chung-tu-nguon" element={<ReferenceDocsPage />} />
    <Route path="cong-no/doi-chieu" element={<DebtConfirmationPage />} />
    <Route path="ke-hoach/thu-chi" element={<CashPlanPage />} />
    <Route path="bao-cao/chi-tiet-chi-phi-khoan-muc" element={<ExpenseDetailPage />} />
    <Route path="bao-cao/tong-hop-nv-hd-pb" element={<DimensionSummaryPage />} />
    <Route path="quy/nhat-ky-chi-tien-khoan-muc" element={<CashByItemPage />} />
    <Route path="bao-cao/tk-chi-phi-khoan-muc" element={<ExpenseItemBranchPage />} />
    <Route path="ke-hoach/dinh-muc" element={<CostNormPage />} />
    <Route path="yeu-cau/tai-chinh-ke-toan" element={<RequirementsPage />} />
    <Route path="cau-hinh/ky-ke-toan" element={<PeriodsPage />} />
  </>
);
