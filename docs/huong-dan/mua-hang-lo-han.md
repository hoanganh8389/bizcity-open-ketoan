# Lô & hạn dùng (MH08)

> Số liệu là **số liệu thật** của đơn vị: phiếu mua **duyệt là ghi sổ** (bút toán, công nợ, kho). Ở bản thử muốn có sẵn 25 tình huống để tập: màn **Tổng quan mua hàng (MH00)** → **Nạp dữ liệu mẫu** (xoá được bằng **Xoá dữ liệu mẫu**).

- **Tồn theo lô**: mã hàng, lô, hạn dùng, số ngày còn lại, chi nhánh, tồn, giá trị, **nguồn nhập** (phiếu, ngày, NCC).
  - Lô lấy từ dòng phiếu nhập đã duyệt (phiếu trả / đổi trừ đúng lô).
  - **Còn tồn** = tồn kho thật của mã tại chi nhánh (đã trừ bán, chuyển, kiểm kê…), phần đã xuất trừ vào lô hạn gần trước (FEFO).
- **Thẻ trên đầu**: số lô đã hết hạn, còn ≤ 7 / ≤ 15 / ≤ 30 ngày, kèm số lượng và giá trị.
- **Lọc**: chi nhánh, mã hàng, *Chỉ lô cần xử lý*.
- Cột **Xuất trước**: cùng mã, cùng chi nhánh, phần mềm tự đánh thứ tự lô nên xuất — lô hạn dùng sớm hơn ghi **xuất lô này trước**, các lô sau ghi "thứ 2 / 3…" (hết hạn trước xuất trước — FEFO). Không phải chọn hay thử gì.

**Khi nhập hàng:** mặt hàng có chính sách *Theo dõi lô / hạn dùng* (MH04) bắt buộc nhập **số lô + hạn dùng** (không có thì không duyệt được); hàng còn ≤ 30 ngày được cảnh báo ngay trên phiếu.

**Thêm:**
- Lọc theo **nhà cung cấp**.
- Cột **NSX** (ngày sản xuất nhập trên phiếu).
