/**
 * Tra cứu doanh nghiệp theo mã số thuế (form NCC / khách hàng) — phần không cần mạng: chuẩn hoá MST, báo sai định dạng trước khi
 * gọi ra ngoài. Phần gọi doanhnghiep.vn / VietQR thử tay (phụ thuộc mạng và giới hạn lượt của nguồn).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeTaxCode } from '../src/modules/partners/tra-mst.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let t: TestCtx;
beforeAll(async () => { t = await setupTenant(); });
afterAll(async () => { await t.app.close(); });

describe('Tra cứu mã số thuế', () => {
  it('chuẩn hoá: 10 số, có chấm / khoảng trắng, 13 số liền → 10-3 (đơn vị phụ thuộc), 12 số hộ kinh doanh; sai dạng → null', () => {
    expect(normalizeTaxCode('0104076740')).toBe('0104076740');
    expect(normalizeTaxCode(' 0104.076 740 ')).toBe('0104076740');
    expect(normalizeTaxCode('0100109106001')).toBe('0100109106-001');
    expect(normalizeTaxCode('0100109106-001')).toBe('0100109106-001');
    expect(normalizeTaxCode('001203012345')).toBe('001203012345');
    for (const bad of ['12345', '01040767401', 'ABC0104076', '0104076740-01', '']) expect(normalizeTaxCode(bad)).toBeNull();
  });

  it('MST sai dạng: báo lỗi rõ, không gọi ra ngoài', async () => {
    const r = await call(t, 'GET', '/api/v1/partners/tax-lookup/12345');
    expect(r.status).toBe(400);
    expect(r.body.error.message).toMatch(/không đúng dạng/);
  });
});
