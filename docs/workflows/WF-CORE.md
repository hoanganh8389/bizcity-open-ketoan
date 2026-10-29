# Danh mục luồng chuẩn

Bút toán ghi theo seed TT99 (tài khoản thật lấy theo cấu hình — R-POST-2). Tình huống chi tiết từng bước: [../nghiep-vu/06-tinh-huong-ghi-so.md](../nghiep-vu/06-tinh-huong-ghi-so.md), [../nghiep-vu/07-luong-ban-hang-sang-ke-toan.md](../nghiep-vu/07-luong-ban-hang-sang-ke-toan.md), [../nghiep-vu/08-mua-hang.md](../nghiep-vu/08-mua-hang.md).

## O2C — Bán hàng đến thu tiền {#o2c}

| | |
|---|---|
| Nguồn | Plugin POS WordPress (multisite), WooCommerce; phân hệ `ban-hang` (giao diện) |
| Tác nhân | Thu ngân, quản lý cửa hàng, kế toán bán hàng |
| Chuỗi | Đơn bán (duyệt) → `sale` · Phiếu thu của đơn → `customer_payment` (`invoiceDocKey`) · Hoàn hàng → `sale_return` (`originalDocKey`) · Chi trả khách → `customer_payment` + `direction: out` · Đổi trả → `sale.offsets[]` |
| Bút toán | Nợ 1311 / Có 511x, Có 33311 · giá vốn Nợ 632 / Có 1561 (điền khi tính giá vốn) · thu Nợ 1111/112x / Có 1311 |
| Quy tắc riêng | Đơn bán **không** kèm tiền thu; mỗi phiếu thu là sự việc riêng → công nợ đối trừ đúng hoá đơn. Bill nội bộ: `internalOnly` |
| Đối chiếu | Bảng kê bán ra = sổ hoá đơn; doanh thu báo cáo bán hàng = sổ cái 511; công nợ khách = số dư 131 theo đối tượng |

## P2P — Mua hàng đến trả tiền {#p2p}

| | |
|---|---|
| Nguồn | Phân hệ `mua-hang` (đơn đặt, phiếu nhập, trả NCC); plugin WP (phiếu nhập NK-…, trả PRN-…) |
| Tác nhân | Nhân viên mua, trưởng mua, thủ kho, kế toán công nợ |
| Chuỗi | Đơn đặt hàng (không chạm sổ, `reference_documents` nếu từ ngoài) → Phiếu nhập duyệt → `purchase` · Trả NCC → `purchase_return` · Đề nghị thanh toán (phân hệ `quy`, duyệt 1–2 cấp) → `supplier_payment` |
| Bút toán | Nợ 1561 / Có 3312 · Nợ 1331 / Có 3312 · trả tiền Nợ 3312 / Có 1111/112x · trả NCC ngược lại |
| Đối chiếu | Bảng kê mua vào = sổ hoá đơn đầu vào; đối chiếu hoá đơn cơ quan thuế (`authority_invoices`); công nợ NCC = số dư 331 |

## INV — Kho {#inv}

| | |
|---|---|
| Nguồn | Plugin WP (`wp_global_transfer`, phiếu điều chỉnh), phân hệ `kho` |
| Chuỗi | Chuyển kho: đầu xuất duyệt → `transfer leg:out` · đầu nhận duyệt → `transfer leg:in` (chỉ số lượng). Điều chỉnh tồn → `stock_adjustment` (`mixed` khi lẫn dấu). Xuất dùng nội bộ / tặng / huỷ → `sale` `internalOnly` + `extra.exportAdjust` |
| Bút toán | Xuất: Nợ 1579 / Có 1561 · nhận: Nợ 1561 / Có 1579 (khác đơn vị: 13681/33681) · thừa Nợ 1561 / Có 3381 · thiếu Nợ 1381 / Có 1561 |
| Đối chiếu | 1579 về 0 sau khi đủ hai đầu và tính giá vốn; thẻ kho (`inventory_movements`) = số dư 156 |

## CASH — Tiền {#cash}

| | |
|---|---|
| Nguồn | Phân hệ `quy`, phiếu thu / chi / báo nợ / báo có (lõi, nhập tay), plugin (nộp tiền về công ty) |
| Chuỗi | Chuyển tiền giữa chi nhánh / quỹ ↔ ngân hàng → `cash_transfer` (`sent` → `received`, xác nhận nhận tiền) · Đề nghị thanh toán → duyệt → phiếu chi |
| Bút toán | Nợ 11319 / Có 1111 (chuyển) · Nợ 112x / Có 11319 (nhận) |
| Đối chiếu | 11319 về 0; sổ quỹ = số dư 111; sổ ngân hàng = sao kê |

## FA — Tài sản {#fa}

| | |
|---|---|
| Nguồn | Phân hệ `tai-san` |
| Chuỗi | Thẻ tài sản / CCDC → ghi tăng (phiếu kế toán) → khấu hao / phân bổ tháng (`depreciation`, `docKey depreciation:<chi nhánh>:<kỳ>`, tính lại = đảo + ghi mới) → đánh giá lại / điều chuyển / ghi giảm |
| Đối chiếu | Bảng tính khấu hao = phát sinh 214 / 242 |

## R2R — Khoá sổ, báo cáo {#r2r}

| Bước | Sự việc | Điều kiện trước |
|---|---|---|
| 1. Định khoản hết cổng chờ ACC14 | — | không còn `pending`, `error` trong kỳ |
| 2. Tính giá vốn bình quân tháng (ACC49) | `cogs` (điền `cost_fill`) | đủ phiếu nhập, chuyển kho hai đầu |
| 3. Khấu hao, phân bổ (ACC31) | `depreciation` | |
| 4. Kiểm tra chứng từ, hoá đơn (ACC93) | — | diagnostics không lỗi |
| 5. Kết chuyển lãi lỗ (ACC6) | `closing` | 1–4 xong |
| 6. Khoá kỳ (ACC2) | — (`period_locks`) | kế toán trưởng |
| 7. Báo cáo tài chính, tờ khai GTGT, quyết toán TNDN | — | kỳ đã khoá |

## H2R — Nhân sự đến trả lương *(dự kiến — phân hệ mẫu chuẩn)* {#h2r}

| | |
|---|---|
| Phân hệ | `nhan-su` (viết hoàn toàn theo `bizcity_module@1`) |
| Bảng riêng | `nhan_su_employees` (đồng bộ chiều `dimensions.kind = employee`), `nhan_su_timesheets`, `nhan_su_payslips` |
| Chuỗi | Chấm công (không chạm sổ) → Bảng lương tháng duyệt → **`payroll`** (docType mới: dòng theo nhân viên × khoản: lương, BHXH, thuế TNCN) → Chi lương → phiếu chi / `supplier_payment` tới đối tượng nhân viên |
| Bút toán | Nợ 641/642 / Có 3341 · Nợ 3341 / Có 3383, 3335 · chi Nợ 3341 / Có 112x |
| Việc lõi cần làm trước | Khuôn `payroll` ở `packages/contracts`, luật `payroll.rule.ts`, lý do mặc định, tài khoản ngầm định `salary_payable`, test (R-POST-9) |
