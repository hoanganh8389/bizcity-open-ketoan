// [2026-11-01 12:04 AM Johnny Chu - Chu Hoàng Anh] PHASE-018 — test số đo giám sát: ghi sổ đã commit, phân loại lỗi, gửi lặp, outbox, đối soát, đơn vị theo dải, ngân sách nhãn, trần thời gian bộ thu
/**
 * Giám sát vận hành (PHASE-018, docs/phases/PHASE-018-GIAM-SAT-VAN-HANH/20-KIEN-TRUC.md §2, §7). Số đếm dùng "tăng ít nhất"
 * vì các tệp test khác chạy song song trên cùng CSDL cũng ghi sổ.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { db, readWithTimeout } from '../src/db/client.js';
import { collect, renderMetrics } from '../src/core/metrics.js';
import { collectOutboxMetrics } from '../src/core/events.js';
import { collectPostingMetrics, collectTenantMetrics, failureKind, resetPostingWatermark, tenantBand } from '../src/modules/documents/posting.metrics.js';
import { call, saleDoc, setupTenant, type TestCtx } from './helpers.js';

let ctx: TestCtx;

/** Giá trị một dòng số đo trong văn bản Prometheus (khớp đủ tên + nhãn); không có dòng → undefined. */
function value(text: string, series: string): number | undefined {
  const line = text.split('\n').find((l) => l.startsWith(`${series} `));
  return line === undefined ? undefined : Number(line.slice(series.length + 1));
}

beforeAll(async () => {
  ctx = await setupTenant();
  await call(ctx, 'PUT', '/api/v1/partners/NCC-GS', { name: 'Nhà cung cấp giám sát', kind: 'supplier' });
});
afterAll(async () => {
  await ctx.app.close();
});

describe('Giám sát — PHASE-018', () => {
  it('ghi sổ: chỉ đếm dòng posting_log đã commit, theo loại chứng từ + hành động; lần đầu không đếm lịch sử', async () => {
    resetPostingWatermark();
    await collectPostingMetrics(0); // lần đầu: chỉ đặt mốc
    const before = value(renderMetrics(), 'bizcity_postings_total{doc_type="sale",action="post"}') ?? 0;

    expect((await call(ctx, 'POST', '/api/v1/documents', saleDoc())).body.data.status).toBe('posted');
    await collectPostingMetrics(0);
    const after = value(renderMetrics(), 'bizcity_postings_total{doc_type="sale",action="post"}') ?? 0;
    expect(after - before).toBeGreaterThanOrEqual(1);
  });

  it('ghi sổ: dòng mới hơn độ trễ chưa được đếm (giao dịch commit muộn không bị bỏ sót vì mốc đã vượt)', async () => {
    await collectPostingMetrics(0);
    const before = value(renderMetrics(), 'bizcity_postings_total{doc_type="sale",action="post"}') ?? 0;
    expect((await call(ctx, 'POST', '/api/v1/documents', saleDoc({ docKey: 'GS-TRE-1', docNo: 'GS-TRE-1' }))).body.data.status).toBe('posted');
    await collectPostingMetrics(3600);
    expect(value(renderMetrics(), 'bizcity_postings_total{doc_type="sale",action="post"}') ?? 0).toBe(before);
    await collectPostingMetrics(0);
    expect((value(renderMetrics(), 'bizcity_postings_total{doc_type="sale",action="post"}') ?? 0) - before).toBeGreaterThanOrEqual(1);
  });

  it('phân loại lỗi định khoản theo danh mục mã lỗi: nghiệp vụ = rejected, kỹ thuật / lạ = error', () => {
    expect(failureKind('PERIOD_LOCKED')).toBe('rejected');
    expect(failureKind('UNBALANCED_ENTRY')).toBe('rejected');
    expect(failureKind('POSTING_FAILED')).toBe('rejected');
    expect(failureKind('VALIDATION_ERROR')).toBe('rejected');
    expect(failureKind('INTERNAL_ERROR')).toBe('error');
    expect(failureKind('NOT_READY')).toBe('error');
    expect(failureKind('KHONG_CO_MA_NAY')).toBe('error');
    expect(failureKind(null)).toBe('error');
  });

  it('gửi lặp: cùng khoá cùng nội dung → replayed; cùng khoá khác nội dung → conflict', async () => {
    const send = (amount: number) => ctx.app.inject({
      method: 'POST', url: '/api/v1/payment-requests',
      payload: { requestDate: '2026-10-12', branchCode: 'CN01', partnerCode: 'NCC-GS', amount, debitAccount: '64211', description: 'Giám sát' },
      headers: { authorization: `Bearer ${ctx.token}`, 'idempotency-key': 'giam-sat-khoa-0001' },
    });
    const v = (r: string) => value(renderMetrics(), `bizcity_idempotency_requests_total{result="${r}"}`) ?? 0;
    const [n0, r0, c0] = [v('new'), v('replayed'), v('conflict')];
    expect((await send(1_000_000)).statusCode).toBeLessThan(300);
    expect((await send(1_000_000)).statusCode).toBeLessThan(300);
    expect((await send(2_000_000)).statusCode).toBe(409);
    expect(v('new') - n0).toBe(1);
    expect(v('replayed') - r0).toBe(1);
    expect(v('conflict') - c0).toBe(1);
  });

  it('outbox: có số việc chờ / chết và tuổi chờ lâu nhất (0 khi không có việc chờ, không bỏ trống)', async () => {
    await collectOutboxMetrics();
    const text = renderMetrics();
    expect(value(text, 'bizcity_outbox_deliveries{status="pending"}')).toBeGreaterThanOrEqual(0);
    expect(value(text, 'bizcity_outbox_deliveries{status="dead"}')).toBeGreaterThanOrEqual(0);
    expect(value(text, 'bizcity_outbox_oldest_pending_seconds')).toBeGreaterThanOrEqual(0);
  });

  it('đối soát: sau một lượt L3 có mốc chạy gần nhất + số kiểm theo kết quả; /metrics có trần pool', async () => {
    expect((await call(ctx, 'GET', '/api/v1/system/diagnostics')).status).toBe(200);
    const res = await ctx.app.inject({ method: 'GET', url: '/metrics' });
    expect(res.statusCode).toBe(200);
    const lastRun = value(res.body, 'bizcity_diagnostics_last_run_timestamp_seconds{layer="L3"}');
    expect(lastRun).toBeGreaterThan(Date.now() / 1000 - 3600);
    expect(value(res.body, 'bizcity_diagnostics_checks{layer="L3",result="pass"}')).toBeGreaterThan(0);
    expect(value(res.body, 'bizcity_db_pool_max')).toBeGreaterThan(0);
  });

  it('đơn vị theo dải: tổng các dải = số đơn vị; không lộ đơn vị nào', async () => {
    expect([0, 1, 100, 101, 1000, 1001].map(tenantBand)).toEqual(['idle', 'small', 'small', 'medium', 'medium', 'large']);
    await collectTenantMetrics();
    const text = renderMetrics();
    const total = Number((await sql<{ n: string }>`SELECT count(*)::text AS n FROM tenants`.execute(db)).rows[0]!.n);
    const sum = ['idle', 'small', 'medium', 'large'].reduce((s, b) => s + (value(text, `bizcity_tenants{band="${b}"}`) ?? 0), 0);
    // Tệp test khác có thể tạo đơn vị giữa hai câu đếm: chênh tối đa vài đơn vị.
    expect(Math.abs(sum - total)).toBeLessThanOrEqual(5);
    expect(value(text, 'bizcity_tenants_with_backlog')).toBeGreaterThanOrEqual(0);
  });

  it('ngân sách nhãn (R-OBS-4): không số đo nào có nhãn theo đơn vị / chứng từ / người / yêu cầu', async () => {
    await collect();
    const text = (await ctx.app.inject({ method: 'GET', url: '/metrics' })).body;
    const forbidden = /^(tenant|tenant_id|tenantid|dockey|doc_key|doc_no|reqid|request_id|requestid|actor|user|user_id|userid|event_id|eventid|entry_id|entryid|trace_id|traceid)$/i;
    const names = new Set<string>();
    for (const line of text.split('\n')) {
      const m = /^[a-z_:]+\{(.*)\} /.exec(line);
      if (!m) continue;
      for (const pair of m[1]!.matchAll(/([a-zA-Z_]+)="/g)) names.add(pair[1]!);
    }
    expect([...names].filter((n) => forbidden.test(n))).toEqual([]);
  });

  it('bộ thu: câu đếm quá trần thời gian bị CSDL huỷ; giao dịch bộ thu chỉ đọc', async () => {
    await expect(readWithTimeout(50, (tx) => sql`SELECT pg_sleep(1)`.execute(tx))).rejects.toThrow(/statement timeout|canceling statement/i);
    await expect(readWithTimeout(1000, (tx) => sql`CREATE TEMP TABLE gs_khong_duoc_ghi (x int)`.execute(tx))).rejects.toThrow(/read-only/i);
  });
});
