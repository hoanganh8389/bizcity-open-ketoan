# Kiểm kê kho (KHO02)
<!-- [2026-11-12 03:30 PM kiennt] NT-KHO-002 — hướng dẫn màn kiểm kê kho -->

Đếm thực tế một kho tại một ngày **theo từng lô / hạn dùng**, so với sổ, rồi xử lý chênh lệch theo ba bước:
**Biên bản kiểm kê → Biên bản xác minh → Quyết định xử lý**. Phiếu nghiệm thu: NT-KHO-002.

## Trước khi kiểm
- Khai **kho cách ly** cho chi nhánh ở Danh mục kho (DM12) nếu có hàng kém / mất phẩm chất.
- Khai các **lý do phiếu kế toán** (loại journal, Danh mục lý do ACC18) cho quyết định xử lý, ví dụ:
  `KKBT` Nợ 1388 / Có 1381 (bồi thường) · `KKCP` Nợ 632 / Có 1381 (tính vào chi phí) · `KKTN` Nợ 3381 / Có 711 (thừa thuộc doanh nghiệp).
  Đơn vị đặt mã khác cũng được — chọn ở bước quyết định.

## Bước 1 — Biên bản kiểm kê
1. Bấm **+ Thêm**: chọn chi nhánh, kho kiểm, ngày kiểm kê, kho cách ly, mục đích.
2. **Lấy số tồn**: điền mọi mặt hàng × lô có tồn hoặc có phát sinh trong tháng, cột *Theo sổ* tính đến hết ngày kiểm kê.
3. Nhập *Theo kiểm kê*, *Kém PC*, *Mất PC*, *HSD thực tế* — gõ tay hoặc **Nhập kết quả từ Excel**
   (cột: Mã hàng · Số lô · Số kiểm kê · Kém PC · Mất PC · HSD thực tế). Lô chưa có của mã đã có → thêm dòng *lô mới*.
4. Thêm thành viên, kết luận; đính kèm ảnh biên bản ký tay. **Ghi** = lưu nháp, chưa đụng sổ.
5. **Ghi nhận chênh lệch**: phần mềm sinh
   - chứng từ điều chỉnh tồn: thiếu ghi **Nợ 1381**, thừa ghi **Có 3381** (lý do kiểm kê thiếu / thừa của đơn vị) — **chưa vào chi phí**;
   - chứng từ chuyển hàng kém / mất phẩm chất sang **kho cách ly** (không ghi giảm 156).
   Giá trị chênh lệch theo giá vốn bình quân tháng, ghi khi **tính giá vốn** tháng đó.

## Bước 2 — Xác minh
Thẻ **Xác minh**: mỗi dòng chênh lệch chọn nguyên nhân — *Chưa rõ*, *Cá nhân bồi thường* (chọn người), *Hao hụt — tính vào chi phí*,
*Thừa thuộc doanh nghiệp*, *Do ghi thiếu phiếu nhập* (ghi số phiếu nhập bổ sung). Bấm **+** để tách một dòng thành nhiều nguyên nhân;
tổng số lượng phải bằng chênh lệch.

## Bước 3 — Quyết định xử lý
Thẻ **Quyết định xử lý**: số, ngày, người ký, lý do phiếu kế toán cho từng hướng → **Ghi quyết định**: phiếu kế toán tất toán 1381 / 3381.
- Giá trị = số lượng × đơn giá bình quân tháng kiểm kê — **tính giá vốn tháng đó trước**.
- *Do ghi thiếu phiếu nhập*: không ghi 711; phần mềm bỏ phần thừa đó khỏi chứng từ điều chỉnh (tồn không tăng hai lần).
- *Chưa rõ*: không tất toán, chênh lệch còn trên 1381 / 3381.
- Thu tiền bồi thường làm ở **Phiếu thu** (Nợ 111 / Có 1388).

## Sửa, huỷ
- Biên bản đã ghi nhận không sửa được số kiểm kê: **Bỏ ghi nhận** (huỷ chứng từ, bút toán đảo) rồi sửa.
- Đã có quyết định: **Huỷ quyết định** trước, rồi mới bỏ ghi nhận. Không xoá biên bản.
- Kỳ đã khoá: không ghi nhận / không ghi quyết định vào ngày thuộc kỳ khoá.

## Lưu ý
- **HSD thực tế** khác sổ được ghi và đánh dấu trên biên bản; phần mềm **chưa đổi HSD của lô trong sổ**.
- Phiếu kế toán chỉ có một đối tượng cho cả Nợ và Có: dòng bồi thường ghi đối tượng là người bồi thường ở cả 1388 và 1381.
