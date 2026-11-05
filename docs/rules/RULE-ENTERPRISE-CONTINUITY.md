# RULE · Liên tục doanh nghiệp — Enterprise Continuity (R-ECP)
<!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — luật R-ECP theo ADR-0028: ECP-01..13 (chủ dự án yêu cầu ECP-13), sáu thao tác vòng đời, mô hình nhất quán ba tầng, bốn lớp thi hành, bảng điểm theo bằng chứng -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Cấp:** Tier 0 cho ECP-04, ECP-05, ECP-07, ECP-13 và R-ECP-CONS-1; Tier 1 cho phần còn lại · **Trạng thái:** chấp nhận về nguyên tắc ([ADR-0028](../adr/ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md)) · **Thi hành:** [PHASE-029](../phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/README.md) và các phase sở hữu ghi ở cột "Việc".
> Nền (không thay): [R-CONT](RULE-CONTINUITY.md) (liên tục kế toán), [R-ITEM](RULE-ITEM.md) (định danh mặt hàng), [R-MD](RULE-MASTER-DATA.md) (danh mục), [R-LEDGER](RULE-LEDGER.md), [R-EVENT](RULE-EVENT.md), [R-INFRASTRUCTURE](RULE-INFRASTRUCTURE.md) (R-OUTBOX, R-CACHE), [R-MATRIX](RULE-SETTINGS-MATRIX.md), [R-TEN](RULE-TENANT-SECURITY.md).

## Nguyên tắc một câu

**Sự thật nghiệp vụ đã xác lập thì không bị mất: định danh không tái sử dụng, lịch sử không bị ghi đè, mọi thay đổi có ngày hiệu lực, người làm và bằng chứng — và Core tự kiểm điều đó ở CSDL, SDK, phân quyền và cổng kiểm chuẩn, không chỉ ở giao diện.**

## 1. Mười ba nguyên tắc bất biến

Bốn lớp thi hành: **SQL** (ràng buộc / trigger / quyền CSDL) · **SDK** (`ctx.*`, `defineAction`, cửa nạp) · **Quyền** (phân quyền tại thời điểm hành động) · **Cổng** (check `SC-*`, chẩn đoán `DG-*`, test có tên). Cột "Hôm nay" chỉ ghi thứ **chạy được**; "đạt" khi đủ lớp cần thiết.

| Mã | Nguyên tắc bất biến | Lớp cần | Hôm nay (thứ chạy được) | Việc |
|---|---|---|---|---|
| **ECP-01** | Mã nghiệp vụ thay đổi được, nhưng **định danh chuẩn không được tái sử dụng hoặc thay đổi** tuỳ tiện | SQL · SDK | `items_guard` chặn đổi `item_id` (0065); đổi mã = phiên bản `item_codes`; S026-20 chặn dùng lại mã của hàng còn sống. Đối tượng / chi nhánh / kho / tài khoản: chỉ `id` + `code` sửa được | S026-4 (`entity_codes`) |
| **ECP-02** | Mọi tác vụ nghiệp vụ có **tenant, actor, nguồn và correlation context** hợp lệ | SDK · Quyền | `defineAction` đặt `ctx.tenant`, `actor`, `traceId`; `accounting_events.source_system`, `created_by`; `audit_logs.trace_id` (0047) | đủ cho đường action; S029-14 kiểm đường không qua action |
| **ECP-03** | Thay đổi có ảnh hưởng lịch sử phải có **ngày hiệu lực và phiên bản**; dữ liệu đã chốt không bị âm thầm viết lại | SQL · Cổng | `posting_policy_versions` (0040), `accounting_profiles` (0054), `item_codes` / `item_classification` có hiệu lực, chỉ thêm. Cấu hình `tenants.settings` ghi đè, không lịch sử | S029-10 (cấu hình), S026-8 (hệ TK) |
| **ECP-04** | Quan hệ xuyên module phải tham chiếu **định danh chuẩn** hoặc **một ánh xạ có kiểm chứng** | SQL · SDK · Cổng | `item_id` trên sổ / kho / giá (0066); `ledger_lines.partner_id`. Trái: `bizcity_data@1` STD-DATA-6 cũ lưu `partner_code`; `inventory_movements.warehouse_code`, `ledger_lines.account_code` (tài khoản là ngoại lệ có chủ đích, ADR-0018) | S029-9 (sửa hợp đồng), S026-4 |
| **ECP-05** | Mọi bút toán truy ngược được về **sự việc kế toán và chứng từ nguồn tương ứng, kể cả phiên bản** | SQL · Cổng | `ledger_entries.event_id` + `event_version`, `LEDGER_ORPHAN`; cổng lịch sử chứng từ + `ENTRY_NO_VERSION` / `ENTRY_VERSION_UNKNOWN` / `EVENT_ENTRIES_STALE` (PHASE-029 W1, nhánh code chờ đẩy) | S029-2..8 |
| **ECP-06** | Quyền được kiểm **tại thời điểm hành động**; lịch sử quyết định phân quyền lưu đủ để kiểm toán | Quyền · SQL | `defineAction` kiểm quyền phía máy chủ; `session_version` thu hồi phiên. Lịch sử cấp / thu vai trò: PHASE-028 W1 (`user_role_assignments`, chỉ thêm, chưa vào `main`) | PHASE-028 |
| **ECP-07** | Module **không sửa trực tiếp** dữ liệu kế toán hoặc danh mục do Core / module khác sở hữu | SQL · SDK · Cổng | SC-KERNEL-1..3, STD-DATA-3, khung nhìn `bizcity_read` chỉ đọc (0043 / 0044 / 0070), vai `mod_<key>_rw`. Phân hệ cũ trong `phan-he/` vẫn chạy bằng `ketoan_app` | ADR-0024 (chuyển dần) |
| **ECP-08** | Domain Event báo **sự thật đã commit**; không dùng event chưa commit làm căn cứ xác nhận nghiệp vụ | SQL · SDK | outbox cùng giao dịch (`event_outbox`, 0039), gửi sau commit, SC-EVT-1; AP-2 | đạt — giữ |
| **ECP-09** | Chứng từ sửa, huỷ, thay thế, hoàn trả phải **duy trì quan hệ với chứng từ gốc** và xử lý tác động liên quan | SQL · SDK | phiên bản sự việc → đảo + ghi mới; `ledger_links`; `reverses_entry_id`. Dòng trả hàng chưa có `original_line_id` | S025-8; S029-11 (thuộc tính chứng từ) |
| **ECP-10** | Lỗi dữ liệu **không âm thầm bỏ qua**: có biên nhận, trạng thái chờ và đường khắc phục | SDK · Cổng | bể chờ `intake_inbox` (0059), `IN-*`, `bizcity_remedy@1`; outbox `dead` + phát lại; R-MD-5. Kết nối ngoài chưa có nhật ký từng lần kéo | S029-15 |
| **ECP-11** | Bất biến xuyên module phải có **phép đối chiếu và Gate Check**, không chỉ validation từng API | Cổng | `DEBT_MATCH_LEDGER`, `INVENTORY_LEDGER_MISMATCH`, `LEDGER_BALANCES_DAILY`; khoá kỳ chạy L3. `scripts/doi-chieu-ke-toan.sql` còn là công cụ chạy tay | S029-13, S025-9..11 |
| **ECP-12** | KPI, báo cáo, chỉ tiêu quản trị khai báo **nguồn, định nghĩa, phạm vi, phiên bản và cách xử lý dữ liệu điều chỉnh** | SDK · Cổng | báo cáo tài chính là mảng TypeScript (`BALANCE_SHEET_LINES`), không phiên bản; không có sổ KPI | S029-16 |
| **ECP-13** | **Không thay đổi phá huỷ lịch sử nghiệp vụ đã được tham chiếu.** Mọi thực thể, chứng từ, chính sách, quan hệ, định danh đã dùng trong nghiệp vụ giữ được lịch sử và khả năng truy vết; huỷ, ngừng dùng, gộp, tách, điều chỉnh đi qua quy trình có kiểm chuẩn, phiên bản, quyền và bằng chứng. Bảo vệ đồng thời bằng SQL, SDK, phân quyền và cổng kiểm chuẩn — **ẩn nút Xoá trên giao diện không tính là thi hành** | SQL · SDK · Quyền · Cổng | Sổ, sự việc, nhật ký, phiên bản chứng từ, mặt hàng: trigger chỉ thêm. Danh mục khác: chặn xoá **chỉ ở dịch vụ**, một số chặn thiếu; vai `ketoan_app` có `DELETE` trên mọi bảng (0032) | S029-12 (K3) |

## 2. Sáu thao tác vòng đời (R-ECP-LC)

| Mã | Thao tác | Luật | Cấm |
|---|---|---|---|
| R-ECP-LC-1 | **CREATE** | Sinh định danh bất biến (ULID hoặc `bigint` không tái dùng); mã là thuộc tính, không phải khoá | Tạo bản ghi mới để "đổi mã" một thực thể đang sống |
| R-ECP-LC-2 | **UPDATE** | Chỉ thuộc tính được phép; thuộc tính có ý nghĩa lịch sử (mã, tên pháp lý, MST, phân loại hạch toán, cấu hình hạng A/B) ghi **phiên bản mới có ngày hiệu lực**; còn lại ghi `audit_logs` trước / sau | Ghi đè thuộc tính lịch sử; sửa lùi ngày vào kỳ đã khoá |
| R-ECP-LC-3 | **ARCHIVE** | Ngừng sử dụng (`is_active = false` / `archived_at` / `status = retired`), giữ nguyên mọi tham chiếu cũ; báo cáo lịch sử vẫn đọc được | Xoá để "dọn danh sách" |
| R-ECP-LC-4 | **MERGE** | Ánh xạ thực thể cũ → thực thể sống (`merged_into_*` một lần, có người, lý do, thời điểm); mã cũ thành bí danh; chứng từ lịch sử **không viết lại** | `UPDATE` hàng loạt khoá ngoại về thực thể mới |
| R-ECP-LC-5 | **REVERSE** | Đảo tác động kế toán bằng bút toán đảo + ghi mới; bút toán gốc giữ nguyên, nối `reverses_entry_id` | `UPDATE` / `DELETE` dòng sổ (R-LEDGER-1) |
| R-ECP-LC-6 | **DELETE** | Chỉ khi **an toàn**: không có tham chiếu (theo chỉ mục tham chiếu, không theo danh sách bảng viết tay), không tác động lịch sử; để lại dấu xoá (`catalog_tombstones`); chứng từ nháp chưa phát sinh quan hệ xoá được theo chính sách lưu trữ | Xoá thứ đã dùng; xoá tầng (`CASCADE`) dữ liệu nghiệp vụ |

Áp cho từng loại dữ liệu gốc: [standard/DU-LIEU-GOC.md](../standard/DU-LIEU-GOC.md).

## 3. Mô hình nhất quán (R-ECP-CONS)

| Mã | Tầng | Thuộc tầng này | Cơ chế bắt buộc | Hôm nay |
|---|---|---|---|---|
| R-ECP-CONS-1 | **Strong** — trong một giao dịch PostgreSQL | Nợ = Có; sổ chỉ thêm; kiểm quyền; không ghi vào kỳ khoá; số chứng từ; phiên bản sự việc; số dư ngày; công nợ; outbox | trigger / ràng buộc CSDL **và** kiểm trong dịch vụ; không bất biến nào ở tầng này được dời sang tầng 2 | `ledger_lines_balanced` (hoãn), trigger chỉ thêm (0006 / 0049), `ledger_balances_daily` + `debt_items` cùng giao dịch. **Kỳ khoá mới kiểm ở ứng dụng**, chưa có trigger CSDL (S029-17) |
| R-ECP-CONS-2 | **Eventual** — sau commit | Đồng bộ CRM, POS, HRM, thông báo, dashboard, webhook, hệ ngoài, giá vốn tính lại theo lô việc | outbox → dispatcher, ít nhất một lần, retry có giãn, `dead` sau N lần; consumer idempotent theo `(consumer, event_id)`; Idempotency-Key ở cửa vào | `events.ts` (SKIP LOCKED, backoff, `event_consumptions`), `action_requests` (0035); chưa có adapter NATS (đã ghi để sau) |
| R-ECP-CONS-3 | **Reconciliation** | Kiểm chứng projection và hệ ngoài: số dư ngày ↔ dòng sổ, công nợ ↔ 131 / 331, kho ↔ 156, giá vốn cũ, sự kiện chết, kết nối ngoài ↔ nguồn | mỗi projection / đồng bộ khai **một phép đối chiếu có mã** (chẩn đoán), cách sửa (phát lại, tính lại), và mức chặn khoá kỳ | `LEDGER_BALANCES_DAILY`, `DEBT_MATCH_LEDGER`, `INVENTORY_LEDGER_MISMATCH`, `COGS_STALE`, `EVENT_DEAD` + phát lại. Chưa: đối chiếu kết nối ngoài theo cửa sổ kéo; đối chiếu chạy tay chưa thành chẩn đoán (S029-13, S029-15) |

Module khai tầng của mỗi tác dụng phụ trong manifest (`events.emits`, `ledger.submits`): cái gì quyết định sự thật kế toán thì ở tầng 1 qua cửa nạp; còn lại tầng 2 và phải có một mục tầng 3.

## 4. Bảng điểm theo bằng chứng (R-ECP-SCORE)

| Mã | Luật |
|---|---|
| R-ECP-SCORE-1 | Mức "đạt" của một tiêu chí trên `docs/standard/tru-cot.json` và [trang nền móng](../standard/NEN-MONG-DOANH-NGHIEP.md) phải trỏ tới **tín hiệu chạy được** (check `SC-*`, mã chẩn đoán, test có tên). Tài liệu, ADR, tên migration không phải tín hiệu |
| R-ECP-SCORE-2 | Engine ghi mức đạt (`source = check`) khi có tín hiệu; mức ghi tay (`source = manual`) chỉ được tới "một phần" (S026-15, mở rộng S029-18) |
| R-ECP-SCORE-3 | Không có API, action, màn nào ghi "đạt" (cùng R-CONT-7) |

## 5. Ví dụ bắt buộc: một đối tượng xuyên suốt

Khách hàng `partner_id = P001` đổi tên ba lần, từng mua hàng, thanh toán, rồi ngừng giao dịch. Core phải giữ được:

| Phải giữ | Bằng | Hôm nay |
|---|---|---|
| Định danh P001 xuyên suốt | `partners.id` không đổi; đổi mã = phiên bản mã | id giữ; mã sửa tại chỗ (S026-4) |
| Tên tại từng thời điểm có hiệu lực | bản thuộc tính có hiệu lực + ảnh chụp tên lúc ghi | **chưa** — báo cáo nối `partners.name` hiện tại (S029-19) |
| Chứng từ đã phát sinh, đúng phiên bản được ghi nhận | `accounting_events` + `accounting_event_versions` + cổng lịch sử chứng từ | có dữ liệu; cổng đọc ở PHASE-029 W1 |
| Công nợ, bút toán thanh toán, điều chỉnh | `ledger_lines.partner_id`, `debt_items`, bút toán đảo | đạt |
| Lịch sử gộp khách hàng trùng | `merged_into` một lần + bí danh mã | **chưa** — chỉ mặt hàng có gộp (S029-20) |
| Trạng thái ngừng giao dịch hiện tại | `is_active = false`, tham chiếu cũ giữ | đạt |

**Báo cáo lịch sử hiện dữ liệu theo thời điểm, không tự thay tên cũ bằng tên hiện tại.** Ca này là test cổng `T029-ECP-P001` (S029-19, S029-20).

## 6. Kiểm bằng

Từng ECP: cột "Việc" ở §1 dẫn tới mục checklist có tín hiệu. Tổng hợp: [standard/NEN-MONG-DOANH-NGHIEP.md](../standard/NEN-MONG-DOANH-NGHIEP.md) §5 (ma trận ECP × trụ cột × lớp thi hành).
