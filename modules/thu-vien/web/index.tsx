/** Kho thư viện — phần giao diện (HT14): một màn ba thẻ dưới /app/thu-vien/. Biểu tượng / màu / thứ tự ở bizcity.module.json `ui`. */
import { defineWebModule } from '@bizcity/module-sdk/web';
import { KhoThuVienPage } from './screens/KhoThuVienPage';

export default defineWebModule({
  key: 'thu-vien',
  label: 'Kho thư viện',
  menu: [{ key: 'kho-thu-vien', label: 'Kho thư viện', path: '/app/thu-vien/kho', code: 'HT14', permission: 'catalog:read' }],
  routes: [{ path: '/app/thu-vien/kho', component: KhoThuVienPage, permission: 'catalog:read' }],
});
