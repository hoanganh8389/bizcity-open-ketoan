# RULE · Đơn vị, quyền, nhật ký (R-TEN)

> **Cấp:** Tier 0 · **Phiên bản:** 1.0 · 2026-10-28 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Mã:** `apps/api/src/core/auth.ts`, `core/audit.ts`, `core/security/*`

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
| `chief_accountant` | danh mục, chứng từ (kể cả sửa của người khác, bỏ qua khoá ngày), duyệt chi cấp 1, sổ, báo cáo, khoá kỳ, cấu hình |
| `accountant` | danh mục, chứng từ của mình, sổ, báo cáo |
| `viewer` | chỉ đọc |

## 3. Phạm vi khoá API

| Phạm vi | Quyền nhận được | Dùng cho |
|---|---|---|
| `documents:write` | `documents:write`, `documents:edit-all`, `documents:read`, `catalog:read` | Plugin gửi sự việc |
| `reports:read` | `reports:read`, `ledger:read`, `catalog:read` | Đối chiếu, BI |
| `catalog:write` | `catalog:write`, `catalog:read` | Plugin tạo chi nhánh, đối tượng, mặt hàng |

Phân hệ mới cần quyền riêng (ví dụ `payroll:approve`) → thêm vào bảng trên trong cùng PR với `core/auth.ts`.
