# 03 · Mã hàng, quy tắc đặt tên, vòng đời mặt hàng
<!-- [2026-11-03 07:23 PM Johnny Chu - Chu Hoàng Anh] ADR-0020 — Item Master: ba lớp định danh / mã / phân loại, quy tắc mã hàng, bảng quy tắc đặt tên, vòng đời mặt hàng hôm nay và theo thiết kế -->
<!-- [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-1: bảng "hôm nay" theo main (0065 items / item_codes, 0066 item_id trên sổ) -->

> Nguồn luật: [R-ITEM](../rules/RULE-ITEM.md) · [ADR-0017](../adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md) (định danh bất biến) · [ADR-0018](../adr/ADR-0018-danh-muc-co-phien-ban-toan-framework.md) (danh mục có phiên bản) · [PHASE-024](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/README.md). Tài liệu này giải thích để dùng, và tách rõ **cái đã chạy** với **cái mới ở thiết kế**.

## 1. Bất biến cần nhớ

> **Item Identity is Immutable. Item Code is Versioned. Posted Ledger is Immutable.**
> Định danh hàng hoá bất biến. Mã hàng có phiên bản và ngày hiệu lực. Sổ đã ghi không đổi khi danh mục đổi.

Lý do kế toán: nếu sổ, sổ kho và giá vốn khoá theo **mã** thì đổi mã làm đứt lịch sử. Phiếu mua, phiếu nhập, phiếu bán đều đúng mà không nối được để ra giá vốn và lãi lỗ. Khoá theo một **định danh không bao giờ đổi** (`item_id`) thì mã đổi bao nhiêu lần, quy định đổi, chuỗi mua → kho → bán → giá vốn → lãi lỗ → kết chuyển vẫn nối liền.

## 2. Ba lớp, không trộn

| Lớp | Là gì | Đổi được không | Dùng làm khoá kế toán? |
|---|---|---|---|
| **Định danh** (`item_id`) | Số căn cước của hàng, cấp một lần | Không bao giờ, không dùng lại | **Có** (dòng sổ, sổ kho, giá vốn tháng mang `item_id`) |
| **Mã** (SKU, barcode, mã nguồn ngoài) | Chuỗi để người và máy ngoài gọi tên | Có, qua **phiên bản** (ngày hiệu lực), mã cũ vẫn tra được | Không |
| **Phân loại hạch toán** (loại đối tượng, nhóm hạch toán, thuế) | Cho Core biết ghi tài khoản nào | Có, có ngày hiệu lực | Không (nó **quyết tài khoản**) |

Nhóm hàng để xem, lọc, báo cáo (ngành → nhãn → nhóm sản phẩm). **Không** dùng làm khoá kế toán, và **không** dùng để suy tài khoản (R-ITEM-2, R-ITEM-4).

### Hôm nay và theo thiết kế

| | Hôm nay | Còn lại (☐ chưa thi hành) |
|---|---|---|
| Khoá của sổ, sổ kho, giá vốn | Dòng sổ cái, sổ kho, giá vốn tháng ghi `item_id` **và** ảnh chụp mã tại ngày hạch toán (0066); giá vốn, nhập xuất tồn, sổ chi tiết hàng hoá gom theo `item_id` (G2). Cửa nạp và API vẫn nhận / trả **mã** | Khuôn nạp nhận `itemId`, API trả `itemId`, đổi mã / gộp mã (S024-11) |
| Bảng | `items`, `item_codes` (chỉ thêm), `item_classification` (theo ngày) chạy song song với `products` (0065) | `products` thành khung nhìn của `items` (S024-9 phần 2) |
| Đổi mã | **Chưa có thao tác**: không đổi mã đã có sổ | Thêm phiên bản mã có `valid_from`; mã cũ vẫn tra được |
| Gộp hai mã | Không | Mã cũ thành bí danh (alias) của mặt hàng mang `item_id` đích; không đổi lịch sử |
| Trạng thái | nháp · đang dùng · ngừng (`is_draft`, `is_active`) | `items` giữ trạng thái; `retired_at` |
| Bộ kiểm | `IN-ITEM-009` (nháp nối bể chờ) | `DG-ITEM-1…5`, `SC-ITEM-1…3`, `IN-ITEM-001…008` |
| Trang xem vòng đời | Chưa có | Một trang cho mỗi `item_id`: phiên bản mã, chứng từ, giá vốn từng kỳ, trả, huỷ, kết chuyển |

Thứ tự thi hành đã chốt (2026-11-03): **`item_id` trước, FIFO sau** (PHASE-024 B7). FIFO theo dõi từng lô nhập theo mặt hàng; nếu khoá theo mã thì đổi mã giữa kỳ làm đứt lịch sử FIFO.

## 3. Quy tắc đặt mã hàng (hôm nay)

Quy tắc dưới đây là **quy tắc của đơn vị mẫu**, nằm ở một chỗ duy nhất: hằng `SKU_RULE` trong `apps/api/src/modules/catalog/sku-rule.ts`. Đơn vị khác đổi số cấp, độ dài từng đoạn ở đó, mọi chỗ khác đọc theo. Hướng dẫn từng thao tác trên màn: [Danh mục mặt hàng](../huong-dan/mat-hang.md#sinh-mã-hàng).

**Mã hàng = mã ngành (2) + mã nhãn (3) + mã nhóm sản phẩm (1) + số thứ tự (3)** = 9 ký tự, ví dụ `110054057`.

| Loại | Cấu trúc | Ví dụ |
|---|---|---|
| Hàng thường | ngành 2 + nhãn 3 + nhóm 1 + số 3 | `110054057` |
| Combo | như trên, nhóm = `8` | `110058001` |
| Quà khuyến mại | `Q` + nhãn 3 + nhóm 1 + số 4 | `Q00610017` |
| Biến thể | mã thường + chữ đuôi (K, M, Q, T…) | `110054057K` |

Số thứ tự tự sinh = số lớn nhất của các mã 9 ký tự cùng tiền tố + 1. Mã có đuôi không làm nhảy số. Khuôn kiểm: `^([0-9]{9}|Q[0-9]{8})[A-Z]{0,2}$` (dùng trong `scripts/doi-chieu-ke-toan.sql` mục 6).

**Luật dùng mã:**

| Việc | Luật |
|---|---|
| Mã chỉ để **gợi ý và đọc**, không quyết tài khoản | R-ITEM-4: tài khoản đi theo nhóm hạch toán, không theo đuôi hay tiền tố |
| Mã gõ tay ngoài quy tắc | Được, và được giữ khi đổi nhóm. Sai quy tắc chỉ là gợi ý, không chặn (theo thiết kế: cảnh báo `IN-MD-002` ở PHASE-021, về sau `IN-ITEM-007`; thư viện mã hôm nay chưa chạy mã này) |
| Mã đã có sổ | **Không đổi, không dùng lại cho hàng khác** |
| Đơn vị tính khác (thùng, lốc, lon) | Một mã + quy đổi ĐVT, không tạo mã mới |
| App ngoài cần mã | Đọc danh mục (`GET /api/v1/products`), giữ bảng ánh xạ ở app, gửi **mã của sổ** |

## 4. Quy tắc đặt tên khác

Các tên này được bộ kiểm hoặc cửa nạp kiểm. Đặt sai thì bị chặn hoặc báo.

| Đối tượng | Quy tắc | Ví dụ | Ai kiểm |
|---|---|---|---|
| Mã module (`key`) | `^[a-z][a-z0-9-]{1,31}$`, trùng tên thư mục, không trùng phân hệ của Core | `hoa-hong` | `bizcity module new` |
| Id action | `<key>.<thực thể>.<động từ>` | `hoa-hong.record.create` | `SC-CON-2`, `CONF-MAN-5` |
| Quyền | `<key>:<việc>` | `hoa-hong:write` | `CONF-MAN-3` |
| Schema CSDL của module | `mod_<key, gạch ngang thành gạch dưới>` | `mod_hoa_hong` | migration của template |
| Migration | `NNNN_ten.sql`, số không trùng, không hở | `0062_so_do_to_chuc.sql` | `SC-DATA-1` |
| **`docKey` của chứng từ** | **Bắt đầu bằng mã nguồn gửi**, ổn định (không `Date.now`, không số ngẫu nhiên) | `pos:CN01:sale:1001`, `hoa-hong:CN01:2026-11:HD01` | Cửa nạp `IN-BIZ-003` (chặn); `module accounting-check` AC-5 |
| Tiền tố `docKey` của Core | `cogs:`, `cogs:internal:`, `cogs:tax:` là của phiếu giá vốn Kernel: **không dùng** | `cogs:CN01:2026-10` | Đặt tên: quy ước |
| Mã phát hiện | `IN-<NHÓM>-NNN`, `F22-<NHÓM>-NN`, `DG-<NHÓM>-N`, `SC-<NHÓM>-N` | Xem [02 §3](02-cong-cu-kiem.md) | Thư viện mã, `SC-CON-5`, `SC-FIND-1` |
| Dấu thay đổi trong mã | `[YYYY-MM-DD HH:MM AM/PM Johnny Chu - Chu Hoàng Anh] <MÃ> — <mô tả>`. **`<MÃ>` là một mã liền** (ví dụ `ADR-0020`, `PHASE-024`), không chứa ký tự lạ; **giờ lấy từ đồng hồ thật**, không ghi giờ tương lai | `ADR-0020 — thêm …` | `SC-SIG-1`, `SC-SIG-2` |

## 5. Vòng đời một mặt hàng

### 5.1 Trạng thái của mặt hàng (hôm nay)

```
 tạo ──► nháp ──────► đang dùng ──────────────► ngừng
 (danh mục,   (thiếu thông tin:    (có thể phát sinh          (is_active = false)
  hoặc cửa nạp  Gate A, chứng từ    nhập, bán, trả, chuyển,
  tự thêm từ    hàng này ở bể chờ)  kiểm kê)
  chứng từ)
```

- Mặt hàng nháp: chứng từ có hàng này nằm ở **bể chờ**, sửa đủ thì tự kích hoạt và chứng từ chờ được kiểm lại (`IN-ITEM-009`, [ADR-0019](../adr/ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md)).
- Hôm nay cửa nạp vẫn **tự thêm** mặt hàng mới từ chứng từ (hàm `ensureProducts` trong `document.service.ts`) và báo gợi ý `IN-MD-004`. Việc **đóng** đường này là PHASE-024 B4, sau khi báo trước cho POS ít nhất 14 ngày.
- Ngừng mặt hàng còn tồn kho: xử lý kho trước. Kiểm tự động chuyện này (`DG-ITEM-4`) là ☐.

### 5.2 Đổi mã, theo thiết kế (☐ chưa thi hành)

Ví dụ: hàng `A001` đổi thành `B001` từ 01/07/2026 vì quy định mới.

| Thời điểm | Điều gì xảy ra | `item_id` | Mã hiệu lực |
|---|---|---|---|
| 05/01/2026 | Mua 100, nhập kho. Dòng sổ ghi `item_id` + ảnh chụp mã `A001` | `01J…X` | `A001` |
| 01/07/2026 | Kế toán thêm phiên bản mã `B001` có hiệu lực từ ngày này (`core.item.add-code`) | `01J…X` (**giữ nguyên**) | `A001` đến 30/06, `B001` từ 01/07 |
| 10/07/2026 | Bán 30. Dòng sổ ghi `item_id` + ảnh chụp `B001`. POS còn gửi `A001`: Core đổi sang `item_id` đích và báo cảnh báo `IN-ITEM-005` | `01J…X` | `B001` |
| Cuối kỳ | Báo cáo theo `item_id`: nhập 100 + bán 30 vẫn **một dòng liền**. Giá vốn, lãi lỗ, kết chuyển không đứt. Báo cáo cũ vẫn đọc `A001` ở dòng cũ | `01J…X` | — |

Gộp hai mã: mã cũ thành **bí danh** trỏ sang `item_id` đích; lịch sử không bị sửa. Không có thao tác "xoá mã đã dùng".

### 5.3 Việc thường gặp: hôm nay làm thế nào

| Việc | Hôm nay | Khi có `item_id` |
|---|---|---|
| Đổi tên hàng, ảnh, mô tả | Được. Không đụng sổ | Như vậy |
| Chuyển nhóm hàng (ngành, nhãn, nhóm sản phẩm) | Được. Chỉ đổi cách xem báo cáo, không đổi sổ | Như vậy |
| Đổi nhóm hạch toán | Bút toán đã ghi **không** đổi (sổ chỉ thêm). Hiệu lực theo ngày là thiết kế R-ITEM-7 ☐ | Có phiên bản theo ngày hiệu lực |
| **Đổi mã hàng** | **Đừng.** Giữ mã cũ, nếu POS đổi mã nội bộ thì app giữ bảng ánh xạ và vẫn gửi mã của sổ | Thêm phiên bản mã |
| **Gộp hai mã trùng** | **Đừng.** Hỏi nhóm Lõi, không tự sửa sổ | Gộp qua `merge-preview` → `merge` |
| Ngừng bán | Đặt không hoạt động, kho về 0 trước | Đặt `retired_at` |
| Khách trả hàng, huỷ đơn | Cùng mã. Trả: `sale_return` có `originalDocKey`. Huỷ: `POST /api/v1/documents/cancel` có lý do | Như vậy |
| Hàng tặng, quà | Vẫn là `purchase` (giá 0 nếu NCC tặng) để có tồn; bán / tặng khách ghi `isGift` | Phân loại `gift` |

### 5.4 Vòng đời kinh tế của hàng trong sổ

| Giai đoạn | Chứng từ | Ghi vào đâu | Kiểm bằng |
|---|---|---|---|
| Mua, nhận hàng | `purchase` (kèm hoá đơn đầu vào) | Kho nhập, tài khoản kho | `event check`, `flow check` C1.1 |
| Trả nhà cung cấp | `purchase_return` | Kho xuất | `event check` |
| Chuyển kho | `transfer` hai chân: xuất rồi nhận | Hàng đang chuyển (1579 trong kịch bản test) về 0 khi nhận đủ | `TRANSIT_NONZERO`, bảng kê chuyển kho |
| Bán | `sale` | Doanh thu, thuế, kho xuất | `event check`, `flow check` C1.2 (tồn không âm) |
| Khách trả | `sale_return` + `originalDocKey` | Nhập lại kho, đảo doanh thu | Bảng kiểm khoá kỳ (phiếu trả mồ côi) |
| Kiểm kê lệch | `stock_adjustment` + `reasonCode` | Thừa / thiếu chờ xử lý | `STOCK_ADJUST_NO_REASON`, F22-STK-09 |
| Tính giá vốn | Kế toán bấm ACC49 | 6321 / 1561 theo bình quân tháng | `flow check` C1.3, C1.4; `COGS_STALE` |
| Đối chiếu | — | Sổ kho ↔ số dư tài khoản kho | `flow check` C1.5; `INVENTORY_LEDGER_MISMATCH` |
| Kết chuyển, khoá kỳ | Kế toán (ACC6, ACC2) | Lãi lỗ, kỳ khoá | `flow check` C5 |
| Qua nhiều kỳ | — | Tồn cuối kỳ trước = tồn đầu kỳ sau | `flow check --to` dòng L1 |

## 6. Hỏi nhanh

**POS của tôi gửi một mã chưa có trong danh mục thì sao?** Hôm nay cửa nạp tự thêm mặt hàng và báo gợi ý `IN-MD-004`; mặt hàng mới chưa có nhóm hạch toán nên doanh thu, giá vốn có thể rơi vào nhóm mặc định. Tốt nhất: tạo mặt hàng ở danh mục trước. Về sau (B4) mã lạ sẽ vào bể chờ.

**Hai hàng khác nhau, có dùng chung một mã được không?** Không. Mỗi mã một hàng suốt đời.

**Cùng hàng nhưng bán theo thùng và theo lon?** Một mã, hai đơn vị tính có quy đổi.

**Công ty tôi muốn quy tắc mã khác (4 cấp, số dài hơn)?** Sửa `SKU_RULE`. Đừng để app tự sinh mã đúng quy tắc: mã do danh mục cấp.

**Thanh tra hỏi một con số giá vốn đến từ đâu?** Hôm nay: `GET /api/v1/inventory/item-ledger` cho từng lần vào / ra; `GET /api/v1/inventory/costs` cho đơn giá tháng. Truy vết một bước từ bút toán giá vốn về phiếu nhập và kỳ tính (lineage) là ☐.

**Khi nào mới đổi mã được an toàn?** Khi PHASE-024 B2b xong (`item_id` vào sổ) và qua cổng chốt: tồn cuối theo mã trước và sau nâng cấp phải trùng, `DG-ITEM-3 = 0`. Xem [lộ trình](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/70-LO-TRINH-ON-DINH-CORE.md).
