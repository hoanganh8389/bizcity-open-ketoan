// @bizcity-layer P data
/**
 * Khai báo kiểu cho từng bảng — Kysely dùng để kiểm tra câu truy vấn lúc biên dịch.
 *
 * Khi thêm cột/bảng trong migrations/*.sql, PHẢI cập nhật file này cho khớp.
 * Quy ước:
 *   Generated<T>  cột có giá trị mặc định ở database (không bắt buộc khi insert)
 *   numeric       PostgreSQL trả về chuỗi (để không mất chính xác) → khai báo string,
 *                 đổi sang number ở tầng repository bằng toNumber().
 */
import type { ColumnType, Generated, Insertable, Selectable } from 'kysely';

type Timestamp = ColumnType<Date, Date | string, Date | string>;
/** Thời điểm có giá trị mặc định (now()) — không bắt buộc khi insert. */
type TimestampDefault = ColumnType<Date, Date | string | undefined, Date | string>;
type DateOnly = ColumnType<string, string, string>;
type Numeric = ColumnType<string, number | string, number | string>;
/** Cột jsonb: đọc ra object, ghi vào bằng chuỗi JSON (JSON.stringify). */
type Json<T = Record<string, unknown>> = ColumnType<T, string, string>;
/** Cột jsonb có giá trị mặc định. */
type JsonDefault<T = Record<string, unknown>> = ColumnType<T, string | undefined, string>;
/** Cột jsonb cho phép NULL. */
type JsonNullable<T = Record<string, unknown>> = ColumnType<T | null, string | null, string | null>;

export interface TenantsTable {
  id: Generated<string>;
  code: string;
  name: string;
  tax_code: string | null;
  address: string | null;
  phone: string | null;
  settings: JsonDefault;
  is_active: Generated<boolean>;
  created_at: TimestampDefault;
}

export interface UsersTable {
  id: Generated<string>;
  tenant_id: string;
  email: string;
  full_name: string;
  password_hash: string;
  role: string;
  is_active: Generated<boolean>;
  last_login_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  /** Số phiên bản phiên đăng nhập (0031): vé mang số khác bị từ chối. */
  session_version: Generated<number>;
  created_at: TimestampDefault;
}

export interface ApiKeysTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  scopes: Generated<string[]>;
  last_used_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  revoked_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  created_at: TimestampDefault;
}

export interface AccountingUnitsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
}

export interface BranchesTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  accounting_unit_id: string | null;
  address: string | null;
  external_ref: string | null;
  is_active: Generated<boolean>;
  created_at: TimestampDefault;
  department_code: string | null;
  note: Generated<string>;
  company_name: Generated<string>;
  tax_code: Generated<string>;
  phone: Generated<string>;
  fax: Generated<string>;
  /** Shop: chi nhánh cha. */
  parent_id: ColumnType<string | null, string | null | undefined, string | null>;
  /** branch = chi nhánh cha (kho tổng), shop = cửa hàng con, '' = chưa xếp. */
  level: Generated<string>;
}

/** Kho của từng chi nhánh (DM12). */
export interface WarehousesTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  branch_id: string;
  name: Generated<string>;
  address: Generated<string>;
  is_active: Generated<boolean>;
  is_default: Generated<boolean>;
  is_promo: Generated<boolean>;
  account: Generated<string>;
  note: Generated<string>;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
}

export interface AuditLogsTable {
  id: Generated<string>;
  tenant_id: string;
  actor: string;
  action: string;
  object_type: string;
  object_id: string | null;
  before_data: JsonNullable;
  after_data: JsonNullable;
  created_at: TimestampDefault;
  // Bằng chứng (migration 0036, bizcity_evidence@1 §5). chain_seq / prev_hash / hash do trigger audit_log_chain điền.
  actor_kind: Generated<'user' | 'apikey' | 'ai' | 'system'>;
  actor_via: ColumnType<string | null, string | null | undefined, never>;
  on_behalf_of: ColumnType<string | null, string | null | undefined, never>;
  module_id: ColumnType<string | null, string | null | undefined, never>;
  module_version: ColumnType<string | null, string | null | undefined, never>;
  subject: ColumnType<string | null, string | null | undefined, never>;
  request_id: ColumnType<string | null, string | null | undefined, never>;
  correlation_id: ColumnType<string | null, string | null | undefined, never>;
  idempotency_key: ColumnType<string | null, string | null | undefined, never>;
  input_hash: ColumnType<string | null, string | null | undefined, never>;
  result_ok: Generated<boolean>;
  result_code: ColumnType<string | null, string | null | undefined, never>;
  dry_run: Generated<boolean>;
  chain_seq: ColumnType<string | null, never, never>;
  prev_hash: ColumnType<string | null, never, never>;
  hash: ColumnType<string | null, never, never>;
}

/** Idempotency của action ghi (migration 0035, bizcity_action@1 §8). */
export interface ActionRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  action_id: string;
  idem_key: string;
  request_hash: string;
  status_code: Generated<number>;
  response: JsonNullable<unknown>;
  actor: string;
  created_at: TimestampDefault;
}

/** Kết quả tự chẩn đoán, chỉ thêm (migration 0034, R-DIAG-5). */
export interface DiagnosticRunsTable {
  id: Generated<string>;
  tenant_id: string;
  layer: 'L1' | 'L3';
  trigger: Generated<'manual' | 'period-lock' | 'schedule' | 'release'>;
  scope: JsonDefault<Record<string, unknown>>;
  summary: Json<Record<string, number>>;
  checks: Json<unknown[]>;
  error_count: Generated<number>;
  actor: string;
  created_at: TimestampDefault;
}

export interface AccountsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  name_en: string | null;
  parent_code: string | null;
  level: Generated<number>;
  normal_side: Generated<string>;
  is_posting: Generated<boolean>;
  track_partner: Generated<boolean>;
  track_cost_item: Generated<boolean>;
  track_department: Generated<boolean>;
  track_contract: Generated<boolean>;
  track_employee: Generated<boolean>;
  track_case: Generated<boolean>;
  track_project: Generated<boolean>;
  track_capital_source: Generated<boolean>;
  track_cashflow: Generated<boolean>;
  is_foreign_currency: Generated<boolean>;
  track_product: Generated<boolean>;
  track_internal_debt: Generated<boolean>;
  is_vat: Generated<boolean>;
  is_debt: Generated<boolean>;
  is_loan: Generated<boolean>;
  always_increase: Generated<boolean>;
  is_ledger: Generated<boolean>;
  is_cost: Generated<boolean>;
  is_active: Generated<boolean>;
  created_at: TimestampDefault;
}

export interface FiscalPeriodsTable {
  id: Generated<string>;
  tenant_id: string;
  year: number;
  month: number;
  start_date: DateOnly;
  end_date: DateOnly;
}

export interface CashPlansTable {
  id: Generated<string>;
  tenant_id: string;
  period: string;
  branch_id: string | null;
  direction: string;
  cost_item_code: string | null;
  partner_id: string | null;
  due_date: DateOnly | null;
  description: Generated<string>;
  amount: Numeric;
  source: Generated<string>;
  source_ref: string | null;
  updated_by: string;
  updated_at: TimestampDefault;
}

export interface CostNormsTable {
  id: Generated<string>;
  tenant_id: string;
  period: string;
  branch_id: string | null;
  department_code: string | null;
  cost_item_code: string;
  amount: Numeric;
  note: Generated<string>;
  updated_by: string;
  updated_at: TimestampDefault;
}

export interface DocumentSignaturesTable {
  id: Generated<string>;
  tenant_id: string;
  event_id: string;
  version: number;
  role: string;
  signer: string;
  signer_name: string;
  signed_at: TimestampDefault;
  revoked_at: Date | null;
  revoked_by: string | null;
}

export interface AuthorityInvoicesTable {
  id: Generated<string>;
  tenant_id: string;
  direction: string;
  seller_tax_code: Generated<string>;
  seller_name: Generated<string>;
  buyer_tax_code: Generated<string>;
  buyer_name: Generated<string>;
  invoice_form: Generated<string>;
  invoice_serial: string;
  invoice_no: string;
  invoice_date: DateOnly;
  total_before_tax: Numeric;
  total_tax: Numeric;
  total_amount: Numeric;
  status_text: Generated<string>;
  status: Generated<string>;
  check_result: Generated<string>;
  source: string;
  file_name: Generated<string>;
  reference_doc_key: string | null;
  imported_by: string;
  imported_at: TimestampDefault;
}

export interface RiskyTaxpayersTable {
  id: Generated<string>;
  tenant_id: string;
  tax_code: string;
  name: Generated<string>;
  risk: string;
  effective_date: DateOnly | null;
  source: Generated<string>;
  note: Generated<string>;
  updated_by: string;
  updated_at: TimestampDefault;
}

export interface PeriodLockEventsTable {
  id: Generated<string>;
  tenant_id: string;
  period_id: string;
  branch_id: string | null;
  doc_type: string;
  action: 'lock' | 'unlock';
  reason: string | null;
  actor: string;
  actor_name: string;
  created_at: TimestampDefault;
}

export interface PeriodLocksTable {
  id: Generated<string>;
  tenant_id: string;
  period_id: string;
  branch_id: string | null;
  doc_type: Generated<string>;
  locked_by: string;
  locked_at: TimestampDefault;
}

export interface PartnersTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: Generated<string>;
  kind: Generated<string>;
  tax_code: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
  group_code: string | null;
  is_active: Generated<boolean>;
  payment_term_days: number | null;
  credit_limit: ColumnType<string | null, number | string | null | undefined, number | string | null>;
  note: Generated<string>;
  contact_name: Generated<string>;
  bank_account_no: Generated<string>;
  bank_account_holder: Generated<string>;
  bank_name: Generated<string>;
  max_open_docs: number | null;
  mobile: Generated<string>;
  fax: Generated<string>;
  website: Generated<string>;
  position: Generated<string>;
  company_name: Generated<string>;
  company_address: Generated<string>;
  short_name: Generated<string>;
  manager_code: string | null;
  branch_code: string | null;
  created_by: Generated<string>;
  birth_date: DateOnly | null;
  gender: Generated<string>;
  alias: Generated<string>;
  is_prospect: Generated<boolean>;
  customer_type: Generated<string>;
  also_kinds: Generated<string[]>;
}

export interface PartnerGroupsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  parent_code: string | null;
  kind: Generated<string>;
  note: Generated<string>;
  is_active: Generated<boolean>;
}

export interface TaxCodesTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  rate: Numeric;
  direction: string;
  account_code: string | null;
  report_group: string;
  is_active: Generated<boolean>;
}

export interface ProductPostingGroupsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  inventory_account: string;
  cogs_account: string;
  revenue_account: string;
  discount_account: string | null;
  sales_return_account: string;
  is_default: Generated<boolean>;
}

export interface ProductsTable {
  id: Generated<string>;
  tenant_id: string;
  sku: string;
  name: Generated<string>;
  unit: Generated<string>;
  posting_group_code: string | null;
  tax_out_code: string | null;
  tax_in_code: string | null;
  updated_at: TimestampDefault;
  brand_code: string | null;
  industry_code: string | null;
  group_code: string | null;
  type_code: string | null;
  is_active: Generated<boolean>;
  source_system: Generated<string>;
  note: Generated<string>;
  excise_rate: string | null;
  barcode: Generated<string>;
  image_url: Generated<string>;
  description: Generated<string>;
  weight_kg: string | null;
  origin: Generated<string>;
  is_main: Generated<boolean>;
  is_under_24m: Generated<boolean>;
  no_sale: Generated<boolean>;
  export_adjust: Generated<boolean>;
  is_kct: Generated<boolean>;
  track_identifier: Generated<boolean>;
  /** Mã hàng cha (họ mã 1 cấp). */
  parent_sku: string | null;
  parent_manual: Generated<boolean>;
}

export interface ProductUnitsTable {
  id: Generated<string>;
  tenant_id: string;
  sku: string;
  unit: string;
  ratio: Generated<string>;
  is_default: Generated<boolean>;
  is_purchase_default: Generated<boolean>;
  weight_kg: string | null;
  note: Generated<string>;
  updated_at: TimestampDefault;
}

export interface UnitNamesTable {
  id: Generated<string>;
  tenant_id: string;
  name: string;
  note: Generated<string>;
  source: Generated<string>;
  is_active: Generated<boolean>;
  created_by: Generated<string>;
  updated_by: Generated<string>;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
}

/** Hoá đơn đầu vào của NCC (0030). */
export interface SupplierInvoicesTable {
  id: Generated<string>;
  tenant_id: string;
  partner_code: string;
  invoice_form: Generated<string>;
  invoice_series: Generated<string>;
  invoice_no: string;
  invoice_date: ColumnType<string | null, string | null | undefined, string | null>;
  seller_tax_code: Generated<string>;
  seller_name: Generated<string>;
  buyer_tax_code: Generated<string>;
  total_before_tax: ColumnType<string, string | number | undefined, string | number>;
  total_discount: ColumnType<string, string | number | undefined, string | number>;
  total_tax: ColumnType<string, string | number | undefined, string | number>;
  total: ColumnType<string, string | number | undefined, string | number>;
  source: Generated<string>;
  status: Generated<string>;
  data: ColumnType<unknown, string | undefined, string>;
  note: Generated<string>;
  created_by: Generated<string>;
  updated_by: Generated<string>;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
  cancelled_by: ColumnType<string | null, string | null | undefined, string | null>;
  cancelled_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  cancel_reason: ColumnType<string | null, string | null | undefined, string | null>;
}
/** Dòng hàng hoá đơn NCC (0030). */
export interface SupplierInvoiceLinesTable {
  id: Generated<string>;
  tenant_id: string;
  invoice_id: string;
  line_no: number;
  ncc_sku: Generated<string>;
  ncc_name: Generated<string>;
  ncc_unit: Generated<string>;
  qty: ColumnType<string, string | number | undefined, string | number>;
  price: ColumnType<string, string | number | undefined, string | number>;
  discount_amount: ColumnType<string, string | number | undefined, string | number>;
  amount: ColumnType<string, string | number | undefined, string | number>;
  tax_rate: ColumnType<string | null, string | number | null | undefined, string | number | null>;
  tax_amount: ColumnType<string, string | number | undefined, string | number>;
  is_gift: Generated<boolean>;
  sku: ColumnType<string | null, string | null | undefined, string | null>;
  unit: ColumnType<string | null, string | null | undefined, string | null>;
  match_source: Generated<string>;
  data: ColumnType<unknown, string | undefined, string>;
}
/** Nhận diện mã hàng NCC — dữ liệu học (0030). */
export interface SupplierItemAliasesTable {
  id: Generated<string>;
  tenant_id: string;
  partner_code: string;
  ncc_sku: Generated<string>;
  ncc_name: Generated<string>;
  ncc_name_key: Generated<string>;
  ncc_unit: Generated<string>;
  sku: string;
  unit: string;
  hits: Generated<number>;
  source: Generated<string>;
  last_seen_at: TimestampDefault;
  created_by: Generated<string>;
  updated_by: Generated<string>;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
}
export interface SupplierProductsTable {
  id: Generated<string>;
  tenant_id: string;
  partner_code: string | null;
  sku: string;
  unit: string;
  is_default_unit: Generated<boolean>;
  ncc_sku: Generated<string>;
  price: ColumnType<string | null, string | null | undefined, string | null>;
  price_includes_vat: Generated<boolean>;
  warn_pct: Generated<string>;
  valid_from: ColumnType<string | null, string | null | undefined, string | null>;
  valid_to: ColumnType<string | null, string | null | undefined, string | null>;
  note: Generated<string>;
  is_active: Generated<boolean>;
  is_demo: Generated<boolean>;
  created_by: Generated<string>;
  updated_by: Generated<string>;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
  /** Tên hàng bên NCC. */
  ncc_name: Generated<string>;
}

/** Tồn max / min theo chi nhánh – kho – mã (0020). */
export interface StockLevelsTable {
  id: Generated<string>;
  tenant_id: string;
  branch_code: string;
  warehouse_code: Generated<string>;
  sku: string;
  max_qty: ColumnType<string, string | number, string | number>;
  min_qty: ColumnType<string, string | number | undefined, string | number>;
  source: Generated<string>;
  note: Generated<string>;
  updated_by: Generated<string>;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
}

export interface PrintTemplateSettingsTable {
  id: Generated<string>;
  tenant_id: string;
  template_code: string;
  scope: string;
  scope_ref: Generated<string>;
  is_enabled: Generated<boolean>;
  is_default: Generated<boolean>;
  overrides: ColumnType<Record<string, unknown>, string | undefined, string>;
  updated_by: Generated<string>;
  updated_at: TimestampDefault;
}

export interface StockSkuSettingsTable {
  tenant_id: string;
  sku: string;
  window_days: number | null;
  cover_days: ColumnType<string | null, string | number | null | undefined, string | number | null>;
  transfer_mode: Generated<string>;
  note: Generated<string>;
  updated_by: Generated<string>;
  updated_at: TimestampDefault;
}

export interface StockMaxRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  kind: Generated<string>;
  branch_code: string;
  parent_code: Generated<string>;
  status: Generated<string>;
  title: Generated<string>;
  note: Generated<string>;
  source: Generated<string>;
  data: ColumnType<unknown, string, string>;
  created_by: Generated<string>;
  approved_by: Generated<string>;
  approved_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
}

export interface OrderFormulasTable {
  tenant_id: string;
  branch_code: string;
  config: ColumnType<unknown, string, string>;
  updated_by: Generated<string>;
  updated_at: TimestampDefault;
}

export interface TransferRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  from_branch: string;
  from_warehouse: Generated<string>;
  to_branch: string;
  to_warehouse: Generated<string>;
  status: Generated<string>;
  note: Generated<string>;
  data: ColumnType<unknown, string, string>;
  created_by: Generated<string>;
  done_by: Generated<string>;
  done_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
}

export interface PriceListsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: Generated<string>;
  is_company: Generated<boolean>;
  is_active: Generated<boolean>;
  note: Generated<string>;
  updated_at: TimestampDefault;
}

export interface PriceListBranchesTable {
  tenant_id: string;
  branch_code: string;
  price_list_code: string;
  updated_at: TimestampDefault;
}

export interface ProductPricesTable {
  id: Generated<string>;
  tenant_id: string;
  price_list_code: string;
  sku: string;
  unit: string;
  price: string | null;
  is_default_unit: Generated<boolean>;
  note: Generated<string>;
  updated_at: TimestampDefault;
}

export interface CatalogTombstonesTable {
  id: Generated<string>;
  tenant_id: string;
  entity: 'product' | 'unit' | 'price' | 'price_list' | 'group';
  key: string;
  deleted_at: TimestampDefault;
}

export interface ItemClassesTable {
  id: Generated<string>;
  tenant_id: string;
  kind: string;
  code: string;
  name: string;
  parent_code: string | null;
  is_active: Generated<boolean>;
  sku_code: Generated<string>;
  updated_at: TimestampDefault;
}

export interface PostingReasonsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  kind: string;
  counter_account: string | null;
  revenue_account: string | null;
  expense_account: string | null;
  cashflow_code: string | null;
  flags: JsonDefault;
  is_active: Generated<boolean>;
}

export interface PaymentMethodsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  account_code: string;
  bank_account_code: string | null;
  is_receivable: Generated<boolean>;
  is_active: Generated<boolean>;
  note: Generated<string>;
  sort_order: number | null;
  discount_rate: string | null;
  partner_code: string | null;
}

export interface BankAccountsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  bank_name: string;
  bank_branch: Generated<string>;
  account_no: string;
  holder: Generated<string>;
  account_code: string;
  branch_code: string | null;
  currency: Generated<string>;
  note: Generated<string>;
  is_active: Generated<boolean>;
  bank_address: Generated<string>;
  bank_phone: Generated<string>;
  contact: Generated<string>;
}

export interface PostingDefaultsTable {
  tenant_id: string;
  key: string;
  account_code: string;
}

export interface PostingLogTable {
  id: Generated<string>;
  tenant_id: string;
  event_id: string;
  doc_type: string;
  doc_no: string;
  version: number;
  action: 'receive' | 'post' | 'repost' | 'error' | 'cancel' | 'cancel_request' | 'unpost';
  entry_ids: ColumnType<string[], string[] | undefined, string[]>;
  reversed: Generated<number>;
  total: Numeric | null;
  message: string | null;
  actor: string;
  created_at: TimestampDefault;
}

export interface AccountingEventsTable {
  id: Generated<string>;
  tenant_id: string;
  source_system: Generated<string>;
  doc_key: string;
  version: Generated<number>;
  doc_type: string;
  branch_id: string;
  doc_no: string;
  doc_date: DateOnly;
  partner_id: string | null;
  invoice_no: string | null;
  total: Numeric;
  payload: Json<unknown>;
  status: Generated<string>;
  error_code: string | null;
  error_message: string | null;
  received_at: TimestampDefault;
  posted_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  created_by: ColumnType<string | null, string | null | undefined, string | null>;
  posted_version: ColumnType<number | null, number | null | undefined, number | null>;
  cancel_requested_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  cancel_reason: string | null;
}

export interface AccountingEventVersionsTable {
  id: Generated<string>;
  event_id: string;
  version: number;
  payload: Json<unknown>;
  received_at: Timestamp;
}

export interface LedgerEntriesTable {
  id: Generated<string>;
  tenant_id: string;
  branch_id: string;
  period_id: string;
  entry_no: string;
  doc_type: string;
  event_id: string | null;
  event_version: number | null;
  doc_no: string;
  invoice_no: string | null;
  doc_date: DateOnly;
  posting_date: DateOnly;
  reason_code: string | null;
  partner_id: string | null;
  description: Generated<string>;
  total: Numeric;
  status: Generated<string>;
  reverses_entry_id: string | null;
  content_hash: string | null;
  /** Mã băm phần số liệu (migration 0062). */
  body_hash: ColumnType<string | null, string | null | undefined, string | null>;
  is_reversal: Generated<boolean>;
  created_by: string;
  created_at: TimestampDefault;
}

export interface LedgerLinesTable {
  id: Generated<string>;
  entry_id: string;
  tenant_id: string;
  branch_id: string;
  posting_date: DateOnly;
  line_no: number;
  pair_no: number;
  account_code: string;
  debit: Numeric;
  credit: Numeric;
  partner_id: string | null;
  tax_code: string | null;
  part: string;
  product_sku: string | null;
  description: Generated<string>;
  source_line_key: string | null;
  dims: JsonDefault;
  /** Dòng giá vốn chờ tính giá: 'debit' | 'credit' (bên ghi số tiền). Xem migration 0059. */
  cost_fill: ColumnType<string | null, string | null | undefined, string | null>;
}

export interface LedgerLinksTable {
  id: Generated<string>;
  tenant_id: string;
  entry_id: string;
  target_entry_id: string;
  link_type: string;
  reason: Generated<string>;
  created_by: Generated<string>;
  created_at: TimestampDefault;
}

export interface LedgerBalancesDailyTable {
  tenant_id: string;
  branch_id: string;
  account_code: string;
  posting_date: DateOnly;
  partner_id: string;
  debit: Numeric;
  credit: Numeric;
}

export interface TaxInvoicesTable {
  id: Generated<string>;
  tenant_id: string;
  branch_id: string;
  direction: string;
  event_id: string;
  doc_type: string;
  doc_no: string;
  doc_date: DateOnly;
  invoice_no: string;
  invoice_serial: Generated<string>;
  invoice_form: Generated<string>;
  invoice_date: DateOnly;
  status: Generated<string>;
  partner_id: string | null;
  buyer_name: Generated<string>;
  buyer_tax_code: Generated<string>;
  buyer_address: Generated<string>;
  total_before_tax: Numeric;
  total_tax: Numeric;
  sign: Generated<number>;
  created_at: TimestampDefault;
  declare_date: ColumnType<string | null, string | null | undefined, string | null>;
  deductible: Generated<boolean>;
  payment_ref: Generated<string>;
  /** Cột sinh tự động = kỳ kê khai nếu có, không thì ngày hoá đơn. */
  period_date: ColumnType<string, never, never>;
}

export interface TaxInfoPatchesTable {
  id: Generated<string>;
  tenant_id: string;
  event_id: string;
  invoice: JsonDefault;
  declare_month: ColumnType<string | null, string | null | undefined, string | null>;
  deductible: Generated<boolean>;
  payment_ref: Generated<string>;
  note: Generated<string>;
  updated_by: Generated<string>;
  updated_at: TimestampDefault;
}

export interface CashTransferConfirmationsTable {
  id: Generated<string>;
  tenant_id: string;
  event_id: string;
  amount: Numeric;
  to_branch_code: string;
  to_bank_code: Generated<string>;
  note: Generated<string>;
  confirmed_by: Generated<string>;
  confirmed_at: TimestampDefault;
}

export interface TaxInvoiceLinesTable {
  id: Generated<string>;
  tax_invoice_id: string;
  line_no: number;
  sku: Generated<string>;
  name: Generated<string>;
  unit: Generated<string>;
  qty: Numeric;
  amount_before_tax: Numeric;
  tax_code: string;
  tax_rate: Numeric;
  report_group: string;
  tax_amount: Numeric;
}

/** View (migration 0053): dòng hàng chứng từ bán / trả lại đã ghi sổ, đọc từ payload. Chỉ đọc. */
export interface SalesLinesTable {
  id: Generated<string>;
  tenant_id: string;
  event_id: string;
  branch_id: string;
  partner_id: string | null;
  doc_date: DateOnly;
  sign: number;
  line_no: number;
  sku: Generated<string>;
  name: Generated<string>;
  unit: Generated<string>;
  qty: Numeric;
  unit_price: Numeric;
  amount_before_tax: Numeric;
  discount: Numeric;
  tax_code: Generated<string>;
  tax_amount: Numeric;
  is_gift: Generated<boolean>;
  cost: ColumnType<string | null, number | string | null | undefined, number | string | null>;
}

export interface InventoryMovementsTable {
  id: Generated<string>;
  /** Không tính vào đơn giá bình quân (quà KM người tiêu dùng). */
  exclude_cost: Generated<boolean>;
  tenant_id: string;
  event_id: string;
  branch_id: string;
  doc_type: string;
  doc_date: DateOnly;
  line_no: number;
  kind: string;
  sku: string;
  name: Generated<string>;
  unit: Generated<string>;
  warehouse_code: Generated<string>;
  qty: Numeric;
  amount: ColumnType<string | null, number | string | null | undefined, number | string | null>;
  counter_branch_id: string | null;
  reason_code: string | null;
  is_gift: Generated<boolean>;
  priced_at_sale: Generated<boolean>;
}

export interface AssetCategoriesTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  kind: string;
  asset_account: string | null;
  depreciation_account: string;
  expense_account: string;
  useful_life_months: number | null;
  parent_code: string | null;
  is_active: Generated<boolean>;
}

export interface AssetsTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  kind: string;
  category_id: string | null;
  branch_id: string;
  unit: Generated<string>;
  quantity: ColumnType<string, number | string | undefined, number | string>;
  acquired_date: ColumnType<string | null, string | null | undefined, string | null>;
  start_date: DateOnly;
  original_cost: Numeric;
  useful_life_months: number;
  monthly_amount: ColumnType<string | null, number | string | null | undefined, number | string | null>;
  opening_accumulated: ColumnType<string, number | string | undefined, number | string>;
  opening_as_of: ColumnType<string | null, string | null | undefined, string | null>;
  asset_account: string | null;
  depreciation_account: string;
  expense_account: string;
  cost_item_code: string | null;
  department_code: string | null;
  contract_code: ColumnType<string | null, string | null | undefined, string | null>;
  specs: ColumnType<unknown, string | undefined, string>;
  photo: ColumnType<string | null, string | null | undefined, string | null>;
  tool_group_code: ColumnType<string | null, string | null | undefined, string | null>;
  usage_purpose_code: ColumnType<string | null, string | null | undefined, string | null>;
  depreciable_amount: ColumnType<string | null, number | string | null | undefined, number | string | null>;
  tax_monthly_amount: ColumnType<string | null, number | string | null | undefined, number | string | null>;
  opening_remaining_months: ColumnType<number | null, number | null | undefined, number | null>;
  status: Generated<string>;
  disposed_date: ColumnType<string | null, string | null | undefined, string | null>;
  note: Generated<string>;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
}

export interface AssetDepreciationsTable {
  id: Generated<string>;
  tenant_id: string;
  asset_id: string;
  year: number;
  month: number;
  amount: Numeric;
  covers_from: ColumnType<number | null, number | null | undefined, number | null>;
  event_id: string | null;
  computed_at: TimestampDefault;
}

export interface AssetAllocationsTable {
  id: Generated<string>;
  asset_id: string;
  line_no: number;
  percent: Numeric;
  branch_id: string | null;
  expense_account: string;
  cost_item_code: string | null;
  department_code: string | null;
  contract_code: string | null;
}

export interface AssetEventsTable {
  id: Generated<string>;
  tenant_id: string;
  asset_id: string;
  kind: string;
  event_date: DateOnly;
  doc_no: Generated<string>;
  payload: ColumnType<Record<string, unknown>, string | undefined, string>;
  note: Generated<string>;
  created_by: Generated<string>;
  created_at: TimestampDefault;
}

export interface AssetDepreciationOverridesTable {
  id: Generated<string>;
  asset_id: string;
  year: number;
  month: number;
  amount: Numeric;
  reason: string;
  updated_by: Generated<string>;
  updated_at: TimestampDefault;
}

export interface VatReturnsTable {
  id: Generated<string>;
  tenant_id: string;
  period_kind: string;
  year: number;
  period: number;
  scope: Generated<string>;
  status: Generated<string>;
  values: ColumnType<Record<string, number>, string, string>;
  manual: ColumnType<Record<string, number>, string | undefined, string>;
  updated_by: Generated<string>;
  updated_at: TimestampDefault;
  revision: Generated<number>;
  supplement: ColumnType<Record<string, unknown> | null, string | null | undefined, string | null>;
}

export interface CitReturnsTable {
  id: Generated<string>;
  tenant_id: string;
  year: number;
  status: Generated<string>;
  values: ColumnType<Record<string, number>, string, string>;
  manual: ColumnType<Record<string, number>, string | undefined, string>;
  updated_by: Generated<string>;
  updated_at: TimestampDefault;
}

export interface TaxpayerProfilesTable {
  tenant_id: string;
  data: JsonDefault;
  updated_by: Generated<string>;
  updated_at: TimestampDefault;
}

export interface LongTermBalancesTable {
  id: Generated<string>;
  tenant_id: string;
  as_of: DateOnly;
  account_code: string;
  partner_id: string | null;
  amount: Numeric;
  note: Generated<string>;
  updated_at: TimestampDefault;
}

export interface InventoryCostsTable {
  id: Generated<string>;
  tenant_id: string;
  cost_group: Generated<string>;
  year: number;
  month: number;
  sku: string;
  opening_qty: Numeric;
  opening_value: Numeric;
  in_qty: Numeric;
  in_value: Numeric;
  unit_cost: Numeric;
  out_qty: Numeric;
  closing_qty: Numeric;
  closing_value: Numeric;
  /** Tồn cuối phần quà KM người tiêu dùng (giá 0), nằm trong closing_qty. */
  gift_qty: ColumnType<string, number | string | undefined, number | string>;
  computed_at: Generated<Date>;
  /** computed = tính bình quân; import = nhập từ Excel giá vốn tháng (migration 0061). */
  cost_source: Generated<string>;
}

/** View (migration 0053): thanh toán của chứng từ bán / trả lại đã ghi sổ, đọc từ payload. Chỉ đọc. */
export interface SalesPaymentsTable {
  id: Generated<string>;
  tenant_id: string;
  event_id: string;
  branch_id: string;
  doc_date: DateOnly;
  sign: number;
  method_code: string;
  amount: Numeric;
}

export interface LedgerEntrySequencesTable {
  tenant_id: string;
  year: number;
  last_no: Generated<number>;
}

export interface DimensionsTable {
  id: Generated<string>;
  tenant_id: string;
  kind: string;
  code: string;
  name: string;
  parent_code: string | null;
  note: Generated<string>;
  extra: JsonDefault;
  is_active: Generated<boolean>;
}

export interface ContractSchedulesTable {
  id: Generated<string>;
  tenant_id: string;
  contract_code: string;
  seq: number;
  due_date: DateOnly;
  amount: Numeric;
  tax_amount: ColumnType<string, number | string | undefined, number | string>;
  description: Generated<string>;
  status: Generated<string>;
  paid_date: ColumnType<string | null, string | null | undefined, string | null>;
  paid_ref: Generated<string>;
  updated_by: Generated<string>;
  updated_at: TimestampDefault;
}

export interface DebtItemsTable {
  id: Generated<string>;
  tenant_id: string;
  event_id: string;
  partner_id: string;
  account_code: string;
  side: string;
  amount: Numeric;
  settled_amount: ColumnType<string, number | string | undefined, number | string>;
  branch_id: string;
  doc_no: string;
  doc_date: DateOnly;
  due_date: DateOnly;
  updated_at: TimestampDefault;
}

export interface DebtAllocationsTable {
  id: Generated<string>;
  tenant_id: string;
  debit_item_id: string;
  credit_item_id: string;
  amount: Numeric;
  alloc_date: ColumnType<string, string | undefined, string>;
  is_auto: Generated<boolean>;
  note: Generated<string>;
  created_by: Generated<string>;
  created_at: TimestampDefault;
}

/** Chứng từ mua hàng (phân hệ Mua hàng, 0010). */
export interface PurchaseDocumentsTable {
  id: Generated<string>;
  tenant_id: string;
  kind: string;
  status: Generated<string>;
  doc_no: string;
  doc_date: DateOnly;
  branch_code: string;
  partner_code: string;
  brand_code: string | null;
  invoice_no: string | null;
  invoice_serial: Generated<string>;
  invoice_date: ColumnType<string | null, string | null | undefined, string | null>;
  due_date: ColumnType<string | null, string | null | undefined, string | null>;
  total_before_tax: ColumnType<string, number | string | undefined, number | string>;
  total_tax: ColumnType<string, number | string | undefined, number | string>;
  total: ColumnType<string, number | string | undefined, number | string>;
  ref_ids: ColumnType<string[], string[] | undefined, string[]>;
  revision: Generated<number>;
  links: JsonDefault<unknown>;
  data: JsonDefault<unknown>;
  is_demo: Generated<boolean>;
  created_by: Generated<string>;
  created_by_name: Generated<string>;
  approved_by: string | null;
  approved_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
}

/** Chính sách mua hàng (0010). */
export interface PurchasePoliciesTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  kind: string;
  name: string;
  scope: JsonDefault<unknown>;
  valid_from: ColumnType<string | null, string | null | undefined, string | null>;
  valid_to: ColumnType<string | null, string | null | undefined, string | null>;
  priority: Generated<number>;
  rule: JsonDefault<unknown>;
  is_active: Generated<boolean>;
  is_demo: Generated<boolean>;
  updated_by: Generated<string>;
  created_by: Generated<string>;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
}

export interface PurchaseAttachmentsTable {
  id: Generated<string>;
  tenant_id: string;
  owner_type: string;
  owner_id: string;
  kind: Generated<string>;
  file_name: string;
  mime: Generated<string>;
  size: Generated<string>;
  path: string;
  note: Generated<string>;
  uploaded_by: Generated<string>;
  created_at: TimestampDefault;
}

export interface PaymentRequestsTable {
  id: Generated<string>;
  tenant_id: string;
  request_no: string;
  request_date: DateOnly;
  branch_code: string;
  partner_id: string;
  amount: Numeric;
  due_date: ColumnType<string | null, string | null | undefined, string | null>;
  method: Generated<string>;
  debit_account: string | null;
  description: Generated<string>;
  source_ref: Generated<string>;
  items: JsonDefault<unknown>;
  contract_schedule_id: string | null;
  status: Generated<string>;
  levels_required: Generated<number>;
  created_by: Generated<string>;
  created_by_name: Generated<string>;
  submitted_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  approved1_by: string | null;
  approved1_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  approved2_by: string | null;
  approved2_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
  rejected_by: string | null;
  rejected_reason: Generated<string>;
  paid_event_id: string | null;
  created_at: TimestampDefault;
  updated_at: TimestampDefault;
}

export interface PaymentRequestSettingsTable {
  tenant_id: string;
  second_level_from: ColumnType<string | null, number | string | null | undefined, number | string | null>;
  updated_by: Generated<string>;
  updated_at: TimestampDefault;
}

export interface ReferenceDocumentsTable {
  id: Generated<string>;
  tenant_id: string;
  kind: string;
  doc_key: string;
  doc_no: string;
  doc_date: DateOnly;
  partner_id: string | null;
  branch_code: Generated<string>;
  total: ColumnType<string, number | string | undefined, number | string>;
  due_date: ColumnType<string | null, string | null | undefined, string | null>;
  description: Generated<string>;
  source_system: Generated<string>;
  payload: JsonDefault<unknown>;
  status: Generated<string>;
  used_event_id: string | null;
  received_at: TimestampDefault;
  updated_at: TimestampDefault;
}

export interface VoucherTemplatesTable {
  id: Generated<string>;
  tenant_id: string;
  code: string;
  name: string;
  doc_type: string;
  voucher: Json;
  is_active: Generated<boolean>;
  updated_by: Generated<string>;
  updated_at: TimestampDefault;
}

export interface VoucherRecurrencesTable {
  id: Generated<string>;
  tenant_id: string;
  template_code: string;
  name: Generated<string>;
  frequency: string;
  day_of_month: number;
  start_month: string;
  end_month: string | null;
  branch_code: string | null;
  is_active: Generated<boolean>;
  updated_by: Generated<string>;
  updated_at: TimestampDefault;
}

export interface VoucherRecurrenceRunsTable {
  id: Generated<string>;
  tenant_id: string;
  recurrence_id: string;
  period: string;
  document_id: string;
  created_by: Generated<string>;
  created_at: TimestampDefault;
}

export interface ClosingRulesTable {
  id: Generated<string>;
  tenant_id: string;
  seq: number;
  from_account: string;
  to_account: string;
  mode: string;
  description: Generated<string>;
  is_active: Generated<boolean>;
  include_opening: Generated<boolean>;
}

export interface ClosingRuleVersionsTable {
  tenant_id: string;
  version: number;
  rules: Json<unknown>;
  note: Generated<string>;
  created_by: string;
  created_by_name: Generated<string>;
  created_at: TimestampDefault;
}

export interface DocumentSequencesTable {
  tenant_id: string;
  doc_type: string;
  year: number;
  last_no: Generated<number>;
}

export interface SchemaMigrationsTable {
  name: string;
  applied_at: TimestampDefault;
}

/** Toàn bộ cơ sở dữ liệu. */
export interface Database {
  tenants: TenantsTable;
  users: UsersTable;
  api_keys: ApiKeysTable;
  accounting_units: AccountingUnitsTable;
  branches: BranchesTable;
  warehouses: WarehousesTable;
  audit_logs: AuditLogsTable;
  diagnostic_runs: DiagnosticRunsTable;
  action_requests: ActionRequestsTable;
  accounts: AccountsTable;
  fiscal_periods: FiscalPeriodsTable;
  period_locks: PeriodLocksTable;
  period_lock_events: PeriodLockEventsTable;
  authority_invoices: AuthorityInvoicesTable;
  document_signatures: DocumentSignaturesTable;
  cash_plans: CashPlansTable;
  cost_norms: CostNormsTable;
  risky_taxpayers: RiskyTaxpayersTable;
  partners: PartnersTable;
  tax_codes: TaxCodesTable;
  product_posting_groups: ProductPostingGroupsTable;
  products: ProductsTable;
  posting_reasons: PostingReasonsTable;
  payment_methods: PaymentMethodsTable;
  bank_accounts: BankAccountsTable;
  posting_defaults: PostingDefaultsTable;
  accounting_events: AccountingEventsTable;
  posting_log: PostingLogTable;
  accounting_event_versions: AccountingEventVersionsTable;
  ledger_entries: LedgerEntriesTable;
  ledger_lines: LedgerLinesTable;
  ledger_balances_daily: LedgerBalancesDailyTable;
  ledger_links: LedgerLinksTable;
  tax_invoices: TaxInvoicesTable;
  partner_groups: PartnerGroupsTable;
  item_classes: ItemClassesTable;
  product_units: ProductUnitsTable;
  price_lists: PriceListsTable;
  price_list_branches: PriceListBranchesTable;
  product_prices: ProductPricesTable;
  catalog_tombstones: CatalogTombstonesTable;
  tax_info_patches: TaxInfoPatchesTable;
  cash_transfer_confirmations: CashTransferConfirmationsTable;
  tax_invoice_lines: TaxInvoiceLinesTable;
  sales_lines: SalesLinesTable;
  sales_payments: SalesPaymentsTable;
  inventory_movements: InventoryMovementsTable;
  inventory_costs: InventoryCostsTable;
  asset_categories: AssetCategoriesTable;
  assets: AssetsTable;
  asset_depreciations: AssetDepreciationsTable;
  asset_allocations: AssetAllocationsTable;
  asset_events: AssetEventsTable;
  asset_depreciation_overrides: AssetDepreciationOverridesTable;
  vat_returns: VatReturnsTable;
  cit_returns: CitReturnsTable;
  taxpayer_profiles: TaxpayerProfilesTable;
  long_term_balances: LongTermBalancesTable;
  ledger_entry_sequences: LedgerEntrySequencesTable;
  document_sequences: DocumentSequencesTable;
  closing_rules: ClosingRulesTable;
  closing_rule_versions: ClosingRuleVersionsTable;
  dimensions: DimensionsTable;
  contract_schedules: ContractSchedulesTable;
  voucher_templates: VoucherTemplatesTable;
  debt_items: DebtItemsTable;
  reference_documents: ReferenceDocumentsTable;
  payment_requests: PaymentRequestsTable;
  purchase_documents: PurchaseDocumentsTable;
  purchase_policies: PurchasePoliciesTable;
  purchase_attachments: PurchaseAttachmentsTable;
  supplier_products: SupplierProductsTable;
  supplier_invoices: SupplierInvoicesTable;
  supplier_invoice_lines: SupplierInvoiceLinesTable;
  supplier_item_aliases: SupplierItemAliasesTable;
  stock_levels: StockLevelsTable;
  stock_sku_settings: StockSkuSettingsTable;
  print_template_settings: PrintTemplateSettingsTable;
  stock_max_requests: StockMaxRequestsTable;
  order_formulas: OrderFormulasTable;
  transfer_requests: TransferRequestsTable;
  unit_names: UnitNamesTable;
  payment_request_settings: PaymentRequestSettingsTable;
  debt_allocations: DebtAllocationsTable;
  voucher_recurrences: VoucherRecurrencesTable;
  voucher_recurrence_runs: VoucherRecurrenceRunsTable;
  schema_migrations: SchemaMigrationsTable;
}

export type Account = Selectable<AccountsTable>;
export type Branch = Selectable<BranchesTable>;
export type Partner = Selectable<PartnersTable>;
export type TaxCode = Selectable<TaxCodesTable>;
export type PostingReason = Selectable<PostingReasonsTable>;
export type PaymentMethod = Selectable<PaymentMethodsTable>;
export type ProductPostingGroup = Selectable<ProductPostingGroupsTable>;
export type AccountingEventRow = Selectable<AccountingEventsTable>;
export type LedgerEntryRow = Selectable<LedgerEntriesTable>;
export type LedgerLineInsert = Insertable<LedgerLinesTable>;
