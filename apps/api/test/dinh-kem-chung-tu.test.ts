// [2026-11-12 kiennt] NT-QUY-001 — test đính kèm chứng từ gốc phần 1 (phiếu chuyển tiền, phiếu chuyển kho) qua API đính kèm chung
/**
 * NT-QUY-001 — Đính kèm chứng từ gốc (docs/nghiem-thu/quy/NT-QUY-001-dinh-kem-chung-tu-goc.md), phần 1: phiếu chuyển tiền, phiếu
 * chuyển kho. Giao diện (khung TepChungTu) gọi `/api/v1/document-attachments` với khoá `ledger.event:<docKey>`; test khoá đúng các
 * kết quả mong đợi của phiếu:
 *   - đính 2 tệp → danh sách 2 tệp (tên, loại, dung lượng, người gửi, giờ gửi); gửi lại đúng tệp đã có → không thêm bản trùng;
 *   - tệp trên 15 MB → từ chối; gỡ tệp → còn 1, không xoá hẳn (nhật ký có lượt gỡ);
 *   - người chỉ có quyền xem: xem / tải được, không đính được;
 *   - sửa phiếu sang phiên bản mới, huỷ phiếu: tệp vẫn còn (gắn theo phiếu, không theo phiên bản); tên tệp tiếng Việt có dấu cách giữ nguyên khi tải.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
type Tep = { id: string; docRef: string; kind: string; fileName: string; contentType: string; sizeBytes: number; createdBy: string; createdAt: string };
const ref = (docKey: string) => `ledger.event:${docKey}`;
const list = async (docRef: string) => {
  const r = await call<{ data: { files: Tep[] } }>(ctx, 'GET', `/api/v1/document-attachments?docRef=${encodeURIComponent(docRef)}`);
  expect(r.status, JSON.stringify(r.body)).toBe(200);
  return r.body.data.files;
};
const attach = (docRef: string, fileName: string, content: Buffer, kind = 'chung_tu_goc', contentType = 'application/pdf', headers: Record<string, string> = {}) =>
  call<{ data: Tep & { created: boolean } }>(ctx, 'POST', '/api/v1/document-attachments', { docRef, kind, fileName, contentType, dataBase64: content.toString('base64') }, headers);
const pdf = Buffer.from('%PDF-1.4\n% uy nhiem chi 0001\n%%EOF\n');
const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2048, 7)]);
const cashTransfer = (version: number, total: number) => ({
  docType: 'cash_transfer', docKey: 'CT-DK1', version, branchCode: 'CN01', toBranchCode: 'CN02', docNo: 'CT-DK1', docDate: '2026-11-10',
  fromMethodCode: 'TM', toMethodCode: 'TM', status: 'sent', totals: { total },
});

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  expect((await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' })).status).toBeLessThan(300);
  const r = await call(ctx, 'POST', '/api/v1/documents', cashTransfer(1, 5_000_000));
  expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
});
afterAll(async () => { await ctx.app.close(); });

describe('NT-QUY-001 — đính kèm chứng từ gốc trên phiếu chuyển tiền', () => {
  it('đính 2 tệp → danh sách 2 tệp, đủ tên / loại / dung lượng / người gửi / giờ', async () => {
    expect((await attach(ref('CT-DK1'), 'Uỷ nhiệm chi 0001.pdf', pdf, 'uy_nhiem_chi')).status).toBe(201);
    expect((await attach(ref('CT-DK1'), 'biên lai.jpg', jpg, 'bien_lai', 'image/jpeg')).status).toBe(201);
    const files = await list(ref('CT-DK1'));
    expect(files.map((f) => [f.fileName, f.kind, f.sizeBytes]).sort()).toEqual([['Uỷ nhiệm chi 0001.pdf', 'uy_nhiem_chi', pdf.length], ['biên lai.jpg', 'bien_lai', jpg.length]].sort());
    for (const f of files) {
      expect(f.createdBy).toMatch(/^user:/);
      expect(Number.isNaN(Date.parse(f.createdAt))).toBe(false);
    }
  });

  it('gửi lại đúng tệp đã có → không thêm bản trùng', async () => {
    const r = await attach(ref('CT-DK1'), 'unc-gui-lai.pdf', pdf, 'uy_nhiem_chi');
    expect(r.body.data.created).toBe(false);
    expect(await list(ref('CT-DK1'))).toHaveLength(2);
  });

  it('tệp trên 15 MB → từ chối, không thêm tệp', async () => {
    const r = await attach(ref('CT-DK1'), 'qua-lon.pdf', Buffer.alloc(15 * 1024 * 1024 + 1, 1));
    expect([400, 413]).toContain(r.status);
    expect(await list(ref('CT-DK1'))).toHaveLength(2);
  });

  it('tải về đúng nội dung, giữ tên tiếng Việt có dấu cách', async () => {
    const f = (await list(ref('CT-DK1'))).find((x) => x.kind === 'uy_nhiem_chi')!;
    const res = await ctx.app.inject({ method: 'GET', url: `/api/v1/document-attachments/${f.id}/file`, headers: { authorization: `Bearer ${ctx.token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.rawPayload.equals(pdf)).toBe(true);
    expect(res.headers['content-disposition']).toBe(`attachment; filename*=UTF-8''${encodeURIComponent('Uỷ nhiệm chi 0001.pdf')}`);
  });

  it('sửa phiếu sang phiên bản mới → tệp vẫn còn', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents', cashTransfer(2, 6_000_000));
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    expect(await list(ref('CT-DK1'))).toHaveLength(2);
  });

  it('gỡ tệp → còn 1 tệp; không xoá hẳn (dòng còn, nhật ký có lượt gỡ)', async () => {
    const f = (await list(ref('CT-DK1'))).find((x) => x.kind === 'bien_lai')!;
    expect((await call(ctx, 'POST', `/api/v1/document-attachments/${f.id}/archive`, {})).status).toBe(200);
    expect((await list(ref('CT-DK1'))).map((x) => x.fileName)).toEqual(['Uỷ nhiệm chi 0001.pdf']);
    const row = await db.selectFrom('document_attachments').select(['archived_at']).where('tenant_id', '=', tenantId).where('id', '=', f.id).executeTakeFirstOrThrow();
    expect(row.archived_at).not.toBeNull();
    const log = await db.selectFrom('audit_logs').select('action').where('tenant_id', '=', tenantId).where('action', '=', 'core.document-attachment.archive').execute();
    expect(log.length).toBeGreaterThan(0);
  });

  it('huỷ phiếu → tệp vẫn giữ, xem được', async () => {
    const r = await call(ctx, 'POST', '/api/v1/documents/cancel', { docKey: 'CT-DK1', reason: 'Thử huỷ phiếu chuyển tiền có tệp' });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    expect(await list(ref('CT-DK1'))).toHaveLength(1);
  });

  it('người chỉ có quyền xem: xem / tải được, không đính được', async () => {
    expect((await call(ctx, 'POST', '/api/v1/users', { email: 'xem@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' })).status).toBe(201);
    const login = (await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email: 'xem@ketoan.local', password: 'Xem@12345' } })).json();
    const auth = { authorization: `Bearer ${login.data.token}` };
    const seen = await ctx.app.inject({ method: 'GET', url: `/api/v1/document-attachments?docRef=${encodeURIComponent(ref('CT-DK1'))}`, headers: auth });
    expect(seen.statusCode).toBe(200);
    expect(seen.json().data.files).toHaveLength(1);
    expect((await attach(ref('CT-DK1'), 'khac.pdf', Buffer.from('%PDF-1.4 khac'), 'khac', 'application/pdf', auth)).status).toBe(403);
  });
});

describe('NT-QUY-001 — đính kèm trên phiếu chuyển kho (khoá theo chứng từ đầu xuất)', () => {
  it('phiếu chuyển kho đã ghi có outDocKey; đính biên bản giao nhận theo khoá đó', async () => {
    for (const b of [{ code: 'KHO', name: 'Kho tổng' }, { code: 'SHOP1', name: 'Cửa hàng 1' }]) await call(ctx, 'POST', '/api/v1/branches', b);
    const r = await call<{ data: { id: string; outDocKey: string } }>(ctx, 'POST', '/api/v1/kho/transfers', {
      docDate: '2026-11-10', fromBranchCode: 'KHO', toBranchCode: 'SHOP1', note: 'Thử đính kèm',
      lines: [{ lineKey: 'a', sku: 'DK-SUA', name: 'Sữa thử đính kèm', unit: 'Lon', qty: 2 }],
    });
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300);
    const key = r.body.data.outDocKey;
    expect(key).toBe(`erp:ck:${r.body.data.id}:out`);
    expect((await attach(ref(key), 'bien-ban-giao-nhan.jpg', jpg, 'bien_ban', 'image/jpeg')).status).toBe(201);
    expect((await list(ref(key))).map((f) => f.kind)).toEqual(['bien_ban']);
  });
});
