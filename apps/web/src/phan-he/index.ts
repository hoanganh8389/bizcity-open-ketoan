/**
 * Danh sách phân hệ phía giao diện (trang Tổng quan, thanh phân hệ, menu trái). Thêm phân hệ: tạo một tệp manifest
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

export type { WebModule } from './types';

const ALL: WebModule[] = [keToan, quy, muaHang, banHang, kho, danhMuc, taiSan, thue, apiModule, heThong];
// vite.config.ts (chạy trong Node, xuất erp-menu.json) cũng nạp tệp này: ở đó không có import.meta.env.
const only = String((import.meta as { env?: Record<string, string> }).env?.VITE_MODULES ?? '').split(',').map((s) => s.trim()).filter(Boolean);

export const WEB_MODULES: WebModule[] = (only.length ? ALL.filter((m) => only.includes(m.key) || m.key === 'he-thong') : ALL)
  .slice().sort((a, b) => a.order - b.order);
