// @bizcity-layer D modules/mua-hang
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — nhập xuất tồn + báo cáo hàng hoá lấy từ GOODS (loi.ts), không import báo cáo của ke-toan (SC-MOD-1)
/** Phân hệ MUA HÀNG: nhà cung cấp, mua hàng, trả hàng nhà cung cấp, công nợ phải trả (chứng từ mua đi qua lõi chứng từ). */
import type { ApiModule } from '../types.js';
import { GOODS, LEDGER } from '../loi.js';
import { purchaseRoutes } from './routes.js';
import { stockRoutes } from './ton-max-routes.js';
import { invoiceRoutes } from './hoa-don-routes.js';
// [2026-11-09 04:50 PM kiennt] PHASE-028 — giai đoạn 3.2 (80 D-AUTH-19): phân hệ đăng ký quyền lập / sửa cho loại chứng từ của mình ở cửa nạp (khai ở permissions[] của manifest; documents:write kéo theo)
import { registerDocumentType } from '@bizcity/platform/core/auth';
// [2026-11-09 05:55 PM kiennt] PHASE-028 — giai đoạn 3.2b: đủ bộ thao tác xem / lập / huỷ (/ xuất) cho từng loại chứng từ của phân hệ
registerDocumentType('purchase', { read: 'mua-hang:phieu-mua-xem', create: 'mua-hang:phieu-mua-lap', cancel: 'mua-hang:phieu-mua-huy' });
registerDocumentType('purchase_return', { read: 'mua-hang:tra-ncc-xem', create: 'mua-hang:tra-ncc-lap', cancel: 'mua-hang:tra-ncc-huy' });

export const muaHang: ApiModule = { key: 'mua-hang', label: 'Mua hàng', routes: [...LEDGER, ...GOODS, purchaseRoutes, stockRoutes, invoiceRoutes] };
