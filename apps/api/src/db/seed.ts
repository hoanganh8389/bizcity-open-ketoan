// @bizcity-layer K kernel/seeds
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — cấu hình định khoản (thuế, lý do, nhóm hạch toán, hình thức TT, ngầm định) chuyển sang gói nền db/packs/vn-tt99-nen, cài bằng installPack baseline (S012-3b, Q012-1).
/**
 * Dữ liệu khởi tạo cho một đơn vị mới.
 *
 * Tạo (nếu chưa có): đơn vị, 2 bộ sổ, người dùng quản trị, khoá API, hệ thống tài khoản
 * (db/seeds/tai-khoan.csv), gói định khoản nền (db/packs/vn-tt99-nen.posting-pack.json: loại thuế, lý do,
 * nhóm hạch toán, hình thức thanh toán, tài khoản ngầm định — ghi nhận ở config_packs), một chi nhánh mẫu.
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
import { PACKS_DIR, SEEDS_DIR } from './paths.js';
import { installPack, parsePack } from '../modules/posting-config/pack.js';

/** Gói định khoản nền mọi đơn vị có (PHASE-012 S012-3b). */
export const BASE_PACK_FILE = 'vn-tt99-nen.posting-pack.json';


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

    // Cấu hình định khoản: gói nền, chế độ baseline = chỉ thêm mục thiếu, không ghi đè cấu hình người dùng đã sửa.
    const base = parsePack(JSON.parse(await readFile(path.join(PACKS_DIR, BASE_PACK_FILE), 'utf8')), BASE_PACK_FILE);
    const installed = await installPack(trx, tid, base, { actor: 'seed', baseline: true });
    const added = installed.items.filter((i) => i.action === 'add').length;
    if (added) console.log(`+ Gói định khoản ${base.id}@${base.version}: thêm ${added} mục`);

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
