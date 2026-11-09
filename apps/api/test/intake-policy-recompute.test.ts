// [2026-11-09 07:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2b (S031-29, chữ chốt PHASE-031 · 00 §14): IN-POL-004 — tính lại quà theo bản nguồn nêu
/**
 *   T031-INT-10  quà đúng → không IN-POL-004 (cả tiền kiểm lẫn cửa nạp ra cùng kết quả, R-INTAKE-4)
 *   T031-INT-11  thiếu quà / thừa quà / lệch số lượng → IN-POL-004 có cặp nguồn ↔ tính lại; chứng từ vẫn vào sổ (cảnh báo)
 *   T031-INT-12  tính theo BẢN ĐƯỢC NÊU: chứng từ ngày cũ nêu bản cũ vẫn đúng dù bản mới đổi số quà; nêu bản mới mà gửi quà bản cũ thì lệch
 *   T031-INT-13  im lặng khi không tính được: nội dung ở module chủ; quà của chính sách khác không bị so; băm lệch chỉ IN-POL-001
 *   T031-INT-14  chế độ strict: IN-POL-004 chờ duyệt như các IN-POL-* khác
 *   giftDiff: so theo itemId nếu có, dung sai số lẻ
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { registerPolicyVersion } from '@bizcity/platform/core/policies';
import { withRequestContext } from '@bizcity/platform/core/request-context';
import { giftDiff } from '@bizcity/kernel/modules/intake/policy-check';
import { preflight } from '../src/kernel/public.js';
import type { AuthContext } from '../src/core/auth.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let auth: AuthContext;
const hash: Record<number, string> = {};
let modHash = '';

const pre = (raw: unknown) => withRequestContext({ requestId: `rc-${Math.random().toString(36).slice(2, 9)}`, correlationId: 'rc', tenantId },
  () => db.transaction().execute((trx) => preflight(trx, auth, raw)));
const door = (raw: unknown) => ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: raw as never, headers: { authorization: `Bearer ${ctx.token}` } });
const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code).filter((c) => c.startsWith('IN-POL-'));
const eventOf = (docKey: string) => sql<{ status: string; policy_check: { findings: { code: string; got?: string; expected?: string }[] } | null }>`
  SELECT status, policy_check FROM accounting_events WHERE tenant_id = ${tenantId} AND doc_key = ${docKey}`.execute(db).then((r) => r.rows[0]);

let k = 0;
/** Phiếu bán 1 SUA01 + dòng quà QUA01 (qty = gift); gift null = không có dòng quà. */
function sale(opts: { date: string; version: number; gift: number | null; key?: string; giftKey?: string; h?: string }) {
  k += 1;
  const base = saleDoc({ docKey: `rc:CN01:${k}`, docNo: `RC${k}`, docDate: opts.date, invoice: { no: String(5000 + k), serial: 'C26TAA', form: '1', date: opts.date } }) as { lines: Record<string, unknown>[] } & Record<string, unknown>;
  const l1 = base.lines[0]!, l2 = base.lines[1]!;
  const lines = opts.gift === null ? [l1] : [l1, { ...l2, qty: opts.gift, policyRef: { key: opts.giftKey ?? 'RC-QUA', version: opts.version, line: 'gift' } }];
  return { ...base, lines, policyRefs: [{ key: opts.key ?? 'RC-QUA', version: opts.version, hash: opts.h ?? hash[opts.version]!, policyId: opts.key ? undefined : 'ban-hang:inline:RC-QUA' }] } as unknown as { docKey: string; lines: Record<string, unknown>[]; policyRefs: Record<string, unknown>[] } & Record<string, unknown>;
}

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  auth = { tenantId, actor: 'user:test', actorName: 'test', permissions: new Set(['*']) } as unknown as AuthContext;
  const pub = (params: unknown, effectiveFrom: string) => call(ctx, 'POST', '/api/v1/policies', { key: 'RC-QUA', ruleContract: 'sale.promo.buy_x_get_y@1', params, effectiveFrom, reason: 'Chiến dịch thử' });
  // bản 1 (từ 01/10): mua 1 SUA01 tặng 1 QUA01; bản 2 (từ 01/11): tặng 2
  expect((await pub({ buy: { sku: 'SUA01', qty: 1 }, get: { sku: 'QUA01', qty: 1 }, repeat: true }, '2026-10-01')).status).toBe(201);
  expect((await pub({ buy: { sku: 'SUA01', qty: 1 }, get: { sku: 'QUA01', qty: 2 }, repeat: true }, '2026-11-01')).status).toBe(201);
  for (const r of (await sql<{ version: number; content_hash: string }>`SELECT version, content_hash FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = 'ban-hang:inline:RC-QUA'`.execute(db)).rows) hash[Number(r.version)] = r.content_hash;
  // chính sách mà nội dung ở module chủ (không tính lại được)
  modHash = (await db.transaction().execute((trx) => registerPolicyVersion(trx, {
    tenantId, ownerModule: 'ban-hang', policyKey: 'RC-MOD', policyId: 'ban-hang:khuyen_mai:RC-MOD', version: 1, ruleContract: 'sale.promo.buy_x_get_y@1',
    effectiveFrom: null, store: 'module', storeRef: 'khuyen_mai:1', content: { buy: 1, get: 1 }, actor: 'user:test', reason: 'thử',
  }))).contentHash;
});
afterAll(async () => { await ctx.app.close(); });

describe('IN-POL-004 — tính lại quà theo bản nguồn nêu (W2b)', () => {
  it('T031-INT-10: quà đúng → không mã; tiền kiểm và cửa nạp cùng kết quả', async () => {
    const doc = sale({ date: '2026-10-15', version: 1, gift: 1 });
    expect(codes(await pre(doc))).toEqual([]);
    const r = await door(doc);
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect((await eventOf(doc.docKey as string))?.policy_check?.findings).toEqual([]);
  });

  it('T031-INT-11: thiếu quà, thừa quà, lệch số lượng → IN-POL-004 kèm nguồn ↔ tính lại; vẫn vào sổ', async () => {
    for (const [name, gift, sentTxt] of [['thừa', 3, 'QUA01: nguồn 3'], ['thiếu', null, 'QUA01: nguồn 0'], ['lệch', 2, 'QUA01: nguồn 2']] as const) {
      const doc = sale({ date: '2026-10-16', version: 1, gift });
      const p = await pre(doc);
      expect(codes(p), name).toEqual(['IN-POL-004']);
      expect(p.findings.find((f) => f.code === 'IN-POL-004')).toMatchObject({ got: sentTxt, expected: expect.stringContaining('tính lại 1') });
      const r = await door(doc);
      expect(r.statusCode, `${name}: ${r.body}`).toBeLessThan(300);
      const e = await eventOf(doc.docKey as string);
      expect(e?.status, name).toBe('posted'); // cảnh báo, không chặn
      expect(e?.policy_check?.findings.map((f) => f.code), name).toEqual(['IN-POL-004']);
    }
  });

  it('T031-INT-12: tính theo bản ĐƯỢC NÊU, không theo bản hiện hành', async () => {
    // ngày 15/10 nêu bản 1 (tặng 1) — đúng dù bản 2 (tặng 2) đã tồn tại
    expect(codes(await pre(sale({ date: '2026-10-15', version: 1, gift: 1 })))).toEqual([]);
    // ngày 15/11 nêu bản 2 (tặng 2): quà 2 đúng, quà 1 lệch
    expect(codes(await pre(sale({ date: '2026-11-15', version: 2, gift: 2 })))).toEqual([]);
    const stale = await pre(sale({ date: '2026-11-15', version: 2, gift: 1 }));
    expect(codes(stale)).toEqual(['IN-POL-004']);
    expect(stale.findings.find((f) => f.code === 'IN-POL-004')?.expected).toContain('RC-QUA@2');
  });

  it('T031-INT-13: im lặng khi không tính được; quà chính sách khác không bị so; băm lệch chỉ IN-POL-001', async () => {
    // nội dung ở module chủ: không tính được → không IN-POL-004 dù quà "sai"
    const mod = sale({ date: '2026-10-15', version: 1, gift: 9, key: 'RC-MOD', giftKey: 'RC-MOD', h: modHash });
    mod.policyRefs[0]!.policyId = 'ban-hang:khuyen_mai:RC-MOD';
    expect(codes(await pre(mod))).toEqual([]);
    // dòng quà mang key của chính sách KHÁC (quà tay / chính sách khác) không bị so với RC-QUA: RC-QUA đúng quà 1 → không IN-POL-004
    const base = sale({ date: '2026-10-15', version: 1, gift: 1 });
    const extra = { ...base.lines[1]!, lineKey: 'l3', sku: 'QUA09', qty: 7, policyRef: { key: 'KHAC', version: 1, line: 'gift' } };
    const o = await pre({ ...base, lines: [...base.lines, extra], policyRefs: [...base.policyRefs, { key: 'KHAC', version: 1, hash: 'a'.repeat(64) }] });
    expect(codes(o)).toEqual(['IN-POL-001']); // KHAC không có trong sổ; RC-QUA khớp nên không IN-POL-004
    // băm lệch: chỉ IN-POL-001, không thêm IN-POL-004 trên nội dung không tin được
    expect(codes(await pre(sale({ date: '2026-10-15', version: 1, gift: 9, h: 'f'.repeat(64) })))).toEqual(['IN-POL-001']);
  });

  it('T031-INT-14: strict → IN-POL-004 chờ duyệt (không thêm trạng thái mới)', async () => {
    expect((await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.intake.policy_check', { value: 'strict', reason: 'Thử chế độ strict' })).status).toBe(200);
    const doc = sale({ date: '2026-10-17', version: 1, gift: 5 });
    const r = await door(doc);
    expect(r.statusCode, r.body).toBeLessThan(300);
    expect((await eventOf(doc.docKey as string))?.status).toBe('pending');
    await call(ctx, 'PUT', '/api/v1/settings/values/bizcity.intake.policy_check', { value: 'advice', reason: 'Trả về mặc định' });
  });
});

describe('giftDiff (thuần)', () => {
  it('so theo itemId nếu có, dung sai số lẻ, sắp ổn định', () => {
    expect(giftDiff([{ sku: 'B', qty: 2 }], [{ sku: 'B', qty: 2 }])).toEqual([]);
    expect(giftDiff([{ sku: 'B', qty: 0.1 + 0.2 }], [{ sku: 'B', qty: 0.3 }])).toEqual([]);
    expect(giftDiff([{ sku: 'B', itemId: 'X', qty: 1 }], [{ sku: 'C', itemId: 'X', qty: 1 }])).toEqual([]);
    expect(giftDiff([], [{ sku: 'B', qty: 1 }])).toEqual([{ item: 'B', sent: 0, expected: 1 }]);
    expect(giftDiff([{ sku: 'B', qty: 2 }, { sku: 'A', qty: 1 }], [])).toEqual([{ item: 'A', sent: 1, expected: 0 }, { item: 'B', sent: 2, expected: 0 }]);
  });
});
