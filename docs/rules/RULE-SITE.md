# RULE · Site và nâng cấp nhiều site (R-SITE)
<!-- [2026-11-21 08:12 PM Johnny Chu - Chu Hoàng Anh] R-SITE — luật mới theo ADR-0036: mỗi site một database + vai trò PostgreSQL riêng, một bản mã dùng chung, luật nâng cấp một bản mã cho mọi site -->

> **Cấp:** Tier 0 / 1 (ghi từng luật) · **Phiên bản:** 1.0 · 2026-11-21 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Nguồn:** [ADR-0036](../adr/ADR-0036-mot-ban-ma-moi-site-mot-database.md) · **Thi hành:** [PHASE-039](../phases/PHASE-039-NHIEU-CSDL-SITE-REGISTRY/README.md) · **Trạng thái:** chấp nhận 2026-11-21, **chưa có mã** — kiểm bằng ca `T039-*` khi từng bước xong.

> **Một bản mã, mỗi site một database, mỗi site một vai trò. Nâng cấp: build → migration từng site → chuyển ứng dụng → mọi site dùng mã mới.**

## 1. Mô hình

| Thành phần | Vai |
|---|---|
| **Frappe — Site Manager** (repo `bizcity-open-setup`) | Giao diện điều hành và quản lý site. Một Frappe site quản trị. Không giữ dữ liệu kế toán, không chạm PostgreSQL |
| **Open Kế Toán — ứng dụng dùng chung** (repo này) | Một bản mã. Site Registry + Database Router. Chạy được khi Frappe tắt |
| **PostgreSQL** | Mỗi site một database `kt_<slug>` + một cặp vai trò `kt_<slug>_owner` / `kt_<slug>_app` |

## 2. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-SITE-1** *(T0)* | **Site = database.** Mỗi site một database riêng. Đơn vị (`tenant_id`), chi nhánh, RLS giữ nguyên **bên trong** site; không thay RLS bằng database, không thay database bằng RLS | T039-2 |
| **R-SITE-2** *(T0)* | **Mỗi site một vai trò PostgreSQL riêng.** API của site chạy bằng `kt_<slug>_app` (không superuser, R-SEC-6); migration bằng `kt_<slug>_owner`. Vai trò của site này không có `CONNECT` vào database site khác. Mật khẩu vai trò sinh ngẫu nhiên, lưu mã hoá trong database điều khiển bằng khoá ở biến môi trường, không ghi vào nhật ký | test: vai trò site A `CONNECT` vào DB site B bị từ chối |
| **R-SITE-3** *(T0)* | **Đóng khi thiếu.** Ở `SITE_MODE=multi`, không có site trong ngữ cảnh yêu cầu thì không truy vấn nào chạy (`SITE_CONTEXT_MISSING`); tên miền lạ → 404 `SITE_NOT_FOUND`. Không bao giờ rơi về database mặc định | T039-4 |
| **R-SITE-4** *(T0)* | **Vé gắn site.** Vé đăng nhập và vé ứng dụng mang claim `sid`; `sid` khác site của tên miền → 401 | T039-3 |
| **R-SITE-5** | **Một bản mã.** Kernel, module, Rulepack không đọc mã site, không chọn database. Chỉ Database Router (`packages/platform/src/db/`) và tiến trình nền (`forEachSite`) biết có nhiều site | review; phép kiểm tĩnh (PHASE-039 B2) |
| **R-SITE-6** | **Bộ đệm theo site.** Mọi bộ đệm trong bộ nhớ có khoá theo đơn vị phải có thêm mã site (`tenant_id` có thể trùng giữa hai database) | phép kiểm tĩnh (S039-8) |
| **R-SITE-7** | **Open Kế Toán là chủ Site Registry.** Site Manager và mọi phía gọi khác chỉ đi qua Provisioning API `bizcity_site_provisioning@1`; không ai ngoài Open Kế Toán tạo / sửa / xoá database site | review; T039-10 |
| **R-SITE-8** *(T0)* | **Luật nâng cấp — thứ tự bắt buộc:** ① kéo mã → build → test (bản đang chạy vẫn phục vụ) ② một phiên bản mới ③ sao lưu database điều khiển ④ migration `kt_template`, rồi **từng** site (sao lưu trước mỗi site) ⑤ chuyển ứng dụng sang phiên bản mới ⑥ mọi site dùng chung mã mới. Không chuyển ứng dụng khi `kt_template` chưa nâng xong | `scripts/cap-nhat.sh` chế độ nhiều site (S039-18) |
| **R-SITE-9** *(T0)* | **Cổng lược đồ.** Ứng dụng chỉ phục vụ site có `schema_version` đúng bằng bản nó cần. Bản cũ gặp site đã nâng → 503 `SITE_UPGRADING`; bản mới gặp site nâng lỗi → 503 `SITE_MIGRATION_FAILED`. Không ghi gì khi lệch | T039-8 |
| **R-SITE-10** *(T0)* | **Lỗi một site không kéo site khác.** Migration lỗi ở một site: site đó `migration_failed`, dừng riêng, lượt nâng cấp đi tiếp site sau và in bảng tổng kết. Lùi một site = khôi phục bản sao lưu vừa tạo (R-REL-5: không có migration lùi) | T039-7 |
| **R-SITE-11** | **Migration viết cho nhiều site.** Migration không đọc tên database, tên vai trò cố định (`ketoan`, `ketoan_app`) hay tên miền; quyền cấp cho vai trò lấy từ tham số của runner. Migration dài (hàng triệu dòng) phải nói rõ thời gian ước tính trong PR, vì nhân với số site | review (R-DB) |
| **R-SITE-12** *(T0)* | **Xoá mềm.** Xoá site cần site đang khoá + bản sao lưu ≤ 24 giờ đã kiểm; database đổi tên giữ 30 ngày rồi mới `DROP` | T039-12 |
| **R-SITE-13** | **Bản quyền không chặn sổ.** Khoá `biz-…` hết hạn / thiếu chỉ hiện dải đỏ; không chặn ghi sổ, báo cáo, API, sao lưu (D039-17) | T039-13 |

## 3. Đổi X thì sửa Y

| Đổi | Sửa cùng PR |
|---|---|
| `packages/platform/src/db/client.ts`, `migrate.ts`, `module-db.ts` | R-SITE-3, -5; ca T039-1..8 phải xanh |
| Thêm migration | kiểm R-SITE-11; ghi thời gian ước tính nếu dài |
| `scripts/cap-nhat.sh`, `sao-luu.sh` | R-SITE-8, -10; [trien-khai.md §6](../trien-khai.md) |
| Hợp đồng Provisioning | bản ở PHASE-039 §30 (sau B5: `docs/contracts/`) và phía gọi `bizcity-open-setup` |
