# Tính thưởng cuối kỳ (MH06)

> Số liệu là **số liệu thật** của đơn vị: phiếu mua **duyệt là ghi sổ** (bút toán, công nợ, kho). Ở bản thử muốn có sẵn 25 tình huống để tập: màn **Tổng quan mua hàng (MH00)** → **Nạp dữ liệu mẫu** (xoá được bằng **Xoá dữ liệu mẫu**).

1. **Chọn chính sách thưởng**:
   - thưởng doanh số theo kỳ (bậc doanh số);
   - chỉ tiêu nhãn tháng / quý / năm (% hoàn thành → ngưỡng);
   - thưởng theo giai đoạn trong tháng.
2. **Kỳ** (YYYY-MM, YYYY-Qn, YYYY) và **doanh số**: phần mềm cộng doanh số mua thuần từ phiếu đã duyệt (nhập − trả, trước thuế). NCC chốt số khác thì nhập vào ô **Doanh số NCC chốt**.
3. Xem **Cách tính**: ngưỡng đạt, % hoặc tiền. Thưởng theo giai đoạn ghi rõ tính trên doanh số **từng giai đoạn** hay **luỹ kế** (luỹ kế thì trừ phần đã thưởng — không tính trùng).
4. **Phân bổ theo mã** theo doanh số mua. Khi duyệt: Nợ 331 / Có 1561 theo từng mã (dòng chỉ tiền, SL 0) — giá vốn bình quân tháng tự chia cho phần hàng **còn tồn** và phần **đã bán** (632). Bảng hiện ước tính hai phần này theo tồn kho thật.
5. **Tạo phiếu thưởng**: phiếu nháp loại *Thưởng / CK cuối kỳ*; duyệt ở MH11 thì giảm công nợ NCC.
   - Một chính sách + một kỳ chỉ tạo **một** phiếu (chặn tính trùng).
   - Có hàng trả / hoá đơn điều chỉnh sau kỳ: huỷ phiếu cũ, tính lại.

Hoá đơn mua gốc giữ nguyên; hoá đơn điều chỉnh (nếu có) lập theo phiếu thưởng.

## Tổng hợp thưởng theo tháng

Bảng trên cùng liệt kê **mọi chính sách thưởng đang áp** cho tháng đã chọn. Chỉ tiêu quý / năm lấy kỳ chứa tháng đó.

Mỗi dòng có các cột:
- doanh số mua thuần, chỉ tiêu, % hoàn thành, mức thưởng, số được hưởng;
- **Phiếu thưởng**: *chưa lập* · *chưa duyệt* · *đã hạch toán*. Có *chênh* nghĩa là số tính lại (sau hàng trả, phiếu mới) khác số trên phiếu đã lập → bỏ duyệt / huỷ phiếu cũ rồi tạo lại.

Bấm một dòng để mở chi tiết bên dưới.

**Hoá đơn điều chỉnh của NCC.** Có hoá đơn điều chỉnh giảm thì chọn mức VAT: ví dụ thưởng 9.000.000 + VAT 8% 720.000 → công nợ giảm 9.720.000, thuế đầu vào giảm 720.000.
