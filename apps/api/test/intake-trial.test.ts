/**
 * L5 định khoản thử (PHASE-021 W5, PHASES 2.21; ADR-0014 D3; R-INTAKE-3/4/9, R-EVENT-11):
 *   T021-16 định khoản thử xong: accounting_events, ledger_entries, event_outbox, posting_log trước / sau như nhau
 *   - lỗi định khoản thật được phân loại (IN-POST-001 lý do lạ, IN-BIZ-001 kỳ khoá); lần thử sau vẫn chạy bình thường
 *   - L1–L4 còn lỗi chặn thì không thử (l5 = blocked); post:false thì không thử (off)
 *   - hết lượt trong phút thì bỏ qua L5 (rate); ánh xạ lỗi → mã là hàm thuần, kiểm riêng
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Errors } from '@bizcity/platform/core/errors';
import { db } from '../src/db/client.js';
import { postingFindings, resetTrials, takeTrial, TRIAL_LIMIT } from '../src/kernel/public.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId = '';
let k = 0;
const doc = (over: Record<string, unknown> = {}) => { k += 1; return saleDoc({ docKey: `tr:CN01:${k}`, docNo: `TR${k}`, ...over }); };
const trial = (document: unknown, extra: Record<string, unknown> = {}) => ctx.app.inject({ method: 'POST', url: '/api/v1/intake/preflight', payload: { document, ...extra } as never, headers: { authorization: `Bearer ${ctx.token}` } });
const counts = async () => {
  const n = async (t: 'accounting_events' | 'ledger_entries' | 'ledger_lines' | 'event_outbox' | 'posting_log') =>
    Number((await db.selectFrom(t).select(db.fn.countAll().as('n')).where('tenant_id', '=', tenantId).executeTakeFirstOrThrow()).n);
  return { events: await n('accounting_events'), entries: await n('ledger_entries'), lines: await n('ledger_lines'), outbox: await n('event_outbox'), log: await n('posting_log') };
};
const codes = (r: { json(): { data: { findings: { code: string }[] } } }) => r.json().data.findings.map((f) => f.code);
const at = { docDate: '2026-10-05' };

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
beforeEach(() => resetTrials());
afterAll(async () => {
  await ctx.app.close();
});

describe('Định khoản thử hoàn tác sạch (T021-16)', () => {
  it('chứng từ hợp lệ: l5 = ran, không phát hiện IN-POST; sổ, nhật ký, sự kiện không đổi', async () => {
    const before = await counts();
    const d = doc();
    const res = await trial(d);
    expect(res.statusCode, res.body).toBe(200);
    expect(res.json().data).toMatchObject({ l5: 'ran', score: expect.any(Number) });
    expect(codes(res).filter((c) => c.startsWith('IN-POST'))).toEqual([]);
    expect(await counts()).toEqual(before);
    // Nộp thật sau lần thử: vẫn vào sổ, đúng một sự việc mới (lần thử không để lại sự việc hay số thứ tự nào chặn)
    const real = await ctx.app.inject({ method: 'POST', url: '/api/v1/documents', payload: d as never, headers: { authorization: `Bearer ${ctx.token}` } });
    expect(real.statusCode, real.body).toBe(200);
    const after = await counts();
    expect(after.events).toBe(before.events + 1);
    expect(after.entries).toBeGreaterThan(before.entries);
  });

  it('lỗi cũng không để lại gì: lý do lạ → IN-POST-001, điểm 0, sổ không đổi, lần thử kế tiếp vẫn chạy', async () => {
    const before = await counts();
    const res = await trial(doc({ reasonCode: 'KHONG-CO-LD' }));
    expect(res.statusCode, res.body).toBe(200);
    expect(codes(res)).toContain('IN-POST-001');
    expect(res.json().data).toMatchObject({ l5: 'ran', score: 0 });
    expect(await counts()).toEqual(before);
    const again = await trial(doc());
    expect(again.json().data.l5).toBe('ran');
    expect(codes(again)).not.toContain('IN-POST-001');
  });

  it('kỳ khoá → IN-BIZ-001 (ngày chứng từ), chưa có sự việc nào', async () => {
    const lock = await call(ctx, 'PUT', '/api/v1/periods/locks', { year: 2026, month: 9, changes: [{ branchCode: 'CN01', docType: 'sale', locked: true }] });
    expect(lock.status, JSON.stringify(lock.body)).toBe(200);
    const before = await counts();
    const res = await trial(doc({ docDate: '2026-09-10', invoice: { no: '9990001', serial: 'C26TAA', form: '1', date: '2026-09-10' } }));
    const f = res.json().data.findings.find((x: { code: string }) => x.code === 'IN-BIZ-001');
    expect(f, res.body).toMatchObject({ path: 'docDate', got: '2026-09-10', stage: 'posting', remedy: expect.anything() });
    expect(await counts()).toEqual(before);
  });
});

describe('Khi nào L5 chạy', () => {
  it('còn lỗi chặn ở L1–L4 → l5 = blocked, không định khoản thử', async () => {
    const res = await trial(doc({ docDate: '05/10/2026' }));
    expect(res.json().data.l5).toBe('blocked');
    expect(codes(res)).toContain('IN-SHAPE-003');
    expect(codes(res).filter((c) => c.startsWith('IN-POST'))).toEqual([]);
  });

  it('post:false → l5 = off, không IN-POST dù lý do lạ', async () => {
    const res = await trial(doc({ reasonCode: 'KHONG-CO-LD' }), { post: false });
    expect(res.json().data.l5).toBe('off');
    expect(codes(res)).not.toContain('IN-POST-001');
  });

  it(`quá ${TRIAL_LIMIT} lần mỗi phút → l5 = rate, L1–L4 vẫn chạy`, async () => {
    const t0 = 1_000_000;
    for (let i = 0; i < TRIAL_LIMIT; i += 1) expect(takeTrial({ tenantId, actor: 'user:rate' }, t0)).toBe(true);
    expect(takeTrial({ tenantId, actor: 'user:rate' }, t0)).toBe(false);
    expect(takeTrial({ tenantId, actor: 'user:khac' }, t0)).toBe(true); // lượt tính theo từng người
    expect(takeTrial({ tenantId, actor: 'user:rate' }, t0 + 61_000)).toBe(true); // sang phút mới
    // Qua API: dùng hết lượt của chính người gọi rồi gọi tiếp
    const who = (await db.selectFrom('users').select('id').where('tenant_id', '=', tenantId).where('role', '=', 'owner').executeTakeFirstOrThrow()).id;
    for (let i = 0; i < TRIAL_LIMIT; i += 1) takeTrial({ tenantId, actor: `user:${who}` });
    const res = await trial(doc());
    expect(res.json().data.l5).toBe('rate');
    expect(codes(res).filter((c) => c.startsWith('IN-POST'))).toEqual([]);
  });
});

describe('Ánh xạ lỗi định khoản → mã (một chỗ)', () => {
  const codesOf = (e: ReturnType<typeof Errors.posting>) => postingFindings(e, at).map((f) => f.code);
  it('theo mã lỗi và câu mở đầu của bộ tra tài khoản', () => {
    expect(postingFindings(Errors.periodLocked(), at)[0]).toMatchObject({ code: 'IN-BIZ-001', got: '2026-10-05' });
    expect(postingFindings(Errors.unbalanced(), at).map((f) => f.code)).toEqual(['IN-POST-004']);
    expect(codesOf(Errors.posting('Lý do XYZ chưa khai báo trong Cấu hình hạch toán'))).toEqual(['IN-POST-001']);
    expect(codesOf(Errors.posting('Chưa có lý do mặc định cho loại chứng từ sale (đặt cờ…)'))).toEqual(['IN-POST-001']);
    expect(codesOf(Errors.posting('Thiếu cấu hình hạch toán', ['Tài khoản ngân hàng B9 chưa khai báo']))).toEqual(['IN-POST-002']);
    expect(codesOf(Errors.posting('Chưa có nhóm hạch toán mặt hàng mặc định'))).toEqual(['IN-POST-003']);
    expect(codesOf(Errors.posting('Bút toán không hợp lệ', ['Dòng 1 thiếu tài khoản']))).toEqual(['IN-POST-004']);
    expect(codesOf(Errors.posting('Chưa có luật định khoản cho loại chứng từ lạ'))).toEqual(['IN-POST-005']);
  });

  it('mã mới đều có phương án khắc phục; lỗi lõi dừng ghi sổ', () => {
    expect(postingFindings(Errors.unbalanced(), at)[0]!.remedy?.stopTheLine).toBe(true);
    expect(postingFindings(Errors.posting('Thiếu cấu hình hạch toán', ['a']), at)[0]!.remedy?.steps.length).toBeGreaterThan(0);
  });
});
