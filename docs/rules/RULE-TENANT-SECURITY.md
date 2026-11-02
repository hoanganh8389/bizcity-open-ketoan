# RULE · Đơn vị, quyền, nhật ký (R-TEN)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-29 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — luật phát hành, thay đổi Kernel, bảo mật, tự chẩn đoán. -->

> **Cấp:** Tier 0 · **Phiên bản:** 1.0 · 2026-10-28 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Mã:** `apps/api/src/core/auth.ts`, `core/audit.ts`, `core/security/*`
> **Bảo mật toàn hệ thống** (mô hình mối đe doạ, bí mật, SQL, vai trò CSDL, AI / MCP, chuỗi cung ứng, sự cố, sổ rủi ro): [RULE-SECURITY.md](RULE-SECURITY.md)

## 1. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-TEN-1** | Mọi truy vấn đọc / ghi dữ liệu nghiệp vụ lọc `tenant_id = auth.tenantId`. Không có endpoint nào nhận `tenantId` từ đầu vào | `access.test.ts`; duyệt PR |
| **R-TEN-2** | Mọi request `/api/v1/*` phải xác thực (JWT người dùng hoặc `X-Api-Key`), trừ route khai `config.public` | `authPlugin` |
| **R-TEN-3** | Mọi route khai quyền bằng `requirePermission(...)`. Quyền mới thêm vào `PERMISSIONS` và gán vai trò trong cùng PR | R-API-6 |
| **R-TEN-4** | Khoá API gắn **một** đơn vị, có **phạm vi** (`documents:write`, `reports:read`, `catalog:write`); lưu dạng băm; thu hồi bằng `revoked_at`; ghi `last_used_at` | `api_keys` |
| **R-TEN-5** | Mọi thao tác ghi (thêm, sửa, xoá, khoá kỳ, đổi cấu hình) gọi `writeAudit()` với `actor`, trước / sau | Duyệt PR; test nhật ký |
| **R-TEN-6** | Phiếu nhập tay chỉ người lập sửa / huỷ, trừ quyền `documents:edit-all` (`assertCanModify`) | `edit-permission.test.ts` |
| **R-TEN-7** | Bí mật chỉ ở biến môi trường; `NODE_ENV=production` mà `JWT_SECRET` mặc định → không khởi động | `config/env.ts` |
| **R-TEN-8** | Không ghi bí mật, mật khẩu, khoá API, token vào log hoặc `audit_logs` | Duyệt PR |
| **R-TEN-9** | Đăng nhập SSO từ hệ thống quản trị (WP) chỉ cấp quyền nằm trong `PERMISSIONS`; quyền lạ bị bỏ | `resolveAuth()` |

## 2. Vai trò mặc định

| Vai trò | Quyền |
|---|---|
| `owner` | tất cả |
| `chief_accountant` | danh mục, chứng từ (kể cả sửa của người khác, bỏ qua khoá ngày), duyệt chi cấp 1, sổ, báo cáo, khoá kỳ, cấu hình, xem + chạy Kiểm chuẩn, duyệt rulepack tại đơn vị (ADR-0015) |
| `accountant` | danh mục, chứng từ của mình, sổ, báo cáo, xem + chạy Kiểm chuẩn |
| `viewer` | chỉ đọc (gồm xem Kiểm chuẩn) |
| `developer` | như `viewer` + `devtools:read` (Bàn điều tra, PHASE-019: trace / log / bằng chứng của đơn vị qua API trung gian chỉ đọc). Không phạm vi khoá API nào cấp `devtools:read` <!-- [2026-11-01 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-019 — W2: vai trò developer, quyền devtools:read. --> |

<!-- [2026-11-02 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — quyền conformance:read / conformance:run (ADR-0012, D020-7): chạy Kiểm chuẩn chỉ đọc sổ và lưu ảnh chụp, không đổi sổ / cấu hình. -->

## 3. Phạm vi khoá API

| Phạm vi | Quyền nhận được | Dùng cho |
|---|---|---|
| `documents:write` | `documents:write`, `documents:edit-all`, `documents:read`, `catalog:read` | Plugin gửi sự việc |
| `reports:read` | `reports:read`, `ledger:read`, `catalog:read`, `conformance:read` | Đối chiếu, BI, đọc kết quả Kiểm chuẩn |
| `catalog:write` | `catalog:write`, `catalog:read` | Plugin tạo chi nhánh, đối tượng, mặt hàng |

Phân hệ mới cần quyền riêng (ví dụ `payroll:approve`) → thêm vào bảng trên trong cùng PR với `core/auth.ts`.

<!-- [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14: khoá của app ngoài tiến trình — quyền theo kết nối app, không theo scopes; kết nối tắt / app gỡ → từ chối -->
**Khoá của app ngoài tiến trình** (`api_keys.app_key`, ADR-0011 mức 2, migration 0051): không theo bảng trên. Quyền = đúng danh sách chủ đơn vị đồng ý lúc kết nối (`app_installations.permissions`, lấy từ `app.scopes` của manifest), chỉ trong `catalog:read`, `documents:read`, `documents:write`, `ledger:read`, `reports:read` — không bao giờ `users:write`, `settings:write`, `periods:lock`, `payments:approve*`, `documents:edit-all`, `documents:bypass-date-lock`. Kết nối đang tắt hoặc bản cài đã gỡ manifest app → khoá bị từ chối (`401`) như khoá thu hồi. Khoá app chỉ nộp / báo huỷ chứng từ `docKey` `<app>:…` ở mọi cửa nạp.

<!-- [2026-11-02 03:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14: cổng route cho khoá app (APP_WRITE_ROUTES); bỏ catalog:write khỏi phạm vi app -->
**Cổng route cho khoá app** (`APP_WRITE_ROUTES`, `core/auth.ts`): khoá app gọi được mọi route `GET` theo quyền của route, nhưng chỉ **ghi** được qua danh sách đóng — `POST /api/v1/documents`, `/documents/batch`, `/documents/submit`, `/documents/cancel`, `/apps/ticket/exchange`. Route ghi khác (phiếu tay, số dư đầu kỳ, tài khoản, thuế, cấu hình, `/mcp`, route thêm sau này) trả `403` dù khoá có quyền. Mở thêm route cho app = sửa Platform (R-KER-2) và phải có luật chủ chứng từ ở Kernel. Tạo / xoay khoá app qua `/api/v1/apps/:key/install` / `rotate` (quyền `users:write`), không qua `/api/v1/api-keys`; thu hồi ở màn Khoá API vẫn có hiệu lực.

Vé iframe của app (`/api/v1/apps/:key/ticket`) ký bằng khoá dẫn xuất riêng từ `JWT_SECRET` (nhãn `bizcity.app.ticket`), `aud = bizcity.app-ticket`, ≤ 5 phút: **không** dùng được làm phiên `Bearer`. Bí mật webhook không lưu ở CSDL (dẫn xuất từ `JWT_SECRET` + muối). Đổi `JWT_SECRET` = mọi phiên, vé và bí mật webhook đều đổi: phải xoay khoá từng app.
