/**
 * Module pos — phần giao diện quản trị bán lẻ (phiếu NT-BH-008): năm màn dưới /app/pos/, nằm ở mục "Bán lẻ máy POS" của nhóm
 * Phần riêng (apps/web/src/layout/menu-gon.ts). Quyền xem: pos:report (thu ngân không có). Máy bán (thu ngân) là ứng dụng riêng.
 */
import { defineWebModule } from '@bizcity/module-sdk/web';
import { CaiDatPage } from './screens/CaiDatPage';
import { DonBanPage } from './screens/DonBanPage';
// [2026-11-14 01:20 AM Võ Hoàng] NGHIEM-THU — NT-BH-016: màn Khuyến mại BH18 (đóng góp)
import { KhuyenMaiPage } from './screens/KhuyenMaiPage';
import { SoCaPage } from './screens/SoCaPage';
import { TongQuanPage } from './screens/TongQuanPage';
import { TraHangPage } from './screens/TraHangPage';

const P = 'pos:report';

export default defineWebModule({
  key: 'pos',
  label: 'Bán lẻ máy POS',
  menu: [
    { key: 'pos-don-ban', label: 'Đơn bán máy POS', path: '/app/pos/don-ban', code: 'BH13', permission: P },
    { key: 'pos-tra-hang', label: 'Phiếu trả hàng máy POS', path: '/app/pos/tra-hang', code: 'BH14', permission: P },
    { key: 'pos-ca-ban', label: 'Sổ ca bán', path: '/app/pos/ca-ban', code: 'BH15', permission: P },
    { key: 'pos-tong-quan', label: 'Tổng quan bán lẻ', path: '/app/pos/tong-quan', code: 'BH16', permission: P },
    { key: 'pos-cai-dat', label: 'Cài đặt bán hàng', path: '/app/pos/cai-dat', code: 'BH17', permission: P },
    // [2026-11-15 10:00 AM Võ Hoàng] NGHIEM-THU — NT-BH-018: một màn Chương trình khuyến mại (gộp BH12) (đóng góp)
    { key: 'pos-khuyen-mai', label: 'Chương trình khuyến mại', path: '/app/pos/khuyen-mai', code: 'BH18', permission: P },
  ],
  routes: [
    { path: '/app/pos/don-ban', component: DonBanPage, permission: P },
    { path: '/app/pos/tra-hang', component: TraHangPage, permission: P },
    { path: '/app/pos/ca-ban', component: SoCaPage, permission: P },
    { path: '/app/pos/tong-quan', component: TongQuanPage, permission: P },
    { path: '/app/pos/cai-dat', component: CaiDatPage, permission: P },
    { path: '/app/pos/khuyen-mai', component: KhuyenMaiPage, permission: P },
  ],
});
