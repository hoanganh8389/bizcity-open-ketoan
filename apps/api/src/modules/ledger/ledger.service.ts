// @bizcity-layer K kernel/ledger
/**
 * Ghi sổ cái — cửa duy nhất để ghi vào ledger_entries / ledger_lines.
 *
 * post(): kiểm tra rồi ghi một bút toán:
 *   1. có dòng, mỗi dòng đúng một bên Nợ hoặc Có, số dương;
 *   2. tổng Nợ = tổng Có (tính bằng xu, không sai số);
 *   3. tài khoản tồn tại, đang dùng, là tài khoản chi tiết;
 *   4. tài khoản theo dõi đối tượng thì dòng phải có đối tượng;
 *   5. kỳ của ngày hạch toán chưa khoá cho (bộ sổ, chi nhánh, loại chứng từ);
 *   6. cấp số bút toán, ghi thân + dòng, cộng số dư theo ngày — tất cả trong giao dịch của người gọi.
 *
 * reverse(): ghi bút toán đảo (đổi bên Nợ/Có) và đánh dấu bút toán gốc "reversed".
 *
 * Mọi hàm nhận `trx` để người gọi gói nhiều thao tác trong một giao dịch.
 */
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { toCents, fromCents } from '@ketoan/contracts';
import type { Db } from '../../db/client.js';
import { toNumber } from '../../db/client.js';
import type { Account } from '../../db/types.js';
import { Errors } from '../../core/errors.js';
import { periodRepository } from '../periods/period.repository.js';
import { NO_PARTNER_ID, ledgerRepository } from './ledger.repository.js';
import { syncDebtItems } from '../debts/debt.service.js';
import type { DraftEntry, DraftLine } from './ledger.types.js';

/** Tiền tố số bút toán: BT26-0000001. */
const ENTRY_PREFIX = 'BT';

/** Tài khoản có tách số dư theo đối tượng không. */
function tracksPartner(a: Account): boolean {
  return a.track_partner || a.is_debt || a.normal_side === 'both';
}

function validateLines(entry: DraftEntry, accounts: Map<string, Account>): void {
  if (!entry.lines.length) throw Errors.posting('Bút toán không có dòng nào');
  let debit = 0;
  let credit = 0;
  const problems: string[] = [];
  entry.lines.forEach((l, i) => {
    const d = toCents(l.debit);
    const c = toCents(l.credit);
    // Số âm chỉ hợp lệ ở bút toán đảo (phương pháp ghi số âm).
    if ((d < 0 || c < 0) && !entry.isReversal) problems.push(`Dòng ${i + 1}: số tiền âm`);
    // Dòng theo mặt hàng (khuyến mãi, thuế 0%, giá vốn chưa tính) và dòng chờ giá vốn được ghi số 0 (migration 0060).
    const zeroOk = d === 0 && c === 0 && Boolean(l.costFill || l.productSku);
    if ((d === 0) === (c === 0) && !zeroOk) problems.push(`Dòng ${i + 1}: phải có đúng một bên Nợ hoặc Có`);
    debit += d;
    credit += c;
    const acc = accounts.get(l.accountCode);
    if (!acc) problems.push(`Tài khoản ${l.accountCode} không có trong danh mục`);
    else {
      if (!acc.is_active) problems.push(`Tài khoản ${l.accountCode} đã ngừng sử dụng`);
      if (!acc.is_posting) problems.push(`Tài khoản ${l.accountCode} là tài khoản tổng hợp, hãy dùng tài khoản chi tiết`);
      if ((acc.track_partner || acc.is_debt) && !l.partnerId) problems.push(`Tài khoản ${l.accountCode} bắt buộc phải chọn đối tượng`);
    }
  });
  if (problems.length) throw Errors.posting('Bút toán không hợp lệ', [...new Set(problems)]);
  if (debit !== credit) throw Errors.unbalanced(undefined, { debit: fromCents(debit), credit: fromCents(credit) });
}

/**
 * Dấu vân tay nội dung của bút toán: mọi thứ in lên sổ (chi nhánh, loại / số chứng từ, hoá đơn, ngày, lý do, đối tượng,
 * diễn giải, từng dòng Nợ / Có kèm tài khoản, đối tượng, thuế, mặt hàng, chiều), KHÔNG gồm phiên bản chứng từ.
 * Định khoản lại giữ nguyên bút toán đang có hiệu lực cùng dấu vân tay (xem postingService.post, ctx.reuse).
 */
export function entryContentHash(entry: DraftEntry): string {
  const body = {
    b: entry.branchId, t: entry.docType, n: entry.docNo, i: entry.invoiceNo ?? null, d: entry.docDate, p: entry.postingDate,
    r: entry.reasonCode ?? null, o: entry.partnerId ?? null, s: entry.description,
    l: entry.lines.map((l) => [l.accountCode, toCents(l.debit), toCents(l.credit), l.pairNo, l.part, l.partnerId ?? null, l.taxCode ?? null, l.productSku ?? null, l.description ?? '', l.sourceLineKey ?? null, sortKeys(l.dims ?? {}), ...(l.costFill ? [l.costFill] : [])]),
  };
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

/**
 * Dấu vân tay PHẦN SỐ LIỆU (migration 0062): như entryContentHash nhưng BỎ thông tin đầu — số chứng từ, số hoá đơn, lý do,
 * đối tượng ở đầu, diễn giải. Trùng phần này mà khác content_hash = chỉ thông tin đầu đổi (ví dụ vừa phát hành hoá đơn) →
 * cập nhật tại chỗ, không đảo bút toán.
 */
export function entryBodyHash(entry: DraftEntry): string {
  const body = {
    b: entry.branchId, t: entry.docType, d: entry.docDate, p: entry.postingDate,
    l: entry.lines.map((l) => [l.accountCode, toCents(l.debit), toCents(l.credit), l.pairNo, l.part, l.partnerId ?? null, l.taxCode ?? null, l.productSku ?? null, l.description ?? '', l.sourceLineKey ?? null, sortKeys(l.dims ?? {}), ...(l.costFill ? [l.costFill] : [])]),
  };
  return createHash('sha256').update(JSON.stringify(body)).digest('hex');
}

function sortKeys(o: Record<string, unknown>): [string, unknown][] {
  return Object.keys(o).sort().map((k) => [k, o[k]]);
}

export const ledgerService = {
  async post(trx: Db, tenantId: string, actor: string, entry: DraftEntry, accounts: Map<string, Account>): Promise<{ id: string; entryNo: string }> {
    validateLines(entry, accounts);


    const period = await periodRepository.ensurePeriodFor(trx, tenantId, entry.postingDate);
    if (await periodRepository.isLocked(trx, tenantId, period.id, entry.branchId, entry.docType)) {
      throw Errors.periodLocked();
    }

    const seq = await ledgerRepository.nextEntryNo(trx, tenantId, period.year);
    const entryNo = `${ENTRY_PREFIX}${String(period.year).slice(2)}-${String(seq).padStart(7, '0')}`;
    const total = fromCents(entry.lines.reduce((s, l) => s + toCents(l.debit), 0));

    const created = await ledgerRepository.insertEntry(trx, {
      tenant_id: tenantId,
      branch_id: entry.branchId,
      period_id: period.id,
      entry_no: entryNo,
      doc_type: entry.docType,
      event_id: entry.sourceDocumentId ?? null,
      event_version: entry.sourceVersion ?? null,
      doc_no: entry.docNo,
      invoice_no: entry.invoiceNo ?? null,
      doc_date: entry.docDate,
      posting_date: entry.postingDate,
      reason_code: entry.reasonCode ?? null,
      partner_id: entry.partnerId ?? null,
      description: entry.description,
      total,
      is_reversal: entry.isReversal ?? false,
      reverses_entry_id: entry.reversesEntryId ?? null,
      content_hash: entry.isReversal ? null : entryContentHash(entry),
      body_hash: entry.isReversal ? null : entryBodyHash(entry),
      created_by: actor,
    });

    await ledgerRepository.insertLines(
      trx,
      entry.lines.map((l, i) => ({
        entry_id: created.id,
        tenant_id: tenantId,
        branch_id: entry.branchId,
        posting_date: entry.postingDate,
        line_no: i + 1,
        pair_no: l.pairNo,
        account_code: l.accountCode,
        debit: l.debit,
        credit: l.credit,
        partner_id: l.partnerId ?? null,
        tax_code: l.taxCode ?? null,
        part: l.part,
        product_sku: l.productSku ?? null,
        description: l.description ?? '',
        source_line_key: l.sourceLineKey ?? null,
        dims: JSON.stringify(l.dims ?? {}),
        cost_fill: l.costFill ?? null,
      })),
    );

    await ledgerRepository.addDailyBalances(trx, aggregateBalances(tenantId, entry.branchId, entry.postingDate, entry.lines, accounts));
    // Khoản công nợ theo chứng từ: chỉ cần tính lại khi bút toán có dòng gắn đối tượng (bút toán đảo: tính lại ở reverse).
    if (entry.sourceDocumentId && !entry.isReversal && entry.lines.some((l) => l.partnerId)) await syncDebtItems(trx, tenantId, entry.sourceDocumentId);
    return { id: created.id, entryNo };
  },

  /**
   * Đảo một bút toán theo phương pháp GHI SỐ ÂM: bút toán mới cùng tài khoản, cùng bên,
   * số tiền âm, cùng ngày hạch toán với bút toán gốc → số dư và số phát sinh của kỳ gốc
   * trở về như chưa từng ghi. Kỳ gốc đã khoá thì không đảo được.
   */
  async reverse(trx: Db, tenantId: string, actor: string, entryId: string, accounts: Map<string, Account>, reason = 'Đảo bút toán'): Promise<{ id: string; entryNo: string }> {
    const original = await ledgerRepository.findEntry(trx, tenantId, entryId);
    if (!original) throw Errors.notFound('bút toán');
    if (original.status === 'reversed') throw Errors.conflict('Bút toán đã được đảo trước đó');
    const lines = await ledgerRepository.findLines(trx, entryId);

    const draft: DraftEntry = {
      branchId: original.branch_id,
      docType: original.doc_type as DraftEntry['docType'],
      docNo: original.doc_no,
      invoiceNo: original.invoice_no,
      docDate: original.doc_date,
      postingDate: original.posting_date,
      reasonCode: original.reason_code,
      partnerId: original.partner_id,
      description: `${reason}: ${original.entry_no}`,
      sourceDocumentId: original.event_id,
      sourceVersion: original.event_version,
      isReversal: true,
      reversesEntryId: original.id,
      lines: lines.map<DraftLine>((l) => ({
        accountCode: l.account_code,
        debit: -toNumber(l.debit),
        credit: -toNumber(l.credit),
        pairNo: l.pair_no,
        part: l.part as DraftLine['part'],
        partnerId: l.partner_id,
        taxCode: l.tax_code,
        productSku: l.product_sku,
        description: l.description,
        sourceLineKey: l.source_line_key,
        costFill: l.cost_fill as DraftLine['costFill'],
      })),
    };
    // Bút toán đảo phải ghi được kể cả khi tài khoản đã ngừng dùng → bỏ qua kiểm "đang dùng".
    const relaxed = new Map([...accounts].map(([k, a]) => [k, { ...a, is_active: true }]));
    const created = await ledgerService.post(trx, tenantId, actor, draft, relaxed);
    await ledgerRepository.addLink(trx, { tenantId, entryId: created.id, targetEntryId: original.id, type: 'reversal', reason, actor });
    await ledgerRepository.markReversed(trx, original.id);
    if (original.event_id && lines.some((l) => l.partner_id)) await syncDebtItems(trx, tenantId, original.event_id);
    return created;
  },

  /**
   * GHI ĐÈ số tiền các cặp dòng giá vốn chờ tính giá (cost_fill) — NGOẠI LỆ CÓ CHỦ ĐÍCH của luật "sổ cái chỉ thêm":
   * tính giá vốn (lần đầu hay tính lại) sửa thẳng số tiền, không ghi bút toán đảo, cho nhẹ sổ (người dùng chốt
   * 20/10/2026, tạm thời). Cập nhật cả số dư theo ngày, tổng tiền bút toán, khoản công nợ (nếu dòng gắn đối tượng).
   * Trigger DB chỉ cho sửa khi giao dịch bật ketoan.cost_overwrite và dòng thuộc bút toán còn hiệu lực.
   */
  async overwriteCostPairs(
    trx: Db,
    tenantId: string,
    pairs: { entryId: string; pairNo: number; amount: number }[],
    accounts: Map<string, Account>,
  ): Promise<number> {
    if (!pairs.length) return 0;
    await sql`SELECT set_config('ketoan.cost_overwrite', 'on', true)`.execute(trx);
    // Theo lô (một tháng 70 cửa hàng có thể hàng trăm nghìn dòng): đọc mọi dòng chờ của các bút toán liên quan một lượt.
    const want = new Map(pairs.map((p) => [`${p.entryId}|${p.pairNo}`, toCents(p.amount)]));
    const entryIds = [...new Set(pairs.map((p) => p.entryId))];
    type Row = { id: string; entry_id: string; pair_no: number; cost_fill: string; account_code: string; partner_id: string | null; debit: string; credit: string; branch_id: string; posting_date: string; period_id: string; doc_type: string; event_id: string | null };
    const rows: Row[] = [];
    for (let i = 0; i < entryIds.length; i += 5000) {
      const res = await sql<Row>`
        SELECT l.id::text, l.entry_id::text, l.pair_no, l.cost_fill, l.account_code, l.partner_id::text, l.debit, l.credit,
               e.branch_id::text, e.posting_date::text, e.period_id::text, e.doc_type, e.event_id::text
          FROM ledger_lines l JOIN ledger_entries e ON e.id = l.entry_id
         WHERE e.tenant_id = ${tenantId} AND e.status = 'posted' AND NOT e.is_reversal AND l.cost_fill IS NOT NULL
           AND l.entry_id = ANY(${entryIds.slice(i, i + 5000)}::bigint[])`.execute(trx);
      rows.push(...res.rows);
    }
    // Kỳ đã khoá (theo kỳ, chi nhánh, loại chứng từ): không ghi đè.
    const lockKeys = new Map(rows.map((r) => [`${r.period_id}|${r.branch_id}|${r.doc_type}`, r]));
    for (const r of lockKeys.values()) if (await periodRepository.isLocked(trx, tenantId, r.period_id, r.branch_id, r.doc_type)) throw Errors.periodLocked();

    const byPair = new Map<string, { debit?: Row; credit?: Row }>();
    for (const r of rows) {
      const k = `${r.entry_id}|${r.pair_no}`;
      if (!want.has(k)) continue;
      const cur = byPair.get(k) ?? {};
      if (r.cost_fill === 'debit') cur.debit = r; else cur.credit = r;
      byPair.set(k, cur);
    }
    const ids: string[] = [];
    const debits: number[] = [];
    const credits: number[] = [];
    const entryDelta = new Map<string, number>();
    const balance = new Map<string, { tenant_id: string; branch_id: string; account_code: string; posting_date: string; partner_id: string; debit: number; credit: number }>();
    const addBalance = (r: Row, d: number, c: number) => {
      const acc = accounts.get(r.account_code);
      const partnerId = acc && tracksPartner(acc) && r.partner_id ? r.partner_id : NO_PARTNER_ID;
      const k = `${r.branch_id}|${r.posting_date}|${r.account_code}|${partnerId}`;
      const cur = balance.get(k) ?? { tenant_id: tenantId, branch_id: r.branch_id, account_code: r.account_code, posting_date: r.posting_date, partner_id: partnerId, debit: 0, credit: 0 };
      cur.debit += d;
      cur.credit += c;
      balance.set(k, cur);
    };
    const touchedEvents = new Set<string>();
    let changed = 0;
    for (const [k, { debit: dl, credit: cl }] of byPair) {
      if (!dl || !cl) continue;
      const target = want.get(k)!;
      const delta = target - toCents(toNumber(dl.debit));
      if (delta === 0) continue;
      ids.push(dl.id, cl.id);
      debits.push(fromCents(target), 0);
      credits.push(0, fromCents(target));
      entryDelta.set(dl.entry_id, (entryDelta.get(dl.entry_id) ?? 0) + delta);
      addBalance(dl, delta, 0);
      addBalance(cl, 0, delta);
      if (dl.event_id && (dl.partner_id || cl.partner_id)) touchedEvents.add(dl.event_id);
      changed += 1;
    }
    for (let i = 0; i < ids.length; i += 10000) {
      await sql`
        UPDATE ledger_lines l SET debit = v.debit, credit = v.credit
          FROM (SELECT unnest(${ids.slice(i, i + 10000)}::bigint[]) AS id, unnest(${debits.slice(i, i + 10000)}::numeric[]) AS debit,
                       unnest(${credits.slice(i, i + 10000)}::numeric[]) AS credit) v
         WHERE l.id = v.id`.execute(trx);
    }
    const eIds = [...entryDelta.keys()];
    for (let i = 0; i < eIds.length; i += 10000) {
      const part = eIds.slice(i, i + 10000);
      await sql`
        UPDATE ledger_entries e SET total = e.total + v.delta
          FROM (SELECT unnest(${part}::bigint[]) AS id, unnest(${part.map((id) => fromCents(entryDelta.get(id)!))}::numeric[]) AS delta) v
         WHERE e.id = v.id`.execute(trx);
    }
    const bal = [...balance.values()].map((b) => ({ ...b, debit: fromCents(b.debit), credit: fromCents(b.credit) }));
    for (let i = 0; i < bal.length; i += 1000) await ledgerRepository.addDailyBalances(trx, bal.slice(i, i + 1000));
    for (const ev of touchedEvents) await syncDebtItems(trx, tenantId, ev);
    return changed;
  },
};

/** Gom dòng theo (tài khoản, đối tượng) để cộng vào số dư theo ngày. */
function aggregateBalances(tenantId: string, branchId: string, date: string, lines: DraftLine[], accounts: Map<string, Account>) {
  const map = new Map<string, { account_code: string; partner_id: string; debit: number; credit: number }>();
  for (const l of lines) {
    const acc = accounts.get(l.accountCode)!;
    const partnerId = tracksPartner(acc) && l.partnerId ? l.partnerId : NO_PARTNER_ID;
    const key = `${l.accountCode}|${partnerId}`;
    const cur = map.get(key) ?? { account_code: l.accountCode, partner_id: partnerId, debit: 0, credit: 0 };
    cur.debit = fromCents(toCents(cur.debit) + toCents(l.debit));
    cur.credit = fromCents(toCents(cur.credit) + toCents(l.credit));
    map.set(key, cur);
  }
  return [...map.values()].map((v) => ({ tenant_id: tenantId, branch_id: branchId, posting_date: date, ...v }));
}
