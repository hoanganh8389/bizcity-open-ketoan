# PHASE-026 · 40 — Checklist
<!-- [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — việc con S026-*, Golden Tests T026-G*, log -->

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S026-1 | ADR-0022, CANON §0.2 (nền móng + tám trụ cột), tài liệu phase 00 / 10 / 20 / 30, bản mẫu | W0 | P0 | — | 🟡 2026-11-04: xong, chờ chủ duyệt D026-* |
| S026-16 | `docs/standard/tru-cot.json` (`bizcity_pillars@1`), `GET /api/v1/system/pillars`, màn HT10, thẻ Trụ cột ở trang chủ phân hệ, hướng dẫn | W0 | P0 | có | ✅ 2026-11-04 (mức đạt ghi tay có bằng chứng) |
| S026-2 | Golden Tests `T026-G1..G7` có tên, chạy như một cổng (`kiem-chuan.sh`), thất bại chặn phát hành | P0 | P0 | có | 🟡 G1, G7 có (`item-id-so-kho`); G2..G6 ☐ |
| S026-3 | `parent_item_id` điền từ `parent_sku`; luật biến thể kinh tế khác = định danh mới (R-ITEM-3); MH26 ghi / đọc `parent_item_id` | P0 | P0 | có | ✅ 2026-11-04 <!-- [2026-11-04 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-3 -->: migration 0067 (điền + giữ khớp theo định danh, mặt hàng cha thêm sau con nhận con, chặn tự trỏ / vòng / khác đơn vị); ITEM-HINT-003 (Gate A, cảnh báo); Hành trình hiện họ mặt hàng; test `bien-the-dinh-danh` 4 ca. Còn: MH26 đọc `parent_item_id` (sau S024-11) |
| S026-4 | `entity_codes` cho đối tượng / chi nhánh / kho / đơn vị tính / lý do; guard chỉ thêm, chặn chồng; trigger đồng bộ từ cột `code`; `resolveEntity`; điền ban đầu | P0 | P0 | có | ☐ |
| S026-5 | `item_classes.path` + kiểm vòng; quan hệ cha–con có hiệu lực; báo cáo kho gom theo cấp bất kỳ — ca T026-G3 | P0 | P0 | có | ☐ |
| S026-8 | Nhóm hạch toán theo ngày; `chart_versions`, `account_mappings`, phiếu chuyển số dư (ADR-0018) — ca T026-G6 | P0 | P0 | có | ☐ |
| S026-9 | Bốn lớp thay đổi ở Gate A (`changeClass` trong phản hồi validate / save); nháp cho đối tượng; lớp 3 bắt buộc xem Tác động + lý do | P0 | P0 | có | ☐ |
| S026-10 | API `GET /api/v1/master-data/:type/:id/history`; thẻ Lịch sử | P0 | P0 | có | 🟡 2026-11-04 <!-- [2026-11-04 03:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-10 -->: mặt hàng xong — `GET /api/v1/lineage/items/:sku/history` (tra bằng mã cũ ra cùng lịch sử), nút Lịch sử ở Hành trình; test 1 ca. Còn: đường chung `/master-data/:type/:id/history` khi có `entity_codes` (S026-4), gắn vào form DM10 |
| S026-11 | Chỉ mục tham chiếu `md_references` + `GET …/impact`; thẻ Tác động + xem trước khi đổi mã / nhóm / ngừng | P0 | P0 | có | ☐ |
| S026-12 | `MasterDataFrame` bốn thẻ, gắn vào form mặt hàng, đối tượng, tài khoản, chi nhánh, kho; trang Trung tâm dữ liệu gốc `/danh-muc` với ô tìm mọi mã + Việc cần làm | P0 | P0 | có | ☐ |
| S026-15 | SC-PILLAR-1: tiêu chí `dat` phải có bằng chứng tồn tại (tệp test / check / migration); engine ghi `source = check` cho tiêu chí có check | P0 | P1 | có | ☐ |
| S026-6 | `tenant_groups`, thành viên + vai (ho / warehouse / store / legal_entity), MST tỉnh; danh mục nhóm nhận về đơn vị giữ chung `item_id`; màn Nhóm đơn vị | P1 | P1 | có | ☐ (sau S024-11) |
| S026-7 | Cặp chứng từ liên đơn vị + `intercompany_refs`; giá chuyển theo bên gửi; báo cáo nhóm loại trừ; mã `CT-IC-*` — ca T026-G8 | P1 | P1 | có | ☐ |
| S026-13 | Truy vết đối tượng (`/lineage/partners/:id`) và tài khoản (`/lineage/accounts/:code`); thẻ Truy vết cho hai loại này | P1 | P1 | có | ☐ |
| S026-17 | Nhập Excel đối tượng (hiện chỉ có `partners/upsert`); mapping chính sách theo phạm vi nhóm | P1 | P1 | có | ☐ |
| S026-14 | Benchmark 1.000.000 mặt hàng × 300 chi nhánh; đồng bộ theo câu lệnh cho đường nạp lô; `EXCLUDE USING gist`; số đo vào CHANGELOG | P2 | P2 | có | ☐ |
| S026-18 | Phân tích tác động hàng loạt (đổi cây nhóm, đổi chế độ); trợ lý AI hướng dẫn kế toán từ thư viện mã; bộ kiểm thử theo chế độ kế toán | P2 | P2 | có | ☐ |

## Golden Tests (D026-7)

| Mã | Ca | Trạng thái |
|---|---|---|
| T026-G1 | đổi mã giữa tháng → một dòng giá vốn, bình quân đúng, phiếu GV ghi mã tại ngày, NXT một dòng, sổ chi tiết tra bằng mã cũ | ✅ `apps/api/test/item-id-so-kho.test.ts` |
| T026-G2 | đổi nhóm hạch toán từ ngày D: trước / sau định khoản đúng, sổ cũ nguyên | ☐ |
| T026-G3 | dời nhánh trong cây nhóm hàng: báo cáo kỳ cũ không đổi | ☐ |
| T026-G4 | trả hàng sau đổi mã: hoàn đúng giá vốn lần bán gốc | ☐ |
| T026-G5 | chuyển kho giữa hai nhóm tính giá qua đổi mã: hàng đang chuyển về 0 | ☐ |
| T026-G6 | đổi chế độ kế toán từ đầu năm: số dư chuyển theo ánh xạ, sổ cũ nguyên | ☐ |
| T026-G7 | xoá mặt hàng rồi tạo lại cùng mã: định danh mới, không chồng hiệu lực | ✅ `item-id-so-kho` |
| T026-G8 | hai tenant trong nhóm: chuyển kho + bán + loại trừ = 0 | ☐ (P1) |

## Log

- 2026-11-04: S026-3 xong (0067, ITEM-HINT-003, họ mặt hàng trên Hành trình). Gộp main vào PR #48.
- 2026-11-04: mở phase; ADR-0022; `tru-cot.json` + HT10 + thẻ Trụ cột; bản mẫu; G2 (giá vốn, NXT, sổ chi tiết theo `item_id`) làm T026-G1 xanh.
