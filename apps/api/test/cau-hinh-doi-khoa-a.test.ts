// [2026-11-07 02:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-40: đổi khoá loại A một người (D030-12 = B) — T030-CFG-2, 3, 7 + T030-CFG-IMP-1..3 (chữ chốt: docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/24-CAU-HINH-HE-THONG.md §4.3)
/**
 *   T030-CFG-2      đổi khoá A có ngày hiệu lực trong kỳ đã khoá → chặn PERIOD_LOCKED, không ghi gì; kỳ đang mở, khoá riêng của loại chứng từ, khoá loại C không bị chặn
 *   T030-CFG-3      một người có settings:write đổi khoá A, không cần duyệt; thiếu lý do / lý do ngắn → VALIDATION; thiếu căn cứ vẫn lưu
 *   T030-CFG-7      bằng chứng của lần đổi có người đổi, lý do, căn cứ (nếu có), giá trị cũ → mới
 *   T030-CFG-IMP-1  xem trước tác động: kỳ khoá, hiệu lực lùi, phiên bản muộn hơn, mục chờ — không ghi gì
 *   T030-CFG-IMP-2  xem trước chỉ báo, không chặn: kỳ khoá vẫn trả 200 (chỗ chặn là lúc lưu)
 *   T030-CFG-IMP-3  xem trước cần settings:write; sai khuôn → VALIDATION
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { auditRows, call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx, viewer: TestCtx;
let tenantId = '';
const A = 'bizcity.authz.shadow'; // khoá loại A duy nhất đã có valueType (enum on|off), phạm vi đơn vị
const C = 'bizcity.ui.theme'; // khoá loại C, có valueType

async function lockPeriod(year: number, month: number, docType = '*') {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const p = await sql<{ id: string }>`
    INSERT INTO fiscal_periods (tenant_id, year, month, start_date, end_date)
    VALUES (${tenantId}, ${year}, ${month}, ${start}::date, (${start}::date + interval '1 month - 1 day')::date) RETURNING id`.execute(db);
  await sql`INSERT INTO period_locks (tenant_id, period_id, branch_id, doc_type, locked_by) VALUES (${tenantId}, ${p.rows[0]!.id}, NULL, ${docType}, 'test')`.execute(db);
}
const versions = async (key: string) => (await sql<{ n: number }>`SELECT count(*)::int AS n FROM setting_values WHERE tenant_id = ${tenantId} AND key = ${key}`.execute(db)).rows[0]!.n;
const put = (key: string, body: Record<string, unknown>) => call(ctx, 'PUT', `/api/v1/settings/values/${key}`, body);
const impact = (qs: string, c: TestCtx = ctx, key = A) => call(c, 'GET', `/api/v1/settings/values/${key}/impact${qs}`);

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  const email = 'xem-doi-khoa@ketoan.local';
  expect((await call(ctx, 'POST', '/api/v1/users', { email, fullName: 'xem', role: 'viewer', password: 'Pass@12345' })).status).toBe(201);
  const login = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } });
  viewer = { ...ctx, token: login.json().data.token };
  await lockPeriod(2025, 3); // khoá chung: mọi chi nhánh, mọi loại
  await lockPeriod(2025, 5, 'purchase'); // chỉ khoá một loại chứng từ: không chặn đổi cấu hình
});
afterAll(async () => {
  await ctx.app.close();
});

describe('T030-CFG — đổi khoá loại A một người, chỉ ghi nhật ký', () => {
  it('T030-CFG-2 ngày hiệu lực trong kỳ đã khoá → PERIOD_LOCKED, không ghi gì', async () => {
    const n0 = await versions(A);
    const r = await put(A, { value: 'on', reason: 'Bật chạy bóng', validFrom: '2025-03-20' });
    expect(r.status, JSON.stringify(r.body)).toBeGreaterThanOrEqual(400);
    expect(r.body.error.code).toBe('PERIOD_LOCKED');
    expect(r.body.error.message).toMatch(/03\/2025/);
    expect(await versions(A)).toBe(n0);
    // không phải chỗ chặn: kỳ chưa có / đang mở, khoá riêng một loại chứng từ, khoá loại C trong kỳ khoá
    expect((await put(A, { value: 'on', reason: 'Bật chạy bóng', validFrom: '2025-04-10' })).status).toBe(200);
    expect((await put(A, { value: 'off', reason: 'Tắt lại', validFrom: '2025-05-10' })).status).toBe(200);
    expect((await put(C, { value: 'dark', reason: 'Khoá loại C không bị chặn', validFrom: '2025-03-20' })).status).toBe(200);
  });

  it('T030-CFG-3 một người có settings:write đổi thẳng, không duyệt; thiếu lý do thì VALIDATION; thiếu căn cứ vẫn lưu', async () => {
    const n0 = await versions(A);
    for (const bad of [{}, { reason: '' }, { reason: 'ab' }, { reason: '   ' }]) {
      const r = await put(A, { value: 'on', ...bad });
      expect(r.status, JSON.stringify(bad)).toBe(400);
      expect(r.body.error.code).toBe('VALIDATION_ERROR');
    }
    expect(await versions(A)).toBe(n0);
    const r = await put(A, { value: 'on', reason: 'Bật chạy bóng theo kế hoạch W3' }); // không căn cứ, không đồng ký
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ value: 'on', basis: null });
    expect(await versions(A)).toBe(n0 + 1);
    // người chỉ xem không đổi được
    const v = await call(viewer, 'PUT', `/api/v1/settings/values/${A}`, { value: 'off', reason: 'Thử không có quyền' });
    expect(v.status).toBe(403);
  });

  it('T030-CFG-7 bằng chứng của lần đổi: người đổi, lý do, căn cứ, giá trị cũ → mới', async () => {
    const basis = { doc: 'docs/adr/ADR-0027-core-authorization-plugin-role-editor.md', article: 'Phụ lục A' };
    const r = await put(A, { value: 'off', reason: 'Tắt chạy bóng sau khi hết lệch', basis });
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const row = (await auditRows(tenantId, 'settings.set', A)).at(-1)!;
    expect(row.before).toMatchObject({ value: 'on' });
    expect(row.after).toMatchObject({ value: 'off', reason: 'Tắt chạy bóng sau khi hết lệch', basis });
    const h = await call(ctx, 'GET', `/api/v1/settings/values/${A}/history`);
    expect(h.body.data.versions[0]).toMatchObject({ reason: 'Tắt chạy bóng sau khi hết lệch', basis });
    expect(h.body.data.versions[0].by).toMatch(/\S/); // người đổi
  });
});

describe('T030-CFG-IMP — xem trước tác động (không ghi, không chặn)', () => {
  it('T030-CFG-IMP-1 trả kỳ khoá, hiệu lực lùi, phiên bản muộn hơn, mục chờ; không ghi gì', async () => {
    const n0 = await versions(A);
    const hist = (await call(ctx, 'GET', `/api/v1/settings/values/${A}/history`)).body.data.versions as Array<{ validFrom: string }>;
    const latest = hist.map((v) => v.validFrom).sort().at(-1)!;
    const r = await impact('?validFrom=2025-03-20');
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ key: A, class: 'A', scope: 'tenant', validFrom: '2025-03-20', retroactive: true, periodLocked: { year: 2025, month: 3 }, missingBasis: false });
    expect(r.body.data.laterVersions.length).toBeGreaterThan(0); // các bản ghi 2025-04-10, 2025-05-10 và bản hôm nay đều muộn hơn
    expect(r.body.data.laterVersions.every((v: any) => v.validFrom > '2025-03-20')).toBe(true);
    expect(Number.isInteger(r.body.data.pendingIntake)).toBe(true);
    const ok = await impact(`?validFrom=${latest}`);
    expect(ok.body.data).toMatchObject({ periodLocked: null, retroactive: latest < ok.body.data.today });
    expect(await versions(A)).toBe(n0);
  });

  it('T030-CFG-IMP-2 chỉ báo, không chặn: kỳ khoá vẫn 200; chặn là lúc lưu', async () => {
    expect((await impact('?validFrom=2025-03-05')).status).toBe(200);
    expect((await put(A, { value: 'on', reason: 'Thử lưu vào kỳ khoá', validFrom: '2025-03-05' })).body.error.code).toBe('PERIOD_LOCKED');
    // không truyền ngày = hôm nay, kỳ hiện tại chưa khoá
    const d = await impact('');
    expect(d.body.data).toMatchObject({ retroactive: false, periodLocked: null, validFrom: d.body.data.today });
  });

  it('T030-CFG-IMP-3 cần settings:write; sai khuôn → VALIDATION', async () => {
    expect((await impact('?validFrom=2025-03-20', viewer)).status).toBe(403);
    expect((await impact('?validFrom=20/03/2025')).status).toBe(400);
    expect((await impact('?scope=branch')).status).toBe(400); // khoá này chỉ đặt theo đơn vị
    expect((await impact('', ctx, 'bizcity.khong.co')).status).toBe(404);
  });
});
