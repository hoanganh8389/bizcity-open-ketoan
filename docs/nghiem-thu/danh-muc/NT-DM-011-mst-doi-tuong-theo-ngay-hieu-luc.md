# NT-DM-011 · Khách hàng / NCC (DM12, DM13): đổi MST, tên, địa chỉ theo ngày hiệu lực; rà chứng từ lệch MST
<!-- [2026-11-19 11:09 AM khanhtd] NGHIEM-THU — phiếu chốt thiết kế (R-FLOW-2) cho ngày hiệu lực khi đổi MST đối tượng; mở rộng 0087 (PHASE-029 · 36, đề xuất D029-19-5 chờ chủ dự án duyệt) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM12 Khách hàng, DM13 Nhà cung cấp — hộp Sửa; HT08 Bàn làm việc kế toán (thẻ Việc hôm nay) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 19/11/2026 |
| Trạng thái | **Đã làm, chờ nghiệm thu** <!-- [2026-11-19 12:35 PM khanhtd] NT-DM-011 — đã làm theo phiếu --> — người dùng (khanhtd) đồng ý triển khai 19/11/2026; D029-19-5 vẫn chờ chủ dự án duyệt |

## 1. Vấn đề

Nhà cung cấp / khách hàng đổi mã số thuế (kèm tên pháp lý, địa chỉ) nhưng thường **báo cho mình sau khoảng một tháng**. Kế toán phải ghi được: *MST mới có hiệu lực từ ngày X* (X đã qua), để:

- hoá đơn, chứng từ từ ngày X trở đi được hiểu theo MST mới; trước ngày X theo MST cũ;
- thấy ngay những chứng từ **đã lập từ ngày X mà vẫn mang MST cũ** để rà với nhà cung cấp — **không tự sửa** chứng từ (hoá đơn đã nhận giữ đúng MST in trên hoá đơn; sổ chỉ thêm).

### Hiện trạng (đã kiểm trên `main`, 19/11/2026)

| Phần | Có gì | Thiếu gì |
|---|---|---|
| Lịch sử tên / MST / địa chỉ | `entity_attributes` (0087, [PHASE-029 · 36](../../phases/PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/36-THUOC-TINH-CO-HIEU-LUC.md)): mỗi lần đổi đóng bản cũ, thêm bản mới; chỉ thêm, không sửa | Bản mới **luôn có hiệu lực từ hôm nay** — không ghi được "từ ngày đã qua" |
| Sổ cái | Dòng sổ chụp tên + `partner_attr_id` **theo ngày chứng từ** lúc ghi | — (giữ nguyên) |
| Sổ hoá đơn (`tax_invoices`) | Lưu `partner_id` + MST đối tác in trên hoá đơn (`buyer_tax_code`, cả hai chiều) | Không có chỗ nào báo hoá đơn lệch MST so với MST hiệu lực tại ngày hoá đơn |
| Màn hình | Hồ sơ có *Lịch sử thay đổi* (nhật ký) | Không hiện các **phiên bản** MST / tên / địa chỉ và ngày hiệu lực; tìm kiếm, kiểm trùng chỉ biết MST hiện hành |
| Nhập hoá đơn XML (`hoa-don-xml.ts`) | Tìm NCC theo MST **hiện hành** | Hoá đơn mang MST cũ về sau khi đổi → không thấy NCC → **tự tạo NCC mới** (công nợ tách đôi) |

## 2. Lựa chọn

| Phương án | Chọn? | Lý do |
|---|---|---|
| A. Bảng phiên bản MST riêng cho đối tượng (như `tax_id_versions` 0121) | Không | Trùng `entity_attributes` (REUSE-MAP); hai nguồn sự thật cho MST đối tượng |
| **B. Mở rộng `entity_attributes` (0087): cho chọn ngày hiệu lực khi đổi** | **Có** | Một nguồn sự thật; dùng lại cơ chế chỉ thêm, trigger đồng bộ, `bizcity_entity_attr_at`, báo cáo theo ngày đã làm ở S029-19 đợt 2 |
| C. Sửa thẳng chứng từ cũ sang MST mới | Không | Trái R-LEDGER (sổ chỉ thêm) và NĐ 123/2020 (hoá đơn giữ đúng MST in trên hoá đơn) |

## 3. Hình dạng

### 3.1 CSDL — migration `0168` (số lấy bằng `scripts/so-tiep-theo.mjs`)

Thay `bizcity_entity_attrs_sync()` (0087), **chỉ đổi cách tính ngày bắt đầu** của bản mới:

```sql
-- trước (0087): v_from := GREATEST(CURRENT_DATE, bản_đang_mở.valid_from + 1)
-- sau  (0168): ngày người dùng chọn qua biến phiên, mặc định như cũ
v_req  := nullif(current_setting('ketoan.valid_from', true), '')::date;   -- cùng biến phiên với 0121
v_from := COALESCE(v_req, GREATEST(CURRENT_DATE, bản_đang_mở.valid_from + 1));
-- v_req > CURRENT_DATE                       → lỗi "Ngày hiệu lực không được sau hôm nay"
-- v_req <= bản_đang_mở.valid_from           → lỗi "Phải sau ngày hiệu lực của phiên bản đang dùng (dd/mm/yyyy)"
```

- Không thêm bảng, không thêm cột. Bất biến của 0087 giữ nguyên: chỉ thêm, phiên bản tăng theo ngày, bản đã đóng không mở lại.
- Đường ghi không đặt biến phiên (đồng bộ, nhập Excel, đường cũ) → **y như hôm nay**.
- Dòng sổ đã ghi **không đổi** (vẫn trỏ `partner_attr_id` đã dùng lúc ghi). Đó chính là các chỗ "lệch" mà §3.4 liệt kê.
- Nhập sai ngày: không sửa được phiên bản cũ (0087 chỉ thêm); chỉ thêm được phiên bản sau. Màn hình nói rõ trước khi ghi.

### 3.2 API

| Đổi | Hình dạng |
|---|---|
| `PUT /api/v1/partners/:code` (`core.partner.save`) | thêm `validFrom?: 'YYYY-MM-DD'` (≤ hôm nay). Có thì `set_config('ketoan.valid_from', validFrom, true)` trong cùng giao dịch trước khi ghi — như `branch.service.ts`. Chỉ có tác dụng khi tên / MST / địa chỉ đổi |
| `GET /api/v1/partners/:code/attributes` (mới, chỉ đọc, `catalog:read`) | `{ versions: [{ version, validFrom, validTo, name, taxCode, address, createdBy, createdAt, note, mismatched }], mismatches: [{ invoiceDate, docNo, invoiceSerial, invoiceNo, direction, taxCodeOnInvoice, taxCodeAtDate }] }` — `mismatched` = số hoá đơn trong khoảng hiệu lực của bản đó mang MST khác |
| Kiểm trùng MST (`assertTaxCodeFree`, `GET /partners/lookup?taxCode=`) và tìm kiếm danh sách | xét cả MST ở **mọi phiên bản** của đối tượng khác (MST cũ của NCC A không được gán cho NCC B mới) |
| Cảnh báo khi ghi (khung "Vì sao") | mã mới **`PART-HINT-005`** (warn): *"Có {count} hoá đơn của {code} từ {from} vẫn mang MST cũ {old}."* — chỉ khi `validFrom` < hôm nay và có hoá đơn lệch; lưu được, ghi lý do như các cảnh báo khác |

### 3.3 Màn hình (DM12 / DM13, hộp Sửa)

- Đổi MST, tên hoặc địa chỉ của đối tượng **đã có** → hiện ô **Hiệu lực từ ngày** (mặc định hôm nay, không chọn ngày sau hôm nay, không trước phiên bản đang dùng) kèm câu: *"Chứng từ đã lập không bị sửa; hoá đơn từ ngày này còn mang MST cũ sẽ được liệt kê để rà."*
- Mục mới **Lịch sử MST, tên, địa chỉ** trong hồ sơ (cạnh *Đơn vị con*, *Lịch sử thay đổi*): mỗi phiên bản một dòng — từ ngày, đến ngày, MST, tên, địa chỉ, người đổi, **số hoá đơn lệch** (bấm để xem danh sách).
- Thêm mới: không có ô ngày (bản đầu như 0087).
- **Một lần Ghi = một phiên bản = một ngày hiệu lực** cho cả MST, tên, địa chỉ <!-- [2026-11-19 11:25 AM khanhtd] NT-DM-011 — người dùng chốt: đổi cùng lúc thì chung ngày; khác ngày thì tự ghi nhiều lần --> (người dùng chốt 19/11/2026):
  - đổi cùng lúc (vd MST + tên + địa chỉ cùng từ 01/10) → sửa cả ba ô, Ghi một lần;
  - đổi ở các ngày khác nhau → Ghi nhiều lần, mỗi lần một ngày; phiên bản sau mang lại các giá trị không đổi của phiên bản trước.
  - **Ghi theo thứ tự ngày** (0087 chỉ thêm, phiên bản sau phải sau phiên bản đang dùng): vd MST đổi 01/10, địa chỉ đổi 15/10 → ghi MST (01/10) trước rồi mới ghi địa chỉ (15/10). Ghi địa chỉ 15/10 trước thì sau đó không thêm được MST từ 01/10 — màn hình báo lỗi kèm ngày của phiên bản đang dùng.

### 3.4 Rà soát — phép kiểm HT08

| Mã kiểm | Tầng | Kiểm | Mức | closeRef |
|---|---|---|---|---|
| `PARTNER_TAX_MISMATCH` | L3 | Hoá đơn (`tax_invoices`, còn hiệu lực) của đối tượng **đã từng đổi MST** mang MST khác MST hiệu lực tại ngày hoá đơn (so sau khi bỏ ký tự không phải số); mẫu `<mã đối tượng>:<số hoá đơn>:<dd/mm/yyyy>` | warn | `PC-011` Thuế và hoá đơn |

- Chỉ xét đối tượng có ≥ 2 phiên bản khác MST: không báo dữ liệu cũ chưa từng đổi MST (tránh nhiễu).
- Có bản ở lane chẩn đoán `tests/conformance/diagnostics/masterdata.diag.mjs` (`DG-MD-3`, R-DIAG-9), dòng ở [DIAGNOSTICS.md §2](../../ops/DIAGNOSTICS.md).
- Cách khắc phục (`remedy`): xem hoá đơn với nhà cung cấp → (a) hoá đơn lập trước khi đổi MST: ghi lý do khi khoá kỳ; (b) NCC xuất sai MST: yêu cầu hoá đơn điều chỉnh / thay thế (NĐ 123/2020).
- Đăng ký phép kiểm trong module đối tượng (`registerDiagnostics` theo mã, gọi lại không trùng) — **không** sửa `apps/api/src/app.ts` (đang thuộc dòng giữ chỗ NT-HT-003).

## 4. Ngoài phạm vi (làm sau, cần người khác)

| Việc | Vì sao chưa làm | Người |
|---|---|---|
| Nhập hoá đơn XML khớp NCC theo **MST tại ngày hoá đơn** (không tự tạo NCC mới khi gặp MST cũ) | `apps/api/src/phan-he/mua-hang/hoa-don-xml.ts` thuộc dòng giữ chỗ MH22 | Nguyễn Văn Thủy — ghi việc sau khi phiếu này duyệt |
| Kernel chụp MST đối tác vào sổ hoá đơn theo ngày chứng từ khi phiếu không gửi MST (`tax-invoice.repository.ts`: `inv.buyerTaxCode \|\| doc.partner?.taxCode`) | Sửa Kernel (K-level) | Nhóm Lõi, chủ dự án duyệt |
| Đánh dấu "đã rà, chấp nhận" từng hoá đơn lệch | HT08 hiện chưa có chấp nhận từng mẫu; khi khoá kỳ đã có ghi lý do | đề xuất bậc 4 nếu cần |

## 5. Kết quả mong đợi

| Mục | Mong đợi |
|---|---|
| Sửa NCC, đổi MST, chọn hiệu lực 01/10 (hôm nay 19/11) | Ghi được; *Lịch sử MST* có bản mới từ 01/10; bản cũ đóng ngày 01/10 |
| Có 3 hoá đơn ngày 05/10–15/11 mang MST cũ | Khi ghi: cảnh báo `PART-HINT-005` (3 hoá đơn); HT08 → Việc hôm nay: `PARTNER_TAX_MISMATCH` 3 chỗ |
| Chọn hiệu lực sau hôm nay / trước phiên bản đang dùng | Báo lỗi rõ, không ghi |
| Đổi chỉ số điện thoại | Không hiện ô ngày; không thêm phiên bản |
| Tạo NCC mới với MST cũ của NCC khác | Chặn `PART-BLOCK-002` như trùng MST hiện hành |
| Đồng bộ / nhập Excel đổi MST | Như cũ: hiệu lực từ hôm nay |
| Hoá đơn, dòng sổ đã ghi | Không đổi một byte |

Test: `apps/api/test/mst-doi-tuong-theo-ngay.test.ts` (đỏ trước khi sửa); `entity-attributes.test.ts` (T029-EA-*) vẫn đạt.

## 6. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 19/11/2026 |
| Bản code (commit) | nhánh `feat/nt-dm-011-mst-theo-ngay` |
| Test | `mst-doi-tuong-theo-ngay.test.ts` 7/7 (bỏ 0168 thì 4 đỏ: phiên bản mới vẫn từ hôm nay); 12 tệp test đối tượng / tên theo ngày 75/75; lane `DG-MD-3` chạy trên CSDL test |

## 7. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 8. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 19/11/2026 | Tạo phiếu, chốt thiết kế theo hướng người dùng đồng ý; phần đổi 0087 chờ chủ dự án duyệt (D029-19-5) |
| 19/11/2026 | Làm theo phiếu: migration 0168, `validFrom` ở `PUT /partners/:code` + `/validate`, `GET /partners/:code/attributes`, kiểm trùng MST cũ, `PART-HINT-005`, `PARTNER_TAX_MISMATCH` + `DG-MD-3`, ô Hiệu lực từ ngày + mục Lịch sử MST, hướng dẫn |
