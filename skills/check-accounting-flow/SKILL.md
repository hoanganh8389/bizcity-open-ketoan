---
name: check-accounting-flow
description: Kiểm một mặt hàng có liền mạch mua → kho → bán → giá vốn → lãi lỗ → đóng kỳ trong sổ open-ketoan không, bằng báo cáo thật của đơn vị (sổ chi tiết hàng, đơn giá vốn tháng, lãi gộp, bảng kiểm khoá kỳ). Dùng sau khi app đã nộp một chuỗi chứng từ thật, khi tồn kho âm, giá vốn bằng 0, lãi gộp sai, trước khi đóng kỳ, và khi người dùng hỏi "app của tôi đã liền mạch tới lãi lỗ chưa". Từ khoá: inventory flow, giá vốn, COGS, lãi gộp, gross profit, đóng kỳ, kết chuyển, tồn âm.
---

<!-- [2026-11-03 04:35 PM Johnny Chu - Chu Hoàng Anh] G3-01 — skill check-accounting-flow: đọc luồng một mặt hàng qua báo cáo thật, chuẩn C1, C2, C5 -->

# Kiểm luồng mua → kho → bán → giá vốn → lãi lỗ

Một chứng từ đúng (skill validate-accounting-event) chưa đủ. Chuỗi chứng từ còn phải nối được với nhau để ra giá vốn và lãi lỗ. Lệnh này đọc số Kernel đã ghi, không tính lại gì. Chuẩn nền: [open-ketoan-standard](../open-ketoan-standard/SKILL.md) C1, C2, C5.

## Lệnh

```bash
npx bizcity flow check --sku <mã hàng> --period YYYY-MM [--to YYYY-MM] [--branch <mã chi nhánh>] [--json]
```

<!-- [2026-11-03 06:05 PM Johnny Chu - Chu Hoàng Anh] G3-01 — kiểm vòng đời nhiều kỳ (--to) theo chỉ đạo chủ dự án: kiểm cả vòng đời, không chỉ từng giao dịch -->

`--to` kiểm **vòng đời**: chạy từng kỳ từ `--period` tới `--to` (tối đa 24 kỳ), rồi kiểm tồn cuối kỳ trước bằng tồn đầu kỳ sau (dòng L1). Dùng khi báo cáo cho kế toán trưởng, trước khi khoá năm, sau khi đổi mã hàng hay sửa chứng từ kỳ cũ.

Cần `BIZCITY_SERVER` + `BIZCITY_API_KEY`, khoá có phạm vi **Đọc báo cáo, sổ sách**. Chưa `npm install` thì `node packages/cli/bin/bizcity.mjs flow check …`. Mã thoát: `0` PASS · `1` FAIL · `2` SKIP / lỗi dùng lệnh.

## Các dòng

| Dòng | Hỏi | Đọc từ | FAIL nghĩa là |
|---|---|---|---|
| C1.1 | Có hàng vào trước khi ra? | sổ chi tiết hàng | bán mà kỳ không có nhập, tồn đầu ≤ 0: thiếu phiếu nhập mua hoặc tồn đầu kỳ |
| C1.2 | Tồn không âm theo ngày? | sổ chi tiết hàng | phiếu nhập gửi trễ ngày, hoặc nhập sai kho / chi nhánh |
| C1.3 | Dòng xuất có giá vốn? | sổ chi tiết hàng + bảng đơn giá vốn tháng | kế toán chưa tính giá vốn tháng (ACC49), hoặc tháng có nhập về sau khi đã tính |
| C1.4 | Lãi gộp tính được? | báo cáo lãi gộp | còn dòng bán chưa có giá vốn: lợi nhuận đang thiếu chi phí |
| C1.5 | Sổ kho khớp sổ cái? | đối chiếu `GET /api/v1/inventory/reconcile` | giá trị tồn theo sổ chi tiết ≠ số dư tài khoản hàng tồn kho: có bút toán tay vào tài khoản kho, hàng ghi vào tài khoản kho khác nhóm hạch toán, hoặc ngày hạch toán lệch ngày chứng từ. SKIP khi còn dòng chưa định giá. Toàn đơn vị: tự chẩn đoán `INVENTORY_LEDGER_MISMATCH` (F22-STK-11) |
| C5 | Sẵn sàng đóng kỳ? | bảng kiểm trước khoá kỳ | còn việc trước khoá: chứng từ lỗi, chưa tính giá vốn, chưa kết chuyển, kết chuyển lỗi thời… kèm bước sửa và màn |
| L1 | Tồn chuyển kỳ liền mạch? (chỉ với `--to`) | sổ chi tiết hàng hai kỳ liền nhau | cuối kỳ trước ≠ đầu kỳ sau: chứng từ kỳ trước sửa / nhập về sau khi đã chốt số (F22-STK-04), hoặc mã hàng đổi giữa chừng |
| C2 | Định danh hàng giữ nguyên? | — | luôn SKIP hôm nay: sổ và giá vốn đã theo `item_id`, nhưng chưa có thao tác đổi mã / gộp mã, API chưa nhận / trả `itemId` (PHASE-024 S024-11) <!-- [2026-11-04 12:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-1: trạng thái item_id theo main (giá vốn theo item_id từ G2) --> |

## Làm gì với kết quả

1. **Phân biệt việc của app và việc của kế toán.** C1.1, C1.2 FAIL thường là app: thiếu phiếu nhập, sai ngày, sai kho, đổi mã hàng giữa chừng. Sửa ở app, gửi bổ sung chứng từ, chạy lại. C1.3, C1.4, C1.5, C5 FAIL thường là kế toán (C1.5: đọc toàn đơn vị bằng `GET /api/v1/inventory/reconcile?period=…`, dòng `no_product` là bút toán vào tài khoản kho không gắn mặt hàng): tính giá vốn, kết chuyển, xử lý chứng từ lỗi. Đưa nguyên các dòng "•" và "–" mà lệnh in cho người dùng; không tự gọi API tính giá vốn hay khoá kỳ.
2. **Mã đi kèm** (`F22-STK-01`, `INVENTORY_NEGATIVE`, `F22-STK-02`…): chạy `npx bizcity explain <MÃ> --role chief_accountant` để có hậu quả và phương án theo vai.
3. **Tồn âm vì nhập trễ:** sửa ngày của phiếu nhập ở nguồn rồi gửi `version + 1`. Không gửi thêm phiếu điều chỉnh tăng để bù: đó là che lỗi, sổ sẽ có hàng thừa không có nguồn.
4. **Người dùng hỏi FIFO:** lệnh in phương pháp giá vốn mặc định (bình quân gia quyền tháng). FIFO có trong lộ trình, Kernel chưa thi hành — xem chuẩn C1. Không tự tính FIFO.
5. **L1 FAIL:** tìm chứng từ kỳ trước có `version` mới hoặc ngày nhập sau ngày tính giá vốn; hỏi người dùng có đổi mã hàng không. Không gửi điều chỉnh để làm khớp số.
6. Chạy lại tới khi không còn FAIL. C2 SKIP là trạng thái thật của Kernel, ghi nguyên vào báo cáo.

## Chọn mặt hàng để kiểm

Tối thiểu: một mã bán chạy, một mã có hàng tặng, một mã có trả hàng, một mã chuyển kho. Mỗi mã một lần chạy, cùng kỳ.

## Báo cáo

```text
Kỳ YYYY-MM · mã: <…>
C1.1 … · C1.2 … · C1.3 … · C1.4 … · C1.5 … · C5 … · L1 … (nếu --to) · C2 SKIP (chưa có thao tác đổi mã)
Việc của app: <…> · Việc của kế toán: <…>
```
