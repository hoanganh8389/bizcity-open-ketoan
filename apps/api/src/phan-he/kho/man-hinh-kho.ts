// @bizcity-layer D modules/kho
// [2026-11-13 05:30 PM kiennt] PHAN-QUYEN — bản thử: phân hệ Kho tự đăng ký màn hình + thao tác (thêm / sửa / huỷ / nút riêng); quyền khai ở permissions[] của manifest (đóng góp)
import { dangKyManHinh } from '../../modules/access/man-hinh.js';
dangKyManHinh({
  key: 'kho.chuyen-kho', ma: 'KHO01', nhom: 'Kho', nhan: 'Phiếu chuyển kho', duongDan: '/kho/chuyen-kho',
  thaoTac: {
    xem: { quyen: 'kho:chuyen-kho-xem', nhan: 'Xem', loai: 'xem' },
    them: { quyen: 'kho:chuyen-kho-lap', nhan: 'Thêm', loai: 'ghi' },
    sua: { quyen: 'kho:chuyen-kho-sua', nhan: 'Sửa', loai: 'ghi' },
    nhan: { quyen: 'kho:chuyen-kho-nhan', nhan: 'Nhận hàng / bỏ nhận', loai: 'ghi' },
    huy: { quyen: 'kho:chuyen-kho-huy', nhan: 'Huỷ / từ chối', loai: 'huy' },
  },
});
dangKyManHinh({
  key: 'kho.kiem-ke', ma: 'KHO02', nhom: 'Kho', nhan: 'Kiểm kê kho', duongDan: '/kho/kiem-ke',
  thaoTac: {
    xem: { quyen: 'kho:kiem-ke-xem', nhan: 'Xem', loai: 'xem' },
    them: { quyen: 'kho:kiem-ke-lap', nhan: 'Thêm', loai: 'ghi' },
    sua: { quyen: 'kho:kiem-ke-sua', nhan: 'Sửa nháp', loai: 'ghi' },
    ghiNhan: { quyen: 'kho:kiem-ke-ghi-nhan', nhan: 'Ghi nhận chênh lệch', loai: 'ghi' },
    boGhiNhan: { quyen: 'kho:kiem-ke-bo-ghi-nhan', nhan: 'Bỏ ghi nhận', loai: 'huy' },
    xacMinh: { quyen: 'kho:kiem-ke-xac-minh', nhan: 'Xác minh', loai: 'ghi' },
    quyetDinh: { quyen: 'kho:kiem-ke-quyet-dinh', nhan: 'Quyết định xử lý', loai: 'ghi' },
    huyQuyetDinh: { quyen: 'kho:kiem-ke-huy-quyet-dinh', nhan: 'Huỷ quyết định', loai: 'huy' },
  },
});
