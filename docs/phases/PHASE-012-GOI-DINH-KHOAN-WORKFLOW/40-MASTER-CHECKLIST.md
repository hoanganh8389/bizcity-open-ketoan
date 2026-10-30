# PHASE-012 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S012-1 | Workflow khai báo; chuyển `payment_requests`, `purchase_documents` | 3.5 | chưa | ☐ |
| S012-2 | `ledger.query`; báo cáo thành `modules/ke-toan/reports` | 3.7 | chưa | ☐ |
<!-- [2026-10-30 10:11 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — Chủ "code tiếp các phase tiếp" ⇒ code S012-3 (cài / xem trước / gỡ); tách seed thành gói tách riêng S012-3b. -->
| S012-3 | Bảng `config_packs`, xem trước / cài / gỡ | 3.11 | có | ✅ migration `0042`; `modules/posting-config/pack.ts` + `pack.actions.ts` (`core.template.list` / `.install` / `.uninstall`); `test/posting-pack.test.ts` 6 ca: xem trước không ghi gì; cài gói mẫu TT99 thương mại — mục khác cấu hình đơn vị GIỮ (STD-TPL-7), chọn ghi đè từng mục; chốt bản cũ rồi phát hành MỘT bản chính sách (ADR-0009 Q-5, STD-TPL-6); STD-TPL-2 / -3 / -9 chặn gói hỏng; gỡ chỉ ngừng dùng mã gói thêm mà chưa phát sinh (STD-TPL-8); AI không cài / gỡ |
<!-- [2026-10-30 11:12 PM Johnny Chu - Chu Hoàng Anh] PHASE-012 — Chủ "làm tiếp S012-4, đồng ý đặt tệp gói ở db/packs/" ⇒ S012-3b + S012-4. -->
| S012-3b | Tách `db/seed.ts` (lý do, nhóm, hình thức TT, thuế, ngầm định) thành gói nền `bizcity.vn-tt99.nen`, đơn vị mới cài qua `installPack` | 3.11 | có | ✅ `db/packs/vn-tt99-nen.posting-pack.json` sinh từ đúng hằng của `seed.ts` cũ; `installPack({ baseline })`. **T012-1:** đơn vị mới lập bằng seed mới = seed cũ, 49 dòng / 5 bảng TRÙNG (`tools/so-seed-goi-nen.mjs`); chạy lại seed không thêm gì; đơn vị cũ `demo` tự nhận gói nền: 49 `keep`, 0 thêm, 0 bản chính sách mới |
| S012-4 | `posting.reason.suggest` tất định + manifest `ledger.submits[].reasons` | 3.12 | có | ✅ `reason-suggest.ts`; action `accounting.posting.reason-suggest` (MCP `…reason_suggest`, AI đọc) + `accounting.posting.reason-readiness`; `test/reason-suggest.test.ts` 7 ca: **top-1 ≥ 80%** trên ví dụ gói nền và tình huống mẫu + ví dụ gói ngành (chỉ tiêu PHASES 3.12), tất định, lịch sử đơn vị, notFor, lọc loại, readiness, MCP. Manifest: `bizcity_module` 1.1.0-draft `ledger.submits[].reasons`; SC-CON-2 kiểm loại lý do, khoá mặc định, gói gợi ý (ca tự kiểm `module-bad`) |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
| 2026-10-30 22:20 | Claude Code | Chủ "code tiếp các phase tiếp" ⇒ S012-3 cài / xem trước / gỡ (D012-1…5). Năng lực `templates.posting` → available. S012-3b (seed thành gói nền) mở câu hỏi Q012-1. |
| 2026-10-30 23:12 | Claude Code | Chủ "làm tiếp S012-4 và đồng ý đặt tệp gói ở db/packs/" ⇒ S012-3b (D012-6, -7) + S012-4 (D012-8, -9). Năng lực `posting.reason-suggest`, `ledger.reasons.declare` → available; 3.11, 3.12 ☑ trên bảng điểm. Hợp đồng `bizcity_module`, `bizcity_posting_template` → 1.1.0-draft (chỉ thêm trường tuỳ chọn). |
