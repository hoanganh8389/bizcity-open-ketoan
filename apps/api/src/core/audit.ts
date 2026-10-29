/**
 * Ghi nhật ký thao tác. Gọi từ service sau mỗi thao tác ghi (thêm, sửa, xoá, khoá kỳ…).
 */
import type { Db } from '../db/client.js';

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
      before_data: e.before === undefined ? null : JSON.stringify(e.before),
      after_data: e.after === undefined ? null : JSON.stringify(e.after),
    })
    .execute();
}
