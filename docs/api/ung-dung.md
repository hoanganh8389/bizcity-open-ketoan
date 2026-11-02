# App ngoài tiến trình: kết nối, webhook, khung nhúng
<!-- [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.14 (ADR-0011 mức 2): tài liệu API app ngoài tiến trình — kết nối, khoá có phạm vi, webhook ký HMAC, vé iframe -->

> **Hợp đồng:** [Module §3a](../contracts/BIZCITY-MODULE-v1.md) · [Event §7a](../contracts/BIZCITY-EVENT-v1.md) · [Extension §3a](../contracts/BIZCITY-EXTENSION-v1.md) · **Quyết định:** [ADR-0011](../adr/ADR-0011-plugin-ba-muc-tin-cay.md) mức 2

App ngoài tiến trình là dịch vụ riêng, viết bằng ngôn ngữ nào cũng được, chạy trên máy nào cũng được. App nói chuyện với phần mềm kế toán **chỉ** qua API công khai: không đọc CSDL, không chạy mã trong máy chủ kế toán.

## 1. Cài vào bản cài (người quản trị bản cài)

1. Viết manifest `apps/api/src/ung-dung/<key>/bizcity.module.json`:

```json
{
  "contract": "bizcity_module@1",
  "id": "acme.pos-mini",
  "key": "pos-mini",
  "kind": "app",
  "version": "0.1.0",
  "label": "POS mini",
  "description": "Bán lẻ tại quầy, đẩy hoá đơn vào sổ",
  "owners": ["@acme"],
  "standard": "^1.0",
  "requires": { "capabilities": ["apps.external", "ledger.submit"] },
  "app": {
    "scopes": ["documents:write", "catalog:read"],
    "webhook": { "url": "https://pos.example.vn/bizcity/webhook" }
  },
  "events": { "subscribes": [{ "type": "bizcity.ledger.entry.posted", "version": 1 }] },
  "ui": { "origin": "https://pos.example.vn", "entry": "/nhung" }
}
```

2. Thêm `"pos-mini"` vào `APP_KEYS` trong `apps/api/src/ung-dung/index.ts`, dựng lại (`scripts/cap-nhat.sh`). Manifest sai (quyền quản trị, origin có đường dẫn, sự kiện mà không có webhook, khoá trùng phân hệ) → máy chủ dừng khởi động và báo lý do.

## 2. Kết nối với đơn vị (chủ đơn vị)

Màn **Tiện ích → Ứng dụng kết nối** (`TI13`), hoặc API (quyền `users:write`):

| Lời gọi | Việc |
|---|---|
| `GET /api/v1/apps` | app cài trong bản này + trạng thái kết nối; `scopeChanged = true` khi manifest xin phạm vi khác lúc đã đồng ý |
| `POST /api/v1/apps/<key>/install` | kết nối: trả `apiKey` và `webhookSecret` **một lần** |
| `POST /api/v1/apps/<key>/disable` · `/enable` | tắt: khoá app bị từ chối, webhook ngừng; dữ liệu và bút toán app đã nộp giữ nguyên |
| `POST /api/v1/apps/<key>/scope` | đồng ý phạm vi mới khi app nâng cấp |
| `POST /api/v1/apps/<key>/rotate` | xoay khoá: khoá API và bí mật webhook cũ hết hiệu lực ngay |

Nhập `apiKey` và `webhookSecret` vào cấu hình của app. Phần mềm kế toán không hiện lại được hai giá trị này; mất thì xoay khoá.

## 3. App gọi API

Gửi `X-Api-Key: <apiKey>`. Quyền đọc đúng bằng `app.scopes` đã đồng ý. **Ghi** chỉ qua cửa nạp: `POST /api/v1/documents`, `/documents/batch`, `/documents/submit`, `/documents/cancel` (báo huỷ chứng từ của app) và đổi vé; route ghi khác trả `403 FORBIDDEN` dù khoá có quyền. Nộp chứng từ:

```bash
curl -X POST https://<máy chủ>/api/v1/documents/submit \
  -H "X-Api-Key: <apiKey>" -H "Idempotency-Key: pos-mini-HD0001-v1" -H "Content-Type: application/json" \
  --data '{ "document": { "docType": "sale", "docKey": "pos-mini:CN01:HD0001", "version": 1, ... } }'
```

- `docKey` **phải** bắt đầu `pos-mini:`; `sourceSystem` bỏ trống hoặc `pos-mini`. Sai → `400 VALIDATION_ERROR`, không lưu gì (cả `POST /api/v1/documents`); trong lô `/documents/batch`, dòng sai báo `status: "error"` riêng, dòng khác vẫn xử lý (R-EVENT-12).
- Kết quả có biên nhận `meta.receipt` `{ evidenceId, hash, at }`; `?dryRun=1` trả bút toán dựng thử, không ghi.
- Khuôn chứng từ: [bizcity_ledger_intake@1](../contracts/BIZCITY-LEDGER-INTAKE-v1.md), ví dụ ở [vi-du/](vi-du/).

## 4. Nhận webhook

Phần mềm kế toán `POST` phong bì sự kiện tới `app.webhook.url`:

```http
POST /bizcity/webhook
Content-Type: application/json
Idempotency-Key: 0193f0c2-…
Bizcity-Event-Id: 0193f0c2-…
Bizcity-Event-Type: bizcity.ledger.entry.posted
Bizcity-Signature: t=1793600000,v1=5d41402abc4b2a76b9719d911017c592…

{"id":"0193f0c2-…","type":"bizcity.ledger.entry.posted","version":1,"tenantId":"12","subject":"pos-mini:CN01:HD0001","data":{…},…}
```

Kiểm chữ ký trước khi tin thân (ví dụ Node.js):

```js
import { createHmac, timingSafeEqual } from 'node:crypto';
function verify(rawBody, header, secret) {
  const { t, v1 } = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const want = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  return want.length === v1.length && timingSafeEqual(Buffer.from(want), Buffer.from(v1));
}
```

- Trả `2xx` khi đã nhận. Khác `2xx`, quá 5 giây, lỗi mạng → gửi lại giãn nhịp (10 lần, tới 1 giờ), sau đó vào danh sách chết ở **Tự chẩn đoán** (`EVENT_DEAD`).
- Giao **ít nhất một lần**: chống xử lý trùng theo `Idempotency-Key`.
- Chỉ đơn vị đã kết nối app và đang bật mới gửi. Sự kiện phát lúc app tắt không gửi bù khi bật lại; quản trị phát lại bằng `core.events.replay` (consumer `<key>.webhook`).

## 5. Khung nhúng (iframe)

App có `ui.origin` hiện ở nhóm **Tiện ích**, mở màn `/ung-dung/<key>` nhúng `ui.origin + ui.entry`. Giao thức `postMessage` đóng ([Extension §3a](../contracts/BIZCITY-EXTENSION-v1.md)):

```js
// Trong trang app (chạy trong iframe)
const CORE = 'https://ketoan.example.vn';           // origin phần mềm kế toán, app tự cấu hình
window.parent.postMessage({ type: 'bizcity.ready' }, CORE);
window.addEventListener('message', async (e) => {
  if (e.origin !== CORE || e.data?.type !== 'bizcity.context') return;
  // Máy chủ của app đổi vé (KHÔNG làm ở trình duyệt: khoá API không được ra trình duyệt)
  const ctx = await fetch('/api/bizcity-context', { method: 'POST', body: JSON.stringify({ ticket: e.data.ticket }) }).then((r) => r.json());
});
```

Máy chủ của app đổi vé:

```bash
curl -X POST https://<máy chủ>/api/v1/apps/ticket/exchange \
  -H "X-Api-Key: <apiKey>" -H "Content-Type: application/json" --data '{ "ticket": "<vé>" }'
# → { "app": "pos-mini", "tenant": { "id", "code", "name" }, "user": { "id", "name", "role" }, "permissions": [...] }
```

- Vé sống ≤ 5 phút, khung gửi vé mới mỗi 4 phút. Vé không dùng làm phiên đăng nhập được; chỉ khoá của đúng app, đúng đơn vị đổi được.
- iframe chạy `sandbox="allow-scripts allow-forms allow-same-origin"`: app không điều hướng được trang kế toán, không mở cửa sổ mới.
