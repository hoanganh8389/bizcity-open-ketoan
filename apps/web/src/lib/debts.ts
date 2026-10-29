/** Khoản công nợ (GET /api/v1/debt-items) — kiểu dùng chung cho màn công nợ (Kế toán) và đề nghị thanh toán (Quỹ). */
export interface DebtItem {
  id: string; documentId: string; docKey: string; docType: string; purpose: string | null; docNo: string; docDate: string; dueDate: string; description: string;
  partnerCode: string; partnerName: string; branchCode: string; accountCode: string; side: 'debit' | 'credit'; amount: number; settled: number; remaining: number; overdueDays: number;
}
