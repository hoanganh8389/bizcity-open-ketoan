// @bizcity-layer P bizcity.config
// [2026-11-08 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-49b (B3b, PHASE-030 · 26 §5 / §7.1): phiếu đề xuất cập nhật thư viện của đơn vị — gửi, liệt kê, đổi trạng thái theo vòng cho phép; không xoá, không sửa nội dung
/**
 * Vòng trạng thái: gui → nhan → da-vao | tu-choi;  gui → tu-choi;  gui | nhan → rut (CHỈ người gửi).
 * da-vao cần bản thư viện đã đưa vào (semver). Phiếu không chứa dữ liệu khách / số tiền chứng từ (R-SEC-10) — chỉ nội dung đề xuất.
 */
import { sql } from 'kysely';
import type { Db } from '../../db/client.js';
import { Errors } from '../errors.js';

export const PROPOSAL_KINDS = ['them-muc', 'sua-gia-tri', 'can-cu', 'bao-sai', 'ngung-dung'] as const;
export const PROPOSAL_STATUSES = ['gui', 'nhan', 'da-vao', 'tu-choi', 'rut'] as const;
export type ProposalKind = (typeof PROPOSAL_KINDS)[number];
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

/** Chuyển trạng thái hợp lệ (ngoài 'rut' — chỉ người gửi, xử lý riêng). */
const NEXT: Record<ProposalStatus, ProposalStatus[]> = { gui: ['nhan', 'tu-choi', 'rut'], nhan: ['da-vao', 'tu-choi', 'rut'], 'da-vao': [], 'tu-choi': [], rut: [] };

export interface Proposal {
  id: string; libraryId: string; itemCode: string | null; kind: ProposalKind; content: string; basisKey: string | null;
  status: ProposalStatus; resolvedVersion: string | null; statusNote: string | null;
  createdBy: string; createdAt: string; updatedBy: string | null; updatedAt: string | null;
}

type Row = {
  id: string; library_id: string; item_code: string | null; kind: ProposalKind; content: string; basis_key: string | null; status: ProposalStatus;
  resolved_version: string | null; status_note: string | null; created_by: string; created_at: Date; updated_by: string | null; updated_at: Date | null;
};
const toProposal = (r: Row): Proposal => ({
  id: String(r.id), libraryId: r.library_id, itemCode: r.item_code, kind: r.kind, content: r.content, basisKey: r.basis_key, status: r.status,
  resolvedVersion: r.resolved_version, statusNote: r.status_note, createdBy: r.created_by, createdAt: new Date(r.created_at).toISOString(),
  updatedBy: r.updated_by, updatedAt: r.updated_at ? new Date(r.updated_at).toISOString() : null,
});
const COLS = sql`id::text AS id, library_id, item_code, kind, content, basis_key, status, resolved_version, status_note, created_by, created_at, updated_by, updated_at`;

export async function createProposal(db: Db, tenantId: string | number, p: { libraryId: string; itemCode?: string; kind: ProposalKind; content: string; basisKey?: string }, actor: string): Promise<Proposal> {
  const r = await sql<Row>`INSERT INTO library_change_requests (tenant_id, library_id, item_code, kind, content, basis_key, created_by)
    VALUES (${String(tenantId)}::bigint, ${p.libraryId}, ${p.itemCode ?? null}, ${p.kind}, ${p.content.trim()}, ${p.basisKey ?? null}, ${actor})
    RETURNING ${COLS}`.execute(db);
  return toProposal(r.rows[0]!);
}

export async function listProposals(db: Db, tenantId: string | number, q: { libraryId?: string; status?: ProposalStatus }): Promise<Proposal[]> {
  const r = await sql<Row>`SELECT ${COLS} FROM library_change_requests
    WHERE tenant_id = ${String(tenantId)}::bigint ${q.libraryId ? sql`AND library_id = ${q.libraryId}` : sql``} ${q.status ? sql`AND status = ${q.status}` : sql``}
    ORDER BY created_at DESC, id DESC LIMIT 500`.execute(db);
  return r.rows.map(toProposal);
}

/**
 * Đổi trạng thái. `canResolve` = người có quyền xử lý (settings:write): nhan / da-vao / tu-choi. `rut` chỉ người gửi.
 * Sai vòng → CONFLICT; không có phiếu → NOT_FOUND.
 */
export async function updateProposal(
  db: Db, tenantId: string | number, id: string, next: { status: ProposalStatus; resolvedVersion?: string; note?: string },
  actor: string, canResolve: boolean,
): Promise<Proposal> {
  const cur = (await sql<Row>`SELECT ${COLS} FROM library_change_requests WHERE tenant_id = ${String(tenantId)}::bigint AND id = ${id}::bigint FOR UPDATE`.execute(db)).rows[0];
  if (!cur) throw Errors.notFound(`phiếu đề xuất ${id}`);
  if (!NEXT[cur.status].includes(next.status)) throw Errors.conflict(`Phiếu ${id} đang ở trạng thái ${cur.status} — không chuyển sang ${next.status} được`);
  if (next.status === 'rut' && cur.created_by !== actor) throw Errors.forbidden('Chỉ người gửi được rút phiếu đề xuất');
  if (next.status !== 'rut' && !canResolve) throw Errors.forbidden('Xử lý phiếu đề xuất cần quyền cấu hình (settings:write)');
  if (next.status === 'da-vao' && !/^\d+\.\d+\.\d+$/.test(next.resolvedVersion ?? '')) throw Errors.validation('Đã vào bản: ghi bản thư viện (vd 1.1.0)');
  const r = await sql<Row>`UPDATE library_change_requests SET status = ${next.status}, resolved_version = ${next.status === 'da-vao' ? next.resolvedVersion! : cur.resolved_version},
      status_note = ${next.note?.trim() || null}, updated_by = ${actor}, updated_at = now()
    WHERE tenant_id = ${String(tenantId)}::bigint AND id = ${id}::bigint RETURNING ${COLS}`.execute(db);
  return toProposal(r.rows[0]!);
}
