# PHASE-024 · 50 — Để dev và CEO hiểu và tuân thủ: năm lớp, từ "không thể sai" tới "hiểu vì sao"
<!-- [2026-11-02 09:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — chương trình tuân thủ ADR-0017 / ADR-0018 cho dev (viết plugin, self-host) và CEO (chủ đơn vị): kiểu dữ liệu chặn trước, lỗi dạy tại chỗ, manifest khai, bộ kiểm chặn merge, trang quy định cho CEO -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Chủ dự án 2026-11-02: *"tôi duyệt đồng ý những gì bro đưa ra, nhưng tôi muốn dev, CEO khi code hiểu những điều này để họ tuân thủ, tuy nhiên tôi chưa nghĩ ra phương án."*

## 0. Nguyên tắc của chương trình

**Không ai đọc tài liệu trước khi code. Họ đọc khi bị chặn.** Vì vậy thứ tự ưu tiên ngược với bản năng viết tài liệu:

1. **Không thể sai** (kiểu dữ liệu, SDK, trigger): cách sai không biên dịch được, không chạy được.
2. **Sai thì bị chặn và được dạy tại chỗ**: mọi lỗi / cảnh báo nói *vi phạm luật nào, vì sao sổ sẽ sai, sửa ở đâu* — một thông báo = một bài học 3 câu.
3. **Khai trước khi được nạp**: plugin phải khai trong manifest nó tuân thủ bất biến nào; `module check` in bảng ca chuẩn.
4. **AI agent của dev đọc luật thay dev**: `AGENTS.md` là nơi Claude / Copilot của dev đọc đầu tiên — luật đặt ở đó thì mã sinh ra đã đúng.
5. **CEO không đọc luật, CEO đọc tình trạng**: trang Quy định (HT09) nói "đơn vị bạn đang đạt / thiếu nguyên tắc nào, hậu quả, ai sửa".

Tài liệu dài (ADR, RULE) vẫn cần — làm **nguồn** cho năm lớp trên, không phải kênh truyền đạt chính.

## 1. Lớp 1 — Không thể sai: SDK và kiểu dữ liệu

| Việc | Hiệu quả | Đợt |
|---|---|---|
| SDK không có kiểu nào nhận `sku` làm khoá: dòng hàng của `ctx.ledger.submit` nhận `ItemRef = { itemId } \| { sku } \| { barcode } \| { external }`, trả `IngestResult` có `resolution[]` | dev không thể "tự khoá bằng mã" vì không có API làm thế | W1 |
| `ctx.data` chỉ có khung nhìn `bizcity_read.items`, `item_codes`, `partners`…; không có bảng ghi | ghi thẳng danh mục là lỗi SQL quyền (`mod_<key>_rw`, ADR-0011 D4) — đã có | có |
| `core.item.*`, `core.partner.*` là cách **duy nhất** tạo / sửa danh mục; mỗi action khai `changeClass` và tự chặn hạng 2–3 không có duyệt | quy trình bốn hạng nằm trong chữ ký action, không phải trong trí nhớ dev | W2 |
| Luật định khoản không import `@bizcity/mua-hang-domain` (SC-ITEM-3) | "suy tài khoản từ đuôi mã" không qua CI | W3 |

## 2. Lớp 2 — Lỗi dạy tại chỗ (cùng khuôn với thẻ tài khoản, PHASE-023)

Mọi lỗi / phát hiện liên quan danh mục đi `bizcity_errors@1` + `bizcity_remedy@1` và có thêm `why`:

```json
{ "code": "VALIDATION_ERROR", "message": "Mã hàng SP000912 không tra được ra mặt hàng tại ngày 12/10/2026",
  "finding": "IN-ITEM-001", "rule": "R-ITEM-6",
  "why": "Dữ liệu từ POS phải qua validation trước khi chạm sổ (ADR-0017). Nếu Core tự tạo mặt hàng, nó sẽ không có phân loại và bị ghi vào tồn kho / giá vốn như hàng hoá dù có thể là dịch vụ.",
  "remedy": { "steps": ["Tạo mặt hàng từ dòng này (điền sẵn)", "hoặc thêm mã ngoài external:pos-cn02 vào mặt hàng có sẵn"], "screen": "DM/mat-hang", "role": "catalog:write" },
  "learnMore": "docs/rules/RULE-ITEM.md#R-ITEM-6", "requestId": "…", "traceId": "…" }
```

- Dev thấy JSON này trong log / Bàn điều tra; CEO thấy câu `why` bằng tiếng người ở trạm tiền kiểm.
- Check **SC-FIX-2** (mở rộng SC-FIX-1): mọi mã `IN-ITEM-*`, `DG-ITEM-*`, lỗi trigger bất biến phải có `why` + `rule` trỏ mã luật có thật (SC-CON-5 đã kiểm mã luật tồn tại).
- Trigger CSDL ném thông điệp tiếng Việt cùng khuôn: `R-ITEM-0: không được đổi item_id của dòng sổ đã ghi (BT26-0012345). Đổi mã → core.item.add-code; đổi phân loại → core.item.reclassify.`

## 3. Lớp 3 — Khai trước khi được nạp: manifest và `module check`

- `bizcity_module@1` 1.5: trường `conformsTo: ["R-ITEM-0", "R-ITEM-6", "R-LEDGER-1", …]` **bắt buộc** với module có `requires.capabilities` chạm `ledger.*` / `item.*` / `masterdata.write`. Thiếu → SC-MOD-3 block; không phải chữ ký hình thức: mỗi mã khai sẽ **bật đúng ca chạy máy** tương ứng ở lane runtime (`CA-MD-02`, `CA-MD-03`, `CA-POST-01`… — [10 §5](10-DANH-MUC-CO-PHIEN-BAN.md)).
- `npm run module -- check <key>` (4.1) in **bảng tuân thủ** của plugin: mỗi bất biến một dòng, ✔ / ✘ / ○, kèm câu "vì sao" và link; `verify` thoát mã 1 khi có ✘. Đây là thứ dev chạy trước khi gửi PR và CEO self-host chạy trước khi bật module.
- Template `templates/starter-module` (4.2) sinh sẵn `conformsTo`, action mẫu tạo mặt hàng qua `core.item.upsert`, test mẫu CA-MD-02 — dev **sao chép cái đúng** thay vì đọc cái cấm.

## 4. Lớp 4 — AI agent của dev đọc luật

- `AGENTS.md` thêm mục ngắn "Danh mục có phiên bản (ADR-0018)" ngay dưới Bốn câu không thương lượng — làm ở W0 (commit này). Claude / Copilot của dev đọc tệp này trước khi sinh mã; `copilot-instructions.md` trỏ cùng mục.
- `docs/HUONG-DAN-LAM-VIEC.md` §3 "Mười điều cấm" thêm hai điều 11–12 (khoá bằng mã; danh mục tự sinh bút toán) — W0.
- `AGENTS.md` "Tạo module mới" (4.4): bước "khai `conformsTo`, chạy `module check`".

## 5. Lớp 5 — CEO đọc tình trạng, không đọc luật

| Thứ CEO thấy | Nói gì | Đợt |
|---|---|---|
| **Trang Quy định (HT09)** — "Quy định dữ liệu danh mục" | sáu nguyên tắc = sáu dòng ✔ / ⚠ / ✘ với **số thật** và **hậu quả tiền** ("17 mã chưa phân loại → lãi gộp tháng 10 có thể sai"), nút sửa, ai làm | W4 |
| **Hộp thoại "Thay đổi"** khi sửa danh mục | tự xếp hạng 0–3 và nói hậu quả: "sổ không đổi" / "cần kế toán trưởng duyệt và một chứng từ ~312 tr" | W4 |
| **Biên bản duyệt hạng 3** | CEO / kế toán trưởng ký trên màn, có bằng chứng — họ hiểu vì họ là người ký | W2–W3 |
| **Bàn đánh giá (HT08)** vai kế toán trưởng / kiểm soát | ca F24-ITEM-* nằm trong checklist theo vai — đã có khuôn (PHASE-022) | W3 |
| **Hướng dẫn 1 trang** `docs/huong-dan/quy-dinh-du-lieu-danh-muc.md` | "Phần mềm bảo vệ bạn khỏi gì" bằng 6 câu, mỗi câu một ví dụ thanh tra hỏi | W4 |

## 6. Đo được không?

- `bizcity_item_validation_findings_total{code}` giảm theo thời gian trên bản cài = người dùng đã học.
- Tỷ lệ plugin có `conformsTo` đầy đủ và `module check` ✔ trong registry.
- Số lần hạng 3 được duyệt / bị từ chối, có biên bản.
- Bảng điểm đầu vào (PHASE-021) theo nguồn: nguồn POS gửi mã lạ giảm sau khi đội POS đọc `why`.

## 7. Việc thêm vào checklist

| ID | Việc | Đợt |
|---|---|---|
| S024-23 | W0: AGENTS.md mục "Danh mục có phiên bản"; HUONG-DAN-LAM-VIEC §3 điều 11–12; CONTRIBUTING §1 chú thích | W0 ✅ |
| S024-24 | `why` + `rule` trong `bizcity_errors@1` / `bizcity_remedy@1` cho IN-ITEM-*, DG-ITEM-*, trigger bất biến; SC-FIX-2 | W1–W3 |
| S024-25 | `conformsTo` trong manifest (`bizcity_module@1` 1.5) → bật ca chạy máy; `module check` in bảng tuân thủ; template starter có sẵn | W3 (nối 4.1, 4.2) |
| S024-26 | HT09 cho CEO: hậu quả tiền, ai làm; hộp thoại "Thay đổi" tự xếp hạng; hướng dẫn 1 trang | W4 |
