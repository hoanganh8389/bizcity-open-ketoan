// @bizcity-layer P module-sdk
// [2026-11-21 09:20 AM Võ Hoàng] PHASE-031 — S031-11 (chữ chốt PHASE-031 · 30-S031-11): purchase.<loại>@1 — Rule Contract bọc bộ máy mua hàng, gọi lại engine.ts, không viết lại công thức
/**
 * CHÍNH SÁCH MUA HÀNG (purchase.<loại>@1) — mỗi `PolicyKind` của `@bizcity/mua-hang-domain` một Rule Contract cùng khuôn với hợp đồng bán.
 *
 * Tham số = nội dung một bản chính sách mua hàng ở sổ đăng ký (ảnh chụp `policySnapshot` của module mua hàng: code, kind, name, scope,
 * rule, isActive, validFrom, validTo, priority). `rule` để `passthrough` — khoá lạ giữ nguyên để engine đọc như cũ (không đổi kết quả).
 *
 * Ba cách tính (ghi ở `describe().spec.mode`):
 *   compute  loại tính trên chứng từ: evaluate GỌI LẠI engine (`computeDoc`, `giftPlan`, `rebateFor`) với đúng một chính sách — số ra là số
 *            của engine, từng đồng (test hồi quy phase-031-purchase-contracts.test.ts);
 *   check    loại tham số có hàm kiểm / hạn ở engine: `credit_limit` → `creditStatus`, `payment_term` → `termFromRule` + `dueDateFor`;
 *   describe loại tham số không có hàm tính ở engine (`supply_target`, `lot_tracking`, `gift_budget`): evaluate chỉ trả lại tham số đã
 *            chuẩn hoá — việc so với thực tế do module mua hàng làm (báo cáo, checkDoc), không viết lại ở đây.
 *
 * Giới hạn có chủ đích (30-S031-11 §2): không phát hành inline (module mua hàng làm chủ `mua-hang.policy:<id>`); không tính lại ở cửa nạp
 * (L4b cho chứng từ mua là đợt sau). `treatment` rỗng: hạch toán mua hàng đi theo bảng hạch toán của module, không qua reasonCode ở đây.
 * Phạm vi / hiệu lực / áp riêng: compute đi trọn đường engine (policyApplies, exclusiveBySku…); check / describe không xét phạm vi —
 * người gọi chọn bản theo sổ đăng ký.
 */
import { z } from 'zod';
import {
  computeDoc, creditStatus, dueDateFor, giftPlan, rebateFor, termFromRule, termText, POLICY_LABEL,
  type CreditStatus, type DocCalc, type GiftPlanRow, type LineType, type PaymentTerm, type PDoc, type Policy, type PolicyKind, type ProductUnit, type RebateResult, type TraceItem,
} from '@bizcity/mua-hang-domain';
import type { FieldDoc, PublishIssue, RuleContract, Treatment, Vector } from './types.js';

/* ------------------------------------------------------------------ khuôn tham số */

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');
const str = z.string().max(64);
const money = z.number().finite().min(0);
const pct = z.number().finite().min(0).max(100);
const applyMode = z.enum(['exclusive', 'together']);
const branchMoney = z.record(z.string(), money);

/** Phạm vi như `Scope` của engine. `passthrough`: khoá lạ giữ nguyên. */
const scopeSchema = z.object({
  partnerCode: str.optional(), brandCode: str.optional(), sku: str.optional(), branchCode: str.optional(),
  branchCodes: z.array(z.string().min(1).max(64)).max(2000).optional(), withChildren: z.boolean().optional(), contractCode: str.optional(),
}).passthrough();

const tierPct = z.object({ from: money, pct }).passthrough();
const REBATE_PARTIES = { family: z.boolean().nullish(), payer: str.nullish(), receiver: str.nullish() };

/** Khuôn `rule` từng loại — cùng ý với RULE_SCHEMAS của module mua hàng nhưng không biến đổi giá trị (không default, không transform). */
const RULES = {
  trade_discount: z.object({ pct: pct.nullish(), amount: money.nullish(), minOrder: money.nullish(), repeat: z.boolean().nullish(), apply: applyMode.nullish() }).passthrough(),
  item_discount: z.object({
    items: z.array(z.object({
      sku: z.string().min(1).max(64), pct: pct.nullish(), amount: money.nullish(), unit: z.string().max(32).nullish(), minQty: money.nullish(),
      note: z.string().max(200).nullish(), apply: applyMode.nullish(), priority: z.number().int().nullish(),
    }).passthrough()).min(1).max(10000),
    apply: applyMode.nullish(),
  }).passthrough(),
  qty_tier: z.object({ tiers: z.array(tierPct).min(1), apply: applyMode.nullish() }).passthrough(),
  payment_discount: z.object({ pct }).passthrough(),
  promo_gift: z.object({
    splitIntoCost: z.boolean().nullish(),
    items: z.array(z.object({
      sku: z.string().max(64), buyQty: z.number().finite().positive(), buyUnit: z.string().max(32).nullish(), giftSku: z.string().max(64).nullish(),
      getQty: z.number().finite().positive(), getUnit: z.string().max(32).nullish(), repeat: z.boolean().nullish(), apply: applyMode.nullish(),
      note: z.string().max(300).nullish(), buyRatios: z.record(z.string(), z.number().finite()).nullish(), giftRatios: z.record(z.string(), z.number().finite()).nullish(),
    }).passthrough()).max(5000).nullish(),
    buy: z.number().finite().positive().nullish(), get: z.number().finite().positive().nullish(), giftSku: z.string().max(64).nullish(),
    repeat: z.boolean().nullish(), apply: applyMode.nullish(),
  }).passthrough(),
  period_rebate: z.object({ period: z.enum(['month', 'quarter', 'year']), tiers: z.array(tierPct).min(1), vatPct: z.number().finite().nullish(), ...REBATE_PARTIES }).passthrough(),
  target_rebate: z.object({ period: z.enum(['month', 'quarter', 'year']), target: z.number().finite().positive(), tiers: z.array(z.object({ fromPct: money, pct }).passthrough()).min(1), ...REBATE_PARTIES }).passthrough(),
  stage_rebate: z.object({
    mode: z.enum(['stage', 'cumulative']),
    stages: z.array(z.object({ from: z.number().int().min(1).max(31), to: z.number().int().min(1).max(31), min: money, pct: pct.nullish(), amount: money.nullish() }).passthrough()).min(1),
    ...REBATE_PARTIES,
  }).passthrough(),
  credit_limit: z.object({ limit: z.number().finite().positive(), warnPct: pct.nullish(), branches: branchMoney.nullish() }).passthrough(),
  payment_term: z.object({
    basis: z.enum(['receipt_date', 'invoice_date', 'order_date', 'fixed', 'immediate', 'prepay']), days: z.number().int().min(0).max(3650).nullish(),
    workingDays: z.boolean().nullish(), dayType: z.enum(['working', 'working6', 'calendar']).nullish(),
    payDays: z.array(z.number().int().min(1).max(31)).max(10).nullish(), monthDay: z.number().int().min(1).max(31).nullish(),
  }).passthrough(),
  supply_target: z.object({ period: z.string().regex(/^\d{4}-\d{2}$/, 'YYYY-MM'), branches: branchMoney }).passthrough(),
  lot_tracking: z.object({ required: z.boolean().nullish() }).passthrough(),
  gift_budget: z.object({ program: z.string().min(1).max(64), amount: z.number().finite().positive() }).passthrough(),
} satisfies Record<PolicyKind, z.ZodTypeAny>;

const paramsOf = <K extends PolicyKind>(kind: K) => z.object({
  code: z.string().min(1).max(64),
  kind: z.literal(kind),
  name: z.string().min(1).max(255),
  scope: scopeSchema.default({}),
  rule: RULES[kind],
  isActive: z.boolean().default(true),
  validFrom: day.nullish(),
  validTo: day.nullish(),
  priority: z.number().int().default(0),
});
/** Khuôn tham số của từng loại (để test khoá `describe().params` khớp `.shape`). */
export const PURCHASE_PARAMS = Object.fromEntries((Object.keys(RULES) as PolicyKind[]).map((k) => [k, paramsOf(k)])) as { [K in PolicyKind]: ReturnType<typeof paramsOf<K>> };
export type PurchaseParams = z.infer<(typeof PURCHASE_PARAMS)[PolicyKind]>;

/** Nội dung bản → `Policy` của engine. `familyCodes` (đơn vị con, máy chủ điền) đi theo input, không thuộc nội dung bản. */
export function policyFromParams(p: PurchaseParams, familyCodes?: string[]): Policy {
  return {
    id: p.code, code: p.code, kind: p.kind, name: p.name, scope: p.scope as Policy['scope'], rule: p.rule as Record<string, unknown>,
    isActive: p.isActive, priority: p.priority, ...(p.validFrom ? { validFrom: p.validFrom } : {}), ...(p.validTo ? { validTo: p.validTo } : {}),
    ...(familyCodes?.length ? { familyCodes } : {}),
  };
}

/* ------------------------------------------------------------------ đầu vào / đầu ra */

export interface PurchaseDocInput { doc: PDoc; holidays?: string[]; units?: Record<string, ProductUnit[]>; familyCodes?: string[] }
export interface PurchaseDocOutput {
  /** Chính sách có dòng vết trong kết quả (đã áp vào phiếu). */
  applied: boolean;
  gross: number; lineDiscount: number; orderDiscount: number; beforeTax: number; tax: number; payable: number;
  dueDate?: string; ckttExpected?: number;
  lines: { lineKey: string; sku: string; lineType: LineType; gross: number; lineDiscount: number; orderDiscount: number; beforeTax: number; tax: number; realUnitCost: number }[];
  trace: TraceItem[];
}
/** Rút gọn DocCalc của engine (bỏ trường dòng nhập vào, giữ mọi số tiền). Dùng cả ở test hồi quy để so hai phía cùng một cách. */
export function docSummary(calc: DocCalc, code: string): PurchaseDocOutput {
  return {
    applied: calc.trace.some((t) => t.policy === code),
    gross: calc.gross, lineDiscount: calc.lineDiscount, orderDiscount: calc.orderDiscount, beforeTax: calc.beforeTax, tax: calc.tax, payable: calc.payable,
    ...(calc.dueDate !== undefined ? { dueDate: calc.dueDate } : {}), ...(calc.ckttExpected !== undefined ? { ckttExpected: calc.ckttExpected } : {}),
    lines: calc.lines.map((l) => ({ lineKey: l.lineKey, sku: l.sku, lineType: l.lineType, gross: l.gross, lineDiscount: l.lineDiscount, orderDiscount: l.orderDiscount, beforeTax: l.beforeTax, tax: l.tax, realUnitCost: l.realUnitCost })),
    trace: calc.trace,
  };
}

export interface PurchaseGiftInput { doc: PDoc; familyCodes?: string[] }
export type GiftRow = Omit<GiftPlanRow, 'policy'> & { policy: string };
export interface PurchaseGiftOutput { gifts: GiftRow[] }
export const giftRows = (rows: GiftPlanRow[]): GiftRow[] => rows.map((r) => ({ ...r, policy: r.policy.code }));

export interface PurchaseRebateInput { sales: { total: number; byDay?: Record<number, number> } }
export interface CreditInput { current: number; openOrders: number; thisDoc: number; branchCode?: string }
export interface TermInput { doc: Pick<PDoc, 'docDate' | 'invoice' | 'receivedDate' | 'invoiceFix'>; holidays?: string[] }
export interface TermOutput { term: PaymentTerm; text: string; dueDate?: string }
export interface DescribeOutput { mode: 'describe'; kind: PolicyKind; rule: Record<string, unknown> }

/* ------------------------------------------------------------------ mô tả tham số (viết tay, khớp .shape — test khoá) */

const f = (name: string, type: string, required: boolean, doc: string): FieldDoc => ({ name, type, required, doc });
const COMMON_DOCS: FieldDoc[] = [
  f('code', 'string', true, 'Mã chính sách (policyKey ở sổ đăng ký)'),
  f('kind', 'string (hằng)', true, 'Loại chính sách — đúng phần <loại> của mã Rule Contract'),
  f('name', 'string', true, 'Tên chính sách (hiện trong vết tính phiếu)'),
  f('scope.partnerCode', 'string', false, 'NCC áp dụng; trống = mọi NCC'),
  f('scope.brandCode', 'string', false, 'Nhãn hàng áp dụng'),
  f('scope.sku', 'string', false, 'Mã hàng áp dụng'),
  f('scope.branchCode', 'string', false, 'Một chi nhánh (dữ liệu cũ)'),
  f('scope.branchCodes', 'string[]', false, 'Các chi nhánh áp dụng; trống = mọi chi nhánh'),
  f('scope.withChildren', 'boolean', false, 'Áp cho mọi đơn vị con của NCC (cần input.familyCodes)'),
  f('scope.contractCode', 'string', false, 'Hợp đồng mua chứa chính sách (chỉ để gom, không đổi cách áp)'),
  f('isActive', 'boolean', false, 'Mặc định true; false = không áp'),
  f('validFrom', 'YYYY-MM-DD | null', false, 'Hiệu lực từ (trong nội dung, khác hiệu lực của bản ở sổ đăng ký)'),
  f('validTo', 'YYYY-MM-DD | null', false, 'Hiệu lực đến (gồm ngày này)'),
  f('priority', 'integer', false, 'Ưu tiên khi nhiều chính sách cùng khớp; mặc định 0'),
];
const APPLY = 'exclusive | together';
const PARTIES: FieldDoc[] = [
  f('rule.family', 'boolean | null', false, 'Tính doanh số trên NCC ký và mọi đơn vị con'),
  f('rule.payer', 'string | null', false, 'Mã NCC trả thưởng; trống = NCC ký'),
  f('rule.receiver', 'string | null', false, 'Chi nhánh bên mình nhận thưởng'),
];
const RULE_DOCS: Record<PolicyKind, FieldDoc[]> = {
  trade_discount: [
    f('rule.pct', 'number [0, 100] | null', false, 'CK % trên đơn (chọn % hoặc số tiền)'),
    f('rule.amount', 'number ≥ 0 | null', false, 'CK số tiền trên đơn'),
    f('rule.minOrder', 'number ≥ 0 | null', false, 'Áp khi tổng đơn từ (tradeDiscountMin)'),
    f('rule.repeat', 'boolean | null', false, 'CK số tiền có mức: mỗi đủ một mức giảm một lần'),
    f('rule.apply', `${APPLY} | null`, false, 'Áp riêng / áp đồng thời'),
  ],
  item_discount: [
    f('rule.items', 'array<{ sku, pct?, amount?, unit?, minQty?, note?, apply?, priority? }> (1..10000)', true, 'Bảng CK theo mã: % hoặc giảm tiền trên 1 ĐVT của dòng bảng; unit khác ĐVT phiếu thì quy đổi theo input.units'),
    f('rule.apply', `${APPLY} | null`, false, 'Áp riêng cả chính sách'),
  ],
  qty_tier: [
    f('rule.tiers', 'array<{ from ≥ 0, pct [0, 100] }> (≥ 1)', true, 'Bậc SL: bậc có from lớn nhất ≤ SL dòng (pickTier)'),
    f('rule.apply', `${APPLY} | null`, false, 'Áp riêng / áp đồng thời'),
  ],
  payment_discount: [f('rule.pct', 'number [0, 100]', true, 'CKTT % — chỉ hưởng khi trả đúng hạn')],
  promo_gift: [
    f('rule.splitIntoCost', 'boolean | null', false, 'true = quà người bán (chia giá vào giá vốn), false = quà người tiêu dùng'),
    f('rule.items', 'array<{ sku, buyQty, buyUnit?, giftSku?, getQty, getUnit?, repeat?, apply?, note?, buyRatios?, giftRatios? }> | null', false, 'Mua X tặng Y nhiều dòng (so theo ĐVT nhỏ nhất)'),
    f('rule.buy', 'number > 0 | null', false, 'Dạng cũ một dòng: SL mua'),
    f('rule.get', 'number > 0 | null', false, 'Dạng cũ một dòng: SL tặng'),
    f('rule.giftSku', 'string | null', false, 'Dạng cũ: mã tặng; trống = chính mã mua'),
    f('rule.repeat', 'boolean | null', false, 'Dạng cũ: cộng dồn (mặc định có)'),
    f('rule.apply', `${APPLY} | null`, false, 'Áp riêng cả chính sách'),
  ],
  period_rebate: [
    f('rule.period', 'month | quarter | year', true, 'Kỳ tính thưởng'),
    f('rule.tiers', 'array<{ from ≥ 0, pct [0, 100] }> (≥ 1)', true, 'Bậc doanh số'),
    f('rule.vatPct', 'number | null', false, 'Thuế suất hoá đơn chiết khấu'),
    ...PARTIES,
  ],
  target_rebate: [
    f('rule.period', 'month | quarter | year', true, 'Kỳ tính thưởng'),
    f('rule.target', 'number > 0', true, 'Chỉ tiêu doanh số'),
    f('rule.tiers', 'array<{ fromPct ≥ 0, pct [0, 100] }> (≥ 1)', true, 'Ngưỡng % hoàn thành → % thưởng'),
    ...PARTIES,
  ],
  stage_rebate: [
    f('rule.mode', 'stage | cumulative', true, 'Doanh số của giai đoạn / luỹ kế từ đầu tháng'),
    f('rule.stages', 'array<{ from 1..31, to 1..31, min ≥ 0, pct?, amount? }> (≥ 1)', true, 'Các giai đoạn trong tháng'),
    ...PARTIES,
  ],
  credit_limit: [
    f('rule.limit', 'number > 0', true, 'Hạn mức tổng'),
    f('rule.warnPct', 'number [0, 100] | null', false, 'Ngưỡng cảnh báo %; trống = 90'),
    f('rule.branches', 'Record<chi nhánh, number ≥ 0> | null', false, 'Hạn mức riêng từng chi nhánh'),
  ],
  payment_term: [
    f('rule.basis', 'receipt_date | invoice_date | order_date | fixed | immediate | prepay', true, 'Mốc tính hạn'),
    f('rule.days', 'integer [0, 3650] | null', false, 'Số ngày'),
    f('rule.workingDays', 'boolean | null', false, 'Dữ liệu cũ: true = ngày làm việc'),
    f('rule.dayType', 'working | working6 | calendar | null', false, 'Loại ngày'),
    f('rule.payDays', 'integer[] (1..31) | null', false, 'Chỉ trả vào các ngày cố định trong tháng'),
    f('rule.monthDay', 'integer 1..31 | null', false, 'Trả trước ngày N hàng tháng'),
  ],
  supply_target: [
    f('rule.period', 'YYYY-MM', true, 'Tháng của chỉ tiêu'),
    f('rule.branches', 'Record<chi nhánh, number ≥ 0>', true, 'Chỉ tiêu cung ứng từng chi nhánh'),
  ],
  lot_tracking: [f('rule.required', 'boolean | null', false, 'Bắt nhập lô / hạn dùng; trống = true')],
  gift_budget: [
    f('rule.program', 'string', true, 'Mã chương trình quà'),
    f('rule.amount', 'number > 0', true, 'Ngân sách quà của chương trình'),
  ],
};

/* ------------------------------------------------------------------ kiểm phát hành */

const has = (v: unknown) => typeof v === 'number' && v > 0;
function publishChecksOf(p: PurchaseParams): PublishIssue[] {
  const out: PublishIssue[] = [];
  if (p.validFrom && p.validTo && p.validTo < p.validFrom) out.push({ path: 'validTo', message: 'Ngày hết hiệu lực trước ngày bắt đầu' });
  const r = p.rule as Record<string, unknown>;
  switch (p.kind) {
    case 'trade_discount':
      if (has(r.pct) === has(r.amount)) out.push({ path: 'rule', message: has(r.pct) ? 'Ghi cả % và số tiền — chỉ giữ một' : 'Chưa ghi % hoặc số tiền chiết khấu' });
      break;
    case 'item_discount': {
      const seen = new Map<string, number>();
      (r.items as { sku: string; pct?: number | null; amount?: number | null; unit?: string | null; minQty?: number | null }[]).forEach((i, n) => {
        if (has(i.pct) === has(i.amount)) out.push({ path: `rule.items.${n}`, message: `mã ${i.sku}: ghi đúng một trong hai — % hoặc số tiền giảm` });
        const k = `${i.sku}|${(i.unit ?? '').toLowerCase()}|${i.minQty ?? 0}`;
        if (seen.has(k)) out.push({ path: `rule.items.${n}`, message: `dòng ${n + 1} trùng dòng ${seen.get(k)! + 1} (${i.sku})` }); else seen.set(k, n);
      });
      break;
    }
    case 'qty_tier': case 'period_rebate': {
      const froms = (r.tiers as { from: number }[]).map((t) => t.from);
      if (new Set(froms).size !== froms.length) out.push({ path: 'rule.tiers', message: 'Hai bậc trùng mốc "từ"' });
      break;
    }
    case 'promo_gift':
      if (!(Array.isArray(r.items) && r.items.length) && !(has(r.buy) && has(r.get))) out.push({ path: 'rule', message: 'Chưa có dòng mua – tặng (items) hoặc buy / get' });
      break;
    case 'stage_rebate':
      (r.stages as { from: number; to: number; pct?: number | null; amount?: number | null }[]).forEach((s, n) => {
        if (s.to < s.from) out.push({ path: `rule.stages.${n}`, message: `giai đoạn ${n + 1}: ngày kết thúc trước ngày bắt đầu` });
        if (!has(s.pct) && !has(s.amount)) out.push({ path: `rule.stages.${n}`, message: `giai đoạn ${n + 1}: chưa ghi % hoặc số tiền thưởng` });
      });
      break;
    case 'credit_limit': {
      const sum = Object.values((r.branches as Record<string, number> | null | undefined) ?? {}).reduce((a, b) => a + b, 0);
      if (sum > (r.limit as number)) out.push({ path: 'rule.branches', message: `Tổng phân bổ chi nhánh ${sum.toLocaleString('vi-VN')} vượt hạn mức tổng ${(r.limit as number).toLocaleString('vi-VN')}` });
      break;
    }
    default: break;
  }
  return out;
}

/* ------------------------------------------------------------------ dựng hợp đồng */

type Mode = 'compute' | 'check' | 'describe';
const vnd = (n: number) => n.toLocaleString('vi-VN');

function make<K extends PolicyKind, I, O>(kind: K, mode: Mode, engineFns: string[], spec: { input: string; output: string; steps: string[] },
  evaluate: (p: PurchaseParams, input: I) => O, explain: (p: PurchaseParams, o: O) => string, vectors: Vector<PurchaseParams, I, O>[]): RuleContract<PurchaseParams, I, O> {
  return {
    id: `purchase.${kind}@1`,
    domain: 'purchase',
    title: `Mua hàng — ${POLICY_LABEL[kind]}`,
    params: PURCHASE_PARAMS[kind] as unknown as RuleContract<PurchaseParams, I, O>['params'],
    publishChecks: publishChecksOf,
    window: (p) => ({ from: p.validFrom ?? undefined, to: p.validTo ?? undefined }),
    evaluate,
    explain,
    treatment: (): Treatment[] => [],
    describe: () => ({
      params: [...COMMON_DOCS, ...RULE_DOCS[kind]],
      spec: {
        mode, engine: engineFns.map((x) => `@bizcity/mua-hang-domain ${x}`), ...spec,
        note: mode === 'compute'
          ? 'Kết quả là kết quả của bộ máy mua hàng với đúng một chính sách — plugin ngoài không viết lại được bằng spec ngắn; gọi Core hoặc dùng gói @bizcity/mua-hang-domain. Không phát hành inline; chưa tính lại ở cửa nạp.'
          : mode === 'check'
            ? 'Loại tham số: evaluate trả kết quả kiểm / hạn của engine, không xét phạm vi (người gọi chọn bản theo sổ đăng ký). Không phát hành inline.'
            : 'Loại tham số không có hàm tính ở engine: evaluate chỉ trả lại tham số; so với thực tế do module mua hàng làm (báo cáo, checkDoc). Không phát hành inline.',
      },
      vectors,
    }),
  };
}

/** Loại tính trên phiếu bằng computeDoc. */
const docContract = (kind: 'trade_discount' | 'item_discount' | 'qty_tier' | 'payment_discount', steps: string[], vectors: Vector<PurchaseParams, PurchaseDocInput, PurchaseDocOutput>[]) =>
  make<typeof kind, PurchaseDocInput, PurchaseDocOutput>(kind, 'compute', ['computeDoc'],
    { input: '{ doc: PDoc, holidays?, units?: Record<sku, ProductUnit[]>, familyCodes? }', output: '{ applied, gross, lineDiscount, orderDiscount, beforeTax, tax, payable, dueDate?, ckttExpected?, lines[], trace[] }', steps },
    (p, i) => docSummary(computeDoc(i.doc, [policyFromParams(p, i.familyCodes)], { ...(i.holidays ? { holidays: i.holidays } : {}), ...(i.units ? { units: i.units } : {}) }), p.code),
    (p, o) => (o.applied ? `${p.name}: ${o.trace.filter((t) => t.policy === p.code).map((t) => t.text).join('; ')} — phải trả ${vnd(o.payable)}` : `${p.name}: không áp cho phiếu này (ngoài phạm vi / hiệu lực, chưa đủ điều kiện, hoặc phiếu đã ghi tay)`),
    vectors);

/* ------------------------------------------------------------------ vectors (số liệu tài liệu yêu cầu mua hàng — kich-ban.ts TH1, TH4) */

const G = '110154035', V = '110154036';
type LineIn = PDoc['lines'][number];
const L = (sku: string, qty: number, price: number, o: Partial<LineIn> = {}): LineIn => ({ lineKey: `${sku}-${qty}`, sku, name: sku, unit: 'Lon', qty, price, taxCode: 'V08', lineType: 'buy', ...o });
const D = (lines: LineIn[], o: Partial<PDoc> = {}): PDoc => ({ id: 'v', kind: 'receipt', status: 'draft', docNo: '', docDate: '2026-10-01', branchCode: 'CN', partnerCode: 'NCC-TRUNGHAU', priceIncludesVat: true, lines, ...o });
const P = <K extends PolicyKind>(kind: K, rule: Record<string, unknown>, o: Partial<PurchaseParams> = {}): PurchaseParams =>
  ({ code: `V-${kind}`, kind, name: `Mẫu ${kind}`, scope: {}, rule, isActive: true, validFrom: null, validTo: null, priority: 0, ...o }) as PurchaseParams;
const TH1 = () => D([L(G, 60, 528_000), L(V, 24, 431_000)], { invoice: { no: '3181', date: '2026-10-01' } });

/* VECTORS-BEGIN (đầu ra chép từ engine, đã đối chiếu tay với kich-ban TH1 / TH4 — test chạy lại từng ca) */
const VEC: Record<string, unknown> = {
  "TH1 — CK thẳng 7% trên đơn: phải trả 39.082.320": {"applied":true,"gross":42024000,"lineDiscount":0,"orderDiscount":2941680,"beforeTax":36187333,"tax":2894987,"payable":39082320,"lines":[{"lineKey":"110154035-60","sku":"110154035","lineType":"buy","gross":31680000,"lineDiscount":0,"orderDiscount":2217600,"beforeTax":27280000,"tax":2182400,"realUnitCost":454666.67},{"lineKey":"110154036-24","sku":"110154036","lineType":"buy","gross":10344000,"lineDiscount":0,"orderDiscount":724080,"beforeTax":8907333,"tax":712587,"realUnitCost":371138.88}],"trace":[{"policy":"V-trade_discount","kind":"trade_discount","text":"Mẫu trade_discount: CK 7% trên đơn × 42.024.000","amount":2941680}]},
  "CK 2.000.000 khi đơn từ 10.000.000, cộng dồn: đơn 42.024.000 → 4 lần": {"applied":true,"gross":42024000,"lineDiscount":0,"orderDiscount":8000000,"beforeTax":31503703,"tax":2520297,"payable":34024000,"lines":[{"lineKey":"110154035-60","sku":"110154035","lineType":"buy","gross":31680000,"lineDiscount":0,"orderDiscount":6030840,"beforeTax":23749222,"tax":1899938,"realUnitCost":395820.37},{"lineKey":"110154036-24","sku":"110154036","lineType":"buy","gross":10344000,"lineDiscount":0,"orderDiscount":1969160,"beforeTax":7754481,"tax":620359,"realUnitCost":323103.38}],"trace":[{"policy":"V-trade_discount","kind":"trade_discount","text":"Mẫu trade_discount: CK bằng tiền trên tổng đơn × 4 lần (cộng dồn: mỗi đủ 10.000.000đ)","amount":8000000}]},
  "Phiếu đã ghi CK đơn tay ({} = thoả thuận không CK): chính sách không áp": {"applied":false,"gross":42024000,"lineDiscount":0,"orderDiscount":0,"beforeTax":38911111,"tax":3112889,"payable":42024000,"lines":[{"lineKey":"110154035-60","sku":"110154035","lineType":"buy","gross":31680000,"lineDiscount":0,"orderDiscount":0,"beforeTax":29333333,"tax":2346667,"realUnitCost":488888.88},{"lineKey":"110154036-24","sku":"110154036","lineType":"buy","gross":10344000,"lineDiscount":0,"orderDiscount":0,"beforeTax":9577778,"tax":766222,"realUnitCost":399074.08}],"trace":[]},
  "Ngoài phạm vi NCC: không áp": {"applied":false,"gross":42024000,"lineDiscount":0,"orderDiscount":0,"beforeTax":38911111,"tax":3112889,"payable":42024000,"lines":[{"lineKey":"110154035-60","sku":"110154035","lineType":"buy","gross":31680000,"lineDiscount":0,"orderDiscount":0,"beforeTax":29333333,"tax":2346667,"realUnitCost":488888.88},{"lineKey":"110154036-24","sku":"110154036","lineType":"buy","gross":10344000,"lineDiscount":0,"orderDiscount":0,"beforeTax":9577778,"tax":766222,"realUnitCost":399074.08}],"trace":[]},
  "3% mã G, giảm 500đ / Lon mã V từ 24 Lon": {"applied":true,"gross":42024000,"lineDiscount":962400,"orderDiscount":0,"beforeTax":38020000,"tax":3041600,"payable":41061600,"lines":[{"lineKey":"110154035-60","sku":"110154035","lineType":"buy","gross":31680000,"lineDiscount":950400,"orderDiscount":0,"beforeTax":28453333,"tax":2276267,"realUnitCost":474222.22},{"lineKey":"110154036-24","sku":"110154036","lineType":"buy","gross":10344000,"lineDiscount":12000,"orderDiscount":0,"beforeTax":9566667,"tax":765333,"realUnitCost":398611.13}],"trace":[{"policy":"V-item_discount","kind":"item_discount","text":"110154035: CK 3% — Mẫu item_discount"},{"policy":"V-item_discount","kind":"item_discount","text":"110154036: giảm 500đ / Lon (mua từ 24) — Mẫu item_discount"}]},
  "Giảm 12.000đ / Thùng, phiếu nhập theo Lon (Thùng = 24 Lon) → 500đ / Lon": {"applied":true,"gross":42024000,"lineDiscount":12000,"orderDiscount":0,"beforeTax":38900000,"tax":3112000,"payable":42012000,"lines":[{"lineKey":"110154035-60","sku":"110154035","lineType":"buy","gross":31680000,"lineDiscount":0,"orderDiscount":0,"beforeTax":29333333,"tax":2346667,"realUnitCost":488888.88},{"lineKey":"110154036-24","sku":"110154036","lineType":"buy","gross":10344000,"lineDiscount":12000,"orderDiscount":0,"beforeTax":9566667,"tax":765333,"realUnitCost":398611.13}],"trace":[{"policy":"V-item_discount","kind":"item_discount","text":"110154036: giảm 12.000đ / Thùng — Mẫu item_discount"}]},
  "Bậc SL: 60 Lon → bậc 50 (3%), 24 Lon → chưa tới bậc": {"applied":true,"gross":42024000,"lineDiscount":950400,"orderDiscount":0,"beforeTax":38031111,"tax":3042489,"payable":41073600,"lines":[{"lineKey":"110154035-60","sku":"110154035","lineType":"buy","gross":31680000,"lineDiscount":950400,"orderDiscount":0,"beforeTax":28453333,"tax":2276267,"realUnitCost":474222.22},{"lineKey":"110154036-24","sku":"110154036","lineType":"buy","gross":10344000,"lineDiscount":0,"orderDiscount":0,"beforeTax":9577778,"tax":766222,"realUnitCost":399074.08}],"trace":[{"policy":"V-qty_tier","kind":"qty_tier","text":"110154035: SL 60 → bậc từ 50, CK 3%"}]},
  "TH4 — CK 7% trên phiếu + CKTT 2%: CKTT dự kiến 781.646": {"applied":true,"gross":42024000,"lineDiscount":0,"orderDiscount":2941680,"beforeTax":36187333,"tax":2894987,"payable":39082320,"ckttExpected":781646,"lines":[{"lineKey":"110154035-60","sku":"110154035","lineType":"buy","gross":31680000,"lineDiscount":0,"orderDiscount":2217600,"beforeTax":27280000,"tax":2182400,"realUnitCost":454666.67},{"lineKey":"110154036-24","sku":"110154036","lineType":"buy","gross":10344000,"lineDiscount":0,"orderDiscount":724080,"beforeTax":8907333,"tax":712587,"realUnitCost":371138.88}],"trace":[{"policy":"Trên phiếu","kind":"trade_discount","text":"CK 7% trên đơn × 42.024.000 (ghi trên phiếu)","amount":2941680},{"policy":"V-payment_discount","kind":"payment_discount","text":"CKTT 2% nếu trả đúng hạn","amount":781646}]},
  "Mua 24 Lon G tặng 1 Lon, cộng dồn: 60 Lon → tặng 2": {"gifts":[{"key":"V-promo_gift|0|110154035","policy":"V-promo_gift","sku":"110154035","buyLineKey":"110154035-60","buyQty":60,"unit":"Lon","buy":24,"get":1,"giftSku":"110154035","giftUnit":"Lon","lineType":"gift_seller","expected":2,"got":0,"repeat":true,"toNext":12,"row":0}]},
  "Không cộng dồn: 60 Lon chỉ tặng 1; phiếu đã ghi 1 Lon quà": {"gifts":[{"key":"V-promo_gift|0|110154035","policy":"V-promo_gift","sku":"110154035","buyLineKey":"110154035-60","buyQty":60,"unit":"Lon","buy":24,"get":1,"giftSku":"110154035","giftUnit":"Lon","lineType":"gift_seller","expected":1,"got":1,"repeat":false,"toNext":0,"row":0}]},
  "Doanh số 320 triệu → bậc 300 triệu, 3%": {"policy":"V-period_rebate","kind":"period_rebate","base":320000000,"rate":3,"amount":9600000,"detail":["Doanh số 320.000.000 → bậc từ 300.000.000: 3%"]},
  "Doanh số 150 triệu → chưa đạt bậc": {"policy":"V-period_rebate","kind":"period_rebate","base":150000000,"rate":0,"amount":0,"detail":["Doanh số 150.000.000 → bậc chưa đạt: 0%"]},
  "Chỉ tiêu 500 triệu, đạt 560 triệu (112%) → ngưỡng 110%: 3%": {"policy":"V-target_rebate","kind":"target_rebate","base":560000000,"rate":3,"amount":16800000,"detail":["Hoàn thành 560.000.000 / 500.000.000 = 112% → ngưỡng 110%: thưởng 3%"]},
  "Anlene 550 triệu theo giai đoạn 1% / 2% / 3%": {"policy":"V-stage_rebate","kind":"stage_rebate","base":550000000,"rate":0,"amount":12300000,"detail":["Giai đoạn 1–10: doanh số 120.000.000 ≥ 100.000.000 → 1% = 1.200.000","Giai đoạn 11–20: doanh số 180.000.000 ≥ 150.000.000 → 2% = 3.600.000","Giai đoạn 21–31: doanh số 250.000.000 ≥ 200.000.000 → 3% = 7.500.000"],"stages":[{"from":1,"to":10,"amount":1200000},{"from":11,"to":20,"amount":3600000},{"from":21,"to":31,"amount":7500000}]},
  "TH3 — hạn mức 600 triệu, nợ 450 triệu, nhập 117.450.000: còn 32.550.000": {"scope":"NCC ","limit":600000000,"current":450000000,"openOrders":0,"thisDoc":117450000,"after":567450000,"remaining":32550000,"exceeded":0,"warn":true,"policy":"V-credit_limit"},
  "TH3 — đặt thêm 40 triệu: vượt 7.450.000": {"scope":"NCC ","limit":600000000,"current":450000000,"openOrders":117450000,"thisDoc":40000000,"after":607450000,"remaining":-7450000,"exceeded":7450000,"warn":true,"policy":"V-credit_limit"},
  "Hạn mức riêng chi nhánh CN-ND 100 triệu": {"scope":"Chi nhánh CN-ND","limit":100000000,"current":80000000,"openOrders":0,"thisDoc":15000000,"after":95000000,"remaining":5000000,"exceeded":0,"warn":true,"policy":"V-credit_limit"},
  "TH1 — 10 ngày làm việc từ ngày hoá đơn 01/10/2026 → 15/10/2026": {"term":{"basis":"invoice_date","days":10,"workingDays":true},"text":"10 ngày làm việc (trừ T7, CN, lễ) từ ngày hoá đơn; rơi vào ngày nghỉ thì sang ngày làm việc kế tiếp","dueDate":"2026-10-15"},
  "Công nợ cố định: không có hạn từng phiếu": {"term":{"basis":"fixed","days":0,"workingDays":false},"text":"Công nợ cố định (duy trì số dư theo thoả thuận, không tính hạn từng phiếu)"},
  "Chỉ tiêu tháng 10 hai chi nhánh": {"mode":"describe","kind":"supply_target","rule":{"period":"2026-10","branches":{"CN-ND":600000000,"CN-PT":700000000}}},
  "Bắt nhập lô / hạn dùng": {"mode":"describe","kind":"lot_tracking","rule":{"required":true}},
  "Ngân sách quà TGS-TRI-AN 10 triệu": {"mode":"describe","kind":"gift_budget","rule":{"program":"TGS-TRI-AN","amount":10000000}},
};
/* VECTORS-END */

const vec = <I, O>(name: string, params: PurchaseParams, input: I): Vector<PurchaseParams, I, O> => ({ name, params, input, output: VEC[name] as O });

export const purchaseTradeDiscount = docContract('trade_discount', [
  'Phiếu chưa ghi CK đơn (orderDiscount undefined), là đơn đặt / nhập mua: chính sách CK trên đơn khớp phạm vi và tổng đơn ≥ tradeDiscountMin → CK đơn = % × tổng sau CK dòng, hoặc số tiền × tradeTimes',
  'Phạm vi có mã hàng: áp vào dòng mã đó như CK dòng (sau CK tay, bảng CK theo mã, bậc SL)',
  'CK đơn phân bổ vào các dòng mua theo giá trị sau CK dòng (allocate, khớp tới đồng); rồi tách thuế, giá vốn thực tế',
], [
  vec('TH1 — CK thẳng 7% trên đơn: phải trả 39.082.320', P('trade_discount', { pct: 7 }), { doc: TH1() }),
  vec('CK 2.000.000 khi đơn từ 10.000.000, cộng dồn: đơn 42.024.000 → 4 lần', P('trade_discount', { amount: 2_000_000, minOrder: 10_000_000, repeat: true }), { doc: TH1() }),
  vec('Phiếu đã ghi CK đơn tay ({} = thoả thuận không CK): chính sách không áp', P('trade_discount', { pct: 7 }), { doc: { ...TH1(), orderDiscount: {} } }),
  vec('Ngoài phạm vi NCC: không áp', P('trade_discount', { pct: 7 }, { scope: { partnerCode: 'NCC-KHAC' } }), { doc: TH1() }),
]);
export const purchaseItemDiscount = docContract('item_discount', [
  'Mỗi dòng mua chưa ghi CK tay: dòng bảng khớp mã (+ ĐVT nếu có, quy đổi theo units) và SL ≥ minQty — ưu tiên đúng ĐVT, rồi minQty lớn nhất (itemDiscountFor)',
  '% → CK dòng = round(gross × pct / 100); số tiền → round(amount × factor × SL); CK dòng không vượt tiền hàng',
], [
  vec('3% mã G, giảm 500đ / Lon mã V từ 24 Lon', P('item_discount', { items: [{ sku: G, pct: 3 }, { sku: V, amount: 500, minQty: 24 }] }), { doc: TH1() }),
  vec('Giảm 12.000đ / Thùng, phiếu nhập theo Lon (Thùng = 24 Lon) → 500đ / Lon', P('item_discount', { items: [{ sku: V, amount: 12_000, unit: 'Thùng' }] }), { doc: TH1(), units: { [V]: [{ unit: 'Lon', ratio: 1 }, { unit: 'Thùng', ratio: 24 }] } }),
]);
export const purchaseQtyTier = docContract('qty_tier', [
  'Dòng mua chưa có CK tay / bảng CK theo mã: chính sách bậc SL khớp mã → bậc có from lớn nhất ≤ SL dòng (pickTier) → CK % dòng',
], [
  vec('Bậc SL: 60 Lon → bậc 50 (3%), 24 Lon → chưa tới bậc', P('qty_tier', { tiers: [{ from: 0, pct: 0 }, { from: 50, pct: 3 }, { from: 100, pct: 5 }] }), { doc: TH1() }),
]);
export const purchasePaymentDiscount = docContract('payment_discount', [
  'Đơn đặt / nhập mua không ghi CKTT trên phiếu: ckttExpected = round(phải trả × pct / 100) — chỉ hưởng khi trả đúng hạn (ckttFor lúc trả)',
], [
  vec('TH4 — CK 7% trên phiếu + CKTT 2%: CKTT dự kiến 781.646', P('payment_discount', { pct: 2 }), { doc: { ...TH1(), orderDiscount: { pct: 7 } } }),
]);

export const purchasePromoGift = make<'promo_gift', PurchaseGiftInput, PurchaseGiftOutput>('promo_gift', 'compute', ['giftPlan'],
  { input: '{ doc: PDoc, familyCodes? }', output: '{ gifts[]: GiftPlanRow (policy = mã) }', steps: [
    'Chỉ đơn đặt / nhập mua. Theo từng mã mua: các dòng mua X tặng Y khớp (giftMatches, quy về ĐVT nhỏ nhất qua buyRatios / giftRatios)',
    'times = SL mua < buyQty ? 0 : repeat ? floor(SL / buyQty) : 1; expected = times × getQty; got = SL quà đã ghi trên phiếu cùng loại quà',
    'Áp riêng (exclusiveBySku) chặn chương trình khác cho mã đó',
  ] },
  (p, i) => ({ gifts: giftRows(giftPlan(i.doc, [policyFromParams(p, i.familyCodes)])) }),
  (p, o) => (o.gifts.some((g) => g.expected > 0)
    ? `${p.name}: ${o.gifts.filter((g) => g.expected > 0).map((g) => `mua ${g.buyQty} ${g.unit} ${g.sku} → tặng ${g.expected} ${g.giftUnit} ${g.giftSku}${g.got !== g.expected ? ` (phiếu ghi ${g.got})` : ''}`).join('; ')}`
    : `${p.name}: chưa đủ điều kiện tặng trên phiếu này`),
  [
    vec('Mua 24 Lon G tặng 1 Lon, cộng dồn: 60 Lon → tặng 2', P('promo_gift', { splitIntoCost: true, items: [{ sku: G, buyQty: 24, buyUnit: 'Lon', giftSku: '', getQty: 1, getUnit: 'Lon' }] }), { doc: TH1() }),
    vec('Không cộng dồn: 60 Lon chỉ tặng 1; phiếu đã ghi 1 Lon quà', P('promo_gift', { splitIntoCost: true, items: [{ sku: G, buyQty: 24, buyUnit: 'Lon', giftSku: '', getQty: 1, getUnit: 'Lon', repeat: false }] }), { doc: D([...TH1().lines, L(G, 1, 0, { lineType: 'gift_seller' })]) }),
  ]);

const rebateContract = (kind: 'period_rebate' | 'target_rebate' | 'stage_rebate', steps: string[], vectors: Vector<PurchaseParams, PurchaseRebateInput, RebateResult>[]) =>
  make<typeof kind, PurchaseRebateInput, RebateResult>(kind, 'compute', ['rebateFor'],
    { input: '{ sales: { total, byDay?: Record<ngày 1..31, doanh số> } } — doanh số mua thuần trước thuế trong kỳ', output: 'RebateResult { policy, kind, base, rate, amount, detail[], stages? }', steps },
    (p, i) => rebateFor(policyFromParams(p), i.sales),
    (p, o) => `${p.name}: ${o.detail.join('; ')} → thưởng ${vnd(o.amount)}`,
    vectors);

const anlene550 = { total: 550_000_000, byDay: { 3: 40e6, 6: 45e6, 9: 35e6, 12: 60e6, 15: 50e6, 19: 70e6, 22: 80e6, 26: 90e6, 29: 80e6 } };
export const purchasePeriodRebate = rebateContract('period_rebate', ['rate = pct của bậc có from lớn nhất ≤ doanh số (pickTier); amount = round(doanh số × rate / 100)'], [
  vec('Doanh số 320 triệu → bậc 300 triệu, 3%', P('period_rebate', { period: 'month', tiers: [{ from: 200_000_000, pct: 2 }, { from: 300_000_000, pct: 3 }] }), { sales: { total: 320_000_000 } }),
  vec('Doanh số 150 triệu → chưa đạt bậc', P('period_rebate', { period: 'month', tiers: [{ from: 200_000_000, pct: 2 }] }), { sales: { total: 150_000_000 } }),
]);
export const purchaseTargetRebate = rebateContract('target_rebate', ['ngưỡng đạt khi doanh số × 100 ≥ fromPct × chỉ tiêu (so bằng tiền, không qua % làm tròn); lấy ngưỡng cao nhất đạt; amount = round(doanh số × pct / 100)'], [
  vec('Chỉ tiêu 500 triệu, đạt 560 triệu (112%) → ngưỡng 110%: 3%', P('target_rebate', { period: 'month', target: 500_000_000, tiers: [{ fromPct: 100, pct: 2 }, { fromPct: 110, pct: 3 }] }), { sales: { total: 560_000_000 } }),
]);
export const purchaseStageRebate = rebateContract('stage_rebate', ['mỗi giai đoạn: doanh số của giai đoạn (stage) hoặc luỹ kế từ đầu tháng trừ phần đã thưởng (cumulative); ≥ min → amount hoặc round(doanh số × pct / 100)'], [
  vec('Anlene 550 triệu theo giai đoạn 1% / 2% / 3%', P('stage_rebate', { mode: 'stage', stages: [{ from: 1, to: 10, min: 100_000_000, pct: 1 }, { from: 11, to: 20, min: 150_000_000, pct: 2 }, { from: 21, to: 31, min: 200_000_000, pct: 3 }] }), { sales: anlene550 }),
]);

export const purchaseCreditLimit = make<'credit_limit', CreditInput, CreditStatus | null>('credit_limit', 'check', ['creditStatus'],
  { input: '{ current: nợ đang có, openOrders: đơn / phiếu chưa duyệt khác, thisDoc: phiếu đang lập, branchCode? }', output: 'CreditStatus { scope, limit, after, remaining, exceeded, warn, … }', steps: [
    'limit = rule.branches[branchCode] nếu có, không thì rule.limit; after = current + openOrders + thisDoc',
    'remaining = limit − after; exceeded = max(0, after − limit); warn = after ≥ limit × (warnPct || 90) / 100',
  ] },
  (p, i) => creditStatus(policyFromParams(p), i.current, i.openOrders, i.thisDoc, i.branchCode) ?? null,
  (p, o) => (!o ? `${p.name}: không có hạn mức` : o.exceeded ? `${p.name}: ${o.scope} vượt hạn mức ${vnd(o.exceeded)} (sau phiếu ${vnd(o.after)} / ${vnd(o.limit)})` : `${p.name}: ${o.scope} còn ${vnd(o.remaining)}${o.warn ? ' — chạm ngưỡng cảnh báo' : ''}`),
  [
    vec('TH3 — hạn mức 600 triệu, nợ 450 triệu, nhập 117.450.000: còn 32.550.000', P('credit_limit', { limit: 600_000_000, warnPct: 90 }), { current: 450_000_000, openOrders: 0, thisDoc: 117_450_000 }),
    vec('TH3 — đặt thêm 40 triệu: vượt 7.450.000', P('credit_limit', { limit: 600_000_000, warnPct: 90 }), { current: 450_000_000, openOrders: 117_450_000, thisDoc: 40_000_000 }),
    vec('Hạn mức riêng chi nhánh CN-ND 100 triệu', P('credit_limit', { limit: 600_000_000, branches: { 'CN-ND': 100_000_000 } }), { current: 80_000_000, openOrders: 0, thisDoc: 15_000_000, branchCode: 'CN-ND' }),
  ]);

export const purchasePaymentTerm = make<'payment_term', TermInput, TermOutput>('payment_term', 'check', ['termFromRule', 'termText', 'dueDateFor'],
  { input: '{ doc: { docDate, invoice?, receivedDate?, invoiceFix? }, holidays? }', output: '{ term, text, dueDate? }', steps: [
    'term = termFromRule(rule); mốc = ngày hoá đơn / ngày nhận đủ hàng / ngày phiếu theo basis',
    'hạn = mốc + days (ngày làm việc trừ T7, CN, lễ / T2–T7 / ngày lịch); monthDay, payDays; hoá đơn sai lùi hạn; rơi ngày nghỉ → ngày làm việc kế tiếp; fixed → không có hạn',
  ] },
  (p, i) => { const term = termFromRule(p.rule as Record<string, unknown>); const due = dueDateFor(term, i.doc, i.holidays); return { term, text: termText(term), ...(due !== undefined ? { dueDate: due } : {}) }; },
  (p, o) => `${p.name}: ${o.text}${o.dueDate ? ` → hạn ${o.dueDate}` : ''}`,
  [
    vec('TH1 — 10 ngày làm việc từ ngày hoá đơn 01/10/2026 → 15/10/2026', P('payment_term', { basis: 'invoice_date', days: 10, workingDays: true }), { doc: { docDate: '2026-10-01', invoice: { no: '3181', date: '2026-10-01' } } }),
    vec('Công nợ cố định: không có hạn từng phiếu', P('payment_term', { basis: 'fixed', days: 0 }), { doc: { docDate: '2026-10-01' } }),
  ]);

const describeContract = (kind: 'supply_target' | 'lot_tracking' | 'gift_budget', vectors: Vector<PurchaseParams, Record<string, never>, DescribeOutput>[]) =>
  make<typeof kind, Record<string, never>, DescribeOutput>(kind, 'describe', [],
    { input: '{} (không dùng)', output: '{ mode: "describe", kind, rule }', steps: ['Trả lại rule đã kiểm khuôn — không tính'] },
    (p) => ({ mode: 'describe', kind: p.kind, rule: p.rule as Record<string, unknown> }),
    (p) => `${p.name}: ${POLICY_LABEL[p.kind]} — tham số, không tính ở Rule Contract (so thực tế ở module mua hàng)`,
    vectors);
export const purchaseSupplyTarget = describeContract('supply_target', [vec('Chỉ tiêu tháng 10 hai chi nhánh', P('supply_target', { period: '2026-10', branches: { 'CN-ND': 600_000_000, 'CN-PT': 700_000_000 } }), {})]);
export const purchaseLotTracking = describeContract('lot_tracking', [vec('Bắt nhập lô / hạn dùng', P('lot_tracking', { required: true }), {})]);
export const purchaseGiftBudget = describeContract('gift_budget', [vec('Ngân sách quà TGS-TRI-AN 10 triệu', P('gift_budget', { program: 'TGS-TRI-AN', amount: 10_000_000 }), {})]);

export const PURCHASE_CONTRACTS = [
  purchaseTradeDiscount, purchaseItemDiscount, purchaseQtyTier, purchasePaymentDiscount, purchasePromoGift,
  purchasePeriodRebate, purchaseTargetRebate, purchaseStageRebate,
  purchaseCreditLimit, purchasePaymentTerm, purchaseSupplyTarget, purchaseLotTracking, purchaseGiftBudget,
] as const;

/**
 * Tính một phiếu mua với NHIỀU chính sách qua hợp đồng: mỗi nội dung bản kiểm bằng `params` của hợp đồng đúng loại rồi đưa cả tập vào
 * `computeDoc` (áp riêng / áp đồng thời giữa các chính sách là việc của engine). Nội dung sai khuôn → lỗi (không đoán).
 */
export function computeDocViaContracts(doc: PDoc, contents: unknown[], opts: { holidays?: string[]; units?: Record<string, ProductUnit[]>; familyCodes?: Record<string, string[]> } = {}): DocCalc {
  const policies = contents.map((c) => {
    const kind = (c as { kind?: string } | null)?.kind as PolicyKind;
    const contract = PURCHASE_CONTRACTS.find((x) => x.id === `purchase.${kind}@1`);
    if (!contract) throw new Error(`Chưa có Rule Contract purchase.${String(kind)}@1`);
    const p = contract.params.parse(c);
    return policyFromParams(p, opts.familyCodes?.[p.code]);
  });
  return computeDoc(doc, policies, { ...(opts.holidays ? { holidays: opts.holidays } : {}), ...(opts.units ? { units: opts.units } : {}) });
}
