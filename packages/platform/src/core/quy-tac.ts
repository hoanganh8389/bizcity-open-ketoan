// @bizcity-layer P actions
// [2026-11-19 Nguyễn Văn Thủy] lỗi theo bộ quy tắc khai báo (docs/nghiep-vu/25): mọi module ném lỗi có MÃ quy tắc + ô, giao diện tô đỏ, nhật ký HT19 ghi mã (đóng góp)
/**
 * QUY TẮC KHAI BÁO — cách dùng ở mọi module (danh mục, chứng từ):
 *
 *   import { quyTac, ruleFinding, ruleError } from '@bizcity/platform/core/quy-tac';
 *   if (dup) throw quyTac('PART-BLOCK-002', { code, name: dup.name }, 'conflict');      // một lỗi
 *
 *   const loi = [];                                                                      // nhiều lỗi: kiểm hết rồi báo một lần
 *   if (!name) loi.push(ruleFinding('ITEM-BLOCK-003'));
 *   if (loi.length) throw ruleError(loi);
 *
 * Mã khai ở packages/contracts/src/quy-tac/<danh-muc>.ts (hoặc catalog-hint.ts): title / why / fix / okText / field.
 * Phản hồi lỗi: error.details.findings[] (mã, ô, câu, cách sửa) + error.fields (tô đỏ) + requestId; bộ xử lý lỗi chung ghi nhật ký HT19.
 */
import { CATALOG_HINTS, catalogFinding, type CatalogFinding } from '@ketoan/contracts';
import { Errors } from './errors.js';

/** Một phát hiện theo mã quy tắc, kèm ô (field) khai ở quy tắc. */
export const ruleFinding = (code: string, vars: Record<string, string | number> = {}): CatalogFinding =>
  catalogFinding(code, vars, CATALOG_HINTS[code]?.field ? { field: CATALOG_HINTS[code]!.field } : {});

/** Lỗi gồm MỌI điều chưa đạt: message liệt kê câu + mã; details.findings cho giao diện; 'conflict' = 409 (trùng với dữ liệu đã có). */
export function ruleError(findings: CatalogFinding[], kind: 'validation' | 'conflict' = 'validation') {
  const msg = findings.length === 1 ? `${findings[0]!.title} (${findings[0]!.code})` : `${findings.length} điều chưa đạt: ${findings.map((f) => `${f.title} (${f.code})`).join(' · ')}`;
  return kind === 'conflict' ? Errors.conflict(msg, { findings }) : Errors.validation(msg, { findings });
}

/** Một lỗi theo mã quy tắc (dùng thay `Errors.validation('câu tự do')`). */
export const quyTac = (code: string, vars: Record<string, string | number> = {}, kind: 'validation' | 'conflict' = 'validation') => ruleError([ruleFinding(code, vars)], kind);
