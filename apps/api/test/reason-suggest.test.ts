/**
 * posting.reason.suggest (bizcity_posting_template@1 §6, PHASES 3.12; PHASE-012 S012-4): xếp hạng lý do tất định.
 * Chỉ tiêu PHASES 3.12: gợi ý đúng (top-1) ≥ 80% trên tình huống mẫu + ví dụ của các gói đã cài.
 * Kèm: tất định, lịch sử của chính đơn vị, notFor, lọc loại, posting.reason.readiness (manifest ledger.submits[].reasons §7), MCP.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

const read = (rel: string) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));
const BASE = read('../../../db/packs/vn-tt99-nen.posting-pack.json');
const TRADE = read('../../../docs/standard/examples/vn-tt99-thuong-mai.posting-pack.json');

let ctx: TestCtx;
const suggest = async (text: string, extra = '') => (await call(ctx, 'GET', `/api/v1/posting/reasons/suggest?text=${encodeURIComponent(text)}${extra}`)).body.data;

/** Ca kiểm: tình huống mẫu (tiêu đề → lý do) + ví dụ AI của từng lý do. */
function cases(pack: { reasons: { code: string; ai?: { examples?: string[] } }[]; scenarios?: { title: string; document: { reasonCode?: string } }[] }) {
  return [
    ...(pack.scenarios ?? []).filter((s) => s.document.reasonCode).map((s) => ({ text: s.title, want: s.document.reasonCode! })),
    ...pack.reasons.flatMap((r) => (r.ai?.examples ?? []).map((text) => ({ text, want: r.code }))),
  ];
}

beforeAll(async () => {
  ctx = await setupTenant();
});
afterAll(async () => {
  await ctx.app.close();
});

describe('posting.reason.suggest', () => {
  it('gói nền (cài lúc khởi tạo): top-1 đúng ≥ 80% trên ví dụ của gói', async () => {
    const all = cases(BASE);
    let hit = 0;
    const miss: string[] = [];
    for (const c of all) {
      const top = (await suggest(c.text)).suggestions[0]?.code;
      if (top === c.want) hit++; else miss.push(`${c.text} → ${top} (cần ${c.want})`);
    }
    expect(all.length).toBeGreaterThanOrEqual(14);
    expect(hit / all.length, miss.join('\n')).toBeGreaterThanOrEqual(0.8);
  });

  it('cài thêm gói ngành: top-1 đúng ≥ 80% trên tình huống mẫu + ví dụ của gói ngành (lý do đang dùng)', async () => {
    expect((await call(ctx, 'POST', '/api/v1/posting/packs/install', { pack: TRADE })).status).toBe(201);
    const active = new Set((await call(ctx, 'GET', '/api/v1/posting/reasons')).body.data.filter((r: { isActive?: boolean; is_active?: boolean }) => r.isActive ?? r.is_active ?? true).map((r: { code: string }) => r.code));
    const all = cases(TRADE).filter((c) => active.has(c.want));
    let hit = 0;
    const miss: string[] = [];
    for (const c of all) {
      const top = (await suggest(c.text)).suggestions[0]?.code;
      if (top === c.want) hit++; else miss.push(`${c.text} → ${top} (cần ${c.want})`);
    }
    expect(all.length).toBeGreaterThanOrEqual(10);
    expect(hit / all.length, miss.join('\n')).toBeGreaterThanOrEqual(0.8);
  });

  it('tất định; lọc loại; notFor hạ điểm; confident + askIf', async () => {
    const a = await suggest('Trả tiền điện tháng 10 cửa hàng Cầu Giấy');
    expect(await suggest('Trả tiền điện tháng 10 cửa hàng Cầu Giấy')).toEqual(a);
    expect(a.suggestions[0]).toMatchObject({ code: 'CDV01', why: expect.arrayContaining([expect.stringMatching(/tiền điện/)]) });
    expect(a.confident).toBe(true);
    const office = await suggest('Điện nước văn phòng tháng 10');
    expect(office.suggestions.find((s: { code: string }) => s.code === 'CDV01')?.why ?? []).toEqual(expect.arrayContaining([expect.stringMatching(/không dùng cho/)]));
    const pay = await suggest('thu tiền', '&kind=payment');
    expect(pay.suggestions.every((s: { kind: string }) => s.kind === 'payment')).toBe(true);
    const vague = await suggest('linh tinh không rõ');
    expect(vague.confident).toBe(false);
  });

  it('lịch sử của chính đơn vị: diễn giải giống bút toán cũ cộng điểm cho lý do đã dùng', async () => {
    const text = 'Chi tiền gửi xe nhân viên tháng 10';
    const before = (await suggest(text)).suggestions.find((s: { code: string }) => s.code === 'CTMB')?.score ?? 0;
    for (let i = 0; i < 2; i++) {
      const r = await call(ctx, 'POST', '/api/v1/vouchers', {
        docType: 'payment', branchCode: 'CN01', docDate: '2026-10-08', description: text, reasonCode: 'CTMB',
        lines: [{ debitAccount: '64172', creditAccount: '1111', amount: 200000, description: text }],
      });
      expect(r.status, JSON.stringify(r.body)).toBe(201);
    }
    const after = (await suggest(text)).suggestions.find((s: { code: string }) => s.code === 'CTMB');
    expect(after.score).toBeGreaterThan(before);
    expect(after.why).toEqual(expect.arrayContaining([expect.stringMatching(/đơn vị đã dùng 2 lần/)]));
  });

  it('readiness: docType đã có lý do mặc định hay chưa', async () => {
    const r = (await call(ctx, 'GET', '/api/v1/posting/reasons/readiness?docTypes=customer_payment,stock_adjustment:increase,payroll')).body.data;
    expect(r).toEqual([
      expect.objectContaining({ docType: 'customer_payment', ready: true, reasonCode: 'TTKH' }),
      expect.objectContaining({ docType: 'stock_adjustment:increase', ready: true, reasonCode: 'NDC' }),
      expect.objectContaining({ docType: 'payroll', ready: false, reasonCode: null }),
    ]);
  });

  it('MCP: AI đọc được công cụ gợi ý lý do', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${ctx.token}` }, payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'accounting.posting.reason_suggest', arguments: { text: 'Khách chuyển khoản trả nợ tiền hàng' } } } as never });
    const out = res.json().result.structuredContent;
    expect(out.success, JSON.stringify(out)).toBe(true);
    expect(out.data.suggestions[0].code).toBe('TTKH');
  });

  it('seed = gói nền: đơn vị mới có đúng lý do, thuế, hình thức TT, ngầm định của gói; ghi nhận ở config_packs', async () => {
    const tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
    const methods = await db.selectFrom('payment_methods').select(['code', 'account_code', 'is_receivable']).where('tenant_id', '=', tenantId).orderBy('code').execute();
    expect(methods).toEqual(BASE.paymentMethods.map((m: { code: string; account: string; receivable?: boolean }) => ({ code: m.code, account_code: m.account, is_receivable: !!m.receivable })).sort((x: { code: string }, y: { code: string }) => (x.code < y.code ? -1 : 1)));
    const defaults = await db.selectFrom('posting_defaults').select(['key', 'account_code']).where('tenant_id', '=', tenantId).execute();
    expect(Object.fromEntries(defaults.map((d) => [d.key, d.account_code]))).toEqual(BASE.postingDefaults);
    const row = await db.selectFrom('config_packs').select(['version', 'installed_by', 'policy_version']).where('tenant_id', '=', tenantId).where('pack_id', '=', BASE.id).executeTakeFirstOrThrow();
    expect(row).toEqual({ version: BASE.version, installed_by: 'seed', policy_version: null });
  });
});
