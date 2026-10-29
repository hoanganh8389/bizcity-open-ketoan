# `bizcity_api@1` — Quy ước HTTP chung

> **Phiên bản:** 1.0.0 · 2026-10-28 · **Trạng thái:** Ổn định · **Luật:** [R-API](../rules/RULE-API.md)
> **Nguồn sự thật:** `packages/contracts/src/api.ts`, `apps/api/src/core/{http,errors,auth}.ts` · **OpenAPI sống:** `/api/docs`

## 1. Địa chỉ, xác thực

| | |
|---|---|
| Gốc | `https://<máy chủ>/api/v1` |
| Người dùng | `Authorization: Bearer <jwt>` (hạn `JWT_TTL_HOURS`, mặc định 12 giờ) |
| Hệ thống | `X-Api-Key: <khoá>` — khoá gắn một đơn vị, có phạm vi (R-TEN-4) |
| Kiểu | JSON UTF-8 |
| Header tuỳ chọn | `X-Bizcity-Contract: <mã@major>` (Giai đoạn 2), `X-Request-Id` (truy vết) |

## 2. Khuôn phản hồi

```json
{ "ok": true,  "data": { }, "meta": { "page": 1, "pageSize": 50, "total": 123 } }
{ "ok": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [ "…" ] } }
```

## 3. Mã lỗi ổn định

| `code` | HTTP | Khi nào | Bên gọi nên |
|---|---|---|---|
| `VALIDATION_ERROR` | 400 | Sai khuôn, tổng tiền lệch | Sửa dữ liệu; không gửi lại y nguyên |
| `UNAUTHORIZED` | 401 | Thiếu / sai khoá, phiên hết hạn | Kiểm khoá |
| `FORBIDDEN` | 403 | Khoá / vai trò thiếu quyền | Xin phạm vi |
| `NOT_FOUND` | 404 | Không có bản ghi | — |
| `CONFLICT` | 409 | Phiên bản nhỏ hơn bản đang có; mã trùng; xoá danh mục đã dùng | Tăng `version`; đọc lại |
| `PERIOD_LOCKED` | 409 | Kỳ đã khoá | Báo kế toán |
| `POSTING_FAILED` | 422 | Thiếu cấu hình định khoản | Không cần gửi lại — kế toán sửa rồi định khoản lại |
| `UNBALANCED_ENTRY` | 422 | Bút toán không cân (lỗi luật) | Báo nhóm Lõi |
| `INTERNAL_ERROR` | 500 | Lỗi hệ thống | Thử lại sau, có giới hạn |

Thêm mã = thay đổi tương thích; đổi nghĩa mã = phá vỡ.

## 4. Kiểu giá trị

| Kiểu | Quy ước |
|---|---|
| Tiền | `number`, đồng, đã làm tròn như hoá đơn; so sánh tới xu |
| Số lượng | `number`, được lẻ; quy về ĐVT nhỏ nhất |
| Ngày | `YYYY-MM-DD` hoặc ISO 8601 (lấy phần ngày) |
| Mã | chuỗi, cắt khoảng trắng hai đầu, phân biệt hoa thường |
| `id` | chuỗi số (`"123"`) — chỉ dùng nội bộ, không lưu ở hệ thống ngoài |
| true/false trên URL | `true`/`false`/`1`/`0` |

## 5. Phạm vi công khai cho plugin (cam kết ổn định)

| Nhóm | Endpoint | Phạm vi khoá |
|---|---|---|
| Sự việc | `POST /documents`, `POST /documents/batch`, `POST /documents/cancel`, `GET /documents?search=<docKey>` | `documents:write` |
| Danh mục đọc | `GET /branches`, `/partners`, `/products`, `/tax-codes`, `/posting/reasons`, `/posting/payment-methods` | `documents:write` hoặc `catalog:write` |
| Danh mục ghi | `POST /branches`, `PUT /partners/:code`, `PUT /products/:sku` | `catalog:write` |
| Đối chiếu | `GET /reports/sales-invoices`, `GET /reports/trial-balance` | `reports:read` |
| Hệ thống | `GET /system/health` | công khai |

Mọi endpoint khác phục vụ giao diện nội bộ và **có thể đổi không báo** (R-API-8).

## 6. Giới hạn

| | |
|---|---|
| Lô sự việc | 200 / lần |
| Dòng trên một sự việc | 2000 |
| Trang danh sách | `pageSize` có trần theo endpoint |

## 7. Changelog

- **1.0.0 (2026-10-28):** Đặt tên hợp đồng cho quy ước đang chạy; liệt kê phạm vi công khai.
