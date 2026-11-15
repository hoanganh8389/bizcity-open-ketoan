/**
 * [2026-11-15 Nguyễn Văn Thủy] HT17 thẻ hướng dẫn: xuất gói JSON → mang sang máy chủ khác → xem trước → nhập ghi đè (đóng góp)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let a: TestCtx; let b: TestCtx;
beforeAll(async () => { a = await setupTenant(); b = await setupTenant(); });
afterAll(async () => { await a.app.close(); await b.app.close(); });

describe('HT17 xuất / nhập gói thẻ hướng dẫn', () => {
  it('xuất ở máy A, xem trước + nhập ở máy B: thêm mới, ghi đè thẻ khớp, gắn đúng nơi; nhập lại thì không đổi', async () => {
    const c1 = await call(a, 'POST', '/api/v1/help/cards', { title: 'Lập phiếu nhập', body: '<p>bản tester</p>', placeKey: 'man:/mua-hang/tong-hop', placeLabel: 'Tổng hợp mua hàng' });
    expect(c1.status, JSON.stringify(c1.body)).toBe(201);
    await call(a, 'POST', '/api/v1/help/cards', { title: 'Thẻ mới tinh', body: '<p>x</p>', placeKey: 'modal:phieu-nhap', placeLabel: 'Hộp thoại phiếu nhập' });

    const ex = await call(a, 'GET', '/api/v1/help/export');
    expect(ex.status).toBe(200);
    const pkg = ex.body.data;
    expect(pkg.kind).toBe('bizcity.help-cards');
    expect(pkg.cards.find((c: { title: string }) => c.title === 'Lập phiếu nhập').places).toEqual([{ key: 'man:/mua-hang/tong-hop', label: 'Tổng hợp mua hàng' }]);

    // máy B đã có thẻ cũ gắn cùng màn, khác tiêu đề + nội dung
    const old = await call(b, 'POST', '/api/v1/help/cards', { title: 'Bản cũ', body: '<p>cũ</p>', placeKey: 'man:/mua-hang/tong-hop', placeLabel: 'Tổng hợp mua hàng' });
    const pv = await call(b, 'POST', '/api/v1/help/package/preview', { package: pkg });
    expect(pv.status, JSON.stringify(pv.body)).toBe(200);
    const rows = pv.body.data.rows as { title: string; action: string; targetTitle: string | null; places: { change: boolean; before: string | null }[] }[];
    expect(rows.find((x) => x.title === 'Lập phiếu nhập')).toMatchObject({ action: 'update', targetTitle: 'Bản cũ', places: [{ change: false, before: 'Bản cũ' }] });
    expect(rows.find((x) => x.title === 'Thẻ mới tinh')).toMatchObject({ action: 'new', places: [{ change: true, before: null }] });

    const im = await call(b, 'POST', '/api/v1/help/package/import', { package: pkg });
    expect(im.status, JSON.stringify(im.body)).toBe(200);
    expect(im.body.data).toMatchObject({ added: 1, updated: 1 });
    const card = await call(b, 'GET', `/api/v1/help/cards/${old.body.data.id}`);
    expect(card.body.data).toMatchObject({ title: 'Lập phiếu nhập', body: '<p>bản tester</p>' });

    const again = await call(b, 'POST', '/api/v1/help/package/preview', { package: pkg });
    expect(again.body.data.counts).toMatchObject({ new: 0, update: 0, placesChanged: 0 });
  });

  it('tệp không phải gói thẻ → 400', async () => {
    const r = await call(b, 'POST', '/api/v1/help/package/preview', { package: { kind: 'khac', version: 1, cards: [] } });
    expect(r.status).toBe(400);
  });
});
