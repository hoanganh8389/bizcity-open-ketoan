# 00 · Tổng quan framework
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

## 1. Định vị

**BizCity Ledger Framework** (mã nguồn: open-ketoan) là *hệ thống ghi sổ* (system of record) tài chính của doanh nghiệp. Nó **không** cố làm mọi nghiệp vụ; nó làm thật chắc ba việc:

1. **Nhận** sự việc kinh tế từ bất kỳ đâu theo một khuôn (`bizcity_ledger_intake@1`), chống trùng, có phiên bản.
2. **Định khoản** theo cấu hình do kế toán giữ (danh mục + ma trận cấu hình), không viết cứng tài khoản.
3. **Ghi sổ** chỉ thêm, cân, khoá kỳ được, truy vết được tới chứng từ gốc.

Phân hệ nghiệp vụ (bán, mua, kho, nhân sự, CRM…) là **người gửi sự việc** — dù nằm trong repo hay ở plugin bên ngoài.

## 2. Năm tầng

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ T4  PLUGIN NGOÀI     WordPress POS · WooCommerce · CRM · HRM · app di động    │  repo khác, gọi API
│                      chỉ nói qua bizcity_ledger_intake@1 · bizcity_connector@1 ·        │
│                      bizcity_master_data@1                                     │
├──────────────────────────────────────────────────────────────────────────────┤
│ T3  ADD-IN           excel-export · spreadsheet-ai · tro-ly                    │  apps/*/src/addins/<ma>
│                      route riêng /api/v1/addins/<ma>, bật tắt bằng ADDINS     │
├──────────────────────────────────────────────────────────────────────────────┤
│ T2  PHÂN HỆ          ke-toan · quy · mua-hang · ban-hang · kho · tai-san ·     │  apps/*/src/phan-he/<key>
│     (module)         thue · api · he-thong · (nhan-su …)                       │
│                      có màn hình, luồng duyệt, bảng nghiệp vụ riêng            │
├──────────────────────────────────────────────────────────────────────────────┤
│ T1  DỊCH VỤ LÕI      danh mục · cấu hình định khoản · kỳ / khoá sổ · kho ·     │  apps/api/src/modules/*
│     (core services)  công nợ · thuế · tài sản · báo cáo · kết nối             │  apps/web/src/{features,components}
├──────────────────────────────────────────────────────────────────────────────┤
│ T0  NHÂN (kernel)    Event Gateway · Posting Engine · Ledger · Tenant/Auth ·   │  core/, modules/{documents,
│                      Audit · Contracts                                         │  posting,ledger}, packages/contracts
└──────────────────────────────────────────────────────────────────────────────┘
```

**Luật hướng phụ thuộc:** tầng trên chỉ gọi tầng dưới. T2 không gọi T2 khác. T3, T4 không đụng bảng của T0 — chỉ qua hợp đồng. Chi tiết: [03-MO-RONG.md](03-MO-RONG.md), [../rules/RULE-MODULE-BOUNDARY.md](../rules/RULE-MODULE-BOUNDARY.md).

## 3. Đường đi duy nhất của một sự việc

```
          ┌── T4 plugin đẩy:  POST /api/v1/documents[/batch]   (khoá API)
          ├── T4 plugin để lõi kéo: bizcity_connector@1          (ACC14 → nguồn)
Nguồn ────┼── T2 phân hệ duyệt phiếu:  postDocumentIn()          (trong tiến trình)
          └── Lõi tự sinh: phiếu tay, kết chuyển, khấu hao, giá vốn
                       │
                       ▼
   ① Kiểm khuôn (zod, packages/contracts) · kiểm tổng tiền · tra mã danh mục
   ② Khoá dòng theo (tenant_id, doc_key) — FOR UPDATE
        cùng version đã ghi  → unchanged
        version nhỏ hơn      → 409 CONFLICT
        version mới          → lưu bản cũ vào accounting_event_versions
   ③ Chế độ định khoản (settings matrix: postingModes)
        hold / approve       → status = pending, posting_log 'receive'  → trạm ACC14
        auto                 → đi tiếp ④
   ④ Posting Engine: RULES[docType](doc, ctx) → PostingPart[] (thuần, không I/O)
        AccountResolver tra: lý do → nhóm hạch toán → loại thuế → hình thức TT → ngầm định
   ⑤ Ledger.post(): cân · tài khoản chi tiết · đối tượng bắt buộc · kỳ chưa khoá · cấp số BT
        có bút toán cũ khác nội dung → Ledger.reverse() + ledger_links 'reversal'
   ⑥ Bảng dẫn xuất trong CÙNG giao dịch: ledger_balances_daily, tax_invoices,
        inventory_movements, debt_items, posting_log
```

Một giao dịch CSDL bao từ ② đến ⑥. Lỗi ở bất kỳ đâu → không bước nào được ghi; chứng từ lưu `error` kèm lý do, kế toán sửa cấu hình rồi định khoản lại.

## 4. Thuật ngữ thống nhất

| Thuật ngữ | Tên trong code | Nghĩa |
|---|---|---|
| Sự việc / chứng từ gốc | `accounting_events`, `IngestDocument` | Bản ghi "đã xảy ra gì" từ nguồn. Duy nhất theo `(tenant_id, doc_key)` |
| Phiên bản | `version`, `accounting_event_versions` | Mỗi lần nội dung đổi ở nguồn. Chỉ tăng |
| Luật định khoản | `posting/rules/<loai>.rule.ts` | Hàm thuần: sự việc + cấu hình → các cặp Nợ / Có |
| Bút toán | `ledger_entries` + `ledger_lines` | Kết quả ghi sổ, có số `BTyy-nnnnnnn` |
| Bút toán đảo | `is_reversal`, `ledger_links.kind='reversal'` | Ghi số âm toàn bộ một bút toán cũ |
| Trạm định khoản | ACC14, `posting_log` | Nơi kế toán xem trước, định khoản, định khoản lại, duyệt huỷ |
| Danh mục chuẩn | accounts, branches, partners, products, tax_codes, payment_methods, posting_reasons… | Do kế toán giữ, nguồn tham chiếu bằng **mã** |
| Ma trận cấu hình | `tenants.settings`, posting_defaults, period_locks… | Mọi tham số làm đổi hành vi, có phạm vi + thứ tự ưu tiên |
| Phân hệ | `phan-he/<key>` | Gói nghiệp vụ trong repo, bật tắt bằng `ENABLED_MODULES` |
| Add-in | `addins/<ma>` | Tiện ích cắm thêm, bật tắt bằng `ADDINS` |
| Plugin ngoài | WP `tgs_accounting_bridge`, Woo… | Hệ thống khác, chỉ nói qua hợp đồng |

## 5. Những gì framework cố ý KHÔNG làm

- Không lập phiếu bán, phiếu kho ở lõi — đó là việc của phân hệ / plugin nguồn.
- Không tính lại thuế, giá bán: số tiền nguồn gửi là số đã chốt (R-EVENT-5).
- Không có bảng riêng cho từng loại chứng từ trong lõi: nội dung nằm ở `accounting_events.payload`; báo cáo cần dòng thì đọc view (`sales_lines`, `posted_event_payloads`…).
- Không đồng bộ hai chiều danh mục với nguồn: lõi là chủ, nguồn đọc (R-MD-1).
