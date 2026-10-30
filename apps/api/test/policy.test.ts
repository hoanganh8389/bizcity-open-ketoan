/**
 * Chính sách kế toán có phiên bản (ADR-0009, C-9; PHASE-005, PHASES 2.14):
 *   - lần định khoản đầu tự chụp bản 1 (initial, hiệu lực 1900-01-01); bút toán + nhật ký ghi policy_version;
 *   - sửa cấu hình → lần định khoản sau tự chụp bản amend cùng ngày hiệu lực: sửa có tác dụng ngay như trước;
 *   - phát hành chế độ mới từ ngày X → chứng từ trước X định khoản (lại) theo bản cũ, từ X theo bản mới: không áp quy tắc mới
 *     cho chứng từ cũ;
 *   - không phát hành vào kỳ đã khoá; bản chụp không sửa được; tự chẩn đoán POLICY_VERSION sạch.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { runDiagnostics } from '../src/modules/system/diagnostics.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
const group = (revenueAccount: string) => ({
  name: 'Hàng hoá bán lẻ', inventoryAccount: '1561', cogsAccount: '6321', revenueAccount, discountAccount: '52111', salesReturnAccount: '52131', isDefault: true,
});
const sale = (no: string, date: string, version = 1) => saleDoc({
  docKey: `pos:CN01:${no}`, docNo: no, docDate: date, version, invoice: undefined,
  lines: [{ lineKey: 'l1', sku: 'POL-01', name: 'Hàng thử chính sách', unit: 'Cái', qty: 1, amountBeforeTax: 100000, taxCode: 'R08', taxAmount: 8000 }],
  payments: [{ methodCode: 'TM', amount: 108000 }], totals: { beforeTax: 100000, tax: 8000, total: 108000 },
});
/** Tài khoản doanh thu (dòng Có 511…) và policy_version của bút toán hiệu lực của chứng từ. */
async function posted(no: string) {
  const r = await sql<{ account_code: string; policy_version: number | null }>`
    SELECT l.account_code, e.policy_version FROM accounting_events d
      JOIN ledger_entries e ON e.event_id = d.id AND e.status = 'posted' AND NOT e.is_reversal
      JOIN ledger_lines l ON l.entry_id = e.id
     WHERE d.tenant_id = ${tenantId} AND d.doc_key = ${`pos:CN01:${no}`} AND l.account_code LIKE '511%'`.execute(db);
  return { revenue: r.rows.map((x) => x.account_code), policy: [...new Set(r.rows.map((x) => x.policy_version))] };
}
const versions = async () => (await call(ctx, 'GET', '/api/v1/posting/policy/versions')).body.data as { version: number; effectiveFrom: string; kind: string }[];

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Chính sách kế toán có phiên bản', () => {
  it('lần định khoản đầu chụp bản 1 (initial, từ 1900-01-01); bút toán và nhật ký ghi policy_version', async () => {
    expect((await call(ctx, 'POST', '/api/v1/documents', sale('POL-A', '2026-10-05'))).body.data.status).toBe('posted');
    expect(await versions()).toEqual([expect.objectContaining({ version: 1, kind: 'initial', effectiveFrom: '1900-01-01' })]);
    expect(await posted('POL-A')).toEqual({ revenue: ['51111'], policy: [1] });
    const log = await db.selectFrom('posting_log').select('policy_version').where('tenant_id', '=', tenantId).where('doc_no', '=', 'POL-A').where('action', '=', 'post').executeTakeFirstOrThrow();
    expect(log.policy_version).toBe(1);
  });

  it('sửa cấu hình → bản amend cùng ngày hiệu lực, có tác dụng ngay (như trước khi có phiên bản)', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/posting/groups/HH-BANLE', group('51112'))).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/documents', sale('POL-B', '2026-10-06'))).body.data.status).toBe('posted');
    expect((await versions())[0]).toMatchObject({ version: 2, kind: 'amend', effectiveFrom: '1900-01-01' });
    expect(await posted('POL-B')).toEqual({ revenue: ['51112'], policy: [2] });
  });

  it('phát hành chế độ mới từ 01/11: chứng từ tháng 10 định khoản lại vẫn theo bản cũ, chứng từ tháng 11 theo bản mới', async () => {
    const pub = await call(ctx, 'POST', '/api/v1/posting/policy/publish', { effectiveFrom: '2026-11-01', note: 'Đổi tài khoản doanh thu từ 01/11/2026' });
    expect(pub.status, JSON.stringify(pub.body)).toBe(201);
    expect(pub.body.data).toMatchObject({ version: 3, kind: 'publish', effectiveFrom: '2026-11-01' });
    expect(pub.body.meta.receipt.evidenceId).toMatch(/^\d+$/);
    // Chế độ mới: doanh thu bán lẻ sang 51113 (sửa sau khi phát hành = sửa chế độ đang đứng đầu, hiệu lực từ 01/11).
    expect((await call(ctx, 'PUT', '/api/v1/posting/groups/HH-BANLE', group('51113'))).status).toBe(200);
    expect((await call(ctx, 'POST', '/api/v1/documents', sale('POL-C', '2026-11-03'))).body.data.status).toBe('posted');
    expect((await versions())[0]).toMatchObject({ version: 4, kind: 'amend', effectiveFrom: '2026-11-01' });
    expect(await posted('POL-C')).toEqual({ revenue: ['51113'], policy: [4] });

    // Chứng từ tháng 10 gửi lại phiên bản 2 → định khoản lại theo bản của ngày 06/10 (bản 2: 51112), không theo 51113.
    expect((await call(ctx, 'POST', '/api/v1/documents', sale('POL-B', '2026-10-06', 2))).body.data.status).toBe('posted');
    expect(await posted('POL-B')).toEqual({ revenue: ['51112'], policy: [2] });
    // Chứng từ mới nhưng ngày hạch toán tháng 10 cũng theo chế độ cũ.
    expect((await call(ctx, 'POST', '/api/v1/documents', sale('POL-D', '2026-10-20'))).body.data.status).toBe('posted');
    expect(await posted('POL-D')).toEqual({ revenue: ['51112'], policy: [2] });
  });

  it('không phát hành vào kỳ đã khoá; ghi chú bắt buộc', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/periods/locks', { year: 2026, month: 9, changes: [{ branchCode: 'CN01', docType: 'sale', locked: true }] })).status).toBe(200);
    const r = await call(ctx, 'POST', '/api/v1/posting/policy/publish', { effectiveFrom: '2026-09-15', note: 'Lùi chính sách vào kỳ đã khoá' });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/đã khoá/);
    expect((await call(ctx, 'POST', '/api/v1/posting/policy/publish', { effectiveFrom: '2026-12-01', note: 'x' })).status).toBe(400);
  });

  it('bản chụp không sửa được; tự chẩn đoán POLICY_VERSION sạch', async () => {
    await expect(sql`UPDATE posting_policy_versions SET note = 'sửa' WHERE tenant_id = ${tenantId}`.execute(db)).rejects.toThrow(/không sửa/);
    const report = await runDiagnostics({ tenantId }, { layer: 'L3', codes: ['POLICY_VERSION'] });
    const c = report.checks.find((x) => x.code === 'POLICY_VERSION')!;
    expect(c.examined).toBeGreaterThan(0);
    expect(c.count).toBe(0);
  });
});
