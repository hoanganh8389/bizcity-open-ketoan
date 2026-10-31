# `bizcity_connector@1` — Cổng để lõi kéo sự việc từ plugin
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->

> **Phiên bản:** 1.0.0 · 2026-10-28 · **Trạng thái:** Ổn định
> **Nguồn sự thật:** `packages/contracts/src/connections.ts`, `modules/connections/*` · **Bản tường thuật cho đội WP:** [../cong-ket-noi.md](../cong-ket-noi.md)

Dùng khi plugin muốn kế toán **chủ động** lấy sự việc (kéo lại an toàn, bù phiếu sót, sổ thuế riêng). Đẩy (`POST /documents`) và kéo dùng **cùng** khuôn [bizcity_ledger_intake@1](BIZCITY-LEDGER-INTAKE-v1.md). Sự việc kéo về luôn `pending` (chờ định khoản ở ACC14).

## 1. Cấu hình kết nối (phía lõi, ACC14 → Kết nối)

| Trường | Nghĩa |
|---|---|
| `code` | `^[a-z0-9][a-z0-9_-]{1,31}$`; cũng là `sourceSystem` của sự việc kéo về |
| `kind` | `standard` (đầu chuẩn dưới đây) · `woocommerce` (REST v3, lõi tự đổi đơn → `sale`) |
| `url`, `apiKey` | Đường dẫn cổng của plugin; khoá gửi `Authorization: Bearer` |
| `methodMap` | Đổi mã hình thức TT nguồn → mã lõi (`MÃ NGUỒN=MÃ LÕI`) |
| `primary` | Một kết nối chính (cầu nối website ↔ chi nhánh) |

Lưu tại `tenants.settings.connections` (khoá chuẩn `bizcity.connector.connections`); bí mật trả ra dạng che `••••••••`.

## 2. Plugin phải dựng: kéo

```
GET <url>?from=YYYY-MM-DD&to=YYYY-MM-DD[&cursor=…][&shops=<mã,…>][&consumer=tax]
Authorization: Bearer <apiKey>
```

```json
{
  "documents": [ { "...": "bizcity_ledger_intake@1" } ],
  "cancelled": [ { "docKey": "btsoft:3:receipt:672", "reason": "Phiếu đã xoá ở nguồn" } ],
  "nextCursor": "chuỗi hoặc null"
}
```

| Luật | |
|---|---|
| C-1 | Trả sự việc có `docDate` trong `[from, to]` **cộng** sự việc bị sửa trong khoảng (với `version` mới) |
| C-2 | Chỉ phiếu **đã duyệt** ở nguồn (R-WF-3). Bỏ duyệt / xoá → đưa vào `cancelled` |
| C-3 | Mỗi trang vài trăm phần tử; còn thì `nextCursor` |
| C-4 | `shops` (tuỳ chọn): chỉ quét các chi nhánh này (mã chi nhánh hoặc mã tham chiếu bên lõi) |
| C-5 | `consumer=tax`: sổ thuế; chỉ trả `sale` / `sale_return` có số hoá đơn, không `internalOnly`; **nhật ký gửi riêng** cho từng `consumer` |
| C-6 | Bọc `{ "data": { … } }` cũng được |
| C-7 | Sai khoá → 401; lỗi khác → mã HTTP lỗi + nội dung (kế toán thấy nguyên văn) |

## 3. Plugin phải dựng: báo nhận

Sau mỗi trang, lõi gọi **cùng** `url` bằng `POST`:

```json
{
  "received":  [ { "docKey": "wp:26001:10:501", "version": 3, "status": "received" } ],
  "rejected":  [ { "docKey": "wp:26001:10:bad", "message": "Sai khuôn: lines: Required" } ],
  "cancelled": [ { "docKey": "btsoft:3:receipt:672" } ]
}
```

`status`: `received` (đã lưu, chờ định khoản) hoặc `unchanged`. Plugin dùng để đánh dấu đã giao và hiện lý do bị từ chối. Không cần thì trả 404/405 — lõi bỏ qua (`PullResult.ackError`).

## 4. Lõi bảo đảm

- Kéo lại bao nhiêu lần cũng không ghi trùng (R-EVENT-4).
- `cancelled` **không** tự huỷ: sự việc về Chờ huỷ, kế toán duyệt (R-EVENT-8).
- Kết quả mỗi lần kéo (`PullResult`): `fetched`, `received`, `unchanged`, `errors[]`, `cancelled`, `ackError?`.

## 5. Bản tham chiếu

Plugin `tgs_accounting_bridge` (WordPress multisite), lớp `TGS_Acc_Gate`, đường dẫn `/wp-json/tgs-acc/v1/pending` — đúng hợp đồng này. Tên chuẩn đích: `bizcity-ledger-bridge`, `BizCity_Ledger_Gate`, `/wp-json/bizcity-ledger/v1/pending` ([../framework/03-MO-RONG.md](../framework/03-MO-RONG.md) §4).
