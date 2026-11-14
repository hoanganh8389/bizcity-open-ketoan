/** Thiết lập nhanh — phần giao diện (TI15, PHASE-036 · 00 §12): một màn bốn bước dưới /app/thiet-lap. Lối vào ở biểu ngữ đơn vị trắng (Tổng quan). */
import { defineWebModule } from '@bizcity/module-sdk/web';
import { ThietLapPage } from './screens/ThietLapPage';

export default defineWebModule({
  key: 'thiet-lap',
  label: 'Thiết lập nhanh',
  menu: [{ key: 'thiet-lap-nhanh', label: 'Thiết lập nhanh', path: '/app/thiet-lap', code: 'TI15', permission: 'settings:write' }],
  routes: [{ path: '/app/thiet-lap', component: ThietLapPage, permission: 'settings:write' }],
});
