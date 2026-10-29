/**
 * Add-in Trợ lý: mô phỏng định khoản phiếu mẫu chạy đúng luật thật và không để lại gì trong sổ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb, db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
const sim = (body: object) => call(ctx, 'POST', '/api/v1/addins/tro-ly/simulate', { branchCode: 'CN01', amount: 1_000_000, ...body });
const pairs = (data: any) => data.entries.flatMap((e: any) => e.lines).map((l: any) => `${l.debit ? 'N' : 'C'}${l.accountCode}:${l.debit || l.credit}`);

beforeAll(async () => { ctx = await setupTenant(); });
afterAll(async () => { await ctx.app.close(); await closeDb(); });

describe('Trợ lý — mô phỏng định khoản', () => {
  it('phiếu bán: doanh thu, thuế đầu ra, giá vốn minh hoạ; không ghi gì vào sổ', async () => {
    const before = Number((await db.selectFrom('accounting_events').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow()).n);
    const res = await sim({ flow: 'sale', taxCode: 'R08' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.ok, JSON.stringify(res.body.data)).toBe(true);
    const p = pairs(res.body.data);
    expect(p).toContain('C33311:80000');
    expect(p.some((x: string) => x.startsWith('C511') && x.endsWith(':1000000'))).toBe(true);
    expect(p.some((x: string) => x.startsWith('N131') && x.endsWith(':1000000'))).toBe(true);
    expect(p.some((x: string) => x.startsWith('N632') && x.endsWith(':700000'))).toBe(true);
    expect(res.body.data.movements).toEqual([expect.objectContaining({ branchCode: 'CN01', kind: 'sale' })]);
    const after = Number((await db.selectFrom('accounting_events').select((eb) => eb.fn.countAll<string>().as('n')).executeTakeFirstOrThrow()).n);
    expect(after).toBe(before);
    expect(await db.selectFrom('accounting_events').select('id').where('doc_key', 'like', 'tro-ly:%').execute()).toEqual([]);
  });

  it('phiếu mua dùng thuế đầu vào; phiếu thu tiền mặt Nợ 111 / Có 131', async () => {
    const buy = await sim({ flow: 'purchase', taxCode: 'V08' });
    expect(buy.body.data.ok, JSON.stringify(buy.body.data)).toBe(true);
    expect(pairs(buy.body.data).some((x: string) => x.startsWith('N133') && x.endsWith(':80000'))).toBe(true);
    const rec = await sim({ flow: 'receipt', methodCode: 'TM' });
    expect(rec.body.data.ok, JSON.stringify(rec.body.data)).toBe(true);
    const p = pairs(rec.body.data);
    expect(p.some((x: string) => x.startsWith('N111'))).toBe(true);
    expect(p.some((x: string) => x.startsWith('C131'))).toBe(true);
  });

  it('lý do chưa khai báo: báo lỗi rõ ràng, không ghi gì', async () => {
    const res = await sim({ flow: 'sale', taxCode: 'R08', reasonCode: 'KHONG-CO' });
    expect(res.body.data).toMatchObject({ ok: false });
    expect(res.body.data.error).toContain('KHONG-CO');
  });
});

describe('Trợ lý — dữ liệu huấn luyện (tệp JSONL, không bảng)', () => {
  const K = '/api/v1/addins/tro-ly/knowledge';
  let dir = '';
  beforeAll(async () => {
    const { mkdtemp } = await import('node:fs/promises');
    const os = await import('node:os');
    const path = await import('node:path');
    dir = await mkdtemp(path.join(os.tmpdir(), 'troly-'));
    process.env.DATA_DIR = dir;
  });
  afterAll(async () => {
    const { rm } = await import('node:fs/promises');
    delete process.env.DATA_DIR;
    await rm(dir, { recursive: true, force: true });
  });

  it('thêm, sửa, xoá; lưu thành tệp <tenant>.jsonl mỗi dòng một mục', async () => {
    const add = await call(ctx, 'POST', K, { kind: 'faq', question: 'Phiếu chi tạm ứng ghi thế nào?', keywords: ['tam ung'], answer: 'Nợ 141 / Có 111.', screens: ['ACC89'], active: true });
    expect(add.status, JSON.stringify(add.body)).toBe(201);
    const id = add.body.data.id;
    expect(add.body.data).toMatchObject({ kind: 'faq', createdBy: expect.any(String) });
    const upd = await call(ctx, 'PUT', `${K}/${id}`, { kind: 'guide', question: 'Phiếu chi tạm ứng ghi thế nào?', keywords: [], answer: 'Nợ 141 / Có 1111.', screens: [], active: false });
    expect(upd.status).toBe(200);
    expect(upd.body.data).toMatchObject({ id, kind: 'guide', active: false, answer: 'Nợ 141 / Có 1111.' });
    const list = await call(ctx, 'GET', K);
    expect(list.body.data).toHaveLength(1);
    const { readFile } = await import('node:fs/promises');
    const path = await import('node:path');
    const { readdir } = await import('node:fs/promises');
    const files = (await readdir(path.join(dir, 'tro-ly'))).filter((f) => f.endsWith('.jsonl'));
    expect(files).toHaveLength(1);
    const text = await readFile(path.join(dir, 'tro-ly', files[0]!), 'utf8');
    expect(text.trim().split('\n')).toHaveLength(1);
    expect((await call(ctx, 'DELETE', `${K}/${id}`)).status).toBe(200);
    expect((await call(ctx, 'DELETE', `${K}/${id}`)).status).toBe(404);
    expect((await call(ctx, 'GET', K)).body.data).toEqual([]);
  });

  it('xuất / nhập JSONL: trùng id ghi đè, dòng hỏng báo số dòng', async () => {
    const a = (await call(ctx, 'POST', K, { kind: 'faq', question: 'Câu hỏi A là gì?', keywords: [], answer: 'A', screens: [], active: true })).body.data;
    const exp = await ctx.app.inject({ method: 'GET', url: `${K}/export`, headers: { authorization: `Bearer ${ctx.token}` } });
    expect(exp.statusCode).toBe(200);
    expect(exp.headers['content-type']).toContain('ndjson');
    const line = JSON.parse(exp.body.trim());
    const jsonl = [JSON.stringify({ ...line, answer: 'A2' }), '{hỏng', JSON.stringify({ question: 'Câu hỏi B mới?', answer: 'B' })].join('\n');
    const imp = await call(ctx, 'POST', `${K}/import`, { jsonl });
    expect(imp.body.data).toEqual({ added: 1, updated: 1, badLines: [2] });
    const list = (await call(ctx, 'GET', K)).body.data;
    expect(list.find((x: any) => x.id === a.id).answer).toBe('A2');
    expect(list).toHaveLength(2);
  });

  it('ảnh: tải lên data URL, xem công khai theo tên ngẫu nhiên; tên lạ bị chặn', async () => {
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const up = await call(ctx, 'POST', '/api/v1/addins/tro-ly/images', { dataUrl: png });
    expect(up.status, JSON.stringify(up.body)).toBe(200);
    expect(up.body.data.url).toMatch(/^\/api\/v1\/addins\/tro-ly\/images\/[0-9a-f]{32}\.png$/);
    const get = await ctx.app.inject({ method: 'GET', url: up.body.data.url });
    expect(get.statusCode).toBe(200);
    expect(get.headers['content-type']).toBe('image/png');
    expect((await ctx.app.inject({ method: 'GET', url: '/api/v1/addins/tro-ly/images/..%2F..%2Fx.png' })).statusCode).toBe(400);
    expect((await call(ctx, 'POST', '/api/v1/addins/tro-ly/images', { dataUrl: 'data:text/html;base64,PGI+' })).status).toBe(400);
  });
});
