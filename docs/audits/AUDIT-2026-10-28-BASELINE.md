# Audit nền — 2026-10-28
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

> Rà soát mã nguồn so với bộ chuẩn [../00-CANON.md](../00-CANON.md) v1.0. Phương pháp: đọc nhân (`core/`, `modules/{documents,posting,ledger}`, `packages/contracts`, `db/migrations/000x_goc_*`), grep toàn `apps/api/src`, đối chiếu tài liệu cũ. **Chưa** chạy test trong lần rà này.

## 1. Điểm mạnh (giữ nguyên)

| # | Điểm | Bằng chứng |
|---|---|---|
| S-1 | Sổ cái chỉ thêm được giữ ở **tầng CSDL**, không chỉ ở code | Trigger `ledger_lines_no_update`, `*_no_truncate`, `ledger_links_no_update`, `posting_log_no_update`, `ledger_lines_negative_guard`; chỉ mục `ledger_entries_reversed_once`, `ledger_links_one_reversal` |
| S-2 | Chỉ `modules/ledger` ghi bảng `ledger_*` | grep `insertInto('ledger_` ngoài `modules/ledger`: 0 kết quả |
| S-3 | Chỉ `documents.repository` ghi `accounting_events` | grep: 1 kết quả, đúng chỗ |
| S-4 | Idempotent theo `(tenant_id, doc_key)` + `version`, lưu lịch sử phiên bản | UNIQUE + `accounting_event_versions` |
| S-5 | Không viết cứng tài khoản trong luật; resolver có thứ tự rõ và báo thiếu đủ | `account-resolver.ts` |
| S-6 | Định khoản lại không đổi nội dung thì không sinh cặp đảo thừa | `entryContentHash()` |
| S-7 | 71 tệp test, 624 phép, chạy trên PostgreSQL thật, mỗi lần một đơn vị riêng | `apps/api/test/` |
| S-8 | Có test ranh giới phân hệ | `phan-he-ranh-gioi.test.ts` |
| S-9 | Kiểm biến môi trường lúc khởi động, chặn JWT mặc định ở production | `config/env.ts` |
| S-10 | Migration chạy trong giao dịch, khoá advisory, job `db-migrate` tách khỏi API | `db/migrate.ts`, `docker-compose.yml` |

## 2. Lệch chuẩn — việc cần làm

| # | Mức | Luật | Phát hiện | Việc | Giai đoạn |
|---|---|---|---|---|---|
| A-01 | **Cao** | R-EVENT-2, R-LEDGER-4 | `vouchers`, `closing`, `assets`, `inventory/costing` mỗi nơi tự viết chuỗi khoá sự việc → lưu phiên bản → đảo → `ledgerService.post` → `logPosting`. Kết quả đúng nhưng 4 bản sao của logic nhân | `eventStore.commit()` dùng chung; chuyển 4 module | 1.1 |
| A-02 | **Cao** | R-QG-1 | Không có CI (`.github/` chỉ có `CODEOWNERS`) | Thêm `.github/workflows/ci.yml` (đã khởi tạo cùng bộ chuẩn) | 0.2 |
| A-03 | Trung bình | R-DB-3 | Hai migration cùng số: `0028_cau_hinh_mau_in.sql`, `0028_thue_kkkn.sql`; thiếu `0015` | Nếu chưa chạy ở máy chủ thật: đổi số một tệp. Nếu đã chạy: giữ, ghi chú vào `db/README.md`, CI cho phép đúng cặp này | 0.3 |
| A-04 | Trung bình | R-MATRIX-2, R-MATRIX-4 | `tenants.settings` có ≥ 7 khoá (`postingModes`, `dataLock`, `connections`, `connectionPulls`, `logo`, `purchase`…), chỉ 2 khoá đọc qua hàm kiểm khuôn; `purchase` ghi bằng `jsonb_set` trần | Registry (đã khởi tạo) + `core/settings.ts` | 2.3 |
| A-05 | Trung bình | R-DB-12 | `connectionPulls` là trạng thái chạy nằm trong cấu hình | Bảng `connector_pull_runs` | 2.3 |
| A-06 | Trung bình | R-BOUND-6 | `packages/contracts/src/mua-hang/*` (engine giá mua, khuyến mại, tồn max…) nằm trong gói nhân | Tách gói `mua-hang-domain` | 1.6 |
| A-07 | Trung bình | R-LEDGER-1 (E2) | `ledger_entries` không có trigger giới hạn `UPDATE` — cập nhật thông tin đầu tại chỗ là ngoại lệ có chủ đích nhưng CSDL không chặn sửa cột khác (`posting_date`, `branch_id`, `event_id`…) | Trigger chỉ cho đổi `status` (`posted→reversed`) và danh sách cột thông tin | 1 |
| A-08 | Trung bình | — | Tài liệu cũ lệch code: `co-so-du-lieu.md` liệt kê migration 0001–0053 kiểu cũ; `kien-truc.md` còn `gl_*`, "bộ sổ", `/documents/:id/repost`; `README.md` gốc nói "hai bộ sổ" và `apps/api/migrations` (nay là `db/migrations`) | Sửa theo chuẩn mới hoặc gắn nhãn lỗi thời | 0.4 |
| A-09 | Thấp | R-API-12 | Lỗi 500 trả "Lỗi hệ thống" không kèm mã yêu cầu để tra log | `details.requestId = req.id` | 1 |
| A-10 | Thấp | R-API-6 | Chưa có test liệt kê mọi route và kiểm có `requirePermission` | Test duyệt `app.printRoutes()` | 1 |
| A-11 | Thấp | 04-DAT-TEN | Gói `@ketoan/*`, compose `name: ketoan`, plugin `tgs_accounting_bridge`, biến `TGS_KETOAN_*` — chưa theo tên `bizcity` | Bí danh, theo ADR-0002 | 1–2 |
| A-12 | Thấp | D-1 | Thư mục làm việc chưa là git repo; `.env` thật nằm cạnh `.env.example` | `.gitignore` đã chặn `.env` — chỉ cần giữ nguyên khi `git init` | 0 |
| A-13 | Thấp | R-BOUND-5 | Bảng phân hệ `cash_plans`, `cost_norms`, `payment_requests` nằm trong migration gốc của lõi | Ghi chủ sở hữu trong `bizcity.module.json` (`tables`) | 2.4 |
| A-15 | Trung bình | R-LEDGER E3 | `scripts/xoa-chung-tu.sh` tắt **mọi** trigger bằng `session_replication_role = replica` và chạy được cho sổ nội bộ (tài liệu `cong-ket-noi.md` nói "chỉ khi `BOOK_MODE=tax`" — lệch) | Quyết định: hoặc chặn khi `BOOK_MODE=internal` trừ khi có cờ `--sổ-nội-bộ`, hoặc sửa tài liệu; dùng biến phiên riêng thay cho tắt mọi trigger | 1 |
| A-16 | Thấp | R-EVENT-2 | `tax-info.service.ts:168` đổi `accounting_events.status` sang `pending` trực tiếp (khi bổ sung thông tin thuế cần định khoản lại) — không ghi `posting_log` | Gọi hàm của `documents` (ví dụ `markForRepost`) để có nhật ký | 1 |
| A-14 | Thông tin | R-LEDGER E1 | Điền giá vốn ghi đè `debit/credit` dòng `cost_fill` (cờ `ketoan.cost_overwrite`) — có chủ đích, có trigger giới hạn chặt | Đã ghi vào ngoại lệ đóng danh sách | — |

## 3. Chỉ số theo dõi

| Chỉ số | Hôm nay | Đích Giai đoạn 1 |
|---|---|---|
| Nơi gọi `ledgerService.post/reverse` ngoài `ledger` | 6 tệp (`posting.service`, `vouchers`, `closing`, `assets`, `costing`, `ledger.types` khai kiểu) | 2 (`posting.service`, `documents/event-store`) |
| Khoá `tenants.settings` có trong registry | 6/6 đã ghi; 2 đọc qua hàm kiểm | 100% qua `settings.get` |
| Luật Tier 0/1 có kiểm tự động | ~70% | 100% |
| CI | không | xanh trên `main` |

## Bổ sung 2026-10-29

Lần quét thứ hai, theo góc nhìn "module cộng đồng cắm vào Core", thêm phát hiện **A-17..A-26** (module ghi thẳng bảng lõi, bằng chứng rải 6 nơi, không có đính kèm / luồng duyệt / idempotency / sự kiện miền chung, chưa có RLS, chưa có MCP, danh tính phân hệ khai 5 nơi, bảng nghiệp vụ trong migration nền). Chi tiết và bằng chứng dòng code: [../standard/REUSE-MAP.md §5](../standard/REUSE-MAP.md#5-phát-hiện-mới-bổ-sung-audit).
