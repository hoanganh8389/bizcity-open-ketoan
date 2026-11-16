# NT-BH-020 · Tích điểm thành viên ở máy bán: sổ điểm ở phần mềm kế toán
<!-- [2026-11-15 09:35 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: tích điểm / voucher máy bán còn chạy dữ liệu giả (đóng góp) -->
<!-- [2026-11-15 10:45 AM Võ Hoàng] NGHIEM-THU — chốt Q1–Q4: điểm chỉ hạch toán lúc đổi (đóng góp) -->
<!-- [2026-11-15 03:00 PM Võ Hoàng] NGHIEM-THU — chia ba bước, số liệu bước 1, cách làm (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module mới `loyalty` (sổ điểm) + module `pos` (đổi điểm, bước 2) |
| Màn hình | Máy bán POS React: khách → điểm, hạng; đổi điểm lấy quà / voucher; nhập mã voucher |
| Bộ phận yêu cầu | Kế toán, kinh doanh (CRM) |
| Ngày tạo | 15/11/2026 |
| Trạng thái | Bước 1: Chờ nghiệm thu (kiểm 1, 3) · Bước 2, 3: Đã chốt, chưa làm |

## 1. Mục đích quản trị
Phòng kế toán yêu cầu 4 việc: liên kết quản lý khách (CRM), **hạch toán / định khoản** điểm, quản lý quy đổi điểm ra quà, báo cáo đầy đủ. Hiện máy bán React hiện điểm / voucher bằng dữ liệu giả (không ghi sổ). Đợt này: sổ điểm thật — mỗi lần tích / đổi / hết hạn / điều chỉnh / hoàn là một dòng, lô điểm có hạn, đổi trừ lô cũ trước.

## 2. Khai báo trước
- Chính sách tích điểm (4 loại tích, hạng + hệ số), danh mục quà / voucher theo hạng — ở `tgs_loyalty_points` (đã có bộ tính ở máy bán, đối chiếu khớp engine PHP 14 chính sách × 400 đơn).
- Tài khoản theo dõi nghĩa vụ điểm (nếu hạch toán — Q1).

## 3. Các bước thao tác
1. Bán cho khách thành viên → đơn ghi sổ thì điểm **tự tích** theo chính sách.
2. Khách đổi điểm lấy quà / voucher ở quầy → điểm trừ lô cũ trước; quà ra dòng 0đ (bill Z nếu mã Z — NT-BH-019).
3. Trả hàng → điểm đã tích của phần trả **tự hoàn**.
4. Cuối ngày: lô hết hạn tự ghi dòng hết hạn.

## 4. Số liệu đầu vào (bước 1)

Cửa hàng `CN01`. Chính sách website đẩy sang: `TICH10K` (loại 1: 1 điểm / 10.000đ, hạn 365 ngày), `THUONG1TR` (loại 4: đơn từ 1.000.000đ thưởng 20 điểm); hạng thành viên ×1, bạc từ 1.000 điểm ×1,2, vàng từ 5.000 điểm ×1,5; bật nhân hạng. Khách `0901234567`.

| Tình huống | Kết quả |
|---|---|
| Đơn 325.000 | +32 điểm (lô hạn +365 ngày), số dư 32, hạng thành viên |
| Đơn 1.300.000 | +150 điểm (130 + thưởng 20), số dư 182 |
| Trả 650.000 của đơn 1.300.000 | −75 điểm (150 × 650.000 / 1.300.000, làm tròn xuống), số dư 107 |
| Sự kiện giao lại / đơn đổi phiên bản | không thêm dòng |
| Khách lẻ, đơn chờ thanh toán | không tích (đơn QR tích khi xác nhận tiền) |

## 5. Kết quả mong đợi (tóm tắt)

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Tích | đơn 325.000 → điểm theo chính sách; số dư khách tăng; một dòng sổ điểm nối đơn |
| 2 | Đổi | đổi 100 điểm lấy voucher 50.000 → trừ lô cũ trước; voucher dùng được một lần ở đơn sau |
| 3 | Trả hàng | hoàn điểm đúng phần trả; điểm âm không được phép |
| 4 | Hết hạn | lô quá hạn tự ghi dòng hết hạn, số dư giảm |
| 5 | Báo cáo | số dư điểm theo khách / cửa hàng / hạng; điểm phát sinh, đã đổi, hết hạn theo kỳ |
| 6 | Dải vàng | máy bán không còn báo "tích điểm, voucher" là dữ liệu giả |

## Đã chốt (15/11/2026)

| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Điểm có hạch toán không | **Chỉ hạch toán lúc đổi**: voucher / quà đổi điểm ghi chiết khấu bán hàng hoặc chi phí theo loại quà, định khoản do kế toán đặt (không viết tài khoản trong code). Lúc tích chỉ ghi sổ điểm, không ghi nghĩa vụ |
| Q2 | Sổ điểm đặt ở đâu | module mới `loyalty` (đề xuất, chưa có — ADR-0024: đặt ở thư mục modules), máy bán gọi qua API module; không thêm bảng Core |
| Q3 | Điểm cũ ở website | nạp số dư đầu theo khách một lần (lô có hạn theo chính sách); ngày chốt số dư = ngày cửa hàng chuyển sang máy bán React |
| Q4 | Thứ tự | sau NT-BH-019 (quà đổi điểm có thể là mã Z) |

**Cách làm (15/11/2026)** — thiết kế đầy đủ ở `tgs_pos_react/docs/module-pos/70-TICH-DIEM.md`:
- Module `modules/loyalty`, sổ `mod_loyalty.entries` chỉ thêm (dòng dương là lô có hạn, dòng âm phân bổ theo lô), khách theo mã đối tượng (khung nhìn đối tượng chỉ mở mã, như module `pos`).
- Chính sách của website: website đẩy `LoyaltyProgram` từng cửa hàng sang `POST /api/v1/m/loyalty/program` (Cổng kế toán); module lưu từng phiên bản. Không nhận chính sách từ máy bán.
- Tích / hoàn theo sự kiện `pos.order.recorded` / `pos.return.recorded` (subscriber của module, chống làm hai lần theo đơn / phiếu trả); bộ tính điểm chép từ máy bán (đã khớp PHP).
- Bước 1: sổ điểm, tích, hoàn, máy bán đọc điểm thật (kiểm 1, 3). Bước 2: đổi điểm lấy quà / voucher (kiểm 2). Bước 3: hết hạn, nạp số dư đầu, báo cáo (kiểm 4, 5, 6).

## 7. Kết quả chạy

**Bước 1 — 15/11/2026, nhánh `feat/nt-bh-020-tich-diem`.** Test `apps/api/test/nt-bh-020-pos-tich-diem.test.ts` (5/5), `modules/loyalty/test` (12/12: tích, hạng, hoàn, cộng dồn phiếu trả, không âm; luật lô).

| Kiểm | Mong đợi (§4) | Phần mềm (test + chạy thật Docker demo + shop2) |
|---|---|---|
| 1 | 325.000 → +32, lô hạn 365 ngày; 1.300.000 → +150, số dư 182 | test: đúng; giao lại sự kiện không thêm dòng; khách lẻ không tích. Chạy thật: `HD2611000027` +32 (hạn 15/11/2027), `HD2611000028` +150 → 182 |
| 3 | trả 650.000 của đơn 1.300.000 → −75, số dư 107 | test: −75, lô của đơn còn 75. Chạy thật: `TH2611000012` → 107 |
| chính sách | website đẩy, gửi lại cùng phiên bản không đổi, chi nhánh lạ bị chặn | test: `changed` true / false, chi nhánh lạ 400. Chạy thật: shop2 đẩy `lp-74a8424f69d0c3e6` (TICH10K, THUONG1TR, 4 hạng); lần hai "đã có phiên bản" |
| máy bán | đọc điểm thật | màn bán shop2 chọn khách `0909200001`: "Có 107 điểm · còn 893 lên Bạc · Đơn này tích +32 điểm" (gọi `/m/loyalty/program`, `/m/loyalty/customers/…` 200) |

Ghi chú:
- Website: `tgs_pos` `TGS_POS_Loyalty_Push` đẩy mỗi giờ và sau khi lưu chính sách / cài đặt. Đọc chính sách qua REST `tgs-loyalty/v1/pos-program` có ký `TGS_POS_SSO_SECRET`; chưa khai khoá (máy thử) thì dựng thẳng bằng hàm của plugin.
- Bộ kiểm: `module check loyalty` ĐẠT, typecheck 0 lỗi. Ba chỗ chia điểm (không phải tiền) gom về `floorDiv` để luật làm tròn tiền không báo nhầm.

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 15/11/2026 | Tạo phiếu (nháp) |
| 15/11/2026 | Chốt Q1–Q4 |
| 15/11/2026 | Chia ba bước, số liệu bước 1, cách làm |
| 15/11/2026 | Bước 1 xong, ghi kết quả chạy; chuyển Chờ nghiệm thu |
