// @bizcity-layer K kernel/conformance
// [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — action Kiểm chuẩn: core.conformance.run (chạy + lưu ảnh chụp, quyền conformance:run, AI không dùng) và core.conformance.latest (đọc, AI đọc được) (ADR-0012, S020-18).
/**
 * Conformance Engine (ADR-0012) — action:
 *   POST /api/v1/conformance/runs         core.conformance.run     — chạy một lượt lớp Module + Cấu hình cho đơn vị, lưu ảnh chụp
 *   GET  /api/v1/conformance/runs/latest  core.conformance.latest  — lượt gần nhất (null = chưa chạy)
 * Lượt chạy chỉ đọc sổ và cấu hình; chỉ thêm một dòng conformance_runs, có bằng chứng. Không có action nào sửa / bỏ qua kết luận.
 */
import { z } from 'zod';
import { defineAction, type AnyActionDef } from '@bizcity/platform/core/actions';
import { ymd } from '../posting-config/profile.js';
import { latestRun, runConformance, type ConformanceRunRow } from './conformance.service.js';

const tags = ['Kiểm chuẩn'];
const caseSchema = z.object({
  id: z.string(), version: z.string(), priority: z.string(),
  status: z.enum(['PASS', 'FAIL', 'ERROR', 'NOT_APPLICABLE', 'NOT_TESTED', 'REVIEW_REQUIRED']),
  reason: z.string(), evidence: z.array(z.string()), legal_basis_ids: z.array(z.string()), evaluated_at: z.string().optional(),
});
const runSchema = z.object({
  id: z.string(),
  asOf: z.string(),
  result: z.enum(['PASS', 'FAIL', 'REVIEW_REQUIRED']).describe('REVIEW_REQUIRED và NOT_TESTED không bao giờ tính là PASS'),
  label: z.string().describe('Nhãn duy nhất được công bố: Passed Bizcity VN Conformance [...] — không phải chứng nhận nhà nước'),
  counts: z.record(z.number()),
  profileVersion: z.number().nullable().describe('Phiên bản hồ sơ kế toán đã dùng; null = đơn vị chưa khai'),
  kitVersion: z.string().nullable(),
  kitHash: z.string(),
  cases: z.array(caseSchema),
  knownExclusions: z.array(z.object({ scope: z.string(), reason: z.string() })),
  disclaimer: z.string(),
  actor: z.string(),
  createdAt: z.string(),
});
type Report = { label: string; cases: z.infer<typeof caseSchema>[]; known_exclusions: { scope: string; reason: string }[]; disclaimer: string };
const view = (r: ConformanceRunRow) => {
  const rep = (typeof r.report === 'string' ? JSON.parse(r.report) : r.report) as Report;
  return {
    id: String(r.id), asOf: ymd(r.as_of), result: r.result, label: rep.label,
    counts: (typeof r.counts === 'string' ? JSON.parse(r.counts) : r.counts) as Record<string, number>,
    profileVersion: r.profile_version, kitVersion: r.kit_version, kitHash: r.kit_hash,
    cases: rep.cases, knownExclusions: rep.known_exclusions, disclaimer: rep.disclaimer,
    actor: r.actor, createdAt: new Date(r.created_at).toISOString(),
  };
};
const today = () => ymd(new Date());

export const conformanceActions: AnyActionDef[] = [
  defineAction({
    id: 'core.conformance.run', title: 'Chạy Kiểm chuẩn', tags,
    description: 'Đánh giá đơn vị theo bộ quy định có hiệu lực tại ngày chọn (mặc định hôm nay): lớp Module (bất biến sổ trên dữ liệu của đơn vị) '
      + 'và lớp Cấu hình (hồ sơ kế toán, gói định khoản). Chỉ đọc sổ; lưu ảnh chụp kết quả. Kết luận để người dùng quyết định, không chặn ghi sổ.',
    permission: 'conformance:run', effect: 'write', idempotency: 'required', sideEffects: ['analysis'],
    input: z.object({ asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày dạng YYYY-MM-DD').optional() }),
    output: runSchema,
    expose: { http: { method: 'POST', path: '/api/v1/conformance/runs', status: 201 }, mcp: false, ai: 'deny' },
    evidence: { objectType: 'conformance_run', objectId: (_i, o) => o.id },
    handler: async (ctx, input) => view(await runConformance(ctx.data.tx, ctx.tenant.id, { asOf: input.asOf ?? today(), actor: ctx.actor.id })),
  }),
  defineAction({
    id: 'core.conformance.latest', title: 'Kết quả Kiểm chuẩn gần nhất', tags,
    description: 'Lượt Kiểm chuẩn gần nhất của đơn vị: kết quả, số ca theo trạng thái, từng ca kèm lý do và bằng chứng. null = chưa chạy lượt nào.',
    permission: 'conformance:read', effect: 'read', idempotency: 'none',
    input: z.object({}),
    output: runSchema.nullable(),
    expose: { http: { method: 'GET', path: '/api/v1/conformance/runs/latest' }, mcp: true, ai: 'read' },
    handler: async (ctx) => { const r = await latestRun(ctx.data.tx, ctx.tenant.id); return r ? view(r) : null; },
  }),
];
