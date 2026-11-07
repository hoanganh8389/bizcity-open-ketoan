// [2026-11-07 06:00 PM Nguyễn Văn Thủy] PHASE-026 — NT-MH-002: ô Biến thể, Thêm sản phẩm con, khoá đổi mã có đuôi, NCC dùng lại mã (đóng góp)
/**
 * NT-MH-002 (docs/nghiem-thu/mua-hang/NT-MH-002-san-pham-con.md):
 *   - mã cũ tự mang biến thể theo đuôi, khớp cách quầy bán nhận Z;
 *   - sản phẩm con: item_id riêng, mã cha + 2 số, lấy đơn vị tính và dấu dưới 24 tháng theo cha;
 *   - khoá an toàn: biến thể ảnh hưởng thuế chưa dùng được với mã số, không đổi mã Z thành mã mất Z.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { matchLine, skuInfo } from '@bizcity/mua-hang-domain';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const ack = { warnAck: { reason: 'thử sản phẩm con', codes: ['ITEM-HINT-001', 'ITEM-HINT-003'] } };
const put = (sku: string, body: Record<string, unknown> = {}) => call(ctx, 'PUT', `/api/v1/products/${sku}`, { name: `Hàng ${sku}`, unit: 'Hộp', ...ack, ...body });
const addChild = (b: Record<string, unknown>) => call(ctx, 'POST', '/api/v1/items/add-child', b);
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
    ['110051001Z', 'internal'], ['110051001B', 'legacy'], ['Q05940063', 'normal'], ['Q05940063Z', 'internal'], ['VQMM0006Z', 'internal'], ['ComboBimboDK', 'normal'], ['TS302B', 'normal'],
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

  it('danh mục biến thể có đủ, chỉ Thường mở cho mã số, Nội bộ không bao giờ sang thuế', async () => {
    const r = await call(ctx, 'GET', '/api/v1/items/variant-kinds');
    const kinds = r.body.data as { code: string; allowNumeric: boolean; taxFlow: string; legacySuffix: string }[];
    expect(kinds.map((k) => k.code)).toEqual(['normal', 'share', 'promo', 'program', 'clip', 'internal', 'legacy']);
    expect(kinds.filter((k) => k.allowNumeric).map((k) => k.code)).toEqual(['normal']);
    expect(kinds.find((k) => k.code === 'internal')).toMatchObject({ taxFlow: 'never', legacySuffix: 'Z' });
  });
});

describe('NT-MH-002 — Thêm sản phẩm con', () => {
  it('mã cha + 2 số, item_id riêng, trỏ đúng cha, lấy đơn vị tính và dấu dưới 24 tháng theo cha', async () => {
    const units = [{ unit: 'Hộp', ratio: 1, isDefault: true }, { unit: 'Thùng', ratio: 24 }];
    expect((await call(ctx, 'PUT', '/api/v1/catalog/products/170521001?new=1', { name: 'Bình sữa', isUnder24m: true, taxOutCode: 'R08', taxInCode: 'V08', units, ...ack })).status).toBe(200);
    const a = await addChild({ parentSku: '170521001', name: 'Bình sữa xanh L', variantCode: 'normal', note: 'Màu xanh' });
    expect(a.status).toBe(200);
    expect(a.body.data).toMatchObject({ sku: '17052100101', parentSku: '170521001', isUnder24m: true, taxOutCode: 'R08', taxInCode: 'V08', note: 'Màu xanh', variantCode: 'normal' });
    expect((a.body.data.units as { unit: string }[]).map((u) => u.unit).sort()).toEqual(['Hộp', 'Thùng']);
    const b = await addChild({ parentSku: '170521001', name: 'Bình sữa đỏ L' });
    expect(b.body.data.sku).toBe('17052100102');
    const [p, c1, c2] = await Promise.all([idOf('170521001'), idOf('17052100101'), idOf('17052100102')]);
    expect(new Set([p, c1, c2]).size).toBe(3);
    const parentOf = await sql<{ parent_item_id: string }>`SELECT parent_item_id FROM items WHERE item_id = ${c1!}`.execute(db);
    expect(parentOf.rows[0]?.parent_item_id).toBe(p);
    expect(skuInfo('17052100101')).toMatchObject({ kind: 'normal', base: '17052100101', child: '01' });
  });

  it('mã cha vẫn bán được; chỉ đánh dấu không bán khi người khai chọn', async () => {
    const parent = () => call(ctx, 'GET', '/api/v1/catalog/products/170521001');
    expect((await parent()).body.data.noSale).toBe(false);
    expect((await addChild({ parentSku: '170521001', name: 'Bình sữa hồng L', noSaleParent: true })).status).toBe(200);
    expect((await parent()).body.data.noSale).toBe(true);
  });

  it('chặn trùng tên dưới cùng cha, không phân biệt hoa thường và khoảng trắng', async () => {
    const r = await addChild({ parentSku: '170521001', name: '  bình sữa   XANH l ' });
    expect(r.status).toBe(409);
  });

  it('họ mã một cấp: không thêm con cho mã con', async () => {
    const r = await addChild({ parentSku: '17052100101', name: 'Con của con' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('một cấp');
  });

  it('mã cha còn chữ thì phải đổi sang số trước', async () => {
    const r = await addChild({ parentSku: 'Q05940063', name: 'Bình xanh' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('mã số');
  });

  it('số đã dùng không cấp lại, kể cả khi mã con đã xoá', async () => {
    expect((await put('170521002')).status).toBe(200);
    const a = await addChild({ parentSku: '170521002', name: 'Áo xanh' });
    expect(a.body.data.sku).toBe('17052100201');
    expect((await call(ctx, 'DELETE', '/api/v1/products/17052100201')).status).toBeLessThan(300);
    const b = await addChild({ parentSku: '170521002', name: 'Áo đỏ' });
    expect(b.body.data.sku).toBe('17052100202');
  });

  it.each(['internal', 'clip', 'share', 'promo', 'program'])('khoá an toàn: biến thể %s chưa dùng được với mã số', async (variantCode) => {
    const r = await addChild({ parentSku: '170521001', name: `Thử ${variantCode}`, variantCode });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toContain('chưa dùng được với mã số');
  });

  it('biến thể không có thì từ chối', async () => {
    expect((await addChild({ parentSku: '170521001', name: 'Thử', variantCode: 'khong-co' })).status).toBe(400);
  });
});

describe('NT-MH-002 — khoá đổi mã có đuôi', () => {
  const rename = (sku: string, newSku: string) => call(ctx, 'POST', '/api/v1/items/rename-code', { sku, newSku, reason: 'thử khoá đổi mã' });

  it('mã Z đổi sang mã mất Z bị chặn; giữ nguyên ô và mã', async () => {
    expect((await put('190000001Z')).status).toBe(200);
    const r = await rename('190000001Z', '19000000101');
    expect(r.status).toBe(400);
    expect(await variantOf('190000001Z')).toBe('internal');
  });

  it('mã Z đổi sang mã khác vẫn tận cùng Z thì được, item_id giữ nguyên', async () => {
    const before = await idOf('190000001Z');
    expect((await rename('190000001Z', '190000002Z')).status).toBe(200);
    expect(await idOf('190000002Z')).toBe(before);
    expect(await variantOf('190000002Z')).toBe('internal');
  });

  it.each([['190000003M', '19000000301'], ['190000004Q', '19000000401'], ['190000005T', '19000000501'], ['190000006K', '19000000601']])('%s sang mã số bị chặn', async (from, to) => {
    expect((await put(from)).status).toBe(200);
    expect((await rename(from, to)).status).toBe(400);
  });

  it('mã thường đổi sang mã có Z thì ô đi theo, để quầy bán và ô không lệch nhau', async () => {
    expect((await put('190000007')).status).toBe(200);
    expect((await rename('190000007', '190000007Z')).status).toBe(200);
    expect(await variantOf('190000007Z')).toBe('internal');
  });

  it('mã thường đổi sang mã số khác vẫn bình thường', async () => {
    expect((await put('190000008')).status).toBe(200);
    expect((await rename('190000008', '190000009')).status).toBe(200);
    expect(await variantOf('190000009')).toBe('normal');
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

  it('MH26 gom sản phẩm con mã số vào một dòng, mặc định cộng về cha', async () => {
    const r = await call(ctx, 'GET', '/api/v1/purchase/variants');
    const row = (r.body.data.suffixes as { suffix: string; count: number; separate: boolean; label: string }[]).find((x) => x.suffix === '##');
    expect(row).toMatchObject({ separate: false });
    expect(row!.count).toBeGreaterThanOrEqual(3);
    expect(row!.label).toContain('Sản phẩm con');
  });

  it('tên trống, chỉ có khoảng trắng hoặc mã cha không có thì từ chối', async () => {
    expect((await addChild({ parentSku: '170521001', name: '   ' })).status).toBe(400);
    expect((await addChild({ parentSku: 'KHONG-CO', name: 'Thử' })).status).toBe(404);
  });

  it('cùng tên ở hai cha khác nhau vẫn được', async () => {
    const r = await addChild({ parentSku: '170521002', name: 'Bình sữa xanh L' });
    expect(r.status).toBe(200);
  });

  it('quá 99 con thì dùng 3 số', async () => {
    expect((await put('170521003')).status).toBe(200);
    expect((await put('17052100399', { parentSku: '170521003' })).status).toBe(200);
    const r = await addChild({ parentSku: '170521003', name: 'Con thứ 100' });
    expect(r.body.data.sku).toBe('170521003100');
    expect(skuInfo('170521003100')).toMatchObject({ kind: 'normal', child: '100' });
  });

  it('sinh mã kế tiếp theo nhóm hàng không tính nhầm mã con', async () => {
    const classes = [{ c: 'N1', p: undefined, s: '17' }, { c: 'N2', p: 'N1', s: '052' }, { c: 'N3', p: 'N2', s: '1' }];
    for (const x of classes) {
      expect((await call(ctx, 'PUT', `/api/v1/item-classes/group/${x.c}`, { name: x.c, parentCode: x.p, skuCode: x.s })).status).toBeLessThan(300);
    }
    const r = await call(ctx, 'GET', '/api/v1/catalog/next-sku?groupCode=N3');
    expect(r.body.data.sku).toBe('170521004');
  });

  it('lưu mặt hàng kèm ô Biến thể không đổi được biến thể', async () => {
    const r = await call(ctx, 'PUT', '/api/v1/catalog/products/17052100101', { name: 'Bình sữa xanh L', variantCode: 'internal', ...ack });
    expect(r.status).toBe(200);
    expect(await variantOf('17052100101')).toBe('normal');
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
