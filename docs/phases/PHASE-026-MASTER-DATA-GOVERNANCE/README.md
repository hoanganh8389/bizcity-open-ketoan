# PHASE-026 — Quản trị dữ liệu gốc (Master Data Governance): nền móng của Open Kế Toán
<!-- [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — mở phase theo chỉ đạo chủ dự án: MDG là nền móng, Continuity là cam kết; Enterprise Master Data Center; bốn khả năng trên mỗi màn danh mục; bảng trụ cột × mức đạt làm kim chỉ nam cho dev -->

> **Trạng thái:** 🟡 W0 tài liệu + bản mẫu + bảng trụ cột (HT10) 2026-11-04 · chờ chủ duyệt D026-1..8 · **Code:** HT10 + thẻ Trụ cột (chỉ đọc) có; phần còn lại chưa
> **Mức Kernel:** K0 cho W0 (nguyên tắc, bảng trụ cột); P0 K2–K3 (bảng định danh / mã, migration); P1 K2 (nhóm đơn vị, liên đơn vị); P2 K1
> **Mục tiêu:** Thiết lập **một lần** hệ thống định danh và nguyên tắc đúng, để hàng triệu mã hàng, hàng trăm cửa hàng, nhiều pháp nhân và mọi module dùng chung **một dòng dữ liệu kế toán** liên tục, chính xác, truy vết và kiểm toán được — và giao diện **cho thấy** Core đã đạt tới đâu.
> **Việc lộ trình:** — (đề xuất thêm vào PHASES khi chủ duyệt D026-1)
> **Phân hệ:** danh-muc <!-- [2026-11-11 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — B1: dòng Phân hệ (R-FLOW-10) cho HT11 -->
> **Checklist công bố:** —
> **Quyết định:** [ADR-0022](../../adr/ADR-0022-quan-tri-du-lieu-goc-nen-mong.md) (đề xuất) · **Nền:** [ADR-0017](../../adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md), [ADR-0018](../../adr/ADR-0018-danh-muc-co-phien-ban-toan-framework.md), [ADR-0021](../../adr/ADR-0021-accounting-continuity-lien-tuc-ke-toan.md) · **Tôn chỉ:** [ADR-0020](../../adr/ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md)
> **Phụ thuộc:** PHASE-024 B2 (`items`, `item_id` trên bảng sổ — ✅ 0065 / 0066), S024-11 (`products` → khung nhìn) trước khi làm nhóm đơn vị · **Liên quan:** 025 (Gate C, lớp giá vốn), 023 (khung Vì sao), 019 (Bàn điều tra)
> **Nguồn yêu cầu:** chủ dự án 2026-11-04 — *"Một sai sót ở danh mục có thể ảnh hưởng dây chuyền tới mua hàng, nhập kho, FIFO, giá vốn, doanh thu, công nợ, lãi lỗ và báo cáo tài chính, kể cả khi từng bút toán riêng lẻ vẫn cân đối Nợ / Có."*

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | nền móng + ba bảo đảm; nguyên tắc MD / ORG / ACC / CF / AUD ↔ luật; quyết định D026-1..8; đợt P0 / P1 / P2; Golden Tests |
| [10-DANH-GIA-ADAPT](10-DANH-GIA-ADAPT.md) | **bảng trụ cột × tiêu chí × mức đạt** — code hôm nay đến đâu, bằng chứng, khoảng cách, việc tiếp (sinh từ `docs/standard/tru-cot.json`) |
| [20-KIEN-TRUC](20-KIEN-TRUC.md) | định danh ba tầng, `entity_codes`, cây nhiều cấp, nhóm đơn vị HO / kho / cửa hàng, phiên bản hệ thống TK, lịch sử & tác động, đường chấm điểm |
| [30-UI-UX](30-UI-UX.md) | **Enterprise Master Data Center**; bốn khả năng trên mỗi màn; HT10 + thẻ Trụ cột; luồng "small win" |
| [mockups/master-data-center.html](mockups/master-data-center.html) | bản mẫu tĩnh: trung tâm dữ liệu gốc, thẻ mặt hàng bốn thẻ, nhóm đơn vị, bảng trụ cột, Golden Tests — bấm thử |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | việc con `S026-*`, Golden Tests `T026-G*`, log |

## Trả lời ngắn

- **500 hay 1.000 cửa hàng khi chuyển kho / bán hàng / kho chi nhánh mua rồi chuyển nội bộ — quản trị đúng không?** Trong **một đơn vị** (tenant): có — chi nhánh / cửa hàng / kho, nhóm tính giá, chuyển kho hai chiều (`counter_branch_id`), TK hàng đang chuyển / phải thu nội bộ, giá vốn theo nhóm gửi; đã chạy với 700+ chi nhánh trong dữ liệu gốc. Khi **HO, kho tổng, cửa hàng là các tenant khác nhau**: **chưa** — cần nhóm đơn vị + cặp chứng từ liên đơn vị + loại trừ (D026-4, S026-6 / 7, đợt P1).
- **Một tenant là kho, tenant khác là cửa hàng, một tenant là HO?** Đúng là mô hình đích (D026-4): vai của tenant trong nhóm; danh mục nhóm nhận về từng đơn vị giữ chung `item_id`; RLS không đổi.
- **item_id và item_code chia hai cột?** Đã vậy từ 0065: `items.item_id` (định danh tồn kho, bất biến) và `item_codes` (mã có phiên bản). Sản phẩm cha = `parent_item_id` (D026-2, chưa điền — S026-3).
- **Giao diện Danh mục thành Enterprise Master Data Center?** Bản mẫu ở [mockups](mockups/master-data-center.html); đường đi: giữ mọi màn hiện có, thêm trang trung tâm + khung chung bốn thẻ (S026-10..13).
- **Code đã adapt đến đâu?** Xem **HT10 Trụ cột & mức đạt** (Hệ thống) hoặc [10-DANH-GIA-ADAPT](10-DANH-GIA-ADAPT.md): nền móng MDG 47 % (mặt hàng xong, thực thể khác chưa, nhóm đơn vị chưa); trụ cột I 100 %; II 46 %, III 39 % (lớp giá vốn, Gate C còn ở tài liệu); IV 90 %; V–VIII 50–60 %.
