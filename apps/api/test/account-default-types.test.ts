/**
 * [2026-11-13 Nguyễn Văn Thủy] Tài khoản ngầm định theo loại chứng từ (0126) (đóng góp)
 * Nạp gốc lần đầu; mặc định là tài khoản chi tiết đang dùng; sửa: mặc định phải nằm trong lọc, không nhận tài khoản tổng hợp;
 * cột gắn khoá → đồng bộ posting_defaults và các loại khác cùng khoá.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { db } from '../src/db/client.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;
let tenantId: string;
interface Col { key: string; caption: string; filter: string[]; default: string; bind?: string }
interface T { code: string; group: string; name: string; columns: Col[] }

beforeAll(async () => {
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
});
afterAll(async () => { await ctx.app.close(); });

describe('Tài khoản ngầm định theo loại', () => {
  it('nạp gốc, sửa đúng luật, đồng bộ khoá hạch toán', async () => {
    const list = (await call(ctx, 'GET', '/api/v1/account-default-types')).body.data as T[];
    expect(list.length).toBeGreaterThan(100);
    expect(list.some((t) => t.name.includes('Séc'))).toBe(false);
    const ban = list.find((t) => t.name === 'Bán hàng trong nước chưa thanh toán')!;
    const no = ban.columns.find((c) => c.key === 'debit_account')!;
    expect(no.bind).toBe('receivable');
    const posting = new Set((await db.selectFrom('accounts').select('code').where('tenant_id', '=', tenantId).where('is_posting', '=', true).execute()).map((a) => a.code));
    // mọi tài khoản mặc định đã điền (trừ cột gắn khoá: giữ đúng tài khoản đơn vị đang dùng) là tài khoản chi tiết
    for (const t of list) for (const c of t.columns) if (c.default && !c.bind) expect(posting.has(c.default), `${t.name} · ${c.caption} = ${c.default}`).toBe(true);

    // ngoài lọc → chặn
    const bad = await call(ctx, 'PUT', `/api/v1/account-default-types/${ban.code}`, { columns: [{ key: 'debit_account', filter: ['131'], default: '1111' }] });
    expect(bad.status).toBe(400);
    // tài khoản tổng hợp → chặn
    const parent = await call(ctx, 'PUT', `/api/v1/account-default-types/${ban.code}`, { columns: [{ key: 'debit_account', filter: ['131'], default: '131' }] });
    expect(parent.status).toBe(400);

    // đổi phải thu khách sang một tài khoản chi tiết khác trong lọc → posting_defaults + loại khác cùng khoá đổi theo
    const other = [...posting].filter((a) => a.startsWith('131') && a !== no.default).sort()[0];
    if (other) {
      const okRes = await call(ctx, 'PUT', `/api/v1/account-default-types/${ban.code}`, { columns: [{ key: 'debit_account', filter: no.filter, default: other }] });
      expect(okRes.status, JSON.stringify(okRes.body).slice(0, 300)).toBe(200);
      const d = await db.selectFrom('posting_defaults').select('account_code').where('tenant_id', '=', tenantId).where('key', '=', 'receivable').executeTakeFirst();
      expect(d?.account_code).toBe(other);
    }
    // quay về gốc chạy được
    expect((await call(ctx, 'POST', '/api/v1/account-default-types/restore', { confirm: true })).status).toBe(200);
  });
});
