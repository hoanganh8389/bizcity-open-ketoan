// @bizcity-layer P module-sdk
// [2026-11-08 09:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2c (S031-22, chữ chốt PHASE-031 · 00 §10): nguồn policy_review, cờ policy, action core.queue.policy-review.ack
// [2026-11-06 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-31: hàng việc — tổng hợp, danh sách, việc của tôi trên khung nhìn bizcity_read.document_queue (chữ chốt: docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/23-HANG-VIEC.md)
/**
 * HÀNG VIỆC — chứng từ đang mở cần ai đó làm gì (nháp, chờ duyệt, đã duyệt chưa ghi nhận, ở bể chờ, bị chặn). Chỉ đọc.
 *   GET /api/v1/queue/summary   core.queue.summary   đếm theo nhóm trạng thái, cờ, nguồn, tuổi
 *   GET /api/v1/queue/items     core.queue.items     danh sách, cũ nhất trước, phân trang theo con trỏ
 *   GET /api/v1/queue/mine      core.queue.mine      việc của người đang đăng nhập + mảng `viec` cho thanh "Việc cần làm"
 * Nguồn: view `bizcity_read.document_queue` (migration 0076) gộp payment_requests, purchase_documents, accounting_events (pending /
 * error), intake_inbox (open). Không có nội dung chứng từ. Mọi truy vấn lọc `tenant_id` (R-TEN).
 *
 * Chưa làm: lọc theo phạm vi chi nhánh / kho của người dùng (cần `scopeOf` của PHASE-028 được nối vào đường yêu cầu) — hôm nay người
 * xem thấy hàng việc của cả đơn vị theo quyền. Tách nhiệm: `mine` chỉ ẩn việc của chính người lập khỏi "Chờ bạn duyệt" (lựa chọn hiển
 * thị); hai luồng chưa bật `sod` nên hệ thống chưa chặn tự duyệt.
 */
import { sql, type RawBuilder } from 'kysely';
import { z } from 'zod';
import { defineAction, type AnyActionDef } from '../../core/actions.js';
import { Errors } from '../../core/errors.js';

const tags = ['Hàng việc'];

export const QUEUE_SOURCES = ['payment_request', 'purchase_document', 'accounting_event', 'intake', 'policy_review'] as const;
export const QUEUE_GROUPS = ['draft', 'pending', 'approved'] as const;
export const QUEUE_FLAGS = ['held', 'blocked', 'returned', 'policy'] as const;
export const QUEUE_AGES = ['d1', 'd3', 'd7', 'over7'] as const;
type Source = (typeof QUEUE_SOURCES)[number];
/** Quyền dạng `<module>:<việc>` (khớp kiểu của `ctx.can`). */
export type Perm = `${string}:${string}`;

/** Tuổi (ngày dương lịch giờ Việt Nam) tính từ lúc bắt đầu chờ ở trạng thái hiện tại. */
const AGE_SQL = sql`((now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - (waiting_since AT TIME ZONE 'Asia/Ho_Chi_Minh')::date)`;
const WS_TEXT = sql`to_char(waiting_since AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export function ageBucket(days: number): (typeof QUEUE_AGES)[number] {
  return days <= 1 ? 'd1' : days <= 3 ? 'd3' : days <= 7 ? 'd7' : 'over7';
}

/** Màn hình để bấm vào: MỘT bảng ánh xạ duy nhất (PHASE-030 · 23 §2.2). */
export function queuePath(source: Source, statusRaw: string): string {
  switch (source) {
    case 'payment_request': return '/cong-no/yeu-cau-thanh-toan';
    case 'purchase_document': return `/mua-hang/chung-tu?trang-thai=${encodeURIComponent(statusRaw)}`;
    default: return '/chung-tu';
  }
}

/** Nhóm của thanh mép phải (apps/web/src/layout/rail/useViec.ts). */
const RAIL_GROUPS: Record<Source, string[]> = {
  payment_request: ['cong-no'], purchase_document: ['mua-hang'], accounting_event: ['tong-hop'], intake: ['tong-hop'], policy_review: ['tong-hop'],
};

/** Quyền làm bước tiếp theo, đúng như thi hành hôm nay (chuyển sang `authorize` của PHASE-028 khi cầu nối có — R-WF-15). */
const NEXT_PERMISSION: Record<string, Perm> = {
  'payment_request:submitted': 'payments:approve',
  'payment_request:approved1': 'payments:approve-final',
  'payment_request:approved': 'documents:write',
  'purchase_document:pending_approval': 'documents:write',
  'accounting_event:pending': 'documents:write',
  'accounting_event:error': 'documents:write',
  'intake:open': 'documents:write',
  'policy_review:posted': 'documents:write',
};

const SOURCE_LABEL: Record<Source, string> = {
  payment_request: 'Đề nghị thanh toán', purchase_document: 'Phiếu mua', accounting_event: 'Chứng từ', intake: 'Chứng từ ở bể chờ', policy_review: 'Chứng từ chờ kế toán xem chính sách',
};

const where = (parts: RawBuilder<unknown>[]) => sql.join(parts, sql` AND `);
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

// ── việc của tôi (hàm thuần, kiểm thử không cần CSDL) ─────────────────────────────────────────────────────────────────────

export type ViecLevel = 'error' | 'warn' | 'info';
export interface Viec { key: string; level: ViecLevel; text: string; count: number; amount?: number; path: string; groups: string[] }
export interface MineRow { source: Source; statusRaw: string; statusGroup: string; flag: string | null; mine: boolean; count: number; amount: number; oldestDays: number }
export type MinePart = 'returned' | 'drafts' | 'waiting' | 'toApprove' | 'blocked' | 'held' | 'policy';
export interface MineEntry { part: MinePart; source: Source; statusRaw: string; count: number; amount: number; oldestDays: number }

const PART_LEVEL: Record<MinePart, (oldest: number) => ViecLevel> = {
  returned: () => 'warn',
  drafts: (o) => (o > 3 ? 'warn' : 'info'),
  waiting: () => 'info',
  toApprove: (o) => (o > 7 ? 'error' : 'warn'),
  blocked: () => 'error',
  held: () => 'warn',
  policy: () => 'info',
};

function partText(part: MinePart, source: Source, statusRaw: string): string {
  const s = SOURCE_LABEL[source];
  switch (part) {
    case 'returned': return `${s} bị trả lại, cần sửa`;
    case 'drafts': return `${s} nháp chưa trình`;
    case 'waiting': return `${s} đang chờ người duyệt`;
    case 'blocked': return source === 'accounting_event' ? 'Chứng từ lỗi cần ghi sổ lại' : `${s} bị chặn`;
    case 'policy': return `${s}, cần xem`;
    case 'held': return source === 'intake' ? 'Ở bể chờ, cần sửa rồi nộp lại' : 'Chứng từ chờ định khoản (ACC14)';
    case 'toApprove':
      if (source === 'payment_request' && statusRaw === 'approved') return 'Đề nghị thanh toán đã duyệt, chờ chi tiền';
      if (source === 'payment_request' && statusRaw === 'approved1') return 'Đề nghị thanh toán chờ bạn duyệt cấp 2';
      return `${s} chờ bạn duyệt`;
  }
}

/** Gộp các dòng tổng hợp thành phần việc của người dùng theo bảng §2.3 của PHASE-030 · 23. */
export function buildMine(rows: MineRow[], can: (permission: Perm) => boolean): { entries: MineEntry[]; viec: Viec[] } {
  const canWrite = can('documents:write');
  const acc = new Map<string, MineEntry>();
  const add = (part: MinePart, r: MineRow) => {
    const k = `${part}:${r.source}:${r.statusRaw}`;
    const e = acc.get(k) ?? { part, source: r.source, statusRaw: r.statusRaw, count: 0, amount: 0, oldestDays: 0 };
    e.count += r.count; e.amount += r.amount; e.oldestDays = Math.max(e.oldestDays, r.oldestDays);
    acc.set(k, e);
  };
  for (const r of rows) {
    if (r.flag === 'blocked' || r.flag === 'held' || r.flag === 'policy') { if (canWrite) add(r.flag, r); continue; }
    if (r.mine) {
      if (r.flag === 'returned') add('returned', r);
      else if (r.statusGroup === 'draft') add('drafts', r);
      else if (r.statusGroup === 'pending') add('waiting', r);
      continue;
    }
    // việc của người khác: chỉ hiện nếu tôi có quyền làm bước tiếp theo
    const need = NEXT_PERMISSION[`${r.source}:${r.statusRaw}`];
    if ((r.statusGroup === 'pending' || r.statusGroup === 'approved') && !r.flag && need && can(need)
      && (r.source === 'payment_request' || r.source === 'purchase_document')) add('toApprove', r);
  }
  const order: MinePart[] = ['blocked', 'toApprove', 'returned', 'held', 'policy', 'waiting', 'drafts'];
  const entries = [...acc.values()].sort((a, b) => order.indexOf(a.part) - order.indexOf(b.part) || a.source.localeCompare(b.source));
  const viec: Viec[] = entries.map((e) => ({
    key: `hv:${e.part}:${e.source}:${e.statusRaw}`,
    level: PART_LEVEL[e.part](e.oldestDays),
    text: partText(e.part, e.source, e.statusRaw),
    count: e.count,
    ...(e.amount ? { amount: e.amount } : {}),
    path: queuePath(e.source, e.statusRaw),
    groups: RAIL_GROUPS[e.source],
  }));
  return { entries, viec };
}

// ── con trỏ phân trang ────────────────────────────────────────────────────────────────────────────────────────────────────

const cursorSchema = z.object({ w: z.string().min(10).max(40), s: z.enum(QUEUE_SOURCES), i: z.string().min(1).max(40) });
const encodeCursor = (c: z.infer<typeof cursorSchema>) => Buffer.from(JSON.stringify(c)).toString('base64url');
function decodeCursor(raw: string): z.infer<typeof cursorSchema> {
  try { return cursorSchema.parse(JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'))); } catch { throw Errors.validation('cursor không hợp lệ'); }
}

// ── action ────────────────────────────────────────────────────────────────────────────────────────────────────────────────

const sourceEnum = z.enum(QUEUE_SOURCES);
const counts = z.object({ draft: z.number(), pending: z.number(), approved: z.number(), held: z.number(), blocked: z.number(), returned: z.number(), policy: z.number() });
const aging = z.object({ d1: z.number(), d3: z.number(), d7: z.number(), over7: z.number() });
const itemSchema = z.object({
  source: sourceEnum, sourceId: z.string(), docRef: z.string(), docType: z.string(), docNo: z.string(), docDate: z.string().nullable(), branchCode: z.string().nullable(),
  amount: z.number().nullable(), statusRaw: z.string(), statusGroup: z.enum(QUEUE_GROUPS), flag: z.enum(QUEUE_FLAGS).nullable(), createdBy: z.string().nullable(),
  createdAt: z.string(), waitingSince: z.string(), ageDays: z.number(), path: z.string(),
});

const summary = defineAction({
  id: 'core.queue.summary', title: 'Hàng việc: tổng hợp theo trạng thái, cờ, nguồn, tuổi', tags,
  description: 'Số chứng từ đang mở (nháp, chờ duyệt, đã duyệt chưa ghi nhận) và số ở bể chờ / bị chặn / bị trả lại, theo nguồn, kèm phân bố tuổi (≤ 1, 1–3, 3–7, > 7 ngày) và việc cũ nhất. '
    + 'Chứng từ đã xong (đã ghi sổ, đã chi, đã huỷ) không có mặt. Chưa lọc theo phạm vi chi nhánh / kho của người dùng.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({ branch: z.string().trim().max(32).optional(), source: sourceEnum.optional() }),
  output: z.object({
    asOf: z.string(), total: z.number(),
    byGroup: z.object({ draft: z.number(), pending: z.number(), approved: z.number() }),
    byFlag: z.object({ held: z.number(), blocked: z.number(), returned: z.number() }),
    bySource: z.array(counts.extend({ source: sourceEnum, total: z.number(), aging, oldestDays: z.number() })),
  }),
  expose: { http: { method: 'GET', path: '/api/v1/queue/summary' }, mcp: true, ai: 'read' },
  handler: async (ctx, input) => {
    const conds: RawBuilder<unknown>[] = [sql`tenant_id = ${ctx.tenant.id}`];
    if (input.branch) conds.push(sql`branch_code = ${input.branch}`);
    if (input.source) conds.push(sql`source = ${input.source}`);
    const { rows } = await sql<{ source: Source; status_group: string; flag: string | null; n: number; d1: number; d3: number; d7: number; over7: number; oldest: number }>`
      SELECT source, status_group, flag, count(*)::int AS n,
             count(*) FILTER (WHERE age <= 1)::int AS d1,
             count(*) FILTER (WHERE age > 1 AND age <= 3)::int AS d3,
             count(*) FILTER (WHERE age > 3 AND age <= 7)::int AS d7,
             count(*) FILTER (WHERE age > 7)::int AS over7,
             coalesce(max(age), 0)::int AS oldest
        FROM (SELECT source, status_group, flag, ${AGE_SQL} AS age FROM bizcity_read.document_queue WHERE ${where(conds)}) q
       GROUP BY source, status_group, flag`.execute(ctx.data.tx);
    const empty = () => ({ draft: 0, pending: 0, approved: 0, held: 0, blocked: 0, returned: 0, policy: 0, total: 0, aging: { d1: 0, d3: 0, d7: 0, over7: 0 }, oldestDays: 0 });
    const by = new Map<Source, ReturnType<typeof empty>>(QUEUE_SOURCES.map((s) => [s, empty()]));
    const byGroup = { draft: 0, pending: 0, approved: 0 };
    const byFlag = { held: 0, blocked: 0, returned: 0 };
    let total = 0;
    for (const r of rows) {
      const s = by.get(r.source)!;
      s.total += r.n; total += r.n;
      s[r.status_group as 'draft' | 'pending' | 'approved'] += r.n; byGroup[r.status_group as 'draft' | 'pending' | 'approved'] += r.n;
      if (r.flag) { s[r.flag as 'held' | 'blocked' | 'returned' | 'policy'] += r.n; if (r.flag !== 'policy') byFlag[r.flag as 'held' | 'blocked' | 'returned'] += r.n; } // 'policy' đếm theo nguồn (bySource.policy_review.policy); byFlag giữ ba khoá của hợp đồng đã phát hành
      s.aging.d1 += r.d1; s.aging.d3 += r.d3; s.aging.d7 += r.d7; s.aging.over7 += r.over7; s.oldestDays = Math.max(s.oldestDays, r.oldest);
    }
    return { asOf: new Date().toISOString(), total, byGroup, byFlag, bySource: QUEUE_SOURCES.map((s) => ({ source: s, ...by.get(s)! })) };
  },
});

const items = defineAction({
  id: 'core.queue.items', title: 'Hàng việc: danh sách chứng từ đang mở', tags,
  description: 'Danh sách chứng từ đang mở, **cũ nhất trước**, lọc theo nhóm trạng thái, cờ, nguồn, chi nhánh, tuổi, hoặc chữ trong số chứng từ. Phân trang theo con trỏ `cursor` (trả ở `next`). Mỗi dòng kèm `path` để mở màn nguồn.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({
    group: z.enum(QUEUE_GROUPS).optional(), flag: z.enum(QUEUE_FLAGS).optional(), source: sourceEnum.optional(), branch: z.string().trim().max(32).optional(),
    age: z.enum(QUEUE_AGES).optional(), q: z.string().trim().max(64).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50), cursor: z.string().max(200).optional(),
  }),
  output: z.object({ items: z.array(itemSchema), next: z.string().nullable() }),
  expose: { http: { method: 'GET', path: '/api/v1/queue/items' }, mcp: true, ai: 'read' },
  handler: async (ctx, input) => {
    const inner: RawBuilder<unknown>[] = [sql`tenant_id = ${ctx.tenant.id}`];
    if (input.group) inner.push(sql`status_group = ${input.group}`);
    if (input.flag) inner.push(sql`flag = ${input.flag}`);
    if (input.source) inner.push(sql`source = ${input.source}`);
    if (input.branch) inner.push(sql`branch_code = ${input.branch}`);
    if (input.q) inner.push(sql`doc_no ILIKE ${'%' + escapeLike(input.q) + '%'}`);
    const outer: RawBuilder<unknown>[] = [];
    if (input.age === 'd1') outer.push(sql`age_days <= 1`);
    else if (input.age === 'd3') outer.push(sql`age_days > 1 AND age_days <= 3`);
    else if (input.age === 'd7') outer.push(sql`age_days > 3 AND age_days <= 7`);
    else if (input.age === 'over7') outer.push(sql`age_days > 7`);
    if (input.cursor) {
      const c = decodeCursor(input.cursor);
      outer.push(sql`(ws::timestamptz, source, source_id) > (${c.w}::timestamptz, ${c.s}, ${c.i})`);
    }
    const outerWhere = outer.length ? sql`WHERE ${where(outer)}` : sql``;
    const { rows } = await sql<{
      source: Source; source_id: string; doc_ref: string; doc_type: string; doc_no: string; doc_date: string | null; branch_code: string | null; amount: string | null;
      status_raw: string; status_group: (typeof QUEUE_GROUPS)[number]; flag: (typeof QUEUE_FLAGS)[number] | null; created_by: string | null; created_at: string; ws: string; age_days: number;
    }>`
      SELECT * FROM (
        SELECT source, source_id, doc_ref, doc_type, doc_no, doc_date::text AS doc_date, branch_code, amount::text AS amount, status_raw, status_group, flag, created_by,
               to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at, ${WS_TEXT} AS ws, ${AGE_SQL} AS age_days
          FROM bizcity_read.document_queue WHERE ${where(inner)}
      ) q ${outerWhere}
      ORDER BY ws::timestamptz ASC, source ASC, source_id ASC
      LIMIT ${input.limit + 1}`.execute(ctx.data.tx);
    const page = rows.slice(0, input.limit);
    const last = page[page.length - 1];
    return {
      items: page.map((r) => ({
        source: r.source, sourceId: r.source_id, docRef: r.doc_ref, docType: r.doc_type, docNo: r.doc_no, docDate: r.doc_date, branchCode: r.branch_code,
        amount: r.amount == null ? null : Number(r.amount), statusRaw: r.status_raw, statusGroup: r.status_group, flag: r.flag, createdBy: r.created_by,
        createdAt: r.created_at, waitingSince: r.ws, ageDays: r.age_days, path: queuePath(r.source, r.status_raw),
      })),
      next: rows.length > input.limit && last ? encodeCursor({ w: last.ws, s: last.source, i: last.source_id }) : null,
    };
  },
});

const mine = defineAction({
  id: 'core.queue.mine', title: 'Hàng việc của tôi', tags,
  description: 'Việc của người đang đăng nhập: chứng từ tôi lập bị trả lại, còn nháp, đang chờ duyệt; chứng từ của người khác chờ tôi duyệt hoặc chi (theo quyền tôi có, không kể việc do chính tôi lập); '
    + 'chứng từ lỗi / ở bể chờ cho người có quyền ghi chứng từ. `viec` đúng hình của thanh "Việc cần làm". Chưa lọc theo phạm vi chi nhánh / kho.',
  permission: 'documents:read', effect: 'read', idempotency: 'none',
  input: z.object({}),
  output: z.object({
    entries: z.array(z.object({ part: z.enum(['returned', 'drafts', 'waiting', 'toApprove', 'blocked', 'held', 'policy']), source: sourceEnum, statusRaw: z.string(), count: z.number(), amount: z.number(), oldestDays: z.number() })),
    viec: z.array(z.object({ key: z.string(), level: z.enum(['error', 'warn', 'info']), text: z.string(), count: z.number(), amount: z.number().optional(), path: z.string(), groups: z.array(z.string()) })),
  }),
  expose: { http: { method: 'GET', path: '/api/v1/queue/mine' }, mcp: true, ai: 'read' },
  handler: async (ctx) => {
    const { rows } = await sql<{ source: Source; status_raw: string; status_group: string; flag: string | null; mine: boolean; n: number; amount: string; oldest: number }>`
      SELECT source, status_raw, status_group, flag, mine,
             count(*)::int AS n, coalesce(sum(amount), 0)::text AS amount, coalesce(max(age), 0)::int AS oldest
        FROM (SELECT source, status_raw, status_group, flag, amount, coalesce(created_by = ${ctx.actor.id}, false) AS mine, ${AGE_SQL} AS age
                FROM bizcity_read.document_queue WHERE tenant_id = ${ctx.tenant.id}) q
       GROUP BY source, status_raw, status_group, flag, mine`.execute(ctx.data.tx);
    return buildMine(
      rows.map((r) => ({ source: r.source, statusRaw: r.status_raw, statusGroup: r.status_group, flag: r.flag, mine: r.mine, count: r.n, amount: Number(r.amount), oldestDays: r.oldest })),
      (p) => ctx.can(p),
    );
  },
});

/** Đóng một việc "chờ kế toán xem": một dòng bằng chứng bất biến cho đúng bản kiểm hiện hành của sự việc; không sửa sự việc (00 §10). */
const policyReviewAck = defineAction({
  id: 'core.queue.policy-review.ack', title: 'Hàng việc: đánh dấu đã xem phát hiện chính sách của một chứng từ', tags,
  description: 'Ghi một dòng bằng chứng rằng người dùng đã xem các phát hiện chính sách (IN-POL-*) của bản kiểm hiện hành của sự việc; việc rời hàng việc. '
    + 'Gọi lặp trên cùng bản kiểm trả kết quả cũ. Sự việc được kiểm lại (bản kiểm mới) thì việc mở lại. Không sửa sự việc, không ghi sổ.',
  permission: 'documents:write', effect: 'write', sideEffects: ['documents'], idempotency: 'required',
  input: z.object({ eventId: z.coerce.number().int().positive(), note: z.string().trim().max(500).optional() }),
  output: z.object({ eventId: z.number(), checkedAt: z.string(), ackedBy: z.string(), ackedAt: z.string(), alreadyAcked: z.boolean() }),
  expose: { http: { method: 'POST', path: '/api/v1/queue/policy-review/:eventId/ack' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'accounting_event', objectId: (input) => String(input.eventId) },
  handler: async (ctx, input) => {
    const ev = await sql<{ checked_at: string | null; n: number }>`
      SELECT policy_check->>'checkedAt' AS checked_at, jsonb_array_length(COALESCE(policy_check->'findings', '[]'::jsonb))::int AS n
        FROM accounting_events WHERE tenant_id = ${ctx.tenant.id} AND id = ${input.eventId}`.execute(ctx.data.tx);
    const row = ev.rows[0];
    if (!row) throw Errors.notFound(`sự việc ${input.eventId}`);
    if (!row.checked_at || row.n === 0) throw Errors.conflict('Sự việc không có phát hiện chính sách nào cần xem', { reason: 'POLICY_REVIEW_NOT_OPEN' });
    const ins = await sql<{ acked_by: string; acked_at: string }>`
      INSERT INTO policy_review_acks (tenant_id, event_id, checked_at, acked_by, note)
      VALUES (${ctx.tenant.id}, ${input.eventId}, ${row.checked_at}, ${ctx.actor.id}, ${input.note ?? null})
      ON CONFLICT (tenant_id, event_id, checked_at) DO NOTHING
      RETURNING acked_by, to_char(acked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS acked_at`.execute(ctx.data.tx);
    if (ins.rows[0]) return { eventId: input.eventId, checkedAt: row.checked_at, ackedBy: ins.rows[0].acked_by, ackedAt: ins.rows[0].acked_at, alreadyAcked: false };
    const prev = await sql<{ acked_by: string; acked_at: string }>`
      SELECT acked_by, to_char(acked_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS acked_at
        FROM policy_review_acks WHERE tenant_id = ${ctx.tenant.id} AND event_id = ${input.eventId} AND checked_at = ${row.checked_at}`.execute(ctx.data.tx);
    return { eventId: input.eventId, checkedAt: row.checked_at, ackedBy: prev.rows[0]!.acked_by, ackedAt: prev.rows[0]!.acked_at, alreadyAcked: true };
  },
});

export const queueActions: AnyActionDef[] = [summary, items, mine, policyReviewAck];
