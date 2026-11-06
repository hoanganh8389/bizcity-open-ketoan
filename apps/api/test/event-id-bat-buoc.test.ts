// [2026-11-06 02:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-41 (D030-15, R-LEDGER-12): ledger_entries.event_id bắt buộc — T030-EVT-1..4 (chữ chốt: docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/25-BUT-TOAN-LUON-CO-CHUNG-TU.md)
/**
 * Mọi bút toán có chứng từ gốc (sự việc kế toán):
 *   T030-EVT-1  lược đồ: ledger_entries.event_id là NOT NULL
 *   T030-EVT-2  INSERT thẳng bút toán không có event_id bị CSDL từ chối — kể cả vai trò chủ bảng
 *   T030-EVT-3  ledgerService.post() thiếu sourceDocumentId bị từ chối ngay đầu hàm (POSTING_FAILED nêu R-LEDGER-12), chưa chạm CSDL
 *   T030-EVT-4  bán hàng, phiếu tay, huỷ từ nguồn (đảo): mọi bút toán có sự việc có thật; bút toán đảo giữ cùng sự việc với bút toán gốc
 *   (T030-EVT-5, migration trên CSDL có sẵn dòng rỗng, ở db-migration-event-id.test.ts)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { ledgerService } from '@bizcity/kernel/modules/ledger/ledger.service';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const send = (doc: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { 'x-api-key': ctx.apiKey } });

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T030-EVT — mọi bút toán có chứng từ gốc', () => {
  it('T030-EVT-1 ledger_entries.event_id là NOT NULL', async () => {
    const r = await sql<{ is_nullable: string }>`
      SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ledger_entries' AND column_name = 'event_id'`.execute(db);
    expect(r.rows[0]?.is_nullable).toBe('NO');
  });

  it('T030-EVT-4 bán hàng, phiếu tay, huỷ từ nguồn: bút toán nào cũng có sự việc có thật; bút toán đảo cùng sự việc với bút toán gốc', async () => {
    expect((await send(saleDoc({ docKey: 'pos:CN01:EVT1', docNo: 'EVT1' }))).json().data.status).toBe('posted');
    expect((await send(saleDoc({ docKey: 'pos:CN01:EVT2', docNo: 'EVT2' }))).json().data.status).toBe('posted');
    const v = await call(ctx, 'POST', '/api/v1/vouchers', { docType: 'manual', branchCode: 'CN01', docDate: '2026-10-08', description: 'Phiếu tay có chứng từ', lines: [{ debitAccount: '64211', creditAccount: '1111', amount: 50000 }] });
    expect(v.status, JSON.stringify(v.body)).toBe(201);
    // Huỷ từ nguồn: bút toán cũ được đảo (ghi số âm) — bút toán đảo phải nối vào đúng sự việc cũ.
    const cancel = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents/cancel', payload: { docKey: 'pos:CN01:EVT2', reason: 'Nguồn xoá phiếu' }, headers: { 'x-api-key': ctx.apiKey } });
    expect(cancel.statusCode, cancel.body).toBe(200);

    const all = await sql<{ id: string; event_id: string | null; ev_id: string | null; ev_key: string | null; src: string | null; is_reversal: boolean; reverses: string | null }>`
      SELECT e.id::text, e.event_id::text, a.id::text AS ev_id, a.doc_key AS ev_key, a.source_system AS src, e.is_reversal, e.reverses_entry_id::text AS reverses
        FROM ledger_entries e LEFT JOIN accounting_events a ON a.id = e.event_id AND a.tenant_id = e.tenant_id
       WHERE e.tenant_id = ${tenantId} ORDER BY e.id`.execute(db);
    expect(all.rows.length).toBeGreaterThanOrEqual(5);
    for (const r of all.rows) {
      expect(r.event_id, `bút toán ${r.id}`).not.toBeNull();
      expect(r.ev_id, `bút toán ${r.id} trỏ sự việc không có thật`).not.toBeNull();
    }
    expect(all.rows.some((r) => r.src === 'manual')).toBe(true);
    expect(all.rows.some((r) => r.ev_key === 'pos:CN01:EVT1')).toBe(true);
    const reversals = all.rows.filter((r) => r.is_reversal);
    expect(reversals.length).toBeGreaterThan(0);
    for (const r of reversals) {
      const orig = all.rows.find((o) => o.id === r.reverses)!;
      expect(r.event_id, `bút toán đảo ${r.id}`).toBe(orig.event_id);
    }
  });

  it('T030-EVT-2 INSERT thẳng bút toán không có event_id bị CSDL từ chối', async () => {
    const orig = await db.selectFrom('ledger_entries').selectAll().where('tenant_id', '=', tenantId).executeTakeFirstOrThrow().catch(async () => (await db.selectFrom('ledger_entries').selectAll().where('tenant_id', '=', tenantId).limit(1).execute())[0]!);
    const copy = { ...orig, id: undefined as never, entry_no: 'TEST-EVT-NULL', event_id: null as never, created_at: undefined as never };
    await expect(db.insertInto('ledger_entries').values(copy).execute()).rejects.toThrow(/event_id/);
    // vai trò chủ bảng, bỏ qua trigger kiểm tra khác: NOT NULL vẫn chặn
    await expect(db.transaction().execute(async (trx) => {
      await sql`SET LOCAL ROLE NONE`.execute(trx);
      await sql`SET LOCAL session_replication_role = replica`.execute(trx);
      await trx.insertInto('ledger_entries').values(copy).execute();
    })).rejects.toThrow(/event_id/);
  });

  it('T030-EVT-3 ledgerService.post() thiếu sourceDocumentId bị từ chối ngay đầu hàm, chưa chạm CSDL', async () => {
    const draft = { branchId: '1', docType: 'manual', docNo: 'X', docDate: '2026-10-08', postingDate: '2026-10-08', description: 'thiếu chứng từ gốc', lines: [] } as never;
    // trx = null: nếu hàm chạm CSDL / kiểm dòng trước khi kiểm chứng từ gốc thì lỗi sẽ khác (TypeError hoặc "không có dòng nào").
    await expect(ledgerService.post(null as never, tenantId, 'user:1', draft, new Map())).rejects.toMatchObject({ code: 'POSTING_FAILED', message: expect.stringMatching(/chứng từ gốc.*R-LEDGER-12/) });
    await expect(ledgerService.post(null as never, tenantId, 'user:1', { ...(draft as object), sourceDocumentId: null } as never, new Map())).rejects.toMatchObject({ code: 'POSTING_FAILED' });
    await expect(ledgerService.post(null as never, tenantId, 'user:1', { ...(draft as object), sourceDocumentId: '' } as never, new Map())).rejects.toMatchObject({ code: 'POSTING_FAILED' });
  });
});
