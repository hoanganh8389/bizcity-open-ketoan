# PHASE-011 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->
<!-- [2026-11-01 10:16 PM Johnny Chu - Chu Hoàng Anh] ADR-0011 — S011-8…10 theo ADR-0011 -->

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
| S011-8 | Registry module + vòng đời, nạp theo hash (ADR-0011 D1, D2) — PR-3 | 3.13 | chưa | ☐ |
| S011-9 | App ngoài tiến trình: khoá phạm vi, webhook HMAC, vé iframe + `postMessage` (ADR-0011 mức 2) — PR-2b | 3.14 | chưa | ☐ |
| S011-10 | Migration module bằng vai trò `mod_<key>_owner`, kiểm RLS bảng module trước khi bật (ADR-0011 D4) — PR-4 | 3.10 | chưa | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
| 2026-11-01 22:16 | Claude Code | Chủ duyệt ADR-0011 (plugin ba mức tin cậy, không drop-in, iframe cho app ngoài tiến trình). Thêm 3.13, 3.14 vào lộ trình; S011-8…10. |
