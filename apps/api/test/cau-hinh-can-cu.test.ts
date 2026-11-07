// [2026-11-06 04:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-43: căn cứ của khoá cấu hình (bizcity_settings@1 1.2.0) — T030-CFG-BASIS-1..6 (chữ chốt: docs/contracts/BIZCITY-SETTINGS-MATRIX-v1.md, docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/24-CAU-HINH-HE-THONG.md)
/**
 *   T030-CFG-BASIS-1  khuôn căn cứ: doc bắt buộc; trường lạ, url không https, ngày sai, chuỗi quá dài bị từ chối; căn cứ đủ trường được nhận
 *   T030-CFG-BASIS-2  9 khoá loại A có căn cứ mặc định ở registry và căn cứ đó là THẬT: tệp tồn tại, mã luật (R-…-n, ADR) có trong tệp
 *   T030-CFG-BASIS-3  ghi một phiên bản kèm căn cứ → lưu, lịch sử trả lại, overview lấy căn cứ của phiên bản (basisFrom = version) thắng căn cứ mặc định
 *   T030-CFG-BASIS-4  căn cứ sai khuôn khi ghi → VALIDATION, không ghi gì; không có căn cứ vẫn ghi được (không bắt buộc — D030-12)
 *   T030-CFG-BASIS-5  bằng chứng của lần ghi mang căn cứ; cột setting_values.basis chỉ nhận đối tượng (CHECK) và bảng vẫn chỉ-thêm
 *   T030-CFG-BASIS-6  nơi dùng (usedBy) do registry khai; khoá chưa khai thì rỗng; sức khoẻ đếm đúng khoá đã / chưa khai căn cứ
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { checkSettingBasis, settingsRegistry } from '@bizcity/platform/core/settings';
import { auditRows, call, setupTenant, type TestCtx } from './helpers.js';

const ROOT = path.resolve(__dirname, '../../..');
let ctx: TestCtx;
let tenantId = '';
const KEY = 'bizcity.intake.retention_days';
const BASIS = { doc: 'docs/rules/RULE-INTAKE.md', article: 'bể chờ đầu vào', clause: 'hạn giữ mục đã đóng', url: 'https://example.com/quy-che', effectiveFrom: '2026-01-01' };

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

const overview = async () => (await call(ctx, 'GET', '/api/v1/settings/overview')).body.data as { health: Record<string, number>; items: Array<Record<string, any>> };
const put = (body: Record<string, unknown>, key = KEY) => call(ctx, 'PUT', `/api/v1/settings/values/${key}`, body);

describe('T030-CFG-BASIS — căn cứ của khoá cấu hình', () => {
  it('T030-CFG-BASIS-1 khuôn căn cứ', () => {
    expect(checkSettingBasis({ doc: 'Luật X' })).toBeNull();
    expect(checkSettingBasis(BASIS)).toBeNull();
    expect(checkSettingBasis({})).toMatch(/doc/);
    expect(checkSettingBasis({ doc: '   ' })).toMatch(/doc/);
    expect(checkSettingBasis({ doc: 'x'.repeat(501) })).toMatch(/doc/);
    expect(checkSettingBasis({ doc: 'a', loai: 'x' })).toMatch(/trường lạ: loai/);
    expect(checkSettingBasis({ doc: 'a', url: 'http://khong-bao-mat.vn' })).toMatch(/https/);
    expect(checkSettingBasis({ doc: 'a', url: 'javascript:alert(1)' })).toMatch(/https/);
    expect(checkSettingBasis({ doc: 'a', effectiveFrom: '01/01/2026' })).toMatch(/YYYY-MM-DD/);
    expect(checkSettingBasis({ doc: 'a', article: 'y'.repeat(501) })).toMatch(/article/);
    expect(checkSettingBasis('chuỗi')).toMatch(/đối tượng/);
    expect(checkSettingBasis([{ doc: 'a' }])).toMatch(/đối tượng/);
  });

  it('T030-CFG-BASIS-2 các khoá loại A đã khai căn cứ có căn cứ mặc định ở registry, và căn cứ đó là thật', () => {
    const all = [...settingsRegistry().values()];
    // Danh sách khoá loại A S030-43 đã khai căn cứ (khoá loại A mới của nhóm khác thêm sau không bị buộc ở đây — hợp đồng 1.2: "nên có").
    const declared = ['bizcity.install.book_mode', 'bizcity.lock.period', 'bizcity.lock.data', 'bizcity.posting.modes', 'bizcity.posting.default_accounts', 'bizcity.posting.reasons', 'bizcity.posting.product_groups', 'bizcity.posting.payment_methods', 'bizcity.posting.tax_codes', 'bizcity.authz.shadow'];
    for (const k of declared) expect(all.find((e) => e.key === k)?.class, k).toBe('A');
    const classA = all.filter((e) => declared.includes(e.key));
    expect(classA.length).toBe(declared.length);
    // mọi căn cứ đã khai (kể cả khoá khác) phải đúng khuôn
    for (const e of all.filter((x) => x.basis)) expect(checkSettingBasis(e.basis), e.key).toBeNull();
    for (const e of classA) {
      expect(e.basis, e.key).toBeTruthy();
      expect(checkSettingBasis(e.basis), e.key).toBeNull();
      // Căn cứ phải trỏ tới tệp có thật và mã luật nhắc tới phải có trong tệp đó — không tự bịa điều luật.
      const file = path.join(ROOT, e.basis!.doc);
      expect(existsSync(file), `${e.key}: ${e.basis!.doc}`).toBe(true);
      const text = readFileSync(file, 'utf8');
      for (const code of `${e.basis!.article ?? ''} ${e.basis!.clause ?? ''}`.match(/R-[A-Z]+-\d+/g) ?? []) {
        const where = /RULE-(\w+)\.md/.exec(`${e.basis!.clause ?? ''}`)?.[0];
        const hay = where && !text.includes(code) && existsSync(path.join(ROOT, 'docs/rules', where)) ? readFileSync(path.join(ROOT, 'docs/rules', where), 'utf8') : text;
        expect(hay.includes(code), `${e.key}: ${code} không có trong tệp căn cứ`).toBe(true);
      }
      for (const m of `${e.basis!.clause ?? ''}`.matchAll(/(docs\/[\w./-]+\.md)/g)) expect(existsSync(path.join(ROOT, m[1]!)), `${e.key}: ${m[1]}`).toBe(true);
    }
  });

  it('T030-CFG-BASIS-3 ghi phiên bản kèm căn cứ: lưu, lịch sử trả lại, overview lấy căn cứ của phiên bản', async () => {
    const before = (await overview()).items.find((i) => i.key === KEY)!;
    expect(before).toMatchObject({ basis: null, basisFrom: null });
    const r = await put({ value: 45, reason: 'Theo quy chế mới', basis: BASIS });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data.basis).toEqual(BASIS);
    const h = await call(ctx, 'GET', `/api/v1/settings/values/${KEY}/history`);
    expect(h.body.data.versions[0]).toMatchObject({ version: 1, reason: 'Theo quy chế mới', basis: BASIS });
    const row = (await overview()).items.find((i) => i.key === KEY)!;
    expect(row).toMatchObject({ basis: BASIS, basisFrom: 'version', current: { value: 45 } });
    // phiên bản sau không khai căn cứ: căn cứ của phiên bản đang áp là rỗng, không "thừa kế" nhầm của bản cũ
    expect((await put({ value: 50, reason: 'Điều chỉnh' })).status).toBe(200);
    expect((await overview()).items.find((i) => i.key === KEY)).toMatchObject({ basis: null, basisFrom: null, current: { value: 50 } });
    // lịch sử vẫn giữ căn cứ của bản đầu
    const h2 = await call(ctx, 'GET', `/api/v1/settings/values/${KEY}/history`);
    expect(h2.body.data.versions.map((v: any) => [v.version, v.basis])).toEqual([[2, null], [1, BASIS]]);
  });

  it('T030-CFG-BASIS-4 căn cứ sai khuôn bị từ chối, không ghi gì', async () => {
    const n0 = (await sql<{ n: number }>`SELECT count(*)::int AS n FROM setting_values WHERE tenant_id = ${tenantId}`.execute(db)).rows[0]!.n;
    for (const bad of [{ loai: 'x' }, { doc: 'a', url: 'http://x.vn' }, { doc: '' }, { doc: 'a', effectiveFrom: '2026/01/01' }]) {
      const r = await put({ value: 40, reason: 'Thử căn cứ sai', basis: bad });
      expect(r.status, JSON.stringify(bad)).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
      expect(r.body.error.message).toMatch(/Căn cứ của/);
    }
    expect((await sql<{ n: number }>`SELECT count(*)::int AS n FROM setting_values WHERE tenant_id = ${tenantId}`.execute(db)).rows[0]!.n).toBe(n0);
    // không bắt buộc: basis = null và không truyền đều ghi được
    expect((await put({ value: 40, reason: 'Không căn cứ', basis: null })).status).toBe(200);
  });

  it('T030-CFG-BASIS-5 bằng chứng mang căn cứ; cột chỉ nhận đối tượng; bảng vẫn chỉ-thêm', async () => {
    const r = await put({ value: 30, reason: 'Có căn cứ để kiểm bằng chứng', basis: { doc: 'Quy chế nội bộ 01/2026', article: 'Điều 3' } });
    expect(r.status).toBe(200);
    const rows = await auditRows(tenantId, 'settings.set', KEY);
    expect(rows.some((x) => x.after?.basis?.doc === 'Quy chế nội bộ 01/2026')).toBe(true);
    await expect(sql`INSERT INTO setting_values (tenant_id, key, scope_type, scope_id, value, version, created_by, basis)
                     VALUES (${tenantId}, ${KEY}, 'tenant', '', '1'::jsonb, 99, 'test', '["mảng"]'::jsonb)`.execute(db)).rejects.toThrow(/basis|check/i);
    await expect(sql`UPDATE setting_values SET basis = '{"doc":"sửa"}'::jsonb WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow();
    const c = await sql<{ d: string | null }>`SELECT col_description('setting_values'::regclass, (SELECT attnum FROM pg_attribute WHERE attrelid = 'setting_values'::regclass AND attname = 'basis')) AS d`.execute(db);
    expect(c.rows[0]?.d).toMatch(/Căn cứ của phiên bản/);
  });

  it('T030-CFG-BASIS-6 usedBy do registry khai; sức khoẻ đếm đúng khoá đã / chưa khai căn cứ', async () => {
    const d = await overview();
    expect(d.items.find((i) => i.key === 'bizcity.lock.period')).toMatchObject({ usedBy: [{ kind: 'gate', ref: expect.stringContaining('khoá kỳ') }], basisFrom: 'registry' });
    expect(d.items.find((i) => i.key === 'bizcity.tenant.logo')).toMatchObject({ usedBy: [], basis: null, basisFrom: null });
    const withBasis = d.items.filter((i) => i.basis !== null).length;
    expect(d.health.withBasis).toBe(withBasis);
    expect(d.health.missingBasis).toBe(d.items.length - withBasis);
    // khoá có căn cứ ở registry + khoá vừa ghi phiên bản có căn cứ (KEY: căn cứ của phiên bản cuối là rỗng nên không tính)
    expect(withBasis).toBe(d.items.filter((i) => settingsRegistry().get(i.key)?.basis).length + d.items.filter((i) => i.basisFrom === 'version' && !settingsRegistry().get(i.key)?.basis).length);
  });
});
