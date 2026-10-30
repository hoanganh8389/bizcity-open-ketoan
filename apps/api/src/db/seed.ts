// @bizcity-layer K kernel/seeds
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
/**
 * Dữ liệu khởi tạo cho một đơn vị mới.
 *
 * Tạo (nếu chưa có): đơn vị, 2 bộ sổ, người dùng quản trị, khoá API, hệ thống tài khoản
 * (db/seeds/tai-khoan.csv), loại thuế, lý do, nhóm hạch toán, hình thức thanh toán,
 * tài khoản ngầm định, một chi nhánh mẫu.
 *
 * Chạy lại an toàn: chỉ thêm cái còn thiếu, không ghi đè cấu hình người dùng đã sửa.
 *
 * Biến môi trường:
 *   SEED_TENANT_CODE   mã đơn vị            (mặc định "demo")
 *   SEED_TENANT_NAME   tên đơn vị
 *   SEED_ADMIN_EMAIL   email quản trị       (mặc định admin@ketoan.local)
 *   SEED_ADMIN_PASSWORD mật khẩu quản trị   (mặc định "Admin@123", nhớ đổi)
 *   SEED_API_KEY       khoá API cố định cho tích hợp (bỏ trống = sinh ngẫu nhiên và in ra)
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, closeDb } from './client.js';
import { runMigrations } from './migrate.js';
import { generateApiKey, hashApiKey, hashPassword } from '../core/security/password.js';
import { SEEDS_DIR } from './paths.js';


/** Đọc CSV đơn giản (có ô bọc nháy kép). */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  const [header, ...data] = rows;
  return data.map((r) => Object.fromEntries(header!.map((h, i) => [h, r[i] ?? ''])));
}

const flag = (v: string | undefined) => v === '1';

/** Loại thuế mặc định. report_group là nhóm trên bảng kê. */
const TAX_CODES = [
  { code: 'KCT', name: 'Không chịu thuế GTGT', rate: 0, direction: 'output', account_code: '33311', report_group: 'KCT' },
  { code: 'R00', name: 'Thuế GTGT đầu ra 0%', rate: 0, direction: 'output', account_code: '33311', report_group: '0' },
  { code: 'R05', name: 'Thuế GTGT đầu ra 5%', rate: 5, direction: 'output', account_code: '33311', report_group: '5' },
  { code: 'R08', name: 'Thuế GTGT đầu ra 8%', rate: 8, direction: 'output', account_code: '33311', report_group: '8' },
  { code: 'R10', name: 'Thuế GTGT đầu ra 10%', rate: 10, direction: 'output', account_code: '33311', report_group: '10' },
  { code: 'V05', name: 'Thuế GTGT đầu vào 5%', rate: 5, direction: 'input', account_code: '1331', report_group: '5' },
  { code: 'V08', name: 'Thuế GTGT đầu vào 8%', rate: 8, direction: 'input', account_code: '1331', report_group: '8' },
  { code: 'V10', name: 'Thuế GTGT đầu vào 10%', rate: 10, direction: 'input', account_code: '1331', report_group: '10' },
  { code: 'V13K', name: 'Thuế GTGT đầu vào 0% (không chịu VAT)', rate: 0, direction: 'input', account_code: '1331', report_group: 'KCT' },
  { code: 'KKKN', name: 'HH, DV không phải kê khai, tính nộp VAT', rate: 0, direction: 'input', account_code: '1331', report_group: 'KKK' },
];

/** Lý do mặc định. flags.default = loại chứng từ dùng lý do này khi chứng từ không ghi lý do. */
const REASONS = [
  { code: 'XBA', name: 'Xuất bán hàng', kind: 'out', counter_account: '1311', revenue_account: null, expense_account: null, cashflow_code: '01', flags: { default: 'sale', giftCostToPromotion: false } },
  { code: 'XTA1.4', name: 'Xuất tặng, thưởng khách hàng', kind: 'out', counter_account: '1311', revenue_account: null, expense_account: '64184', cashflow_code: null, flags: { costAtSalePrice: true } },
  { code: 'NTH1', name: 'Nhập hàng bán bị trả lại', kind: 'in', counter_account: '1311', revenue_account: null, expense_account: null, cashflow_code: '01', flags: { default: 'sale_return' } },
  { code: 'TTBHK', name: 'Thu tiền bán hàng', kind: 'receipt', counter_account: '1311', revenue_account: null, expense_account: null, cashflow_code: '01', flags: { default: 'receipt' } },
  { code: 'NMH1', name: 'Nhập mua hàng', kind: 'in', counter_account: '3312', revenue_account: null, expense_account: null, cashflow_code: null, flags: { default: 'purchase' } },
  { code: 'XTR1', name: 'Xuất trả hàng nhà cung cấp', kind: 'out', counter_account: '3312', revenue_account: null, expense_account: null, cashflow_code: null, flags: { default: 'purchase_return', returnAtOpeningCost: true } },
  { code: 'XCKho', name: 'Xuất chuyển kho', kind: 'out', counter_account: null, revenue_account: null, expense_account: null, cashflow_code: null, flags: { default: 'transfer' } },
  { code: 'NDC', name: 'Nhập điều chỉnh tăng (kiểm kê thừa)', kind: 'in', counter_account: '3381', revenue_account: null, expense_account: null, cashflow_code: null, flags: { default: 'stock_adjustment:increase' } },
  { code: 'TDK', name: 'Tồn kho đầu kỳ', kind: 'in', counter_account: '999', revenue_account: null, expense_account: null, cashflow_code: null, flags: { default: 'stock_adjustment:opening' } },
  { code: 'XDC', name: 'Xuất điều chỉnh giảm (kiểm kê thiếu)', kind: 'out', counter_account: '1381', revenue_account: null, expense_account: null, cashflow_code: null, flags: { default: 'stock_adjustment:decrease' } },
  { code: 'CTIEN', name: 'Chuyển tiền giữa chi nhánh', kind: 'payment', counter_account: null, revenue_account: null, expense_account: null, cashflow_code: null, flags: { default: 'cash_transfer' } },
  { code: 'TTKH', name: 'Thu tiền khách hàng', kind: 'receipt', counter_account: '1311', revenue_account: null, expense_account: null, cashflow_code: '01', flags: { default: 'customer_payment' } },
  { code: 'TTNCC', name: 'Trả tiền nhà cung cấp', kind: 'payment', counter_account: '3312', revenue_account: null, expense_account: null, cashflow_code: '02', flags: { default: 'supplier_payment' } },
  // Bán cho chi nhánh khác: doanh thu nội bộ, giá vốn ghi theo giá bán và không tính vào đơn giá bình quân.
  { code: 'XCN', name: 'Xuất bán hàng chi nhánh khác', kind: 'out', counter_account: '13681', revenue_account: '51116', expense_account: '6326', cashflow_code: null, flags: { costAtSalePrice: true } },
];

const GROUPS = [
  { code: 'HH-BANLE', name: 'Hàng hoá bán lẻ', inventory_account: '1561', cogs_account: '6321', revenue_account: '51111', discount_account: '52111', sales_return_account: '52131', is_default: true },
];

const PAYMENT_METHODS = [
  { code: 'TM', name: 'Tiền mặt', account_code: '1111', is_receivable: false },
  { code: 'CK', name: 'Chuyển khoản', account_code: '11210005', is_receivable: false },
  { code: 'QR', name: 'Quét mã QR', account_code: '11210007', is_receivable: false },
  { code: 'POS', name: 'Quẹt thẻ (POS)', account_code: '11210006', is_receivable: false },
  { code: 'VOUCHER', name: 'Voucher', account_code: '13881', is_receivable: false },
  { code: 'CONGNO', name: 'Ghi công nợ', account_code: '1311', is_receivable: true },
  // Đối trừ: khách dùng khoản đã trả trước / tiền hàng trả lại để trả đơn → không có tiền vào, để nguyên trên công nợ.
  { code: 'DOI_TRU', name: 'Đối trừ công nợ', account_code: '1311', is_receivable: true },
];

const DEFAULTS: Record<string, string> = {
  receivable: '1311',
  cash: '1111',
  tax_output: '33311',
  tax_input: '1331',
  promotion_expense: '64184',
  internal_receivable: '13681',
  internal_payable: '33681',
  internal_receivable_goods: '13681',
  internal_payable_goods: '33681',
  internal_cogs: '6326',
  commission_debit: '6418',
  commission_credit: '33881',
  payable: '3312',
  goods_in_transit: '1579',
  stock_surplus: '3381',
  stock_shortage: '1381',
  cash_in_transit: '11319',
};

/** Nhóm đối tượng mặc định (giống migration 0022). */
const PARTNER_GROUPS: [string, string, string, string?][] = [
  ['KH-LE', 'Khách mua lẻ', 'customer'],
  ['KH-BUON', 'Khách mua buôn', 'customer'],
  ['NCC-HH', 'Nhà cung cấp hàng hoá', 'supplier'],
  ['NCC-TSDV', 'Nhà cung cấp tài sản, dịch vụ', 'supplier'],
  ['CHU-NHA', 'Chủ nhà, cho thuê mặt bằng', 'supplier'],
  ['NHAN-VIEN', 'Nhân viên', 'employee'],
  ['CQNN', 'Cơ quan nhà nước (thuế, bảo hiểm…)', 'other'],
  ['CQ-THUE', 'Cơ quan thuế', 'other', 'CQNN'],
  ['CQ-BHXH', 'Cơ quan bảo hiểm', 'other', 'CQNN'],
  ['NOI-BO', 'Nội bộ (chi nhánh, công ty liên quan)', 'internal'],
  ['GOP-VON', 'Thành viên góp vốn', 'other'],
];

/** Loại tài sản ngầm định (giống migration 0015). */
const ASSET_CATEGORIES = [
  { code: 'TS-NHA', name: 'Nhà cửa, vật kiến trúc', kind: 'fixed_asset', asset_account: '2111', depreciation_account: '2141', expense_account: '6424', useful_life_months: 300 },
  { code: 'TS-MAY', name: 'Máy móc, thiết bị', kind: 'fixed_asset', asset_account: '2112', depreciation_account: '2141', expense_account: '6424', useful_life_months: 60 },
  { code: 'TS-XE', name: 'Phương tiện vận tải, truyền dẫn', kind: 'fixed_asset', asset_account: '2113', depreciation_account: '2141', expense_account: '6424', useful_life_months: 72 },
  { code: 'TS-QL', name: 'Thiết bị, dụng cụ quản lý', kind: 'fixed_asset', asset_account: '2114', depreciation_account: '2141', expense_account: '6424', useful_life_months: 36 },
  { code: 'TS-KHAC', name: 'Tài sản cố định hữu hình khác', kind: 'fixed_asset', asset_account: '2118', depreciation_account: '2141', expense_account: '6424', useful_life_months: 60 },
  { code: 'TS-PM', name: 'Phần mềm', kind: 'fixed_asset', asset_account: '2135', depreciation_account: '2143', expense_account: '6424', useful_life_months: 36 },
  { code: 'CCDC', name: 'Công cụ dụng cụ phân bổ tới 12 tháng', kind: 'tool', asset_account: null, depreciation_account: '24218', expense_account: '64231', useful_life_months: 12 },
  { code: 'CCDC-DH', name: 'Công cụ dụng cụ phân bổ trên 12 tháng', kind: 'tool', asset_account: null, depreciation_account: '24228', expense_account: '64231', useful_life_months: 24 },
  { code: 'TRUOC', name: 'Chi phí trả trước (thuê nhà, bảo hiểm…)', kind: 'prepaid', asset_account: null, depreciation_account: '24218', expense_account: '64278', useful_life_months: 12 },
];

export async function seed(): Promise<void> {
  const tenantCode = process.env.SEED_TENANT_CODE ?? 'demo';
  const tenantName = process.env.SEED_TENANT_NAME ?? 'Công ty Demo';
  const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@ketoan.local').toLowerCase();
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@123';

  await db.transaction().execute(async (trx) => {
    // Đơn vị
    let tenant = await trx.selectFrom('tenants').select('id').where('code', '=', tenantCode).executeTakeFirst();
    if (!tenant) {
      tenant = await trx.insertInto('tenants').values({ code: tenantCode, name: tenantName, tax_code: null, address: null, phone: null }).returning('id').executeTakeFirstOrThrow();
      console.log(`+ Đơn vị ${tenantCode}`);
    }
    const tid = tenant.id;

    // Người dùng quản trị
    const user = await trx.selectFrom('users').select('id').where('tenant_id', '=', tid).where('email', '=', adminEmail).executeTakeFirst();
    if (!user) {
      await trx.insertInto('users').values({ tenant_id: tid, email: adminEmail, full_name: 'Quản trị', password_hash: await hashPassword(adminPassword), role: 'owner' }).execute();
      console.log(`+ Người dùng ${adminEmail} (mật khẩu: ${adminPassword} — hãy đổi)`);
    }

    // Khoá API tích hợp
    const fixedKey = process.env.SEED_API_KEY;
    const hasKey = await trx.selectFrom('api_keys').select('id').where('tenant_id', '=', tid).where('revoked_at', 'is', null).executeTakeFirst();
    if (fixedKey) {
      await trx
        .insertInto('api_keys')
        .values({ tenant_id: tid, name: 'Tích hợp hệ thống bán hàng', key_prefix: fixedKey.slice(0, 10), key_hash: hashApiKey(fixedKey), scopes: ['documents:write', 'reports:read', 'catalog:write'] })
        .onConflict((oc) => oc.column('key_hash').doNothing())
        .execute();
    } else if (!hasKey) {
      const k = generateApiKey();
      await trx.insertInto('api_keys').values({ tenant_id: tid, name: 'Tích hợp hệ thống bán hàng', key_prefix: k.prefix, key_hash: k.hash, scopes: ['documents:write', 'reports:read', 'catalog:write'] }).execute();
      console.log(`+ Khoá API (chỉ hiện một lần): ${k.key}`);
    }

    // Hệ thống tài khoản
    const accounts = parseCsv(await readFile(path.join(SEEDS_DIR, 'tai-khoan.csv'), 'utf8'));
    const levelOf = new Map<string, number>();
    const byCode = new Map(accounts.map((a) => [a.code!, a]));
    const level = (code: string): number => {
      if (levelOf.has(code)) return levelOf.get(code)!;
      const p = byCode.get(code)?.parent_code;
      const l = p && byCode.has(p) ? level(p) + 1 : 1;
      levelOf.set(code, l);
      return l;
    };
    for (const a of accounts) {
      await trx
        .insertInto('accounts')
        .values({
          tenant_id: tid,
          code: a.code!,
          name: a.name!,
          parent_code: a.parent_code || null,
          level: level(a.code!),
          normal_side: a.normal_side || 'debit',
          is_posting: a.is_posting !== '0',
          track_partner: flag(a.track_partner),
          track_cost_item: flag(a.track_cost_item),
          track_department: flag(a.track_department),
          track_contract: flag(a.track_contract),
          track_employee: flag(a.track_employee),
          track_cashflow: flag(a.track_cashflow),
          name_en: a.name_en || null,
          is_foreign_currency: flag(a.is_foreign_currency),
          track_product: flag(a.track_product),
          track_internal_debt: flag(a.track_internal_debt),
          is_vat: flag(a.is_vat),
          is_debt: flag(a.is_debt),
          is_loan: flag(a.is_loan),
          always_increase: flag(a.always_increase),
          is_ledger: flag(a.is_ledger),
          is_cost: flag(a.is_cost),
        })
        .onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing())
        .execute();
    }

    for (const t of TAX_CODES) {
      await trx.insertInto('tax_codes').values({ tenant_id: tid, ...t }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
    }
    for (const r of REASONS) {
      await trx.insertInto('posting_reasons').values({ tenant_id: tid, ...r, flags: JSON.stringify(r.flags) }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
    }
    const hasDefaultGroup = await trx.selectFrom('product_posting_groups').select('id').where('tenant_id', '=', tid).where('is_default', '=', true).executeTakeFirst();
    for (const g of GROUPS) {
      await trx
        .insertInto('product_posting_groups')
        .values({ tenant_id: tid, ...g, is_default: g.is_default && !hasDefaultGroup })
        .onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing())
        .execute();
    }
    for (const m of PAYMENT_METHODS) {
      await trx.insertInto('payment_methods').values({ tenant_id: tid, ...m }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
    }
    for (const [key, account_code] of Object.entries(DEFAULTS)) {
      await trx.insertInto('posting_defaults').values({ tenant_id: tid, key, account_code }).onConflict((oc) => oc.columns(['tenant_id', 'key']).doNothing()).execute();
    }

    const accountCodes = new Set(accounts.map((a) => a.code));
    for (const c of ASSET_CATEGORIES) {
      if ((c.asset_account && !accountCodes.has(c.asset_account)) || !accountCodes.has(c.depreciation_account) || !accountCodes.has(c.expense_account)) continue;
      await trx.insertInto('asset_categories').values({ tenant_id: tid, ...c }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
    }

    // Nhóm đối tượng mặc định (giống migration 0022).
    for (const [code, name] of [['PB001', 'Nhóm công cụ dụng cụ'], ['PB002', 'Nhóm chi phí']] as const) {
      await trx.insertInto('dimensions').values({ tenant_id: tid, kind: 'tool_group', code, name }).onConflict((oc) => oc.doNothing()).execute();
    }
    for (const [code, name, kind, parent] of PARTNER_GROUPS) {
      await trx.insertInto('partner_groups').values({ tenant_id: tid, code, name, kind, parent_code: parent ?? null }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
    }

    // Chi nhánh mẫu
    await trx.insertInto('branches').values({ tenant_id: tid, code: 'CN01', name: 'Chi nhánh 01' }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
    console.log(`✓ Đã khởi tạo dữ liệu cho đơn vị ${tenantCode} (${accounts.length} tài khoản)`);
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runMigrations()
    .then(() => seed())
    .then(() => closeDb())
    .catch(async (err) => {
      console.error('Seed lỗi:', err);
      await closeDb();
      process.exit(1);
    });
}
