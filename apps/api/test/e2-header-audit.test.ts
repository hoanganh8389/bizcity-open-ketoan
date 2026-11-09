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
import { E2_COLUMNS, E2_DB_COLUMNS } from '@bizcity/kernel/modules/posting/posting.service';
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
    // [2026-11-09 08:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-14: từ 0089 mỗi lần E2 có HAI dòng cùng _txid: mức ứng dụng (_source = app, S004-13) và mức CSDL (_source = db, trigger)
    const rows = await auditRows(tenantId, 'ledger.entry.header_update', entryId);
    expect(rows, JSON.stringify(rows)).toHaveLength(2);
    const app = rows.find((r) => r.after._source === 'app')!;
    const dbRow = rows.find((r) => r.after._source === 'db')!;
    expect(app, 'thiếu nhật ký mức ứng dụng').toBeDefined();
    expect(dbRow, 'thiếu nhật ký mức CSDL (trigger 0089)').toBeDefined();
    const data = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([k]) => !k.startsWith('_')));
    for (const a of [app, dbRow]) {
      expect(a.objectType).toBe('ledger_entry');
      expect(Object.keys(data(a.before)).sort()).toEqual([...changedInDb].sort());
      expect(Object.keys(data(a.after)).sort()).toEqual([...changedInDb].sort());
      for (const c of changedInDb) {
        expect(norm(a.before[c]), `before.${c}`).toBe(norm(v1[c]));
        expect(norm(a.after[c]), `after.${c}`).toBe(norm(v2[c]));
      }
      expect(a.before.invoice_no).toBe('0000123');
      expect(a.after.invoice_no).toBe('0000456');
      // Cột không đổi (số chứng từ) không có trong nhật ký
      expect(a.before).not.toHaveProperty('doc_no');
    }
    // Đối chiếu "đã khai báo": cùng giao dịch ⇒ cùng _txid (D004-12)
    expect(app.after._txid).toBeTruthy();
    expect(dbRow.after._txid).toBe(app.after._txid);
  });

  it('T004-E2-2 gửi lại y nguyên phiên bản đang có: không thêm dòng nhật ký E2 (cả hai mức)', async () => {
    const before = (await auditRows(tenantId, 'ledger.entry.header_update', entryId)).length;
    const again = await send({ version: 2, invoice: { no: '0000456', serial: 'C26TAA', form: '1', date: '2026-10-05' }, description: 'Hoá đơn phát hành muộn' });
    expect(again.status, JSON.stringify(again.body)).toBe(200);
    expect((await auditRows(tenantId, 'ledger.entry.header_update', entryId)).length).toBe(before);
  });
});

describe('T004-E2-3 — E2_DB_COLUMNS khớp trigger của CSDL', () => {
  // [2026-11-09 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-14: bắt cột mới của đợt khác mặc nhiên đổi được (partner_name, partner_attr_id của 0087) và buộc trigger dấu vết phủ đủ
  it('cột của ledger_entries trừ cột trigger ép bằng nhau, trừ total / status = đúng E2_DB_COLUMNS; trigger dấu vết phủ mọi cột đó', async () => {
    const def = (await sql<{ def: string }>`SELECT pg_get_functiondef('public.guard_ledger_entry_mutation'::regproc) AS def`.execute(db)).rows[0]!.def;
    // Điều kiện đầu của IF (trước THEN đầu tiên): mọi cột "không bao giờ đổi" viết dạng NEW.x = OLD.x / NEW.x IS NOT DISTINCT FROM OLD.x
    const head = def.slice(def.indexOf('IF TG_OP'), def.indexOf('THEN'));
    const frozen = new Set([...head.matchAll(/NEW\.(\w+)\s+(?:=|IS NOT DISTINCT FROM)\s+OLD\.\1/g)].map((m) => m[1]!));
    expect(frozen.size, 'không đọc được danh sách cột bị ép trong trigger').toBeGreaterThanOrEqual(10);
    const cols = (await sql<{ column_name: string }>`SELECT column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ledger_entries'`.execute(db)).rows.map((r) => r.column_name);
    const e2 = cols.filter((c) => !frozen.has(c) && c !== 'total' && c !== 'status').sort();
    expect(e2, 'cột mới của ledger_entries mà guard_ledger_entry_mutation không ép: thêm vào E2_DB_COLUMNS VÀ trigger ledger_entries_header_audit, hoặc ép bất biến').toEqual([...E2_DB_COLUMNS].sort());
    // Hàm trigger dấu vết (0089) phải nhắc đủ từng cột: nếu một cột chỉ có trong danh sách mà trigger không ghi thì thay đổi đó im lặng
    const audit = (await sql<{ def: string; trg: string }>`SELECT pg_get_functiondef('public.ledger_entries_header_audit'::regproc) AS def, (SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'ledger_entries_header_audit') AS trg`.execute(db)).rows[0]!;
    for (const c of E2_DB_COLUMNS) {
      expect(audit.def, `hàm trigger không ghi cột ${c}`).toContain(`OLD.${c} IS DISTINCT FROM NEW.${c}`);
      expect(audit.trg, `mệnh đề WHEN không kích hoạt khi cột ${c} đổi`).toContain(`old.${c} IS DISTINCT FROM new.${c}`);
    }
    expect(E2_COLUMNS.every((c) => (E2_DB_COLUMNS as readonly string[]).includes(c))).toBe(true);
  });
});
