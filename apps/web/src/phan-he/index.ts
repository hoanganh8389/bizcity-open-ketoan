/**
 * Danh sách phân hệ phía giao diện (trang Tổng quan, menu điện thoại, lọc màn theo phân hệ đang bật). Thêm phân hệ: tạo một tệp manifest
 * cùng thư mục rồi thêm vào WEB_MODULES. Biến VITE_MODULES (vd "mua-hang,kho") thu gọn danh sách khi chạy dev một phân hệ.
 */
import type { WebModule } from './types';
import { keToan } from './ke-toan/manifest';
import { quy } from './quy/manifest';
import { muaHang } from './mua-hang/manifest';
import { banHang } from './ban-hang/manifest';
import { kho } from './kho/manifest';
import { taiSan } from './tai-san/manifest';
import { thue } from './thue/manifest';
import { heThong } from './he-thong/manifest';
import { apiModule } from './api/manifest';
import { danhMuc } from './danh-muc/manifest';
// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: phân hệ Nhà phát triển (Bàn điều tra)
import { devModule } from './dev/manifest';
// [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2: module SDK (modules/<key>/web) — mục Tổng quan theo manifest
import { SDK_WEB } from './sdk-modules';

export type { WebModule } from './types';

const ALL: WebModule[] = [keToan, quy, muaHang, banHang, kho, danhMuc, taiSan, thue, apiModule, devModule, heThong, ...SDK_WEB.map((p) => p.meta)];
// vite.config.ts (chạy trong Node, xuất erp-menu.json) cũng nạp tệp này: ở đó không có import.meta.env.
const only = String((import.meta as { env?: Record<string, string> }).env?.VITE_MODULES ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const WEB_MODULES: WebModule[] = (only.length ? ALL.filter((m) => only.includes(m.key) || m.key === 'he-thong') : ALL)
  .slice().sort((a, b) => a.order - b.order);
