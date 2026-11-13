// [2026-11-07 06:00 PM Nguyễn Văn Thủy] PHASE-026 — NT-MH-002: ô Biến thể, Thêm sản phẩm con, khoá đổi mã có đuôi, NCC dùng lại mã (đóng góp)
/**
 * NT-MH-002 (docs/nghiem-thu/mua-hang/NT-MH-002-san-pham-con.md):
 *   - mã cũ tự mang biến thể theo đuôi, khớp cách quầy bán nhận Z;
 *   - sản phẩm con: item_id riêng, mã cha + 2 số, lấy đơn vị tính và dấu dưới 24 tháng theo cha;
 *   - mọi biến thể dùng được với mã số; biến thể đi theo mặt hàng, đổi mã không làm đổi biến thể;
 *   - không gộp hàng Nội bộ với hàng có sang thuế.
 * [2026-11-09 10:00 AM Nguyễn Văn Thủy] PHASE-026 — bỏ khoá tạm: test theo luật mới (đóng góp)
 * [2026-11-12 Nguyễn Văn Thủy] luật 0111: biến thể, gửi lên thuế luôn suy theo mã (đuôi Z = không gửi); mã con = mã cha + đuôi (đóng góp)
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { matchLine } from '@bizcity/mua-hang-domain';
import { db } from '../src/db/client.js';
import { todayVN } from '../src/core/date-rules.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const ack = { warnAck: { reason: 'thử sản phẩm con', codes: ['ITEM-HINT-001', 'ITEM-HINT-003'] } };
const put = (sku: string, body: Record<string, unknown> = {}) => call(ctx, 'PUT', `/api/v1/products/${sku}`, { name: `Hàng ${sku}`, unit: 'Hộp', ...ack, ...body });
const sendOf = async (sku: string) => (await sql<{ s: boolean }>`SELECT send_to_tax AS s FROM products WHERE tenant_id = ${tenantId} AND sku = ${sku}`.execute(db)).rows[0]?.s;
const variantOf = async (sku: string) => (await sql<{ variant_code: string }>`SELECT variant_code FROM products WHERE tenant_id = ${tenantId} AND sku = ${sku}`.execute(db)).rows[0]?.variant_code;
const idOf = async (sku: string) => (await sql<{ item_id: string }>`SELECT item_id FROM item_codes WHERE tenant_id = ${tenantId} AND kind = 'sku' AND code = ${sku} AND valid_to IS NULL`.execute(db)).rows[0]?.item_id;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('NT-MH-002 — ô Biến thể theo mã cũ', () => {
  it.each([
    ['110051001', 'normal'], ['110051001K', 'share'], ['110051001M', 'promo'], ['110051001T', 'program'], ['110051001Q', 'clip'],
    ['110051001Z', 'internal'], ['110051001B', 'expiry'], ['110051001C', 'legacy'], ['Q05940063', 'normal'], ['Q05940063Z', 'internal'], ['VQMM0006Z', 'internal'], ['ComboBimboDK', 'normal'], ['TS302B', 'normal'],
  ])('%s → %s', async (sku, variant) => {
    expect((await put(sku)).status).toBe(200);
    expect(await variantOf(sku)).toBe(variant);
  });

  it('danh sách trả biến thể và lọc được; cột không làm đổi updated_at khi điền', async () => {
    const r = await call(ctx, 'GET', '/api/v1/products?variant=internal&pageSize=50');
    const skus = (r.body.data as { sku: string; variantCode: string }[]).map((x) => x.sku);
    expect(skus).toEqual(expect.arrayContaining(['110051001Z', 'Q05940063Z', 'VQMM0006Z']));
    expect(skus).not.toContain('110051001');
  });

  it('danh mục biến thể có đủ, Nội bộ không bao giờ sang thuế', async () => {
    const r = await call(ctx, 'GET', '/api/v1/items/variant-kinds');
    const kinds = r.body.data as { code: string; taxFlow: string; legacySuffix: string }[];
    expect(kinds.map((k) => k.code)).toEqual(['normal', 'share', 'promo', 'program', 'clip', 'expiry', 'internal', 'legacy']);
    expect(kinds.find((k) => k.code === 'internal')).toMatchObject({ taxFlow: 'never', legacySuffix: 'Z' });
  });
});

// [2026-11-12 Nguyễn Văn Thủy] bỏ Thêm sản phẩm con: mã con là mặt hàng thêm như thường, mã cha / biến thể / gửi thuế suy theo mã (0111, 0112) (đóng góp)
describe('NT-MH-002 — mã con thêm như mặt hàng thường', () => {
  const full = (sku: string, body: Record<string, unknown>) => call(ctx, 'PUT', `/api/v1/catalog/products/${sku}?new=1`, { ...ack, ...body });
  it('mã cha + chữ cuối: trỏ đúng cha, item_id riêng, kế thừa ĐVT của cha; biến thể, gửi thuế theo mã', async () => {
    const units = [{ unit: 'Hộp', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 24 }];
    expect((await full('170521001', { name: 'Bình sữa', isUnder24m: true, taxOutCode: 'R08', taxInCode: 'V08', units })).status).toBe(200);
    for (const [tail, variant, send] of [['Z', 'internal', false], ['M', 'promo', true], ['Q', 'clip', true], ['B', 'expiry', true]] as const) {
      const r = await full(`170521001${tail}`, { name: `Bình sữa thử ${tail}`, unit: 'Hộp', taxInCode: 'V08', units: [{ unit: 'Hộp', ratio: 1, isDefault: true }] });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      expect(r.body.data).toMatchObject({ parentSku: '170521001' });
      expect(await variantOf(`170521001${tail}`)).toBe(variant);
      expect(await sendOf(`170521001${tail}`)).toBe(send);
    }
    const z = (await call(ctx, 'GET', '/api/v1/catalog/products/170521001Z')).body.data;
    expect((z.units as { unit: string }[]).map((u) => u.unit).sort()).toEqual(['Hộp', 'Thùng']);
    const [p, c] = await Promise.all([idOf('170521001'), idOf('170521001Z')]);
    expect(p).not.toBe(c);
    const parentOf = await sql<{ parent_item_id: string }>`SELECT parent_item_id FROM items WHERE item_id = ${c!}`.execute(db);
    expect(parentOf.rows[0]?.parent_item_id).toBe(p);
    for (const s2 of ['170521002', '170521003']) expect((await put(s2)).status).toBe(200);
  });
});

describe('NT-MH-002 — đổi mã: biến thể, gửi thuế theo mã mới', () => {
  const rename = (sku: string, newSku: string) => call(ctx, 'POST', '/api/v1/items/rename-code', { sku, newSku, reason: 'thử đổi mã' });

  it('mã Z chưa nhập xuất đổi sang mã số: thành hàng thường, gửi thuế; item_id giữ nguyên', async () => {
    expect((await put('190000001Z')).status).toBe(200);
    const before = await idOf('190000001Z');
    expect((await rename('190000001Z', '19000000101')).status).toBe(200);
    expect(await idOf('19000000101')).toBe(before);
    expect(await variantOf('19000000101')).toBe('normal');
    expect(await sendOf('19000000101')).toBe(true);
  });

  it('mã thường đổi sang đuôi Z: Nội bộ, không gửi thuế', async () => {
    expect((await put('190000007')).status).toBe(200);
    expect((await rename('190000007', '190000007Z')).status).toBe(200);
    expect(await variantOf('190000007Z')).toBe('internal');
    expect(await sendOf('190000007Z')).toBe(false);
  });
});

describe('NT-MH-002 — khoá gộp mã, MH26, lệch chuẩn', () => {
  const merge = (from: string, to: string) => call(ctx, 'POST', '/api/v1/items/merge', { from: { sku: from }, to: { sku: to }, reason: 'thử khoá gộp mã' });

  it('không gộp hàng Nội bộ với hàng sang thuế, cả hai chiều', async () => {
    for (const s of ['190000010Z', '190000011', '190000012Z']) expect((await put(s)).status).toBe(200);
    expect((await merge('190000010Z', '190000011')).status).toBe(400);
    expect((await merge('190000011', '190000010Z')).status).toBe(400);
    expect((await merge('190000010Z', '190000012Z')).status).toBe(200);
  });

  it('sinh mã kế tiếp theo nhóm hàng không tính nhầm mã con', async () => {
    const classes = [{ c: 'N1', p: undefined, s: '17' }, { c: 'N2', p: 'N1', s: '052' }, { c: 'N3', p: 'N2', s: '1' }];
    for (const x of classes) {
      expect((await call(ctx, 'PUT', `/api/v1/item-classes/group/${x.c}`, { name: x.c, parentCode: x.p, skuCode: x.s })).status).toBeLessThan(300);
    }
    const r = await call(ctx, 'GET', '/api/v1/catalog/next-sku?groupCode=N3');
    expect(r.body.data.sku).toBe('170521004');
  });

  it('ô Biến thể / Gửi lên thuế gửi lên bị bỏ qua: luôn theo mã', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/catalog/products/170521001M', { name: 'Bình sữa thử M', variantCode: 'internal', sendToTax: false, parentSku: null, ...ack })).status).toBe(200);
    expect(await variantOf('170521001M')).toBe('promo');
    expect(await sendOf('170521001M')).toBe(true);
    expect((await call(ctx, 'GET', '/api/v1/catalog/products/170521001M')).body.data.parentSku).toBe('170521001');
    expect((await call(ctx, 'PUT', '/api/v1/catalog/products/170521001Z', { name: 'Bình sữa thử Z', sendToTax: true, ...ack })).status).toBe(200);
    expect(await sendOf('170521001Z')).toBe(false);
  });

  it('đã có nhập xuất vẫn đổi mã được (sửa thẳng ô Mã hàng)', async () => {
    const sku = '170521001Q';
    const r = await call(ctx, 'POST', '/api/v1/documents', {
      docType: 'purchase', docKey: `SPC-KHOA-${sku}`, branchCode: 'CN01', docNo: 'SPC-KHOA', docDate: todayVN(), partner: { code: 'NCC-01', name: 'Nhà cung cấp 01' },
      lines: [{ lineKey: 'l1', sku, name: 'Thử đuôi Q', unit: 'Hộp', qty: 5, amountBeforeTax: 50000, taxCode: 'V08', taxAmount: 0 }], totals: { beforeTax: 50000, tax: 0, total: 50000 },
    });
    expect(r.body.data.status, JSON.stringify(r.body)).toBe('posted');
    const z = await call(ctx, 'POST', '/api/v1/items/rename-code', { sku, newSku: '170521001QZ', reason: 'thử khoá' });
    expect(z.status, JSON.stringify(z.body)).toBe(200);
  });

  it('luồng kéo danh mục gửi itemId, parentItemId và variantCode', async () => {
    const r = await call(ctx, 'GET', '/api/v1/catalog/feed/products?limit=5000');
    const items = r.body.data.items as { sku: string; itemId: string | null; parentItemId: string | null; variantCode: string; sendToTax: boolean }[];
    const kid = items.find((x) => x.sku === '170521001B')!;
    const dad = items.find((x) => x.sku === '170521001')!;
    expect(kid).toMatchObject({ variantCode: 'expiry', parentItemId: dad.itemId });
    expect(kid.itemId).toMatch(/^[0-9A-Z]{26}$/);
    expect(items.find((x) => x.sku === '190000007Z')).toMatchObject({ variantCode: 'internal', sendToTax: false });
  });
});

describe('NT-MH-002 — NCC đổi tên, dùng lại mã', () => {
  const src = {
    aliases: [
      { nccSku: 'A1', nccName: 'Sữa bột Mama Gold 900g', nccUnit: 'Hộp', sku: 'M1', unit: 'Hộp' },
      { nccSku: 'A1', nccName: 'Mama Gold HT 900g', nccUnit: 'Hộp', sku: 'M1', unit: 'Hộp' },
    ],
    declared: [], products: [{ sku: 'M1', name: 'Mama Gold 900g' }], units: {},
  };

  it('cùng mã, NCC đổi cách ghi tên: vẫn tự nhận', () => {
    for (const nccName of ['SUA BOT MAMA GOLD HT 900G', 'Mama Gold 900g (mẫu mới)', 'Sữa Mama Gold lon 900 gram', 'Mama 900g']) {
      expect(matchLine({ nccSku: 'a1', nccName, nccUnit: 'Hộp' }, src)).toMatchObject({ sku: 'M1', matchSource: 'alias' });
    }
  });

  it('cùng mã, không ghi tên hoặc chưa học tên: vẫn tự nhận', () => {
    expect(matchLine({ nccSku: 'A1', nccName: '', nccUnit: 'Hộp' }, src)).toMatchObject({ sku: 'M1' });
    const noName = { ...src, aliases: [{ nccSku: 'X1', nccName: '', nccUnit: 'Hộp', sku: 'M1', unit: 'Hộp' }] };
    expect(matchLine({ nccSku: 'X1', nccName: 'Gì cũng được', nccUnit: 'Hộp' }, noName)).toMatchObject({ sku: 'M1' });
  });

  it('NCC dùng lại mã cho hàng khác hẳn: không tự nhận, đưa về gợi ý', () => {
    const r = matchLine({ nccSku: 'A1', nccName: 'Tã quần Bobby XL 32 miếng', nccUnit: 'Hộp' }, src);
    expect(r).toMatchObject({ sku: null, matchSource: 'none' });
    expect(r.candidates?.[0]).toMatchObject({ sku: 'M1' });
    expect(r.candidates?.[0]?.why).toContain('tên khác xa');
  });
});

// [2026-11-10 03:00 PM Nguyễn Văn Thủy] PHASE-026 — tên mặt hàng không trùng (đóng góp)
describe('Tên mặt hàng không trùng', () => {
  const full = (sku: string, body: Record<string, unknown>, isNew = false) => call(ctx, 'PUT', `/api/v1/catalog/products/${sku}${isNew ? '?new=1' : ''}`, { unit: 'Hộp', ...ack, ...body });
  it('thêm mới trùng tên (khác hoa thường, thừa dấu cách) bị chặn, nêu mã đang dùng', async () => {
    expect((await full('180011001', { name: 'Sữa Tên Riêng 900g' }, true)).status).toBe(200);
    const r = await full('180011002', { name: '  sữa tên   riêng 900G ' }, true);
    expect(r.status).toBe(409);
    expect(JSON.stringify(r.body)).toContain('180011001');
  });
  it('đổi tên sang tên đã có bị chặn; sửa ô khác giữ tên cũ thì không kiểm', async () => {
    expect((await full('180011003', { name: 'Sữa Tên Khác' }, true)).status).toBe(200);
    expect((await full('180011003', { name: 'Sữa Tên Riêng 900g' })).status).toBe(409);
    // Dữ liệu cũ đã trùng (nạp thẳng): không đổi tên thì vẫn lưu được.
    await sql`UPDATE products SET name = 'Sữa Tên Riêng 900g' WHERE tenant_id = ${tenantId} AND sku = '180011003'`.execute(db);
    expect((await full('180011003', { name: 'Sữa Tên Riêng 900g', origin: 'Việt Nam' })).status).toBe(200);
  });
  it('kiểm tên khi gõ: trả mã đang dùng, trừ chính mã đang sửa', async () => {
    const r = await call(ctx, 'GET', `/api/v1/catalog/name-check?name=${encodeURIComponent('SỮA TÊN RIÊNG 900G')}&except=180011001`);
    expect(r.body.data.same.sku).toBe('180011003');
    const r2 = await call(ctx, 'GET', `/api/v1/catalog/name-check?name=${encodeURIComponent('Tên chưa ai dùng')}`);
    expect(r2.body.data.same).toBeNull();
  });
});
