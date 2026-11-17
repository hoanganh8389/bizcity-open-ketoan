// Chính sách mẫu NT-BH-020 §4 (CN01): TICH10K 1 điểm / 10.000đ hạn 365 ngày; THUONG1TR đơn từ 1.000.000đ +20; hạng ×1 / ×1,2 / ×1,5.
import type { LoyaltyProgram } from '../api/domain/engine.js';

export const PROGRAM: LoyaltyProgram = {
  version: 'lp-test-1',
  settings: { enablePosEarn: true, enablePosRedeem: true, enableTierMultiplier: true, minRedeemPoints: 0, pointLabel: 'điểm' },
  tiers: [
    { key: 'member', name: 'Thành viên', minPoints: 0, multiplier: 1 },
    { key: 'silver', name: 'Bạc', minPoints: 1000, multiplier: 1.2 },
    { key: 'gold', name: 'Vàng', minPoints: 5000, multiplier: 1.5 },
  ],
  policies: [
    { id: 1, code: 'TICH10K', title: '1 điểm cho mỗi 10.000đ', type: 1, priority: 1, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules: { earn_rate: 1, earn_unit: 10000, point_expiry_days: 365 } },
    { id: 3, code: 'DOIVC', title: 'Đổi 100 điểm lấy voucher 50.000đ', type: 6, priority: 3, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules: { rules: { rewards: [{ reward_code: 'VC50K', name: 'Voucher 50.000đ', points_required: 100, voucher_prefix: 'TGS50-', discount_type: 'fixed', discount_value: 50000, expires_in_days: 30 }] } } },
    { id: 4, code: 'DOIQUA', title: 'Đổi 50 điểm lấy 1 hộp quà', type: 5, priority: 4, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules: { rules: { rewards: [{ reward_code: 'QUA1', name: "Me n' Mil 200ml", sku: '100045001Z', quantity: 1, points_required: 50 }] } } },
    { id: 2, code: 'THUONG1TR', title: 'Đơn từ 1.000.000đ thưởng 20 điểm', type: 4, priority: 2, status: 1, autoApply: true, startDate: 0, endDate: 0, applyToBlogIds: [], rules: { point_expiry_days: 365, rules: [{ min_amount: 1000000, bonus_points: 20 }] } },
  ],
};
