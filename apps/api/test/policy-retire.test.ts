// [2026-11-10 09:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-031 — S031-31 (RV-R1-04, chữ chốt PHASE-031 · 00 §16): ngừng chính sách đóng effective_to; T031-RT-1…5
/**
 * Ngừng chính sách phải có hiệu lực thật ở cửa nạp:
 *   T031-RT-1  ngừng đóng effective_to của bản còn mở bằng ngày ngừng; bản đã đóng từ trước giữ nguyên
 *   T031-RT-2  chứng từ trước / đúng ngày ngừng vẫn hợp lệ; sau ngày ngừng báo IN-POL-002 (cửa nạp tiền kiểm)
 *   T031-RT-3  ngày ngừng tương lai: chứng từ đến hết ngày đó vẫn được nhận, sau đó IN-POL-002
 *   T031-RT-4  ngày ngừng sớm hơn effective_from − 1: dùng effective_from − 1 (khoảng rỗng), không vi phạm ràng buộc; ngày sai khuôn → 400
 *   T031-RT-5  sự kiện policy.retired mang effectiveTo; gọi lại trả 0 và không đổi gì
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { withRequestContext } from '@bizcity/platform/core/request-context';
import { listPolicyVersions, registerPolicyVersion, retirePolicy } from '@bizcity/platform/core/policies';
import type { AuthContext } from '../src/core/auth.js';
import { preflight } from '../src/kernel/public.js';
import { db } from '../src/db/client.js';
import { saleDoc, setupTenant } from './helpers.js';

let tenantId = '';
let auth: AuthContext;
const hashes = new Map<string, string[]>();

const pre = (raw: unknown) => withRequestContext({ requestId: `rt-${Math.random().toString(36).slice(2, 9)}`, correlationId: 'rt', tenantId },
  () => db.transaction().execute((trx) => preflight(trx, auth, raw)));
const codes = (r: { findings: { code: string }[] }) => r.findings.map((f) => f.code).filter((c) => c.startsWith('IN-POL-'));
let k = 0;
const sale = (key: string, version: number, docDate: string) => {
  k += 1;
  return saleDoc({ docKey: `rt:CN01:${k}`, docNo: `RT${k}`, docDate, policyRefs: [{ key, version, hash: hashes.get(key)![version - 1] }] });
};
const reg = (key: string, version: number, from: string | null) => db.transaction().execute((trx) => registerPolicyVersion(trx, {
  tenantId, ownerModule: 'ban-hang', policyKey: key, policyId: `ban-hang:khuyen_mai:${key}`, version, ruleContract: 'sale.promo.buy_x_get_y@1',
  effectiveFrom: from, store: 'module', storeRef: `khuyen_mai:${key}:${version}`, content: { buy: 2 + version, get: 1 }, actor: 'user:test', reason: `bản ${version}`,
})).then((r) => { const a = hashes.get(key) ?? []; a[version - 1] = r.contentHash; hashes.set(key, a); });
const policyId = (key: string) => `ban-hang:khuyen_mai:${key}`;
const range = async (key: string) => (await listPolicyVersions(db, tenantId, policyId(key))).map((v) => ({ v: v.version, status: v.status, to: v.effectiveTo }));
const retire = (key: string, to?: string) => db.transaction().execute((trx) => retirePolicy(trx, tenantId, policyId(key), 'user:test', to));

beforeAll(async () => {
  const ctx = await setupTenant();
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  auth = { tenantId, actor: 'user:test', actorName: 'test', permissions: new Set(['*']) } as unknown as AuthContext;
  // RT-A: bản 1 từ đầu → 09/11 (đóng khi bản 2 ra), bản 2 từ 10/11 (còn mở)
  await reg('RT-A', 1, null); await reg('RT-A', 2, '2026-11-10');
  // RT-B: bản 1 từ 01/12 (ngừng có hẹn)
  await reg('RT-B', 1, '2026-12-01');
  // RT-C: bản 1 từ 01/12 (ngừng sớm hơn ngày áp)
  await reg('RT-C', 1, '2026-12-01');
  await ctx.app.close();
});

describe('Ngừng chính sách đóng hiệu lực (RV-R1-04)', () => {
  it('T031-RT-1 đóng effective_to bản còn mở; bản đã đóng giữ nguyên', async () => {
    expect(await range('RT-A')).toEqual([{ v: 1, status: 'published', to: '2026-11-09' }, { v: 2, status: 'published', to: null }]);
    expect(await retire('RT-A', '2026-11-20')).toBe(2);
    expect(await range('RT-A')).toEqual([{ v: 1, status: 'retired', to: '2026-11-09' }, { v: 2, status: 'retired', to: '2026-11-20' }]);
  });

  it('T031-RT-2 trước / đúng ngày ngừng vẫn hợp lệ; sau ngày ngừng IN-POL-002', async () => {
    expect(codes(await pre(sale('RT-A', 2, '2026-11-15')))).toEqual([]);
    expect(codes(await pre(sale('RT-A', 2, '2026-11-20')))).toEqual([]);
    expect(codes(await pre(sale('RT-A', 2, '2026-11-21')))).toEqual(['IN-POL-002']);
    expect(codes(await pre(sale('RT-A', 1, '2026-11-05')))).toEqual([]); // chứng từ cũ vẫn trỏ được bản cũ
  });

  it('T031-RT-3 ngừng có hẹn (ngày tương lai): status đổi ngay, chứng từ đến hết ngày đó vẫn được nhận', async () => {
    expect(await retire('RT-B', '2026-12-31')).toBe(1);
    expect(await range('RT-B')).toEqual([{ v: 1, status: 'retired', to: '2026-12-31' }]);
    expect(codes(await pre(sale('RT-B', 1, '2026-12-31')))).toEqual([]);
    expect(codes(await pre(sale('RT-B', 1, '2027-01-01')))).toEqual(['IN-POL-002']);
  });

  it('T031-RT-4 ngày ngừng sớm hơn effective_from − 1 dùng effective_from − 1; ngày sai khuôn bị từ chối', async () => {
    expect(await retire('RT-C', '2026-11-01')).toBe(1);
    expect(await range('RT-C')).toEqual([{ v: 1, status: 'retired', to: '2026-11-30' }]); // khoảng rỗng: bản chưa từng có hiệu lực
    expect(codes(await pre(sale('RT-C', 1, '2026-12-05')))).toEqual(['IN-POL-002']);
    await expect(retire('RT-C', '10/11/2026')).rejects.toThrow(/sai khuôn/);
  });

  it('T031-RT-5 sự kiện policy.retired mang effectiveTo; gọi lại trả 0 và không đổi gì', async () => {
    const ev = await sql<{ data: { effectiveTo: string; retiredVersions: number[] } }>`SELECT data FROM event_outbox WHERE tenant_id = ${tenantId} AND type = 'bizcity.policy.retired' AND subject = ${`policy:${policyId('RT-A')}`}`.execute(db);
    expect(ev.rows).toHaveLength(1);
    expect(ev.rows[0]!.data).toMatchObject({ effectiveTo: '2026-11-20', retiredVersions: [1, 2] });
    expect(await retire('RT-A', '2026-11-25')).toBe(0);
    expect(await range('RT-A')).toEqual([{ v: 1, status: 'retired', to: '2026-11-09' }, { v: 2, status: 'retired', to: '2026-11-20' }]);
  });

  it('mặc định ngày hôm nay (múi giờ CSDL) khi không truyền ngày', async () => {
    await reg('RT-D', 1, null);
    expect(await retire('RT-D')).toBe(1);
    const r = await sql<{ ok: boolean }>`SELECT effective_to = current_date AS ok FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = ${policyId('RT-D')}`.execute(db);
    expect(r.rows[0]!.ok).toBe(true);
  });
});
