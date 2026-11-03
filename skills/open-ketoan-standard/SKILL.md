---
name: open-ketoan-standard
description: Sáu chuẩn kế toán mà mọi app nối vào open-ketoan phải đạt — POS, bán hàng online, CRM, MRP, kho vật tư, quản lý tài sản, ERP — liền mạch mua → kho → bán → giá vốn → lãi lỗ, mã hàng có phiên bản, định khoản đúng quy định, sổ có nguồn chứng từ và phiên bản, làm việc với sổ có nguyên tắc, báo rõ lý do chưa đạt. Chuẩn được kiểm theo cả vòng đời của đối tượng kế toán, không chỉ từng chứng từ. Đọc TRƯỚC khi thiết kế hoặc sửa bất kỳ tích hợp nào ghi vào sổ kế toán, và khi phải trả lời "app này đã đạt chuẩn kế toán chưa". Từ khoá: accounting standard, chuẩn kế toán, tuân thủ, compliance, giá vốn, FIFO, item versioning, item_id, vòng đời, lifecycle, lineage.
---

<!-- [2026-11-03 04:20 PM Johnny Chu - Chu Hoàng Anh] G3-01 — chuẩn nền cho mọi skill kế toán: sáu chuẩn, việc của app, bảo đảm của Kernel, lệnh kiểm, trạng thái thật hôm nay -->

# Sáu chuẩn kế toán cho mọi app nối vào open-ketoan

open-ketoan là lõi kế toán. App của bạn (POS, CRM, MRP, kho, tài sản…) làm nghiệp vụ; lõi giữ sổ. Một app **đạt chuẩn** khi sáu điều dưới đây đúng. Mỗi chuẩn có bốn phần: app phải làm gì, Kernel bảo đảm gì, lệnh nào kiểm, và **trạng thái thật hôm nay**. Đừng hứa với người dùng điều mà cột trạng thái chưa có.

<!-- [2026-11-03 06:00 PM Johnny Chu - Chu Hoàng Anh] G3-01 — quyết định chủ dự án 2026-11-03: giá vốn mặc định bình quân tháng + FIFO vào lộ trình; item_id là trụ cột vòng đời; cổng sản xuất giữ chỗ cho cộng đồng; kiểm vòng đời -->

**Vì sao có sáu chuẩn này.** Lõi kế toán định hướng cho kế toán, coder, dev và chủ doanh nghiệp làm theo một luật chung, để sổ liền mạch và quản lý được xuyên suốt. Luật nhà nước đổi (vd TT200 sang TT99/2025) thì đổi gói định khoản và danh mục **theo phiên bản**, không phải làm lại dữ liệu. Định danh hàng chuẩn hoá (`item_id`) và mã có phiên bản là một trụ cột của điều đó.

<!-- [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — khung trụ cột 0–VIII (D027-1) -->
**Trụ cột của Core** (khung 0–VIII, [tru-cot.json](../../docs/standard/tru-cot.json), vai trò từng trụ cột ở [PHASE-027 §4](../../docs/phases/PHASE-027-CORE-KE-TOAN-CHO-DEV/00-MASTER-PLAN.md)): 0 Quản trị dữ liệu gốc · I Sổ cái bất biến · II Định danh bất biến, mã có phiên bản · III Liên tục kế toán · IV Một cửa nạp, cổng kiểm chuẩn, một ngôn ngữ mã · V Chính sách, chế độ kế toán có phiên bản · VI Bằng chứng, quan sát được · VII Cô lập đơn vị, phân quyền · VIII Mở rộng bằng module, kiểm chuẩn tự động. App của bạn chỉ cung cấp chứng từ nguồn qua một cửa nạp (IV); định khoản, giá vốn, kết chuyển là việc của Core (I, V). Sáu chuẩn dưới đây là cách kiểm app dùng đúng các trụ cột đó: C1 ↔ III V, C2 ↔ 0 II, C3 ↔ V, C4 ↔ I IV, C5 ↔ I IV, C6 ↔ IV VI.

Ký hiệu trạng thái: ✅ Kernel thi hành, có lệnh kiểm · 🟡 thi hành một phần · ☐ đã duyệt thiết kế, Kernel chưa thi hành.

## C1 · Liền mạch mua → kho → bán → giá vốn → lãi lỗ

| | |
|---|---|
| App phải | Mọi lần hàng vào là một `purchase` (cả hàng NCC tặng, giá 0); bán / trả là `sale` / `sale_return` (trả phải có `originalDocKey`); chuyển giữa kho là `transfer` hai chân; lệch kiểm kê là `stock_adjustment` có lý do. **Cùng một mã hàng** từ phiếu nhập tới phiếu bán. Ngày chứng từ là ngày hàng thật đi. |
| App không được | Tự tính giá vốn rồi gửi `lines[].cost`, trừ khi kế toán trưởng đã chọn hệ thống gửi là nguồn giá vốn. Bỏ qua phiếu nhập "vì kho không quản". Gửi bán trước khi gửi nhập của cùng lô. |
| Kernel bảo đảm | Sổ phụ kho (`inventory_movements`) từ chứng từ; giá vốn **bình quân gia quyền theo tháng** (Tính giá vốn ACC49); lãi gộp (BH04); kết chuyển (ACC6); đối chiếu sổ chi tiết kho với số dư tài khoản hàng tồn kho (`GET /api/v1/inventory/reconcile`, tài khoản lấy từ nhóm hạch toán của đơn vị). |
| Kiểm | `npx bizcity flow check --sku <mã> --period YYYY-MM` — tồn không âm, dòng xuất có giá vốn, lãi gộp, sổ kho khớp sổ cái (C1.5), sẵn sàng đóng kỳ |
| Hôm nay | ✅ luồng theo mã hàng; giá vốn **bình quân gia quyền tháng là phương pháp mặc định** (quyết định chủ dự án 2026-11-03). ☐ **FIFO có trong lộ trình, làm sau `item_id`** (PHASE-024 B7 sau B2b + B5), Kernel chưa thi hành. ☐ Đích danh chưa có. |

**Doanh nghiệp đòi FIFO:** nói thẳng là FIFO có trong lộ trình nhưng Kernel chưa thi hành; hôm nay sổ tính bình quân tháng. Không tự tính FIFO trong app rồi gửi `cost`: đơn vị sẽ có hai sổ giá vốn và kết chuyển dùng số không ai kiểm. Chọn phương pháp giá vốn là chính sách kế toán của đơn vị (VAS 02 cho phép nhập trước xuất trước, bình quân, đích danh) — cần quyết định của Nhóm Lõi và kế toán trưởng, không phải của app. Khi FIFO vào Kernel, nó phải đọc lớp nhập theo định danh hàng (C2), vì đổi mã giữa kỳ sẽ làm đứt lịch sử lớp FIFO.

## C2 · Mã hàng có phiên bản, định danh hàng giữ nguyên (trụ cột 0, II)

Mỗi mặt hàng có một định danh `item_id` cấp một lần, không sửa, không dùng lại. Mã hàng là thuộc tính có phiên bản và ngày hiệu lực. Sổ đã ghi không bị viết lại khi danh mục đổi (ADR-0017, bất biến R-ITEM-0: *Item Identity is Immutable. Item Code is Versioned. Posted Ledger is Immutable.*). Nhờ đó theo dõi được một mặt hàng từ phát sinh đầu tiên tới bán, huỷ, trả, giá vốn, đóng kỳ, kết chuyển, kể cả qua các lần đổi mã do quản lý sản phẩm hay do quy định mới.

| | |
|---|---|
| App phải (hôm nay) | Một mặt hàng = **một mã gửi sang sổ, suốt đời**. Mã đã có dòng sổ thì không đổi, không dùng lại cho hàng khác. POS đổi mã nội bộ → app giữ bảng ánh xạ, vẫn gửi mã cũ. Cùng hàng khác đơn vị tính → một mã + đơn vị quy đổi, không tạo mã mới. |
| App phải (khi Kernel có) | Gửi `itemId` (khuôn nạp 1.4.0), đổi mã qua `core.item.add-code`, gộp mã qua `merge-preview` → `merge`. |
| Kernel bảo đảm (đã duyệt, ADR-0017 D-1…D-9, ADR-0018) | Dòng sổ cái và sổ kho ghi **cả hai**: `item_id` (khoá) và `product_sku` (ảnh chụp mã tại ngày hạch toán). Đổi mã = thêm phiên bản có `valid_from`, mã cũ vẫn tra được cho chứng từ trước đó. Gộp mã = alias, không đổi `item_id` của lịch sử. Phân loại hạch toán có phiên bản theo ngày hiệu lực. Bộ kiểm `DG-ITEM-1…5`, `SC-ITEM-1`. Đã có hôm nay: trạng thái nháp / đang dùng, mã `IN-ITEM-009` ở cửa nạp. |
| Kiểm | `flow check` dòng C2 báo SKIP kèm lý do; `event check` báo `IN-MD-004` khi gặp mã hàng mới |
| Truy vết (UI) | Mỗi `item_id` có một trang vòng đời: các phiên bản mã, mọi chứng từ và bút toán theo thời gian, giá vốn từng kỳ, các lần trả, huỷ, kết chuyển. Một bút toán giá vốn chỉ cho biết giá trị đã hạch toán; chuỗi lineage giải thích con số đó đến từ phiếu nhập nào, kỳ tính nào, phiên bản mã nào. |
| Hôm nay | 🟡 Dòng sổ cái và sổ kho đã ghi `item_id`; mã hàng có phiên bản (`item_codes`), phân loại theo ngày, Hành trình mã hàng trên màn ACC95 (PHASE-024). ☐ API danh mục chưa trả `itemId`, khuôn nạp chưa nhận `itemId`, chưa có `core.item.add-code` / `merge`: hôm nay vẫn giữ **một mã gửi sang sổ, suốt đời**. <!-- [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — C2 theo main: item_id đã trên sổ --> |

## C3 · Ghi sổ, hạch toán, định khoản đúng quy định

| | |
|---|---|
| App phải | Chỉ kể sự việc. Chọn `docType` đúng nghiệp vụ; `reasonCode` lấy từ `GET /api/v1/posting/reasons`, để trống khi là nghiệp vụ mặc định. Mã thuế từ `GET /api/v1/tax-codes`; tiền thuế là số trên hoá đơn đã chốt. |
| App không được | Gửi, sinh, đoán số tài khoản. Tự đặt thuế suất. Đổi `docType` hay lý do để "cho qua" (vd dùng điều chỉnh kho thay cho sản xuất). |
| Kernel bảo đảm | Gói định khoản theo chế độ (TT99/2025), `AccountResolver`, cân Nợ = Có ở trigger, rulepack Việt Nam (VAT, hoá đơn điện tử, kỳ). |
| Kiểm | `npx bizcity event check <tệp>` — lớp L5 dựng bút toán thật rồi huỷ |
| Hôm nay | ✅ |

## C4 · Sổ có nguồn chứng từ, có phiên bản

| | |
|---|---|
| App phải | `docKey` ổn định mang tiền tố app; sửa = cùng `docKey`, `version + 1`; huỷ = `POST /api/v1/documents/cancel` có lý do; hoá đơn đã phát hành đi kèm `invoice`; lưu `meta.receipt` (biên nhận bằng chứng) vào bản ghi của app. |
| Kernel bảo đảm | Mỗi bút toán trỏ về một chứng từ có phiên bản; phiên bản mới thì đảo bút toán cũ bằng số âm rồi ghi mới; sổ chỉ thêm; chuỗi băm bằng chứng. |
| Kiểm | `event check` (`IN-BIZ-004` phiên bản lùi, `IN-BIZ-005` cùng phiên bản khác nội dung, `IN-BIZ-006` hoá đơn trùng) |
| Hôm nay | ✅ |

## C5 · Làm việc với sổ có nguyên tắc

| | |
|---|---|
| App và AI không được | UPDATE / DELETE bảng sổ hay chạy SQL tay; tắt trigger, tắt kiểm; đổi ngày chứng từ sang tháng khác để né `PERIOD_LOCKED`; tự gọi tính giá vốn, kết chuyển, khoá kỳ thay kế toán. |
| Kernel bảo đảm | Trigger chỉ thêm, khoá kỳ trong giao dịch ghi, bảng kiểm trước khoá kỳ, chặn khoá khi tự chẩn đoán có lỗi. Tính giá vốn, kết chuyển, khoá kỳ là việc của kế toán trên màn (ACC49, ACC6, ACC2). |
| Kiểm | `flow check` dòng C5 (bảng kiểm khoá kỳ); `npx bizcity ledger verify` (sổ toàn vẹn, cần CSDL) |
| Hôm nay | ✅ |

## C6 · Báo rõ lý do chưa đạt

| | |
|---|---|
| App phải | Mỗi lần bị từ chối: hiện **mã**, thông báo, gợi ý cho người dùng, giữ `requestId`. Không nuốt lỗi, không thử lại lỗi `retryable: false`. Đơn bị từ chối ở trạng thái "cần xử lý", không âm thầm bỏ. |
| Kernel bảo đảm | `bizcity_errors@1` (mã lỗi API), `bizcity_findings@1` (mã tiền kiểm, danh mục), `bizcity_remedy@1` (bước sửa, ai sửa, việc cấm, kiểm lại), 93 ca F22 theo vai. |
| Kiểm | `npx bizcity explain <MÃ>`; `event check` in kèm "sửa:" và "luật:" cho từng phát hiện |
| Hôm nay | ✅ mã, cách sửa, luật gốc. 🟡 Sổ tay nghiệp vụ theo từng action của module (thẻ dịch) chưa có trong repo. |

## Kiểm cả vòng đời, không chỉ từng chứng từ

Kiểm từng giao dịch riêng lẻ vẫn để lọt những trường hợp sau. Mỗi trường hợp có lệnh kiểm hôm nay, hoặc được ghi là chưa có:

| Rủi ro | Chuẩn | Kiểm hôm nay |
|---|---|---|
| Phiếu mua, phiếu nhập, phiếu bán đều đúng nhưng không nối được để ra giá vốn | C1 | `flow check` C1.1, C1.3, C1.4 |
| Mã hàng đổi giữa kỳ, đứt lịch sử giá vốn hoặc lãi lỗ theo mã | C2 | `flow check --to` dòng L1 "tồn chuyển kỳ" bắt được dấu vết; chặn tận gốc cần thao tác đổi mã qua `core.item.add-code` (☐, PHASE-024 S024-11) |
| Trả hàng hợp lệ nhưng sai giá vốn ban đầu | C1, C4 | `flow check` C5: bảng kiểm khoá kỳ liệt kê phiếu trả không nối được phiếu gốc (thiếu `originalDocKey`, gốc chưa nhận hoặc đã huỷ). `event check` không bắt vì trường này tuỳ chọn trong khuôn |
| Tổng Nợ bằng tổng Có, nhưng sổ chi tiết tồn kho không khớp số dư tài khoản hàng tồn kho | C3, C5 | `flow check` C1.5; tự chẩn đoán `INVENTORY_LEDGER_MISMATCH` (F22-STK-11, cảnh báo); cả đơn vị: `GET /api/v1/inventory/reconcile?period=YYYY-MM` (theo chi nhánh × mặt hàng, tổng theo tài khoản, bút toán kho không gắn mặt hàng) |
| Mỗi chứng từ đều hợp lệ nhưng cuối kỳ không đủ điều kiện khoá sổ | C5 | `flow check` C5 (bảng kiểm khoá kỳ) |

Lệnh vòng đời: `npx bizcity flow check --sku <mã> --period <kỳ đầu> --to <kỳ cuối>`. Lệnh chạy từng kỳ, rồi kiểm tồn cuối kỳ trước bằng tồn đầu kỳ sau.

## Cổng chờ: sản xuất / MRP

Chủ dự án quyết 2026-11-03: giữ chỗ cổng, Nhóm Lõi không làm, cộng đồng phát triển. `event check` gặp `production_issue`, `production_receipt`, `production_cost_close` thì trả SKIP "cổng chưa mở". Muốn mở cổng: skill [contribute-production-module](../contribute-production-module/SKILL.md).

## Cách dùng chuẩn này

1. Trước khi viết code: với nghiệp vụ sắp làm, đọc từng chuẩn và ghi app sẽ làm gì cho chuẩn đó.
2. Gặp ô ☐ mà nghiệp vụ cần (FIFO, đổi mã hàng, sản xuất): **dừng phần đó**, nói người dùng Kernel chưa có, đề xuất cách làm an toàn hôm nay. Không tự chế ở app.
3. Trước khi báo xong, điền bảng:

```text
Chuẩn   Trạng thái   Bằng chứng
C1      PASS|FAIL|SKIP  flow check --sku … --period … --to …  (vòng đời, gồm L1 tồn chuyển kỳ)
C2      SKIP (chưa có thao tác đổi mã) + app giữ một mã một hàng: có / không
C3      PASS|FAIL|SKIP  event check L5
C4      PASS|FAIL|SKIP  docKey / version / receipt
C5      PASS|FAIL|SKIP  flow check C5
C6      có / không      app hiện mã + explain khi bị từ chối
```

SKIP không phải PASS. Thiếu một dòng thì chưa được nói "đạt chuẩn".
