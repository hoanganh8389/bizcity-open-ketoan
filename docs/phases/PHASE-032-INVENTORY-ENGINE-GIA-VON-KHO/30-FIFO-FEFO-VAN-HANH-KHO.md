# PHASE-032 · 30 — FIFO và FEFO: hai bài toán khác nhau; chiến lược vận hành kho và giao diện chọn lô
<!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — W0: FIFO (tính giá) ≠ FIFO (xuất lô) ≠ FEFO; hook inventory.pickLots; chính sách core.inventory.lot_picking@1; màn chọn lô; thông báo IN-INV-011..013 -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Bản vẽ: [mockups/inventory-engine.html](mockups/inventory-engine.html) › *Chọn lô FIFO / FEFO*.

## 1. Ba chữ FIFO, chỉ một là kế toán

| | FIFO — phương pháp tính giá | FIFO — quy tắc xuất lô | FEFO — quy tắc xuất lô |
|---|---|---|---|
| Câu hỏi | Hàng xuất mang **đơn giá** nào? | Lấy **lô nào** ra trước? | Lấy lô nào ra trước? |
| Tiêu chí | lớp nhập cũ nhất còn lượng | ngày nhập sớm nhất | **hạn dùng gần nhất** (First Expired, First Out) |
| Loại chính sách | **kế toán** — `core.costing.method@1`, nhất quán cả năm, kế toán trưởng duyệt | **vận hành** — `core.inventory.lot_picking@1`, đổi lúc nào cũng được | vận hành |
| Ảnh hưởng sổ cái | có (giá vốn, lãi gộp) | **không** | **không** |
| Căn cứ | VAS 02; TT99/2025 (nhập trước – xuất trước, bình quân gia quyền, thực tế đích danh; **không** nhập sau – xuất trước) | quản trị kho | quản trị kho; hàng có date (sữa, dược, thực phẩm) |
| Quyết định đã có | D025-2: mặc định **bình quân tháng**, FIFO là lựa chọn | D025-2: "xuất lô là việc kho" | D025-2 |

Hệ quả: bán lẻ hàng có date **cần FEFO**, **không cần** đổi phương pháp tính giá. Một cửa hàng sữa có thể vừa FEFO vừa bình quân tháng — và đó là cấu hình mặc định hợp lý. Đích danh (lớp = lô) là trường hợp duy nhất mà lô xuất quyết định giá vốn.

## 2. Quy tắc mặc định của Core (hook `inventory.pickLots`)

```text
đầu vào: item_id, qty cần xuất, kho, ngày, danh sách lô còn số dư ở kho
bước 1  loại lô: status ∈ {quarantine, hold, expired, disposed}; expiry_date < ngày (trừ nghiệp vụ huỷ / trả NCC)
bước 2  thứ tự:
          item có expiry_date  → FEFO: expiry_date ↑, rồi ngày nhập ↑, rồi lot_id ↑
          item không có hạn    → FIFO: ngày nhập (receipt_line) ↑, rồi lot_id ↑
bước 3  lấy đủ qty theo thứ tự; thiếu → shortage > 0 (không chặn ở đây — cửa nạp / module quyết)
bước 4  module nối hook: exclude(lot) OR nhau; prefer(a,b) theo thứ tự đăng ký; minShelfDays → loại lô có hạn − ngày < minShelfDays
đầu ra: picks[{ lot, qty }], rule 'fefo' | 'fifo', shortage, warnings[]  — CHỈ GỢI Ý, KHÔNG GHI
```

Ví dụ (ảnh đề bài): lô A 01/11, lô B 05/11, lô C 08/11 (ngày nhập); hạn A 31/12, B 30/11, C 15/12. **FIFO** lấy A trước (nhập sớm nhất). **FEFO** lấy B trước (hết hạn sớm nhất), rồi C, rồi A.

Mở rộng của module (PHASE-030 · 51):
- **Bán hàng:** `minShelfDays` theo khách / kênh (siêu thị đòi hạn còn ≥ 2/3; online đòi ≥ 30 ngày).
- **Kho:** `exclude` lô đang kiểm kê (`count_locked`), lô chờ QC.
- **Mua hàng:** không chọn lô khi xuất, nhưng tạo lô khi nhập (`lotRef`).

## 3. Chính sách `core.inventory.lot_picking@1` (Policy Registry)

| Tham số | Kiểu | Mặc định | Nghĩa |
|---|---|---|---|
| `mode` | `suggest · enforce` | `suggest` | gợi ý (người xuất chọn khác được, ghi lý do) hay bắt buộc (khác gợi ý → giữ chờ duyệt, `IN-INV-011`) |
| `rule` | `auto · fefo · fifo` | `auto` | `auto` = FEFO khi có hạn, FIFO khi không |
| `allowExpired` | boolean | `false` | cho xuất lô đã hết hạn (chỉ nghiệp vụ huỷ / trả NCC luôn được) |
| `nearExpiryDays` | int | 30 | ngưỡng cảnh báo cận hạn (`bizcity.inventory.lot.expiring`) |
| `overrideReasons` | string[] | `['khách yêu cầu lô', 'lô gợi ý không ở vị trí lấy', 'khác']` | lý do khi chọn khác gợi ý |

Phạm vi: đơn vị → chi nhánh → kho → nhóm hàng (hẹp thắng). Phiên bản, hiệu lực, băm theo ADR-0031; chứng từ xuất gửi `policyRefs` để kiểm đúng bản.

## 4. Giao diện chọn lô (màn xuất hàng của mọi module, qua `@bizcity/ui-kit`)

| Khu | Hiện gì | Hành vi |
|---|---|---|
| Dòng hàng | mã, tên, số lượng, **ô "Lô"** với gợi ý đã điền sẵn (FEFO / FIFO) | nhấn vào mở bảng lô |
| Bảng lô | số lô, hạn dùng (màu: còn xa / cận hạn / hết hạn), ngày nhập, kho, số dư, trạng thái (available / cách ly / hold), **cột "Gợi ý"** với số lượng đề xuất | tick / sửa số lượng; tổng phải = số lượng dòng; lô loại trừ mờ, có lý do khi rê chuột |
| Thanh luật | *"Quy tắc: FEFO (hàng có hạn) · chính sách lot_picking v2 · chế độ gợi ý"* | bấm xem chính sách |
| Khác gợi ý | ô **Lý do** bắt buộc (danh sách `overrideReasons`) | `suggest`: ghi kèm; `enforce`: giải thích sẽ chờ duyệt |
| Cảnh báo | *"Lô B hết hạn 30/11 — còn 21 ngày; khách X đòi ≥ 30 ngày"* | `IN-INV-013` khi hết hạn; hint khi cận hạn |
| Thiếu | *"Thiếu 5 — kho còn 25 / cần 30"* | không chặn tại đây (tồn âm tạm → `CT-INV-001` ở settle) |
| POS / plugin | gọi `POST /inventory/pick-lots` để lấy gợi ý; offline: viết lại thuật toán theo `spec` + `vectors` của Rule Contract (như PHASE-031 W3a) | gửi `lotRef` + `policyRefs` |

Màn **Kho › Lô & hạn dùng** (module Kho, W5): lưới lô theo item / kho, bộ lọc cận hạn, nút *Cách ly* / *Huỷ* (mở chứng từ), lịch sử trạng thái lô, liên kết hành trình `item_id`.

## 5. Thông báo (một ngôn ngữ, `bizcity_findings@1`)

| Mã | Khi | Câu trên màn | Việc gợi ý |
|---|---|---|---|
| `IN-INV-010` | item `lot_tracking = required` mà dòng không có lô | *"Mặt hàng theo dõi lô; dòng 3 chưa chọn lô"* | chọn lô / bật tự gợi ý |
| `IN-INV-011` | xuất khác gợi ý, không lý do | *"Lô C khác gợi ý FEFO (lô B hết hạn trước). Ghi lý do hoặc đổi về lô B"* | chọn lý do |
| `IN-INV-012` | lô không thuộc item / đã huỷ | *"Lô 2311-A không thuộc mặt hàng này"* (block) | sửa lô |
| `IN-INV-013` | xuất lô hết hạn (không phải huỷ / trả NCC) | *"Lô B hết hạn 30/11/2026, không được bán"* | đổi lô / lập phiếu huỷ |
| `CT-INV-002` | lô quá hạn còn `available` cuối kỳ | *"3 lô quá hạn chưa cách ly / huỷ"* | mở danh sách |
| sự kiện `lot.expiring` | hạn − hôm nay ≤ `nearExpiryDays` | thông báo đồng hồ ngày cho kho / bán hàng | khuyến mại, trả NCC, điều chuyển |

## 6. Không làm ở phase này (nói rõ)

Vị trí kệ / bin, serial từng đơn vị (đích danh theo serial là mở rộng của lô), QC nhập nhiều bước, in tem lô — thuộc module Kho (PHASE-030 · 51, phase riêng). Engine chỉ cần: lô có hạn, trạng thái, số dư, và hook để các thứ đó cắm vào.
