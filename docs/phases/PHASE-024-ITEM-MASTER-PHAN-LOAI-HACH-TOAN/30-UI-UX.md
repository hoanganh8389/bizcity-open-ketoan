# PHASE-024 · 30 — UI / UX: trang Quy định dữ liệu hàng hoá, thẻ mặt hàng, validator, trace
<!-- [2026-11-02 09:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — UI / UX: HT09 Quy định, thẻ mặt hàng bốn khối, validator trong form, trace một dòng sổ về nguồn -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Bản mẫu bấm thử: [mockups/item-master.html](mockups/item-master.html) (mở bằng trình duyệt, không cần máy chủ).
> Mục tiêu dùng (chủ dự án): *"Người dùng nhìn là hiểu smallwin ngay và tôn trọng, sử dụng, nắm bắt được việc cấu hình thiếu ở đâu, hướng dẫn và fix nhanh từ bản chất gốc."*

## 1. Bốn màn, một khuôn

| Màn | Trả lời câu gì | Ở đâu |
|---|---|---|
| **Quy định dữ liệu hàng hoá** (HT09) | "Hệ thống bảo vệ sổ của tôi bằng luật nào, và đơn vị tôi đang đạt / thiếu ở nguyên tắc nào?" | Hệ thống → Quy định dữ liệu hàng hoá; link từ Bàn đánh giá (HT08), Kiểm chuẩn (HT06) |
| **Thẻ mặt hàng** | "Mặt hàng này là gì, mã nào, hạch toán ra sao, đang thiếu gì, dùng ở đâu?" | ngăn bên phải ở danh mục mặt hàng (DM), ô chọn mặt hàng ở phiếu (chạm / di chuột → lớp 1), từ dòng sổ, từ cảnh báo |
| **Validator trong form** | "Ghi được chưa? thiếu gì?" | form thêm / sửa mặt hàng, form biến thể, nhập Excel |
| **Trace** | "Dòng sổ này ra từ đâu, qua những bước nào, dùng chế độ nào?" | từ một dòng sổ cái / sổ kho / thẻ mặt hàng; mở Bàn điều tra khi có `traceId` |

Khuôn chung với [thẻ tài khoản (PHASE-023)](../PHASE-023-THE-TAI-KHOAN/30-UI-UX.md): **Một câu → Bản chất → Số của đơn vị → Thiếu gì / Sửa**. Người dùng học cùng một cách đọc ở cả hai nơi.

## 2. Trang Quy định (HT09)

```text
┌ Quy định dữ liệu hàng hoá ─────────────────────────────────────────────────────── HT09 ┐
│ "Định danh hàng hoá bất biến. Mã hàng có phiên bản. Sổ đã ghi không đổi theo danh mục."   │
│ Bất biến R-ITEM-0 · ADR-0017 · được bảo vệ bằng trigger + DG-ITEM-1/3/4 + SC-ITEM-1..3     │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ Tình trạng đơn vị (lượt kiểm 01:00 hôm nay)      ✔ 4 đạt   ⚠ 1 cần làm   ✘ 1 lỗi            │
├─ Sáu nguyên tắc ───────────────────────────────────────────────────────────────────────┤
│ ✔ 1  Định danh duy nhất          1.284 mặt hàng, 1.284 item_id · 0 mã trùng (DG-ITEM-1)  [Xem] │
│ ✔ 2  Phân cấp không làm khoá     cây 4 cấp · 0 bảng sổ trỏ mã (SC-ITEM-2)                       │
│ ✔ 3  Biến thể tồn riêng          96 biến thể / 31 cha · 0 trùng (DG-ITEM-5)                      │
│ ⚠ 4  Tài khoản từ chính sách     17 mặt hàng CHƯA PHÂN LOẠI có phát sinh tháng này (DG-ITEM-2)  │
│      ┌ VÌ SAO  17 mã đang định khoản bằng nhóm mặc định "HH" → 156 / 632 / 5111. Nếu trong đó    │
│      │         có dịch vụ hay CCDC thì giá vốn, tồn kho, báo cáo sai.                              │
│      │ SỬA     ① Mở danh sách 17 mã [Mở →]  ② Chọn loại + nhóm hạch toán, ngày hiệu lực          │
│      │         ③ Kiểm lại [DG-ITEM-2]   ✗ Không tắt cảnh báo bằng cách bật fallback mãi mãi       │
│      └ Ai làm: kế toán kho (phân loại), kế toán trưởng (nhóm hạch toán)                           │
│ ✔ 5  Lịch sử không bị viết lại    12 lần đổi mã, 2 lần gộp trong năm · 0 dòng sổ đổi (DG-ITEM-3)  │
│ ✘ 6  Dữ liệu ngoài qua validation  POS "pos-cn02" gửi 41 mã lạ / 7 ngày (IN-ITEM-001) → bể chờ    │
│      ┌ VÌ SAO  nguồn tạo mã mới mà chưa khai ở danh mục; auto_create đang TẮT nên sổ an toàn      │
│      │ SỬA     ① Mở Trạm tiền kiểm, lọc IN-ITEM-001, nguồn pos-cn02 [Mở →]                         │
│      │         ② Tạo mặt hàng từ dòng (điền sẵn) hoặc thêm mã vào mặt hàng có sẵn                │
│      │         ③ Báo đội POS đồng bộ danh mục theo bizcity_item_master@1 [Hướng dẫn →]            │
│      └ Kiểm lại [IN-ITEM-001 / 7 ngày]                                                          │
├─ Cấu hình liên quan ──────────────────────────────────────────────────────────────────┤
│ bizcity.item.auto_create = tắt · bizcity.item.default_group_fallback = BẬT (từ 15/10) · SKU_RULE = ngành(2)+nhãn(3)+nhóm(1)+số(3) │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

Luật của màn: mỗi nguyên tắc có **cách kiểm** (mã DG / SC / trigger) và **số thật của đơn vị**; dòng không đạt mở bốn khối Hiện tượng · Vì sao · Sửa · Kiểm lại theo `bizcity_remedy@1`; không nút "bỏ qua"; không số tiền (R-DIAG-6).

## 3. Thẻ mặt hàng

```text
┌ SUA01 · Sữa tươi tiệt trùng 1L ───────────────────────────────────────── item 01JBX…K7 ┐
│ MỘT CÂU   Hàng hoá mua về bán lại, theo dõi tồn theo lô và hạn; ĐVT gốc: hộp (thùng ×12)     │
├ ĐỊNH DANH & MÃ ──────────────────────────────────────────────────────────────────────────┤
│ item_id 01JBX3F8Q9W2KD5M7T0R4H6K7  (bất biến)                                              │
│ sku     SUA01      01/01/2025 → nay        ◀ hiện hành                                      │
│ sku     SUA-1L     01/01/2023 → 31/12/2024 (đổi mã 02/01/2025, Nguyễn A, "chuẩn hoá mã")   │
│ barcode 8934673…   01/01/2023 → nay                                                        │
│ external:pos-cn02  "SP000912"  01/03/2025 → nay                                           │
│ [Đổi mã] [Thêm mã ngoài] [Gộp vào mã khác…]                                                │
├ HẠCH TOÁN (tại ngày 02/11/2026, chế độ v3 hiệu lực 01/10/2026) ──────────────────────────┤
│ Loại: hàng hoá · Nhóm: HH-THUC-PHAM → kho 1561 · giá vốn 632 · doanh thu 51111 · CK 5211  │
│ Thuế ra V08 (1/7/2025 giảm 8%) · thuế vào V08 · không TTĐB                                 │
│ Lịch sử: v2 (01/01/2025) nhóm HH · v3 (01/10/2026) HH-THUC-PHAM — chứng từ trước 01/10 giữ v2 │
│ [Thẻ TK 1561] [Thẻ TK 632] [Phân loại lại từ ngày…]                                        │
├ SỐ CỦA ĐƠN VỊ ───────────────────────────────────────────────────────────────────────────┤
│ Tồn 02/11: 1.284 hộp (3 kho) · giá vốn T10: có (tính 01/11 01:05) · 312 dòng sổ 12 tháng  │
│ Sổ kho 1561 = sổ cái 1561 cho mã này: khớp (STOCK_LEDGER_MATCH)                            │
├ KIỂM ────────────────────────────────────────────────────────────────────────────────────┤
│ ⚠ IN-ITEM-006  3 phiếu bán tháng 10 đánh dấu hàng tặng nhưng loại là "hàng hoá", lý do XB   │
│    Vì sao: giá vốn hàng tặng không vào chi phí KM (641) mà vào 632 → lãi gộp sai.           │
│    Sửa: ① mở 3 phiếu [→] ② chọn lý do XKM (có cờ khuyến mại) hoặc tách mã quà (loại gift)   │
│ ✔ ĐVT đủ · ✔ mã không trùng · ✔ phân loại có                                                  │
│ [Trace một dòng sổ…]                                                                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

Ba lớp hiển thị tuỳ chỗ:
- **Lớp 1** (ô chọn mặt hàng, di chuột / chạm): một câu + nhãn `hàng hoá` / `dịch vụ` / `CCDC`… + nhãn `chưa phân loại` đỏ nếu có.
- **Lớp 2** (ngăn bên phải danh mục): đủ thẻ như trên.
- **Lớp 3** (trang riêng `/danh-muc/mat-hang/<item_id>`): thêm cây biến thể, bảng giá, ĐVT, lịch sử đầy đủ.

## 4. Validator trong form mặt hàng

Dùng chung khung "Vì sao" bốn mức (nhắc · hướng dẫn · cảnh báo mềm · chặn) của [PHASE-023 · 20](../PHASE-023-THE-TAI-KHOAN/20-VALIDATOR-MEM.md); mặt hàng là entity đầu tiên có `core.item.validate`. <!-- [2026-11-02 10:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — nối validator mềm -->

- Khi gõ mã: quy tắc mã của đơn vị gợi ý phân loại (từ `skuInfo`) — hiện dưới dạng **gợi ý có thể bỏ**, không tự áp (R-ITEM-4).
- Trước nút Ghi: khối "Kiểm" liệt kê phát hiện `IN-ITEM-*` cho item này (ĐVT thiếu, mã trùng, chưa phân loại, biến thể trùng thuộc tính), mỗi dòng có nút sửa ngay trong form. Block → nút Ghi mờ với lý do; warn → ghi được, phát hiện còn hiện ở thẻ.
- Nhập Excel: cột kết quả theo dòng với mã IN-ITEM-*; dòng block không nhập, dòng warn nhập và đánh dấu.
- Đổi mã: hộp thoại hỏi **ngày hiệu lực** (mặc định hôm nay), hiện "sổ không đổi; chứng từ ngày < ngày hiệu lực vẫn tra được mã cũ".
- Gộp mã: xem trước bắt buộc — tồn hai item, số dòng sổ mỗi bên, "0 dòng sổ sẽ thay đổi", cảnh báo nếu phân loại hai bên khác nhau.

## 5. Trace một dòng sổ về nguồn

```text
Dòng sổ BT26-0012345 / 3  Nợ 632 1.250.000  SUA01 (item 01JBX…K7)
  ① Nguồn      pos-cn02 · chứng từ pos:CN02:HD-00912 v1 · nhận 12/10/2026 09:14:03 · traceId 4f2a…  [Bàn điều tra →]
  ② Tiền kiểm  L1 ✔ L2 ✔ L3 ✔ (resolve: external SP000912 → SUA01, 2 ms) L4 ✔ L5 ✔ · 0 phát hiện
  ③ Sự việc    accounting_events #88213 · posted_version 1
  ④ Luật       sale.rule · lý do XB (mặc định sale) · phân loại v2 (HH) → nhóm HH → 632 / 1561 · chế độ v2
  ⑤ Sổ         bút toán BT26-0012345 · dòng giá vốn chờ → ghi đè bởi costing T10 (01/11 01:05): 1.250.000
  ⑥ Sự kiện    bizcity.ledger.entry.posted → 2 subscriber ✔
  ⑦ Kiểm       DG-ITEM-3 ✔ (item_id khớp mã tại 12/10) · STOCK_LEDGER_MATCH ✔
```

Mỗi bước là một dòng có thời điểm, kết quả, và link mở đúng màn (chứng từ, trạm, chính sách, bút toán, Bàn điều tra). Người dùng thấy **chính chuỗi §3 của master plan** trên dữ liệu của mình — đó là cách dạy chuỗi mà không cần tài liệu.

## 6. Ngôn ngữ

- Nói "mặt hàng", "mã hàng", "định danh"; `item_id` hiện ở dạng rút gọn `01JBX…K7`, chép đủ khi bấm.
- Không dùng "SKU" một mình trong câu tiếng Việt — "mã hàng (sku)".
- Mỗi cảnh báo có đủ ba phần: hiện tượng, vì sao sổ sai, sửa ở đâu (R-FIX).
