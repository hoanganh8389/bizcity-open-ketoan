// @bizcity-layer P audit
// [2026-11-06 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-30c: fixture SC-EVD-9 — tệp được miễn nhưng ghi đè, không wx / link, thiếu tên hợp đồng (ADR-0030 D-SEAL-4)
import fs from 'node:fs';

export function sealDay(target: string, rows: unknown[]): void {
  fs.writeFileSync(`${target}.jsonl`, rows.map((r) => JSON.stringify(r)).join('\n')); // SC-EVD-9 overwrite (SC-EVD-1 miễn tệp này)
}
