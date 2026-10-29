# Chuyển hàng xuống shop (MH19)

Mỗi tuần, mỗi shop được chia hàng **2 lần** từ kho của chi nhánh cha. Màn này tự tính shop nào thiếu bao nhiêu, rồi chốt thành **đề nghị chuyển** để kế toán kho lên phiếu chuyển.

## Đề xuất chuyển

Cách tính cho mỗi shop và mỗi mã:

```
Thiếu = Tồn max shop − Tồn shop − Hàng đang đi đường đến shop − Đề nghị đã chốt chưa làm
```

**Làm tròn theo thùng.** Cách làm tròn cài cho từng mã ở **Tồn max (MH16)**, cột *Chuyển xuống shop*:

| Cách | Làm gì |
|---|---|
| **Tự động** (mặc định) | Phần lẻ từ nửa thùng trở lên thì làm tròn lên nguyên thùng; ít hơn thì chuyển lẻ đúng số đó |
| **Nguyên thùng** | Chỉ chuyển nguyên thùng; thiếu chưa tới ngưỡng thì để lần sau |
| **Lẻ** | Chuyển đúng số thiếu |

Ngưỡng "nửa thùng" đổi được ở **Công thức đặt hàng (MH18)**, mục 4.

**Không vượt tồn kho.** Kho không đủ hàng cho mọi shop thì shop thiếu nhiều nhất (tính theo tỉ lệ so với max) được chia trước. Cột **Thiếu do kho hết** cho biết còn thiếu bao nhiêu; những mã này nên đặt mua thêm ở **MH02**.

**Thao tác:**
1. Chọn **Xuất từ kho** (mặc định là kho mặc định của chi nhánh cha).
2. Sửa số ở cột **Chuyển** nếu cần; bỏ tích những dòng không chuyển.
3. Bấm **Chốt đề nghị**: mỗi shop thành một đề nghị (số `DNC…`).

Đề nghị đã chốt mà kho chưa làm thì tính như hàng sắp đi. Lần đề xuất sau không đề xuất lại các dòng đó.

## Đề nghị đã chốt

- Lọc theo ngày chốt và trạng thái (**Chờ lên phiếu** / Đã lên phiếu / Đã huỷ). Không phân trang.
- Bấm một đề nghị để xem dòng hàng (kèm quy đổi thùng). Có các nút:
  - **Xuất Excel** để gửi kho;
  - **Đã lên phiếu chuyển**;
  - **Huỷ đề nghị**;
  - **Mở lại**.
- Kế toán kho, hoặc POS / website, đọc danh sách chờ qua API `GET /api/v1/stock/transfer-requests?status=open` để lên phiếu chuyển kho tự động. Lên phiếu xong thì gọi `POST /api/v1/stock/transfer-requests/:id/done`.

## Hàng đi đường

- Ngay khi lập phiếu xuất chuyển, **đầu đi đã bị trừ tồn**.
- Từ lúc đó tới khi đầu nhận xác nhận, số hàng này là **hàng đi đường** của đầu nhận. Phần mềm trừ số này để không chia trùng.
