# PHASE-035 — HT11 Modules & mức đạt: mỗi phân hệ nghiệp vụ làm được tới đâu, tự suy từ bảng việc; Thuy2k rà hằng tuần
<!-- [2026-11-11 03:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-035 — W0: đề bài chủ dự án 2026-11-11 — màn "Modules & mức đạt" giống HT10 cho mọi phân hệ (mua, kho, cấu hình, bán, thu, chi, tổng hợp, thuế, tài sản, báo cáo, hệ thống); việc của ai làm cũng tự map vào tiến độ phân hệ; Thuy2k phụ trách rà và đánh giá -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Việc lộ trình:** — (mở rộng PHASE-034 HT10; dùng lại `bang-viec.json` của R-FLOW-8 và `ScoreBar` của HT10)
> **Checklist công bố:** —
> **Trạng thái:** 🟡 **W0 tài liệu + bản mẫu 2026-11-11** — chờ chủ dự án duyệt D035-1..8, trả Q035-1..3.
> **Phụ trách:** **Thuy2k** (Nguyễn Văn Thủy) — người rà và đánh giá tiến độ theo HT11 mỗi tuần; làm B1..B6 cùng nhóm Lõi. Chủ dự án giao 2026-11-11.
> **Tệp:** [00 — Kế hoạch & thiết kế](00-MASTER-PLAN.md) · [40 — Checklist](40-MASTER-CHECKLIST.md) · [Bản mẫu](mockups/modules-muc-dat.html) · [Ảnh](evidence/)

## Đề bài (chủ dự án, 2026-11-11)

HT10 *Trụ cột & mức đạt* đã đo được **Core**: trụ cột, nền móng, cổng & bộ kiểm, bộ máy, công cụ dev, Policy Registry. Chưa có màn nào đo **phân hệ nghiệp vụ**: mua, kho (Inventory Engine, giá vốn), cấu hình & danh mục, bán, thu, chi, tổng hợp, thuế, tài sản, báo cáo, dashboard, bàn làm việc, công cụ kiểm.

Yêu cầu:
1. Màn **Modules & mức đạt** (HT11), **giống HT10**: mỗi phân hệ một thẻ, mức đạt theo bằng chứng, bảng tiêu chí có khoảng cách và việc tiếp.
2. **Rà soát, bảo đảm 100 % phân hệ** đều có mặt trên màn này.
3. **Tự động map**: Thuy2k hay bất kỳ ai làm một việc (sửa checklist, gộp PR) thì tiến độ phân hệ đó tự đổi, không nhập tay.
4. **Thuy2k** phụ trách: luôn review, đánh giá tiến độ theo màn này; các việc kho, giá vốn, mua hàng, danh mục đánh dấu Thuy2k làm.

## Trả lời ngắn

| Câu hỏi | Trả lời | Ở đâu |
|---|---|---|
| Đo bằng gì? | **Một sổ** `docs/standard/modules.json` (`bizcity_modules@1`): 12 phân hệ × 8 mặt (chứng từ · danh mục · lõi tính · báo cáo · bộ kiểm · bàn làm việc · tài liệu · API/SDK). Mỗi ô ghi **việc `S###-n`** nuôi nó, màn, phép kiểm, tài liệu. **Mức tự suy** từ trạng thái việc trong `bang-viec.json` (sinh từ checklist trên `main`), giống thẻ Bộ máy của HT10. Không có ô nhập (R-CONT-7) | [00 §3](00-MASTER-PLAN.md), D035-1..3 |
| Tự động map thế nào? | Mỗi việc trong checklist **gắn phân hệ**: phase khai `**Phân hệ:**` ở README (mặc định cho mọi việc của phase), dòng việc ghi đè bằng `{kho, mua-hang}` khi khác. `bang-viec.mjs` phát `modules[]` cho từng việc; HT11 gom theo (phân hệ, mặt). Việc không ghi phân hệ → phép kiểm **SC-MODS-2** báo; phân hệ có trong `apps/web/src/phan-he/*` mà thiếu trong sổ → **SC-MODS-1** trượt | D035-4, D035-5, R-FLOW-10 (đề xuất) |
| 100 % phân hệ là gồm gì? | M01 Danh mục & cấu hình · M02 Mua hàng · M03 Kho · Inventory Engine · giá vốn · M04 Bán hàng · POS · M05 Quỹ (thu, chi, ngân hàng) · M06 Chứng từ & định khoản · M07 Công nợ · M08 Tổng hợp (kết chuyển, khoá sổ, Bàn làm việc kế toán) · M09 Thuế · M10 Tài sản · M11 Báo cáo & dashboard · M12 Hệ thống & công cụ (trỏ HT10). Phủ đủ 10 thư mục `phan-he/` + ke-toan tách ba | [00 §2](00-MASTER-PLAN.md) |
| Thuy2k làm gì? | **Người rà** của HT11: mỗi thứ Hai mở HT11, ghi nhận xét vào checklist 40 của phase liên quan (không tích đạt); là người làm mặc định của M01..M04; cùng nhóm Lõi làm B1..B6 | D035-7, [00 §5](00-MASTER-PLAN.md) |
| Khác HT10 chỗ nào? | HT10 đo *Core bảo đảm điều gì*; HT11 đo *kế toán dùng được gì ở từng phân hệ*. Cùng `ScoreBar`, cùng bảng việc, cùng luật không tích tay. HT11 thêm cột **Người làm** và bộ lọc theo người | [00 §4](00-MASTER-PLAN.md) |
| Bản mẫu | [mockups/modules-muc-dat.html](mockups/modules-muc-dat.html): dải tổng (mọi phân hệ · nghiệp vụ · kế toán · phần Thuy2k · mặt chưa đạt), thẻ từng phân hệ, bảng 96 ô có lọc *chỉ mặt chưa đạt*, *người làm*, *ưu tiên*. Mở `#kho`, `#thuy2k` để vào thẳng | [evidence/](evidence/) |
| Làm theo thứ tự nào? | Bước thắng nhỏ: B1 sổ + gắn phân hệ vào bảng việc → B2 API → B3 màn HT11 → B4 phép kiểm phủ 100 % → B5 thẻ Việc hôm nay theo phân hệ → B6 hướng dẫn + nếp rà hằng tuần | [00 §6](00-MASTER-PLAN.md) |

## Hiện trạng đọc mã (`origin/main` `df6149ab`, 2026-11-11)

| Phần | Có | Thiếu |
|---|---|---|
| Bảng việc | `docs/phases/bang-viec.json` (`bizcity_task_board@1`): 554 việc, 7 cột, sinh từ 34 checklist (R-FLOW-8); `GET /system/engines` đã đọc nó để tính mức bộ máy | việc **không có trường phân hệ**; không nhìn được "kho đang bao nhiêu %" |
| Phân hệ | 10 thư mục `apps/web/src/phan-he/` (ban-hang, danh-muc, dev, he-thong, ke-toan, kho, mua-hang, quy, tai-san, thue), mỗi thư mục `menu.ts` có mã màn (`MH01..27`, `KHO01..05`, `ACC..`, `HT..`) | không sổ nào gom phân hệ × tiêu chí; `tru-cot.json` có `modules[]` trên tiêu chí nhưng theo trụ cột, không theo phân hệ |
| HT10 | `PillarsPage.tsx` năm thẻ, `Ht10Summary`, `ScoreBar`, `readiness.tsx`; sổ `tru-cot / nen-mong / bo-may / cong-kiem / cong-cu-dev.json`; mỗi sổ có `SC-*` giữ khớp repo | — |
| Người làm | CLAIMS.md có cột người giữ; checklist không có cột người | không lọc được "việc của Thuy2k" |
