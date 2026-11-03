# NT-HT-001 · Sơ đồ tổ chức làm gốc cho chi nhánh – kho – mua hàng
<!-- [2026-11-03 10:39 AM Nguyễn Văn Thủy] NGHIEM-THU — phiếu sơ đồ tổ chức 3 cấp, gắn điểm kinh doanh, đơn vị mua hàng tính lại phân cấp -->

| | |
|---|---|
| Phân hệ | Hệ thống / Danh mục (dùng chung cho Mua hàng, Kho, Báo cáo) |
| Màn hình | DM16 Sơ đồ tổ chức · DM02 Chi nhánh (ô Thuộc SĐTC) · bảng lọc báo cáo (thẻ Cây) · MH02 / MH16 / MH18 / MH19 |
| Bộ phận yêu cầu | Phòng kế toán, quản trị |
| Ngày tạo | 03/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Mục đích quản trị
Công ty tổ chức theo **sơ đồ tổ chức 3 cấp** dưới gốc Công ty:
- cấp 1: Miền;
- cấp 2: Chi nhánh;
- cấp 3: Tỉnh;
- dưới cùng là điểm kinh doanh và kho.

Báo cáo, bộ lọc và mua hàng phải đi từ gốc này.

Ví dụ **Chi nhánh Phú Thọ (PT)** mua hàng cho cả 6 tỉnh Phú Thọ, Yên Bái, Lào Cai, Vĩnh Phúc, Tuyên Quang, Hà Giang. Hàng về kho tổng 08000 rồi chia xuống shop.

Trước đây phân cấp đoán theo mã ("xx000" là chi nhánh cha). Cách đó tách 26000 Lào Cai thành một chi nhánh cha riêng, sai với cách công ty quản lý.

## 2. Khai báo trước
- Danh mục chi nhánh (DM02) và kho (DM12) đã có. Mã khớp hệ thống bán hàng: 751 chi nhánh, 863 kho.
- Sơ đồ tổ chức hiện hành:
  - 51 nút: 1 gốc, 3 Miền, 12 Chi nhánh, 35 Tỉnh;
  - 746 điểm kinh doanh gắn nút.
  - Nhập bằng tệp Excel 3 sheet ở DM16.

## 3. Các bước thao tác
1. DM16 → **Quay về dữ liệu gốc** (hoặc **Nhập Excel** tệp 2 sheet Nút · Gắn chi nhánh).
2. DM02 → mở một chi nhánh → ô **Thuộc SĐTC** → kính lúp → chọn nút → Ghi.
3. Một màn báo cáo bất kỳ (vd Nhập xuất tồn ACC83) → bảng lọc → thẻ **Cây** → tích **PT** → Tìm kiếm.
4. MH02 → ô **Chi nhánh** chọn **PT · Chi nhánh Phú Thọ** → gõ tìm một mã đã có tồn max.

## 4. Số liệu đầu vào (trích)
| Nút | Tên | Cha | Cấp |
|---|---|---|---|
| Công ty | Công ty | — | gốc |
| BAC | Miền Bắc | Công ty | 1 |
| PT | Chi nhánh Phú Thọ | BAC | 2 |
| PTO / LCI / YBI / VPC / TQG / HGG | các tỉnh | PT | 3 |

| Chi nhánh | Nút | Ghi chú |
|---|---|---|
| 08000 CN Phú Thọ | PTO | 9 kho (08-CC, 08-HH, 08-KM, 08-LC, 08-NH, 08-OL, 08-PB, 08-SN, 08-XL) |
| 26000 HO Lào Cai | LCI | kho 26-HH, 26000KM |
| 26001Premium Bảo Hà | LCI | kho 26001 |

## 5. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| DM16 nút PT | cấp 2, đường dẫn `Công ty\BAC\PT`, 104 cửa hàng trong nhánh |
| Nơi nhận hàng | phần mềm tự lấy 08000 (mã xx000, nhiều kho nhất); 26000, 26001Premium, 08001… = cửa hàng nhận hàng từ 08000 |
| Bộ lọc cây | tích PT ra đúng 104 điểm của 6 tỉnh + kho của các điểm đó; tích một kho thì chỉ lọc kho đó |
| MH02 / MH16 / MH18 / MH19 | chọn PT là cộng đủ cửa hàng của 6 tỉnh, gồm cả Lào Cai; gõ tìm mã đã có tồn max thì ra (kể cả mã đang đủ hàng) |
| DM02 | cột Sơ đồ tổ chức C1 / C2 / C3 = BAC / PT / PTO cho 08000 |
| Nhập lỗi | dòng lỗi báo rõ sheet / dòng / mã, không ghi gì |

Không phát sinh bút toán: đây là danh mục, không phải chứng từ.

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 2 | Chuyển PT vào dưới PTO (vòng lặp) | chặn: "bên dưới chính nhánh" |
| 3 | Thêm nút không có cha khi đã có gốc | chặn: "Đã có gốc" |
| 4 | Xoá PTO khi còn chi nhánh / xoá PT khi còn nút con | chặn, báo tên chi nhánh / nút con cần chuyển đi trước; nút trống thì xoá được |
| 7 | Phân cấp kiểu cũ (tự xếp theo mã) khi đã có sơ đồ tổ chức | chặn, chỉ đường sang DM16 |
| 8 | Nhập Excel có chi nhánh không có trong DM02 | báo lỗi dòng đó, không ghi gì; shop đổi đuôi (08014Premium ↔ 08014) thì khớp theo 5 số đầu |
| 9 | Sửa lung tung rồi bấm Quay về dữ liệu gốc | cây và việc gắn chi nhánh về đúng tệp; nút tự thêm trống bị xoá |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 03/11/2026 |
| Bản code | nhánh `feat/so-do-to-chuc` |
| Test tự động | `apps/api/test/so-do-to-chuc.test.ts` (9 test, chạy trên PostgreSQL thật) — ĐẠT; `ton-max.test.ts` (28 test) vẫn ĐẠT |
| Dữ liệu thật (máy local, đơn vị tgs) | 51 nút, 743 chi nhánh gắn nút; PT 104 cửa hàng, nhận hàng ở 08000 |

| Mục | Mong đợi | Phần mềm | Chênh |
|---|---|---|---|
| Cây thu nhỏ: PT cấp 2, đường dẫn, 4 điểm | như mong đợi | như mong đợi | 0 |
| 26000 / 26001Premium là shop của 08000 | có | có | 0 |
| Lệch chuẩn #2 – #9 | chặn / tính lại | chặn / tính lại | 0 |

Còn phải chạy trên dữ liệu thật (51 nút, 746 điểm) khi Phòng kế toán nghiệm thu.

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|
| | Phòng kế toán | | |

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 03/11/2026 | Tạo phiếu, ghi kết quả test tự động |
| 03/11/2026 | Làm gọn theo yêu cầu: bỏ màn MH15 và khái niệm "đơn vị mua hàng"; nơi nhận hàng tự lấy chi nhánh xx000; thêm Quay về dữ liệu gốc |
