# Hồ sơ kế toán (HT07)
<!-- [2026-11-03 08:22 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — hướng dẫn màn HT07 (trước đây nút Hướng dẫn hiện "Chưa có hướng dẫn"); viết theo apps/web/src/features/system/AccountingProfilePage.tsx -->

Hồ sơ kế toán khai **năm tài chính, chế độ kế toán, loại pháp nhân** của đơn vị. [Kiểm chuẩn](kiem-chuan.md) (HT06) dựa vào đây để chọn đúng bộ quy định. Chưa khai thì Kiểm chuẩn **không đoán**: các ca lớp Cấu hình và Doanh nghiệp ở trạng thái **Chờ duyệt**.

## Xem hồ sơ đang áp

Khối đầu màn ghi **bản đang áp cho hôm nay**: chế độ, loại pháp nhân, năm tài chính hiện tại (từ ngày, đến ngày, tháng bắt đầu). Chưa khai thì màn báo **Đơn vị chưa khai hồ sơ kế toán cho hôm nay**.

## Phát hành bản mới

Cần quyền cấu hình (kế toán trưởng hoặc chủ đơn vị). Người không có quyền chỉ xem.

| Ô | Ghi chú |
|---|---|
| **Năm tài chính bắt đầu năm** | Năm của ngày hiệu lực |
| **Tháng bắt đầu năm tài chính** | Tháng 1 = năm dương lịch |
| **Chế độ kế toán** | Thông tư 99/2025 (doanh nghiệp), Thông tư 133/2016 (nhỏ và vừa), Thông tư 152/2025 (hộ, cá nhân kinh doanh), Thông tư 200/2014 (phần còn áp dụng) |
| **Loại pháp nhân** | Doanh nghiệp, Nhỏ và vừa, Siêu nhỏ, Hộ kinh doanh |
| **Căn cứ / lý do** | Ít nhất 5 ký tự, vd "Quyết định áp dụng TT99 từ năm tài chính 2026" |

Bấm **Phát hành, hiệu lực từ …**. Ngày hiệu lực luôn là **ngày 01 của tháng bắt đầu năm tài chính** đã chọn.

**Bị từ chối khi:**
- ngày hiệu lực không phải ngày 01 của tháng bắt đầu năm tài chính;
- năm đó đã có kỳ khoá.

Chế độ áp theo năm tài chính: **không đổi chế độ giữa năm**.

## Lịch sử phiên bản

Bảng **Lịch sử phiên bản** chỉ thêm, không sửa, không xoá. Mỗi bản ghi: số bản, hiệu lực từ, chế độ, loại pháp nhân, tháng bắt đầu năm tài chính, căn cứ, người phát hành và lúc phát hành. Dòng tô là bản đang áp. Bản cũ giữ nguyên cho các năm trước.

## Lưu ý

- Đổi chế độ là **quyết định của đơn vị**. Màn chỉ ghi lại, có bằng chứng; **không tự đổi gói định khoản**. Muốn đổi gói định khoản theo chế độ mới, làm ở phần cấu hình định khoản và hỏi kế toán trưởng.
- Phát hành xong, Kiểm chuẩn lần chạy sau dùng hồ sơ mới.
