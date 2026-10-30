# Biến thể mặt hàng (MH26)

**Biến thể** là mã con của một mã gốc: mã gốc + đuôi. Ví dụ `110154035Q` là Anlene Gold kẹp quà khuyến mại, mã gốc `110154035`.

| Đuôi | Ý nghĩa |
|---|---|
| Q | Hàng kẹp quà khuyến mại |
| K | Hàng chia giá |
| M | Hàng khuyến mại (0 đồng) |
| T | Hàng có tem |
| Z, B, D, C | Đuôi riêng đang dùng |

Mã con nhận ra theo cột *Mã cha* ở Danh mục mặt hàng (DM10). Phần mềm tự quét theo mã, sửa tay được ở mặt hàng.

**Màn này dùng để chọn cách tính ở Phân tích đặt hàng (MH02):**
- **Gộp vào mã gốc**: tồn, tồn max, bán, hàng đi đường, đơn đang đặt của mã con cộng dồn vào mã gốc. Hàng con còn nhiều thì không đặt thêm mã gốc.
- **Tách riêng**: mã con thành một dòng riêng trong phân tích, có số cần nhập riêng, đặt riêng. Ví dụ hàng kẹp quà **Q** thường đặt riêng với hàng thường.

Mặc định: **tách riêng Q và T** (hàng kẹp quà, hàng có tem đặt riêng với hàng thường), các đuôi khác gộp vào mã gốc.

**Cách làm:**
1. Ở cột *Khi phân tích đặt hàng*, chọn *Gộp vào mã gốc* hoặc *Tách riêng* cho từng đuôi.
2. Bấm **Lưu cấu hình**. Phân tích đặt hàng và số liệu tồn trên đơn đặt tính theo cấu hình mới ngay.

Mỗi lần lưu được ghi vào Nhật ký mua hàng (MH10), gồm cấu hình trước và sau. Cột *Số mã con* và *Ví dụ* cho biết đuôi đó đang có bao nhiêu mã trong danh mục.
