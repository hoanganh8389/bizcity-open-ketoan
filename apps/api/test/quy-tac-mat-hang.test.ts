// [2026-11-19 Nguyễn Văn Thủy] bộ quy tắc khai báo mặt hàng (docs/nghiep-vu/25): kiểm hết một lượt, mã + ô, tô đỏ, nhật ký kiểm JSONL (đóng góp)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); });

type Finding = { code: string; field?: string; level: string; title: string };
const put = (sku: string, body: Record<string, unknown>, isNew = true) => call(ctx, 'PUT', `/api/v1/catalog/products/${encodeURIComponent(sku)}${isNew ? '?new=1' : ''}`, body);

describe('Quy tắc khai báo mặt hàng', () => {
  it('nhiều điều sai một lần: báo đủ cả, mỗi điều có mã và ô; error.fields để tô đỏ', async () => {
    const r = await put('990000001', { name: '', units: [{ unit: 'Hộp', ratio: 2 }, { unit: 'hộp', ratio: 3 }], groupCode: 'KHONG-CO' });
    expect(r.status).toBe(400);
    const fs = (r.body.error.details.findings as Finding[]);
    expect(fs.map((f) => f.code).sort()).toEqual(['ITEM-BLOCK-003', 'ITEM-BLOCK-009', 'ITEM-BLOCK-015']);
    expect(fs.find((f) => f.code === 'ITEM-BLOCK-003')).toMatchObject({ field: 'name', level: 'block' });
    expect(r.body.error.message).toContain('3 điều chưa đạt');
    expect(r.body.error.requestId).toBeTruthy();
    expect((r.body.error.fields as { path: string }[]).map((f) => f.path).sort()).toEqual(['groupCode', 'name', 'units']);
  });

  it('trùng mã / trùng tên → 409 có mã quy tắc; tên quá 50 ký tự → ITEM-BLOCK-004', async () => {
    expect((await put('990000002', { name: 'Sữa thử quy tắc', units: [{ unit: 'Hộp', ratio: 1 }] })).status).toBe(200);
    const dup = await put('990000002', { name: 'Sữa khác', units: [{ unit: 'Hộp', ratio: 1 }] });
    expect(dup.status).toBe(409);
    expect((dup.body.error.details.findings as Finding[]).map((f) => f.code)).toEqual(['ITEM-BLOCK-006']);
    const trungTen = await put('990000004', { name: 'Sữa thử quy tắc', units: [{ unit: 'Hộp', ratio: 1 }] });
    expect(trungTen.status).toBe(409);
    expect((trungTen.body.error.details.findings as Finding[])[0]).toMatchObject({ code: 'ITEM-BLOCK-005', field: 'name' });
    const dai = await put('990000003', { name: 'x'.repeat(62), units: [{ unit: 'Hộp', ratio: 1 }] });
    expect((dai.body.error.details.findings as Finding[])[0]).toMatchObject({ code: 'ITEM-BLOCK-004', field: 'name' });
    expect((dai.body.error.details.findings as Finding[])[0]!.title).toContain('đang 62');
  });

  it('nhật ký kiểm: lượt bị chặn và lượt đạt đều ghi, kèm mã tra cứu; lọc theo mã quy tắc', async () => {
    const log = (await call(ctx, 'GET', '/api/v1/validation-log?entity=catalog/products')).body.data as { data: { key: string; ok: boolean; failed: Finding[]; requestId?: string } }[];
    const chan = log.find((x) => x.data.key === '990000001')!;
    expect(chan.data.ok).toBe(false);
    expect(chan.data.failed.map((f) => f.code)).toContain('ITEM-BLOCK-003');
    expect(chan.data.requestId).toBeTruthy();
    expect(log.some((x) => x.data.key === '990000002' && x.data.ok)).toBe(true);
    const theoMa = (await call(ctx, 'GET', '/api/v1/validation-log?code=ITEM-BLOCK-004')).body.data as { data: { key: string } }[];
    expect(theoMa.map((x) => x.data.key)).toEqual(['990000003']);
  });

  it('danh sách quy tắc mặt hàng có câu "đã qua" và ô cho giao diện', async () => {
    const items = (await call(ctx, 'GET', '/api/v1/catalog-rules?entity=item')).body.data.items as { code: string; okText: string | null; field: string | null }[];
    expect(items.find((i) => i.code === 'ITEM-BLOCK-003')).toMatchObject({ okText: 'Có tên mặt hàng', field: 'name' });
    expect(items.filter((i) => i.code.startsWith('ITEM-BLOCK')).every((i) => i.okText)).toBe(true);
  });
  it('lỗi form tự chặn cũng ghi nhật ký (nguồn form); lọc nhiều đối tượng một lần', async () => {
    const r = await call(ctx, 'POST', '/api/v1/validation-log/form', { entity: 'catalog/products', key: '990000009', failed: [{ title: 'Chưa nhập tên hàng.' }] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    await call(ctx, 'POST', '/api/v1/validation-log/form', { entity: 'man:/danh-muc/mat-hang', failed: [{ code: 'FORM-THIEU', title: 'Còn 1 ô bắt buộc chưa nhập: Tên' }] });
    const log = (await call(ctx, 'GET', '/api/v1/validation-log?entity=catalog/products,man:/danh-muc/mat-hang&onlyFailed=1')).body.data as { data: { key: string; source?: string; failed: { code: string }[] } }[];
    expect(log.find((x) => x.data.key === '990000009')).toMatchObject({ data: { source: 'form', failed: [{ code: 'FORM-CHAN' }] } });
    expect(log.some((x) => x.data.failed[0]?.code === 'FORM-THIEU')).toBe(true);
    expect(log.some((x) => x.data.source === 'server')).toBe(true);
  });
});
