// [2026-11-19 kiennt] NT-DM-012 — loại thuế GTGT cố định: dùng chung mua / bán, TK theo Quy tắc hạch toán, TSCĐ 1332, hiệu lực (đóng góp)
/**
 * Loại thuế cố định (KCT, 0, 5, 8, 10, KKKN — chiều 'both', không khai TK):
 *   - danh mục chỉ xem (API thêm / sửa / xoá bị chặn);
 *   - phiếu bán → Có 33311; phiếu mua → Nợ 1331; phiếu chi mua TSCĐ (Nợ 2112) → Nợ 1332; phiếu thu Có 5… → thuế đầu ra 33311;
 *   - chứng từ ngoài hiệu lực của loại thuế → không ghi sổ;
 *   - mã cũ (R08) vẫn ghi sổ như trước;
 *   - nhập Excel mặt hàng: mã cũ có loại tương ứng → đổi sang loại cố định; mã cũ chưa xác định → báo lỗi rõ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const RANGE = 'from=2026-10-01&to=2026-10-31';
/** Số phát sinh Nợ / Có của tài khoản trong tháng 10/2026. */
const tb = async () => {
  const res = await call(ctx, 'GET', `/api/v1/reports/trial-balance?${RANGE}&postingOnly=true`);
  return (code: string) => res.body.data.rows.find((r: { code: string }) => r.code === code) ?? { debit: 0, credit: 0 };
};
const line = (taxCode: string, amountBeforeTax: number, taxAmount: number) => ({ lineKey: 'l1', sku: 'SUA01', name: 'Sữa bột 900g', unit: 'Hộp', qty: 1, amountBeforeTax, taxCode, taxAmount });
const sale = (no: string, taxCode: string, docDate = '2026-10-05') => saleDoc({
  docKey: `pos:CN01:${no}`, docNo: no, docDate, invoice: { no, serial: 'C26TAA', form: '1', date: docDate },
  lines: [line(taxCode, 100000, taxCode === '8' || taxCode === 'R08' ? 8000 : 10000)],
  payments: [], totals: { beforeTax: 100000, tax: taxCode === '8' || taxCode === 'R08' ? 8000 : 10000, total: taxCode === '8' || taxCode === 'R08' ? 108000 : 110000 },
});

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
  await closeDb();
});

describe('Danh mục loại thuế cố định', () => {
  it('6 loại dùng chung mua / bán, không khai TK, có căn cứ; 8% hết hiệu lực sau 31/12/2026; mã cũ đánh dấu', async () => {
    const list = (await call(ctx, 'GET', '/api/v1/tax-codes')).body.data as { code: string; direction: string; accountCode: string | null; isLegacy: boolean; validTo: string | null; legalBasis: string | null; replacedBy: string | null }[];
    const fixed = list.filter((t) => !t.isLegacy);
    expect(fixed.map((t) => t.code).sort()).toEqual(['0', '10', '5', '8', 'KCT', 'KKKN']);
    expect(fixed.every((t) => t.direction === 'both' && t.accountCode === null && t.legalBasis)).toBe(true);
    expect(fixed.find((t) => t.code === '8')!.validTo).toBe('2026-12-31');
    expect(list.find((t) => t.code === 'R08')).toMatchObject({ isLegacy: true, replacedBy: '8' });
    expect(list.find((t) => t.code === 'V13K')).toMatchObject({ isLegacy: true, replacedBy: 'KCT' });
  });

  it('không thêm / sửa / xoá được qua API', async () => {
    const add = await call(ctx, 'POST', '/api/v1/tax-codes', { code: 'T7', name: 'Thử 7%', rate: 7, direction: 'both', reportGroup: '8' });
    expect(add.status).toBe(403);
    expect(JSON.stringify(add.body)).toContain('quy định nhà nước');
    expect((await call(ctx, 'PATCH', '/api/v1/tax-codes/10', { rate: 9 })).status).toBe(403);
    expect((await call(ctx, 'DELETE', '/api/v1/tax-codes/5')).status).toBe(403);
  });
});

describe('Tài khoản thuế theo Quy tắc hạch toán', () => {
  it('phiếu bán loại 10 → Có 33311; mã cũ R08 → Có 33311 như trước', async () => {
    const before = (await tb())('33311').credit;
    expect((await call(ctx, 'POST', '/api/v1/documents', sale('HD-T10', '10'))).body.data.status).toBe('posted');
    expect((await call(ctx, 'POST', '/api/v1/documents', sale('HD-R08', 'R08'))).body.data.status).toBe('posted');
    expect((await tb())('33311').credit - before).toBe(18000);
  });

  it('phiếu mua loại 10 → Nợ 1331', async () => {
    const before = (await tb())('1331').debit;
    const purchase = {
      docType: 'purchase', docKey: 'kho:CN01:NM-T10', branchCode: 'CN01', docNo: 'NM-T10', docDate: '2026-10-06',
      partner: { code: 'NCC-T', name: 'Nhà cung cấp thử' }, invoice: { no: '0000555', serial: 'C26TAB', form: '1', date: '2026-10-06' },
      lines: [line('10', 200000, 20000)], totals: { beforeTax: 200000, tax: 20000, total: 220000 },
    };
    expect((await call(ctx, 'POST', '/api/v1/documents', purchase)).body.data.status).toBe('posted');
    expect((await tb())('1331').debit - before).toBe(20000);
  });

  it('phiếu chi mua TSCĐ (Nợ 2112) loại 10 → thuế Nợ 1332', async () => {
    const before = (await tb())('1332').debit;
    const res = await call(ctx, 'POST', '/api/v1/vouchers', {
      docType: 'payment', branchCode: 'CN01', docDate: '2026-10-08', description: 'Mua máy in', counterparty: 'Cửa hàng thiết bị',
      lines: [{ debitAccount: '2112', creditAccount: '1111', amount: 1000000, taxCode: '10', taxAmount: 100000, description: 'Máy in' }],
    });
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBeLessThan(300);
    expect((await tb())('1332').debit - before).toBe(100000);
  });

  it('phiếu thu Có doanh thu (5158) loại 10 → thuế đầu ra Có 33311', async () => {
    const before = (await tb())('33311').credit;
    const res = await call(ctx, 'POST', '/api/v1/vouchers', {
      docType: 'receipt', branchCode: 'CN01', docDate: '2026-10-09', description: 'Thu bán phế liệu', counterparty: 'Nguyễn Văn B',
      lines: [{ debitAccount: '1111', creditAccount: '5158', amount: 500000, taxCode: '10', taxAmount: 50000, description: 'Bán vỏ thùng' }],
    });
    expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBeLessThan(300);
    expect((await tb())('33311').credit - before).toBe(50000);
  });
});

describe('Hiệu lực của loại thuế', () => {
  it('chứng từ sau ngày hết hiệu lực → không ghi sổ, báo rõ', async () => {
    // Mô phỏng bản cập nhật phần mềm: thuế suất 5% hết hiệu lực từ 01/10/2026 (đơn vị test).
    await sql`UPDATE tax_codes SET valid_to = DATE '2026-09-30' WHERE code = '5' AND tenant_id = (SELECT id FROM tenants WHERE code = ${ctx.tenantCode})`.execute(db);
    const res = await call(ctx, 'POST', '/api/v1/documents', sale('HD-T5', '5'));
    expect(res.body.data.status).toBe('error');
    expect(res.body.data.error.message).toContain('hết hiệu lực');
    const v = await call(ctx, 'POST', '/api/v1/vouchers', {
      docType: 'receipt', branchCode: 'CN01', docDate: '2026-10-10', description: 'Thu khác', counterparty: 'Khách',
      lines: [{ debitAccount: '1111', creditAccount: '5158', amount: 100000, taxCode: '5', taxAmount: 5000 }],
    });
    expect(v.status).toBe(400);
    expect(JSON.stringify(v.body)).toContain('hết hiệu lực');
  });
});

describe('Nhập Excel mặt hàng theo loại thuế cố định', () => {
  const nhap = async (rows: Record<string, unknown>[]) =>
    (await call<{ data: { created: number; rows: { errors: string[]; values: Record<string, unknown> }[] } }>(ctx, 'POST', '/api/v1/catalog/products/import', { dryRun: true, rows })).body.data;

  it('sửa mặt hàng: một loại cố định (10) ghi được cho cả VAT ra và VAT vào', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/products', { products: [{ sku: 'NT12-SP', name: 'Mặt hàng thử loại thuế', unit: 'Hộp' }] })).status).toBeLessThan(300);
    const r = await call(ctx, 'PUT', '/api/v1/products/NT12-SP', { taxOutCode: '10', taxInCode: '10' });
    expect(r.status, JSON.stringify(r.body).slice(0, 300)).toBe(200);
  });

  it('mã cũ R10 → loại 10 cho cả bán và mua; mã cũ chưa xác định (V20) → báo lỗi rõ', async () => {
    const g = await nhap([{ row: 2, sku: 'NT12-01', name: 'Hàng thử loại thuế', unit: 'Hộp', vatRate: 'R10' }]);
    expect(g.rows[0]!.values).toMatchObject({ taxOutCode: '10', taxInCode: '10' });
    expect(g.rows[0]!.errors.join(' ')).not.toContain('Thuế');
    await sql`INSERT INTO tax_codes (tenant_id, code, name, rate, direction, account_code, report_group, is_active, is_legacy)
              SELECT id, 'V20', 'Thuế đầu vào kỳ sau', 0, 'input', NULL, '0', true, true FROM tenants WHERE code = ${ctx.tenantCode}
              ON CONFLICT (tenant_id, code) DO UPDATE SET is_legacy = true, replaced_by = NULL`.execute(db);
    const k = await nhap([{ row: 2, sku: 'NT12-02', name: 'Hàng mã lạ', unit: 'Hộp', vatRate: 'V20' }]);
    expect(k.rows[0]!.errors.join(' ')).toContain('chưa xác định được loại thuế');
  });
});
