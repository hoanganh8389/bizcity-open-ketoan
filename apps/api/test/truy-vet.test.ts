// [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox
/**
 * Truy vết OpenTelemetry (ADR-0010, PHASE-018 W5, ca T018-6). Bộ xuất trong bộ nhớ đi qua ĐÚNG bộ lọc thuộc tính như bản thật
 * (AllowlistExporter), nên điều test thấy là điều rời tiến trình. Kiểm:
 *   - một yêu cầu: HTTP → action của module → cổng Kernel → CSDL nằm trong một trace, nhận traceparent của bên gọi;
 *   - module khoanh được (bizcity.module), từ chối đúng luật không phải sự cố, lỗi kỹ thuật có trạng thái ERROR;
 *   - không lộ dữ liệu: chỉ thuộc tính trong danh sách cho phép, không số tiền / tên / mã đối tượng;
 *   - traceId ở phản hồi lỗi và bằng chứng; outbox: span giao nối (link) về span phát, subscriber lỗi khoanh tới module;
 *   - bộ xuất hỏng không làm hỏng ghi sổ.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InMemorySpanExporter, type ReadableSpan, type SpanExporter } from '@opentelemetry/sdk-trace';
import { z } from 'zod';
import { db } from '../src/db/client.js';
import { defineAction, runAction } from '../src/core/actions.js';
import { defineSubscriber, dispatchOnce, emitEvent, registerSubscribers } from '../src/core/events.js';
import { disableTracing, initTracing, sqlTarget, TRACE_ATTRIBUTES, traced, withSpan } from '../src/core/tracing.js';
import { call, setupTenant, type TestCtx } from './helpers.js';

/** Bộ xuất có thể giả hỏng: 'throw' = ném lỗi khi xuất. */
class FlakyExporter implements SpanExporter {
  mode: 'ok' | 'throw' = 'ok';
  constructor(readonly inner: InMemorySpanExporter) {}
  export(spans: ReadableSpan[], done: Parameters<SpanExporter['export']>[1]): void {
    if (this.mode === 'throw') throw new Error('Collector sập (giả lập)');
    this.inner.export(spans, done);
  }
  shutdown() { return this.inner.shutdown(); }
}

const memory = new InMemorySpanExporter();
const exporter = new FlakyExporter(memory);
let ctx: TestCtx;
let tenantId = '';

const TRACE_ID = '4bf92f3577b34da6a3ce929d0e0e4736';
const spans = () => memory.getFinishedSpans();
const byName = (name: string) => spans().filter((s) => s.name === name);
const one = (name: string) => {
  const s = byName(name);
  expect(s, `span "${name}" — có: ${spans().map((x) => x.name).join(' | ')}`).toHaveLength(1);
  return s[0]!;
};
const body = (over: Record<string, unknown> = {}) => ({ requestDate: '2026-10-12', branchCode: 'CN01', partnerCode: 'NCC-TV', amount: 1234567, debitAccount: '64211', description: 'Chi dịch vụ truy vết', ...over });

beforeAll(async () => {
  initTracing({ exporter });
  ctx = await setupTenant();
  tenantId = (await db.selectFrom('tenants').select('id').where('code', '=', ctx.tenantCode).executeTakeFirstOrThrow()).id;
  await call(ctx, 'PUT', '/api/v1/partners/NCC-TV', { name: 'Công ty Truy Vết Bí Mật', kind: 'supplier' });
});
beforeEach(() => {
  exporter.mode = 'ok';
  memory.reset();
});
afterAll(async () => {
  await ctx.app.close();
  await disableTracing();
});

describe('Truy vết — ADR-0010', () => {
  let paidRequestId = '';

  it('một yêu cầu: HTTP → action của module → cổng Kernel → CSDL cùng một trace, nhận traceparent của bên gọi', async () => {
    const created = await call(ctx, 'POST', '/api/v1/payment-requests', body({ submit: true }));
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    paidRequestId = created.body.data.id;
    expect((await call(ctx, 'POST', `/api/v1/payment-requests/${paidRequestId}/approve`)).body.data.status).toBe('approved');
    memory.reset();

    const paid = await call(ctx, 'POST', `/api/v1/payment-requests/${paidRequestId}/pay`, { docDate: '2026-10-13', moneyAccount: '1111' },
      { traceparent: `00-${TRACE_ID}-00f067aa0ba902b7-01` });
    expect(paid.status, JSON.stringify(paid.body)).toBe(200);

    const http = one('HTTP POST /api/v1/payment-requests/:id/pay');
    const action = one('action quy.payment-request.pay');
    const kernel = one('kernel voucherService.createIn');
    for (const s of [http, action, kernel]) expect(s.spanContext().traceId).toBe(TRACE_ID);
    // Cây span: HTTP ← action ← cổng Kernel ← câu CSDL.
    expect(http.parentSpanContext?.spanId).toBe('00f067aa0ba902b7');
    expect(action.parentSpanContext?.spanId).toBe(http.spanContext().spanId);
    expect(kernel.parentSpanContext?.spanId).toBe(action.spanContext().spanId);
    const dbUnderKernel = spans().filter((s) => s.name.startsWith('db ') && s.parentSpanContext?.spanId === kernel.spanContext().spanId);
    expect(dbUnderKernel.length).toBeGreaterThan(0);
    expect(dbUnderKernel.some((s) => s.attributes['db.collection.name'] === 'ledger_entries')).toBe(true);

    expect(http.attributes).toMatchObject({ 'http.route': '/api/v1/payment-requests/:id/pay', 'http.response.status_code': 200, 'bizcity.tenant': tenantId, 'bizcity.outcome': 'ok' });
    expect(action.attributes).toMatchObject({ 'bizcity.module': 'quy', 'bizcity.action.id': 'quy.payment-request.pay', 'bizcity.idempotency': 'new', 'bizcity.outcome': 'ok' });
    expect(kernel.attributes).toMatchObject({ 'bizcity.layer': 'K', 'bizcity.kernel.op': 'voucherService.createIn', 'bizcity.doc_type': 'payment', 'bizcity.outcome': 'ok' });

    // Bằng chứng mang traceId: từ bằng chứng tra ngược ra trace / log.
    const proof = await db.selectFrom('audit_logs').select('trace_id').where('tenant_id', '=', tenantId).where('action', '=', 'quy.payment-request.pay').executeTakeFirstOrThrow();
    expect(proof.trace_id).toBe(TRACE_ID);
  });

  it('không lộ dữ liệu: mọi thuộc tính trong danh sách cho phép; không số tiền, tên, mã đối tượng, câu SQL', () => {
    // Dùng span của ca trước (bộ nhớ đã reset — chạy lại một lượt đọc để có span).
    return (async () => {
      await call(ctx, 'GET', `/api/v1/payment-requests/${paidRequestId}`);
      expect(spans().length).toBeGreaterThan(0);
      for (const s of spans()) {
        for (const k of Object.keys(s.attributes)) expect(TRACE_ATTRIBUTES.has(k), `${s.name}: ${k}`).toBe(true);
        for (const e of s.events) for (const k of Object.keys(e.attributes ?? {})) expect(TRACE_ATTRIBUTES.has(k), `${s.name}/${e.name}: ${k}`).toBe(true);
        expect(s.status.message).toBeUndefined();
      }
      const dump = JSON.stringify(spans().map((s) => ({ n: s.name, a: s.attributes, e: s.events })));
      // Tên span "db select <bảng>" là hợp lệ; câu SQL thật sẽ có tham số ($1), WHERE, tên cột trong ngoặc kép.
      for (const secret of ['1234567', 'NCC-TV', 'Truy Vết Bí Mật', '$1', ' where ', '\\"tenant_id\\"', 'Bearer']) expect(dump).not.toContain(secret);
    })();
  });

  it('bộ lọc bỏ thuộc tính ngoài danh sách (kể cả của thư viện) trước khi rời tiến trình', async () => {
    await withSpan('step vat.tinh-thue', { attributes: { 'bizcity.module': 'vat', so_tien: 1234567, 'tax.code': '0101234567', 'url.full': 'https://tra-cuu/?mst=0101234567' } }, async () => 1);
    expect(one('step vat.tinh-thue').attributes).toEqual({ 'bizcity.module': 'vat', 'bizcity.outcome': 'ok' });
  });

  it('từ chối đúng luật không phải sự cố: mã lỗi + outcome rejected, không trạng thái ERROR; phản hồi lỗi có traceId', async () => {
    const again = await call(ctx, 'POST', `/api/v1/payment-requests/${paidRequestId}/pay`, { docDate: '2026-10-13', moneyAccount: '1111' });
    expect(again.status).toBe(409);
    const http = one('HTTP POST /api/v1/payment-requests/:id/pay');
    const action = one('action quy.payment-request.pay');
    expect(again.body.error.traceId).toBe(http.spanContext().traceId);
    expect(action.attributes).toMatchObject({ 'bizcity.error.code': again.body.error.code, 'bizcity.outcome': 'rejected' });
    expect(action.status.code).not.toBe(2); // SpanStatusCode.ERROR = 2
    expect(http.attributes).toMatchObject({ 'http.response.status_code': 409, 'bizcity.outcome': 'rejected' });
    expect(http.status.code).not.toBe(2);
  });

  it('lỗi kỹ thuật: trạng thái ERROR, outcome error, sự kiện exception chỉ có loại lỗi (không thông điệp)', async () => {
    await expect(withSpan('step vat.goi-dich-vu', {}, async () => { throw new Error('kết nối dịch vụ thuế hỏng: MST 0101234567'); })).rejects.toThrow(/hỏng/);
    const s = one('step vat.goi-dich-vu');
    expect(s.status.code).toBe(2);
    expect(s.attributes).toMatchObject({ 'bizcity.error.code': 'INTERNAL_ERROR', 'bizcity.outcome': 'error' });
    expect(s.events.map((e) => e.attributes)).toEqual([{ 'exception.type': 'Error' }]);
    expect(JSON.stringify(s)).not.toContain('0101234567');
  });

  it('traced giữ dạng kết quả: hàm đồng bộ vẫn đồng bộ (bọc cổng Kernel không biến hàm thường thành Promise)', () => {
    expect(traced('step x.dong-bo', {}, () => 5)).toBe(5);
    expect(() => traced('step x.nem', {}, () => { throw new Error('x'); })).toThrow('x');
  });

  it('ctx.trace.step: span con của action, mang module; tên bước sai khuôn bị từ chối', async () => {
    const def = defineAction({
      id: 'testvat.tax.compute', title: 'Tính thuế (test truy vết)', permission: 'public', effect: 'read', idempotency: 'none',
      input: z.object({ ten: z.string() }), output: z.number(), expose: {},
      handler: async (c, input) => c.trace.step(input.ten, async () => 7),
    });
    expect((await runAction(def, { ten: 'tinh-thue' }, { auth: undefined, requestId: 'req-truy-vet-1' })).data).toBe(7);
    const action = one('action testvat.tax.compute');
    expect(one('step testvat.tinh-thue')).toMatchObject({ parentSpanContext: expect.objectContaining({ spanId: action.spanContext().spanId }), attributes: { 'bizcity.module': 'testvat', 'bizcity.step': 'tinh-thue', 'bizcity.outcome': 'ok' } });
    await expect(runAction(def, { ten: 'Tính Thuế 10%' }, { auth: undefined, requestId: 'req-truy-vet-2' })).rejects.toThrow(/tên bước/);
  });

  it('outbox: span giao là trace mới, nối (link) về span phát; subscriber lỗi khoanh tới module, subscriber khác vẫn xong', async () => {
    const ok = defineSubscriber({ id: 'testvat.order-tax', module: 'testvat', on: ['testcrm.order.placed'], async handle() {} });
    const fail = defineSubscriber({ id: 'testcrm.order-sync', module: 'testcrm', on: ['testcrm.order.placed'], async handle() { throw new Error('CRM ngoài sập'); } });
    registerSubscribers([ok, fail]);

    const eventId = await withSpan('test yêu cầu gốc', {}, () => db.transaction().execute((trx) => emitEvent(trx, {
      tenantId, type: 'testcrm.order.placed', subject: 'don:1', source: 'testcrm', actor: { kind: 'system', id: 'test' },
    })));
    const publish = one('event publish testcrm.order.placed');
    expect(publish.attributes).toMatchObject({ 'bizcity.event.type': 'testcrm.order.placed', 'bizcity.module': 'testcrm' });
    const row = await db.selectFrom('event_outbox').select('trace_parent').where('id', '=', eventId!).executeTakeFirstOrThrow();
    expect(row.trace_parent).toBe(`00-${publish.spanContext().traceId}-${publish.spanContext().spanId}-01`);

    await dispatchOnce({ consumers: ['testvat.order-tax', 'testcrm.order-sync'], tenantId });
    const okSpan = one('event deliver testcrm.order.placed → testvat.order-tax');
    const failSpan = one('event deliver testcrm.order.placed → testcrm.order-sync');
    for (const s of [okSpan, failSpan]) {
      expect(s.spanContext().traceId).not.toBe(publish.spanContext().traceId);
      expect(s.links.map((l) => l.context.spanId)).toEqual([publish.spanContext().spanId]);
    }
    expect(okSpan.attributes).toMatchObject({ 'bizcity.module': 'testvat', 'bizcity.delivery.result': 'done', 'bizcity.outcome': 'ok' });
    expect(failSpan.attributes).toMatchObject({ 'bizcity.module': 'testcrm', 'bizcity.delivery.result': 'retry', 'bizcity.delivery.attempt': 1, 'bizcity.outcome': 'error' });
    expect(failSpan.status.code).toBe(2);
  });

  it('phát sự kiện ngoài yêu cầu (đồng hồ, việc nền) không sinh span rác; vẫn ghi sự kiện', async () => {
    const id = await db.transaction().execute((trx) => emitEvent(trx, { tenantId, type: 'testcrm.order.placed', subject: 'don:2', source: 'testcrm', actor: { kind: 'system', id: 'clock' } }));
    expect(id).toBeTruthy();
    expect(byName('event publish testcrm.order.placed')).toHaveLength(0);
    expect((await db.selectFrom('event_outbox').select('trace_parent').where('id', '=', id!).executeTakeFirstOrThrow()).trace_parent).toBeNull();
  });

  it('bộ xuất hỏng (Collector sập) không làm hỏng ghi sổ', async () => {
    exporter.mode = 'throw';
    const res = await call(ctx, 'POST', '/api/v1/payment-requests', body({ description: 'Collector sập vẫn lập được' }));
    expect(res.status, JSON.stringify(res.body)).toBe(201);
  });

  it('span CSDL chỉ có loại câu + bảng (định danh), không câu SQL', () => {
    expect(sqlTarget('insert into "audit_logs" ("tenant_id") values ($1)')).toEqual({ op: 'insert', table: 'audit_logs' });
    expect(sqlTarget('update "event_deliveries" set "status" = $1')).toEqual({ op: 'update', table: 'event_deliveries' });
    expect(sqlTarget('select "x" from "bizcity_read"."ledger_lines" where a = $1')).toEqual({ op: 'select', table: 'bizcity_read.ledger_lines' });
    expect(sqlTarget('SELECT set_config($1, $2, false)')).toEqual({ op: 'select' });
    expect(sqlTarget('DO $$ BEGIN END $$')).toEqual({ op: 'other' });
  });
});
