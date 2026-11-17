/**
 * Phiếu bán nhập tay — màn BH10 / BH11 vẫn ở khung giao diện (apps/web, PhieuHangPage) và gọi API của module này qua lib/tradeDocs.ts.
 * Màn riêng của module: BH20 Đơn đặt hàng (NT-BH-023) dưới /app/phieu-ban/.
 */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: module không thêm màn riêng (đóng góp)
// [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: màn BH20 Đơn đặt hàng (đóng góp)
import { defineWebModule } from '@bizcity/module-sdk/web';
import { DonDatHangPage } from './screens/DonDatHangPage';

const P = 'phieu-ban:read';

export default defineWebModule({
  key: 'phieu-ban',
  label: 'Phiếu bán nhập tay',
  menu: [{ key: 'don-dat-hang', label: 'Đơn đặt hàng', path: '/app/phieu-ban/don-dat-hang', code: 'BH20', permission: P }],
  routes: [{ path: '/app/phieu-ban/don-dat-hang', component: DonDatHangPage, permission: P }],
});
