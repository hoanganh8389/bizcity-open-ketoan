# Luồng dữ liệu và cấu trúc bảng

Bản đồ cơ sở dữ liệu theo dòng chảy kế toán. Chi tiết từng cột, chú thích, khoá ngoại, trigger xem ở tab **Cấu trúc dữ liệu** (đọc thẳng từ cơ sở dữ liệu đang chạy, luôn đúng với bản hiện tại).

## 1. Luồng dữ liệu

```
Hệ thống bán hàng / kho / mua hàng · người nhập tay
        │  API POST /api/v1/documents (khoá chống trùng = doc_key + version)
        ▼
① accounting_events ── lưu nguyên payload, theo phiên bản (bản cũ: accounting_event_versions)
        │  định khoản tự động: tra quy tắc ② (lý do → nhóm hàng → thuế → hình thức thanh toán → mặc định)
        ▼
③ ledger_entries (thân bút toán) + ledger_lines (dòng Nợ / Có, pair_no, dims)    ← chỉ thêm
        │  cùng một giao dịch
        ├──► ④ ledger_balances_daily (cộng dồn)        → cân đối phát sinh, báo cáo tài chính
        ├──► ⑤ tax_invoices, tax_invoice_lines          → bảng kê, tờ khai thuế
        └──► ⑥ sales_lines, sales_payments              → báo cáo bán hàng
Cuối kỳ: closing_rules → bút toán kết chuyển (cũng vào ③) → period_locks khoá kỳ
```

Một sự kiện được lưu, chờ định khoản ở trạm ACC14; định khoản thì sinh bút toán trong **sổ nhật ký chung**. Mỗi lần nhận / định khoản / định khoản lại ghi `posting_log`.

Từng tình huống cụ thể (bán, bán chịu, thu nợ, hoàn hàng, sửa phiếu, huỷ phiếu, quà tặng, hoá đơn về muộn) ghi bút toán gì và lưu vào bảng nào: xem bài *Tình huống ghi sổ*. Ngắn gọn: chuyện mới xảy ra (khách trả hàng, trả nợ) thì **ghi mới**; chuyện ghi sai thì **đảo** (ghi số âm), và mọi quan hệ với bút toán gốc nằm ở `ledger_links`.

## 2. Các nhóm bảng

| Nhóm | Bảng | Vì sao cần | Cột quan trọng |
|---|---|---|---|
| ① Sự kiện kế toán | `accounting_events`, `accounting_event_versions` | Bản gốc nhận được và lịch sử sửa. Không chứng từ thì không ghi sổ | `doc_key` (chống trùng), `version`, `payload`, `status`, `books` |
| ② Quy tắc định khoản | `posting_reasons`, `product_posting_groups`, `posting_defaults`, `closing_rules` | Tài khoản không viết cứng trong code | lý do / nhóm hàng → tài khoản |
| ③ Sổ cái | `ledger_entries`, `ledger_lines`, `ledger_links`, `ledger_entry_sequences`, `document_sequences` | Sổ chỉ thêm, đánh số liên tục; liên kết bút toán đảo, trả hàng → bút toán gốc | `entry_no`; `event_id`, `event_version`; `is_reversal`; `pair_no`; `dims`; `ledger_links.link_type` |
| ④ Số phát sinh | `ledger_balances_daily` | Báo cáo tổng hợp nhanh, không quét dòng sổ | khoá: bộ sổ × chi nhánh × tài khoản × ngày × đối tượng |
| ⑤ Sổ hoá đơn | `tax_invoices`, `tax_invoice_lines` | Bảng kê, tờ khai cần từng hoá đơn | `status`, `sign` (−1 điều chỉnh giảm), `report_group` |
| ⑥ Số liệu bán hàng | `sales_lines`, `sales_payments` | Báo cáo bán hàng; dựng lại được từ sự kiện | `sign` (1 bán, −1 trả) |
| Kỳ | `fiscal_periods`, `period_locks` | Kỳ tháng, khoá theo bộ sổ × chi nhánh × loại chứng từ | |
| Danh mục | `accounts`, `partners`, `products`, `tax_codes`, `payment_methods`, `dimensions` | Đối tượng mà định khoản nhắc tới | `accounts.normal_side`, `track_partner`; `tax_codes.report_group` |
| Nền tảng | `tenants`, `users`, `api_keys`, `accounting_units`, `branches`, `audit_logs` | Nhiều đơn vị, phân quyền, chi nhánh, nhật ký thao tác | `branches.code` = mã cửa hàng |

## 3. Luật bảo vệ sổ cái ở tầng cơ sở dữ liệu

Phần mềm có lỗi hay ai đó ghi thẳng vào cơ sở dữ liệu thì các luật này vẫn giữ:

| Luật | Cách giữ |
|---|---|
| Nợ = Có ở từng bút toán | trigger hoãn `ledger_lines_balanced`, kiểm lúc COMMIT |
| Mỗi dòng đúng một bên Nợ hoặc Có | `CHECK` trên `ledger_lines` |
| Không sửa, không xoá sổ | trigger `ledger_lines_no_update`; `ledger_lines_no_truncate`, `ledger_entries_no_truncate` chặn TRUNCATE |
| Số âm chỉ trong bút toán ghi số âm | trigger `ledger_lines_negative_guard` |
| Mỗi bút toán chỉ bị đảo một lần | chỉ mục duy nhất `ledger_entries_reversed_once` |
| Đánh số liên tục | `ledger_entry_sequences`, `document_sequences` khoá dòng khi cấp số |

## 4. Quy ước đặt tên

- Tên tiếng Anh, số nhiều, chữ thường, cách bằng gạch dưới. Nhóm sổ cái chung tiền tố `ledger_`.
- Khoá chính `id` số tự tăng (`bigint`); khoá ngoại `<bảng số ít>_id`. Riêng cột trỏ về sự kiện kế toán tên là `event_id`.
- Mã của hệ thống khác không làm khoá chính, mà nằm ở cột đối chiếu: `accounting_events.doc_key`, `branches.code` / `external_ref`, `partners.code`, `products.sku`.
- Tiền `numeric(18,2)`, ngày `date`, thời điểm `timestamptz`.
- Mỗi bảng, cột quan trọng có `COMMENT` tiếng Việt — hiện ngay ở tab Cấu trúc dữ liệu. Thêm bảng mới thì khai báo nhóm và giải thích trong `apps/api/src/modules/system/schema-catalog.ts`.

Tên cũ trước migration 0010 (gặp trong tài liệu cũ): `source_documents` → `accounting_events`, `source_document_versions` → `accounting_event_versions`, `gl_entries` → `ledger_entries`, `gl_lines` → `ledger_lines`, `gl_balance_daily` → `ledger_balances_daily`, `entry_sequences` → `ledger_entry_sequences`, `doc_sequences` → `document_sequences`, cột `source_document_id` → `event_id`, `source_version` → `event_version`.

## 5. Quy mô cần tính trước

Số đo thật: một cửa hàng có 289–518 phiếu / ngày; mỗi phiếu có hoá đơn sinh khoảng 4–5 dòng sổ.

| Giả định | Dòng sổ cái / ngày | / năm |
|---|---|---|
| 500 cửa hàng × 300 phiếu × 8 dòng, ghi từng phiếu | ~1,2 triệu | ~440 triệu |
| Gộp theo cửa hàng × ngày × thuế suất × hình thức thu | ~50–100 nghìn | ~20–35 triệu |

Vì vậy câu hỏi "ghi sổ từng phiếu hay gộp" (xem *Nguyên tắc và nghiệp vụ mẫu*, phần 3) phải quyết sớm, và các bảng `ledger_*` nên chia theo năm (partition) khi dữ liệu lớn. Báo cáo tổng hợp chỉ đọc `ledger_balances_daily`.
