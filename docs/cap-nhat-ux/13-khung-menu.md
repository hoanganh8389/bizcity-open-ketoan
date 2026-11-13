<!-- [2026-11-11 Nguyễn Văn Thủy] khung menu theo phân hệ kế toán chuẩn, trang Quy trình, Phần riêng, Thiết lập (đóng góp) -->
# Đợt 12 — Khung menu theo phân hệ, trang Quy trình

## Đổi gì

**Menu trái** xếp theo phân hệ kế toán chuẩn:

Tiền mặt · Tiền gửi · Mua hàng · Bán hàng · Kho · Công cụ dụng cụ · Tài sản cố định · Thuế · Tổng hợp · Ngân sách · Phân tích tài chính · Danh mục · Số dư ban đầu · Phần riêng · Báo cáo.

- Nhóm cũ "Tiền" tách thành Tiền mặt và Tiền gửi. "Tài sản" tách thành Công cụ dụng cụ và Tài sản cố định.
- Nhóm "Công nợ" bỏ. Báo cáo phải trả nằm ở Mua hàng, phải thu ở Bán hàng, theo đối tượng / nhân viên ở Tổng hợp. Nghiệp vụ công nợ riêng (khoản công nợ, cấn trừ, đặt cọc…) chuyển vào Phần riêng.
- **Việc chưa có màn vẫn hiện**, chữ mờ, ghi "đang phát triển". Nhìn vào là thấy đủ khung của phần mềm.

**Thiết lập** (thông tin đơn vị, người dùng, mẫu in, cấu hình, kiểm tra dữ liệu, tài liệu, nhà phát triển):
- ra khỏi menu trái;
- mở bằng **nút bánh răng** ở thanh trên;
- màn nào chưa xếp nhóm cũng tự vào mục "Khác" của Thiết lập;
- mọi màn vẫn tìm được bằng Ctrl + K.

**Phần riêng** là lớp gắn thêm cho chuỗi cửa hàng:
- gồm nạp chứng từ từ máy bán hàng, tồn max và đặt hàng, chính sách mua, công nợ nội bộ, sổ kho / tồn kho theo mặt hàng có tồn max;
- đơn vị không dùng thì tắt khoá cấu hình `bizcity.ui.phan_rieng` (mặc định bật) ở Thiết lập → Cấu hình hệ thống.

**Trang Quy trình** của mỗi phân hệ có ba khối:
- lưu đồ nghiệp vụ (hàng trên / hàng dưới một trục);
- khung **Báo cáo** với 5 báo cáo chính;
- hàng danh mục liên quan ở dưới.

Bước hoặc báo cáo chưa có hiện mờ, ghi "đang phát triển".

**Tên màn** đặt ở một nơi: `apps/web/src/layout/ten-man.ts`. Menu, ô tìm và tiêu đề trang cùng đọc ở đây, nên đổi tên một màn chỉ sửa một dòng. Mã danh mục kho đổi từ DM12 (trùng Khách hàng) sang **DM17**.

## Màn bỏ

| Màn | Thay bằng |
|---|---|
| Danh sách NCC riêng (MH01) | Danh mục Nhà cung cấp (DM13). Bấm mã NCC mở hồ sơ NCC như cũ; liên kết cũ tự chuyển. |
| Đối tượng (DM03) | Khách hàng (DM12), Nhà cung cấp (DM13). Liên kết cũ chuyển sang Khách hàng. |
| Chứng từ kế toán (ACC3) | Sổ nhật ký chung và danh sách chứng từ của từng phân hệ. |

## Dùng ở đâu

| Tệp | Nội dung |
|---|---|
| `layout/menu-gon.ts` | `GON_DEFS`: nhóm, mục, `soon`, `rieng`, `an` |
| `layout/so-do-nhom.ts` | Lưu đồ, báo cáo chính, danh mục của từng phân hệ |
| `layout/ten-man.ts` | Tên màn |
| `lib/phanRieng.ts` | Công tắc Phần riêng |

## Quay lại

Khôi phục `menu-gon.ts`, `so-do-nhom.ts` của bản trước; xoá `ten-man.ts` và hai chỗ gọi nó (`layout/menu.ts`, `components/PageHeader.tsx`). Không đổi dữ liệu, không đổi định khoản.
