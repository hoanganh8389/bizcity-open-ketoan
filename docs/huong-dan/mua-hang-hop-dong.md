# Hợp đồng mua hàng (MH29) · Công nợ theo hợp đồng (MH30)

Danh sách hợp đồng là thẻ **Hợp đồng** của **Chứng từ mua hàng (MH11)** (hợp đồng không ghi sổ). Thêm hợp đồng: nút **Thêm hợp đồng** hoặc **+ Thêm chứng từ… › Hợp đồng mua hàng**. **Nhân bản**: chọn một hợp đồng (hoặc nút Nhân bản trên trang hợp đồng) → hợp đồng mới chép thông tin, hàng hoá, điều khoản; nhập số hợp đồng mới rồi Ghi (giá mua, chính sách, tệp không chép). Bảng có cột Người tạo, Thời gian tạo, Người sửa, Sửa lần cuối; lọc trạng thái ở cột Trạng thái.

Hợp đồng mua là **gốc của luồng mua hàng**: ký hợp đồng → khai giá mua, chính sách theo hợp đồng → đơn đặt hàng tự lấy theo hợp đồng → nhập kho → hoá đơn → công nợ → thanh toán → quyết toán, thanh lý.

## Trang hợp đồng — 6 bước (menu bên trái)

| Bước | Nội dung |
|---|---|
| 1. Thông tin hợp đồng | **Số hợp đồng** (cũng là mã trên mọi chứng từ), tên, NCC, **ngày ký**, **hiệu lực từ**–đến, chi nhánh áp dụng, người ký hai bên, trạng thái (Nháp / Đang hiệu lực), giá trị, ghi chú |
| 2. Hàng hoá theo hợp đồng | Nhãn hàng (nhiều nhãn) và mặt hàng (nhiều mã). Đã chọn nhãn thì ô thêm mã **chỉ ra mã của nhãn đó**; nút **Lấy mọi mã của nhãn đã chọn**. Trống = mọi hàng của NCC |
| 3. Điều khoản hợp đồng | Địa điểm giao, ai chịu chi phí vận chuyển, **phạt vi phạm (tối đa 8%)**, lãi chậm thanh toán, đổi trả |
| 4. Giá mua và chính sách | Trái: **bảng giá mua** của hợp đồng. Phải: **chính sách** (chiết khấu, khuyến mại, thưởng, hạn mức, hạn thanh toán) — **+ Thêm chính sách** chọn loại |
| 5. Tệp, thanh lý và nhật ký | Tệp hợp đồng, phụ lục (kéo thả / Chọn tệp, tệp đã gửi hiện ngay); tích **Đã thanh lý** + ngày, ghi chú; **nhật ký** của hợp đồng: ai ghi hợp đồng, giá mua, chính sách, tệp — lúc nào, đổi gì |
| 6. Chứng từ và công nợ | Chứng từ lập theo hợp đồng, nút **Lập đơn đặt hàng theo hợp đồng**, công nợ của hợp đồng |

Bước 1, 2, 3, 5: mở ra là xem, bấm **Sửa** → sửa → **Ghi** (một lần cho cả 4 bước). Bước 4, 6 ghi tại chỗ; hợp đồng mới phải Ghi bước 1 trước. Số bước có dấu ✓ xanh là đã khai. Đầu trang luôn ghi **bước tiếp theo** (vd "Bước tiếp: khai giá mua", "Hợp đồng đã đủ thông tin, có thể lập đơn đặt hàng").

**Khoanh vùng theo hàng hoá của hợp đồng:** bước 2 đã ghi mã thì ở bước 4 bảng giá mua và mọi chính sách (mã áp dụng, bảng chiết khấu theo mã, hàng mua của mua – tặng) **chỉ chọn được các mã đó**; chỉ ghi nhãn thì chỉ mã của nhãn đó; bước 2 để trống thì không khoanh. Nút **Điền N mã của hợp đồng** đưa một lần mọi mã đã khai mà bảng chưa có (gõ giá / % sau). Dán, nhập Excel có mã ngoài hợp đồng: bỏ qua và báo lại. Thiếu mã thì thêm ở bước 2; mã ngoài hợp đồng khai ở thẻ **Không theo hợp đồng** của NCC. Hàng tặng không bị khoanh.

Hợp đồng **không khai lại** giá hay %: giá ở bảng giá mua, % ở chính sách — hợp đồng gom chúng lại. NCC chưa ký hợp đồng: hồ sơ NCC › thẻ **Không theo hợp đồng** (cùng bố cục bước 4).

## Trạng thái

- **Nháp**: đang thương lượng, chưa gợi ý lên đơn.
- **Đang hiệu lực**: đơn đặt hàng / phiếu nhập mới của NCC tự chọn hợp đồng này (đúng ngày hiệu lực, đúng chi nhánh). Quá ngày "đến" thì hiện **Hết hạn**.
- **Đã thanh lý**: không lập chứng từ mới theo hợp đồng; chứng từ cũ giữ nguyên.

Sửa hợp đồng sau khi ký = **phụ lục**: Sổ chứng từ (HT18) giữ từng bản.

## Đi xuyên suốt

1. **Đơn đặt hàng**: chọn NCC là ô **Hợp đồng** tự điền hợp đồng đang hiệu lực, hiện **hạn thanh toán** theo hợp đồng; nút **Lấy từ hợp đồng** chọn mặt hàng của hợp đồng, giá theo hợp đồng. Giá lệch hợp đồng: báo; lệch nhiều ghi "cần cấp trên duyệt".
2. **Phiếu nhập** lập từ đơn mang theo số hợp đồng. Trả hàng, chi phí, thanh toán gắn phiếu nhập cũng mang theo. Phiếu ứng trước / trả tiền / chi phí mới (chưa gắn phiếu) tự gợi ý hợp đồng đang hiệu lực của NCC — không thuộc hợp đồng thì chọn "— không theo hợp đồng —". Một phiếu trả tiền chỉ gắn phiếu nhập của **một** hợp đồng (nhiều hợp đồng thì lập mỗi hợp đồng một phiếu). Phiếu thưởng tính từ chính sách của hợp đồng tự mang số hợp đồng.
3. Khi duyệt, **mọi dòng bút toán mang số hợp đồng**. Vì thế công nợ theo hợp đồng đọc thẳng từ sổ.
4. Sổ chứng từ: phiếu có liên kết "Áp chính sách / chương trình" tới hợp đồng; bấm để mở.

## Công nợ theo hợp đồng (MH30)

- **Sổ tổng hợp**: mỗi hợp đồng một dòng, gồm số dư đầu kỳ Nợ / Có, phát sinh Nợ / Có, cuối kỳ Nợ / Có. Bấm đúp một dòng để xem chi tiết.
- **Sổ chi tiết**: từng bút toán TK 331 trong kỳ, cột **Còn phải trả** luỹ kế theo hợp đồng.
- Lọc theo nhà cung cấp, hợp đồng, kỳ; xuất Excel.

Hợp đồng nằm ở **Danh mục hợp đồng** chung (loại "Nhà cung cấp hàng hoá"), cùng chỗ với hợp đồng thuê, dịch vụ.
