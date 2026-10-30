// @bizcity-layer K kernel/subledgers/debts
/**
 * Khoản công nợ theo chứng từ (debt_items) và đối trừ (debt_allocations).
 *
 * Nguồn duy nhất là sổ: mỗi lần một chứng từ được ghi sổ, sửa (đảo + ghi lại) hoặc huỷ, `syncDebtItems` tính lại
 * phát sinh thuần Nợ − Có của chứng từ trên từng (tài khoản theo dõi đối tượng, đối tượng)
 * rồi cập nhật khoản công nợ. Vì cộng mọi bút toán của chứng từ (kể cả bút toán
 * ghi số âm) nên chứng từ đã huỷ tự về 0 và khoản bị xoá.
 *
 * Đối trừ: ghép một khoản ghi Nợ với một khoản ghi Có cùng đối tượng, cùng tài khoản. Khoản bị sửa làm số tiền nhỏ
 * hơn phần đã đối trừ, đổi bên, hoặc bị huỷ thì các đối trừ của nó bị gỡ (ghép lại sau).
 */
import { fromCents, toCents } from '@ketoan/contracts';
import { sql } from 'kysely';
import { toNumber, type Db } from '../../db/client.js';
import { Errors } from '../../core/errors.js';

const addDays = (day: string, n: number): string => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Tính lại "đã đối trừ" của các khoản. */
async function recomputeSettled(trx: Db, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (!unique.length) return;
  await sql`
    UPDATE debt_items i
       SET settled_amount = COALESCE((SELECT SUM(a.amount) FROM debt_allocations a WHERE a.debit_item_id = i.id OR a.credit_item_id = i.id), 0),
           updated_at = now()
     WHERE i.id = ANY(${unique}::bigint[])`.execute(trx);
}

/** Gỡ mọi đối trừ của các khoản; trả về id các khoản bị ảnh hưởng (cả khoản đối ứng). */
async function dropAllocationsOf(trx: Db, itemIds: string[]): Promise<string[]> {
  if (!itemIds.length) return [];
  const rows = await trx.selectFrom('debt_allocations').select(['id', 'debit_item_id', 'credit_item_id'])
    .where((eb) => eb.or([eb('debit_item_id', 'in', itemIds), eb('credit_item_id', 'in', itemIds)])).execute();
  if (!rows.length) return [];
  await trx.deleteFrom('debt_allocations').where('id', 'in', rows.map((r) => r.id)).execute();
  return rows.flatMap((r) => [r.debit_item_id, r.credit_item_id]);
}

/** Đồng bộ khoản công nợ của một chứng từ theo sổ. Gọi trong cùng giao dịch ghi sổ. */
export async function syncDebtItems(trx: Db, tenantId: string, eventId: string): Promise<void> {
  const res = await sql<{ account_code: string; partner_id: string; net: string }>`
    SELECT l.account_code, l.partner_id, SUM(l.debit - l.credit) AS net
      FROM ledger_lines l
      JOIN ledger_entries e ON e.id = l.entry_id
      JOIN accounts a ON a.tenant_id = l.tenant_id AND a.code = l.account_code
     WHERE e.tenant_id = ${tenantId} AND e.event_id = ${eventId} AND l.partner_id IS NOT NULL
       AND (a.track_partner OR a.is_debt OR a.normal_side = 'both')
     GROUP BY 1, 2`.execute(trx);
  const wanted = new Map(
    res.rows
      .filter((r) => toCents(toNumber(r.net)) !== 0)
      .map((r) => [`${r.partner_id}|${r.account_code}`, { partnerId: r.partner_id, accountCode: r.account_code, cents: toCents(toNumber(r.net)) }]),
  );
  const existing = await trx.selectFrom('debt_items').selectAll().where('event_id', '=', eventId).execute();
  if (!wanted.size && !existing.length) return;

  const touched: string[] = [];
  const gone = existing.filter((i) => !wanted.has(`${i.partner_id}|${i.account_code}`));
  if (gone.length) {
    touched.push(...(await dropAllocationsOf(trx, gone.map((i) => i.id))));
    await trx.deleteFrom('debt_items').where('id', 'in', gone.map((i) => i.id)).execute();
  }
  if (wanted.size) {
    const ev = await trx.selectFrom('accounting_events').select(['doc_no', 'doc_date', 'branch_id', 'payload']).where('id', '=', eventId).executeTakeFirstOrThrow();
    const terms = await trx.selectFrom('partners').select(['id', 'payment_term_days']).where('id', 'in', [...wanted.values()].map((w) => w.partnerId)).execute();
    const termOf = new Map(terms.map((p) => [p.id, p.payment_term_days ?? 0]));
    const explicitDue = String((ev.payload as { dueDate?: unknown } | null)?.dueDate ?? '');
    for (const w of wanted.values()) {
      const side = w.cents > 0 ? 'debit' : 'credit';
      const amount = fromCents(Math.abs(w.cents));
      const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(explicitDue) ? explicitDue : addDays(ev.doc_date, termOf.get(w.partnerId) ?? 0);
      const cur = existing.find((i) => i.partner_id === w.partnerId && i.account_code === w.accountCode);
      if (!cur) {
        await trx.insertInto('debt_items').values({ tenant_id: tenantId, event_id: eventId, partner_id: w.partnerId, account_code: w.accountCode, side, amount, branch_id: ev.branch_id, doc_no: ev.doc_no, doc_date: ev.doc_date, due_date: dueDate }).execute();
        continue;
      }
      // Đổi bên, hoặc số tiền mới nhỏ hơn phần đã đối trừ: gỡ đối trừ của khoản này.
      const mustDrop = cur.side !== side || toCents(amount) < toCents(toNumber(cur.settled_amount));
      if (mustDrop) touched.push(...(await dropAllocationsOf(trx, [cur.id])));
      await trx.updateTable('debt_items').set({ side, amount, branch_id: ev.branch_id, doc_no: ev.doc_no, doc_date: ev.doc_date, due_date: dueDate, updated_at: new Date(), ...(mustDrop ? { settled_amount: 0 } : {}) }).where('id', '=', cur.id).execute();
    }
  }
  const goneIds = new Set(gone.map((i) => i.id));
  await recomputeSettled(trx, touched.filter((id) => !goneIds.has(id)));
}

export interface AllocationPair { debitItemId: string; creditItemId: string; amount: number }

/** Ghi các cặp đối trừ. Mỗi cặp: cùng đối tượng, cùng tài khoản, một khoản ghi Nợ và một khoản ghi Có, không vượt phần còn lại. */
export async function allocate(trx: Db, tenantId: string, pairs: AllocationPair[], a: { actor: string; auto?: boolean; date?: string; note?: string }): Promise<number> {
  let n = 0;
  for (const p of pairs) {
    if (!(p.amount > 0)) continue;
    const items = await trx.selectFrom('debt_items').selectAll().where('tenant_id', '=', tenantId).where('id', 'in', [p.debitItemId, p.creditItemId]).forUpdate().execute();
    const d = items.find((i) => i.id === p.debitItemId);
    const c = items.find((i) => i.id === p.creditItemId);
    if (!d || !c) throw Errors.notFound('khoản công nợ');
    if (d.side !== 'debit' || c.side !== 'credit') throw Errors.validation(`Đối trừ phải ghép một khoản ghi Nợ với một khoản ghi Có (${d.doc_no} – ${c.doc_no})`);
    if (d.partner_id !== c.partner_id || d.account_code !== c.account_code) throw Errors.validation(`Hai khoản ${d.doc_no} và ${c.doc_no} khác đối tượng hoặc khác tài khoản; dùng Cấn trừ công nợ để bù trừ khác tài khoản`);
    const cents = toCents(p.amount);
    for (const i of [d, c]) {
      const left = toCents(toNumber(i.amount)) - toCents(toNumber(i.settled_amount));
      if (cents > left) throw Errors.validation(`Số đối trừ ${p.amount.toLocaleString('vi-VN')} lớn hơn phần còn lại ${fromCents(left).toLocaleString('vi-VN')} của chứng từ ${i.doc_no}`);
    }
    await trx.insertInto('debt_allocations').values({ tenant_id: tenantId, debit_item_id: d.id, credit_item_id: c.id, amount: p.amount, alloc_date: a.date ?? new Date().toISOString().slice(0, 10), is_auto: a.auto ?? false, note: a.note ?? '', created_by: a.actor }).execute();
    await recomputeSettled(trx, [d.id, c.id]);
    n += 1;
  }
  return n;
}

/** Gỡ một đối trừ. */
export async function unallocate(trx: Db, tenantId: string, allocationId: string): Promise<void> {
  const row = await trx.selectFrom('debt_allocations').select(['debit_item_id', 'credit_item_id']).where('tenant_id', '=', tenantId).where('id', '=', allocationId).executeTakeFirst();
  if (!row) throw Errors.notFound('đối trừ');
  await trx.deleteFrom('debt_allocations').where('id', '=', allocationId).execute();
  await recomputeSettled(trx, [row.debit_item_id, row.credit_item_id]);
}

/**
 * Tự đối trừ theo thứ tự hạn cũ trước: trong từng (đối tượng, tài khoản), khoản ghi Nợ cũ nhất ghép với khoản ghi Có
 * cũ nhất cho tới khi một bên hết. Trả về số cặp đã ghép.
 */
export async function autoAllocate(trx: Db, tenantId: string, f: { partnerId?: string; accountCode?: string; actor: string }): Promise<number> {
  let q = trx.selectFrom('debt_items').select(['id', 'partner_id', 'account_code', 'side', 'amount', 'settled_amount'])
    .where('tenant_id', '=', tenantId).whereRef('amount', '>', 'settled_amount');
  if (f.partnerId) q = q.where('partner_id', '=', f.partnerId);
  if (f.accountCode) q = q.where('account_code', 'like', `${f.accountCode}%`);
  const items = await q.orderBy('partner_id').orderBy('account_code').orderBy('due_date').orderBy('doc_date').orderBy('id').forUpdate().execute();
  const groups = new Map<string, { debit: { id: string; left: number }[]; credit: { id: string; left: number }[] }>();
  for (const i of items) {
    const key = `${i.partner_id}|${i.account_code}`;
    const g = groups.get(key) ?? { debit: [], credit: [] };
    g[i.side as 'debit' | 'credit'].push({ id: i.id, left: toCents(toNumber(i.amount)) - toCents(toNumber(i.settled_amount)) });
    groups.set(key, g);
  }
  const pairs: { debit_item_id: string; credit_item_id: string; amount: number }[] = [];
  for (const g of groups.values()) {
    let di = 0;
    let ci = 0;
    while (di < g.debit.length && ci < g.credit.length) {
      const d = g.debit[di]!;
      const c = g.credit[ci]!;
      const take = Math.min(d.left, c.left);
      pairs.push({ debit_item_id: d.id, credit_item_id: c.id, amount: fromCents(take) });
      d.left -= take;
      c.left -= take;
      if (d.left === 0) di += 1;
      if (c.left === 0) ci += 1;
    }
  }
  if (!pairs.length) return 0;
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < pairs.length; i += 500) {
    await trx.insertInto('debt_allocations').values(pairs.slice(i, i + 500).map((p) => ({ tenant_id: tenantId, ...p, alloc_date: today, is_auto: true, created_by: f.actor }))).execute();
  }
  await recomputeSettled(trx, pairs.flatMap((p) => [p.debit_item_id, p.credit_item_id]));
  return pairs.length;
}

/**
 * Phiếu thu / chi vừa ghi sổ thanh toán cho các khoản được chọn: ghép khoản của phiếu (cùng đối tượng, cùng tài khoản,
 * bên đối ứng) với từng khoản được chọn. Gỡ các đối trừ cũ của phiếu trước khi ghép lại (trường hợp sửa phiếu).
 */
export async function settleFromEvent(trx: Db, tenantId: string, eventId: string, settle: { debtItemId: string; amount: number }[], actor: string): Promise<void> {
  const own = await trx.selectFrom('debt_items').selectAll().where('event_id', '=', eventId).execute();
  const touched = await dropAllocationsOf(trx, own.map((i) => i.id));
  await recomputeSettled(trx, touched);
  for (const s of settle) {
    const target = await trx.selectFrom('debt_items').selectAll().where('tenant_id', '=', tenantId).where('id', '=', s.debtItemId).executeTakeFirst();
    if (!target) throw Errors.notFound('khoản công nợ được chọn');
    const mine = own.find((i) => i.partner_id === target.partner_id && i.account_code === target.account_code && i.side !== target.side);
    if (!mine) throw Errors.validation(`Phiếu không có dòng nào ghi vào tài khoản ${target.account_code} của đối tượng trên chứng từ ${target.doc_no} để thanh toán khoản này`);
    const pair = target.side === 'debit' ? { debitItemId: target.id, creditItemId: mine.id } : { debitItemId: mine.id, creditItemId: target.id };
    await allocate(trx, tenantId, [{ ...pair, amount: s.amount }], { actor });
  }
}

/**
 * Ghép khoản công nợ của chứng từ `eventId` với khoản công nợ của từng chứng từ đích (theo docKey, số tiền), cùng đối
 * tượng, cùng tài khoản, bên đối ứng, không vượt phần còn lại của hai bên. `dropAll`: gỡ mọi đối trừ cũ của chứng từ
 * trước (phiếu thanh toán); không thì chỉ gỡ đối trừ cũ giữa chứng từ này và các chứng từ đích (phiếu bán đối trừ
 * phiếu hoàn — giữ các đối trừ với phiếu thu).
 */
async function settleAgainst(trx: Db, tenantId: string, eventId: string, targets: { docKey: string; amount: number }[], a: { actor: string; date?: string; note: string; dropAll: boolean }): Promise<void> {
  const own = await trx.selectFrom('debt_items').selectAll().where('event_id', '=', eventId).execute();
  if (!own.length) return;
  const resolved: { items: typeof own; amount: number }[] = [];
  for (const t of targets) {
    const ev = await trx.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', '=', t.docKey).executeTakeFirst();
    resolved.push({ items: ev ? await trx.selectFrom('debt_items').selectAll().where('event_id', '=', ev.id).execute() : [], amount: t.amount });
  }
  if (a.dropAll) {
    await recomputeSettled(trx, await dropAllocationsOf(trx, own.map((i) => i.id)));
  } else {
    const mine = own.map((i) => i.id);
    const theirs = resolved.flatMap((r) => r.items.map((i) => i.id));
    if (theirs.length) {
      const del = await trx.deleteFrom('debt_allocations')
        .where((eb) => eb.or([
          eb.and([eb('debit_item_id', 'in', mine), eb('credit_item_id', 'in', theirs)]),
          eb.and([eb('debit_item_id', 'in', theirs), eb('credit_item_id', 'in', mine)]),
        ]))
        .returning(['debit_item_id', 'credit_item_id']).execute();
      await recomputeSettled(trx, [...new Set(del.flatMap((d) => [d.debit_item_id, d.credit_item_id]))]);
    }
  }
  for (const r of resolved) {
    let need = toCents(r.amount);
    for (const target of r.items) {
      if (need <= 0) break;
      const mine = own.find((i) => i.partner_id === target.partner_id && i.account_code === target.account_code && i.side !== target.side);
      if (!mine) continue;
      const fresh = await trx.selectFrom('debt_items').select(['id', 'amount', 'settled_amount']).where('id', 'in', [mine.id, target.id]).execute();
      const left = (id: string) => { const x = fresh.find((y) => y.id === id)!; return toCents(toNumber(x.amount)) - toCents(toNumber(x.settled_amount)); };
      const take = Math.min(need, left(mine.id), left(target.id));
      if (take <= 0) continue;
      const pair = target.side === 'debit' ? { debitItemId: target.id, creditItemId: mine.id } : { debitItemId: mine.id, creditItemId: target.id };
      await allocate(trx, tenantId, [{ ...pair, amount: fromCents(take) }], { actor: a.actor, auto: true, date: a.date, note: a.note });
      need -= take;
    }
  }
}

/**
 * Phiếu thanh toán (thanh toán khách hàng / nhà cung cấp) ghi trả cho hoá đơn nào (`lines[].invoiceDocKey`, như chi tiết
 * phiếu thanh toán trỏ về hoá đơn): ghép công nợ của phiếu với đúng chứng từ đó. Hoá đơn chưa định khoản thì bỏ qua —
 * khi hoá đơn định khoản sẽ ghép lại (settleLinkedTo).
 */
export async function settleByInvoiceKeys(trx: Db, tenantId: string, paymentEventId: string, actor: string): Promise<void> {
  const ev = await trx.selectFrom('accounting_events').select(['payload', 'doc_date']).where('id', '=', paymentEventId).executeTakeFirst();
  const lines = ((ev?.payload as { lines?: { invoiceDocKey?: string; amount?: number }[] } | null)?.lines ?? []).filter((l) => l.invoiceDocKey && (l.amount ?? 0) > 0);
  await settleAgainst(trx, tenantId, paymentEventId, lines.map((l) => ({ docKey: l.invoiceDocKey!, amount: l.amount! })), { actor, date: ev?.doc_date, note: 'Thanh toán theo hoá đơn', dropAll: true });
}

/** Phiếu bán đối trừ phiếu hoàn (đổi trả, `offsets`): đối trừ công nợ giữa hai chứng từ, không có tiền thật. */
export async function settleOffsets(trx: Db, tenantId: string, saleEventId: string, actor: string): Promise<void> {
  const ev = await trx.selectFrom('accounting_events').select(['payload', 'doc_date']).where('id', '=', saleEventId).executeTakeFirst();
  const offsets = ((ev?.payload as { offsets?: { docKey?: string; amount?: number }[] } | null)?.offsets ?? []).filter((o) => o.docKey && (o.amount ?? 0) > 0);
  if (!offsets.length) return;
  await settleAgainst(trx, tenantId, saleEventId, offsets.map((o) => ({ docKey: o.docKey!, amount: o.amount! })), { actor, date: ev?.doc_date, note: 'Đối trừ hàng bán trả lại (đổi trả)', dropAll: false });
}

/**
 * Chứng từ vừa định khoản: ghép lại các chứng từ đã nhận trước đó có trỏ tới nó — phiếu thanh toán ghi trả hoá đơn này
 * (invoiceDocKey), phiếu bán đối trừ phiếu hoàn này (offsets).
 */
export async function settleLinkedTo(trx: Db, tenantId: string, docKey: string, actor: string): Promise<void> {
  const pays = await sql<{ id: string }>`
    SELECT id FROM accounting_events
     WHERE tenant_id = ${tenantId} AND doc_type IN ('customer_payment', 'supplier_payment') AND posted_version IS NOT NULL AND status <> 'cancelled'
       AND payload->'lines' @> ${JSON.stringify([{ invoiceDocKey: docKey }])}::jsonb`.execute(trx);
  for (const p of pays.rows) await settleByInvoiceKeys(trx, tenantId, String(p.id), actor);
  const sales = await sql<{ id: string }>`
    SELECT id FROM accounting_events
     WHERE tenant_id = ${tenantId} AND doc_type = 'sale' AND posted_version IS NOT NULL AND status <> 'cancelled'
       AND payload->'offsets' @> ${JSON.stringify([{ docKey }])}::jsonb`.execute(trx);
  for (const x of sales.rows) await settleOffsets(trx, tenantId, String(x.id), actor);
}
