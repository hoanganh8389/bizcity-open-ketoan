// @bizcity-layer D modules/he-thong
/** Phân hệ HỆ THỐNG: đơn vị, người dùng, khoá API, kết nối, cài đặt — toàn bộ ở lõi (luôn bật). */
import type { ApiModule } from '../types.js';
import './man-hinh-he-thong.js'; // [2026-11-13 09:30 PM kiennt] NT-HT-003 — màn Danh mục / Hệ thống đăng ký thao tác (đóng góp)

export const heThong: ApiModule = { key: 'he-thong', label: 'Hệ thống', routes: [] };
