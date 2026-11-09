// [2026-11-09 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-51b (B5b, PHASE-030 · 26 §4.2, K1): test cửa nạp kiểm theo thư viện — chỉ cảnh báo, kênh riêng libraryFindings[]: không đổi findings / score / chứng từ nhận; block hạ xuống warn; đơn vị hạ / tắt gắn; cửa nạp đếm lượt dùng, xem trước thì không
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { LIBRARY_BINDINGS, BINDING_PATH_RE, bindingValues, type LibraryFindingEntry } from '@ketoan/contracts';
import { withRequestContext } from '@bizcity/platform/core/request-context';
import { checkLibraryConfig, flushLibraryUsage, getLibrary, resetLibraryUsage, saveLibraryConfig } from '@bizcity/platform/core/libraries/index';
import type { AuthContext } from '../src/core/auth.js';
import { preflight } from '../src/kernel/public.js';
import { db } from '../src/db/client.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
let ctx: TestCtx;
let tenantId = '';
let auth: AuthContext;
let k = 0;
const sale = (over: Record<string, unknown> = {}) => { k += 1; return saleDoc({ docKey: `lb:CN01:${k}`, docNo: `LB${k}`, invoice: { no: `00${1000 + k}`, serial: 'C26TAA', form: '1', date: '2026-10-05' }, ...over }); };
const withTax = (code: string) => sale({ lines: [{ ...saleDoc().lines[0], taxCode: code }, ...saleDoc().lines.slice(1)] });
const pre = (raw: unknown, post = false) => withRequestContext({ requestId: `lb-${Math.random().toString(36).slice(2, 9)}`, correlationId: 'lb', tenantId },
  () => db.transaction().execute((trx) => preflight(trx, auth, raw, { post })));
const door = (raw: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: raw as never, headers: { authorization: `Bearer ${ctx.token}` } });
const usage = async (source: string) => {
  await flushLibraryUsage(db);
  return (await sql<{ library_id: string; item_code: string; outcome: string; count: string }>`SELECT library_id, item_code, outcome, count FROM library_usage_daily WHERE tenant_id = ${tenantId}::bigint AND source = ${source}`.execute(db)).rows;
};
const lib = (id: string) => getLibrary(id)!;

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  auth = { tenantId, actor: 'system:lb-test', actorName: 'Thử gắn thư viện', kind: 'user', role: 'owner', permissions: new Set(['documents:write', 'documents:read', 'settings:write']) } as AuthContext;
  resetLibraryUsage();
});
afterAll(async () => { await ctx.app.close(); });

describe('Bảng gắn và đường trường (hợp đồng)', () => {
  it('mỗi gắn: id duy nhất, đường đúng khuôn, thư viện có thật, gắn theo ngày chứng từ', () => {
    expect(new Set(LIBRARY_BINDINGS.map((b) => b.id)).size).toBe(LIBRARY_BINDINGS.length);
    for (const b of LIBRARY_BINDINGS) {
      expect(BINDING_PATH_RE.test(b.path), b.id).toBe(true);
      expect(getLibrary(b.library), `${b.id} → ${b.library}`).toBeTruthy();
      expect(b.at).toBe('docDate');
    }
  });

  it('bindingValues: mảng, lồng, bỏ rỗng / không phải chuỗi / đường sai', () => {
    const doc = { reasonCode: ' CMH ', lines: [{ taxCode: 'R08' }, { taxCode: '' }, { taxCode: 8 }, { taxCode: 'R10' }], partner: { taxCode: '0312345678' } };
    expect(bindingValues(doc, 'reasonCode')).toEqual([{ path: 'reasonCode', value: 'CMH' }]);
    expect(bindingValues(doc, 'lines[].taxCode')).toEqual([{ path: 'lines[0].taxCode', value: 'R08' }, { path: 'lines[3].taxCode', value: 'R10' }]);
    expect(bindingValues(doc, 'partner.taxCode')).toEqual([{ path: 'partner.taxCode', value: '0312345678' }]);
    expect(bindingValues(doc, 'toReasonCode')).toEqual([]);
    expect(bindingValues(doc, 'lines[0].taxCode')).toEqual([]); // chỉ nhận `[]`, không chỉ số
    expect(bindingValues(doc, '../x')).toEqual([]);
  });
});

describe('Cấu hình bindings của đơn vị', () => {
  it('chỉ nhận id gắn thật, đúng thư viện, chỉ off / info', () => {
    expect(checkLibraryConfig(lib('vn.loai-thue'), { bindings: { 'taxcode-line': 'info' } })).toEqual([]);
    expect(checkLibraryConfig(lib('vn.loai-thue'), { bindings: { 'taxcode-line': 'off' } })).toEqual([]);
    expect(checkLibraryConfig(lib('vn.loai-thue'), { bindings: { 'khong-co': 'off' } }).join()).toMatch(/không phải gắn của cửa nạp/);
    expect(checkLibraryConfig(lib('vn.loai-thue'), { bindings: { reason: 'off' } }).join()).toMatch(/thuộc thư viện core\.ly-do-dinh-khoan/);
    expect(checkLibraryConfig(lib('vn.loai-thue'), { bindings: { 'taxcode-line': 'warn' as any } }).join()).toMatch(/chỉ off hoặc info/);
  });
});

describe('Tiền kiểm: libraryFindings là kênh riêng, chỉ cảnh báo', () => {
  it('mã thuế đúng → không có gì (kể cả LIB-UNVERIFIED-001, là trạng thái duyệt của thư viện); mã lạ → LIB-UNKNOWN-001 ở đúng đường, hạ block xuống warn, kèm gợi ý', async () => {
    const ok = await pre(withTax('R08'));
    expect(ok.libraryFindings).toEqual([]);
    const bad = await pre(withTax('R8'));
    const f = bad.libraryFindings.find((x: LibraryFindingEntry) => x.code === 'LIB-UNKNOWN-001')!;
    expect(f).toMatchObject({ binding: 'taxcode-line', library: 'vn.loai-thue', path: 'lines[0].taxCode', value: 'R8', level: 'warn', occurrences: 1 });
    expect(f.blockedBy).toBe(true);
    expect(f.suggestions.map((s) => String(s.value))).toContain('R08');
    expect(bad.libraryFindings.every((x: LibraryFindingEntry) => x.level !== ('block' as any))).toBe(true);
  });

  it('không đổi findings[] và score của tiền kiểm, kể cả có mã thư viện lạ (kênh riêng)', async () => {
    const doc = withTax('R8'); // cùng một chứng từ cho cả hai lần (docKey, số hoá đơn giống nhau)
    const withLib = await pre(doc, true);
    await saveLibraryConfig(db, tenantId, lib('vn.loai-thue'), { bindings: { 'taxcode-line': 'off' } }, 'Tắt gắn thuế để so kết quả', 'user:lb');
    const without = await pre(doc, true);
    expect(without.libraryFindings).toEqual([]);
    expect(withLib.findings.map((f) => f.code)).toEqual(without.findings.map((f) => f.code));
    expect(withLib.score).toBe(without.score);
    // định khoản thử (L5) chạy ở cả hai lần và mọi trường khác y hệt — thư viện không chạm bút toán (K1)
    expect(withLib.l5).toBe('ran');
    const { libraryFindings: _a, ...restWith } = withLib;
    const { libraryFindings: _b, ...restWithout } = without;
    expect(restWith).toEqual(restWithout);
    expect(withLib.libraryFindings.length).toBeGreaterThan(0);
  });

  it('đơn vị hạ gắn xuống info → nhắc, không cảnh báo; tắt → không có', async () => {
    await saveLibraryConfig(db, tenantId, lib('vn.loai-thue'), { bindings: { 'taxcode-line': 'info' } }, 'Hạ gắn thuế xuống nhắc', 'user:lb');
    const info = await pre(withTax('R8'));
    expect(info.libraryFindings.map((x: LibraryFindingEntry) => x.level)).toEqual(['info']);
    await saveLibraryConfig(db, tenantId, lib('vn.loai-thue'), {}, 'Bật lại gắn thuế', 'user:lb');
    expect((await pre(withTax('R8'))).libraryFindings[0]!.level).toBe('warn');
  });

  it('gắn lý do: mã lạ ở reasonCode / toReasonCode báo đúng đường; mã chuẩn thì không', async () => {
    k += 1;
    const doc = { docType: 'cash_transfer', docKey: `lb:CN01:${k}`, version: 1, branchCode: 'CN01', docNo: `CT${k}`, docDate: '2026-10-05', amount: 100000, reasonCode: 'LY-DO-LA', toReasonCode: 'CMH' } as Record<string, unknown>;
    const r = await pre(doc);
    expect(r.libraryFindings.map((x: LibraryFindingEntry) => `${x.binding}:${x.path}:${x.code}`)).toEqual(['reason:reasonCode:LIB-UNKNOWN-001']);
    expect(r.libraryFindings.filter((x: LibraryFindingEntry) => x.binding === 'reason-to')).toEqual([]);
  });
});

describe('Cửa nạp: chỉ đếm, không từ chối, không đổi chứng từ', () => {
  it('chứng từ có mã thuế lạ vẫn được nhận (như khi mã đúng); lượt dùng đếm theo kênh intake/<sourceSystem>', async () => {
    resetLibraryUsage();
    const source = 'lb-test-pos';
    const good = await door({ ...withTax('R08'), sourceSystem: source });
    const odd = await door({ ...withTax('R8'), sourceSystem: source });
    expect(good.statusCode, good.body).toBeLessThan(300);
    expect(odd.statusCode, odd.body).toBe(good.statusCode);
    const rows = await usage(`intake/${source}`);
    // chứng từ đúng: R08 (một lần — hai dòng cùng mã gộp); chứng từ lạ: R8 + R08 → 3 lượt, 2 qua, 1 mã lạ bị chặn ở thư viện
    const sum = (o: string) => rows.filter((r) => r.library_id === 'vn.loai-thue' && r.outcome === o).reduce((s, r) => s + Number(r.count), 0);
    expect(sum('pass')).toBe(2);
    expect(sum('block')).toBe(1);
    expect(rows.find((r) => r.item_code === 'R08' && r.outcome === 'pass')).toBeTruthy();
    expect(rows.find((r) => r.item_code === '?' && r.outcome === 'block')).toBeTruthy();
  });

  it('xem trước / định khoản thử (post + force) không đếm lượt dùng', async () => {
    resetLibraryUsage();
    await pre(withTax('R8'), true); // L5 trial = postDocumentIn { post, force }
    const after = await usage('intake/api');
    expect(after.length).toBe(0);
  });

  it('tiền kiểm không ghi sự việc (chỉ đọc)', async () => {
    const doc = withTax('R8');
    await pre(doc);
    const n = await db.selectFrom('accounting_events').select('doc_key').where('tenant_id', '=', tenantId).where('doc_key', '=', doc.docKey as string).executeTakeFirst();
    expect(n).toBeUndefined();
  });
});

describe('API cấu hình: bindings', () => {
  it('GET config trả các gắn của thư viện; POST lưu bindings (phiên bản mới), từ chối id lạ / sai thư viện', async () => {
    const g = await call(ctx, 'GET', '/api/v1/libraries/vn.loai-thue/config');
    expect(g.status).toBe(200);
    expect(g.body.data.bindings).toEqual([{ id: 'taxcode-line', path: 'lines[].taxCode', label: expect.any(String) }]);
    const lyDo = await call(ctx, 'GET', '/api/v1/libraries/core.ly-do-dinh-khoan/config');
    expect((lyDo.body.data.bindings as { id: string }[]).map((b) => b.id).sort()).toEqual(['reason', 'reason-to']);
    expect((await call(ctx, 'GET', '/api/v1/libraries/core.khoan-muc/config')).body.data.bindings).toEqual([]);

    const ok = await call(ctx, 'POST', '/api/v1/libraries/vn.loai-thue/config', { config: { bindings: { 'taxcode-line': 'info' } }, reason: 'Hạ gắn thuế xuống nhắc (API)' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body.data.config).toEqual({ bindings: { 'taxcode-line': 'info' } });
    const bad = await call(ctx, 'POST', '/api/v1/libraries/vn.loai-thue/config', { config: { bindings: { reason: 'off' } }, reason: 'Gắn của thư viện khác' });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toMatch(/thuộc thư viện core\.ly-do-dinh-khoan/);
    const unknown = await call(ctx, 'POST', '/api/v1/libraries/vn.loai-thue/config', { config: { bindings: { khac: 'off' } }, reason: 'Gắn không có' });
    expect(unknown.status).toBe(400);
    const warn = await call(ctx, 'POST', '/api/v1/libraries/vn.loai-thue/config', { config: { bindings: { 'taxcode-line': 'warn' } }, reason: 'Không được nâng mức' });
    expect(warn.status).toBe(400);
  });
});
