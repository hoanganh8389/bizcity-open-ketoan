# Phiếu bán hàng, trả lại, chuyển kho

> Mua hàng, trả hàng nhà cung cấp làm ở **Mua hàng → Tổng hợp mua hàng (MH11)**.

Các màn dùng chung một cách làm:

| Màn | Mã | Phân hệ |
|---|---|---|
| Phiếu bán hàng | BH10 | Bán hàng |
| Hàng bán trả lại | BH11 | Bán hàng |
| Phiếu chuyển kho | KHO01 | Kho |

> **Đang chạy DỮ LIỆU GIẢ** (dải xanh trên đầu màn): phiếu lưu ở trình duyệt máy này, **chưa vào sổ kế toán**, người khác không thấy. Dùng để xem trước cách nhập trong lúc chờ API thật. Khi có API: **API → Nguồn dữ liệu màn hình** bật "API thật".

## Danh sách

- Lọc: khoảng ngày (mặc định từ đầu tháng), chi nhánh, trạng thái (Nháp / Đã duyệt), ô tìm (số phiếu, đối tượng, số hoá đơn, ghi chú).
- Nút: **+ Thêm** · **Sửa** (hoặc bấm đúp dòng; phiếu đã duyệt chỉ **Xem**) · **Xoá** (chỉ phiếu nháp) · **Duyệt / Bỏ duyệt** · **Nạp** · **Xuất Excel**.
- Phiếu nháp hiện chữ mờ; dòng cuối cộng tiền hàng, thuế, tổng.

## Nhập phiếu

| Phần | Cách nhập |
|---|---|
| Số phiếu | Để trống: tự cấp khi ghi (BH / TL / MH / TN / CK + năm + số thứ tự) |
| Ngày, Chi nhánh | Bắt buộc. Chuyển kho: chi nhánh **xuất** và chi nhánh **nhận** |
| Kho | Chọn ở đầu phiếu, **mọi dòng đi theo** (cột Kho trên bảng hàng chỉ để xem): phiếu bán = kho xuất hàng, hàng trả lại = kho nhận hàng trả, chuyển kho = **kho xuất** và **kho nhận**. Tự chọn kho mặc định của chi nhánh; chi nhánh chưa khai kho (DM12) thì ghi vào kho mặc định. Chuyển giữa hai kho trong **cùng chi nhánh**: chọn chi nhánh nhận trùng chi nhánh xuất, kho nhận phải khác kho xuất |
| Đối tượng | Bán / trả lại: khách hàng (trống = khách lẻ). Mua / trả NCC: nhà cung cấp (bắt buộc) |
| Phiếu gốc | Trả lại / trả NCC: số phiếu bán / mua gốc (tham khảo) |
| Hạn thanh toán | Mua / trả NCC |
| Hoá đơn | Số hoá đơn, ký hiệu, ngày (nếu có) |
| Dòng hàng | **+ Thêm dòng** → chọn mã hàng: tự điền tên, ĐVT bán chính, loại thuế; bán hàng điền sẵn **đơn giá trước thuế** (giá bảng giá công ty đã gồm thuế, quy về trước thuế). Mua hàng: gõ đơn giá theo hoá đơn. Sửa SL, đơn giá, chiết khấu → tiền hàng, tiền thuế tự tính (làm tròn đồng). Chuyển kho: chỉ mã hàng + số lượng |
| Thu tiền / trả tiền khách | Bán / trả lại: thêm các khoản theo hình thức thanh toán (TM, CK, QR…). Để trống = ghi công nợ |

Nút **Ghi** sáng khi đủ thông tin; rê chuột vào nút (hoặc xem dòng chữ cuối form) để biết còn thiếu gì.

## Duyệt

- **Duyệt**: phiếu chốt lại, không sửa / xoá được nữa. Khi có API thật, duyệt = đưa phiếu vào kế toán (định khoản, sổ cái, kho).
- **Bỏ duyệt**: về nháp để sửa (API thật: huỷ bút toán bằng ghi số âm).
