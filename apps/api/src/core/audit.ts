// @bizcity-layer P audit
// [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn.
// [2026-10-30 09:58 AM Johnny Chu - Chu Hoàng Anh] PHASE-002 — nhãn lớp @bizcity-layer, đồ thị phụ thuộc mốc, bản nháp API module-sdk.
// [2026-10-30 11:27 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — bằng chứng chỉ thêm, chuỗi băm theo đơn vị, biên nhận (PHASES 2.6).
// [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id.
/**
 * Bằng chứng thao tác (bizcity_evidence@1) trên bảng audit_logs.
 *   writeEvidence()  runtime action gọi (core/actions.ts): đủ trường bằng chứng, trả biên nhận { evidenceId, hash, at }.
 *   writeAudit()     cách cũ, service gọi tay sau thao tác ghi (thêm, sửa, xoá, khoá kỳ…) — vẫn vào chuỗi băm.
 * Chuỗi băm (chain_seq, prev_hash, hash) và lớp chỉ thêm do trigger CSDL lo (migration 0036): không ai sửa, xoá được dòng đã ghi.
 */
import type { Db } from '../db/client.js';
import { currentRequest } from './request-context.js';

export interface AuditEntry {
  tenantId: string;
  actor: string;
  action: string;
  objectType: string;
  objectId?: string;
  before?: unknown;
  after?: unknown;
}

export async function writeAudit(trx: Db, e: AuditEntry): Promise<void> {
  await trx
    .insertInto('audit_logs')
    .values({
      tenant_id: e.tenantId,
      actor: e.actor,
      action: e.action,
      object_type: e.objectType,
      object_id: e.objectId ?? null,
      request_id: currentRequest()?.requestId ?? null,
      correlation_id: currentRequest()?.correlationId ?? null,
      before_data: e.before === undefined ? null : JSON.stringify(e.before),
      after_data: e.after === undefined ? null : JSON.stringify(e.after),
    })
    .execute();
}

export interface EvidenceEntry extends AuditEntry {
  actorKind: 'user' | 'apikey' | 'ai' | 'system';
  actorVia?: string;
  onBehalfOf?: string;
  moduleId?: string;
  subject?: string;
  requestId?: string;
  /** Nối nhiều yêu cầu của một việc (X-Correlation-Id; mặc định lấy từ ngữ cảnh yêu cầu). */
  correlationId?: string;
  idempotencyKey?: string;
  inputHash?: string;
  result: { ok: true } | { ok: false; code: string };
}

/** Biên nhận trả trong meta.receipt: giữ lại để hỏi GET /api/v1/evidence/:id và kiểm hash. */
export interface EvidenceReceipt {
  evidenceId: string;
  hash: string;
  at: string;
}

export async function writeEvidence(trx: Db, e: EvidenceEntry): Promise<EvidenceReceipt> {
  const row = await trx
    .insertInto('audit_logs')
    .values({
      tenant_id: e.tenantId,
      actor: e.actor,
      actor_kind: e.actorKind,
      actor_via: e.actorVia ?? null,
      on_behalf_of: e.onBehalfOf ?? null,
      action: e.action,
      module_id: e.moduleId ?? null,
      object_type: e.objectType,
      object_id: e.objectId ?? null,
      subject: e.subject ?? null,
      request_id: e.requestId ?? currentRequest()?.requestId ?? null,
      correlation_id: e.correlationId ?? currentRequest()?.correlationId ?? null,
      idempotency_key: e.idempotencyKey ?? null,
      input_hash: e.inputHash ?? null,
      result_ok: e.result.ok,
      result_code: e.result.ok ? null : e.result.code,
      before_data: e.before === undefined ? null : JSON.stringify(e.before),
      after_data: e.after === undefined ? null : JSON.stringify(e.after),
    })
    .returning(['id', 'hash', 'created_at'])
    .executeTakeFirstOrThrow();
  return { evidenceId: row.id, hash: row.hash ?? '', at: new Date(row.created_at).toISOString() };
}
