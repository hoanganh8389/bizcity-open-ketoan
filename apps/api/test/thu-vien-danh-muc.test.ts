// [2026-11-09 04:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-52 (PHASE-030 · 26 §11.1): test ba thư viện danh mục chuẩn — core.khoan-muc (cây), vn.loai-thue, core.ly-do-dinh-khoan: không số tài khoản, nguồn chỉ cột đã định, kiểm mã qua API
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getLibrary, validateInLibrary, selectorRows } from '@bizcity/platform/core/libraries/index';
import { call, setupTenant, type TestCtx } from './helpers.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const IDS = ['core.khoan-muc', 'vn.loai-thue', 'core.ly-do-dinh-khoan'] as const;
const lib = (id: string) => getLibrary(id)!;
const source = (id: string, file: string) => readFileSync(path.join(REPO, 'libraries', id, 'sources', file), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));

describe('Ba thư viện danh mục chuẩn', () => {
  it('được nạp, mọi mục chưa đối chiếu (verified: false), đang dùng', () => {
    for (const id of IDS) {
      const l = lib(id);
      expect(l, id).toBeTruthy();
      expect(l.kind).toBe('code-list');
      expect(l.items.length).toBeGreaterThan(40);
      expect(l.items.every((i) => i.verified === false && i.status === 'active')).toBe(true);
    }
  });

  it('không mang số tài khoản: không khoá account* trong payload, không khoá tài khoản nào của nguồn', () => {
    const banned = /account|tai_?khoan/i;
    for (const id of IDS) {
      for (const it of lib(id).items) expect(Object.keys(it.payload ?? {}).filter((k) => banned.test(k)), `${id}:${it.code}`).toEqual([]);
      expect(JSON.stringify(lib(id).itemSchema)).not.toMatch(banned);
    }
    // nguồn gốc vẫn có tài khoản (db/seeds) nhưng bản sinh thì không có giá trị của chúng
    const taxAccounts = new Set(source('vn.loai-thue', 'loai-thue.jsonl').slice(1).map((r: any) => String(r.account_code)));
    expect(taxAccounts.size).toBeGreaterThan(0);
    const body = JSON.stringify(lib('vn.loai-thue').items);
    for (const a of taxAccounts) expect(body).not.toContain(`"${a}"`);
    const reasonAccounts = new Set(source('core.ly-do-dinh-khoan', 'ly-do.jsonl').slice(1).flatMap((r: any) => [r.counter_account, r.revenue_account, r.expense_account]).filter((x: unknown) => typeof x === 'string' && /^\d{3,}$/.test(x as string)));
    const rbody = JSON.stringify(lib('core.ly-do-dinh-khoan').items);
    for (const a of reasonAccounts) expect(rbody).not.toContain(`"${a}"`);
  });

  it('nguồn chỉ có cột đã định — không đối tượng, nhân viên, ngân hàng lẫn vào', () => {
    expect(source('core.khoan-muc', 'khoan-muc.jsonl')[0]._cot).toEqual(['code', 'name', 'parent_code', 'note', 'is_active']);
    expect(source('vn.loai-thue', 'loai-thue.jsonl')[0]._cot).toEqual(['code', 'name', 'rate', 'direction', 'account_code', 'report_group', 'is_active']);
    expect(source('core.ly-do-dinh-khoan', 'ly-do.jsonl')[0]._cot).toEqual(['code', 'name', 'kind', 'counter_account', 'revenue_account', 'expense_account', 'cashflow_code', 'is_active', 'flags']);
    const text = IDS.map((id) => JSON.stringify(lib(id))).join('\n');
    expect(text).not.toMatch(/\b\d{10}(-\d{3})?\b/); // không chuỗi giống mã số thuế
    expect(text).not.toMatch(/@[a-z0-9-]+\.[a-z]{2,}/i); // không email
  });
});

describe('core.khoan-muc — cây khoản mục', () => {
  it('mã cha có thật, cấp = cấp cha + 1, group = khoản mục gốc, không vòng', () => {
    const items = lib('core.khoan-muc').items;
    const by = new Map(items.map((i) => [i.code, i]));
    for (const it of items) {
      const p = it.payload as { parentCode: string | null; level: number };
      if (p.parentCode === null) {
        expect(p.level, it.code).toBe(1);
        expect(it.group, it.code).toBe(it.code);
      } else {
        const parent = by.get(p.parentCode);
        expect(parent, `${it.code} → ${p.parentCode}`).toBeTruthy();
        expect(p.level, it.code).toBe((parent!.payload as any).level + 1);
        expect(it.group, it.code).toBe(parent!.group);
      }
    }
    expect(items.filter((i) => (i.payload as any).parentCode === null).length).toBeGreaterThanOrEqual(10);
  });

  it('ô chọn lọc theo khoản mục gốc; kiểm mã đúng / mã lạ có gợi ý', () => {
    const { rows } = selectorRows(lib('core.khoan-muc'), { group: 'CPBT', limit: 500 });
    expect(rows.map((r) => String(r.value))).toContain('CPBT01');
    expect(rows.every((r) => r.group === 'CPBT')).toBe(true);
    expect(validateInLibrary('core.khoan-muc', 'CPBT01')!.ok).toBe(true);
    const bad = validateInLibrary('core.khoan-muc', 'CPBT1')!;
    expect(bad.ok).toBe(false);
    const f = bad.findings.find((x) => x.code === 'LIB-UNKNOWN-001')!;
    expect(f).toBeTruthy();
    expect(f.suggestions.map((s) => String(s.value))).toContain('CPBT01');
  });
});

describe('vn.loai-thue', () => {
  it('thuế suất, chiều và nhóm bảng kê nhất quán với nhau', () => {
    for (const it of lib('vn.loai-thue').items) {
      const p = it.payload as { rate: number; direction: string; reportGroup: string };
      expect(['output', 'input']).toContain(p.direction);
      if (['0', '5', '8', '10'].includes(p.reportGroup)) expect(p.rate, `${it.code} nhóm ${p.reportGroup}`).toBeGreaterThanOrEqual(0);
      if (p.reportGroup === 'KCT' || p.reportGroup === 'KKK') expect(p.rate, it.code).toBe(0);
    }
    expect(validateInLibrary('vn.loai-thue', 'KCT')!.ok).toBe(true);
    expect(validateInLibrary('vn.loai-thue', 'KHONG-CO')!.findings.map((f) => f.code)).toContain('LIB-UNKNOWN-001');
  });
});

describe('core.ly-do-dinh-khoan', () => {
  it('bốn loại thu / chi / nhập / xuất, cờ đúng khuôn, mã dòng tiền hoặc null', () => {
    const items = lib('core.ly-do-dinh-khoan').items;
    expect(new Set(items.map((i) => (i.payload as any).kind))).toEqual(new Set(['receipt', 'payment', 'in', 'out']));
    for (const it of items) {
      const p = it.payload as { cashflowCode: string | null; flags: Record<string, unknown> };
      expect(p.cashflowCode === null || typeof p.cashflowCode === 'string').toBe(true);
      expect(Object.values(p.flags).every((v) => typeof v === 'boolean')).toBe(true);
    }
    expect(validateInLibrary('core.ly-do-dinh-khoan', 'CMH')!.ok).toBe(true);
    expect(validateInLibrary('core.ly-do-dinh-khoan', 'KHONG-CO')!.ok).toBe(false);
  });
});

describe('API', () => {
  let ctx: TestCtx;
  beforeAll(async () => { ctx = await setupTenant(); });
  afterAll(async () => { await ctx.app.close(); });

  it('GET /libraries liệt kê ba thư viện; /items lọc theo nhóm; /validate báo mã lạ', async () => {
    const list = await call(ctx, 'GET', '/api/v1/libraries');
    const ids = (list.body.data.items as any[]).map((x) => x.id);
    for (const id of IDS) expect(ids).toContain(id);
    const items = await call(ctx, 'GET', '/api/v1/libraries/core.khoan-muc/items?group=CPBT');
    expect(items.status).toBe(200);
    expect((items.body.data.rows as any[]).map((r) => String(r.value))).toContain('CPBT01');
    const v = await call(ctx, 'POST', '/api/v1/libraries/vn.loai-thue/validate', { input: 'KHONG-CO' });
    expect(v.status).toBe(200);
    expect(v.body.data.results[0].findings.map((f: any) => f.code)).toContain('LIB-UNKNOWN-001');
  });
});
