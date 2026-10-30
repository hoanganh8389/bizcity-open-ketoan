# Thư mục phase

Mỗi phase là **một gói việc** có thư mục riêng: kế hoạch, sự thật đọc mã, checklist con, bằng chứng. Phase gom các việc của hai danh sách đã có:
- **Lộ trình** [PHASES.md](../standard/PHASES.md) / [roadmap.json](../standard/roadmap.json): mã `0.1`…`5.9`, trạng thái do máy tính.
- **Checklist công bố** [CONG-BO-KIEN-TRUC §6](../CONG-BO-KIEN-TRUC.md): mã `G1-01`…`G3-09`, cộng đồng nhận việc theo mã.

Mỗi mã việc thuộc **đúng một** phase; check **SC-PHASE-1** báo khi trùng hoặc sót.

**Đánh giá đầy đủ:** [AUDIT-2026-10-30-KIEN-TRUC](../audits/AUDIT-2026-10-30-KIEN-TRUC.md).
- Codebase đáp ứng **khoảng 50%** kiến trúc công bố: G1 77%, G2 60%, G3 0%.
- Lộ trình 33%, ma trận tuân thủ 59%.

## Danh sách (chụp 2026-10-30)

Cột "Tiến độ" là trung bình tín hiệu máy của các việc lộ trình trong phase. Ký hiệu trạng thái: ☐ chưa làm · 🟡 có mã, chưa đủ tín hiệu · ✅ xong · ⛔ chờ chủ / người ngoài nhóm.

| Phase | Giai đoạn | Việc lộ trình | Checklist công bố | Code | Tiến độ | Trạng thái |
|---|---|---|---|---|---|---|
| [001 Chốt chuẩn](PHASE-001-CHOT-CHUAN/README.md) | 0 | 0.1–0.7 | G1-01, -02, -03, -11, -13, G2-10 | có | 73% | 🟡 còn 3 việc tay của chủ |
| [002 Audit, phân lớp](PHASE-002-AUDIT-PHAN-LOP/README.md) | 1 | 1.1–1.5 | — | có | 60% | 🟡 1.1, 1.3 cần người |
| [003 Action, bằng chứng, MCP đọc](PHASE-003-ACTION-BANG-CHUNG-MCP-DOC/README.md) | 2 | 2.2, 2.5, 2.6, 2.9–2.13 | G1-04, -07, -09, G2-01, -02, -07, -08 | có | 100% | ✅ |
| [004 Một cửa ghi sổ](PHASE-004-MOT-CUA-GHI-SO/README.md) | 2 | 2.1 | — | có | 100% | ✅ 2026-10-30 |
| [005 Chính sách có phiên bản](PHASE-005-CHINH-SACH-CO-PHIEN-BAN/README.md) | 2 | 2.14 | G2-09 | chưa | 0% | ⛔ ADR-0009 chờ duyệt |
| [006 Outbox sự kiện](PHASE-006-OUTBOX-SU-KIEN/README.md) | 3 | 3.4 | G2-05 | có | 100% | ✅ 2026-10-30 |
| [007 Cô lập đơn vị (RLS)](PHASE-007-CO-LAP-DON-VI-RLS/README.md) | 2 | 2.4 | G1-05, G3-06 | chưa | 0% | ☐ làm song song được |
| [008 Sao lưu PITR](PHASE-008-SAO-LUU-PITR/README.md) | 2 | 2.15 | G1-08, G3-07 | có | 50% | 🟡 máy dev ĐẠT; ⛔ bật + diễn tập máy chủ thật |
| [009 MCP ghi](PHASE-009-MCP-GHI/README.md) | 2 | 2.16 | G2-04 | có (2/3) | 100% | 🟡 `journal.post` ⛔ Q009-1 |
| [010 Tách gói Kernel](PHASE-010-TACH-GOI-KERNEL/README.md) | 2 | 2.3, 2.7, 2.8 | — | chưa | 0% | ☐ sau 004 |
| [011 Module SDK](PHASE-011-MODULE-SDK/README.md) | 3 | 3.1, 3.2, 3.3, 3.6, 3.10 | G1-06, G1-10, G2-03 | một phần | 10% | 🟡 |
| [012 Gói định khoản, workflow](PHASE-012-GOI-DINH-KHOAN-WORKFLOW/README.md) | 3 | 3.5, 3.7, 3.11, 3.12 | — | một phần | 13% | 🟡 |
| [013 ui-kit, chuyển module](PHASE-013-UI-KIT-CHUYEN-MODULE/README.md) | 3 | 3.8, 3.9 | — | một phần | 25% | 🟡 |
| [014 CLI, template, ca chuẩn](PHASE-014-CLI-TEMPLATE-CA-CHUAN/README.md) | 4 | 4.1–4.7 | G3-02 | một phần | 17% | 🟡 |
| [015 Cell, WordPress](PHASE-015-CELL-WORDPRESS/README.md) | 5 | 5.3, 5.3b, 5.4 | G1-12, G3-04 | chưa | 0% | ☐ cần Hub |
| [016 Tải lớn, adapter](PHASE-016-TAI-LON-ADAPTER/README.md) | 5 | 5.5, 5.9 | G2-06, G3-03, -05, -08, -09 | chưa | 0% | ☐ khi đo được nhu cầu |
| [017 Beta hệ sinh thái](PHASE-017-BETA-HE-SINH-THAI/README.md) | 5 | 5.1, 5.2, 5.6, 5.7, 5.8 | G3-01 | chưa | 0% | ☐ |

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
