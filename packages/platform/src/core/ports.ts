// @bizcity-layer P module-sdk
// [2026-11-03 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 (SC-LAYER-2): cổng của Platform — Kernel / adapter / phân hệ gắn bản thật ở gốc lắp ráp (app.ts), Platform không import chúng
/**
 * CỔNG (đảo phụ thuộc, TARGET-LAYOUT §2 / LAYOUT-1, LAYOUT-4). Route của Platform / danh mục cần một việc thuộc lớp khác
 * (Kernel đọc sổ, adapter WordPress / kết nối / tra MST) thì gọi corePort(tên); app.ts gắn bản thật bằng
 * provideCorePorts. Phụ thuộc giữa hai phân hệ không đi qua đây: phân hệ dùng tự khai cổng của mình (vd phan-he/ke-toan/ports.ts).
 * Kiểu dữ liệu tối thiểu ở đây — chi tiết ở bên cung cấp.
 */
import type { Db } from '../db/client.js';

export interface CorePorts {
  /** Kernel: trong `codes`, mã phân tích nào đã dùng trên sổ (không xoá được). */
  usedDimensionCodes(trx: Db, tenantId: string, kind: string, codes: string[]): Promise<Set<string>>;
  /** Adapter WordPress: đăng nhập bằng vé SSO của trang quản trị bán hàng. */
  wpLogin(ticket: string): Promise<unknown>;
  /** Adapter kết nối: kết nối chính của đơn vị (hệ thống bán hàng). */
  primaryConnection(tenantId: string): Promise<{ url: string; apiKey?: string | null } | null>;
  /** Adapter tra cứu mã số thuế. */
  lookupTaxCode(tenantId: string, taxCode: string): Promise<unknown>;
}

let core: Partial<CorePorts> = {};

/** Gốc lắp ráp (app.ts) gắn bản thật. Gắn lại cùng tên thì thay. */
export function provideCorePorts(p: Partial<CorePorts>): void {
  core = { ...core, ...p };
}

/** Cổng bắt buộc: chưa gắn → lỗi rõ (bản cài lắp thiếu). */
export function corePort<K extends keyof CorePorts>(name: K): CorePorts[K] {
  const f = core[name];
  if (!f) throw new Error(`Cổng ${String(name)} chưa gắn (app.ts provideCorePorts)`);
  return f;
}

