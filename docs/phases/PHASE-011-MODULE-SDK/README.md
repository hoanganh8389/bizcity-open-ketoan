# PHASE-011 — Module SDK, manifest, quyền theo module, settings, vai trò CSDL theo module
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->

> **Trạng thái:** 🟡 bản nháp API + registry settings có; SDK, manifest, quyền theo module chưa
> **Giai đoạn:** Phase 3 của [PHASES](../../standard/PHASES.md) · **Code:** một phần · **Tiến độ tín hiệu (2026-10-30):** 10%
> **Mục tiêu:** Module viết chỉ bằng `@bizcity/module-sdk`; mỗi phân hệ có `bizcity.module.json`; quyền đăng ký theo module; module không ghi được bảng Kernel ở tầng CSDL.
> **Việc lộ trình:** 3.1, 3.2, 3.3, 3.6, 3.10
> **Checklist công bố:** G1-06, G1-10, G2-03
> **Tuân thủ / nguyên tắc:** C-7 (33%) · AP-1, AP-3
> **Phụ thuộc phase:** 010

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | 0/9 phân hệ có `bizcity.module.json`; manifest mẫu ở ca chuẩn | `docs/standard/examples/hop-dong.bizcity.module.json` |
| F2 | Registry khoá cấu hình có và được kiểm (DG-SET-1 đạt) nhưng chưa có `settings.get` chung | `docs/contracts/bizcity-settings.registry.json` |
| F3 | Quyền là danh sách cố định; năng lực `permissions.module` planned | `modules/access/` |
| F4 | API SDK còn 5 câu hỏi mở | `packages/module-sdk/API.md` §6 |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 3.1 ☐ · 3.2 ☐ · 3.3 ☐ · 3.6 🟡 · 3.10 ☐.
