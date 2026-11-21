// [2026-11-21 05:40 PM Võ Hoàng] PHASE-031 — S031-7 (31-S031-7 §3): approval.levels@1 — vectors, cùng số cấp với yêu cầu thanh toán, đồng bộ khoá ngưỡng vào sổ chính sách, quyền
/**
 *   T031-AP-1  approval.levels@1: vectors chạy đúng; describe().params khớp khoá zod; publishChecks bắt dải hở / chồng / không từ 0 / dải giữa mở
 *   T031-AP-2  cùng số cấp với luồng yêu cầu thanh toán: thresholdToBands(giá trị khoá) → evaluate = levelsFor (dưới / bằng / trên ngưỡng, ngưỡng 0),
 *              so với cả hàm của luồng (bản chép công thức) và levels_required thật của yêu cầu lập qua API
 *   T031-AP-3  đồng bộ: lần đầu tạo phong bì (store = settings, store_ref = khoá); gọi lại không trùng; đổi khoá → bản mới, bản cũ đóng;
 *              ngày hiệu lực tương lai; phiên bản ghi lùi → drift, không tự sửa; GET /api/v1/policies đọc được nội dung (khớp băm)
 *   T031-AP-4  quyền: người không có settings:write → 403; approval.* không phát hành inline
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import type { ZodTypeAny } from 'zod';
import { db } from '../src/db/client.js';
import { contentHash } from '@bizcity/platform/core/documents';
import { settingsToday } from '@bizcity/platform/core/settings';
import { getRuleContract, RULE_CONTRACTS } from '../src/modules/system/rule-contracts/index.js';
import {
  approvalLevels, approvalLevelsParams, approvalLevelsVectors, evaluateApprovalLevels, thresholdToBands, type ApprovalLevelsParams,
} from '../src/modules/system/rule-contracts/approval-levels.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const KEY = 'bizcity.payment.approval_thresholds';
const POLICY_ID = `quy:settings:${KEY}`;
let ctx: TestCtx, kt: TestCtx;
let tenantId = '', today = '';
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Bản chép đúng công thức của luồng yêu cầu thanh toán (payment-request.routes.ts: secondLevelFrom + levelsFor). */
const paymentLevelsFor = (value: unknown, amount: number): 1 | 2 => {
  const v = Number(value ?? 0);
  const s = v > 0 ? v : null;
  return s !== null && amount >= s ? 2 : 1;
};

async function userCtx(email: string, role: string): Promise<TestCtx> {
  expect((await call(ctx, 'POST', '/api/v1/users', { email, fullName: email.split('@')[0], role, password: 'Pass@12345' })).status).toBe(201);
  const res = await ctx.app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { tenantCode: ctx.tenantCode, email, password: 'Pass@12345' } });
  return { ...ctx, token: res.json().data.token };
}
const sync = (who: TestCtx = ctx) => call(who, 'POST', '/api/v1/policies/sync-settings', {});
type Row = { version: number; effective_from: string | null; effective_to: string | null; store: string; store_ref: string; rule_contract: string; content_hash: string; owner_module: string; status: string; published_by: string };
const rows = async () => (await sql<Row>`
  SELECT version, effective_from::text AS effective_from, effective_to::text AS effective_to, store, store_ref, rule_contract, content_hash, owner_module, status, published_by
    FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_id = ${POLICY_ID} ORDER BY version`.execute(db)).rows;
const setThreshold = async (secondLevelFrom: number | null) => expect((await call(ctx, 'PUT', '/api/v1/payment-request-settings', { secondLevelFrom })).status).toBe(200);

beforeAll(async () => {
  ctx = await setupTenant();
  kt = await userCtx('kt-ap@ketoan.local', 'accountant');
  await call(ctx, 'PUT', '/api/v1/partners/NCC-AP', { name: 'Nhà cung cấp AP', kind: 'supplier' });
  tenantId = String((await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id);
  today = settingsToday();
});
afterAll(async () => { await ctx.app.close(); });

describe('T031-AP-1: Rule Contract approval.levels@1', () => {
  it('có trong danh sách, miền approval, liệt kê ở /api/v1/rule-contracts', async () => {
    expect(getRuleContract('approval.levels@1')).toBe(approvalLevels);
    expect(RULE_CONTRACTS).toContain(approvalLevels);
    expect(approvalLevels.domain).toBe('approval');
    const r = await call(ctx, 'GET', '/api/v1/rule-contracts');
    expect(r.body.data.items).toContainEqual({ id: 'approval.levels@1', domain: 'approval', title: approvalLevels.title });
    const one = await call(ctx, 'GET', '/api/v1/rule-contracts/approval.levels@1');
    expect(one.status).toBe(200);
    expect(one.body.data.vectors).toHaveLength(approvalLevelsVectors.length);
  });

  it('mọi vectors chạy đúng; tham số vector qua khuôn và kiểm phát hành', () => {
    for (const v of approvalLevels.describe().vectors) {
      const p = approvalLevels.params.parse(v.params);
      expect(approvalLevels.publishChecks(p), v.name).toEqual([]);
      expect(approvalLevels.evaluate(p, v.input), v.name).toEqual(v.output);
      expect(approvalLevels.explain(p, v.output).length, v.name).toBeGreaterThan(0);
    }
  });

  it('describe().params khớp khoá zod (kể cả lồng), bắt buộc / tuỳ chọn đúng', () => {
    const unwrap = (s: ZodTypeAny): ZodTypeAny => {
      let x = s as ZodTypeAny & { _def: { innerType?: ZodTypeAny; type?: ZodTypeAny } };
      while (x._def.innerType) x = x._def.innerType as typeof x;
      return x;
    };
    const code = new Map<string, boolean>();
    const walk = (shape: Record<string, ZodTypeAny>, prefix: string) => {
      for (const [k, v] of Object.entries(shape)) {
        const name = `${prefix}${k}`;
        code.set(name, !v.isOptional());
        const inner = unwrap(v) as ZodTypeAny & { _def: { typeName: string; type?: ZodTypeAny } };
        if (inner._def.typeName === 'ZodArray') {
          const el = unwrap(inner._def.type!) as ZodTypeAny & { shape?: Record<string, ZodTypeAny> };
          if (el.shape) walk(el.shape, `${name}[].`);
        }
      }
    };
    walk(approvalLevelsParams.shape as Record<string, ZodTypeAny>, '');
    const docs = approvalLevels.describe().params;
    expect(docs.map((d) => d.name).sort()).toEqual([...code.keys()].sort());
    for (const d of docs) expect(d.required, d.name).toBe(code.get(d.name));
  });

  it('publishChecks: dải không từ 0, hở, chồng, dải giữa mở, dải cuối đóng, to ≤ from, quyền lặp', () => {
    const L = [{ permission: 'payments:approve' }];
    const bad = (bands: ApprovalLevelsParams['bands']) => approvalLevels.publishChecks({ bands }).map((i) => i.message).join(' | ');
    expect(bad([{ from: 1, levels: L }])).toMatch(/bắt đầu từ 0/);
    expect(bad([{ from: 0, to: 10, levels: L }, { from: 20, levels: L }])).toMatch(/Hở/);
    expect(bad([{ from: 0, to: 10, levels: L }, { from: 5, levels: L }])).toMatch(/chồng/);
    expect(bad([{ from: 0, levels: L }, { from: 10, levels: L }])).toMatch(/phải có "đến"/);
    expect(bad([{ from: 0, to: 10, levels: L }])).toMatch(/Dải cuối/);
    expect(bad([{ from: 0, to: 0, levels: L }, { from: 0, levels: L }])).toMatch(/phải lớn hơn/);
    expect(bad([{ from: 0, levels: [...L, ...L] }])).toMatch(/lặp/);
    expect(approvalLevels.params.safeParse({ bands: [] }).success).toBe(false);
    expect(evaluateApprovalLevels(thresholdToBands(5), { amount: Number.NaN })).toMatchObject({ indeterminate: true, count: 0 });
  });
});

describe('T031-AP-2: cùng số cấp với luồng yêu cầu thanh toán', () => {
  const thresholds: unknown[] = [0, null, undefined, '0', 1, 2_000_000, 2_000_000.5, 999_999_999_999];
  const amounts = [0, 1, 1_999_999, 1_999_999.99, 2_000_000, 2_000_000.01, 2_000_001, 50_000_000, 999_999_999_999, 5e12];
  it('thresholdToBands(giá trị khoá) → evaluate.count = levelsFor của luồng, mọi ngưỡng × số tiền', () => {
    for (const t of thresholds) {
      const p = thresholdToBands(t);
      expect(approvalLevels.publishChecks(approvalLevels.params.parse(p)), String(t)).toEqual([]);
      for (const a of amounts) expect(evaluateApprovalLevels(p, { amount: a }).count, `ngưỡng ${String(t)}, số tiền ${a}`).toBe(paymentLevelsFor(t, a));
    }
  });

  it('levels_required của yêu cầu lập qua API = evaluate theo nội dung đọc từ sổ chính sách (ngưỡng 0, rồi 2 tr: dưới / bằng / trên)', async () => {
    const create = async (amount: number) => {
      const r = await call(ctx, 'POST', '/api/v1/payment-requests', { requestDate: today, branchCode: 'CN01', partnerCode: 'NCC-AP', amount, debitAccount: '64211', method: 'cash', description: 'Thử ngưỡng' });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
      return (await call(ctx, 'GET', `/api/v1/payment-requests/${r.body.data.id}`)).body.data.levelsRequired as number;
    };
    const fromRegistry = async () => {
      expect((await sync()).status).toBe(200);
      const items = (await call(ctx, 'GET', `/api/v1/policies?domain=approval&at=${today}`)).body.data.items as { policyKey: string; store: string; params: ApprovalLevelsParams | null }[];
      const it = items.find((x) => x.policyKey === KEY)!;
      expect(it.store).toBe('settings');
      expect(it.params).not.toBeNull();
      return it.params!;
    };
    // Khoá chưa có phiên bản: một cấp với mọi số tiền.
    let p = await fromRegistry();
    for (const a of [1, 2_000_000, 50_000_000]) expect(await create(a), `ngưỡng 0, ${a}`).toBe(evaluateApprovalLevels(p, { amount: a }).count);
    await setThreshold(2_000_000);
    p = await fromRegistry();
    for (const a of [1_999_999, 2_000_000, 2_000_001]) expect(await create(a), `ngưỡng 2 tr, ${a}`).toBe(evaluateApprovalLevels(p, { amount: a }).count);
    expect([await create(1_999_999), await create(2_000_000)]).toEqual([1, 2]);
    await setThreshold(null); // 0 = một cấp
    p = await fromRegistry();
    expect(await create(50_000_000)).toBe(evaluateApprovalLevels(p, { amount: 50_000_000 }).count);
    expect(evaluateApprovalLevels(p, { amount: 50_000_000 }).count).toBe(1);
  });
});

describe('T031-AP-3: đồng bộ khoá ngưỡng vào sổ đăng ký chính sách', () => {
  it('đã có ba bản từ T031-AP-2 (mặc định, 2 tr, 0); gọi lại không sinh bản trùng; phong bì store = settings, store_ref = khoá', async () => {
    const r1 = await rows();
    expect(r1.map((r) => r.version)).toEqual([1, 2, 3]);
    for (const r of r1) expect(r).toMatchObject({ store: 'settings', store_ref: KEY, rule_contract: 'approval.levels@1', owner_module: 'quy', status: 'published' });
    expect(r1[0]).toMatchObject({ effective_from: null, content_hash: contentHash(thresholdToBands(0)) });
    expect(r1[1]).toMatchObject({ effective_from: today, content_hash: contentHash(thresholdToBands(2_000_000)) });
    expect(r1[2]).toMatchObject({ effective_from: today, effective_to: null, content_hash: contentHash(thresholdToBands(0)) });
    // Bản cũ đóng ở ngày áp của bản mới − 1 (bản 2 bị thay trong ngày → khoảng rỗng, không ngày nào chọn nó).
    expect(r1[0]!.effective_to).toBe(addDays(today, -1));
    expect(r1[1]!.effective_to).toBe(addDays(today, -1));
    // Người phát hành = người ghi phiên bản cấu hình.
    expect(r1[1]!.published_by).toMatch(/^user:/);
    for (let i = 0; i < 2; i++) {
      const again = await sync();
      expect(again.status).toBe(200);
      expect(again.body.data.items[0]).toMatchObject({ key: KEY, policyId: POLICY_ID, published: [], drift: [], current: { version: 3 } });
    }
    expect(await rows()).toHaveLength(3);
  });

  it('đổi khoá có ngày hiệu lực tương lai (đường ghi cấu hình của lõi) → bản mới từ ngày đó, bản trước đóng ở ngày trước', async () => {
    const future = addDays(today, 10);
    const put = await call(ctx, 'PUT', `/api/v1/settings/values/${KEY}`, { value: 5_000_000, validFrom: future, reason: 'Nâng ngưỡng từ tháng sau' });
    expect(put.status, JSON.stringify(put.body)).toBe(200);
    const s = await sync();
    expect(s.body.data.items[0].published).toEqual([{ version: 4, effectiveFrom: future, contentHash: contentHash(thresholdToBands(5_000_000)) }]);
    const r = await rows();
    expect(r[2]).toMatchObject({ version: 3, effective_to: addDays(future, -1) });
    expect(r[3]).toMatchObject({ version: 4, effective_from: future, effective_to: null });
    expect((await sync()).body.data.items[0].published).toEqual([]);
    // Nội dung đọc qua sổ: hôm nay bản 3 (một cấp), từ ngày tương lai bản 4 (hai cấp từ 5 tr).
    const at = async (d: string) => ((await call(ctx, 'GET', `/api/v1/policies?domain=approval&at=${d}`)).body.data.items as { version: number; params: ApprovalLevelsParams }[])[0]!;
    expect((await at(today)).version).toBe(3);
    const f = await at(future);
    expect(f.version).toBe(4);
    expect(evaluateApprovalLevels(f.params, { amount: 5_000_000 }).count).toBe(2);
  });

  it('phiên bản cấu hình ghi lùi về trước bản cuối → không nối được, báo drift; không tự sửa sổ', async () => {
    await setThreshold(3_000_000); // hiệu lực hôm nay, sau khi bản 4 (tương lai) đã vào sổ
    const s = await sync();
    const item = s.body.data.items[0];
    expect(item.published).toEqual([]);
    expect(item.drift).toEqual([{ at: today, registryVersion: 3, registryHash: contentHash(thresholdToBands(0)), settingsHash: contentHash(thresholdToBands(3_000_000)) }]);
    expect(await rows()).toHaveLength(4);
    // Bộ đọc không đoán: bản 3 không còn khớp cấu hình → params null.
    const items = (await call(ctx, 'GET', `/api/v1/policies?domain=approval&at=${today}`)).body.data.items as { version: number; params: unknown }[];
    expect(items[0]).toMatchObject({ version: 3, params: null });
  });
});

describe('T031-AP-4: quyền và phát hành inline', () => {
  it('người không có settings:write gọi đồng bộ → 403, không ghi gì', async () => {
    const before = (await rows()).length;
    expect((await sync(kt)).status).toBe(403);
    expect(await rows()).toHaveLength(before);
  });

  it('approval.levels@1 không phát hành inline (nội dung ở setting_values)', async () => {
    const r = await call(ctx, 'POST', '/api/v1/policies', { key: 'AP-INLINE', ruleContract: 'approval.levels@1', params: thresholdToBands(1), effectiveFrom: today });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.body)).toMatch(/chưa có module chủ/);
  });
});
