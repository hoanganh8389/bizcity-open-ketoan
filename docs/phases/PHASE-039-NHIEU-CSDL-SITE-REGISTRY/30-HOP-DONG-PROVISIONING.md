# PHASE-039 · 30 — Hợp đồng Provisioning (`bizcity_site_provisioning@1`, bản nháp)
<!-- [2026-11-21 07:29 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — W0: bản nháp hợp đồng Provisioning giữa Site Manager (Frappe, repo bizcity-open-setup) và Open Kế Toán; chưa vào docs/contracts cho tới khi chốt ở B5 -->

<!-- [2026-11-21 07:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — D039-17: bỏ hai lệnh cấp / thu hồi khoá API của site; thêm §8 kiểm khoá biz-… qua bizcity-llm-router -->
<!-- [2026-11-21 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — thêm lệnh PUT /sites/{siteId}/license -->
> **Trạng thái:** bản nháp trong phase. Khi làm B5 mới chuyển thành tệp ở `docs/contracts/` và gói `@ketoan/contracts`.
> **Chủ hợp đồng:** Open Kế Toán. **Phía gọi:** Site Manager (`bizcity_site_manager`), CLI, script vận hành.

## 1. Nguyên tắc

1. **Open Kế Toán là chủ Site Registry.** Phía gọi giữ bản điều hành; lệch thì tin registry.
2. **Phía gọi không chạm PostgreSQL.** Không nhận và không trả chuỗi kết nối, tên database, mật khẩu database.
3. **Lệnh ghi là việc bất đồng bộ.** Trả `202` kèm `jobId`; phía gọi hỏi trạng thái việc.
4. **Chống trùng.** Mọi lệnh ghi bắt buộc header `Idempotency-Key` (ULID). Cùng khoá gọi + cùng `Idempotency-Key` → trả đúng việc cũ, không tạo việc mới.
5. **Lỗi có mã.** Mỗi lỗi có `code` cố định và `message` tiếng Việt dễ hiểu.

## 2. Cửa và xác thực

| Điểm | Giá trị |
|---|---|
| Tiền tố | `/_sites/v1` |
| Tên miền | chỉ trả lời trên `SITE_ADMIN_HOST`; ở tên miền site thì trả 404 |
| Xác thực | `Authorization: Bearer prov_<…>`; khoá lưu dạng băm ở `provision_keys`; có danh sách IP cho phép |
| Chế độ | chỉ có khi `SITE_MODE=multi` |
| Dấu vết | mỗi lệnh ghi một dòng `site_jobs` với khoá gọi, IP, thời điểm |

## 3. Lệnh

| Phương thức | Đường dẫn | Việc | Trả |
|---|---|---|---|
| `POST` | `/sites` | Tạo site | `202 { jobId, siteId }` |
| `GET` | `/sites` | Danh sách (lọc `status`, `updatedAfter`, phân trang con trỏ) | `200 { items, next }` |
| `GET` | `/sites/{siteId}` | Một site | `200 Site` |
| `POST` | `/sites/{siteId}/suspend` | Khoá (chỉ đọc) | `202 { jobId }` |
| `POST` | `/sites/{siteId}/resume` | Mở lại | `202 { jobId }` |
| `POST` | `/sites/{siteId}/domains` | Thêm tên miền | `200 Site` |
| `DELETE` | `/sites/{siteId}/domains/{domain}` | Bỏ tên miền (không bỏ được tên miền chính) | `200 Site` |
| `POST` | `/sites/{siteId}/backups` | Sao lưu ngay | `202 { jobId }` |
| `GET` | `/sites/{siteId}/backups` | Danh sách bản sao lưu | `200 { items }` |
| `POST` | `/sites/{siteId}/restore` | Khôi phục từ một bản | `202 { jobId }` |
| `DELETE` | `/sites/{siteId}` | Xoá mềm (cần đang khoá + bản sao lưu ≤ 24 giờ đã kiểm) | `202 { jobId }` |
| `GET` | `/jobs/{jobId}` | Trạng thái việc | `200 Job` |
| `GET` | `/health` | Bản ứng dụng, lược đồ cần, số site theo trạng thái | `200` |

## 4. Khuôn dữ liệu

### 4.1 Tạo site — thân lệnh

```json
{
  "slug": "anphat",
  "domain": "anphat.<tên miền gốc>",
  "displayName": "Công ty An Phát",
  "owner": { "email": "chu@anphat.vn", "name": "Nguyễn Văn A", "phone": "0900000000" },
  "sample": false,
  "externalRef": "wp:12345"
}
```

| Trường | Luật |
|---|---|
| `slug` | `^[a-z][a-z0-9-]{2,29}$`, không kết thúc bằng `-`, không trong danh sách cấm; duy nhất |
| `domain` | chữ thường; chưa thuộc site nào |
| `owner.email` | thành tài khoản quản trị đầu tiên của site; mật khẩu đặt qua liên kết một lần gửi tới email này |
| `sample` | `true` thì nạp gói mẫu (PHASE-036) |
| `externalRef` | chuỗi tự do của phía gọi (≤ 120 ký tự), trả lại nguyên văn |

### 4.2 `Site`

```json
{
  "siteId": "01JD…",
  "slug": "anphat",
  "displayName": "Công ty An Phát",
  "status": "active",
  "domains": [{ "domain": "anphat.<tên miền gốc>", "primary": true }],
  "schemaVersion": "0177_…",
  "appVersion": "0.39.0",
  "dbSizeBytes": 48234496,
  "lastBackupAt": "2026-11-21T01:30:00+07:00",
  "createdAt": "2026-11-21T19:10:00+07:00",
  "externalRef": "wp:12345"
}
```

`status`: `provisioning` · `active` · `suspended` · `upgrading` · `migration_failed` · `deleted`.

### 4.3 `Job`

```json
{
  "jobId": "01JD…",
  "siteId": "01JD…",
  "kind": "provision",
  "status": "running",
  "steps": [
    { "key": "validate", "status": "done" },
    { "key": "create_database", "status": "done" },
    { "key": "seed_owner", "status": "running" },
    { "key": "activate", "status": "pending" }
  ],
  "error": null
}
```

`status` của việc: `queued` · `running` · `done` · `failed`. Khi `failed`: `error = { "code": "…", "message": "…" }`.

## 5. Mã lỗi

| HTTP | `code` | Khi nào |
|---|---|---|
| 400 | `SITE_SLUG_INVALID` | `slug` sai khuôn hoặc trong danh sách cấm |
| 400 | `IDEMPOTENCY_KEY_REQUIRED` | lệnh ghi thiếu header |
| 401 | `PROVISION_KEY_INVALID` | thiếu / sai / đã thu hồi khoá, hoặc IP không được phép |
| 404 | `SITE_NOT_FOUND` | không có site |
| 409 | `SITE_SLUG_TAKEN` · `SITE_DOMAIN_TAKEN` | trùng |
| 409 | `SITE_BUSY` | site đang có việc khác chạy |
| 409 | `SITE_NOT_SUSPENDED` | xoá khi site chưa khoá |
| 409 | `SITE_BACKUP_REQUIRED` | xoá / khôi phục khi chưa có bản sao lưu mới đã kiểm |
| 422 | `IDEMPOTENCY_KEY_REUSED` | cùng khoá nhưng thân lệnh khác |
| 503 | `SITE_LIMIT_REACHED` | chạm trần số site của cụm |

Mã phía cửa nghiệp vụ (không thuộc Provisioning API, phía gọi cần biết): `SITE_NOT_FOUND` (404), `SITE_UPGRADING` (503), `SITE_MIGRATION_FAILED` (503), `SITE_SUSPENDED` (403 cho lệnh ghi).

## 6. Ví dụ một lượt

```text
POST /_sites/v1/sites            Idempotency-Key: 01JD8…   →  202 { jobId: J1, siteId: S1 }
GET  /_sites/v1/jobs/J1                                    →  200 { status: "running", … }
GET  /_sites/v1/jobs/J1                                    →  200 { status: "done" }
GET  /_sites/v1/sites/S1                                   →  200 { status: "active", … }
POST /_sites/v1/sites            Idempotency-Key: 01JD8…   →  202 { jobId: J1, siteId: S1 }   (gửi lại: việc cũ)
```

## 7. Chưa có ở `@1`

Cấp khoá `biz-…` (thuộc `bizcity-llm-router`), webhook báo việc xong (v1 hỏi trạng thái), chuyển site sang máy chủ khác, đổi `slug`, hạn mức theo gói. Thêm trường không bắt buộc không tăng `@N`; đổi nghĩa hoặc bỏ trường thì tăng.

## 8. Khoá bản quyền `biz-…` (cảnh báo, không chặn)
<!-- [2026-11-21 07:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-039 — §8 viết lại theo D039-17: khoá biz-… là khoá mềm để cảnh báo hết hạn -->

Chủ dự án chốt 2026-11-21: `bizcity-llm-router` cấp và quản lý khoá `biz-…`. Trong Open Kế Toán, khoá này **không phải** cửa xác thực. Nó là khoá bản quyền của site, dùng để **cảnh báo hết hạn**.

| Lệnh | Việc |
|---|---|
| `PUT /sites/{siteId}/license` thân `{ "key": "biz-…" }` | Gắn hoặc đổi khoá cho site. Open Kế Toán lưu dạng băm + tiền tố |
| `GET /sites/{siteId}` | Thêm trường `license`: `{ "status": "ok" \| "expiring" \| "expired" \| "missing" \| "unknown", "expiresAt": …, "checkedAt": … }` |

Luật:

1. Open Kế Toán hỏi `bizcity-llm-router` trạng thái khoá, nhớ kết quả 1 giờ.
2. `expired` / `missing` (thu hồi, sai, chưa gắn) → site **vẫn dùng đầy đủ**; mọi màn có **dải đỏ**: "Bản quyền đã hết hạn. Gia hạn tại …". Dải đỏ không tắt được.
3. `expiring` (còn ≤ 14 ngày) → dải vàng, tắt được trong ngày.
4. Không hỏi được `bizcity-llm-router` → giữ trạng thái đã biết lần cuối và ghi `unknown` vào nhật ký vận hành; **không** chặn, **không** hiện đỏ khi lần cuối là `ok`.
5. Trạng thái khoá **không** ảnh hưởng ghi sổ, báo cáo, API, sao lưu.

Tên miền gốc không nằm trong hợp đồng: `domain` ở §4.1 là tên miền đầy đủ, do phía gọi chọn trong các tên miền gốc đã cấu hình (D039-18).
