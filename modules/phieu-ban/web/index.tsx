/** Phiếu bán nhập tay — màn BH10 / BH11 vẫn ở khung giao diện (apps/web, PhieuHangPage) và gọi API của module này qua lib/tradeDocs.ts. */
// [2026-11-13 11:30 PM Võ Hoàng] NGHIEM-THU — NT-BH-015: module không thêm màn riêng (đóng góp)
import { defineWebModule } from '@bizcity/module-sdk/web';

export default defineWebModule({ key: 'phieu-ban', label: 'Phiếu bán nhập tay', menu: [], routes: [] });
