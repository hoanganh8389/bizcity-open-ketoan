# `bizcity_policy@1` — Chính sách nghiệp vụ cho nguồn ngoài: lấy, tính, gửi tham chiếu
<!-- [2026-11-08 03:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a (S031-13, ADR-0031, chữ chốt PHASE-031 · 00 §9): hợp đồng API chính sách — GET /policies, GET /rule-contracts, POST /policies/evaluate, POST /policies; Rule Contract sale.promo.buy_x_get_y@1 -->

<!-- [2026-11-21 09:32 AM Võ Hoàng] PHASE-031 — S031-11: 1.4.0-draft — miền purchase, mười ba Rule Contract purchase.<loại>@1 bọc bộ máy mua hàng (mục 7.2), phát hành inline chặn miền purchase (mục 6) -->
<!-- [2026-11-21 06:10 PM Võ Hoàng] PHASE-031 — S031-7: 1.5.0-draft — miền approval, Rule Contract approval.levels@1 (mục 7.3), POST /api/v1/policies/sync-settings (mục 12), store = settings đọc được ở GET /policies; phát hành inline chặn miền approval -->
> **Phiên bản:** 1.5.0-draft · 2026-11-21 · **Trạng thái:** Đề xuất — chạy được từ W3a, chưa cam kết ổn định cho tới khi POS dùng thật (xem [BIZCITY-API-v1 §5](BIZCITY-API-v1.md))
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
| `POST /api/v1/policies/sync-settings` | `settings:write` | đồng bộ phong bì của khoá cấu hình đánh chỉ mục (`store = settings`, §12; 1.5.0) |

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
| `params` | tham số theo Rule Contract; `null` khi nội dung ở module chủ hoặc không đọc được (`problem` nêu lý do). Bản `store = settings` (1.5.0): dựng lại từ giá trị khoá cấu hình hiệu lực ở ngày áp của bản, khớp băm mới trả — lệch (bản bị thay trong ngày, cấu hình ghi lùi) thì `null` |

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

- Chỉ miền `sale` (chủ `ban-hang`, `policyId` = `ban-hang:inline:<mã>`); mã dạng `[A-Z0-9][A-Z0-9_.-]{0,63}`. Rule Contract miền `purchase` → `400` (1.4.0): chính sách mua hàng do module mua hàng làm chủ (`mua-hang.policy:<id>`, sửa ở Mua hàng → Chính sách). Miền `approval` → `400` (1.5.0): nội dung ở `setting_values`, sổ đăng ký chỉ đánh chỉ mục (§12).
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

### 7.2 `purchase.<loại>@1` — chính sách mua hàng (1.4.0, S031-11)

Mười ba khuôn, mỗi `PolicyKind` của `@bizcity/mua-hang-domain` một khuôn, `domain: "purchase"` (`GET /api/v1/rule-contracts` liệt kê cùng `sale.*`). Tham số = nội dung một bản chính sách mua hàng ở sổ đăng ký: `code, kind, name, scope{partnerCode, brandCode, sku, branchCode, branchCodes, withChildren, contractCode}, rule{…theo loại}, isActive, validFrom, validTo, priority`; `rule` giữ nguyên khoá lạ. `evaluate` **gọi lại** hàm của engine mua hàng — không viết lại công thức; `describe().spec.mode` nói cách tính:

| Cách (`spec.mode`) | Loại | Hàm engine | Đầu vào → đầu ra |
|---|---|---|---|
| `compute` | `trade_discount`, `item_discount`, `qty_tier`, `payment_discount` | `computeDoc` với đúng một chính sách | `{ doc, holidays?, units?, familyCodes? }` → `{ applied, gross, lineDiscount, orderDiscount, beforeTax, tax, payable, dueDate?, ckttExpected?, lines[], trace[] }` |
| `compute` | `promo_gift` | `giftPlan` | `{ doc, familyCodes? }` → `{ gifts[] }` |
| `compute` | `period_rebate`, `target_rebate`, `stage_rebate` | `rebateFor` | `{ sales: { total, byDay? } }` → `{ policy, kind, base, rate, amount, detail[], stages? }` |
| `check` | `credit_limit` | `creditStatus` | `{ current, openOrders, thisDoc, branchCode? }` → trạng thái hạn mức (`null` khi không có) |
| `check` | `payment_term` | `termFromRule`, `termText`, `dueDateFor` | `{ doc: { docDate, invoice?, receivedDate?, invoiceFix? }, holidays? }` → `{ term, text, dueDate? }` |
| `describe` | `supply_target`, `lot_tracking`, `gift_budget` | — (engine không có hàm tính) | `{}` → `{ mode: "describe", kind, rule }` — chỉ trả lại tham số; so thực tế ở module mua hàng |

- **Không đổi kết quả:** hồi quy `apps/api/test/phase-031-purchase-contracts.test.ts` so kết quả qua hợp đồng với engine gốc trên các phiếu mẫu của test mua hàng (trọn `DocCalc`, từng đồng).
- `compute` của loại tính trên phiếu đi trọn đường engine (phạm vi, hiệu lực, áp riêng / áp đồng thời, quy đổi ĐVT); `check` / `describe` không xét phạm vi — người gọi chọn bản theo sổ đăng ký.
- `treatment` rỗng: hạch toán mua hàng theo bảng hạch toán của module, không gợi ý `reasonCode` ở đây.
- `vectors` mang số của tài liệu yêu cầu mua hàng (TH1 phải trả 39.082.320, hạn 15/10/2026; TH3 còn 32.550.000 / vượt 7.450.000; TH4 CKTT 781.646). Plugin ngoài không viết lại `compute` bằng spec ngắn — gọi Core hoặc dùng gói `@bizcity/mua-hang-domain`.
- Không phát hành inline (mục 6); chưa tính lại chính sách mua ở cửa nạp (L4b cho chứng từ mua — đợt sau, cần chữ chốt riêng).

### 7.3 `approval.levels@1` — cấp duyệt theo số tiền (1.5.0, S031-7)

`domain: "approval"`. Tham số (rút gọn [PHASE-030 · 16 §5.1](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/16-CHUAN-CHUNG-TU-DUNG-CHUNG.md)): `bands[{ from, to?, levels[{ permission }] }]` — dải liền nhau, nửa mở `from ≤ số tiền < to`, dải đầu từ 0, chỉ dải cuối không có `to`; `levels` rỗng = không cần duyệt. `evaluate({ amount })` → `{ band, levels[], count }`; số tiền âm / không phải số → `indeterminate: true`. `publishChecks` bắt dải không từ 0, hở, chồng, dải giữa mở, dải cuối đóng, `to ≤ from`, quyền lặp. `treatment` rỗng.

- **Khoá `bizcity.payment.approval_thresholds`** (yêu cầu thanh toán, migration 0161) ↔ dải: giá trị `N > 0` → `[{ from: 0, to: N, levels: [payments:approve] }, { from: N, levels: [payments:approve, payments:approve-final] }]`; `0` / không có → `[{ from: 0, levels: [payments:approve] }]`. Cùng số cấp với luồng duyệt hiện có (số tiền ≥ ngưỡng → hai cấp) — test `apps/api/test/phase-031-approval-levels.test.ts` (T031-AP-2) so trên nhiều ngưỡng × số tiền và với `levels_required` thật của yêu cầu lập qua API.
- Luồng duyệt yêu cầu thanh toán **chưa đổi**: vẫn đọc khoá trực tiếp; Rule Contract và phong bì để mô tả, truy vết, cho bộ kiểm đọc. Chính sách duyệt chung cho mọi chứng từ: DOC-030-4.

## 8. Giới hạn đã biết (v1)

- Áp độc lập, cộng dồn; chưa có "áp riêng".
- Chưa kiểm trần pháp lý của hàng khuyến mại.
- Sự kiện `bizcity.policy.published` / `.retired` đã có từ 1.1.0 (mục 10); `etag` vẫn là đường dự phòng khi mất webhook.
- Chưa có Rule Contract bán hàng khác (bảng giá, chiết khấu, hạn mức). Chính sách mua hàng có khuôn `purchase.*` từ 1.4.0 nhưng chưa tính lại ở cửa nạp.
- Chưa có tính lại ở cửa nạp để kiểm kết quả (`IN-POL-004`): cửa nạp mới kiểm tham chiếu (mã, bản, băm, ngày).
- Chủ `ban-hang` chỉ là nhãn cho tới khi tách được module bán hàng (S030-16, chưa tách).

## 9. Changelog

- **1.5.0-draft (2026-11-21):** PHASE-031 S031-7 — `domain` thêm giá trị `approval`; Rule Contract `approval.levels@1` (mục 7.3); `POST /api/v1/policies/sync-settings` đánh chỉ mục khoá ngưỡng duyệt vào sổ đăng ký với `store = settings` (mục 12); `GET /api/v1/policies` trả `params` của bản `store = settings` (khớp băm); `POST /api/v1/policies` từ chối miền `approval`. Thêm, không phá.
- **1.4.0-draft (2026-11-21):** PHASE-031 S031-11 — `domain` thêm giá trị `purchase`; mười ba Rule Contract `purchase.<loại>@1` bọc bộ máy mua hàng (mục 7.2); `POST /api/v1/policies` từ chối miền `purchase`. Thêm, không phá.
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

## 12. Khoá cấu hình trong sổ đăng ký — `store = settings` (1.5.0, S031-7)
<!-- [2026-11-21 06:10 PM Võ Hoàng] PHASE-031 — S031-7 (31-S031-7): đánh chỉ mục khoá ngưỡng duyệt, đồng bộ từ phía sổ chính sách -->

Nội dung ở `setting_values` (một nguồn, có phiên bản, ngày hiệu lực); `policy_registry` chỉ giữ phong bì. Đợt này một khoá: `bizcity.payment.approval_thresholds` → `policyId` = `quy:settings:bizcity.payment.approval_thresholds`, `policyKey` = tên khoá, `ownerModule` = `quy`, `store` = `settings`, `storeRef` = tên khoá, `ruleContract` = `approval.levels@1`, `contentHash` = băm của `bands` dựng từ giá trị.

`POST /api/v1/policies/sync-settings` (`settings:write`, `{ key? }`) — action `core.policy.sync-settings`, chạy lại không sinh bản trùng:

- Dòng thời gian của khoá ở phạm vi đơn vị: mỗi ngày hiệu lực một giá trị (phiên bản lớn nhất của ngày — như `getSetting`), ngày liền nhau cùng giá trị gộp lại. Khoá chưa có phiên bản → một bản "từ đầu" (`effectiveFrom: null`) với giá trị mặc định.
- Đoạn có ngày ≥ ngày áp của bản cuối mà băm khác → bản mới, `effectiveFrom` = ngày hiệu lực của phiên bản cấu hình; bản trước đóng ở ngày − 1 (cùng ngày → bản trước thành khoảng rỗng). Người phát hành = người ghi phiên bản cấu hình; lý do ghi phiên bản nguồn và người chạy đồng bộ.
- Phiên bản cấu hình **ghi lùi** về trước ngày áp của bản cuối: sổ không viết lại quá khứ → không nối, trả ở `drift[{ at, registryVersion, registryHash, settingsHash }]`; không tự sửa.
- Trả `{ items: [{ key, policyId, ruleContract, published[], current, drift[], problem? }] }`. Chính sách đã ngừng → `problem`, không nối thêm.
- Đổi khoá qua đường cấu hình hiện có (`PUT /api/v1/payment-request-settings`, `PUT /api/v1/settings/values/:key`) **không** tự gọi đồng bộ (không sửa đường ghi cấu hình của lõi); quản trị chạy action này.

