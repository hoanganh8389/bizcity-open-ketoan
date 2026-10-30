# ĐVT Thùng đặt hàng (MH27)

Đặt hàng với nhà cung cấp chuẩn theo **Thùng**. Màn này tạo sẵn ĐVT Thùng cho các mã đang mua, để đơn đặt / phiếu nhập tự lấy Thùng, khỏi khai từng mã.

Màn chia **3 khối** theo thứ tự làm:

## ① Chọn mã (khối xanh dương)
Danh sách gồm các mã:
- có phiếu mua / đơn đặt trong *N ngày* gần đây (mặc định 30);
- hoặc có dòng *Mặt hàng & giá mua* của NCC khai / sửa trong *N ngày*;
- hoặc có trong **file quy cách** vừa nhập, kể cả mã không mua gần đây.

Nhập *0 ngày* = mọi mã NCC đang khai.

**Bỏ qua:** mã ngừng theo dõi, hàng quà / khuyến mại (tên bắt đầu "KM", "(Z) KM"), mã có ĐVT nhỏ nhất đã là thùng (hàng combo). Rê chuột vào chữ *Bỏ qua* để xem.

## ② Quy cách 1 thùng (khối cam)
Ghi theo ĐVT nhà cung cấp hay dùng. Phần mềm **luôn quy về ĐVT nhỏ nhất** của mã, theo các ĐVT đã khai:

| Ghi | Mã có ĐVT | 1 Thùng = (ĐVT nhỏ nhất) |
|---|---|---|
| `12 Lốc` | Hộp (nhỏ nhất), Lốc = 4 Hộp | **48 Hộp** (12 × 4) |
| `48 Hộp` | Hộp | **48 Hộp** |
| `12CAN/THÙNG` (như file đặt hàng của NCC) | Can | **12 Can** |
| `6 túi` / `1 thùng = 6 túi` | Túi | **6 Túi** |
| `48` (chỉ số) | bất kỳ | **48** ĐVT nhỏ nhất |

Có hai cách khai:
- **Sửa trên dòng:** gõ vào ô *Quy cách 1 thùng*, bấm Enter. Cột *= ĐVT nhỏ nhất* (ô xanh lá) hiện kết quả cuối cùng.
- **Nhập Excel:** bấm *Nhập Excel*. Tệp cần cột **Mã hàng** (hoặc *Mã TGS*) và cột **Quy cách 1 thùng**, hoặc *Loại* kiểu `12CAN/THÙNG`, hoặc hai cột *SL trong thùng* + *ĐVT trong thùng*. Đọc được cả file đặt hàng của NCC có cột Mã TGS + Loại. Bấm *Tải file mẫu* để lấy danh sách mã đang xem kèm ĐVT đang có, điền rồi nạp lại.

Không khai quy cách thì phần mềm đoán (cột *Căn cứ*):
1. Tên hàng có số thùng: "180mlx24", "(thùng 8)", "24 hộp/thùng".
2. Mã cùng họ (mã cha / mã con) đã có thùng.
3. Mã cùng nhãn, cùng dung tích (110ml, 180ml, 1L…) đã có thùng.
4. Không có gì thì lấy **48**.

**Dòng đỏ — Quy cách lỗi:** không đọc được chữ, hoặc mã không có ĐVT đó. Ví dụ ghi "12 Lốc" mà mã chưa khai Lốc: khai thêm Lốc ở Danh mục mặt hàng, hoặc ghi theo ĐVT nhỏ nhất ("48 Hộp"). Dòng lỗi không chạy. Mã trong file mà danh mục chưa có thì báo riêng ở đầu bảng.

## ③ Chạy (khối xanh lá)
Bấm **Chạy**. Kết quả ghi vào Nhật ký mua hàng (MH10). Mỗi dòng có màu theo việc sẽ làm:

| Việc làm | Nghĩa |
|---|---|
| 🟧 Thêm Thùng | Mã chưa có ĐVT kiểu thùng: thêm "Thùng" theo quy cách, đặt làm **ĐVT mua mặc định** |
| 🟪 Sửa tỉ lệ thùng | Mã đã có thùng nhưng quy cách nhập vào khác: sửa tỉ lệ (số cũ gạch ngang), đặt làm ĐVT mua mặc định |
| 🟦 Đặt mua theo thùng | Đã có ĐVT kiểu thùng (Thùng, Thùng_24…): giữ tỉ lệ, chỉ đặt làm ĐVT mua mặc định |
| 🟩 Đã chuẩn | Đã có thùng và là ĐVT mua mặc định, chỉ rà dòng giá NCC |
| 🟥 Quy cách lỗi | Sửa ô quy cách, dòng này không chạy |

**Dòng giá NCC:** với mỗi NCC đang bán mã đó:
- NCC chưa có dòng Thùng: **dòng giá cũ giữ nguyên** (ĐVT, giá, ghi chú). Phần mềm **thêm một dòng Thùng để trống giá**. Lập đơn lấy ĐVT Thùng, đơn giá tự quy đổi từ dòng giá cũ: Hộp 10.000đ, thùng 48 → Thùng 480.000đ. Ở *Mặt hàng & giá mua* của NCC, ô giá của dòng Thùng hiện mờ "≈ 480.000 (từ Hộp)". NCC báo giá theo thùng thì gõ thẳng vào dòng Thùng.
- NCC đã có dòng Thùng: chỉ đánh dấu *Đặt theo ĐVT này*.

**Lỡ sai tỉ lệ:** vào lại màn này ghi quy cách đúng (dòng thành *Sửa tỉ lệ thùng*) rồi Chạy. Hoặc sửa ngay trên đơn đặt / phiếu nhập: bấm nút ✎ cạnh ô ĐVT.

**Mã con tạo mới** (ví dụ `110154035Q` từ mã cha `110154035`) tự kéo đủ các ĐVT của mã cha (Thùng, Lốc…) và ĐVT mua mặc định. Không cần khai lại.
