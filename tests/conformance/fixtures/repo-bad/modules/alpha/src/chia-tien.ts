// [2026-11-06 06:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-19: mẫu CỐ Ý SAI cho SC-STD-5 (tự viết hàm chia tiền, làm tròn tiền bằng Math.round). Không sửa "cho đúng".
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((s, w) => s + w, 0);
  return weights.map((w) => Math.floor((total * w) / sum));
}

export const payable = Math.round(amount * 1.1);
