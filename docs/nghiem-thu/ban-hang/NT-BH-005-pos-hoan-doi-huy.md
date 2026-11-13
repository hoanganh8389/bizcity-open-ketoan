# NT-BH-005 · Hoàn hàng, đổi hàng, huỷ đơn từ máy bán POS
<!-- [2026-11-11 01:30 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: kế hoạch module POS đợt W2, phiếu trả hàng sale_return + đổi hàng đối trừ qua module pos. (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng — module `pos` (kế hoạch module POS đợt W2) |
| Màn hình | Máy bán POS React (`/pos/returns`, hộp *Hoàn hàng*, nút *Đổi hàng*); phía kế toán: ACC14, Sổ cái, Nhật ký bán hàng |
| Bộ phận yêu cầu | Phòng kế toán, bộ phận bán lẻ, bộ phận kinh doanh (duyệt quá hạn) |
| Ngày tạo | 11/11/2026 |
| Trạng thái | Nháp |

Căn cứ: biên bản họp phòng kế toán 04/11/2026 (câu G1, G2: hạn 3 ngày là tham số, quá hạn bộ phận kinh doanh duyệt, chỉ trả ở cửa hàng cùng mã số thuế, trả hàng chính thì quà trả theo, đổi hàng bằng hoặc cao hơn giá trị). Các câu còn mở ghi ở bảng *Nghiệp vụ bán hàng POS – đã chốt / cần chốt* (11/11/2026) mục 8.4 (R2–R13).

## 1. Mục đích quản trị
Khách trả hàng hoặc đổi hàng ở quầy thì sổ ghi đúng phần doanh thu, thuế đầu ra bị giảm và đúng tiền trả khách, nối về đơn bán gốc để biết hoàn của đơn nào. Không xoá, không đảo chứng từ bán gốc. Kế toán dùng để đối chiếu doanh thu thuần, thuế đầu ra, tiền chi trả khách theo cửa hàng, theo ngày.

## 2. Khai báo trước
- Như NT-BH-004: chi nhánh `CN01`, mặt hàng `SUA400` (R08), `TA01` (R10), hình thức `TM`, `CK`, và hình thức đối trừ `DOI_TRU` (đổi hàng).
- Đơn gốc: tình huống 2 của NT-BH-004 — mã `HD2611000002`, ngày 09/11/2026: 2 hộp `SUA400` giá 324.000 giảm tay 10% (thành tiền 583.200 = 540.000 + 43.200) và 1 gói `TA01` 215.000 (195.455 + 19.545).
- Hạn đổi trả 3 ngày (tham số `returnPolicy.days`); trả khác cửa hàng: cùng cửa hàng ở đợt này.
- Tài khoản hàng bán bị trả lại theo gói định khoản mặc định (52131 — kế toán đổi ở ACC41).

## 3. Các bước thao tác
1. Thu ngân mở *Hoàn hàng*, tra đơn `HD2611000002`, chọn số lượng trả, lý do, hình thức trả tiền; bấm *Hoàn*.
2. Hoặc bấm *Đổi hàng*: sang màn bán, chọn hàng mới, thanh toán (phần đối trừ = tiền hàng trả, khách trả thêm phần chênh).
3. Kế toán mở ACC14 / Sổ cái, lọc chứng từ `pos:CN01:sale_return:…`.

## 4. Số liệu đầu vào

**Tình huống 1 — hoàn một phần, tiền mặt** (ngày 10/11/2026): trả 1 trong 2 hộp `SUA400`, lý do "Khách đổi ý", hoàn tiền mặt.

**Tình huống 2 — hoàn nốt phần còn lại** (ngày 10/11/2026): trả hộp `SUA400` còn lại, hoàn chuyển khoản.

**Tình huống 3 — đổi hàng** (ngày 10/11/2026, đơn gốc khác cùng nội dung `HD2611000003`): trả 1 hộp `SUA400`, lấy 2 gói `TA01` (430.000); khách trả thêm tiền mặt.

## 5. Kết quả mong đợi

Công thức tiền hoàn (giống máy bán và POS cũ): tiền khách đã trả của dòng (sau giảm, gồm thuế) × số trả ÷ số đã bán, làm tròn đồng; lần trả hết dòng thì hoàn đúng phần còn lại. Tách chưa thuế = làm tròn(tiền hoàn ÷ (1 + thuế suất)); lần trả hết dòng lấy chưa thuế còn lại của dòng để tổng khớp đơn gốc. Thuế = tiền hoàn − chưa thuế.

**Trên chứng từ / màn hình:**

| Mục | Tình huống 1 | Tình huống 2 | Tình huống 3 |
|---|---|---|---|
| Mã phiếu trả | `TH2611000001` | `TH2611000002` | `TH2611000003` |
| Chứng từ | `sale_return`, nối đơn gốc (`originalDocKey` = docKey của `HD2611000002`) | như bên trái | `sale_return` nối `HD2611000003` + `sale` mới đối trừ phiếu trả |
| Tiền hoàn dòng `SUA400` | 291.600 = 270.000 + 21.600 | 291.600 = 270.000 + 21.600 (phần còn lại) | 291.600 = 270.000 + 21.600 |
| Trả khách | TM 291.600 | CK 291.600 | không trả tiền (đối trừ) |
| Đơn mới | — | — | 2 × `TA01` = 430.000 (390.909 + 39.091); đối trừ 291.600; khách trả TM 138.400 |
| Còn hoàn được của đơn gốc | `SUA400` 1 hộp, `TA01` 1 gói | `SUA400` 0, `TA01` 1 gói | |

**Bút toán** (gói định khoản mặc định):

| Nợ | Có | Số tiền | Ghi chú |
|---|---|---|---|
| 52131 | 1311 | 270.000 | TH1 hàng bán bị trả lại |
| 33311 | 1311 | 21.600 | TH1 giảm thuế đầu ra |
| 1311 | 1111 | 291.600 | TH1 trả tiền mặt (bút toán riêng) |
| 52131 | 1311 | 270.000 | TH2 |
| 33311 | 1311 | 21.600 | TH2 |
| 1311 | 11210005 | 291.600 | TH2 trả chuyển khoản |
| 52131 / 33311 | 1311 | 270.000 / 21.600 | TH3 phiếu trả (không trả tiền) |
| 1311 | 51111 / 33311 | 390.909 / 39.091 | TH3 đơn mới |
| 1111 | 1311 | 138.400 | TH3 khách trả thêm |

Sau TH3 công nợ 1311 của chứng từ đổi hàng về 0 (phần 291.600 đối trừ giữa phiếu trả và đơn mới).

Giá vốn hàng trả về: phần mềm kế toán tự tính theo đơn giá tháng của lần bán gốc (R-INV-4), không ghi lúc trả.

**Báo cáo phải thấy:** Nhật ký bán hàng CN01 có 3 phiếu trả, doanh thu giảm 810.000, thuế giảm 64.800; đơn gốc `HD2611000002` hết hàng `SUA400` có thể trả.

**Sai số làm tròn chấp nhận:** 0đ.

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Gửi lại đúng phiếu trả (cùng id) do mất mạng | Trả lại phiếu cũ, không thêm chứng từ |
| 2 | Trả nhiều hơn số còn hoàn được, hoặc dòng không có trong đơn | Chặn (`POS_RETURN_QTY`), không phiếu, không chứng từ |
| 3 | Quá hạn 3 ngày mà không có người duyệt + lý do | Chặn (`POS_RETURN_EXPIRED`, nêu hạn cuối); có người duyệt thì nhận, lưu người duyệt |
| 4 | Đơn gốc của chi nhánh khác | Chặn (`POS_RETURN_OTHER_SHOP`) ở đợt này |
| 5 | Đơn gốc chưa hoàn tất / đã huỷ, hoặc không có | Chặn (`POS_ORDER_NOT_RETURNABLE` / không thấy đơn) |
| 6 | Thiếu lý do trả | Chặn (`VALIDATION_ERROR`) |
| 7 | Hình thức trả tiền không phải tiền mặt / chuyển khoản (hoặc đối trừ ngoài đổi hàng) | Chặn (`POS_REFUND_METHOD`) |
| 8 | Đổi hàng mà hàng mới rẻ hơn hàng trả | Chặn (`POS_EXCHANGE_LOWER`) — trường hợp đặc biệt trả tiền chênh chờ chốt người duyệt (R8) |
| 9 | Đổi hàng mà phần đối trừ khác tiền hàng trả | Chặn (`POS_SPLIT_MISMATCH`) |
| 10 | Đổi hàng mà đơn mới lỗi (lệch giá, thiếu tiền…) | Không ghi gì cả: không phiếu trả, không đơn mới |
| 11 | Huỷ đơn đã hoàn tất | Chặn (`POS_CANCEL_COMPLETED`, "dùng phiếu trả hàng") |
| 12 | Kỳ của ngày trả đã khoá | Không lưu phiếu, không tiêu số phiếu (`PERIOD_LOCKED`) |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 11/11/2026, CSDL test `ketoan_test` (PostgreSQL 16, Docker), gói định khoản mặc định; ngày bán = hôm qua, ngày trả = hôm nay |
| Bản code (commit) | chưa commit — nhánh `feat/module-pos-w2` trên máy (chồng lên `feat/module-pos-w1`) |
| Test tự động | `apps/api/test/nt-bh-005-pos-hoan-doi.test.ts` (10 ca, đạt), `modules/pos/test/returns.test.ts` (9 ca, đạt) |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
| TH1 phiếu / tiền hoàn | TH…0001 · 291.600 = 270.000 + 21.600 · TM | đúng | 0 | |
| TH1 bút toán | 52131 Nợ 270.000 · 33311 Nợ 21.600 · 1311 Nợ = Có 291.600 · 1111 Có 291.600 | đúng | 0 | trả tiền là bút toán riêng |
| TH2 hoàn nốt | 291.600 (phần còn lại) · CK 11210005 Có 291.600; SUA400 còn trả 0 | đúng | 0 | |
| TH3 đổi hàng | phiếu trả không trả tiền; đơn mới 390.909 + 39.091 = 430.000; offsets 291.600; TM 138.400 | đúng | 0 | |
| Lệch chuẩn 1 (gửi lại) | phiếu cũ, không chứng từ mới | đúng | — | |
| Lệch chuẩn 2, 6, 7 | chặn đúng mã, không phiếu, không chứng từ | đúng | — | |
| Lệch chuẩn 8, 10 (đổi rẻ hơn) | chặn `POS_EXCHANGE_LOWER`, không phiếu trả, không đơn mới | đúng | — | cùng giao dịch |
| Lệch chuẩn 11 (huỷ đơn hoàn tất) | 409 `POS_CANCEL_COMPLETED` | đúng | — | |
| Lệch chuẩn 3, 4, 5 | quá hạn không duyệt / khác chi nhánh / đơn chưa hoàn tất | đúng (test thuần) | — | `returns.test.ts` |
| Chạy thật Docker từ WP (vé shop2) | trả TM, đổi hàng, huỷ đơn hoàn tất bị chặn | TH2611000001 330.000; TH2611000002 + HD2611000013 660.000; 409 | — | |
| Bản sao sổ ở website (sự kiện `pos.order.recorded` / `pos.return.recorded` / `pos.order.cancelled`, app `tgs-wp`) | mỗi đơn / phiếu trả đúng một sự kiện; đơn vị đã kết nối app thì có việc giao cho `tgs-wp.webhook`; website ghi một bộ phiếu bản sao, gửi lại không ghi thêm | HD2611000015 → website 4 phiếu (bán, 2 thu, xuất); phiếu trả TH2611000004 vào hàng chờ của website (chưa ánh xạ); huỷ → phiếu bản sao xoá mềm | — | test NT-BH-005 + chạy thật LocalWP |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 11/11/2026 | Tạo phiếu (kế hoạch module POS đợt W2) |
| 12/11/2026 | Thêm dòng kết quả: sự kiện cho bản sao sổ ở website (app `tgs-wp`) |
