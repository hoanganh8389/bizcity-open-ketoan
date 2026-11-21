# PHASE-039 · 00 — Kế hoạch & thiết kế
<!-- [2026-11-21 07:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — W0: sự thật đọc mã trên main 0734feef; thiết kế Site Registry, Database Router, Site Provisioner, Migration Runner, Backup Manager; quy trình cập nhật nhiều site; B1..B7 -->

## 1. Sự thật đọc mã (main `0734feef`, 2026-11-21)

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Một pool cho cả ứng dụng: `new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 })`. `db` (Kysely) là **một biến xuất ra**, mọi repository dùng nó | `packages/platform/src/db/client.ts` |
| F2 | Mỗi lần mượn kết nối, pool đặt `bizcity.tenant_id` (và chi nhánh làm việc) theo `currentRequest()` — ngữ cảnh yêu cầu bằng `AsyncLocalStorage` | `client.ts`, `packages/platform/src/core/request-context.ts` |
| F3 | Migration mở kết nối **riêng** bằng `env.DATABASE_URL`, khoá `pg_advisory_lock(727001)`, ghi `schema_migrations`. Migration của module cũng vậy | `packages/platform/src/db/migrate.ts`, `module-db.ts` |
| F4 | Tiến trình nền: hai `setInterval` (dispatcher sự kiện mỗi 1 giây, đồng hồ mỗi 60 giây) chạy trên pool chung | `packages/platform/src/core/events.ts` |
| F5 | Vé đăng nhập ký HS256, claim `tid` (đơn vị), `role`, `name`, `sv`; **không có** mã site. Vé ứng dụng cũng chỉ có `tid` | `packages/platform/src/core/security/tokens.ts`, `core/apps.ts` |
| F6 | Ngoài `client.ts`, chỉ còn **một** tệp gọi thẳng `pool.query` / `pool.connect` | `apps/api/src/db/setup.ts` |
| F7 | Sao lưu: `pg_dump` database `ketoan`, tự kiểm (`--kiem`); cập nhật: `cap-nhat.sh` sao lưu → kiểm → kéo mã → `docker compose up -d --build` (job `db-migrate` chạy trước API) | `scripts/sao-luu.sh`, `scripts/cap-nhat.sh` |
| F8 | `docker-compose.yml` ghi cứng tên database `ketoan` cho cả job migrate (vai trò chủ) và API (vai trò `ketoan_app`) | `docker-compose.yml` |
| F9 | Không có chỗ nào đọc tên miền của yêu cầu để chọn dữ liệu | tìm `hostname`, `x-forwarded-host` trong `apps/api/src`, `packages/` |

**Chưa kiểm kê (việc S039-3):** các bộ đệm trong bộ nhớ có khoá theo đơn vị (khoảng 270 chỗ `new Map<string, …>` cần lọc), script trong `scripts/` tự mở pool, số đo Prometheus có nhãn theo đơn vị.

## 2. Từ vựng

| Từ | Nghĩa | Ví dụ |
|---|---|---|
| **Site** | Một tên miền + một database. Một doanh nghiệp hoặc một chuỗi | `a.<miền>` → `kt_a` |
| **Đơn vị** (`tenant_id`) | Pháp nhân / đơn vị hạch toán **trong** một site. Giữ nguyên | chuỗi 500 cửa hàng = 1 site, 1 hoặc vài đơn vị, 500 chi nhánh |
| **Database điều khiển** | Database nhỏ của Open Kế Toán giữ Site Registry | `ketoan_control` |
| **Database mẫu** | Database trống đã chạy đủ migration, dùng làm khuôn tạo site | `kt_template` |

## 3. Bức tranh

```text
                    Host: a.<miền>                      Host: <SITE_ADMIN_HOST>
                          │                                      │  khoá prov_…
                          ▼                                      ▼
                 ┌─ Site Resolver ─┐                  ┌─ Provisioning API ─┐
                 │ Host → site     │                  │ /_sites/v1/*       │
                 └────────┬────────┘                  └─────────┬──────────┘
        xác thực (vé có sid = site)                             │
                          ▼                                     ▼
   ngữ cảnh yêu cầu { siteId, tenantId }            Site Provisioner · Migration Runner
                          ▼                          Backup Manager  (việc có trạng thái)
                 ┌─ Database Router ─┐                          │
                 │ pool theo site    │◄──── Site Registry ◄─────┘
                 └───┬─────┬─────┬───┘      (ketoan_control)
                     ▼     ▼     ▼
                  kt_a   kt_b   kt_c         kt_template
```

Mã nghiệp vụ, Accounting Kernel, Module SDK, Rulepack: **không đổi**. Chúng dùng `db` như hôm nay.

## 4. Năm thành phần

### 4.1 Site Registry

Database điều khiển `ketoan_control`, migration riêng ở `db/control-migrations/` (không lẫn với `db/migrations/` của site).

| Bảng | Cột chính |
|---|---|
| `sites` | `id` (ULID), `slug` (duy nhất), `display_name`, `status` (`provisioning` · `active` · `suspended` · `upgrading` · `migration_failed` · `deleted`), `db_host`, `db_port`, `db_name`, `schema_version`, `app_version`, `created_at`, `suspended_at`, `deleted_at`, `owner_email`, `external_ref` |
| `site_domains` | `domain` (khoá chính, chữ thường), `site_id`, `is_primary` |
| `site_jobs` | `id`, `site_id`, `kind` (`provision` · `migrate` · `backup` · `restore` · `suspend` · `resume` · `delete`), `idempotency_key` (duy nhất theo khoá gọi), `status`, `steps` (jsonb), `error_code`, `error_message`, thời điểm |
| `site_backups` | `id`, `site_id`, `file`, `bytes`, `schema_version`, `verified`, `created_at` |
| `provision_keys` | `id`, `prefix`, `key_hash`, `label`, `allowed_ips`, `revoked_at` |

Mật khẩu database **không** nằm trong registry: lấy từ biến môi trường (v1 dùng chung vai trò, Q039-2).

### 4.2 Database Router

1. **Site Resolver** (hook `onRequest`, trước xác thực): lấy `Host` (qua `X-Forwarded-Host` chỉ khi proxy được tin), tra `site_domains` (bộ đệm 30 giây). Không thấy → 404 `SITE_NOT_FOUND`. Đặt `siteId` vào ngữ cảnh yêu cầu.
2. **Cổng trạng thái:** `suspended` → theo Q039-1 (chỉ đọc); `upgrading` / lệch `schema_version` → 503 `SITE_UPGRADING`; `migration_failed` → 503 `SITE_MIGRATION_FAILED`.
3. **Xác thực gắn site:** vé có `sid`; `sid ≠ siteId` → 401. Vé cũ không có `sid` chỉ được nhận ở `SITE_MODE=single`.
4. **Pool theo site:** `poolOf(siteId)` tạo khi cần (tối đa 4, rảnh 5 phút thì đóng, có trần tổng). Việc đặt `bizcity.tenant_id` mỗi lần mượn kết nối giữ nguyên.
5. **`db` uỷ quyền:** `db` vẫn là một giá trị xuất ra; mỗi truy vấn hỏi ngữ cảnh lấy site hiện tại. Không có site ở chế độ `multi` → ném `SITE_CONTEXT_MISSING`.
6. **Tiến trình nền:** `forEachSite(fn)` lặp các site `active`, mỗi lượt `withSiteContext(site, fn)`; lỗi của một site được ghi và bỏ qua lượt đó.

Chế độ `single`: registry trong bộ nhớ có một site `default` lấy từ `DATABASE_URL`; Site Resolver luôn trả site đó. Cùng đường mã.

### 4.3 Site Provisioner

Các bước của việc `provision` (mỗi bước ghi vào `site_jobs.steps`):

| # | Bước | Hỏng thì |
|---|---|---|
| 1 | Kiểm `slug` (`^[a-z][a-z0-9-]{2,29}$`, danh sách cấm), tên miền chưa dùng | từ chối, không tạo gì |
| 2 | Ghi `sites` (`provisioning`) + `site_domains` | xoá dòng |
| 3 | `CREATE DATABASE kt_<slug> TEMPLATE kt_template` | `DROP DATABASE` nếu đã tạo |
| 4 | Tạo đơn vị đầu + tài khoản quản trị (email của khách, mật khẩu đặt qua liên kết một lần); nạp gói mẫu khi được yêu cầu (đường `core.setup.apply` của PHASE-036) | `DROP DATABASE` |
| 5 | Ghi `schema_version`, `app_version`; `status = active`; xoá bộ đệm registry | — |

Tên database luôn do Provisioner tự dựng từ `slug` đã kiểm; không nhận tên database từ bên ngoài.

### 4.4 Migration Runner

- `runMigrations(connectionString, log)`: tham số hoá chỗ đang đọc `env.DATABASE_URL`. Khoá tư vấn giữ nguyên (khoá theo từng database).
- `site migrate <slug>` / `site migrate --all`: với từng site → `status = upgrading` → sao lưu (bỏ qua được bằng cờ khi vừa sao lưu) → migration lõi → migration module → ghi `schema_version` → `active`. Lỗi → `migration_failed`, **dừng site đó**, đi tiếp site sau, cuối cùng in bảng tổng kết và thoát mã khác 0.
- `kt_template` được nâng trước tiên. Template lỗi → dừng cả lượt (chưa site nào bị đụng).
- `schema_version` = tên migration cuối đã áp (ví dụ `0177_…`), so với bản ứng dụng cần (tên migration cuối trong ảnh).

### 4.5 Backup Manager

- `site backup <slug>`: `pg_dump -Fc` database của site → tệp `backups/<slug>/<slug>-<thời điểm>.dump` → tự kiểm (đọc được, có `ledger_entries`, đếm bảng) → ghi `site_backups`.
- Lịch hằng đêm: lặp registry, mỗi site một tệp, giữ theo chính sách (mặc định 14 bản ngày).
- `site restore <slug> --backup <id>`: khôi phục vào `kt_<slug>_khoiphuc_<thời điểm>` → kiểm đối chiếu sổ → khoá site → đổi tên hai database → mở site. Database cũ giữ 7 ngày.
- PITR (PHASE-008) là mức cả cụm: lấy lại một site ở một thời điểm = dựng cụm tạm, `pg_dump` site đó, rồi `site restore`. Ghi thành sổ tay ở B6.

## 5. Bảo mật

| Điểm | Cách giữ |
|---|---|
| Vé của site A dùng ở site B | claim `sid` + so với site của tên miền (D039-5) |
| API key của khách | không cấp ở đây; kiểm qua `bizcity-llm-router`, khớp `allowed_domain` với tên miền site, bộ đệm 60 giây; `bizcity-llm-router` không trả lời thì **từ chối** (D039-17) <!-- [2026-11-21 07:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — D039-17 --> |
| Rơi về database mặc định | cấm ở chế độ `multi` (D039-6) |
| Provisioning API bị gọi từ ngoài | chỉ trả lời trên `SITE_ADMIN_HOST`, khoá `prov_…` băm, danh sách IP, giới hạn tần suất |
| Chèn tên database | tên dựng từ `slug` đã kiểm; dùng định danh có trích dẫn, không ghép chuỗi tự do |
| Bộ đệm trong bộ nhớ lẫn giữa hai site | khoá bộ đệm thêm `siteId` (S039-3 kiểm kê, phép kiểm tĩnh mới) |
| Nhật ký, số đo | thêm trường `site`; nhãn `site` trên số đo có trần số nhãn |
| Xoá nhầm | xoá mềm, cần khoá + sao lưu mới (D039-15) |

## 6. Quy trình cập nhật nhiều site

```text
GitHub: open-ketoan
        ↓
Kéo mã · build ảnh mới · chạy test          (ứng dụng cũ vẫn phục vụ)
        ↓
Sao lưu database điều khiển + từng site
        ↓
Migration: kt_template → từng site          (site đã nâng tạm báo "đang nâng cấp")
        ↓
Chuyển ứng dụng sang ảnh mới                (mọi site đã nâng mở lại)
        ↓
Tất cả site dùng chung mã mới
```

Cổng lược đồ (D039-11) làm quy trình này an toàn mà không cần luật riêng:

- Ứng dụng **cũ** chỉ phục vụ site ở lược đồ cũ. Site vừa nâng xong sẽ báo `SITE_UPGRADING` cho tới khi chuyển ảnh.
- Ứng dụng **mới** chỉ phục vụ site ở lược đồ mới. Site nâng lỗi báo `SITE_MIGRATION_FAILED`, các site khác không bị ảnh hưởng.
- Thời gian gián đoạn của mỗi site = từ lúc nó được nâng tới lúc chuyển ảnh. `cap-nhat.sh` nâng xong hết rồi chuyển ngay.
- Lùi: site lỗi khôi phục từ bản sao lưu vừa tạo; lùi cả cụm = ảnh cũ + khôi phục các site đã nâng (script in đúng lệnh, như hôm nay).

`cap-nhat.sh` ở chế độ `single` chạy như hôm nay.

## 7. Cái không làm ở phase này

- Chia một site ra nhiều database, hay gộp nhiều site vào một.
- Đặt site ở nhiều máy chủ PostgreSQL (registry đã có `db_host` để sau này làm được).
- Nâng cấp không gián đoạn (mở rộng / thu hẹp lược đồ). Để sau khi có số đo thật.
- Giao diện quản lý site: thuộc Site Manager (repo `bizcity-open-setup`).

## 8. Bước thắng nhỏ

| Bước | Việc | Người dùng thấy gì | Mức |
|---|---|---|---|
| **B1** | Thêm `siteId` vào ngữ cảnh yêu cầu; `db` đi qua `poolOf(site)`; chế độ `single` với site `default`. Kiểm kê F6, bộ đệm, script (S039-3) | Không gì đổi; toàn bộ test hiện có xanh | K3 |
| **B2** | Database điều khiển + Site Registry; Site Resolver theo `Host`; `sid` trong vé; tiến trình nền `forEachSite`; `SITE_MODE=multi` | Hai tên miền trên một bản chạy ra hai sổ khác nhau | K3 |
| **B3** | `runMigrations(connectionString)`; `site migrate`; cổng lược đồ (`SITE_UPGRADING`) | Nâng cấp từng site, site lỗi không kéo site khác | K3 |
| **B4** | Site Provisioner + `kt_template`; CLI `bizcity site create / list / migrate / suspend / resume / drop / adopt` | Một lệnh có site mới trong vài giây | K2 |
| **B5** | Provisioning API `/_sites/v1` + khoá `prov_…` + `Idempotency-Key`; kiểm khoá `biz-…` qua `bizcity-llm-router` (D039-17) | Site Manager (Frappe) tạo được site; khoá cấp ở WordPress gọi được site | K2 |
| **B6** | Backup Manager theo site; lịch đêm; khôi phục thử; sổ tay | Khôi phục một khách không đụng khách khác | K2 |
| **B7** | `cap-nhat.sh` nhiều site; số đo / nhật ký có `site`; nghiệm thu T039-* | Cập nhật một lần, mọi site dùng mã mới | K2 |

B1 làm trước và đứng riêng: nó là thay đổi nền, và vì hành vi không đổi nên toàn bộ bộ test hiện có là lưới an toàn.
