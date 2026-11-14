// @bizcity-layer D modules/ban-hang
// [2026-11-13 08:00 PM kiennt] NT-HT-003 — phân hệ Bán hàng tự đăng ký màn Phiếu bán hàng (BH10), Hàng bán trả lại (BH11), Chương trình bán (BH12) + thao tác; lệnh của lõi / lệnh chương trình bán gác qua `lenh` (đóng góp)
/**
 * - BH10 / BH11: chứng từ bán đi qua cửa nạp của lõi (POST /api/v1/documents, huỷ POST /api/v1/documents/cancel, xem GET /api/v1/documents)
 *   — gác theo loại phiếu (docType sale / sale_return). Xem / thêm / huỷ / xuất DÙNG LẠI quyền loại chứng từ đã đăng ký ở index.ts
 *   (ban-hang:hoa-don-*) để một quyền gác cả cửa nạp lẫn màn. Sửa = gửi lại cùng docKey (gác ở cửa nạp, tách khỏi Thêm theo docKey đã có).
 *   Duyệt: chưa có lệnh duyệt phiếu bán ở máy chủ — quyền chỉ ẩn nút ở màn (màn đang chạy dữ liệu mẫu).
 * - BH12: lệnh chương trình bán (apps/api/src/modules/sale-programs) gác thêm quyền chi tiết qua `lenh` — vẫn giữ catalog:write của lệnh.
 *   Không gác lệnh POS gọi (consume / release / active) và loại chương trình (dùng chung với Mua hàng).
 */
import { dangKyManHinh, type LenhGac } from '../../modules/access/man-hinh.js';

/** Màn phiếu bán / trả lại: thao tác gác lệnh chung của lõi theo đúng loại phiếu. */
function manPhieuBan(key: string, ma: string, nhan: string, duongDan: string, quyen: string, docType: string) {
  const d = [docType];
  const lenh = (method: LenhGac['method'], url: string, capNhat?: boolean): LenhGac => ({ method, url, docType: d, ...(capNhat === undefined ? {} : { capNhat }) });
  dangKyManHinh({
    key, ma, nhom: 'Bán hàng', nhan, duongDan,
    thaoTac: {
      // Xem: lõi đã lọc danh sách / chi tiết theo quyền xem của loại chứng từ (registerDocumentType) — không gác thêm, để danh sách trả rỗng thay vì 403
      xem: { quyen: `ban-hang:${quyen}-xem`, nhan: 'Xem', loai: 'xem' },
      // [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — sửa = gửi lại cùng docKey qua cửa nạp → gác ở máy chủ (đóng góp)
      them: { quyen: `ban-hang:${quyen}-lap`, nhan: 'Thêm', loai: 'ghi', lenh: [lenh('POST', '/api/v1/documents', false)] },
      sua: { quyen: `ban-hang:${quyen}-sua`, nhan: 'Sửa', loai: 'ghi', lenh: [lenh('POST', '/api/v1/documents', true)] },
      huy: { quyen: `ban-hang:${quyen}-huy`, nhan: 'Huỷ / xoá', loai: 'huy', lenh: [lenh('POST', '/api/v1/documents/cancel')] },
      duyet: { quyen: `ban-hang:${quyen}-duyet`, nhan: 'Duyệt / bỏ duyệt', loai: 'ghi' },
      xuat: { quyen: `ban-hang:${quyen}-xuat`, nhan: 'Xuất Excel', loai: 'xuat' },
    },
  });
}

manPhieuBan('ban-hang.phieu-ban', 'BH10', 'Phiếu bán hàng', '/ban-hang/phieu-ban', 'hoa-don', 'sale');
manPhieuBan('ban-hang.tra-lai', 'BH11', 'Hàng bán trả lại', '/ban-hang/tra-lai', 'tra-hang', 'sale_return');

dangKyManHinh({
  key: 'ban-hang.chuong-trinh', ma: 'BH12', nhom: 'Bán hàng', nhan: 'Chương trình bán', duongDan: '/ban-hang/chuong-trinh',
  thaoTac: {
    xem: { quyen: 'ban-hang:chuong-trinh-xem', nhan: 'Xem', loai: 'xem', lenh: [{ method: 'GET', url: '/api/v1/sale-programs' }] }, // [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — Xem gác lệnh đọc riêng của màn (đóng góp)
    them: { quyen: 'ban-hang:chuong-trinh-lap', nhan: 'Thêm', loai: 'ghi', lenh: [{ method: 'POST', url: '/api/v1/sale-programs' }] },
    sua: { quyen: 'ban-hang:chuong-trinh-sua', nhan: 'Sửa / ngừng', loai: 'ghi', lenh: [{ method: 'PUT', url: '/api/v1/sale-programs/:id' }] },
    hanMuc: { quyen: 'ban-hang:chuong-trinh-han-muc', nhan: 'Đổi hạn mức cửa hàng', loai: 'ghi', lenh: [{ method: 'PUT', url: '/api/v1/sale-programs/:id/quotas' }] },
  },
});
