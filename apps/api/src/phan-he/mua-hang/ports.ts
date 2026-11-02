// @bizcity-layer D modules/mua-hang
// [2026-11-03 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-LAYER-2): cổng do phân hệ này tự khai — phân hệ cung cấp gắn bản thật ở app.ts, phân hệ này không import phân hệ khác (D → D chỉ trong cùng module)
/** Mua hàng (báo cáo kho của phân hệ) dùng của phân hệ Kho: câu SQL dòng nhập xuất có giá trị — bắt buộc cho báo cáo tồn. */
import type { RawBuilder } from 'kysely';

export interface MuaHangPorts {
  valuedMovements(a: { tenantId: string; to: string; branchIds: string[] | null; search?: string; wh?: { codes: string[]; defaultBranchIds: string[] } | null }): RawBuilder<unknown>;
}

let ports: Partial<MuaHangPorts> = {};
/** app.ts gắn bản thật. */
export function provideMuaHangPorts(p: Partial<MuaHangPorts>): void {
  ports = { ...ports, ...p };
}
export function muaHangPorts(): Partial<MuaHangPorts> {
  return ports;
}
