// @bizcity-layer K kernel/ledger
// [2026-11-09 11:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-16 (D004-14, D004-16): danh sách sửa đầu bút toán (trigger 0089) + kế toán trưởng xác nhận lần sửa ngoài ứng dụng
/**
 * Sửa đầu bút toán (màn SC02, chữ chốt docs/phases/PHASE-004-MOT-CUA-GHI-SO/21-CHOT-VET-E2-CSDL-VA-E1.md §3b).
 *
 * Nguồn: mỗi dòng `audit_logs` `ledger.entry.header_update` có `_source = 'db'` là một lần đổi đầu bút toán, ghi bởi trigger 0089 từ
 * MỌI đường. Lần đó "qua ứng dụng" khi có dòng `_source = 'app'` cùng bút toán và cùng `_txid` (posting.service, S004-13); không có thì
 * là sửa ngoài ứng dụng. Kế toán trưởng xác nhận bằng action `core.ledger.header-edit-ack`: bằng chứng của action (chỉ thêm) là bản ghi
 * xác nhận, `object_id` = id bút toán, `after_data.input.txid` = giao dịch của lần sửa. Chẩn đoán LEDGER_HEADER_EDIT_UNATTRIBUTED dùng
 * cùng ba điều kiện (APP_MATCH, ACK_MATCH) — đổi ở đây thì đổi ở ledger.diagnostics.ts và lane DG-LEDGER-5.
 */
import { sql, type RawBuilder } from 'kysely';
import { z } from 'zod';
import type { Db } from '@bizcity/platform/db/client';
import { Errors } from '@bizcity/platform/core/errors';
import { defineAction } from '@bizcity/platform/core/actions';

export const HEADER_EDIT_ACK_ACTION = 'core.ledger.header-edit-ack';

/** Dòng ứng dụng cùng giao dịch với dòng `d` của trigger. */
const APP_MATCH = sql`EXISTS (SELECT 1 FROM audit_logs b WHERE b.tenant_id = d.tenant_id AND b.object_id = d.object_id AND b.action = d.action
  AND b.after_data->>'_source' = 'app' AND b.after_data->>'_txid' = d.after_data->>'_txid')`;
/** Bằng chứng xác nhận thành công (bí danh `k`) cho đúng bút toán và giao dịch của dòng `d`. */
const ACK_MATCH = sql`k.tenant_id = d.tenant_id AND k.action = ${HEADER_EDIT_ACK_ACTION} AND k.result_ok
  AND k.object_id = d.object_id AND k.after_data->'input'->>'txid' = d.after_data->>'_txid'`;

export const entryEditsQuerySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  source: z.enum(['app', 'db']).optional().describe('app = qua ứng dụng, db = ngoài ứng dụng'),
  column: z.string().regex(/^[a-z_]{1,40}$/).optional(),
  entry: z.string().trim().min(1).max(40).optional().describe('Số bút toán'),
  status: z.enum(['unacked', 'acked']).optional().describe('Chỉ áp cho lần sửa ngoài ứng dụng'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});
export type EntryEditsQuery = z.infer<typeof entryEditsQuerySchema>;

export interface EntryEditRow {
  auditId: string;
  at: string;
  entryId: string;
  entryNo: string;
  postingDate: string;
  docType: string;
  docKey: string | null;
  changes: { column: string; before: unknown; after: unknown }[];
  source: 'app' | 'db';
  role: string | null;
  login: string | null;
  app: string | null;
  client: string | null;
  txid: string | null;
  ack: { by: string; at: string; reason: string | null } | null;
  needsAck: boolean;
}

function where(tenantId: string, q: EntryEditsQuery): RawBuilder<boolean> {
  const parts: RawBuilder<unknown>[] = [sql`d.tenant_id = ${tenantId}`, sql`d.action = 'ledger.entry.header_update'`, sql`d.after_data->>'_source' = 'db'`];
  if (q.from) parts.push(sql`e.posting_date >= ${q.from}`);
  if (q.to) parts.push(sql`e.posting_date <= ${q.to}`);
  if (q.entry) parts.push(sql`e.entry_no = ${q.entry}`);
  if (q.column) parts.push(sql`d.before_data ? ${q.column}`);
  if (q.source === 'app') parts.push(APP_MATCH);
  if (q.source === 'db') parts.push(sql`NOT ${APP_MATCH}`);
  if (q.status === 'acked') parts.push(sql`NOT ${APP_MATCH} AND EXISTS (SELECT 1 FROM audit_logs k WHERE ${ACK_MATCH})`);
  if (q.status === 'unacked') parts.push(sql`NOT ${APP_MATCH} AND NOT EXISTS (SELECT 1 FROM audit_logs k WHERE ${ACK_MATCH})`);
  return sql<boolean>`(${sql.join(parts, sql` AND `)})`;
}

const FROM = sql`audit_logs d JOIN ledger_entries e ON e.id::text = d.object_id AND e.tenant_id = d.tenant_id LEFT JOIN accounting_events ev ON ev.id = e.event_id`;

export async function listEntryEdits(db: Db, tenantId: string, q: EntryEditsQuery) {
  const w = where(tenantId, q);
  type Row = {
    id: string; created_at: Date; object_id: string; entry_no: string; posting_date: string; doc_type: string; doc_key: string | null;
    before_data: Record<string, unknown> | null; after_data: Record<string, unknown> | null; from_app: boolean;
    ack: { by: string; at: string; reason: string | null } | null;
  };
  const rows = await sql<Row>`
    SELECT d.id::text, d.created_at, d.object_id, e.entry_no, e.posting_date::text, e.doc_type, ev.doc_key, d.before_data, d.after_data,
           ${APP_MATCH} AS from_app,
           (SELECT jsonb_build_object('by', k.actor, 'at', k.created_at, 'reason', k.after_data->'input'->>'reason')
              FROM audit_logs k WHERE ${ACK_MATCH} ORDER BY k.id LIMIT 1) AS ack
      FROM ${FROM} WHERE ${w}
     ORDER BY d.id DESC LIMIT ${q.pageSize} OFFSET ${(q.page - 1) * q.pageSize}`.execute(db);
  const sum = (await sql<{ total: number; outside: number; unacked: number }>`
    SELECT count(*)::int AS total,
           count(*) FILTER (WHERE NOT ${APP_MATCH})::int AS outside,
           count(*) FILTER (WHERE NOT ${APP_MATCH} AND NOT EXISTS (SELECT 1 FROM audit_logs k WHERE ${ACK_MATCH}))::int AS unacked
      FROM ${FROM} WHERE ${w}`.execute(db)).rows[0]!;
  const top = (await sql<{ col: string; n: number }>`
    SELECT c AS col, count(*)::int AS n FROM ${FROM} CROSS JOIN LATERAL jsonb_object_keys(coalesce(d.before_data, '{}'::jsonb)) c
     WHERE ${w} GROUP BY c ORDER BY n DESC, c LIMIT 1`.execute(db)).rows[0];
  const items: EntryEditRow[] = rows.rows.map((r) => {
    const after = r.after_data ?? {};
    const before = r.before_data ?? {};
    const str = (v: unknown) => (v == null ? null : String(v));
    const source = r.from_app ? 'app' : 'db';
    return {
      auditId: r.id,
      at: new Date(r.created_at).toISOString(),
      entryId: r.object_id,
      entryNo: r.entry_no,
      postingDate: r.posting_date,
      docType: r.doc_type,
      docKey: r.doc_key,
      changes: Object.keys(before).sort().map((column) => ({ column, before: before[column] ?? null, after: after[column] ?? null })),
      source,
      role: str(after._role),
      login: str(after._login),
      app: str(after._app),
      client: str(after._client),
      txid: str(after._txid),
      ack: r.ack,
      needsAck: source === 'db' && !r.ack,
    };
  });
  return { items, total: sum.total, summary: { total: sum.total, outside: sum.outside, unacked: sum.unacked, topColumn: top ? { column: top.col, count: top.n } : null } };
}

export const headerEditAckAction = defineAction({
  id: HEADER_EDIT_ACK_ACTION,
  title: 'Kế toán trưởng xác nhận đã xem một lần sửa đầu bút toán ngoài ứng dụng (chỉ thêm bản ghi, không xoá dấu vết)',
  tags: ['Sổ cái'],
  permission: 'periods:lock', effect: 'write', sideEffects: ['ledger'], idempotency: 'natural', // ledger: gỡ chặn khoá kỳ của LEDGER_HEADER_EDIT_UNATTRIBUTED; không đổi sổ
  input: z.object({
    entryId: z.string().regex(/^\d+$/),
    txid: z.string().regex(/^\d+$/),
    reason: z.string().trim().min(10, 'Lý do ít nhất 10 ký tự').max(500),
  }),
  output: z.object({ entryId: z.string(), txid: z.string(), already: z.boolean() }),
  expose: { http: { method: 'POST', path: '/api/v1/ledger/entry-edits/ack' }, mcp: false, ai: 'deny' },
  evidence: { objectType: 'ledger_entry', objectId: (input) => input.entryId },
  handler: async (ctx, input) => {
    const auth = ctx.legacyAuth;
    if (auth.kind !== 'user') throw Errors.forbidden('Xác nhận sửa đầu bút toán chỉ làm ở màn Sửa đầu bút toán, không qua khoá API');
    const trx = ctx.data.tx;
    const row = (await sql<{ from_app: boolean; acked: boolean }>`
      SELECT ${APP_MATCH} AS from_app, EXISTS (SELECT 1 FROM audit_logs k WHERE ${ACK_MATCH}) AS acked
        FROM audit_logs d
       WHERE d.tenant_id = ${auth.tenantId} AND d.action = 'ledger.entry.header_update' AND d.after_data->>'_source' = 'db'
         AND d.object_id = ${input.entryId} AND d.after_data->>'_txid' = ${input.txid}
       LIMIT 1`.execute(trx)).rows[0];
    if (!row) throw Errors.notFound('lần sửa đầu bút toán này');
    if (row.from_app) throw Errors.validation('Lần sửa này đi qua ứng dụng (đã khai báo), không cần xác nhận', { entryId: input.entryId, txid: input.txid });
    return { entryId: input.entryId, txid: input.txid, already: row.acked };
  },
});
