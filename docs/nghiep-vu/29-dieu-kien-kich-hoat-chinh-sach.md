# 29. Điều kiện kích hoạt của chính sách mua

<!-- [2026-11-21 Nguyễn Văn Thủy] (đóng góp) -->

## 1. Yêu cầu

Chương trình chiết khấu / tặng hàng của NCC thường kèm **điều kiện tiên quyết**. Phải đạt điều kiện thì chương trình bên dưới mới được áp. Ví dụ:

- **Doanh số mua** trong kỳ (tháng / quý / năm / thời hạn hợp đồng) phải đạt tối thiểu X.
- **Giá trị phiếu** (đơn đặt / phiếu nhập) tối thiểu X.
- **Tình trạng công nợ**:
  - không có nợ quá hạn tại thời điểm lên đơn;
  - tổng dư nợ sau phiếu không vượt hạn mức công nợ.

Quy định:

- Điều kiện là **tuỳ chọn**: không khai thì chương trình áp như cũ.
- Khai được cho chính sách **theo hợp đồng** lẫn **không theo hợp đồng**. Phạm vi tính đi theo hợp đồng xuyên suốt (docs/nghiep-vu/28):
  - chính sách của hợp đồng X: doanh số và nợ quá hạn tính trên các phiếu thuộc X;
  - chính sách ngoài hợp đồng: tính trên các phiếu không theo hợp đồng của NCC.
- **Đơn đặt hàng và phiếu nhập** đều kiểm điều kiện trước khi áp. Chưa đạt thì không áp, và Trợ lý ghi rõ chương trình nào chưa đạt, còn thiếu bao nhiêu.

## 2. Dữ liệu — không thêm bảng

Điều kiện nằm trong nội dung chính sách: `rule.activation` (JSON, mở rộng thêm khoá được).

```ts
activation?: {
  minPurchase?: { amount: number; period: 'month' | 'quarter' | 'year' | 'contract'; includeCurrent?: boolean }; // doanh số mua trước thuế
  minDocValue?: number;          // giá trị phiếu trước thuế, trước chiết khấu
  noOverdue?: boolean;           // không có nợ quá hạn ở ngày phiếu
  withinCreditLimit?: boolean;   // dư nợ sau phiếu không vượt hạn mức
}
```

Loại áp được: chiết khấu trên đơn, chiết khấu theo mã, bậc số lượng, CKTT, mua X tặng Y.

## 3. Cách tính

1. **Lõi** `@bizcity/mua-hang-domain`:
   - kiểu `Activation`;
   - hàm thuần `activationResult(p, facts)` trả về đạt / chưa đạt kèm lý do;
   - câu mô tả `activationText` cho cột Nội dung.
2. **Máy chủ** — `analysis.ts`, hàm `activationGate`, chạy trước `computeDoc`:
   - gom số liệu: doanh số mua theo phạm vi chính sách (NCC / nhóm, hợp đồng, nhãn, chi nhánh, kỳ chứa ngày phiếu; phiếu nhập đã duyệt trừ phiếu trả hàng), nợ quá hạn, trạng thái hạn mức;
   - chính sách chưa đạt bị loại khỏi danh sách áp, và sinh dòng kiểm tra `policy_inactive` (thông tin).
   Duyệt dùng kết quả phân tích, nên phần chốt khi duyệt cũng đúng.
3. **Giao diện**:
   - phân tích trả `blockedPolicies`; phiếu tự tính lại trên giao diện bỏ các chính sách này;
   - Trợ lý hiện "Chưa đủ điều kiện: …".
4. **Form chính sách**: khối "Điều kiện kích hoạt (không bắt buộc)".

## 4. Test

- Từng loại điều kiện, cả có hợp đồng và không hợp đồng.
- Bộ 25 trường hợp (motamuahang.pdf) chạy hai lượt: chính sách / phiếu **không theo hợp đồng**, và cùng dữ liệu đặt **trong một hợp đồng**. Kết quả tiền, chiết khấu, hạn, hạn mức phải như nhau.

## 5. Kết quả (21/11/2026)

- Lõi: `modules/mua-hang/domain/src/kich-hoat.ts` gồm `Activation`, `activationOf`, `activationResult`, `activationText`, `periodRange`, `ACTIVATION_KINDS`.
- Máy chủ:
  - `activationGate` ở `analysis.ts`: loại chính sách chưa đạt; Kiểm tra ghi `policy_inactive` (chưa áp, kèm số đang có / cần / thiếu) và `policy_active` (đủ điều kiện); phân tích trả `blockedPolicies`.
  - Lưu chính sách kiểm hợp lệ `rule.activation` (loại không hỗ trợ → 400).
- Giao diện:
  - form chính sách có khối *Điều kiện kích hoạt*;
  - câu nội dung chính sách kèm điều kiện;
  - phiếu tự tính lại, bỏ chương trình chưa đạt;
  - Trợ lý (khung Khuyến mại & chiết khấu) có nhóm "Chưa đủ điều kiện kích hoạt — không áp".
- Hợp đồng xuyên suốt (kèm theo, docs/nghiep-vu/28):
  - `contractApplies` áp cho mọi loại chính sách: chính sách của hợp đồng X chỉ áp phiếu của X; chính sách của NCC không gắn hợp đồng chỉ áp phiếu không theo hợp đồng; chính sách cấp nhãn / toàn công ty áp cả hai.
  - Phân bổ chi phí của NCC khác (vận tải) vào phiếu nhập không bị bắt trùng hợp đồng.
  - Nợ không thuộc phiếu nào (số dư đầu kỳ) của NCC có đúng một hợp đồng hiệu lực thì tính vào hợp đồng đó.
- Test:
  - `dieu-kien-kich-hoat.test.ts` (4 ca × 2 lượt);
  - `mua-hang-25-tinh-huong.test.ts` chạy hai lượt `none` / `contract` với dữ liệu mẫu nạp bằng `POST /api/v1/purchase/demo/seed { mode }`; mọi con số của 25 tình huống như nhau ở cả hai lượt.
