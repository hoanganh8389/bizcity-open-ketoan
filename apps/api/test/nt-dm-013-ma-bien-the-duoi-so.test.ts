// [2026-11-20 kiennt] NT-DM-013 — mã biến thể: phần cuối nhận cả chữ số, mã cha = 9 số đầu (đóng góp)
/**
 * NT-DM-013 — mã biến thể DM10:
 *   - phần cuối có chữ số (1000110015, 10001100101, 100011001Z1) → mã cha 100011001, thêm được qua form (PUT ?new=1) và Excel;
 *   - mã cha chưa có → báo "chưa có mã cha"; quá 2 ký tự → báo;
 *   - mã đuôi chữ / chữ đầu như cũ; hàm SQL bizcity_parent_from_sku trùng parentFromSku phía máy chủ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { parentFromSku } from '../src/modules/catalog/sku-rule.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const ack = { warnAck: { reason: 'thử mã biến thể đuôi số', codes: ['ITEM-HINT-001', 'ITEM-HINT-003'] } };
const unit = { unit: 'Hộp', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }] };
const full = (sku: string, body: Record<string, unknown>) => call(ctx, 'PUT', `/api/v1/catalog/products/${sku}?new=1`, { ...ack, ...unit, ...body });
const nhap = async (rows: Record<string, unknown>[]) =>
  (await call<{ data: { rows: { errors: string[] }[] } }>(ctx, 'POST', '/api/v1/catalog/products/import', { dryRun: true, rows })).body.data;

beforeAll(async () => {
  ctx = await setupTenant();
  const put = async (code: string, body: Record<string, unknown>) => { const r = await call(ctx, 'PUT', `/api/v1/item-classes/group/${code}?new=1`, body); expect(r.status, JSON.stringify(r.body)).toBeLessThan(300); };
  await put('N13N', { name: 'Ngành thử 13', skuCode: '97' });
  await put('N13H', { name: 'Nhãn thử 13', parentCode: 'N13N', skuCode: '131' });
  await put('N13G', { name: 'Nhóm thử 13', parentCode: 'N13H', skuCode: '3' });
  const r = await full('971313001', { name: 'Hàng cha thử 13', groupCode: 'N13G', taxOutCode: '10', taxInCode: '10' });
  expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Suy mã cha', () => {
  it.each([
    ['9713130015', '971313001'], ['97131300101', '971313001'], ['971313001Z1', '971313001'], ['971313001Z', '971313001'],
    ['A971313001', '971313001'], ['A971313001Z', '971313001'], ['Q12345678Z', 'Q12345678'], ['971313001', null], ['97131300', null],
  ])('%s → %s (máy chủ = CSDL)', async (sku, cha) => {
    expect(parentFromSku(sku)).toBe(cha);
    const r = await sql<{ p: string | null }>`SELECT bizcity_parent_from_sku(${sku}) AS p`.execute(db);
    expect(r.rows[0]!.p).toBe(cha);
  });
});

describe('Thêm mã biến thể đuôi số', () => {
  it('form: 9713130015 và 97131300101 ghi được, mã cha 971313001', async () => {
    for (const sku of ['9713130015', '97131300101']) {
      const r = await full(sku, { name: `Hàng con ${sku}` });
      expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
      expect(r.body.data).toMatchObject({ parentSku: '971313001' });
    }
  });

  it('mã cha chưa có → báo; quá 2 ký tự → báo', async () => {
    const a = await full('9990000015', { name: 'Không có cha', groupCode: 'N13G' });
    expect(a.status).toBe(400);
    expect(JSON.stringify(a.body)).toContain('chưa có mã cha 999000001');
    const b = await full('971313001123', { name: 'Đuôi dài' });
    expect(b.status).toBe(400);
    expect(JSON.stringify(b.body)).toContain('tối đa 2 ký tự');
  });

  it('Excel: dòng mới đuôi số nhận mã cha có sẵn; mã cha chưa có thì báo', async () => {
    const ok = await nhap([{ row: 2, sku: '9713130017', name: 'Hàng con Excel', unit: 'Hộp' }]);
    expect(ok.rows[0]!.errors.join(' ')).not.toMatch(/mã cha|chữ ở đầu/i);
    const loi = await nhap([{ row: 2, sku: '9990000017', name: 'Không có cha', unit: 'Hộp' }]);
    expect(loi.rows[0]!.errors.join(' ')).toContain('Mã cha 999000001 chưa có');
  });
});
