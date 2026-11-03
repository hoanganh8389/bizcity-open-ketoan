# ADR-0026 · Mở rộng khung nhìn chỉ đọc `bizcity_read` cho dữ liệu lõi ngoài sổ cái (G2)
<!-- [2026-11-04 01:08 AM Johnny Chu - Chu Hoàng Anh] ADR-0026 — G2: mở rộng data.read-views (kho, giá vốn, dòng bán, hoá đơn, sự việc) cho module; chủ dự án đồng ý mở ADR 2026-11-04 -->

- Trạng thái: **Đề xuất** — chủ dự án đồng ý mở ADR (2026-11-04, trả lời bản rà ranh giới PHASE-013 · 11 §8 câu 1); nội dung thiết kế chờ duyệt (R-FLOW §3: migration + hợp đồng dữ liệu là thứ dùng chung).
- Ngày: 2026-11-04 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức: **K2** (migration Kernel, hợp đồng `bizcity_data` minor)
- Phát sinh từ: [PHASE-013 · 11 ranh giới lõi / phân hệ](../phases/PHASE-013-UI-KIT-CHUYEN-MODULE/11-RANH-GIOI-LOI-PHAN-HE.md), khoảng trống **G2**.
- Liên quan: migration 0043 (khung nhìn sổ), 0044 (khung nhìn danh mục), năng lực `data.read-views` (available), [ADR-0017](ADR-0017-dinh-danh-hang-hoa-bat-bien.md) / [RULE-ITEM](../rules/RULE-ITEM.md) (định danh ≠ mã).

## Bối cảnh

Core **đã có** bề mặt đọc cho module: schema `bizcity_read` với khung nhìn `security_invoker` (RLS của bảng gốc vẫn áp), trigger chặn ghi, `COMMENT ON` đủ — hiện gồm danh mục (`partners`, `products`, `branches`, `warehouses`, `unit_names`, `tax_codes`, `payment_methods`, `dimensions`) và sổ (`ledger_entries`, `ledger_lines`, `ledger_balances_daily`).

Còn **thiếu** dữ liệu lõi ngoài sổ cái mà ba phân hệ đang đọc thẳng bảng (đo ngày 2026-11-04):

| Bảng lõi | Ai ghi | Phân hệ đọc thẳng |
|---|---|---|
| `inventory_movements` | Kernel `inventory` | `mua-hang`, `ke-toan`; lõi app `inventory`, `catalog`, `warehouses` |
| `inventory_costs` | Kernel `inventory` | `mua-hang`, `ban-hang` (lãi gộp) |
| `sales_lines` (VIEW 0007), `sales_payments` | dựng từ sự việc đã ghi sổ | `ban-hang` (qua `apps/api/src/modules/sales`), `ke-toan` |
| `tax_invoices` | Kernel `tax-invoices` / `tax-info` / `vouchers` | `ban-hang`, `ke-toan`, `thue` |
| `accounting_events` (đầu chứng từ) | Kernel `documents` | `kho` (bảng kê chuyển kho), `ban-hang` |

Không có khung nhìn → module chuẩn (chỉ SDK, vai trò CSDL chỉ SELECT `bizcity_read`) **không thể** làm các báo cáo này; đợt 2 (`ban-hang`, `kho`) và đợt 5 (`mua-hang`) bị chặn ở phần API.

## Quyết định đề xuất

1. **Không thêm cơ chế mới** — mở rộng năng lực `data.read-views` sẵn có bằng một migration Kernel thêm khung nhìn theo đúng khuôn 0043 / 0044 (`WITH (security_invoker = true)`, trigger chặn ghi, `COMMENT ON VIEW` + mọi cột).
2. **Năm khung nhìn** (tên tiếng Anh, cột chọn lọc — không `SELECT *`):

   | Khung nhìn | Nguồn | Cột chính | Không đưa ra |
   |---|---|---|---|
   | `bizcity_read.inventory_movements` | `inventory_movements` | `tenant_id`, `item_id`, `sku` (hiển thị), `branch`/`warehouse`, ngày, chiều, số lượng, giá trị, `doc_key`, `doc_type` | cột nội bộ dựng lại |
   | `bizcity_read.inventory_costs` | `inventory_costs` | `tenant_id`, kỳ, nhóm tính giá, `item_id`, tồn đầu / nhập / đơn giá / xuất / tồn cuối | — |
   | `bizcity_read.sales_lines` | VIEW `sales_lines` | dòng bán đã ghi sổ: `doc_key`, ngày, chi nhánh, đối tượng (`partner_id` + mã hiển thị), `item_id`, số lượng, doanh thu, thuế, giảm trừ | thân nguồn thô |
   | `bizcity_read.tax_invoices` | `tax_invoices` | số / ký hiệu / mẫu / ngày / trạng thái / chiều (vào, ra), tiền trước thuế, thuế, `doc_key` | dữ liệu XML / tệp |
   | `bizcity_read.documents` | `accounting_events` | **chỉ đầu chứng từ**: `doc_key`, `doc_type`, `doc_no`, ngày, chi nhánh, trạng thái, phiên bản | `payload`, `body_hash`, chuỗi băm |
3. **Khoá liên kết là định danh** (`item_id`, `partner_id`, `branch_id`), mã chỉ để hiển thị — theo ADR-0017 / R-ITEM; khung nhìn mới không lặp lỗi của `bizcity_read.products` (đang lấy `sku` làm khoá, xử lý ở PHASE-024).
4. **Hợp đồng:** `BIZCITY-DATA-v1` thêm năm khung nhìn vào bảng `data.read-views` (minor, tương thích VER-1); `bizcity-standard.json` cập nhật mô tả năng lực, không thêm mã năng lực mới.
5. **Phép kiểm:** phân hệ / module không `SELECT` thẳng năm bảng nguồn (mở rộng SC-KERNEL-7 hoặc SC-MOD-1 — nợ cũ vào baseline, không chặn ngay); chữ chốt riêng khi viết phép kiểm.

## Phương án đã cân nhắc

| Phương án | Lý do không chọn |
|---|---|
| Action đọc của Kernel (`core.inventory.query`…) thay cho khung nhìn | Báo cáo cần JOIN / gom nhóm tuỳ ý; action đóng khuôn làm báo cáo chậm và Kernel phình theo từng báo cáo |
| Cấp SELECT thẳng bảng nguồn cho vai trò module | Phá bề mặt ổn định: Kernel đổi bảng là gãy module; lộ cột nội bộ |
| Mỗi module tự giữ bản sao qua sự kiện | Dữ liệu lệch sổ; trái "báo cáo khớp sổ" (T9) |

## Hệ quả

- Mở đường API cho đợt 2 (`ban-hang`, `kho`) và đợt 5 (`mua-hang`); phần web không chờ ADR này.
- Một migration Kernel mới (số lấy lúc làm), test RLS: đơn vị A không thấy dòng của B qua khung nhìn; test chặn ghi.
- Báo cáo hiện có trong lõi app được phép chuyển dần sang khung nhìn, không bắt buộc.

## Cần chủ dự án quyết

1. Duyệt danh sách năm khung nhìn và cột (thêm / bớt)?
2. Phép kiểm "không đọc thẳng bảng nguồn" ở mức ratchet (nợ cũ vào baseline) — đồng ý?
