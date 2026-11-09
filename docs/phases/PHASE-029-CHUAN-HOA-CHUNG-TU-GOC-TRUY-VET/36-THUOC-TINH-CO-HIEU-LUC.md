# PHASE-029 · 36 — Thuộc tính có hiệu lực của đối tượng / chi nhánh / kho và tên lúc ghi trên sổ cái (S029-19, E3)
<!-- [2026-11-08 04:51 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — chữ chốt S029-19: bản thuộc tính có hiệu lực + ảnh chụp tên đối tượng lúc ghi; hai đợt -->

> **Chủ dự án chốt 2026-11-08** (Johnny Chu – Chu Hoàng Anh): D029-19-1..3 theo đề xuất (§4) và thêm quy tắc §0: *"Tên lúc ghi theo ngày chứng từ, để chứng từ nhập muộn vẫn mang tên đúng tại ngày phát sinh. Đây là rule về source of truth và thể hiện rõ version."* <!-- [2026-11-08 06:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — chủ dự án chốt D029-19-1..3 và quy tắc nguồn sự thật / phiên bản -->

## 0. Quy tắc: nguồn sự thật và phiên bản hiện rõ

1. **Nguồn sự thật của tên (MST, địa chỉ) tại một ngày là `entity_attributes`**, không phải cột trên bảng thực thể. Cột `partners.name` chỉ là ảnh chụp hiện hành để mọi nơi đang đọc vẫn chạy.
2. **Tên lúc ghi tính theo NGÀY CHỨNG TỪ**, không theo lúc ghi sổ: chứng từ nhập muộn vẫn mang đúng tên tại ngày phát sinh.
3. **Phiên bản hiện rõ, truy ngược được.** Mỗi bản thuộc tính có `version` (1, 2, 3… theo từng thực thể) cùng `valid_from`. Mỗi tên lúc ghi trên sổ cái đi kèm **định danh của đúng bản thuộc tính đã dùng** (`partner_attr_id`), nên đọc một dòng sổ là biết tên đó lấy từ phiên bản nào, hiệu lực từ ngày nào, ai ghi. Không có phiên bản hiện hành mơ hồ: tra theo ngày luôn ra đúng một bản.
4. Không tìm được bản thuộc tính hiệu lực tại ngày chứng từ (chứng từ cũ hơn bản đầu) thì dùng bản đầu tiên của thực thể; thực thể không có bản nào thì để trống cả tên lẫn `partner_attr_id` (không bịa).

**Vì sao.** Đổi tên đối tượng hôm nay ghi đè cột `partners.name`: mọi báo cáo từ đó hiện **tên mới** cho cả chứng từ cũ, và dòng sổ cái không nhớ tên đối tượng lúc ghi (chỉ có `partner_id`). Đây là K-4 của [đánh giá nền móng](20-DANH-GIA-NEN-MONG.md) (ECP-03, ví dụ P001). Mặt hàng đã giải xong (0072 `ledger_lines.product_name`); đối tượng, chi nhánh, kho còn thiếu. Nền đã có: `entity_codes` (S026-4, 0085) lo **mã**; việc này lo **tên, MST, địa chỉ**.

Theo smallwin: **hai đợt nhỏ**, mỗi đợt một PR. Đợt 1 là phần sổ cái cần ngay và không đổi cách báo cáo nào; đợt 2 mới đổi báo cáo.

## 1. Đợt 1 — bảng thuộc tính + tên lúc ghi (không đổi báo cáo)

**`entity_attributes`** (migration 0086), cùng khuôn `entity_codes`:

| Cột | Ý nghĩa |
|---|---|
| `tenant_id`, `entity_type` (`partner` · `branch` · `warehouse`), `entity_id` | thực thể, giống `entity_codes` |
| `name` · `tax_code` · `address` | thuộc tính có hiệu lực (kho: chỉ `name`, `address`; `tax_code` NULL) |
| `version` | số phiên bản 1, 2, 3… theo từng thực thể (trigger gán, liên tục, không nhảy) |
| `valid_from` · `valid_to` | hiệu lực `[từ, đến)`, `valid_to` NULL = hiện hành |
| `created_by` · `created_at` · `note` | người, lúc, ghi chú (vd "đổi tên từ …") |

- **Chỉ thêm**; UPDATE duy nhất là đóng `valid_to` (và ghi chú); không xoá, không TRUNCATE; chặn chồng hiệu lực một thực thể; thực thể phải có thật cùng đơn vị. RLS như `item_codes`.
- **Đồng bộ ở mọi đường ghi** (trigger trên `partners` / `branches` / `warehouses`): thêm → bản đầu từ `1970-01-01`; đổi `name` / `tax_code` / `address` → đóng bản cũ, thêm bản mới từ **hôm nay** (hoặc sau bản cũ ít nhất 1 ngày); xoá thực thể → đóng. Cột trên bảng thực thể vẫn là **ảnh chụp hiện hành** (giữ nguyên cho mọi nơi đang đọc).
- Điền ban đầu từ dòng đang có (`system:backfill`), chạy lại an toàn.
- **Tra theo ngày:** `resolveEntity(type, ref, asOf)` trả thêm `attributes` hiệu lực tại `asOf`, **kèm `version`, `validFrom`, `validTo` và định danh bản** (bản gần nhất nếu thực thể đã đóng trước ngày đó).

**Tên đối tượng lúc ghi** (cùng khuôn 0072): thêm **hai cột trên cả dòng sổ và đầu bút toán** — `ledger_lines.partner_name` + `ledger_lines.partner_attr_id` và `ledger_entries.partner_name` + `ledger_entries.partner_attr_id` — **trigger BEFORE INSERT** điền theo `partner_id`: tên và định danh bản thuộc tính hiệu lực tại **ngày chứng từ** của bút toán (`entity_attributes`, quy tắc §0). `partner_attr_id` là khoá ngoại tới `entity_attributes(id)` (bảng chỉ thêm nên bản được trỏ không bao giờ mất). Không đổi về sau; bút toán đảo mang tên của bút toán gốc. Dòng đã ghi giữ nguyên, cột để trống (báo cáo đợt 2 đọc `COALESCE(partner_name, tên hiện tại)`). Tên **không** vào dấu vân tay bút toán: đổi tên rồi định khoản lại vẫn giữ bút toán cũ.

**Mức K3** ([RULE-KERNEL](../../rules/RULE-KERNEL.md), một người duyệt): thêm cột và trigger trên `ledger_*` (lớp bảo vệ). Giảm rủi ro: cột nullable chỉ **thêm**, trigger chỉ điền khi rỗng lúc INSERT, không đụng dòng đã ghi, `ledger_*_no_update` giữ nguyên. Đường lui: `DROP TRIGGER` hai trigger, `DROP COLUMN` hai cột, `DROP TABLE entity_attributes` (không ai khác phụ thuộc trong đợt 1).

**Golden T029-ECP-P001 (phần sổ cái):** đổi tên đối tượng giữa kỳ → bút toán ghi trước ngày đổi mang tên cũ, sau ngày đổi mang tên mới; bút toán đảo mang tên bút toán gốc; `resolveEntity` ở ngày cũ ra tên cũ; **chứng từ nhập muộn** (ghi sổ sau ngày đổi tên nhưng ngày chứng từ trước ngày đổi tên) vẫn mang **tên cũ**; mỗi dòng sổ có `partner_attr_id` trỏ đúng bản (đọc ra `version` và `valid_from` khớp ngày chứng từ).

**Đã làm (đợt 1, 2026-11-08):** migration `0087_thuoc_tinh_thuc_the.sql` (số 0086 đã bị PHASE-004 dùng), `entity_attributes` có `version`, trigger đồng bộ ở `partners` / `branches` / `warehouses`, `bizcity_entity_attr_at`; `ledger_entries` / `ledger_lines` thêm `partner_name` + `partner_attr_id` (trigger BEFORE INSERT theo ngày chứng từ; bút toán đảo và dòng cùng đối tượng lấy của đầu / bút toán gốc); `resolveEntity` trả `attributes` (`attributeId`, `version`, `validFrom`, `validTo`). Test `entity-attributes.test.ts` T029-ECP-P001 và T029-EA-1..8 (9 ca). Giới hạn đã biết: đổi thuộc tính qua cột có hiệu lực từ **hôm nay** (sửa lần hai trong cùng ngày có hiệu lực từ ngày kế tiếp); ngày hiệu lực chọn tay (lùi / tới) làm ở đợt sau cùng màn hình sửa; sửa đầu bút toán E2 (RV-14 của review R1) không làm mới tên lúc ghi <!-- [2026-11-08 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — đợt 1 entity_attributes -->.

## 2. Đợt 2 — báo cáo đọc tên theo ngày (chia nhỏ, mỗi PR một nhóm)

**Tên nào hiện ở đâu** (chốt 2026-11-08, theo cùng quy tắc nguồn sự thật §0):

| Chỗ hiện tên đối tượng | Tên hiện | Vì sao |
|---|---|---|
| **Tiêu đề / dòng tổng hợp theo đối tượng** của báo cáo "đến ngày D" (công nợ, số dư, đối chiếu) | tên hiệu lực tại **ngày D = ngày kết thúc kỳ báo cáo** (`bizcity_entity_attr_at`) | báo cáo nói về tình hình tại D thì gọi đối tượng bằng tên đúng tại D, không phải tên của hôm nay |
| **Từng chứng từ / dòng sổ** (sổ nhật ký, sổ chi tiết, in chứng từ) | `partner_name` **lúc ghi** (`COALESCE(partner_name, tên hiện tại)`) | chứng từ phải giữ tên đúng tại ngày phát sinh; dòng cũ chưa có cột thì dùng tên hiện tại |

**Thứ tự PR và tiến độ thật** <!-- [2026-11-09 02:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — cập nhật §2 theo tiến độ thật, chốt 2e -->

Mỗi PR một nhóm báo cáo, có test đổi tên giữa kỳ (T029-ECP-P001 và các ca sau). Quy tắc chung của mọi đợt: tên hiện **lúc ghi** là `COALESCE(CASE WHEN dòng có đối tượng THEN tên lúc ghi của dòng ELSE tên lúc ghi của đầu bút toán END, tên hiện tại)`; nhánh `tên hiện tại` chỉ dành cho dòng sổ ghi trước 0087 (cột còn NULL).

| Đợt | Nhóm | PR | Trạng thái |
|---|---|---|---|
| 1 | bảng thuộc tính + cột tên lúc ghi (0087) | #204 | ✅ |
| 2a | công nợ (`debt-reports.ts`): chỉ tiêu đề đối tượng → tên tại ngày cuối kỳ | #218 | ✅ |
| 2b | khung nhìn `bizcity_read.ledger_lines` / `ledger_entries` thêm cột (0090, giống 0072) + sổ nhật ký thu / chi tiền, bán hàng, mua hàng (`journals.ts`) | #227 | ✅ |
| 2c | sổ chi tiết tài khoản và nhật ký chung (`report.repository.ts`) | #233 | ✅ |
| 2d | nhật ký chi tiền theo khoản mục (`dimension-reports.ts`) | #236 | ✅ |
| 2e | báo cáo **không đọc tên từ sổ**: `control-reports.ts`, `balance-sheet.ts` | chưa mở | ☐ — quy tắc chốt ở D029-19-4 |

**Giới hạn đã biết:** nhánh `tên hiện tại` của `COALESCE` (dòng sổ ghi trước 0087) không dựng được thành test vì sổ chỉ thêm; chỉ kiểm bằng đọc mã. **Chưa rà (chưa kết luận):** các chỗ khác đọc tên đối tượng từ `partners` — báo cáo bán hàng (`modules/sales/sales-report.*`), kho (`modules/inventory/inventory-report.service.ts`), thuế (`report.service.ts` bảng kê, `phan-he/thue/statements/*`), mua hàng (`phan-he/mua-hang/reports.ts`, `analysis.ts`), xác nhận công nợ (`debt-confirmation.ts`), đề nghị chi (`payment-requests`), kế hoạch (`planning.routes.ts`). Phiếu R8 giao rà từng chỗ: cái nào hiện tên của **chứng từ** thì cần đợt riêng, cái nào chỉ là danh mục đối tượng (tên hiện tại là đúng) thì ghi rõ lý do.

## 3. Ngoài phạm vi (cố ý)

- Gộp đối tượng theo khuôn 0068 (S029-20) — việc riêng.
- Đơn vị tính, lý do, `dimension:<kind>` — chưa có `entity_codes` cho chúng.
- `partner_code` ảnh chụp trên dòng sổ — mã đã có `entity_codes` để tra theo ngày; chụp thêm khi có nhu cầu báo cáo thật.

## 4. Quyết định (đã chốt)

| Mã | Hỏi | Chốt |
|---|---|---|
| D029-19-1 | Tên lúc ghi lấy theo **ngày chứng từ** hay **lúc ghi sổ**? | **Ngày chứng từ** — nguồn sự thật, phiên bản hiện rõ (§0) |
| D029-19-2 | Cột `partner_name` đặt ở dòng sổ, đầu bút toán, hay cả hai? | **Cả hai** (kèm `partner_attr_id`); cùng một hàm trigger |
| D029-19-3 | Có lưu `phone` / `email` của đối tượng thành thuộc tính có hiệu lực không? | **Không**: chỉ `name`, `tax_code`, `address` |
| D029-19-4 | 2e: báo cáo không đọc tên từ sổ lấy tên theo ngày nào? <!-- [2026-11-09 02:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — D029-19-4 chủ dự án đồng ý theo đề xuất 2026-11-09 --> | **Theo chỗ hiện, cùng §2:** (i) dòng **tổng hợp theo đối tượng** (tuổi nợ `control-reports` dòng gom, tên đối tượng của hợp đồng) → tên tại **ngày cuối kỳ**; (ii) dòng **từng chứng từ** (tuổi nợ chi tiết theo `debt_items`) → tên tại **ngày chứng từ** (`doc_date`), qua `bizcity_entity_attr_at`, không thêm cột; (iii) **ghi chú chuyển dài hạn** ở `balance-sheet` (`long_term_balances`) → tên tại **ngày lập bảng**, vì đó là ghi chú của khai báo thủ công chứ không phải chứng từ. Không migration |

## 5. Phiếu rà soát (một người rà, smallwin) <!-- [2026-11-09 02:28 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — phiếu rà soát S029-19 theo yêu cầu chủ dự án -->

**Người rà soát:** Nguyễn Văn Thủy (một người, kể cả K3 — theo SMALLWIN). **Người nhờ:** Johnny Chu – Chu Hoàng Anh. Rà xong ghi kết quả vào bảng dưới (đạt / cần sửa + PR) và một dòng ở [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md).

| # | Rà gì | Cách rà | Kết quả |
|---|---|---|---|
| R1 | Trigger điền tên lúc ghi lấy đúng **theo `doc_date`**, không theo lúc ghi sổ | đọc `db/migrations/0087_thuoc_tinh_thuc_the.sql`; chạy `entity-attributes.test.ts` (T029-EA-*) | ☐ |
| R2 | Bút toán đảo chép đúng tên của bút toán gốc (không tính lại theo ngày hôm nay) | T029-EA-6b | ☐ |
| R3 | Khung nhìn `bizcity_read.*` chỉ **thêm** cột ở cuối, giữ `security_invoker` | đọc `0090_khung_nhin_ten_doi_tuong.sql`; T029-JNL-1 | ☐ |
| R4 | Sổ nhật ký (bán / mua / thu chi tiền): chứng từ nhập muộn mang tên cũ | `so-nhat-ky-ten-theo-ngay.test.ts` (T029-JNL-1..4) | ☐ |
| R5 | Sổ chi tiết + nhật ký chung: cả đường dòng (111) và đường đầu bút toán (511) | `so-cai-ten-theo-ngay.test.ts` (T029-LED-1..3) | ☐ |
| R6 | Nhật ký chi tiền theo khoản mục: dòng Nợ 33111 và đầu bút toán 64231 | `bao-cao-chieu-ten-theo-ngay.test.ts` (T029-DIM-1..2) | ☐ |
| R7 | Báo cáo công nợ lấy tên tại ngày cuối kỳ | `cong-no-ten-theo-ngay.test.ts` | ☐ |
| R8 | Còn chỗ nào hiện tên đối tượng của **chứng từ** mà chưa theo quy tắc? | duyệt danh sách **Chưa rà** ở §2: mỗi chỗ ghi "danh mục (đúng)" hoặc "cần đợt riêng" kèm lý do; lệnh gợi ý `grep -rn "p.name|partner_name" apps/api/src` | ☐ |
| R9 | Giới hạn đã biết ở §2 chấp nhận được | đọc đoạn **Giới hạn đã biết** | ☐ |

Cách chạy: DB thử riêng (`ketoan_test_*`), `DATABASE_URL=postgres://ketoan:ketoan@localhost:5434/<db> npx vitest run <tệp>` trong `apps/api`. Đừng chạy cả bộ cùng lúc với người khác (dùng chung CSDL thử).
