// @bizcity-layer K kernel/intake
// [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W5 (2.21, ADR-0014 D3; R-INTAKE-3/4/9, R-EVENT-11): L5 định khoản thử — chạy đường định khoản thật trong savepoint rồi hoàn tác, ánh xạ lỗi sang IN-POST-* / IN-BIZ-001; giới hạn thời gian + lượt
/**
 * L5 ĐỊNH KHOẢN THỬ (20-KIEN-TRUC §4): chỉ khi L1–L4 không còn lỗi chặn, chạy `postDocumentIn` với { post, force } như `preview()`
 * (R-EVENT-11) trong một savepoint rồi `ROLLBACK TO SAVEPOINT` — không còn sự việc, bút toán, dòng nhật ký hay sự kiện outbox nào
 * (T021-16). Không có lối nào để thử "bằng thật": hoàn tác nằm trong `finally`.
 *   - thời gian: `SET LOCAL statement_timeout = 3s` đặt SAU savepoint nên hoàn tác cùng savepoint (không rò sang phần còn lại của giao dịch);
 *   - lượt: tối đa TRIAL_LIMIT lần mỗi người mỗi phút (bộ nhớ tiến trình) — vượt thì bỏ qua L5 và báo `l5: 'rate'`, L1–L4 vẫn chạy;
 *   - lỗi nghiệp vụ (AppError) → phát hiện; hết giờ → IN-POST-005; lỗi kỹ thuật khác ném lên, không nuốt.
 * Lỗi định khoản đều là POSTING_FAILED nên phân loại theo mã lỗi + câu mở đầu của AccountResolver / ledger.service (một chỗ, có test).
 */
import { intakeFinding, type IntakeCode, type IntakeFinding, type IngestDocument } from '@ketoan/contracts';
import { sql } from 'kysely';
import { AppError } from '@bizcity/platform/core/errors';
import type { AuthContext } from '@bizcity/platform/core/auth';
import type { Db } from '@bizcity/platform/db/client';
import { postDocumentIn } from '../documents/document.service.js';

/** Số lần thử L5 tối đa mỗi người mỗi phút. */
export const TRIAL_LIMIT = 20;
const WINDOW_MS = 60_000;
const hits = new Map<string, number[]>();

/** Xin một lượt thử; false = đã hết lượt trong phút này. */
export function takeTrial(auth: Pick<AuthContext, 'tenantId' | 'actor'>, now = Date.now()): boolean {
  const key = `${auth.tenantId}:${auth.actor}`;
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= TRIAL_LIMIT) { hits.set(key, recent); return false; }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
/** Chỉ cho test. */
export function resetTrials(): void { hits.clear(); }

const cut = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Lỗi định khoản → phát hiện. `doc` chỉ dùng để nêu ngày chứng từ khi kỳ khoá. */
export function postingFindings(err: AppError, doc: Pick<IngestDocument, 'docDate'>): IntakeFinding[] {
  const f = (code: IntakeCode, path: string | null, got?: unknown, expected?: string) => [intakeFinding(code, path, { ...(got !== undefined ? { got } : {}), ...(expected ? { expected } : {}) })];
  if (err.code === 'PERIOD_LOCKED') return f('IN-BIZ-001', 'docDate', doc.docDate, 'ngày thuộc kỳ còn mở');
  if (err.code === 'UNBALANCED_ENTRY') return f('IN-POST-004', null, cut(err.message));
  const m = err.message;
  if (/^Lý do .+ chưa khai báo/.test(m) || m.startsWith('Chưa có lý do mặc định')) return f('IN-POST-001', 'reasonCode', cut(m));
  if (m === 'Thiếu cấu hình hạch toán') return f('IN-POST-002', null, Array.isArray(err.details) ? cut((err.details as string[]).slice(0, 5).join('; '), 240) : cut(m));
  if (m.startsWith('Chưa có nhóm hạch toán mặt hàng')) return f('IN-POST-003', 'lines', cut(m));
  if (m.startsWith('Bút toán không hợp lệ') || m.startsWith('Bút toán không có dòng')) return f('IN-POST-004', null, cut(m));
  return f('IN-POST-005', null, cut(m));
}

/** Định khoản thử một chứng từ đã qua L1–L4. Trả các phát hiện L5 (rỗng = định khoản được). */
export async function trialPosting(trx: Db, auth: AuthContext, doc: IngestDocument): Promise<IntakeFinding[]> {
  await sql`SAVEPOINT intake_l5`.execute(trx);
  try {
    await sql`SET LOCAL statement_timeout = '3s'`.execute(trx);
    await postDocumentIn(trx, auth, doc, { post: true, force: true });
    return [];
  } catch (err) {
    if (err instanceof AppError) return postingFindings(err, doc);
    if ((err as { code?: string } | null)?.code === '57014') return [intakeFinding('IN-POST-005', null, { got: 'quá 3 giây khi định khoản thử', expected: 'định khoản trong thời gian cho phép' })];
    throw err;
  } finally {
    await sql`ROLLBACK TO SAVEPOINT intake_l5`.execute(trx);
    await sql`RELEASE SAVEPOINT intake_l5`.execute(trx);
  }
}
