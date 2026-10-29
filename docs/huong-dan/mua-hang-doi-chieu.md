# Đối chiếu đơn đặt ↔ phiếu nhập (MH21)

Theo vết từng **đơn đặt hàng**: đặt bao nhiêu, NCC đã giao bao nhiêu, bằng phiếu nhập nào, còn thiếu / giao thừa / giao mã khác / lệch giá — và các **phiếu nhập ngoài đơn** trong kỳ. Hàng về kho luôn biến động (giao nhiều lần, giao thiếu, giao thừa, giao kèm mã khác) — màn này gom hết để kế toán xử lý.

## Mỗi dòng

Một dòng = **một đơn × một mã hàng**:

| Cột | Ý nghĩa |
|---|---|
| SL đặt | Số lượng trên đơn (theo ĐVT của dòng đơn) |
| Đã nhận | Cộng các phiếu nhập **đã duyệt** theo đơn (nhận Thùng / Hộp khác ĐVT đều quy đổi đúng) |
| Đang chờ | Phiếu nhập theo đơn còn **nháp / chờ duyệt** — chưa vào sổ |
| Chênh | Đã nhận − đặt: âm = còn thiếu, dương = giao thừa |
| Tình trạng | **Đủ** · **Thiếu — còn phải giao** · **Đã về — chờ duyệt phiếu** (phần còn lại đã có phiếu nhập nháp / chờ duyệt) · **Thừa so với đơn** · **Ngoài đơn** (mã không có trong đơn, hoặc phiếu không theo đơn nào) · **Đổi mã** (nhận mã đuôi K/M/Q/T thay cho mã đã đặt) |
| Giá đặt / Giá nhập (BQ) / Lệch giá % | Giá nhập bình quân các phiếu đã duyệt, quy về ĐVT và loại giá (gồm / chưa thuế) của đơn; lệch ≥ 2% tô đỏ |
| Phiếu nhập (theo vết) | Các phiếu nhập của mã đó (bấm để mở); phiếu chưa duyệt ghi trạng thái |

Dòng **"Nhập ngoài đơn"** ở cột Đơn đặt: phiếu nhập không theo đơn nào (rê chuột xem lý do nhập ngoài đơn).

## Lọc

- **Ngày đơn từ / đến** (phiếu ngoài đơn: theo ngày phiếu), **Nhà cung cấp**.
- **Chỉ dòng lệch / chưa xong** (mặc định bật): ẩn các dòng đã giao đủ, đúng giá, không còn phiếu chờ.
- Nút nhanh: **Thiếu · Thừa · Ngoài đơn · Đổi mã · Lệch giá · Có phiếu đang chờ** (kèm số dòng).
- **Xuất Excel** đúng các dòng đang xem.

## Xử lý thường gặp

- **Thiếu:** NCC còn nợ hàng → mở đơn → **Lập phiếu nhập** khi hàng về (phiếu chỉ chép phần còn lại), hoặc báo NCC.
- **Thừa / ngoài đơn:** kiểm biên bản giao hàng; nhận thì giữ (đã có cảnh báo trên phiếu), không nhận thì lập **Trả hàng NCC** theo phiếu nhập.
- **Đổi mã:** phiếu nhập phải được **Duyệt ngoại lệ** (người có quyền) — xem lại lý do.
- **Lệch giá:** đối chiếu báo giá / hoá đơn; sai thì báo NCC lập hoá đơn điều chỉnh (CK sau mua).

Phiếu nhập đã duyệt **vẫn giữ dấu lệch đơn**: ở **Chứng từ mua hàng (MH03)** chọn lọc **Lệch đơn đặt** hoặc xem cột *Cần xử lý* ("Lệch đơn: …").
