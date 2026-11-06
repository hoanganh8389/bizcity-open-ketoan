// [2026-11-06 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-19: mẫu ĐÚNG cho SC-STD-5 (dùng bản chung; bọc mỏng được phép). Không được có phát hiện nào ở tệp này.
import { allocate, roundMoney } from '@bizcity/module-sdk';

export function spreadFee(fee: number, weights: number[]): number[] {
  return allocate(fee, weights);
}

export const vat = roundMoney((100_000 * 8) / 100);
