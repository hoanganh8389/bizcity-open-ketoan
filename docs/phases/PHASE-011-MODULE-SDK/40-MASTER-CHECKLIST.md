# PHASE-011 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S011-1 | Chốt 5 câu hỏi mở của API.md | 3.1 | chưa | ☐ |
| S011-2 | `@bizcity/module-sdk`: `defineModule`, `ctx` | 3.1 · G1-10 | chưa | ☐ |
| S011-3 | Manifest cho 9 phân hệ + 3 add-in, waiver A-17 có hạn | 3.2 | chưa | ☐ |
| S011-4 | Registry quyền mở theo module, màn Phân quyền nhóm theo module | 3.3 · G1-06 | chưa | ☐ |
| S011-5 | `settings.get` chạy thật | 3.6 | một phần | 🟡 registry + DG-SET-1 có |
| S011-6 | Vai trò CSDL `mod_<key>_rw` | 3.10 | chưa | ☐ |
| S011-7 | Extension chạy thật: slot, hook, `ctx.actions.call` | G2-03 | chưa | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
