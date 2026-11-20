// [2026-11-20 kiennt] NT-DM-014 — sửa lỗi kiểm thử 20/11: nhập Excel mặt hàng đối chiếu nhóm với ngành / nhãn, khớp đoạn mã (đóng góp)
/**
 * NT-DM-014 L1 — nhập Excel mặt hàng:
 *   - dòng có Ngành / Nhãn: nhóm tra trong nhánh đó; nhóm ở nhãn khác → lỗi, không tự gán (bảng theo dõi dòng 32);
 *   - dòng chỉ ghi Nhóm: như cũ, ngành / nhãn tự theo nhóm;
 *   - mã mới 9 số: 6 số đầu phải khớp đoạn mã của nhóm.
 * L2 / L3 (loại kho) là giao diện — kiểm trên màn hình; luật máy chủ (giữ hộ không bán, không TK) đã có test riêng.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
type Res = { rows: { errors: string[]; values: Record<string, string> }[] };
const nhap = async (rows: Record<string, unknown>[]) => {
  const r = await call<{ data: Res }>(ctx, 'POST', '/api/v1/catalog/products/import', { dryRun: true, rows });
  expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
  return r.body.data.rows[0]!;
};
const dong = (extra: Record<string, unknown>) => ({ row: 2, name: 'Hàng thử NT-DM-014', unit: 'Hộp', vatRate: '10', ...extra });

beforeAll(async () => {
  ctx = await setupTenant();
  const put = async (code: string, body: Record<string, unknown>) => { const r = await call(ctx, 'PUT', `/api/v1/item-classes/group/${code}?new=1`, body); expect(r.status, JSON.stringify(r.body)).toBeLessThan(300); };
  // Ngành Sữa bột thử (98) → nhãn A (111, có nhóm A1 = 1) và nhãn B (222, có nhóm mã "26" = 6).
  await put('N14N', { name: 'Sữa bột thử 14', skuCode: '98' });
  await put('N14A', { name: 'Nhãn A thử 14', parentCode: 'N14N', skuCode: '111' });
  await put('N14B', { name: 'Nhãn B thử 14', parentCode: 'N14N', skuCode: '222' });
  await put('N14A1', { name: 'Nhóm A1 thử 14', parentCode: 'N14A', skuCode: '1' });
  await put('26', { name: 'Sữa bà bầu thử 14', parentCode: 'N14B', skuCode: '6' });
});
afterAll(async () => {
  await ctx.app.close();
});

describe('NT-DM-014 L1 — nhóm hàng theo ngành / nhãn', () => {
  it('nhãn A + nhóm 26 (nhóm ở nhãn B) → lỗi, không tự gán', async () => {
    const r = await nhap([dong({ sku: '981111001', industryCode: 'N14N', brandCode: 'N14A', groupCode: '26' })]);
    expect(r.errors.join(' ')).toContain('Nhóm hàng "26" không có dưới nhãn Nhãn A thử 14');
  });

  it('nhãn A + nhóm có thật dưới nhãn A → hợp lệ', async () => {
    const r = await nhap([dong({ sku: '981111001', industryCode: 'N14N', brandCode: 'N14A', groupCode: 'N14A1' })]);
    expect(r.errors).toEqual([]);
  });

  it('chỉ ghi nhóm (không ngành / nhãn) → như cũ, hợp lệ', async () => {
    const r = await nhap([dong({ sku: '982226001', groupCode: '26' })]);
    expect(r.errors).toEqual([]);
  });

  it('mã mới 9 số khác đoạn mã của nhóm → lỗi', async () => {
    const r = await nhap([dong({ sku: '981116001', groupCode: 'N14A1' })]);
    expect(r.errors.join(' ')).toContain('không khớp đoạn mã của nhóm Nhóm A1 thử 14 (98 · 111 · 1) — mã phải bắt đầu bằng 981111');
  });

  it('ghi tên ngành / nhãn / nhóm (như tệp Xuất DM11) → đúng nhóm; nhãn không có dưới ngành → lỗi', async () => {
    const ok = await nhap([dong({ sku: '981111002', industryCode: 'Sữa bột thử 14', brandCode: 'Nhãn A thử 14', groupCode: 'Nhóm A1 thử 14' })]);
    expect(ok.errors).toEqual([]);
    expect(ok.values.groupCode).toContain('N14A1');
    const sai = await nhap([dong({ sku: '981111003', industryCode: 'Sữa bột thử 14', brandCode: 'Nhãn không có', groupCode: 'Nhóm A1 thử 14' })]);
    expect(sai.errors.join(' ')).toContain('Nhãn hàng "Nhãn không có" không có dưới ngành Sữa bột thử 14');
  });

  it('mã hoá từng cấp (Mã ngành 98 · Mã nhãn 222 · Mã nhóm 6) → nhóm "26" dưới nhãn B; Mã nhóm 1 dưới nhãn B → lỗi', async () => {
    const ok = await nhap([dong({ sku: '982226002', industrySku: '98', brandSku: '222', groupSku: '6' })]);
    expect(ok.errors).toEqual([]);
    expect(ok.values.groupCode).toContain('26');
    const sai = await nhap([dong({ sku: '982226003', industrySku: '98', brandSku: '222', groupSku: '1' })]);
    expect(sai.errors.join(' ')).toContain('không có dưới nhãn Nhãn B thử 14');
  });

  it('cột Barcode: hiện ở bước kiểm tra, ghi vào mặt hàng', async () => {
    const r = await nhap([dong({ sku: '981111004', groupCode: 'N14A1', barcode: '8934673123456' })]);
    expect(r.errors).toEqual([]);
    expect(r.values.barcode).toBe('8934673123456');
  });
});

