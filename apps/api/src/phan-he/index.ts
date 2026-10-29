/**
 * PHÂN HỆ phía máy chủ. Mỗi phân hệ một thư mục src/phan-he/<key>/ (index.ts khai route + mã nguồn riêng của phân hệ);
 * lõi (luôn bật) ở loi.ts. Biến ENABLED_MODULES chọn phân hệ chạy trong một tiến trình (dev theo phân hệ):
 *   ENABLED_MODULES=*            mọi phân hệ (mặc định — máy chủ thật)
 *   ENABLED_MODULES=mua-hang,kho chỉ Mua hàng + Kho (+ lõi)
 * Một route được nằm ở nhiều phân hệ — bật nhiều phân hệ thì chỉ đăng ký một lần.
 * Thêm phân hệ: tạo thư mục <key>/index.ts rồi thêm vào API_MODULES (xem docs/phat-trien.md).
 */
import type { ApiModule, Routes } from './types.js';
import { CORE_ROUTES } from './loi.js';
import { keToan } from './ke-toan/index.js';
import { quy } from './quy/index.js';
import { muaHang } from './mua-hang/index.js';
import { banHang } from './ban-hang/index.js';
import { kho } from './kho/index.js';
import { taiSan } from './tai-san/index.js';
import { thue } from './thue/index.js';
import { heThong } from './he-thong/index.js';
import { apiModule } from './api/index.js';

export type { ApiModule } from './types.js';
export { CORE_ROUTES } from './loi.js';

export const API_MODULES: ApiModule[] = [keToan, quy, muaHang, banHang, kho, taiSan, thue, apiModule, heThong];

/** Phân hệ được bật theo ENABLED_MODULES ('*' hoặc trống = tất cả). Mã lạ → lỗi khởi động. */
export function enabledModules(spec: string): ApiModule[] {
  const want = spec.split(',').map((s) => s.trim()).filter(Boolean);
  if (!want.length || want.includes('*')) return API_MODULES;
  const bad = want.filter((k) => !API_MODULES.some((m) => m.key === k));
  if (bad.length) throw new Error(`ENABLED_MODULES có phân hệ không tồn tại: ${bad.join(', ')} (có: ${API_MODULES.map((m) => m.key).join(', ')})`);
  // Kèm các phân hệ được khai ở includes (vd Kế toán).
  const keys = new Set(want);
  for (const k of want) for (const inc of API_MODULES.find((m) => m.key === k)?.includes ?? []) keys.add(inc);
  return API_MODULES.filter((m) => keys.has(m.key));
}

/** Route cần đăng ký: lõi + các phân hệ bật, bỏ trùng (giữ thứ tự). */
export function routesFor(spec: string): Routes[] {
  return [...new Set([...CORE_ROUTES, ...enabledModules(spec).flatMap((m) => m.routes)])];
}
