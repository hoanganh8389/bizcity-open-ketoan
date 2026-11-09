/**
 * PHASE-029 W1 (bizcity_document@1 §7.2): lịch sử chứng từ — từ một chứng từ (hoặc một dòng sổ) trả lời: ai lập V1, ai gửi V2, bút toán nào
 * ghi từ V1, bút toán nào đảo V1, nội dung V1 là gì, chuỗi có đứt không. Kịch bản đúng ví dụ của đề bài: ghi V1 → sửa thành V2 → huỷ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type RawBuilder, type Transaction } from 'kysely';
import { closeDb, db } from '../src/db/client.js';
import { runDiagnostics, registerDiagnostics } from '../src/modules/system/diagnostics.js';
import { LEDGER_DIAGNOSTICS } from '@bizcity/kernel/modules/ledger/ledger.diagnostics';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const KEY = 'pos:CN01:LS0001';
let eventId = '';

const get = (qs: string) => call(ctx, 'GET', `/api/v1/documents/history?${qs}`);
const send = (over: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: KEY, docNo: 'LS0001', ...over }));

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Lịch sử chứng từ: V1 → V2 → huỷ', () => {
  it('V1: một phiên bản, bút toán gắn đúng phiên bản 1, chuỗi đủ', async () => {
    expect((await send({ version: 1 })).status).toBe(200);
    const res = await get(`docKey=${encodeURIComponent(KEY)}`);
    expect(res.status).toBe(200);
    const h = res.body.data;
    eventId = h.id;
    expect(h).toMatchObject({ docKey: KEY, currentVersion: 1, postedVersion: 1, status: 'posted' });
    expect(h.source.createdBy).toMatch(/^(user|apikey):/);
    expect(h.versions).toHaveLength(1);
    expect(h.versions[0]).toMatchObject({ version: 1, isCurrent: true, isPosted: true });
    expect(h.versions[0].entries.length).toBeGreaterThan(0);
    expect(h.versions[0].entries.every((e: any) => e.eventVersion === 1 && !e.isReversal)).toBe(true);
    expect(h.versions[0].postings.map((p: any) => p.action)).toContain('post');
    expect(h.versions[0].contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(h.versions[0].payload).toBeUndefined(); // mặc định không kèm nội dung
    expect(h.unversionedEntries).toEqual([]);
    expect(h.integrity).toEqual({ ok: true, issues: [] });
  });

  it('V2 (sửa số tiền): V1 vẫn đọc được nội dung gốc; bút toán V1 bị đảo, bút toán mới thuộc V2', async () => {
    const v2 = saleDoc({ docKey: KEY, docNo: 'LS0001', version: 2, lines: [{ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 1, amountBeforeTax: 92593, taxCode: 'R08', taxAmount: 7407 }], payments: [{ methodCode: 'TM', amount: 100000 }], totals: { beforeTax: 92593, tax: 7407, total: 100000 } });
    expect((await call(ctx, 'POST', '/api/v1/documents', v2)).status).toBe(200);
    const h = (await get(`id=${eventId}&withPayload=1`)).body.data;
    expect(h).toMatchObject({ currentVersion: 2, postedVersion: 2 });
    expect(h.versions.map((v: any) => v.version)).toEqual([1, 2]);
    const [a, b] = h.versions;
    // Nội dung từng phiên bản đúng của nó — không lấy nội dung mới nhất diễn giải phiên bản cũ (DOC-03).
    expect(a.payload.totals.total).toBe(200000);
    expect(b.payload.totals.total).toBe(100000);
    expect(a.contentHash).not.toBe(b.contentHash);
    expect(a).toMatchObject({ isCurrent: false, isPosted: false });
    expect(b).toMatchObject({ isCurrent: true, isPosted: true });
    // V1: bút toán gốc đã đảo + bút toán đảo (cùng phiên bản V1); V2: bút toán mới còn hiệu lực.
    const v1Orig = a.entries.filter((e: any) => !e.isReversal);
    const v1Rev = a.entries.filter((e: any) => e.isReversal);
    expect(v1Orig.length).toBeGreaterThan(0);
    expect(v1Orig.every((e: any) => e.status === 'reversed' && e.reversedByEntryId)).toBe(true);
    expect(v1Rev.length).toBe(v1Orig.length);
    expect(v1Rev.every((e: any) => v1Orig.some((o: any) => o.id === e.reversesEntryId))).toBe(true);
    expect(b.entries.every((e: any) => e.status === 'posted' && !e.isReversal && e.eventVersion === 2)).toBe(true);
    // Ai gửi V2 và các bước định khoản của V2.
    expect(b.receivedBy).toMatch(/^(user|apikey):/);
    expect(b.postings.map((p: any) => p.action)).toEqual(['repost']); // tự định khoản: không có dòng receive (chỉ ghi khi chứng từ chờ định khoản)
    expect(h.integrity.ok).toBe(true);
  });

  it('chọn một phiên bản: chỉ trả phiên bản đó; phiên bản không có → 404', async () => {
    const one = (await get(`docKey=${encodeURIComponent(KEY)}&version=1&withPayload=1`)).body.data;
    expect(one.versions).toHaveLength(1);
    expect(one.versions[0].payload.totals.total).toBe(200000);
    expect((await get(`docKey=${encodeURIComponent(KEY)}&version=9`)).status).toBe(404);
  });

  it('truy vết NGƯỢC từ một dòng sổ về chứng từ gốc đúng phiên bản của bút toán đó', async () => {
    const h = (await get(`id=${eventId}`)).body.data;
    const v1Entry = h.versions[0].entries.find((e: any) => !e.isReversal);
    const back = (await get(`entryId=${v1Entry.id}&version=${v1Entry.eventVersion}&withPayload=1`)).body.data;
    expect(back.docKey).toBe(KEY);
    expect(back.versions[0]).toMatchObject({ version: 1 });
    expect(back.versions[0].payload.totals.total).toBe(200000);
  });

  it('huỷ: bút toán V2 bị đảo, trạng thái cancelled, lịch sử giữ nguyên', async () => {
    const res = await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey: KEY, reason: 'Khách trả hàng toàn bộ' });
    expect(res.status).toBe(200);
    const h = (await get(`id=${eventId}`)).body.data;
    expect(h.status).toBe('cancelled');
    expect(h.versions.map((v: any) => v.version)).toEqual([1, 2]);
    const v2 = h.versions[1];
    expect(v2.entries.filter((e: any) => !e.isReversal).every((e: any) => e.status === 'reversed')).toBe(true);
    expect(v2.postings.map((p: any) => p.action)).toContain('cancel');
    expect(h.audit.length).toBeGreaterThan(0);
    expect(h.integrity.ok).toBe(true);
  });
});

describe('Khoá truy vấn và quyền', () => {
  it('phải đúng một khoá; khoá lạ → 404; người ngoài đơn vị không thấy', async () => {
    expect((await get('')).status).toBe(400);
    expect((await get(`docKey=a&id=1`)).status).toBe(400);
    expect((await get('docKey=khong-co')).status).toBe(404);
    expect((await get('entryId=999999999')).status).toBe(404);
  });

  it('khoá API phạm vi chỉ ghi chứng từ vẫn đọc được lịch sử (documents:read đi kèm documents:write)', async () => {
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/documents/history?docKey=${encodeURIComponent(KEY)}`, headers: { 'x-api-key': ctx.apiKey } });
    expect(res.statusCode).toBe(200);
  });
});

// [2026-11-09 11:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-15a: sửa đầu NGOÀI ứng dụng là lỗi L3 (LEDGER_HEADER_EDIT_UNATTRIBUTED). Các ca dưới mô phỏng dữ liệu cũ bằng UPDATE thẳng nên kèm dòng nhật ký mức ứng dụng cùng giao dịch (= đã khai báo)
async function declaredEdit(trx: Transaction<any>, entryId: unknown, update: RawBuilder<unknown>) {
  await update.execute(trx);
  await sql`INSERT INTO audit_logs (tenant_id, actor, action, object_type, object_id, after_data)
            VALUES (${tenantId}, 'test', 'ledger.entry.header_update', 'ledger_entry', ${String(entryId)}, jsonb_build_object('_source', 'app', '_txid', pg_current_xact_id()::text))`.execute(trx);
}

describe('Chuỗi đứt được báo, không bị giấu', () => {
  const DOC2 = 'pos:CN01:LS0002';
  let ev2 = '';

  it('bút toán không ghi phiên bản (dữ liệu cũ) → ENTRY_NO_VERSION ở cổng và ở chẩn đoán', async () => {
    expect((await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: DOC2, docNo: 'LS0002', version: 1 }))).status).toBe(200);
    const h = (await get(`docKey=${DOC2}`)).body.data;
    ev2 = h.id;
    const entry = h.versions[0].entries[0];
    // Mô phỏng bút toán ghi trước khi có cột phiên bản: event_version nằm trong bảy cột E2 nên đổi được không cần vượt trigger (S004-12: cờ thoát trigger đã gỡ, 0086).
    await db.transaction().execute(async (trx) => {
      await declaredEdit(trx, entry.id, sql`UPDATE ledger_entries SET event_version = NULL WHERE id = ${entry.id}`);
    });
    const after = (await get(`docKey=${DOC2}`)).body.data;
    expect(after.unversionedEntries.map((e: any) => e.id)).toContain(entry.id);
    expect(after.integrity.ok).toBe(false);
    expect(after.integrity.issues.map((i: any) => i.code)).toContain('ENTRY_NO_VERSION');

    registerDiagnostics(LEDGER_DIAGNOSTICS);
    const diag = await runDiagnostics({ tenantId }, { layer: 'L3', db });
    const c = diag.checks.find((x) => x.code === 'ENTRY_NO_VERSION')!;
    expect(c.level).toBe('warn');
    expect(c.count).toBeGreaterThan(0);
  });

  it('bút toán trỏ phiên bản không còn nội dung → ENTRY_VERSION_UNKNOWN', async () => {
    const h = (await get(`id=${ev2}`)).body.data;
    const entryId = h.unversionedEntries[0].id;
    await db.transaction().execute(async (trx) => {
      await declaredEdit(trx, entryId, sql`UPDATE ledger_entries SET event_version = 7 WHERE id = ${entryId}`);
    });
    const after = (await get(`id=${ev2}`)).body.data;
    expect(after.integrity.issues.map((i: any) => i.code)).toContain('ENTRY_VERSION_UNKNOWN');
    const diag = await runDiagnostics({ tenantId }, { layer: 'L3', db });
    expect(diag.checks.find((x) => x.code === 'ENTRY_VERSION_UNKNOWN')!.count).toBeGreaterThan(0);
  });

  it('bút toán còn hiệu lực thuộc phiên bản khác posted_version → EVENT_ENTRIES_STALE', async () => {
    const h = (await get(`id=${ev2}`)).body.data;
    const entryId = h.unversionedEntries[0].id;
    // Phiên bản 7 không có thật: dựng phiên bản 2 thật để chỉ còn lệch posted_version.
    await db.transaction().execute(async (trx) => {
      await declaredEdit(trx, entryId, sql`UPDATE ledger_entries SET event_version = 1 WHERE id = ${entryId}`);
      await sql`UPDATE accounting_events SET posted_version = 2, version = 2 WHERE id = ${ev2}`.execute(trx);
      await sql`INSERT INTO accounting_event_versions (event_id, version, payload, received_at) VALUES (${ev2}, 1, '{}'::jsonb, now())`.execute(trx);
    });
    const after = (await get(`id=${ev2}`)).body.data;
    expect(after.integrity.issues.map((i: any) => i.code)).toContain('EVENT_ENTRIES_STALE');
    const diag = await runDiagnostics({ tenantId }, { layer: 'L3', db });
    expect(diag.checks.find((x) => x.code === 'EVENT_ENTRIES_STALE')!.count).toBeGreaterThan(0);
  });
});
