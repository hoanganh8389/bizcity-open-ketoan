# 08. Phân hệ Mua hàng — phân tích nghiệp vụ, thiết kế dữ liệu, hạch toán

Tài liệu dùng để **thuyết trình và bảo vệ** phân hệ Mua hàng. Nó giải quyết 25 tình huống của tài liệu yêu cầu (NCC Trung Hậu, Hoàng Nhi, Thắng Bảo; nhãn Anlene). Phân hệ **chạy thật**: bảng dữ liệu, API, duyệt là ghi sổ kế toán.

Đọc kèm:
- [Hợp đồng API](../api/14-mua-hang.md);
- màn **Tổng quan mua hàng (MH00)**: bảng 25 tình huống, cột "Khớp" do phần mềm tự tính lại.

## 1. Mục tiêu

| Ai | Cần gì | Phân hệ đáp ứng |
|---|---|---|
| Kế toán / mua hàng | Lập phiếu nhanh, ít gõ, không sai số; biết ngay phiếu có vấn đề | Phiếu **tự áp chính sách** (CK, bậc, quà, CKTT, hạn), **tự cảnh báo** (giá, hạn mức, quà, lô, hoá đơn), **duyệt là ghi sổ** (bút toán, công nợ, kho) |
| Trưởng phòng | Kiểm soát hạn mức, giá mua, quà, thưởng | Chặn duyệt khi vượt hạn mức, duyệt ngoại lệ có lý do; hạn mức, tuổi nợ, thưởng theo sổ thật |
| Quản trị | Giá vốn thực tế để định giá bán, tránh bán dưới vốn | Giá vốn từng mã sau CK, quà chia giá, chi phí, thưởng |
| Team công nghệ | Dễ hiểu, dễ bảo trì, dễ mở rộng | **2 bảng mới**, JSON cho phần hay đổi, một bộ máy chính sách, nhật ký JSONL, bộ tính dùng chung có phép thử, **không có sổ riêng** |

## 2. Nguyên tắc thiết kế

1. **Không làm sổ mới.** Duyệt phiếu mua là dựng chứng từ đưa vào **lõi có sẵn**:
   - cổng nhận chứng từ `postDocumentIn`: bút toán, sổ hoá đơn, công nợ theo chứng từ, biến động kho;
   - phiếu kế toán `voucherService`: phiếu chi, báo nợ, phiếu kế toán có trừ khoản công nợ.

   Báo cáo kế toán (sổ cái, công nợ, nhập xuất tồn, bảng kê mua vào) tự có số liệu mua hàng, không phải đồng bộ.
2. **Cột cho thứ cần lọc — JSON cho thứ hay đổi.**
   - Số phiếu, ngày, NCC, nhãn, chi nhánh, số hoá đơn, hạn, tổng tiền là **cột** (có chỉ mục).
   - Dòng hàng, điều khoản, lịch trả, cảnh báo, vết chính sách nằm trong **`data jsonb`**.
3. **Một bộ máy chính sách thay cho nhiều bảng cấu hình.**
   - Mọi loại chính sách cùng khuôn: *loại + phạm vi + hiệu lực + quy tắc (JSON)*.
   - Thêm loại = thêm một khuôn kiểm tra + một nhánh tính, **không thêm bảng**.
4. **Bộ tính dùng chung, một nguồn sự thật** (`packages/contracts/src/mua-hang/engine.ts`).
   - Hàm thuần, chạy cả ở máy chủ (khi lưu, duyệt) lẫn trình duyệt (tổng tiền hiện ngay khi gõ), nên hai phía ra đúng một con số.
   - Máy chủ **tính lại** mọi tổng tiền, không nhận số gửi lên.
5. **Số liệu thật lấy từ sổ.**
   - Nợ NCC = công nợ theo chứng từ trên tài khoản 331.
   - Tồn lô = tồn kho thật chia theo FEFO.
   - Lịch sử giá = mọi phiếu nhập, kể cả phiếu từ hệ thống bán hàng gửi sang.
6. **Sự kiện → JSONL.**
   - Cảnh báo, chính sách đã áp, duyệt ngoại lệ, điều chuyển hạn mức, tính thưởng chỉ ghi thêm, đọc theo thời gian, nên lưu tệp JSONL, không cần bảng.
   - Duyệt ngoại lệ ghi thêm `audit_logs`.

## 3. Luồng nghiệp vụ

```
 Chính sách (MH04)  ──►  Đơn đặt  ──►  Phiếu nhập (MH11)  ──►  Duyệt  ─────────►  Sổ kế toán (lõi có sẵn)
 CK, bậc, KM, CKTT,      giữ hạn      tự áp chính sách        vượt hạn mức        bút toán, công nợ theo
 hạn mức, hạn trả,       mức; ứng     + Trợ lý mua hàng       → chặn → duyệt      chứng từ, kho, lô,
 giá cố định, thưởng,    trước        (số liệu thật)          ngoại lệ có lý do   sổ hoá đơn mua vào
 theo dõi lô
 Cuối kỳ: Tính thưởng (MH06) · Phân bổ chi phí (MH07) → giá vốn thực tế
 Theo dõi: Hạn mức & đến hạn (MH05) · Lô & hạn dùng (MH08) · Quà tặng (MH09) · Nhật ký (MH10)
 Báo cáo: Tổng hợp mua hàng theo NCC / nhãn / ngành / nhóm / mã / chi nhánh (MH11) · Cài đặt: ngày lễ, báo trước hạn, tài khoản (MH12)
```

### Trợ lý mua hàng — máy chủ phân tích lại sau mỗi lần sửa phiếu

1. **Giá mua.** Hiện giá cố định (chính sách) và **5 lần nhập gần nhất** (phiếu của phân hệ + hàng nhập từ nguồn khác).
   - Lệch quá ngưỡng (mặc định 2%) → cảnh báo vàng; lệch gấp đôi ngưỡng → đỏ.
   - Giá gồm VAT và giá chưa VAT được quy đổi trước khi so.
   - Chọn mã hàng tự điền giá cố định; nút "Dùng giá lần gần nhất".
2. **Chính sách tự áp** (hiện vết tính):
   - CK trên đơn: theo chính sách NCC, hoặc riêng cho phiếu (% / tiền / không), chia vào từng dòng;
   - bậc số lượng: chọn đúng bậc, không áp nhầm bậc cao;
   - KM mua X tặng Y: **tự thêm / chỉnh / bỏ dòng quà** mỗi khi bảng hàng đổi (`syncGifts`); bảng khuyến mại (`promoBoard`) báo đã áp · thiếu / thừa quà · mua thêm để được;
   - CKTT dự kiến.
3. **Công nợ & hạn mức (theo sổ).**
   - Nợ đã ghi (331 tới ngày phiếu) + hàng đang chờ (phiếu chờ duyệt, đơn đặt chưa nhận) + phiếu này, so với hạn mức NCC.
   - Hạn mức nhãn phân bổ cho chi nhánh: phần **chưa trả** của các phiếu nhập tại chi nhánh × **tỉ trọng của nhãn** trong từng phiếu (phiếu nhiều nhãn chia đúng phần; tính cả NCC khác bán cùng nhãn).
   - Không khai chính sách thì dùng hạn mức ở danh mục đối tượng.
   - Dùng từ 90% → cảnh báo. Vượt → **chặn duyệt**; chỉ người có quyền duyệt "Duyệt ngoại lệ" được, bắt buộc ghi lý do.
4. **Hạn thanh toán.**
   - Tính từ ngày hoá đơn / ngày đơn; ngày làm việc (trừ T7, CN, lễ trong cài đặt) / ngày lịch; hoặc công nợ cố định.
   - Có thể lập lịch trả nhiều đợt.
5. **Đối soát hoá đơn.**
   - Tổng hoá đơn so với tổng tính.
   - **Trùng số hoá đơn** cùng NCC: chặn, có unique index ở CSDL.
   - Đối chiếu 3 bên đơn đặt ↔ phiếu nhập ↔ hoá đơn.
   - Tiền ứng trước chưa đối trừ: tự đối trừ khi duyệt.
6. **Kiểm tra theo sổ và chứng từ khác.**
   - NCC đang có nợ quá hạn → cảnh báo khi lập phiếu nhập / đơn đặt.
   - Trả hàng quá số còn lại của phiếu gốc → chặn.
   - Xuất quà vượt tồn quà của chương trình tại chi nhánh → chặn.
   - Nhận quà chưa có giá trị → chặn.
7. **Lô / hạn dùng.**
   - Mặt hàng có chính sách "Theo dõi lô" bắt buộc số lô + hạn dùng (chặn).
   - Cận date ≤ 30 ngày → cảnh báo, ≤ 7 ngày → đỏ; đã hết hạn → chặn.
8. **Bút toán** (tài khoản thật của đơn vị) và **giá vốn thực tế** ngay trên phiếu.

## 4. Thiết kế cơ sở dữ liệu — `db/migrations/0010_mua_hang.sql`

**Chỉ thêm 2 bảng. Không sửa bảng nào của lõi.**

### 4.1 `purchase_documents` — mọi chứng từ phía mua trong một bảng

| Nhóm | Cột |
|---|---|
| Định danh | `id`, `tenant_id`, `kind`, `status` (`draft` → `pending_approval` → `approved` · `cancelled`), `doc_no`, `doc_date` |
| Lọc | `branch_code`, `partner_code`, `brand_code`, `invoice_no`, `invoice_serial`, `invoice_date`, `due_date` |
| Tiền | `total_before_tax`, `total_tax`, `total` — máy chủ tính lại từ dòng |
| Liên kết | `ref_ids` (đơn đặt, phiếu gốc, phiếu nhập được phân bổ / được trả); `links` (chứng từ kế toán đã sinh khi duyệt: `docKey`, `docNo`, `eventId`, vai trò); `revision` (số lần duyệt = phiên bản chứng từ kế toán) |
| Dữ liệu | `data jsonb` (xem 4.3) |
| Vết | `is_demo`, `created_by`, `created_by_name`, `approved_by`, `approved_at`, timestamps |

Ràng buộc:
- `UNIQUE (tenant_id, kind, doc_no)`;
- unique index **chặn trùng hoá đơn** (NCC + ký hiệu + số) với phiếu đang chờ duyệt / đã duyệt.

| `kind` | Nghĩa | Khi duyệt sinh |
|---|---|---|
| `order` | Đơn đặt hàng | Không ghi sổ (giữ hạn mức) |
| `receipt` | Nhập mua | Chứng từ `purchase` + tự đối trừ ứng trước |
| `return` | Trả hàng NCC | Chứng từ `purchase_return` (gắn phiếu gốc) |
| `exchange` | Đổi hàng | `purchase_return` (trả đi) + `purchase` (nhận về) + bù trừ / phiếu chi / phiếu thu chênh lệch |
| `gift_in` | Nhận quà không hoá đơn | `stock_adjustment` tăng, lý do NQUA (Có 711…) |
| `gift_out` | Xuất quà tặng | `stock_adjustment` giảm, lý do XQUA (Nợ 641…), giá vốn chốt khi tính giá vốn tháng |
| `cost` | Chi phí mua hàng (vận chuyển, bốc xếp, lưu kho, bảo hiểm, kiểm định…) | Chứng từ `purchase` của đơn vị dịch vụ, dòng **SL 0** theo mã của **một hay nhiều** phiếu nhập |
| `rebate` | Thưởng cuối kỳ (từ MH06) hoặc **chiết khấu / giảm giá sau mua** (gắn phiếu nhập) | Chứng từ `purchase_return`, dòng **SL 0** theo mã; có hoá đơn điều chỉnh thì giảm cả 1331 |
| `prepayment` | Ứng trước | Phiếu chi / báo nợ, mục đích "trả trước cho NCC" |
| `payment` | Trả tiền | Phiếu chi / báo nợ trừ vào khoản nợ (hạn sớm trước) + phiếu kế toán CKTT (Nợ 331 / Có 515) |

### 4.2 `purchase_policies` — bộ máy chính sách

Cột: `id`, `tenant_id`, `code`, `kind`, `name`, `scope jsonb` (NCC / nhãn / mã hàng / chi nhánh), `valid_from`, `valid_to`, `priority`, `rule jsonb`, `is_active`, `is_demo`.

**Chọn chính sách:**
- **phạm vi hẹp nhất thắng**: mã hàng > nhãn > NCC > chung;
- hai chính sách cùng độ hẹp thì xét `priority`;
- ngoài hiệu lực hoặc đã tắt thì bỏ qua.

Máy chủ kiểm nội dung theo khuôn từng loại. Kế toán nhập bằng form, không gõ JSON.

| `kind` | Nội dung (`rule`) | Tình huống |
|---|---|---|
| `trade_discount` | `{ pct }` hoặc `{ amount }` | 1, 2, 4 |
| `qty_tier` | `{ tiers: [{ from, pct }] }` | 7 |
| `payment_discount` | `{ pct }` | 4 |
| `promo_gift` | `{ buy, get, giftSku, splitIntoCost }` | 9, 14, 20 |
| `period_rebate` | `{ period: month\|quarter\|year, tiers: [{ from, pct }] }` | 8 |
| `target_rebate` | `{ period, target, tiers: [{ fromPct, pct }] }` | 15 |
| `stage_rebate` | `{ mode: stage\|cumulative, stages: [{ from, to, min, pct \| amount }] }` | 16 |
| `credit_limit` | `{ limit, warnPct, branches: { mã CN: hạn mức } }` (tổng phân bổ ≤ hạn mức) | 3, 12, 13, 17 |
| `payment_term` | `{ basis: invoice_date\|order_date\|fixed, days, workingDays }` | 1, 3, 18 |
| `supply_target` | `{ period: YYYY-MM, branches }` | 17 |
| `lot_tracking` | `{ required }` (phạm vi theo nhãn / mã) | 19 |
| `gift_budget` | `{ program, amount }` | 20 |

### 4.3 Khuôn `data` của chứng từ

```json
{
  "priceIncludesVat": true,
  "orderDiscount": { "pct": 7 },
  "term": { "basis": "invoice_date", "days": 10, "workingDays": true },
  "cktt": { "pct": 2 },
  "schedule": [ { "seq": 1, "dueDate": "2026-10-10", "amount": 180000000 } ],
  "lines": [ { "lineKey": "a1", "sku": "110154035", "name": "Anlene Gold hương vani 800g", "unit": "Lon", "qty": 60, "price": 528000,
              "taxCode": "V08", "lineType": "buy", "lotNo": "AG2608A", "expDate": "2028-02-28" } ],
  "gift": { "source": "ncc_program", "program": "ANL-T10-BINH", "hasVat": false },
  "allocation": [ { "sku": "110154035", "amount": 6000000 } ],
  "rebate": { "policyCode": "ANL-CT-THANG", "period": "2026-10", "base": 550000000, "rate": 3 },
  "override": { "by": "Kế toán trưởng", "at": "…", "reason": "NCC cam kết giãn nợ" },
  "checks": [ { "level": "warn", "code": "price_fixed", "text": "…" } ],
  "policyTrace": [ { "policy": "TH-DK10", "kind": "payment_term", "text": "Hạn 10 ngày làm việc từ ngày hoá đơn" } ]
}
```

Hai trường cần nói rõ:
- `lineType`:
  - `buy`: hàng mua;
  - `gift_seller`: KM người bán, **chia vào giá** (nhập kho giá 0, giá vốn bình quân giảm);
  - `gift_consumer`: KM người tiêu dùng, quà, **không chia giá**, vào sổ quà.
- `checks` và `policyTrace` là **ảnh chụp lúc duyệt**: đối soát sau biết vì sao ra số đó, kể cả khi chính sách đã đổi.

### 4.4 Vì sao KHÔNG phải sửa bảng lõi

| Nhu cầu | Cách làm với lõi có sẵn |
|---|---|
| Lô, hạn dùng (TH19) | Hợp đồng chứng từ đã có `lotNo`, `expDate` trên dòng. Tồn theo lô = lô từ phiếu nhập + **tồn kho thật** (biến động kho) chia theo FEFO |
| Chi phí tăng giá vốn (TH21), thưởng giảm giá vốn (TH22) | Dòng **SL 0, chỉ tiền** trên chứng từ nhập / trả theo từng mã → kho ghi biến động giá trị; giá vốn bình quân tháng tự nhận, tự chia cho hàng còn tồn và hàng đã bán (632) |
| Lịch trả nhiều đợt (TH11) | `data.schedule` của phiếu; báo cáo đến hạn rải phần đã trả (từ công nợ theo chứng từ) vào đợt sớm trước |
| Ngày nghỉ, lễ (TH18) | `tenants.settings.purchase.holidays` |
| Quà không hoá đơn (TH2, 20) | Điều chỉnh kho tăng với lý do NQUA; phân hệ tự thêm lý do vào Cấu hình hạch toán nếu chưa có |

### 4.5 Nhật ký JSONL — `DATA_DIR/mua-hang/<tenant>/<yyyy-mm>.jsonl`

Mỗi dòng một sự kiện, ví dụ:

```json
{"ts":"…","event":"override_approved","docNo":"DH2610013","user":"Kế toán trưởng","data":{"reason":"…","credit":[{"scope":"NCC Công ty Thắng Bảo","exceeded":58000000}]}}
```

| Sự kiện | Khi nào |
|---|---|
| `doc_saved`, `doc_submitted`, `doc_approved` (kèm số chứng từ kế toán), `doc_unapproved`, `doc_cancelled` | Thao tác phiếu |
| `price_check`, `limit_check`, `invoice_mismatch`, `lot_check`, `gift_check` | Gửi duyệt / duyệt còn cảnh báo |
| `policy_applied` | Duyệt: mỗi chính sách đã áp một dòng |
| `override_approved` | Duyệt ngoại lệ (ghi thêm `audit_logs`) |
| `limit_transfer` | Điều chuyển hạn mức (trước / sau) |
| `policy_changed`, `demo_seeded`, `demo_cleared` | Cấu hình, dữ liệu mẫu |

## 4b. Cơ sở dữ liệu hiện tại (cập nhật 26/10/2026 — xem trực tiếp ở màn **Cơ sở dữ liệu mua hàng (MH13)**) — bao nhiêu bảng, vì sao, mở rộng thế nào

**Bảng riêng của phân hệ** (ngoài các bảng tồn max / công thức / chuyển hàng ở tài liệu 09), mọi thứ còn lại dùng lại lõi kế toán:

| Bảng riêng | Giữ gì | Vì sao không tách thêm |
|---|---|---|
| `purchase_documents` | Mọi chứng từ phía mua (10 loại: đơn đặt, nhập, trả, đổi, nhận / xuất quà, chi phí, chiết khấu sau mua, ứng trước, trả tiền). Cột cho thứ cần lọc / tổng hợp (loại, trạng thái, ngày, NCC, nhãn, chi nhánh, hoá đơn, hạn, tổng tiền, phiếu gắn); `data jsonb` cho dòng hàng, điều khoản, lịch trả, kết quả kiểm tra | Thêm loại chứng từ mới không cần bảng mới; dòng hàng tra được bằng chỉ mục GIN |
| `purchase_policies` | Mọi "điều kiện mua" (15 loại: CK đơn, CK theo bảng nhiều mã, bậc SL, CKTT, KM, thưởng ×3, hạn mức, điều khoản, chỉ tiêu, lô, ngân sách quà, hợp đồng, tồn min–max): loại + phạm vi (NCC / nhãn / mã / chi nhánh) + hiệu lực + `rule jsonb` (khuôn kiểm bằng zod theo loại) + người tạo / sửa | Thêm loại chính sách = thêm khuôn zod + câu tóm tắt + ô nhập, **không thêm bảng** |
| `supplier_products` | Mặt hàng & giá mua: NCC × mã × ĐVT (chọn từ ĐVT của mặt hàng) → mã bên NCC, ĐVT đặt hàng mặc định, giá cố định, ngưỡng cảnh báo, hiệu lực; NCC trống = giá chung (0013) | Hàng nghìn dòng / NCC, cần tra theo mã và theo NCC → tách bảng thật; hồ sơ NCC và form mặt hàng cùng ghi một bảng |
| `purchase_attachments` | Thông tin tệp đính kèm (nội dung tệp nằm trên ổ dữ liệu ERP) | Tệp không nhét vào CSDL — CSDL nhẹ, sao lưu nhanh |
| `supplier_invoices` + `supplier_invoice_lines` | **Hoá đơn đầu vào của NCC** (0030, màn MH22): đầu hoá đơn (mẫu số, ký hiệu, số, ngày, MST, tổng tiền, nguồn gõ tay / Excel / AI / API) và từng dòng **đúng như NCC ghi** (mã / tên / ĐVT bên NCC) kèm mã + ĐVT bên mình đã nhận diện | Hoá đơn là chứng từ của NCC, khác phiếu nhập của mình: một hoá đơn có thể ứng với nhiều phiếu nhập (giao nhiều lần), dòng hoá đơn giữ nguyên cách NCC ghi để đối soát và để học. Gắn phiếu nhập qua NCC + số / ký hiệu hoá đơn — không cột liên kết cứng |
| `supplier_item_aliases` | **Nhận diện mã hàng NCC (dữ liệu học)**: NCC × mã / tên / ĐVT bên NCC → mã + ĐVT bên mình, số lần gặp, ai dạy | NCC đổi tên hàng liên tục, mỗi NCC một cách ghi → bảng riêng tra theo NCC; mỗi lần người dùng chọn mã là thêm một cách ghi, lần sau tự nhận |

**Dùng lại lõi (không làm sổ riêng):** `partners` (NCC, nhóm NCC), `unit_names` (danh mục tên ĐVT, tự thêm bằng trigger — 0014), `products` / `product_units` (mã, ĐVT + tỉ lệ, cờ *mua mặc định*; tồn kho luôn theo ĐVT tỉ lệ 1), `branches`, `document_sequences` (số phiếu), `accounting_events` + `ledger_*` (bút toán), `debt_items` / `debt_allocations` (công nợ, hạn trả từng khoản), `inventory_movements` (kho, giá vốn, lô), `tax_codes`, `tenants.settings.purchase` (ngày lễ, tài khoản…). **Nhật ký** (ai làm gì, đổi gì) ghi tệp JSONL theo tháng — không phình CSDL.

**Chỉ mục** (0010 + 0012): NCC + ngày, nhãn + chi nhánh, trạng thái + loại, hoá đơn duy nhất (chặn trùng ở mức CSDL), ngày giảm dần, chi nhánh + loại (phiếu đã duyệt), **GIN `data->'lines'`** (lịch sử giá một mã), **GIN `ref_ids`** (phiếu gắn: nhập theo đơn, chi phí / thưởng theo phiếu nhập, phiếu phụ thuộc), chính sách theo NCC và theo mã.

**Đọc chọn lọc:** phân tích / lưu / duyệt một phiếu chỉ đọc chứng từ liên quan (`listDocsFor`: cùng NCC, cùng nhãn, phiếu gắn và phiếu gắn vào nó, quà cùng chi nhánh) và bỏ qua chính sách nhân theo mã hàng (min–max); giá mua chỉ đọc dòng `supplier_products` của các mã trong phiếu; lịch sử giá tra bằng chỉ mục GIN; danh sách chứng từ lọc trong SQL.

**Chia nhỏ để trị (mã nguồn):**

| Lớp | Thư mục | Việc |
|---|---|---|
| Bộ máy dùng chung (máy chủ + giao diện) | `packages/contracts/src/mua-hang/` | `engine.ts` tính tiền / chính sách / hạn / kiểm tra; `ma-hang.ts` quy định mã hàng; `dat-hang.ts` đơn → phiếu nhập, Excel, min–max, mặt hàng NCC; `kich-ban.ts` 25 tình huống |
| Máy chủ | `apps/api/src/phan-he/mua-hang/` | `store` (bảng), `analysis` (kiểm tra theo sổ), `posting` (ghi sổ qua lõi), `service` (lưu / duyệt), `ncc` (NCC, đính kèm, đề xuất đặt), `reports`, `demo`, `log`, `routes` |
| Giao diện | `apps/web/src/phan-he/mua-hang/<màn>/` | mỗi màn một thư mục; `thanh-phan/` dùng chung (xem nhanh NCC, lịch sử, hướng dẫn Excel); `dinh-kem/` |

Phân hệ chỉ import lõi (phép thử ranh giới phân hệ chặn import chéo). Thêm phân hệ khác (bán hàng…) dùng lại bộ máy chính sách theo cùng cách.

**Khi dữ liệu lớn (việc tiếp theo, chưa cần ở quy mô hiện tại):**
- Danh sách chứng từ và các báo cáo tổng hợp trên giao diện đang tải toàn bộ chứng từ của đơn vị → chuyển sang tải theo kỳ (mặc định 3 tháng) + phân trang khi vượt khoảng 20–30 nghìn phiếu.
- Báo cáo theo dòng hàng (tổng hợp mua theo mã, nhãn) có thể dùng bảng ảo `jsonb_array_elements` hoặc bảng tổng hợp theo tháng nếu cần nhanh hơn.
- Khi một loại chính sách cần truy vấn quan hệ phức tạp thì mới tách bảng riêng cho loại đó (đã làm với giá mua → `supplier_products`).

## 5. Hạch toán (tài khoản lấy theo cấu hình của đơn vị)

Tài khoản chọn theo thứ tự:
1. cài đặt mua hàng;
2. lý do mặc định;
3. tài khoản chi tiết đầu tiên có trong hệ thống tài khoản (ví dụ 71153 / 7118 / 711; 5152 / 515; 64184 / 6418);
4. tài khoản tiền theo hình thức thanh toán TM / CK.

| Nghiệp vụ | Nợ | Có | Ghi chú |
|---|---|---|---|
| Nhập mua, CKTM trên hoá đơn | 1561 (giá sau CK) · 1331 | 331 | CK đơn % / tiền chia vào từng dòng theo giá trị |
| KM người bán chia giá (TH14) | — | — | Nhập kho SL tặng giá 0 → giá vốn đơn vị giảm |
| Quà không hoá đơn (TH2, 20) | 1561 (kho quà, giá trị hợp lý) | 711 | Phiếu Nhận quà |
| Xuất quà tặng | 641 | 1561 | Giá vốn chốt khi tính giá vốn tháng |
| Ứng trước NCC (TH5) | 331 | 112 / 111 | Phiếu nhập theo đơn → tự đối trừ khoản nợ |
| Trả tiền NCC | 331 | 112 / 111 | Trừ vào khoản nợ hạn sớm trước (ưu tiên phiếu được chọn) |
| CKTT trả đúng hạn (TH4) | 331 | 515 | Máy chủ kiểm: đúng phiếu, trong hạn, đúng %, trả đủ |
| Thưởng cuối kỳ (TH8, 15, 16, 22) | 331 | 1561 theo mã (SL 0) | Giá vốn bình quân tự chia cho tồn / đã bán; hoá đơn gốc giữ nguyên; một chính sách + một kỳ một phiếu |
| Chi phí vận chuyển (TH21) | 1561 theo mã (SL 0) · 1331 | 331 (đơn vị vận chuyển) | Theo giá trị / SL, tổng khớp tới đồng |
| Trả hàng NCC (TH23) | 331 | 1561 · 1331 | Gắn phiếu gốc, lô |
| Đổi hàng (TH23) | trả đi: ngược nhập; nhận về: như nhập | | Bù trừ công nợ / trả thêm (phiếu chi) / NCC hoàn tiền (phiếu thu) |

**Tách bạch CKTM và CKTT** (TH4):
- CKTM giảm giá trị hàng nhập, vào giá vốn.
- CKTT là doanh thu tài chính, chỉ phát sinh khi trả tiền đúng điều kiện.

**Bỏ duyệt:** huỷ đúng các chứng từ kế toán đã sinh (đảo bút toán bằng số âm, gỡ kho, gỡ đối trừ). Không xoá gì.

## 6. Phủ 25 tình huống

| TH | Nội dung | Giải quyết | Màn |
|---|---|---|---|
| 1 | CK thẳng 7%, hạn 10 ngày làm việc | `trade_discount` + `payment_term` (ngày làm việc) | MH11 |
| 2 | CK tiền trên đơn + quà ngoài HĐ | CK tiền chia dòng; phiếu Nhận quà → 711 | MH11 |
| 3 | Hạn mức 600 triệu, đặt thêm thì vượt | Nợ theo sổ + đang chờ + phiếu này; chặn + duyệt ngoại lệ | MH11, MH05 |
| 4 | CK 7% + CKTT 2% nếu đúng hạn | Phiếu trả tiền ghi CKTT, máy chủ kiểm đúng hạn | MH11 |
| 5 | Ứng trước 100% theo đơn | Phiếu ứng trước gắn đơn → nhập theo đơn tự đối trừ; đối chiếu 3 bên | MH11 |
| 6, 7, 9, 10, 11 | Phía bán | Cùng bộ tính — phép thử ở MH00 | MH00 |
| 8, 15, 16 | Thưởng doanh số / chỉ tiêu / giai đoạn | Doanh số mua thuần từ phiếu đã duyệt (hoặc số NCC chốt) → phiếu thưởng | MH06 |
| 12, 13 | Trong / vượt hạn mức | `credit_limit`; vượt → chặn duyệt | MH11 |
| 14 | KM người bán chia giá / KM NTD | Loại dòng; giá vốn đơn vị; sổ quà | MH11, MH09 |
| 17 | Hạn mức nhãn phân bổ chi nhánh, chỉ tiêu cung ứng | `credit_limit.branches` + điều chuyển có vết; `supply_target` | MH05 |
| 18 | Cách tính hạn, cảnh báo, tuổi nợ | `payment_term` + ngày lễ; công nợ theo chứng từ; 6 nhóm tuổi nợ | MH05 |
| 19 | Lô / hạn dùng, FEFO | Lô trên dòng nhập; tồn thật chia FEFO; cảnh báo 30-15-7 | MH08 |
| 20 | Quà NCC / tự mua (có / không VAT) | Nguồn quà trên chứng từ; nhập - xuất - tồn quà; đối chiếu số được hưởng | MH09 |
| 21 | Phân bổ chi phí | Phiếu chi phí → dòng SL 0 theo mã | MH07 |
| 22 | Phân bổ thưởng giảm giá vốn | Phiếu thưởng → dòng SL 0 theo mã | MH06, MH07 |
| 23 | Đổi / trả hàng | `return` / `exchange` gắn phiếu gốc | MH11 |
| 24 | NXT & công nợ theo ngành → nhóm → mã | Phiếu duyệt vào kho → báo cáo có sẵn (ACC83) | ACC83 |
| 25 | Giá thực tế từng dòng | Giá sau CK − quà chia giá + chi phí phân bổ; tổng khớp chứng từ | MH07 |

**Kiểm chứng tự động:** `apps/api/test/mua-hang-25-tinh-huong.test.ts` nạp dữ liệu mẫu vào một đơn vị mới rồi làm **từng tình huống như kế toán thao tác**, kiểm con số và yêu cầu tối thiểu (21 phép thử). Ngoài ra:
- `npm test` chạy `apps/api/test/mua-hang.test.ts` trên PostgreSQL thật:
  - 25 phép thử công thức (24 có số, khớp 24/24);
  - toàn luồng: lưu → cảnh báo → chặn hạn mức → duyệt ngoại lệ → ứng trước → CKTT → trả hàng → quà → chi phí → thưởng → bỏ duyệt;
  - nạp đủ dữ liệu mẫu vào sổ không lỗi.

## 7. Kịch bản demo (≈ 15 phút, bản thử UAT)

1. **MH00.** Bấm **Nạp dữ liệu mẫu** (bản thử còn trống): phần mềm thêm chi nhánh, NCC, mặt hàng, số dư đầu kỳ, chính sách và **duyệt thật** các phiếu. Chỉ cột "Khớp" 24/24.
2. **MH01 → Trung Hậu → TH1 đi trọn quy trình.**
   - Thẻ *Mặt hàng & giá mua*: Anlene Gold 528.000 / Anlene vani 431.000 gồm VAT (giá chưa thuế tự quy đổi).
   - Thẻ *Chứng từ*: đơn **DH2610001** (giá lấy từ giá đã khai, CK 7% trên đơn) → phiếu nhập **NM2610001** (cột *Theo chứng từ* = DH2610001; phân tích ghi "Nhận đủ đơn").
   - Mọi phiếu nhập mẫu đều lập từ đơn đặt; đơn TH4 (DH2610004) **chờ duyệt ngoại lệ** vì sau TH3 nợ đã 567,45 triệu — phiếu nhập NM2610004 bị chặn tới khi duyệt đơn.
   - CK 7% chia vào dòng, hạn 15/10.
   - Tab Hạch toán: "Đã ghi sổ: Nhập mua NM2610001". Mở **Chứng từ kế toán (ACC14)** thấy đúng bút toán.
3. **NM2610010 — phiếu cảnh báo.** 7 cảnh báo cùng lúc:
   - trùng hoá đơn 3181 (chặn);
   - giá 545.000 lệch +3,2% so với giá cố định và so với lần nhập gần nhất;
   - lệch đơn đặt;
   - lệch tổng hoá đơn;
   - cận date;
   - thiếu lô (chặn).

   Sửa giá về 528.000 → cảnh báo giá mất ngay.
4. **DH2610013 (TH13).**
   - Nợ Thắng Bảo **lấy từ sổ** 550 triệu + 108 triệu → vượt 58 triệu, nút Duyệt khoá.
   - **Duyệt ngoại lệ** + lý do → MH10 thấy dòng duyệt ngoại lệ.
5. **NM2610004 (TH4).**
   - Duyệt.
   - Lập **Trả tiền NCC**: chọn phiếu → "Tính 2%" → duyệt → phiếu chi + phiếu kế toán CKTT (Nợ 331 / Có 515).
   - Thử ngày trả sau hạn → bị chặn.
6. **NM2610005 (TH5).** Ứng trước 24.460.000 tự đối trừ; đối chiếu 3 bên khớp.
7. **NM2610014 (TH14).** Nhập hàng là quà tự thêm theo chương trình, giá vốn đơn vị giảm; duyệt → lô A, B lên MH08, quà NTD lên MH09.
8. **MH06.**
   - Thưởng chỉ tiêu Anlene: doanh số từ phiếu đã duyệt.
   - Nhập "doanh số NCC chốt" 550.000.000 → 3% = 16.500.000 → Tạo phiếu thưởng.
   - Tạo lần hai bị chặn.
9. **MH07.** Cước 10 triệu chia theo giá trị; tab Giá vốn: Anlene Gold 480.000 → 489.600/lon.
10. **MH05.** Hạn mức NCC / nhãn theo sổ; điều chuyển hạn mức; tab Đến hạn: tuổi nợ 6 nhóm, đợt 2 NM2610021 quá hạn.
11. **Bỏ duyệt một phiếu** → chứng từ kế toán bị huỷ (số âm), phiếu về nháp. Xong demo: **Xoá dữ liệu mẫu** ở MH00.

## 8. Câu hỏi thường gặp khi bảo vệ thiết kế

- **Nhãn hàng khai ở đâu?** Một chỗ: **danh mục mặt hàng** (cây Ngành → Nhãn → Nhóm, theo quy tắc mã hàng — ví dụ mã 9 ký tự = 2 ký tự ngành + 3 ký tự nhãn + 1 ký tự nhóm + 3 ký tự tự sinh).
  - Dòng phiếu mang nhãn của mặt hàng (máy chủ ghi lại khi lưu); phiếu có "nhãn chính" tự suy để lọc / hiển thị — không chọn tay, NCC không khai nhãn riêng.
  - Chính sách vẫn có phạm vi nhãn (hạn mức toàn nhãn Anlene 2 tỷ, chỉ tiêu theo nhãn, thưởng theo nhãn); áp cho **các dòng** có nhãn đó, ô chọn nhãn gợi ý trước các nhãn NCC đang bán.
- **Khuyến mại có phải bấm tay không?** Không. Bảng hàng đổi là phần mềm tự áp chiết khấu và tự thêm / chỉnh / bỏ quà mua X tặng Y; bảng khuyến mại báo đã áp · cần xem (thiếu / thừa quà) · mua thêm để được — cùng một phép tính với kiểm tra phía máy chủ.
- **Có phải làm lại sổ, báo cáo cho mua hàng không?** Không. Duyệt là đưa chứng từ vào lõi kế toán có sẵn; sổ cái, công nợ, kho, bảng kê mua vào tự có số liệu.
- **JSON có làm chậm không?**
  - Cột lọc chính đều là cột thật có chỉ mục.
  - Số liệu báo cáo kế toán đọc từ sổ, không đọc JSON.
  - JSON chỉ đọc khi mở một phiếu hoặc tính thưởng / lô theo kỳ.
- **Toàn vẹn dữ liệu?**
  - Máy chủ kiểm khuôn (zod) và tự tính lại tổng tiền.
  - Trùng hoá đơn chặn bằng unique index.
  - Duyệt chạy trong một giao dịch: lỗi bất kỳ bước nào thì không ghi gì.
- **Thêm loại chính sách mới (thưởng trưng bày…)?** Thêm 1 loại + khuôn kiểm + 1 nhánh tính + 1 form nhập + 1 phép thử. Không migration.
- **Chính sách đổi sau khi đã nhập?** Phiếu đã duyệt giữ `policyTrace` + `checks`. Chiết khấu bổ sung đi bằng phiếu thưởng / chi phí, không sửa phiếu gốc.
- **Bán hàng dùng chung được không?** Được. Bộ tính nhận chứng từ chung; các tình huống phía bán đã có phép thử.
- **Lô có chính xác khi POS bán không ghi lô?** Tồn lô lấy **tồn kho thật**, phần đã xuất trừ vào lô hạn gần trước (FEFO), đúng nguyên tắc xuất kho của hàng có hạn dùng.

## 9. Việc tiếp theo

| Việc | Ghi chú |
|---|---|
| Phân quyền riêng cho duyệt ngoại lệ, điều chuyển hạn mức | Hiện dùng quyền duyệt chi (`payments:approve`) và quyền danh mục (`catalog:write`) |
| Lịch sử xuất theo từng lô | Hệ thống bán hàng chưa gửi số lô khi bán; tồn lô hiện chia FEFO theo tồn thật |
| Tình huống phía bán (6, 7, 9, 10) | Bộ tính đã đúng số; màn lập phiếu bán thuộc phân hệ Bán hàng |


## 10. Hoá đơn đầu vào của NCC → nhận diện mã → đối soát (MH22, 28/10/2026)

Luồng dữ liệu đầy đủ của phân hệ: **tồn max → phân tích đặt hàng → đơn đặt → phiếu nhập (đối chiếu tiến độ đơn, MH21) → hoá đơn NCC (đối soát từng dòng, MH22) → công nợ → trả tiền**.

1. **Đưa hoá đơn vào** (`supplier_invoices`, `supplier_invoice_lines`):
   - Excel NCC gửi: gom theo ký hiệu + số.
   - Ảnh / PDF qua dịch vụ đọc hoá đơn AI (`INVOICE_AI_URL`, khuôn `ParsedInvoice`).
   - Gõ tay, hoặc API (`/purchase/invoices/prepare` + `/import`).

   Hoá đơn được chuẩn hoá trước khi ghi:
   - giá gồm thuế quy về chưa thuế;
   - dòng giá 0 là hàng tặng;
   - thiếu tổng thì tự cộng;
   - trùng NCC × ký hiệu × số (bỏ số 0 đầu) thì bỏ qua.
2. **Nhận diện mã**, theo thứ tự tin cậy:
   1. `supplier_item_aliases` (đã học, theo mã NCC rồi theo tên);
   2. `supplier_products.ncc_sku` / `ncc_name` (khai mặt hàng NCC);
   3. NCC ghi đúng mã mình;
   4. chỉ **gợi ý** (giống tên, cùng quy cách 400g / 800g, mặt hàng NCC có bán được cộng điểm).

   Người dùng chọn mã → lưu → **học** (thêm / cộng số lần gặp).
3. **Đối soát**: phiếu nhập có số hoá đơn trùng hoá đơn đã lưu (cùng NCC). Phần mềm cộng mọi phiếu cùng hoá đơn rồi so từng mã:
   - SL quy ĐVT nhỏ nhất;
   - đơn giá chưa thuế sau chiết khấu;
   - thuế suất;
   - tổng thanh toán.

   Kết quả:
   - Lệch: kiểm tra `inv_diff` (cảnh báo, không chặn duyệt).
   - Khớp: `inv_match`.
   - NCC đã dùng MH22 mà số hoá đơn chưa lưu: `inv_not_stored`.

   Ở MH22 mỗi hoá đơn có một tình trạng: chưa nhận diện mã · chưa có phiếu nhập · lệch · khớp · đã huỷ.
4. **Lập phiếu nhập từ hoá đơn**: phiếu nhập mới điền sẵn dòng, giá chưa thuế, chiết khấu, thuế suất, số / ngày hoá đơn.

Lõi tính dùng chung: `packages/contracts/src/mua-hang/hoa-don.ts`. Máy chủ: `apps/api/src/phan-he/mua-hang/hoa-don.ts` (+ `hoa-don-routes.ts`). Giao diện: `apps/web/src/phan-he/mua-hang/hoa-don/`. Phép thử: `apps/api/test/hoa-don-ncc.test.ts`. Hướng dẫn người dùng + khuôn trao đổi với dịch vụ AI: `docs/huong-dan/mua-hang-hoa-don-ncc.md`.
