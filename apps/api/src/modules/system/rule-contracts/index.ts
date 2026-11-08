// @bizcity-layer P module-sdk
// [2026-11-08 01:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a (S031-13, chữ chốt PHASE-031 · 00 §9): danh sách Rule Contract đã đăng ký
/**
 * Danh sách Rule Contract của Core. Thêm một loại chính sách mới = viết một tệp cạnh sale-promo-buy-x-get-y.ts, thêm vào đây, và
 * thêm golden (bộ `vectors` chạy qua hàm thuần và qua endpoint evaluate).
 */
import { saleBuyXGetY } from './sale-promo-buy-x-get-y.js';
import type { AnyRuleContract } from './types.js';

export type { AnyRuleContract, FieldDoc, PublishIssue, RuleContract, Treatment, Vector } from './types.js';

export const RULE_CONTRACTS: readonly AnyRuleContract[] = [saleBuyXGetY];

const byId = new Map(RULE_CONTRACTS.map((c) => [c.id, c]));
export const getRuleContract = (id: string): AnyRuleContract | undefined => byId.get(id);
