// [2026-11-09 10:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-18 (Q004-8, review R1 RV-R1-07): đo lệch tài khoản mặc định giữa resolveAccounts của mua hàng và AccountResolver / cấu hình hạch toán của Kernel. CHỈ ĐỌC.
// =============================================================================
// ĐO LỆCH TÀI KHOẢN MẶC ĐỊNH: mua hàng (resolveAccounts) so với Kernel (cấu hình hạch toán)
//
// Vì sao: mua hàng có bộ phân giải tài khoản riêng cho 8 vai trò (apps/api/src/phan-he/mua-hang/analysis.ts, resolveAccounts) với thứ tự
//   cài đặt module → bảng Kernel → SỐ VIẾT CỨNG. Kernel (AccountResolver) KHÔNG có số dự phòng, thiếu thì báo lỗi. Hai nguồn sự thật cho
//   cùng một ý "tài khoản mặc định" có thể lệch; bắt module lấy từ Kernel là K2 nếu lệch, K1 nếu không (RULE-KERNEL). Script này đo xem lệch hay không,
//   CHƯA đổi mã sản phẩm. Chữ chốt: docs/phases/PHASE-004-MOT-CUA-GHI-SO/21-CHOT-VET-E2-CSDL-VA-E1.md §5.
//
// Chạy (CHỈ ĐỌC, giao dịch READ ONLY, không ghi gì):
//   DATABASE_URL=postgres://… npx tsx --conditions=development scripts/mua-hang/do-lech-tai-khoan.mjs [--tenant=<mã>] [--out=<tệp.md>] [--json]
//   Không truyền --tenant: đo mọi đơn vị. Nên chạy trên BẢN SAO ẨN DANH của dữ liệu thật (R-REV-11: không chạy công cụ trên sổ đang dùng).
//
// Cách phân loại từng vai trò (cột "Kết quả"):
//   KHỚP        module và Kernel cho cùng tài khoản
//   LỆCH        cả hai có giá trị, khác nhau  → cần kế toán trưởng chọn (K2)
//   CHỈ MODULE  Kernel không có nguồn cho vai trò này (không có khoá tài khoản ngầm định tương ứng) → cần khai ở Kernel trước khi gom (K1 + cấu hình)
//   CHỈ KERNEL  module không ra giá trị (hiếm)
//   Cột "Gốc của giá trị module": cai-dat (cài đặt module) | bang-kernel (lấy từ bảng Kernel) | so-cung (SỐ VIẾT CỨNG dự phòng)
// =============================================================================
import { writeFile } from 'node:fs/promises';
import { sql } from 'kysely';
import { db, closeDb } from '../../apps/api/src/db/client.js';
import { loadSettings, resolveAccounts } from '../../apps/api/src/phan-he/mua-hang/analysis.js';
import { postingConfigRepository } from '../../packages/kernel/src/modules/posting-config/posting-config.repository.js';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const ONLY = arg('tenant');
const OUT = arg('out');
const AS_JSON = process.argv.includes('--json');

/** 8 vai trò của resolveAccounts → nguồn tương ứng ở Kernel (chỉ để so sánh). null = Kernel không có nguồn. */
const ROLES = [
  { role: 'stock', label: 'Hàng tồn kho', kernel: 'nhóm hạch toán mặc định.inventory_account (thực tế Kernel theo TỪNG nhóm hàng, module dùng MỘT tài khoản)' },
  { role: 'vatIn', label: 'Thuế GTGT đầu vào', kernel: "tài khoản ngầm định 'tax_input', hoặc loại thuế đầu vào.account_code" },
  { role: 'payable', label: 'Phải trả nhà cung cấp', kernel: "lý do mặc định 'purchase'.counter_account, hoặc tài khoản ngầm định 'payable'" },
  { role: 'cash', label: 'Tiền mặt', kernel: "hình thức thanh toán TM (không phải phải thu).account_code, hoặc tài khoản ngầm định 'cash'" },
  { role: 'bank', label: 'Tiền gửi ngân hàng', kernel: 'hình thức thanh toán CK / NH (không phải phải thu).account_code' },
  { role: 'giftIncome', label: 'Thu nhập khác (quà tặng)', kernel: null },
  { role: 'giftExpense', label: 'Chi phí hàng khuyến mãi', kernel: "tài khoản ngầm định 'promotion_expense'" },
  { role: 'finIncome', label: 'Thu nhập tài chính (chiết khấu thanh toán)', kernel: null },
];

const norm = (v) => (v == null || v === '' ? null : String(v));

/** Giá trị Kernel cho một vai trò, đọc từ cấu hình hạch toán đang dùng (chỉ đọc). */
function kernelValue(role, cfg) {
  const d = (k) => norm(cfg.defaults.get(k));
  const method = (codes, prefix) => {
    const ms = [...cfg.paymentMethods.values()].filter((m) => !m.is_receivable);
    return norm((ms.find((m) => codes.includes(m.code)) ?? ms.find((m) => String(m.account_code).startsWith(prefix)))?.account_code);
  };
  switch (role) {
    case 'stock': return norm(cfg.defaultGroup?.inventory_account);
    case 'vatIn': {
      const t = [...cfg.taxCodes.values()].find((x) => x.direction === 'input' && x.accountCode);
      return d('tax_input') ?? norm(t?.accountCode);
    }
    case 'payable': {
      const r = [...cfg.reasons.values()].find((x) => (x.flags ?? {}).default === 'purchase');
      return norm(r?.counter_account) ?? d('payable');
    }
    case 'cash': return method(['TM'], '111') ?? d('cash');
    case 'bank': return method(['CK', 'NH'], '112');
    case 'giftExpense': return d('promotion_expense');
    default: return null; // giftIncome, finIncome: Kernel không có khoá tương ứng
  }
}

/** Gốc của giá trị module: theo đúng thứ tự trong resolveAccounts. */
function moduleOrigin(role, modVal, settings, kernelVal) {
  if (norm(settings.accounts?.[role])) return 'cai-dat';
  if (kernelVal && norm(modVal) === kernelVal) return 'bang-kernel';
  return 'so-cung';
}

function classify(modVal, kerVal) {
  if (modVal && kerVal) return modVal === kerVal ? 'KHỚP' : 'LỆCH';
  if (modVal && !kerVal) return 'CHỈ MODULE';
  if (!modVal && kerVal) return 'CHỈ KERNEL';
  return 'KHÔNG CÓ';
}

async function measure(tenant) {
  return db.transaction().execute(async (trx) => {
    await sql`SET TRANSACTION READ ONLY`.execute(trx);
    const settings = await loadSettings(trx, tenant.id);
    const mod = await resolveAccounts(trx, tenant.id, settings);
    const cfg = await postingConfigRepository.loadPostingConfig(trx, tenant.id, [], {});
    const rows = ROLES.map((r) => {
      const modVal = norm(mod[r.role]);
      const kerVal = kernelValue(r.role, cfg);
      return { role: r.role, label: r.label, kernelSource: r.kernel, module: modVal, kernel: kerVal, origin: moduleOrigin(r.role, modVal, settings, kerVal), result: classify(modVal, kerVal) };
    });
    return { tenant: tenant.code, rows };
  });
}

const tenants = await db.selectFrom('tenants').select(['id', 'code']).$if(Boolean(ONLY), (q) => q.where('code', '=', ONLY)).orderBy('id').execute();
if (!tenants.length) { console.error(ONLY ? `Không có đơn vị mã "${ONLY}"` : 'Không có đơn vị nào'); await closeDb(); process.exit(2); }

const results = [];
for (const t of tenants) results.push(await measure(t));

if (AS_JSON) {
  console.log(JSON.stringify(results, null, 2));
} else {
  const lines = [];
  const tally = { 'KHỚP': 0, 'LỆCH': 0, 'CHỈ MODULE': 0, 'CHỈ KERNEL': 0, 'KHÔNG CÓ': 0 };
  const hard = { 'so-cung': 0 };
  for (const r of results) {
    lines.push(`### Đơn vị \`${r.tenant}\``, '', '| Vai trò | Module | Kernel | Gốc của giá trị module | Kết quả |', '|---|---|---|---|---|');
    for (const x of r.rows) {
      tally[x.result] += 1;
      if (x.origin === 'so-cung') hard['so-cung'] += 1;
      lines.push(`| ${x.label} (\`${x.role}\`) | ${x.module ?? '—'} | ${x.kernel ?? '—'} | ${x.origin} | **${x.result}** |`);
    }
    lines.push('');
  }
  const summary = [`Tổng ${results.length} đơn vị × ${ROLES.length} vai trò = ${results.length * ROLES.length} phép so.`,
    ...Object.entries(tally).filter(([, n]) => n).map(([k, n]) => `- ${k}: ${n}`), `- Giá trị module lấy từ SỐ VIẾT CỨNG: ${hard['so-cung']}`].join('\n');
  const md = ['## Kết quả đo', '', summary, '', ...lines].join('\n');
  console.log(md);
  if (OUT) await writeFile(OUT, `${md}\n`, 'utf8');
}
await closeDb();
