# PHASE-028 · 40 — Master checklist
<!-- [2026-11-05 06:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — master checklist: S028-1..5 (W0), log -->

> Nguồn trạng thái **việc con** duy nhất của phase. Ký hiệu: ☐ chưa làm · 🟡 có mã/tài liệu, chưa đủ tín hiệu · ✅ đủ tín hiệu · ⛔ chờ chủ.

## Việc con

| ID | Việc | Đợt | Ưu tiên | Trạng thái |
|---|---|---|---|---|
| S028-1 | W0: AS-IS audit có `file:line` ([10](10-AS-IS-AUDIT.md)) | W0 | P0 | ✅ 2026-11-05 |
| S028-2 | W0: Master plan, 10 quyết định D-AUTH-01..10 có phương án đề xuất ([00](00-MASTER-PLAN.md)) | W0 | P0 | ✅ 2026-11-05 |
| S028-3 | W0: ADR-0027 (Đề xuất) | W0 | P0 | ✅ 2026-11-05 |
| S028-4 | Chủ dự án duyệt D-AUTH-01..10 | W0 | P0 | ⛔ chờ chủ |
| S028-5 | PR tài liệu W0 merge vào `main` (R-FLOW) | W0 | P0 | ⛔ chờ PR |
| S028-6 | W1: `user_role_assignments` + bump `session_version` khi đổi `users.role` | W1 | P0 | ☐ chờ S028-4 |
| S028-7 | W2: `module_grants`, bỏ owner auto-grant quyền module | W2 | P0 | ☐ chờ S028-4, K3 |
| S028-8 | W3: đóng 17 route ghi thô còn lại, `requireScope()` | W3 | P1 | ☐ |
| S028-9 | W4: Role Editor UI (mã màn — Q028-1) | W4 | P1 | ☐ |
| S028-10 | W5: TGS mapping 349 mã + luồng mẫu Warehouse transfer | W5 | P1 | ☐ |
| S028-11 | W6: S-5..S-n vào pillar VII `tru-cot.json`, SC-AUTH-01..12 | W6 | P1 | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-11-05 | Claude Code | Mở phase từ đề bài chủ dự án; W0 audit + master plan + ADR-0027 (Đề xuất). Không giữ chỗ code — chờ duyệt D-AUTH-01..10 theo đúng R-FLOW và đề bài §0/§6. |
