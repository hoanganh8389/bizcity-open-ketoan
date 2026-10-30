# RULE · Danh mục chuẩn (R-MD)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

> **Cấp:** Tier 1 · **Phiên bản:** 1.0 · 2026-10-28 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Hợp đồng:** [bizcity_master_data@1](../contracts/BIZCITY-MASTER-DATA-v1.md)

Danh mục là "từ điển" mà mọi phân hệ và plugin dùng để nói chuyện với sổ. Phần mềm kế toán là **chủ** từ điển đó.

## Phân loại

| Nhóm | Danh mục | Chủ | Nguồn được tạo? |
|---|---|---|---|
| **Khung kế toán** | Hệ thống tài khoản (`accounts`, TT99/2025), kỳ (`fiscal_periods`), loại thuế (`tax_codes`), tài khoản ngầm định (`posting_defaults`), lý do định khoản (`posting_reasons`), nhóm hạch toán mặt hàng (`product_posting_groups`), hình thức thanh toán (`payment_methods`), tài khoản ngân hàng (`bank_accounts`) | Kế toán trưởng | **Không** — chỉ đọc |
| **Tổ chức** | Đơn vị (`tenants`, `accounting_units`), chi nhánh (`branches`), kho (`warehouses`), bộ phận / nhân viên / vụ việc / dự án / nguồn vốn (`dimensions`) | Kế toán trưởng | Chi nhánh: khoá có `catalog:write`. Nhân viên: tự thêm khi sự việc mang `employee` |
| **Đối tác & hàng** | Đối tượng (`partners`, nhóm `partner_groups`), mặt hàng (`products`, `product_units`, `item_classes`, `unit_names`) | Kế toán + phân hệ phụ trách | **Có**: đối tượng tự tạo / cập nhật theo `partner` trong sự việc; mặt hàng qua `PUT` hoặc phân hệ Mua hàng |

## Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-MD-1** | **Lõi là chủ, nguồn đọc.** Plugin / phân hệ lấy mã qua API rồi gửi đúng mã; không đồng bộ hai chiều; không tạo bản sao danh mục khung kế toán ở nguồn để "tự định khoản" | Thiết kế hợp đồng |
| **R-MD-2** | **Tham chiếu bằng mã**, không bằng `id`, ở mọi hợp đồng ra ngoài. `id` là số nội bộ, không ổn định giữa các bản cài | `bizcity_ledger_intake@1` |
| **R-MD-3** | Mã nghiệp vụ duy nhất trong đơn vị: `UNIQUE (tenant_id, code)` (`sku` với mặt hàng) | Ràng buộc CSDL |
| **R-MD-4** | **Đã dùng thì không xoá.** Danh mục đã có trên sổ / sự việc → API trả `409` kèm hướng dẫn "bỏ tích Đang dùng"; ngừng dùng bằng `is_active = false` | `catalog-delete.test.ts` |
| **R-MD-5** | Mã lạ trong sự việc **không** chặn nhận: sự việc vẫn lưu `pending`/`error`, xem trước báo rõ mã nào thiếu; kế toán khai bổ sung rồi định khoản | `connections.test.ts` |
| **R-MD-6** | Ánh xạ mã nguồn ≠ mã lõi khai ở **cấu hình kết nối** (cột "Đổi hình thức", `branches.external_ref`), không sửa mã lõi cho khớp nguồn | `payment-holder.test.ts` |
| **R-MD-7** | Bộ danh mục khởi tạo (seed) là **gói chuẩn có phiên bản**: tài khoản TT99, loại thuế KCT/R00/R05/R08/R10, hình thức TM/CK/QR/POS/VOUCHER/CONGNO/DOI_TRU, lý do mặc định cho mỗi `docType`. Seed chỉ **thêm cái còn thiếu**, không ghi đè cái kế toán đã sửa | `default-data.test.ts` |
| **R-MD-8** | Tài khoản: chỉ tài khoản chi tiết (`is_posting`) được ghi; cờ tính chất (`track_partner`, `is_debt`, `track_product`…) quyết định chiều bắt buộc trên dòng sổ | R-LEDGER-8 |
| **R-MD-9** | Mọi thay đổi danh mục ghi `audit_logs` (trước / sau) | `writeAudit` trong service |
| **R-MD-10** | Xoá mềm có dấu (`catalog_tombstones`) để nguồn kéo danh mục biết mã nào đã bỏ | `catalog-import.test.ts` |

## Gói danh mục chuẩn cho doanh nghiệp mới

Khi phát hành framework cho doanh nghiệp khác, gói `default-data` phải đủ để **định khoản được ngay** mọi `docType` mà không khai thêm gì ngoài chi nhánh. Kiểm: test "đơn vị mới + một sự việc mỗi loại → `posted`".
