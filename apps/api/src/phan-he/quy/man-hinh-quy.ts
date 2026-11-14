// @bizcity-layer D modules/quy
// [2026-11-13 07:30 PM kiennt] PHAN-QUYEN — bản thử: phân hệ Quỹ tự đăng ký màn phiếu thu / chi / báo có / báo nợ + thao tác; lệnh của lõi (/vouchers, /documents) gác theo loại phiếu (đóng góp)
import { dangKyManHinh, type LenhGac } from '../../modules/access/man-hinh.js';

/** Một màn phiếu tiền: các thao tác gác lệnh chung của lõi theo đúng loại phiếu. */
function manPhieuTien(key: string, ma: string, nhan: string, duongDan: string, quyen: string, docType: string) {
  const d = [docType];
  const lenh = (method: LenhGac['method'], url: string): LenhGac => ({ method, url, docType: d });
  dangKyManHinh({
    key, ma, nhom: 'Quỹ', nhan, duongDan,
    thaoTac: {
      xem: { quyen: `quy:${quyen}-xem`, nhan: 'Xem', loai: 'xem', lenh: [lenh('GET', '/api/v1/documents')] },
      them: { quyen: `quy:${quyen}-lap`, nhan: 'Thêm', loai: 'ghi', lenh: [lenh('POST', '/api/v1/vouchers')] },
      sua: { quyen: `quy:${quyen}-sua`, nhan: 'Sửa', loai: 'ghi', lenh: [lenh('PUT', '/api/v1/vouchers/:id')] },
      huy: { quyen: `quy:${quyen}-huy`, nhan: 'Huỷ', loai: 'huy', lenh: [lenh('POST', '/api/v1/documents/cancel')] },
      duyet: { quyen: `quy:${quyen}-duyet`, nhan: 'Duyệt / ghi sổ', loai: 'ghi', lenh: [lenh('POST', '/api/v1/vouchers/:id/approve')] },
    },
  });
}

manPhieuTien('quy.phieu-thu', 'ACC51', 'Phiếu thu', '/nghiep-vu/phieu-thu', 'phieu-thu', 'receipt');
manPhieuTien('quy.phieu-chi', 'ACC52', 'Phiếu chi', '/nghiep-vu/phieu-chi', 'phieu-chi', 'payment');
manPhieuTien('quy.bao-no', 'ACC53', 'Chi tiền gửi (báo nợ)', '/nghiep-vu/phieu-bao-no', 'bao-no', 'bank_payment');
manPhieuTien('quy.bao-co', 'ACC54', 'Thu tiền gửi (báo có)', '/nghiep-vu/phieu-bao-co', 'bao-co', 'bank_receipt');
