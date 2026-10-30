/**
 * eventStore (PHASE-004, PHASES 2.1): cửa ghi sổ cho sự việc Kernel tự lập. Mỗi lần ghi gắn (sự việc, phiên bản), đặt
 * posted_version, ghi posting_log; ghi lại = đảo bút toán cũ + phiên bản mới, phiên bản cũ được cất; huỷ = đảo hết + cancelled.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import type { AuthContext } from '../src/core/auth.js';
import { accountRepository } from '../src/modules/accounts/account.repository.js';
import { eventStore } from '../src/modules/documents/event-store.js';
import { setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let auth: AuthContext;
let branchId = '';
const docKey = 'closing:EVSTORE:2026-10';
const docNo = 'KC 10/2026 EVSTORE';

const lines = (amount: number) => [
  { accountCode: '64211', debit: amount, credit: 0, pairNo: 1, part: 'other' as const, description: 'Thử eventStore' },
  { accountCode: '1111', debit: 0, credit: amount, pairNo: 1, part: 'other' as const, description: 'Thử eventStore' },
];

/** Một lần "tính lại" như các dịch vụ nội bộ: khoá, đảo cũ, phiên bản mới, ghi, chốt. */
async function run(amount: number) {
  return db.transaction().execute(async (trx) => {
    const accounts = await accountRepository.mapByCode(trx, auth.tenantId);
    const existing = await eventStore.lock(trx, auth.tenantId, docKey);
    const reversed = existing ? await eventStore.reverseActive(trx, auth, existing.id, accounts, 'Thử ghi lại') : 0;
    const ev = await eventStore.saveVersion(trx, auth, existing, {
      docKey, docType: 'closing', docNo, createdBy: auth.actor,
      fields: { branch_id: branchId, doc_date: '2026-10-31', total: amount, payload: JSON.stringify({ amount }) },
    });
    const entry = await eventStore.post(trx, auth, ev, { branchId, docType: 'closing', docNo, docDate: '2026-10-31', postingDate: '2026-10-31', description: 'Thử eventStore', lines: lines(amount) }, accounts);
    await eventStore.markPosted(trx, auth, { ...ev, docType: 'closing', docNo, entryIds: [entry.id], reversed, total: amount });
    return { ...ev, entryId: entry.id, reversed };
  });
}

const eventRow = () => db.selectFrom('accounting_events').selectAll().where('tenant_id', '=', auth.tenantId).where('doc_key', '=', docKey).executeTakeFirstOrThrow();
const logs = (eventId: string) => db.selectFrom('posting_log').select(['action', 'version', 'reversed', 'entry_ids']).where('event_id', '=', eventId).orderBy('id').execute();
const entries = (eventId: string) => db.selectFrom('ledger_entries').select(['id', 'status', 'is_reversal', 'event_version']).where('event_id', '=', eventId).orderBy('id').execute();

beforeAll(async () => {
  ctx = await setupTenant();
  const t = await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow();
  branchId = (await db.selectFrom('branches').select('id').where('tenant_id', '=', t.id).orderBy('id').executeTakeFirstOrThrow()).id;
  auth = { tenantId: t.id, actor: 'system:event-store-test', actorName: 'Thử eventStore', kind: 'user', role: null, permissions: new Set() };
});
afterAll(async () => {
  await ctx.app.close();
});

describe('eventStore', () => {
  it('lần đầu: phiên bản 1, bút toán gắn (sự việc, phiên bản), posted_version = 1, posting_log "post"', async () => {
    const r = await run(1_000_000);
    expect(r.version).toBe(1);
    const ev = await eventRow();
    expect(ev).toMatchObject({ status: 'posted', version: 1, posted_version: 1 });
    expect(await entries(ev.id)).toEqual([{ id: r.entryId, status: 'posted', is_reversal: false, event_version: 1 }]);
    expect(await logs(ev.id)).toEqual([{ action: 'post', version: 1, reversed: 0, entry_ids: [r.entryId] }]);
  });

  it('ghi lại: đảo bút toán cũ, phiên bản 2, cất phiên bản 1, posting_log "repost" có số bút toán đã đảo', async () => {
    const r = await run(1_500_000);
    expect(r).toMatchObject({ version: 2, reversed: 1 });
    const ev = await eventRow();
    expect(ev).toMatchObject({ status: 'posted', version: 2, posted_version: 2 });
    const es = await entries(ev.id);
    expect(es.map((e) => [e.status, e.is_reversal, e.event_version])).toEqual([['reversed', false, 1], ['posted', true, 1], ['posted', false, 2]]);
    expect((await logs(ev.id)).at(-1)).toEqual({ action: 'repost', version: 2, reversed: 1, entry_ids: [r.entryId] });
    const archived = await db.selectFrom('accounting_event_versions').select('version').where('event_id', '=', ev.id).execute();
    expect(archived.map((a) => a.version)).toEqual([1]);
  });

  it('huỷ: đảo hết bút toán hiệu lực, status cancelled, posting_log "cancel"', async () => {
    await db.transaction().execute(async (trx) => {
      const accounts = await accountRepository.mapByCode(trx, auth.tenantId);
      const row = (await eventStore.lock(trx, auth.tenantId, docKey))!;
      const reversed = await eventStore.reverseActive(trx, auth, row.id, accounts, 'Thử huỷ');
      expect(reversed).toBe(1);
      await eventStore.cancel(trx, auth, row, { message: 'Thử huỷ', reversed });
    });
    const ev = await eventRow();
    expect(ev.status).toBe('cancelled');
    expect((await entries(ev.id)).filter((e) => e.status === 'posted' && !e.is_reversal)).toEqual([]);
    expect((await logs(ev.id)).at(-1)).toMatchObject({ action: 'cancel', version: 2, reversed: 1 });
  });
});
