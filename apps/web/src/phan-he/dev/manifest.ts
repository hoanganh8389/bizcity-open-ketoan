// [2026-11-01 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W3: phân hệ Nhà phát triển (Bàn điều tra) phía giao diện
import type { WebModule } from '../types';

/** Bàn điều tra cho nhà phát triển (PHASE-019). Route API thuộc lõi (luôn bật); ai thấy do quyền devtools:read ở menu. */
export const devModule: WebModule = {
  key: 'dev', label: 'Nhà phát triển', icon: 'Bug', color: '#6d4c41', order: 85, topBar: false,
  description: 'Bàn điều tra: tra mã lỗi, xem trace, nhật ký kỹ thuật của đơn vị — tìm lỗi của phân hệ / add-in mà không vào Grafana',
  groups: ['nha-phat-trien'],
};
