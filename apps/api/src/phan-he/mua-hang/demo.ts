// @bizcity-layer D modules/mua-hang
/**
 * DỮ LIỆU TÌNH HUỐNG (db/seeds/mua-hang/*.json): 25 tình huống của tài liệu yêu cầu + ví dụ bổ sung (VD1–VD8) — nạp vào SỔ
 * THẬT của đơn vị đang đăng nhập để cả nhóm xem luồng như vận hành: thêm chi nhánh, nhà cung cấp, mặt hàng còn thiếu (mã đã
 * có trong danh mục thì giữ nguyên, dòng phiếu lấy tên theo danh mục); số dư đầu kỳ của NCC; chính sách; chứng từ — phiếu
 * đánh dấu đã duyệt được duyệt thật theo thứ tự ngày (ghi bút toán, công nợ, kho). Phải nhập mật khẩu nạp dữ liệu.
 * Đã nạp thì không nạp chồng: "Nạp lại" = xoá dữ liệu tình huống cũ rồi nạp. Xoá: bỏ duyệt (đảo bút toán) rồi xoá.
 */
import { readFile } from 'node:fs/promises';
import { sql } from 'kysely';
import path from 'node:path';
import type { PDoc, Policy } from '@ketoan/contracts/mua-hang';
import { db } from '../../db/client.js';
import { SEEDS_DIR } from '../../db/paths.js';
import type { AuthContext } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { voucherService } from '../../modules/vouchers/voucher.service.js';
import { documentService } from '../../modules/documents/document.service.js';
import { warehouseService } from '../../modules/warehouses/warehouse.routes.js';
import { loadSettings, resolveAccounts, saveSettings } from './analysis.js';
import { purchaseService } from './service.js';
import { policyInputSchema, savePolicy } from './store.js';
import { logEvents } from './log.js';
import { saveSupplierProducts, supplierProductSchema } from './gia-mua.js';

const read = async <T>(f: string): Promise<T> => JSON.parse(await readFile(path.join(SEEDS_DIR, 'mua-hang', f), 'utf8')) as T;

interface Master { partners: { code: string; name: string; taxCode?: string; group?: string; address?: string; phone?: string; openingDebt?: number }[]; branches: { code: string; name: string }[]; holidays: string[]; brandOpeningDebt: Record<string, Record<string, number>> }
interface SeedProduct { sku: string; name: string; unit: string; brandCode: string; groupCode?: string; industry?: string; taxCode: string; units?: { unit: string; ratio: number; isDefault?: boolean; isPurchaseDefault?: boolean }[] }
interface GiftOut { id: string; date: string; branchCode: string; sku: string; qty: number; program: string; ref: string; note: string; status?: 'draft' | 'approved' }

/** Trong cùng ngày: phiếu hàng trước, rồi đơn đặt, ứng trước, trả tiền, thưởng (đơn đặt phải có trước phiếu ứng trước gắn nó). */
const RANK = (k: string) => ({ order: 1, prepayment: 2, payment: 3, rebate: 4 } as Record<string, number>)[k] ?? 0;

/** Mật khẩu nạp / xoá dữ liệu tình huống (đổi bằng biến môi trường PURCHASE_SEED_PASSWORD). */
export function checkSeedPassword(password: string | undefined) {
  if ((password ?? '') !== (process.env.PURCHASE_SEED_PASSWORD || 'Thuy!@#')) throw Errors.forbidden('Sai mật khẩu nạp dữ liệu');
}

export async function seedDemo(auth: AuthContext, opts: { reset?: boolean } = {}) {
  if (opts.reset) await clearDemo(auth);
  const has = await db.selectFrom('purchase_documents').select('id').where('tenant_id', '=', auth.tenantId).where('is_demo', '=', true).limit(1).executeTakeFirst();
  if (has) throw Errors.conflict('Đã nạp dữ liệu tình huống — bấm "Nạp lại" để xoá bản cũ và nạp lại từ đầu');
  const [master, products, policies, docs, giftOuts] = await Promise.all([
    read<Master>('doi-tac.json'), read<SeedProduct[]>('san-pham.json'), read<Policy[]>('chinh-sach.json'), read<(PDoc & { id: string })[]>('chung-tu.json'), read<GiftOut[]>('xuat-qua.json'),
  ]);
  const supplierRows = await read<Record<string, unknown>[]>('gia-mua.json');
  // 1. Danh mục còn thiếu.
  for (const b of master.branches) await db.insertInto('branches').values({ tenant_id: auth.tenantId, code: b.code, name: b.name }).onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
  await ensureDemoWarehouses(auth);
  for (const p of master.partners) {
    await db.insertInto('partners').values({ tenant_id: auth.tenantId, code: p.code, name: p.name, kind: 'supplier', tax_code: p.taxCode ?? null, address: p.address ?? null, phone: p.phone ?? null })
      .onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
  }
  // Nhãn hàng của mặt hàng mẫu phải có trong danh mục nhãn (DM11) — dữ liệu nhất quán, chọn được ở hồ sơ NCC / phiếu.
  const BRAND_NAMES: Record<string, string> = { ANLENE: 'Anlene', TH: 'TH true MILK', VINAMILK: 'Vinamilk', NEWIS: 'Newis', SMARTKIDS: 'Smartkids', QUA: 'Quà khuyến mại' };
  for (const b of [...new Set(products.map((p) => p.brandCode).filter(Boolean))]) {
    const has = await db.selectFrom('item_classes').select('id').where('tenant_id', '=', auth.tenantId).where('kind', '=', 'brand').where('code', '=', b).executeTakeFirst();
    if (!has) await db.insertInto('item_classes').values({ tenant_id: auth.tenantId, kind: 'brand', code: b, name: BRAND_NAMES[b] ?? b }).execute();
  }
  for (const p of products) {
    // ĐVT nhiều cấp (Hộp / Lốc / Thùng) chỉ thêm khi mặt hàng chưa có ĐVT nào — không đụng ĐVT của danh mục thật.
    const hasUnits = await db.selectFrom('product_units').select('id').where('tenant_id', '=', auth.tenantId).where('sku', '=', p.sku).limit(1).executeTakeFirst();
    if (!hasUnits && p.units) for (const u of p.units) await db.insertInto('product_units').values({ tenant_id: auth.tenantId, sku: p.sku, unit: u.unit, ratio: String(u.ratio), is_default: Boolean(u.isDefault), is_purchase_default: Boolean(u.isPurchaseDefault) }).onConflict((oc) => oc.columns(['tenant_id', 'sku', 'unit']).doNothing()).execute();
    await db.insertInto('products').values({ tenant_id: auth.tenantId, sku: p.sku, name: p.name, unit: p.unit, brand_code: p.brandCode, group_code: p.groupCode ?? null, industry_code: p.industry ?? null, tax_in_code: p.taxCode === 'KKKN' ? null : p.taxCode })
      .onConflict((oc) => oc.columns(['tenant_id', 'sku']).doNothing()).execute();
  }
  // Mã thuế đầu vào "không kê khai" cho hàng / quà không có hoá đơn VAT (hệ thống tài khoản chuẩn đã có; bản trống thì thêm).
  await db.insertInto('tax_codes').values({ tenant_id: auth.tenantId, code: 'KKKN', name: 'Không kê khai, nộp thuế GTGT', rate: '0', direction: 'input', account_code: null, report_group: 'KKKN' })
    .onConflict((oc) => oc.columns(['tenant_id', 'code']).doNothing()).execute();
  const settings = await loadSettings(db, auth.tenantId);
  await saveSettings(db, auth.tenantId, { ...settings, holidays: [...new Set([...settings.holidays, ...master.holidays])], brandOpening: { ...settings.brandOpening, ...master.brandOpeningDebt } });
  // 2. Số dư đầu kỳ công nợ NCC (30/09/2026). Dọn số dư mẫu còn sót của lượt nạp trước bị dừng giữa chừng — không bao giờ ghi trùng.
  await clearDemoOpenings(auth);
  const A = await resolveAccounts(db, auth.tenantId, await loadSettings(db, auth.tenantId));
  const balancing = (await db.selectFrom('accounts').select('code').where('tenant_id', '=', auth.tenantId).where('code', 'in', ['4211', '421', '911']).where('is_posting', '=', true).execute())[0]?.code;
  for (const p of master.partners.filter((x) => x.openingDebt)) {
    const branch = docs.find((d) => d.partnerCode === p.code)?.branchCode ?? master.branches[0]!.code;
    await voucherService.createOpening(auth, { branchCode: branch, docDate: '2026-09-30', description: `Số dư đầu kỳ phải trả ${p.name} (dữ liệu mẫu)`, balancingAccount: balancing, lines: [{ accountCode: A.payable, partnerCode: p.code, debit: 0, credit: p.openingDebt! }] });
  }
  // 3. Chính sách. Mã đã có (người dùng tự tạo, ví dụ NC100227-HANMUC) thì GIỮ chính sách đang có, bỏ qua mẫu; lỗi từng chính
  // sách ghi vào báo cáo, không dừng cả lượt nạp.
  const report: { docNo: string; status: string; error?: string }[] = [];
  const takenCodes = new Set((await db.selectFrom('purchase_policies').select('code').where('tenant_id', '=', auth.tenantId).execute()).map((r) => r.code));
  for (const p of policies) {
    if (takenCodes.has(p.code)) { report.push({ docNo: p.code, status: 'skipped', error: `Giữ chính sách ${p.code} đang có của đơn vị (không ghi đè bằng dữ liệu mẫu)` }); continue; }
    try { await db.transaction().execute((trx) => savePolicy(trx, auth.tenantId, auth.actorName, policyInputSchema.parse({ ...p, validFrom: p.validFrom ?? null, validTo: p.validTo ?? null }), undefined, true)); }
    catch (e) { report.push({ docNo: p.code, status: 'error', error: (e as Error).message }); }
  }
  // 3b. Mặt hàng & giá mua của NCC (giá cố định theo ĐVT, mã NCC giao). Dòng lỗi (ĐVT không có ở mặt hàng thật…) ghi báo cáo.
  // NCC × mã × ĐVT người dùng đã tự khai giá (không phải dữ liệu mẫu) → GIỮ giá của người dùng, bỏ qua giá mẫu (không sinh dòng trùng).
  const ownPrices = new Set((await db.selectFrom('supplier_products').select(['partner_code', 'sku', 'unit']).where('tenant_id', '=', auth.tenantId).where('is_demo', '=', false).execute())
    .map((x) => `${x.partner_code ?? ''}|${x.sku}|${x.unit.toLowerCase()}`));
  for (const r of supplierRows) {
    if (ownPrices.has(`${String(r.partnerCode ?? '')}|${String(r.sku)}|${String(r.unit).toLowerCase()}`)) { report.push({ docNo: `${String(r.partnerCode ?? 'giá chung')} ${String(r.sku)}`, status: 'skipped', error: `Giữ giá ${String(r.sku)} / ${String(r.unit)} đơn vị đã tự khai (không thêm giá mẫu trùng)` }); continue; }
    try { await db.transaction().execute((trx) => saveSupplierProducts(trx, auth.tenantId, auth.actorName, [supplierProductSchema.parse(r)], true)); }
    catch (e) { report.push({ docNo: `${String(r.partnerCode ?? 'giá chung')} ${String(r.sku)}`, status: 'skipped', error: `Bỏ qua giá mẫu: ${(e as Error).message}` }); }
  }
  // 4. Chứng từ: lưu theo ngày; phiếu mẫu đã duyệt → duyệt thật, chờ duyệt → gửi duyệt.
  const all = [...docs, ...giftOuts.map((g): PDoc & { id: string } => ({
    id: g.id, kind: 'gift_out', status: g.status ?? 'approved', docNo: '', docDate: g.date, branchCode: g.branchCode, partnerCode: docs.find((d) => d.lines.some((l) => l.sku === g.sku))?.partnerCode ?? 'NCC-QUATANG', priceIncludesVat: false,
    lines: [{ lineKey: 'x1', sku: g.sku, name: products.find((p) => p.sku === g.sku)?.name ?? g.sku, unit: products.find((p) => p.sku === g.sku)?.unit ?? '', qty: g.qty, price: 0, taxCode: 'KKKN', lineType: 'gift_consumer', program: g.program || undefined }],
    note: `${g.note} — ${g.ref}`,
  }))].sort((a, b) => a.docDate.localeCompare(b.docDate) || RANK(a.kind) - RANK(b.kind));
  // Đúng quy trình: chứng từ gốc (đơn đặt của phiếu nhập, phiếu nhập của phiếu trả…) luôn nạp + duyệt TRƯỚC chứng từ gắn nó, kể cả cùng ngày.
  const byId = new Map(all.map((d) => [d.id, d]));
  const ordered: typeof all = [];
  const seen = new Set<string>();
  const visit = (d: (typeof all)[number]) => { if (seen.has(d.id)) return; seen.add(d.id); for (const r of d.refIds ?? []) { const x = byId.get(r); if (x) visit(x); } ordered.push(d); };
  all.forEach(visit);
  all.splice(0, all.length, ...ordered);
  // Mã đã có trong danh mục của đơn vị: dòng phiếu lấy đúng tên, ĐVT theo danh mục.
  const real = new Map((await db.selectFrom('products').select(['sku', 'name', 'unit']).where('tenant_id', '=', auth.tenantId).where('sku', 'in', [...new Set(all.flatMap((d) => d.lines.map((l) => l.sku)))].concat('')).execute()).map((p) => [p.sku, p]));
  for (const d of all) d.lines = d.lines.map((l) => (real.has(l.sku) ? { ...l, name: real.get(l.sku)!.name, unit: real.get(l.sku)!.unit || l.unit } : l));
  const idMap = new Map<string, string>();
  // Số phiếu mẫu trùng số phiếu thật của đơn vị → để phần mềm tự cấp số mới (không làm hỏng tình huống).
  const takenNos = new Set((await db.selectFrom('purchase_documents').select(['kind', 'doc_no']).where('tenant_id', '=', auth.tenantId).execute()).map((r) => `${r.kind}|${r.doc_no}`));
  for (const d of all) if (d.docNo && takenNos.has(`${d.kind}|${d.docNo}`)) d.docNo = '';
  for (const d of all) {
    const input = { ...d, id: undefined, docNo: d.docNo, refIds: (d.refIds ?? []).map((r) => idMap.get(r)).filter(Boolean) as string[] };
    try {
      const saved = await purchaseService.save(auth, input);
      idMap.set(d.id, saved.id);
      await db.updateTable('purchase_documents').set({ is_demo: true }).where('id', '=', saved.id).execute();
      if (d.status === 'approved') await purchaseService.approve(auth, saved.id);
      else if (d.status === 'pending_approval') await purchaseService.submit(auth, saved.id);
      report.push({ docNo: saved.docNo, status: d.status });
    } catch (e) {
      report.push({ docNo: d.docNo || d.id, status: 'error', error: (e as Error).message });
    }
  }
  await logEvents(auth.tenantId, [{ event: 'demo_seeded', docNo: '', user: auth.actorName, data: { documents: report.length, errors: report.filter((r) => r.status === 'error').length } }]);
  const docReport = report.filter((r) => r.status !== 'skipped' && !policies.some((p) => p.code === r.docNo));
  return { documents: docReport.length, errors: report.filter((r) => r.status === 'error'), skipped: report.filter((r) => r.status === 'skipped'), report };
}

export async function clearDemo(auth: AuthContext) {
  const rows = await db.selectFrom('purchase_documents').select(['id', 'status', 'doc_date']).where('tenant_id', '=', auth.tenantId).where('is_demo', '=', true).orderBy('doc_date', 'desc').orderBy('id', 'desc').execute();
  let unposted = 0;
  for (const r of rows) {
    if (r.status !== 'approved') continue;
    const d = await purchaseService.get(auth, String(r.id));
    for (const l of [...d.doc.links].reverse()) await documentService.cancel(auth, l.docKey, 'Xoá dữ liệu mẫu mua hàng');
    unposted++;
  }
  await clearDemoOpenings(auth);
  await db.deleteFrom('purchase_documents').where('tenant_id', '=', auth.tenantId).where('is_demo', '=', true).execute();
  await db.deleteFrom('purchase_policies').where('tenant_id', '=', auth.tenantId).where('is_demo', '=', true).execute();
  await db.deleteFrom('supplier_products').where('tenant_id', '=', auth.tenantId).where('is_demo', '=', true).execute();
  await logEvents(auth.tenantId, [{ event: 'demo_cleared', docNo: '', user: auth.actorName, data: { documents: rows.length, unposted } }]);
  return { documents: rows.length, unposted };
}

/**
 * Kho mặc định cho các chi nhánh mẫu (CN-NA, CN-ND, CN-PT, CN-HCM) — chưa có kho thì thêm "<mã CN>-HH · Kho hàng".
 * Phiếu mẫu không ghi mã kho → báo cáo / danh sách tự tính vào kho mặc định này: lọc được theo kho, không phải sửa phiếu.
 * Chi nhánh đã có kho mặc định thì giữ nguyên. Chạy được nhiều lần (không thêm trùng).
 */
export async function ensureDemoWarehouses(auth: AuthContext) {
  const { branches } = await read<Master>('doi-tac.json');
  // Cả chi nhánh của bộ 25 trường hợp theo Google Sheet (db/seeds/mua-hang-25th — CN01…), nạp bằng scripts/nap-25-truong-hop.sh.
  const sheet = await readFile(path.join(SEEDS_DIR, 'mua-hang-25th', 'kich-ban.json'), 'utf8')
    .then((t) => (JSON.parse(t) as { chuanBi: { op: string; code?: string }[] }).chuanBi.filter((s) => s.op === 'chi-nhanh' && s.code).map((s) => s.code!))
    .catch(() => [] as string[]);
  const codes = [...new Set([...branches.map((b) => b.code), ...sheet])];
  const rows = await db.selectFrom('branches').select(['id', 'code']).where('tenant_id', '=', auth.tenantId).where('code', 'in', codes).execute();
  const created: string[] = [];
  for (const b of rows) {
    const has = await db.selectFrom('warehouses').select('code').where('tenant_id', '=', auth.tenantId).where('branch_id', '=', b.id).where('is_default', '=', true).executeTakeFirst();
    if (has) continue;
    const code = `${b.code}-HH`;
    // Thêm qua service danh mục kho của lõi (kiểm chi nhánh, ghi nhật ký) — phân hệ không ghi thẳng bảng lõi (R-BOUND-2, A-17).
    const taken = await db.selectFrom('warehouses').select('code').where('tenant_id', '=', auth.tenantId).where('code', '=', code).executeTakeFirst();
    if (taken) continue;
    await warehouseService.create(auth, {
      code, branchCode: b.code, name: 'Kho hàng', address: '', isActive: true, isDefault: true, isPromo: false, account: '',
      note: 'Kho mặc định của chi nhánh mẫu (dữ liệu tình huống mua hàng)',
    });
    created.push(code);
  }
  if (created.length) await logEvents(auth.tenantId, [{ event: 'demo_warehouses', docNo: '', user: auth.actorName, data: { created } }]);
  return { created, branches: rows.map((b) => b.code) };
}

/** Huỷ (đảo bút toán) các số dư đầu kỳ mẫu còn hiệu lực — nhận biết bằng diễn giải "(dữ liệu mẫu)". */
async function clearDemoOpenings(auth: AuthContext) {
  const openings = await db.selectFrom('accounting_events').select('doc_key').where('tenant_id', '=', auth.tenantId).where('status', '<>', 'cancelled')
    .where(sql<boolean>`payload::text LIKE '%(dữ liệu mẫu)%'`).execute();
  for (const o of openings) await documentService.cancel(auth, o.doc_key, 'Xoá dữ liệu mẫu mua hàng').catch(() => undefined);
}
