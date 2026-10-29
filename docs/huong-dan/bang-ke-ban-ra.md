# Báo cáo thuế ra (ACC65)

Bảng kê hoá đơn, chứng từ hàng hoá, dịch vụ bán ra theo từng nhóm thuế suất — dùng để đối chiếu và kê khai thuế GTGT.

## Nguồn số liệu

- Lấy từ **sổ hoá đơn**: chỉ chứng từ có hoá đơn hợp lệ, số tiền **đúng như trên hoá đơn đã phát hành**.
- Hàng bán trả lại, hoá đơn điều chỉnh giảm: ghi **số âm**.
- Phiếu nội bộ không xuất hoá đơn **không** lên bảng kê.
- Hoá đơn đã huỷ không lên bảng kê; hoá đơn bị thay thế chỉ còn hoá đơn thay thế.

## Nhóm

| Nhóm | Gồm |
|---|---|
| 1. Hàng hoá, dịch vụ không chịu thuế GTGT | Loại thuế nhóm "Không chịu thuế" |
| 2. Thuế suất 0% | Loại thuế 0% |
| 3. Thuế suất 5% | Loại thuế 5% |
| 4. Thuế suất 10% | Loại thuế 10% **và cả 8%** (giảm thuế) — cột **Tỷ lệ thuế** của từng dòng cho biết 8% hay 10% |

- Loại thuế không thuộc nhóm nào (ví dụ "không phải kê khai") vẫn hiện ở đầu báo cáo nhưng **không cộng** vào dòng "Tổng:" của nhóm nào.
- Một hoá đơn có hàng nhiều thuế suất hiện ở mỗi nhóm một dòng.
- Trong nhóm, dòng xếp theo ngày chứng từ, số hoá đơn, mã phiếu.

## Cột

Mẫu số · Ký hiệu HĐ · Mã phiếu · Ngày chứng từ · Ngày HĐ · Số HĐ · Tên người mua · Mã số thuế · Doanh thu chưa thuế · Tỷ lệ thuế · Thuế · Chi nhánh · Mã đối tượng.

## Thao tác

- Lọc khoảng ngày theo **ngày hoá đơn**, chi nhánh.
- Bấm một dòng để mở chứng từ gốc.
- **Xuất Excel** theo đúng cột của bảng kê.

## Căn cứ pháp lý

Luật Thuế GTGT 48/2024/QH15 (sửa bởi Luật 149/2025/QH15); Nghị định 123/2020/NĐ-CP (sửa bởi Nghị định 70/2025/NĐ-CP). Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Hoá đơn và thuế GTGT*.
