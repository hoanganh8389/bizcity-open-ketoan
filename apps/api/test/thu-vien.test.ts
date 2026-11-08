// [2026-11-07 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-45 (ADR-0032, BIZCITY-LIBRARY-v1): test thư viện dùng chung — băm khớp bộ kiểm, đọc tại ngày, bảy kiểm chuẩn có gợi ý, luật khai báo, ô chọn không dấu, API + thư viện mã cổng L
/**
 * - Bộ kiểm thuần (Platform) và phần dùng chung của SC-LIB-1 (scripts/thu-vien) cho cùng băm, cùng lỗi khuôn.
 * - Sáu nguyên tắc: payload theo itemSchema · phiên bản (băm, đọc tại ngày) · gợi ý có căn cứ · mã LIB-* chung · hướng dẫn (hint, README) · ô chọn.
 * - API: danh sách, phong bì + README, dòng ô chọn, kiểm ô nhập; GET /api/v1/findings?gate=L có mã LIB-* và mã luật thư viện.
 */
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeDb } from '../src/db/client.js';
import {
  checkSchema, getLibrary, hashItems, libraryLoadErrors, selectorRows, validateAgainstLibrary, validateInLibrary, type Library,
} from '@bizcity/platform/core/libraries/index';
import { call, setupTenant, type TestCtx } from './helpers.js';

const ROOT = path.resolve(__dirname, '../../..');
/* eslint-disable @typescript-eslint/no-explicit-any */
let shared: any;
beforeAll(async () => { shared = await import(path.join(ROOT, 'scripts/thu-vien/thu-vien.mjs')); });

const params = () => getLibrary('vn.tham-so-phap-ly')!;
const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code);

/** Thư viện nhỏ dựng tay cho các nhánh không có trong thư viện thật (ngừng dùng, đã bỏ, khuôn kèm theo). */
function mini(): Library {
  const items = [
    { code: 'MOI', name: 'Mã mới', status: 'active' as const, since: '1.1.0', verified: true, payload: { n: 1 } },
    { code: 'CU', name: 'Mã cũ', aliases: ['OLD-1'], status: 'deprecated' as const, since: '1.0.0', replacedBy: 'MOI', verified: true, payload: { n: 1 } },
    { code: 'BO', name: 'Mã bỏ', status: 'removed' as const, since: '1.0.0', replacedBy: 'MOI', verified: true },
  ];
  const hash = hashItems(items);
  return {
    contract: 'bizcity_library@1', id: 'core.thu', kind: 'code-list', title: 'Thử', description: 'thử', version: '1.1.0', released: '2026-11-07', contentHash: hash,
    owner: 'Nhóm Lõi', sources: [{ title: 'tự lập', kind: 'internal' }],
    itemSchema: { type: 'object', required: ['n'], additionalProperties: false, properties: { n: { type: 'integer', minimum: 0 } } },
    selector: { value: 'code', label: '{code} · {name}', search: ['code', 'name', 'aliases'] },
    changelog: [{ version: '1.1.0', date: '2026-11-07', hash, notes: 'thử' }], items,
  };
}

describe('Bộ kiểm thuần', () => {
  it('Platform và SC-LIB-1 cho cùng băm, cùng lỗi khuôn; thư viện thật nạp đủ, băm đúng', () => {
    expect(libraryLoadErrors()).toEqual([]);
    for (const id of ['vn.tham-so-phap-ly', 'vn.ngay-nghi-le', 'authz.tgs-chuc-nang', 'authz.tgs-nhom']) {
      const lib = getLibrary(id)!;
      expect(hashItems(lib.items)).toBe(lib.contentHash);
      expect(shared.hashItems(lib.items)).toBe(lib.contentHash);
      expect(shared.lintLibrary(lib, { dir: id, hasReadme: true })).toEqual([]);
    }
    const schema = { type: 'object', required: ['a'], additionalProperties: false, properties: { a: { type: 'number', minimum: 0 }, d: { type: 'string', format: 'date' } } } as const;
    for (const v of [{ a: 1 }, { a: -1 }, {}, { a: 1, x: 2 }, { a: 'x' }, { a: 1, d: '2026-13-40' }]) {
      expect(checkSchema(schema as never, v)).toEqual(shared.checkSchema(schema, v));
    }
  });

  it('(nguyên tắc 2) đọc tại ngày: lương cơ sở đổi 01/07/2026; ngoài mọi khoảng → LIB-EFFECTIVE-001 kèm khoảng gần nhất', () => {
    expect(validateAgainstLibrary(params(), 'LUONG_CO_SO', { at: '2026-03-01' }).value).toBe(2340000);
    expect(validateAgainstLibrary(params(), 'LUONG_CO_SO', { at: '2026-07-01' }).value).toBe(2530000);
    const old = validateAgainstLibrary(params(), 'LUONG_CO_SO', { at: '2020-01-01' });
    expect(old.ok).toBe(false);
    const f = old.findings.find((x) => x.code === 'LIB-EFFECTIVE-001')!;
    expect(f.suggestions[0]).toMatchObject({ value: 2340000 });
  });

  it('(nguyên tắc 3) giá trị lệch → LIB-VALUE-001 gợi ý giá trị đúng ngày kèm căn cứ; sai khuôn → LIB-SCHEMA-001', () => {
    const r = validateAgainstLibrary(params(), { code: 'LUONG_CO_SO', value: 1800000 }, { at: '2026-03-01' });
    expect(r.ok).toBe(true); // cảnh báo, không chặn — người dùng quyết (ADR-0020)
    const f = r.findings.find((x) => x.code === 'LIB-VALUE-001')!;
    expect(f).toMatchObject({ got: 1800000, expected: 2340000 });
    expect(f.suggestions[0]).toMatchObject({ value: 2340000, confidence: 'vua' }); // chưa duyệt → không "cao"
    expect(f.suggestions[0]!.why).toMatch(/chưa duyệt/);
    const neg = validateAgainstLibrary(params(), { code: 'BHXH_NLD', value: -8 }, { at: '2026-03-01' });
    expect(codes(neg)).toContain('LIB-SCHEMA-001');
    expect(neg.ok).toBe(false);
    // phần trăm trên 100 là hợp lệ (làm thêm ngày lễ 300 %)
    expect(codes(validateAgainstLibrary(params(), { code: 'LAM_THEM_LE_TET', value: 300 }, { at: '2026-03-01' }))).not.toContain('LIB-SCHEMA-001');
  });

  it('(nguyên tắc 3, 6) mã lạ → LIB-UNKNOWN-001 gợi ý gần nhất; chữ thường / bí danh → resolved', () => {
    const r = validateAgainstLibrary(params(), 'LUONG_CO_SOO');
    expect(codes(r)).toEqual(['LIB-UNKNOWN-001']);
    expect(r.findings[0]!.suggestions.map((s) => s.value)).toContain('LUONG_CO_SO');
    expect(validateAgainstLibrary(params(), 'luong_co_so', { at: '2026-03-01' }).resolved).toBe('LUONG_CO_SO');
    const m = mini();
    const alias = validateAgainstLibrary(m, 'old-1');
    expect(alias.resolved).toBe('CU');
  });

  it('(nguyên tắc 2, 4) ngừng dùng → cảnh báo gợi ý replacedBy; đã bỏ → chặn; khuôn kèm theo sai → LIB-SCHEMA-001', () => {
    const m = mini();
    const dep = validateAgainstLibrary(m, 'CU');
    expect(dep.ok).toBe(true);
    expect(dep.findings[0]).toMatchObject({ code: 'LIB-DEPRECATED-001', level: 'warn' });
    expect(dep.findings[0]!.suggestions[0]).toMatchObject({ value: 'MOI', confidence: 'cao' });
    const rm = validateAgainstLibrary(m, 'BO');
    expect(rm.ok).toBe(false);
    expect(codes(rm)).toEqual(['LIB-REMOVED-001']);
    const bad = validateAgainstLibrary(m, { code: 'MOI', fields: { n: -1, la: 1 } });
    expect(bad.findings.filter((f) => f.code === 'LIB-SCHEMA-001').map((f) => f.path).sort()).toEqual(['fields.la', 'fields.n']);
  });

  it('(nguyên tắc 4, 5) mục chưa duyệt → LIB-UNVERIFIED-001 mức nhắc; luật khai báo TSPL-LAW-001 chỉ chạy khi ghi đè tham số luật', () => {
    const plain = validateAgainstLibrary(params(), 'BHXH_NLD', { at: '2026-03-01' });
    expect(plain.findings.map((f) => [f.code, f.level])).toEqual([['LIB-UNVERIFIED-001', 'info']]);
    expect(codes(validateAgainstLibrary(params(), { code: 'BHXH_NLD', override: true }, { at: '2026-03-01' }))).toContain('TSPL-LAW-001');
    expect(codes(validateAgainstLibrary(params(), { code: 'GIO_LAM_VIEC_NGAY', override: true }, { at: '2026-03-01' }))).not.toContain('TSPL-LAW-001'); // tham số chính sách
  });

  it('(nguyên tắc 6) ô chọn: tìm không dấu, lọc nhóm, giá trị tại ngày; không hiện mục đã bỏ', () => {
    const { rows } = selectorRows(params(), { q: 'luong toi thieu vung', at: '2026-03-01' });
    expect(rows.map((r) => r.value)).toEqual(expect.arrayContaining(['LUONG_TOI_THIEU_VUNG_I', 'LUONG_TOI_THIEU_VUNG_IV']));
    expect(rows.every((r) => r.valueAt !== undefined && r.verified === false)).toBe(true);
    const bh = selectorRows(params(), { group: 'bao-hiem', at: '2026-03-01', limit: 500 });
    expect(bh.rows.every((r) => r.group === 'bao-hiem')).toBe(true);
    expect(bh.total).toBe(17);
    const tet = selectorRows(getLibrary('vn.ngay-nghi-le')!, { q: 'tet am lich' });
    expect(tet.rows).toHaveLength(5);
    expect(tet.rows[0]!.label).toMatch(/^2026-02-1\d · Tết Âm lịch/);
    expect(selectorRows(mini(), {}).rows.map((r) => r.value)).toEqual(['MOI']);
    expect(selectorRows(mini(), { status: 'all' }).rows.map((r) => r.value).sort()).toEqual(['CU', 'MOI']);
  });

  it('thư viện TGS: mã báo cáo không nhận thao tác ghi (TGS-REPORT-001), cờ chỉ Tìm → TGS-FLAG-001; tìm theo tên không dấu', () => {
    const tgs = getLibrary('authz.tgs-chuc-nang')!;
    expect(tgs.items).toHaveLength(349);
    expect(codes(validateAgainstLibrary(tgs, { code: 'BC2', op: 'create' }))).toContain('TGS-REPORT-001');
    expect(codes(validateAgainstLibrary(tgs, { code: 'BC2', op: 'read' }))).not.toContain('TGS-REPORT-001');
    expect(codes(validateAgainstLibrary(tgs, { code: 'HT10', op: 'read' }))).toContain('TGS-FLAG-001');
    expect(validateAgainstLibrary(tgs, 'ACC03').findings[0]!.suggestions.map((s) => s.value)).toContain('ACC3');
    expect(selectorRows(tgs, { q: 'so cai' }).rows.map((r) => r.value)).toEqual(expect.arrayContaining(['ACC3', 'ACC88']));
    const nhom = getLibrary('authz.tgs-nhom')!;
    expect(nhom.items).toHaveLength(28);
    expect(nhom.items.every((i) => i.verified === false && i.hints?.[0]?.kind === 'how')).toBe(true);
  });

  it('gợi ý từ thư viện khác (suggest.fromLibrary) qua bộ nạp', () => {
    expect(validateInLibrary('khong.co', 'X')).toBeUndefined();
    expect(validateInLibrary('vn.ngay-nghi-le', '2026-02-16')!.findings.map((f) => f.code)).toEqual(['LIB-UNVERIFIED-001']);
  });
});

describe('API thư viện', () => {
  let ctx: TestCtx;
  beforeAll(async () => { ctx = await setupTenant(); });
  afterAll(async () => {
    await ctx.app.close();
    await closeDb();
  });

  it('danh sách, phong bì + README, dòng ô chọn tại ngày', async () => {
    const list = (await call(ctx, 'GET', '/api/v1/libraries')).body.data.items as any[];
    expect(list.map((l) => l.id)).toEqual(expect.arrayContaining(['vn.tham-so-phap-ly', 'vn.ngay-nghi-le', 'authz.tgs-chuc-nang', 'authz.tgs-nhom']));
    expect(list.find((l) => l.id === 'vn.tham-so-phap-ly')).toMatchObject({ kind: 'param', count: 120, verified: 0 });
    const env = (await call(ctx, 'GET', '/api/v1/libraries/vn.tham-so-phap-ly')).body.data;
    expect(env.library.items).toBeUndefined();
    expect(env.library.selector.showValueAt).toBe(true);
    expect(env.readme).toMatch(/verified: false/);
    const rows = (await call(ctx, 'GET', '/api/v1/libraries/vn.tham-so-phap-ly/items?q=luong%20co%20so&at=2026-08-01')).body.data;
    expect(rows.rows[0]).toMatchObject({ value: 'LUONG_CO_SO', valueAt: 2530000 });
    expect((await call(ctx, 'GET', '/api/v1/libraries/khong.co/items')).status).toBe(404);
  });

  it('kiểm ô nhập: một hay nhiều, có gợi ý; gửi cả hai → lỗi', async () => {
    const one = await call(ctx, 'POST', '/api/v1/libraries/vn.tham-so-phap-ly/validate', { input: { code: 'LUONG_CO_SO', value: 1800000 }, at: '2026-03-01' });
    expect(one.status, JSON.stringify(one.body)).toBe(200);
    expect(one.body.data.results[0].findings.map((f: any) => f.code)).toEqual(['LIB-VALUE-001', 'LIB-UNVERIFIED-001']);
    const many = (await call(ctx, 'POST', '/api/v1/libraries/vn.ngay-nghi-le/validate', { inputs: ['2026-02-16', '2026-02-15'] })).body.data.results;
    expect(many.map((r: any) => r.ok)).toEqual([true, false]);
    expect(many[1].findings[0].code).toBe('LIB-UNKNOWN-001');
    expect((await call(ctx, 'POST', '/api/v1/libraries/vn.ngay-nghi-le/validate', { input: 'a', inputs: ['b'] })).status).toBe(400);
  });

  it('(nguyên tắc 4) thư viện mã: cổng L có bảy mã LIB-* và mã luật thư viện; giải thích được mã luật', async () => {
    const l = (await call(ctx, 'GET', '/api/v1/findings?gate=L')).body.data.items as any[];
    expect(l.filter((f) => f.code.startsWith('LIB-'))).toHaveLength(7);
    expect(l.find((f) => f.code === 'TSPL-LAW-001')).toMatchObject({ source: 'bizcity_library:vn.tham-so-phap-ly', level: 'warn' });
    const ex = (await call(ctx, 'GET', '/api/v1/findings/TSPL-LAW-001')).body.data;
    expect(ex).toMatchObject({ gate: 'L', learn: 'libraries/vn.tham-so-phap-ly/README.md' });
    expect((await call(ctx, 'GET', '/api/v1/findings/LIB-EFFECTIVE-001')).body.data.fix).toMatch(/ngày/);
  });
});
