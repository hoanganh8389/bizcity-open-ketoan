// [2026-11-02 03:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-20 / S020-21: kiểu, hook, nhãn 6 trạng thái và "Việc cần làm" dùng chung cho màn Kiểm chuẩn (HT06), Hồ sơ kế toán (HT07), cảnh báo ở màn lập chứng từ và khoá kỳ.
/**
 * Dữ liệu Kiểm chuẩn phía giao diện (ADR-0012). Nhãn trạng thái luôn có CHỮ, không chỉ màu; không có điểm % (T5).
 * "Việc cần làm" chỉ là link sang màn thao tác sẵn có — không có nút nào sửa sổ, tắt kiểm hay "bỏ qua" (20-KIEN-TRUC §5).
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export type CaseStatus = 'PASS' | 'FAIL' | 'ERROR' | 'NOT_APPLICABLE' | 'NOT_TESTED' | 'REVIEW_REQUIRED';
export type RunResult = 'PASS' | 'FAIL' | 'REVIEW_REQUIRED';
export type Layer = 'module' | 'configuration' | 'enterprise';

export interface ConformanceCase {
  id: string; version: string; priority: string; status: CaseStatus; reason: string; evidence: string[];
  layer?: Layer | null; title?: string | null; rulepack?: string;
  legal_basis?: { source_id: string; label: string; provision_ref: string | null; review_status: string }[];
}
export interface ConformanceRun {
  id: string; asOf: string; result: RunResult; layerResults: Partial<Record<Layer, RunResult>>; label: string; counts: Record<string, number>;
  profileVersion: number | null; kitVersion: string | null; kitHash: string; rulepacks: { id: string; version: string; status: string }[];
  cases: ConformanceCase[]; knownExclusions: { scope: string; reason: string }[]; disclaimer: string; actor: string; createdAt: string;
}
export interface RunSummary { id: string; asOf: string; result: RunResult; layerResults: Partial<Record<Layer, RunResult>>; counts: Record<string, number>; actor: string; createdAt: string }
export interface Advisory { code: string; title: string; why: string; count: number; sample: string[] }
export interface AdvisoryReply { context: { kind: 'document' | 'period' }; advisories: Advisory[]; latestRun: { id: string; result: RunResult; createdAt: string } | null }

export interface AccountingProfile { version: number; effectiveFrom: string; fiscalYearStartMonth: number; regime: string; entityType: string; note: string; createdBy: string; createdAt: string }
export interface ProfileReply { asOf: string; current: AccountingProfile | null; fiscalYear: { start: string; end: string } | null; history: AccountingProfile[] }

export const useLatestRun = () => useQuery({ queryKey: ['conformance', 'latest'], queryFn: () => api.get<ConformanceRun | null>('/api/v1/conformance/runs/latest') });
export const useRuns = () => useQuery({ queryKey: ['conformance', 'runs'], queryFn: () => api.get<RunSummary[]>('/api/v1/conformance/runs', { limit: 12 }) });
export const useProfile = () => useQuery({ queryKey: ['accounting-profile'], queryFn: () => api.get<ProfileReply>('/api/v1/accounting/profile') });

export const LAYERS: { key: Layer; label: string; question: string }[] = [
  { key: 'module', label: 'Module', question: 'Mã đang chạy có giữ đúng bất biến sổ và ranh giới module không?' },
  { key: 'configuration', label: 'Cấu hình', question: 'Cấu hình của đơn vị có đúng bộ quy định đang có hiệu lực với nó không?' },
  { key: 'enterprise', label: 'Doanh nghiệp', question: 'Tình trạng sổ sách thực tế theo kỳ có việc gì còn tồn không?' },
];

export const STATUS: Record<CaseStatus, { text: string; cls: string; hint: string }> = {
  PASS: { text: 'Đạt', cls: 'badge-ok', hint: 'có bằng chứng và rulepack đã duyệt' },
  FAIL: { text: 'Không đạt', cls: 'badge-bad', hint: 'bằng chứng cho thấy có chỗ sai' },
  ERROR: { text: 'Lỗi khi kiểm', cls: 'badge-bad', hint: 'kiểm không chạy được' },
  REVIEW_REQUIRED: { text: 'Chờ duyệt', cls: 'badge-warn', hint: 'chưa đủ căn cứ đã rà / chuyên gia chưa duyệt — không phải đạt' },
  NOT_TESTED: { text: 'Chưa kiểm được', cls: 'badge-gray', hint: 'không có bằng chứng chạy được trên bản cài' },
  NOT_APPLICABLE: { text: 'Không áp dụng', cls: 'badge-gray', hint: 'quy định không áp cho hồ sơ của đơn vị' },
};
export const STATUS_ORDER: CaseStatus[] = ['FAIL', 'ERROR', 'REVIEW_REQUIRED', 'NOT_TESTED', 'PASS', 'NOT_APPLICABLE'];

export const RESULT: Record<RunResult, { text: string; cls: string }> = {
  PASS: { text: 'Đạt', cls: 'badge-ok' },
  FAIL: { text: 'Có việc cần xử lý', cls: 'badge-bad' },
  REVIEW_REQUIRED: { text: 'Chờ duyệt / chưa đủ căn cứ', cls: 'badge-warn' },
};

export const REGIME_LABEL: Record<string, string> = {
  'vn-tt200-2014': 'Thông tư 200/2014 (phần còn áp dụng)',
  'vn-tt99-2025': 'Thông tư 99/2025 — doanh nghiệp',
  'vn-tt133-2016': 'Thông tư 133/2016 — nhỏ và vừa',
  'vn-tt152-2025': 'Thông tư 152/2025 — hộ, cá nhân kinh doanh',
};
export const ENTITY_LABEL: Record<string, string> = { enterprise: 'Doanh nghiệp', sme: 'Nhỏ và vừa', micro: 'Siêu nhỏ', household: 'Hộ kinh doanh' };

export interface Todo { label: string; path: string }
const PROFILE: Todo = { label: 'Hồ sơ kế toán', path: '/he-thong/ho-so-ke-toan' };
const CLOSE: Todo[] = [{ label: 'Tính giá vốn', path: '/nghiep-vu/tinh-gia-von' }, { label: 'Kết chuyển', path: '/nghiep-vu/ket-chuyen' }, { label: 'Khoá kỳ', path: '/cau-hinh/ky-ke-toan' }];

/** Việc cần làm theo mã cảnh báo (mã tự chẩn đoán, docs/ops/DIAGNOSTICS.md §2). */
export const TODO_BY_CODE: Record<string, Todo[]> = {
  PROFILE_DECLARED: [{ ...PROFILE, label: 'Khai hồ sơ kế toán' }],
  PROFILE_PACK_REGIME: [PROFILE],
  EVENT_PENDING_AGE: [{ label: 'Định khoản tự động (ACC14)', path: '/chung-tu' }],
  TAX_INPUT_NO_INVOICE: [{ label: 'Hoá đơn đầu vào của NCC', path: '/mua-hang/hoa-don-ncc' }],
  INVENTORY_NEGATIVE: [{ label: 'Nhập xuất tồn', path: '/bao-cao/nhap-xuat-ton' }],
  PERIOD_CLOSE_OPEN: CLOSE,
};

/** Việc cần làm theo ca (tiền tố id ca). Ca lớp Module: lỗi sổ báo nhóm Lõi, không có màn tự sửa. */
export function todoForCase(id: string): Todo[] {
  if (id.startsWith('vn.accounting-regimes-vn.')) return [PROFILE];
  if (id.startsWith('vn.enterprise-period-vn.input_vat.')) return TODO_BY_CODE.TAX_INPUT_NO_INVOICE!;
  if (id.startsWith('vn.enterprise-period-vn.events.')) return TODO_BY_CODE.EVENT_PENDING_AGE!;
  if (id.startsWith('vn.enterprise-period-vn.inventory.')) return TODO_BY_CODE.INVENTORY_NEGATIVE!;
  if (id.startsWith('vn.enterprise-period-vn.closing.')) return CLOSE;
  return [];
}

/** Ca có bằng chứng chạy được (để hiện độ phủ bằng chứng, T5) — không phải điểm. */
export const hasEvidence = (c: ConformanceCase) =>
  c.status !== 'NOT_APPLICABLE' && c.status !== 'NOT_TESTED' && !/kỹ thuật: NOT_TESTED/.test(c.reason);
