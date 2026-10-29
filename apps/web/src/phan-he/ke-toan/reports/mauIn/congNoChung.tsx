/**
 * Phần dùng chung của các mẫu in báo cáo công nợ (ACC38, ACC61, ACC39, ACC48, ACC67, ACC68):
 * chi nhánh in ở đầu sổ, dòng thông tin lọc, sáu cột số dư đầu kỳ / phát sinh / số dư cuối kỳ (Nợ, Có).
 */
import { mb, type LedgerCol, type PrintCtx, type Row, type Sign } from '@/components/print';

/** Lọc đúng một chi nhánh thì in tên chi nhánh ở đầu sổ. */
export const oneBranch = (codes: string) => (codes && !codes.includes(',') ? codes : undefined);
/** Dòng "Chi nhánh" khi lọc nhiều chi nhánh. */
export const branchInfo = (codes: string, ctx: PrintCtx): Row[] => (codes.includes(',') ? [['Chi nhánh', codes.split(',').map((c) => ctx.branchName(c) || c).join(', ')]] : []);
/** Ký tên như các báo cáo công nợ HTsoft. */
export const REPORT_SIGNS: Sign[] = [{ title: 'Người lập biểu' }, { title: 'Kế toán trưởng' }, { title: 'Giám đốc', note: '(Ký, họ tên, đóng dấu)' }];

export interface Amounts { openingDebit: number; openingCredit: number; debit: number; credit: number; closingDebit: number; closingCredit: number }
/** Sáu cột Số dư đầu kỳ / Phát sinh trong kỳ / Số dư cuối kỳ, mỗi nhóm Nợ, Có; có dòng cộng. */
export function amountCols<R extends Amounts>(w = 92): LedgerCol<R>[] {
  const c = (key: keyof Amounts, h: string, group: string): LedgerCol<R> => ({ key, h, group, w, num: true, v: (r) => mb(r[key]), sum: (r) => r[key] });
  return [
    c('openingDebit', 'Nợ', 'Số dư đầu kỳ'), c('openingCredit', 'Có', 'Số dư đầu kỳ'),
    c('debit', 'Nợ', 'Phát sinh trong kỳ'), c('credit', 'Có', 'Phát sinh trong kỳ'),
    c('closingDebit', 'Nợ', 'Số dư cuối kỳ'), c('closingCredit', 'Có', 'Số dư cuối kỳ'),
  ];
}
