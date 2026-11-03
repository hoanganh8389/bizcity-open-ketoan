---
name: contribute-production-module
description: Hướng dẫn developer và cộng đồng mở "cổng sản xuất" (MRP) của open-ketoan — xuất nguyên vật liệu cho sản xuất, nhập kho thành phẩm, tập hợp chi phí và tính giá thành — đúng quy trình đóng góp vào lõi kế toán, không lách ở app. Dùng khi ai đó muốn xây MRP / quản lý sản xuất ghi được vào sổ, gặp thông báo "Cổng Sản xuất / MRP: đã giữ chỗ, Kernel chưa mở", hoặc muốn đóng góp chứng từ sản xuất, giá thành, BOM cho repo. Từ khoá: MRP, sản xuất, production, giá thành, BOM, định mức, thành phẩm, dở dang, WIP, contribute.
---

<!-- [2026-11-03 05:55 PM Johnny Chu - Chu Hoàng Anh] G3-01 — quyết định chủ dự án 2026-11-03: chứng từ sản xuất để sẵn cổng, Nhóm Lõi không làm; skill này giao cho dev và cộng đồng phát triển tiếp -->

# Mở cổng sản xuất (MRP) cho open-ketoan

**Đọc trước:** [open-ketoan-standard](../open-ketoan-standard/SKILL.md). Sản xuất chạm cả sáu chuẩn, nặng nhất C1 (giá vốn thành phẩm) và C2 (thành phẩm, nguyên vật liệu, BOM có phiên bản).

## Trạng thái cổng

| | |
|---|---|
| Quyết định | Chủ dự án 2026-11-03: **giữ chỗ cổng, Nhóm Lõi không làm**. Cộng đồng làm theo skill này, Nhóm Lõi duyệt. |
| Đã có | `packages/cli/lib/gates.mjs` giữ chỗ ba tên chứng từ đề xuất: `production_issue` (xuất nguyên vật liệu cho sản xuất), `production_receipt` (nhập kho thành phẩm), `production_cost_close` (tập hợp chi phí, tính giá thành kỳ). `event check` gặp các tên này trả **SKIP "cổng chưa mở"** và chỉ về đây. |
| Chưa có | Khuôn chứng từ trong hợp đồng nạp, luật định khoản, luật giá thành, ca F22, màn của kế toán. Tên ở trên **chưa thuộc hợp đồng**: có thể đổi trong ADR. |
| App hôm nay | Mua nguyên vật liệu gửi `purchase`, bán thành phẩm gửi `sale`. Lệnh sản xuất, BOM, tiến độ giữ ở app. Kế toán tự ghi phần sản xuất trên màn. |
| Cấm | Lách bằng `stock_adjustment` (Kernel ghi vào thừa / thiếu chờ xử lý, giá vốn thành phẩm bằng 0) hay bằng `manual_journal` do app sinh (app thành nơi định khoản, vi phạm C3). |

## Vì sao không chỉ thêm một docType

Một phiếu xuất nguyên vật liệu đúng một mình chưa có nghĩa. Cổng sản xuất phải nối được cả vòng đời:

```
mua NVL → kho NVL → xuất cho lệnh sản xuất → chi phí dở dang (qua nhiều kỳ)
        → nhập kho thành phẩm (giá thành) → bán → giá vốn → lãi lỗ → kết chuyển, khoá kỳ
```

Mỗi mũi tên là một chỗ dễ đứt. Ví dụ: thành phẩm nhập kho giá 0, dở dang cuối kỳ không chuyển sang kỳ sau, BOM đổi giữa kỳ làm lệch định mức, phế liệu nhập lại kho không có giá.

## Quy trình đóng góp, 4 bước

1. **ADR trước code.** Viết `docs/adr/ADR-00xx-chung-tu-san-xuat.md` theo khuôn các ADR có sẵn (Bối cảnh · Quyết định · Hệ quả · Phương án đã cân nhắc). ADR phải trả lời đủ các câu ở mục "Câu hỏi thiết kế". Nhóm Lõi và một kế toán trưởng duyệt. Chưa duyệt thì không mở PR code.
2. **Hợp đồng.** Thêm khuôn chứng từ vào `packages/contracts` (cùng chỗ với các `docType` khác), tăng phiên bản khuôn nạp, thêm mã phát hiện `IN-*` mới vào `FINDINGS_LIBRARY` kèm `INTAKE_REMEDIES` (bước sửa, ai sửa, việc cấm, kiểm lại). Viết trang `docs/api/<loại>.md` và JSON mẫu `docs/api/vi-du/`. Gỡ tên khỏi `RESERVED_GATES` trong `packages/cli/lib/gates.mjs` khi khuôn đã vào hợp đồng.
3. **Kernel.** Luật định khoản mới theo khuôn `packages/kernel/src/modules/posting/rules/*.rule.ts`. Tài khoản lấy qua `AccountResolver` và gói định khoản (TT99/2025), **không viết số tài khoản trong luật**. Gói định khoản có kế toán trưởng ký duyệt. Giá thành chạy trong dịch vụ tính giá (cùng họ với Tính giá vốn ACC49), là việc kế toán bấm trên màn, không phải việc app gọi.
4. **Kiểm và bằng chứng.**
   - Thêm ca vào `FAULT_CATALOG` (F22) cho các lỗi vòng đời ở mục dưới, mỗi ca có detector.
   - Test luật định khoản: Nợ = Có, đảo đúng khi `version + 1`.
   - Chạy `node tests/conformance/selfcheck.mjs --lane selfcheck`.
   - Chạy `npx bizcity flow check --sku <NVL> --period … --to …` và `--sku <thành phẩm>` trên dữ liệu mẫu: phải PASS mọi dòng trừ C2.

## Câu hỏi thiết kế ADR phải trả lời

| Câu hỏi | Vì sao |
|---|---|
| Lệnh sản xuất là gì trong sổ: chứng từ nguồn hay đối tượng tập hợp chi phí? `docKey` của nó do ai cấp? | Xuất NVL, nhập thành phẩm, tập hợp chi phí phải trỏ về cùng một lệnh (C4). |
| BOM / định mức có phiên bản thế nào, bám ADR-0018 ra sao? Lệnh sản xuất chụp phiên bản BOM nào? | Đổi BOM giữa kỳ không được viết lại giá thành đã tính (C2, C4). |
| Thành phẩm và NVL nhận diện bằng gì? | Sổ và giá vốn đã theo `item_id` (0066, PHASE-024 G2) <!-- [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-1: trạng thái item_id theo main (giá vốn theo item_id từ G2) -->; cổng sản xuất nhận diện theo `item_id`, nên đi sau S024-11 (API nhận `itemId`), hoặc ADR phải nói rõ cách chuyển đổi về sau (C2). |
| Phương pháp giá thành (giản đơn, hệ số, tỷ lệ, định mức…) là chính sách đơn vị chọn, lưu ở đâu, đổi giữa năm thế nào? | Giống phương pháp giá vốn: là chính sách kế toán, không phải tham số của app (C1). |
| Dở dang cuối kỳ đánh giá thế nào, chuyển kỳ sau thế nào? | Vòng đời qua nhiều kỳ: dở dang cuối kỳ trước = đầu kỳ sau. |
| Phế liệu, sản phẩm hỏng, sản phẩm phụ, NVL dùng thừa nhập lại? | Mỗi loại cần lý do (`reasonCode`) có trong danh mục, không để app chọn tài khoản. |
| Nhập thành phẩm trước khi tính giá thành thì giá tạm là gì, điều chỉnh ra sao khi có giá thật? | Tránh thành phẩm giá 0 và giá vốn bán ra bằng 0 (F22-STK-07). |
| Khoá kỳ cần thêm mục kiểm nào (`/api/v1/periods/check`)? | Chưa tính giá thành, dở dang chưa chốt thì không khoá kỳ được (C5). |

## Lỗi vòng đời cần ca F22 (tối thiểu)

- Có xuất NVL cho lệnh mà kỳ không có nhập thành phẩm, cũng không có dở dang cuối kỳ.
- Nhập kho thành phẩm giá 0 khi lệnh đã có chi phí.
- Dở dang cuối kỳ trước khác dở dang đầu kỳ sau.
- Tính lại giá thành sau khi đã kết chuyển (cùng họ F22-STK-03).
- Lệnh sản xuất dùng phiên bản BOM hết hiệu lực tại ngày chứng từ.
- Phiếu điều chỉnh kho cho NVL / thành phẩm trùng ngày với lệnh sản xuất (dấu hiệu lách cổng).

## Không làm

- Không mở cổng bằng cách bỏ tên khỏi `RESERVED_GATES` mà chưa có khuôn trong hợp đồng.
- Không tự chọn phương pháp giá thành cho đơn vị, không cố định trong mã.
- Không viết số tài khoản vào app, luật hay test (test đọc tài khoản từ gói định khoản).
- Không ghép giá thành vào app MRP rồi gửi `cost`: sổ sẽ có hai nguồn giá thành.
