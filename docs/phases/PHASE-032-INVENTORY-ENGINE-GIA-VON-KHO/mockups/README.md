# PHASE-032 · Bản mẫu Inventory Engine
<!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — W0: bản mẫu tĩnh một trang: kiến trúc tổng thể, mã hàng ≠ mã tài khoản, chọn lô FIFO / FEFO, lớp giá vốn & phân bổ, chín tình huống, sẵn sàng khoá kỳ -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

[inventory-engine.html](inventory-engine.html) là **bản mẫu tĩnh**, mở thẳng bằng trình duyệt: không máy chủ, không thư viện ngoài, sáng / tối theo hệ thống. Dữ liệu là JSON nội tuyến (`LOTS`, `LAYERS`, `CASES`, `READINESS`), sửa trực tiếp trong tệp.

| Mục (`#…`) | Cho thấy | Chủ dự án duyệt |
|---|---|---|
| `#kien-truc` | sơ đồ kiến trúc tổng thể 7 tầng (Master Data & Policy Registry → Mua / Kho / Bán → Document SDK → Conformance Gate → **Inventory Engine ↔ Accounting Kernel** → Cost Settlement → Period Closing → Báo cáo & truy vết), bốn liên tục, bảng "đọc cho ba người" | cách chia tầng; câu chữ cho CEO / kế toán / dev |
| `#ma-hang` | thành phần định danh của SKU `010-025-001-XD` (`item_id`, `sku`, `parent_item_id`, `lot_id`, `warehouse_id`, `posting_group`, `account_code`) và hành trình hạch toán của **cùng một** mặt hàng qua 156 → 632 → 156 → 1579 → 1381 → 911 | cách nói "tài khoản là kết quả, không là thuộc tính" |
| `#chon-lo` | **tương tác**: ba lô A / B / C (ngày nhập, hạn), ô số lượng, chuyển FIFO ⇄ FEFO, bật / tắt cách ly, `minShelfDays`; bảng gợi ý, cảnh báo `IN-INV-011 / 013`; chú thích "không đổi giá vốn" | D032-5; chế độ gợi ý mặc định |
| `#lop-gia-von` | **tương tác**: hai lớp nhập (100 × 100.000, 50 × 120.000), bán 30 → phân bổ; chọn số lượng trả → hoàn theo phân bổ gốc (500.000) **so với** cách sai lấy giá nhập gần nhất (600.000); chuyển sang bình quân để thấy cùng kết luận; lần tính `draft → settled` | D032-6 / D032-7 |
| `#tinh-huong` | chín thẻ G1–G9: luồng từng bước, bút toán theo lý do, mã kiểm, nút "xem trên lớp" | số liệu và lời giải thích |
| `#khoa-ky` | Sẵn sàng khoá kỳ phần giá vốn: lần tính `draft` → nút Kết chuyển mờ với lý do; nhấn *settle* → cổng mở; `DG-CLOSE-2` khi giá vốn đổi sau kết chuyển | D032-8; mức chặn / chấp nhận có lý do |

[bang-diem-ke-toan.html](bang-diem-ke-toan.html) — **Bàn làm việc kế toán** ([60](../60-SCOREBOARD-KE-TOAN.md), [70](../70-CHUAN-HOA-BANG-KIEM-KE-TOAN.md)), viết bằng lời kế toán, năm thẻ: `#viec` *Việc hôm nay* (kiểm hằng ngày / hằng tuần, chỉ nhắc việc, kèm "nếu để tới lúc khoá sổ") · `#khoa-thu` *Khoá thử hôm nay* (năm bước như khoá thật, không ghi sổ; ô "giả sử đã chốt giá vốn / đã giải trình" để thấy kết luận đổi) · `#ket-qua` *Kết quả từng tuần, tháng* (bản lưu tuần, Đã xem tuần) · `#theo-doi` *Sổ theo dõi các tháng* (23 điều kiện × tuần hoặc tháng, nâng cấp phần mềm N0..N4; `#d-thang` mở theo tháng) · `#phan-mem` *Phần mềm tự kiểm được gì*. Đã chụp kiểm bằng Chrome headless (sáng, 1440 px). <!-- [2026-11-10 01:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — Bàn làm việc kế toán -->

[the-mat-hang-hai-so.html](the-mat-hang-hai-so.html) <!-- [2026-11-10 11:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — chủ dự án duyệt ba khối màn mặt hàng và trả Q032-9 = cha chỉ là tổng khi xem (D032-14); bản mẫu the-mat-hang-hai-so.html; Thuy2k phụ trách --> — **màn mặt hàng ba khối** ([10 §2a](../10-KIEN-TRUC.md), D032-14): *Thẻ kho* theo biến thể, dòng cha là tổng · *Đã ghi sổ* mỗi lần tính giá vốn Nợ / Có bao nhiêu, khớp phân bổ chưa · *Khớp sổ cái chưa* thẻ kho = sổ cái hoặc lệch bao nhiêu, ở mặt hàng nào. Nút *Khớp hết / Có lệch* (hoặc `#lech`); tình huống lệch có đủ ba loại: bút toán tay vào TK kho (phải sửa), sửa giá nhập sau khi chốt giá vốn (cần tính lại), phiếu ghi mã cha (chọn biến thể). Ảnh: [evidence/mockup-mat-hang-khop.png](../evidence/mockup-mat-hang-khop.png), [evidence/mockup-mat-hang-lech.png](../evidence/mockup-mat-hang-lech.png).

Quy ước màu: xanh lá = đạt / lớp còn lượng; cam = cảnh báo / cận hạn; đỏ = chặn / hết hạn; tím = ghi sổ (Kernel); xám = vận hành (không đụng sổ). Ô tím ◆ = bút toán do Kernel lập từ `CostingResult`; Engine không có ô tím.

Chưa kiểm bằng trình duyệt tự động (W0); khi W5 làm màn thật: chụp màn đặt cạnh bản mẫu trong `evidence/`.
