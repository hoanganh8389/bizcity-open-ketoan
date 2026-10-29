/**
 * Nạp DANH MỤC MẪU IN TRUNG TÂM (components/print/catalog.ts) lúc khởi động: mỗi màn có nút In và đủ các mẫu của màn
 * (gộp mọi biến thể khi danh sách mẫu đổi theo loại sổ / kiểu xem). Màn Mẫu in (HT05) đọc danh mục này để bật / tắt,
 * đặt mặc định, chỉnh nội dung theo mã "<màn>:<mẫu>".
 * Đặt ở gốc ứng dụng vì phải import mẫu của mọi phân hệ (lõi và phân hệ không import chéo nhau).
 * Thêm màn có nút In: thêm một dòng vào SCREENS (mã màn trùng với prop screen của PrintButton).
 */
import { CORE_MENU, flattenMenu } from './layout/menu';
import { setPrintCatalog, uniqTemplates, type CatalogScreen } from './components/print/catalog';
import type { PrintTemplate } from './components/print';
import { VOUCHER_SCREEN, VOUCHER_TEMPLATES } from './features/vouchers/VoucherPrint';
import { OFFSET_TEMPLATES } from './features/vouchers/OffsetPrint';
import { TRADE_TEMPLATES } from './components/phieu-hang/printTemplates';
import { EXPORT_ADJUST_TEMPLATES } from './features/documents/ExportAdjustPrint';
import { CASH_TRANSFER_TEMPLATES } from './features/documents/CashTransferPrint';
import { PRODUCT_LABEL_TEMPLATES } from './features/catalog/productPrint';
import { PRICE_LIST_TEMPLATES } from './features/catalog/priceListPrint';
import { MAU_IN, mauInCua } from './phan-he/mua-hang/chung-tu/mauIn';
import { LOG_TEMPLATES, buyTemplates } from './phan-he/mua-hang/mauIn/baoCaoMua';
import { PAYMENTS_TEMPLATES, RECEIPTS_TEMPLATES, SALES_DETAIL_TEMPLATES, summaryTemplates } from './phan-he/ban-hang/sales/mauIn/baoCaoBanHang';
import { PAYMENT_REQUEST_TEMPLATES } from './phan-he/quy/debts/paymentRequestPrint';
import { LIST_TEMPLATES as DEBT_VOUCHER_TEMPLATES } from './phan-he/ke-toan/debts/DebtVouchersPage';
import { NKC_TEMPLATES } from './phan-he/ke-toan/reports/mauIn/soNhatKyChung';
import { ledgerTemplates, type LedgerKind } from './phan-he/ke-toan/reports/mauIn/soTaiKhoan';
import { CASH_FLOW_TEMPLATES, CASH_JOURNAL_TEMPLATES, LISTING_TEMPLATES, PURCHASE_JOURNAL_TEMPLATES, SALES_JOURNAL_TEMPLATES } from './phan-he/ke-toan/reports/mauIn/nhatKyBangKe';
import { BALANCE_SHEET_TEMPLATES, INCOME_STATEMENT_TEMPLATES, TRIAL_BALANCE_TEMPLATES } from './phan-he/ke-toan/reports/mauIn/baoCaoTaiChinh';
import { CASH_BALANCE_TEMPLATES, POSTING_TEMPLATES, TAX_SUMMARY_TEMPLATES } from './phan-he/ke-toan/reports/mauIn/baoCaoTongHop';
import { CHECKS_TEMPLATES, EXPENSE_TEMPLATES, contractProfitTemplates } from './phan-he/ke-toan/reports/mauIn/kiemSoat';
import { CASH_ITEM_TEMPLATES, DIMENSION_SUM_TEMPLATES, EXPENSE_DETAIL_TEMPLATES, ITEM_BRANCH_TEMPLATES } from './phan-he/ke-toan/reports/mauIn/khoanMuc';
import { partnerBalanceTemplates } from './phan-he/ke-toan/reports/mauIn/congNoTongHop';
import { DEBT_TERM_TEMPLATES } from './phan-he/ke-toan/reports/mauIn/congNoTheoHan';
import { AGING_TEMPLATES } from './phan-he/ke-toan/reports/mauIn/tuoiNo';
import { DEBT_EMPLOYEE_TEMPLATES, DEBT_ITEM_TEMPLATES } from './phan-he/ke-toan/reports/mauIn/congNoNhanVienMatHang';
import { taxInvoiceTemplates } from './phan-he/thue/mauIn/bangKeThue';
import { LONG_TERM_TEMPLATES, NOTES_TEMPLATES, VAT_RETURN_TEMPLATES } from './phan-he/thue/mauIn/baoCaoThue';
import { assetTemplates } from './phan-he/tai-san/assets/assetPrint';
import { registerTemplates } from './phan-he/tai-san/assets/mauIn/soTaiSan';
import { COST_TEMPLATES, ITEM_LEDGER_TEMPLATES, STOCK_TEMPLATES } from './phan-he/kho/inventory/mauIn/khoHang';
import { PNL_TEMPLATES, PROFIT_TEMPLATES, TRANSFER_TEMPLATES } from './phan-he/kho/reports/mauIn/baoCaoHang';

type L = PrintTemplate<never>[];
const t = (...lists: PrintTemplate<any>[][]) => uniqTemplates(...(lists as L[])); // eslint-disable-line @typescript-eslint/no-explicit-any

/** Sổ của một tài khoản: loại sổ theo mã màn (khớp preset ở phan-he/ke-toan/routes.tsx). */
const LEDGER: [string, LedgerKind][] = [['ACC12', 'detail'], ['ACC88', 'ledger'], ['ACC76', 'detail'], ['ACC86', 'detail'], ['ACC55', 'cash'], ['ACC56', 'cash'], ['ACC40', 'partner'], ['ACC81', 'partner'], ['ACC62', 'partner'], ['ACC87', 'partner']];
const BH02_GROUPS = ['document', 'day', 'month', 'branch', 'product', 'customer', 'taxCode', 'brand', 'industry', 'itemGroup', 'itemType', 'customerGroup'];
const MH11_GROUPS = ['sku', 'group', 'industry', 'brand', 'partner', 'branch'];

const SCREENS: [string, CatalogScreen['templates']][] = [
  // Chứng từ
  [VOUCHER_SCREEN.receipt, t(VOUCHER_TEMPLATES.receipt)],
  [VOUCHER_SCREEN.payment, t(VOUCHER_TEMPLATES.payment)],
  [VOUCHER_SCREEN.bank_payment, t(VOUCHER_TEMPLATES.bank_payment)],
  [VOUCHER_SCREEN.bank_receipt, t(VOUCHER_TEMPLATES.bank_receipt)],
  [VOUCHER_SCREEN.manual, t(VOUCHER_TEMPLATES.manual)],
  ['CN02', t(DEBT_VOUCHER_TEMPLATES.ar)], ['CN03', t(DEBT_VOUCHER_TEMPLATES.ap)], ['CN04', t(DEBT_VOUCHER_TEMPLATES.deposit)],
  ['CN05', t(PAYMENT_REQUEST_TEMPLATES)],
  ['BT03', t(OFFSET_TEMPLATES)],
  ['Q2', t(CASH_TRANSFER_TEMPLATES)],
  ['BH10', t(TRADE_TEMPLATES.sale ?? [])], ['BH11', t(TRADE_TEMPLATES.sale_return ?? [])], ['KHO01', t(TRADE_TEMPLATES.transfer ?? [])],
  ['BH06', t(EXPORT_ADJUST_TEMPLATES)],
  ['MH03', t(...Object.values(MAU_IN), mauInCua({ kind: 'payment', method: 'bank' }))],
  ['ACC28', t(assetTemplates('fixed_asset'), assetTemplates('fixed_asset', 'last'))],
  ['ACC30', t(assetTemplates('fixed_asset', 'first'))],
  ['ACC22', t(assetTemplates('tool'))], ['ACC23', t(assetTemplates('prepaid'))],
  ['DM10', t(PRODUCT_LABEL_TEMPLATES)], ['DM14', t(PRICE_LIST_TEMPLATES)],
  // Sổ kế toán, báo cáo tài chính
  ['ACC89', t(NKC_TEMPLATES)],
  ...LEDGER.map(([code, kind]): [string, CatalogScreen['templates']] => [code, t(ledgerTemplates(kind, code))]),
  ['ACC72', t(CASH_JOURNAL_TEMPLATES)], ['ACC73', t(CASH_JOURNAL_TEMPLATES)],
  ['ACC84', t(SALES_JOURNAL_TEMPLATES)], ['ACC77', t(PURCHASE_JOURNAL_TEMPLATES)], ['ACC60', t(LISTING_TEMPLATES)], ['ACC13', t(CASH_FLOW_TEMPLATES)],
  ['ACC10', t(TRIAL_BALANCE_TEMPLATES)], ['ACC8', t(BALANCE_SHEET_TEMPLATES)], ['ACC9', t(INCOME_STATEMENT_TEMPLATES)],
  ['ACC63', t(POSTING_TEMPLATES)], ['ACC80', t(CASH_BALANCE_TEMPLATES)], ['ACC91', t(TAX_SUMMARY_TEMPLATES)],
  ['ACC44', t(EXPENSE_TEMPLATES)], ['ACC70', t(contractProfitTemplates(false))], ['ACC71', t(contractProfitTemplates(true))], ['ACC93', t(CHECKS_TEMPLATES)],
  ['ACC47', t(EXPENSE_DETAIL_TEMPLATES)], ['ACC69', t(DIMENSION_SUM_TEMPLATES)], ['ACC75', t(CASH_ITEM_TEMPLATES)], ['ACC90', t(ITEM_BRANCH_TEMPLATES)],
  // Công nợ
  ['ACC38', t(partnerBalanceTemplates('ACC38', true), partnerBalanceTemplates('ACC38', false))],
  ['ACC61', t(partnerBalanceTemplates('ACC61', true), partnerBalanceTemplates('ACC61', false))],
  ['ACC39', t(DEBT_TERM_TEMPLATES)], ['ACC67', t(AGING_TEMPLATES)], ['ACC67A', t(AGING_TEMPLATES)], ['ACC67B', t(AGING_TEMPLATES)],
  ['ACC48', t(DEBT_EMPLOYEE_TEMPLATES)], ['ACC68', t(DEBT_ITEM_TEMPLATES)],
  // Thuế
  ['ACC65', t(taxInvoiceTemplates('output'))], ['ACC64', t(taxInvoiceTemplates('input'))],
  ['ACC66', t(VAT_RETURN_TEMPLATES)], ['B09', t(NOTES_TEMPLATES)], ['B01D', t(LONG_TERM_TEMPLATES)],
  // Tài sản
  ...['ACC29', 'ACC42', 'ACC85', 'ACC27'].map((code): [string, CatalogScreen['templates']] => [code, t(registerTemplates(code))]),
  // Kho, bán hàng, mua hàng
  ['ACC83', t(STOCK_TEMPLATES)], ['ACC82', t(ITEM_LEDGER_TEMPLATES)], ['ACC49', t(COST_TEMPLATES)],
  ['HH01', t(TRANSFER_TEMPLATES)], ['BH04', t(PROFIT_TEMPLATES)], ['KQ01', t(PNL_TEMPLATES)],
  ['BH01', t(SALES_DETAIL_TEMPLATES)], ['BH02', t(...BH02_GROUPS.map((g) => summaryTemplates(g)))], ['BH03', t(PAYMENTS_TEMPLATES)], ['BH05', t(RECEIPTS_TEMPLATES)],
  ['MH10', t(LOG_TEMPLATES)], ['MH11', t(...MH11_GROUPS.map((g) => buyTemplates(g)))],
];

export function installPrintCatalog() {
  const titles = new Map(flattenMenu(CORE_MENU).filter((m) => m.code).map((m) => [m.code!, m.label]));
  setPrintCatalog(SCREENS.map(([code, templates]) => ({ code, title: titles.get(code) ?? code, templates })));
}
