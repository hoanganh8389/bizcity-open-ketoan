/**
 * Đẩy tức thời theo sự kiện (hệ thống bán hàng gọi bằng khoá API ngay khi lưu / sửa / xoá phiếu):
 *   - loại chứng từ đặt "Tự động định khoản" → vào sổ luôn; thẻ ACC14 "Tự động định khoản" (status=auto) liệt kê;
 *   - chuẩn hoá như phiếu kéo của kết nối cùng mã nguồn (đổi hình thức thanh toán);
 *   - nguồn báo xoá: chế độ Tự động → tự huỷ (ghi số âm); chế độ Vào cổng chờ → Chờ huỷ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { APPROVABLE_DOC_TYPES } from '@ketoan/contracts';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
const push = async (url: string, payload: unknown) => {
  const res = await ctx.app.inject({ method: 'POST', url, payload: payload as never, headers: { 'x-api-key': ctx.apiKey } });
  return { status: res.statusCode, body: res.json() as any };
};
const docOf = (key: string) => db.selectFrom('accounting_events').select(['id', 'status', 'posted_version', 'cancel_requested_at', 'payload']).where('tenant_id', '=', tenantId).where('doc_key', '=', key).executeTakeFirstOrThrow();

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp' }] });
  // Hoá đơn bán: Tự động; hàng bán trả lại: Vào cổng chờ.
  const modes = { ...Object.fromEntries(APPROVABLE_DOC_TYPES.map((t) => [t, 'approve'])), sale: 'auto' };
  expect((await call(ctx, 'PUT', '/api/v1/settings/posting-modes', modes)).status).toBe(200);
  // Kết nối "btsoft" có đổi hình thức: QR-RIENG → TM.
  expect((await call(ctx, 'PUT', '/api/v1/connections', { connections: [{ code: 'btsoft', name: 'Multisite', kind: 'standard', url: 'http://wp.test/cong-cho', apiKey: '', methodMap: { 'QR-RIENG': 'TM' } }] })).status).toBe(200);
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Đẩy tức thời, chế độ Tự động định khoản', () => {
  it('phiếu bán đẩy vào tự ghi sổ; đổi hình thức theo kết nối cùng mã nguồn', async () => {
    const doc = saleDoc({ docKey: 'btsoft:9:sale:1', docNo: 'BT0001', sourceSystem: 'btsoft', payments: [{ methodCode: 'QR-RIENG', amount: 200000 }] });
    const r = await push('/api/v1/documents/batch', { documents: [doc] });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data[0].status, JSON.stringify(r.body)).toBe('posted');
    const d = await docOf('btsoft:9:sale:1');
    expect(d.status).toBe('posted');
    expect((d.payload as any).payments[0].methodCode).toBe('TM');
  });

  it('thẻ "Tự động định khoản" (status=auto) có phiếu này; phiếu kế toán bấm định khoản thì không', async () => {
    const auto = await call(ctx, 'GET', '/api/v1/documents?status=auto&from=2026-10-01&to=2026-10-31');
    expect(auto.body.data.map((x: any) => x.docKey)).toEqual(['btsoft:9:sale:1']);
    // Phiếu hoàn: Vào cổng chờ → kế toán định khoản ở trạm → không thuộc thẻ Tự động.
    const ret = { ...saleDoc({ docKey: 'btsoft:9:return:2', docNo: 'TH0002', sourceSystem: 'btsoft', payments: [] }), docType: 'sale_return' };
    const rr = await push('/api/v1/documents/batch', { documents: [ret] });
    expect(rr.body.data[0].status, JSON.stringify(rr.body)).toBe('pending');
    const id = (await docOf('btsoft:9:return:2')).id;
    expect((await call(ctx, 'POST', '/api/v1/documents/post', { ids: [id], repost: false })).body.data.posted).toBe(1);
    const again = await call(ctx, 'GET', '/api/v1/documents?status=auto&from=2026-10-01&to=2026-10-31');
    expect(again.body.data.map((x: any) => x.docKey)).toEqual(['btsoft:9:sale:1']);
  });

  it('bán xong gửi ngay (chưa có hoá đơn), vài giây sau phát hành hoá đơn: chỉ cập nhật số hoá đơn tại chỗ, KHÔNG đảo bút toán', async () => {
    const v1 = saleDoc({ docKey: 'btsoft:9:sale:7', docNo: 'BT0007', sourceSystem: 'btsoft', invoice: undefined, payments: [] });
    expect((await push('/api/v1/documents/batch', { documents: [v1] })).body.data[0].status).toBe('posted');
    const id = (await docOf('btsoft:9:sale:7')).id;
    const before = await db.selectFrom('ledger_entries').select(['id']).where('event_id', '=', id).execute();
    const v2 = saleDoc({ docKey: 'btsoft:9:sale:7', docNo: 'BT0007', sourceSystem: 'btsoft', version: 2, payments: [] }); // có invoice 0000123
    const r2 = await push('/api/v1/documents/batch', { documents: [v2] });
    expect(r2.body.data[0].status, JSON.stringify(r2.body)).toBe('posted');
    const after = await db.selectFrom('ledger_entries').select(['id', 'is_reversal', 'status', 'invoice_no', 'event_version']).where('event_id', '=', id).execute();
    expect(after.map((e) => e.id).sort()).toEqual(before.map((e) => e.id).sort()); // không thêm bút toán nào (không đảo, không ghi lại)
    expect(after.every((e) => !e.is_reversal && e.status === 'posted' && e.invoice_no === '0000123' && e.event_version === 2)).toBe(true);
  });

  it('sổ nhật ký chung: phiếu bán không mang dòng giá vốn (vào phiếu giá vốn tháng); cặp dòng 0 của hàng khuyến mãi vẫn có tài khoản đối ứng', async () => {
    const j = await call(ctx, 'GET', '/api/v1/reports/journal?from=2026-10-01&to=2026-10-31&search=BT0007');
    expect(j.status, JSON.stringify(j.body)).toBe(200);
    const rows = j.body.data.rows as any[];
    expect(rows.filter((r) => r.accountCode === '6321' || r.accountCode === '1561')).toHaveLength(0);
    // Dòng doanh thu / thuế 0 của hàng tặng (QUA01): đối ứng với 1311.
    const gift = rows.filter((r) => r.debit === 0 && r.credit === 0 && (r.accountCode === '51111' || r.accountCode === '33311'));
    expect(gift.length).toBeGreaterThan(0);
    expect(gift.every((r) => r.counterAccounts === '1311')).toBe(true);
  });

  it('nguồn báo xoá: chế độ Tự động thì tự huỷ; Vào cổng chờ thì Chờ huỷ', async () => {
    const c1 = await push('/api/v1/documents/cancel', { docKey: 'btsoft:9:sale:1', reason: 'Phiếu đã xoá ở cửa hàng' });
    expect(c1.status, JSON.stringify(c1.body)).toBe(200);
    expect(c1.body.data).toMatchObject({ cancelled: true });
    expect((await docOf('btsoft:9:sale:1')).status).toBe('cancelled');
    const c2 = await push('/api/v1/documents/cancel', { docKey: 'btsoft:9:return:2', reason: 'Phiếu đã xoá ở cửa hàng' });
    expect(c2.body.data).toMatchObject({ requested: true });
    const d2 = await docOf('btsoft:9:return:2');
    expect(d2.status).toBe('pending');
    expect(d2.cancel_requested_at).not.toBeNull();
  });
});
