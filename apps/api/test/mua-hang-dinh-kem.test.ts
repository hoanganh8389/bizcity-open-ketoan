/**
 * Đính kèm Mua hàng chạy trên đính kèm chung (migration 0046, PHASES 2.7, A-19): API /api/v1/purchase/attachments giữ khuôn,
 * tệp cũ (storage_root dinh-kem, chưa có băm) đọc được và được băm ở lần tải đầu, gỡ = lưu trữ, bảng cũ khoá ghi.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
let dataDir: string;
const oldDataDir = process.env.DATA_DIR;
const download = (id: string) => ctx.app.inject({ method: 'GET', url: `/api/v1/purchase/attachments/${id}/file`, headers: { authorization: `Bearer ${ctx.token}` } });

beforeAll(async () => {
  dataDir = await mkdtemp(path.join(os.tmpdir(), 'bizcity-mh-att-'));
  process.env.DATA_DIR = dataDir;
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
});
afterAll(async () => {
  await ctx.app.close();
  if (oldDataDir === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = oldDataDir;
  await rm(dataDir, { recursive: true, force: true });
});

describe('Đính kèm Mua hàng trên đính kèm chung', () => {
  it('hoá đơn NCC đính được tệp (trước 0046 bảng cũ không nhận owner_type invoice); lưu docRef mua-hang.invoice:<id>', async () => {
    const up = await call(ctx, 'POST', '/api/v1/purchase/attachments', { ownerType: 'invoice', ownerId: '77', kind: 'hoa_don_xml', fileName: 'hd.xml', mime: 'application/xml', dataBase64: Buffer.from('<HDon/>').toString('base64') });
    expect(up.status, JSON.stringify(up.body)).toBe(201);
    const row = await db.selectFrom('document_attachments').select(['doc_ref', 'kind', 'storage_root']).where('id', '=', up.body.data.id).executeTakeFirstOrThrow();
    expect(row).toEqual({ doc_ref: 'mua-hang.invoice:77', kind: 'hoa_don_xml', storage_root: 'attachments' });
    const ls = (await call(ctx, 'GET', '/api/v1/purchase/attachments?ownerType=invoice&ownerId=77')).body.data;
    expect(ls.files).toEqual([expect.objectContaining({ id: up.body.data.id, kind: 'hoa_don_xml', kindLabel: 'Hoá đơn XML gốc', fileName: 'hd.xml', mime: 'application/xml', size: 7 })]);
  });

  it('tệp chuyển từ bảng cũ: đọc từ DATA_DIR/dinh-kem, băm ở lần tải đầu, tệp bị đổi sau đó thì từ chối', async () => {
    const content = Buffer.from('Hợp đồng NCC cũ (gửi trước 0046)');
    const rel = '2026-09/abc-hop-dong.pdf';
    await mkdir(path.join(dataDir, 'dinh-kem', tenantId, '2026-09'), { recursive: true });
    await writeFile(path.join(dataDir, 'dinh-kem', tenantId, rel), content);
    const legacy = await db.insertInto('document_attachments').values({
      tenant_id: tenantId, doc_ref: 'mua-hang.partner:NCC-CU', kind: 'hop_dong', file_name: 'hop-dong.pdf', content_type: 'application/pdf',
      size_bytes: String(content.length), sha256: null, storage_root: 'dinh-kem', storage_path: rel, created_by: 'Người cũ', legacy_ref: `purchase_attachments:test-${tenantId}`,
    }).returning('id').executeTakeFirstOrThrow();
    const id = String(legacy.id);

    expect((await call(ctx, 'GET', '/api/v1/purchase/attachments?ownerType=partner&ownerId=NCC-CU')).body.data.files).toEqual([expect.objectContaining({ id, uploadedBy: 'Người cũ' })]);
    const first = await download(id);
    expect(first.statusCode).toBe(200);
    expect(first.rawPayload.equals(content)).toBe(true);
    const sha = (await db.selectFrom('document_attachments').select('sha256').where('id', '=', id).executeTakeFirstOrThrow()).sha256;
    expect(sha).toBe(createHash('sha256').update(content).digest('hex'));

    await writeFile(path.join(dataDir, 'dinh-kem', tenantId, rel), 'nội dung đã bị sửa');
    const tampered = await download(id);
    expect(tampered.statusCode).toBe(409);
  });

  it('gỡ tệp = lưu trữ: không còn trong danh sách, dòng vẫn còn; API Mua hàng không đọc tệp của module khác', async () => {
    const up = await call(ctx, 'POST', '/api/v1/purchase/attachments', { ownerType: 'policy', ownerId: '5', kind: 'bien_ban', fileName: 'bb.txt', mime: 'text/plain', dataBase64: Buffer.from('biên bản').toString('base64') });
    expect((await call(ctx, 'DELETE', `/api/v1/purchase/attachments/${up.body.data.id}`)).status).toBe(200);
    expect((await call(ctx, 'GET', '/api/v1/purchase/attachments?ownerType=policy&ownerId=5')).body.data.files).toEqual([]);
    const row = await db.selectFrom('document_attachments').select(['archived_at', 'archived_by']).where('id', '=', up.body.data.id).executeTakeFirstOrThrow();
    expect(row.archived_at).not.toBeNull();

    const other = await call(ctx, 'POST', '/api/v1/document-attachments', { docRef: 'hop-dong.contract:9', fileName: 'x.txt', dataBase64: Buffer.from('x').toString('base64') });
    expect(other.status, JSON.stringify(other.body)).toBe(201);
    expect((await download(other.body.data.id)).statusCode).toBe(404);
    expect((await call(ctx, 'DELETE', `/api/v1/purchase/attachments/${other.body.data.id}`)).status).toBe(404);
  });

  it('bảng cũ purchase_attachments khoá thêm / sửa', async () => {
    await expect(sql`INSERT INTO purchase_attachments (tenant_id, owner_type, owner_id, file_name, path) VALUES (${tenantId}, 'partner', 'X', 'x', 'x')`.execute(db)).rejects.toThrow(/đã chuyển sang document_attachments/);
  });
});
