// @bizcity-layer D modules/ke-toan
// [2026-11-13 08:00 PM kiennt] NT-HT-003 — phân hệ Kế toán tự đăng ký màn nghiệp vụ + thao tác; lệnh của lõi (/vouchers, /documents, /periods, /closing, /debt-allocations…) gác qua `lenh` (đóng góp)
/**
 * Màn của phân hệ Kế toán. Quy ước:
 * - Lệnh phân hệ tự có (Lập BCTC, Kế hoạch thu chi) đổi quyền tại chỗ sang `quyenThaoTac` (quyền Core cũ là documents:write → kéo theo).
 * - Lệnh của lõi (phiếu kế toán, số dư đầu kỳ, khoá kỳ, kết chuyển, giá vốn, đối trừ công nợ) gác bằng `lenh` — quyền cũ của lệnh VẪN đòi,
 *   quyền chi tiết đòi THÊM (người đang dùng có documents:write nên không mất quyền; muốn hẹp thì Cấm quyền chi tiết).
 * - Phiếu kế toán gác theo loại phiếu 'manual': mọi màn lập phiếu kế toán qua /api/v1/vouchers (cấn trừ công nợ, ghi tăng / giảm công nợ)
 *   cùng chịu quyền này (lõi không phân biệt màn gọi).
 */
import { dangKyManHinh, type LenhGac, type LoaiThaoTac, type ThaoTac } from '../../modules/access/man-hinh.js';

const L = (method: LenhGac['method'], url: string, docType?: string[]): LenhGac => ({ method, url, ...(docType ? { docType } : {}) });
// [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — sửa: khai `goc` = quyền gốc rủi ro cao lệnh vẫn đòi (Cho quyền chi tiết không thay được) (đóng góp)
const T = (quyen: string, nhan: string, loai: LoaiThaoTac, lenh?: LenhGac[], goc?: ThaoTac['goc']): ThaoTac => ({ quyen: `ke-toan:${quyen}`, nhan, loai, ...(lenh ? { lenh } : {}), ...(goc ? { goc } : {}) });
const nhom = 'Kế toán';

const MANUAL = ['manual'];
dangKyManHinh({
  key: 'ke-toan.phieu-ke-toan', ma: 'ACC16', nhom, nhan: 'Phiếu kế toán', duongDan: '/nghiep-vu/phieu-ke-toan',
  thaoTac: {
    xem: T('phieu-ke-toan-xem', 'Xem', 'xem', [L('GET', '/api/v1/documents', MANUAL)]),
    them: T('phieu-ke-toan-lap', 'Thêm', 'ghi', [L('POST', '/api/v1/vouchers', MANUAL)]),
    sua: T('phieu-ke-toan-sua', 'Sửa', 'ghi', [L('PUT', '/api/v1/vouchers/:id', MANUAL)]),
    huy: T('phieu-ke-toan-huy', 'Huỷ', 'huy', [L('POST', '/api/v1/documents/cancel', MANUAL)]),
    duyet: T('phieu-ke-toan-duyet', 'Duyệt / ghi sổ', 'ghi', [L('POST', '/api/v1/vouchers/:id/approve', MANUAL)]),
  },
});

dangKyManHinh({
  key: 'ke-toan.so-du-dau-ky', ma: 'ACC15', nhom, nhan: 'Số dư tài khoản đầu kỳ', duongDan: '/nghiep-vu/so-du-tai-khoan',
  thaoTac: {
    xem: T('so-du-dau-ky-xem', 'Xem', 'xem', [L('GET', '/api/v1/documents', ['opening'])]),
    them: T('so-du-dau-ky-lap', 'Nhập số dư', 'ghi', [L('POST', '/api/v1/opening-balances')]),
    sua: T('so-du-dau-ky-sua', 'Sửa', 'ghi', [L('PUT', '/api/v1/opening-balances/:id')]),
    huy: T('so-du-dau-ky-huy', 'Huỷ', 'huy', [L('POST', '/api/v1/documents/cancel', ['opening'])]),
  },
});

dangKyManHinh({
  key: 'ke-toan.gia-von', ma: 'ACC49', nhom, nhan: 'Tính giá vốn', duongDan: '/nghiep-vu/tinh-gia-von',
  thaoTac: {
    xem: T('gia-von-xem', 'Xem', 'xem', [L('GET', '/api/v1/inventory/costs')]), // [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — Xem gác lệnh đọc riêng của màn (đóng góp)
    tinh: T('gia-von-tinh', 'Tính giá vốn', 'ghi', [L('POST', '/api/v1/inventory/costing')]),
  },
});

dangKyManHinh({
  key: 'ke-toan.ket-chuyen', ma: 'ACC6', nhom, nhan: 'Kết chuyển lãi / lỗ', duongDan: '/nghiep-vu/ket-chuyen',
  thaoTac: {
    xem: T('ket-chuyen-xem', 'Xem', 'xem', [L('GET', '/api/v1/closing/runs'), L('GET', '/api/v1/closing/runs/:id/sources'), L('GET', '/api/v1/closing/rules'), L('GET', '/api/v1/closing/rules/versions')]), // [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — Xem gác lệnh đọc riêng của màn (đóng góp)
    chay: T('ket-chuyen-chay', 'Kết chuyển', 'ghi', [L('POST', '/api/v1/closing/run')], 'periods:lock'),
    namTruoc: T('ket-chuyen-nam-truoc', 'Chuyển lợi nhuận năm trước', 'ghi', [L('POST', '/api/v1/closing/year-end')], 'periods:lock'),
    huy: T('ket-chuyen-huy', 'Huỷ kết chuyển', 'huy', [L('POST', '/api/v1/documents/cancel', ['closing'])]),
    cauHinh: T('ket-chuyen-cau-hinh', 'Sửa thứ tự / quy tắc kết chuyển', 'ghi', [L('PUT', '/api/v1/closing/rules')], 'settings:write'),
  },
});

// Lưới khoá (PUT /periods/locks) vừa khoá vừa mở → đòi cả hai quyền.
dangKyManHinh({
  key: 'ke-toan.ky-ke-toan', ma: 'ACC2', nhom, nhan: 'Đóng / mở kỳ kế toán', duongDan: '/cau-hinh/ky-ke-toan',
  thaoTac: {
    xem: T('ky-ke-toan-xem', 'Xem', 'xem', [L('GET', '/api/v1/periods/lock-events')]), // [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — Xem gác lệnh đọc riêng của màn (đóng góp)
    khaiKy: T('ky-ke-toan-khai', 'Khai kỳ (năm)', 'ghi', [L('POST', '/api/v1/periods')], 'periods:lock'),
    khoa: T('ky-ke-toan-khoa', 'Khoá kỳ', 'ghi', [L('POST', '/api/v1/periods/locks'), L('PUT', '/api/v1/periods/locks')], 'periods:lock'),
    moKhoa: T('ky-ke-toan-mo-khoa', 'Mở khoá kỳ', 'huy', [L('DELETE', '/api/v1/periods/locks/:id'), L('PUT', '/api/v1/periods/locks')], 'periods:lock'),
  },
});

dangKyManHinh({
  key: 'ke-toan.doi-tru-cong-no', ma: 'CN01', nhom, nhan: 'Khoản công nợ và đối trừ', duongDan: '/cong-no/khoan-cong-no',
  thaoTac: {
    xem: T('doi-tru-xem', 'Xem', 'xem'),
    doiTru: T('doi-tru-lap', 'Đối trừ / tự đối trừ', 'ghi', [L('POST', '/api/v1/debt-allocations'), L('POST', '/api/v1/debt-allocations/auto')]),
    goDoiTru: T('doi-tru-go', 'Gỡ đối trừ', 'huy', [L('DELETE', '/api/v1/debt-allocations/:id')]),
  },
});

// Lệnh của phân hệ (report.routes.ts) — gác tại chỗ bằng quyenThaoTac.
dangKyManHinh({
  key: 'ke-toan.lap-bctc', ma: 'ACC99', nhom, nhan: 'Lập báo cáo tài chính', duongDan: '/tong-hop/lap-bctc',
  thaoTac: {
    xem: T('lap-bctc-xem', 'Xem', 'xem'),
    luu: T('lap-bctc-luu', 'Lưu bộ báo cáo', 'ghi'),
    xoa: T('lap-bctc-xoa', 'Xoá bộ báo cáo', 'huy'),
  },
});

// Lệnh của phân hệ (planning.routes.ts): kế hoạch thu chi gác tại chỗ; định mức chi phí (catalog:write) gác thêm qua lenh.
dangKyManHinh({
  key: 'ke-toan.ke-hoach-thu-chi', ma: 'KH01', nhom, nhan: 'Kế hoạch thu chi', duongDan: '/ke-hoach/thu-chi',
  thaoTac: {
    xem: T('ke-hoach-thu-chi-xem', 'Xem', 'xem'),
    them: T('ke-hoach-thu-chi-lap', 'Thêm / điền tự động', 'ghi'),
    sua: T('ke-hoach-thu-chi-sua', 'Sửa', 'ghi'),
    xoa: T('ke-hoach-thu-chi-xoa', 'Xoá', 'huy'),
  },
});
dangKyManHinh({
  key: 'ke-toan.dinh-muc', ma: 'KH02', nhom, nhan: 'Định mức chi phí', duongDan: '/ke-hoach/dinh-muc',
  thaoTac: {
    xem: T('dinh-muc-xem', 'Xem', 'xem', [L('GET', '/api/v1/cost-norms'), L('GET', '/api/v1/reports/cost-vs-norm')]), // [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — Xem gác lệnh đọc riêng của màn (đóng góp)
    sua: T('dinh-muc-sua', 'Sửa / sao chép định mức', 'ghi', [L('PUT', '/api/v1/cost-norms'), L('POST', '/api/v1/cost-norms/copy')]),
  },
});
