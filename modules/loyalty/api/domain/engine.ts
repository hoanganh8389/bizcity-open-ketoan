// [2026-11-15 03:20 PM Võ Hoàng] LOYALTY — NT-BH-020 bước 1: chép nguyên từ tgs_pos_react/packages/pos-core (khớp engine PHP 14 chính sách × 400 đơn); sửa ở hai nơi phải sửa cùng; khác bản gốc: phép chia điểm qua floorDiv (đóng góp)
import { floatval, floorDiv, intval, isRecord, list, phpRound, rec, sanitizeKey, str, trim, truthy } from './php.js'

// Điểm thành viên: port TGS_Loyalty_Engine (tgs_loyalty_points/includes/class-loyalty-engine.php, bản 02/11/2026) —
// tính điểm tích (calculate_earn_points / evaluate_policy), hạng (TGS_Loyalty_DB::determine_tier), danh mục đổi quà
// / voucher theo hạng (get_rewards_for_customer). Chính sách + hạng + cài đặt khai ở plugin WP (API nhánh react);
// SỐ ĐIỂM của khách nằm ở phần mềm kế toán dạng sổ điểm (ledger.ts, docs 19). Đối chiếu với PHP:
// scripts/doi-chieu-diem.
// Lưu ý: LUONG_TICH_DIEM.md ghi tên trường khác code (vd points_per_unit); port theo CODE.

/** Một dòng {prefix}global_loyalty_policy, loyalty_rules đã giải mã. */
export type LoyaltyPolicy = {
  id: number
  code: string
  title: string
  /** 1 theo tiền · 2 theo mã · 3 nhân điểm · 4 thưởng sự kiện · 5 đổi quà · 6 đổi voucher */
  type: number
  priority: number
  status: number
  isDeleted?: boolean
  autoApply: boolean
  /** Unix giây; 0 = không giới hạn (đúng quy ước bảng cũ). */
  startDate: number
  endDate: number
  applyToBlogIds: number[]
  rules: Record<string, unknown>
}

export type LoyaltyTier = { key: string; name: string; minPoints: number; multiplier: number; color?: string }

export type LoyaltySettings = {
  enablePosEarn: boolean
  enablePosRedeem: boolean
  enableTierMultiplier: boolean
  minRedeemPoints: number
  pointLabel: string
}

export type LoyaltyProgram = { version: string; settings: LoyaltySettings; tiers: LoyaltyTier[]; policies: LoyaltyPolicy[] }

export type EarnDetail = { policyId: number; policyCode: string; policyTitle: string; policyType: number; points: number; description: string }
export type EarnResult = { totalPoints: number; multiplier: number; details: EarnDetail[] }

/* ------------------------------------------------------------------ */
/* Hạng                                                                */
/* ------------------------------------------------------------------ */

/** Hạng xếp theo điểm tối thiểu tăng dần (normalize_tiers); không có hạng nào thì có "Thành viên". */
export function normalizeTiers(tiers: readonly LoyaltyTier[]): LoyaltyTier[] {
  const out = tiers.length ? [...tiers] : [{ key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 }]
  return out.sort((a, b) => a.minPoints - b.minPoints)
}

export const defaultTierKey = (tiers: readonly LoyaltyTier[]) => normalizeTiers(tiers)[0]?.key ?? 'member'

/** Hạng theo TỔNG điểm đã tích (không phải số dư). */
export function determineTier(tiers: readonly LoyaltyTier[], totalEarned: number): string {
  let current = defaultTierKey(tiers)
  for (const t of normalizeTiers(tiers)) if (totalEarned >= t.minPoints) current = t.key
  return current
}

export function isTierAtLeast(tiers: readonly LoyaltyTier[], current: string, required: string): boolean {
  const keys = normalizeTiers(tiers).map((t) => t.key)
  const r = keys.indexOf(sanitizeKey(required))
  if (r === -1) return true
  const c = keys.indexOf(sanitizeKey(current))
  return c !== -1 && c >= r
}

/** Hạng kế tiếp + số điểm còn thiếu (get_member_info). */
export function nextTier(tiers: readonly LoyaltyTier[], tierKey: string, totalEarned: number): { tier: LoyaltyTier | null; pointsToNext: number } {
  const list = normalizeTiers(tiers)
  const i = list.findIndex((t) => t.key === tierKey)
  const next = i >= 0 ? list[i + 1] : undefined
  return next ? { tier: next, pointsToNext: Math.max(0, next.minPoints - totalEarned) } : { tier: null, pointsToNext: 0 }
}

/* ------------------------------------------------------------------ */
/* Chính sách đang chạy                                                */
/* ------------------------------------------------------------------ */

const DEFAULT_RULES = { earn_rate: 1, earn_unit: 1000, redeem_rate: 1, min_order_amount: 0, max_points_per_order: 0, point_expiry_days: 0, product_skus: [], rules: [] }

/** parse_rules: wp_parse_args(loyalty_rules, mặc định). */
export function parseRules(p: Pick<LoyaltyPolicy, 'rules'>): Record<string, unknown> {
  return { ...DEFAULT_RULES, ...(isRecord(p.rules) ? p.rules : {}) }
}

function activePolicies(policies: readonly LoyaltyPolicy[], storeId: number, now: number, types: number[] = []): LoyaltyPolicy[] {
  return policies
    .filter(
      (p) =>
        !p.isDeleted &&
        p.status === 1 &&
        (p.startDate === 0 || p.startDate <= now) &&
        (p.endDate === 0 || p.endDate >= now) &&
        p.autoApply &&
        (!types.length || types.includes(p.type)) &&
        (!p.applyToBlogIds.length || p.applyToBlogIds.map(intval).includes(storeId)),
    )
    .sort((a, b) => (a.priority !== b.priority ? a.priority - b.priority : b.id - a.id))
}

/* ------------------------------------------------------------------ */
/* Tích điểm                                                           */
/* ------------------------------------------------------------------ */

export type EarnContext = {
  storeId: number
  /** Unix giây (PHP time()). */
  now: number
  /** Tổng đơn SAU giảm giá (BUG#1 của POS cũ đã sửa theo cách này). */
  orderTotal: number
  /** Hạng của khách; undefined = khách không có hồ sơ điểm. */
  tierKey?: string | null
  /** Mỗi dòng: SKU + số lượng theo đơn vị nhỏ nhất (qty của POS cũ). */
  items: readonly { sku: string; qty: number }[]
}

export function calculateEarnPoints(program: Pick<LoyaltyProgram, 'settings' | 'tiers' | 'policies'>, ctx: EarnContext): EarnResult {
  const policies = activePolicies(program.policies, ctx.storeId, ctx.now)
  if (!policies.length) return { totalPoints: 0, multiplier: 1, details: [] }
  let multiplier = 1
  if (program.settings.enableTierMultiplier && ctx.tierKey !== undefined) {
    const key = ctx.tierKey || defaultTierKey(program.tiers)
    const tier = normalizeTiers(program.tiers).find((t) => t.key === key)
    if (tier) multiplier = tier.multiplier
  }
  let total = 0
  const details: EarnDetail[] = []
  for (const p of policies) {
    const r = evaluatePolicy(p, ctx.orderTotal, ctx.items, multiplier)
    if (r && r.points > 0) {
      total += r.points
      details.push({ policyId: p.id, policyCode: p.code, policyTitle: p.title, policyType: p.type, points: r.points, description: r.description })
    }
  }
  return { totalPoints: total, multiplier, details }
}

const fmt = (n: number) => phpRound(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function evaluatePolicy(p: LoyaltyPolicy, total: number, items: EarnContext['items'], multiplier: number): { points: number; description: string } | null {
  const cfg = parseRules(p)
  const min = floatval(cfg.min_order_amount)
  if (min > 0 && total < min) return null
  let points = 0
  let desc = ''
  switch (p.type) {
    case 1: {
      const rate = floatval(cfg.earn_rate)
      const unit = floatval(cfg.earn_unit)
      if (unit <= 0) break
      points = floorDiv(total, unit) * rate
      desc = `${fmt(rate)} điểm / ${fmt(unit)}₫`
      break
    }
    case 2: {
      for (const raw of list(cfg.rules)) {
        const rule = rec(raw)
        const sku = str(rule.sku ?? '')
        const pts = floatval(rule.points)
        if (!sku || pts <= 0) continue
        for (const it of items) if (it.sku === sku) points += pts * Math.trunc(it.qty)
      }
      desc = 'Điểm theo sản phẩm'
      break
    }
    case 3: {
      const bonus = floatval(rec(cfg.rules).multiplier ?? 2)
      const rate = floatval(cfg.earn_rate)
      const unit = floatval(cfg.earn_unit)
      if (unit <= 0) break
      points = floorDiv(total, unit) * rate * (bonus - 1)
      desc = `Nhân x${bonus} điểm`
      break
    }
    case 4: {
      for (const raw of list(cfg.rules)) {
        const rule = rec(raw)
        const minAmount = floatval(rule.min_amount)
        const bonus = floatval(rule.bonus_points)
        if (total >= minAmount && bonus > 0) {
          points = bonus
          desc = `Bonus ${fmt(bonus)} điểm khi đạt ${fmt(minAmount)}₫`
        }
      }
      break
    }
  }
  if (points > 0 && multiplier > 1 && p.type !== 3) points = phpRound(points * multiplier, 2)
  const max = intval(cfg.max_points_per_order)
  if (max > 0 && points > max) points = max
  return points > 0 ? { points, description: desc } : null
}

/** Số ngày giữ điểm của lần tích: số ngày dài nhất trong các chính sách đã cho điểm (0 = không hết hạn). */
export function expiryDaysOf(program: Pick<LoyaltyProgram, 'policies'>, earn: EarnResult): number {
  let days = 0
  for (const d of earn.details) {
    const p = program.policies.find((x) => x.id === d.policyId)
    const v = p ? intval(parseRules(p).point_expiry_days) : 0
    if (v <= 0) return 0
    days = Math.max(days, v)
  }
  return days
}

/* ------------------------------------------------------------------ */
/* Danh mục đổi điểm                                                   */
/* ------------------------------------------------------------------ */

export type LoyaltyReward = {
  index: string
  policyId: number
  programCode: string
  programTitle: string
  rewardCode: string
  rewardType: 'product' | 'voucher'
  sku: string
  productName: string
  quantity: number
  points: number
  basePoints: number
  canRedeem: boolean
  remainingPointsAfter: number
  isTracking: number
  minTier: string
  voucher?: { prefix: string; discountType: string; discountValue: number; maxDiscount: number; minOrderAmount: number; expiresInDays: number }
}

/**
 * `now`: giờ shop dạng "đồng hồ treo tường" (như current_time('timestamp') của WP: giờ địa phương đọc như UTC) — để
 * so với start_at / end_at admin nhập ('2026-11-02 08:00') đúng như bản PHP.
 */
export type RewardContext = { storeId: number; now: number; orderTotal: number; tierKey: string; points: number }

/** 'YYYY-MM-DD[ HH:MM[:SS]]' → giây, đọc như UTC (strtotime khi WP đặt múi giờ PHP là UTC). */
export function wallClock(s: string): number {
  const t = Date.parse(`${s.trim().replace(' ', 'T')}${/T\d|\s\d/.test(s.trim()) ? '' : 'T00:00'}Z`)
  return Number.isFinite(t) ? Math.floor(t / 1000) : 0
}

/** get_rewards_for_customer: quà / voucher đổi được theo hạng, số điểm cần sau ưu đãi hạng, đủ điểm hay chưa. */
export function rewardsForCustomer(program: Pick<LoyaltyProgram, 'tiers' | 'policies'>, ctx: RewardContext): LoyaltyReward[] {
  const out: LoyaltyReward[] = []
  const defKey = defaultTierKey(program.tiers)
  for (const p of activePolicies(program.policies, ctx.storeId, ctx.now, [5, 6])) {
    const cfg = parseRules(p)
    const min = floatval(cfg.min_order_amount)
    if (min > 0 && ctx.orderTotal > 0 && ctx.orderTotal < min) continue
    const rows = rec(cfg.rules).rewards
    if (!Array.isArray(rows)) continue
    for (const raw of rows) {
      if (!isRecord(raw) || intval(raw.status ?? 1) !== 1) continue
      const start = raw.start_at ? wallClock(str(raw.start_at)) : 0
      const end = raw.end_at ? wallClock(str(raw.end_at)) : 0
      if ((start && ctx.now < start) || (end && ctx.now > end)) continue
      const minTier = sanitizeKey(raw.min_tier ?? defKey)
      if (!isTierAtLeast(program.tiers, ctx.tierKey, minTier)) continue
      const tierCosts = rec(raw.tier_costs)
      const tk = sanitizeKey(ctx.tierKey)
      // isset(): khoá có mà giá trị null coi như không có.
      const points = tierCosts[tk] !== undefined && tierCosts[tk] !== null ? Math.max(0, intval(tierCosts[tk])) : Math.max(0, intval(raw.points_required))
      if (points <= 0) continue
      const sku = trim(raw.sku)
      const code = sanitizeKey(raw.reward_code ?? (sku || `reward_${p.id}_${out.length}`))
      let name = trim(raw.name)
      if (name === '') name = p.type === 6 ? 'Voucher đổi điểm' : 'Quà đổi điểm'
      const reward: LoyaltyReward = {
        index: `lp_${p.id}_${code}`,
        policyId: p.id,
        programCode: p.code,
        programTitle: p.title,
        rewardCode: code,
        rewardType: p.type === 6 ? 'voucher' : 'product',
        sku,
        productName: name,
        quantity: Math.max(1, intval(raw.quantity ?? 1)),
        points,
        basePoints: Math.max(0, intval(raw.points_required)),
        canRedeem: ctx.points >= points,
        remainingPointsAfter: Math.max(0, ctx.points - points),
        isTracking: p.type === 6 ? 0 : 'is_tracking' in raw ? (truthy(raw.is_tracking) ? 1 : 0) : 0,
        minTier,
      }
      if (p.type === 6) {
        reward.voucher = {
          prefix: trim(raw.voucher_prefix ?? `${p.code.toUpperCase()}-`),
          discountType: sanitizeKey(raw.discount_type ?? 'fixed'),
          discountValue: floatval(raw.discount_value),
          maxDiscount: floatval(raw.max_discount),
          minOrderAmount: floatval(raw.min_order_amount),
          expiresInDays: Math.max(0, intval(raw.expires_in_days)),
        }
      }
      out.push(reward)
    }
  }
  return out
}
