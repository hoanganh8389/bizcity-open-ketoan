// @bizcity-layer D modules/mua-hang
/**
 * PHÂN TÍCH một chứng từ mua hàng bằng SỐ LIỆU THẬT: bộ máy tính dùng chung ('@ketoan/contracts/mua-hang') + dữ liệu sổ.
 *   - Nợ NCC hiện tại   = công nợ theo chứng từ trên tài khoản 331* tới ngày phiếu (debt_items: ghi Có − ghi Nợ).
 *   - Đang chờ          = phiếu mua chờ duyệt + đơn đặt đã duyệt chưa nhận hàng.
 *   - Nợ nhãn tại CN    = số dư đầu khai ở cài đặt + phần CHƯA TRẢ của các phiếu nhập đã duyệt của nhãn tại chi nhánh.
 *   - Lịch sử giá       = phiếu nhập của phân hệ + hàng nhập mua từ nguồn khác (biến động kho loại purchase).
 *   - Ứng trước         = phần chưa đối trừ của phiếu ứng trước gắn cùng đơn đặt.
 *   - Tài khoản         = tài khoản thật của đơn vị (cài đặt mua hàng, không khai thì chọn theo hệ thống tài khoản).
 */
import { sql } from 'kysely';
import {
  ACC, brandMix, brandShare, checkDoc, codeSwaps, computeDoc, creditStatus, docBrand, fefoCheck, findPolicy, orderProgress, postingFor, ratioIn, receiptsOfOrder, scheduleStatus, type OrderLineProgress,
  type Accounts, type Check, type CreditStatus, type ProductUnit, type SupplierProduct, type DocCalc, type Entry, type PDoc, type Policy, type PriceRow, type Product,
} from '@ketoan/contracts/mua-hang';
import { toNumber, type Db } from '../../db/client.js';
import { FREEZE_KINDS, FREEZE_VERSION, freezeOf, listPolicies, noDueDate, receiptsWithSku, toDoc, type StoredDoc } from './store.js';
import { listSupplierProducts, unitsOf } from './gia-mua.js';
import { invoiceCheck } from './hoa-don.js';

export interface PurchaseSettings { holidays: string[]; brandOpening: Record<string, Record<string, number>>; accounts: Partial<Accounts>; warnDays: number; /** Đơn giá lệch quá % này so với giá NCC / lần nhập trước thì cảnh báo (một mức cho cả đơn vị). */ priceWarnPct: number;
  /** Phiếu nhập mua bắt buộc lập từ đơn đặt đã duyệt (bật: chặn duyệt phiếu nhập không theo đơn; tắt: chỉ cảnh báo). */
  requireOrder: boolean;
  /** Đuôi mã biến thể tách riêng khi phân tích đặt hàng (MH26) — lưu riêng qua /purchase/variants, MH12 lưu giữ nguyên. */
  variantSeparate?: string[] }

export async function loadSettings(trx: Db, tenantId: string): Promise<PurchaseSettings> {
  const t = await trx.selectFrom('tenants').select('settings').where('id', '=', tenantId).executeTakeFirst();
  const p = ((t?.settings ?? {}) as Record<string, any>).purchase ?? {};
  return { holidays: p.holidays ?? [], brandOpening: p.brandOpening ?? {}, accounts: p.accounts ?? {}, warnDays: Number(p.warnDays ?? 3), priceWarnPct: Number(p.priceWarnPct ?? 2), requireOrder: Boolean(p.requireOrder), ...(Array.isArray(p.variantSeparate) ? { variantSeparate: p.variantSeparate } : {}) };
}

export async function saveSettings(trx: Db, tenantId: string, s: PurchaseSettings): Promise<void> {
  await sql`UPDATE tenants SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{purchase}', ${JSON.stringify(s)}::jsonb) WHERE id = ${tenantId}`.execute(trx);
}

/** Tài khoản dùng khi ghi sổ / xem trước: cài đặt → lý do mặc định → tài khoản chi tiết đầu tiên có trong hệ thống tài khoản. */
export async function resolveAccounts(trx: Db, tenantId: string, s: PurchaseSettings): Promise<Accounts> {
  const rows = await trx.selectFrom('accounts').select(['code', 'is_posting']).where('tenant_id', '=', tenantId).execute();
  const posting = new Set(rows.filter((r) => r.is_posting).map((r) => r.code));
  const sorted = [...posting].sort();
  /** Ứng viên đầu tiên là tài khoản chi tiết; không có thì tài khoản chi tiết đầu tiên mang tiền tố của ứng viên cuối. */
  const pick = (...c: string[]) => c.find((x) => posting.has(x)) ?? sorted.find((x) => x.startsWith(c[c.length - 1]!)) ?? c[c.length - 1]!;
  // Tài khoản tiền: theo hình thức thanh toán tiền mặt (TM) / chuyển khoản (CK) đã khai.
  const methods = await trx.selectFrom('payment_methods').select(['code', 'account_code', 'is_receivable']).where('tenant_id', '=', tenantId).where('is_active', '=', true).execute();
  const methodAcc = (prefix: string, codes: string[]) => methods.find((m) => codes.includes(m.code) && !m.is_receivable && posting.has(m.account_code))?.account_code
    ?? methods.find((m) => !m.is_receivable && m.account_code.startsWith(prefix) && posting.has(m.account_code))?.account_code;
  const reason = await trx.selectFrom('posting_reasons').select(['counter_account', 'flags']).where('tenant_id', '=', tenantId).where('is_active', '=', true).execute();
  const purchase = reason.find((r) => (r.flags as Record<string, unknown>)?.default === 'purchase')?.counter_account;
  return {
    stock: s.accounts.stock ?? pick('1561', '156'),
    vatIn: s.accounts.vatIn ?? pick('1331', '133'),
    payable: s.accounts.payable ?? purchase ?? pick('3312', '33111', '3311', '331'),
    cash: s.accounts.cash ?? methodAcc('111', ['TM']) ?? pick('1111', '111'),
    bank: s.accounts.bank ?? methodAcc('112', ['CK', 'NH']) ?? pick('1121', '112'),
    giftIncome: s.accounts.giftIncome ?? pick('71153', '7118', '711'),
    giftExpense: s.accounts.giftExpense ?? pick('64184', '64188', '6418', '6428'),
    finIncome: s.accounts.finIncome ?? pick('5152', '5158', '515'),
  };
}

/**
 * Nhãn hàng chỉ khai ở danh mục mặt hàng: ghi nhãn của mặt hàng vào từng dòng, nhãn phiếu = nhãn chiếm giá trị lớn nhất.
 * Phiếu không có dòng hàng (thưởng / chi phí theo nhãn) giữ nhãn gửi lên (lấy từ chính sách).
 */
export async function withBrands<T extends Pick<PDoc, 'lines' | 'brandCode'>>(trx: Db, tenantId: string, doc: T): Promise<T> {
  const skus = [...new Set(doc.lines.map((l) => l.sku).filter(Boolean))];
  if (!skus.length) return doc;
  const rows = await trx.selectFrom('products').select(['sku', 'brand_code']).where('tenant_id', '=', tenantId).where('sku', 'in', skus).execute();
  const map = new Map(rows.map((r) => [r.sku, r.brand_code ?? undefined]));
  const lines = doc.lines.map((l) => { const b = map.has(l.sku) ? map.get(l.sku) : l.brandCode; const { brandCode: _b, ...rest } = l; return b ? { ...rest, brandCode: b } : rest; });
  return { ...doc, lines, brandCode: docBrand(lines) ?? (lines.some((l) => l.lineType === 'buy') ? undefined : doc.brandCode) };
}

export async function loadProducts(trx: Db, tenantId: string, skus: string[]): Promise<Product[]> {
  if (!skus.length) return [];
  const rows = await trx.selectFrom('products').select(['sku', 'name', 'unit', 'brand_code', 'group_code', 'tax_in_code']).where('tenant_id', '=', tenantId).where('sku', 'in', [...new Set(skus)]).execute();
  return rows.map((r) => ({ sku: r.sku, name: r.name, unit: r.unit, brandCode: r.brand_code ?? '', groupCode: r.group_code ?? undefined, taxCode: r.tax_in_code ?? 'V08' }));
}

const evKeys = (d: StoredDoc) => d.links.map((l) => l.eventId).filter(Boolean);

/** Nợ phải trả NCC trên 331* tới ngày asOf (theo sổ), trừ các chứng từ kế toán của phiếu đang xét. */
export async function apBalance(trx: Db, tenantId: string, partnerCode: string, asOf: string, excludeEvents: string[] = []): Promise<number> {
  let q = trx.selectFrom('debt_items as i').innerJoin('partners as p', 'p.id', 'i.partner_id')
    .select(sql<string>`COALESCE(SUM(CASE WHEN i.side = 'credit' THEN i.amount ELSE -i.amount END), 0)`.as('bal'))
    .where('i.tenant_id', '=', tenantId).where('p.code', '=', partnerCode).where('i.account_code', 'like', '331%').where('i.doc_date', '<=', asOf);
  if (excludeEvents.length) q = q.where('i.event_id', 'not in', excludeEvents);
  return toNumber((await q.executeTakeFirst())?.bal ?? 0);
}

/** Nợ chưa trả theo nhãn: mỗi phiếu góp phần chưa trả × tỉ trọng của nhãn trong phiếu (phiếu nhiều nhãn chia đúng phần). */
export async function openOfBrand(trx: Db, tenantId: string, docs: StoredDoc[], brand: string): Promise<number> {
  const ds = docs.map((d) => ({ d, share: brandShare(d, brand) })).filter((x) => x.share > 0 && evKeys(x.d).length);
  if (!ds.length) return 0;
  const ids = ds.flatMap((x) => evKeys(x.d));
  const rows = await trx.selectFrom('debt_items').select(['event_id', sql<string>`SUM(CASE WHEN side = 'credit' THEN amount - settled_amount ELSE -(amount - settled_amount) END)`.as('open')])
    .where('tenant_id', '=', tenantId).where('event_id', 'in', ids).where('account_code', 'like', '331%').groupBy('event_id').execute();
  const byEv = new Map(rows.map((r) => [String(r.event_id), toNumber(r.open)]));
  return Math.round(ds.reduce((s, x) => s + evKeys(x.d).reduce((a, e) => a + (byEv.get(e) ?? 0), 0) * x.share, 0));
}

/** Phần chưa trả của các khoản công nợ (ghi Có) sinh từ các chứng từ kế toán cho trước. */
export async function openOf(trx: Db, tenantId: string, eventIds: string[]): Promise<number> {
  if (!eventIds.length) return 0;
  const r = await trx.selectFrom('debt_items').select(sql<string>`COALESCE(SUM(CASE WHEN side = 'credit' THEN amount - settled_amount ELSE -(amount - settled_amount) END), 0)`.as('open'))
    .where('tenant_id', '=', tenantId).where('event_id', 'in', eventIds).where('account_code', 'like', '331%').executeTakeFirst();
  return toNumber(r?.open ?? 0);
}

/** Đang chờ: phiếu chờ duyệt (nhập, đặt) + đơn đặt đã duyệt chưa có phiếu nhập đã duyệt. */
/** Phiếu nhập mua ngoài đơn: phiếu nhập có hàng mua mà không gắn đơn đặt nào. */
export function isOutsideOrder(doc: PDoc, refOrder?: unknown): boolean {
  return doc.kind === 'receipt' && !refOrder && doc.lines.some((l) => l.lineType === 'buy');
}

export function pendingOf(docs: StoredDoc[], filter: (d: StoredDoc) => boolean, asOf: string, self?: { id: string; refIds?: string[] }, weight: (d: StoredDoc) => number = () => 1): number {
  // Đơn đặt đã có phiếu nhập (đã duyệt hoặc đang chờ duyệt) hay chính phiếu đang xét lập từ đơn đó: tiền đã nằm ở phiếu nhập — không
  // tính thêm lần nữa (không thì phiếu nhập lập từ đơn bị cộng trùng: đơn + phiếu → báo vượt hạn mức sai).
  const received = new Set([...docs.filter((d) => d.kind === 'receipt' && (d.status === 'approved' || d.status === 'pending_approval')).flatMap((d) => d.refIds ?? []), ...(self?.refIds ?? [])]);
  return Math.round(docs.filter((d) => filter(d) && d.id !== self?.id && d.docDate <= asOf
    && ((d.status === 'pending_approval' && (d.kind === 'receipt' || d.kind === 'order')) || (d.kind === 'order' && d.status === 'approved' && !received.has(d.id))))
    .reduce((s, d) => s + d.totals.total * weight(d), 0));
}

/** Lịch sử giá mua của mã: phiếu nhập đã duyệt của phân hệ + hàng nhập mua từ nguồn khác (biến động kho), mới nhất trước. */
export async function priceHistory(trx: Db, tenantId: string, sku: string, before: string, excludeId?: string, limit = 5): Promise<(PriceRow & { discountPct?: number })[]> {
  // Phiếu nhập của phân hệ có mã này (chỉ mục GIN) + hàng nhập mua từ nguồn khác (biến động kho không thuộc phân hệ).
  const docs = await receiptsWithSku(trx, tenantId, sku, before, limit + 5);
  const own = docs.filter((d) => d.id !== excludeId).flatMap((d) => {
    const c = computeDoc(d, []);
    return c.lines.filter((l) => l.sku === sku && l.lineType === 'buy' && l.qty > 0).map((l) => ({
      date: d.docDate, partnerCode: d.partnerCode, docNo: d.docNo, unitPrice: l.price, includesVat: d.priceIncludesVat, unit: l.unit, qty: l.qty,
      discountPct: l.gross ? Math.round(((l.lineDiscount + l.orderDiscount) / l.gross) * 10000) / 100 : 0,
    }));
  });
  const q = trx.selectFrom('inventory_movements as m').innerJoin('accounting_events as e', 'e.id', 'm.event_id').leftJoin('partners as p', 'p.id', 'e.partner_id')
    .select(['m.doc_date', 'm.qty', 'm.amount', 'e.doc_no', 'p.code as partner_code'])
    .where('m.tenant_id', '=', tenantId).where('m.sku', '=', sku).where('m.kind', '=', 'purchase').where('m.is_gift', '=', false).where('m.qty', '>', '0').where('m.doc_date', '<=', before)
    .where('e.doc_key', 'not like', 'mh:%').orderBy('m.doc_date', 'desc').limit(limit);
  const other = (await q.execute()).filter((r) => toNumber(r.amount) > 0).map((r) => ({
    date: String(r.doc_date).slice(0, 10), partnerCode: r.partner_code ?? '', docNo: r.doc_no, unitPrice: Math.round(toNumber(r.amount) / toNumber(r.qty)), includesVat: false, qty: toNumber(r.qty),
  }));
  return [...own, ...other].sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
}

/** Ứng trước còn chưa đối trừ của các đơn đặt mà phiếu nhập giao theo (khoản ghi Nợ 331 của phiếu ứng trước). */
export async function prepaymentFor(trx: Db, tenantId: string, doc: PDoc, docs: StoredDoc[]): Promise<{ amount: number; eventIds: string[] }> {
  const refs = new Set(doc.refIds ?? []);
  if (!refs.size) return { amount: 0, eventIds: [] };
  const pre = docs.filter((d) => d.kind === 'prepayment' && d.status === 'approved' && (d.refIds ?? []).some((r) => refs.has(r)));
  const eventIds = pre.flatMap(evKeys);
  return { amount: eventIds.length ? -(await openOf(trx, tenantId, eventIds)) : 0, eventIds };
}

export interface Analysis { prices: SupplierProduct[]; units: Record<string, ProductUnit[]>; calc: DocCalc; checks: Check[]; credit: CreditStatus[]; entries: Entry[]; blocking: Check[]; prepayment: number; refOrder?: StoredDoc; priceHistory: Record<string, (PriceRow & { discountPct?: number })[]>; accounts: Accounts; priceWarnPct: number }

export interface Ctx { settings: PurchaseSettings; accounts: Accounts; policies: Policy[]; docs: StoredDoc[] }
/** opts.full: mọi loại chính sách (báo cáo, hồ sơ NCC, đề xuất đặt hàng); mặc định bỏ loại nhân theo mã hàng (tính phiếu). */
export async function loadCtx(trx: Db, tenantId: string, docs: StoredDoc[], opts: { full?: boolean } = {}): Promise<Ctx> {
  const settings = await loadSettings(trx, tenantId);
  return { settings, accounts: await resolveAccounts(trx, tenantId, settings), policies: await listPolicies(trx, tenantId), docs };
}

/**
 * Phiếu nhập / trả / đổi ĐÃ DUYỆT chưa chốt (hoặc chốt bản cũ hơn FREEZE_VERSION): chốt chiết khấu tự áp theo chính sách
 * hiện hành. Chỉ chốt khi tính lại ra đúng tổng đã lưu (chính sách chưa đổi từ lúc lập phiếu); lệch thì giữ nguyên (bản chốt cũ
 * nếu có), trả số phiếu để xem tay. Chạy lại an toàn. Gọi từ job cơ sở dữ liệu (db/setup.ts).
 */
export async function freezeApproved(trx: Db): Promise<{ frozen: number; skipped: string[] }> {
  const rows = await trx.selectFrom('purchase_documents').selectAll().where('status', '=', 'approved').where('kind', 'in', [...FREEZE_KINDS])
    .where(sql<boolean>`coalesce(data->'frozen'->>'v', '') <> ${String(FREEZE_VERSION)}`).execute();
  const out = { frozen: 0, skipped: [] as string[] };
  const byTenant = new Map<string, typeof rows>();
  for (const r of rows) byTenant.set(r.tenant_id, [...(byTenant.get(r.tenant_id) ?? []), r]);
  for (const [tenantId, list] of byTenant) {
    const policies = await listPolicies(trx, tenantId);
    const { holidays } = await loadSettings(trx, tenantId);
    for (const r of list) {
      const d = toDoc({ ...r, data: { ...(r.data as Record<string, unknown>), frozen: undefined } });
      if (!d.lines.length) continue;
      const calc = computeDoc(d, policies, { holidays });
      if (Math.abs(calc.payable - d.totals.total) > 1) { out.skipped.push(d.docNo); continue; }
      await trx.updateTable('purchase_documents').set({ data: sql`data || jsonb_build_object('frozen', ${JSON.stringify(freezeOf(d, calc, policies))}::jsonb)` }).where('id', '=', r.id).execute();
      out.frozen++;
    }
  }
  return out;
}

const GOODS = ['order', 'receipt', 'return', 'exchange', 'gift_in', 'gift_out'];

export async function analyze(trx: Db, tenantId: string, doc: PDoc, ctx: Ctx): Promise<Analysis> {
  const { policies, docs, settings, accounts } = ctx;
  const calc = computeDoc(doc, policies, { holidays: settings.holidays });
  const self = docs.find((d) => d.id === doc.id);
  const selfEvents = self ? evKeys(self) : [];
  const credit: CreditStatus[] = [];
  const affectsDebt = doc.kind === 'receipt' || doc.kind === 'order' || (doc.kind === 'exchange' && calc.payable > 0);
  if (affectsDebt && doc.partnerCode) {
    // Hạn mức theo NCC: chỉ chính sách đang bật VÀ còn hiệu lực ở ngày phiếu (từ / đến), như hạn mức theo nhãn bên dưới.
    let pp = findPolicy(policies.filter((p) => p.scope.partnerCode === doc.partnerCode && !p.scope.brandCode), 'credit_limit', { date: doc.docDate, partnerCode: doc.partnerCode, branchCode: doc.branchCode });
    const partner = await trx.selectFrom('partners').select(['credit_limit', 'name']).where('tenant_id', '=', tenantId).where('code', '=', doc.partnerCode).executeTakeFirst();
    if (!pp) {
      // Không khai chính sách: dùng hạn mức ở danh mục đối tượng (DM13) nếu có.
      if (partner?.credit_limit && toNumber(partner.credit_limit) > 0) pp = { id: 'dm13', code: 'DM13', kind: 'credit_limit', name: 'Hạn mức ở danh mục đối tượng', scope: { partnerCode: doc.partnerCode }, isActive: true, rule: { limit: toNumber(partner.credit_limit), warnPct: 90 } };
    }
    const cs = creditStatus(pp, await apBalance(trx, tenantId, doc.partnerCode, doc.docDate, selfEvents), pendingOf(docs, (d) => d.partnerCode === doc.partnerCode, doc.docDate, doc), calc.payable);
    if (cs) credit.push({ ...cs, scope: `NCC ${partner?.name || doc.partnerCode}` });
    // Hạn mức toàn nhãn phân bổ chi nhánh: mỗi nhãn có trong phiếu tính theo PHẦN của nhãn (phiếu nhiều nhãn chia đúng phần).
    for (const { brandCode: brand, share } of brandMix(doc)) {
      const bp = findPolicy(policies.filter((p) => !p.scope.partnerCode), 'credit_limit', { date: doc.docDate, brandCode: brand, branchCode: doc.branchCode });
      const lim = (bp?.rule.branches as Record<string, number> | undefined)?.[doc.branchCode];
      if (bp && lim !== undefined) {
        const brandDocs = docs.filter((d) => d.branchCode === doc.branchCode && d.status === 'approved' && d.id !== doc.id && ['receipt', 'return', 'exchange', 'cost'].includes(d.kind));
        const current = (settings.brandOpening[brand]?.[doc.branchCode] ?? 0) + (await openOfBrand(trx, tenantId, brandDocs, brand));
        const pend = pendingOf(docs, (d) => d.branchCode === doc.branchCode, doc.docDate, doc, (d) => brandShare(d, brand));
        const bs = creditStatus(bp, current, pend, Math.round(calc.payable * share), doc.branchCode);
        if (bs) credit.push({ ...bs, scope: `Nhãn ${brand} — chi nhánh ${doc.branchCode}${share < 0.999 ? ` (phần nhãn ${Math.round(share * 100)}% của phiếu)` : ''}` });
      }
    }
  }
  const refOrder = docs.find((d) => d.kind === 'order' && (doc.refIds ?? []).includes(d.id));
  // Đối chiếu đơn đặt ↔ phiếu nhập theo PHẦN CÒN LẠI của đơn (trừ các phiếu nhập khác đã giao theo đơn): giao một phần là
  // bình thường (thông tin, lập phiếu tiếp từ đơn); chỉ cảnh báo khi nhận thừa hoặc lệch đơn giá.
  const orderChecks: Check[] = [];
  // ĐVT của mọi mã trong phiếu + đơn gốc + các phiếu giao theo đơn: mọi so sánh số lượng quy về ĐVT nhỏ nhất.
  const unitSkus = [...new Set([doc, ...(refOrder ? [refOrder, ...receiptsOfOrder(refOrder, docs)] : [])].flatMap((d) => d.lines.map((l) => l.sku)).filter(Boolean))];
  const units = await unitsOf(trx, tenantId, unitSkus);
  // Giá vốn thực tế từng dòng quy về ĐVT của dòng (mã nhiều ĐVT: dòng Thùng + quà theo Hộp chia đúng theo tỉ lệ) — tính lại khi đã
  // có bảng ĐVT; tiền, thuế, chiết khấu của phiếu không phụ thuộc ĐVT nên giữ nguyên.
  const withUnits = computeDoc(doc, policies, { holidays: settings.holidays, units });
  calc.lines.forEach((l, i) => { l.realUnitCost = withUnits.lines[i]?.realUnitCost ?? l.realUnitCost; });
  // Đúng quy trình mua hàng: khai mã + giá của NCC → đơn đặt (duyệt, giữ hạn mức) → phiếu nhập lập từ đơn.
  // Ngoại lệ được phép: phiếu nhập NGOÀI ĐƠN — bắt buộc ghi lý do để duyệt, đóng dấu lúc duyệt, kế toán rà soát riêng.
  if (isOutsideOrder(doc, refOrder)) {
    const reason = doc.outsideOrder?.reason?.trim();
    if (!reason) orderChecks.push({ level: 'error', code: 'po_none_reason', blocking: true, text: 'Phiếu nhập ngoài đơn (không theo đơn đặt nào): ghi "Lý do nhập ngoài đơn" mới duyệt được — đúng quy trình là lập đơn đặt, duyệt, rồi bấm "Lập phiếu nhập" ở đơn' });
    else orderChecks.push(settings.requireOrder
      ? { level: 'error', code: 'po_none', blocking: true, text: `Nhập ngoài đơn — lý do: ${reason}. Đơn vị bật "Phiếu nhập phải lập từ đơn đặt" (MH12): cần người có quyền bấm Duyệt ngoại lệ` }
      : { level: 'warn', code: 'po_none', text: `Nhập ngoài đơn — lý do: ${reason}` });
  }
  if (refOrder && doc.kind === 'receipt') {
    // Đúng quy trình: đơn đặt phải được duyệt (kể cả duyệt ngoại lệ hạn mức) rồi mới nhập kho theo đơn.
    if (refOrder.status !== 'approved') orderChecks.push({ level: 'error', code: 'po_not_approved', blocking: true, text: `Đơn đặt ${refOrder.docNo} chưa duyệt (${refOrder.status === 'pending_approval' ? 'đang chờ duyệt' : refOrder.status === 'cancelled' ? 'đã huỷ' : 'còn nháp'}) — duyệt đơn trước rồi mới duyệt phiếu nhập theo đơn` });
    const prog = orderProgress(refOrder, docs, doc.id, units);
    const q = (x: number) => x.toLocaleString('vi-VN');
    const gotBase = (sku: string) => doc.lines.filter((l) => l.lineType === 'buy' && (l.sku === sku || l.sku.slice(0, 9) === sku.slice(0, 9))).reduce((s, l) => s + l.qty * ratioIn(units, l.sku, l.unit, sku), 0);
    const inUnit = (p: OrderLineProgress, base: number) => { const r = ratioIn(units, p.sku, p.unit) || 1; return r === 1 ? `${q(base)} ${p.unit}` : `${q(Math.round((base / r) * 100) / 100)} ${p.unit} (${q(base)} ${p.baseUnit})`; };
    const over: string[] = [], price: string[] = [], partial: string[] = [];
    for (const p of prog.lines) {
      const g = gotBase(p.sku);
      if (g > p.remainingBase + 1e-6) over.push(`${p.sku} còn ${inUnit(p, p.remainingBase)} / nhận ${inUnit(p, g)}`);
      else if (g < p.remainingBase - 1e-6) partial.push(`${p.sku} còn ${inUnit(p, p.remainingBase - g)}`);
      // So đơn giá quy về cùng ĐVT của dòng đơn (đặt theo Thùng, hoá đơn theo Hộp vẫn so đúng).
      const rl = doc.lines.find((l) => l.lineType === 'buy' && l.sku === p.sku);
      const rlPrice = rl ? (rl.price / (ratioIn(units, rl.sku, rl.unit) || 1)) * (ratioIn(units, p.sku, p.unit) || 1) : 0;
      if (rl && Math.abs(rlPrice - p.price) > 0.5) price.push(`${p.sku} giá đặt ${q(p.price)} / ${p.unit}, hoá đơn ${q(rl.price)} / ${rl.unit}${rl.unit !== p.unit ? ` (= ${q(Math.round(rlPrice))} / ${p.unit})` : ''}`);
    }
    const extra = doc.lines.filter((l) => l.lineType === 'buy' && !prog.lines.some((p) => p.sku === l.sku || p.sku.slice(0, 9) === l.sku.slice(0, 9))).map((l) => l.sku);
    if (over.length || extra.length) orderChecks.push({ level: 'warn', code: 'po_over', text: `Nhận nhiều hơn đơn ${refOrder.docNo}: ${[...over, ...extra.map((x) => `${x} không có trong đơn`)].join('; ')}` });
    if (price.length) orderChecks.push({ level: 'warn', code: 'po_price', text: `Lệch đơn giá so với đơn ${refOrder.docNo}: ${price.join('; ')}` });
    orderChecks.push(partial.length
      ? { level: 'info', code: 'po_partial', text: `Giao một phần đơn ${refOrder.docNo} (đã nhận trước ${prog.received}/${prog.ordered}) — sau phiếu này còn: ${partial.join('; ')}. Lần giao sau: mở đơn → Lập phiếu nhập từ đơn` }
      : over.length || extra.length || price.length
        ? { level: 'info', code: 'po_full', text: `Nhận đủ số lượng đơn ${refOrder.docNo} — còn lệch đơn (xem cảnh báo thừa / lệch giá ở trên)` }
        : { level: 'info', code: 'po_match', text: `Nhận đủ đơn ${refOrder.docNo} — đối chiếu đơn đặt ↔ phiếu nhập ↔ hoá đơn khớp` });
  }
  const pre = doc.kind === 'receipt' ? await prepaymentFor(trx, tenantId, doc, docs) : { amount: 0 };
  const skus = [...new Set(doc.lines.filter((l) => l.sku && l.lineType === 'buy').map((l) => l.sku))];
  const history: Record<string, (PriceRow & { discountPct?: number })[]> = {};
  for (const sku of skus) history[sku] = await priceHistory(trx, tenantId, sku, doc.docDate, doc.id);
  const allSkus = [...new Set(doc.lines.map((l) => l.sku).filter(Boolean))];
  const prices = await listSupplierProducts(trx, tenantId, { partnerCode: doc.partnerCode || '-', withGeneral: true, skus: allSkus });
  let checks: Check[] = [];
  if (GOODS.includes(doc.kind)) {
    const products = await loadProducts(trx, tenantId, doc.lines.map((l) => l.sku));
    const dupInvoice = doc.invoice?.no ? docs.filter((d) => d.partnerCode === doc.partnerCode && d.invoice?.no === doc.invoice?.no) : [];
    checks = checkDoc(doc, calc, {
      policies, products, credit, prices, units, otherDocs: dupInvoice, prepaymentAvailable: pre.amount, priceWarnPct: settings.priceWarnPct,
      priceHistory: (sku) => history[sku] ?? [],
    }).filter((c) => doc.kind === 'receipt' || doc.kind === 'order' || !['no_invoice', 'gift_qty', 'price_last', 'price_fixed'].includes(c.code))
      .filter((c) => !(['gift_in', 'gift_out', 'return', 'exchange'].includes(doc.kind) && (c.code === 'near_expiry' || c.code === 'expired')));
    if (doc.kind === 'gift_out') checks = checks.filter((c) => c.code !== 'lot_missing');
    if (doc.kind !== 'exchange' && calc.orderDiscount > calc.gross - calc.lineDiscount) checks.push({ level: 'error', code: 'discount_over', blocking: true, text: `Chiết khấu trên đơn ${calc.orderDiscount.toLocaleString('vi-VN')} lớn hơn tiền hàng ${(calc.gross - calc.lineDiscount).toLocaleString('vi-VN')} — số phải trả bị âm` });
  }
  // Trả tiền theo phiếu nhập đã tất toán (hết nợ): nhắc — tiền sẽ thành khoản trả trước / trừ vào phiếu khác, dễ trả trùng.
  if (doc.kind === 'payment' && doc.status !== 'approved') {
    for (const r of docs.filter((x) => x.kind === 'receipt' && x.status === 'approved' && (doc.refIds ?? []).includes(x.id))) {
      const open = await openOf(trx, tenantId, evKeys(r));
      if (open <= 0.5) checks.push({ level: 'warn', code: 'paid_already', text: `Phiếu nhập ${r.docNo} đã trả hết (không còn nợ) — số tiền này sẽ trừ vào khoản nợ khác của NCC hoặc thành tiền trả trước; kiểm tra lại có trả trùng không` });
    }
  }
  if (doc.kind === 'payment' && doc.ckttAmount) {
    const why = await ckttCheck(trx, tenantId, doc, docs);
    if (why) checks.push({ level: 'error', code: 'cktt_invalid', blocking: true, text: why });
  }
  if ((doc.kind === 'cost' || doc.kind === 'rebate') && !(doc.amount && doc.amount > 0)) checks.push({ level: 'error', code: 'amount_missing', blocking: true, text: 'Chưa nhập số tiền' });
  const refRcpt = docs.filter((x) => x.kind === 'receipt' && x.status === 'approved' && (doc.refIds ?? []).includes(x.id));
  if (doc.kind === 'cost' && !refRcpt.length) checks.push({ level: 'error', code: 'cost_unassigned', blocking: true, text: 'Chi phí chưa gắn phiếu nhập đã duyệt — chọn phiếu nhập để phân bổ vào giá vốn' });
  if (doc.kind === 'rebate' && !doc.rebate && !doc.allocation?.length && !refRcpt.length) checks.push({ level: 'error', code: 'rebate_unassigned', blocking: true, text: 'Chiết khấu bổ sung chưa gắn phiếu nhập — chọn phiếu nhập được giảm giá để phân bổ giảm giá vốn' });
  checks.push(...orderChecks);
  checks.push(...(await extraChecks(trx, tenantId, doc, docs, settings)));
  // Ngân sách quà theo chương trình: phiếu mua / nhận quà làm tổng giá trị quà đã mua / nhận của chương trình vượt ngân sách → cảnh báo.
  if (doc.kind === 'receipt' || doc.kind === 'gift_in') {
    const progOf = (d: PDoc, l: PDoc['lines'][number]) => l.program ?? d.gift?.program ?? '';
    const isGift = (d: PDoc, l: PDoc['lines'][number]) => Boolean(d.gift) || d.kind === 'gift_in' || l.lineType === 'gift_consumer';
    const mine = [...new Set(doc.lines.filter((l) => isGift(doc, l) && progOf(doc, l)).map((l) => progOf(doc, l)))];
    for (const program of mine) {
      const bp = policies.find((p) => p.kind === 'gift_budget' && p.isActive && String(p.rule.program) === program && (!p.validFrom || p.validFrom <= doc.docDate) && (!p.validTo || p.validTo >= doc.docDate));
      if (!bp) continue;
      const valueOf = (d: PDoc) => d.lines.filter((l) => isGift(d, l) && progOf(d, l) === program).reduce((s, l) => s + l.qty * (l.price || 0), 0);
      const before = docs.filter((d) => d.id !== doc.id && d.status === 'approved' && (d.kind === 'receipt' || d.kind === 'gift_in')).reduce((s, d) => s + valueOf(d), 0);
      const after = before + valueOf(doc), amount = Number(bp.rule.amount);
      if (after > amount) checks.push({ level: 'warn', code: 'gift_budget_over', text: `Chương trình quà ${program}: đã mua / nhận ${Math.round(after).toLocaleString('vi-VN')} (kể cả phiếu này) vượt ngân sách ${amount.toLocaleString('vi-VN')} (${bp.code}) ${Math.round(after - amount).toLocaleString('vi-VN')}` });
    }
  }
  // FEFO: phiếu xuất theo lô (trả NCC, xuất quà, chiều Trả đi của phiếu đổi) chọn lô hạn xa trong khi cùng chi nhánh còn lô hạn
  // gần hơn (chưa hết hạn) → cảnh báo, không chặn. Lô đã hết hạn không tính là "nên xuất trước".
  const outLots = doc.lines.filter((l) => l.sku && l.lotNo && (doc.kind === 'return' || doc.kind === 'gift_out' || (doc.kind === 'exchange' && l.dir === 'out')));
  if (outLots.length) {
    const { lotStock } = await import('./reports.js');
    const lots = (await lotStock(trx, tenantId, ctx, doc.docDate)).lots.filter((l) => !l.expDate || l.expDate >= doc.docDate);
    for (const l of outLots) {
      const why = fefoCheck(lots, { sku: l.sku, lotNo: l.lotNo!, branchCode: doc.branchCode });
      if (why) checks.push({ level: 'warn', code: 'fefo', lineKey: l.lineKey, text: `${l.sku}: ${why}` });
    }
  }
  // Đối soát với hoá đơn NCC đã lưu (MH22) cùng số hoá đơn: từng mã, SL, giá chưa thuế, thuế suất, tổng tiền.
  checks.push(...(await invoiceCheck(trx, tenantId, doc, docs, policies)));
  // Quy định quy tắc mã hàng: không nhập đổi mã so với đơn đặt (vd đặt mã thường, nhập mã K/M/Q/T) — phải được duyệt.
  if (doc.kind === 'receipt' && refOrder) {
    const sw = codeSwaps(refOrder, doc);
    if (sw.length) checks.push({ level: 'error', code: 'code_swap', blocking: true, text: `Nhập đổi mã so với đơn ${refOrder.docNo}: ${sw.map((x) => `${x.from} → ${x.to}`).join(', ')} — theo quy tắc mã hàng phải được duyệt (Duyệt ngoại lệ, ghi lý do)` });
  }
  const entries = postingFor(doc, calc, { accounts });
  return { prices, units, calc, checks, credit, entries, blocking: checks.filter((c) => c.blocking), prepayment: pre.amount, refOrder, priceHistory: history, accounts, priceWarnPct: settings.priceWarnPct };
}

/** CKTT trên phiếu trả tiền: phải trả cho phiếu nhập có CKTT, trả trong hạn, trả đủ phần còn lại sau CKTT, đúng số tiền CKTT. */
export async function ckttCheck(trx: Db, tenantId: string, doc: PDoc, docs: StoredDoc[]): Promise<string | null> {
  const r = docs.find((d) => d.kind === 'receipt' && d.status === 'approved' && (doc.refIds ?? []).includes(d.id));
  if (!r) return 'Chiết khấu thanh toán chỉ ghi khi phiếu trả tiền chọn đúng phiếu nhập được hưởng';
  const pct = r.cktt?.pct ?? 0;
  if (!pct) return `Phiếu nhập ${r.docNo} không có chiết khấu thanh toán`;
  if (!r.dueDate || doc.docDate > r.dueDate) return `Trả ngày ${doc.docDate.split('-').reverse().join('/')} quá hạn ${r.dueDate?.split('-').reverse().join('/') ?? ''}: không được hưởng CKTT`;
  const expect = Math.round((r.totals.total * pct) / 100);
  if (Math.abs((doc.ckttAmount ?? 0) - expect) > 1) return `CKTT của phiếu ${r.docNo} là ${expect.toLocaleString('vi-VN')} (${Number(pct).toLocaleString('vi-VN')}%), phiếu ghi ${(doc.ckttAmount ?? 0).toLocaleString('vi-VN')}`;
  const open = await openOf(trx, tenantId, evKeys(r));
  if ((doc.amount ?? 0) + expect < open - 1) return `Chưa trả đủ: còn nợ ${open.toLocaleString('vi-VN')}, trả ${(doc.amount ?? 0).toLocaleString('vi-VN')} + CKTT ${expect.toLocaleString('vi-VN')}`;
  return null;
}

export { ACC };

/**
 * Khoản phải trả NCC còn mở theo HẠN, cùng cách tính với Công nợ đến hạn (MH05): phiếu nhập có lịch trả nhiều đợt thì xét
 * TỪNG ĐỢT (tiền đã trả trừ dần từ đợt sớm nhất), không lấy hạn của cả hoá đơn; phiếu "công nợ cố định" không có hạn
 * (dueDate null — không bao giờ quá hạn), số dư đầu kỳ không khai hạn cũng vậy. Không truyền partnerCode = mọi NCC.
 */
export async function openDueOf(trx: Db, tenantId: string, docs: StoredDoc[], asOf: string, partnerCode?: string): Promise<{ partnerCode: string; docNo: string; dueDate: string | null; remaining: number }[]> {
  let q = trx.selectFrom('debt_items as i').innerJoin('partners as p', 'p.id', 'i.partner_id').leftJoin('accounting_events as e', 'e.id', 'i.event_id')
    .select(['p.code', 'i.event_id', 'i.doc_no', 'i.due_date', 'i.amount', 'i.settled_amount', 'e.doc_type', sql<string | null>`e.payload->>'dueDate'`.as('explicit_due')])
    .where('i.tenant_id', '=', tenantId).where('i.side', '=', 'credit').where('i.account_code', 'like', '331%').where(sql<boolean>`i.amount > i.settled_amount`);
  if (partnerCode) q = q.where('p.code', '=', partnerCode);
  const items = await q.execute();
  const byEvent = new Map<string, StoredDoc>();
  for (const d of docs) for (const l of d.links) byEvent.set(l.eventId, d);
  const out: { partnerCode: string; docNo: string; dueDate: string | null; remaining: number }[] = [];
  for (const i of items) {
    const amount = toNumber(i.amount), paid = toNumber(i.settled_amount);
    const d = byEvent.get(String(i.event_id));
    // Số dư đầu kỳ không khai hạn: không có hạn (không bao giờ quá hạn), giống phiếu "công nợ cố định".
    const openingNoDue = !d && i.doc_type === 'opening' && !/^\d{4}-\d{2}-\d{2}$/.test(i.explicit_due ?? '');
    if (openingNoDue || (d?.kind === 'receipt' && noDueDate(d))) out.push({ partnerCode: i.code, docNo: i.doc_no, dueDate: null, remaining: amount - paid });
    else if (d?.schedule?.length && d.kind === 'receipt') {
      for (const s of scheduleStatus(d.schedule, paid, asOf)) if (s.remaining > 0) out.push({ partnerCode: i.code, docNo: i.doc_no, dueDate: s.dueDate, remaining: s.remaining });
    } else out.push({ partnerCode: i.code, docNo: i.doc_no, dueDate: String(i.due_date).slice(0, 10), remaining: amount - paid });
  }
  return out;
}

/** Khoản nợ NCC quá hạn tính tới ngày asOf (hạn < asOf), cũ nhất trước. */
export async function overdueOf(trx: Db, tenantId: string, partnerCode: string, docs: StoredDoc[], asOf: string): Promise<{ docNo: string; dueDate: string; remaining: number }[]> {
  return (await openDueOf(trx, tenantId, docs, asOf, partnerCode)).filter((x): x is typeof x & { dueDate: string } => x.dueDate !== null && x.dueDate < asOf)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** Kiểm tra theo sổ / theo chứng từ khác: nợ quá hạn của NCC, trả quá số đã nhập, xuất quà vượt tồn / sai chương trình. */
async function extraChecks(trx: Db, tenantId: string, doc: PDoc, docs: StoredDoc[], _s: PurchaseSettings): Promise<Check[]> {
  const out: Check[] = [];
  // Dòng hàng: SL phải > 0, ĐVT phải là ĐVT đã khai của mặt hàng (gửi thẳng lên máy chủ cũng không lọt) — chặn duyệt, nháp vẫn lưu được.
  const goods = doc.lines.filter((l) => l.sku && !l.newItem);
  const units = await unitsOf(trx, tenantId, goods.map((l) => l.sku));
  const fold = (x: string) => x.trim().toLowerCase();
  for (const l of goods) {
    if (!(l.qty > 0)) out.push({ level: 'error', code: 'qty_zero', blocking: true, lineKey: l.lineKey, text: `${l.sku}: số lượng phải lớn hơn 0` });
    const us = units[l.sku];
    // Mã không có trong danh mục / dòng bỏ trống ĐVT: không nhập kho được (không quy đổi được) — chặn duyệt.
    if (!us?.length) { out.push({ level: 'error', code: 'sku_unknown', blocking: true, lineKey: l.lineKey, text: `${l.sku}: mã chưa có trong danh mục mặt hàng — chọn mã có sẵn hoặc khai mặt hàng trước` }); continue; }
    if (!l.unit.trim()) { out.push({ level: 'error', code: 'unit_unknown', blocking: true, lineKey: l.lineKey, text: `${l.sku}: chưa chọn ĐVT (có: ${us.map((u) => u.unit).join(', ')})` }); continue; }
    if (!us.some((u) => fold(u.unit) === fold(l.unit))) out.push({ level: 'error', code: 'unit_unknown', blocking: true, lineKey: l.lineKey, text: `${l.sku}: ĐVT "${l.unit}" chưa khai cho mặt hàng (đang có: ${us.map((u) => u.unit).join(', ')})` });
  }
  if ((doc.kind === 'receipt' || doc.kind === 'order') && doc.partnerCode) {
    const overdue = await overdueOf(trx, tenantId, doc.partnerCode, docs, doc.docDate);
    const amt = overdue.reduce((s, x) => s + x.remaining, 0);
    if (amt > 0) out.push({ level: 'warn', code: 'credit_overdue', text: `NCC đang có ${overdue.length} khoản nợ quá hạn, tổng ${amt.toLocaleString('vi-VN')} (khoản cũ nhất hạn ${overdue[0]!.dueDate.split('-').reverse().join('/')}) — nên thanh toán trước khi nhập thêm` });
  }
  // Trả / đổi trả đi: không quá số đã nhận ở phiếu gốc trừ phần đã trả ở phiếu khác.
  if ((doc.kind === 'return' || doc.kind === 'exchange') && doc.refIds?.length) {
    const orig = docs.filter((x) => x.kind === 'receipt' && (doc.refIds ?? []).includes(x.id));
    // Chỉ phiếu trả ĐÃ DUYỆT mới tính là đã trả: phiếu nháp / chờ duyệt chưa đi đâu, duyệt nó thì kiểm lại lúc đó.
    const others = docs.filter((x) => x.id !== doc.id && x.status === 'approved' && (x.kind === 'return' || x.kind === 'exchange') && (x.refIds ?? []).some((r) => (doc.refIds ?? []).includes(r)));
    const qty = (ds: PDoc[], f: (l: PDoc['lines'][number], d: PDoc) => boolean) => {
      const m = new Map<string, number>();
      for (const d of ds) for (const l of d.lines) if (f(l, d)) m.set(l.sku, (m.get(l.sku) ?? 0) + l.qty);
      return m;
    };
    const got = qty(orig, () => true);
    const back = qty(others, (l, d) => d.kind === 'return' || l.dir === 'out');
    const now = qty([doc], (l) => doc.kind === 'return' || l.dir === 'out');
    for (const [sku, q] of now) {
      const can = (got.get(sku) ?? 0) - (back.get(sku) ?? 0);
      if (q > can) out.push({ level: 'error', code: 'return_over', blocking: true, text: `${sku}: trả ${q} nhưng phiếu gốc ${orig.map((o) => o.docNo).join(', ')} chỉ còn ${Math.max(0, can)} có thể trả (đã nhận ${got.get(sku) ?? 0}, đã trả ${back.get(sku) ?? 0})` });
    }
  }
  if (doc.kind === 'gift_in') for (const l of doc.lines.filter((x) => !(x.price > 0))) out.push({ level: 'error', code: 'gift_value', blocking: true, lineKey: l.lineKey, text: `${l.sku || 'Dòng quà'}: nhập giá trị hợp lý / ĐVT để ghi sổ (Nợ 1561 / Có 711)` });
  // Xuất quà: không vượt tồn quà tại chi nhánh; chương trình phải có quà nhập.
  if (doc.kind === 'gift_out') {
    const approved = docs.filter((x) => x.status === 'approved' && x.id !== doc.id && x.branchCode === doc.branchCode);
    for (const l of doc.lines) {
      const inQty = approved.filter((x) => x.kind === 'gift_in' || (x.kind === 'receipt' && (x.gift || x.lines.some((y) => y.lineType === 'gift_consumer'))))
        .flatMap((x) => x.lines.filter((y) => y.sku === l.sku && (x.gift || x.kind === 'gift_in' || y.lineType === 'gift_consumer') && (!l.program || (y.program ?? x.gift?.program ?? '') === l.program))).reduce((s, y) => s + y.qty, 0);
      const outQty = approved.filter((x) => x.kind === 'gift_out').flatMap((x) => x.lines.filter((y) => y.sku === l.sku && (!l.program || y.program === l.program))).reduce((s, y) => s + y.qty, 0);
      const left = inQty - outQty;
      if (l.qty > left) out.push({ level: 'error', code: 'gift_over', blocking: true, lineKey: l.lineKey, text: `${l.sku}: xuất ${l.qty} nhưng tồn quà${l.program ? ` chương trình ${l.program}` : ''} tại chi nhánh chỉ còn ${Math.max(0, left)}` });
      if (l.program && inQty === 0) out.push({ level: 'warn', code: 'gift_program', lineKey: l.lineKey, text: `${l.sku}: chưa có quà nào nhập theo chương trình ${l.program} — kiểm tra lại chương trình` });
    }
  }
  return out;
}
