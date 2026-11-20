/**
 * Tra cứu — phần giao diện: các màn chỉ đọc dưới /app/tra-cuu/. Mỗi màn gác bằng quyền XEM của dữ liệu nó tra (quyền máy chủ
 * đang chặn ở API đó), không khai quyền riêng — tránh quyền chỉ để ẩn menu (SC-AUTH-11), người dùng không phải xin hai quyền.
 */
import { defineWebModule } from '@bizcity/module-sdk/web';
import { TraChinhSachPage } from './screens/TraChinhSachPage';

export default defineWebModule({
  key: 'tra-cuu',
  label: 'Tra cứu',
  menu: [{ key: 'tra-cuu-chinh-sach', label: 'Tra chính sách theo mã hàng', path: '/app/tra-cuu/chinh-sach', code: 'TC01', permission: 'mua-hang:chinh-sach-xem' }],
  routes: [{ path: '/app/tra-cuu/chinh-sach', component: TraChinhSachPage, permission: 'mua-hang:chinh-sach-xem' }],
});
