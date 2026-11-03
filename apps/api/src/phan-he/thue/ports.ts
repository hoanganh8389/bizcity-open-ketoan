// @bizcity-layer D modules/thue
// [2026-11-03 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-LAYER-2): cổng do phân hệ này tự khai — phân hệ cung cấp gắn bản thật ở app.ts, phân hệ này không import phân hệ khác (D → D chỉ trong cùng module)
/** Thuế (thuyết minh báo cáo tài chính) dùng của phân hệ Tài sản: sổ tài sản cố định trong kỳ. Không gắn → bảng thuyết minh tài sản trống. */
import type { AuthContext } from '../../core/auth.js';

/** Các trường thuyết minh cần của một dòng sổ tài sản. */
export interface AssetRegisterRow { categoryName: string; startDate: string; originalCost: number; decreased: boolean; opening: number; charge: number; closing: number }

export interface ThuePorts {
  assetRegister(auth: AuthContext, q: { from: string; to: string; kind: 'fixed_asset' }): Promise<{ rows: AssetRegisterRow[] }>;
}

let ports: Partial<ThuePorts> = {};
/** app.ts gắn bản thật. */
export function provideThuePorts(p: Partial<ThuePorts>): void {
  ports = { ...ports, ...p };
}
export function thuePorts(): Partial<ThuePorts> {
  return ports;
}
