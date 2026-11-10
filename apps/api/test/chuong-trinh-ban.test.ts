// [2026-11-10 03:00 PM Nguyễn Văn Thủy] PHASE-026 — chương trình bán có hạn mức thay mã phụ: hạn mức theo cửa hàng, trừ / trả, báo cáo, định khoản theo loại chương trình (đóng góp)
/**
 * Hàng tặng / giảm giá vẫn là mặt hàng chính: chương trình có thời gian + hạn mức theo cửa hàng.
 *   - trừ hạn mức theo dòng bán; hết hạn mức thì từ chối; gửi lại cùng phiếu không trừ thêm; huỷ phiếu trả lại;
 *   - ngoài thời gian chương trình hoặc cửa hàng không có hạn mức thì từ chối;
 *   - mỗi bản nội dung đăng ký ở sổ chính sách (dòng bán gửi policyRef);
 *   - báo cáo: hạn mức, đã dùng, còn lại theo cửa hàng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const today = new Date().toISOString().slice(0, 10);
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

type Program = { id: string; code: string; state: string; version: number; policyRef: { key: string; version: number; hash: string } | null; quotas: { branchCode: string; quotaQty: number; usedQty: number; remaining: number }[] };
let program: Program;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  // Mặt hàng của phiếu mẫu (SUA01, QUA01) có trong danh mục, QUA01 thuộc loại hàng Quà.
  for (const [sku, name] of [['SUA01', 'Sữa bột 900g'], ['QUA01', 'Quà tặng']]) {
    await sql`INSERT INTO products (tenant_id, sku, name, unit) VALUES (${tenantId}, ${sku}, ${name}, 'Hộp') ON CONFLICT (tenant_id, sku) DO NOTHING`.execute(db);
  }
});
afterAll(async () => { await ctx.app.close(); });

const consume = (docKey: string, qty: number, lineKey = 'l2', date = today) => call<{ data: { lines: { remaining: number; already?: boolean }[] } }>(ctx, 'POST', '/api/v1/sale-programs/consume', {
  branchCode: 'CN01', docKey, docNo: docKey, docDate: date, source: 'pos', lines: [{ lineKey, program: program.code, qty, amount: 50000 }],
});

describe('Chương trình bán có hạn mức', () => {
  it('tạo chương trình tặng hàng, hạn mức 3 ở CN01; có bản ở sổ chính sách', async () => {
    const r = await call<{ data: Program }>(ctx, 'POST', '/api/v1/sale-programs', {
      code: 'ct-tang-ly', name: 'Mua sữa tặng ly', programKind: 'KM-CTY', mode: 'gift', sku: 'SUA01', buyQty: 1, giftSku: 'QUA01', giftQty: 1,
      validFrom: addDays(today, -1), validTo: addDays(today, 30), quotas: [{ branchCode: 'CN01', quotaQty: 3 }],
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    program = r.body.data;
    expect(program.code).toBe('CT-TANG-LY');
    expect(program.state).toBe('running');
    expect(program.policyRef?.version).toBe(1);
    const reg = (await sql<{ n: string }>`SELECT count(*)::text AS n FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_key = 'CT-TANG-LY'`.execute(db)).rows[0]!;
    expect(Number(reg.n)).toBe(1);
    const active = (await call<{ data: { code: string; branchRemaining: number }[] }>(ctx, 'GET', '/api/v1/sale-programs/active?branchCode=CN01&skus=SUA01')).body.data;
    expect(active.map((a) => a.code)).toContain('CT-TANG-LY');
  });

  it('trừ hạn mức; gửi lại cùng phiếu không trừ thêm; vượt hạn mức bị từ chối', async () => {
    const a = await consume('pos:CN01:A1', 2);
    expect(a.status, JSON.stringify(a.body)).toBe(200);
    expect(a.body.data.lines[0]!.remaining).toBe(1);
    const again = await consume('pos:CN01:A1', 2);
    expect(again.body.data.lines[0]!.already).toBe(true);
    const over = await consume('pos:CN01:A2', 2);
    expect(over.status).toBe(409);
    const one = await consume('pos:CN01:A2', 1);
    expect(one.status).toBe(200);
    expect(one.body.data.lines[0]!.remaining).toBe(0);
    // Hết hạn mức → không còn trong danh sách đang chạy của cửa hàng.
    const active = (await call<{ data: { code: string }[] }>(ctx, 'GET', '/api/v1/sale-programs/active?branchCode=CN01')).body.data;
    expect(active.map((x) => x.code)).not.toContain('CT-TANG-LY');
  });

  it('ngoài thời gian chương trình, cửa hàng không có hạn mức: từ chối', async () => {
    expect((await consume('pos:CN01:OLD', 1, 'l2', addDays(today, -10))).status).toBe(400);
    const other = await call(ctx, 'POST', '/api/v1/sale-programs/consume', { branchCode: 'KHONGCO', docKey: 'x:1', docDate: today, lines: [{ lineKey: 'l', program: program.code, qty: 1 }] });
    expect(other.status).toBe(400);
  });

  it('huỷ phiếu trả lại hạn mức; không hạ hạn mức dưới số đã dùng', async () => {
    const rel = await call<{ data: { released: number; qty: number } }>(ctx, 'POST', '/api/v1/sale-programs/release', { docKey: 'pos:CN01:A1' });
    expect(rel.body.data.qty).toBe(2);
    const list = (await call<{ data: Program[] }>(ctx, 'GET', '/api/v1/sale-programs')).body.data;
    expect(list.find((p) => p.id === program.id)!.quotas[0]).toMatchObject({ quotaQty: 3, usedQty: 1, remaining: 2 });
    expect((await call(ctx, 'PUT', `/api/v1/sale-programs/${program.id}/quotas`, { quotas: [{ branchCode: 'CN01', quotaQty: 0 }] })).status).toBe(400);
    expect((await call(ctx, 'PUT', `/api/v1/sale-programs/${program.id}/quotas`, { quotas: [{ branchCode: 'CN01', quotaQty: 5 }] })).status).toBe(200);
  });

  it('báo cáo quản lý: hạn mức, đã dùng, còn lại, giá trị theo cửa hàng', async () => {
    const r = await call<{ data: { items: { program: string; branchCode: string; quota: number; used: number; remaining: number; periodQty: number; periodAmount: number }[] } }>(ctx, 'GET', `/api/v1/sale-programs/report?from=${addDays(today, -5)}&to=${today}`);
    expect(r.status).toBe(200);
    const row = r.body.data.items.find((x) => x.program === 'CT-TANG-LY')!;
    expect(row).toMatchObject({ branchCode: 'CN01', quota: 5, used: 1, remaining: 4, periodQty: 1, periodAmount: 50000 });
  });

  it('sửa nội dung → bản chính sách mới; chỉ đổi hạn mức thì không', async () => {
    const before = program.version;
    const r = await call<{ data: Program }>(ctx, 'PUT', `/api/v1/sale-programs/${program.id}`, {
      code: 'CT-TANG-LY', name: 'Mua sữa tặng ly (đợt 2)', programKind: 'KM-CTY', mode: 'gift', sku: 'SUA01', buyQty: 2, giftSku: 'QUA01', giftQty: 1,
      validFrom: addDays(today, -1), validTo: addDays(today, 30),
    });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.version).toBe(before + 1);
    program = r.body.data;
  });

  it('kiểm khai báo: giảm giá phải chọn đúng một cách giảm; mã trùng; loại chương trình lạ', async () => {
    const base = { name: 'Xả date', programKind: 'XA-DATE', mode: 'discount', sku: 'SUA01', validFrom: today, validTo: addDays(today, 7) };
    expect((await call(ctx, 'POST', '/api/v1/sale-programs', { ...base, code: 'XD1' })).status).toBe(400);
    expect((await call(ctx, 'POST', '/api/v1/sale-programs', { ...base, code: 'XD1', discountPct: 30, salePrice: 100000 })).status).toBe(400);
    expect((await call(ctx, 'POST', '/api/v1/sale-programs', { ...base, code: 'XD1', discountPct: 30, quotas: [{ branchCode: 'CN01', quotaQty: 10 }] })).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/sale-programs', { ...base, code: 'XD1', discountPct: 30 })).status).toBe(409);
    expect((await call(ctx, 'POST', '/api/v1/sale-programs', { ...base, code: 'XD2', programKind: 'KHONG', discountPct: 30 })).status).toBe(400);
  });
});
