// @bizcity-layer D modules/ke-toan
// [2026-11-03 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-LAYER-2): cổng do phân hệ này tự khai — phân hệ cung cấp gắn bản thật ở app.ts, phân hệ này không import phân hệ khác (D → D chỉ trong cùng module)
/** Kế toán dùng của phân hệ Tài sản (tuỳ chọn): tách chi phí trả trước ngắn / dài hạn cho bảng cân đối. Không gắn → không tách. */
import type { Db } from '../../db/client.js';

export interface KeToanPorts {
  /** Theo tài khoản: phần ngắn hạn / dài hạn của chi phí trả trước tại ngày asOf. */
  prepaidSplit(trx: Db, tenantId: string, asOf: string): Promise<Map<string, { short: number; long: number }>>;
}

let ports: Partial<KeToanPorts> = {};
/** app.ts gắn bản thật. */
export function provideKeToanPorts(p: Partial<KeToanPorts>): void {
  ports = { ...ports, ...p };
}
export function keToanPorts(): Partial<KeToanPorts> {
  return ports;
}
