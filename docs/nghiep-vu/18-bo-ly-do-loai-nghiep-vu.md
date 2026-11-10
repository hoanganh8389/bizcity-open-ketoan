# 18. Công tắc lý do hạch toán (mặc định tắt)

<!-- [2026-11-10 09:30 PM Nguyễn Văn Thủy] PHASE-026 — công tắc lý do hạch toán (đóng góp) -->

## Chốt lại (10/11/2026, muộn): giữ lý do, thêm công tắc

Không xoá lý do. Thêm khoá cài đặt **`bizcity.posting.use_reasons`** (Trung tâm cấu hình, có ngày hiệu lực, mặc định **tắt**):

| | Tắt (mặc định) | Bật |
|---|---|---|
| Định khoản | Không đọc tài khoản trên lý do. Tài khoản theo **ACC41** (dòng có sẵn + dòng thêm theo loại hàng / biến thể) | Tài khoản trên lý do (đối ứng, doanh thu / trả lại, giá vốn, chi phí mua) **đè** lên như phần mềm cũ |
| Giao diện | Ẩn ô Lý do (phiếu thu chi, phiếu kế toán), ẩn màn Lý do (ACC18), Nhóm hạch toán, Mặt hàng - Tài khoản khỏi menu | Hiện như cũ |

- Đọc theo **ngày chứng từ**: bật / tắt từ một ngày, chứng từ trước ngày đó giữ cách cũ khi định khoản lại.
- Mã lý do trên chứng từ vẫn nhận (website gửi kèm). Khi tắt, mã chỉ dùng để chọn nghiệp vụ phân hệ tự khai (nhận / xuất quà ở Mua hàng) và để báo cáo.
- Cờ cách tính trên lý do (bán nội bộ theo giá bán, trả NCC theo giá đầu kỳ, khoản mục) chưa theo công tắc.
- Sau này bỏ hẳn: rà khoá `bizcity.posting.use_reasons` và các chỗ đọc (`useReasonsAt`, `AccountResolver.onReason`, `useUseReasons`).
- **Sổ thật**: cập nhật bản này xong thì bật tạm công tắc cho tới khi kế toán thêm xong dòng ở ACC41 cho các trường hợp riêng (hàng hỏng, tặng, xuất dùng…), rồi mới tắt.
