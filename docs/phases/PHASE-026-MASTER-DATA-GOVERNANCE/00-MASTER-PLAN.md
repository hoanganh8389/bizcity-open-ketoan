# PHASE-026 · 00 — Kế hoạch: Quản trị dữ liệu gốc là nền móng
<!-- [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — kế hoạch tổng: nền móng + ba bảo đảm, nguyên tắc ↔ luật, D026-1..8, đợt P0 / P1 / P2, Golden Tests -->

## 1. Quan điểm kiến trúc (chủ dự án chốt)

> Master Data Governance phải là **nền móng** của Open Kế Toán, còn Accounting Continuity & Lineage là **cam kết** mà toàn bộ Framework phải bảo vệ. Không phải xây thật nhiều menu Danh mục, mà là thiết lập **một lần** hệ thống định danh và các nguyên tắc đúng.

Ba điều phải bảo đảm:

| # | Bảo đảm | Nghĩa | Hôm nay |
|---|---|---|---|
| B1 | **Identity Continuity** | mỗi hàng hoá, khách hàng, kho, chi nhánh, tài khoản có định danh ổn định — bất kể đổi tên, đổi mã, đổi vị trí phân loại | mặt hàng ✅ (0065 / 0066, hành trình qua đổi mã, giá vốn theo định danh); thực thể khác ☐ |
| B2 | **Organizational & Accounting Consistency** | nhiều pháp nhân, chi nhánh, cửa hàng, kho, nhiều cấp danh mục mà không lẫn số liệu hoặc chính sách hạch toán | trong một tenant ✅; nhiều tenant trong một chuỗi ☐ |
| B3 | **Versioning** | đổi mã, cơ cấu, chế độ kế toán theo phiên bản + ngày hiệu lực, không làm sai lịch sử; **hai cột**: định danh tồn kho và mã | mã hàng, phân loại, chính sách, hồ sơ ✅; mã thực thể khác, hệ thống TK theo phiên bản ☐ |

## 2. Nguyên tắc bất biến ↔ luật của Core

| Mã | Nguyên tắc | Luật / cơ chế đang có | Thiếu |
|---|---|---|---|
| MD-001 | Mọi đối tượng kinh tế có ID chuẩn, bất biến | R-ITEM-0 (`items.item_id`), ADR-0017 | `entity_codes` + định danh cho đối tượng / chi nhánh / kho (D026-3) |
| MD-002 | Mã hiển thị và phân loại có phiên bản theo ngày | `item_codes`, `item_classification` (R-ITEM-5 / 7) | thực thể khác; `item_classes` theo ngày |
| MD-003 | Cây phân cấp nhiều cấp | `org_units` (0062), `parent_code` ở item_classes / accounts / partner_groups / dimensions | `path` + kiểm vòng cho item_classes; báo cáo không giới hạn 3 cấp |
| MD-004 | Không dùng mã hiển thị làm khoá liên kết sổ | R-ITEM-1, 0066 (`item_id` trên sổ / kho / giá) | `products` → khung nhìn (S024-11); đối tượng / TK |
| ORG-001 | Pháp nhân, đơn vị hạch toán, chi nhánh, cửa hàng, kho phân biệt rõ | tenants, branches (MST), accounting_units, warehouses, org_units | nhóm đơn vị, vai của tenant (D026-4) |
| ORG-002 | Nghiệp vụ xác định được chủ thể kế toán và MST | branch → tax_code; sổ theo đơn vị hạch toán | giao dịch liên đơn vị (D026-4) |
| ACC-001 | Mapping tài khoản có phiên bản, phạm vi, hiệu lực | ADR-0009 (`posting_policy_versions`), `item_classification` | nhóm hạch toán theo ngày; ánh xạ TK khi đổi chế độ; phạm vi nhóm đơn vị |
| ACC-002 | Dòng tồn kho / giá vốn truy xuất về SKU và nghiệp vụ gốc | R-CONT-0, `bizcity_lineage@1` 0.2.0, G2 | lớp giá vốn + phân bổ (PHASE-025 W2) |
| CF-001 | Thay đổi danh mục ảnh hưởng kế toán phải kiểm chuẩn trước khi kích hoạt | Gate A, mặt hàng nháp, R-GATE-9 | bốn lớp thay đổi (ADR-0018) thi hành; nháp cho đối tượng |
| CF-002 | Sự kiện không đạt giữ trong Exception Buffer | Gate B `intake_inbox`, Commit Guard | bể cho sai lệch sau ghi sổ (Gate C) |
| AUD-001 | Sai lệch truy tìm được về chứng từ, nguyên nhân, phạm vi | `audit_logs` chuỗi băm, Bàn điều tra, Hành trình mặt hàng | Lịch sử + Tác động trên màn danh mục |

## 3. Quyết định chờ chủ duyệt

Xem [ADR-0022 §Quyết định](../../adr/ADR-0022-quan-tri-du-lieu-goc-nen-mong.md): D026-1 nền móng + bảng tám trụ cột · D026-2 định danh ba tầng và bảng thuật ngữ · D026-3 `entity_codes` cho hạng A/B · D026-4 nhóm đơn vị · D026-5 bốn khả năng · D026-6 bảng trụ cột × mức đạt · D026-7 Golden Tests là cổng phát hành · D026-8 thứ tự P0 / P1 / P2.

Điểm cần chủ quyết rõ: **D026-2** (giữ tên cột `item_id` = đơn vị tồn kho; thuật ngữ "item_id cha" của chủ ↔ `parent_item_id`), **D026-4** (nhóm đơn vị làm sau S024-11).

## 4. Hiện trạng (đối chiếu code 2026-11-04)

Bảng đầy đủ: [10-DANH-GIA-ADAPT](10-DANH-GIA-ADAPT.md) (sinh từ `docs/standard/tru-cot.json`, cũng là màn HT10). Tóm tắt:

| Tầng | Mức đạt | Nhận xét |
|---|---|---|
| Nền móng MDG | 47 % | mặt hàng xong (định danh, mã phiên bản, sổ / kho / giá vốn / báo cáo theo `item_id`); thực thể khác, nhóm đơn vị, bốn khả năng trên màn: chưa |
| I Sổ cái bất biến | 100 % | đủ trigger + test (còn định danh đối tượng / TK trên dòng sổ — ghi ở L-4 khoảng cách) |
| II Định danh | 46 % | `products` chưa là khung nhìn; `parent_item_id` chưa điền; thực thể khác chưa |
| III Liên tục | 39 % | hành trình mặt hàng theo định danh ✅; lớp giá vốn, Gate C, khoá kỳ: tài liệu |
| IV Cửa nạp & cổng | 90 % | Gate A / B, Commit Guard, thư viện mã có căn cứ ✅ |
| V Chính sách | 56 % | chính sách + hồ sơ ✅; đổi chế độ, phạm vi nhóm: chưa |
| VI Bằng chứng | 60 % | nhật ký, chẩn đoán ✅; Lịch sử / Tác động trên màn: chưa |
| VII Cô lập & phân quyền | 50 % | RLS, phân quyền ✅; nhóm đơn vị, liên đơn vị: chưa |
| VIII Module & kiểm chuẩn | 50 % | SDK, selfcheck ✅; ctx.data items, Golden Tests, benchmark: chưa |

(Số % sinh từ `tru-cot.json` — xem [10-DANH-GIA-ADAPT](10-DANH-GIA-ADAPT.md); đổi khi có bằng chứng mới.)

## 5. Đợt

| Đợt | Việc | Cổng chốt |
|---|---|---|
| **W0** | ADR-0022, CANON §0.2, tài liệu phase, bản mẫu, `tru-cot.json`, HT10 + thẻ Trụ cột | chủ duyệt D026-* |
| **P0 — nền tảng không được sai** | `parent_item_id` + luật biến thể (S026-3); `entity_codes` cho đối tượng / chi nhánh / kho (S026-4); `item_classes.path` + kiểm vòng (S026-5); nhóm hạch toán theo ngày + phiên bản hệ thống TK + ánh xạ (S026-8); bốn lớp thay đổi ở Gate A (S026-9); Lịch sử / Tác động / khung chung (S026-10..12); **Golden Tests** (S026-2); SC-PILLAR-1 (S026-15) | `T026-G1..G6` xanh trong CI; HT10: nền móng ≥ 70 % |
| **P1 — vận hành chuỗi lớn** | nhóm đơn vị + vai (S026-6); danh mục nhóm nhận về đơn vị; cặp chứng từ liên đơn vị + loại trừ (S026-7); mapping theo phạm vi; truy vết đối tượng / tài khoản (S026-13); nhập Excel đối tượng; Exception Buffer sau ghi sổ (PHASE-025 W4) | ca 2 tenant (HO → cửa hàng) chuyển kho + bán + loại trừ = 0 |
| **P2 — quy mô & kiểm toán tự động** | benchmark triệu SKU / trăm cửa hàng (S026-14); đồng bộ theo câu lệnh; `EXCLUDE gist`; phân tích tác động hàng loạt; trợ lý AI hướng dẫn kế toán từ thư viện mã; bộ kiểm thử theo chế độ kế toán | số đo công bố trong CHANGELOG |

Thứ tự với phase khác: S026-3 / 4 / 5 làm ngay sau B2b; **S026-6 / 7 sau S024-11** (`products` → khung nhìn) để không có hai đường ghi; S026-13 sau PHASE-025 W2.

## 6. Golden Tests (D026-7)

| Mã | Ca | Phải giữ |
|---|---|---|
| T026-G1 | đổi mã giữa tháng (có nhập trước, bán sau) | một dòng giá vốn, đơn giá bình quân đúng, phiếu giá vốn ghi mã tại ngày, hành trình một; NXT một dòng — **có** (`item-id-so-kho`) |
| T026-G2 | đổi nhóm hạch toán từ ngày D | chứng từ trước D định khoản theo nhóm cũ, sau D theo nhóm mới; không sửa dòng sổ cũ |
| T026-G3 | đổi nhóm hàng trong cây (dời nhánh) | báo cáo theo nhóm của kỳ cũ không đổi; kỳ mới theo cây mới |
| T026-G4 | trả hàng sau khi đổi mã | hoàn đúng giá vốn lần bán gốc, nối về chứng từ gốc |
| T026-G5 | chuyển kho giữa hai nhóm tính giá qua đổi mã | hàng đang chuyển về 0, giá vốn nhóm nhận = nhóm gửi |
| T026-G6 | đổi chế độ kế toán (hệ thống TK mới) từ đầu năm | số dư chuyển theo ánh xạ; sổ năm cũ nguyên; báo cáo hai năm đọc được |
| T026-G7 | xoá mặt hàng rồi tạo lại cùng mã | định danh mới, không chồng hiệu lực, dòng cũ giữ định danh cũ — **có** |
| T026-G8 | hai tenant trong nhóm: HO chuyển kho cho cửa hàng, cửa hàng bán | mỗi bên một chứng từ, `intercompany_ref` nối, loại trừ nhóm = 0 (P1) |
