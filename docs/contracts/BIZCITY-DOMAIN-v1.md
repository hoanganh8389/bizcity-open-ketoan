# `bizcity_domain@1` — Domain Contract: bất biến kế toán của Core
<!-- [2026-10-30 12:50 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — bản công bố kiến trúc: 4 lớp hợp đồng, luật hạ tầng, checklist nhận việc. -->

> **Phiên bản:** 1.0.0 · 2026-10-30 · **Trạng thái:** Chấp nhận · **Lớp:** 1/4 của [Bản công bố kiến trúc](../CONG-BO-KIEN-TRUC.md)
> **Tầng:** T0 (Kernel). **Dev và AI không được tự ý phá vỡ.** Đổi bất kỳ dòng nào ở §2–§6 là thay đổi Kernel **mức K3** ([RULE-KERNEL](../rules/RULE-KERNEL.md)): cần ADR, hai người duyệt nhóm Lõi, kế toán trưởng ký phần nghiệp vụ.
> **Chi tiết luật:** [RULE-LEDGER](../rules/RULE-LEDGER.md) · [RULE-EVENT](../rules/RULE-EVENT.md) · [RULE-POSTING](../rules/RULE-POSTING.md) · [BIZCITY-LEDGER-INTAKE-v1](BIZCITY-LEDGER-INTAKE-v1.md)

Mọi kênh (giao diện, API, POS, plugin, Cell, MCP) và mọi module (bán hàng, kho, thuế, nhân sự, sản xuất, CRM, trợ lý AI) **quy về hợp đồng này** khi chạm tiền. Hợp đồng nói *cái gì luôn đúng*, không nói code viết thế nào.

## 1. Mô hình

```
Chứng từ nguồn (module / kênh)
   │  docType + docKey + version + reasonCode + mã danh mục — KHÔNG số tài khoản
   ▼
Sự việc kế toán (accounting_events) ── phiên bản (accounting_event_versions)
   │  luật định khoản theo docType + gói định khoản ngành + AccountResolver
   ▼
Bút toán (ledger_entries / ledger_lines) ── chỉ thêm, Nợ = Có
   ▼
Sổ phụ dẫn xuất: số dư ngày · công nợ (debt_items) · kho (inventory_movements, giá vốn) · hoá đơn (tax_invoices) · dòng bán (sales_lines)
```

## 2. Bất biến sổ cái

| Mã | Bất biến | Được bảo vệ bằng |
|---|---|---|
| **STD-DOM-1** *(T0)* | Không sự việc thì không bút toán: mọi bút toán trỏ về đúng một sự việc có thật | khoá ngoại; DG-LEDGER-4 / `LEDGER_ORPHAN` |
| **STD-DOM-2** *(T0)* | Sổ cái chỉ thêm: không UPDATE / DELETE / TRUNCATE bút toán đã ghi | trigger `forbid_ledger_mutation`, `forbid_ledger_truncate`; DG-DB-2 / `LEDGER_TRIGGERS`; RULE-LEDGER (ngoại lệ đóng) |
| **STD-DOM-3** *(T0)* | Mỗi bút toán cân: Σ Nợ = Σ Có, so bằng xu | trigger `assert_entry_balanced`; DG-LEDGER-1 / `LEDGER_BALANCED` |
| **STD-DOM-4** *(T0)* | Sửa / huỷ = **đảo** (cùng dòng, số âm, `is_reversal`), mỗi bút toán đảo tối đa một lần; bút toán đảo trỏ về bút toán đã đảo | chỉ mục duy nhất; DG-LEDGER-3 / `LEDGER_REVERSED_ONCE` |
| **STD-DOM-5** *(T0)* | Một cửa ghi: chỉ `ledgerService` (qua cửa nạp sổ) ghi `ledger_*`; module, add-in, AI không ghi bảng nhân | SC-KERNEL-1..3, SC-MOD-2, `kiem-chuan.sh`; vai trò CSDL `ketoan_app` |
| **STD-DOM-6** *(T0)* | Sổ phụ dẫn xuất cập nhật **trong cùng giao dịch** với bút toán; dựng lại được từ sổ cái | DG-LEDGER-2 / `LEDGER_BALANCES_DAILY`; test |
| **STD-DOM-7** | Không ghi vào kỳ đã khoá (kỳ × chi nhánh × loại chứng từ); khoá kỳ bị chặn khi sổ trong kỳ có lỗi toàn vẹn | `PERIOD_LOCKED`; R-DIAG-4; `test/diagnostics.test.ts` |
| **STD-DOM-8** | Tài khoản trên dòng có thật, đang dùng, là tài khoản chi tiết; tài khoản theo dõi đối tượng thì dòng có đối tượng | RULE-LEDGER R-LEDGER-8; `validateLines()` |
| **STD-DOM-9** | Số bút toán liên tục, không trùng trong đơn vị | UNIQUE `(tenant_id, entry_no)` |

## 3. Sự việc, phiên bản, idempotency

| Mã | Bất biến | Được bảo vệ bằng |
|---|---|---|
| **STD-DOM-10** *(T0)* | `docKey` bất biến, duy nhất trong đơn vị; gửi lại cùng `docKey` + cùng `version` → `unchanged`, không ghi trùng | UNIQUE; `api-examples.test.ts` |
| **STD-DOM-11** *(T0)* | Đổi nội dung = `version` lớn hơn → đảo bút toán phiên bản cũ, ghi bút toán phiên bản mới; `version` nhỏ hơn bản đang có → `CONFLICT` | cửa nạp sổ; DG-EVENT-1 / `EVENT_POSTED_VERSION` |
| **STD-DOM-12** | Sự việc `posted` có bút toán hiệu lực của đúng phiên bản; `pending` / `error` không có bút toán | DG-EVENT-2 / `EVENT_HAS_ENTRY` |
| **STD-DOM-13** | Thao tác ghi ngoài cửa nạp sổ (action) chạy tối đa một lần theo `Idempotency-Key` | `action_requests`; CONF-RUN-4 |

## 4. Loại chứng từ và trạng thái

**Loại chứng từ (`docType`)** — danh sách đóng; thêm loại mới là năng lực Kernel `ledger.doctype.<x>` (mức K1, đề xuất theo [VERSIONING §5](../standard/VERSIONING.md)):

| Nhóm | `docType` |
|---|---|
| Bán hàng | `sale`, `sale_return`, `customer_payment` |
| Mua hàng, kho | `purchase`, `purchase_return`, `supplier_payment`, `transfer`, `stock_adjustment`, `cogs` (nội bộ) |
| Tiền | `receipt`, `payment`, `bank_receipt`, `bank_payment`, `cash_transfer` |
| Kế toán | `manual`, `opening`, `closing` (nội bộ), `depreciation` (nội bộ) |
| Đề xuất (planned) | `payroll` (`ledger.doctype.payroll`), `production` (`ledger.doctype.production`) |

**Trạng thái sự việc:** `pending` (chờ định khoản ở ACC14) → `posted` / `error` → `cancelled` (huỷ = đảo). **Nhóm trạng thái chứng từ nghiệp vụ** của module (`bizcity_document@1`): `draft`, `pending`, `approved`, `done`, `cancelled`.

| Mã | Bất biến |
|---|---|
| **STD-DOM-14** | Chỉ chứng từ đã qua trạng thái được phép (khai ở manifest `documents[].ledger`, thường `approved` / `done`) mới nộp sự việc; ghi qua AI chỉ tạo `draft` / `pending` (STD-MCP-6) |
| **STD-DOM-15** | Huỷ chứng từ nghiệp vụ đã ghi sổ = `ctx.ledger.cancel` (đảo), không xoá sự việc |

## 5. Định khoản

| Mã | Bất biến | Được bảo vệ bằng |
|---|---|---|
| **STD-DOM-16** *(T0)* | Không số tài khoản trong code định khoản và trong chứng từ của module: tài khoản tra theo thứ tự **lý do → nhóm hạch toán mặt hàng → loại thuế → hình thức thanh toán → tài khoản ngầm định** (`AccountResolver`) | SC-KERNEL-5; RULE-POSTING |
| **STD-DOM-17** | Thiếu cấu hình → sự việc `error` + `POSTING_FAILED`, kế toán sửa rồi định khoản lại; không đoán tài khoản | cửa nạp sổ |
| **STD-DOM-18** | Đổi cấu hình định khoản chỉ áp cho lần định khoản sau; sổ cũ chỉ đổi bằng định khoản lại (đảo + ghi mới) có người duyệt | R-KER-4 |
| **STD-DOM-19** | Lý do định khoản (`reasonCode`) đến từ gói định khoản theo ngành (`bizcity_posting_template@1`), có phiên bản | SC-TPL-1 |

## 6. Kho và công nợ

| Mã | Bất biến | Được bảo vệ bằng |
|---|---|---|
| **STD-DOM-20** | Nhập xuất kho sinh từ sự việc (mua, bán, trả, chuyển, điều chỉnh); giá vốn do Kernel tính, module không tự ghi `inventory_*` | R-BOUND-2; SC-MOD-2 |
| **STD-DOM-21** | Công nợ (`debt_items`) sinh khi ghi sổ theo đối tượng; đối trừ qua Kernel (`allocate`), không sửa tay số còn lại | R-BOUND-2; (planned) `DEBT_MATCH_LEDGER` |
| **STD-DOM-22** | Σ công nợ mở theo đối tượng = số dư tài khoản công nợ của đối tượng đó | (planned) DG-PLAN-1 |

## 7. Thay đổi hợp đồng này

| Thay đổi | Mức | Cần |
|---|---|---|
| Thêm `docType` / lý do / trạng thái mới, không đổi cái cũ | K1 (minor) | đề xuất năng lực, test luật định khoản, CHANGELOG |
| Đổi cách định khoản một `docType` cho chứng từ mới | K2 | 2 người duyệt (1 hiểu nghiệp vụ), mục "Thay đổi định khoản" |
| Đổi / bỏ bất biến §2–§6, đụng dữ liệu đã ghi | K3 (major) | ADR + 2 người Lõi + kế toán trưởng ký |
