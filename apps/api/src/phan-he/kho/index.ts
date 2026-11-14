// @bizcity-layer D modules/kho
// [2026-10-31 10:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — nhập xuất tồn + báo cáo hàng hoá lấy từ GOODS (loi.ts), không import báo cáo của ke-toan (SC-MOD-1)
/** Phân hệ KHO: nhập xuất, chuyển kho, tồn kho, giá vốn, báo cáo hàng hoá. */
import type { ApiModule } from '../types.js';
import { GOODS, LEDGER } from '../loi.js';
// [2026-11-09 04:50 PM kiennt] PHASE-028 — giai đoạn 3.2 (80 D-AUTH-19): phân hệ đăng ký quyền lập / sửa cho loại chứng từ của mình ở cửa nạp (khai ở permissions[] của manifest; documents:write kéo theo)
import { registerDocumentType } from '@bizcity/platform/core/auth';
// [2026-11-09 05:55 PM kiennt] PHASE-028 — giai đoạn 3.2b: đủ bộ thao tác xem / lập / huỷ (/ xuất) cho từng loại chứng từ của phân hệ
registerDocumentType('transfer', { read: 'kho:chuyen-kho-xem', create: 'kho:chuyen-kho-lap', cancel: 'kho:chuyen-kho-huy' });
registerDocumentType('stock_adjustment', { read: 'kho:dieu-chinh-xem', create: 'kho:dieu-chinh-lap', cancel: 'kho:dieu-chinh-huy' });

// [2026-11-13 05:30 PM kiennt] PHAN-QUYEN — bản thử: màn hình + thao tác của phân hệ Kho đăng ký ở man-hinh-kho.ts (route import trước khi đọc quyền) (đóng góp)
import './man-hinh-kho.js';

export const kho: ApiModule = { key: 'kho', label: 'Kho', routes: [...LEDGER, ...GOODS] };
