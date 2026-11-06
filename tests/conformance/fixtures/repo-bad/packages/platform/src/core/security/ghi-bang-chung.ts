// @bizcity-layer P permissions
// [2026-11-06 10:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-30c: fixture SC-EVD-9 — ghi dưới bang-chung ngoài evidence-export.ts (ADR-0030 D-SEAL-2)
import fs from 'node:fs';
import path from 'node:path';

export function niemPhongTuChe(tenantId: string, date: string, rows: unknown[]): void {
  const fd = fs.openSync(path.join(process.env.DATA_DIR ?? './data', 'bang-chung', tenantId, `${date}.log`), 'w'); // SC-EVD-9
  fs.writeSync(fd, rows.map((r) => JSON.stringify(r)).join('\n'));
  fs.closeSync(fd);
}
