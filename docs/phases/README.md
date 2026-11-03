# Thư mục phase
<!-- [2026-10-30 01:37 PM Johnny Chu - Chu Hoàng Anh] AUDIT — đánh giá kiến trúc 2026-10-30, mục lục phase. -->
<!-- [2026-10-30 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — một cửa ghi sổ: eventStore cho phiếu tay, kết chuyển, khấu hao, giá vốn. -->
<!-- [2026-10-30 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-006 — transactional outbox, subscriber, đồng hồ, correlation_id. -->
<!-- [2026-10-30 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — MCP ghi: lập nháp, đề xuất huỷ, luôn chờ duyệt; ADR-0009 đề xuất. -->
<!-- [2026-10-30 08:42 PM Johnny Chu - Chu Hoàng Anh] PHASE-008 — PITR: lưu WAL, sao lưu gốc, diễn tập khôi phục. -->
<!-- [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009). -->
<!-- [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS. -->
<!-- [2026-10-30 09:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — cổng công khai apps/api/src/kernel/public.ts, SC-KERNEL-6: ngoài Kernel chỉ import qua cổng. -->
<!-- [2026-10-31 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-018 — thêm dòng phase giám sát vận hành, toàn vẹn sổ. -->

Mỗi phase là **một gói việc** có thư mục riêng: kế hoạch, sự thật đọc mã, checklist con, bằng chứng. Phase gom các việc của hai danh sách đã có:
- **Lộ trình** [PHASES.md](../standard/PHASES.md) / [roadmap.json](../standard/roadmap.json): mã `0.1`…`5.9`, trạng thái do máy tính.
- **Checklist công bố** [CONG-BO-KIEN-TRUC §6](../CONG-BO-KIEN-TRUC.md): mã `G1-01`…`G3-09`, cộng đồng nhận việc theo mã.

Mỗi mã việc thuộc **đúng một** phase; check **SC-PHASE-1** báo khi trùng hoặc sót.

**Đánh giá đầy đủ:** [AUDIT-2026-10-30-KIEN-TRUC](../audits/AUDIT-2026-10-30-KIEN-TRUC.md).
- Codebase đáp ứng **khoảng 50%** kiến trúc công bố: G1 77%, G2 60%, G3 0%.
- Lộ trình 33%, ma trận tuân thủ 59%.

## Danh sách (chụp 2026-10-30)

Cột "Tiến độ" là trung bình tín hiệu máy của các việc lộ trình trong phase — **sinh bằng `node scripts/tien-do-phase.mjs --write`**, không gõ tay; chấm khi bộ kiểm có CSDL test đã chạy test (`DATABASE_URL`, như job diagnostics của CI), vì tín hiệu `DG-*` cần dữ liệu. Phase không khai việc lộ trình (mở rộng, chờ đưa vào lộ trình) ghi "—": tiến độ đọc ở checklist của phase. <!-- [2026-11-02 06:49 PM Johnny Chu - Chu Hoàng Anh] TIEN-DO — cột Tiến độ sinh từ lộ trình máy đọc. --> Ký hiệu trạng thái: ☐ chưa làm · 🟡 có mã, chưa đủ tín hiệu · ✅ xong · ⛔ chờ chủ / người ngoài nhóm.

| Phase | Giai đoạn | Việc lộ trình | Checklist công bố | Code | Tiến độ | Trạng thái |
|---|---|---|---|---|---|---|
| [001 Chốt chuẩn](PHASE-001-CHOT-CHUAN/README.md) | 0 | 0.1–0.7 | G1-01, -02, -03, -11, -13, G2-10 | có | 68% | 🟡 còn việc tay của chủ: 0.1 duyệt chuẩn; 0.2 CI xanh (⛔ tài khoản GitHub khoá thanh toán); 0.6 bật Private Vulnerability Reporting; 0.7 bản cài thật đặt `DB_APP_USER=ketoan_app` |
| [002 Audit, phân lớp](PHASE-002-AUDIT-PHAN-LOP/README.md) | 1 | 1.1–1.5 | — | có | 60% | 🟡 1.1, 1.3 cần người |
| [003 Action, bằng chứng, MCP đọc](PHASE-003-ACTION-BANG-CHUNG-MCP-DOC/README.md) | 2 | 2.2, 2.5, 2.6, 2.9–2.13 | G1-04, -07, -09, G2-01, -02, -07, -08 | có | 100% | ✅ |
| [004 Một cửa ghi sổ](PHASE-004-MOT-CUA-GHI-SO/README.md) | 2 | 2.1 | — | có | 50% | ✅ 2026-10-30 |
| [005 Chính sách có phiên bản](PHASE-005-CHINH-SACH-CO-PHIEN-BAN/README.md) | 2 | 2.14 | G2-09 | có | 100% | ✅ 2026-10-30 (kế toán trưởng chưa ký ADR) |
| [006 Outbox sự kiện](PHASE-006-OUTBOX-SU-KIEN/README.md) | 3 | 3.4 | G2-05 | có | 100% | ✅ 2026-10-30 |
| [007 Cô lập đơn vị (RLS)](PHASE-007-CO-LAP-DON-VI-RLS/README.md) | 2 | 2.4 | G1-05, G3-06 | có | 100% | ✅ RLS mọi bảng có `tenant_id` (DG-PLAN-5 đạt); hiệu lực ở bản cài thật khi xong 0.7 (PHASE-001) |
| [008 Sao lưu PITR](PHASE-008-SAO-LUU-PITR/README.md) | 2 | 2.15 | G1-08, G3-07 | có | 50% | 🟡 máy dev ĐẠT; ⛔ bật + diễn tập máy chủ thật |
| [009 MCP ghi](PHASE-009-MCP-GHI/README.md) | 2 | 2.16 | G2-04 | có (2/3) | 100% | 🟡 `journal.post` ⛔ Q009-1 |
| [010 Tách gói Kernel](PHASE-010-TACH-GOI-KERNEL/README.md) | 2 | 2.3, 2.7, 2.8 | — | có | 100% | ✅ gói `@bizcity/platform`, `@bizcity/kernel` (2.3), đính kèm / phiên bản / chữ ký chung (2.7), bộ máy mua hàng thành `@bizcity/mua-hang-domain` (2.8, 02/11) |
| [011 Module SDK](PHASE-011-MODULE-SDK/README.md) | 3 | 3.1–3.3, 3.6, 3.10, 3.13–3.18 | G1-06, G1-10, G2-03 | có | 95% | ✅ 11/11 việc đủ tín hiệu; 3.15 `manual_journal` có mã (02/11, K1 / K3 / K4 duyệt) — còn K2: danh sách lý do journal cho gói nền chờ kế toán trưởng |
| [012 Gói định khoản, workflow](PHASE-012-GOI-DINH-KHOAN-WORKFLOW/README.md) | 3 | 3.5, 3.7, 3.11, 3.12 | — | có | 100% | ✅ 3.5, 3.7, 3.11, 3.12 đủ tín hiệu |
| [013 ui-kit, chuyển module](PHASE-013-UI-KIT-CHUYEN-MODULE/README.md) | 3 | 3.8, 3.9 | — | một phần | 75% | 🟡 3.8 `@bizcity/ui-kit` chưa; 3.9 `phan-he` → `modules` 50% |
| [014 CLI, template, ca chuẩn](PHASE-014-CLI-TEMPLATE-CA-CHUAN/README.md) | 4 | 4.1–4.7 | G3-02 | một phần | 52% | 🟡 4.7 preset 67%, 4.4 AGENTS.md trong template 50%; CLI, starter template, ca chuẩn, lane runtime chưa |
| [015 Cell, WordPress](PHASE-015-CELL-WORDPRESS/README.md) | 5 | 5.3, 5.3b, 5.4 | G1-12, G3-04 | chưa | 0% | ☐ cần Hub |
| [016 Tải lớn, adapter](PHASE-016-TAI-LON-ADAPTER/README.md) | 5 | 5.5, 5.9 | G2-06, G3-03, -05, -08, -09 | chưa | 0% | ☐ khi đo được nhu cầu |
| [017 Beta hệ sinh thái](PHASE-017-BETA-HE-SINH-THAI/README.md) | 5 | 5.1, 5.2, 5.6, 5.7, 5.8 | G3-01 | chưa | 0% | ☐ |
| [018 Giám sát vận hành, toàn vẹn sổ](PHASE-018-GIAM-SAT-VAN-HANH/README.md) | mở rộng 2.13 (PHASE-003) | — (chờ Q018-1) | — | nền có | — | ✅ W1–W5 có mã (20/24 việc); còn S018-4 đo trên máy chủ thật; ⛔ S018-18 (Q018-5), S018-19 (PHASE-015, Q018-6) |
| [019 Bàn điều tra cho nhà phát triển](PHASE-019-BAN-DIEU-TRA-NHA-PHAT-TRIEN/README.md) <!-- [2026-11-01 07:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — thêm dòng phase Bàn điều tra (Dev Console) + sổ tay điều tra lỗi. --> | mở rộng PHASE-018 | — (chờ Q019-4) | — | có | — | ✅ W1–W5 có mã 2026-11-02; ⛔ chờ chủ duyệt S019-3, S019-4, Q019-4 <!-- [2026-11-02 04:01 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — cập nhật trạng thái --> |
| [020 Kiểm chuẩn pháp lý Việt Nam](PHASE-020-KIEM-CHUAN-PHAP-LY-VN/README.md) <!-- [2026-11-01 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — thêm dòng phase bộ kiểm chuẩn pháp lý VN (VNCONF). --> | mở rộng 4.3 (PHASE-014) | — (chờ Q020-1) | — | nền có | — | 🟡 14/24 việc ✅ — Engine trên bản cài, hồ sơ kế toán, duyệt rulepack (ADR-0016), màn HT06 / HT07, kiểm mỗi đêm, rulepack thuế GTGT / hoá đơn; chờ chủ duyệt D020-1..6 |
| [021 Trạm tiền kiểm đầu vào](PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/README.md) <!-- [2026-11-02 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — thêm dòng phase Trạm tiền kiểm đầu vào (ADR-0014). --> | 2 | 2.17–2.21 | — | chưa | 100% | 🟡 W0–W5 xong 2026-11-03 (tiền kiểm L1–L5, bể chờ, Trạm kiểm tra, bảng điểm ACC94, DG-INTAKE-1, sự kiện intake, gợi ý cấu hình, action đọc AI); phần mã xong (kể cả S021-25 cảnh báo thuế / hoá đơn); còn S021-17 thực tập sinh thử thật, S021-21 kế toán trưởng đọc bài học <!-- [2026-11-03 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W3 xong --> <!-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W4 xong --> |
| [022 Bộ giả định lỗi và Bàn đánh giá theo vai](PHASE-022-GIA-DINH-LOI-DANH-GIA-THEO-VAI/README.md) <!-- [2026-11-02 07:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — thêm dòng phase giả định lỗi + Bàn đánh giá theo vai (kế toán trưởng, kiểm soát, thanh tra thuế). --> | 2 | — | — | chưa | — | 🟡 W0 tài liệu + bản mẫu 2026-11-02; chờ chủ duyệt D022-1..6 |
| [023 Thẻ tài khoản](PHASE-023-THE-TAI-KHOAN/README.md) <!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — thêm dòng phase thẻ tài khoản --> | 4 | 4.8 | — | chưa | 0% | 🟡 W0 tài liệu + bản mẫu 2026-11-02; chờ chủ duyệt D023-1..5, kế toán trưởng duyệt nội dung giải nghĩa |
| [024 Item Master & phân loại hạch toán](PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/README.md) <!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — thêm dòng phase Item Master (ADR-0017) --> | 2 | 2.22, 2.23 | — | chưa | 0% | 🟡 W0 tài liệu + bản mẫu 2026-11-02; ADR-0017 chấp nhận về nguyên tắc; chờ chủ duyệt D024-1..8; W2 là K3 (kế toán trưởng ký) |
| [025 Accounting Continuity](PHASE-025-ACCOUNTING-CONTINUITY/README.md) <!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — ADR-0021 Accounting Continuity --> | 2 | — | — | chưa | 0% | 🟡 W0 tài liệu + bản mẫu 2026-11-03; ADR-0021 đề xuất; chờ chủ duyệt D025-1..8; W1 lineage chỉ đọc chạy được trước PHASE-024 B2 |

Thứ tự và đường găng: [AUDIT §4](../audits/AUDIT-2026-10-30-KIEN-TRUC.md). Ba luật thứ tự của PHASES vẫn giữ:
- 2.1 (PHASE-004) trước 2.3 (PHASE-010);
- 3.4 (PHASE-006) trước 4.2 (PHASE-014);
- 4.5 trước 5.1 (PHASE-017).

## Khuôn một phase

| Tệp | Bắt buộc | Nội dung |
|---|---|---|
| `README.md` | có | Trạng thái, giai đoạn, code có chưa, mục tiêu, phụ thuộc. Hai dòng máy đọc `> **Việc lộ trình:** …` và `> **Checklist công bố:** …` (SC-PHASE-1). Thêm bảng "Hiện trạng đọc mã" (sự thật kèm `tệp:dòng`) và mục "Xong khi" |
| `40-MASTER-CHECKLIST.md` | có | Nguồn trạng thái **việc con** duy nhất: ID `S<nnn>-<n>`, cột Code / Trạng thái, ca bằng chứng `T<nnn>-<n>`, Log chỉ nối thêm |
| `00-MASTER-PLAN.md` | khi bắt đầu làm | Vì sao, sự thật đọc mã, quyết định `D<nnn>-*` (chủ duyệt), câu hỏi `Q<nnn>-*`, đợt W0… |
| `10-…`, `20-…` | tuỳ | Đánh giá, thiết kế chi tiết |
| `70-REFLECT-<phase trước>.md` | khi bắt đầu làm | Phản tư phase trước, sổ nợ `N<nnn>-*` chuyển sang |
| `90-DEPLOY-LIST.md` | khi phát hành | Commit, thứ tự triển khai, bước thử, đường lui |
| `evidence/`, `tools/`, `lanes/`, `mockups/` | tuỳ | Bằng chứng runtime, công cụ chỉ đọc, chia việc song song, bản mẫu giao diện |

**Hai nguồn trạng thái, không chồng nhau:**
- "Xong" của một **việc lộ trình** do bảng điểm tính từ tín hiệu (`node tests/conformance/selfcheck.mjs`), không ai tự khai.
- `40-MASTER-CHECKLIST` theo dõi **bước con** bên trong việc đó.

## Mở phase mới

1. Tạo `docs/phases/PHASE-<số kế tiếp>-<TEN-VIET-HOA>/` với `README.md` + `40-MASTER-CHECKLIST.md` theo khuôn trên.
2. Việc mới chưa có mã: thêm vào [roadmap.json](../standard/roadmap.json) + [PHASES.md](../standard/PHASES.md) (SC-RMP-1), nếu là việc cộng đồng nhận thì thêm mã G vào bản công bố §6.
3. Chuyển mã việc từ phase cũ sang thì xoá ở phase cũ (SC-PHASE-1 không cho một mã ở hai nơi).
4. Chạy `node tests/conformance/selfcheck.mjs`, phải ĐẠT.
