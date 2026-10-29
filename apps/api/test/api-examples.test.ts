/**
 * Các file mẫu trong docs/api/vi-du phải luôn gửi vào được và ghi sổ thành công.
 * Ai đổi khuôn chứng từ mà quên sửa mẫu thì test này báo, để tài liệu cho bên gửi không bao giờ sai.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ingestDocumentSchema, APPROVABLE_DOC_TYPES } from '@ketoan/contracts';
import { call, setupTenant, type TestCtx } from './helpers.js';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/api/vi-du');
const load = (name: string) => JSON.parse(readFileSync(join(DIR, name), 'utf8'));

// Thứ tự gửi giống thực tế: bán → trả → mua → trả NCC → chuyển kho (xuất rồi nhận) → kiểm kê → tiền.
const ORDER = [
  'ban-hang.json',
  'ban-noi-bo.json',
  'tra-hang-ban.json',
  'nhap-mua.json',
  'tra-hang-ncc.json',
  'chuyen-kho-da-xuat.json',
  'chuyen-kho-da-nhan.json',
  'dieu-chinh-kho-giam.json',
  'dieu-chinh-kho-tang.json',
  'chuyen-tien.json',
  'nop-tien-ngan-hang.json',
  'thu-tien-khach.json',
  'tra-tien-ncc.json',
];

let ctx: TestCtx;

const setModes = (m: 'auto' | 'approve') => call(ctx, 'PUT', '/api/v1/settings/posting-modes', Object.fromEntries(APPROVABLE_DOC_TYPES.map((t) => [t, m])));

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'POST', '/api/v1/branches', { code: 'CN02', name: 'Cửa hàng 02' });
});
afterAll(async () => {
  await ctx.app.close();
});

const send = (doc: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: doc as never, headers: { 'x-api-key': ctx.apiKey } });

describe('File mẫu docs/api/vi-du', () => {
  it('mọi file chứng từ mẫu đều có trong danh sách kiểm và đúng khuôn', () => {
    const files = readdirSync(DIR).filter((f) => f.endsWith('.json') && f !== 'huy-chung-tu.json');
    expect(files.sort()).toEqual([...ORDER].sort());
    for (const f of files) {
      const r = ingestDocumentSchema.safeParse(load(f));
      expect(r.success, `${f}: ${JSON.stringify(r.success ? '' : r.error.flatten())}`).toBe(true);
    }
  });

  for (const file of ORDER) {
    it(`${file} gửi bằng khoá API → ghi sổ`, async () => {
      const res = await send(load(file));
      expect(res.statusCode, res.body).toBe(200);
      expect(res.json().data.status, res.body).toBe('posted');
    });
  }

  it('gửi lại đúng phiên bản → unchanged (không ghi trùng)', async () => {
    const res = await send(load('ban-hang.json'));
    expect(res.json().data.status).toBe('unchanged');
  });

  it('huy-chung-tu.json (hệ thống nguồn gọi bằng khoá API): đưa chứng từ về cổng chờ ở trạng thái Chờ huỷ', async () => {
    // Chế độ Vào cổng chờ: nguồn báo xoá thì vào Chờ huỷ (chế độ Tự động tự huỷ — xem auto-push.test.ts).
    await setModes('approve');
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents/cancel', payload: load('huy-chung-tu.json'), headers: { 'x-api-key': ctx.apiKey } });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({ requested: true, reversed: 0 });
    await setModes('auto');
  });

  it('gửi theo lô: mỗi chứng từ một kết quả, chứng từ lỗi không chặn chứng từ khác', async () => {
    const ok = { ...load('nhap-mua.json'), docKey: 'kho:KHO01:purchase:9002', docNo: 'NM0009002' };
    const bad = { ...load('nhap-mua.json'), docKey: 'kho:KHO01:purchase:9003', branchCode: 'KHONG-CO' };
    const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents/batch', payload: { documents: [ok, bad] }, headers: { 'x-api-key': ctx.apiKey } });
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data.map((r: { status: string }) => r.status)).toEqual(['posted', 'error']);
  });
});
