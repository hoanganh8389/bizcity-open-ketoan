// @bizcity-layer P module-sdk
// [2026-11-08 01:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a (S031-13, chữ chốt PHASE-031 · 00 §9): danh sách Rule Contract đã đăng ký
/**
 * Danh sách Rule Contract của Core. Thêm một loại chính sách mới = viết một tệp cạnh sale-promo-buy-x-get-y.ts, thêm vào đây, và
 * thêm golden (bộ `vectors` chạy qua hàm thuần và qua endpoint evaluate).
 */
import type { Db } from '@bizcity/platform/db/client';
import type { PolicyEnvelope } from '@bizcity/platform/core/policies';
import { saleBuyXGetY } from './sale-promo-buy-x-get-y.js';
import { saleProgramDiscount, saleProgramGift } from './sale-program.js';
import { SALE_PROMO_CONTRACTS } from './sale-promo.js';
import { PURCHASE_CONTRACTS } from './purchase.js';
import { approvalLevels } from './approval-levels.js';
import type { AnyRuleContract } from './types.js';

export type { AnyRuleContract, FieldDoc, PublishIssue, RuleContract, Treatment, Vector } from './types.js';

// [2026-11-12 09:15 PM Võ Hoàng] POS-KM — S031-15 phần chương trình bán (PHASE-031 · 00 §17 mục 1): thêm hai khuôn của BH12 (đóng góp)
// [2026-11-13 10:20 AM Võ Hoàng] POS-KM2 — PHASE-031 · 00 §18 (đóng góp): năm khuôn khuyến mại mở rộng (nội tuyến)
// [2026-11-21 09:20 AM Võ Hoàng] PHASE-031 — S031-11 (30-S031-11): thêm mười ba khuôn purchase.<loại>@1 bọc bộ máy mua hàng
// [2026-11-21 05:10 PM Võ Hoàng] PHASE-031 — S031-7 (31-S031-7 §1): thêm approval.levels@1 (ngưỡng duyệt, store = settings)
export const RULE_CONTRACTS: readonly AnyRuleContract[] = [saleBuyXGetY, saleProgramGift, saleProgramDiscount, ...SALE_PROMO_CONTRACTS, ...PURCHASE_CONTRACTS, approvalLevels];

const byId = new Map(RULE_CONTRACTS.map((c) => [c.id, c]));
export const getRuleContract = (id: string): AnyRuleContract | undefined => byId.get(id);

// [2026-11-12 09:15 PM Võ Hoàng] POS-KM — PHASE-031 · 00 §17 mục 2–3: bộ đọc nội dung bản `store = module` và bộ kiểm còn áp được, do module chủ đăng ký (đóng góp)
/**
 * Bộ đọc nội dung của bản chính sách mà nội dung nằm ở bảng của module chủ (`store = module`). Phải trả đúng nội dung của BẢN được
 * hỏi — module chủ so băm với `envelope.contentHash`; bản cũ đã bị sửa đè thì trả `null` (không tính được, không đoán).
 */
export type PolicyContentReader = (trx: Db, tenantId: string, envelope: PolicyEnvelope) => Promise<unknown | null>;
/**
 * Bộ kiểm "còn áp được ở chi nhánh này không" của module chủ (vd hạn mức chương trình bán). Trả `null` = áp được (kèm `info` nếu có),
 * hoặc lý do bỏ qua. Không có bộ kiểm = áp được.
 */
export type PolicyAvailability = (trx: Db, tenantId: string, envelope: PolicyEnvelope, at: { branchCode?: string; docDate: string }) =>
  Promise<{ skip: string } | { info?: Record<string, unknown> }>;

const readers = new Map<string, PolicyContentReader>();
// [2026-11-21 05:10 PM Võ Hoàng] PHASE-031 — S031-7 (31-S031-7 §1 mục 2): bản `store = settings` đọc qua bộ đọc theo tên khoá (`store_ref`), do policy-settings-index.ts đăng ký
const settingsReaders = new Map<string, PolicyContentReader>();
const availability = new Map<string, PolicyAvailability>();

/** Module chủ gọi một lần khi nạp. Gọi lại cùng hàm thì bỏ qua; khác hàm cùng module → lỗi (như registerSubscribers). */
export function registerPolicyContentReader(ownerModule: string, fn: PolicyContentReader): void {
  const cur = readers.get(ownerModule);
  if (cur && cur !== fn) throw new Error(`Bộ đọc nội dung chính sách của ${ownerModule} đăng ký hai lần`);
  readers.set(ownerModule, fn);
}
export function registerPolicyAvailability(ownerModule: string, fn: PolicyAvailability): void {
  const cur = availability.get(ownerModule);
  if (cur && cur !== fn) throw new Error(`Bộ kiểm áp được của ${ownerModule} đăng ký hai lần`);
  availability.set(ownerModule, fn);
}

/**
 * Bộ đọc nội dung của bản `store = settings` theo tên khoá cấu hình (`store_ref`): trả nội dung của ĐÚNG bản (khớp băm), không thì null.
 * Gọi lại cùng hàm thì bỏ qua; khác hàm cùng khoá → lỗi.
 */
export function registerSettingsPolicyReader(settingKey: string, fn: PolicyContentReader): void {
  const cur = settingsReaders.get(settingKey);
  if (cur && cur !== fn) throw new Error(`Bộ đọc chính sách của khoá cấu hình ${settingKey} đăng ký hai lần`);
  settingsReaders.set(settingKey, fn);
}

/** Nội dung của một bản: inline đọc ở sổ đăng ký (người gọi đưa `inlineContent`), settings đọc theo khoá cấu hình, module đọc qua bộ đọc của module chủ. */
export async function policyContent(trx: Db, tenantId: string, e: PolicyEnvelope, inlineContent?: unknown): Promise<unknown | null> {
  if (e.store === 'inline') return inlineContent ?? null;
  if (e.store === 'settings') {
    const fn = settingsReaders.get(e.storeRef);
    return fn ? fn(trx, tenantId, e) : null;
  }
  const reader = readers.get(e.ownerModule);
  return reader ? reader(trx, tenantId, e) : null;
}

export async function policyAvailability(trx: Db, tenantId: string, e: PolicyEnvelope, at: { branchCode?: string; docDate: string }) {
  // Bản inline (kể cả của cùng module chủ) không có bảng nghiệp vụ đi kèm → luôn áp được.
  const fn = e.store === 'inline' ? undefined : availability.get(e.ownerModule);
  return fn ? fn(trx, tenantId, e, at) : {};
}

