// @bizcity-layer K kernel/intake
// [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-29: recheckInboxForSkus — mặt hàng kích hoạt thì mục bể có mã đó được tiền kiểm lại (R-GATE-6)
// [2026-11-02 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W2 (2.18, ADR-0014 D2, D10; R-INTAKE-1/2/7/12): bể chờ — cửa nạp từ chối thì giữ nguyên văn + phát hiện + điểm (gộp gửi trùng), tự đóng khi nguồn gửi lại đúng, đọc danh sách / chi tiết, dọn theo hạn giữ
/**
 * BỂ CHỜ ĐẦU VÀO (ADR-0014 D2, D10). Không phải sổ: không bút toán, không sự kiện sổ, không ghi accounting_events (R-INTAKE-2).
 *
 *   recordRejection()   cửa nạp từ chối một chứng từ đã xác thực (VALIDATION / CONFLICT) → giao dịch RIÊNG (giao dịch cửa nạp
 *                       đã huỷ): tiền kiểm + một dòng intake_inbox; cùng nguyên văn khi mục còn mở → attempt_no + 1, không thêm
 *                       dòng. Gắn { id, score, findings, url } vào lỗi (error.intake) rồi cửa nạp ném lỗi như cũ.
 *   closeBySource()     cửa nạp nhận chứng từ cùng docKey → mục 'open' thành 'fixed_at_source', event_id = sự việc.
 *   intakeRetentionSubscriber   bizcity.clock.daily: xoá mục đã đóng quá hạn (90 ngày), mục thử quá hạn (7 ngày) —
 *                       tenants.settings.intake.retentionDays / trialRetentionDays.
 * Nguyên văn không vào log / trace / sự kiện (R-INTAKE-12): chỉ ở bảng này, đọc theo RLS.
 */
import { createHash } from 'node:crypto';
import { sql } from 'kysely';
import { db, type Db } from '@bizcity/platform/db/client';
import { AppError } from '@bizcity/platform/core/errors';
import type { AuthContext } from '@bizcity/platform/core/auth';
import { defineSubscriber } from '@bizcity/platform/core/events';
import type { IntakeFinding } from '@ketoan/contracts';
import { preflight, stable } from './preflight.js';

export type IntakeChannel = 'api' | 'batch' | 'submit' | 'app' | 'connector' | 'mcp' | 'trial';
const MAX_BYTES = 256 * 1024;
/** Mã lỗi cửa nạp từ chối vì nội dung (khuôn, tổng, chi nhánh, chủ chứng từ, phiên bản). */
const ERROR_CODES_DOOR: ReadonlySet<string> = new Set(['VALIDATION_ERROR', 'CONFLICT']);

/** Lỗi cửa nạp đáng giữ ở bể: chứng từ đã xác thực bị từ chối vì nội dung (không phải 401 / 403 / 429 / 5xx). */
export const isDoorRejection = (err: unknown): err is AppError => err instanceof AppError && ERROR_CODES_DOOR.has(err.code);

/** Kênh thật của lời gọi: khoá app luôn là 'app'. */
export const channelOf = (auth: AuthContext, base: IntakeChannel): IntakeChannel => (auth.app ? 'app' : base);

interface Prepared { payload: unknown; hash: string; bytes: number }
function prepare(raw: unknown): Prepared {
  const text = stable(raw ?? null);
  const bytes = Buffer.byteLength(text);
  return { payload: bytes > MAX_BYTES ? { truncated: true, head: text.slice(0, 4096) } : (raw ?? null), hash: `sha256:${createHash('sha256').update(text).digest('hex')}`, bytes };
}
const str = (v: unknown, max = 160) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

async function insertRow(trx: Db, auth: AuthContext, raw: unknown, channel: IntakeChannel, status: 'open' | 'trial', findings: IntakeFinding[], score: number, doorError: unknown) {
  const p = prepare(raw);
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  return trx.insertInto('intake_inbox').values({
    tenant_id: auth.tenantId, channel, source_system: str(r.sourceSystem, 32), actor: auth.actor, app_key: auth.app ?? null,
    doc_key: str(r.docKey), doc_type: str(r.docType, 40), version: Number.isInteger(r.version) ? (r.version as number) : null,
    payload_raw: JSON.stringify(p.payload), payload_hash: p.hash, payload_bytes: p.bytes,
    findings: JSON.stringify(findings), score, door_error: doorError === undefined ? null : JSON.stringify(doorError), status,
  })
    .onConflict((oc) => oc.columns(['tenant_id', 'payload_hash']).where(sql<boolean>`status IN ('open', 'trial')`).doUpdateSet({
      attempt_no: sql<number>`intake_inbox.attempt_no + 1`, last_seen_at: new Date(),
      findings: sql`excluded.findings`, score: sql<number>`excluded.score`, door_error: sql`excluded.door_error`,
    }))
    .returning(['id', 'attempt_no'])
    .executeTakeFirstOrThrow();
}

/**
 * Cửa nạp vừa từ chối `raw` với lỗi `err`: tiền kiểm + giữ ở bể (giao dịch riêng), gắn error.intake. Lỗi khi ghi bể KHÔNG che lỗi
 * cửa nạp (bể là phần hướng dẫn, không được làm hỏng phản hồi).
 */
export async function recordRejection(auth: AuthContext, raw: unknown, channel: IntakeChannel, err: AppError): Promise<void> {
  try {
    const out = await db.transaction().execute(async (trx) => {
      const pf = await preflight(trx, auth, raw);
      const row = await insertRow(trx, auth, raw, channel, 'open', pf.findings, pf.score, { code: err.code, message: err.message, details: err.details ?? null });
      return { id: String(row.id), attempt: row.attempt_no, score: pf.score, findings: pf.findings };
    });
    err.intake = { id: out.id, attempt: out.attempt, score: out.score, findings: out.findings, url: `/api/v1/intake/${out.id}` };
  } catch {
    /* bể chờ lỗi: giữ phản hồi cửa nạp như cũ */
  }
}

/** Mục Kiểm thử (trial, ADR-0014 D6): lưu kết quả thử để so lần trước / lần này; hạn giữ ngắn. */
export async function saveTrial(trx: Db, auth: AuthContext, raw: unknown, findings: IntakeFinding[], score: number): Promise<{ id: string; attempt: number }> {
  const row = await insertRow(trx, auth, raw, 'trial', 'trial', findings, score, undefined);
  return { id: String(row.id), attempt: row.attempt_no };
}

/** Cửa nạp đã nhận docKey → đóng mục 'open' cùng docKey (nguồn đã sửa). Gọi trong giao dịch có sự việc, hoặc sau commit. */
export async function closeBySource(trx: Db, tenantId: string, docKey: string, actor: string): Promise<number> {
  const ev = await trx.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).executeTakeFirst();
  if (!ev) return 0;
  const r = await trx.updateTable('intake_inbox')
    .set({ status: 'fixed_at_source', event_id: ev.id, resolved_at: new Date(), resolved_by: actor, resolution_note: 'Nguồn gửi lại, cửa nạp đã nhận' })
    .where('tenant_id', '=', tenantId).where('doc_key', '=', docKey).where('status', '=', 'open')
    .executeTakeFirst();
  return Number(r.numUpdatedRows ?? 0);
}

export interface InboxFilter { status?: string; docKey?: string; channel?: string; limit?: number; offset?: number }

const LIST_COLS = ['id', 'received_at', 'last_seen_at', 'channel', 'source_system', 'actor', 'app_key', 'doc_key', 'doc_type', 'version', 'score', 'attempt_no', 'status', 'event_id', 'resolved_at'] as const;

export async function listInbox(trx: Db, tenantId: string, f: InboxFilter) {
  let q = trx.selectFrom('intake_inbox').where('tenant_id', '=', tenantId);
  if (f.status) q = q.where('status', '=', f.status as never);
  if (f.docKey) q = q.where('doc_key', '=', f.docKey);
  if (f.channel) q = q.where('channel', '=', f.channel as never);
  const [rows, total] = await Promise.all([
    q.select([...LIST_COLS, sql<string[]>`(SELECT coalesce(array_agg(DISTINCT x->>'code'), '{}') FROM jsonb_array_elements(findings) x)`.as('codes')])
      .orderBy('last_seen_at', 'desc').limit(Math.min(f.limit ?? 50, 200)).offset(f.offset ?? 0).execute(),
    q.select(sql<number>`count(*)::int`.as('n')).executeTakeFirst(),
  ]);
  return { rows, total: total?.n ?? 0 };
}

export function getInbox(trx: Db, tenantId: string, id: string) {
  return trx.selectFrom('intake_inbox').selectAll().where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst();
}

/** Dọn theo hạn giữ (ADR-0014 Q2): mục đã đóng sau `retentionDays` (90), mục thử sau `trialRetentionDays` (7). */
export const intakeRetentionSubscriber = defineSubscriber({
  id: 'intake.retention', module: 'bizcity.kernel', on: ['bizcity.clock.daily'],
  handle: async (ctx) => {
    const t = await ctx.tx.selectFrom('tenants')
      .select([sql<number | null>`(settings #>> '{intake,retentionDays}')::int`.as('keep'), sql<number | null>`(settings #>> '{intake,trialRetentionDays}')::int`.as('trial')])
      .where('id', '=', ctx.tenantId).executeTakeFirst();
    await deleteExpired(ctx.tx, ctx.tenantId, t?.keep ?? 90, t?.trial ?? 7);
  },
});

export async function deleteExpired(trx: Db, tenantId: string, keepDays: number, trialDays: number, now = new Date()): Promise<number> {
  const closed = await trx.deleteFrom('intake_inbox').where('tenant_id', '=', tenantId)
    .where('status', 'not in', ['open', 'trial']).where('resolved_at', '<', new Date(now.getTime() - keepDays * 86_400_000)).executeTakeFirst();
  const trial = await trx.deleteFrom('intake_inbox').where('tenant_id', '=', tenantId)
    .where('status', '=', 'trial').where('last_seen_at', '<', new Date(now.getTime() - trialDays * 86_400_000)).executeTakeFirst();
  return Number(closed.numDeletedRows ?? 0) + Number(trial.numDeletedRows ?? 0);
}

/**
 * Mặt hàng vừa kích hoạt: mục bể đang mở có dòng mang mã đó → tiền kiểm lại (giữ nguyên văn, chỉ cập nhật phát hiện + điểm).
 * Mục hết lỗi chặn vẫn ở trạng thái `open` — người lập bấm Nộp lại hoặc nguồn gửi lại (R-INTAKE-8: ưu tiên sửa ở nguồn).
 */
export async function recheckInboxForSkus(trx: Db, auth: AuthContext, skus: readonly string[]): Promise<{ checked: number; cleared: number }> {
  if (!skus.length) return { checked: 0, cleared: 0 };
  const rows = await trx.selectFrom('intake_inbox').select(['id', 'payload_raw']).where('tenant_id', '=', auth.tenantId).where('status', '=', 'open')
    .where((eb) => eb.or(skus.map((s) => eb(sql`payload_raw`, '@>', sql`${JSON.stringify({ lines: [{ sku: s }] })}::jsonb`)))).execute();
  let cleared = 0;
  for (const r of rows) {
    const res = await preflight(trx, auth, r.payload_raw);
    if (!res.findings.some((f) => f.severity === 'block')) cleared += 1;
    await trx.updateTable('intake_inbox').set({ findings: JSON.stringify(res.findings), score: res.score, last_seen_at: new Date() }).where('id', '=', r.id).execute();
  }
  return { checked: rows.length, cleared };
}

