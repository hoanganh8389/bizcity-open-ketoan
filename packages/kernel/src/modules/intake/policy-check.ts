// @bizcity-layer K kernel/intake
// [2026-11-09 06:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2b (S031-29, chữ chốt PHASE-031 · 00 §14): IN-POL-004 — tính lại quà theo bản nguồn nêu, so với dòng quà nguồn gửi
// [2026-11-07 11:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2a (S031-9, chữ chốt PHASE-031 · 00 §8, ADR-0031 D-POL-6): L4 tham chiếu chính sách — IN-POL-001 / 002 / 003, kết quả lưu ở policy_check
/**
 * Kiểm THAM CHIẾU chính sách của một chứng từ (bizcity_ledger_intake@1 §3.1). Nguồn (POS, Woo, module…) tự tính theo bản chính
 * sách đã phát hành rồi gửi kèm `policyRefs`; ở đây chỉ hỏi sổ đăng ký (policy_registry, @bizcity/platform/core/policies):
 *   IN-POL-001  tham chiếu không có trong sổ, hoặc băm khác băm của bản đã phát hành, hoặc dòng trỏ key không có ở phiếu
 *   IN-POL-002  bản được nêu không phủ ngày chứng từ và không có bản mới hơn nào phủ (chưa áp, hoặc khoảng rỗng): sai ngày hoặc sai bản
 *   IN-POL-003  bản được nêu không phủ ngày chứng từ NHƯNG có bản MỚI HƠN phủ ngày đó (nguồn ngoại tuyến dùng bản cũ): làm mới chính sách
 *   IN-POL-004  tính lại quà theo ĐÚNG bản nguồn nêu (registerPolicyRecompute ở platform) khác dòng quà nguồn gửi: thiếu, thừa, hoặc lệch số lượng
 * Cả bốn là cảnh báo (warn, advice): cửa nạp vẫn nhận. Đơn vị đặt bizcity.intake.policy_check = strict thì sự việc có các mã này chờ duyệt
 * (document.service dùng `policyHold`) — không thêm trạng thái mới.
 *
 * Chỉ đọc. Một nguồn luật cho hai đường (R-INTAKE-4): preflight.ts và cửa nạp đều gọi `policyFindings`. Không đọc bảng của module chủ;
 * tính lại (IN-POL-004) đi qua hàm do apps/api đăng ký — chưa đăng ký hoặc không tính được thì im lặng.
 */
import { intakeFinding, type IngestDocument, type IntakeFinding, type PolicyRef } from '@ketoan/contracts';
import { listPolicyVersions, type PolicyEnvelope } from '@bizcity/platform/core/policies';
import type { Db } from '@bizcity/platform/db/client';
import { getSetting } from '@bizcity/platform/core/settings';
import { getPolicyVersion } from '@bizcity/platform/core/policies';
import { policyRecompute, type RecomputeLine } from '@bizcity/platform/core/policies';
import { sql } from 'kysely';

export const POLICY_CHECK_KEY = 'bizcity.intake.policy_check';
export type PolicyCheckMode = 'advice' | 'strict';

/** Một dòng kết quả theo từng tham chiếu — lưu vào policy_check và đọc lại ở khung nhìn policy_application. */
export interface PolicyRefResult { key: string; version: number; policyId: string | null; ok: boolean; codes: string[] }
/** Giá trị cột policy_check của sự việc (NULL = chứng từ không có policyRefs). */
export interface PolicyCheck { checkedAt: string; mode: PolicyCheckMode; findings: IntakeFinding[]; refs: PolicyRefResult[] }

type DocLine = { lineKey?: string; sku?: string; itemId?: string; qty?: number; isGift?: boolean; policyRef?: { key: string } };
type RefsDoc = { policyRefs?: PolicyRef[]; docDate?: string; branchCode?: string; channel?: string; lines?: DocLine[] };

const EPS = 1e-9;
const keyOf = (g: { sku: string; itemId?: string }) => g.itemId ?? g.sku;
const sumBy = (xs: { sku: string; itemId?: string; qty: number }[]) => { const m = new Map<string, number>(); for (const x of xs) m.set(keyOf(x), (m.get(keyOf(x)) ?? 0) + x.qty); return m; };

/**
 * So quà nguồn gửi với quà tính lại của MỘT chính sách. Chỉ xét dòng quà mang đúng `policyRef.key` của chính sách đó (quà của chính sách
 * khác hoặc quà tay không thuộc về nó). Trả các dòng lệch, rỗng = khớp.
 */
export function giftDiff(sent: { sku: string; itemId?: string; qty: number }[], expected: { sku: string; itemId?: string; qty: number }[]): { item: string; sent: number; expected: number }[] {
  const a = sumBy(sent), b = sumBy(expected);
  const out: { item: string; sent: number; expected: number }[] = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(k) ?? 0, y = b.get(k) ?? 0;
    if (Math.abs(x - y) > EPS) out.push({ item: k, sent: x, expected: y });
  }
  return out.sort((p, q) => p.item.localeCompare(q.item));
}

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
    const add = (code: 'IN-POL-001' | 'IN-POL-002' | 'IN-POL-003' | 'IN-POL-004', p: string, extra: { got?: unknown; expected?: string }) => { codes.push(code); findings.push(intakeFinding(code, p, extra)); };

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
    // IN-POL-004: chỉ khi bản có thật VÀ băm khớp (băm lệch đã là IN-POL-001, tính lại trên nội dung không tin được chỉ thêm tiếng ồn).
    if (mine && mine.contentHash === ref.hash && at) {
      const fn = policyRecompute();
      if (fn) {
        const all = Array.isArray(d.lines) ? d.lines : [];
        const input: RecomputeLine[] = all.filter((l) => !l.isGift && typeof l.sku === 'string' && typeof l.qty === 'number').map((l) => ({ ...(l.lineKey ? { lineKey: l.lineKey } : {}), sku: l.sku!, ...(l.itemId ? { itemId: l.itemId } : {}), qty: l.qty! }));
        const got = await fn(trx, { tenantId, envelope: mine, docDate: at, ...(d.branchCode ? { branchCode: d.branchCode } : {}), ...(d.channel ? { channel: d.channel } : {}), lines: input });
        if (got) {
          const sent = all.filter((l) => l.isGift && l.policyRef?.key === ref.key && typeof l.sku === 'string' && typeof l.qty === 'number').map((l) => ({ sku: l.sku!, ...(l.itemId ? { itemId: l.itemId } : {}), qty: l.qty! }));
          const diff = giftDiff(sent, got.gifts);
          if (diff.length) add('IN-POL-004', `policyRefs[${i}]`, { got: diff.map((x) => `${x.item}: nguồn ${x.sent}`).join('; '), expected: diff.map((x) => `${x.item}: tính lại ${x.expected}`).join('; ') + ` (theo ${ref.key}@${ref.version})` });
        }
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
