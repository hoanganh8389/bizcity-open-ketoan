// @bizcity-layer D modules/thue
// [2026-11-13 08:00 PM kiennt] NT-HT-003 — phân hệ Thuế tự đăng ký màn + thao tác (tờ khai GTGT / TNDN, hoá đơn cơ quan thuế, người nộp thuế rủi ro…) (đóng góp)
/**
 * - Lệnh của phân hệ đang gác documents:write (tờ khai, hoá đơn cơ quan thuế, phần dài hạn) đổi tại chỗ sang `quyenThaoTac` (kéo theo, không ai mất quyền).
 * - Lệnh của phân hệ đang gác catalog:write (người nộp thuế rủi ro, thông tin người nộp thuế) GIỮ quyền cũ, gác THÊM qua `lenh`
 *   (đổi sang quyền loại 'ghi' sẽ đổi phạm vi người được làm).
 * - Bổ sung thông tin thuế (ACC78) gọi lệnh của lõi /api/v1/tax-info/:eventId → gác qua `lenh`.
 */
import { dangKyManHinh, type LenhGac, type LoaiThaoTac, type ThaoTac } from '../../modules/access/man-hinh.js';

const L = (method: LenhGac['method'], url: string): LenhGac => ({ method, url });
const T = (quyen: string, nhan: string, loai: LoaiThaoTac, lenh?: LenhGac[]): ThaoTac => ({ quyen: `thue:${quyen}`, nhan, loai, ...(lenh ? { lenh } : {}) });
const nhom = 'Thuế';

dangKyManHinh({
  key: 'thue.to-khai-gtgt', ma: 'ACC66', nhom, nhan: 'Khai thuế GTGT', duongDan: '/thue/to-khai-gtgt',
  thaoTac: {
    xem: T('to-khai-gtgt-xem', 'Xem', 'xem'),
    luu: T('to-khai-gtgt-luu', 'Lưu tờ khai', 'ghi'),
    boSung: T('to-khai-gtgt-bo-sung', 'Lập tờ khai bổ sung', 'ghi'),
    chapNhan: T('to-khai-gtgt-chap-nhan', 'Đánh dấu cơ quan thuế chấp nhận', 'ghi'),
    xoa: T('to-khai-gtgt-xoa', 'Xoá lần khai chưa chấp nhận', 'huy'),
  },
});

dangKyManHinh({
  key: 'thue.quyet-toan-tndn', ma: 'TNDN03', nhom, nhan: 'Quyết toán thuế TNDN', duongDan: '/thue/quyet-toan-tndn',
  thaoTac: {
    xem: T('quyet-toan-tndn-xem', 'Xem', 'xem'),
    luu: T('quyet-toan-tndn-luu', 'Lưu tờ khai', 'ghi'),
  },
});

dangKyManHinh({
  key: 'thue.hoa-don-co-quan-thue', ma: 'THUE01', nhom, nhan: 'Hoá đơn từ cơ quan thuế', duongDan: '/thue/hoa-don-co-quan-thue',
  thaoTac: {
    xem: T('hoa-don-cqt-xem', 'Xem', 'xem'),
    nhap: T('hoa-don-cqt-nhap', 'Nhập hoá đơn từ cổng', 'ghi'),
    thamChieu: T('hoa-don-cqt-tham-chieu', 'Chuyển thành chứng từ tham chiếu', 'ghi'),
    xoa: T('hoa-don-cqt-xoa', 'Xoá hoá đơn đã nhập', 'huy'),
  },
});

dangKyManHinh({
  key: 'thue.hoa-don-rui-ro', ma: 'THUE02', nhom, nhan: 'Cảnh báo hoá đơn rủi ro', duongDan: '/thue/hoa-don-rui-ro',
  thaoTac: {
    xem: T('hoa-don-rui-ro-xem', 'Xem', 'xem', [L('GET', '/api/v1/risky-taxpayers')]), // [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — Xem gác lệnh đọc riêng của màn (đóng góp)
    sua: T('hoa-don-rui-ro-sua', 'Thêm / sửa người nộp thuế rủi ro', 'ghi', [L('PUT', '/api/v1/risky-taxpayers')]),
    xoa: T('hoa-don-rui-ro-xoa', 'Xoá người nộp thuế rủi ro', 'huy', [L('DELETE', '/api/v1/risky-taxpayers/:id')]),
  },
});

dangKyManHinh({
  key: 'thue.nguoi-nop-thue', ma: 'TT01', nhom, nhan: 'Thông tin người nộp thuế', duongDan: '/thue/nguoi-nop-thue',
  thaoTac: {
    xem: T('nguoi-nop-thue-xem', 'Xem', 'xem'),
    sua: T('nguoi-nop-thue-sua', 'Sửa', 'ghi', [L('PUT', '/api/v1/taxpayer')]),
  },
});

dangKyManHinh({
  key: 'thue.bo-sung-thong-tin', ma: 'ACC78', nhom, nhan: 'Bổ sung thông tin thuế', duongDan: '/thue/bo-sung-thong-tin',
  thaoTac: {
    xem: T('bo-sung-thong-tin-xem', 'Xem', 'xem', [L('GET', '/api/v1/tax-info')]), // [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — Xem gác lệnh đọc riêng của màn (đóng góp)
    sua: T('bo-sung-thong-tin-sua', 'Ghi thông tin thuế', 'ghi', [L('PUT', '/api/v1/tax-info/:eventId')]),
    xoa: T('bo-sung-thong-tin-xoa', 'Xoá thông tin thuế', 'huy', [L('DELETE', '/api/v1/tax-info/:eventId')]),
  },
});

// Phần dài hạn B01 — màn nằm ở menu Kế toán nhưng lệnh thuộc phân hệ Thuế (statements.routes.ts).
dangKyManHinh({
  key: 'thue.phan-loai-dai-han', ma: 'B01D', nhom, nhan: 'Phân loại dài hạn (B01)', duongDan: '/bao-cao/phan-loai-dai-han',
  thaoTac: {
    xem: T('phan-loai-dai-han-xem', 'Xem', 'xem'),
    luu: T('phan-loai-dai-han-luu', 'Lưu phần dài hạn', 'ghi'),
  },
});
