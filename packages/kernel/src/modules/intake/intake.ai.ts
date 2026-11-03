// @bizcity-layer K kernel/intake
// [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W5 (S021-24, 20-KIEN-TRUC §5, §10; R-INTAKE-12): action đọc cho AI — core.intake.list / get / explain, chỉ mở qua MCP, không trả nguyên văn, không có action ghi nào cho AI
/**
 * AI chỉ ĐỌC bể chờ để giải thích cho người dùng vì sao chứng từ chưa vào sổ và nên làm gì. Không trả:
 *   - nguyên văn chứng từ (`payload_raw`), nội dung bản vá (`ops`) và lý do bản vá (người gõ tự do);
 *   - giá trị đã gửi (`got`) và giá trị mong đợi (`expected`) của từng phát hiện — có thể là mã số thuế, ngày, số tiền tính lại…; AI chỉ cần mã, trường, vì sao và cách sửa.
 * Sửa, nộp lại, chấp nhận, bỏ mục: người làm trên màn Trạm kiểm tra (`ai: 'deny'`).
 */
import { INTAKE_CATALOG, type IntakeCode, type IntakeFinding } from '@ketoan/contracts';
import { z } from 'zod';
import { Errors } from '@bizcity/platform/core/errors';
import { defineAction, type AnyActionDef } from '@bizcity/platform/core/actions';
import { getInbox, listInbox } from './inbox.js';
import type { PatchEntry } from './repair.js';

const tags = ['Bể chờ đầu vào'];

/** Phát hiện không mang giá trị chứng từ: bỏ cả `got` (đã gửi) lẫn `expected` (nhiều mã dựng câu từ số liệu / ngày của chính chứng từ). */
const safeFinding = (f: IntakeFinding) => {
  const { got: _got, expected: _expected, ...rest } = f;
  return { ...rest, remedy: f.remedy ? { owner: f.remedy.owner, stopTheLine: f.remedy.stopTheLine ?? false, steps: f.remedy.steps.map((s) => ({ text: s.text, role: s.role ?? null, screen: s.screen?.code ?? null })) } : null };
};

const itemMeta = z.object({
  id: z.string(), status: z.string(), channel: z.string(), source: z.string().nullable(), docKey: z.string().nullable(), docType: z.string().nullable(),
  attempt: z.number(), score: z.number(), codes: z.array(z.string()), patchCount: z.number(), acceptedCodes: z.array(z.string()), eventId: z.string().nullable(),
  receivedAt: z.string(), lastSeenAt: z.string(), resolvedAt: z.string().nullable(),
});

type ListRow = Awaited<ReturnType<typeof listInbox>>['rows'][number];
const meta = (r: ListRow) => ({
  id: String(r.id), status: r.status, channel: r.channel, source: r.app_key ? `app:${r.app_key}` : r.source_system, docKey: r.doc_key, docType: r.doc_type,
  attempt: r.attempt_no, score: r.score, codes: r.codes, patchCount: r.patch_count, acceptedCodes: r.accepted_codes, eventId: r.event_id ? String(r.event_id) : null,
  receivedAt: new Date(r.received_at).toISOString(), lastSeenAt: new Date(r.last_seen_at).toISOString(), resolvedAt: r.resolved_at ? new Date(r.resolved_at).toISOString() : null,
});

const list = defineAction({
  id: 'core.intake.list', title: 'Chứng từ đang giữ ở Trạm kiểm tra đầu vào', tags,
  description: 'Danh sách mục bể chờ: chứng từ cửa nạp đã từ chối nên chưa vào sổ. Trả trạng thái, điểm, mã phát hiện — không có nội dung chứng từ. Lọc theo trạng thái (mặc định đang cần sửa) hoặc docKey.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({ status: z.enum(['open', 'resubmitted', 'fixed_at_source', 'accepted', 'dismissed']).default('open'), docKey: z.string().trim().max(160).optional(), limit: z.number().int().min(1).max(50).default(20) }),
  output: z.object({ items: z.array(itemMeta), total: z.number() }),
  expose: { mcp: true, ai: 'read' },
  handler: async (ctx, b) => {
    const out = await listInbox(ctx.data.tx, ctx.legacyAuth.tenantId, { status: b.status, ...(b.docKey ? { docKey: b.docKey } : {}), limit: b.limit });
    return { items: out.rows.map(meta), total: out.total };
  },
});

const get = defineAction({
  id: 'core.intake.get', title: 'Một mục ở Trạm kiểm tra đầu vào', tags,
  description: 'Chi tiết một mục: trạng thái, điểm, các phát hiện (mã, trường, vì sao, cách sửa, phương án) và lịch sử sửa tại bể (điểm, mã hết / mới). Không trả nguyên văn chứng từ, giá trị đã gửi, nội dung bản vá.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({ id: z.string().regex(/^\d+$/) }),
  output: itemMeta.extend({ findings: z.array(z.unknown()), history: z.array(z.object({ at: z.string(), score: z.number(), codes: z.array(z.string()), fixed: z.array(z.string()), added: z.array(z.string()) })), doorErrorCode: z.string().nullable() }),
  expose: { mcp: true, ai: 'read' },
  handler: async (ctx, b) => {
    const row = await getInbox(ctx.data.tx, ctx.legacyAuth.tenantId, b.id);
    if (!row) throw Errors.notFound('mục bể chờ');
    const findings = row.findings as IntakeFinding[];
    const patches = (Array.isArray(row.patches) ? row.patches : []) as PatchEntry[];
    return {
      ...meta({ ...row, codes: [...new Set(findings.map((f) => f.code))], patch_count: patches.length } as unknown as ListRow),
      findings: findings.map(safeFinding),
      history: patches.map((p) => ({ at: p.at, score: p.score, codes: p.codes, fixed: p.fixed, added: p.added })),
      doorErrorCode: (row.door_error as { code?: string } | null)?.code ?? null,
    };
  },
});

const explain = defineAction({
  id: 'core.intake.explain', title: 'Giải thích vì sao một chứng từ chưa vào sổ', tags,
  description: 'Giải thích một mục bể chờ bằng lời: câu kết luận, từng lỗi (mã, vì sao, sửa ở nguồn), việc cần làm theo thứ tự và ai làm. Dùng khi người dùng hỏi "tại sao chứng từ này chưa vào sổ". Không tự sửa được: người dùng làm ở Trạm kiểm tra.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({ id: z.string().regex(/^\d+$/) }),
  output: z.object({ summary: z.string(), mustFix: z.array(z.unknown()), canAccept: z.array(z.string()), nextSteps: z.array(z.string()), screen: z.string() }),
  expose: { mcp: true, ai: 'read' },
  handler: async (ctx, b) => {
    const row = await getInbox(ctx.data.tx, ctx.legacyAuth.tenantId, b.id);
    if (!row) throw Errors.notFound('mục bể chờ');
    const findings = row.findings as IntakeFinding[];
    const accepted = new Set(row.accepted_codes);
    const block = findings.filter((f) => f.severity === 'block');
    const warn = findings.filter((f) => f.severity === 'warn' && !accepted.has(f.code));
    const name = row.doc_key ?? `#${row.id}`;
    const summary = row.status !== 'open'
      ? `Mục ${name} đã đóng (${row.status}).`
      : `Chứng từ ${name} chưa vào sổ: ${block.length ? `${block.length} lỗi phải sửa` : 'không còn lỗi chặn'}${warn.length ? `, ${warn.length} cảnh báo` : ''}. Điểm ${row.score}/100.`;
    const steps = [...new Set(block.concat(warn).flatMap((f) => (f.remedy?.steps ?? []).map((s) => s.text)))];
    return {
      summary,
      mustFix: block.map((f) => ({ code: f.code, layer: f.layer, field: f.path, title: f.title, why: f.why, fix: f.fix, owner: f.remedy?.owner ?? null })),
      canAccept: warn.filter((f) => INTAKE_CATALOG[f.code as IntakeCode]?.acceptable).map((f) => f.code),
      nextSteps: row.status === 'open' ? [...steps, 'Sửa xong thì Kiểm thử rồi Nộp lại ở Trạm kiểm tra (Định khoản tự động, thẻ Cần sửa)'] : [],
      screen: '/chung-tu',
    };
  },
});

export const INTAKE_READ_ACTIONS: AnyActionDef[] = [list, get, explain];
