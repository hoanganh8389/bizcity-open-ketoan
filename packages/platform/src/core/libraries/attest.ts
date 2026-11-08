// @bizcity-layer P bizcity.config
// [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49a (B3a, PHASE-030 · 26 §6): xác nhận theo đơn vị = bằng chứng của action core.library.attest (audit_logs, object_type 'library-item') — đọc lần xác nhận mới nhất của từng mục, hết hiệu lực khi băm của mục đổi
/**
 * Không bảng riêng: action ghi `core.library.attest` để lại đúng một bản ghi audit_logs (bizcity_evidence@1) với
 *   object_type = 'library-item', object_id = '<thư viện>:<mã>', after_data.notes.attest = { version, itemHash, attested }.
 * `itemHash(lib, code)` băm đúng nội dung một mục (canonical JSON) — bản thư viện mới đổi mục đó thì xác nhận cũ hết hiệu lực.
 * Xác nhận của đơn vị KHÔNG đổi `verified` của thư viện (duyệt ở repo, D-LIB-6).
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { hashItems } from './engine.js';
import type { Library } from './types.js';

export const ATTEST_ACTION = 'core.library.attest';
export const ATTEST_OBJECT = 'library-item';

/** Băm nội dung một mục (cùng thuật toán băm thư viện). Không có mục → undefined. */
export function itemHash(lib: Library, code: string): string | undefined {
  const it = lib.items.find((i) => i.code === code);
  return it ? hashItems(it) : undefined;
}

export interface AttestNote { libraryId: string; code: string; version: string; itemHash: string; attested: boolean }

export interface Attestation {
  code: string;
  attested: boolean;
  /** Còn hiệu lực: lần mới nhất là xác nhận (không phải gỡ) VÀ băm của mục chưa đổi. */
  valid: boolean;
  version: string;
  itemHash: string;
  by: string;
  at: string;
  reason: string;
  evidenceId: string;
}

/** Lần xác nhận / gỡ mới nhất của từng mục trong một thư viện, cho đơn vị đang gắn (RLS + điều kiện tenant_id). */
export async function libraryAttestations(db: Db, tenantId: string | number, lib: Library): Promise<Attestation[]> {
  const rows = await sql<{ object_id: string; actor: string; created_at: Date; id: string; note: AttestNote | null; reason: string | null }>`
    SELECT DISTINCT ON (object_id) object_id, actor, created_at, id::text AS id,
           after_data -> 'notes' -> 'attest' AS note, after_data -> 'input' ->> 'reason' AS reason
    FROM audit_logs
    WHERE tenant_id = ${String(tenantId)}::bigint AND action = ${ATTEST_ACTION} AND object_type = ${ATTEST_OBJECT}
      AND object_id LIKE ${`${lib.id}:%`} AND result_ok
    ORDER BY object_id, created_at DESC, id DESC`.execute(db);
  const out: Attestation[] = [];
  for (const r of rows.rows) {
    const n = r.note;
    if (!n || n.libraryId !== lib.id) continue;
    const now = itemHash(lib, n.code);
    out.push({
      code: n.code, attested: n.attested, valid: n.attested && now === n.itemHash, version: n.version, itemHash: n.itemHash,
      by: r.actor, at: new Date(r.created_at).toISOString(), reason: r.reason ?? '', evidenceId: r.id,
    });
  }
  return out.sort((a, b) => a.code.localeCompare(b.code));
}
