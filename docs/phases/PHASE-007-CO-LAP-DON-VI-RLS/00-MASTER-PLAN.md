# PHASE-007 — Cô lập đơn vị ở tầng CSDL (RLS)
<!-- [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — cô lập đơn vị bằng RLS. -->

> **Ký hiệu:** ☐ chưa làm · 🟡 có mã + test · ✅ có bằng chứng · ⛔ chờ chủ · ❌ huỷ.
> Luật: STD-DATA-1, R-SEC-6, audit A-23. Việc: lộ trình 2.4, G1-05, G3-06.

<!-- [2026-10-30 09:23 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — Chủ: "tiếp tục" sau PHASE-005 ⇒ làm 007 (không cần quyết định thêm). -->

## 1. Thiết kế (D007-*)

| # | Quyết định | Lý do |
|---|---|---|
| D007-1 | Gắn đơn vị **lúc mượn kết nối**: pool của API (`db/client.ts`) đặt `bizcity.tenant_id` = đơn vị trong ngữ cảnh yêu cầu (AsyncLocalStorage, gán sau xác thực); ghi nhớ theo kết nối nên chỉ tốn thêm một câu khi đơn vị đổi | không phải sửa hàng trăm truy vấn / giao dịch; mọi truy vấn trong một yêu cầu đều được gắn |
| D007-2 | Migration `0041`: **mọi** bảng có `tenant_id` (84) ENABLE + FORCE RLS + chính sách `tenant_isolation` (USING + WITH CHECK) qua hàm `bizcity_tenant_visible(tenant_id)`; liệt kê từng bảng (SC-DATA-6 đọc tĩnh) | FORCE để áp cả cho vai trò sở hữu; WITH CHECK chặn ghi chéo |
| D007-3 | Kết nối **chưa gắn** đơn vị thì không lọc | migration, seed, dispatcher sự kiện (chạy cho mọi đơn vị), đăng nhập (tra người dùng trước khi biết đơn vị), script vận hành chạy như cũ. RLS chặn lỗi "truy vấn trong yêu cầu quên lọc", không thay kiểm quyền |
| D007-4 | Bật cả bảng Kernel (sổ cái) sau khi đo (§2) | chi phí chấp nhận được; sổ là chỗ cần cô lập nhất |
| D007-5 | `DB_SET_ROLE` (test / CI): pool chuyển sang `ketoan_app` sau khi kết nối (`set_config('role', $1, false)`) | superuser luôn vượt RLS — không có cách này thì test không kiểm được RLS thật mà không phải bật đăng nhập cho vai trò trong cluster |
| D007-6 | `runMigrations` dùng kết nối riêng (`pg.Client`), không mượn pool của API | kết nối trong pool có thể đã đổi vai trò / gắn đơn vị; migration cần quyền DDL và thấy đủ mọi đơn vị |

| D007-7 | View danh mục `bizcity_read.*` (0044) cùng khuôn sổ cái (0043): `security_invoker` (RLS bảng gốc vẫn áp), trigger `INSTEAD OF` chặn ghi, cột tường minh. Theo **mã** (kho → `branch_code`, chi nhánh → `parent_code`), không `id`. Không đưa thuộc tính hạch toán của Kernel (nhóm hạch toán, tài khoản kho / thuế / phương thức thanh toán, nhóm giá vốn) và dữ liệu cá nhân không cần cho nghiệp vụ chung (tài khoản ngân hàng, ngày sinh, giới tính); liên hệ có, chú thích PII | BIZCITY-DATA §3, STD-DATA-6, STD-DATA-10; AGENTS câu 4 |
<!-- [2026-10-31 11:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-007 — D007-7: khung nhìn danh mục bizcity_read (0044) -->

## 2. Số đo hiệu năng (S007-3)

Bảng thử 1 triệu dòng, một đơn vị 600.000 dòng, đúng chính sách của 0041, PostgreSQL 16 (máy dev), trung vị 5 lần `EXPLAIN ANALYZE`:

| Truy vấn | Không RLS (vai trò sở hữu) | Có RLS (`ketoan_app`, đã gắn đơn vị) |
|---|---|---|
| Tổng hợp theo tài khoản cả năm (quét 600.000 dòng) | 65–77 ms | 108–122 ms |
| Một tháng (lọc ngày, dùng chỉ mục) | 19 ms | 16 ms |
| Lọc một tài khoản | 17 ms | 22 ms |

- Chi phí ≈ **75 ns mỗi dòng phải quét**; truy vấn có điều kiện dùng chỉ mục gần như không đổi.
- Thử hai cách viết khác (`COALESCE` có / không subselect): **chậm gấp đôi** (planner bỏ kế hoạch tốt) → giữ hàm SQL STABLE `bizcity_tenant_visible`.
- Với 30.000 chứng từ / ngày (~90.000 dòng sổ / ngày): quét thô một tháng thêm ~0,2 giây. Báo cáo đọc `ledger_balances_daily` nên ít bị ảnh hưởng.
- Nếu sau này đo trên dữ liệu thật thấy chậm: gỡ RLS riêng `ledger_lines` bằng migration mới + ADR (sổ vẫn được bảo vệ ở `ledger_entries`).

## 3. Giới hạn đã biết

| # | Giới hạn | Gỡ khi nào |
|---|---|---|
| L007-1 | **Bản cài dùng vai trò sở hữu mặc định (superuser) thì RLS không có hiệu lực** | chủ đặt `DB_APP_USER=ketoan_app` (S001-7) |
| L007-2 | Kết nối chưa gắn đơn vị thì thấy mọi đơn vị (D007-3) | khi tách tiến trình nền có vai trò riêng (Phase 5) |
| L007-3 | Bảng con không có `tenant_id` (SC-DATA-5: 4 bảng) chỉ được bảo vệ qua bảng cha | thêm cột khi đụng tới |
| L007-4 | Chạy cả bộ test dưới `DB_SET_ROLE=ketoan_app`: 6 test cần quyền sở hữu (TRUNCATE ra "permission denied" — còn chặt hơn; giả lập sửa ngầm cần superuser) | là đặc tính của vai trò, không phải lỗi; CI chạy bằng vai trò sở hữu, RLS kiểm ở `tenant-isolation.test.ts` |
