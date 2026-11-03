// @bizcity-layer K kernel/tax
// [2026-11-03 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-8: tách luật kiểm thuế GTGT / hoá đơn thành hàm theo MỘT chứng từ, dùng chung cho tự chẩn đoán (tax.diagnostics.ts) và Trạm tiền kiểm (intake/tax-findings.ts, PHASE-021 S021-25) — một nguồn luật
/**
 * Luật thuế GTGT / hoá đơn cho một chứng từ, tách khỏi SQL quét cả kỳ của tax.diagnostics.ts. Hàm thuần, không đọc CSDL:
 *   - thuế suất giảm: số liệu LUẬT (thuế suất + khoảng ngày) đọc từ tham số ca vn.vat-vn.rate.reduced_window.001 của rulepack,
 *     không viết cứng ở đây (R-VNC-3);
 *   - hoá đơn thiếu trường: dùng lại `taxIssues` của màn Bổ sung thông tin thuế (ACC78), không viết lại;
 *   - lập hoá đơn sau ngày giao: không có số liệu luật.
 * Mức cảnh báo (warn) và quyết định xử lý là của người dùng (R-VNC-10): hàm chỉ trả điều kiện.
 */
import { caseParams } from '../conformance/conformance.service.js';
import { taxIssues } from './tax-info.service.js';

/** Ca chứa tham số thời gian áp thuế suất giảm (NQ 204/2025/QH15). */
export const REDUCED_RATE_CASE = 'vn.vat-vn.rate.reduced_window.001';

export interface ReducedRateWindow { rate: number; from: string; to: string }

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Thuế suất giảm + khoảng ngày áp dụng. Tham số hỏng → ném lỗi (kiểm ra mức error, không đoán). */
export function reducedRateWindow(): ReducedRateWindow {
  const p = caseParams(REDUCED_RATE_CASE);
  const rate = Number(p.reduced_rate);
  const from = String(p.from);
  const to = String(p.to);
  if (!Number.isFinite(rate) || !ISO.test(from) || !ISO.test(to)) throw new Error(`Tham số ca ${REDUCED_RATE_CASE} không hợp lệ`);
  return { rate, from, to };
}

/** Ngày chứng từ nằm ngoài khoảng được dùng thuế suất giảm. */
export const outsideReducedWindow = (docDate: string, w: ReducedRateWindow): boolean => docDate.slice(0, 10) < w.from || docDate.slice(0, 10) > w.to;

/** Hoá đơn bán hàng hoá lập SAU ngày chứng từ bán (thời điểm chuyển giao). */
export const invoiceIssuedAfterDelivery = (invoiceDate: string, docDate: string): boolean => invoiceDate.slice(0, 10) > docDate.slice(0, 10);

/** Các điểm của `taxIssues` thuộc nhóm "trường hoá đơn" (INVOICE_FIELDS). */
export const FIELD_ISSUES: ReadonlySet<string> = new Set(['Thiếu ký hiệu hoá đơn', 'Thiếu tên người bán', 'Thiếu mã số thuế người bán', 'Mã số thuế không đúng dạng']);
/** Nhóm "thiếu" (không gồm sai dạng mã số thuế — phần đó đã có mã riêng ở tiền kiểm: IN-MD-005). */
export const MISSING_FIELD_ISSUES: ReadonlySet<string> = new Set(['Thiếu ký hiệu hoá đơn', 'Thiếu tên người bán', 'Thiếu mã số thuế người bán']);

/** Điểm còn thiếu của trường hoá đơn một chứng từ, đúng cách `taxIssues` đếm. */
export function invoiceFieldIssues(r: { direction: 'input' | 'output'; serial: string; name: string; taxCode: string }, only: ReadonlySet<string> = FIELD_ISSUES): string[] {
  return taxIssues({ ...r, hasInvoice: true, total: 0, deductible: false, paymentRef: '', sign: 1, invoiceDate: '', declareDate: null }).filter((x) => only.has(x));
}
