# 12. Trả tiền nhà cung cấp — `supplier_payment`

Trả nợ tiền hàng cho nhà cung cấp. Dùng cho cả **trả hộ**: chi nhánh A chi tiền trả cho phiếu nhập của chi nhánh B. Mẫu [`vi-du/tra-tien-ncc.json`](vi-du/tra-tien-ncc.json).

Khuôn **giống hệt** [thu tiền khách](11-thu-tien-khach.md), khác ở:

| Trường | Ghi chú |
|---|---|
| `docType` | `"supplier_payment"` |
| `branchCode` | Chi nhánh **chi tiền** |
| `partner` | **Nhà cung cấp** (`code` trùng mã trên phiếu nhập mua). Bỏ trống → "Nhà cung cấp lẻ" |
| `methodCode` | Hình thức chi (`TM`, `CK`…) |
| `lines[].branchCode` | Chi nhánh **đang nợ** nhà cung cấp (giữ phiếu nhập). Khác chi nhánh lập phiếu = **trả hộ** |
| `lines[].invoiceDocKey` | `docKey` phiếu nhập mua được trả |
| `totals.total` | Tổng tiền chi, ≥ tổng phân bổ; phần thừa ghi giảm công nợ NCC tại chi nhánh lập phiếu |

## Ghi sổ

| Khoản | Bút toán tại | Nợ | Có |
|---|---|---|---|
| Công nợ cùng chi nhánh | Chi nhánh lập phiếu | 3312 (theo NCC) | Tiền |
| **Trả hộ** chi nhánh B | Chi nhánh lập phiếu (A) | 13681 phải thu nội bộ (đối tượng: B) | Tiền |
| | Chi nhánh B | 3312 (theo NCC) | 33681 phải trả nội bộ (đối tượng: A) |
| Trả thừa | Chi nhánh lập phiếu | 3312 (theo NCC) | Tiền |
