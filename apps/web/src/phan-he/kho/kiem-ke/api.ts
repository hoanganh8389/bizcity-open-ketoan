// [2026-11-12 03:30 PM kiennt] NT-KHO-002 — kiểm kê kho (KHO02): kiểu dữ liệu + gọi API /api/v1/kho/kiem-ke
import { api } from '@/lib/api';

export type KkStatus = 'draft' | 'recorded' | 'verified' | 'settled';
export type CauseKind = 'unknown' | 'compensate' | 'expense' | 'owned' | 'missing_receipt';
export interface KkLine {
  lineKey: string; sku: string; name: string; unit: string; lotNo: string; expDate?: string; actualExpDate?: string;
  bookQty: number; countedQty: number; poorQty: number; lostQty: number; newLot?: boolean; note?: string;
  diff?: number; expMismatch?: boolean;
}
export interface KkMember { name: string; title: string; represent: string }
export interface KkCause { lineKey: string; cause: CauseKind; qty: number; partnerCode?: string; receiptDocNo?: string; note?: string }
export interface KkDoc {
  id: string; docNo: string; countDate: string; branchCode: string; warehouseCode: string; quarantineWarehouse: string; purpose: string; conclusion: string;
  members: KkMember[]; lines: KkLine[]; status: KkStatus; statusText?: string; adjustDocKey?: string; transferDocKey?: string; recordedBy?: string | null;
  causes: KkCause[]; verifyNote: string; verifiedBy?: string | null; decisionNo: string; decisionDate: string | null; decisionSigner: string;
  decisionReasons: Partial<Record<'compensate' | 'expense' | 'owned', string>>; journalDocKey?: string; settledBy?: string | null;
  createdBy?: string | null; totals?: { bookQty: number; countedQty: number; diff: number; surplus: number; shortage: number; poorQty: number }; lineCount?: number;
}
export type KkInput = Pick<KkDoc, 'docNo' | 'countDate' | 'branchCode' | 'warehouseCode' | 'quarantineWarehouse' | 'purpose' | 'conclusion' | 'members' | 'lines'>;

export const CAUSE_TEXT: Record<CauseKind, string> = {
  unknown: 'Chưa rõ nguyên nhân', compensate: 'Cá nhân bồi thường', expense: 'Hao hụt — tính vào chi phí', owned: 'Thừa thuộc doanh nghiệp', missing_receipt: 'Do ghi thiếu phiếu nhập',
};
/** Nguyên nhân hợp với chênh lệch: thiếu (diff < 0) hay thừa (diff > 0). */
export const causesFor = (diff: number): CauseKind[] => (diff < 0 ? ['unknown', 'compensate', 'expense'] : ['unknown', 'owned', 'missing_receipt']);
export const STATUS_CLASS: Record<KkStatus, string> = { draft: 'badge-muted', recorded: 'badge-warn', verified: 'badge-info', settled: 'badge-ok' };

const B = '/api/v1/kho/kiem-ke';
export const kkApi = {
  list: (q: Record<string, string>) => api.get<KkDoc[]>(B, q),
  get: (id: string) => api.get<KkDoc>(`${B}/${id}`),
  book: (q: { branchCode: string; warehouse: string; date: string; exceptId?: string }) => api.get<{ warehouse: string; lines: KkLine[] }>(`${B}/so-ton`, q),
  create: (d: KkInput) => api.post<KkDoc>(B, d),
  update: (id: string, d: KkInput) => api.put<KkDoc>(`${B}/${id}`, d),
  record: (id: string) => api.post<KkDoc & { message?: string }>(`${B}/${id}/ghi-nhan`, {}),
  unrecord: (id: string, reason: string) => api.post<KkDoc>(`${B}/${id}/bo-ghi-nhan`, { reason }),
  verify: (id: string, b: { causes: KkCause[]; note: string }) => api.post<KkDoc>(`${B}/${id}/xac-minh`, b),
  decide: (id: string, b: { decisionNo: string; decisionDate: string; signer: string; reasons: KkDoc['decisionReasons'] }) => api.post<KkDoc>(`${B}/${id}/quyet-dinh`, b),
  undecide: (id: string, reason: string) => api.post<KkDoc>(`${B}/${id}/huy-quyet-dinh`, { reason }),
  journalReasons: () => api.get<{ code: string; name: string; kind: string; debitAccount: string | null; creditAccount: string | null; isActive?: boolean }[]>('/api/v1/posting/reasons'),
};

export const qty = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString('vi-VN', { maximumFractionDigits: 4 }));
export const viDate = (d?: string | null) => (d ? d.split('-').reverse().join('/') : '');
export const diffOf = (l: Pick<KkLine, 'countedQty' | 'bookQty'>) => Math.round((l.countedQty - l.bookQty) * 10000) / 10000;
