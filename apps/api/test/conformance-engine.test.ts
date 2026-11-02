/**
 * Conformance Engine trên bản cài (ADR-0012; PHASE-020 S020-18):
 *   - chưa chạy → latest = null; chạy → lưu ảnh chụp, có bằng chứng, báo cáo đúng khuôn bizcity_vn_conformance_report@1;
 *   - chưa khai hồ sơ kế toán → ca lớp Cấu hình REVIEW_REQUIRED "chưa khai" (không đoán chế độ); ca lớp Doanh nghiệp REVIEW_REQUIRED
 *     (loại pháp nhân chưa biết — S020-19, chi tiết ở enterprise-layer.test.ts);
 *   - bằng chứng lấy từ tự chẩn đoán của chính đơn vị (DG-LEDGER-1 = LEDGER_BALANCED …); SC-* / test là bằng chứng build, không tính;
 *   - khai TT99 → kiểm PROFILE_* đạt; khai TT133 trên gói nền TT99 → PROFILE_PACK_REGIME báo lệch, rulepack TT99 không áp;
 *   - rulepack còn draft → không ca nào PASS (fail closed); ảnh chụp chỉ thêm; AI đọc được kết quả, không chạy được.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { runDiagnostics } from '../src/modules/system/diagnostics.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

type Case = { id: string; status: string; reason: string; evidence: string[] };
type Run = { id: string; result: string; label: string; counts: Record<string, number>; profileVersion: number | null; kitHash: string; cases: Case[] };

let ctx: TestCtx;
let tenantId = '';
const ROOT = path.resolve(__dirname, '../../..');
const run = async (asOf = '2026-11-02') => call<{ data: Run; meta: { receipt: { evidenceId: string } } }>(ctx, 'POST', '/api/v1/conformance/runs', { asOf });
const caseOf = (r: Run, prefix: string) => r.cases.find((c) => c.id.startsWith(prefix))!;
const publish = (regime: string, entityType: string, note: string) => call(ctx, 'POST', '/api/v1/accounting/profile/publish', { effectiveFrom: '2026-01-01', fiscalYearStartMonth: 1, regime, entityType, note });

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  // Có bút toán để kiểm sổ có dữ liệu xét (đạt rỗng không phải đạt).
  expect((await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docDate: '2026-10-20' }))).body.data.status).toBe('posted');
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Conformance Engine trên bản cài', () => {
  it('chưa chạy lượt nào: latest = null', async () => {
    const r = await call(ctx, 'GET', '/api/v1/conformance/runs/latest');
    expect(r.status).toBe(200);
    expect(r.body.data).toBeNull();
  });

  it('chưa khai hồ sơ: lớp Cấu hình REVIEW_REQUIRED "chưa khai"; bằng chứng sổ từ tự chẩn đoán; báo cáo đúng khuôn; có bằng chứng', async () => {
    const r = await run();
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.meta.receipt.evidenceId).toMatch(/^\d+$/);
    const d = r.body.data;
    expect(d.result).toBe('REVIEW_REQUIRED');
    expect(d.label).toBe('Review required');
    expect(d.profileVersion).toBeNull();
    expect(d.kitHash).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(d.counts.PASS).toBe(0); // rulepack còn draft: fail closed

    const regime = caseOf(d, 'vn.accounting-regimes-vn.tt99.fiscal_year_calendar_2026');
    expect(regime.status).toBe('REVIEW_REQUIRED');
    expect(regime.reason).toMatch(/chưa khai/);

    const balanced = caseOf(d, 'vn.accounting-integrity.double_entry.balanced');
    expect(balanced.evidence).toContain('DG-LEDGER-1: pass');
    expect(balanced.evidence.join(' ')).toMatch(/bằng chứng build .*db-rules\.test\.ts/);
    expect(balanced.reason).toMatch(/kỹ thuật: PASS/);

    for (const c of d.cases.filter((x) => x.id.startsWith('vn.enterprise-period-vn.'))) expect(c.status).toBe('REVIEW_REQUIRED');

    // Báo cáo lưu nguyên văn đúng khuôn bizcity_vn_conformance_report@1.
    const row = await db.selectFrom('conformance_runs').select(['report', 'layers', 'kit_version']).where('id', '=', d.id).executeTakeFirstOrThrow();
    const jsonschema = path.join(ROOT, 'tests/conformance/lib/jsonschema.mjs');
    const { validate } = (await import(pathToFileURL(jsonschema).href)) as { validate: (s: unknown, d: unknown) => unknown[] };
    const schema = JSON.parse(readFileSync(path.join(ROOT, 'packages/vn-rulepacks/schemas/report.schema.json'), 'utf8'));
    expect(validate(schema, row.report)).toEqual([]);
    expect((row.report as { tenant_profile: { simulated: boolean; accounting_regime: string } }).tenant_profile).toMatchObject({ simulated: false, accounting_regime: 'unknown' });
    expect(row.layers).toEqual(['module', 'configuration', 'enterprise']);
    expect(row.kit_version).toBe('0.3.0');
  });

  it('khai TT99: kiểm hồ sơ và gói cùng chế độ đạt; ca vẫn REVIEW_REQUIRED vì rulepack chưa duyệt', async () => {
    expect((await publish('vn-tt99-2025', 'enterprise', 'Khai hồ sơ TT99, năm dương lịch')).status).toBe(201);
    const d = (await run()).body.data;
    expect(d.profileVersion).toBe(1);
    const regime = caseOf(d, 'vn.accounting-regimes-vn.tt99.fiscal_year_calendar_2026');
    expect(regime.evidence).toEqual(expect.arrayContaining(['DG-PROFILE-1: pass', 'DG-PROFILE-2: pass']));
    expect(regime.status).toBe('REVIEW_REQUIRED');
    expect(regime.reason).toMatch(/draft/);
  });

  it('khai TT133 trên gói nền TT99: PROFILE_PACK_REGIME báo lệch; rulepack TT99 không áp cho đơn vị TT133', async () => {
    expect((await publish('vn-tt133-2016', 'sme', 'Đổi sang TT133 (nhỏ và vừa) — thử lệch gói')).status).toBe(201);
    const diag = await runDiagnostics({ tenantId, to: '2026-11-02' }, { layer: 'L5', codes: ['PROFILE_PACK_REGIME'] });
    expect(diag.checks[0]).toMatchObject({ code: 'PROFILE_PACK_REGIME', level: 'warn', count: 1 });
    const d = (await run()).body.data;
    expect(d.profileVersion).toBe(2);
    const regime = caseOf(d, 'vn.accounting-regimes-vn.tt99.fiscal_year_calendar_2026');
    expect(regime.status).toBe('NOT_APPLICABLE');
    expect(regime.reason).toMatch(/vn-tt99-2025 khác hồ sơ vn-tt133-2016/);
  });

  it('latest trả lượt mới nhất; ảnh chụp không sửa / xoá được', async () => {
    const latest = (await call(ctx, 'GET', '/api/v1/conformance/runs/latest')).body.data as Run;
    const top = await db.selectFrom('conformance_runs').select('id').where('tenant_id', '=', tenantId).orderBy('id', 'desc').limit(1).executeTakeFirstOrThrow();
    expect(latest.id).toBe(String(top.id));
    expect(latest.profileVersion).toBe(2);
    await expect(sql`UPDATE conformance_runs SET result = 'PASS' WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/không sửa/);
    await expect(sql`DELETE FROM conformance_runs WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/không sửa/);
  });

  it('AI đọc được kết quả, không chạy được lượt mới', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${ctx.token}` }, payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' } as never });
    const names = (res.json().result.tools as { name: string }[]).map((t) => t.name);
    expect(names).toContain('core.conformance.latest');
    expect(names).not.toContain('core.conformance.run');
  });
});
