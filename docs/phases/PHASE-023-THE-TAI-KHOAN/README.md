# PHASE-023 — Thẻ tài khoản: chú giải tại chỗ, bản chất tài khoản, đào tạo bằng số thật của đơn vị
<!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — mở phase theo chỉ đạo chủ dự án: người dùng hiểu bản chất tài khoản (vì sao lưỡng tính…) ngay chỗ đang làm; vừa chú giải, vừa đào tạo; gắn với luật ghi sổ, audit, lỗi -->

> **Trạng thái:** 🟡 W0 tài liệu + bản mẫu 2026-11-02 · chờ chủ duyệt D023-1..5, kế toán trưởng duyệt nội dung giải nghĩa · **Code:** chưa
> **Giai đoạn:** Phase 4 của [PHASES](../../standard/PHASES.md) (tài liệu, template, công cụ cho người dùng) · **Mức Kernel:** K0 — không đổi định khoản, không đổi sổ; chỉ thêm danh mục giải nghĩa, một API đọc, màn, check tài liệu
> **Mục tiêu:** Người dùng hiểu **bản chất** của tài khoản (tăng bên nào, dư bên nào, vì sao lưỡng tính, vì sao bắt buộc đối tượng) **ngay chỗ đang thao tác**, bằng **số thật của đơn vị mình**; mọi lần bị chặn hay cảnh báo đều có nút "Vì sao?" dẫn về bản chất; có chế độ học và bài theo vai.
> **Việc lộ trình:** 4.8
> **Checklist công bố:** —
> **Tuân thủ / nguyên tắc:** R-FIX (PHASE-022: cảnh báo nào cũng có phương án) · R-DIAG-6 (cảnh báo không lộ số liệu ngoài phạm vi quyền) · R-VNC-10 (giải thích để người dùng quyết, không chặn ngoài Tier 0) · nội dung giải nghĩa do **kế toán trưởng duyệt** như rulepack (ADR-0016)
> **Phụ thuộc phase:** 022 (`remedy`, Bàn đánh giá), 020 (kho căn cứ pháp lý `docs/can-cu`) · **Liên quan:** 024 (thẻ mặt hàng cùng khuôn), 021 (bảng điểm đầu vào → gợi ý bài học)
> **Nguồn yêu cầu:** chủ dự án 2026-11-02 — *"để người dùng hiểu sâu hơn về bản chất của các tài khoản, vì sao lại là tài khoản lưỡng tính chẳng hạn… UI UX dễ dùng, dễ hiểu, vừa chú giải, vừa đào tạo… tạo phase để phát triển riêng cho thẻ tài khoản vì đây thuộc về bản chất của kế toán và cũng liên quan đến các rule ghi sổ, audit, bug lỗi."*

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | ba lớp của thẻ, năm chỗ đặt, danh mục giải nghĩa máy đọc, chế độ học, bài theo vai, D023-*, Q023-*, đợt W0–W3 |
| [30-UI-UX](30-UI-UX.md) | thẻ tài khoản (chữ T, số thật tách dư Nợ / dư Có), ô chọn tài khoản có chú giải, nút "Vì sao?" ở lỗi, chế độ học, trang bài học |
| [mockups/the-tai-khoan.html](mockups/the-tai-khoan.html) | bản mẫu tĩnh: thẻ 131 (lưỡng tính) · thẻ 1111 · nút Vì sao ở lỗi · ô chọn có chú giải |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | việc con `S023-*`, ca bằng chứng `T023-*`, log |

## Hiện trạng (đọc mã, 2026-11-02)

| Có sẵn | Ở đâu | Thiếu |
|---|---|---|
| Hệ thống tài khoản có `normal_side` (`debit` / `credit` / `both` = lưỡng tính), `track_partner`, `is_debt`, `is_posting` | `accounts` (0002), màn ACC1 | **giải nghĩa**: tài khoản này theo dõi gì, tăng / giảm bên nào, vì sao lưỡng tính, lên chỉ tiêu nào |
| Sổ chặn tài khoản theo dõi đối tượng thiếu đối tượng; kiểm `ACCOUNT_WRONG_SIDE` (số dư trái bên) | `ledger.service.ts`, PHASE-022 W2 | lỗi chỉ nói "bắt buộc phải chọn đối tượng", không nói **vì sao** |
| Nút "? Hướng dẫn" theo màn (`PageHeader helpKey` → `docs/huong-dan/*.md`), hướng dẫn `tai-khoan.md`, `so-du-tai-khoan.md`, `dao-tao-theo-vai-tro.md` | web, docs | hướng dẫn theo **màn**, không theo **tài khoản**; không có số thật |
| Kho căn cứ pháp lý máy đọc (`docs/can-cu`, `06-tai-khoan-bao-cao-tai-chinh.md`) | PHASE-020 | chưa nối tới từng tài khoản |
| `ledger.query`, khung nhìn `bizcity_read.ledger_entries` | PHASE-012 | API "số dư Nợ / Có **tách theo đối tượng**" của một tài khoản |
| Bảng điểm đầu vào theo người lập (thiết kế) | PHASE-021 W4 | gợi ý bài học theo lỗi hay mắc |

## Xong khi

4.8 **done**: năng lực `ui.account-card` available; danh mục giải nghĩa phủ **mọi tài khoản cấp 1–2 có phát sinh** trong gói nền (SC-ACC-1 block); thẻ ở ACC1, ô chọn, sổ chi tiết, thông báo lỗi; chế độ học; ≥ 3 bài theo vai chạy trên tenant mẫu; nội dung được kế toán trưởng duyệt (trạng thái `approved` trong tệp).
