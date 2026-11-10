# Bảng việc
<!-- [2026-11-03 11:52 PM Johnny Chu - Chu Hoàng Anh] FLOW — tệp sinh (R-FLOW-8): node scripts/bang-viec.mjs --write; không sửa tay -->

> **Tệp sinh tự động** từ `docs/phases/*/40-MASTER-CHECKLIST.md` và [CLAIMS.md](CLAIMS.md) — **không sửa tay**. Đổi trạng thái: sửa checklist / CLAIMS rồi chạy `node scripts/bang-viec.mjs --write` trong cùng PR (SC-FLOW-3). Luật: [R-FLOW-8](../rules/RULE-FLOW.md). Màn kanban chỉ đọc: GitHub Pages của repo.

| Cột | Số việc |
|---|---|
| Đang làm | 8 |
| Chờ merge | 0 |
| Bị chặn | 28 |
| Chưa ai nhận | 164 |
| Chờ đủ tín hiệu | 60 |
| Hoãn | 3 |
| Xong | 278 |
| **Tổng** | **541** |

## Đang làm (8)

| Mã | Phase | Việc | Ưu tiên | Người giữ · nhánh |
|---|---|---|---|---|
| [S014-14](PHASE-014-CLI-TEMPLATE-CA-CHUAN/40-MASTER-CHECKLIST.md#L25) | PHASE-014 | FLOW-2 Bảng việc sinh từ main (R-FLOW-8): cột Việc ở CLAIMS.md, scripts/bang-viec.mjs, BANG-VIEC.md + bang-vi… | — | hoanganh8389 (phiên Claude, core-ke-toan) · `feat/flow-2-bang-viec` |
| [S014-16](PHASE-014-CLI-TEMPLATE-CA-CHUAN/40-MASTER-CHECKLIST.md#L27) | PHASE-014 | SC-ACT-2 (STD-ACT-9): action ghi mà handler gọi tới cửa ghi sổ (eventStore.post / reverseActive, postDocument… | — | hoanganh8389 (phiên Claude, danh-gia-phase) · `feat/phase-014-s014-16-sc-act-2` |
| [S018-21](PHASE-018-GIAM-SAT-VAN-HANH/40-MASTER-CHECKLIST.md#L38) | PHASE-018 | Giám sát (Loki, Tempo, Prometheus, Grafana) BẬT MẶC ĐỊNH ở bản cài Docker: include: trong docker-compose.yml,… | P1 | hoanganh8389 (phiên Claude, PHASE-026 MDG) · `feat/phase-018-giam-sat-mac-dinh` |
| [S024-16](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L27) | PHASE-024 | SC-ITEM-1..3 + ca tự kiểm fixtures/repo-bad | P0 | hoanganh8389 (phiên Claude, core-ke-toan) · `feat/phase-024-s024-16-sc-item` |
| [S024-33](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L44) | PHASE-024 | Bỏ suy tài khoản kho từ tiền tố ở packages/kernel/src/modules/posting/rules/stock.rule.ts:55 (startsWith('15'… | P0 | hoanganh8389 (phiên Claude, danh-gia-phase) · `feat/phase-024-s024-33-tk-kho` |
| [S028-10](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L19) | PHASE-028 | W5: đợt 1 — quyền theo chi nhánh ở cửa nạp + luồng mẫu chuyển kho hai chiều (chữ chốt ADR-0027 Phụ lục A, W5 … | P1 | hoanganh8389 (phiên Claude, PHASE-028 authz) · `feat/phase-028-w5-thu-vien-tgs` |
| [S030-51b](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L60) | PHASE-030 | B5b — cửa nạp: bảng gắn trường ↔ thư viện, chỉ cảnh báo, kênh riêng libraryFindings[], K1 (26 §4.2) | P1 | hoanganh8389 (phiên Claude, thu-vien-b5b) · `feat/s030-51b-cua-nap-thu-vien` |
| [S031-30](PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md#L39) | PHASE-031 | W4c: ô Thực hiện chương trình — program[] ở core.policy.tracking (chứng từ áp, quà theo mặt hàng, lệch IN-POL… | P1 | hoanganh8389 (phiên Claude, PHASE-031 policy) · `feat/phase-031-w4c-thuc-hien-chuong-trinh` |

## Chờ merge (0)

—

## Bị chặn (28)

| Mã | Phase | Việc | Ưu tiên | Người giữ · nhánh |
|---|---|---|---|---|
| [S001-6](PHASE-001-CHOT-CHUAN/40-MASTER-CHECKLIST.md#L16) | PHASE-001 | Luật R-KER / R-SEC / R-REL / R-DIAG, SECURITY.md, CHANGELOG.md | — | — |
| [S002-1](PHASE-002-AUDIT-PHAN-LOP/40-MASTER-CHECKLIST.md#L11) | PHASE-002 | Rà REUSE-MAP với người phụ trách từng phân hệ | — | — |
| [S007-7](PHASE-007-CO-LAP-DON-VI-RLS/40-MASTER-CHECKLIST.md#L19) | PHASE-007 | Bản cài thật: API chạy bằng ketoanapp | — | — |
| [S008-4](PHASE-008-SAO-LUU-PITR/40-MASTER-CHECKLIST.md#L16) | PHASE-008 | Xác nhận thời hạn lưu trữ | — | — |
| [S009-5](PHASE-009-MCP-GHI/40-MASTER-CHECKLIST.md#L18) | PHASE-009 | Khoá mcp… có phạm vi | — | — |
| [S014-5](PHASE-014-CLI-TEMPLATE-CA-CHUAN/40-MASTER-CHECKLIST.md#L15) | PHASE-014 | Ca chuẩn Hợp đồng 3/3 | — | — |
| [S015-3](PHASE-015-CELL-WORDPRESS/40-MASTER-CHECKLIST.md#L13) | PHASE-015 | Đề xuất H-1..H-6 cho Hub / Cell | — | — |
| [S018-18](PHASE-018-GIAM-SAT-VAN-HANH/40-MASTER-CHECKLIST.md#L35) | PHASE-018 | SLI / SLO, đo tải theo Q018-5, kịch bản sập, lint cấu hình giám sát trong CI | P2 | — |
| [S018-19](PHASE-018-GIAM-SAT-VAN-HANH/40-MASTER-CHECKLIST.md#L36) | PHASE-018 | API tóm tắt sức khoẻ có phân quyền + widget CEO 4 chỉ số — ca T018-7 | P3 | — |
| [S020-15](PHASE-020-KIEM-CHUAN-PHAP-LY-VN/40-MASTER-CHECKLIST.md#L33) | PHASE-020 | Người duyệt kế toán / thuế rà registry đợt đầu (LEGAL-SOURCE-REGISTRY §3); ký ADR-0009 cùng lúc | P0 | — |
| [S023-5](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L16) | PHASE-023 | Tệp giải nghĩa data/giai-nghia-tai-khoan/vn-tt99.json: 30 tài khoản (D023-5), nháp theo Q023-1; căn cứ trỏ do… | P0 | — |
| [S024-9](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L20) | PHASE-024 | Migration K3: itemid ở ledgerlines, inventorymovements, inventorycosts, productunits, productprices; điền ngư… | P0 | — |
| [S024-19](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L30) | PHASE-024 | bizcitymasterdata@2 (Versioned Master Data Contract): khuôn chung; partnercodes, branchcodes; mã ngoài theo n… | P0 | — |
| [S028-5](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L14) | PHASE-028 | PR tài liệu W0 merge vào main (R-FLOW) | P0 | — |
| [S029-5](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L14) | PHASE-029 | ctx.ledger.submit tự saveVersion + liên kết ledger; payloadVersion ở GET /documents/:id | P0 | — |
| [S029-8](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L17) | PHASE-029 | Nâng chẩn đoán lên error khi bản đo trên bản cài thật = 0 | P2 | — |
| [S029-23](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L33) | PHASE-029 | Người / nhân viên tách người dùng | P2 | — |
| [S029-26](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L36) | PHASE-029 | Quan hệ người dùng ↔ nhân viên trong báo cáo bán hàng / KPI | P2 | — |
| [S029-32](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L20) | PHASE-029 | Cấu hình đợt 2: route ghi riêng → setSetting; valueType cho module; chặn đọc thô tenants.settings; xuất / nhậ… | P1 | — |
| [S030-12](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L19) | PHASE-030 | Kế toán trưởng trả Q030-3 (ngân sách), xác nhận công thức TS03 theo ngày, lương – BH – TNCN và giá trị tham s… | P0 | — |
| [S030-13](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L20) | PHASE-030 | Nhóm Lõi trả Q030-2 (lô ở Kernel), xếp K-030-1..6 vào phase Kernel; golden vào bizcitymodule@1 (PR chốt thiết… | P0 | — |
| [S030-14](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L21) | PHASE-030 | Chủ dự án trả Q030-1 (nhân sự một hay ba module), Q030-4 (giao hàng tách) | P1 | — |
| [S030-20](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L27) | PHASE-030 | Chuẩn chứng từ 16: nhóm Lõi duyệt bizcitydocument@1 1.4.0-draft (defineDocument, hai con trỏ, policy, locks, … | P0 | — |
| [S030-27](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L34) | PHASE-030 | Theo dõi cầu nối Workflow ↔ PHASE-028 (19 §3): PHASE-028 nhận authorize trên tài nguyên chứng từ + điều kiện … | P1 | — |
| [S030-28](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L35) | PHASE-030 | bizcityaction@1 1.4.0: các bước §4 là cổng, kiểu GateResult trong packages/contracts, error.details.gates, ct… | P0 | — |
| [S031-3](PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md#L12) | PHASE-031 | Nhóm Lõi trả Q031-4, Q031-6; duyệt phần K2 (cửa nạp, Guard) | P0 | — |
| [S031-14](PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md#L23) | PHASE-031 | Kế toán trưởng xác nhận bảng reasonCode theo loại kết quả (Q031-5) | P0 | — |
| [S031-27](PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md#L36) | PHASE-031 | ~~Đổi số migration W2a 0080 → 0082~~ — rút: phiên PHASE-029 (K3) sửa trùng 0080 bằng cách đổi số của K3 (0081… | P0 | — |

## Chưa ai nhận (164)

| Mã | Phase | Việc | Ưu tiên | Người giữ · nhánh |
|---|---|---|---|---|
| [S001-11](PHASE-001-CHOT-CHUAN/40-MASTER-CHECKLIST.md#L21) | PHASE-001 | CSDL dev áp 0030–0037 | — | — |
| [S005-7](PHASE-005-CHINH-SACH-CO-PHIEN-BAN/40-MASTER-CHECKLIST.md#L19) | PHASE-005 | Q-2: kế toán chọn "bản mới nhất" khi định khoản lại (quyền settings:write, lý do, bằng chứng) | — | — |
| [S011-7](PHASE-011-MODULE-SDK/40-MASTER-CHECKLIST.md#L18) | PHASE-011 | Extension chạy thật: slot, hook, ctx.actions.call | — | — |
| [S013-3](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L21) | PHASE-013 | Đợt 1: quy → modules/quy/ (đường thử đầu tiên; phân định lõi / phân hệ, tương thích đường dẫn, dữ liệu) | — | — |
| [S013-4](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L22) | PHASE-013 | Đợt 2: tai-san, kho, ban-hang → modules/ (mã miền ở apps/api/src/modules/ cần phân định) | — | — |
| [S013-5](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L23) | PHASE-013 | Đợt 3: thue → modules/thue/ | — | — |
| [S013-6](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L24) | PHASE-013 | Đợt 4: ke-toan → modules/ke-toan/ | — | — |
| [S013-7](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L25) | PHASE-013 | Đợt 5: mua-hang → modules/mua-hang/ (người đóng góp giữ chỗ; bộ nạp 25 TH là bài kiểm trước / sau) | — | — |
| [S013-8](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L26) | PHASE-013 | Đợt 6: giao diện lõi (he-thong, api, danh-muc, dev) — đổi tên / dời khỏi phan-he/ theo Q1 của ADR | — | — |
| [S013-9](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L27) | PHASE-013 | Phép kiểm SC-MOD-4: không thêm tệp mới vào phan-he/ (ratchet); tiêu chí 3.9 đo bằng số tệp còn lại — cần chữ … | — | — |
| [S013-10](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L28) | PHASE-013 | G4: route dùng chung (LEDGER, GOODS) đăng ký ở lõi, route phân hệ trả về chủ (12-CHOT) | — | — |
| [S013-11](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L29) | PHASE-013 | G3: mẫu in khai qua printTemplates của module web, lõi web không import mẫu in phân hệ | — | — |
| [S013-12](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L30) | PHASE-013 | G5: web phân hệ không import trang lõi — openCoreScreen (danh sách đóng), bộ lọc dùng chung vào ui-kit | — | — |
| [S013-13](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L31) | PHASE-013 | G2: khung nhìn bizcityread cho kho, giá vốn, dòng bán, hoá đơn, đầu chứng từ (ADR-0026) | — | — |
| [S013-14](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L32) | PHASE-013 | Tài sản vào Kernel (phương án A): apps/api/src/modules/assets → Kernel, tai-san chỉ còn giao diện module — ch… | — | — |
| [S014-3](PHASE-014-CLI-TEMPLATE-CA-CHUAN/40-MASTER-CHECKLIST.md#L13) | PHASE-014 | Lane runtime CONF-RUN / CONF-UPG | — | — |
| [S014-6](PHASE-014-CLI-TEMPLATE-CA-CHUAN/40-MASTER-CHECKLIST.md#L16) | PHASE-014 | Standard 1.0.0 | — | — |
| [S015-1](PHASE-015-CELL-WORDPRESS/40-MASTER-CHECKLIST.md#L11) | PHASE-015 | adapters/cell: khoá 1API, bốn bước, PKCE | — | — |
| [S015-2](PHASE-015-CELL-WORDPRESS/40-MASTER-CHECKLIST.md#L12) | PHASE-015 | Cầu MCP /api/v1/cell/mcp, web chat, core.notify.send | — | — |
| [S015-4](PHASE-015-CELL-WORDPRESS/40-MASTER-CHECKLIST.md#L14) | PHASE-015 | adapters/wordpress + ledger-php-sdk | — | — |
| [S015-5](PHASE-015-CELL-WORDPRESS/40-MASTER-CHECKLIST.md#L15) | PHASE-015 | Dịch vụ AI qua Cell: đọc hoá đơn, gợi ý lý do | — | — |
| [S016-1](PHASE-016-TAI-LON-ADAPTER/40-MASTER-CHECKLIST.md#L11) | PHASE-016 | Hàng đợi trước định khoản (eventinbox), partition sổ cái theo năm | — | — |
| [S016-2](PHASE-016-TAI-LON-ADAPTER/40-MASTER-CHECKLIST.md#L12) | PHASE-016 | Benchmark tải có báo cáo | — | — |
| [S016-3](PHASE-016-TAI-LON-ADAPTER/40-MASTER-CHECKLIST.md#L13) | PHASE-016 | adapters/redis (đệm có huỷ theo phiên bản cấu hình, rate-limit) | — | — |
| [S016-4](PHASE-016-TAI-LON-ADAPTER/40-MASTER-CHECKLIST.md#L14) | PHASE-016 | adapters/nats chuyển tiếp outbox | — | — |
| [S016-5](PHASE-016-TAI-LON-ADAPTER/40-MASTER-CHECKLIST.md#L15) | PHASE-016 | adapters/oidc (Keycloak), Kong khi cần | — | — |
| [S016-6](PHASE-016-TAI-LON-ADAPTER/40-MASTER-CHECKLIST.md#L16) | PHASE-016 | Helm chart infrastructure/helm/ | — | — |
| [S017-1](PHASE-017-BETA-HE-SINH-THAI/40-MASTER-CHECKLIST.md#L11) | PHASE-017 | Module CRM do người ngoài viết chỉ bằng SDK | — | — |
| [S017-2](PHASE-017-BETA-HE-SINH-THAI/40-MASTER-CHECKLIST.md#L12) | PHASE-017 | Module kho tách khỏi lõi | — | — |
| [S017-3](PHASE-017-BETA-HE-SINH-THAI/40-MASTER-CHECKLIST.md#L13) | PHASE-017 | release.yml: cổng R-REL-4, tag ký, SBOM, kênh stable / LTS | — | — |
| [S017-4](PHASE-017-BETA-HE-SINH-THAI/40-MASTER-CHECKLIST.md#L14) | PHASE-017 | 2 developer ngoài nhóm cài và viết module | — | — |
| [S017-5](PHASE-017-BETA-HE-SINH-THAI/40-MASTER-CHECKLIST.md#L15) | PHASE-017 | Registry gói định khoản / module / kỹ năng có chữ ký | — | — |
| [S018-4](PHASE-018-GIAM-SAT-VAN-HANH/40-MASTER-CHECKLIST.md#L16) | PHASE-018 | Đo mốc trên máy chủ thật: p50/p95/p99, pool, bộ nhớ, 5xx, R-KER-9 (a)–(d) — ca T018-1 | P0 | — |
| [S020-7](PHASE-020-KIEM-CHUAN-PHAP-LY-VN/40-MASTER-CHECKLIST.md#L25) | PHASE-020 | Lane runtime: runner đọc rulepack / ca, chọn rulepack 4 bước (R-VNC-4), chạy ca kind: runtime qua cổng công k… | P0 | — |
| [S020-8](PHASE-020-KIEM-CHUAN-PHAP-LY-VN/40-MASTER-CHECKLIST.md#L26) | PHASE-020 | C01 golden: test C01.4 (cùng docKey hai đơn vị); chốt G4 (Q020-3); mọi ca C01 có bằng chứng — ca T020-4 | P0 | — |
| [S020-9](PHASE-020-KIEM-CHUAN-PHAP-LY-VN/40-MASTER-CHECKLIST.md#L27) | PHASE-020 | C08: ca runtime cho vai trò module / RBAC; C08.4, C08.6 chờ ADR-0011 (G3) — ca T020-5 | P0 | — |
| [S020-10](PHASE-020-KIEM-CHUAN-PHAP-LY-VN/40-MASTER-CHECKLIST.md#L28) | PHASE-020 | C02: fixture vàng TT99 (hệ thống tài khoản, chuyển chế độ); đề xuất năng lực năm tài chính / chế độ kế toán c… | P0 | — |
| [S020-12](PHASE-020-KIEM-CHUAN-PHAP-LY-VN/40-MASTER-CHECKLIST.md#L30) | PHASE-020 | CI gate: bước VN trong conformance.yml; FAIL / ERROR P0 chặn; evidence/; docs/compliance/RELEASE-CHECKLIST.md… | P0 | — |
| [S020-13](PHASE-020-KIEM-CHUAN-PHAP-LY-VN/40-MASTER-CHECKLIST.md#L31) | PHASE-020 | Adapter POS mẫu + tài liệu dev cộng đồng (xét packages/vn-conformance — D020-1) | P1 | — |
| [S020-14](PHASE-020-KIEM-CHUAN-PHAP-LY-VN/40-MASTER-CHECKLIST.md#L32) | PHASE-020 | report.html + trang chứng nhận plugin (nhãn D020-6) | P1 | — |
| [S021-17](PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/40-MASTER-CHECKLIST.md#L28) | PHASE-021 | Thực tập sinh thử thật trên dữ liệu demo (ba chứng từ hỏng mẫu), biên bản evidence/W3-<ngày>.md | P1 | — |
| [S021-21](PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/40-MASTER-CHECKLIST.md#L32) | PHASE-021 | Trang bài học đủ ví dụ sai / đúng / vì sao cho mọi mã; kế toán trưởng đọc lại câu chữ | P1 | — |
| [S022-10](PHASE-022-GIA-DINH-LOI-DANH-GIA-THEO-VAI/40-MASTER-CHECKLIST.md#L22) | PHASE-022 | Kiểm mới W2 đợt sau: TAXBOOKMATCH, MANUALSENSITIVE, COSTUNITSPIKE, YEARENDOPEN, DEBT, DEPOSITAGED, TRANSFERUN… | P1 | — |
| [S022-19](PHASE-022-GIA-DINH-LOI-DANH-GIA-THEO-VAI/40-MASTER-CHECKLIST.md#L31) | PHASE-022 | RV-R1-06: khay Mã tra cứu hiện nút "Cách khắc phục" (RemedyView) (nút bật / tắt + RemedyView compact dưới dòn… | P2 | — |
| [S022-20](PHASE-022-GIA-DINH-LOI-DANH-GIA-THEO-VAI/40-MASTER-CHECKLIST.md#L32) | PHASE-022 | RV-R1-06: ghi bước lỗi vào span OTel (bizcity.error.step trong TRACEATTRIBUTES + OBSERVABILITY §1.1) — chờ PH… | P3 | — |
| [S023-4](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L15) | PHASE-023 | Hợp đồng bizcityaccountcard@1 (docs/contracts/BIZCITY-ACCOUNT-CARD-v1.md + schema), packages/contracts/src/ac… | P0 | — |
| [S023-6](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L17) | PHASE-023 | Check SC-ACC-1 (DOCS): đủ trường, soDu khớp normalside gói nền, both có viSaoLuongTinh, trackpartner có viSao… | P0 | — |
| [S023-7](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L18) | PHASE-023 | Action đọc core.account.card (accounts:read; lớp 3 theo ledger:read): dư Nợ / dư Có tách theo đối tượng tại n… | P0 | — |
| [S023-8](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L19) | PHASE-023 | Web: thẻ ở ACC1 (ngăn phải), AccountPicker nhãn + một câu, form ACC1 giải thích ô lưỡng tính — ca T023-3 | P0 | — |
| [S023-9](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L20) | PHASE-023 | Sổ chi tiết tài khoản, cân đối phát sinh: dòng tóm tắt; tài khoản both hai cột dư theo đối tượng | P0 | — |
| [S023-10](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L21) | PHASE-023 | remedy.why (mở rộng bizcityremedy@1 1.1): khai ở validateLines (đối tượng, tổng hợp, ngừng dùng), ACCOUNTWRON… | P0 | — |
| [S023-11](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L22) | PHASE-023 | Chế độ học: khoá bizcity.ui.learningmode (registry, theo người dùng), chữ T xem trước bằng định khoản thử tro… | P1 | — |
| [S023-12](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L23) | PHASE-023 | Trang Học theo vai: 3 bài (thu ngân · kế toán viên · kế toán trưởng) trên tenant mẫu, chấm ngay; gợi ý theo b… | P1 | — |
| [S023-13](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L24) | PHASE-023 | 🟡 2026-11-02: danh mục luật ở packages/contracts/src/catalog-hint.ts (TS, máy đọc); còn tài liệu hợp đồng + … | P0 | — |
| [S023-18](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L29) | PHASE-023 | Ghi nhận cảnh báo hiện ở thẻ đối tượng / tài khoản và Bàn đánh giá vai kiểm soát; bizcitycatalogwarnacktotal{… | P1 | — |
| [S024-10](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L21) | PHASE-024 | kiem-nang-cap.sh: so tồn theo mã trước / sau nâng cấp; DG-ITEM-3 = 0 sau điền ngược — ca T024-6 | P0 | — |
| [S024-12](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L23) | PHASE-024 | Costing theo itemid; bizcitycosting; costingitemsunpriced | P1 | — |
| [S024-13](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L24) | PHASE-024 | Diagnostics DG-ITEM-1..5, STOCKLEDGERMATCH theo item, remedy; chặn khoá kỳ với 1 / 3 / 4 — ca T024-7 | P0 | — |
| [S024-14](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L25) | PHASE-024 | Ca giả định F24-ITEM- (danh mục PHASE-022, lane scenario): mã lạ, mã trùng hiệu lực, đổi mã có dòng sổ, gộp m… | P0 | — |
| [S024-15](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L26) | PHASE-024 | Số đo bizcityitem, bizcitypostingmapping, bizcitypostingdefaultgroupfallbacktotal, bizcityinventorynegativeit… | P0 | — |
| [S024-17](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L28) | PHASE-024 | Web: HT09 Quy định, thẻ mặt hàng (3 lớp), validator trong form + nhập Excel, đổi mã / gộp mã có xem trước, tr… | P0 | — |
| [S024-18](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L29) | PHASE-024 | Hướng dẫn: docs/huong-dan/mat-hang.md (mã có phiên bản, phân loại, gộp), quy-dinh-du-lieu-hang-hoa.md; docs/a… | P1 | — |
| [S024-20](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L31) | PHASE-024 | Hạng thay đổi 0–3 + Impact + Gate A (hạng 3): core.<entity>.impact, reclassify (mô phỏng → duyệt → kích hoạt)… | P0 | — |
| [S024-21](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L32) | PHASE-024 | Tài khoản: phiên bản hệ thống tài khoản + ánh xạ + chứng từ chuyển số dư (nối ADR-0013); báo cáo nhiều kỳ đọc… | P1 | — |
| [S024-22](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L33) | PHASE-024 | HT09 → "Quy định dữ liệu danh mục"; thẻ khách hàng / chi nhánh cùng khuôn; hộp thoại "Thay đổi" tự xếp hạng | P1 | — |
| [S024-24](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L35) | PHASE-024 | why + rule trong lỗi / remedy cho IN-ITEM-, DG-ITEM-, trigger bất biến; SC-FIX-2 | P0 | — |
| [S024-25](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L36) | PHASE-024 | Manifest conformsTo (bizcitymodule@1 1.5) bật ca chạy máy; module check in bảng tuân thủ; template starter có… | P0 | — |
| [S024-26](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L37) | PHASE-024 | HT09 cho CEO (hậu quả tiền, ai làm), hộp thoại "Thay đổi" tự xếp hạng, hướng dẫn 1 trang | P1 | — |
| [S024-30](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L41) | PHASE-024 | Số đo nháp / bể theo tuổi, alert, Bàn đánh giá | P1 | — |
| [S024-31](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L42) | PHASE-024 | MCP đọc core.findings.explain, core.intake.get, core.item.get | P1 | — |
| [S024-32](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L43) | PHASE-024 | UI theo bản mẫu hai-cong.html | P1 | — |
| [S025-5](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L10) | PHASE-025 | Bảng valuationlayers, valuationlayersources, costallocations (chỉ thêm, RLS, trigger) | P0 | — |
| [S025-6](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L11) | PHASE-025 | Engine bình quân ghi lớp bể + phân bổ; tổng phân bổ = giá vốn ghi sổ — ca T025-2 | P0 | — |
| [S025-7](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L12) | PHASE-025 | costingmethod trong postingpolicyversions; FIFO, bình quân liên hoàn, đích danh; phân bổ lại khi có phiếu ghi… | P1 | — |
| [S025-8](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L13) | PHASE-025 | documentlineid ổn định giữa phiên bản chứng từ (eventid, linekey); originallineid trên dòng trả / huỷ | P0 | — |
| [S025-9](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L14) | PHASE-025 | Cổng C trong bizcityfindings@1; mã CT-MD/INV/COST/REV/ACC/REC/PER/LIN- có vì sao, cách sửa, căn cứ | P0 | — |
| [S025-10](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L15) | PHASE-025 | Engine Gate C: theo sự kiện sau ghi sổ, theo kỳ (đêm / trước khoá); continuitychecks chỉ thêm — ca T025-4 | P0 | — |
| [S025-11](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L16) | PHASE-025 | Khoá kỳ đòi Gate C không còn mã chặn (R-CONT-6) — ca T025-5 | P0 | — |
| [S025-12](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L17) | PHASE-025 | SC-CONT-1: không có API / action ghi trạng thái "đạt" của mã CT- (R-CONT-7) | P1 | — |
| [S025-13](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L18) | PHASE-025 | Màn Dòng sự kiện của kỳ + checklist một sự kiện | P1 | — |
| [S025-14](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L19) | PHASE-025 | Màn Sẵn sàng khoá kỳ (6 điều kiện, thanh tiến độ, nút khoá kỳ có điều kiện) — ca T025-6 | P0 | — |
| [S025-15](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L20) | PHASE-025 | Bàn đánh giá: % giá vốn giải thích được, số sự kiện đạt; số đo bizcitycontinuity | P1 | — |
| [S025-16](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L23) | PHASE-025 | Hướng dẫn: "Hành trình mặt hàng", "Sẵn sàng khoá kỳ"; bài học từng mã CT- | P1 | — |
| [S025-17](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L21) | PHASE-025 | Mặc định bình quân gia quyền tháng cho mọi đơn vị: costingmethod = weightedperiod khi tạo đơn vị / chưa khai … | P1 | — |
| [S025-18](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L22) | PHASE-025 | Khoá kỳ đọc Gate C (20 §6): CT- vào runDiagnostics + close-checks; phân mức toàn vẹn (chặn trừ khi chấp nhận)… | P0 | — |
| [S026-5](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L16) | PHASE-026 | itemclasses.path + kiểm vòng; quan hệ cha–con có hiệu lực; báo cáo kho gom theo cấp bất kỳ — ca T026-G3 | P0 | — |
| [S026-6](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L23) | PHASE-026 | tenantgroups, thành viên + vai (ho / warehouse / store / legalentity), MST tỉnh; danh mục nhóm nhận về đơn vị… | P1 | — |
| [S026-7](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L24) | PHASE-026 | Cặp chứng từ liên đơn vị + intercompanyrefs; giá chuyển theo bên gửi; báo cáo nhóm loại trừ; mã CT-IC- — ca T… | P1 | — |
| [S026-8](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L17) | PHASE-026 | Nhóm hạch toán theo ngày; chartversions, accountmappings, phiếu chuyển số dư (ADR-0018) — ca T026-G6 | P0 | — |
| [S026-9](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L18) | PHASE-026 | Bốn lớp thay đổi ở Gate A (changeClass trong phản hồi validate / save); nháp cho đối tượng; lớp 3 bắt buộc xe… | P0 | — |
| [S026-12](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L21) | PHASE-026 | MasterDataFrame bốn thẻ, gắn vào form mặt hàng, đối tượng, tài khoản, chi nhánh, kho; trang Trung tâm dữ liệu… | P0 | — |
| [S026-13](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L25) | PHASE-026 | Truy vết đối tượng (/lineage/partners/:id) và tài khoản (/lineage/accounts/:code); thẻ Truy vết cho hai loại … | P1 | — |
| [S026-17](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L26) | PHASE-026 | Nhập Excel đối tượng (hiện chỉ có partners/upsert); mapping chính sách theo phạm vi nhóm | P1 | — |
| [S026-18](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L28) | PHASE-026 | Phân tích tác động hàng loạt (đổi cây nhóm, đổi chế độ); trợ lý AI hướng dẫn kế toán từ thư viện mã; bộ kiểm … | P2 | — |
| [S027-6](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L11) | PHASE-027 | Q027-1 giải thích theo vai + SC-ERR-2 | P1 | — |
| [S027-7](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L12) | PHASE-027 | Q027-2 sổ tay theo action bizcitysotay@1 + SC-SOTAY-1..5, làm thử mua-hang | P1 | — |
| [S027-8](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L13) | PHASE-027 | Q027-3 quy tắc cho skill | P2 | — |
| [S027-9](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L14) | PHASE-027 | Q027-4 cổng phát hành (CI xanh, bảo vệ main, SBOM) | P1 | — |
| [S028-11](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L20) | PHASE-028 | W6: S-5..S-n vào pillar VII tru-cot.json, SC-AUTH-01..12 | P1 | — |
| [S029-6](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L15) | PHASE-029 | Migration người sửa / lý do cho phiên bản sự việc; IN-DOC-REASON (warn) | P1 | — |
| [S029-7](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L16) | PHASE-029 | module check bắt module nộp sổ không qua W2a; DG-DOC- lane SQL | P1 | — |
| [S029-11](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L21) | PHASE-029 | Chứng từ documents + documentmeta (mô hình posts / postmeta), ctx.documents.transition, quan hệ có đóng hiệu … | P1 | — |
| [S029-12](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L22) | PHASE-029 | Xoá an toàn ở CSDL: thu hồi DELETE, hàm xoá đọc mdreferences, bỏ CASCADE, ngừng dùng cho bảng thiếu cột | P0 | — |
| [S029-14](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L24) | PHASE-029 | Kiểm đường ghi ngoài action mang tenant / actor / nguồn / correlation (ECP-02) | P2 | — |
| [S029-15](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L25) | PHASE-029 | Ánh xạ định danh ngoài, con trỏ đồng bộ, nhật ký từng lần kéo, đối chiếu theo cửa sổ | P1 | — |
| [S029-16](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L26) | PHASE-029 | Sổ KPI có phiên bản; dòng báo cáo tài chính thành định nghĩa có phiên bản | P2 | — |
| [S029-18](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L28) | PHASE-029 | Bảng điểm 17 trụ cột theo bằng chứng (signal, foundation), HT10 theo bốn nhóm | P0 | — |
| [S029-20](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L30) | PHASE-029 | Gộp đối tượng theo khuôn 0068 | P1 | — |
| [S029-21](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L31) | PHASE-029 | SDK: module đăng ký chẩn đoán / luật kiểm; manifest objects / fields / rules / diagnostics | P1 | — |
| [S029-22](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L32) | PHASE-029 | Khoá checksum migration 0034 → hiện tại; migrate.ts ghi checksum | P1 | — |
| [S029-24](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L34) | PHASE-029 | Mã hoá bí mật kết nối khi lưu; phân loại dữ liệu nhạy cảm | P1 | — |
| [S029-25](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L35) | PHASE-029 | Bật SoD ở luồng duyệt; duyệt phiếu Kernel kiểm người lập ≠ người duyệt; sửa bizcitydocument@1 §5.1 | P1 | — |
| [S029-27](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L37) | PHASE-029 | Báo cáo tài chính, cân đối phát sinh, tuổi nợ đi thẳng tới bút toán | P2 | — |
| [S029-28](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L41) | PHASE-029 | Khớp danh mục sự kiện với hợp đồng (module.enabled / disabled, sự kiện chưa phát); hạn idempotency vào regist… | P2 | — |
| [S030-10](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L17) | PHASE-030 | Ca chạy được apps/api/test/golden/T030-MH.test.ts (mua hàng đã có mã) + T030-CORE-1..6; chứng minh khuôn; dòn… | P0 | — |
| [S030-11](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L18) | PHASE-030 | Chuyển blueprint P0 về docs/nghiep-vu/ban-hang/, docs/nghiep-vu/kho/; cập nhật docs/nghiep-vu/08-mua-hang.md … | P0 | — |
| [S030-15](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L22) | PHASE-030 | Seed khoá tham số pháp lý VN vào vn-rulepacks (danh sách khoá + legalRef từ Erp-vn data/legalparams.xml, giá … | P1 | — |
| [S030-16](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L23) | PHASE-030 | Mở phase code từng module theo ADR-0024: modules/ban-hang, modules/kho (P0); modules/tam-ung, modules/ngan-ha… | — | — |
| [S030-17](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L24) | PHASE-030 | 70-REFLECT sau module đầu tiên: khuôn thiếu mục nào; ca nào không viết được bằng bất biến sổ | P2 | — |
| [S030-21](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L28) | PHASE-030 | Bộ chuẩn 17: luật R-MSTD-1..12 vào docs/rules/ + CANON §3; họ finding DOC-, PARAM-, <MODULE>- vào bizcityfind… | P0 | — |
| [S030-23](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L30) | PHASE-030 | Bỏ đảo thừa (19 §2): phiếu mua đã duyệt sửa qua bản điều chỉnh (không cancelIn), phiếu chi kèm giữ docKey, kh… | P0 | — |
| [S030-24](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L31) | PHASE-030 | Cổng nhận sự việc G1–G5: trước hết G5 (cùng phiên bản khác băm → CONFLICT có mã; force lưu bản cũ); trường so… | P0 | — |
| [S030-25](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L32) | PHASE-030 | Golden T030-DOC-1..9, T030-AUTH-1..5 (19 §5) | P1 | — |
| [S030-26](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L33) | PHASE-030 | Chẩn đoán tuyến nguồn → sổ DG-DOC-CHAIN-1..5 trên bảng sẵn có (19 §6) | P1 | — |
| [S030-29](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L36) | PHASE-030 | bizcityevidence@1 mở rộng = sổ cổng (21 §2): cột gates, source, basisused (migration ≥ 0076); ghi cả lần bị c… | P0 | — |
| [S030-33](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L40) | PHASE-030 | Golden T030-GATE-1..4 (21 §5) | P1 | — |
| [S030-34](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L41) | PHASE-030 | HT09 mở sang luật nhập chứng từ ENTRY- (điều kiện theo loại / lý do / nhóm tài khoản / bên; yêu cầu chiều phâ… | P1 | — |
| [S030-35](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L42) | PHASE-030 | Bộ chuyển đổi lfood-legal-params@1 (120 tham số Erp-vn, chủ dự án xuất 06/11) → vn-rulepacks; thuế suất GTGT … | P1 | — |
| [S030-53](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L62) | PHASE-030 | Gỡ dữ liệu thật khỏi bản phát hành (Q030-L5): db/seeds/ đối tượng, nhân viên, tài khoản ngân hàng, chi nhánh … | P0 | — |
| [S031-7](PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md#L16) | PHASE-031 | Đánh chỉ mục khoá ngưỡng duyệt (settingvalues, 16 §5) vào Registry với approval.levels@1, store: settings | P2 | — |
| [S031-11](PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md#L20) | PHASE-031 | Rule Contract purchase.@1 bọc engine.ts (không đổi kết quả; hồi quy mua hàng) | P1 | — |
| [S031-15](PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md#L24) | PHASE-031 | Rule Contract bán hàng sale.pricelist@1, sale.promo.discount@1, sale.promo.buyxgety@1, sale.creditlimit@1 cùn… | P0 | — |
| [S031-16](PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md#L25) | PHASE-031 | POS WP: tải chính sách, tính theo Rule Contract, gửi policyRefs; bỏ luật khuyến mại riêng của plugin (repo pl… | P1 | — |
| [S031-17](PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md#L26) | PHASE-031 | Rulepack policy cho Conformance Engine (§9 của 10), chỉ đọc | P1 | — |
| [S031-23](PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md#L32) | PHASE-031 | Làn policy của bizcitylineage@1 (0.4.0-draft) | P2 | — |
| [S031-32](PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md#L41) | PHASE-031 | RV-R1-04 phần dữ liệu cũ: đo bản retired có effectiveto NULL trên bản sao thật rồi quyết định đóng (§16 mục 6) | P2 | — |
| [S032-7](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L16) | PHASE-032 | Chữ chốt W1 (R-FLOW-2): migration lô (số bằng so-tiep-theo), minor bizcityledgerintake@1 (lotRef, originalLin… | P0 | — |
| [S032-8](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L17) | PHASE-032 | Migration inventorylots + inventorymovements.lotid / linekey / originallineref; lottracking ở phân loại mặt h… | P0 | — |
| [S032-9](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L18) | PHASE-032 | Cửa nạp: lotRef (tra / tạo lô), originalLineRef; IN-INV-010..013 + bài học loi-dau-vao/IN-INV-01x.md; khoá bi… | P0 | — |
| [S032-10](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L19) | PHASE-032 | Hook inventory.pickLots (FEFO / FIFO mặc định, exclude / prefer / minShelfDays) + POST /inventory/pick-lots +… | P0 | — |
| [S032-11](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L20) | PHASE-032 | Chữ chốt W2: khuôn valuationlayers, valuationlayersources, costallocations, costingruns; CostingResult; tham … | P0 | — |
| [S032-12](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L21) | PHASE-032 | Migration bốn bảng (chỉ thêm, trigger supersededby / journalentryid một lần, không cột account); SC-INV-1 / S… | P0 | — |
| [S032-13](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L22) | PHASE-032 | Engine bình quân tháng trên lớp (periodpool): hàm thuần packages/contracts/src/costing/average.ts; costing.ru… | P0 | — |
| [S032-14](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L23) | PHASE-032 | T032-P1 parity trên fixture + bản sao dữ liệu thật (ẩn danh): đơn giá 4 lẻ, giá trị xuất từng dòng, tồn cuối,… | P0 | — |
| [S032-15](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L24) | PHASE-032 | Rule Contract core.costing.method@1 (weightedaverageperiod · fifo · specificidentification; spec, vectors), đ… | P0 | — |
| [S032-16](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L25) | PHASE-032 | FIFO + đích danh trên lớp (receipt, lotid); hàm thuần fifo.ts, specific.ts; opening cho kỳ chuyển đổi | P0 | — |
| [S032-17](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L26) | PHASE-032 | Đảo chiều hoàn đúng phân bổ gốc (reversesallocationid, tỷ lệ số lượng, còn được trả); bán hàng gửi originalLi… | P0 | — |
| [S032-18](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L27) | PHASE-032 | Chuyển kho giữ giá trị (chuyển lớp), cặp chứng từ liên đơn vị + core.intercompany.pricing@1 — T032-G6, G7 | P1 | — |
| [S032-19](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L28) | PHASE-032 | stockcount docType (K-030-4) + core.inventory.count.snapshot; chênh → stockadjustment theo lý do; T032-G5 | P1 | — |
| [S032-20](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L29) | PHASE-032 | Cổng: CT-INV-001..004, DG-CLOSE-1 / 2; Sẵn sàng khoá kỳ đọc costingruns (R-INV-7), chấp nhận có lý do; đối so… | P0 | — |
| [S032-21](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L30) | PHASE-032 | Golden chặn phát hành T032-G8 (đổi SKU), T032-G9 (đổi phương pháp, kỳ chuyển đổi, trả hàng chéo năm) vào CI c… | P0 | — |
| [S032-22](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L31) | PHASE-032 | Lineage qua lớp: bizcitylineage@1 0.4.0 thêm nút lot, layer, allocation, run; CostExplain theo phương pháp; m… | P1 | — |
| [S032-23](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L32) | PHASE-032 | Màn Kho › Lô & hạn dùng; ô chọn lô trong @bizcity/ui-kit (gợi ý, lý do khác gợi ý, cảnh báo); POS dùng pick-l… | P1 | — |
| [S032-24](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L33) | PHASE-032 | Màn Tính giá vốn theo lần tính (lớp, phân bổ, mã kiểm, so sánh, settle); Sẵn sàng khoá kỳ phần giá vốn; hướng… | P1 | — |
| [S032-25](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L34) | PHASE-032 | Skill open-ketoan-standard C1 / C2 cập nhật trạng thái thật (FIFO ✅ khi W3 xong; lô ✅ khi W1); docs/core/ hướ… | P2 | — |
| [S032-26](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L35) | PHASE-032 | Sổ đăng ký phép kiểm một chỗ: mã PC-001..023, nhịp (ngày · tuần · kỳ), mức theo nhịp, remedy, chủ việc; ánh x… | P0 | — |
| [S032-28](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L37) | PHASE-032 | Khoá kỳ kéo theo mọi chi nhánh cùng nhóm tính giá (PC-015); không khoá lẻ một chi nhánh khi giá vốn là của nh… | P0 | — |
| [S032-29](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L38) | PHASE-032 | sourceDigest lúc kiểm, kiểm lại trong cùng giao dịch khoá (PC-021); đầu kỳ = snapshot cuối kỳ trước, mở lại k… | P0 | — |
| [S032-31](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L40) | PHASE-032 | Bảng điểm tuần: mỗi (tuần, kỳ, phạm vi) một bản chụp chỉ thêm từ diagnosticruns + đối chiếu (chỉ số §9 của 60… | P0 | — |
| [S032-32](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L41) | PHASE-032 | Chốt tuần (mềm): kế toán đánh dấu Đã xem tuần — mọi việc của tuần có người nhận hoặc lý do; không khoá dữ liệ… | P1 | — |
| [S032-33](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L42) | PHASE-032 | Bảng điểm tháng: tổng các tuần + phép kiểm chỉ chạy ở kỳ + kết quả khoá; lưu cùng nhật ký khoá làm hồ sơ bằng… | P1 | — |
| [S032-34](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L43) | PHASE-032 | Ma trận thời gian tiêu chí × tuần / tháng (60 §10): đọc bản chụp S032-31 / 33, mốc M0..M4 từ checklist; GET /… | P1 | — |
| [S032-37](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L46) | PHASE-032 | SDK defineCheck + extensions.checks của bizcitymodule@1 (R-DIAG-15) | P1 | — |
| [S032-38](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L47) | PHASE-032 | Bảng "trường cần để kiểm" theo loại chứng từ ở bizcityledgerintake@1; trạng thái "không kiểm được" trên bàn (… | P1 | — |

## Chờ đủ tín hiệu (60)

| Mã | Phase | Việc | Ưu tiên | Người giữ · nhánh |
|---|---|---|---|---|
| [S001-2](PHASE-001-CHOT-CHUAN/40-MASTER-CHECKLIST.md#L12) | PHASE-001 | CI ci.yml + conformance.yml | — | — |
| [S001-8](PHASE-001-CHOT-CHUAN/40-MASTER-CHECKLIST.md#L18) | PHASE-001 | Kiểm migration sạch + nâng cấp | — | — |
| [S002-3](PHASE-002-AUDIT-PHAN-LOP/40-MASTER-CHECKLIST.md#L13) | PHASE-002 | A-17..A-26 thành việc có người nhận (mỗi chỗ SC-MOD-2: action Core thay thế hay chuyển bảng về module) | — | — |
| [S003-14](PHASE-003-ACTION-BANG-CHUNG-MCP-DOC/40-MASTER-CHECKLIST.md#L24) | PHASE-003 | Prometheus + Grafana + cảnh báo | — | — |
| [S004-18](PHASE-004-MOT-CUA-GHI-SO/40-MASTER-CHECKLIST.md#L31) | PHASE-004 | Đo lệch tài khoản mặc định giữa resolveAccounts của mua hàng và AccountResolver của Kernel (8 vai trò, 25 tìn… | — | — |
| [S005-5](PHASE-005-CHINH-SACH-CO-PHIEN-BAN/40-MASTER-CHECKLIST.md#L17) | PHASE-005 | Màn Cấu hình định khoản: lịch sử bản, phát hành | — | — |
| [S008-2](PHASE-008-SAO-LUU-PITR/40-MASTER-CHECKLIST.md#L14) | PHASE-008 | Diễn tập PITR tới một thời điểm, đo RTO / RPO, biên bản ở docs/audits/ | — | — |
| [S008-3](PHASE-008-SAO-LUU-PITR/40-MASTER-CHECKLIST.md#L15) | PHASE-008 | Lịch kiểm khôi phục định kỳ (R-BAK) | — | — |
| [S011-2](PHASE-011-MODULE-SDK/40-MASTER-CHECKLIST.md#L13) | PHASE-011 | @bizcity/module-sdk: defineModule, ctx | — | — |
| [S011-4](PHASE-011-MODULE-SDK/40-MASTER-CHECKLIST.md#L15) | PHASE-011 | Registry quyền mở theo module, màn Phân quyền nhóm theo module | — | — |
| [S013-2](PHASE-013-UI-KIT-CHUYEN-MODULE/40-MASTER-CHECKLIST.md#L12) | PHASE-013 | Chuyển phan-he/ → modules/; SC-MOD-2 hết nợ | — | — |
| [S014-1](PHASE-014-CLI-TEMPLATE-CA-CHUAN/40-MASTER-CHECKLIST.md#L11) | PHASE-014 | @bizcity/cli: doctor, migrate, module new / check, events replay, evidence / ledger verify | — | — |
| [S014-7](PHASE-014-CLI-TEMPLATE-CA-CHUAN/40-MASTER-CHECKLIST.md#L17) | PHASE-014 | Thêm preset dịch vụ, sản xuất | — | — |
| [S014-9](PHASE-014-CLI-TEMPLATE-CA-CHUAN/40-MASTER-CHECKLIST.md#L20) | PHASE-014 | W2 Chỗ nạp module SDK phía web: modules/<key>/web/index.tsx (defineWebModule) → route, menu, quyền | — | — |
| [S020-11](PHASE-020-KIEM-CHUAN-PHAP-LY-VN/40-MASTER-CHECKLIST.md#L29) | PHASE-020 | C03 vat-vn + C04 einvoice-vn phạm vi hẹp: registry rà đến điều-khoản-điểm; mock nhà cung cấp hoá đơn; knownex… | P0 | — |
| [S020-17](PHASE-020-KIEM-CHUAN-PHAP-LY-VN/40-MASTER-CHECKLIST.md#L17) | PHASE-020 | selfcheck.mjs --certify: một lệnh ba cổng + tuân thủ VN (lib/certify.mjs, lib/runtime.mjs, profile.schema.jso… | P0 | — |
| [S021-4](PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/40-MASTER-CHECKLIST.md#L15) | PHASE-021 | Trả lời hai câu hỏi mở ở 10-HIEN-TRANG §3 (Kernel chặn ĐVT / mã hàng / kho? khoá theo ngày ở cửa nạp?) → chốt… | P0 | — |
| [S022-7](PHASE-022-GIA-DINH-LOI-DANH-GIA-THEO-VAI/40-MASTER-CHECKLIST.md#L19) | PHASE-022 | Giao diện dùng remedy: dải cảnh báo (PHASE-020), màn Toàn vẹn (PHASE-019), Trạm tiền kiểm (PHASE-021) hiện bư… | P1 | — |
| [S022-12](PHASE-022-GIA-DINH-LOI-DANH-GIA-THEO-VAI/40-MASTER-CHECKLIST.md#L24) | PHASE-022 | Bộ chạy apps/api/test/fault-scenarios.test.ts (inject → expect → fix → afterFix) + scenario-board.json + self… | P0 | — |
| [S022-15](PHASE-022-GIA-DINH-LOI-DANH-GIA-THEO-VAI/40-MASTER-CHECKLIST.md#L27) | PHASE-022 | Biên bản in (PDF) theo vai, kèm các lần xác nhận cảnh báo — ca T022-9 | P1 | — |
| [S022-16](PHASE-022-GIA-DINH-LOI-DANH-GIA-THEO-VAI/40-MASTER-CHECKLIST.md#L28) | PHASE-022 | Tài liệu dùng: trang hướng dẫn "Bàn đánh giá" + "Kiểm chuẩn" trong nút "? Hướng dẫn"; DIAGNOSTICS cột remedy | P1 | — |
| [S023-3](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L14) | PHASE-023 | Chủ duyệt D023-1..8, trả lời Q023-1..4 | P0 | — |
| [S023-14](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L25) | PHASE-023 | Action đọc core.<entity>.validate cho account, partner, reason, posting-group, payment-method, tax-code, ware… | P0 | — |
| [S023-15](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L26) | PHASE-023 | Web <WhyPanel> + <SaveWithWarnings> (ghi nhận lý do → catalog.warn.ack); gắn 8 màn; nhập Excel cột "Vì sao" —… | P0 | — |
| [S023-16](PHASE-023-THE-TAI-KHOAN/40-MASTER-CHECKLIST.md#L27) | PHASE-023 | Danh mục luật khởi đầu 20 §4 (~40), kế toán trưởng duyệt phần kế toán; số đo bizcitycatalogwarnacktotal{code} | P0 | — |
| [S024-4](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L15) | PHASE-024 | Hợp đồng bizcityitemmaster@1 (docs/contracts/BIZCITY-ITEM-MASTER-v1.md + schema), packages/contracts/src/item… | P0 | — |
| [S024-5](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L16) | PHASE-024 | Migration: items, itemcodes (chỉ thêm), itemclassification (theo ngày), RLS; điền từ products (song song, pro… | P0 | — |
| [S024-6](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L17) | PHASE-024 | Item Resolver (kernel/masterdata/item-resolver.ts) + đệm theo phiên bản danh mục + span intake.item.resolve —… | P0 | — |
| [S024-7](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L18) | PHASE-024 | Trạm tiền kiểm L3: IN-ITEM-001..008 + remedy; bỏ ensureProducts, khoá bizcity.item.autocreate (registry setti… | P0 | — |
| [S024-28](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L39) | PHASE-024 | Trạng thái draft / active / retired cho items, partners; "Lưu nháp" khi còn ✘; nháp không vào ô chọn / báo cáo | P0 | — |
| [S025-1](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L6) | PHASE-025 | ADR-0021, RULE-CONTINUITY (R-CONT-0..9), CANON §0.1 ba trụ cột | P0 | — |
| [S025-2](PHASE-025-ACCOUNTING-CONTINUITY/40-MASTER-CHECKLIST.md#L7) | PHASE-025 | Tài liệu phase 00 / 10 / 20 / 30, bản mẫu mockups/continuity.html | P0 | — |
| [S026-1](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L6) | PHASE-026 | ADR-0022, CANON §0.2 (nền móng + tám trụ cột), tài liệu phase 00 / 10 / 20 / 30, bản mẫu | P0 | — |
| [S026-2](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L8) | PHASE-026 | Golden Tests T026-G1..G7 có tên, chạy như một cổng (kiem-chuan.sh), thất bại chặn phát hành | P0 | — |
| [S026-4](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L10) | PHASE-026 | entitycodes cho đối tượng / chi nhánh / kho / đơn vị tính / lý do; guard chỉ thêm, chặn chồng; trigger đồng b… | P0 | — |
| [S026-10](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L19) | PHASE-026 | API GET /api/v1/master-data/:type/:id/history; thẻ Lịch sử | P0 | — |
| [S026-11](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L20) | PHASE-026 | Chỉ mục tham chiếu mdreferences + GET …/impact; thẻ Tác động + xem trước khi đổi mã / nhóm / ngừng | P0 | — |
| [S026-14](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L27) | PHASE-026 | Benchmark 1.000.000 mặt hàng × 300 chi nhánh; đồng bộ theo câu lệnh cho đường nạp lô; EXCLUDE USING gist; số … | P2 | — |
| [S026-15](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L22) | PHASE-026 | SC-PILLAR-1: tiêu chí dat phải có bằng chứng tồn tại (tệp test / check / migration); engine ghi source = chec… | P1 | — |
| [S028-6](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L15) | PHASE-028 | W1: userroleassignments (0073) , quyền hiệu lực = vai trò chính ∪ vai trò bổ sung, ADMINROLES, action gán / t… | P0 | — |
| [S028-7](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L16) | PHASE-028 | W2: ~~modulegrants~~ vai trò của đơn vị (tenantroles, tenantrolerules, 0075) + lớp đọc loadAuthzSnapshot — ch… | P0 | — |
| [S028-8](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L17) | PHASE-028 | W3 đợt 2: khoá danh sách 17 route ghi thô (SC-AUTH-03), shadow core/authz, requireScope() — chữ chốt ADR-0027… | P1 | — |
| [S028-9](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L18) | PHASE-028 | W4: Role Editor UI — module modules/phan-quyen/, mã màn HT12 (Q028-1 chốt), ma trận quyền × vai trò — chữ chố… | P1 | — |
| [S029-9](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L18) | PHASE-029 | ADR-0028, R-ECP (ECP-01..13), trang nền móng 17 trụ cột, danh sách dữ liệu gốc, đánh giá 20, lộ trình 30; CAN… | P0 | — |
| [S029-19](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L29) | PHASE-029 | Thuộc tính có hiệu lực (tên, MST, địa chỉ) cho đối tượng / chi nhánh / kho; ảnh chụp tên đối tượng trên dòng … | P0 | — |
| [S029-31](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L40) | PHASE-029 | Bản mẫu ma trận kiểm chuẩn + nen-mong.json (bizcityfoundations@1 0.1.0-draft); sáu lõi + LEAN-1..7 vào ADR-00… | P0 | — |
| [S030-2](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L9) | PHASE-030 | Mockup mockups/thu-vien-nghiep-vu.html — trang Thư viện nghiệp vụ là màn đầu tiên (chủ dự án duyệt hướng 2026… | P0 | — |
| [S030-9](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L16) | PHASE-030 | Khuôn golden test 60 + danh sách 73 ca; nhóm Lõi duyệt khuôn | P0 | — |
| [S030-18](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L25) | PHASE-030 | Kinh nghiệm cốt lõi 15: phân tầng 20 cơ chế, STD-030-1..12, K-030-7..12, P-030-1..8, phản mẫu A1–A12; nhóm Lõ… | P0 | — |
| [S030-30](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L37) | PHASE-030 | Q030-5 = B: bản niêm phong của bằng chứng. S030-30a ✅ ADR-0030 + bizcityevidence@1 1.2.0-draft (STD-EVD-4 có … | P1 | — |
| [S030-32](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L39) | PHASE-030 | Màn HT11 Bàn điều hành chứng từ & cổng (6 khối, lọc, đi sâu, tab Cổng ở chứng từ) — bản mẫu #cong | P1 | — |
| [S030-41](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L49) | PHASE-030 | Mọi bút toán có chứng từ gốc 25: ledgerentries.eventid NOT NULL (migration an toàn + kiểu + post() từ chối), … | P0 | — |
| [S031-19](PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md#L28) | PHASE-031 | nen-mong.json / NEN-MONG-DOANH-NGHIEP.md: trụ cột 05 hai nửa, tín hiệu nửa Policy; tru-cot.json V theo Q031-1 | P1 | — |
| [S032-4](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L13) | PHASE-032 | Hướng dẫn tính giá vốn (docs/huong-dan/tinh-gia-von.md), căn cứ (can-cu/04), nghiệp vụ (11) thêm mục Kiến trú… | P1 | — |
| [S032-6](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L15) | PHASE-032 | Kế toán trưởng trả Q032-1 (phạm vi nhóm tính giá), Q032-5 (hoàn không có gốc); nhóm Lõi trả Q032-2 (nhịp FIFO… | P0 | — |
| [S032-27](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L36) | PHASE-032 | Hộp việc hằng ngày: chạy chẩn đoán L3 hiện có lúc 01:00 (bizcity.clock.daily, cạnh kiểm chuẩn đêm), lưu lượt,… | P0 | — |
| [S032-30](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L39) | PHASE-032 | Mức HARD hẹp / REVIEW có lý do gắn sourceDigest theo 60 §6; sửa R-DIAG-4 cho nhóm HARD — sau khi chủ dự án tr… | P0 | — |
| [S032-35](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L44) | PHASE-032 | Trường mới của DiagCheck (closeRef, cadence, stage, severityAtClose, owner, scopeBy); gắn closeRef cho mọi ch… | P0 | — |
| [S032-36](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L45) | PHASE-032 | Khoá thử hôm nay đủ năm bước (R-DIAG-14): periods/check + giá vốn tính tạm + closing/preview + kiểm sau kết c… | P0 | — |
| [S032-39](PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/40-MASTER-CHECKLIST.md#L48) | PHASE-032 | Bàn làm việc kế toán năm thẻ từ HT08 (Việc hôm nay · Khoá thử hôm nay · Kết quả từng tuần, tháng · Sổ theo dõ… | P1 | — |

## Hoãn (3)

| Mã | Phase | Việc | Ưu tiên | Người giữ · nhánh |
|---|---|---|---|---|
| [S004-15b](PHASE-004-MOT-CUA-GHI-SO/40-MASTER-CHECKLIST.md#L28) | PHASE-004 | Cảnh báo (phần 2): số đo bizcityledgerheadereditunattributedtotal + luật cảnh báo alerts.yml; D004-13. K1 | — | — |
| [S019-19](PHASE-019-BAN-DIEU-TRA-NHA-PHAT-TRIEN/40-MASTER-CHECKLIST.md#L28) | PHASE-019 | Công cụ MCP chỉ đọc cho máy dev — agent tự tra trace (D019-8 (2)) | P3 | — |
| [S029-34](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L43) | PHASE-029 | RV-R1-08: cửa nạp từ chối cùng phiên bản khác nội dung (409 CONFLICT + VERSIONCONTENTMISMATCH); force kèm lý … | P1 | — |

## Xong (278)

Chỉ đếm; xem từng việc ở checklist của phase.
