# PHASE-029 · 20 — Đánh giá codebase so với bốn nhóm nền móng
<!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — đánh giá codebase (origin/main 601d939) so với ADR-0028: 17 trụ cột, mô hình nhất quán, tài liệu lệch mã, bằng chứng tệp:dòng -->

> **Phạm vi:** `main` 601d939, 2026-11-05. Rà chỉ đọc: migration `db/migrations`, Kernel, Platform, phân hệ, bộ kiểm, tài liệu hợp đồng. Bản đồ tổng hợp: [standard/NEN-MONG-DOANH-NGHIEP.md](../../standard/NEN-MONG-DOANH-NGHIEP.md). Dữ liệu gốc từng bảng: [standard/DU-LIEU-GOC.md](../../standard/DU-LIEU-GOC.md).

## 1. Kết luận ngắn

| Nhóm | Mức | Một câu |
|---|---|---|
| A · Thống nhất doanh nghiệp | 🟡 | Mặt hàng là mẫu tốt (ULID, mã có hiệu lực, gộp, guard CSDL); thực thể khác chưa có lịch sử. **Cấu hình chỉ có bộ đọc** — chỗ yếu nhất của nhóm A |
| B · Xử lý giao dịch | 🟡→✅ | Lệnh / sự kiện / outbox / idempotency chắc; một cửa ghi chắc. Thiếu: kỳ khoá ở CSDL, SoD chưa bật, chứng từ module không dùng SDK chứng từ |
| C · Dữ liệu luôn đúng | 🟡 | Chẩn đoán đối chiếu nhiều và chạy được; nhưng luật đóng (module không thêm được), đối chiếu chạy tay chưa thành sổ đăng ký, **không có sổ KPI** |
| D · Cộng đồng mở rộng | 🟡 | Manifest + nạp có băm + capabilities tốt; thiếu siêu dữ liệu object / field, ánh xạ định danh ngoài, khoá migration sau 0033 |

## 2. Những thứ đã chắc (giữ, không làm lại)

| Thứ | Bằng chứng |
|---|---|
| Sổ chỉ thêm, cân Nợ = Có | `ledger_lines_balanced` (0006), `ledger_entries_no_update`, `accounting_events_no_delete`, `accounting_event_versions_no_update` (0049) |
| Mặt hàng định danh bất biến | `items_guard`, `item_codes_guard`, `item_classification_guard` (0065), `items_merge_guard` (0068), `products_item_id_guard` (0070) |
| Chính sách có phiên bản | `posting_policy_versions_guard` (0040), `accounting_profiles_guard` (0054) |
| Outbox, phát lại, idempotency | `event_outbox` / `event_deliveries` / `event_consumptions` (0039); dispatcher SKIP LOCKED + `dead` (`packages/platform/src/core/events.ts`); `action_requests` (0035) |
| Nhật ký bất biến | `audit_logs` chuỗi băm (0036), `EVIDENCE_CHAIN` |
| Một nơi cấp số chứng từ | `packages/kernel/src/modules/documents/numbering.ts` |
| Bể lỗi đầu vào | `intake_inbox` (0059), 33 mã `IN-*` |

## 3. Khoảng cách theo mức nghiêm trọng

| # | Khoảng cách | Nguyên tắc bị hở | Bằng chứng | Việc |
|---|---|---|---|---|
| K-1 | Cấu hình: không có `settings.set`, không lịch sử, không hiệu lực, chỉ phạm vi đơn vị; 0 nơi dùng `ctx.settings.get`; ≥ 8 chỗ đọc thô `tenants.settings`; khoá `idempotency_days`, `event_retention_days` dùng mà không khai | ECP-03, R-MATRIX-4/10 | `packages/platform/src/core/settings.ts` (đọc), các route ghi riêng ở `system.routes.ts`, `catalog-rules.routes.ts`, `mua-hang/routes.ts` | S029-10 (P0) |
| K-2 | Chặn xoá danh mục chỉ ở dịch vụ, có chỗ thiếu (sản phẩm chỉ kiểm phiếu kho; hình thức TT chỉ kiểm thu tiền bán; TK ngân hàng chỉ kiểm hình thức TT); `ketoan_app` có `DELETE` mọi bảng (0032) | ECP-13 | `catalog.service.ts`, `posting-config.routes.ts`, `bank-account.routes.ts` | S029-12 (P0, K3) |
| K-3 | Kỳ khoá chỉ kiểm ở ứng dụng (`ledger.service.ts` → `period.repository.ts`), không có trigger CSDL | R-ECP-CONS-1 | — | S029-17 (P0, K3) |
| K-4 | Tên đối tượng không có lịch sử, dòng sổ không chụp tên đối tượng; báo cáo nối tên hiện tại | ECP-03, ví dụ P001 | 0072 chỉ chụp `product_name` | S029-19 (P0) |
| K-5 | Hợp đồng danh mục còn nói mã là khoá ổn định; hợp đồng dữ liệu bảo module lưu `partner_code` | ECP-04 | `bizcity_master_data@1` §2, `bizcity_data@1` STD-DATA-6, R-MD-2 | S029-9 — sửa trong PR này |
| K-6 | Bảng trụ cột ghi tay; `tru-cot-md.mjs --kiem` chỉ so tệp sinh với JSON | R-ECP-SCORE | `docs/standard/tru-cot.json` (E-5 tự ghi "chưa do engine ghi") | S026-15 + S029-18 (P0) |
| K-7 | Gộp chỉ có ở mặt hàng | ECP-13 (MERGE) | 0068 | S029-20 (P1) |
| K-8 | Module không thêm được luật kiểm / chẩn đoán; SDK không xuất `registerDiagnostics`; manifest không có `rules`, `diagnostics`, `objects`, `fields` | ECP-11, trụ cột 12 / 16 | `packages/module-sdk/src/index.ts`, `docs/contracts/BIZCITY-MODULE-v1.schema.json` | S029-21 (P1) |
| K-9 | `doi-chieu-ke-toan.sql` chạy tay; không sổ đăng ký đối chiếu; không đối chiếu kết nối ngoài theo cửa sổ kéo | ECP-11, R-ECP-CONS-3 | `scripts/doi-chieu-ke-toan.sql` | S029-13, S029-15 (P1) |
| K-10 | Khoá checksum migration chỉ tới 0033; `migrate.ts` không ghi checksum | AP-5, trụ cột 17 | `tests/conformance/locks/migrations.lock.json` | S029-22 (P1) |
| K-11 | Chứng từ module là jsonb riêng; `saveVersion` / `link` không ai gọi | ECP-05 / 09, trụ cột 06 | `purchase_documents.data` (0010) | S029-5, S029-11 |
| K-12 | SoD có trong engine nhưng không luồng nào bật; duyệt phiếu Kernel không kiểm người lập ≠ người duyệt | ECP-06 | `payment-request.workflow.yaml`, `purchase-document.workflow.yaml`, `voucher.service.ts` | S029-25 (P1) |
| K-13 | Khoá API kết nối lưu chữ rõ trong `tenants.settings`; không phân loại dữ liệu nhạy cảm | trụ cột 17 | `connection.service.ts` | S029-24 (P1) |
| K-14 | Không có sổ KPI; báo cáo tài chính là mảng TypeScript | ECP-12 | `BALANCE_SHEET_LINES`, `INCOME_STATEMENT_LINES` | S029-16 (P2) |
| K-15 | Không có người / nhân viên; nhân viên tồn tại hai nơi không nối | trụ cột 01 / 04 | `partners.kind`, `dimensions.kind` | S029-23 (P2) |
| K-16 | Vài sự kiện trong hợp đồng chưa phát; tên `bizcity.module.toggled` lệch hợp đồng (`enabled` / `disabled`) | ECP-08 (hợp đồng) | `module.actions.ts` | S029-28 (P2) |

## 4. Tài liệu lệch mã (sửa khi đụng tới)

| Tài liệu | Lệch | Xử lý |
|---|---|---|
| `bizcity_master_data@1` §2, §4 | mã là khoá ổn định | **sửa trong PR này** (1.1.0-draft) |
| `bizcity_data@1` STD-DATA-6 | lưu `partner_code` | **sửa trong PR này** |
| luật R-MD-2 | "tham chiếu bằng mã" không phân biệt ngoài / trong | **sửa trong PR này** |
| `bizcity_document@1` §3 | còn liệt kê vi phạm cấp số đã sửa | S029-11 |
| `bizcity_document@1` §5.1 | nói chỉ quyền Core dùng được trong luồng (mã đã nhận quyền module) | S029-25 |
| `bizcity_settings@1` §2 | mô tả `settings.get(key, scope)` hẹp → rộng — mã chỉ có phạm vi đơn vị | S029-10 (mã theo hợp đồng) |
| R-CONT-5, `tru-cot.json` E-4 | nhắc `STOCK_LEDGER_MATCH` — mã thật là `INVENTORY_LEDGER_MISMATCH` | PHASE-025 / PHASE-026 sửa khi đụng (`tru-cot.json` thuộc S026-15) |

## 5. Không làm gì ở đây

Không viết mã, không sửa `tru-cot.json` (S026-15 giữ), không đụng `entity_codes` (S026-4 giữ, CLAIMS đang làm). Mọi việc code mở bằng dòng giữ chỗ riêng.
