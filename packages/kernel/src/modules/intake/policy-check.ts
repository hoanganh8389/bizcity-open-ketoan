// @bizcity-layer K kernel/intake
// [2026-11-07 11:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2a (S031-9, chữ chốt PHASE-031 · 00 §8, ADR-0031 D-POL-6): L4 tham chiếu chính sách — IN-POL-001 / 002 / 003, kết quả lưu ở policy_check
/**
 * Kiểm THAM CHIẾU chính sách của một chứng từ (bizcity_ledger_intake@1 §3.1). Nguồn (POS, Woo, module…) tự tính theo bản chính
 * sách đã phát hành rồi gửi kèm `policyRefs`; ở đây chỉ hỏi sổ đăng ký (policy_registry, @bizcity/platform/core/policies):
 *   IN-POL-001  tham chiếu không có trong sổ, hoặc băm khác băm của bản đã phát hành, hoặc dòng trỏ key không có ở phiếu
 *   IN-POL-002  bản được nêu không phủ ngày chứng từ và không có bản mới hơn nào phủ (chưa áp, hoặc khoảng rỗng): sai ngày hoặc sai bản
 *   IN-POL-003  bản được nêu không phủ ngày chứng từ NHƯNG có bản MỚI HƠN phủ ngày đó (nguồn ngoại tuyến dùng bản cũ): làm mới chính sách
 * Cả ba là cảnh báo (warn, advice): cửa nạp vẫn nhận. Đơn vị đặt bizcity.intake.policy_check = strict thì sự việc có các mã này chờ duyệt
 * (document.service dùng `policyHold`) — không thêm trạng thái mới.
 *
 * Chỉ đọc. Một nguồn luật cho hai đường (R-INTAKE-4): preflight.ts và cửa nạp đều gọi `policyFindings`. Không tính lại kết quả chính
 * sách (W2b), không đọc bảng của module chủ — Kernel chỉ thấy phong bì ở sổ đăng ký.
 */
import { intakeFinding, type IngestDocument, type IntakeFinding, type PolicyRef } from '@ketoan/contracts';
import { listPolicyVersions, type PolicyEnvelope } from '@bizcity/platform/core/policies';
import type { Db } from '@bizcity/platform/db/client';
import { getSetting } from '@bizcity/platform/core/settings';
import { sql } from 'kysely';

export const POLICY_CHECK_KEY = 'bizcity.intake.policy_check';
export type PolicyCheckMode = 'advice' | 'strict';

/** Một dòng kết quả theo từng tham chiếu — lưu vào policy_check và đọc lại ở khung nhìn policy_application. */
export interface PolicyRefResult { key: string; version: number; policyId: string | null; ok: boolean; codes: string[] }
/** Giá trị cột policy_check của sự việc (NULL = chứng từ không có policyRefs). */
export interface PolicyCheck { checkedAt: string; mode: PolicyCheckMode; findings: IntakeFinding[]; refs: PolicyRefResult[] }

type RefsDoc = { policyRefs?: PolicyRef[]; docDate?: string; lines?: { policyRef?: { key: string } }[] };

const dayOf = (v: string | undefined): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);
const covers = (e: PolicyEnvelope, at: string) => (e.effectiveFrom === null || e.effectiveFrom <= at) && (e.effectiveTo === null || e.effectiveTo >= at);

/**
 * Bản của `key` mà nguồn trỏ tới: ưu tiên `policyId` (định danh ổn định); không có thì tìm theo mã trong các bản đã đăng ký.
 * Một mã có thể trùng giữa hai chính sách khác nguồn — khi đó cần policyId, nếu không IN-POL-001.
 */
async function versionsOf(trx: Db, tenantId: string, ref: PolicyRef): Promise<{ versions: PolicyEnvelope[]; ambiguous: boolean }> {
  if (ref.policyId) return { versions: await listPolicyVersions(trx, tenantId, ref.policyId), ambiguous: false };
  const ids = (await sql<{ policy_id: string }>`SELECT DISTINCT policy_id FROM policy_registry WHERE tenant_id = ${tenantId} AND policy_key = ${ref.key}`.execute(trx)).rows;
  if (ids.length !== 1) return { versions: [], ambiguous: ids.length > 1 };
  return { versions: await listPolicyVersions(trx, tenantId, ids[0]!.policy_id), ambiguous: false };
}

/**
 * Phát hiện về tham chiếu chính sách. Chứng từ không có `policyRefs` (và không dòng nào có `policyRef`) → [] và `check = null`:
 * như hôm nay, không ghi gì (T031-INT-7).
 */
export async function policyFindings(trx: Db, tenantId: string, doc: IngestDocument | Record<string, unknown>): Promise<{ findings: IntakeFinding[]; check: PolicyCheck | null }> {
  const d = doc as RefsDoc;
  const refs = Array.isArray(d.policyRefs) ? d.policyRefs : [];
  const lineRefs = Array.isArray(d.lines) ? d.lines.map((l, n) => ({ n, key: l?.policyRef?.key })).filter((x): x is { n: number; key: string } => typeof x.key === 'string') : [];
  if (!refs.length && !lineRefs.length) return { findings: [], check: null };

  const mode = await policyCheckMode(trx, tenantId);
  const at = dayOf(d.docDate);
  const findings: IntakeFinding[] = [];
  const results: PolicyRefResult[] = [];
  const declared = new Set(refs.map((r) => r.key));

  // Dòng trỏ một key mà phiếu không khai ở policyRefs: không truy vết được về bản nào.
  for (const l of lineRefs) if (!declared.has(l.key)) findings.push(intakeFinding('IN-POL-001', `lines[${l.n}].policyRef.key`, { got: l.key, expected: 'một key có trong policyRefs của phiếu' }));

  for (const [i, ref] of refs.entries()) {
    const path = `policyRefs[${i}]`;
    const codes: string[] = [];
    const add = (code: 'IN-POL-001' | 'IN-POL-002' | 'IN-POL-003', p: string, extra: { got?: unknown; expected?: string }) => { codes.push(code); findings.push(intakeFinding(code, p, extra)); };

    const { versions, ambiguous } = await versionsOf(trx, tenantId, ref);
    const mine = versions.find((v) => v.version === ref.version);
    if (!mine) {
      add('IN-POL-001', path, { got: `${ref.key}@${ref.version}`, expected: ambiguous ? 'policyId của chính sách (mã này trùng ở nhiều chính sách)' : 'một bản đã phát hành ở sổ đăng ký chính sách' });
    } else {
      if (mine.contentHash !== ref.hash) add('IN-POL-001', `${path}.hash`, { got: ref.hash.slice(0, 12) + '…', expected: `băm của bản ${ref.version} (${mine.contentHash.slice(0, 12)}…)` });
      if (at && !covers(mine, at)) {
        // Bản gửi không phủ ngày chứng từ. Có bản MỚI HƠN phủ ngày đó → nguồn dùng bản cũ (thường ngoại tuyến), hướng dẫn làm mới
        // (IN-POL-003); không có bản nào phủ → bản chưa áp hoặc khoảng rỗng, sai ngày hoặc sai bản (IN-POL-002). Sổ đăng ký bảo đảm
        // mỗi ngày đúng một bản (T031-TR-2), nên hai mã không bao giờ cùng báo cho một tham chiếu.
        const newer = versions.filter((v) => v.version > ref.version && covers(v, at)).sort((a, b) => b.version - a.version)[0];
        if (newer) add('IN-POL-003', `${path}.version`, { got: ref.version, expected: `${newer.version} (hiệu lực ngày ${at})` });
        else add('IN-POL-002', `${path}.version`, { got: `${ref.key}@${ref.version} áp ${mine.effectiveFrom ?? 'từ đầu'} → ${mine.effectiveTo ?? 'chưa đóng'}`, expected: `bản hiệu lực ngày ${at}` });
      }
    }
    results.push({ key: ref.key, version: ref.version, policyId: ref.policyId ?? mine?.policyId ?? null, ok: codes.length === 0, codes });
  }
  return { findings, check: { checkedAt: new Date().toISOString(), mode, findings, refs: results } };
}

/** Chế độ kiểm của đơn vị: advice (mặc định — vẫn ghi sổ) hoặc strict (có IN-POL-* thì chờ duyệt). */
export async function policyCheckMode(trx: Db, tenantId: string): Promise<PolicyCheckMode> {
  const v = (await getSetting(trx, tenantId, POLICY_CHECK_KEY)).value;
  return v === 'strict' ? 'strict' : 'advice';
}

/** Sự việc này có phải chờ duyệt vì chính sách không: chế độ strict và còn ít nhất một IN-POL-*. */
export const policyHold = (check: PolicyCheck | null): boolean => check?.mode === 'strict' && check.findings.some((f) => f.code.startsWith('IN-POL-'));
