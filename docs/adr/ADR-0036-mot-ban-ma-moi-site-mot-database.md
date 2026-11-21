# ADR-0036 · Một bản mã dùng chung, mỗi site một database PostgreSQL và một vai trò riêng; Frappe chỉ là Site Manager
<!-- [2026-11-21 08:12 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — ADR-0036 chấp nhận: mô hình triển khai nhiều site (Frappe Site Manager · Open Kế Toán dùng chung · mỗi site một database + vai trò PostgreSQL riêng); luật nâng cấp một bản mã cho mọi site -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

- Trạng thái: **Chấp nhận** (chủ dự án, 2026-11-21).
- Nguồn: chủ dự án 2026-11-21 — *"Frappe = giao diện điều hành và quản lý site. Open Kế Toán = ứng dụng kế toán dùng chung, độc lập với Frappe. PostgreSQL = mỗi site một database, một chuỗi có thể có hàng trăm cửa hàng."* · *"Vai trò PostgreSQL riêng cho từng site, chung code open-ketoan, khác db."*
- Ngày: 2026-11-21 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: ADR **K0** (nguyên tắc + ranh giới). Thi hành có phần **K3** (lớp CSDL nền, xác thực, migration runner) — làm theo bước của [PHASE-039](../phases/PHASE-039-NHIEU-CSDL-SITE-REGISTRY/README.md).
- Luật liên quan: [R-SITE](../rules/RULE-SITE.md) (mới), [R-TEN](../rules/RULE-TENANT-SECURITY.md), [R-REL](../rules/RULE-RELEASE.md), [R-BAK](../rules/RULE-INFRASTRUCTURE.md), [R-SEC](../rules/RULE-SECURITY.md).
- Phía gọi: repo `bizcity-open-setup` (app Frappe `bizcity_site_manager`, ADR-0001 bên đó).

## Bối cảnh

Hôm nay (main `0734feef`) Open Kế Toán chạy với **một** `DATABASE_URL` và **một** pool PostgreSQL. Nhiều đơn vị ở chung một database, tách bằng `tenant_id` + RLS (PHASE-007). Sao lưu, cập nhật, migration đều giả định một database.

Bizcity cần cho thành viên tự tạo phần mềm kế toán: mỗi doanh nghiệp, mỗi chuỗi có sổ riêng. Lần thử ngày 2026-11-21 cài ERPNext cho từng khách trên Frappe là sai sản phẩm và sinh ra hai hệ multisite song song.

## Quyết định

### Mô hình triển khai

```text
┌──────────────────────────────────────────────────────────────┐
│  FRAPPE — SITE MANAGER (repo bizcity-open-setup)             │
│  Một Frappe site quản trị · database quản trị riêng (MariaDB) │
└──────────────────────────────┬───────────────────────────────┘
                               │ Provisioning API bizcity_site_provisioning@1
                               ▼
┌──────────────────────────────────────────────────────────────┐
│  OPEN KẾ TOÁN — ỨNG DỤNG DÙNG CHUNG (repo này)               │
│  Một bản mã từ GitHub · React + Fastify + Accounting Kernel  │
│  Site Registry + Database Router                             │
└────────────┬──────────────────────┬──────────────────────┬───┘
             ▼                      ▼                      ▼
      SITE A  a.<miền>       SITE B  b.<miền>       SITE C  c.<miền>
      DB A · vai trò A       DB B · vai trò B       DB C · vai trò C
      chuỗi 500 cửa hàng     chuỗi 20 cửa hàng      1 cửa hàng
```

1. **Ba vai, không lẫn.** Frappe = giao diện điều hành và quản lý site. Open Kế Toán = ứng dụng kế toán dùng chung, **độc lập với Frappe** (chạy được khi Frappe tắt). PostgreSQL = mỗi site một database.
2. **Site ≠ đơn vị.** Site = một tên miền (hoặc nhiều) + một database. Đơn vị (`tenant_id`), chi nhánh, RLS **giữ nguyên bên trong** site. Hai lớp cô lập: database theo site, RLS theo đơn vị.
3. **Mỗi site một vai trò PostgreSQL riêng.** Mỗi site có vai trò chủ (`kt_<slug>_owner`, chạy migration) và vai trò ứng dụng (`kt_<slug>_app`, API chạy bằng vai trò này, không superuser, R-SEC-6). Vai trò của site A **không có quyền** `CONNECT` vào database của site B. Lộ mật khẩu một site không lộ site khác.
4. **Một bản mã cho mọi site.** Mã nghiệp vụ, Accounting Kernel, Module SDK, Rulepack dùng chung. Tạo một kế toán mới = cấp một database + một cặp vai trò, **không** dựng thêm ứng dụng, **không** tạo thêm Frappe site.
5. **Open Kế Toán là chủ Site Registry.** Registry (domain → database, vai trò, trạng thái, phiên bản lược đồ) nằm trong database điều khiển của Open Kế Toán. Site Manager giữ bản điều hành, gọi Provisioning API, không chạm PostgreSQL.
6. **Bản cài một công ty không đổi.** `SITE_MODE=single` (mặc định) là một site ngầm định lấy từ `DATABASE_URL`, đi cùng một đường mã với chế độ nhiều site.

### Luật nâng cấp: một bản mã cho mọi site

```text
GitHub: open-ketoan
        ↓
Kéo mã · build · test                      (bản đang chạy vẫn phục vụ)
        ↓
Một phiên bản Open Kế Toán mới
        ↓
Migration từng site DB                     (kt_template trước, rồi từng site; sao lưu trước mỗi site)
        ↓
Chuyển ứng dụng sang phiên bản mới
        ↓
Tất cả site dùng chung mã mới
```

Thi hành bằng **cổng lược đồ**: ứng dụng chỉ phục vụ site có phiên bản lược đồ đúng bằng bản nó cần. Bản cũ gặp site đã nâng → `SITE_UPGRADING`. Bản mới gặp site nâng lỗi → `SITE_MIGRATION_FAILED`, chỉ site đó dừng. Không có migration lùi (R-REL-5): lùi một site = khôi phục bản sao lưu vừa tạo. Luật chi tiết: [R-SITE-8..11](../rules/RULE-SITE.md).

### Khoá `biz-…` và tên miền

- Khoá `biz-…` do plugin `bizcity-llm-router` cấp. Trong Open Kế Toán nó là **khoá bản quyền chỉ để cảnh báo**: hết hạn thì site vẫn dùng đầy đủ, mọi màn có dải đỏ (D039-17).
- Tên miền gốc là cấu hình động (`btnet.vn`, `bizcity.vn`, `*.<miền>` bất kỳ); registry nhận mọi tên miền (D039-18).

## Hệ quả

**Được:**
- Sao lưu, khôi phục, chuyển máy, xoá theo từng khách là thao tác có sẵn của PostgreSQL. Chuỗi 500 cửa hàng không làm chậm site 1 cửa hàng.
- Cập nhật một lần cho mọi site; không nuôi nhiều bản mã.
- Kernel, module, Rulepack không biết có nhiều database: biến `db` tự chọn pool theo site của yêu cầu.
- Lộ thông tin đăng nhập CSDL của một site không chạm site khác (vai trò riêng).

**Mất / phải trả:**
- Lớp CSDL nền (`packages/platform/src/db/client.ts`), xác thực (thêm claim `sid`), migration runner, tiến trình nền đều phải đổi (K3).
- Số kết nối PostgreSQL tăng theo số site: cần pool có trần, tự đóng khi rảnh; PgBouncer khi vượt 50 site.
- Database điều khiển giữ mật khẩu vai trò của từng site: phải mã hoá bằng khoá ngoài database (biến môi trường), không ghi vào nhật ký.
- Một lần nâng cấp chạy migration N lần; thời gian gián đoạn của mỗi site tính từ lúc nó được nâng tới lúc chuyển ảnh.

**Việc phải làm:** B1..B7 của PHASE-039.

## Phương án đã cân nhắc

| Phương án | Vì sao bỏ |
|---|---|
| Một database chung cho mọi khách, tách bằng `tenant_id` | Sao lưu / khôi phục / xoá riêng một khách rất khó; một khách lớn ảnh hưởng mọi khách; một lỗi RLS là lộ chéo toàn hệ |
| Một schema mỗi site trong cùng database | Sao lưu và chuyển máy riêng vẫn khó; `search_path` dễ sai; RLS hiện có viết theo bảng trong `public` |
| Mỗi site một bản ứng dụng (container) riêng | Nhân bản mã, nhân bản cập nhật; đúng thứ chủ dự án muốn tránh |
| Dùng chung vai trò `ketoan` / `ketoan_app` cho mọi site | Lộ một mật khẩu là vào được mọi database; chủ dự án chọn vai trò riêng |
| Frappe tạo một Frappe site cho mỗi khách | Hai hệ multisite song song (Frappe và Open Kế Toán) cho cùng một khách |
