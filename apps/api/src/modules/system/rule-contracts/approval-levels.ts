// @bizcity-layer P module-sdk
// [2026-11-21 05:10 PM Võ Hoàng] PHASE-031 — S031-7 (31-S031-7 §1 mục 1): Rule Contract approval.levels@1 — dải tiền → các cấp duyệt (rút gọn 16 §5.1), thuần, tất định
/**
 * CẤP DUYỆT THEO SỐ TIỀN (approval.levels@1). Tham số là các dải tiền liền nhau, nửa mở `from ≤ số tiền < to` (PHASE-030 · 16 §5.1);
 * dải cuối không có `to` (tới vô cùng). Mỗi dải nêu các cấp phải duyệt theo thứ tự — mỗi cấp là một quyền (vd `payments:approve`).
 *
 *   band     = dải có from ≤ amount < to (dải cuối: from ≤ amount)
 *   levels   = band.levels;   count = số cấp
 *   amount âm / không phải số → indeterminate (không đoán)
 *
 * Nội dung KHÔNG ở sổ đăng ký: khoá ngưỡng ở `setting_values` (vd `bizcity.payment.approval_thresholds`), sổ đăng ký chỉ đánh chỉ mục
 * (`store = settings`, policy-settings-index.ts). `thresholdToBands` chuyển giá trị khoá ngưỡng của yêu cầu thanh toán thành dải — cùng
 * số cấp với `levelsFor` (phan-he/quy/payment-requests/payment-request.routes.ts): ngưỡng > 0 và số tiền ≥ ngưỡng → hai cấp, còn lại một cấp.
 */
import { z } from 'zod';
import type { RuleContract, Treatment } from './types.js';

const money = z.number().finite().min(0);
const level = z.object({
  /** Quyền người duyệt cấp này phải có (vd payments:approve). */
  permission: z.string().trim().min(1).max(64),
}).strict();
const band = z.object({
  from: money,
  /** Không có = tới vô cùng (chỉ dải cuối). */
  to: money.optional(),
  /** Rỗng = dải này không cần duyệt. */
  levels: z.array(level).max(10),
}).strict();

export const approvalLevelsParams = z.object({
  bands: z.array(band).min(1).max(20),
}).strict();
export type ApprovalLevelsParams = z.infer<typeof approvalLevelsParams>;
export interface ApprovalLevelsInput { amount: number }
export interface ApprovalLevelsOutput {
  /** Chỉ số dải khớp; -1 khi không xác định. */
  band: number;
  levels: { permission: string }[];
  count: number;
  indeterminate?: boolean;
}

export function evaluateApprovalLevels(p: ApprovalLevelsParams, input: ApprovalLevelsInput): ApprovalLevelsOutput {
  const amount = input?.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return { band: -1, levels: [], count: 0, indeterminate: true };
  const i = p.bands.findIndex((b) => b.from <= amount && (b.to === undefined || amount < b.to));
  if (i < 0) return { band: -1, levels: [], count: 0, indeterminate: true };
  const levels = p.bands[i]!.levels.map((l) => ({ permission: l.permission }));
  return { band: i, levels, count: levels.length };
}

/** Kiểm chéo: dải đầu từ 0, liền nhau (to của dải này = from của dải sau), tăng dần, chỉ dải cuối mở. */
export function approvalPublishChecks(p: ApprovalLevelsParams): { path: string; message: string }[] {
  const issues: { path: string; message: string }[] = [];
  const b = p.bands;
  if (b[0] && b[0].from !== 0) issues.push({ path: 'bands.0.from', message: 'Dải đầu phải bắt đầu từ 0 — số tiền nhỏ hơn không có cấp duyệt nào' });
  b.forEach((x, i) => {
    const last = i === b.length - 1;
    if (x.to !== undefined && x.to <= x.from) issues.push({ path: `bands.${i}.to`, message: `Dải ${i + 1}: "đến" (${x.to}) phải lớn hơn "từ" (${x.from})` });
    if (!last && x.to === undefined) issues.push({ path: `bands.${i}.to`, message: `Dải ${i + 1} không phải dải cuối nên phải có "đến"` });
    if (last && x.to !== undefined) issues.push({ path: `bands.${i}.to`, message: 'Dải cuối không có "đến" (tới vô cùng) — số tiền lớn hơn không có cấp duyệt nào' });
    const next = b[i + 1];
    if (next && x.to !== undefined && next.from !== x.to) {
      issues.push({ path: `bands.${i + 1}.from`, message: next.from < x.to ? `Dải ${i + 1} và ${i + 2} chồng nhau` : `Hở giữa dải ${i + 1} và ${i + 2} (${x.to} → ${next.from})` });
    }
    const perms = x.levels.map((l) => l.permission);
    if (new Set(perms).size !== perms.length) issues.push({ path: `bands.${i}.levels`, message: `Dải ${i + 1}: một quyền lặp ở hai cấp` });
  });
  return issues;
}

// ── Khoá ngưỡng của yêu cầu thanh toán → dải ─────────────────────────────────────────────────────────────────────────
/** Quyền duyệt cấp 1 / cấp 2 của yêu cầu thanh toán (payment-request.workflow.yaml, transitions.approve.levels). */
export const PAYMENT_LEVEL_1 = { permission: 'payments:approve' } as const;
export const PAYMENT_LEVEL_2 = { permission: 'payments:approve-final' } as const;

/**
 * Giá trị khoá `bizcity.payment.approval_thresholds` → dải. Cùng cách đọc với `secondLevelFrom` của yêu cầu thanh toán:
 * `Number(value ?? 0)`; > 0 là ngưỡng cấp hai, còn lại (0, không có, không phải số) = mọi yêu cầu một cấp.
 */
export function thresholdToBands(value: unknown): ApprovalLevelsParams {
  const v = Number(value ?? 0);
  if (!(v > 0)) return { bands: [{ from: 0, levels: [{ ...PAYMENT_LEVEL_1 }] }] };
  return { bands: [{ from: 0, to: v, levels: [{ ...PAYMENT_LEVEL_1 }] }, { from: v, levels: [{ ...PAYMENT_LEVEL_1 }, { ...PAYMENT_LEVEL_2 }] }] };
}

const one = thresholdToBands(0);
const two = thresholdToBands(2_000_000);
const out = (band: number, n: 1 | 2): ApprovalLevelsOutput => ({ band, levels: n === 1 ? [{ ...PAYMENT_LEVEL_1 }] : [{ ...PAYMENT_LEVEL_1 }, { ...PAYMENT_LEVEL_2 }], count: n });
const three: ApprovalLevelsParams = {
  bands: [
    { from: 0, to: 50_000_000, levels: [] },
    { from: 50_000_000, to: 200_000_000, levels: [{ permission: 'ban-hang:approve' }] },
    { from: 200_000_000, levels: [{ permission: 'ban-hang:approve' }, { permission: 'settings:write' }] },
  ],
};

/** Bộ ca chuẩn cho plugin viết lại; test chạy qua hàm thuần. */
export const approvalLevelsVectors = [
  { name: 'ngưỡng 0: mọi số tiền một cấp', params: one, input: { amount: 999_000_000 }, output: out(0, 1) },
  { name: 'ngưỡng 0: số tiền 0 vẫn một cấp', params: one, input: { amount: 0 }, output: out(0, 1) },
  { name: 'ngưỡng 2 tr: dưới ngưỡng một cấp', params: two, input: { amount: 1_999_999 }, output: out(0, 1) },
  { name: 'ngưỡng 2 tr: bằng ngưỡng hai cấp (nửa mở from ≤ số tiền < to)', params: two, input: { amount: 2_000_000 }, output: out(1, 2) },
  { name: 'ngưỡng 2 tr: trên ngưỡng hai cấp', params: two, input: { amount: 3_000_000 }, output: out(1, 2) },
  { name: 'ba dải (16 §5.1): dưới 50 tr không cần duyệt', params: three, input: { amount: 10_000_000 }, output: { band: 0, levels: [], count: 0 } },
  { name: 'ba dải: 120 tr một cấp', params: three, input: { amount: 120_000_000 }, output: { band: 1, levels: [{ permission: 'ban-hang:approve' }], count: 1 } },
  { name: 'ba dải: 200 tr hai cấp', params: three, input: { amount: 200_000_000 }, output: { band: 2, levels: [{ permission: 'ban-hang:approve' }, { permission: 'settings:write' }], count: 2 } },
  { name: 'số tiền âm: không xác định (không đoán)', params: two, input: { amount: -1 }, output: { band: -1, levels: [], count: 0, indeterminate: true } },
] satisfies Array<{ name: string; params: ApprovalLevelsParams; input: ApprovalLevelsInput; output: ApprovalLevelsOutput }>;

export const approvalLevels: RuleContract<ApprovalLevelsParams, ApprovalLevelsInput, ApprovalLevelsOutput> = {
  id: 'approval.levels@1',
  domain: 'approval',
  title: 'Cấp duyệt theo số tiền',
  params: approvalLevelsParams,
  publishChecks: approvalPublishChecks,
  window: () => ({}),
  evaluate: evaluateApprovalLevels,
  explain: (p, o) => {
    if (o.indeterminate) return 'Số tiền không hợp lệ (âm / không phải số) — không xác định được cấp duyệt';
    const b = p.bands[o.band]!;
    const range = b.to === undefined ? `từ ${b.from}` : `${b.from} ≤ số tiền < ${b.to}`;
    return o.count ? `Dải ${o.band + 1} (${range}) → ${o.count} cấp: ${o.levels.map((l) => l.permission).join(' → ')}` : `Dải ${o.band + 1} (${range}) → không cần duyệt`;
  },
  // Duyệt không sinh ghi nhận kế toán.
  treatment: (): Treatment[] => [],
  describe: () => ({
    params: [
      { name: 'bands', type: 'array (1..20) of { from, to?, levels[] }', required: true, doc: 'Các dải tiền liền nhau, tăng dần; dải đầu từ 0, dải cuối không có "to"' },
      { name: 'bands[].from', type: 'number ≥ 0', required: true, doc: 'Số tiền từ (gồm)' },
      { name: 'bands[].to', type: 'number ≥ 0', required: false, doc: 'Số tiền đến (không gồm); bỏ trống ở dải cuối = tới vô cùng' },
      { name: 'bands[].levels', type: 'array (0..10) of { permission }', required: true, doc: 'Các cấp duyệt theo thứ tự; rỗng = không cần duyệt' },
      { name: 'bands[].levels[].permission', type: 'string', required: true, doc: 'Quyền người duyệt cấp này phải có, vd payments:approve' },
    ],
    spec: {
      input: '{ amount: number } — số tiền của chứng từ (đ)',
      steps: [
        'amount không phải số hữu hạn hoặc < 0 → { band: -1, levels: [], count: 0, indeterminate: true }',
        'band = chỉ số dải đầu tiên có from ≤ amount và (to không có hoặc amount < to) — so nửa mở, một kiểu cho mọi nơi (16 §5.1)',
        'levels = bands[band].levels; count = số phần tử của levels',
      ],
      output: '{ band, levels[], count, indeterminate? }',
      note: 'Nội dung ở setting_values (store = settings); khoá bizcity.payment.approval_thresholds = N > 0 ↔ bands [{0, N, [payments:approve]}, {N, —, [payments:approve, payments:approve-final]}]; 0 / không có ↔ [{0, —, [payments:approve]}].',
    },
    vectors: approvalLevelsVectors,
  }),
};
