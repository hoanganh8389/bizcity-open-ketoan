# Viết add-in

Add-in thêm chức năng mà không sửa lõi: báo cáo riêng, xuất số liệu, tích hợp ứng dụng khác. Một add-in gồm phần API (bắt buộc) và phần giao diện (tuỳ chọn).

## 1. Phần API

Tạo `apps/api/src/addins/<ma>/index.ts`:

```ts
import { z } from 'zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { defineAddIn } from '../../core/addins.js';
import { authOf, requirePermission } from '../../core/auth.js';
import { ok } from '../../core/http.js';
import { reportService } from '../../modules/reports/report.service.js';

export default defineAddIn({
  manifest: {
    id: 'doanh-thu-ngay',                 // chữ thường, gạch ngang, duy nhất
    name: 'Doanh thu theo ngày',
    version: '1.0.0',
    description: 'Bảng doanh thu từng ngày.',
    menuParent: 'so-sach',                // nhóm menu gắn vào (key ở web/src/layout/menu.ts)
    menu: [{ key: 'dt-ngay', label: 'Doanh thu theo ngày', path: '/addins/doanh-thu-ngay', code: 'AD01' }],
  },
  register(app) {
    const r = app.withTypeProvider<ZodTypeProvider>();
    // Đường dẫn thật: /api/v1/addins/doanh-thu-ngay/data
    r.get('/data', {
      preHandler: requirePermission('reports:read'),
      schema: { tags: ['Add-in: Doanh thu ngày'], querystring: z.object({ from: z.string(), to: z.string() }) },
      handler: async (req) => ok(await reportService.dashboard(authOf(req), req.query)),
    });
  },
});
```

Đăng ký trong `apps/api/src/addins/index.ts`:

```ts
import doanhThuNgay from './doanh-thu-ngay/index.js';
export const BUILTIN_ADDINS = [excelExport, spreadsheetAi, doanhThuNgay];
```

Quy tắc:

- Luôn khai `preHandler: requirePermission(...)`; dữ liệu luôn lọc theo `authOf(req).tenantId` (dịch vụ lõi đã làm).
- Dùng lại `reportService`, `documentService`… thay vì tự truy vấn sổ cái.
- Cần bảng riêng: thêm migration, đặt tên bảng có tiền tố `addin_<ma>_`.
- Không ghi thẳng vào `gl_*`; muốn ghi sổ thì gọi `ledgerService.post()`.

## 2. Phần giao diện

Tạo `apps/web/src/addins/<ma>/<Ten>Page.tsx` rồi thêm vào `apps/web/src/addins/registry.tsx`:

```tsx
export const ADDIN_ROUTES = [
  { addinId: 'doanh-thu-ngay', path: '/addins/doanh-thu-ngay', element: <DoanhThuNgayPage /> },
];
```

Mục menu lấy từ `manifest.menu` (API trả qua `/api/v1/system/addins`), tự hiện ở nhóm `menuParent`. Dùng `PageHeader` với `helpKey` và viết `docs/huong-dan/<helpKey>.md` để có nút Hướng dẫn.

## 3. Bật, tắt

Biến môi trường `ADDINS`: `*` (tất cả), danh sách mã cách nhau dấu phẩy, hoặc `-` (tắt hết). Add-in tắt thì route không được đăng ký và mục menu không hiện.

## 4. Add-in có sẵn để tham khảo

| Mã | Minh hoạ |
|---|---|
| `excel-export` | Dùng lại dịch vụ báo cáo, trả tệp CSV |
| `spreadsheet-ai` | Có mục menu, trang riêng, nhúng ứng dụng ngoài qua cấu hình |
| `tro-ly` | Trợ lý tầng 1: mô phỏng định khoản phiếu mẫu (chạy bộ định khoản thật rồi huỷ, `POST /simulate`), tìm tính năng, hỏi đáp từ `docs/tro-ly/*.md`. Thêm luồng: `flows.ts` (web) + `sampleDocument()` (api); thêm câu hỏi: viết mục `##` trong `docs/tro-ly/` |
