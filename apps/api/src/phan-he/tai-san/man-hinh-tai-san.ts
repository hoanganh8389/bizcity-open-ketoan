// @bizcity-layer D modules/tai-san
// [2026-11-13 08:00 PM kiennt] NT-HT-003 — phân hệ Tài sản tự đăng ký màn + thao tác; lệnh ở lõi modules/assets gác qua `lenh` (đóng góp)
/**
 * Mã nguồn tài sản nằm ở lõi (src/modules/assets) nên mọi lệnh gác bằng `lenh`: quyền cũ của lệnh (catalog:write / documents:write /
 * periods:lock) VẪN đòi, quyền chi tiết đòi THÊM (documents:write kéo theo — vai trò mặc định không mất quyền).
 * Công cụ dụng cụ (ACC22) dùng chung lệnh thẻ tài sản (/api/v1/assets) — chưa tách được theo màn.
 */
import { dangKyManHinh, type LenhGac, type LoaiThaoTac, type ThaoTac } from '../../modules/access/man-hinh.js';

const L = (method: LenhGac['method'], url: string): LenhGac => ({ method, url });
// [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — sửa: khai `goc` = quyền gốc rủi ro cao lệnh vẫn đòi (Cho quyền chi tiết không thay được) (đóng góp)
const T = (quyen: string, nhan: string, loai: LoaiThaoTac, lenh?: LenhGac[], goc?: ThaoTac['goc']): ThaoTac => ({ quyen: `tai-san:${quyen}`, nhan, loai, ...(lenh ? { lenh } : {}), ...(goc ? { goc } : {}) });
const nhom = 'Tài sản';

dangKyManHinh({
  key: 'tai-san.the-tai-san', ma: 'ACC28', nhom, nhan: 'Thẻ tài sản (tăng / giảm TSCĐ)', duongDan: '/tai-san/tscd',
  thaoTac: {
    xem: T('the-tai-san-xem', 'Xem', 'xem'),
    them: T('the-tai-san-lap', 'Thêm / nhập Excel', 'ghi', [L('POST', '/api/v1/assets'), L('POST', '/api/v1/assets/import')]),
    sua: T('the-tai-san-sua', 'Sửa (cả ghi giảm, tạm ngừng, ảnh)', 'ghi', [L('PUT', '/api/v1/assets/:code'), L('PUT', '/api/v1/assets/:code/photo')]),
    xoa: T('the-tai-san-xoa', 'Xoá thẻ chưa trích', 'huy', [L('DELETE', '/api/v1/assets/:code')]),
    ghiSo: T('the-tai-san-ghi-so', 'Lập chứng từ ghi tăng / điều chuyển', 'ghi', [L('POST', '/api/v1/assets/:code/postings'), L('POST', '/api/v1/asset-events/:id/transfer-posting')]),
  },
});

dangKyManHinh({
  key: 'tai-san.bien-dong', ma: 'ACC32', nhom, nhan: 'Biến động tài sản (đánh giá lại, điều chuyển, kiểm kê)', duongDan: '/tai-san/danh-gia-lai',
  thaoTac: {
    xem: T('bien-dong-xem', 'Xem', 'xem'),
    them: T('bien-dong-lap', 'Thêm sự kiện', 'ghi', [L('POST', '/api/v1/assets/:code/events')]),
    xoa: T('bien-dong-xoa', 'Xoá sự kiện', 'huy', [L('DELETE', '/api/v1/asset-events/:id')]),
  },
});

dangKyManHinh({
  key: 'tai-san.khau-hao', ma: 'ACC31', nhom, nhan: 'Tính khấu hao, phân bổ', duongDan: '/tai-san/khau-hao',
  thaoTac: {
    xem: T('khau-hao-xem', 'Xem', 'xem', [L('GET', '/api/v1/assets/register')]), // [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — Xem gác lệnh đọc riêng của màn (đóng góp)
    tinh: T('khau-hao-tinh', 'Tính khấu hao và ghi sổ', 'ghi', [L('POST', '/api/v1/assets/depreciation')]),
    suaTay: T('khau-hao-sua-tay', 'Sửa tay số trích', 'ghi', [L('PUT', '/api/v1/assets/:code/override')], 'periods:lock'),
  },
});

dangKyManHinh({
  key: 'tai-san.loai-tai-san', ma: 'ACC37', nhom, nhan: 'Loại tài sản', duongDan: '/danh-muc/loai-tai-san',
  thaoTac: {
    xem: T('loai-tai-san-xem', 'Xem', 'xem'),
    them: T('loai-tai-san-lap', 'Thêm', 'ghi', [L('POST', '/api/v1/asset-categories')]),
    sua: T('loai-tai-san-sua', 'Sửa', 'ghi', [L('PATCH', '/api/v1/asset-categories/:code')]),
    xoa: T('loai-tai-san-xoa', 'Xoá', 'huy', [L('DELETE', '/api/v1/asset-categories/:code')]),
  },
});
