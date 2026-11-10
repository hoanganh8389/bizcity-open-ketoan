// [2026-11-10 10:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-2 (S032-35): phép kiểm trỏ điều kiện khoá sổ — bản test của SC-DIAG-2 (RULE-SELF-DIAGNOSTICS §2b)
/**
 * Điều kiện khoá sổ (PC, R-DIAG-10..12):
 *   - mọi phép kiểm đã đăng ký có closeRef là 'none' hoặc một PC đã đăng ký;
 *   - mọi PC có ít nhất một phép kiểm nuôi hoặc ghi checkedElsewhere;
 *   - mức khi khoá mặc định giữ đúng khoá thật hôm nay: lỗi → cần giải trình, cảnh báo → để biết; đạt / rỗng không có mức;
 *   - severityAtClose theo kết quả (cùng PC, khác kết quả thì khác mức);
 *   - một lượt L3 trả closeRef, closeTitle, kỳ kiểm, bước khoá cho từng kết quả.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { defaultSeverityAtClose, listCloseConditions, listDiagnostics, registerDiagnostics, runDiagnostics } from '../src/modules/system/diagnostics.js';
import { setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => {
  await ctx?.app.close();
});

describe('Điều kiện khoá sổ (R-DIAG-10)', () => {
  it('sổ PC đủ 23 điều kiện, mã PC-001..PC-023, mỗi điều kiện có tên, kỳ kiểm, bước', () => {
    const pcs = listCloseConditions();
    expect(pcs.map((p) => p.code)).toEqual(Array.from({ length: 23 }, (_, i) => `PC-${String(i + 1).padStart(3, '0')}`));
    for (const p of pcs) {
      expect(p.title.length).toBeGreaterThan(3);
      expect(p.cadence.length).toBeGreaterThan(0);
      expect(['pre', 'post', 'lock']).toContain(p.stage);
    }
  });

  it('mọi phép kiểm đã đăng ký (L1, L3, L5) có closeRef là none hoặc một PC có thật', () => {
    const known = new Set(listCloseConditions().map((p) => p.code));
    const bad = listDiagnostics().filter((c) => !c.closeRef || (c.closeRef !== 'none' && !known.has(c.closeRef))).map((c) => `${c.code}:${c.closeRef ?? 'thiếu'}`);
    expect(bad).toEqual([]);
  });

  it('mọi PC có phép kiểm nuôi hoặc ghi hôm nay kiểm bằng gì', () => {
    const fed = new Set(listDiagnostics().map((c) => c.closeRef));
    const orphan = listCloseConditions().filter((p) => !fed.has(p.code) && !p.checkedElsewhere).map((p) => p.code);
    expect(orphan).toEqual([]);
    // PC có phép kiểm nuôi thì không ghi checkedElsewhere (tránh hai nguồn nói khác nhau)
    const both = listCloseConditions().filter((p) => fed.has(p.code) && p.checkedElsewhere).map((p) => p.code);
    expect(both).toEqual([]);
  });
});

describe('Mức khi khoá kỳ (R-DIAG-12)', () => {
  it('mặc định giữ đúng khoá thật hôm nay: lỗi → cần giải trình, cảnh báo / để biết → để biết', () => {
    expect(defaultSeverityAtClose('error')).toBe('explain');
    expect(defaultSeverityAtClose('warn')).toBe('note');
    expect(defaultSeverityAtClose('info')).toBe('note');
  });

  it('lượt L3 trả trường khoá sổ cho từng kết quả; đạt / rỗng không có mức khi khoá', async () => {
    const r = await runDiagnostics({ tenantId }, { layer: 'L3' });
    expect(r.checks.length).toBeGreaterThan(30);
    for (const c of r.checks) {
      expect(c.closeRef, c.code).toBeTruthy();
      if (c.closeRef !== 'none') {
        expect(c.closeTitle, c.code).toBeTruthy();
        expect(c.cadence?.length, c.code).toBeGreaterThan(0);
        expect(c.stage, c.code).toBeTruthy();
      }
      if (c.level === 'pass' || c.level === 'empty') expect(c.atClose, c.code).toBeUndefined();
      else expect(c.atClose, c.code).toBe(c.level === 'error' ? 'explain' : 'note');
    }
    const transit = r.checks.find((c) => c.code === 'TRANSIT_NONZERO')!;
    expect(transit).toMatchObject({ closeRef: 'PC-008', closeTitle: 'Chuyển kho, hàng đang chuyển', cadence: ['day'], stage: 'pre' });
  });

  it('severityAtClose theo kết quả; phép kiểm ghi đè kỳ kiểm; kiểm lỗi SQL thì cần giải trình', async () => {
    registerDiagnostics([
      {
        code: 'TEST_PC_BRANCH', layer: 'L3', level: 'warn', scoped: false, closeRef: 'PC-008', cadence: ['week'],
        severityAtClose: (x) => (x.sample.some((s) => s.endsWith(':nhận nhiều hơn xuất')) ? 'block' : 'explain'),
        title: 'test', fix: 'test',
        run: async () => ({ examined: 2, count: 1, sample: ['11319:nhận nhiều hơn xuất'] }),
      },
      {
        code: 'TEST_PC_BROKEN', layer: 'L3', level: 'warn', scoped: false, closeRef: 'PC-012',
        title: 'test', fix: 'test',
        run: async (trx) => { await sql`SELECT * FROM bang_khong_co`.execute(trx); return { examined: 0, count: 0, sample: [] }; },
      },
    ]);
    const r = await runDiagnostics({ tenantId }, { layer: 'L3', codes: ['TEST_PC_BRANCH', 'TEST_PC_BROKEN'] });
    const branch = r.checks.find((c) => c.code === 'TEST_PC_BRANCH')!;
    expect(branch).toMatchObject({ level: 'warn', closeRef: 'PC-008', cadence: ['week'], stage: 'pre', atClose: 'block' });
    const broken = r.checks.find((c) => c.code === 'TEST_PC_BROKEN')!;
    expect(broken).toMatchObject({ level: 'error', closeRef: 'PC-012', closeTitle: 'Tiền và ngân hàng', atClose: 'explain' });
  });

  // Sổ đăng ký không có hàm gỡ: thay hai phép kiểm thử bằng bản đạt để bước kiểm bất biến cuối tệp (helpers) không bắt nhầm.
  afterAll(() => {
    const ok = async () => ({ examined: 1, count: 0, sample: [] as string[] });
    registerDiagnostics(['TEST_PC_BRANCH', 'TEST_PC_BROKEN'].map((code) => ({ code, layer: 'L3' as const, level: 'warn' as const, scoped: false, closeRef: 'none' as const, title: 'test', fix: 'test', run: ok })));
  });
});
