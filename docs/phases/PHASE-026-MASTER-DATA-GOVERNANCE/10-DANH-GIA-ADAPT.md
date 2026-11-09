# PHASE-026 · 10 — Đánh giá mức adapt: trụ cột × tiêu chí × mức đạt
<!-- [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — SINH TỰ ĐỘNG từ docs/standard/tru-cot.json (bizcity_pillars@1 0.1.0-draft, cập nhật 2026-11-08) bằng scripts/tru-cot-md.mjs — sửa ở tệp JSON rồi chạy lại, không sửa tay ở đây -->

Cùng một nguồn với màn **HT10 Trụ cột & mức đạt** và thẻ **Trụ cột** ở trang chủ phân hệ. Mức đạt đi theo bằng chứng (migration, test, check); không ai tích tay (R-CONT-7). Trọng số: đạt 1 · một phần ½ · tài liệu ¼ · chưa 0.

## Tổng quan

| Tầng | Trụ cột | Mức | Đạt | Một phần | Tài liệu | Chưa |
|---|---|---|---|---|---|---|
| Nền móng | Quản trị dữ liệu gốc (Master Data Governance) | **53 %** | 2 | 12 | 0 | 1 |
| I | Sổ cái bất biến | **80 %** | 3 | 2 | 0 | 0 |
| II | Định danh bất biến, mã có phiên bản | **61 %** | 4 | 0 | 1 | 2 |
| III | Liên tục kế toán (Accounting Continuity) | **39 %** | 2 | 0 | 3 | 2 |
| IV | Một cửa nạp, các cổng kiểm chuẩn, một ngôn ngữ mã | **90 %** | 4 | 1 | 0 | 0 |
| Nền móng | Policy Registry & Rule Contracts — chính sách nghiệp vụ và chế độ kế toán có phiên bản | **46 %** | 2 | 1 | 3 | 1 |
| VI | Bằng chứng và quan sát được | **70 %** | 2 | 3 | 0 | 0 |
| VII | Cô lập đơn vị và phân quyền | **50 %** | 2 | 0 | 0 | 2 |
| VIII | Mở rộng bằng module, kiểm chuẩn tự động | **50 %** | 2 | 1 | 0 | 2 |
| Nền móng | Thư viện tham chiếu có phiên bản (bizcity_library@1) | **100 %** | 8 | 0 | 0 | 0 |

## Nền móng · Quản trị dữ liệu gốc (Master Data Governance) — 53 %

> Thiết lập một lần hệ thống định danh và nguyên tắc đúng để hàng triệu mã, hàng trăm cửa hàng, nhiều pháp nhân và mọi module dùng chung một dòng dữ liệu kế toán liên tục.

| Mã | Tiêu chí | Mức | Bằng chứng | Khoảng cách | Việc tiếp | Ưu tiên |
|---|---|---|---|---|---|---|
| MD-001 | Mọi đối tượng kinh tế có ID chuẩn, bất biến trong phạm vi quản lý | 🟡 Một phần | items.item_id ULID bất biến (0065, trigger guard); đối tượng / chi nhánh / kho / tài khoản chỉ có id số + mã sửa được | định danh có phiên bản cho đối tượng, chi nhánh, kho (ADR-0018 hạng A/B); tài khoản theo phiên bản hệ thống TK | S026-4 (PHASE-026) | P0 |
| MD-002 | Mã hiển thị và phân loại có phiên bản theo ngày hiệu lực | 🟡 Một phần | item_codes (valid_from / valid_to, chỉ thêm), item_classification theo ngày (0065) | mã đối tượng / chi nhánh / kho; phân loại hàng (item_classes) chưa có ngày hiệu lực | S026-4, S026-5 (PHASE-026) | P0 |
| MD-003 | Cây phân cấp nhiều cấp, không giới hạn cố định hai tầng | 🟡 Một phần | org_units cây tuỳ ý (0062, path, level 0–9); item_classes / accounts / partner_groups / dimensions có parent_code | item_classes chưa có path / kiểm vòng; báo cáo kho mới gom tới 3 cấp nhóm hàng; cây không có ngày hiệu lực | S026-5 (PHASE-026) | P0 |
| MD-004 | Không dùng mã hiển thị làm khoá liên kết sổ sách | 🟡 Một phần | item_id trên ledger_lines / inventory_movements / inventory_costs / product_units / product_prices (0066); giá vốn và báo cáo kho gom theo item_id (G2) | ledger_lines.account_code, partner_id (id số, không phiên bản); products vẫn là bảng ghi (S024-11) | S024-11, S026-4 (PHASE-024) | P0 |
| ORG-001 | Pháp nhân, đơn vị hạch toán, chi nhánh, cửa hàng, kho được phân biệt rõ | 🟡 Một phần | tenants (MST), branches (MST riêng, accounting_unit_id), accounting_units, warehouses thuộc chi nhánh, org_units | chưa có NHÓM đơn vị (HO · kho tổng · cửa hàng là các tenant); chưa có vai của tenant trong nhóm | S026-6 (PHASE-026) | P1 |
| ORG-002 | Nghiệp vụ phải xác định được chủ thể kế toán và mã số thuế liên quan | 🟡 Một phần | chứng từ mang branch_id → chi nhánh có tax_code / company_name; sổ theo đơn vị hạch toán | chuyển kho / bán hàng LIÊN tenant (HO → cửa hàng) chưa có cặp chứng từ + loại trừ nội bộ | S026-7 (PHASE-026) | P1 |
| ACC-001 | Mapping tài khoản có phiên bản, phạm vi và thời gian hiệu lực | 🟡 Một phần | posting_policy_versions (ADR-0009, effective_from, ảnh chụp nhóm / lý do / TK); accounting_profiles theo năm; item_classification theo ngày | product_posting_groups không có ngày hiệu lực; chưa có bảng ánh xạ TK cũ → mới khi đổi chế độ; mapping theo phạm vi (nhóm đơn vị / pháp nhân) chưa có | S026-8 (PHASE-026) | P0 |
| ACC-002 | Mọi dòng tồn kho và giá vốn truy xuất được về SKU và nghiệp vụ gốc | ✅ Đạt | inventory_movements (event_id, line_no, item_id); inventory_costs.item_id; Hành trình mặt hàng theo item_id (bizcity_lineage 0.2.0); test item-id-so-kho, lineage | lớp giá vốn / phân bổ từng dòng xuất (PHASE-025 W2) để chỉ đích danh phiếu nhập nào | S025-5 (PHASE-025) | P0 |
| CF-001 | Thay đổi danh mục ảnh hưởng kế toán phải được kiểm chuẩn trước khi kích hoạt | 🟡 Một phần | Gate A: /products\|partners\|accounts/validate, mặt hàng nháp (0061), khung Vì sao, luật nhắc HT09 | chưa phân lớp thay đổi 0–3 (ADR-0018) để lớp 3 (đổi bản chất / TK) qua cổng + chứng từ điều chỉnh; đối tượng chưa có nháp | S026-9 (PHASE-026) | P0 |
| CF-002 | Sự kiện không đạt kiểm chuẩn phải được giữ trong Exception Buffer | 🟡 Một phần | intake_inbox (0059) — bể chờ Gate B; Commit Guard IN-GUARD-001 | chưa có bể cho sai lệch SAU ghi sổ (Gate C) và tìm chứng từ theo sai lệch sổ | S025-10 (PHASE-025) | P1 |
| AUD-001 | Sai lệch truy tìm được về chứng từ, nguyên nhân và phạm vi ảnh hưởng | 🟡 Một phần | audit_logs chuỗi băm (0036 / 0047), Bàn điều tra (PHASE-019), Hành trình, Lịch sử, Tác động mặt hàng (S026-10 / 11) | đối tượng / tài khoản / chi nhánh chưa có lịch sử, tác động | S026-10, S026-11 (PHASE-026) | P0 |
| IC-1 | Identity Continuity: đổi tên, đổi mã, đổi vị trí phân loại không đứt định danh | 🟡 Một phần | mặt hàng: đổi mã giữ item_id, hành trình nối mã cũ + mới, giá vốn một dòng (test B2b); đổi nhóm = bản phân loại mới theo ngày | chỉ mặt hàng; đối tượng / kho / chi nhánh / tài khoản chưa | S026-4 (PHASE-026) | P0 |
| VER-1 | Hai cột: định danh tồn kho (item_id) và mã (item_code) — cùng biến thể đổi mã giữ định danh; biến thể kinh tế khác → định danh mới, cùng sản phẩm cha | ✅ Đạt | items.item_id + item_codes (0065); items.parent_item_id điền và giữ khớp theo định danh từ products.parent_sku, chặn vòng (0067); ITEM-HINT-003 nhắc khi đổi ĐVT gốc của mặt hàng đã có nhập xuất; test bien-the-dinh-danh (4 ca) | MH26 / phân tích đặt hàng còn đọc products.parent_sku (ảnh chụp) — chuyển sang parent_item_id khi products thành khung nhìn (S024-11) | S024-11 (PHASE-024) | P0 |
| UI-4 | Mỗi màn danh mục có bốn khả năng: Lịch sử · Tác động · Kiểm chuẩn · Truy vết | 🟡 Một phần | mặt hàng đủ 4/4 trên Hành trình mặt hàng: Lịch sử (S026-10), Tác động (S026-11), Kiểm chuẩn (khung Vì sao Gate A), Truy vết (ACC95, họ mặt hàng) | chưa gom thành khung chung MasterDataFrame trên form danh mục DM10; thực thể khác chưa | S026-12, S026-4 (PHASE-026) | P0 |
| SCALE-1 | Danh mục hàng triệu mã, hàng trăm cửa hàng: đo và giữ hiệu năng | ☐ Chưa | đo 20.985 mặt hàng: đồng bộ Item Master +0,7 ms / mặt hàng; khoá chống chồng hiệu lực theo đơn vị | chưa có benchmark triệu SKU, chưa có nạp theo lô (FOR EACH STATEMENT), chưa có EXCLUDE gist | S026-14 (PHASE-026) | P2 |

## Trụ cột I · Sổ cái bất biến — 80 %

> Sổ chỉ thêm; sửa = đảo + ghi mới; Nợ = Có; không chứng từ thì không có bút toán.

| Mã | Tiêu chí | Mức | Bằng chứng | Khoảng cách | Việc tiếp | Ưu tiên |
|---|---|---|---|---|---|---|
| L-1 | Dòng sổ cái không sửa / xoá / TRUNCATE (trigger CSDL) | ✅ Đạt | guard_ledger_line_mutation, ledger_lines_no_truncate (0006 / 0049 / 0066); 0086 gỡ cờ thoát allow_ledger_purge khỏi chín trigger và thu DELETE / TRUNCATE của ketoan_app; test db-rules (đặt cờ rồi xoá vẫn bị từ chối), app-role, item-id-so-kho; chẩn đoán LEDGER_TRIGGERS ở lane diagnostics | — | — | P0 |
| L-2 | Tổng Nợ = tổng Có cuối giao dịch | ✅ Đạt | assert_entry_balanced (constraint trigger hoãn) | — | — | P0 |
| L-3 | Mọi dòng sổ trỏ về một sự việc kế toán có phiên bản | ✅ Đạt | accounting_events (doc_key, version) → ledger_entries → ledger_lines; R-EVENT-1 | — | — | P0 |
| L-4 | Dòng sổ mang ảnh chụp mã + định danh mặt hàng | 🟡 Một phần | libraries/vn.can-cu-phap-ly (18 mục, bí danh LEGAL_BASES), SC-LIB-1 kiểm basis[].key, core.library.attest / attestations (bằng chứng), thẻ Căn cứ HT14; test thu-vien-can-cu.test.ts (S030-49a) | chưa văn bản nào được người có trách nhiệm rà bản gốc (review pending); căn cứ của tham số pháp lý phần lớn chưa liên kết mã | S030-12 (PHASE-024) | P0 |
| L-5 | Đầu bút toán chỉ đổi theo đường E2 (bảy cột), mỗi lần đổi có dấu vết ở tầng CSDL, sửa ngoài ứng dụng bị cảnh báo | 🟡 Một phần | E2_COLUMNS + nhật ký ledger.entry.header_update ở posting.service.ts (S004-13); trigger ledger_entries_header_audit (0089) ghi audit_logs mọi thay đổi chín cột kể cả UPDATE thẳng bằng ketoan_app; test e2-db-audit, e2-header-audit; trigger guard_ledger_entry_mutation ép các cột còn lại | chưa có cảnh báo sửa ngoài ứng dụng và bảng theo dõi (S004-15, S004-16); partner_name / partner_attr_id (0087) chưa được ép bất biến (Q004-9) | S004-15, S004-16 (PHASE-004) | P0 |

## Trụ cột II · Định danh bất biến, mã có phiên bản — 61 %

> item_id không đổi; mã hàng, hệ thống tài khoản, chính sách có phiên bản + ngày hiệu lực.

| Mã | Tiêu chí | Mức | Bằng chứng | Khoảng cách | Việc tiếp | Ưu tiên |
|---|---|---|---|---|---|---|
| ID-1 | items / item_codes / item_classification với bất biến ở CSDL | ✅ Đạt | 0065; test item-master (18 ca) | — | — | P0 |
| ID-2 | item_id trên mọi bảng sổ / kho / giá / đơn vị | ✅ Đạt | 0066; test item-id-so-kho (7 ca); điền ngược kiểm 0 dòng thiếu | — | — | P0 |
| ID-3 | Giá vốn, NXT, sổ chi tiết hàng hoá gom theo item_id | ✅ Đạt | costing.service + inventory-report.service (G2, 2026-11-04); ca 'đổi mã giữa tháng → một dòng giá vốn' | — | — | P0 |
| ID-4 | products là khung nhìn; mọi đường ghi đi qua core.item.* | ☐ Chưa | — | chặn bởi INSERT … ON CONFLICT ở 6 / 7 chỗ ghi (70 §3.2.1 G1) | S024-11 (PHASE-024) | P0 |
| ID-5 | Sản phẩm cha / biến thể: parent_item_id được điền và có luật | ✅ Đạt | 0067: bizcity_items_link_parents, trigger products_items_sync_parent, items_parent_guard; Hành trình hiện họ (cha / biến thể / cùng cha); test bien-the-dinh-danh | — | — | P0 |
| ID-6 | Đối tượng, chi nhánh, kho có mã phiên bản (entity_codes) | ☐ Chưa | — | ADR-0018 hạng A/B chưa thi hành | S026-4 (PHASE-026) | P0 |
| ID-7 | Tài khoản theo phiên bản hệ thống TK + bảng ánh xạ cũ → mới | 📄 Tài liệu | ADR-0018 (chấp nhận 2026-11-02) | chưa có chart_versions / account_mappings | S026-8 (PHASE-026) | P0 |

## Trụ cột III · Liên tục kế toán (Accounting Continuity) — 39 %

> Mọi con số đi ngược được về nghiệp vụ gốc qua mua → kho → bán → giá vốn → lãi lỗ, qua mọi lần đổi mã / chế độ.

| Mã | Tiêu chí | Mức | Bằng chứng | Khoảng cách | Việc tiếp | Ưu tiên |
|---|---|---|---|---|---|---|
| C-1 | Hành trình mặt hàng: sự kiện kho, bút toán, giá vốn tháng, 'Vì sao giá vốn này?' | ✅ Đạt | bizcity_lineage 0.2.0, ACC95; test lineage (8 ca) | — | — | P0 |
| C-2 | Hành trình qua đổi mã: mã cũ + mới là một; tìm bằng mã cũ | ✅ Đạt | B2b: item.codes, event.code, nhãn 'mã cũ'; test item-id-so-kho | — | — | P0 |
| C-3 | Lớp giá vốn + phân bổ từng dòng xuất (mọi phương pháp) | 📄 Tài liệu | ADR-0021, PHASE-025 10-MO-HINH-DU-LIEU | valuation_layers / cost_allocations chưa có | S025-5, S025-6 (PHASE-025) | P0 |
| C-4 | Phương pháp tính giá là chính sách có phiên bản; mặc định bình quân gia quyền tháng (xuất lô FEFO / FIFO là việc của kho) | 📄 Tài liệu | D025-2 chủ duyệt | costing_method chưa có trong posting_policy_versions | S025-7, S025-17 (PHASE-025) | P1 |
| C-5 | Gate C — kiểm chuẩn vòng đời, mã CT-* trong thư viện | 📄 Tài liệu | RULE-CONTINUITY (CT-LIN/MD/COST/REC/PER/REV) | chưa có trong bizcity_findings@1, chưa có engine | S025-9, S025-10 (PHASE-025) | P0 |
| C-6 | Khoá kỳ đòi chuỗi lành (chặn trừ khi chấp nhận có lý do; còn lại cảnh báo) | ☐ Chưa | — | — | S025-11, S025-18 (PHASE-025) | P0 |
| C-7 | Truy vết đối tượng và tài khoản (một khách hàng / một TK → sự kiện, chứng từ) | ☐ Chưa | mới có báo cáo sổ chi tiết công nợ / sổ cái TK | chưa có lineage đối tượng / tài khoản | S026-13 (PHASE-026) | P1 |

## Trụ cột IV · Một cửa nạp, các cổng kiểm chuẩn, một ngôn ngữ mã — 90 %

> Mọi đầu vào đi một cửa; Gate A (danh mục) · B (trước ghi sổ) · C (vòng đời); mọi thông báo từ thư viện mã có căn cứ; mặc định cho phép, nhắc khi sai.

| Mã | Tiêu chí | Mức | Bằng chứng | Khoảng cách | Việc tiếp | Ưu tiên |
|---|---|---|---|---|---|---|
| G-1 | Gate A: validate + lưu nháp khi còn lỗi chặn | 🟡 Một phần | /products\|partners\|accounts/validate; mặt hàng nháp (0061); khung Vì sao | đối tượng chưa có nháp; chưa phân lớp thay đổi | S026-9 (PHASE-023) | P0 |
| G-2 | Gate B: trạm tiền kiểm + bể chờ + kiểm lại tự động | ✅ Đạt | intake_inbox (0059), preflight, recheckInboxForSkus; mã IN-* | — | — | P0 |
| G-3 | Commit Guard: cấu hình đổi sau tiền kiểm thì kiểm lại trước khi nhận | ✅ Đạt | IN-GUARD-001, header X-Preflight-Guard (S024-29) | — | — | P0 |
| G-4 | Thư viện mã một khuôn, có căn cứ pháp lý; thông báo dựng từ mã | ✅ Đạt | bizcity_findings@1, legal-basis.ts, notifyFinding, check SC-FIND-1 / SC-FIND-2 (R-GATE-10 / 11) | IN-ITEM-002 / 008, CT-* chưa vào thư viện | S024-7, S025-9 (PHASE-024) | P0 |
| G-5 | Mặc định cho phép, nhắc khi sai (R-GATE-9); không có luồng 'chờ kế toán trưởng' | ✅ Đạt | bizcity.item.auto_create mặc định bật; ADR-0020; HT09 | — | — | P0 |

## Nền móng · Policy Registry & Rule Contracts — chính sách nghiệp vụ và chế độ kế toán có phiên bản — 46 %

> Chính sách nghiệp vụ (giá, chiết khấu, khuyến mại, hạn mức, ngưỡng duyệt) và chế độ kế toán quản trị tập trung ở module chủ, phát hành có phiên bản qua một sổ đăng ký; mọi module và plugin dùng cùng bản, chọn theo ngày chứng từ, truy vết được tới bản đã áp — ngang Master Data: MDG giữ cái gì, Policy Registry giữ theo luật nào (ADR-0031).

| Mã | Tiêu chí | Mức | Bằng chứng | Khoảng cách | Việc tiếp | Ưu tiên |
|---|---|---|---|---|---|---|
| P-1 | Luật định khoản có phiên bản; dòng sổ ghi policy_version | ✅ Đạt | posting_policy_versions (0040, ADR-0009) | — | — | P0 |
| P-2 | Hồ sơ kế toán (chế độ, năm tài chính) theo năm | ✅ Đạt | accounting_profiles (0054), HT07 | — | — | P0 |
| P-3 | Đổi chế độ: phiên bản hệ thống TK + ánh xạ + phiếu chuyển số dư | 📄 Tài liệu | ADR-0018 §tài khoản | — | S026-8 (PHASE-026) | P0 |
| P-4 | Chính sách theo phạm vi (pháp nhân / nhóm đơn vị) khi chạy chuỗi | ☐ Chưa | — | chính sách hôm nay theo tenant | S026-6 (PHASE-026) | P1 |
| P-5 | Nhất quán cross-module: một nghiệp vụ một chính sách; mọi nguồn (module, POS, Woo, sàn) dùng cùng mã@bản và cùng hàm tính | 📄 Tài liệu | ADR-0031 D-POL-0 / D-POL-1; PHASE-031 · 20 §1 | chưa có Rule Contract và API phát hành cho nguồn ngoài | S031-13, S031-15 (PHASE-031) | P0 |
| P-6 | Xuyên suốt: chính sách chọn theo ngày chứng từ; đổi bản không đổi chứng từ cũ, không khoảng trống hiệu lực | 🟡 Một phần | policy_registry + purchase_policy_versions (0079), core/policies.ts, policyAt trong engine mua hàng; golden T031-TR-2, T031-MH-1 (#152) | mới có cho chính sách mua hàng | S031-4, S031-5 (PHASE-031) | P0 |
| P-7 | Truy vết: bút toán → sự việc → chứng từ → chính sách@bản#băm → người phát hành, căn cứ — hai chiều | 📄 Tài liệu | policyTrace có version + hash (W1, #152); policyRefs ở cửa nạp (chữ chốt W2a, #153) | cửa nạp chưa nhận tham chiếu; chưa có khung nhìn policy_application | S031-6, S031-9, S031-21 (PHASE-031) | P0 |

## Trụ cột VI · Bằng chứng và quan sát được — 70 %

> Mọi thao tác để lại nhật ký chuỗi băm; sai lệch tự chẩn đoán; người dùng thấy lịch sử, tác động, tiến độ ngay trên màn.

| Mã | Tiêu chí | Mức | Bằng chứng | Khoảng cách | Việc tiếp | Ưu tiên |
|---|---|---|---|---|---|---|
| E-1 | Nhật ký thao tác chỉ thêm, chuỗi băm, kiểm bằng chứng | ✅ Đạt | audit_logs (0036 / 0047), forbid_audit_log_mutation, evidence.routes | — | — | P0 |
| E-2 | Lịch sử (mã cũ / mới, ngày hiệu lực, người đổi) trên màn danh mục | 🟡 Một phần | GET /api/v1/lineage/items/:sku/history (mã cũ / mới, hiệu lực, người đổi, phân loại, sửa + lý do cảnh báo; tra bằng mã cũ); nút Lịch sử ở Hành trình mặt hàng; test bien-the-dinh-danh | chỉ mặt hàng — đối tượng / tài khoản / chi nhánh chờ entity_codes (S026-4); chưa gắn vào form DM10 (khung MasterDataFrame S026-12) | S026-4, S026-12 (PHASE-026) | P0 |
| E-3 | Tác động: một mã dùng ở chứng từ, kho, TK, cửa hàng, báo cáo nào | 🟡 Một phần | GET /api/v1/lineage/items/:sku/impact — chứng từ theo loại, tồn theo chi nhánh, tài khoản, bảng giá, quy đổi, tháng giá vốn, kỳ đã khoá + câu nói rõ hệ quả; nút Tác động ở Hành trình; test bien-the-dinh-danh | chỉ mặt hàng; tính trực tiếp (chưa có chỉ mục md_references cho tác động hàng loạt); chưa bắt xem trước trong hộp Đổi mã / Đổi nhóm | S026-11 (phần còn lại), S026-12 (PHASE-026) | P0 |
| E-4 | Tự chẩn đoán L1 / L3, khoá kỳ chặn khi sổ lỗi | ✅ Đạt | diagnostic_runs, runDiagnostics, STOCK_LEDGER_MATCH | — | — | P0 |
| E-5 | Bảng trụ cột × mức đạt trên giao diện (Hệ thống + trang chủ phân hệ) | 🟡 Một phần | HT10 bản đầu (2026-11-04), nguồn docs/standard/tru-cot.json ghi tay có bằng chứng | mức đạt chưa do engine ghi (selfcheck / test) | S026-15 (PHASE-026) | P1 |

## Trụ cột VII · Cô lập đơn vị và phân quyền — 50 %

> Số liệu của đơn vị nào ở đơn vị đó (RLS); ai làm được gì là việc của phân quyền, không mã hoá theo chức danh; chuỗi nhiều đơn vị vẫn không lẫn số.

| Mã | Tiêu chí | Mức | Bằng chứng | Khoảng cách | Việc tiếp | Ưu tiên |
|---|---|---|---|---|---|---|
| S-1 | RLS theo tenant trên mọi bảng nghiệp vụ | ✅ Đạt | bizcity_tenant_visible (0041), test access / app-role | — | — | P0 |
| S-2 | Phân quyền theo quyền (permission), không theo chức danh | ✅ Đạt | PERMISSIONS, ADR-0020 | — | — | P0 |
| S-3 | Nhóm đơn vị: một tenant là HO, tenant khác là kho tổng / cửa hàng; danh mục dùng chung trong nhóm | ☐ Chưa | — | tenant_groups, vai của tenant, danh mục nhóm + nhận về đơn vị | S026-6 (PHASE-026) | P1 |
| S-4 | Giao dịch liên đơn vị (chuyển kho, bán nội bộ HO → cửa hàng) thành cặp chứng từ đối ứng, loại trừ được khi hợp nhất | ☐ Chưa | trong một tenant: counter_branch_id, 1368x, hàng đang chuyển | cặp chứng từ liên tenant + intercompany_ref + báo cáo loại trừ | S026-7 (PHASE-026) | P1 |

## Trụ cột VIII · Mở rộng bằng module, kiểm chuẩn tự động — 50 %

> Module của cộng đồng dùng chung một dòng dữ liệu kế toán qua SDK; bộ kiểm chuẩn bảo vệ luật, hợp đồng và mức đạt.

| Mã | Tiêu chí | Mức | Bằng chứng | Khoảng cách | Việc tiếp | Ưu tiên |
|---|---|---|---|---|---|---|
| M-1 | Manifest, năng lực, action công bố schema / quyền / tác dụng phụ | ✅ Đạt | bizcity-standard.json, defineAction, GET /system/capabilities | — | — | P0 |
| M-2 | Bộ kiểm chuẩn tĩnh (selfcheck) + tự kiểm (repo-bad) | ✅ Đạt | tests/conformance (52 đạt · 0 không đạt 2026-11-04) | SC-ITEM-4 / 5 chưa viết | S024-16 (PHASE-001) | P0 |
| M-3 | Module đọc định danh qua ctx.data (items*, khung nhìn bizcity_read) | ☐ Chưa | — | — | S024-11 (PHASE-024) | P0 |
| M-4 | Golden Tests: đổi mã, đổi nhóm, đổi chế độ không phá FIFO / sổ cái | 🟡 Một phần | ca đổi mã giữa tháng (item-id-so-kho); đổi phân loại theo ngày (item-master) | chưa có bộ Golden Tests đặt tên, chạy như một cổng phát hành | S026-2 (PHASE-026) | P0 |
| M-5 | Benchmark triệu SKU, hàng trăm cửa hàng; kiểm soát hiệu năng | ☐ Chưa | — | — | S026-14 (PHASE-026) | P2 |

## Nền móng · Thư viện tham chiếu có phiên bản (bizcity_library@1) — 100 %

> Dữ liệu tham chiếu chung mọi đơn vị (tham số pháp lý, lịch, mã chức năng, sườn nghiệp vụ, luật kiểm, mẫu) có một khuôn, có phiên bản, đọc tại ngày, kiểm được ô nhập với mã chung LIB-* và gợi ý; đơn vị chỉ đọc, ghi đè có lý do, xác nhận căn cứ; mọi lần dùng để lại dấu — ngang Master Data (giữ cái gì của đơn vị) và Policy Registry (đơn vị quyết theo luật nào) (ADR-0032).

| Mã | Tiêu chí | Mức | Bằng chứng | Khoảng cách | Việc tiếp | Ưu tiên |
|---|---|---|---|---|---|---|
| L-1 | Khuôn chung bizcity_library@1: phong bì cứng, payload theo itemSchema, phiên bản ba tầng (thư viện · mục · giá trị theo ngày), băm + changelog | ✅ Đạt | libraries/*/library.json, scripts/thu-vien/thu-vien.mjs, SC-LIB-1 + ca tự kiểm library-bad (S030-45) | — | — | P0 |
| L-2 | Một bộ kiểm chung, 7 mã LIB-* trong thư viện mã (cổng L), gợi ý lấy từ thư viện; luật khai báo của từng thư viện | ✅ Đạt | packages/platform/src/core/libraries (validateAgainstLibrary), library-findings.ts, thu-vien.test.ts | — | — | P0 |
| L-3 | Đọc được ở mọi nơi: API core.library.*, MCP chỉ đọc, ô chọn LibraryPicker, màn HT14 Kho thư viện | ✅ Đạt | GET /api/v1/libraries, LibraryPicker (ui-kit), modules/thu-vien (S030-47) | — | — | P0 |
| L-4 | Căn cứ pháp lý là thư viện; mục trỏ căn cứ bằng mã; kế toán trưởng xác nhận theo đơn vị | ✅ Đạt | libraries/vn.can-cu-phap-ly (18 mục, gộp LEGAL_BASES + legal-sources.json), SC-LIB-1 kiểm basis[].key, library_attestations qua core.library.attest / attestations, thẻ Căn cứ HT14; test thu-vien-can-cu.test.ts (S030-49a) | nội dung: chưa văn bản nào được rà bản gốc; căn cứ của tham số pháp lý phần lớn chưa liên kết mã — việc rà soát nội dung, không phải cơ chế | — | P1 |
| L-5 | Cấu hình theo đơn vị: ghi đè giá trị có lý do, hạ mức luật, gắn trường ↔ thư viện | ✅ Đạt | library_settings + library_change_requests (0088), core.library.configure / config / propose / proposals / proposal.update, thẻ Cấu hình + Đề xuất HT14, khoá bindings (hạ / tắt gắn của cửa nạp); test thu-vien-cau-hinh.test.ts, library-bindings.test.ts (S030-49b, S030-51b) | — | — | P1 |
| L-6 | Theo dõi sử dụng + bảng đánh giá: thư viện khoẻ, dữ liệu qua thư viện, module theo chuẩn (ĐẠT / có điều kiện / KHÔNG ĐẠT) | ✅ Đạt | library_usage_daily (0083), core.library.usage, core.library.modules + bảng Theo module HT14 (ĐẠT / có điều kiện / KHÔNG ĐẠT), nguồn kênh cửa nạp; test thu-vien-su-dung.test.ts, thu-vien-module.test.ts, library-bindings.test.ts (S030-48, S030-51a, S030-51b) | — | — | P1 |
| L-7 | Bộ kiểm ở mọi đường vào dùng chung thư viện: ô chọn, API, action của module, cửa nạp, bộ kiểm tĩnh, CLI | ✅ Đạt | ô chọn + API + ctx.libraries trong action + cửa nạp (libraryFindings[], bảng gắn LIBRARY_BINDINGS) + SC-LIB-1 / 2 / 3 + CLI library check; test thu-vien-module.test.ts, library-bindings.test.ts (S030-51a, S030-51b) | — | — | P1 |
| L-8 | Skill + CLI cho dev và AI: tìm, kiểm, thêm, cập nhật thư viện | ✅ Đạt | npx bizcity library list / search / check / new / diff (packages/cli/lib/library.mjs), skill skills/use-bizcity-library; test packages/cli/test/library-cli.test.mjs (9 ca, phá thử 3 chỗ) (S030-50) | check qua bản dựng platform không có cấu hình riêng của đơn vị (cần máy chủ) | — | P1 |
