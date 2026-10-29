/**
 * DUYỆT chứng từ mua hàng = GHI SỔ THẬT qua lõi có sẵn (không có sổ riêng):
 *   nhập mua, chi phí mua hàng    → chứng từ "purchase" qua cổng chứng từ (bút toán, sổ hoá đơn mua vào, công nợ, kho, lô)
 *   trả hàng, thưởng cuối kỳ      → chứng từ "purchase_return" (thưởng: dòng SL 0, chỉ giảm giá trị → giá vốn bình quân tự chia)
 *   đổi hàng                      → một "purchase_return" (dòng trả đi) + một "purchase" (dòng nhận về) + đối trừ / trả chênh lệch
 *   nhận quà / xuất quà           → "stock_adjustment" tăng / giảm, lý do NQUA (Có 711…) / XQUA (Nợ 641…)
 *   ứng trước, trả tiền, CKTT     → phiếu chi / báo nợ / phiếu kế toán, trừ thẳng vào khoản công nợ (debt_items)
 *   đơn đặt hàng                  → không ghi sổ (chỉ giữ hạn mức)
 * Mỗi chứng từ kế toán sinh ra lưu ở links; bỏ duyệt = huỷ đúng các chứng từ đó (đảo bút toán bằng số âm, không xoá).
 */
import { sql } from 'kysely';
import { allocate as allocateParts, amountTax, baseUnitOf, computeDoc, giftLineValue, moneyAccountOf, ratioOf, type DocCalc, type PDoc, type ProductUnit } from '@ketoan/contracts/mua-hang';
import { unitsOf } from './gia-mua.js';
import { ingestDocumentSchema, voucherInputSchema, type IngestDocument } from '@ketoan/contracts';
import { toNumber, type Db } from '../../db/client.js';
import type { AuthContext } from '../../core/auth.js';
import { Errors } from '../../core/errors.js';
import { postDocumentIn } from '../../modules/documents/document.service.js';
import { voucherService } from '../../modules/vouchers/voucher.service.js';
import { allocate as allocateDebt } from '../../modules/debts/debt.service.js';
import type { Accounts } from '@ketoan/contracts/mua-hang';
import type { StoredDoc } from './store.js';

export interface Link { docKey: string; docNo: string; eventId: string; role: string }

async function partnerInfo(trx: Db, tenantId: string, code: string) {
  const p = await trx.selectFrom('partners').select(['code', 'name', 'tax_code', 'address']).where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  return { code, name: p?.name ?? code, taxCode: p?.tax_code ?? undefined, address: p?.address ?? undefined };
}

async function eventOf(trx: Db, tenantId: string, docKey: string): Promise<{ id: string; doc_no: string }> {
  const e = await trx.selectFrom('accounting_events').select(['id', 'doc_no', 'status', 'error_message']).where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).executeTakeFirst();
  if (!e) throw Errors.posting(`Không tạo được chứng từ kế toán ${docKey}`);
  if (e.status === 'error') throw Errors.posting(`Không ghi sổ được: ${e.error_message ?? ''}`);
  return { id: String(e.id), doc_no: e.doc_no };
}

/** Lý do kho của phân hệ (nhận quà / xuất quà) — chưa có thì tự thêm vào Cấu hình hạch toán. */
async function ensureReason(trx: Db, tenantId: string, code: string, name: string, kind: 'in' | 'out', counter: string) {
  await trx.insertInto('posting_reasons').values({ tenant_id: tenantId, code, name, kind, counter_account: counter, flags: JSON.stringify({ module: 'mua-hang' }) } as never)
    .onConflict((oc) => oc.columns(['tenant_id', 'code'] as never).doNothing()).execute();
}

/**
 * Lý do GGHM "Giảm giá hàng mua" cho phiếu thưởng / CK sau mua (ghi như trả hàng NCC, số lượng 0): chép tài khoản của lý do trả
 * hàng mặc định (bút toán như cũ) nhưng KHÔNG mang cờ returnAtOpeningCost — giá vốn tháng lấy đúng số tiền giảm, thay vì định
 * giá theo tồn đầu × số lượng trả (= 0, khoản thưởng bị bỏ qua).
 */
export const REBATE_REASON = 'GGHM';
async function ensureRebateReason(trx: Db, tenantId: string): Promise<string> {
  const rows = await trx.selectFrom('posting_reasons').selectAll().where('tenant_id', '=', tenantId).execute();
  if (rows.some((r) => r.code === REBATE_REASON)) return REBATE_REASON;
  const def = rows.find((r) => (r.flags as Record<string, unknown> | null)?.default === 'purchase_return');
  const { returnAtOpeningCost: _o, default: _d, ...flags } = (def?.flags ?? { postToLedger: true }) as Record<string, unknown>;
  await trx.insertInto('posting_reasons').values({
    tenant_id: tenantId, code: REBATE_REASON, name: 'Giảm giá hàng mua (thưởng / chiết khấu sau mua)', kind: 'out',
    counter_account: def?.counter_account ?? null, revenue_account: def?.revenue_account ?? null, expense_account: def?.expense_account ?? null,
    flags: JSON.stringify({ ...flags, module: 'mua-hang' }),
  } as never).onConflict((oc) => oc.columns(['tenant_id', 'code'] as never).doNothing()).execute();
  return REBATE_REASON;
}

type Units = Record<string, ProductUnit[]>;
/** Quy một dòng về ĐVT nhỏ nhất của mặt hàng: nhập 2 Thùng (tỉ lệ 48) → kho ghi 96 Hộp. */
function toBase(units: Units, sku: string, unit: string, qty: number) {
  const us = units[sku] ?? [];
  const r = ratioOf(us, unit) || 1;
  const base = us.length ? baseUnitOf(us) : unit;
  return { unit: base || unit, qty: Math.round(qty * r * 10000) / 10000, ratio: r, note: r !== 1 ? `${qty.toLocaleString('vi-VN')} ${unit} × ${r} = ${(qty * r).toLocaleString('vi-VN')} ${base}` : undefined };
}

/** Dòng chứng từ kế toán từ dòng phiếu đã tính (bỏ dòng SL 0 không tiền); số lượng ghi kho theo ĐVT nhỏ nhất. */
function ingestLines(calc: DocCalc, units: Units, filter: (l: DocCalc['lines'][number]) => boolean = () => true) {
  return calc.lines.filter((l) => filter(l) && (l.qty > 0 || l.beforeTax)).map((l) => { const b = toBase(units, l.sku, l.unit, l.qty); return ({
    lineKey: l.lineKey, sku: l.sku, name: l.name, unit: b.unit, qty: b.qty,
    unitPrice: b.qty ? Math.round((l.beforeTax / b.qty) * 100) / 100 : 0, amountBeforeTax: l.beforeTax,
    discount: l.lineDiscount + l.orderDiscount, taxCode: l.taxCode, taxAmount: l.tax, isGift: l.lineType !== 'buy', excludeFromCost: l.lineType === 'gift_consumer' || undefined,
    lotNo: l.lotNo, expDate: l.expDate, note: [b.note, l.lineType === 'gift_seller' ? 'KM người bán (chia vào giá)' : l.lineType === 'gift_consumer' ? 'KM người tiêu dùng / quà' : undefined].filter(Boolean).join(' · ') || undefined,
  }); });
}

async function ingest(trx: Db, auth: AuthContext, raw: Record<string, unknown>, role: string, warehouseCode?: string): Promise<Link> {
  // Phân kho của phiếu mua → từng dòng hàng (dòng chưa ghi kho riêng).
  if (warehouseCode && Array.isArray(raw.lines)) raw = { ...raw, lines: (raw.lines as Record<string, unknown>[]).map((l) => (l.warehouseCode ? l : { ...l, warehouseCode })) };
  const parsed = ingestDocumentSchema.safeParse(raw);
  if (!parsed.success) throw Errors.validation('Chứng từ kế toán dựng từ phiếu mua không đúng khuôn', parsed.error.flatten());
  const doc = parsed.data as IngestDocument;
  await postDocumentIn(trx, auth, doc, { post: true, force: true });
  const e = await eventOf(trx, auth.tenantId, doc.docKey);
  return { docKey: doc.docKey, docNo: e.doc_no, eventId: e.id, role };
}

async function voucher(trx: Db, auth: AuthContext, input: Record<string, unknown>, role: string): Promise<Link> {
  const created = await voucherService.createIn(trx, auth, voucherInputSchema.parse(await withDepartment(trx, auth.tenantId, input)));
  return { docKey: created.docKey, docNo: created.docNo, eventId: String(created.id), role };
}

/**
 * Tài khoản bắt buộc bộ phận (vd 5152 thu nhập tài chính): dòng chưa có bộ phận thì lấy bộ phận gắn với chi nhánh của phiếu
 * — người lập phiếu mua hàng không chọn bộ phận, để trống thì chứng từ không duyệt được.
 */
async function withDepartment(trx: Db, tenantId: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const lines = (input.lines ?? []) as { debitAccount: string; creditAccount: string; department?: string }[];
  const accs = [...new Set(lines.flatMap((l) => [l.debitAccount, l.creditAccount]))];
  if (!accs.length || !input.branchCode) return input;
  const need = new Set((await trx.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).where('code', 'in', accs).where('track_department', '=', true).execute()).map((r) => r.code));
  if (!need.size) return input;
  const dep = (await trx.selectFrom('branches').select('department_code').where('tenant_id', '=', tenantId).where('code', '=', String(input.branchCode)).executeTakeFirst())?.department_code;
  if (!dep) return input;
  return { ...input, lines: lines.map((l) => (l.department || !(need.has(l.debitAccount) || need.has(l.creditAccount)) ? l : { ...l, department: dep })) };
}

/**
 * Hạn ghi vào sổ công nợ của phiếu nhập: trả nhiều đợt → hạn đợt đầu (đợt sớm nhất phải trả); không thì hạn theo điều khoản.
 * (Trạng thái từng đợt xem ở MH05 — sổ công nợ chỉ có một hạn cho mỗi khoản.)
 */
function receiptDue(d: PDoc, termDue?: string): string | undefined {
  const first = [...(d.schedule ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  return first?.dueDate ?? termDue;
}

/** Khoản công nợ (ghi Có / Nợ) của một chứng từ kế toán trên 331*. */
async function itemsOf(trx: Db, tenantId: string, eventIds: string[], side: 'credit' | 'debit') {
  if (!eventIds.length) return [];
  return trx.selectFrom('debt_items').select(['id', 'account_code', 'amount', 'settled_amount', 'due_date']).where('tenant_id', '=', tenantId)
    .where('event_id', 'in', eventIds).where('side', '=', side).where('account_code', 'like', '331%').execute();
}
const left = (i: { amount: string; settled_amount: string }) => toNumber(i.amount) - toNumber(i.settled_amount);

/** Phiếu chi / báo nợ trả NCC: trừ vào các khoản đang mở (ưu tiên phiếu được chọn, rồi hạn sớm trước); phần dư thành tiền trả trước. */
async function payVoucher(trx: Db, auth: AuthContext, d: PDoc, A: Accounts, amount: number, preferEvents: string[], role: string, deposit = false): Promise<Link> {
  const money = moneyAccountOf(d, A);
  const settle: { debtItemId: string; amount: number; account: string }[] = [];
  if (!deposit) {
    const open = await trx.selectFrom('debt_items as i').innerJoin('partners as p', 'p.id', 'i.partner_id')
      .select(['i.id', 'i.account_code', 'i.amount', 'i.settled_amount', 'i.due_date', 'i.event_id'])
      .where('i.tenant_id', '=', auth.tenantId).where('p.code', '=', d.partnerCode).where('i.side', '=', 'credit').where('i.account_code', 'like', '331%')
      .where(sql<boolean>`i.amount > i.settled_amount`).orderBy('i.due_date').orderBy('i.id').execute();
    const ordered = [...open.filter((i) => preferEvents.includes(String(i.event_id))), ...open.filter((i) => !preferEvents.includes(String(i.event_id)))];
    let rest = amount;
    for (const i of ordered) {
      if (rest <= 0) break;
      const take = Math.min(rest, left(i));
      if (take > 0) { settle.push({ debtItemId: String(i.id), amount: take, account: i.account_code }); rest -= take; }
    }
  }
  const byAccount = new Map<string, number>();
  for (const s of settle) byAccount.set(s.account, (byAccount.get(s.account) ?? 0) + s.amount);
  const rest = amount - settle.reduce((s, x) => s + x.amount, 0);
  if (rest > 0.5) byAccount.set(A.payable, (byAccount.get(A.payable) ?? 0) + rest);
  return voucher(trx, auth, {
    docType: money.startsWith('112') ? 'bank_payment' : 'payment', branchCode: d.branchCode, docDate: d.docDate, docNo: undefined,
    description: d.note || (deposit ? `Ứng trước nhà cung cấp ${d.docNo}` : `Trả tiền nhà cung cấp ${d.docNo}`), partnerCode: d.partnerCode, reference: d.docNo,
    purpose: deposit || (rest > 0.5 && !settle.length) ? 'deposit_paid' : undefined,
    lines: [...byAccount].map(([debitAccount, amt]) => ({ debitAccount, creditAccount: money, amount: Math.round(amt), description: deposit ? 'Ứng trước nhà cung cấp' : 'Trả tiền nhà cung cấp' })),
    settle: settle.length ? settle.map(({ debtItemId, amount: a }) => ({ debtItemId, amount: Math.round(a) })) : undefined,
  }, role);
}

/** Đối trừ hai nhóm khoản công nợ (ứng trước ↔ hoá đơn, hàng trả ↔ hàng nhận). */
async function offset(trx: Db, auth: AuthContext, debitEvents: string[], creditEvents: string[], date: string, note: string) {
  const debits = (await itemsOf(trx, auth.tenantId, debitEvents, 'debit')).filter((i) => left(i) > 0);
  const credits = (await itemsOf(trx, auth.tenantId, creditEvents, 'credit')).filter((i) => left(i) > 0);
  const pairs: { debitItemId: string; creditItemId: string; amount: number }[] = [];
  for (const c of credits) {
    let need = left(c);
    for (const d of debits) {
      if (need <= 0) break;
      if (d.account_code !== c.account_code) continue;
      const avail = left(d) - pairs.filter((p) => p.debitItemId === String(d.id)).reduce((s, p) => s + p.amount, 0);
      const take = Math.min(need, avail);
      if (take > 0) { pairs.push({ debitItemId: String(d.id), creditItemId: String(c.id), amount: take }); need -= take; }
    }
  }
  if (pairs.length) await allocateDebt(trx, auth.tenantId, pairs, { actor: auth.actor, date, note });
}

/** Phân bổ một khoản (chi phí, chiết khấu bổ sung) vào các mã của một hay nhiều phiếu nhập theo giá trị / số lượng.
 *  Trả về theo mã (gộp các phiếu) và theo từng (phiếu, mã) — tổng khớp tới đồng. */
export function spreadOverMany(receipts: PDoc[], amount: number, basis: 'value' | 'qty' = 'value') {
  const parts: { receiptId: string; sku: string; name: string; unit: string; taxCode: string; value: number; qty: number; amount: number }[] = [];
  for (const r of receipts) {
    for (const l of computeDoc(r, []).lines.filter((x) => x.lineType !== 'gift_consumer' && x.sku)) {
      const x = parts.find((p) => p.receiptId === r.id && p.sku === l.sku) ?? parts[parts.push({ receiptId: r.id, sku: l.sku, name: l.name, unit: l.unit, taxCode: l.taxCode, value: 0, qty: 0, amount: 0 }) - 1]!;
      x.value += l.beforeTax; x.qty += l.qty;
    }
  }
  const alloc = allocateParts(Math.round(amount), parts.map((p) => (basis === 'qty' ? p.qty : p.value)));
  parts.forEach((p, i) => { p.amount = alloc[i]!; });
  const bySku = new Map<string, { sku: string; name: string; unit: string; taxCode: string; value: number; qty: number; amount: number }>();
  for (const p of parts) {
    const x = bySku.get(p.sku) ?? { sku: p.sku, name: p.name, unit: p.unit, taxCode: p.taxCode, value: 0, qty: 0, amount: 0 };
    x.value += p.value; x.qty += p.qty; x.amount += p.amount; bySku.set(p.sku, x);
  }
  return { rows: [...bySku.values()], parts };
}
export const spreadOver = (receipt: PDoc, amount: number, basis: 'value' | 'qty' = 'value') => spreadOverMany([receipt], amount, basis).rows;
/** Phiếu nhập đã duyệt được phiếu chi phí / chiết khấu bổ sung tham chiếu. */
export const refReceipts = (d: PDoc, docs: PDoc[]) => docs.filter((x) => x.kind === 'receipt' && x.status === 'approved' && (d.refIds ?? []).includes(x.id));

const base = (d: PDoc, partner: Awaited<ReturnType<typeof partnerInfo>>, key: string, version: number) => ({
  docKey: key, version, branchCode: d.branchCode, docNo: d.docNo, docDate: d.docDate, description: d.note || d.reason || '', partner,
  sourceSystem: 'erp', sourceRef: { type: 'purchase_document', id: d.id, label: d.docNo },
});

/** Ghi sổ một chứng từ mua hàng đã qua kiểm tra. Trả về các chứng từ kế toán đã sinh. */
export async function postPurchase(trx: Db, auth: AuthContext, d: StoredDoc, calc: DocCalc, A: Accounts, docs: StoredDoc[]): Promise<Link[]> {
  const version = d.revision + 1;
  const key = `mh:${d.id}`;
  const partner = await partnerInfo(trx, auth.tenantId, d.partnerCode);
  const links: Link[] = [];
  const invoice = d.invoice ? { no: d.invoice.no, serial: d.invoice.serial ?? '', date: d.invoice.date } : undefined;
  const evOf = (id: string) => docs.find((x) => x.id === id)?.links.map((l) => l.eventId) ?? [];
  const units = await unitsOf(trx, auth.tenantId, d.lines.map((l) => l.sku));

  switch (d.kind) {
    case 'order': break;
    case 'receipt': {
      const lines = ingestLines(calc, units);
      links.push(await ingest(trx, auth, { ...base(d, partner, key, version), docType: 'purchase', invoice, dueDate: receiptDue(d, calc.dueDate), lines, payments: [], totals: { beforeTax: calc.beforeTax, tax: calc.tax, total: calc.beforeTax + calc.tax } }, 'Nhập mua', d.warehouseCode));
      // Ứng trước theo cùng đơn đặt → đối trừ ngay, không ghi trả trùng.
      const pre = docs.filter((x) => x.kind === 'prepayment' && x.status === 'approved' && (x.refIds ?? []).some((r) => (d.refIds ?? []).includes(r)));
      if (pre.length) await offset(trx, auth, pre.flatMap((x) => x.links.map((l) => l.eventId)), [links[0]!.eventId], d.docDate, `Đối trừ ứng trước — phiếu nhập ${d.docNo}`);
      break;
    }
    case 'return': {
      const orig = docs.find((x) => x.kind === 'receipt' && (d.refIds ?? []).includes(x.id));
      links.push(await ingest(trx, auth, { ...base(d, partner, key, version), docType: 'purchase_return', originalDocKey: orig ? `mh:${orig.id}` : undefined, invoice, lines: ingestLines(calc, units), payments: [], totals: { beforeTax: calc.beforeTax, tax: calc.tax, total: calc.beforeTax + calc.tax } }, 'Trả hàng NCC', d.warehouseCode));
      // Trừ ngay vào khoản nợ của hoá đơn gốc (phần còn nợ, đợt sớm nhất trước) — công nợ đến hạn / tuổi nợ đúng số sau trả.
      if (orig) await offset(trx, auth, [links[links.length - 1]!.eventId], orig.links.map((l) => l.eventId), d.docDate, `Trừ hàng trả ${d.docNo} vào ${orig.docNo}`);
      break;
    }
    case 'exchange': {
      const x = calc.exchange!;
      const out = ingestLines(calc, units, (l) => l.dir === 'out');
      const inn = ingestLines(calc, units, (l) => (l.dir ?? 'in') === 'in');
      if (out.length) links.push(await ingest(trx, auth, { ...base(d, partner, `${key}:tra`, version), docType: 'purchase_return', docNo: `${d.docNo}-T`, lines: out, payments: [], totals: { beforeTax: x.outBeforeTax, tax: x.outTax, total: x.outBeforeTax + x.outTax } }, 'Hàng trả đi', d.warehouseCode));
      if (inn.length) links.push(await ingest(trx, auth, { ...base(d, partner, `${key}:nhan`, version), docType: 'purchase', docNo: `${d.docNo}-N`, invoice, lines: inn, payments: [], totals: { beforeTax: x.inBeforeTax, tax: x.inTax, total: x.inBeforeTax + x.inTax } }, 'Hàng nhận về', d.warehouseCode));
      const outEv = links.filter((l) => l.role === 'Hàng trả đi').map((l) => l.eventId), inEv = links.filter((l) => l.role === 'Hàng nhận về').map((l) => l.eventId);
      await offset(trx, auth, outEv, inEv, d.docDate, `Bù trừ đổi hàng ${d.docNo}`);
      if (x.diff > 0 && d.settle === 'pay') links.push(await payVoucher(trx, auth, d, A, x.diff, inEv, 'Trả chênh lệch'));
      if (x.diff < 0 && d.settle === 'refund') {
        const money = moneyAccountOf(d, A);
        const items = (await itemsOf(trx, auth.tenantId, outEv, 'debit')).filter((i) => left(i) > 0);
        links.push(await voucher(trx, auth, {
          docType: money.startsWith('112') ? 'bank_receipt' : 'receipt', branchCode: d.branchCode, docDate: d.docDate, description: `Nhà cung cấp hoàn tiền chênh lệch đổi hàng ${d.docNo}`, partnerCode: d.partnerCode, reference: d.docNo,
          lines: [{ debitAccount: money, creditAccount: items[0]?.account_code ?? A.payable, amount: -x.diff, description: 'NCC hoàn tiền chênh lệch' }],
          settle: items[0] ? [{ debtItemId: String(items[0].id), amount: Math.min(-x.diff, left(items[0])) }] : undefined,
        }, 'NCC hoàn tiền'));
      }
      break;
    }
    case 'gift_in': case 'gift_out': {
      const isIn = d.kind === 'gift_in';
      const code = isIn ? 'NQUA' : 'XQUA';
      await ensureReason(trx, auth.tenantId, code, isIn ? 'Nhận quà / hàng tặng không hoá đơn (phân hệ Mua hàng)' : 'Xuất quà tặng khách (phân hệ Mua hàng)', isIn ? 'in' : 'out', isIn ? A.giftIncome : A.giftExpense);
      const lines = d.lines.filter((l) => l.sku && l.qty > 0).map((l) => { const b = toBase(units, l.sku, l.unit, l.qty); return { lineKey: l.lineKey, sku: l.sku, name: l.name, unit: b.unit, qty: b.qty, amount: isIn ? giftLineValue(l) : 0 }; });
      links.push(await ingest(trx, auth, { ...base(d, partner, key, version), docType: 'stock_adjustment', direction: isIn ? 'increase' : 'decrease', reasonCode: code, lines, totals: { total: lines.reduce((s, l) => s + l.amount, 0) } }, isIn ? 'Nhận quà' : 'Xuất quà', d.warehouseCode));
      break;
    }
    case 'cost': {
      const receipts = refReceipts(d, docs);
      if (!receipts.length) throw Errors.validation('Chi phí chưa gắn phiếu nhập đã duyệt để phân bổ');
      const rows = spreadOverMany(receipts, d.amount ?? 0, d.basis ?? 'value').rows;
      const taxes = allocateParts(amountTax(d), rows.map((p) => p.amount));
      const lines = rows.map((p, i) => ({ lineKey: `cp-${p.sku}`, sku: p.sku, name: p.name, unit: p.unit, qty: 0, amountBeforeTax: p.amount, taxCode: d.taxCode || p.taxCode, taxAmount: taxes[i]!, note: `Chi phí mua hàng phân bổ (${receipts.map((r) => r.docNo).join(', ')})` }));
      const tax = taxes.reduce((s, t) => s + t, 0);
      links.push(await ingest(trx, auth, { ...base(d, partner, key, version), docType: 'purchase', invoice, dueDate: d.docDate, lines, payments: [], totals: { beforeTax: d.amount ?? 0, tax, total: (d.amount ?? 0) + tax } }, 'Chi phí phân bổ'));
      break;
    }
    case 'rebate': {
      const alloc = d.allocation?.length ? d.allocation : spreadOverMany(refReceipts(d, docs), d.amount ?? 0, d.basis ?? 'value').rows.map((r) => ({ sku: r.sku, name: r.name, amount: r.amount }));
      if (!alloc.length) throw Errors.validation('Phiếu thưởng / chiết khấu bổ sung chưa có phân bổ theo mã hàng: chọn phiếu nhập được giảm giá, hoặc tính ở màn Tính thưởng cuối kỳ');
      const taxes = allocateParts(amountTax(d), alloc.map((a) => a.amount));
      const lines = alloc.filter((a) => a.amount > 0).map((a, i) => ({ lineKey: `tt-${a.sku}`, sku: a.sku, name: a.name ?? a.sku, unit: '', qty: 0, amountBeforeTax: a.amount, taxCode: d.taxCode || 'V08', taxAmount: taxes[i] ?? 0, note: 'Thưởng / chiết khấu sau mua giảm giá trị hàng nhập' }));
      const tax = lines.reduce((s, l) => s + l.taxAmount, 0);
      const reasonCode = await ensureRebateReason(trx, auth.tenantId);
      links.push(await ingest(trx, auth, { ...base(d, partner, key, version), docType: 'purchase_return', reasonCode, invoice, lines, payments: [], totals: { beforeTax: d.amount ?? 0, tax, total: (d.amount ?? 0) + tax } }, 'Thưởng / CK giảm giá vốn'));
      break;
    }
    case 'prepayment':
      links.push(await payVoucher(trx, auth, d, A, d.amount ?? 0, [], 'Ứng trước', true));
      break;
    case 'payment': {
      const prefer = (d.refIds ?? []).flatMap(evOf);
      if (d.amount) links.push(await payVoucher(trx, auth, d, A, d.amount, prefer, 'Trả tiền'));
      if (d.ckttAmount) {
        const items = (await itemsOf(trx, auth.tenantId, prefer, 'credit')).filter((i) => left(i) > 0);
        const it = items[0];
        if (!it) throw Errors.validation('Không còn khoản nợ của phiếu nhập để ghi chiết khấu thanh toán');
        links.push(await voucher(trx, auth, {
          docType: 'manual', branchCode: d.branchCode, docDate: d.docDate, description: `Chiết khấu thanh toán được hưởng — ${d.docNo}`, partnerCode: d.partnerCode, reference: d.docNo, purpose: 'ap_decrease',
          lines: [{ debitAccount: it.account_code, creditAccount: A.finIncome, amount: d.ckttAmount, description: 'Chiết khấu thanh toán trả đúng hạn' }],
          settle: [{ debtItemId: String(it.id), amount: Math.min(d.ckttAmount, left(it)) }],
        }, 'Chiết khấu thanh toán'));
      }
      break;
    }
  }
  return links;
}
