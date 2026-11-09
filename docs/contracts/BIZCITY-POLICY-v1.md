# `bizcity_policy@1` — Chính sách nghiệp vụ cho nguồn ngoài: lấy, tính, gửi tham chiếu
<!-- [2026-11-08 03:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a (S031-13, ADR-0031, chữ chốt PHASE-031 · 00 §9): hợp đồng API chính sách — GET /policies, GET /rule-contracts, POST /policies/evaluate, POST /policies; Rule Contract sale.promo.buy_x_get_y@1 -->

> **Phiên bản:** 1.3.0-draft · 2026-11-08 · **Trạng thái:** Đề xuất — chạy được từ W3a, chưa cam kết ổn định cho tới khi POS dùng thật (xem [BIZCITY-API-v1 §5](BIZCITY-API-v1.md))
> **Nguồn sự thật:** `apps/api/src/modules/system/policy.routes.ts` (route) · `apps/api/src/modules/system/rule-contracts/` (Rule Contract, dịch vụ) · `packages/platform/src/core/policies.ts` (sổ đăng ký, bảng `policy_registry`)
> **Quyết định:** [ADR-0031](../adr/ADR-0031-policy-registry-rule-contracts.md) · **Kế hoạch:** [PHASE-031 · 00 §9](../phases/PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/00-MASTER-PLAN.md) · **Đi cùng:** [`bizcity_ledger_intake@1` §3.1](BIZCITY-LEDGER-INTAKE-v1.md) (`policyRefs`)

## 1. Ý nghĩa

Chính sách nghiệp vụ (khuyến mại, giá, chiết khấu, hạn mức…) được **phát hành có phiên bản** một chỗ; POS, Woo, sàn **lấy bản đã phát hành**, tính theo đó (tại chỗ hoặc nhờ Core), rồi gửi **tham chiếu** (mã, bản, băm) kèm chứng từ. Cửa nạp kiểm lại tham chiếu ([`IN-POL-001..003`](BIZCITY-INTAKE-FINDINGS-v1.md)) và lưu để truy vết *bút toán → sự việc → chứng từ → chính sách@bản#băm*. Nguồn không tự định nghĩa luật khuyến mại riêng.

```
module / chủ đơn vị ──POST /policies──▶ sổ đăng ký (bản có hiệu lực, băm)
POS ──GET /policies (etag)──▶ lưu bản đã tải        ┐ tính tại chỗ theo spec  (ngoại tuyến)
POS ──POST /policies/evaluate──▶ kết quả + policyRefs ┘ hoặc nhờ Core tính   (trực tuyến)
POS ──POST /documents { lines…, policyRefs }──▶ cửa nạp kiểm lại ──▶ sổ
```

## 2. Endpoint

Quyền đọc và tính là `catalog:read`: khoá API phạm vi **`documents:write`, `reports:read`, `catalog:write`** đều có (`core/auth.ts` `SCOPE_PERMISSIONS`), nên POS hiện tại dùng được ngay, **không có scope mới**. Khoá không có quyền này → `403`; không khoá → `401`.

| Endpoint | Quyền | Việc |
|---|---|---|
| `GET /api/v1/policies?at=&domain=&branch=&channel=` | `catalog:read` | bản đang hiệu lực (§3) |
| `GET /api/v1/rule-contracts` | `catalog:read` | danh sách khuôn luật |
| `GET /api/v1/rule-contracts/:id` | `catalog:read` | tham số, `spec`, `vectors` (§4) |
| `POST /api/v1/policies/evaluate` | `catalog:read` | tính theo chính sách (§5) |
| `POST /api/v1/policies` | `settings:write` | phát hành một bản inline (§6); cần `Idempotency-Key` |

Không mở cho MCP / AI ở đợt này. Không có sự kiện `policy.published` — POS làm mới bằng `etag` (sự kiện: W3b).

## 3. `GET /api/v1/policies`

Tham số: `at` (`YYYY-MM-DD`, mặc định hôm nay), `domain` (vd `sale`), `branch`, `channel` (lọc theo phạm vi khi nêu; không nêu thì không lọc). Trả `{ asOf, etag, items[] }`:

| Trường của `items[]` | Nghĩa |
|---|---|
| `policyKey`, `policyId`, `version` | mã hiển thị; định danh ổn định `<module>:inline:<mã>`; số bản |
| `ruleContract` | khuôn luật, vd `sale.promo.buy_x_get_y@1` |
| `scope` | `{ branchCodes?, channels? }` — rỗng = mọi |
| `effectiveFrom`, `effectiveTo` | hiệu lực **của bản** theo ngày chứng từ (`effectiveTo` do bản sau đặt) |
| `contentHash` | sha256 nội dung đã chuẩn hoá — gửi lại ở `policyRefs[].hash` |
| `params` | tham số theo Rule Contract; `null` khi nội dung ở module chủ hoặc không đọc được (`problem` nêu lý do) |

Một bản có mặt khi **cả hai** phủ `at`: hiệu lực của bản, và (nếu có) cửa sổ chiến dịch `validFrom`/`validTo` **trong nội dung**. Bản `retired` không có mặt. `etag` đổi khi và chỉ khi tập (chính sách, bản, băm) đổi — POS hỏi lại rẻ bằng cách so `etag`.

## 4. Rule Contract và cách plugin viết lại

`GET /api/v1/rule-contracts/:id` trả `{ id, domain, title, params[], spec, vectors[] }`:

- **`params[]`**: `{ name, type, required, doc }` từng tham số.
- **`spec`**: thuật toán viết bằng dữ liệu. Plugin PHP / JS **viết lại theo spec**.
- **`vectors[]`**: `{ name, params, input, output }` — các ca chuẩn. Plugin **phải ra đúng `output`** cho mọi ca trước khi dùng. Core chạy cùng bộ ca này qua hàm thuần và qua `evaluate` (golden T031-RC-3), nên bộ ca là chuẩn chung của cả hai bên.

Luật thuần và tất định: không I/O, không đồng hồ, không ngẫu nhiên.

## 5. `POST /api/v1/policies/evaluate`

```jsonc
// yêu cầu
{ "docDate": "2026-11-15", "branchCode": "HN01", "channel": "pos",
  "lines": [ { "lineKey": "1", "sku": "A", "qty": 2 }, { "lineKey": "2", "sku": "C", "qty": 1 } ],
  "policies": [ { "key": "SALE-PROMO-001", "version": 3 } ] }   // tuỳ chọn; bỏ = mọi chính sách sale phủ docDate
// trả lời
{ "docDate": "2026-11-15",
  "applied": [ { "policyRef": { "key": "SALE-PROMO-001", "version": 3, "hash": "9c1e…", "policyId": "ban-hang:inline:SALE-PROMO-001" },
                 "ruleContract": "sale.promo.buy_x_get_y@1", "result": { "bought": 2, "times": 1, "gifts": [ { "sku": "B", "qty": 1 } ] },
                 "explain": "Mua 2 A tặng 1 B: mua 2 → 1 lần → tặng 1 B",
                 "treatment": [ { "on": "gift", "reasonCode": "XTA1.4", "confirmed": false } ] } ],
  "skipped": [ { "key": "KM-KHAC", "version": 2, "reason": "ngoài phạm vi chi nhánh" } ],
  "policyRefs": [ { "key": "SALE-PROMO-001", "version": 3, "hash": "9c1e…", "policyId": "ban-hang:inline:SALE-PROMO-001" } ],
  "gifts": [ { "sku": "B", "qty": 1, "isGift": true, "policyRef": { "key": "SALE-PROMO-001", "version": 3, "line": "gift" } } ] }
```

- **Mỗi chính sách áp độc lập trên các dòng gốc, cộng dồn.** Chưa có "áp riêng" (`exclusive`).
- **Không im lặng:** chính sách không áp được nằm ở `skipped` kèm lý do (sai bản, ngoài chi nhánh / kênh, thiếu `branchCode` / `channel` khi chính sách giới hạn, chưa đủ điều kiện, mã không có).
- **`policyRefs` chỉ gồm chính sách đã tạo ra kết quả** — đúng mảng gắn vào chứng từ nạp. Dòng quà gửi kèm `policyRef: { key, version, line }`.
- **`treatment.confirmed = false`**: mã lý do `XTA1.4` là gợi ý, kế toán trưởng chưa xác nhận bảng lý do (Q031-5); gửi cho cửa nạp thì lý do định khoản vẫn do chính sách định khoản của đơn vị quyết.
- Số lượng `qty` theo **đơn vị nhỏ nhất**, như `bizcity_ledger_intake@1`.

## 6. `POST /api/v1/policies` — phát hành inline

```jsonc
{ "key": "SALE-PROMO-001", "ruleContract": "sale.promo.buy_x_get_y@1",
  "params": { "buy": { "sku": "A", "qty": 2 }, "get": { "sku": "B", "qty": 1 }, "repeat": true, "validFrom": "2026-11-10", "validTo": "2026-11-30" },
  "scope": { "branchCodes": ["HN01"], "channels": ["pos", "online"] },
  "effectiveFrom": "2026-11-10", "reason": "Khuyến mại tháng 11", "legalRef": "NĐ 81/2018 Điều 9" }
```

- Chỉ miền `sale` (chủ `ban-hang`, `policyId` = `ban-hang:inline:<mã>`); mã dạng `[A-Z0-9][A-Z0-9_.-]{0,63}`.
- **`effectiveFrom` bắt buộc**; bản sau **đóng bản trước ở ngày − 1**; không lùi về trước ngày áp của bản trước (`400`); lùi về trước hôm nay cần `reason` ≥ 3 ký tự.
- **Bản đã phát hành không sửa.** Đổi = bản mới. Chính sách đã ngừng không nhận thêm bản (`409`) — dùng mã mới.
- Kiểm: nội dung đúng khuôn của Rule Contract và kiểm chéo trường (vd `maxGiftQty` ≥ `get.qty`); lỗi trả `400` kèm `details[{ path, message }]`, không ghi gì.
- Có bằng chứng và nhật ký như mọi action ghi (`objectType: policy`).
- **Chưa kiểm trần pháp lý của hàng khuyến mại (NĐ81: giá trị quà ≤ 50 % giá).** Cần tham số pháp lý (S030-35) và giá; chưa có thì không chặn trá hình — người phát hành tự chịu trách nhiệm cho tới khi có.

## 7. Rule Contract hiện có

### `sale.promo.buy_x_get_y@1` — mua X tặng Y

Tham số: `buy {sku, itemId?, qty}`, `get {sku, itemId?, qty}`, `repeat` (mặc định `true`), `maxGiftQty?`, `validFrom?`, `validTo?`.

```
bought  = Σ qty của dòng khớp hàng mua (itemId nếu chính sách có, không thì sku); bỏ dòng qty ≤ 0
times   = repeat ? floor(bought / buy.qty + 1e-9) : (bought ≥ buy.qty − 1e-9 ? 1 : 0)
giftQty = min(times × get.qty, maxGiftQty nếu có), làm tròn 4 chữ số thập phân
```

`1e-9` chặn sai số nhị phân khi chia số lẻ (vd `0,6 / 0,2 = 2,9999999999999996` sẽ ra 2 lần thay vì 3). Ca chuẩn (`vectors`): 2 A → 1 B · 3 A → 1 B · 4 A → 2 B · 4 A không `repeat` → 1 B · 1 A → 0 · không có A → 0 · nhiều dòng cùng A cộng dồn · `maxGiftQty` chặn · số lẻ.

## 8. Giới hạn đã biết (v1)

- Áp độc lập, cộng dồn; chưa có "áp riêng".
- Chưa kiểm trần pháp lý của hàng khuyến mại.
- Sự kiện `bizcity.policy.published` / `.retired` đã có từ 1.1.0 (mục 10); `etag` vẫn là đường dự phòng khi mất webhook.
- Chưa có Rule Contract bán hàng khác (bảng giá, chiết khấu, hạn mức) và chưa có bọc cho chính sách mua hàng.
- Chưa có tính lại ở cửa nạp để kiểm kết quả (`IN-POL-004`): cửa nạp mới kiểm tham chiếu (mã, bản, băm, ngày).
- Chủ `ban-hang` chỉ là nhãn cho tới khi tách được module bán hàng (S030-16, chưa tách).

## 9. Changelog

- **1.3.0-draft (2026-11-09):** PHASE-031 W4c — `program[]` ở `GET /api/v1/policy-tracking` (mục 11). Thêm khoá, không đổi khoá cũ.
- **1.2.0-draft (2026-11-09):** PHASE-031 W4a — bốn action đọc cho màn Chính sách và Theo dõi thực hiện (mục 11). Thêm, không phá.
- **1.1.0-draft (2026-11-08):** PHASE-031 W3b — sự kiện `bizcity.policy.published` / `.retired` (mục 10). Thêm, không phá.
- **1.0.0-draft (2026-11-08):** PHASE-031 W3a — bốn endpoint, Rule Contract đầu tiên `sale.promo.buy_x_get_y@1`.

## 10. Sự kiện (W3b)

Core phát hai loại qua outbox ([bizcity_event@1 §7](BIZCITY-EVENT-v1.md)), **cùng giao dịch** với việc ghi sổ đăng ký (giao dịch huỷ thì không có sự kiện):

| `type` | `subject` | `data` |
|---|---|---|
| `bizcity.policy.published` | `policy:<policyId>` | `{ policyId, policyKey, version, ownerModule, ruleContract, effectiveFrom, contentHash, closes: { version, effectiveTo } \| null }` |
| `bizcity.policy.retired` | `policy:<policyId>` | `{ policyId, retiredVersions[] }` |

- **Không mang nội dung chính sách.** Nhận sự kiện rồi gọi `GET /api/v1/policies` (có `etag`) để lấy bản mới — một nguồn sự thật. `closes` cho biết bản trước hết hiệu lực ngày nào, nên nguồn ngoại tuyến cập nhật được mà không đoán.
- App ngoài (POS WP, sàn) là app `kind: "app"` có `events.subscribes` hai loại này và `app.webhook.url`; nhận bằng webhook ký HMAC, giao ít nhất một lần, `Idempotency-Key = id sự kiện` ([bizcity_event@1 §7a](BIZCITY-EVENT-v1.md)).
- Chống phát đôi: `dedupeKey` = `policy.published:<policyId>:<version>` / `policy.retired:<policyId>:<số bản lớn nhất>`.

## 11. Đọc sổ đăng ký, theo dõi, truy vết (W4a)

Bốn endpoint đọc, quyền `catalog:read`, không ra MCP / AI. Nguồn: `policy_registry` + khung nhìn `bizcity_read.policy_application`; không bảng tổng hợp.

| Endpoint | Trả |
|---|---|
| `GET /api/v1/policy-registry?owner&status&q` | `items[]` mỗi chính sách: `policyId, policyKey, ownerModule, ruleContract, versions[]` (`version, effectiveFrom/To, status, contentHash, scope, publishedBy/At, reason, applied`), `current` (bản hiệu lực hôm nay), `gaps[]`, `expiresOn` |
| `GET /api/v1/policy-registry/:policyId/applications?version&cursor&limit` | `items[]` (`eventId, docKey, docType, docDate, sourceSystem, status, version, codes[], ok`), `next` = `eventId` dòng cuối (truyền vào `cursor`); `policyId` lạ → 404 |
| `GET /api/v1/policy-tracking?from&to&branch&source&owner` | `range`, `applied { events, total }`, `pass { events, passed, rate }`, `codes[] { code, n }`, `coverage[] { sourceSystem, events, withRefs, rate }` (miền bán), `stale[]` (`IN-POL-003` theo nguồn × chính sách, kèm bản cuối đã gửi), `timeline[]`, `health { expiringSoon, noPublished, gaps }`, `program[]` (1.3.0: mỗi *(chính sách, bản)* có chứng từ trong kỳ — `policyId, policyKey, version, orders, giftsBySku[] { sku, qty }, mismatched, mismatchRate`; quà lấy từ các dòng quà nguồn đã gửi trong chứng từ đã ghi sổ (`isGift`, `policyRef.key` + `policyRef.version`), `mismatched` = chứng từ có `IN-POL-004`). Mặc định 30 ngày theo ngày chứng từ; `rate` là `null` khi mẫu số 0 |
| `GET /api/v1/policy-lineage?eventId` hoặc `?docKey` | `event`, `refs[]` (`key, version, sentHash, registered, policyId, registryHash, hashMatches, covers, effectiveFrom/To`), `policyCheck` lúc nhận; không thấy sự việc → 404 |

Giới hạn: ô *Thực hiện chương trình* chỉ có số chứng từ áp, số lượng quà theo mặt hàng và số chứng từ lệch; **giá trị hàng tặng** (cần giá vốn / giá bán, chưa có nguồn đọc thống nhất) và **ngân sách** (Rule Contract chưa có tham số ngân sách — Q031-7) chưa có. Độ phủ chỉ tính miền bán (`doc_type = sale`, có Rule Contract `sale.*` hiệu lực trong kỳ).
