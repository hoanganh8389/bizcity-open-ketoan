// @bizcity-layer D modules/mua-hang
// [2026-11-13 08:00 PM kiennt] NT-HT-003 — phân hệ Mua hàng tự đăng ký màn hình + thao tác (thêm / sửa / huỷ / duyệt / bỏ duyệt / nút riêng); quyền khai ở permissions[] của manifest (đóng góp)
/**
 * Màn của phân hệ Mua hàng (đường dẫn = path mục menu ở apps/web/src/phan-he/mua-hang/menu.ts → menu tự ẩn theo quyền "xem").
 * - Lệnh do phân hệ sở hữu và đang gác bằng documents:read / documents:write: đổi quyền tại chỗ sang `quyenThaoTac(...)`
 *   (routes.ts, hoa-don-routes.ts, ton-max-routes.ts) — quyền Core cũ kéo theo nên không ai mất quyền.
 * - Lệnh đang gác bằng quyền chặt hơn (catalog:write, settings:write, payments:approve): GIỮ quyền cũ, gác THÊM quyền chi tiết qua `lenh`
 *   (người đang làm được vẫn làm được vì quyền chi tiết do documents:write kéo theo; muốn chặn thì Cấm quyền chi tiết).
 * - Màn cấu hình chỉ có "xem" để ẩn menu (lệnh đọc dùng chung nhiều màn, không gác riêng).
 */
import { dangKyManHinh, type LenhGac } from '../../modules/access/man-hinh.js';

const nhom = 'Mua hàng';
const L = (method: LenhGac['method'], url: string): LenhGac => ({ method, url });
const xem = (viec: string) => ({ quyen: `mua-hang:${viec}-xem`, nhan: 'Xem', loai: 'xem' as const });

// ---------------- Chứng từ mua hàng (đơn mua, phiếu nhập, trả lại, giảm giá, chi phí…) — MH11
dangKyManHinh({
  key: 'mua-hang.chung-tu', ma: 'MH11', nhom, nhan: 'Chứng từ mua hàng', duongDan: '/mua-hang/tong-hop',
  thaoTac: {
    xem: xem('chung-tu'),
    them: { quyen: 'mua-hang:chung-tu-lap', nhan: 'Thêm', loai: 'ghi' },
    sua: { quyen: 'mua-hang:chung-tu-sua', nhan: 'Sửa nháp / chờ duyệt', loai: 'ghi' },
    guiDuyet: { quyen: 'mua-hang:chung-tu-gui-duyet', nhan: 'Gửi duyệt', loai: 'ghi' },
    duyet: { quyen: 'mua-hang:chung-tu-duyet', nhan: 'Duyệt / ghi sổ', loai: 'ghi' },
    boDuyet: { quyen: 'mua-hang:chung-tu-bo-duyet', nhan: 'Bỏ duyệt', loai: 'huy' },
    huy: { quyen: 'mua-hang:chung-tu-huy', nhan: 'Huỷ', loai: 'huy' },
    // Lệnh vẫn đòi payments:approve như cũ; quyền chi tiết gác thêm
    duyetNgoaiLe: { quyen: 'mua-hang:chung-tu-duyet-ngoai-le', nhan: 'Duyệt ngoại lệ / rà soát nhập ngoài đơn', loai: 'ghi',
      lenh: [L('POST', '/api/v1/purchase/documents/:id/override'), L('POST', '/api/v1/purchase/documents/:id/review-outside')], goc: 'payments:approve' }, // [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — goc (đóng góp)
  },
});

// ---------------- Hoá đơn đầu vào của NCC — MH22
dangKyManHinh({
  key: 'mua-hang.hoa-don-ncc', ma: 'MH22', nhom, nhan: 'Hoá đơn đầu vào của NCC', duongDan: '/mua-hang/hoa-don-ncc',
  thaoTac: {
    xem: xem('hoa-don-ncc'),
    them: { quyen: 'mua-hang:hoa-don-ncc-lap', nhan: 'Thêm / nhập / đọc hoá đơn', loai: 'ghi' },
    sua: { quyen: 'mua-hang:hoa-don-ncc-sua', nhan: 'Sửa', loai: 'ghi' },
    huy: { quyen: 'mua-hang:hoa-don-ncc-huy', nhan: 'Huỷ', loai: 'huy' },
  },
});

// ---------------- Tồn max & đặt hàng — MH16, MH17, MH19, MH18
dangKyManHinh({
  key: 'mua-hang.ton-max', ma: 'MH16', nhom, nhan: 'Tồn max', duongDan: '/mua-hang/ton-max',
  thaoTac: {
    xem: xem('ton-max'),
    sua: { quyen: 'mua-hang:ton-max-sua', nhan: 'Ghi tồn max / cài riêng từng mã', loai: 'ghi' },
  },
});
dangKyManHinh({
  key: 'mua-hang.dang-ky-max', ma: 'MH17', nhom, nhan: 'Phiếu đăng ký tồn max', duongDan: '/mua-hang/dang-ky-max',
  thaoTac: {
    xem: xem('dang-ky-max'),
    them: { quyen: 'mua-hang:dang-ky-max-lap', nhan: 'Thêm', loai: 'ghi' },
    sua: { quyen: 'mua-hang:dang-ky-max-sua', nhan: 'Sửa', loai: 'ghi' },
    duyet: { quyen: 'mua-hang:dang-ky-max-duyet', nhan: 'Duyệt (ghi tồn max)', loai: 'ghi' },
    huy: { quyen: 'mua-hang:dang-ky-max-huy', nhan: 'Huỷ', loai: 'huy' },
  },
});
dangKyManHinh({
  key: 'mua-hang.chuyen-shop', ma: 'MH19', nhom, nhan: 'Chuyển hàng xuống shop', duongDan: '/mua-hang/chuyen-shop',
  thaoTac: {
    xem: xem('chuyen-shop'),
    them: { quyen: 'mua-hang:chuyen-shop-lap', nhan: 'Chốt đề nghị chuyển', loai: 'ghi' },
    xong: { quyen: 'mua-hang:chuyen-shop-xong', nhan: 'Đánh dấu đã lên phiếu / mở lại', loai: 'ghi' },
    huy: { quyen: 'mua-hang:chuyen-shop-huy', nhan: 'Huỷ đề nghị', loai: 'huy' },
  },
});
dangKyManHinh({
  key: 'mua-hang.cong-thuc', ma: 'MH18', nhom, nhan: 'Công thức đặt hàng', duongDan: '/mua-hang/cong-thuc',
  thaoTac: {
    xem: xem('cong-thuc'),
    sua: { quyen: 'mua-hang:cong-thuc-sua', nhan: 'Lưu công thức', loai: 'ghi', lenh: [L('PUT', '/api/v1/stock/formulas/:branchCode')] },
  },
});

// ---------------- Danh mục / cấu hình mua hàng (lệnh giữ catalog:write / settings:write, gác thêm qua lenh)
dangKyManHinh({
  key: 'mua-hang.nha-cung-cap', ma: 'MH01', nhom, nhan: 'Nhà cung cấp mua hàng', duongDan: '/mua-hang/nha-cung-cap',
  thaoTac: {
    xem: xem('nha-cung-cap'),
    giaMua: { quyen: 'mua-hang:gia-mua-sua', nhan: 'Thêm / sửa / xoá mặt hàng & giá mua NCC', loai: 'ghi',
      lenh: [L('POST', '/api/v1/purchase/supplier-products'), L('DELETE', '/api/v1/purchase/supplier-products/:id')] },
  },
});
dangKyManHinh({
  key: 'mua-hang.chinh-sach', ma: 'MH04', nhom, nhan: 'Chính sách mua hàng', duongDan: '/mua-hang/chinh-sach',
  thaoTac: {
    xem: xem('chinh-sach'),
    them: { quyen: 'mua-hang:chinh-sach-lap', nhan: 'Thêm', loai: 'ghi', lenh: [L('POST', '/api/v1/purchase/policies')] },
    sua: { quyen: 'mua-hang:chinh-sach-sua', nhan: 'Sửa / điều chuyển hạn mức', loai: 'ghi',
      lenh: [L('PUT', '/api/v1/purchase/policies/:id'), L('POST', '/api/v1/purchase/policies/:id/transfer-limit')] },
    huy: { quyen: 'mua-hang:chinh-sach-xoa', nhan: 'Xoá', loai: 'huy', lenh: [L('DELETE', '/api/v1/purchase/policies/:id')] },
  },
});
dangKyManHinh({
  key: 'mua-hang.cai-dat', ma: 'MH12', nhom, nhan: 'Cài đặt mua hàng', duongDan: '/mua-hang/cai-dat',
  thaoTac: { xem: xem('cai-dat'), sua: { quyen: 'mua-hang:cai-dat-sua', nhan: 'Lưu cài đặt', loai: 'ghi', lenh: [L('PUT', '/api/v1/purchase/settings')], goc: 'settings:write' } }, // [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — goc (đóng góp)
});
dangKyManHinh({
  key: 'mua-hang.bien-the', ma: 'MH26', nhom, nhan: 'Biến thể mặt hàng', duongDan: '/mua-hang/bien-the',
  thaoTac: { xem: { ...xem('bien-the'), lenh: [L('GET', '/api/v1/purchase/variants')] }, sua: { quyen: 'mua-hang:bien-the-sua', nhan: 'Lưu đuôi mã tách riêng', loai: 'ghi', lenh: [L('PUT', '/api/v1/purchase/variants')] } },
});
dangKyManHinh({
  key: 'mua-hang.dvt-thung', ma: 'MH27', nhom, nhan: 'ĐVT Thùng đặt hàng', duongDan: '/mua-hang/dvt-thung',
  thaoTac: {
    xem: { ...xem('dvt-thung'), lenh: [L('GET', '/api/v1/purchase/units/thung/empty-rows')] }, // [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — Xem gác lệnh đọc riêng của màn (đóng góp)
    sua: { quyen: 'mua-hang:dvt-thung-sua', nhan: 'Chạy thật / dọn dòng Thùng trống', loai: 'ghi',
      lenh: [L('POST', '/api/v1/purchase/units/thung/apply'), L('POST', '/api/v1/purchase/units/thung/empty-rows/delete')] },
  },
});
dangKyManHinh({
  key: 'mua-hang.khoi-dau', ma: 'MH20', nhom, nhan: 'Nhập dữ liệu khởi đầu', duongDan: '/mua-hang/khoi-dau',
  thaoTac: {
    xem: xem('khoi-dau'),
    nhap: { quyen: 'mua-hang:khoi-dau-nhap', nhan: 'Ghi dữ liệu khởi đầu (giá mua, cân tồn, tồn max)', loai: 'ghi',
      lenh: [L('POST', '/api/v1/stock/init/prices/import'), L('POST', '/api/v1/stock/init/reconcile/import'), L('POST', '/api/v1/stock/init/max/import')] },
  },
});

// ---------------- Báo cáo chỉ xem (lệnh đọc riêng của màn đổi quyền tại chỗ sang "xem")
const baoCao = (key: string, ma: string, nhan: string, duongDan: string) =>
  dangKyManHinh({ key: `mua-hang.${key}`, ma, nhom, nhan, duongDan, thaoTac: { xem: xem(key) } });
baoCao('han-muc', 'MH05', 'Hạn mức & công nợ đến hạn', '/mua-hang/han-muc');
baoCao('thuong', 'MH06', 'Tính thưởng cuối kỳ', '/mua-hang/thuong');
baoCao('lo-han', 'MH08', 'Lô & hạn dùng', '/mua-hang/lo-han');
baoCao('qua-tang', 'MH09', 'Quà tặng', '/mua-hang/qua-tang');
baoCao('doi-chieu', 'MH21', 'Đối chiếu đơn đặt ↔ phiếu nhập', '/mua-hang/doi-chieu');
baoCao('so-kho', 'MH24', 'Sổ kho theo mặt hàng', '/mua-hang/so-kho');
baoCao('ton-kho', 'MH25', 'Tồn kho theo mặt hàng', '/mua-hang/ton-kho');
