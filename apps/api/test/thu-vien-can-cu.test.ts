// [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49a (B3a, PHASE-030 · 26 §6): test căn cứ pháp lý — thư viện vn.can-cu-phap-ly (bí danh LEGAL_BASES, văn bản thay thế), xác nhận theo đơn vị bằng bằng chứng, hết hiệu lực khi mục đổi, quyền, cô lập đơn vị
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { closeDb, db } from '../src/db/client.js';
import { LEGAL_BASES } from '@ketoan/contracts';
import { getLibrary, itemHash, libraryAttestations, validateAgainstLibrary, type Library } from '@bizcity/platform/core/libraries/index';
import { call, setupTenant, type TestCtx } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const ROOT = path.resolve(__dirname, '../../..');

describe('Thư viện vn.can-cu-phap-ly', () => {
  it('mọi khoá LEGAL_BASES là bí danh của một mục; văn bản bị thay ngừng dùng, gợi ý văn bản thay', () => {
    const lib = getLibrary('vn.can-cu-phap-ly')!;
    const aliases = new Set(lib.items.flatMap((i) => i.aliases ?? []));
    for (const key of Object.keys(LEGAL_BASES)) expect(aliases.has(key), key).toBe(true);
    const r = validateAgainstLibrary(lib, 'TT99');
    expect(r.resolved).toBe('vn.circular.99-2025-tt-btc');
    const old = validateAgainstLibrary(lib, '200/2014/TT-BTC');
    expect(old.findings[0]).toMatchObject({ code: 'LIB-DEPRECATED-001' });
    expect(old.findings[0]!.suggestions[0]!.value).toBe('vn.circular.99-2025-tt-btc');
    // Sổ nguồn chưa ai rà văn bản gốc → không văn bản nào "đã duyệt"; chỉ quy ước phần mềm.
    expect(lib.items.filter((i) => i.verified).map((i) => i.code)).toEqual(['noi-bo']);
  });

  it('SC-LIB-1: basis[].key của mọi thư viện có trong vn.can-cu-phap-ly', async () => {
    const shared = await import(path.join(ROOT, 'scripts/thu-vien/thu-vien.mjs'));
    const keys = shared.basisKeysOf(getLibrary('vn.can-cu-phap-ly'));
    for (const id of ['vn.tham-so-phap-ly', 'vn.ngay-nghi-le', 'authz.tgs-chuc-nang', 'authz.tgs-nhom']) {
      expect(shared.lintLibrary(getLibrary(id), { dir: id, hasReadme: true, basisKeys: keys }), id).toEqual([]);
    }
  });

  it('băm một mục đổi khi nội dung mục đổi (căn cứ để xác nhận hết hiệu lực)', () => {
    const lib = getLibrary('vn.can-cu-phap-ly')!;
    const h = itemHash(lib, 'vn.law.88-2015-qh13')!;
    const changed: Library = { ...lib, items: lib.items.map((i) => (i.code === 'vn.law.88-2015-qh13' ? { ...i, name: `${i.name} (sửa)` } : i)) };
    expect(itemHash(changed, 'vn.law.88-2015-qh13')).not.toBe(h);
    expect(itemHash(lib, 'khong-co')).toBeUndefined();
  });
});

describe('Xác nhận theo đơn vị (core.library.attest)', () => {
  let a: TestCtx;
  let b: TestCtx;
  beforeAll(async () => { a = await setupTenant(); b = await setupTenant(); });
  afterAll(async () => {
    await a.app.close();
    await b.app.close();
    await closeDb();
  });

  const attest = (ctx: TestCtx, body: unknown) => call(ctx, 'POST', '/api/v1/libraries/vn.can-cu-phap-ly/attest', body);
  const list = async (ctx: TestCtx) => (await call(ctx, 'GET', '/api/v1/libraries/vn.can-cu-phap-ly/attestations')).body.data;

  it('xác nhận → có bằng chứng, còn hiệu lực; gỡ → không còn; lý do bắt buộc; mã phải là mã chuẩn', async () => {
    const ok = await attest(a, { code: 'vn.law.88-2015-qh13', reason: 'Đã đối chiếu văn bản hợp nhất 41/VBHN-VPQH' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.meta.receipt.evidenceId).toBeTruthy();
    let l = await list(a);
    expect(l.items).toEqual([expect.objectContaining({ code: 'vn.law.88-2015-qh13', attested: true, valid: true, reason: 'Đã đối chiếu văn bản hợp nhất 41/VBHN-VPQH' })]);

    expect((await attest(a, { code: 'vn.law.88-2015-qh13', reason: 'x' })).status).toBe(400);
    expect((await attest(a, { code: 'LKT', reason: 'dùng bí danh thì không nhận' })).status).toBe(404);

    expect((await attest(a, { code: 'vn.law.88-2015-qh13', reason: 'Gỡ — chờ bản Công báo', revoke: true })).status).toBe(200);
    l = await list(a);
    expect(l.items[0]).toMatchObject({ attested: false, valid: false });
  });

  it('xác nhận hết hiệu lực khi bản thư viện mới đổi nội dung mục', async () => {
    await attest(a, { code: 'vn.decree.123-2020-nd-cp', reason: 'Đối chiếu Nghị định 123/2020 bản gốc' });
    const tid = (await sql<{ id: string }>`SELECT id::text AS id FROM tenants WHERE code = ${a.tenantCode}`.execute(db)).rows[0]!.id;
    const lib = getLibrary('vn.can-cu-phap-ly')!;
    const now = (await libraryAttestations(db, tid, lib)).find((x) => x.code === 'vn.decree.123-2020-nd-cp');
    expect(now).toMatchObject({ attested: true, valid: true });
    const next: Library = { ...lib, version: '1.1.0', items: lib.items.map((i) => (i.code === 'vn.decree.123-2020-nd-cp' ? { ...i, name: `${i.name} — bản mới` } : i)) };
    const after = (await libraryAttestations(db, tid, next)).find((x) => x.code === 'vn.decree.123-2020-nd-cp');
    expect(after).toMatchObject({ attested: true, valid: false, version: lib.version });
  });

  it('đơn vị khác không thấy xác nhận của nhau; người chỉ xem không xác nhận được', async () => {
    await attest(a, { code: 'vn.law.48-2024-qh15', reason: 'Đối chiếu Luật Thuế GTGT 2024' });
    expect((await list(b)).items).toEqual([]);
    const u = await call(b, 'POST', '/api/v1/users', { email: 'xem@ketoan.local', fullName: 'Người xem', role: 'viewer', password: 'Xem@12345' });
    expect(u.status, JSON.stringify(u.body)).toBe(201);
    const login = await b.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: b.tenantCode, email: 'xem@ketoan.local', password: 'Xem@12345' } });
    const token = (login.json() as any).data.token;
    const denied = await b.app.inject({ method: 'POST', url: '/api/v1/libraries/vn.can-cu-phap-ly/attest', payload: { code: 'vn.law.48-2024-qh15', reason: 'người xem thử xác nhận' }, headers: { authorization: `Bearer ${token}`, 'idempotency-key': 'xem-1' } });
    expect(denied.statusCode).toBe(403);
  });
});
