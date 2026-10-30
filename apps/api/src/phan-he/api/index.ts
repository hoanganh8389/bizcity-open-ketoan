// @bizcity-layer D modules/api
/**
 * Phân hệ API — khu làm việc của người phụ trách API.
 *
 * Viết endpoint mới cho màn nhập phiếu (hợp đồng: docs/api/13-phieu-nhap-tay.md) trong thư mục này, ví dụ:
 *   phan-he/api/trade-documents/trade-documents.routes.ts   (+ .service.ts, .schemas.ts)
 * rồi thêm routes vào mảng `routes` dưới đây. Endpoint có schema zod tự hiện ở màn Thử API (API01) và /api/docs.
 * Mã nguồn lõi dùng lại được (import): ../../modules/documents (cổng nhận chứng từ, định khoản), ../../core/auth (quyền),
 * ../../db/client (cơ sở dữ liệu). Bảng mới: thêm migration ở db/migrations (người phụ trách DB duyệt).
 */
import type { ApiModule } from '../types.js';

export const apiModule: ApiModule = { key: 'api', label: 'API', routes: [] };
