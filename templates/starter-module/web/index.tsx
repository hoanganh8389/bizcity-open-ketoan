/** Module mẫu — phần giao diện: menu, màn (dưới /app/mau-module/), quyền. Biểu tượng / màu / thứ tự ở bizcity.module.json `ui`. */
import { defineWebModule } from '@bizcity/module-sdk/web';
import { RecordList } from './screens/RecordList';

export default defineWebModule({
  key: 'mau-module',
  label: 'Module mẫu',
  menu: [{ key: 'mau-module-records', label: 'Module mẫu', path: '/app/mau-module/ban-ghi', code: 'MM01', permission: 'mau-module:read' }],
  routes: [{ path: '/app/mau-module/ban-ghi', component: RecordList, permission: 'mau-module:read' }],
});
