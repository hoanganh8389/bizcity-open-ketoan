# Quà tặng (MH09)

> Số liệu là **số liệu thật** của đơn vị: phiếu mua **duyệt là ghi sổ** (bút toán, công nợ, kho). Ở bản thử muốn có sẵn 25 tình huống để tập: màn **Tổng quan mua hàng (MH00)** → **Nạp dữ liệu mẫu** (xoá được bằng **Xoá dữ liệu mẫu**).

**Nguồn quà:**

| Nguồn | Ghi nhận bằng |
|---|---|
| NCC tặng theo chương trình | Phiếu *Nhận quà* hoặc dòng KM trên phiếu nhập |
| NCC tặng ngoài hợp đồng (không hoá đơn) | Phiếu *Nhận quà* |
| TGS tự mua | Phiếu nhập — đánh dấu **có / không VAT** |
| KM người tiêu dùng kèm hoá đơn mua | Dòng *KM người tiêu dùng / quà* trên phiếu nhập |
| Xuất tặng khách | Phiếu *Xuất quà tặng* (ghi chương trình trên dòng) |

**Bảng và cảnh báo:**
- **Chi tiết**: theo mã / chi nhánh / nguồn / chương trình / VAT: nhập, xuất, tồn, đơn giá trị, chứng từ.
- **Tổng hợp**: theo nguồn & VAT, theo chương trình.
- **Cảnh báo**:
  - **xuất vượt tồn** (đỏ): thường do phiếu nhập quà chưa duyệt hoặc xuất sai chương trình;
  - **thiếu / thừa quà** so với số được hưởng theo chương trình mua X tặng Y.

**Hạch toán:**
- quà NCC tặng không hoá đơn: Nợ 1561 (kho quà) / Có 711 theo giá trị hợp lý;
- quà tự mua: như hàng mua;
- xuất tặng: chi phí bán hàng hoặc giá vốn theo chương trình.

**Kỳ báo cáo:**
- Chọn từ ngày – đến ngày. Có "từ ngày" thì cột **Đầu kỳ** là tồn trước kỳ.
- **Ngân sách quà**: khai ở Chính sách mua hàng (loại *Ngân sách quà tặng theo chương trình*). Bảng ngân sách hiện đã mua / nhận, đã xuất tặng, còn lại.
