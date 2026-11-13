// @bizcity-layer D modules/ban-hang
/** Phân hệ BÁN HÀNG: khách hàng, bán hàng, hàng bán trả lại, công nợ phải thu, báo cáo bán hàng. */
import type { ApiModule } from '../types.js';
import { LEDGER } from '../loi.js';
import { salesReportRoutes } from '../../modules/sales/sales-report.routes.js';
// [2026-11-13 03:10 PM Võ Hoàng] UX-14 — việc cần làm cho Luồng chi tiết Bán hàng (đóng góp)
import { viecCanLamRoutes } from './viec-can-lam.js';
// [2026-11-09 04:50 PM kiennt] PHASE-028 — giai đoạn 3.2 (80 D-AUTH-19): phân hệ đăng ký quyền lập / sửa cho loại chứng từ của mình ở cửa nạp (khai ở permissions[] của manifest; documents:write kéo theo)
import { registerDocumentType } from '@bizcity/platform/core/auth';
// [2026-11-09 05:55 PM kiennt] PHASE-028 — giai đoạn 3.2b: đủ bộ thao tác xem / lập / huỷ (/ xuất) cho từng loại chứng từ của phân hệ
registerDocumentType('sale', { read: 'ban-hang:hoa-don-xem', create: 'ban-hang:hoa-don-lap', cancel: 'ban-hang:hoa-don-huy', export: 'ban-hang:hoa-don-xuat' });
registerDocumentType('sale_return', { read: 'ban-hang:tra-hang-xem', create: 'ban-hang:tra-hang-lap', cancel: 'ban-hang:tra-hang-huy', export: 'ban-hang:tra-hang-xuat' });

export const banHang: ApiModule = { key: 'ban-hang', label: 'Bán hàng', routes: [...LEDGER, salesReportRoutes, viecCanLamRoutes] };
