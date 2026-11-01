// [2026-11-01 09:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W1: ca T019-1: lỗi 409 thật → web giữ đủ requestId + traceId; nội dung Báo lỗi không có dữ liệu.
/**
 * Mã tra cứu trên web (PHASE-019 W1, ca T019-1). Dựng lỗi thật của tình huống TH-01 trong Sổ tay (chi lại phiếu đã chi → 409),
 * đưa thân phản hồi qua đúng hàm web dùng (@ketoan/contracts ma-tra-cuu.ts — apps/web/src/lib/api.ts gọi), rồi kiểm:
 *   - giữ đủ requestId + traceId (traceId trùng trace của yêu cầu);
 *   - nội dung Chép / Báo lỗi chỉ gồm mã: không số tiền, tên đối tác, mã đối tác, id phiếu, câu thông báo của máy chủ;
 *   - mã sai khuôn (chèn chữ, xuống dòng) bị bỏ; thân hỏng thì lấy requestId từ header X-Request-Id.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { InMemorySpanExporter } from '@opentelemetry/sdk-trace';
import { disableTracing, initTracing } from '../src/core/tracing.js';
import { call, setupTenant, type TestCtx } from './helpers.js';
import { cauMacDinh, docMaTuPhanHoi, lamSachDuongDan, loaiLoi, noiDungBaoLoi, noiDungChep, tomTatMa } from '@ketoan/contracts';

const memory = new InMemorySpanExporter();
let ctx: TestCtx;
let paidId = '';
const TRACE_ID = '0af7651916cd43dd8448eb211c80319c';
const body = (over: Record<string, unknown> = {}) => ({ requestDate: '2026-10-12', branchCode: 'CN01', partnerCode: 'NCC-MTC', amount: 7654321, debitAccount: '64211', description: 'Chi dịch vụ mã tra cứu', ...over });

beforeAll(async () => {
  initTracing({ exporter: memory });
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/partners/NCC-MTC', { name: 'Công ty Mã Tra Cứu Bí Mật', kind: 'supplier' });
  const created = await call(ctx, 'POST', '/api/v1/payment-requests', body({ submit: true }));
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  paidId = created.body.data.id;
  await call(ctx, 'POST', `/api/v1/payment-requests/${paidId}/approve`);
  const paid = await call(ctx, 'POST', `/api/v1/payment-requests/${paidId}/pay`, { docDate: '2026-10-13', moneyAccount: '1111' });
  expect(paid.status, JSON.stringify(paid.body)).toBe(200);
});
afterAll(async () => {
  await ctx.app.close();
  await disableTracing();
});

describe('Mã tra cứu trên web — PHASE-019 W1 (T019-1)', () => {
  it('lỗi 409 thật: giữ đủ requestId + traceId; Chép / Báo lỗi chỉ gồm mã, không dữ liệu', async () => {
    const path = `/api/v1/payment-requests/${paidId}/pay`;
    const again = await call(ctx, 'POST', path, { docDate: '2026-10-13', moneyAccount: '1111' }, { traceparent: `00-${TRACE_ID}-00f067aa0ba902b7-01` });
    expect(again.status).toBe(409);
    expect(again.body.error.requestId).toBeTruthy();

    const ma = docMaTuPhanHoi({ status: again.status, method: 'POST', path, screen: `/quy/yeu-cau-thanh-toan/${paidId}`, error: again.body.error });
    expect(ma.requestId).toBe(again.body.error.requestId);
    expect(ma.traceId).toBe(TRACE_ID);
    expect(ma.code).toBe(again.body.error.code);
    expect(loaiLoi(ma)).toBe('tu-choi');
    // Đường dẫn: id phiếu thay bằng :x.
    expect(ma.api).toBe('POST /api/v1/payment-requests/:x/pay');
    expect(tomTatMa(ma)).toContain(TRACE_ID.slice(0, 8));

    const chep = noiDungChep(ma);
    const baoLoi = noiDungBaoLoi(ma, { version: '0.1.0', kernel: '0.1.0', standard: '1.0.0-draft' });
    for (const text of [chep, baoLoi]) {
      expect(text).toContain(ma.requestId!);
      expect(text).toContain(TRACE_ID);
      // Câu của máy chủ chỉ được thay bằng câu mặc định của danh mục (không dữ liệu) — trùng thì bỏ qua phép dò.
      const serverMsg = again.body.error.message === cauMacDinh(ma.code) ? [] : [again.body.error.message];
      for (const secret of ['7654321', '7.654.321', 'NCC-MTC', 'Mã Tra Cứu Bí Mật', paidId, ...serverMsg, 'Bearer', ctx.token]) expect(text).not.toContain(secret);
    }
    expect(baoLoi).toContain('0.1.0 / 0.1.0 / 1.0.0-draft');
  });

  it('mã sai khuôn bị bỏ; câu / chi tiết của máy chủ không lọt vào nội dung', () => {
    const ma = docMaTuPhanHoi({
      status: 400, method: 'post', path: '/api/v1/partners/NCC-001?q=Nguyễn Văn A', screen: '/danh-muc/doi-tac?q=0101234567',
      error: { code: 'VALIDATION_ERROR', requestId: 'req-1\nMST 0101234567', traceId: 'không-phải-hex', details: { reason: 'Khách Nguyễn Văn A nợ 5.000.000', field: 'taxCode' } },
    });
    expect(ma.requestId).toBeUndefined();
    expect(ma.traceId).toBeUndefined();
    expect(ma.reason).toBeUndefined();
    expect(ma.api).toBe('POST /api/v1/partners/:x');
    expect(ma.screen).toBe('/danh-muc/doi-tac');
    const text = noiDungBaoLoi(ma) + noiDungChep(ma);
    for (const secret of ['Nguyễn', '0101234567', '5.000.000', 'NCC-001', 'taxCode']) expect(text).not.toContain(secret);
  });

  it('thân hỏng (proxy 504): requestId lấy từ header; mã lỗi kỹ thuật', () => {
    const ma = docMaTuPhanHoi({ status: 504, method: 'GET', path: '/api/v1/reports/trial-balance', screen: '/ke-toan', error: null, headerRequestId: 'req-abc123' });
    expect(ma).toMatchObject({ requestId: 'req-abc123', code: 'INTERNAL_ERROR' });
    expect(ma.traceId).toBeUndefined();
    expect(loaiLoi(ma)).toBe('ky-thuat');
    expect(noiDungChep(ma)).toContain('traceId: —');
  });

  it('làm sạch đường dẫn: giữ đoạn chữ thường, thay mã / số / uuid', () => {
    expect(lamSachDuongDan('/api/v1/documents/3f2b9c1e-0000-4000-8000-000000000000/post?x=1#a')).toBe('/api/v1/documents/:x/post');
    expect(lamSachDuongDan('/ke-toan/so-cai/PC0001')).toBe('/ke-toan/so-cai/:x');
    expect(lamSachDuongDan('')).toBe('/');
  });
});
