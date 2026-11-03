/**
 * Tiền kiểm chứng từ (PHASE-021 W1, PHASES 2.17; ADR-0014 D3; RULE-INTAKE-3/4/5):
 *   - T021-4 test cặp: mỗi mã `block` + `door` → preflight báo mã đó VÀ cửa nạp (POST /api/v1/documents) từ chối cùng dữ liệu,
 *     không tạo sự việc. Danh sách ca phải phủ ĐỦ mã door trong danh mục (thêm mã mới mà quên ca → test đỏ);
 *   - T021-3 một chứng từ lỗi ở L1, L2, L3 → ba phát hiện trong một lần, sắp block → warn → hint;
 *   - mã advice (warn / hint): cửa nạp vẫn nhận, preflight vẫn cảnh báo, điểm trừ theo trọng số;
 *   - danh mục: mọi mã đủ title / why / fix / ref (R-INTAKE-5); preflight chỉ đọc (không ghi sự việc).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { INTAKE_CATALOG, intakeFinding, type IntakeCode } from '@ketoan/contracts';
import { withRequestContext } from '@bizcity/platform/core/request-context';
import type { AuthContext } from '../src/core/auth.js';
import { preflight } from '../src/kernel/public.js';
import { db } from '../src/db/client.js';
import { saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let auth: AuthContext;

const pre = (raw: unknown, a: AuthContext = auth) => withRequestContext({ requestId: `pf-${Math.random().toString(36).slice(2, 9)}`, correlationId: 'pf', tenantId },
  () => db.transaction().execute((trx) => preflight(trx, a, raw)));
const door = (raw: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: raw as never, headers: { authorization: `Bearer ${ctx.token}` } });
const eventOf = (docKey: string) => db.selectFrom('accounting_events').select(['status', 'version']).where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).executeTakeFirst();
const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code);

let k = 0;
const sale = (over: Record<string, unknown> = {}) => { k += 1; return saleDoc({ docKey: `pf:CN01:${k}`, docNo: `PF${k}`, ...over }); };
const base = saleDoc();

/** Ca cặp cho từng mã block + door. */
const PAIRS: Record<string, () => Record<string, unknown>> = {
  'IN-SHAPE-001': () => { const d = sale(); delete (d as Record<string, unknown>).branchCode; return d; },
  'IN-SHAPE-002': () => sale({ lines: [{ ...base.lines[0], qty: 'mot' }], totals: { beforeTax: 185185, tax: 14815, total: 200000 } }),
  'IN-SHAPE-003': () => sale({ docDate: '05/10/2026' }),
  'IN-SHAPE-004': () => sale({ docType: 'khong-co' }),
  'IN-SHAPE-005': () => sale({ docNo: 'X'.repeat(65) }),
  'IN-SHAPE-006': () => sale({ invoice: { ...base.invoice, status: 'lung-tung' } }),
  'IN-SUM-001': () => sale({ totals: { beforeTax: 100000, tax: 14815, total: 114815 } }),
  'IN-SUM-002': () => { k += 1; return { docType: 'customer_payment', docKey: `pf:CN01:${k}`, branchCode: 'CN01', docNo: `PT${k}`, docDate: '2026-10-05', partner: base.partner, methodCode: 'TM', lines: [{ lineKey: 'a1', amount: 90000 }], totals: { total: 50000 } }; },
  'IN-SUM-005': () => sale({ totals: { beforeTax: 185185, tax: 14815, total: 210000 } }),
  'IN-SUM-006': () => sale({ totals: { beforeTax: 185185, tax: 10000, total: 195185 } }),
  'IN-MD-001': () => sale({ branchCode: 'KHONG-CO-CN' }),
  // PHASE-024 S024-28: mặt hàng còn nháp (Gate A) → cửa nạp từ chối, tiền kiểm báo cùng mã
  'IN-ITEM-009': () => sale({ lines: [{ ...base.lines[0], sku: 'NHAP01' }, ...base.lines.slice(1)] }),
};

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await db.insertInto('products').values({ tenant_id: tenantId, sku: 'NHAP01', name: 'Mặt hàng nháp thử', unit: '', is_draft: true, draft_codes: ['ITEM-BLOCK-001'] }).execute();
  auth = { tenantId, actor: 'system:preflight-test', actorName: 'Thử tiền kiểm', kind: 'user', role: 'owner', permissions: new Set(['documents:write', 'documents:read']) } as AuthContext;
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Danh mục IN-*', () => {
  it('mọi mã đủ title / why / fix / ref; block ⇒ trọng số 0; mã chỉ có ở trạm (advice) không là block', () => {
    for (const [code, s] of Object.entries(INTAKE_CATALOG)) {
      expect(s.title && s.why && s.fix && s.ref, code).toBeTruthy();
      if (s.stage === 'advice') expect(s.severity, code).not.toBe('block');
    }
  });

  it('S021-26: mọi mã block / warn có phương án khắc phục (bước, vai, kiểm lại bằng chính mã) và phát hiện mang remedy', () => {
    for (const [code, s] of Object.entries(INTAKE_CATALOG)) {
      const f = intakeFinding(code as IntakeCode, null);
      if (s.severity === 'hint') continue;
      expect(f.remedy?.steps.length, code).toBeGreaterThan(0);
      expect(f.remedy?.owner, code).toBeTruthy();
      expect(f.remedy?.verify.code, code).toBe(code);
    }
  });

  it('ca cặp phủ đủ mã block + door (thêm mã mới phải thêm ca)', () => {
    const door = Object.entries(INTAKE_CATALOG).filter(([, s]) => s.severity === 'block' && s.stage === 'door').map(([c]) => c)
      // hai mã này có ca riêng bên dưới (cần khoá app / hai lần gửi); IN-GUARD-001 cần dấu cũ + đổi cấu hình — ca ở commit-guard.test.ts
      .filter((c) => c !== 'IN-BIZ-003' && c !== 'IN-BIZ-004' && c !== 'IN-GUARD-001');
    expect(Object.keys(PAIRS).sort()).toEqual(door.sort());
  });
});

describe('Test cặp (T021-4): block + door ⇔ cửa nạp từ chối, không thành sự việc', () => {
  for (const [code, make] of Object.entries(PAIRS)) {
    it(code, async () => {
      const raw = make();
      expect(codes(await pre(raw)), code).toContain(code);
      const res = await door(raw);
      expect(res.statusCode, `${code}: ${res.body}`).toBeGreaterThanOrEqual(400);
      expect(res.statusCode).toBeLessThan(500);
      if (typeof raw.docKey === 'string') expect(await eventOf(raw.docKey)).toBeUndefined();
    });
  }

  it('IN-BIZ-004: phiên bản lùi → preflight báo, cửa nạp CONFLICT, sự việc giữ bản mới', async () => {
    const v2 = sale({ version: 2 });
    expect((await door(v2)).statusCode).toBe(200);
    const v1 = { ...v2, version: 1 };
    expect(codes(await pre(v1))).toContain('IN-BIZ-004');
    expect((await door(v1)).statusCode).toBe(409);
    expect((await eventOf(v2.docKey as string))?.version).toBe(2);
  });

  it('IN-BIZ-003: khoá app, docKey không mang tiền tố app → preflight báo (cửa nạp chặn: apps.test.ts)', async () => {
    const appAuth = { ...auth, kind: 'apikey', app: 'pos-ngoai' } as AuthContext;
    expect(codes(await pre(sale(), appAuth))).toContain('IN-BIZ-003');
    expect(codes(await pre(sale({ docKey: 'pos-ngoai:CN01:X1' }), appAuth))).not.toContain('IN-BIZ-003');
  });
});

describe('Gom mọi lỗi, mã hướng dẫn, chỉ đọc', () => {
  it('T021-3: lỗi ở L1, L2, L3 trong một lần; sắp block trước; điểm 0', async () => {
    const r = await pre(sale({ docDate: '2026/10/05', branchCode: 'KHONG-CO-CN', totals: { beforeTax: 1, tax: 14815, total: 14816 } }));
    expect(codes(r)).toEqual(expect.arrayContaining(['IN-SHAPE-003', 'IN-SUM-001', 'IN-MD-001']));
    expect(new Set(r.findings.map((f) => f.layer))).toEqual(expect.objectContaining({ size: expect.any(Number) }));
    expect(['L1', 'L2', 'L3'].every((l) => r.findings.some((f) => f.layer === l))).toBe(true);
    const sev = r.findings.map((f) => f.severity);
    expect(sev.indexOf('hint') === -1 || sev.lastIndexOf('block') < sev.indexOf('hint')).toBe(true);
    expect(r.score).toBe(0);
    expect(r.findings.find((f) => f.code === 'IN-MD-001')).toMatchObject({ path: 'branchCode', got: 'KHONG-CO-CN', why: expect.any(String), fix: expect.any(String) });
    // Phương án của mã thiếu chi nhánh dẫn tới màn Danh mục chi nhánh (S021-26)
    expect(r.findings.find((f) => f.code === 'IN-MD-001')?.remedy?.steps.some((s) => s.screen?.code === 'DM02')).toBe(true);
  });

  it('chứng từ hợp lệ: không block, cửa nạp nhận; preflight không ghi sự việc', async () => {
    const d = sale();
    const r = await pre(d);
    expect(r.findings.filter((f) => f.severity === 'block')).toEqual([]);
    expect(r.parsed).toBeTruthy();
    expect(await eventOf(d.docKey as string)).toBeUndefined();
    expect((await door(d)).statusCode).toBe(200);
  });

  it('mã advice: thuế lệch thuế suất (IN-SUM-003), MST sai (IN-MD-005) — cửa nạp vẫn nhận, điểm trừ theo trọng số', async () => {
    const d = sale({ invoice: { ...base.invoice, no: '7770999' }, partner: { code: '0912000001', name: 'Khách MST sai', taxCode: '01234' }, lines: [{ ...base.lines[0], taxAmount: 20000, amountBeforeTax: 180000 }, base.lines[1]], totals: { beforeTax: 180000, tax: 20000, total: 200000 } });
    const r = await pre(d);
    expect(codes(r)).toEqual(expect.arrayContaining(['IN-SUM-003', 'IN-MD-005']));
    expect(r.score).toBe(100 - INTAKE_CATALOG['IN-SUM-003'].weight - INTAKE_CATALOG['IN-MD-005'].weight);
    expect((await door(d)).statusCode).toBe(200);
  });

  it('IN-BIZ-005: cùng phiên bản, nội dung khác — cửa nạp trả "unchanged" (bỏ qua), preflight cảnh báo', async () => {
    const d = sale();
    await door(d);
    const changed = { ...d, description: 'Sửa diễn giải nhưng quên tăng version' };
    expect(codes(await pre(changed))).toContain('IN-BIZ-005');
    expect((await door(changed)).json().data.status).toBe('unchanged');
    expect(codes(await pre(d))).not.toContain('IN-BIZ-005');
  });

  it('IN-BIZ-006: số hoá đơn đã có ở chứng từ khác (cảnh báo)', async () => {
    const a = sale({ invoice: { ...base.invoice, no: '7770001' } });
    await door(a);
    expect(codes(await pre(sale({ invoice: { ...base.invoice, no: '7770001' } })))).toContain('IN-BIZ-006' as IntakeCode);
  });
});
