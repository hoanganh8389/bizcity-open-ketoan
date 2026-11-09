// [2026-11-09 07:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-15a (D004-13): chẩn đoán LEDGER_HEADER_EDIT_UNATTRIBUTED; T004-W-1…4
/**
 * Sửa đầu bút toán NGOÀI ứng dụng (UPDATE thẳng bằng ketoan_app) phải thành một cảnh báo mức error, dẫn tới hành động ở khoá kỳ.
 * Phân biệt bằng _txid (D004-12): trigger 0089 ghi _source = db cho mọi lần sửa; đường E2 của ứng dụng ghi thêm _source = app cùng giao dịch.
 *   T004-W-1  chưa ai sửa trực tiếp ⇒ 0, kể cả sau một lần E2 qua ứng dụng (hai dòng cùng _txid)
 *   T004-W-2  UPDATE thẳng bằng ketoan_app ⇒ 1 bút toán trong mẫu, đúng số bút toán
 *   T004-W-3  lần sửa qua ứng dụng không che lần sửa trực tiếp: có cả hai ⇒ chỉ lần trực tiếp bị báo
 *   T004-W-4  mức error + thuộc L3 + có phạm vi: khoá kỳ chặn như các lỗi L3 khác; ngoài khoảng ngày của bút toán thì không báo
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { LEDGER_DIAGNOSTICS } from '@bizcity/kernel/modules/ledger/ledger.diagnostics';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let entryId = '';
let entryNo = '';
let postingDate = '';
const DOC = 'pos:CN01:W15A';
const check = LEDGER_DIAGNOSTICS.find((c) => c.code === 'LEDGER_HEADER_EDIT_UNATTRIBUTED')!;
const scope = (over: Record<string, unknown> = {}) => ({ tenantId, ...over }) as never;
const send = (over: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: DOC, docNo: 'W15A', ...over }));

/** Sửa trực tiếp bằng ketoan_app rồi chạy chẩn đoán bằng quyền thường, trong một giao dịch luôn bị lùi. */
async function directEditThenRun(s = scope()) {
  const STOP = new Error('lùi giao dịch thử');
  let res: { count: number; examined: number; sample?: string[] } | undefined;
  await db.transaction().execute(async (trx) => {
    await sql`SET LOCAL ROLE ketoan_app`.execute(trx);
    await sql`UPDATE ledger_entries SET description = 'sửa lén bằng SQL' WHERE id = ${entryId}`.execute(trx);
    await sql`RESET ROLE`.execute(trx);
    res = await check.run(trx, s);
    throw STOP;
  }).catch((e) => { if (e !== STOP) throw e; });
  return res!;
}

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  const r1 = await send({ version: 1 });
  expect(r1.status, JSON.stringify(r1.body)).toBe(200);
  const e = await db.selectFrom('ledger_entries').select(['id', 'entry_no', 'posting_date']).where('tenant_id', '=', tenantId).where('is_reversal', '=', false).executeTakeFirstOrThrow();
  entryId = String(e.id); entryNo = String(e.entry_no); postingDate = new Date(e.posting_date as never).toISOString().slice(0, 10);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T004-W — cảnh báo sửa đầu bút toán ngoài ứng dụng', () => {
  it('T004-W-1 chưa ai sửa trực tiếp ⇒ 0; E2 qua ứng dụng (hai dòng nhật ký cùng _txid) không bị báo', async () => {
    const r2 = await send({ version: 2, invoice: { no: '0000456', serial: 'C26TAA', form: '1', date: '2026-10-05' }, description: 'Hoá đơn phát hành muộn' });
    expect(r2.status, JSON.stringify(r2.body)).toBe(200);
    const res = await db.transaction().execute((trx) => check.run(trx, scope()));
    expect(res.examined, 'phải có dòng nhật ký mức CSDL của lần E2 để chứng minh không báo nhầm').toBeGreaterThanOrEqual(1);
    expect(res.count, JSON.stringify(res.sample)).toBe(0);
  });

  it('T004-W-2 UPDATE thẳng bằng ketoan_app ⇒ báo đúng bút toán', async () => {
    const res = await directEditThenRun();
    expect(res.count).toBe(1);
    expect(res.sample).toEqual([entryNo]);
  });

  it('T004-W-3 lần sửa qua ứng dụng không che lần sửa trực tiếp trên cùng bút toán', async () => {
    // Sau T004-W-1 bút toán đã có một lần E2 qua ứng dụng; lần sửa trực tiếp thêm vào vẫn phải bị báo (khác _txid)
    const res = await directEditThenRun();
    expect(res.count).toBe(1);
    expect(res.sample).toEqual([entryNo]);
  });

  it('T004-W-4 mức error, L3, có phạm vi; ngoài khoảng ngày của bút toán thì không báo', async () => {
    expect(check.level).toBe('error');
    expect(check.layer).toBe('L3');
    expect(check.scoped).toBe(true);
    expect(check.remedy?.verify?.code).toBe('LEDGER_HEADER_EDIT_UNATTRIBUTED');
    const outside = await directEditThenRun(scope({ from: '2000-01-01', to: '2000-01-31' }));
    expect(outside.count).toBe(0);
    const inside = await directEditThenRun(scope({ from: postingDate, to: postingDate }));
    expect(inside.count).toBe(1);
  });
});
