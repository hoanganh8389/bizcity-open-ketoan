// @bizcity-layer D modules/he-thong
// [2026-11-13 09:30 PM kiennt] NT-HT-003 — màn Danh mục / Hệ thống đăng ký thao tác ghi; lệnh của lõi gác bằng lenh — chỉ chặn khi quyền chi tiết bị Cấm (người có catalog:write / settings:write / users:write giữ nguyên quyền) (đóng góp)
/**
 * Chưa đăng ký "xem" cho Danh mục: quyền đọc danh mục là catalog:read, không phải documents:read — đăng ký "xem" (kéo theo từ documents:read)
 * sẽ làm vai trò chỉ có catalog:read mất menu. Lệnh ghi: thiếu quyền chi tiết mà không bị Cấm → lệnh tự kiểm quyền gốc như hôm nay.
 */
import { dangKyManHinh, type LenhGac, type ThaoTac } from '../../modules/access/man-hinh.js';

// [2026-11-14 07:30 PM kiennt] PHAN-QUYEN — sửa: khai `goc` = quyền gốc rủi ro cao lệnh vẫn đòi (Cho quyền chi tiết không thay được) (đóng góp)
type Tt = Record<string, [string, ThaoTac['loai'], [LenhGac['method'], string][], ThaoTac['goc']?]>;
function man(key: string, ma: string, nhan: string, duongDan: string, tt: Tt) {
  dangKyManHinh({
    key: `he-thong.${key}`, ma, nhom: duongDan.startsWith('/cau-hinh') ? 'Hệ thống' : 'Danh mục', nhan, duongDan,
    thaoTac: Object.fromEntries(Object.entries(tt).map(([k, [ten, loai, lenh, goc]]) => [k, {
      quyen: `he-thong:${key}-${k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`, nhan: ten, loai, lenh: lenh.map(([method, url]) => ({ method, url })), ...(goc ? { goc } : {}),
    }])),
  });
}

man('mat-hang', 'DM10', 'Danh mục mặt hàng', '/danh-muc/mat-hang', {
  sua: ['Thêm / sửa', 'ghi', [['PUT', '/api/v1/products'], ['PUT', '/api/v1/products/:sku'], ['PUT', '/api/v1/catalog/products/:sku'], ['POST', '/api/v1/products/activate']]],
  xoa: ['Xoá', 'huy', [['DELETE', '/api/v1/products/:sku'], ['DELETE', '/api/v1/catalog/products/:sku']]],
  nhapExcel: ['Nhập Excel', 'ghi', [['POST', '/api/v1/catalog/products/import'], ['POST', '/api/v1/catalog/import']]],
});
man('nhom-hang', 'DM11', 'Nhóm hàng', '/danh-muc/phan-loai-hang', {
  sua: ['Thêm / sửa', 'ghi', [['PUT', '/api/v1/item-classes/:kind/:code']]],
  xoa: ['Xoá', 'huy', [['DELETE', '/api/v1/item-classes/:kind/:code']]],
});
man('don-vi-tinh', 'DM15', 'Đơn vị tính', '/danh-muc/don-vi-tinh', {
  them: ['Thêm', 'ghi', [['POST', '/api/v1/unit-names']]],
  sua: ['Sửa', 'ghi', [['PATCH', '/api/v1/unit-names/:id']]],
  xoa: ['Xoá', 'huy', [['DELETE', '/api/v1/unit-names/:id']]],
});
man('doi-tuong', 'DM13', 'Khách hàng / nhà cung cấp', '/danh-muc/khach-hang', {
  them: ['Thêm', 'ghi', [['POST', '/api/v1/partners']]],
  sua: ['Sửa', 'ghi', [['PUT', '/api/v1/partners'], ['PUT', '/api/v1/partners/:code']]],
  xoa: ['Xoá', 'huy', [['DELETE', '/api/v1/partners/:code']]],
  nhapExcel: ['Nhập Excel', 'ghi', [['POST', '/api/v1/partners/import']]],
});
man('nhom-doi-tuong', 'DM08', 'Nhóm đối tượng', '/danh-muc/nhom-doi-tuong', {
  sua: ['Thêm / sửa', 'ghi', [['PUT', '/api/v1/partner-groups/:code']]],
  xoa: ['Xoá', 'huy', [['DELETE', '/api/v1/partner-groups/:code']]],
});
man('chi-nhanh', 'DM02', 'Chi nhánh', '/danh-muc/chi-nhanh', {
  them: ['Thêm', 'ghi', [['POST', '/api/v1/branches']]],
  sua: ['Sửa', 'ghi', [['PATCH', '/api/v1/branches/:code']]],
  xoa: ['Xoá', 'huy', [['DELETE', '/api/v1/branches/:code']]],
});
man('kho', 'DM12', 'Danh mục kho', '/danh-muc/kho', {
  them: ['Thêm', 'ghi', [['POST', '/api/v1/warehouses'], ['POST', '/api/v1/warehouses/quick']]],
  sua: ['Sửa', 'ghi', [['PATCH', '/api/v1/warehouses/:code']]],
  xoa: ['Xoá', 'huy', [['DELETE', '/api/v1/warehouses/:code']]],
});
man('loai-kho', 'DM18', 'Loại kho', '/danh-muc/loai-kho', {
  sua: ['Thêm / sửa', 'ghi', [['PUT', '/api/v1/warehouse-types/:code'], ['PUT', '/api/v1/warehouse-types/ops/:op']]],
});
man('tai-khoan', 'ACC1', 'Hệ thống tài khoản', '/danh-muc/tai-khoan', {
  them: ['Thêm', 'ghi', [['POST', '/api/v1/accounts']]],
  sua: ['Sửa', 'ghi', [['PATCH', '/api/v1/accounts/:code']]],
  xoa: ['Xoá', 'huy', [['DELETE', '/api/v1/accounts/:code']]],
});
man('tk-ngan-hang', 'DM09', 'Tài khoản ngân hàng', '/danh-muc/ngan-hang', {
  sua: ['Thêm / sửa', 'ghi', [['PUT', '/api/v1/bank-accounts/:code']]],
  xoa: ['Xoá', 'huy', [['DELETE', '/api/v1/bank-accounts/:code']]],
});
man('bang-gia', 'DM14', 'Bảng giá', '/danh-muc/bang-gia', {
  sua: ['Thêm / sửa', 'ghi', [['PUT', '/api/v1/catalog/price-lists/:code'], ['PUT', '/api/v1/catalog/price-lists/:code/branches'], ['PUT', '/api/v1/catalog/price-lists/:code/prices']]],
  xoa: ['Xoá', 'huy', [['DELETE', '/api/v1/catalog/price-lists/:code']]],
});
man('don-vi', 'HT03', 'Thông tin đơn vị, cài đặt', '/cau-hinh/don-vi', {
  sua: ['Sửa thông tin / cài đặt', 'ghi', [['PUT', '/api/v1/tenant'], ['PUT', '/api/v1/settings/posting-modes'], ['PUT', '/api/v1/settings/data-lock'], ['PUT', '/api/v1/settings/values/:key'], ['PUT', '/api/v1/settings/item-auto-create']], 'settings:write'],
  khoiAnh: ['Khối ảnh', 'ghi', [['PUT', '/api/v1/tenant/image-blocks/:key']]],
});
man('nguoi-dung', 'HT01', 'Người dùng', '/cau-hinh/nguoi-dung', {
  them: ['Thêm', 'ghi', [['POST', '/api/v1/users']], 'users:write'],
  sua: ['Sửa / khoá / đặt lại mật khẩu', 'ghi', [['PATCH', '/api/v1/users/:id']], 'users:write'],
  ganVaiTro: ['Gán / thu hồi vai trò', 'ghi', [['POST', '/api/v1/users/:id/roles'], ['POST', '/api/v1/users/:id/roles/:assignmentId/revoke']], 'users:write'],
});
man('khoa-api', 'HT02', 'Khoá API', '/cau-hinh/khoa-api', {
  them: ['Cấp khoá', 'ghi', [['POST', '/api/v1/api-keys']], 'users:write'],
  xoa: ['Thu hồi khoá', 'huy', [['DELETE', '/api/v1/api-keys/:id']], 'users:write'],
});
