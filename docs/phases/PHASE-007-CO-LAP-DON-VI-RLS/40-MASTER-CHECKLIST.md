# PHASE-007 · 40 — Master checklist

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S007-1 | Kết nối của yêu cầu gắn `bizcity.tenant_id` (pool `db/client.ts` + ngữ cảnh yêu cầu gán sau xác thực) | 2.4 | có | ✅ |
| S007-2 | RLS + FORCE + chính sách cho mọi bảng có `tenant_id` (84, migration 0041) | 2.4 · G1-05 | có | ✅ SC-DATA-6 100% |
| S007-3 | Đo hiệu năng RLS trên bảng sổ rồi mới bật | 2.4 | có | ✅ [00 §2](00-MASTER-PLAN.md): ~75 ns / dòng quét; giữ cho mọi bảng |
| S007-4 | Schema `bizcity_read` + view danh mục; migration theo module | 2.4 | chưa | ☐ |
| S007-5 | DG-PLAN-5 thành kiểm thật + tự chẩn đoán `TENANT_ISOLATION` | 2.4 | có | ✅ |
| S007-6 | Thử tấn công chéo đơn vị qua API, MCP, SQL | G3-06 | có | ✅ `test/tenant-isolation.test.ts` 6 ca (đủ 6 dưới `DB_SET_ROLE`) |
| S007-7 | Bản cài thật: API chạy bằng `ketoan_app` | — | — | ⛔ chủ (cùng S001-7) |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
| 2026-10-30 | Claude Code | Code S007-1, -2, -3, -5, -6. Chạy CẢ BỘ test trên CSDL mới dưới `ketoan_app` + RLS: 724/730, 6 lỗi đều do quyền của vai trò (không phải RLS chặn nhầm) — không chỗ nào cố ý đọc chéo đơn vị. Sửa phát sinh: `runMigrations` mượn pool có thể đã đổi vai trò → kết nối riêng. |
| 2026-10-30 | Claude Code | vitest đầy đủ trên `ketoan_test` (có 0041): 93/93 tệp, 735 xanh, 1 bỏ qua (test pool chỉ chạy dưới `DB_SET_ROLE` — đã đạt riêng). Lane diagnostics: DG-PLAN-5 100 (84 bảng); DG-SEC-2 vẫn báo vì CSDL dev / test dùng superuser (L007-1). Lộ trình 42%. |
