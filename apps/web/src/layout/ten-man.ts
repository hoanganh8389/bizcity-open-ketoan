// [2026-11-11 Nguyễn Văn Thủy] TÊN MÀN — một nơi đặt tên hiển thị theo thói quen kế toán: menu, ô tìm, tiêu đề trang cùng đọc ở đây (đóng góp)
/**
 * TÊN HIỂN THỊ CỦA MÀN, theo đường dẫn. Menu (menu.ts), ô tìm chức năng (Ctrl + K) và tiêu đề trang (PageHeader) đều lấy tên ở đây,
 * nên đổi tên một màn chỉ sửa một dòng. Màn không có ở đây giữ tên khai ở menu.ts của phân hệ.
 * `code` chỉ khai khi đổi mã (mã cũ trùng màn khác).
 */
export interface TenMan { label: string; code?: string }

export const TEN_MAN: Record<string, TenMan> = {
  // Tiền mặt, tiền gửi
  '/nghiep-vu/phieu-thu': { label: 'Thu tiền' },
  '/nghiep-vu/phieu-chi': { label: 'Chi tiền' },
  '/nghiep-vu/phieu-bao-co': { label: 'Thu tiền gửi' },
  '/nghiep-vu/phieu-bao-no': { label: 'Chi tiền gửi' },
  '/quy/phieu-chuyen-tien': { label: 'Chuyển tiền nội bộ' },
  '/quy/so-quy-tien-mat': { label: 'Sổ quỹ tiền mặt' },
  '/quy/so-tien-gui': { label: 'Sổ tiền gửi ngân hàng' },
  '/quy/so-chi-tiet-quy': { label: 'Sổ kế toán chi tiết quỹ tiền mặt' },
  '/quy/so-du-tien': { label: 'Bảng kê số dư tiền theo ngày' },
  '/quy/nhat-ky-chi-tien-khoan-muc': { label: 'Sổ nhật ký chi tiền theo khoản mục' },
  // Mua hàng
  '/mua-hang/tong-hop': { label: 'Chứng từ mua hàng' },
  '/mua-hang/hoa-don-ncc': { label: 'Xử lý hóa đơn đầu vào' },
  '/thue/hoa-don-co-quan-thue': { label: 'Hóa đơn từ cơ quan thuế' },
  '/mua-hang/bao-cao': { label: 'Sổ chi tiết mua hàng' },
  '/mua-hang/doi-chieu': { label: 'Tình hình thực hiện đơn mua hàng' },
  '/mua-hang/nhat-ky': { label: 'Nhật ký thao tác mua hàng' },
  // Bán hàng
  '/ban-hang/phieu-ban': { label: 'Bán hàng' },
  '/ban-hang/tra-lai': { label: 'Trả lại hàng bán' },
  '/ban-hang/bao-cao': { label: 'Sổ chi tiết bán hàng' },
  '/ban-hang/tong-hop': { label: 'Tổng hợp bán hàng' },
  '/ban-hang/lai-gop': { label: 'Lãi gộp theo mặt hàng' },
  '/ban-hang/thu-tien-ban-hang': { label: 'Đối chiếu chứng từ bán hàng và thu tiền' },
  // Kho
  '/kho/chuyen-kho': { label: 'Chuyển kho' },
  '/kho/kiem-ke': { label: 'Kiểm kê kho' },
  '/ban-hang/xuat-dieu-chinh': { label: 'Xuất kho điều chỉnh' },
  '/nghiep-vu/tinh-gia-von': { label: 'Tính giá xuất kho' },
  '/bao-cao/nhap-xuat-ton': { label: 'Tổng hợp tồn kho' },
  '/bao-cao/so-chi-tiet-hang-hoa': { label: 'Sổ chi tiết vật tư hàng hóa' },
  '/bao-cao/chuyen-kho': { label: 'Sổ chuyển kho nội bộ' },
  '/kho/ton-theo-lo': { label: 'Tổng hợp tồn kho theo lô' },
  // Công cụ dụng cụ, tài sản cố định
  '/tai-san/cong-cu': { label: 'Quản lý công cụ dụng cụ' },
  '/tai-san/chi-phi-tra-truoc': { label: 'Chi phí trả trước' },
  '/bao-cao/phan-bo-chi-phi': { label: 'Bảng tính phân bổ chi phí trả trước' },
  '/bao-cao/theo-doi-tscd-ccdc': { label: 'Sổ theo dõi tài sản, công cụ dụng cụ' },
  '/tai-san/tscd': { label: 'Ghi tăng tài sản cố định' },
  '/tai-san/ghi-giam': { label: 'Ghi giảm tài sản cố định' },
  '/tai-san/khau-hao': { label: 'Tính khấu hao' },
  '/tai-san/danh-gia-lai': { label: 'Đánh giá lại tài sản' },
  '/tai-san/dieu-chuyen': { label: 'Điều chuyển tài sản' },
  '/tai-san/kiem-ke': { label: 'Kiểm kê tài sản' },
  '/bao-cao/so-tai-san': { label: 'Sổ tài sản cố định' },
  '/bao-cao/tai-san': { label: 'Tổng hợp tài sản cố định' },
  // Thuế
  '/thue/hoa-don-rui-ro': { label: 'Danh sách hóa đơn, NCC có rủi ro' },
  '/thue/tong-hop': { label: 'Bảng tổng hợp quyết toán thuế GTGT năm' },
  // Tổng hợp
  '/nghiep-vu/phieu-ke-toan': { label: 'Chứng từ nghiệp vụ khác' },
  '/nghiep-vu/ket-chuyen': { label: 'Kết chuyển lãi lỗ' },
  '/cau-hinh/ky-ke-toan': { label: 'Khóa sổ kỳ kế toán' },
  '/bao-cao/can-doi-phat-sinh': { label: 'Bảng cân đối tài khoản' },
  '/bao-cao/so-chi-tiet': { label: 'Sổ chi tiết các tài khoản' },
  '/bao-cao/cong-no': { label: 'Tổng hợp công nợ theo đối tượng' },
  '/bao-cao/so-chi-tiet-cong-no': { label: 'Chi tiết công nợ theo đối tượng' },
  '/bao-cao/cong-no-theo-nhan-vien': { label: 'Tổng hợp công nợ nhân viên' },
  '/bao-cao/tuoi-no': { label: 'Phân tích công nợ theo tuổi nợ' },
  '/bao-cao/tuoi-no-trong-han': { label: 'Công nợ theo tuổi nợ trong hạn' },
  '/bao-cao/tuoi-no-qua-han': { label: 'Công nợ theo tuổi nợ quá hạn' },
  '/bao-cao/cong-no-theo-mat-hang': { label: 'Công nợ theo mặt hàng' },
  '/bao-cao/cong-no-noi-bo': { label: 'Tổng hợp công nợ nội bộ' },
  '/bao-cao/cong-no-noi-bo-chi-tiet': { label: 'Chi tiết công nợ nội bộ' },
  '/bao-cao/chi-phi-khoan-muc': { label: 'Tổng hợp chi phí theo khoản mục, đơn vị' },
  '/bao-cao/chi-tiet-chi-phi-khoan-muc': { label: 'Chi tiết chi phí theo khoản mục, đơn vị' },
  '/bao-cao/tk-chi-phi-khoan-muc': { label: 'Chi tiết phát sinh tài khoản theo khoản mục' },
  '/bao-cao/tong-hop-nv-hd-pb': { label: 'Tổng hợp theo nhân viên, hợp đồng, đơn vị' },
  '/bao-cao/lai-lo-hop-dong': { label: 'Tổng hợp lãi lỗ theo hợp đồng' },
  '/bao-cao/lai-lo-hop-dong-chi-tiet': { label: 'Chi tiết lãi lỗ theo hợp đồng' },
  '/bao-cao/nguon-von': { label: 'Sổ theo dõi chi tiết nguồn vốn chủ sở hữu' },
  // Ngân sách, phân tích
  '/ke-hoach/thu-chi': { label: 'Kế hoạch ngân sách' },
  '/ke-hoach/dinh-muc': { label: 'Định mức chi phí' },
  '/bang-dieu-khien': { label: 'Phân tích tài chính' },
  // Danh mục
  '/danh-muc/mat-hang': { label: 'Vật tư, hàng hóa, dịch vụ' },
  '/danh-muc/phan-loai-hang': { label: 'Nhóm vật tư, hàng hóa, dịch vụ' },
  '/danh-muc/don-vi-tinh': { label: 'Đơn vị tính' },
  '/danh-muc/kho': { label: 'Kho', code: 'DM17' },
  '/danh-muc/nhom-doi-tuong': { label: 'Nhóm khách hàng, nhà cung cấp' },
  '/danh-muc/nhan-vien': { label: 'Nhân viên' },
  '/danh-muc/so-do-to-chuc': { label: 'Cơ cấu tổ chức' },
  '/danh-muc/bo-phan': { label: 'Phòng ban' },
  '/danh-muc/khoan-muc': { label: 'Khoản mục chi phí' },
  '/danh-muc/hop-dong': { label: 'Hợp đồng' },
  '/danh-muc/vu-viec': { label: 'Vụ việc' },
  '/danh-muc/du-an': { label: 'Công trình, dự án' },
  '/danh-muc/loai-tai-san': { label: 'Loại tài sản cố định' },
  '/danh-muc/nhom-ccdc': { label: 'Loại công cụ dụng cụ' },
  '/danh-muc/nguon-von': { label: 'Nguồn vốn' },
  '/danh-muc/muc-dich-su-dung': { label: 'Mục đích sử dụng' },
  '/danh-muc/loai-thue': { label: 'Biểu thuế' },
  '/cau-hinh/ly-do': { label: 'Lý do – Tài khoản' },
  '/cau-hinh/nhom-hach-toan': { label: 'Mặt hàng – Tài khoản' },
  // Số dư ban đầu
  '/nghiep-vu/so-du-tai-khoan': { label: 'Số dư tài khoản' },
};

/** Tên hiển thị của màn theo đúng đường dẫn (mục có ?tham số giữ tên riêng của nó), không có thì undefined. */
export const tenMan = (path?: string) => (path ? TEN_MAN[path] : undefined);
