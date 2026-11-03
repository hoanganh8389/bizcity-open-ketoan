---
name: build-pos-with-open-ketoan
description: Xây hoặc nối một app bán hàng (POS, bán lẻ, đơn online, ERP, CRM, kho) vào phần mềm kế toán open-ketoan qua cửa nạp chứng từ, đúng hợp đồng bizcity_ledger_intake@1, tới lúc thấy bút toán thật trong sổ. Dùng khi người dùng muốn POS / app bán hàng / ERP / CRM "đẩy đơn sang kế toán", "ghi sổ", "hạch toán tự động", "tích hợp open-ketoan", "send sales to accounting", "point of sale integration". Không dùng để sửa Kernel, luật định khoản hay hệ thống tài khoản.
---

<!-- [2026-11-03 02:40 PM Johnny Chu - Chu Hoàng Anh] G3-01 — skill build-pos-with-open-ketoan: small win 4 bước, app gửi sự việc, Kernel định khoản -->

# Xây app bán hàng ghi sổ qua open-ketoan

Bạn giúp dev nối app nghiệp vụ vào sổ kế toán. App **chỉ kể sự việc** (bán gì, bao nhiêu, thuế trên hoá đơn bao nhiêu, thu bằng gì). Kernel chọn tài khoản, định khoản, khoá kỳ, ghi sổ. Bạn không cần và **không được** nghĩ ra bút toán.

**Đọc trước:** skill [open-ketoan-standard](../open-ketoan-standard/SKILL.md) — sáu chuẩn C1…C6 mà mọi tích hợp phải đạt, và chỗ Kernel chưa có (FIFO, mã hàng có phiên bản, sản xuất).

## Luật cứng — vi phạm một điều là dừng, hỏi người dùng

1. **Không gửi, không sinh, không đoán số tài khoản** (511, 131, 1561, 3331…). Không có trường tài khoản nào trong khuôn nạp. Thấy mình định viết số tài khoản là đang sai.
2. **Không tự đặt thuế suất hay luật thuế.** Mã thuế lấy từ `GET /api/v1/tax-codes` của đơn vị. Tiền thuế là số **đã chốt trên hoá đơn** ở nguồn. Chưa biết mặt hàng chịu mã thuế nào thì hỏi người dùng, không suy từ tên hàng.
3. **Mã phải có trong danh mục**: chi nhánh, mã thuế, hình thức thanh toán, lý do. Đọc bằng API (bảng ở dưới). Không có thì nhờ kế toán khai, không tự bịa mã.
4. **`docKey` ổn định, không bao giờ đổi**, bắt đầu bằng tiền tố của app (`pos:<chi nhánh>:sale:<id đơn>`). Sửa đơn = gửi lại cùng `docKey`, `version + 1`. Không UPDATE, không xoá; huỷ đơn = `POST /api/v1/documents/cancel`.
5. **Mọi chứng từ qua `validate-accounting-event` trước khi nộp.** Chỉ báo "xong" khi lệnh kiểm ra `KẾT LUẬN: PASS` (có lớp L5).
6. **Lỗi xử lý theo mã.** Gặp mã nào thì chạy `explain-accounting-error` cho mã đó. Không thử lại lỗi có `retryable: false`. Không bắt lỗi rồi nuốt.
7. Không sửa test, ví dụ mẫu hay kết quả mong đợi cho "khớp". Không sửa gì trong `packages/kernel`, `packages/contracts`, `db/`.
8. **Một mặt hàng = một mã gửi sang sổ, suốt đời** (chuẩn C2). POS đổi mã nội bộ thì app giữ bảng ánh xạ và vẫn gửi mã cũ. Không dùng lại mã cho hàng khác.
9. **Không tự tính giá vốn**, bỏ trống `lines[].cost` (chuẩn C1). Giá vốn bình quân tháng do kế toán tính ở ACC49.

## Đọc trước, đúng thứ tự (đường dẫn trong repo open-ketoan)

1. `docs/api/01-quy-uoc.md` — xác thực, trường chung, kiểu tiền / ngày / mã.
2. Trang của đúng loại chứng từ: `docs/api/02-ban-hang.md`, `03-tra-hang-ban.md`, `11-thu-tien-khach.md`…
3. JSON mẫu đã được kiểm tự động: `docs/api/vi-du/<loại>.json`. Bắt đầu từ bản sao của tệp này, không viết khuôn từ trí nhớ.
4. `docs/api/09-danh-muc.md` — mã nào phải khớp danh mục.
5. Khuôn máy đọc: `docs/contracts/BIZCITY-LEDGER-INTAKE-v1.schema.json`.

Ở dự án khác repo open-ketoan, đường dẫn repo nằm trong `.bizcity/ketoan.json` (`repo`, `cli`) — do `npx bizcity skills install --to <dự án>` ghi.

## Nghiệp vụ POS → loại chứng từ

| Ở quầy xảy ra gì | `docType` | Trang | Ghi chú |
|---|---|---|---|
| Bán, xuất hoá đơn, thu tiền ngay | `sale` | 02 | `payments[]` mỗi hình thức một dòng; thiếu tiền = khách nợ |
| Khách trả hàng | `sale_return` | 03 | `originalDocKey` = docKey đơn gốc; số tiền **dương** |
| Khách trả nợ sau | `customer_payment` | 11 | phân bổ vào hoá đơn nợ |
| Nộp tiền quầy vào ngân hàng | `cash_transfer` | 10 | |
| Chuyển hàng giữa cửa hàng | `transfer` | 06 | |
| Kiểm kê lệch | `stock_adjustment` | 07 | bắt buộc lý do |
| Huỷ đơn đã gửi | — | 08 | `POST /api/v1/documents/cancel` có lý do |

Đơn chưa thanh toán / chưa giao (giỏ hàng, báo giá, đặt cọc chưa thu) **không** gửi sang sổ.

## Danh mục đọc ở đâu

| Cần | Gọi |
|---|---|
| Mã chi nhánh / cửa hàng | `GET /api/v1/branches` |
| Mã thuế + thuế suất | `GET /api/v1/tax-codes` |
| Hình thức thanh toán | `GET /api/v1/posting/payment-methods` |
| Lý do (để trống = mặc định của loại) | `GET /api/v1/posting/reasons` |

Gọi với header `X-Api-Key`. Lưu bản đọc làm bảng ánh xạ trong app; đừng chép cứng mã mẫu (`CN01`, `R08`, `TM`) vào code.

## Small win: 4 bước, đến lúc thấy bút toán thật

**① Chạy open-ketoan trên máy** (Docker, Git Bash trên Windows):

```bash
git clone https://github.com/hoanganh8389/bizcity-open-ketoan.git && cd bizcity-open-ketoan
bash scripts/cai-nhanh.sh          # giao diện + API: http://localhost:8088
```

**② Lấy khoá**: đăng nhập chủ đơn vị → màn Khoá API (HT02) → Tạo khoá, phạm vi **Gửi chứng từ** + **Đọc báo cáo, sổ sách**. Khoá hiện một lần. Đặt vào biến môi trường, không dán vào code hay chat:

```bash
export BIZCITY_SERVER=http://localhost:8088
export BIZCITY_API_KEY=...        # người dùng tự dán
```

**③ Một đơn thành một chứng từ, kiểm tới L5** — mẫu chạy được ngay: `examples/pos-mini/` (không cần cài gói).

```bash
node examples/pos-mini/pos-mini.mjs --catalog                                              # mã thật của đơn vị → sửa cau-hinh.json
node examples/pos-mini/pos-mini.mjs examples/pos-mini/don-mau.json --out build/don-1.json   # giỏ hàng → chứng từ sale
npx bizcity event check build/don-1.json                                                     # khuôn → tiền kiểm → định khoản thử
```

FAIL → làm theo skill `validate-accounting-event` cho tới PASS. Bảng "Bút toán Kernel dựng" là small win đầu tiên: dev thấy Nợ / Có đúng chuẩn mà không viết dòng kế toán nào.

**④ Nộp thật và nhìn sổ:**

```bash
npx bizcity event check build/don-1.json --submit
```

`posted` = đã vào sổ (xem màn Sổ cái, Nhật ký bán hàng). `pending` = đơn vị đặt chế độ duyệt; kế toán duyệt ở màn Định khoản tự động (ACC14). Cả hai đều đúng, báo cho người dùng biết là trường hợp nào.

## Viết code tích hợp trong app của người dùng

- Một hàm thuần `toDocument(order) → document`, có test với ít nhất: đơn có hoá đơn thuế, đơn nhiều hình thức thanh toán, đơn có quà tặng (`isGift`), đơn trả lại. Mẫu: `examples/pos-mini/pos-mini.mjs`.
- Số tiền trên chứng từ lấy từ hoá đơn đã chốt của POS. `totals` = cộng các dòng tới đồng (`IN-SUM-001/005/006`).
- Gửi bằng `POST /api/v1/documents/submit` kèm `Idempotency-Key` = `<docKey>:v<version>`; lưu `meta.receipt` vào đơn.
- Hàng đợi gửi lại cho lỗi mạng và mã `retryable: true`. Lỗi `retryable: false` → đánh dấu đơn "cần xử lý", hiện mã và lời giải thích.
- Muốn biết khi nào sổ đã ghi: nghe webhook `bizcity.ledger.entry.posted` (`docs/api/ung-dung.md` §3).

## Sau khi nộp một chuỗi thật: kiểm luồng

Nộp nhập mua → bán → trả hàng cho cùng một mã, rồi:

```bash
npx bizcity flow check --sku SUA400 --period 2026-11
```

Theo skill [check-accounting-flow](../check-accounting-flow/SKILL.md). C1.3 / C1.4 FAIL vì chưa tính giá vốn là việc của kế toán, không phải lỗi app.

## Báo cáo khi xong

```text
App: <tên> · loại chứng từ: <sale, …> · đơn vị: <mã>
event check: <PASS | FAIL | SKIP> — L1 … · L2 … · L1–L4 … · L5 …
Nộp: <posted | pending | chưa nộp> · docKey <…> v<…>
Mã còn lại: <mã + một dòng explain, hoặc "không">
Việc của kế toán: <khai danh mục / duyệt ACC14 / tính giá vốn ACC49 / không>
flow check: <PASS | FAIL | SKIP> — mã <…> kỳ <…>
Sáu chuẩn: bảng ở cuối skill open-ketoan-standard
```

Không báo "đã tích hợp xong" khi `event check` còn SKIP ở L5.
