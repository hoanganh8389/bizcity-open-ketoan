# RULE · API (R-API)

> **Cấp:** Tier 1 · **Phiên bản:** 1.0 · 2026-10-28 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Hợp đồng:** [bizcity_api@1](../contracts/BIZCITY-API-v1.md)

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-API-1** | Mọi endpoint trả **đúng một** trong hai dạng: `{ ok: true, data, meta? }` hoặc `{ ok: false, error: { code, message, details? } }` (`core/http.ts`) | `api-examples.test.ts` |
| **R-API-2** | Lỗi nghiệp vụ ném `Errors.*` (`core/errors.ts`); không tự `reply.status(...)`. Phía gọi xử lý theo **`code`**, không theo câu chữ | Grep CI: `reply.status(` trong `routes.ts` |
| **R-API-3** | Kiểm đầu vào bằng zod tại route (`fastify-type-provider-zod`); khuôn dùng chung đặt ở `packages/contracts`, khuôn riêng ở `<ten>.schemas.ts` | OpenAPI tự sinh tại `/api/docs` |
| **R-API-4** | Tiền là **number** (đồng), cộng trừ qua `toCents/fromCents`; ngày `YYYY-MM-DD` hoặc ISO 8601; mã là chuỗi, phân biệt hoa thường | `money.ts` |
| **R-API-5** | Tham số true/false trên URL dùng `queryBool`, không dùng `z.coerce.boolean()` (vì `"false"` thành `true`) | Grep CI |
| **R-API-6** | Mọi route khai `preHandler: requirePermission(...)` trừ route `config.public` | Test liệt kê route (Giai đoạn 1) |
| **R-API-7** | Đường dẫn **ổn định** dưới `/api/v1/`. Đổi phá vỡ (bỏ trường, đổi nghĩa, đổi kiểu) → `/api/v2/` song song; thêm trường tuỳ chọn không phá vỡ | Duyệt PR + CHANGELOG |
| **R-API-8** | Phạm vi công khai cho plugin = route liệt kê trong [../contracts/BIZCITY-API-v1.md](../contracts/BIZCITY-API-v1.md) §5. Route khác là nội bộ giao diện, được đổi không báo | Hợp đồng |
| **R-API-9** | Thao tác ghi từ hệ thống ngoài phải **idempotent**: dựa trên `docKey` + `version` (sự việc) hoặc mã (danh mục `PUT /:code`). Không có endpoint "tạo" không khoá tự nhiên cho plugin | Hợp đồng |
| **R-API-10** | Danh sách trả `meta: { page, pageSize, total }`; `pageSize` có trần | `PageMeta` |
| **R-API-11** | Lô có giới hạn cứng (sự việc: 200) và trả kết quả **từng phần tử** + `meta` đếm theo trạng thái | `ingestBatch()` |
| **R-API-12** | Không trả lỗi nội bộ (stack, SQL) ra ngoài: `INTERNAL_ERROR` "Lỗi hệ thống". Đích Giai đoạn 1: kèm `details.requestId` (= `req.id` của Fastify) để tra log | `core/http.ts` `registerErrorHandler` |
