# 12. Bộ màu gốc và trang Tổng quan theo bản thiết kế

<!-- [2026-11-11 Nguyễn Văn Thủy] bộ màu gốc --base / --nav, Tổng quan theo bản thiết kế (đóng góp) -->

Nguyên tắc: **cả phần mềm chỉ có hai màu gốc**:
- `--base`: màu chính, dùng cho nút, dòng chọn, liên kết, thẻ đang mở.
- `--nav`: màu menu trái, chữ đậm, nền tối.

Mọi sắc độ khác đều **tự tính** từ hai màu này bằng `color-mix`: nền, viền, tiêu đề bảng, dòng di chuột, chọn, ô nhập, bóng. Đổi thương hiệu chỉ cần đổi hai màu. Các màu trạng thái (đỏ lỗi, cam chưa duyệt) giữ cố định vì mang nghĩa.

## Người dùng thấy gì

- Màu mặc định theo bản thiết kế: menu trái Blue Zodiac `#0F223D`, màu chính xanh dương `#2457B3`.
- Menu tài khoản (avatar góc phải) có mục **Màu** để chọn Xanh dương, Xanh lá hoặc Tím than. Lựa chọn nhớ trên máy. Không còn nút "giao diện cổ điển".
- Góc trên trái: bỏ ảnh logo, thay bằng ô chữ viết tắt mã đơn vị trên nền màu menu. Logo vẫn in trên chứng từ (HT03, HT16).
- **Tổng quan**:
  - **Truy cập nhanh**: nút chọn Phân hệ / Hay dùng ở góc thẻ; biểu tượng một tông màu chính.
  - **Tình hình tài chính** có hai nhóm: *Tiền & công nợ* (Tiền, Phải thu, Phải trả) và *Kết quả kinh doanh* (Doanh thu, Chi phí, Lợi nhuận). Kỳ và đơn vị hiện cạnh tiêu đề; số âm có nhãn **Âm** màu đỏ.
  - **Công việc**: lịch tháng, "Hôm nay" kèm số mục.
  - Bỏ ảnh quảng cáo, thay bằng thẻ giới thiệu chỉ có chữ, nền màu menu, đặt dưới lịch.

## Kỹ thuật

| Phần | Nơi |
|---|---|
| Biến màu và sắc độ | `styles/giao-dien-xanh.css`, khối đầu `html.gd-xanh { --base; --nav; … }` |
| Danh sách bộ màu, áp lúc mở trang | `lib/giaoDien.ts` (`MAU_GOC`, `giaoDien.apply()` trong `main.tsx`) |
| Chọn màu | `layout/UserMenu.tsx` (`.tk-mau`) |
| Tổng quan | `features/launcher/TongQuanPage.tsx` (`GIOI_THIEU` là nội dung thẻ giới thiệu) |

Viết màn mới thì **không** dùng mã màu cụ thể, chỉ dùng biến: `--brand-600` / `--base`, `--brand-50` / `--brand-100` (nền nhạt), `--line`, `--ink-*`, `--n-50` / `--n-100`, `--gd-head`, `--gd-sel`. Thêm một bộ màu chỉ cần thêm một dòng `MAU_GOC`.
