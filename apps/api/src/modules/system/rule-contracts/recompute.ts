// @bizcity-layer P module-sdk
// [2026-11-09 06:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2b (S031-29, chữ chốt PHASE-031 · 00 §14): hàm tính lại quà theo đúng bản nguồn nêu, đăng ký cho cửa nạp (Kernel)
/**
 * Tính lại quà của MỘT bản chính sách trên các dòng không phải quà. Cùng luật với `evaluatePolicies` (POS gọi qua API) — một khuôn, ra cùng kết quả.
 * Trả null khi không tính được; cửa nạp im lặng (không đoán): nội dung ở module chủ, khuôn không có quà, nội dung sai khuôn, ngoài phạm vi
 * chi nhánh / kênh, ngoài cửa sổ chiến dịch trong nội dung.
 *
 * [2026-11-12 09:30 PM Võ Hoàng] POS-KM — PHASE-031 · 00 §17 mục 2 (đóng góp): bản `store = module` (chương trình bán BH12) đọc qua bộ đọc của
 * module chủ (khớp băm) — cửa nạp tính lại được quà của BH12; bản đã bị sửa đè thì vẫn null.
 */
import type { Db } from '@bizcity/platform/db/client';
import { getPolicyVersion, registerPolicyRecompute, type RecomputeRequest, type RecomputeResult } from '@bizcity/platform/core/policies';
import { getRuleContract, policyContent } from './index.js';

const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.length > 0) : []);

export async function recomputeGifts(trx: Db, req: RecomputeRequest): Promise<RecomputeResult | null> {
  const { envelope: e } = req;
  const contract = getRuleContract(e.ruleContract);
  if (!contract) return null;
  const full = e.store === 'inline' ? await getPolicyVersion(trx, req.tenantId, e.policyId, e.version) : undefined;
  const content = await policyContent(trx, req.tenantId, e, full?.content);
  if (content == null) return null;
  const parsed = contract.params.safeParse(content);
  if (!parsed.success) return null;
  const w = contract.window(parsed.data);
  if ((w.from && w.from > req.docDate) || (w.to && w.to < req.docDate)) return null;
  const scope = (e.scope ?? {}) as Record<string, unknown>;
  const branches = arr(scope.branchCodes), channels = arr(scope.channels);
  if (branches.length && (!req.branchCode || !branches.includes(req.branchCode))) return null;
  if (channels.length && (!req.channel || !channels.includes(req.channel))) return null;
  // [2026-11-13 10:20 AM Võ Hoàng] POS-KM2 — 00 §18 mục 4: điều kiện cửa nạp không biết (giờ, mã, khách) coi như đạt; khuôn cần tiền mà dòng không có giá → không so.
  const result = contract.evaluate(parsed.data, { lines: req.lines.map((l, n) => ({ lineKey: l.lineKey ?? String(n), sku: l.sku, qty: l.qty, ...(l.itemId ? { itemId: l.itemId } : {}) })), context: { lenient: true, docDate: req.docDate } }) as { gifts?: { sku: string; itemId?: string; qty: number }[]; indeterminate?: boolean };
  if (result?.indeterminate) return null;
  return Array.isArray(result?.gifts) ? { gifts: result.gifts } : null;
}

registerPolicyRecompute(recomputeGifts);
