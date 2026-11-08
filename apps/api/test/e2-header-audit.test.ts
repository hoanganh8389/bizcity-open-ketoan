// [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-13 (D004-10, review R1 RV-R1-14): E2 ghi dấu vết trước / sau; T004-E2-1…3
/**
 * Đường E2 (RULE-LEDGER): định khoản lại mà dòng không đổi, chỉ thông tin đầu bút toán đổi (số hoá đơn, diễn giải…) ⇒ cập nhật tại chỗ.
 * Trước S004-13 dấu vết chỉ là một con số trong posting_log; nay mỗi lần đổi ghi `ledger.entry.header_update` với giá trị trước / sau của các cột
 * thật sự đổi (chữ chốt docs/phases/PHASE-004-MOT-CUA-GHI-SO/20-CHOT-CO-THOAT-VA-E2.md).
 *   T004-E2-1  v1 → v2 chỉ đổi thông tin đầu: bút toán giữ nguyên (không đảo), nhật ký ghi đúng các cột đổi, trước / sau khớp CSDL
 *   T004-E2-2  gửi lại y nguyên: không thêm dòng nhật ký E2 mới
 *   T004-E2-3  E2_COLUMNS khớp trigger guard_ledger_entry_mutation (0049): cột nào ngoài danh sách bị ép bằng nhau thì không thuộc E2
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { E2_COLUMNS } from '@bizcity/kernel/modules/posting/posting.service';
import { auditRows, call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const DOC = 'pos:CN01:E2A1';
const send = (over: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: DOC, docNo: 'E2A1', ...over }));
const snapshot = async (entryId: string) => {
  const r = await sql<Record<string, unknown>>`SELECT ${sql.raw(E2_COLUMNS.join(', '))} FROM ledger_entries WHERE id = ${entryId}`.execute(db);
  return r.rows[0]!;
};
const norm = (v: unknown) => (v == null ? null : String(v));

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T004-E2 — cập nhật thông tin đầu có dấu vết trước / sau', () => {
  let entryId = '';
  let v1: Record<string, unknown>;

  it('T004-E2-1 v1 → v2 chỉ đổi thông tin đầu: không đảo, nhật ký ghi đúng các cột đổi', async () => {
    const r1 = await send({ version: 1 });
    expect(r1.status, JSON.stringify(r1.body)).toBe(200);
    entryId = String((await db.selectFrom('ledger_entries').select('id').where('tenant_id', '=', tenantId).where('is_reversal', '=', false).executeTakeFirstOrThrow()).id);
    v1 = await snapshot(entryId);
    expect(await auditRows(tenantId, 'ledger.entry.header_update', entryId)).toHaveLength(0); // lần đầu ghi sổ không phải E2

    // Chỉ đổi thông tin đầu: số hoá đơn và diễn giải; dòng, tiền, ngày giữ nguyên
    const r2 = await send({ version: 2, invoice: { no: '0000456', serial: 'C26TAA', form: '1', date: '2026-10-05' }, description: 'Hoá đơn phát hành muộn' });
    expect(r2.status, JSON.stringify(r2.body)).toBe(200);
    expect(r2.body.data).toMatchObject({ status: 'posted', reversed: 0 }); // không đảo bút toán nào
    const v2 = await snapshot(entryId);
    expect(norm(v2.invoice_no)).toBe('0000456');
    expect(norm(v2.description)).toBe('Hoá đơn phát hành muộn');

    // Cột thật sự đổi, tính thẳng từ hai ảnh chụp của CSDL
    const changedInDb = E2_COLUMNS.filter((c) => norm(v1[c]) !== norm(v2[c]));
    expect(changedInDb).toEqual(expect.arrayContaining(['invoice_no', 'description']));
    const rows = await auditRows(tenantId, 'ledger.entry.header_update', entryId);
    expect(rows, JSON.stringify(rows)).toHaveLength(1);
    const a = rows[0]!;
    expect(a.objectType).toBe('ledger_entry');
    expect(Object.keys(a.before).sort()).toEqual([...changedInDb].sort());
    expect(Object.keys(a.after).sort()).toEqual([...changedInDb].sort());
    for (const c of changedInDb) {
      expect(norm(a.before[c]), `before.${c}`).toBe(norm(v1[c]));
      expect(norm(a.after[c]), `after.${c}`).toBe(norm(v2[c]));
    }
    expect(a.before.invoice_no).toBe('0000123');
    expect(a.after.invoice_no).toBe('0000456');
    // Cột không đổi (số chứng từ) không có trong nhật ký
    expect(a.before).not.toHaveProperty('doc_no');
  });

  it('T004-E2-2 gửi lại y nguyên phiên bản đang có: không thêm dòng nhật ký E2', async () => {
    const before = (await auditRows(tenantId, 'ledger.entry.header_update', entryId)).length;
    const again = await send({ version: 2, invoice: { no: '0000456', serial: 'C26TAA', form: '1', date: '2026-10-05' }, description: 'Hoá đơn phát hành muộn' });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect((await auditRows(tenantId, 'ledger.entry.header_update', entryId)).length).toBe(before);
  });
});

describe('T004-E2-3 — E2_COLUMNS khớp trigger của CSDL', () => {
  it('cột của ledger_entries trừ cột trigger ép bằng nhau, trừ total / status = đúng E2_COLUMNS', async () => {
    const def = (await sql<{ def: string }>`SELECT pg_get_functiondef('public.guard_ledger_entry_mutation'::regproc) AS def`.execute(db)).rows[0]!.def;
    // Điều kiện đầu của IF (trước THEN đầu tiên): mọi cột "không bao giờ đổi" viết dạng NEW.x = OLD.x / NEW.x IS NOT DISTINCT FROM OLD.x
    const head = def.slice(def.indexOf('IF TG_OP'), def.indexOf('THEN'));
    const frozen = new Set([...head.matchAll(/NEW\.(\w+)\s+(?:=|IS NOT DISTINCT FROM)\s+OLD\.\1/g)].map((m) => m[1]!));
    expect(frozen.size, 'không đọc được danh sách cột bị ép trong trigger').toBeGreaterThanOrEqual(10);
    const cols = (await sql<{ column_name: string }>`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ledger_entries'`.execute(db)).rows.map((r) => r.column_name);
    const e2 = cols.filter((c) => !frozen.has(c) && c !== 'total' && c !== 'status').sort();
    expect(e2).toEqual([...E2_COLUMNS].sort());
  });
});
