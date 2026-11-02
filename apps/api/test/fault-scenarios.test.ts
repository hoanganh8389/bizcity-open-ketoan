/**
 * PHASE-022 W3 — bộ chạy giả định lỗi (R-FIX-5). Đọc danh mục ca F22 (packages/kernel/src/modules/review/fault-catalog.json) và bằng chứng
 * (tests/conformance/scenarios/f22-evidence.json):
 *   test     — tệp vitest có thật và nhắc mã phát hiện / từ khoá của ca (ca đã được chứng minh ở test riêng)
 *   lane     — kiểm có ở lane diagnostics của bộ kiểm (chưa có kiểm trong app)
 *   design   — xử lý theo thiết kế, có ghi chú (+ test nếu có)
 *   recipe   — công thức chạy ở đây trên đơn vị test riêng: gây lỗi → phát hiện đúng mã (hoặc bị chặn đúng mã) → chạy phương án → kiểm lại
 *   planned  — chưa làm, có lý do; không làm đỏ bảng điểm
 * Ghi tests/conformance/output/latest/scenario-board.json cho bảng điểm checklist.
 */
import { afterAll, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'kysely';
import { db } from '../src/db/client.js';
import { runDiagnostics } from '../src/modules/system/diagnostics.js';
import { setupTenant, type TestCtx } from './helpers.js';

const ROOT = path.resolve(__dirname, '../../..');
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'packages/kernel/src/modules/review/fault-catalog.json'), 'utf8')) as {
  cases: { id: string; group: string; title: string; detectors: string[]; status: string; level: string; personas: string[] }[];
};
type Step = { http?: string; body?: unknown; headers?: Record<string, string>; expectStatus?: number; expectCode?: string; sql?: string; expectError?: string;
  diag?: string; layer?: 'L1' | 'L3' | 'L5'; level?: string; count?: number; sampleMatch?: string };
type Evidence = { kind: 'test' | 'lane' | 'design' | 'recipe' | 'planned'; test?: string; alsoTest?: string; mentions?: string; lane?: string; code?: string; note?: string; reason?: string;
  inject?: Step[]; expect?: Step[]; fix?: Step[]; afterFix?: Step[] };
const evidence = JSON.parse(fs.readFileSync(path.join(ROOT, 'tests/conformance/scenarios/f22-evidence.json'), 'utf8')).cases as Record<string, Evidence>;
const board: Record<string, { result: 'pass' | 'fail' | 'planned'; kind: string; note?: string }> = {};
const read = (rel: string) => { try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch { return null; } };

afterAll(() => {
  const out = path.join(ROOT, 'tests/conformance/output/latest');
  fs.mkdirSync(out, { recursive: true });
  const cases = catalog.cases.map((c) => ({ id: c.id, group: c.group, title: c.title, level: c.level, personas: c.personas, status: c.status, ...(board[c.id] ?? { result: 'fail', kind: evidence[c.id]?.kind ?? 'missing', note: 'chưa chạy' }) }));
  const sum = cases.reduce((a, c) => ((a[c.result] = (a[c.result] ?? 0) + 1), a), {} as Record<string, number>);
  fs.writeFileSync(path.join(out, 'scenario-board.json'), JSON.stringify({ contract: 'bizcity_scenario_board@1', at: new Date().toISOString(), summary: sum, cases }, null, 2));
});

describe('Danh mục ↔ bằng chứng', () => {
  it('mọi ca có bằng chứng khai báo; ca ✔ / 🛡 không được để "planned"', () => {
    for (const c of catalog.cases) {
      const e = evidence[c.id];
      expect(e, c.id).toBeTruthy();
      if (['done', 'blocked'].includes(c.status)) expect(e!.kind, c.id).not.toBe('planned');
      if (e!.kind === 'planned') { expect(e!.reason, c.id).toBeTruthy(); board[c.id] = { result: 'planned', kind: 'planned', note: e!.reason }; }
    }
    expect(Object.keys(evidence).filter((id) => !catalog.cases.some((c) => c.id === id))).toEqual([]);
  });

  it('ca "test" / "design": tệp test có thật và nhắc mã phát hiện hoặc từ khoá của ca', () => {
    for (const c of catalog.cases) {
      const e = evidence[c.id]!;
      const file = e.kind === 'test' || e.kind === 'design' ? e.test : e.kind === 'recipe' ? e.alsoTest : undefined;
      if (!file) { if (e.kind === 'design') board[c.id] = { result: 'pass', kind: 'design', note: e.note }; continue; }
      const text = read(`apps/api/test/${file}`);
      expect(text, `${c.id}: thiếu apps/api/test/${file}`).not.toBeNull();
      const needles = e.mentions ? [new RegExp(e.mentions)] : c.detectors.map((d) => new RegExp(`\\b${d}\\b`));
      const ok = !needles.length || needles.some((re) => re.test(text!));
      expect(ok, `${c.id}: ${file} không nhắc ${e.mentions ?? c.detectors.join(', ')}`).toBe(true);
      if (e.kind !== 'recipe') board[c.id] = { result: 'pass', kind: e.kind, note: file };
    }
  });

  it('ca "lane": kiểm có ở lane diagnostics', () => {
    for (const c of catalog.cases) {
      const e = evidence[c.id]!;
      if (e.kind !== 'lane') continue;
      const text = read(`tests/conformance/diagnostics/${e.lane}`);
      expect(text && new RegExp(`code: '${e.code}'`).test(text), `${c.id}: ${e.lane} không có ${e.code}`).toBe(true);
      board[c.id] = { result: 'pass', kind: 'lane', note: `${e.lane} · ${e.code}` };
    }
  });
});

describe('Công thức gây lỗi', () => {
  for (const c of catalog.cases.filter((x) => evidence[x.id]?.kind === 'recipe')) {
    it(`${c.id} — ${c.title}`, async () => {
      const e = evidence[c.id]!;
      const ctx: TestCtx = await setupTenant();
      try {
        const tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
        const run = async (steps: Step[] | undefined, phase: string) => {
          for (const s of steps ?? []) {
            if (s.http) {
              const [method, url] = s.http.split(' ') as ['GET' | 'POST' | 'PUT', string];
              const res = await ctx.app.inject({ method, url, payload: s.body as never, headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': `f22-${Math.random()}`, ...s.headers } });
              const body = res.json() as { data?: { status?: string }; error?: { code?: string } };
              if (s.expectCode) expect(body.error?.code ?? (body.data as { error?: { code?: string } } | undefined)?.error?.code, `${c.id} ${phase}: ${s.http} → ${res.body}`).toBe(s.expectCode);
              else {
                expect(res.statusCode, `${c.id} ${phase}: ${s.http} → ${res.body}`).toBe(s.expectStatus ?? 200);
                if (body.data?.status) expect(body.data.status, `${c.id} ${phase}: ${res.body}`).not.toBe('error');
              }
            } else if (s.sql) {
              const q = s.sql.replace('$TENANT', String(Number(tenantId)));
              await expect(sql.raw(q).execute(db), `${c.id} ${phase}: ${q}`).rejects.toThrow(new RegExp(s.expectError ?? '.', 'i'));
            } else if (s.diag) {
              const r = (await runDiagnostics({ tenantId }, { layer: s.layer ?? 'L3', codes: [s.diag] })).checks[0]!;
              if (s.level) expect(r.level, `${c.id} ${phase}: ${s.diag} ${JSON.stringify(r.sample)}`).toBe(s.level);
              if (s.count != null) expect(r.count, `${c.id} ${phase}: ${s.diag} ${JSON.stringify(r.sample)}`).toBe(s.count);
              if (s.sampleMatch) expect(r.sample.some((x) => new RegExp(s.sampleMatch!).test(x)), `${c.id} ${phase}: ${JSON.stringify(r.sample)}`).toBe(true);
            }
          }
        };
        await run(e.inject, 'gây lỗi');
        await run(e.expect, 'phát hiện');
        await run(e.fix, 'khắc phục');
        await run(e.afterFix, 'kiểm lại');
        board[c.id] = { result: 'pass', kind: 'recipe', note: e.fix?.length ? 'phát hiện + khắc phục' : 'chặn đúng' };
      } catch (err) {
        board[c.id] = { result: 'fail', kind: 'recipe', note: String((err as Error).message).slice(0, 300) };
        throw err;
      } finally {
        await ctx.app.close();
      }
    });
  }
});
