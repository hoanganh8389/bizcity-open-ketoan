# Báo cáo thuế vào (ACC64)

Bảng kê hoá đơn, chứng từ hàng hoá, dịch vụ **mua vào**, nhóm theo thuế suất. Dùng để kê khai thuế GTGT đầu vào được khấu trừ.

## Số liệu lấy từ đâu

1. **Phiếu nhập mua, trả hàng nhà cung cấp** gửi từ hệ thống kho / mua hàng có kèm hoá đơn đầu vào: tự lên bảng kê (trả hàng ghi số âm).
2. Các dòng **có loại thuế đầu vào và số hoá đơn** trên phiếu chi, phiếu báo nợ, phiếu kế toán nhập tay:

   - Mở hộp phiếu, đánh dấu **Thuế GTGT, hoá đơn**.
   - Ở dòng có hoá đơn: nhập **tiền chưa thuế**, chọn **Loại thuế** (V10, V08, V05…). Tiền thuế tự tính theo thuế suất, sửa lại được cho khớp hoá đơn.
   - Nhập **ký hiệu, số, ngày hoá đơn**, **tên và mã số thuế người bán**.
   - Ghi sổ. Phần mềm tự ghi thêm bút toán thuế (Nợ 133 / Có tài khoản tiền hoặc công nợ) và đưa hoá đơn vào bảng kê này.

Mỗi dòng phiếu là một hoá đơn; một phiếu kê được nhiều hoá đơn.

## Lưu ý

- Chỉ phiếu có số hoá đơn đầu vào (ghi vào **sổ hoá đơn**) mới lên bảng kê.
- Dòng có loại thuế nhưng **không nhập số hoá đơn** vẫn hạch toán thuế vào tài khoản 133, nhưng không lên bảng kê. Thấy tổng thuế ở đây nhỏ hơn phát sinh tài khoản 133 thì tìm các dòng như vậy.
- Sửa hoặc huỷ phiếu thì bảng kê tự cập nhật.
- Tổng thuế ở đây là cột "Thuế đầu vào" trên **Bảng tổng hợp thuế GTGT (ACC91)**.

## Nhóm và gộp dòng

- Nhóm 1: Hàng hoá, dịch vụ dùng riêng cho sản xuất kinh doanh chịu thuế GTGT đủ điều kiện khấu trừ thuế. Nhóm 4: Hàng hoá, dịch vụ không phải kê khai, tính nộp thuế GTGT.
- Các dòng **cùng số hoá đơn, cùng người bán, cùng ngày, cùng thuế suất** được gộp thành một dòng (lấy mã phiếu lớn nhất), để một hoá đơn kê trên nhiều phiếu không bị kê trùng.


## Căn cứ pháp lý

Luật Thuế GTGT 48/2024/QH15; Nghị định 181/2025/NĐ-CP (khấu trừ thuế đầu vào). Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Hoá đơn và thuế GTGT*.
