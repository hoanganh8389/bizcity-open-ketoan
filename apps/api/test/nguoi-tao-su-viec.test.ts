// [2026-11-07 03:57 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — gói K3 đợt 1 (PHASE-030, D030-16): T029-K3-1 — mọi sự việc mới có người tạo (chữ chốt: docs/phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/35-GOI-K3.md)
/**
 *   T029-K3-1a  sự việc Kernel tự lập (eventStore.saveVersion, đường của khấu hao / giá vốn / khoá sổ) không truyền người tạo → ghi auth.actor
 *   T029-K3-1b  chứng từ nhận từ nguồn và phiếu tay giữ người tạo như cũ; cả đơn vị không còn sự việc nào rỗng người tạo
 *   T029-K3-1c  CSDL từ chối sự việc rỗng / chuỗi trắng người tạo (0080)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { eventStore } from '@bizcity/kernel/modules/documents/event-store';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let branchId = '';

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  branchId = (await db.selectFrom('branches').select('id').where('tenant_id', '=', tenantId).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

const createdBy = async (docKey: string) =>
  (await sql<{ c: string | null }>`SELECT created_by AS c FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db)).rows[0]?.c;

describe('T029-K3-1 — mọi sự việc mới có người tạo', () => {
  it('T029-K3-1a sự việc tự lập không truyền người tạo → ghi actor đã chạy tác vụ', async () => {
    const auth = { tenantId, actor: 'user:tac-vu-khau-hao' } as never;
    await db.transaction().execute(async (trx) => {
      await eventStore.saveVersion(trx, auth, undefined, {
        docKey: 'k3:tu-lap:1', docType: 'depreciation', docNo: 'KH-K3-1',
        fields: { branch_id: branchId, doc_date: '2026-10-31', total: 0, payload: JSON.stringify({ k3: true }) } as never,
      });
    });
    expect(await createdBy('k3:tu-lap:1')).toBe('user:tac-vu-khau-hao');
    // truyền người tạo thì giữ đúng người đó
    await db.transaction().execute(async (trx) => {
      await eventStore.saveVersion(trx, auth, undefined, {
        docKey: 'k3:tu-lap:2', docType: 'cogs', docNo: 'GV-K3-2', createdBy: 'system:cogs',
        fields: { branch_id: branchId, doc_date: '2026-10-31', total: 0, payload: JSON.stringify({ k3: true }) } as never,
      });
    });
    expect(await createdBy('k3:tu-lap:2')).toBe('system:cogs');
  });

  it('T029-K3-1b nhận từ nguồn, phiếu tay giữ người tạo; không còn sự việc rỗng người tạo', async () => {
    const r = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: saleDoc({ docKey: 'pos:CN01:K3-1', docNo: 'K3-1' }) as never, headers: { 'x-api-key': ctx.apiKey } });
    expect(r.json().data.status, r.body).toBe('posted');
    expect(await createdBy('pos:CN01:K3-1')).toMatch(/\S/);
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-08', description: 'Phiếu tay K3', lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 10000 }] });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    const empty = await sql<{ n: number }>`SELECT count(*)::int AS n FROM accounting_events WHERE tenant_id = ${tenantId} AND (created_by IS NULL OR btrim(created_by) = '')`.execute(db);
    expect(empty.rows[0]!.n).toBe(0);
  });

  it('T029-K3-1c CSDL từ chối sự việc rỗng / chuỗi trắng người tạo', async () => {
    const orig = await db.selectFrom('accounting_events').selectAll().where('tenant_id', '=', tenantId).executeTakeFirstOrThrow();
    const copy = (key: string, by: string | null) => ({ ...orig, id: undefined, doc_key: key, created_by: by, received_at: undefined }) as never;
    await expect(db.insertInto('accounting_events').values(copy('k3:rong', null)).execute()).rejects.toThrow(/created_by/);
    await expect(db.insertInto('accounting_events').values(copy('k3:trang', '   ')).execute()).rejects.toThrow(/accounting_events_created_by_present/);
  });
});
