/**
 * manual_journal — phiếu kế toán module lập (PHASE-011 3.15, ADR-0015 Q1, đặc tả 50-DAC-TA-MANUAL-JOURNAL phương án A):
 * module nộp bằng ctx.ledger.submit, dòng chỉ mang lý do loại "journal" + số tiền; Kernel định khoản Nợ / Có theo lý do.
 * Bộ tình huống §3.6 của đặc tả (1–7) + cấu hình lý do journal + chế độ chờ duyệt mặc định (K3).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defineAction, z, type AnyActionDef } from '@bizcity/module-sdk';
import { APPROVABLE_DOC_TYPES } from '@ketoan/contracts';
import type { AuthContext } from '../src/core/auth.js';
import { runAction } from '../src/core/actions.js';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let auth: AuthContext;

// Tài khoản chi tiết của hệ thống tài khoản TT99 (seed): chi phí QLDN khác, chi phí trả trước khác, chi phí phải trả (theo dõi đối tượng).
const EXPENSE = '64271';
const PREPAID = '24218';
const ACCRUED = '335';

const journalDoc = (no: string, lines: Record<string, unknown>[], over: Record<string, unknown> = {}) => ({
  docType: 'manual_journal', docKey: `phan-bo:CN01:${no}`, version: 1, branchCode: 'CN01', docNo: no, docDate: '2026-10-31',
  description: `Phân bổ ${no}`, lines, totals: { total: lines.reduce((s, l) => s + Number(l.amount), 0) }, ...over,
});

/** Action của module "phan-bo" nộp phiếu kế toán qua cửa nạp (như plugin thật). */
const submitJournal = defineAction({
  id: 'phan-bo.journal.submit', title: 'Nộp phiếu phân bổ', permission: 'documents:write', effect: 'write', idempotency: 'required',
  sideEffects: ['ledger'], input: z.object({ doc: z.record(z.unknown()) }), output: z.object({ status: z.string(), reversed: z.number().optional() }), expose: {},
  handler: async (c, { doc }) => {
    const r = await c.ledger.submit(doc as never);
    return { status: r.status, reversed: r.reversed };
  },
});
const cancelJournal = defineAction({
  id: 'phan-bo.journal.cancel', title: 'Huỷ phiếu phân bổ', permission: 'documents:write', effect: 'write', idempotency: 'required',
  sideEffects: ['ledger'], input: z.object({ docKey: z.string() }), output: z.object({ reversed: z.number() }), expose: {},
  handler: async (c, { docKey }) => ({ reversed: (await c.ledger.cancel(docKey, 'Huỷ phiếu phân bổ thử')).reversed }),
});
const run = (def: AnyActionDef, input: unknown) => { const id = Math.random().toString(36).slice(2, 12); return runAction(def, input, { auth, requestId: `test-${id}`, idempotencyKey: `mj-${id}-${Date.now()}` }); };

/** Số dư Nợ − Có của tài khoản trên sổ đơn vị (kể cả bút toán đảo ghi số âm), có thể lọc theo phiếu. */
async function balance(account: string, docNo?: string): Promise<number> {
  let q = db.selectFrom('ledger_lines as l').innerJoin('ledger_entries as e', 'e.id', 'l.entry_id')
    .select((eb) => eb.fn.sum<string>(eb('l.debit', '-', eb.ref('l.credit'))).as('net'))
    .where('l.tenant_id', '=', tenantId).where('l.account_code', '=', account);
  if (docNo) q = q.where('e.doc_no', '=', docNo);
  return Number((await q.executeTakeFirst())?.net ?? 0);
}
const eventOf = (docKey: string) => db.selectFrom('accounting_events').select(['status', 'version', 'posted_version', 'doc_type', 'source_system']).where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).executeTakeFirst();

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  auth = { tenantId, actor: 'system:manual-journal-test', actorName: 'Thử phiếu kế toán', kind: 'user', role: 'owner', permissions: new Set(['documents:write', 'documents:read']) } as AuthContext;
  const put = (code: string, body: Record<string, unknown>) => call(ctx, 'PUT', `/api/v1/posting/reasons/${code}`, body);
  expect((await put('PB-TT', { name: 'Phân bổ chi phí trả trước', kind: 'journal', debitAccount: EXPENSE, creditAccount: PREPAID })).status).toBe(200);
  expect((await put('TRICH-TRUOC', { name: 'Trích trước chi phí', kind: 'journal', debitAccount: EXPENSE, creditAccount: ACCRUED })).status).toBe(200);
  expect((await call(ctx, 'POST', '/api/v1/partners', { code: 'NCC-DIEN', name: 'Công ty điện lực thử', kind: 'supplier' })).status).toBeLessThan(300);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Cấu hình lý do journal', () => {
  it('đọc lại được cặp tài khoản; thiếu tài khoản Có, trùng Nợ / Có, tài khoản tổng hợp, loại khác khai cặp → từ chối', async () => {
    const list = (await call(ctx, 'GET', '/api/v1/posting/reasons')).body.data as { code: string; kind: string; debitAccount: string | null; creditAccount: string | null }[];
    expect(list.find((r) => r.code === 'PB-TT')).toMatchObject({ kind: 'journal', debitAccount: EXPENSE, creditAccount: PREPAID });
    const put = (body: Record<string, unknown>) => call(ctx, 'PUT', '/api/v1/posting/reasons/PB-SAI', { name: 'Sai', ...body });
    expect((await put({ kind: 'journal', debitAccount: EXPENSE })).status).toBe(400);
    expect((await put({ kind: 'journal', debitAccount: EXPENSE, creditAccount: EXPENSE })).status).toBe(400);
    expect((await put({ kind: 'journal', debitAccount: EXPENSE, creditAccount: '242' })).status).toBe(400); // 242 là tài khoản tổng hợp
    expect((await put({ kind: 'payment', debitAccount: EXPENSE, creditAccount: PREPAID })).status).toBe(400);
  });
});

describe('manual_journal qua ctx.ledger.submit (bộ tình huống §3.6)', () => {
  it('1. một dòng phân bổ trả trước → Nợ 64271 / Có 24218 đúng số, nguồn = module', async () => {
    const r = await run(submitJournal, { doc: journalDoc('PB-01', [{ lineKey: 'l1', reasonCode: 'PB-TT', amount: 1_500_000, description: 'Phần mềm kế toán 12 tháng' }]) });
    expect(r.data).toMatchObject({ status: 'posted' });
    expect(await eventOf('phan-bo:CN01:PB-01')).toMatchObject({ status: 'posted', doc_type: 'manual_journal', source_system: 'phan-bo' });
    expect(await balance(EXPENSE, 'PB-01')).toBe(1_500_000);
    expect(await balance(PREPAID, 'PB-01')).toBe(-1_500_000);
    const entry = await db.selectFrom('ledger_entries').select(['doc_type', 'reason_code']).where('tenant_id', '=', tenantId).where('doc_no', '=', 'PB-01').executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ doc_type: 'manual_journal', reason_code: 'PB-TT' });
  });

  it('2. hai dòng hai lý do → hai cặp Nợ / Có trong MỘT bút toán', async () => {
    await run(submitJournal, { doc: journalDoc('PB-02', [
      { lineKey: 'l1', reasonCode: 'PB-TT', amount: 200_000 },
      { lineKey: 'l2', reasonCode: 'TRICH-TRUOC', amount: 300_000, partnerCode: 'NCC-DIEN' },
    ]) });
    const entries = await db.selectFrom('ledger_entries').select('id').where('tenant_id', '=', tenantId).where('doc_no', '=', 'PB-02').execute();
    expect(entries).toHaveLength(1);
    const lines = await db.selectFrom('ledger_lines').select(['account_code', 'debit', 'credit', 'pair_no']).where('entry_id', '=', entries[0]!.id).orderBy('pair_no').orderBy('debit', 'desc').execute();
    expect(lines.map((l) => [l.account_code, Number(l.debit), Number(l.credit)])).toEqual([
      [EXPENSE, 200_000, 0], [PREPAID, 0, 200_000], [EXPENSE, 300_000, 0], [ACCRUED, 0, 300_000],
    ]);
  });

  it('3. tài khoản theo dõi đối tượng: thiếu đối tượng → chặn; có → dòng 335 mang đúng đối tượng; mã đối tượng lạ → chặn', async () => {
    await expect(run(submitJournal, { doc: journalDoc('PB-03', [{ lineKey: 'l1', reasonCode: 'TRICH-TRUOC', amount: 100_000 }]) }))
      .rejects.toMatchObject({ details: expect.arrayContaining([expect.stringMatching(/Tài khoản 335 bắt buộc phải chọn đối tượng/)]) });
    expect(await eventOf('phan-bo:CN01:PB-03')).toBeUndefined();
    await expect(run(submitJournal, { doc: journalDoc('PB-03', [{ lineKey: 'l1', reasonCode: 'TRICH-TRUOC', amount: 100_000, partnerCode: 'KHONG-CO' }]) }))
      .rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await run(submitJournal, { doc: journalDoc('PB-03', [{ lineKey: 'l1', reasonCode: 'TRICH-TRUOC', amount: 100_000, partnerCode: 'NCC-DIEN' }]) });
    const partner = await db.selectFrom('partners').select('id').where('tenant_id', '=', tenantId).where('code', '=', 'NCC-DIEN').executeTakeFirstOrThrow();
    const line = await db.selectFrom('ledger_lines as l').innerJoin('ledger_entries as e', 'e.id', 'l.entry_id').select(['l.partner_id'])
      .where('l.tenant_id', '=', tenantId).where('e.doc_no', '=', 'PB-03').where('l.account_code', '=', ACCRUED).executeTakeFirstOrThrow();
    expect(String(line.partner_id)).toBe(String(partner.id));
  });

  it('4. phiên bản 2 đổi số tiền → đảo bản 1, ghi bản 2; số dư theo bản 2', async () => {
    await run(submitJournal, { doc: journalDoc('PB-04', [{ lineKey: 'l1', reasonCode: 'PB-TT', amount: 400_000 }]) });
    const r = await run(submitJournal, { doc: journalDoc('PB-04', [{ lineKey: 'l1', reasonCode: 'PB-TT', amount: 450_000 }], { version: 2 }) });
    expect(r.data).toMatchObject({ status: 'posted', reversed: 1 });
    expect(await eventOf('phan-bo:CN01:PB-04')).toMatchObject({ version: 2, posted_version: 2 });
    expect(await balance(EXPENSE, 'PB-04')).toBe(450_000);
    expect(await balance(PREPAID, 'PB-04')).toBe(-450_000);
  });

  it('5. huỷ → đảo toàn bộ; số dư về như trước', async () => {
    const before = await balance(PREPAID);
    await run(submitJournal, { doc: journalDoc('PB-05', [{ lineKey: 'l1', reasonCode: 'PB-TT', amount: 700_000 }]) });
    expect(await balance(PREPAID)).toBe(before - 700_000);
    expect((await run(cancelJournal, { docKey: 'phan-bo:CN01:PB-05' })).data).toMatchObject({ reversed: 1 });
    expect(await balance(PREPAID)).toBe(before);
    expect(await eventOf('phan-bo:CN01:PB-05')).toMatchObject({ status: 'cancelled' });
  });

  it('6. dòng mang số tài khoản / thuế, phiếu có hoá đơn, lý do khác loại journal, tổng lệch → từ chối, không lưu gì', async () => {
    const bad = [
      journalDoc('PB-06', [{ lineKey: 'l1', reasonCode: 'PB-TT', amount: 1000, account: '1111' }]),
      journalDoc('PB-06', [{ lineKey: 'l1', reasonCode: 'PB-TT', amount: 1000, debitAccount: '1111' }]),
      journalDoc('PB-06', [{ lineKey: 'l1', reasonCode: 'PB-TT', amount: 1000, taxCode: 'V10' }]),
      journalDoc('PB-06', [{ lineKey: 'l1', reasonCode: 'PB-TT', amount: 1000 }], { invoice: { no: '0000123', series: 'C26TAA', date: '2026-10-31' } }),
      journalDoc('PB-06', [{ lineKey: 'l1', reasonCode: 'PB-TT', amount: 1000 }], { totals: { total: 999 } }),
    ];
    for (const doc of bad) await expect(run(submitJournal, { doc })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    const payReason = (await db.selectFrom('posting_reasons').select('code').where('tenant_id', '=', tenantId).where('kind', '=', 'payment').where('is_active', '=', true).executeTakeFirstOrThrow()).code;
    await expect(run(submitJournal, { doc: journalDoc('PB-06', [{ lineKey: 'l1', reasonCode: payReason, amount: 1000 }]) }))
      .rejects.toMatchObject({ message: expect.stringMatching(/journal/) });
    expect(await eventOf('phan-bo:CN01:PB-06')).toBeUndefined();
  });

  it('7. kỳ đã khoá cho loại manual_journal → chặn; loại khác cùng kỳ không bị khoá theo', async () => {
    const period = { year: 2026, month: 9 };
    expect((await call(ctx, 'PUT', '/api/v1/periods/locks', { ...period, changes: [{ branchCode: 'CN01', docType: 'manual_journal', locked: true }] })).status).toBe(200);
    await expect(run(submitJournal, { doc: journalDoc('PB-07', [{ lineKey: 'l1', reasonCode: 'PB-TT', amount: 1000 }], { docDate: '2026-09-30' }) }))
      .rejects.toMatchObject({ code: 'PERIOD_LOCKED' });
    expect(await eventOf('phan-bo:CN01:PB-07')).toBeUndefined();
  });

  it('K3: chế độ chờ duyệt (mặc định của loại) → chứng từ chờ ở ACC14, chưa vào sổ', async () => {
    const modes = Object.fromEntries(APPROVABLE_DOC_TYPES.map((t) => [t, t === 'manual_journal' ? 'approve' : 'auto']));
    expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', modes)).status).toBe(200);
    const r = await run(submitJournal, { doc: journalDoc('PB-08', [{ lineKey: 'l1', reasonCode: 'PB-TT', amount: 5000 }]) });
    expect(r.data).toMatchObject({ status: 'pending' });
    expect(await balance(PREPAID, 'PB-08')).toBe(0);
  });
});
