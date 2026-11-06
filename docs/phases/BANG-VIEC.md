# Bảng việc
<!-- [2026-11-03 11:52 PM Johnny Chu - Chu Hoàng Anh] FLOW — tệp sinh (R-FLOW-8): node scripts/bang-viec.mjs --write; không sửa tay -->

> **Tệp sinh tự động** từ `docs/phases/*/40-MASTER-CHECKLIST.md` và [CLAIMS.md](CLAIMS.md) — **không sửa tay**. Đổi trạng thái: sửa checklist / CLAIMS rồi chạy `node scripts/bang-viec.mjs --write` trong cùng PR (SC-FLOW-3). Luật: [R-FLOW-8](../rules/RULE-FLOW.md). Màn kanban chỉ đọc: GitHub Pages của repo.

| Cột | Số việc |
|---|---|
| Đang làm | 17 |
| Chờ merge | 0 |
| Bị chặn | 32 |
| Chưa ai nhận | 127 |
| Chờ đủ tín hiệu | 48 |
| Hoãn | 1 |
| Xong | 214 |
| **Tổng** | **439** |

## Đang làm (17)

| Mã | Phase | Việc | Ưu tiên | Người giữ · nhánh |
|---|---|---|---|---|
| [S014-14](PHASE-014-CLI-TEMPLATE-CA-CHUAN/40-MASTER-CHECKLIST.md#L25) | PHASE-014 | FLOW-2 Bảng việc sinh từ main (R-FLOW-8): cột Việc ở CLAIMS.md, scripts/bang-viec.mjs, BANG-VIEC.md + bang-vi… | — | hoanganh8389 (phiên Claude, core-ke-toan) · `feat/flow-2-bang-viec` |
| [S014-15](PHASE-014-CLI-TEMPLATE-CA-CHUAN/40-MASTER-CHECKLIST.md#L26) | PHASE-014 | W6 đợt 8b Nhật ký nghiệp vụ trong action (ACTION 1.3.0 §4.4, phương án C, đã chốt): sổ AUDITKEEP, bối cảnh ac… | — | hoanganh8389 (phiên Claude, audit-in-action) · `feat/phase-014-audit-in-action` |
| [S018-21](PHASE-018-GIAM-SAT-VAN-HANH/40-MASTER-CHECKLIST.md#L38) | PHASE-018 | Giám sát (Loki, Tempo, Prometheus, Grafana) BẬT MẶC ĐỊNH ở bản cài Docker: include: trong docker-compose.yml,… | P1 | hoanganh8389 (phiên Claude, PHASE-026 MDG) · `feat/phase-018-giam-sat-mac-dinh` |
| [S024-11](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L22) | PHASE-024 | Action core.item.upsert / add-code / retire-code / classify / merge-preview / merge / validate / trace; core.… | P0 | Nguyễn Văn Thủy (phiên Claude, xương cá) · `feat/xuong-ca-dinh-danh` |
| [S024-16](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L27) | PHASE-024 | SC-ITEM-1..3 + ca tự kiểm fixtures/repo-bad | P0 | hoanganh8389 (phiên Claude, core-ke-toan) · `feat/phase-024-s024-16-sc-item` |
| [S024-33](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/40-MASTER-CHECKLIST.md#L44) | PHASE-024 | Bỏ suy tài khoản kho từ tiền tố ở packages/kernel/src/modules/posting/rules/stock.rule.ts:55 (startsWith('15'… | P0 | hoanganh8389 (phiên Claude, danh-gia-phase) · `feat/phase-024-s024-33-tk-kho` |
| [S026-4](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L10) | PHASE-026 | entitycodes cho đối tượng / chi nhánh / kho / đơn vị tính / lý do; guard chỉ thêm, chặn chồng; trigger đồng b… | P0 | hoanganh8389 (phiên Claude, PHASE-026 MDG) · `feat/phase-026-p0-dot3` |
| [S026-5](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L16) | PHASE-026 | itemclasses.path + kiểm vòng; quan hệ cha–con có hiệu lực; báo cáo kho gom theo cấp bất kỳ — ca T026-G3 | P0 | hoanganh8389 (phiên Claude, PHASE-026 MDG) · `feat/phase-026-p0-dot2` |
| [S026-15](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L22) | PHASE-026 | SC-PILLAR-1: tiêu chí dat phải có bằng chứng tồn tại (tệp test / check / migration); engine ghi source = chec… | P1 | hoanganh8389 (phiên Claude, PHASE-026 MDG) · `feat/phase-026-p0-dot2` |
| [S026-19](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L11) | PHASE-026 | Migration 0068: mergedintoitemid gộp nhiều lần, bizcityitemroot / bizcityitemfamily, itemid trên bảng cấu hìn… | P0 | Nguyễn Văn Thủy (phiên Claude, xương cá) · `feat/xuong-ca-dinh-danh` |
| [S026-20](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L12) | PHASE-026 | Cửa nạp và đường tạo mặt hàng không đứt chuỗi khi gặp mã cũ / mã đã gộp; chặn dùng lại mã của hàng còn sống | P0 | Nguyễn Văn Thủy (phiên Claude, xương cá) · `feat/xuong-ca-dinh-danh` |
| [S026-21](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L13) | PHASE-026 | Báo cáo và truy vấn lịch sử (mua hàng, kho, bán hàng) gom theo itemid, lọc riêng theo mã | P0 | Nguyễn Văn Thủy (phiên Claude, xương cá) · `feat/xuong-ca-dinh-danh` |
| [S026-22](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L14) | PHASE-026 | Hợp đồng hệ ngoài: itemId, mergedIntoItemId ở nguồn đổi danh mục, mã external:<nguồn> | P0 | Nguyễn Văn Thủy (phiên Claude, xương cá) · `feat/xuong-ca-dinh-danh` |
| [S026-23](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L15) | PHASE-026 | Giao diện Đổi mã, Gộp mã, Lịch sử trên form mặt hàng | P0 | Nguyễn Văn Thủy (phiên Claude, xương cá) · `feat/xuong-ca-dinh-danh` |
| [S027-4](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L9) | PHASE-027 | CK-3 SC-SEC-5; bỏ mật khẩu mặc định của công cụ dữ liệu mẫu (PURCHASESEEDPASSWORD) | P0 | hoanganh8389 (phiên Claude, core-ke-toan) · `feat/core-ke-toan-ck3` |
| [S028-7](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L16) | PHASE-028 | W2: ~~modulegrants~~ vai trò của đơn vị (tenantroles, tenantrolerules, 0075) + lớp đọc loadAuthzSnapshot — ch… | P0 | hoanganh8389 (phiên Claude, PHASE-028 authz) · `feat/phase-028-w2-api-vai-tro` |
| [S029-13](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L23) | PHASE-029 | Sổ đăng ký đối chiếu đợt 1 (chữ chốt 30 §6): VATINPUTINVOICEMATCH, LEDGERROUNDING, ITEMCODECASEDUP, UNITBASEI… | P1 | hoanganh8389 (phiên Claude, PHASE-029 đối chiếu) · `feat/phase-029-e6-doi-chieu` |

## Chờ merge (0)

—

## Bị chặn (32)

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
| [S029-6](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L15) | PHASE-029 | Migration người sửa / lý do cho phiên bản sự việc; IN-DOC-REASON (warn) | P1 | — |
| [S029-8](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L17) | PHASE-029 | Nâng chẩn đoán lên error khi bản đo trên bản cài thật = 0 | P2 | — |
| [S029-12](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L22) | PHASE-029 | Xoá an toàn ở CSDL: thu hồi DELETE, hàm xoá đọc mdreferences, bỏ CASCADE, ngừng dùng cho bảng thiếu cột | P0 | — |
| [S029-17](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L27) | PHASE-029 | Trigger kỳ khoá trên ledgerentries | P0 | — |
| [S029-18](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L28) | PHASE-029 | Bảng điểm 17 trụ cột theo bằng chứng (signal, foundation), HT10 theo bốn nhóm | P0 | — |
| [S029-19](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L29) | PHASE-029 | Thuộc tính có hiệu lực (tên, MST, địa chỉ) cho đối tượng / chi nhánh / kho; ảnh chụp tên đối tượng trên dòng … | P0 | — |
| [S029-20](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L30) | PHASE-029 | Gộp đối tượng theo khuôn 0068 | P1 | — |
| [S029-23](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L33) | PHASE-029 | Người / nhân viên tách người dùng | P2 | — |
| [S029-26](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L36) | PHASE-029 | Quan hệ người dùng ↔ nhân viên trong báo cáo bán hàng / KPI | P2 | — |
| [S029-32](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L20) | PHASE-029 | Cấu hình đợt 2: route ghi riêng → setSetting; valueType cho module; chặn đọc thô tenants.settings; xuất / nhậ… | P1 | — |
| [S030-12](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L19) | PHASE-030 | Kế toán trưởng trả Q030-3 (ngân sách), xác nhận công thức TS03 theo ngày, lương – BH – TNCN và giá trị tham s… | P0 | — |
| [S030-13](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L20) | PHASE-030 | Nhóm Lõi trả Q030-2 (lô ở Kernel), xếp K-030-1..6 vào phase Kernel; golden vào bizcitymodule@1 (PR chốt thiết… | P0 | — |
| [S030-14](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L21) | PHASE-030 | Chủ dự án trả Q030-1 (nhân sự một hay ba module), Q030-4 (giao hàng tách) | P1 | — |
| [S030-20](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L27) | PHASE-030 | Chuẩn chứng từ 16: nhóm Lõi duyệt bizcitydocument@1 1.4.0-draft (defineDocument, hai con trỏ, policy, locks, … | P0 | — |
| [S030-27](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L34) | PHASE-030 | Theo dõi cầu nối Workflow ↔ PHASE-028 (19 §3): PHASE-028 nhận authorize trên tài nguyên chứng từ + điều kiện … | P1 | — |
| [S030-28](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L35) | PHASE-030 | bizcityaction@1 1.4.0: các bước §4 là cổng, kiểu GateResult trong packages/contracts, error.details.gates, ct… | P0 | — |
| [S030-38](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L45) | PHASE-030 | bizcitysettings@1 1.2.0: registry thêm basis, usedBy; settingvalues thêm basis (24 §5) — PR chốt thiết kế; kh… | P0 | — |

## Chưa ai nhận (127)

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
| [S026-6](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L23) | PHASE-026 | tenantgroups, thành viên + vai (ho / warehouse / store / legalentity), MST tỉnh; danh mục nhóm nhận về đơn vị… | P1 | — |
| [S026-7](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L24) | PHASE-026 | Cặp chứng từ liên đơn vị + intercompanyrefs; giá chuyển theo bên gửi; báo cáo nhóm loại trừ; mã CT-IC- — ca T… | P1 | — |
| [S026-8](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L17) | PHASE-026 | Nhóm hạch toán theo ngày; chartversions, accountmappings, phiếu chuyển số dư (ADR-0018) — ca T026-G6 | P0 | — |
| [S026-9](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L18) | PHASE-026 | Bốn lớp thay đổi ở Gate A (changeClass trong phản hồi validate / save); nháp cho đối tượng; lớp 3 bắt buộc xe… | P0 | — |
| [S026-12](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L21) | PHASE-026 | MasterDataFrame bốn thẻ, gắn vào form mặt hàng, đối tượng, tài khoản, chi nhánh, kho; trang Trung tâm dữ liệu… | P0 | — |
| [S026-13](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L25) | PHASE-026 | Truy vết đối tượng (/lineage/partners/:id) và tài khoản (/lineage/accounts/:code); thẻ Truy vết cho hai loại … | P1 | — |
| [S026-17](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L26) | PHASE-026 | Nhập Excel đối tượng (hiện chỉ có partners/upsert); mapping chính sách theo phạm vi nhóm | P1 | — |
| [S026-18](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L28) | PHASE-026 | Phân tích tác động hàng loạt (đổi cây nhóm, đổi chế độ); trợ lý AI hướng dẫn kế toán từ thư viện mã; bộ kiểm … | P2 | — |
| [S027-5](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L10) | PHASE-027 | Q027-5 SEEDADMINPASSWORD | P1 | — |
| [S027-6](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L11) | PHASE-027 | Q027-1 giải thích theo vai + SC-ERR-2 | P1 | — |
| [S027-7](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L12) | PHASE-027 | Q027-2 sổ tay theo action bizcitysotay@1 + SC-SOTAY-1..5, làm thử mua-hang | P1 | — |
| [S027-8](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L13) | PHASE-027 | Q027-3 quy tắc cho skill | P2 | — |
| [S027-9](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L14) | PHASE-027 | Q027-4 cổng phát hành (CI xanh, bảo vệ main, SBOM) | P1 | — |
| [S028-8](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L17) | PHASE-028 | W3: đóng 17 route ghi thô còn lại, requireScope() | P1 | — |
| [S028-9](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L18) | PHASE-028 | W4: Role Editor UI (mã màn — Q028-1) | P1 | — |
| [S028-10](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L19) | PHASE-028 | W5: TGS mapping 349 mã + luồng mẫu Warehouse transfer | P1 | — |
| [S028-11](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L20) | PHASE-028 | W6: S-5..S-n vào pillar VII tru-cot.json, SC-AUTH-01..12 | P1 | — |
| [S029-7](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L16) | PHASE-029 | module check bắt module nộp sổ không qua W2a; DG-DOC- lane SQL | P1 | — |
| [S029-11](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L21) | PHASE-029 | Chứng từ documents + documentmeta (mô hình posts / postmeta), ctx.documents.transition, quan hệ có đóng hiệu … | P1 | — |
| [S029-14](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L24) | PHASE-029 | Kiểm đường ghi ngoài action mang tenant / actor / nguồn / correlation (ECP-02) | P2 | — |
| [S029-15](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L25) | PHASE-029 | Ánh xạ định danh ngoài, con trỏ đồng bộ, nhật ký từng lần kéo, đối chiếu theo cửa sổ | P1 | — |
| [S029-16](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L26) | PHASE-029 | Sổ KPI có phiên bản; dòng báo cáo tài chính thành định nghĩa có phiên bản | P2 | — |
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
| [S030-39](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L46) | PHASE-030 | Màn HT13 bản chỉ đọc: registry + giá trị đang hiệu lực + phiên bản + bằng chứng + sức khoẻ cấu hình, trên dữ … | P1 | — |
| [S030-40](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L47) | PHASE-030 | Đổi khoá loại A một người: lý do bắt buộc, xem trước tác động (không chặn), chặn kỳ đã khoá, thẻ "đã đổi tron… | P1 | — |

## Chờ đủ tín hiệu (48)

| Mã | Phase | Việc | Ưu tiên | Người giữ · nhánh |
|---|---|---|---|---|
| [S001-2](PHASE-001-CHOT-CHUAN/40-MASTER-CHECKLIST.md#L12) | PHASE-001 | CI ci.yml + conformance.yml | — | — |
| [S001-8](PHASE-001-CHOT-CHUAN/40-MASTER-CHECKLIST.md#L18) | PHASE-001 | Kiểm migration sạch + nâng cấp | — | — |
| [S002-3](PHASE-002-AUDIT-PHAN-LOP/40-MASTER-CHECKLIST.md#L13) | PHASE-002 | A-17..A-26 thành việc có người nhận (mỗi chỗ SC-MOD-2: action Core thay thế hay chuyển bảng về module) | — | — |
| [S003-14](PHASE-003-ACTION-BANG-CHUNG-MCP-DOC/40-MASTER-CHECKLIST.md#L24) | PHASE-003 | Prometheus + Grafana + cảnh báo | — | — |
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
| [S026-10](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L19) | PHASE-026 | API GET /api/v1/master-data/:type/:id/history; thẻ Lịch sử | P0 | — |
| [S026-11](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L20) | PHASE-026 | Chỉ mục tham chiếu mdreferences + GET …/impact; thẻ Tác động + xem trước khi đổi mã / nhóm / ngừng | P0 | — |
| [S026-14](PHASE-026-MASTER-DATA-GOVERNANCE/40-MASTER-CHECKLIST.md#L27) | PHASE-026 | Benchmark 1.000.000 mặt hàng × 300 chi nhánh; đồng bộ theo câu lệnh cho đường nạp lô; EXCLUDE USING gist; số … | P2 | — |
| [S027-1](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L6) | PHASE-027 | Tài liệu W0: README, 00, checklist; ADR-0023; dòng phase ở docs/phases/README.md | P0 | — |
| [S027-2](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L7) | PHASE-027 | CK-1 công cụ kiểm (§6 của 00): event check, flow check [--to], explain, module accounting-check (AC-1..6), sk… | P0 | — |
| [S027-3](PHASE-027-CORE-KE-TOAN-CHO-DEV/40-MASTER-CHECKLIST.md#L8) | PHASE-027 | CK-2 SC-DOC-4 (đường dẫn), SC-DOC-5 (route), SC-DOC-6 (mục menu có hướng dẫn, nợ cũ vào baseline) — thiết kế … | P1 | — |
| [S028-6](PHASE-028-CORE-AUTHORIZATION-PLUGIN-ROLE-EDITOR/40-MASTER-CHECKLIST.md#L15) | PHASE-028 | W1: userroleassignments (0073) , quyền hiệu lực = vai trò chính ∪ vai trò bổ sung, ADMINROLES, action gán / t… | P0 | — |
| [S029-9](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L18) | PHASE-029 | ADR-0028, R-ECP (ECP-01..13), trang nền móng 17 trụ cột, danh sách dữ liệu gốc, đánh giá 20, lộ trình 30; CAN… | P0 | — |
| [S029-10](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L19) | PHASE-029 | Cấu hình đợt 1 theo mô hình options (chữ chốt 30 §5): settingvalues chỉ thêm, phạm vi user → branch → account… | P0 | — |
| [S029-31](PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/40-MASTER-CHECKLIST.md#L40) | PHASE-029 | Bản mẫu ma trận kiểm chuẩn + nen-mong.json (bizcityfoundations@1 0.1.0-draft); sáu lõi + LEAN-1..7 vào ADR-00… | P0 | — |
| [S030-2](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L9) | PHASE-030 | Mockup mockups/thu-vien-nghiep-vu.html — trang Thư viện nghiệp vụ là màn đầu tiên (chủ dự án duyệt hướng 2026… | P0 | — |
| [S030-9](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L16) | PHASE-030 | Khuôn golden test 60 + danh sách 73 ca; nhóm Lõi duyệt khuôn | P0 | — |
| [S030-18](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L25) | PHASE-030 | Kinh nghiệm cốt lõi 15: phân tầng 20 cơ chế, STD-030-1..12, K-030-7..12, P-030-1..8, phản mẫu A1–A12; nhóm Lõ… | P0 | — |
| [S030-30](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L37) | PHASE-030 | Q030-5 = B: bản niêm phong của bằng chứng. S030-30a ✅ ADR-0030 + bizcityevidence@1 1.2.0-draft (STD-EVD-4 có … | P1 | — |
| [S030-32](PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/40-MASTER-CHECKLIST.md#L39) | PHASE-030 | Màn HT11 Bàn điều hành chứng từ & cổng (6 khối, lọc, đi sâu, tab Cổng ở chứng từ) — bản mẫu #cong | P1 | — |

## Hoãn (1)

| Mã | Phase | Việc | Ưu tiên | Người giữ · nhánh |
|---|---|---|---|---|
| [S019-19](PHASE-019-BAN-DIEU-TRA-NHA-PHAT-TRIEN/40-MASTER-CHECKLIST.md#L28) | PHASE-019 | Công cụ MCP chỉ đọc cho máy dev — agent tự tra trace (D019-8 (2)) | P3 | — |

## Xong (214)

Chỉ đếm; xem từng việc ở checklist của phase.
