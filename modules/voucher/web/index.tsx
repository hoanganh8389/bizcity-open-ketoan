// [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-026: màn BH21 Voucher (đóng góp)
/** Module voucher — phần giao diện: màn BH21 Voucher dưới /app/voucher/ (đợt phát, sinh / nạp mã, tra cứu, báo cáo). Quyền voucher:read. */
import { defineWebModule } from '@bizcity/module-sdk/web';
import { VoucherPage } from './screens/VoucherPage';

export default defineWebModule({
  key: 'voucher',
  label: 'Voucher',
  menu: [{ key: 'voucher-main', label: 'Voucher', path: '/app/voucher', code: 'BH21', permission: 'voucher:read' }],
  routes: [{ path: '/app/voucher', component: VoucherPage, permission: 'voucher:read' }],
});
