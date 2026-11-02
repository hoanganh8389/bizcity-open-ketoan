// @bizcity-layer K kernel/conformance
// [2026-11-02 02:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — Posting Gate chỉ thông tin (S020-21, ADR-0012 T3 / T4): cảnh báo cho chứng từ đang lập và cho kỳ sắp khoá, tính ngoài giao dịch ghi sổ, dùng lại kiểm tự chẩn đoán.
/**
 * POSTING GATE — CẢNH BÁO, KHÔNG CHẶN (ADR-0012 §3, T3, T4; R-VNC-10).
 *
 *   advisoriesFor(trx, tenant, { kind: 'document', date })   lúc lập / duyệt chứng từ: kiểm L5 (hồ sơ kế toán, gói cùng chế độ) áp cho ngày chứng từ
 *   advisoriesFor(trx, tenant, { kind: 'period', year, month }) trước khoá kỳ: L5 tại cuối tháng + kiểm L3 trạng thái theo kỳ của đúng tháng đó
 *                                                               (hoá đơn đầu vào chờ, sự việc treo, tồn kho âm) + việc cuối kỳ còn thiếu
 *
 * Mỗi kiểm chạy trong giao dịch READ ONLY riêng của runDiagnostics — không nằm trong giao dịch ghi sổ, postDocumentIn không đổi (T4).
 * Kết quả chỉ để người dùng đọc "Vì sao" và quyết định tiếp hay dừng; không có cấu hình nào biến cảnh báo thành từ chối.
 * Người tiếp tục thì màn gọi core.conformance.acknowledge (bằng chứng, T3). Không số tiền trong cảnh báo (R-DIAG-6).
 */
// [2026-11-02 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1: cảnh báo trả kèm remedy có cấu trúc của kiểm (bizcity_remedy@1).
import type { Remedy } from '@ketoan/contracts';
import { runDiagnostics, type DiagResult } from '@bizcity/platform/system/diagnostics';
import type { Db } from '@bizcity/platform/db/client';
import { PERIOD_DIAGNOSTICS, periodCloseGaps } from '../periods/period.diagnostics.js';
import { latestRun } from './conformance.service.js';

/** Kiểm L3 trạng thái theo kỳ dùng cho cảnh báo trước khoá kỳ (lớp Doanh nghiệp, C09). */
export const PERIOD_ADVISORY_CODES = ['TAX_INPUT_NO_INVOICE', 'EVENT_PENDING_AGE', 'INVENTORY_NEGATIVE'] as const;

export interface Advisory {
  code: string;
  title: string;
  /** Hậu quả + cách xử lý (câu `fix` của kiểm). */
  why: string;
  /** Phương án khắc phục có cấu trúc (bizcity_remedy@1). */
  remedy?: Remedy;
  count: number;
  /** Khoá chứng từ / mã hàng / chi nhánh:kỳ — không số tiền. */
  sample: string[];
}

export type AdvisoryContext =
  | { kind: 'document'; date: string }
  | { kind: 'period'; year: number; month: number; branchId?: string };

const pad = (n: number) => String(n).padStart(2, '0');
const lastDay = (y: number, m: number) => `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
const flagged = (c: DiagResult) => c.count > 0 && c.level !== 'pass' && c.level !== 'empty';
const fromCheck = (c: DiagResult): Advisory => ({ code: c.code, title: c.title, why: c.fix, remedy: c.remedy, count: c.count, sample: c.sample.slice(0, 10) });

export async function advisoriesFor(trx: Db, tenantId: string, c: AdvisoryContext) {
  const advisories: Advisory[] = [];
  if (c.kind === 'document') {
    const l5 = await runDiagnostics({ tenantId, to: c.date }, { layer: 'L5' });
    advisories.push(...l5.checks.filter(flagged).map(fromCheck));
  } else {
    const from = `${c.year}-${pad(c.month)}-01`;
    const to = lastDay(c.year, c.month);
    const l5 = await runDiagnostics({ tenantId, to }, { layer: 'L5' });
    const l3 = await runDiagnostics({ tenantId, from, to, branchId: c.branchId }, { layer: 'L3', codes: [...PERIOD_ADVISORY_CODES] });
    advisories.push(...l5.checks.filter(flagged).map(fromCheck), ...l3.checks.filter(flagged).map(fromCheck));
    const gaps = await periodCloseGaps(trx, { tenantId, branchId: c.branchId }, from);
    if (gaps.length) {
      advisories.push({
        code: 'PERIOD_CLOSE_OPEN',
        title: 'Việc cuối kỳ của tháng chưa xong theo thứ tự: tính giá vốn, kết chuyển',
        why: 'Mẫu: <chi nhánh>:<YYYY-MM>:<việc còn thiếu>. gia-von: có hàng xuất mà chưa có phiếu giá vốn tháng. ket-chuyen: còn số doanh thu / chi phí theo bộ quy tắc kết chuyển. thu-tu: giá vốn tính lại sau kết chuyển, cần chạy lại kết chuyển. Khoá kỳ khi còn thiếu thì báo cáo tháng này sai cho tới khi mở khoá làm lại.',
        remedy: PERIOD_DIAGNOSTICS.find((d) => d.code === 'PERIOD_CLOSE_OPEN')?.remedy,
        count: gaps.length, sample: gaps.slice(0, 10),
      });
    }
  }
  const run = await latestRun(trx, tenantId);
  return {
    advisories,
    latestRun: run ? { id: String(run.id), result: run.result, createdAt: new Date(run.created_at).toISOString() } : null,
  };
}
