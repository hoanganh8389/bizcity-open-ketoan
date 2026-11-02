// @bizcity-layer K kernel/conformance
// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — action Kiểm chuẩn: core.conformance.run (chạy + lưu ảnh chụp, quyền conformance:run, AI không dùng) và core.conformance.latest (đọc, AI đọc được) (ADR-0012, S020-18).
// [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-20 / S020-21: core.conformance.list (xu hướng), core.conformance.advisories (Posting Gate chỉ thông tin), core.conformance.acknowledge (người xác nhận tiếp tục = bằng chứng; AI / khoá API không xác nhận thay, T3); ca mang layer, title, rulepack, căn cứ; lượt có layerResults.
/**
 * Conformance Engine (ADR-0012) — action:
 *   POST /api/v1/conformance/runs              core.conformance.run          — chạy một lượt ba lớp cho đơn vị, lưu ảnh chụp
 *   GET  /api/v1/conformance/runs/latest       core.conformance.latest       — lượt gần nhất (null = chưa chạy); MCP đọc được
 *   GET  /api/v1/conformance/runs              core.conformance.list         — các lượt gần đây (kết quả theo lớp) cho xu hướng
 *   GET  /api/v1/conformance/advisories        core.conformance.advisories   — cảnh báo cho ngày chứng từ (?date) hoặc kỳ sắp khoá (?year&month)
 *   POST /api/v1/conformance/advisories/ack    core.conformance.acknowledge  — người dùng đã xem cảnh báo và tiếp tục: một dòng bằng chứng
 * Lượt chạy chỉ đọc sổ và cấu hình. Không có action nào sửa / bỏ qua / tắt kết luận; cảnh báo không bao giờ thành từ chối (R-VNC-10).
 */
import { z } from 'zod';
import { defineAction, type AnyActionDef } from '@bizcity/platform/core/actions';
import { Errors } from '@bizcity/platform/core/errors';
import { ymd } from '../posting-config/profile.js';
import { latestRun, listRuns, runConformance, type ConformanceRunRow } from './conformance.service.js';
import { advisoriesFor } from './conformance.advisories.js';

const tags = ['Kiểm chuẩn'];
const result = z.enum(['PASS', 'FAIL', 'REVIEW_REQUIRED']);
const layerResults = z.record(result).describe('Kết quả riêng của từng lớp được đánh giá: module · configuration · enterprise (ADR-0012, ba câu hỏi)');
const caseSchema = z.object({
  id: z.string(), version: z.string(), priority: z.string(),
  status: z.enum(['PASS', 'FAIL', 'ERROR', 'NOT_APPLICABLE', 'NOT_TESTED', 'REVIEW_REQUIRED']),
  reason: z.string(), evidence: z.array(z.string()), legal_basis_ids: z.array(z.string()), evaluated_at: z.string().optional(),
  layer: z.enum(['module', 'configuration', 'enterprise']).nullable().optional(),
  title: z.string().nullable().optional(),
  rulepack: z.string().optional(),
  legal_basis: z.array(z.object({ source_id: z.string(), label: z.string(), provision_ref: z.string().nullable(), review_status: z.string() })).optional(),
});
const runSchema = z.object({
  id: z.string(),
  asOf: z.string(),
  result: result.describe('REVIEW_REQUIRED và NOT_TESTED không bao giờ tính là PASS'),
  layerResults,
  label: z.string().describe('Nhãn duy nhất được công bố: Passed Bizcity VN Conformance [...] — không phải chứng nhận nhà nước'),
  counts: z.record(z.number()),
  profileVersion: z.number().nullable().describe('Phiên bản hồ sơ kế toán đã dùng; null = đơn vị chưa khai'),
  kitVersion: z.string().nullable(),
  kitHash: z.string(),
  rulepacks: z.array(z.object({ id: z.string(), version: z.string(), status: z.string() })),
  cases: z.array(caseSchema),
  knownExclusions: z.array(z.object({ scope: z.string(), reason: z.string() })),
  disclaimer: z.string(),
  actor: z.string(),
  createdAt: z.string(),
});
type Report = {
  label: string; layer_results?: Record<string, z.infer<typeof result>>; cases: z.infer<typeof caseSchema>[];
  rulepacks: { id: string; version: string; status: string }[]; known_exclusions: { scope: string; reason: string }[]; disclaimer: string;
};
const json = <T>(v: unknown): T => (typeof v === 'string' ? JSON.parse(v) : v) as T;
const view = (r: ConformanceRunRow) => {
  const rep = json<Report>(r.report);
  return {
    id: String(r.id), asOf: ymd(r.as_of), result: r.result, layerResults: rep.layer_results ?? {}, label: rep.label,
    counts: json<Record<string, number>>(r.counts),
    profileVersion: r.profile_version, kitVersion: r.kit_version, kitHash: r.kit_hash,
    rulepacks: (rep.rulepacks ?? []).map((p) => ({ id: p.id, version: p.version, status: p.status })),
    cases: rep.cases, knownExclusions: rep.known_exclusions, disclaimer: rep.disclaimer,
    actor: r.actor, createdAt: new Date(r.created_at).toISOString(),
  };
};
const today = () => ymd(new Date());
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD');
const advisory = z.object({ code: z.string(), title: z.string(), why: z.string(), count: z.number(), sample: z.array(z.string()) });

/** Chi nhánh theo mã (tuỳ chọn) — cảnh báo kỳ theo chi nhánh khi khoá theo chi nhánh. */
async function branchIdOf(tx: Parameters<typeof latestRun>[0], tenantId: string, code: string | undefined): Promise<string | undefined> {
  if (!code) return undefined;
  const b = await tx.selectFrom('branches').select('id').where('tenant_id', '=', tenantId).where('code', '=', code).executeTakeFirst();
  if (!b) throw Errors.notFound(`chi nhánh ${code}`);
  return b.id;
}

export const conformanceActions: AnyActionDef[] = [
  defineAction({
    id: 'core.conformance.run', title: 'Chạy Kiểm chuẩn', tags,
    description: 'Đánh giá đơn vị theo bộ quy định có hiệu lực tại ngày chọn (mặc định hôm nay), ba lớp: Module (bất biến sổ trên dữ liệu của đơn vị), '
      + 'Cấu hình (hồ sơ kế toán, gói định khoản), Doanh nghiệp (trạng thái theo kỳ). Chỉ đọc sổ; lưu ảnh chụp kết quả. Kết luận để người dùng quyết định, không chặn ghi sổ.',
    permission: 'conformance:run', effect: 'write', idempotency: 'required', sideEffects: ['analysis'],
    input: z.object({ asOf: date.optional() }),
    output: runSchema,
    expose: { http: { method: 'POST', path: '/api/v1/conformance/runs', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'conformance_run', objectId: (_i, o) => o.id },
    handler: async (ctx, input) => view(await runConformance(ctx.data.tx, ctx.tenant.id, { asOf: input.asOf ?? today(), actor: ctx.actor.id })),
  }),
  defineAction({
    id: 'core.conformance.latest', title: 'Kết quả Kiểm chuẩn gần nhất', tags,
    description: 'Lượt Kiểm chuẩn gần nhất của đơn vị: kết quả chung và theo lớp, số ca theo trạng thái, từng ca kèm căn cứ, lý do, bằng chứng. null = chưa chạy lượt nào.',
    permission: 'conformance:read', effect: 'read', idempotency: 'none',
    input: z.object({}),
    output: runSchema.nullable(),
    expose: { http: { method: 'GET', path: '/api/v1/conformance/runs/latest' }, mcp: true, ai: 'read' },
    handler: async (ctx) => { const r = await latestRun(ctx.data.tx, ctx.tenant.id); return r ? view(r) : null; },
  }),
  defineAction({
    id: 'core.conformance.list', title: 'Các lượt Kiểm chuẩn gần đây', tags,
    description: 'Tối đa `limit` lượt gần nhất (mới trước): ngày đánh giá, kết quả chung và theo lớp, số ca theo trạng thái, ai / lịch nào chạy. Dùng cho xu hướng; không có báo cáo đầy đủ.',
    permission: 'conformance:read', effect: 'read', idempotency: 'none',
    input: z.object({ limit: z.coerce.number().int().min(1).max(60).optional() }),
    output: z.array(z.object({ id: z.string(), asOf: z.string(), result, layerResults, counts: z.record(z.number()), actor: z.string(), createdAt: z.string() })),
    expose: { http: { method: 'GET', path: '/api/v1/conformance/runs' }, mcp: false, ai: 'read' },
    handler: async (ctx, input) => (await listRuns(ctx.data.tx, ctx.tenant.id, input.limit ?? 12)).map((r) => ({
      id: String(r.id), asOf: ymd(r.as_of), result: r.result, layerResults: json<Record<string, z.infer<typeof result>>>(r.layer_results ?? {}),
      counts: json<Record<string, number>>(r.counts), actor: r.actor, createdAt: new Date(r.created_at).toISOString(),
    })),
  }),
  defineAction({
    id: 'core.conformance.advisories', title: 'Cảnh báo kiểm chuẩn (chỉ thông tin)', tags,
    description: 'Posting Gate chỉ thông tin (ADR-0012 T3, T4): cảnh báo cho chứng từ có ngày `date` (hồ sơ kế toán, gói định khoản áp cho ngày đó), '
      + 'hoặc cho kỳ `year` + `month` sắp khoá (thêm hoá đơn đầu vào chờ, sự việc treo, tồn kho âm, việc cuối kỳ chưa xong của đúng tháng đó). '
      + 'Tính ngoài giao dịch ghi sổ, chỉ đọc. Không chặn gì: người dùng đọc "Vì sao" rồi tự quyết tiếp hay dừng.',
    permission: 'documents:read', effect: 'read', idempotency: 'none',
    input: z.object({
      date: date.optional(),
      year: z.coerce.number().int().min(2000).max(2100).optional(),
      month: z.coerce.number().int().min(1).max(12).optional(),
      branchCode: z.string().max(32).optional(),
    }),
    output: z.object({
      context: z.object({ kind: z.enum(['document', 'period']), date: z.string().optional(), year: z.number().optional(), month: z.number().optional(), branchCode: z.string().optional() }),
      advisories: z.array(advisory),
      latestRun: z.object({ id: z.string(), result, createdAt: z.string() }).nullable(),
    }),
    expose: { http: { method: 'GET', path: '/api/v1/conformance/advisories' }, mcp: true, ai: 'read' },
    handler: async (ctx, input) => {
      if (input.year != null || input.month != null) {
        if (input.year == null || input.month == null) throw Errors.validation('Cảnh báo kỳ cần cả year và month');
        const branchId = await branchIdOf(ctx.data.tx, ctx.tenant.id, input.branchCode);
        const r = await advisoriesFor(ctx.data.tx, ctx.tenant.id, { kind: 'period', year: input.year, month: input.month, branchId });
        return { context: { kind: 'period' as const, year: input.year, month: input.month, branchCode: input.branchCode }, ...r };
      }
      const d = input.date ?? today();
      return { context: { kind: 'document' as const, date: d }, ...(await advisoriesFor(ctx.data.tx, ctx.tenant.id, { kind: 'document', date: d })) };
    },
  }),
  defineAction({
    id: 'core.conformance.acknowledge', title: 'Xác nhận đã xem cảnh báo kiểm chuẩn', tags,
    description: 'Người dùng đã xem cảnh báo và quyết định tiếp tục (ghi chứng từ, hoặc khoá kỳ): ghi một dòng bằng chứng gồm người, mã cảnh báo, '
      + 'chứng từ / kỳ, thời điểm (ADR-0012 T3). Không đổi sổ, không đổi cấu hình, không tắt cảnh báo. Chỉ người đăng nhập xác nhận được: '
      + 'khoá API và AI không xác nhận thay. Khoá kỳ còn cảnh báo thì cần quyền khoá kỳ và ghi lý do (ít nhất 10 ký tự).',
    permission: 'documents:write', effect: 'write', idempotency: 'required', sideEffects: ['analysis'],
    input: z.object({
      context: z.discriminatedUnion('kind', [
        z.object({ kind: z.literal('document'), docType: z.string().min(1).max(40), docDate: date, docKey: z.string().max(200).optional(), docNo: z.string().max(60).optional() }),
        z.object({ kind: z.literal('period'), year: z.number().int().min(2000).max(2100), month: z.number().int().min(1).max(12), branchCode: z.string().max(32).optional() }),
      ]),
      codes: z.array(z.string().min(1).max(60)).min(1).max(30),
      note: z.string().trim().max(500).optional(),
    }),
    output: z.object({ acknowledged: z.literal(true), codes: z.array(z.string()), context: z.string() }),
    expose: { http: { method: 'POST', path: '/api/v1/conformance/advisories/ack' }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'conformance_advisory', objectId: (_i, o) => o.context },
    handler: async (ctx, input) => {
      if (ctx.actor.kind !== 'user') throw Errors.forbidden('Chỉ người đăng nhập xác nhận được cảnh báo; khoá API / AI không xác nhận thay (ADR-0012 T3)');
      const c = input.context;
      if (c.kind === 'period') {
        if (!ctx.can('periods:lock')) throw Errors.forbidden('Xác nhận cảnh báo trước khoá kỳ cần quyền khoá kỳ');
        if (!input.note || input.note.length < 10) throw Errors.validation('Khoá kỳ còn cảnh báo: ghi lý do (ít nhất 10 ký tự)');
      }
      const key = c.kind === 'period'
        ? `period:${c.year}-${String(c.month).padStart(2, '0')}${c.branchCode ? `:${c.branchCode}` : ''}`
        : `document:${c.docType}:${c.docKey ?? c.docNo ?? c.docDate}`;
      const codes = [...new Set(input.codes)].sort();
      ctx.evidence.note('codes', codes);
      ctx.evidence.note('context', c);
      if (input.note) ctx.evidence.note('note', input.note);
      return { acknowledged: true as const, codes, context: key };
    },
  }),
];
