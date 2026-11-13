# Bảng kê hóa đơn, chứng từ hàng hóa, dịch vụ mua vào (ACC64)

Bảng kê hoá đơn theo **nhóm hàng hoá, dịch vụ (nhóm HHDV)** để đối chiếu và kê khai thuế GTGT. Mỗi dòng là một mặt hàng trên hoá đơn.

## Nguồn số liệu

- Lấy từ **sổ hoá đơn**: chỉ chứng từ có hoá đơn, số tiền đúng như trên hoá đơn đã phát hành.
- Hàng trả lại, hoá đơn điều chỉnh giảm ghi **số âm**. Hoá đơn đã huỷ không lên bảng kê.
- Hoá đơn thuộc kỳ theo **ngày kê khai** của hoá đơn.

## Chọn tham số

- **Kỳ**, **Từ ngày – Đến ngày**.
- **Cộng gộp theo từng hóa đơn**: mỗi hoá đơn (cùng thuế suất) một dòng; cột Mặt hàng ghi mặt hàng đầu "và n mặt hàng khác".
- **Lấy số liệu ĐVT, số lượng, đơn giá lên báo cáo**: thêm ba cột này.
- Đơn vị có nhiều chi nhánh thì có thêm:
  - **Chi nhánh**: chọn một, nhiều hoặc tất cả chi nhánh.
  - **Tách theo chi nhánh**: mỗi chi nhánh một khối riêng, mỗi nhóm có dòng cộng riêng; dòng Tổng cộng chung ở cuối.

## Bảng

Gồm các cột: Số hóa đơn, Ngày hóa đơn, Tên người bán, Mã số thuế người bán, Mặt hàng, tiền chưa có thuế GTGT, Thuế suất, Thuế GTGT, Tài khoản thuế. Tài khoản thuế lấy theo danh mục mã thuế.

Các nhóm HHDV: 1. Dùng riêng cho SXKD chịu thuế, đủ điều kiện khấu trừ · 4. Không phải tổng hợp trên tờ khai 01/GTGT. Mỗi nhóm có dòng **Cộng nhóm**; cuối bảng là **Tổng cộng**. Hoá đơn không thuộc nhóm kê khai nào vẫn hiện, nhưng không cộng vào Tổng cộng.

- Bấm **số hoá đơn** để mở chứng từ.
- Nút **Cột** để hiện thêm Số chứng từ, Ngày chứng từ, Ký hiệu, Chi nhánh.
- **Xuất Excel** theo đúng bảng đang xem.

## In

- **Bảng kê (mẫu quản trị)**: như bảng trên màn; ký Người lập biểu, Kế toán trưởng, Giám đốc (tên lấy theo HT16).
- **Phụ lục bảng kê mua vào (01-2/GTGT)**: mẫu nộp kèm tờ khai, ký người nộp thuế.
