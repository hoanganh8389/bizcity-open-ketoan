/**
 * Tra cứu doanh nghiệp theo mã số thuế (form NCC / khách hàng) — phần không cần mạng: chuẩn hoá MST, báo sai định dạng trước khi
 * gọi ra ngoài. Phần gọi doanhnghiep.vn / VietQR thử tay (phụ thuộc mạng và giới hạn lượt của nguồn).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { normalizeTaxCode, resetTaxLookup } from '../src/modules/partners/tra-mst.js';
import { env } from '../src/config/env.js';
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

// [2026-11-11 11:26 AM kiennt] HT03 — VietQR giới hạn ~2 lượt / giây: gộp request trùng, chờ theo Retry-After, hết lượt báo RATE_LIMITED (không phải VALIDATION_ERROR)
describe('Tra cứu mã số thuế — giới hạn lượt của VietQR (fetch giả)', () => {
  const savedKey = env.DOANHNGHIEP_API_KEY;
  const ok = (mst: string) => new Response(JSON.stringify({ code: '00', data: { id: mst, name: 'CÔNG TY THỬ', shortName: 'THỬ', address: 'Hà Nội', status: 'NNT đang hoạt động' } }), { status: 200, headers: { 'content-type': 'application/json' } });
  const limited = () => new Response(JSON.stringify({ code: '429' }), { status: 429, headers: { 'retry-after': '1', 'content-type': 'application/json' } });
  const stubVietQr = (reply: (n: number, mst: string) => Response) => {
    let n = 0;
    const real = globalThis.fetch;
    const spy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (!url.includes('api.vietqr.io')) return real(input, init);
      n++;
      return reply(n, url.split('/').pop()!);
    });
    vi.stubGlobal('fetch', spy);
    return () => n;
  };
  beforeAll(() => { env.DOANHNGHIEP_API_KEY = ''; });
  afterEach(() => { vi.unstubAllGlobals(); resetTaxLookup(); });
  afterAll(() => { env.DOANHNGHIEP_API_KEY = savedKey; });

  it('hai yêu cầu cùng MST cùng lúc (rời ô tự tra + bấm nút): chỉ một lượt gọi VietQR', async () => {
    const count = stubVietQr((_, mst) => ok(mst));
    const [a, b] = await Promise.all([call(t, 'GET', '/api/v1/partners/tax-lookup/0109000001'), call(t, 'GET', '/api/v1/partners/tax-lookup/0109000001')]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.data.company.name).toBe('CÔNG TY THỬ');
    expect(count()).toBe(1);
  });

  it('VietQR trả 429 (Retry-After: 1) rồi 200: tự chờ, thử lại và tra được', async () => {
    const count = stubVietQr((n, mst) => (n === 1 ? limited() : ok(mst)));
    const r = await call(t, 'GET', '/api/v1/partners/tax-lookup/0109000002');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.found).toBe(true);
    expect(count()).toBe(2);
  });

  it('VietQR hết lượt mãi: trả 429 RATE_LIMITED (thử lại được), không phải VALIDATION_ERROR', async () => {
    const count = stubVietQr(() => limited());
    const r = await call(t, 'GET', '/api/v1/partners/tax-lookup/0109000003');
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
    expect(r.body.error.message).toMatch(/giới hạn lượt tra/);
    expect(count()).toBe(4);
  }, 20_000);
});
