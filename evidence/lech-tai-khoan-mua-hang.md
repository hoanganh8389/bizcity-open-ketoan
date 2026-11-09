## Kết quả đo

Tổng 1 đơn vị × 8 vai trò = 8 phép so.
- KHỚP: 6
- CHỈ MODULE: 2
- Giá trị module lấy từ SỐ VIẾT CỨNG: 2

### Đơn vị `demo`

| Vai trò | Module | Kernel | Gốc của giá trị module | Kết quả |
|---|---|---|---|---|
| Hàng tồn kho (`stock`) | 1561 | 1561 | bang-kernel | **KHỚP** |
| Thuế GTGT đầu vào (`vatIn`) | 1331 | 1331 | bang-kernel | **KHỚP** |
| Phải trả nhà cung cấp (`payable`) | 3312 | 3312 | bang-kernel | **KHỚP** |
| Tiền mặt (`cash`) | 1111 | 1111 | bang-kernel | **KHỚP** |
| Tiền gửi ngân hàng (`bank`) | 11210005 | 11210005 | bang-kernel | **KHỚP** |
| Thu nhập khác (quà tặng) (`giftIncome`) | 71153 | — | so-cung | **CHỈ MODULE** |
| Chi phí hàng khuyến mãi (`giftExpense`) | 64184 | 64184 | bang-kernel | **KHỚP** |
| Thu nhập tài chính (chiết khấu thanh toán) (`finIncome`) | 5152 | — | so-cung | **CHỈ MODULE** |


## Phạm vi và kết luận sơ bộ (S004-18)

- Đo ngày 2026-11-09 trên CSDL phát triển `ketoan` (1 đơn vị `demo`, dữ liệu mặc định), chỉ đọc. **Chưa phải bản sao ẩn danh của dữ liệu thật** và chưa phủ 25 trường hợp: chạy lại bằng `scripts/mua-hang/do-lech-tai-khoan.mjs` trên bản sao thật trước khi chốt.
- Trên dữ liệu mặc định: 6/8 vai trò **khớp** (module lấy từ bảng Kernel, không dùng số viết cứng); 0 lệch.
- 2 vai trò **chỉ module** và dùng số viết cứng: `giftIncome` (71153) và `finIncome` (5152). Kernel chưa có khoá ngầm định tương ứng ⇒ cần khai ở Kernel trước khi gom (cấu hình, không phải đổi hành vi).
- Hướng: nếu bản sao thật cũng không có LỆCH thì bước 2–3 của RV-R1-07 là K1 (thêm hai khoá ngầm định, module lấy từ Kernel); có LỆCH thì K2, kế toán trưởng chọn từng vai trò.
