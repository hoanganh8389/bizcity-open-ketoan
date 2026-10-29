import type { WebModule } from '../types';

export const apiModule: WebModule = {
  key: 'api', label: 'API', icon: 'Braces', color: '#3949ab', order: 80, topBar: false,
  description: 'Thử API ngay trên giao diện, hướng dẫn tích hợp, khoá API, nguồn dữ liệu màn hình (giả / thật)',
  groups: ['tich-hop'],
};
