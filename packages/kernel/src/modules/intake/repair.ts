// @bizcity-layer K kernel/intake
// [2026-11-03 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W3 (2.19, ADR-0014 D4, D5; R-INTAKE-7/8/9): sửa tại bể — bản vá chồng lên nguyên văn (không sửa nguyên văn), nộp lại qua đúng cửa nạp, chấp nhận cảnh báo theo vai trò cấu hình, bỏ mục
/**
 * SỬA TẠI BỂ (docs/phases/PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/20-KIEN-TRUC.md §5, §6).
 *
 *   patchItem()     thêm một bản vá { at, by, reason, ops (RFC 6902: add / replace / remove) } vào `patches` (chỉ thêm), chạy lại
 *                   tiền kiểm trên nguyên văn + mọi bản vá; mỗi bản vá giữ điểm và mã của lần thử đó (lịch sử lần thử, so hai lần).
 *   resubmitItem()  nguyên văn + bản vá → submitDocumentIn (cùng luật cửa nạp, không lối tắt). Còn lỗi chặn → trả 'blocked', không
 *                   nộp. Đạt → 'resubmitted' (hoặc 'accepted' khi có cảnh báo đã chấp nhận), event_id; sự việc mang
 *                   extra.intake = { inboxId, patched, acceptedCodes } — dấu lệch nguồn.
 *   acceptItem()    chấp nhận mã warn có `acceptable` (danh mục), vai trò trong bizcity.intake.accept_roles; mã block không
 *                   bao giờ chấp nhận được (T021-8). Lý do vào bằng chứng của action.
 *   dismissItem()   bỏ mục (documents:edit-all), có lý do.
 * Nguyên văn (`payload_raw`) không đổi ở mọi bước (R-INTAKE-7). Mục của khoá app không nộp lại thay app: sửa ở app (R-INTAKE-8).
 */
import { INTAKE_CATALOG, intakeScore, type IntakeCode, type IntakeFinding } from '@ketoan/contracts';
import { sql } from 'kysely';
import { Errors } from '@bizcity/platform/core/errors';
import type { AuthContext } from '@bizcity/platform/core/auth';
import type { Db } from '@bizcity/platform/db/client';
import { submitDocumentIn } from '../documents/document.service.js';
import { closeBySource, emitResolved } from './inbox.js';
import { preflight } from './preflight.js';

export interface PatchOp { op: 'add' | 'replace' | 'remove'; path: string; value?: unknown }
export interface PatchEntry { at: string; by: string; reason: string; ops: PatchOp[]; score: number; codes: string[]; fixed: string[]; added: string[] }

/** Vai trò mặc định được chấp nhận cảnh báo (bizcity.intake.accept_roles). */
export const DEFAULT_ACCEPT_ROLES = ['owner', 'chief_accountant'] as const;

const unescape = (s: string) => s.replace(/~1/g, '/').replace(/~0/g, '~');

/** Áp bản vá RFC 6902 (add / replace / remove) lên bản sao; đường sai → lỗi kiểm (không ném lỗi kỹ thuật). */
export function applyOps(base: unknown, ops: readonly PatchOp[]): unknown {
  let doc: unknown = structuredClone(base);
  for (const o of ops) {
    if (o.path === '') {
      if (o.op === 'remove') throw Errors.validation('Bản vá không xoá được cả chứng từ', [`${o.op} ""`]);
      doc = structuredClone(o.value);
      continue;
    }
    if (!o.path.startsWith('/')) throw Errors.validation('Đường bản vá phải bắt đầu bằng "/"', [o.path]);
    const keys = o.path.slice(1).split('/').map(unescape);
    const last = keys.pop()!;
    let cur: unknown = doc;
    for (const k of keys) {
      cur = cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[k] : undefined;
      if (!cur || typeof cur !== 'object') throw Errors.validation('Đường bản vá không có trong chứng từ', [o.path]);
    }
    if (Array.isArray(cur)) {
      const i = last === '-' ? cur.length : Number(last);
      if (!Number.isInteger(i) || i < 0 || i > cur.length || (o.op !== 'add' && i >= cur.length)) throw Errors.validation('Vị trí dòng trong bản vá không có', [o.path]);
      if (o.op === 'add') cur.splice(i, 0, structuredClone(o.value));
      else if (o.op === 'replace') cur[i] = structuredClone(o.value);
      else cur.splice(i, 1);
    } else {
      const obj = cur as Record<string, unknown>;
      if (o.op !== 'add' && !(last in obj)) throw Errors.validation('Trường trong bản vá không có trong chứng từ', [o.path]);
      if (o.op === 'remove') delete obj[last];
      else obj[last] = structuredClone(o.value);
    }
  }
  return doc;
}

type InboxRow = { id: string; actor: string; app_key: string | null; status: string; doc_key: string | null; payload_raw: unknown; patches: unknown; findings: unknown; accepted_codes: string[] };

const patchesOf = (row: InboxRow): PatchEntry[] => (Array.isArray(row.patches) ? (row.patches as PatchEntry[]) : []);
const codesOf = (f: readonly IntakeFinding[]) => [...new Set(f.map((x) => x.code))];

/** Chứng từ hiện hành của mục: nguyên văn + mọi bản vá theo thứ tự. */
export function currentDocument(row: Pick<InboxRow, 'payload_raw' | 'patches'>): unknown {
  return applyOps(row.payload_raw, patchesOf(row as InboxRow).flatMap((p) => p.ops));
}

async function lockOpen(trx: Db, auth: AuthContext, id: string): Promise<InboxRow> {
  const row = await trx.selectFrom('intake_inbox')
    .select(['id', 'actor', 'app_key', 'status', 'doc_key', 'payload_raw', 'patches', 'findings', 'accepted_codes'])
    .where('tenant_id', '=', auth.tenantId).where('id', '=', id).forUpdate().executeTakeFirst() as InboxRow | undefined;
  if (!row) throw Errors.notFound('mục bể chờ');
  if (row.status !== 'open') throw Errors.conflict(`Mục bể chờ đã đóng (${row.status}) — không sửa được nữa`);
  return row;
}

/** Người lập chỉ sửa / nộp lại mục của mình; mục của người khác cần documents:edit-all (20-KIEN-TRUC §10). */
function assertOwnerOrEditAll(auth: AuthContext, row: InboxRow): void {
  if (row.actor !== auth.actor && !auth.permissions.has('documents:edit-all')) throw Errors.forbidden('Mục bể chờ của người khác: cần quyền sửa mọi chứng từ (documents:edit-all)');
}

export async function patchItem(trx: Db, auth: AuthContext, id: string, ops: PatchOp[], reason: string) {
  const row = await lockOpen(trx, auth, id);
  assertOwnerOrEditAll(auth, row);
  if ((row.payload_raw as { truncated?: unknown } | null)?.truncated === true) throw Errors.validation('Nguyên văn quá 256 KB đã bị cắt — sửa ở nguồn rồi gửi lại', ['IN-SHAPE-007']);
  const before = codesOf(row.findings as IntakeFinding[]);
  const doc = applyOps(currentDocument(row), ops);
  // [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W5: sửa tại bể cũng định khoản thử (L5) khi L1–L4 đã sạch, để người sửa thấy ngay chỗ cấu hình còn thiếu
  const pf = await preflight(trx, auth, doc, { post: true });
  const codes = codesOf(pf.findings);
  const score = intakeScore(pf.findings, row.accepted_codes);
  const entry: PatchEntry = { at: new Date().toISOString(), by: auth.actor, reason, ops, score, codes, fixed: before.filter((c) => !codes.includes(c)), added: codes.filter((c) => !before.includes(c)) };
  await trx.updateTable('intake_inbox')
    .set({ patches: sql`patches || ${JSON.stringify([entry])}::jsonb`, findings: JSON.stringify(pf.findings), score, last_seen_at: new Date() })
    .where('id', '=', row.id).execute();
  return { id: row.id, findings: pf.findings, score, fixed: entry.fixed, added: entry.added, patchNo: patchesOf(row).length + 1, l5: pf.l5 };
}

export async function resubmitItem(trx: Db, auth: AuthContext, id: string, reason: string | undefined) {
  const row = await lockOpen(trx, auth, id);
  assertOwnerOrEditAll(auth, row);
  if (row.app_key) throw Errors.forbidden(`Mục của khoá app "${row.app_key}": sửa ở app rồi gửi lại (R-INTAKE-8) — kế toán không nộp thay app`);
  const doc = currentDocument(row);
  const pf = await preflight(trx, auth, doc);
  const score = intakeScore(pf.findings, row.accepted_codes);
  if (pf.findings.some((f) => f.severity === 'block')) {
    await trx.updateTable('intake_inbox').set({ findings: JSON.stringify(pf.findings), score, last_seen_at: new Date() }).where('id', '=', row.id).execute();
    return { status: 'blocked' as const, findings: pf.findings, score };
  }
  const patched = patchesOf(row).length > 0;
  const d = doc as Record<string, unknown>;
  const extra = d.extra && typeof d.extra === 'object' && !Array.isArray(d.extra) ? (d.extra as Record<string, unknown>) : {};
  const r = await submitDocumentIn(trx, auth, { ...d, extra: { ...extra, intake: { inboxId: row.id, patched, acceptedCodes: row.accepted_codes } } });
  if (r.status === 'unchanged') throw Errors.conflict('Sổ đã có chứng từ cùng docKey và phiên bản — tăng version (sửa ở bể hoặc ở nguồn) rồi nộp lại', ['IN-BIZ-005']);
  const ev = await trx.selectFrom('accounting_events').select('id').where('tenant_id', '=', auth.tenantId).where('doc_key', '=', r.docKey).executeTakeFirstOrThrow();
  const status = row.accepted_codes.length ? ('accepted' as const) : ('resubmitted' as const);
  await trx.updateTable('intake_inbox')
    .set({ status, event_id: ev.id, findings: JSON.stringify(pf.findings), score, resolved_at: new Date(), resolved_by: auth.actor, resolution_note: reason?.trim() || (patched ? 'Sửa tại bể, nộp lại' : 'Nộp lại') })
    .where('id', '=', row.id).execute();
  // [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W4 (S021-20): mục đóng → bizcity.intake.resolved
  await emitResolved(trx, auth.tenantId, auth.actor, { inboxId: row.id, docKey: r.docKey, status, eventId: String(ev.id), patched });
  await closeBySource(trx, auth.tenantId, r.docKey, auth.actor); // mục mở khác cùng docKey (lần gửi khác nội dung của nguồn)
  return { status, findings: pf.findings, score, eventId: String(ev.id), docKey: r.docKey, version: r.version, postStatus: r.status };
}

export async function acceptItem(trx: Db, auth: AuthContext, id: string, codes: string[], reason: string) {
  const t = await trx.selectFrom('tenants').select(sql<unknown>`settings #> '{intake,acceptRoles}'`.as('roles')).where('id', '=', auth.tenantId).executeTakeFirst();
  const roles = Array.isArray(t?.roles) ? (t.roles as string[]) : [...DEFAULT_ACCEPT_ROLES];
  if (!auth.role || !roles.includes(auth.role)) throw Errors.forbidden(`Vai trò của bạn không được chấp nhận cảnh báo (bizcity.intake.accept_roles: ${roles.join(', ')})`);
  const row = await lockOpen(trx, auth, id);
  const findings = row.findings as IntakeFinding[];
  const present = new Set<string>(findings.map((f) => f.code));
  const bad = codes.flatMap((c) => {
    const s = INTAKE_CATALOG[c as IntakeCode];
    if (!s) return [`${c}: mã không có trong danh mục`];
    if (s.severity === 'block') return [`${c}: lỗi chặn — không chấp nhận được, phải sửa`];
    if (s.severity !== 'warn' || !s.acceptable) return [`${c}: danh mục không cho chấp nhận mã này`];
    if (!present.has(c)) return [`${c}: mục không còn phát hiện này`];
    return [];
  });
  if (bad.length) throw Errors.validation('Không chấp nhận được các mã đã chọn', bad);
  const accepted = [...new Set([...row.accepted_codes, ...codes])];
  const score = intakeScore(findings, accepted);
  await trx.updateTable('intake_inbox').set({ accepted_codes: accepted, score, resolution_note: reason }).where('id', '=', row.id).execute();
  return { id: row.id, acceptedCodes: accepted, score };
}

export async function dismissItem(trx: Db, auth: AuthContext, id: string, reason: string) {
  const row = await lockOpen(trx, auth, id);
  await trx.updateTable('intake_inbox').set({ status: 'dismissed', resolved_at: new Date(), resolved_by: auth.actor, resolution_note: reason }).where('id', '=', row.id).execute();
  // [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W4 (S021-20): bỏ mục → bizcity.intake.resolved
  await emitResolved(trx, auth.tenantId, auth.actor, { inboxId: row.id, docKey: row.doc_key, status: 'dismissed', eventId: null, patched: patchesOf(row).length > 0 });
  return { id: row.id, status: 'dismissed' as const };
}
