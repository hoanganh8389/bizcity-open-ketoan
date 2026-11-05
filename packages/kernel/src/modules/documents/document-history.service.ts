// @bizcity-layer K kernel/intake
// [2026-11-05 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — W1: lịch sử chứng từ (DOC-01..06, bizcity_document@1 §7.2) — một cổng đọc ghép sự việc, phiên bản, bút toán, nhật ký định khoản, bằng chứng; chỉ đọc, không bảng mới
/**
 * LỊCH SỬ CHỨNG TỪ. Từ MỘT trong ba khoá (sự việc `id`, `docKey`, dòng sổ `entryId`) dựng toàn bộ vòng đời của chứng từ gốc:
 * từng phiên bản (nội dung, người nhận, băm), bút toán sinh ra từ đúng phiên bản đó (kể cả bút toán đảo), các bước định khoản,
 * liên kết chứng từ, bằng chứng — và `integrity` báo chỗ nào của chuỗi bị đứt. CHỈ ĐỌC.
 *
 * Dựng từ nguồn thẩm quyền mà mọi đường nộp (API, MCP, module, app ngoài, POS, phân hệ cũ) đều phải đi qua — accounting_events,
 * accounting_event_versions, ledger_entries (event_id + event_version), posting_log, audit_logs, document_links — nên phủ MỌI
 * docKey, không phụ thuộc chứng từ gốc của phân hệ có ghi document_versions hay không.
 *
 * Phiên bản HIỆN HÀNH (`currentVersion`) ≠ phiên bản ĐANG ĐƯỢC GHI NHẬN TRÊN SỔ (`postedVersion`): nội dung của một bút toán luôn lấy
 * theo `event_version` của chính bút toán đó, không lấy nội dung mới nhất để diễn giải bút toán cũ (DOC-03).
 */
import { sql } from 'kysely';
import type { Db } from '@bizcity/platform/db/client';
import { Errors } from '@bizcity/platform/core/errors';
import { contentHash } from '@bizcity/platform/core/documents';

/** Sự việc Kernel tự sinh: mã chẩn đoán lệch phiên bản riêng (cùng ledger.diagnostics.ts). */
const INTERNAL_TYPES = new Set(['closing', 'cogs', 'depreciation']);
/** Sự việc không có bút toán vì tổng tiền 0 (cùng ledger.diagnostics.ts, `valued`). */
const STOCK_ZERO = new Set(['transfer', 'stock_adjustment']);
const AUDIT_LIMIT = 200;

export type HistoryIssueCode = 'ENTRY_NO_VERSION' | 'ENTRY_VERSION_UNKNOWN' | 'EVENT_ENTRIES_STALE' | 'EVENT_POSTED_VERSION' | 'INTERNAL_EVENT_VERSION';

export interface HistoryEntry {
  id: string; entryNo: string; postingDate: string; status: string; isReversal: boolean;
  reversesEntryId: string | null; reversedByEntryId: string | null; total: number;
  /** Phiên bản chứng từ bút toán khai (NULL = bút toán ghi trước khi có cột phiên bản). */
  eventVersion: number | null; createdAt: string; createdBy: string;
}
export interface HistoryPostingStep { action: string; at: string; actor: string; entryIds: string[]; reversed: number; message: string | null; policyVersion: number | null }
export interface HistoryVersion {
  version: number; isCurrent: boolean; isPosted: boolean; receivedAt: string; receivedBy: string | null; contentHash: string;
  /** Có khi xin `withPayload`. */
  payload?: unknown; entries: HistoryEntry[]; postings: HistoryPostingStep[];
}
export interface HistoryIssue { code: HistoryIssueCode; message: string; entryId?: string; version?: number }
export interface DocumentHistory {
  id: string; docKey: string; docType: string; docNo: string; docDate: string; status: string;
  source: { system: string; createdBy: string | null; createdByName: string | null };
  currentVersion: number; postedVersion: number | null;
  versions: HistoryVersion[];
  /** Bút toán của sự việc nhưng `event_version` NULL hoặc trỏ phiên bản không còn nội dung. */
  unversionedEntries: HistoryEntry[];
  links: { from: string; to: string; role: string; createdAt: string }[];
  audit: { action: string; actor: string; at: string; correlationId: string | null; reason: string | null }[];
  integrity: { ok: boolean; issues: HistoryIssue[] };
}
export interface HistoryQuery { id?: string; docKey?: string; entryId?: string; version?: number; withPayload?: boolean }

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v ?? ''));
const day = (v: unknown): string => (v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '').slice(0, 10));

/** Tên hiển thị của người lập: người dùng hoặc khoá API (cùng cách chi tiết chứng từ). */
async function actorName(trx: Db, tenantId: string, actor: string | null): Promise<string | null> {
  if (!actor) return null;
  const [kind, id] = actor.split(':');
  if (kind === 'user' && id) return (await trx.selectFrom('users').select('full_name').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst())?.full_name ?? actor;
  if (kind === 'apikey' && id) return (await trx.selectFrom('api_keys').select('name').where('tenant_id', '=', tenantId).where('id', '=', id).executeTakeFirst())?.name ?? actor;
  return actor;
}

async function resolveEventId(trx: Db, tenantId: string, q: HistoryQuery): Promise<string> {
  const given = [q.id, q.docKey, q.entryId].filter((x) => x !== undefined && x !== '').length;
  if (given !== 1) throw Errors.validation('Chỉ định đúng một trong id (sự việc), docKey, entryId (dòng sổ)');
  if (q.id) {
    const r = await trx.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('id', '=', q.id).executeTakeFirst();
    if (!r) throw Errors.notFound('chứng từ');
    return r.id;
  }
  if (q.docKey) {
    const r = await trx.selectFrom('accounting_events').select('id').where('tenant_id', '=', tenantId).where('doc_key', '=', q.docKey).executeTakeFirst();
    if (!r) throw Errors.notFound('chứng từ');
    return r.id;
  }
  const e = await trx.selectFrom('ledger_entries').select(['event_id', 'entry_no']).where('tenant_id', '=', tenantId).where('id', '=', q.entryId!).executeTakeFirst();
  if (!e) throw Errors.notFound('bút toán');
  if (!e.event_id) throw Errors.notFound(`chứng từ gốc của bút toán ${e.entry_no} (bút toán không gắn sự việc — mã chẩn đoán LEDGER_ORPHAN)`);
  return e.event_id;
}

export async function documentHistory(trx: Db, tenantId: string, q: HistoryQuery): Promise<DocumentHistory> {
  const eventId = await resolveEventId(trx, tenantId, q);
  const ev = await trx.selectFrom('accounting_events').selectAll().where('tenant_id', '=', tenantId).where('id', '=', eventId).executeTakeFirstOrThrow();

  const [oldVersions, logRows, entryRows] = await Promise.all([
    trx.selectFrom('accounting_event_versions').select(['version', 'payload', 'received_at']).where('event_id', '=', eventId).orderBy('version').execute(),
    trx.selectFrom('posting_log').select(['version', 'action', 'created_at', 'actor', 'entry_ids', 'reversed', 'message', 'policy_version']).where('tenant_id', '=', tenantId).where('event_id', '=', eventId).orderBy('id').execute(),
    trx.selectFrom('ledger_entries').select(['id', 'entry_no', 'posting_date', 'status', 'is_reversal', 'reverses_entry_id', 'total', 'event_version', 'created_at', 'created_by'])
      .where('tenant_id', '=', tenantId).where('event_id', '=', eventId).orderBy('created_at').orderBy('id').execute(),
  ]);

  const reversedBy = new Map<string, string>();
  for (const e of entryRows) if (e.reverses_entry_id) reversedBy.set(String(e.reverses_entry_id), e.id);
  const toEntry = (e: (typeof entryRows)[number]): HistoryEntry => ({
    id: e.id, entryNo: e.entry_no, postingDate: day(e.posting_date), status: e.status, isReversal: Boolean(e.is_reversal),
    reversesEntryId: e.reverses_entry_id ? String(e.reverses_entry_id) : null, reversedByEntryId: reversedBy.get(String(e.id)) ?? null,
    total: Number(e.total), eventVersion: e.event_version ?? null, createdAt: iso(e.created_at), createdBy: e.created_by,
  });

  // Mọi phiên bản: các bản cũ đã cất + bản hiện hành (nội dung ở accounting_events).
  const raw = [
    ...oldVersions.map((v) => ({ version: v.version, payload: v.payload as unknown, receivedAt: iso(v.received_at), current: false })),
    { version: ev.version, payload: ev.payload as unknown, receivedAt: iso(ev.received_at), current: true },
  ];
  const known = new Set(raw.map((v) => v.version));
  const postsBy = (version: number) => logRows.filter((l) => l.version === version);
  const entries = entryRows.map(toEntry);

  const versions: HistoryVersion[] = raw
    .filter((v) => q.version === undefined || v.version === q.version)
    .map((v) => {
      // Người nộp phiên bản: dòng `receive` (chỉ ghi khi chứng từ chờ định khoản) → dòng định khoản đầu của phiên bản (nộp và định khoản
      // cùng một lời gọi) → bản 1 là người lập sự việc (bất biến, trigger 0049). Không có gì thì null — không đoán.
      const steps = postsBy(v.version);
      const submitter = steps.find((l) => l.action === 'receive') ?? steps[0];
      return {
        version: v.version, isCurrent: v.current, isPosted: ev.posted_version === v.version, receivedAt: v.receivedAt,
        receivedBy: submitter?.actor ?? (v.version === 1 ? ev.created_by : null),
        contentHash: contentHash(v.payload),
        ...(q.withPayload ? { payload: v.payload } : {}),
        entries: entries.filter((e) => e.eventVersion === v.version),
        postings: postsBy(v.version).map((l) => ({ action: l.action, at: iso(l.created_at), actor: l.actor, entryIds: l.entry_ids ?? [], reversed: l.reversed, message: l.message, policyVersion: l.policy_version ?? null })),
      };
    });
  if (q.version !== undefined && !versions.length) throw Errors.notFound(`phiên bản ${q.version} của chứng từ ${ev.doc_no}`);
  const unversionedEntries = entries.filter((e) => e.eventVersion === null || !known.has(e.eventVersion));

  // Chuỗi có đứt không — cùng điều kiện với ba mã chẩn đoán DG-DOC-1..3 và hai mã posted_version có sẵn.
  const issues: HistoryIssue[] = [];
  for (const e of entries) {
    if (e.eventVersion === null) issues.push({ code: 'ENTRY_NO_VERSION', entryId: e.id, message: `Bút toán ${e.entryNo} không ghi phiên bản chứng từ đã tạo ra nó` });
    else if (!known.has(e.eventVersion)) issues.push({ code: 'ENTRY_VERSION_UNKNOWN', entryId: e.id, version: e.eventVersion, message: `Bút toán ${e.entryNo} trỏ phiên bản ${e.eventVersion} không còn nội dung lưu` });
  }
  if (ev.status === 'posted' && ev.posted_version !== null) {
    for (const e of entries) {
      if (e.status === 'posted' && !e.isReversal && e.eventVersion !== null && e.eventVersion !== ev.posted_version) {
        issues.push({ code: 'EVENT_ENTRIES_STALE', entryId: e.id, version: e.eventVersion, message: `Bút toán ${e.entryNo} còn hiệu lực ở phiên bản ${e.eventVersion} nhưng sổ ghi nhận phiên bản ${ev.posted_version}` });
      }
    }
  }
  const noEntry = STOCK_ZERO.has(ev.doc_type) && Number(ev.total) === 0;
  if (ev.status === 'posted' && !noEntry && ev.posted_version !== ev.version) {
    const code: HistoryIssueCode = INTERNAL_TYPES.has(ev.doc_type) ? 'INTERNAL_EVENT_VERSION' : 'EVENT_POSTED_VERSION';
    issues.push({ code, version: ev.version, message: `Sự việc ở phiên bản ${ev.version} nhưng sổ ghi nhận phiên bản ${ev.posted_version ?? '—'}` });
  }

  // Liên kết chứng từ: sự việc kế toán là `ledger.event:<docKey>`; docKey dạng docRef thì nối cả theo docRef.
  const refs = [`ledger.event:${ev.doc_key}`, ev.doc_key];
  const linkRows = await sql<{ from_ref: string; to_ref: string; role: string; created_at: Date }>`
    SELECT from_ref, to_ref, role, created_at FROM document_links
     WHERE tenant_id = ${tenantId} AND (from_ref IN (${sql.join(refs)}) OR to_ref IN (${sql.join(refs)})) ORDER BY id`.execute(trx);

  const auditRows = await trx.selectFrom('audit_logs').select(['action', 'actor', 'created_at', 'correlation_id', 'after_data'])
    .where('tenant_id', '=', tenantId).where('object_type', 'in', ['source_document', 'accounting_event']).where('object_id', '=', ev.doc_key)
    .orderBy('created_at').orderBy('id').limit(AUDIT_LIMIT).execute();

  return {
    id: ev.id, docKey: ev.doc_key, docType: ev.doc_type, docNo: ev.doc_no, docDate: day(ev.doc_date), status: ev.status,
    source: { system: ev.source_system, createdBy: ev.created_by, createdByName: await actorName(trx, tenantId, ev.created_by) },
    currentVersion: ev.version, postedVersion: ev.posted_version,
    versions, unversionedEntries,
    links: linkRows.rows.map((l) => ({ from: l.from_ref, to: l.to_ref, role: l.role, createdAt: iso(l.created_at) })),
    audit: auditRows.map((a) => {
      const after = a.after_data as { reason?: unknown } | null;
      return { action: a.action, actor: a.actor, at: iso(a.created_at), correlationId: a.correlation_id ?? null, reason: typeof after?.reason === 'string' ? after.reason : null };
    }),
    integrity: { ok: issues.length === 0, issues },
  };
}
