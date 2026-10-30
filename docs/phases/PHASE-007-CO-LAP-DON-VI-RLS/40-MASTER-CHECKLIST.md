# PHASE-007 · 40 — Master checklist

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S007-1 | `ctx.data.tx` đặt `SET LOCAL bizcity.tenant_id` | 2.4 | chưa | ☐ |
| S007-2 | RLS cho bảng module (mới, nhỏ) trước | 2.4 · G1-05 | chưa | ☐ |
| S007-3 | Đo hiệu năng RLS trên bảng Kernel với dữ liệu 30.000 chứng từ / ngày rồi mới bật | 2.4 | chưa | ☐ |
| S007-4 | Schema `bizcity_read` + view danh mục; migration theo module | 2.4 | chưa | ☐ |
| S007-5 | DG-PLAN-5 thành kiểm thật | 2.4 | chưa | ☐ |
| S007-6 | Thử tấn công chéo đơn vị qua API, MCP, SQL | G3-06 | chưa | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
