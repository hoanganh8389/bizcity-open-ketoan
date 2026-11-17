// [2026-11-16 11:00 AM Võ Hoàng] LOYALTY — NT-BH-020 bước 3: màn BH19 Điểm thành viên (đóng góp)
/**
 * Module loyalty — phần giao diện: màn BH19 Điểm thành viên (chỉ xem) dưới /app/loyalty/. Quyền loyalty:read (kế toán, quản lý;
 * thu ngân đọc điểm của khách ở máy bán qua API, không vào màn này vì không có quyền vào kế toán).
 */
import { defineWebModule } from '@bizcity/module-sdk/web';
import { DiemThanhVienPage } from './screens/DiemThanhVienPage';

export default defineWebModule({
  key: 'loyalty',
  label: 'Điểm thành viên',
  menu: [{ key: 'loyalty-diem', label: 'Điểm thành viên', path: '/app/loyalty/diem', code: 'BH19', permission: 'loyalty:read' }],
  routes: [{ path: '/app/loyalty/diem', component: DiemThanhVienPage, permission: 'loyalty:read' }],
});
