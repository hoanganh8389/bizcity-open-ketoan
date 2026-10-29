# Bổ sung thông tin thuế (ACC78)

Rà soát hoá đơn trong kỳ trước khi lập tờ khai, và bổ sung những gì còn thiếu:
- hoá đơn mua vào **về muộn** (chứng từ nhập mua đã ghi sổ nhưng chưa có hoá đơn);
- hoá đơn thiếu ký hiệu, thiếu hoặc sai mã số thuế, thiếu tên người bán;
- **kỳ kê khai** khác tháng của ngày hoá đơn;
- hoá đơn **không đủ điều kiện khấu trừ**;
- **chứng từ thanh toán không dùng tiền mặt** của hoá đơn mua vào từ 5 triệu đồng.

## Màn hình

- Chọn khoảng ngày, chiều hoá đơn (mua vào / bán ra), chi nhánh.
- **Hiện**:
  - **Cần bổ sung**: chỉ các chứng từ còn thiếu (cột "Cần bổ sung" ghi rõ thiếu gì);
  - **Đã bổ sung**: các chứng từ kế toán đã bổ sung;
  - **Tất cả**: kể cả phiếu bán lẻ không xuất hoá đơn.
- Bấm một dòng để bổ sung.

Phần mềm báo các trường hợp:

| Báo | Ý nghĩa |
|---|---|
| Chưa có hoá đơn | Phiếu nhập mua đã ghi sổ nhưng chưa có hoá đơn đầu vào |
| Thiếu ký hiệu hoá đơn | Hoá đơn không có ký hiệu |
| Thiếu tên / mã số thuế người bán | Hoá đơn mua vào không có tên hoặc mã số thuế người bán |
| Mã số thuế không đúng dạng | Không phải 10 số, 10 số – 3 số, hoặc 12 số |
| Từ 5 triệu: chưa ghi chứng từ thanh toán không dùng tiền mặt | Hoá đơn mua vào từ 5 triệu đồng (gồm thuế), đang để được khấu trừ, chưa ghi chứng từ thanh toán qua ngân hàng |

## Bổ sung hoá đơn

Nhập ô nào thì ô đó thay cho thông tin hiện tại. Ô để trống thì giữ như cũ.

- Chứng từ **chưa có hoá đơn**: nhập ít nhất số và ngày hoá đơn. Khi bấm Ghi, chứng từ được **ghi sổ lại**:
  - thêm bút toán thuế 133, công nợ theo hoá đơn;
  - ghi vào sổ hoá đơn;
  - lên bảng kê mua vào và tờ khai.
- Chứng từ đã có hoá đơn: sửa ký hiệu, mẫu số, tên, mã số thuế, địa chỉ. Chứng từ cũng được ghi sổ lại, bút toán cũ ghi số âm.
- **Phiếu nhập tay** (phiếu chi, phiếu kế toán có thuế): sửa hoá đơn ngay trên phiếu. Ở đây chỉ chọn kỳ kê khai, khấu trừ, chứng từ thanh toán.
- Kỳ đã khoá sổ thì không ghi sổ lại được: phần bổ sung không được lưu, phần mềm báo lỗi.

Phần bổ sung được **giữ lại** khi hệ thống bán hàng gửi lại chứng từ (bản mới). Bấm **Bỏ phần bổ sung** để trở về thông tin gốc.

## Kỳ kê khai

- Mặc định hoá đơn kê khai theo **tháng của ngày hoá đơn**.
- Hoá đơn mua vào về muộn, phát hiện sau khi đã nộp tờ khai: chọn **kỳ kê khai** là kỳ phát hiện. Hoá đơn được đưa vào bảng kê và tờ khai của kỳ đó.
- Không được chọn kỳ trước tháng của ngày hoá đơn.
- Bảng kê mua vào, bán ra (ACC64, ACC65), tổng hợp thuế (ACC91), tờ khai (ACC66) đều xếp hoá đơn theo kỳ kê khai.

## Khấu trừ

- Bỏ chọn **Được khấu trừ** khi hoá đơn không đủ điều kiện, ví dụ:
  - hoá đơn từ 5 triệu đồng thanh toán bằng tiền mặt;
  - hàng hoá, dịch vụ không dùng cho hoạt động chịu thuế;
  - hoá đơn sai thông tin người mua.
- Thuế của hoá đơn đó vẫn nằm ở [24] nhưng **không vào [25]**. Ô [25] trên tờ khai tự trừ phần này.
- Hoá đơn từ 5 triệu: ghi **chứng từ thanh toán không dùng tiền mặt** (số, ngày uỷ nhiệm chi, ngân hàng) để lưu căn cứ khấu trừ.

## Căn cứ pháp lý

Luật Thuế GTGT 48/2024/QH15 (điều kiện khấu trừ, chứng từ thanh toán không dùng tiền mặt từ 5 triệu đồng); Nghị định 181/2025/NĐ-CP; Luật Quản lý thuế 38/2019/QH14 (khai bổ sung); Thông tư 80/2021/TT-BTC và Thông tư 89/2026/TT-BTC. Xem thêm màn **Căn cứ pháp lý** (TI11).
