/** Phân quyền — phần giao diện (Role Editor, HT12): một màn ba thẻ dưới /app/phan-quyen/. Biểu tượng / màu / thứ tự ở bizcity.module.json `ui`. */
import { defineWebModule } from '@bizcity/module-sdk/web';
import { PhanQuyenPage } from './screens/PhanQuyenPage';

export default defineWebModule({
  key: 'phan-quyen',
  label: 'Phân quyền',
  menu: [{ key: 'phan-quyen-editor', label: 'Phân quyền', path: '/app/phan-quyen/vai-tro', code: 'HT12', permission: 'users:write' }],
  routes: [{ path: '/app/phan-quyen/vai-tro', component: PhanQuyenPage, permission: 'users:write' }],
});
