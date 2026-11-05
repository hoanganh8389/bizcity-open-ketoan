# Nền móng doanh nghiệp — bốn nhóm, mười bảy trụ cột, đối chiếu codebase
<!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — trang nền móng theo ADR-0028: nhóm A–D, 17 trụ cột, chuẩn bắt buộc, hiện trạng có bằng chứng (rà origin/main 601d939), việc và phase sở hữu; ma trận ECP × trụ cột -->

> **Trạng thái:** chấp nhận về nguyên tắc ([ADR-0028](../adr/ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md), D028-6) · **Luật:** [R-ECP](../rules/RULE-ENTERPRISE-CONTINUITY.md) · **Rà soát:** 2026-11-05 trên `main` 601d939 — chi tiết bằng chứng [PHASE-029 · 20](../phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/20-DANH-GIA-NEN-MONG.md) · **Lộ trình:** [PHASE-029 · 30](../phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/30-LO-TRINH-NEN-MONG.md)
> **Mức:** ✅ đạt (có tín hiệu chạy được) · 🟡 một phần · 📄 mới có tài liệu · ⬜ chưa có. Mức ở trang này **ghi tay có bằng chứng** cho tới khi engine bảng điểm chạy (S029-18, R-ECP-SCORE).

## 1. Bốn nhóm

| Nhóm | Câu hỏi nó trả lời | Trụ cột |
|---|---|---|
| **A · Nền móng thống nhất của doanh nghiệp** | Ai / cái gì / ở đâu / được làm gì / theo cấu hình nào — một cách hiểu cho mọi module | 01–05 |
| **B · Nền móng xử lý nghiệp vụ và giao dịch** | Một nghiệp vụ đi từ lệnh → chứng từ → duyệt → sự việc → sổ → kho / giá vốn thế nào | 06–10 |
| **C · Nền móng bảo đảm dữ liệu luôn đúng** | Làm sao biết số đúng: truy vết hai chiều, kiểm chuẩn, đối chiếu, một định nghĩa chỉ tiêu | 11–14 |
| **D · Nền móng để cộng đồng mở rộng** | Module / plugin / hệ ngoài kế thừa A–C thế nào mà không phá sự thật | 15–17 |

Thứ tự triển khai: **A trước**, rồi B, C; D mở song song vì nó là cách cộng đồng dùng A–C.

## 2. Mô hình định danh (một thực thể, nhiều vai trò)

Học tư duy Business Partner nhưng gọn hơn:

| Định danh | Nghĩa | Hôm nay | Đích |
|---|---|---|---|
| `party_id` | một đối tác; mang nhiều vai (khách, NCC, nhân viên tạm ứng…) | `partners.id` + `kind` (một vai mỗi bản ghi) | vai là thuộc tính nhiều giá trị của cùng `partners.id`; gộp trùng (S029-20) |
| `item_id` | một đơn vị tồn kho; SKU, barcode, mã hệ ngoài là định danh tham chiếu có lịch sử | ✅ `items.item_id` ULID, `item_codes` có hiệu lực, gộp (0065–0069) | giữ — là mẫu cho thực thể khác |
| `org_unit_id` | một đơn vị trong sơ đồ tổ chức; **không** đồng nghĩa pháp nhân, kho hay điểm bán | `org_units` (0062), `branches`, `accounting_units`, `warehouses` tách bảng | nhóm đơn vị (S026-6); mã có phiên bản (S026-4) |
| `person_id` | một con người | ⬜ không có; "nhân viên" tồn tại hai nơi không nối (`partners.kind = employee`, `dimensions.kind = employee`) | S029-23 |
| `employee_id` | quan hệ lao động của một người | ⬜ | S029-23 |
| `user_id` / `principal_id` | định danh truy cập hệ thống | `users.id`, `api_keys`, app; actor lưu dạng chữ `user:<id>` | giữ; nối `person_id` (S029-23) |

**User và employee không đồng nhất.** Nhân viên đổi tài khoản đăng nhập, nghỉ, được tuyển lại: lịch sử bán hàng và KPI vẫn nối đúng hồ sơ người.

## 3. Mười bảy trụ cột: chuẩn bắt buộc · hiện trạng · việc

### Nhóm A — Nền móng thống nhất của doanh nghiệp

| # | Trụ cột | Chuẩn bắt buộc | Mức | Hiện trạng (bằng chứng) | Khoảng cách | Việc · chủ |
|---|---|---|---|---|---|---|
| 01 | **Canonical Identity** | Mỗi thực thể có ID bất biến, độc lập mã hiển thị, mã nguồn ngoài, tên gọi | 🟡 | mặt hàng: ULID + guard (0065); các bảng khác `bigint` không tái dùng nhưng mã sửa tại chỗ | lịch sử mã đối tượng / chi nhánh / kho; định danh người | S026-4 · S029-23 |
| 02 | **Master Data Governance** | Danh mục có chủ, phiên bản, ngày hiệu lực, lịch sử gộp / tách, kiểm xung đột | 🟡 | mặt hàng đủ (mã, phân loại có hiệu lực, gộp, Lịch sử, Tác động); Gate A validate; `catalog_tombstones` | tên không có lịch sử; gộp chỉ mặt hàng; chặn xoá chỉ ở dịch vụ và thiếu; `DELETE` mở cho `ketoan_app` | S026-4/9/10/11 · S029-12/19/20 |
| 03 | **Enterprise Organization** | Chuẩn tenant, pháp nhân, đơn vị hạch toán, phòng ban, chi nhánh, cửa hàng, kho và quan hệ phân cấp | 🟡 | `tenants`, `accounting_units`, `branches` (MST riêng), `warehouses`, `org_units` cây tuỳ ý | nhóm đơn vị; giao dịch liên đơn vị; `accounting_units` không có ngừng dùng | S026-6/7 |
| 04 | **Identity & Authorization** | user, principal, person, employee, role, permission, scope, lịch sử cấp quyền, phân tách nhiệm vụ | 🟡 | `PERMISSIONS`, `defineAction` kiểm phía máy chủ, RLS (0041), `session_version`; vai trò bổ sung có lịch sử (PHASE-028 W1, chưa vào `main`) | phạm vi chi nhánh / kho; SoD chưa bật ở luồng nào; person / employee | PHASE-028 · S029-23/25 |
| 05 | **Configuration & Policy Registry** | Một hệ thống cấu hình chung: scope, version, hiệu lực, thứ tự ưu tiên, kiểm tác động | 🟡 | registry 23 khoá; `readSetting` (đọc trong giao dịch); `posting_policy_versions`, `accounting_profiles` có phiên bản | **không có `settings.set`**, không lịch sử, không ngày hiệu lực, chỉ phạm vi đơn vị; 0 nơi dùng `ctx.settings.get`; ≥ 8 chỗ đọc thô `tenants.settings`; 2 khoá dùng mà không khai | **S029-10 (P0)** |

### Nhóm B — Nền móng xử lý nghiệp vụ và giao dịch

| # | Trụ cột | Chuẩn bắt buộc | Mức | Hiện trạng | Khoảng cách | Việc · chủ |
|---|---|---|---|---|---|---|
| 06 | **Document SDK & Lifecycle** | Chứng từ có định danh, số, dòng, phiên bản, trạng thái, quan hệ, tệp đính kèm, lịch sử | 🟡 | `documents.ts` (số, `saveVersion`, `link`, `attach`, ký); một nơi cấp số; `accounting_events` + phiên bản; đính kèm tập trung | không module nào gọi `saveVersion` / `link`; chứng từ module là jsonb riêng (`purchase_documents.data`); không có bảng đầu chứng từ + thuộc tính chung | S029-5 (W2a) · **S029-11** |
| 07 | **Workflow & Approval Engine** | Luồng trạng thái, điều kiện chuyển bước, cấp phê duyệt, SoD, quyền theo ngữ cảnh | 🟡 | máy trạng thái YAML (`workflow.ts`): nhiều cấp, `sod`, `requires: reason`; hai luồng chạy thật | không luồng nào bật `sod`; duyệt phiếu Kernel không kiểm người lập ≠ người duyệt; chuyển bước theo sự kiện chưa có | S029-25 |
| 08 | **Command & Event Contracts** | Phân biệt lệnh và sự kiện; version, outbox, inbox, replay, idempotency | ✅ | `defineAction` + Idempotency-Key (`action_requests`); outbox / giao / tiêu thụ (0039), SKIP LOCKED, `dead`, phát lại; AP-2, SC-EVT-1 | vài sự kiện §7 chưa phát; tên `module.toggled` lệch hợp đồng; hạn khoá idempotency viết cứng 7 ngày | S029-28 |
| 09 | **Accounting Kernel** | Một cửa ghi sổ, bút toán kép, bất biến sau ghi, đảo bút toán, khoá kỳ, báo cáo, đối chiếu | 🟡 | trigger cân / chỉ thêm (0006 / 0049); một cửa (SC-KERNEL-*); chính sách có phiên bản; chẩn đoán L3 | **kỳ khoá chỉ kiểm ở ứng dụng** (chưa trigger CSDL); hệ TK có phiên bản (S026-8) | **S029-17** · S026-8 |
| 10 | **Inventory & Cost Continuity** | Truy vết lượng, lô / serial, biến thể, phương pháp tính giá, lớp giá vốn, xuất kho, BOM, giá thành | 🟡 | `inventory_movements` theo `item_id`; giá vốn bình quân tháng; Hành trình mặt hàng | lớp giá vốn + phân bổ; phương pháp có phiên bản; BOM / giá thành là việc của module MRP trên hợp đồng kho | PHASE-025 (S025-5..8) |

### Nhóm C — Nền móng bảo đảm dữ liệu luôn đúng

| # | Trụ cột | Chuẩn bắt buộc | Mức | Hiện trạng | Khoảng cách | Việc · chủ |
|---|---|---|---|---|---|---|
| 11 | **Cross-Module Lineage** | Truy vết **hai chiều** thực thể ↔ chứng từ ↔ sự kiện ↔ bút toán ↔ báo cáo, kể cả qua phiên bản | 🟡 | mặt hàng: Hành trình, Lịch sử, Tác động; sổ chi tiết TK mang `entryId` + `sourceDocumentId`; cổng lịch sử chứng từ (PHASE-029 W1) | đối tượng / tài khoản; báo cáo tài chính, cân đối phát sinh, tuổi nợ chưa đi thẳng tới bút toán; một công cụ "từ bất kỳ nút nào" | S029-2..8 · S026-13 · S029-27 |
| 12 | **Validation & Conformance** | Thư viện kiểm chuẩn chung theo schema, quan hệ, quyền, nghiệp vụ, pháp lý, vòng đời; **mở rộng được** | 🟡 | `bizcity_findings@1` (Gate A ~17 mã, Gate B 33 `IN-*`); ~74 `SC-*`, ~41 `DG-*`; 6 gói luật pháp lý VN (nháp); `bizcity module check` | danh mục mã đóng — module không thêm được luật / chẩn đoán; SDK không xuất `registerDiagnostics`; manifest không có `rules` / `diagnostics`; Gate C (vòng đời) chưa có | **S029-21** · S025-9/10 |
| 13 | **Reconciliation & Period Integrity** | Đối chiếu kho ↔ sổ cái, công nợ ↔ thanh toán, chứng từ liên đơn vị, trạng thái hoàn thành, điều kiện khoá kỳ | 🟡 | `DEBT_MATCH_LEDGER`, `INVENTORY_LEDGER_MISMATCH`, `LEDGER_BALANCES_DAILY`, `COGS_STALE`; khoá kỳ chạy L3, lỗi chặn trừ khi ghi lý do | `doi-chieu-ke-toan.sql` chạy tay; không sổ đăng ký đối chiếu; không đối chiếu liên đơn vị; không mã "chứng từ chưa hoàn thành" ngoài `EVENT_PENDING_AGE` | **S029-13** · S025-11/14 · S026-7 |
| 14 | **Semantic Metrics & KPI** | Một định nghĩa chỉ tiêu có nguồn, công thức, phạm vi, phiên bản, cách điều chỉnh | ⬜ | báo cáo tài chính là mảng TypeScript; `metrics.ts` chỉ số đo vận hành | không có sổ chỉ tiêu; không phiên bản | **S029-16** |

### Nhóm D — Nền móng để cộng đồng mở rộng

| # | Trụ cột | Chuẩn bắt buộc | Mức | Hiện trạng | Khoảng cách | Việc · chủ |
|---|---|---|---|---|---|---|
| 15 | **Integration & External Identity** | Adapter, ánh xạ định danh ngoài, đồng bộ tăng dần, chống trùng, chuyển đổi dữ liệu, bể lỗi | 🟡 | `bizcity_connector@1` (WooCommerce); chống trùng `UNIQUE(tenant, doc_key)`; bể `intake_inbox`; outbox `dead` + phát lại; nhiều cửa nhập | không bảng ánh xạ định danh ngoài chung; đồng bộ theo cửa sổ ngày (không con trỏ); không nhật ký từng lần kéo; khoá API kết nối lưu chữ rõ | **S029-15** · S029-24 |
| 16 | **Module SDK & Metadata Registry** | Khai báo module, object, field, action, permission, event, workflow, phụ thuộc, phiên bản, capability | 🟡 | `bizcity.module.json` + schema; `defineModule` đối chiếu mã; nạp có băm (`module_registry`); `GET /system/capabilities` | không có `objects` / `fields`; phụ thuộc chỉ là bản đồ phiên bản, không giải thứ tự khi chạy; luật / chẩn đoán module (xem 12) | **S029-21** |
| 17 | **Audit, Security & Operations** | Nhật ký bất biến, quyền truy cập, dữ liệu nhạy cảm, migration, sao lưu, giám sát, tracing, cổng phát hành | 🟡 | `audit_logs` chuỗi băm (0036), `EVIDENCE_CHAIN`; che bí mật trong bằng chứng; Prometheus 14 cảnh báo, Tempo, Loki; CI + `kiem-nang-cap.sh`; `kiem-khoi-phuc.sh` | khoá checksum migration chỉ tới 0033; `migrate.ts` không ghi checksum; không mã hoá khi lưu, không phân loại dữ liệu nhạy cảm; kiểm khôi phục không ở CI | **S029-22** · S029-24 |

## 4. Tám trụ cột cũ (ADR-0022) nằm ở đâu

| Trụ cột cũ (`tru-cot.json`) | Trụ cột mới |
|---|---|
| 0 · Quản trị dữ liệu gốc | 01, 02, 03 |
| I · Sổ cái bất biến | 09 |
| II · Định danh bất biến, mã có phiên bản | 01, 02 |
| III · Liên tục kế toán | 10, 11, 13 |
| IV · Một cửa nạp, các cổng, một ngôn ngữ mã | 08, 12 |
| V · Chính sách và chế độ có phiên bản | 05, 09 |
| VI · Bằng chứng và quan sát được | 11, 17 |
| VII · Cô lập đơn vị và phân quyền | 03, 04 |
| VIII · Mở rộng bằng module, kiểm chuẩn tự động | 12, 16 |

Tiêu chí cũ giữ mã (MD-001, L-1…); S029-18 thêm trường `foundation` (01–17) cho từng tiêu chí, không đổi mã.

## 5. Ma trận ECP × trụ cột

| ECP | Trụ cột chính | Lớp còn thiếu |
|---|---|---|
| ECP-01 định danh không tái dùng | 01, 02 | SQL cho thực thể ngoài mặt hàng |
| ECP-02 ngữ cảnh tenant / actor / nguồn / correlation | 04, 08, 17 | Cổng cho đường ghi ngoài action |
| ECP-03 hiệu lực + phiên bản | 02, 05, 09 | SQL + SDK cho cấu hình |
| ECP-04 tham chiếu định danh | 01, 15, 16 | hợp đồng dữ liệu, ánh xạ ngoài |
| ECP-05 bút toán → sự việc → chứng từ đúng phiên bản | 06, 09, 11 | (PHASE-029 W1–W3) |
| ECP-06 quyền tại thời điểm hành động, lịch sử quyết định | 04 | phạm vi, SoD |
| ECP-07 module không sửa dữ liệu của người khác | 16, 09 | phân hệ cũ còn dùng `ketoan_app` |
| ECP-08 sự kiện = sự thật đã commit | 08 | — |
| ECP-09 sửa / huỷ / thay thế giữ quan hệ gốc | 06, 10 | dòng gốc khi trả hàng |
| ECP-10 không bỏ qua lỗi dữ liệu | 12, 15 | nhật ký kết nối |
| ECP-11 đối chiếu + Gate Check xuyên module | 12, 13 | sổ đăng ký đối chiếu, Gate C |
| ECP-12 KPI có định nghĩa có phiên bản | 14 | toàn bộ |
| ECP-13 không phá huỷ lịch sử đã tham chiếu | 02, 06, 09, 17 | SQL + Quyền cho danh mục |

## 6. Cách đọc trang này

- Trang này là **bản đồ**; luật ở [R-ECP](../rules/RULE-ENTERPRISE-CONTINUITY.md), việc ở [PHASE-029 · 40](../phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md) và phase sở hữu.
- Mức đổi khi có tín hiệu mới (R-ECP-SCORE); sửa mức phải dẫn bằng chứng trong cùng PR.
