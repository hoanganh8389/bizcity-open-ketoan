# NT-BH-021 · Chặn bán quá tồn — máy bán POS và phiếu bán nhập tay
<!-- [2026-11-16 11:30 AM Võ Hoàng] NGHIEM-THU — tạo phiếu (nháp, chờ chốt Q1–Q4) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, module `phieu-ban`) |
| Màn hình | Máy bán POS React (`/pos/`); BH10 Phiếu bán hàng (nhập tay) |
| Bộ phận yêu cầu | Phòng kế toán (bảng phân việc: "Bán hàng — chặn tồn âm khi bán") |
| Ngày tạo | 16/11/2026 |
| Trạng thái | Nháp — chờ chốt Q1–Q4 |

## 1. Mục đích quản trị
Không để cửa hàng bán số hàng lớn hơn số đang có trong sổ kho: tồn âm làm giá vốn bình quân sai và che giấu thiếu phiếu nhập / nhập sai kho.

Hiện trạng (16/11/2026):
- **Máy bán**: hiện tồn cửa hàng khi tìm hàng, nhưng **không kiểm** khi lập đơn; đơn bán quá tồn vẫn vào sổ, chỉ bộ kiểm cuối kỳ báo `INVENTORY_NEGATIVE`.
- **BH10 phiếu bán nhập tay**: có **cảnh báo** khi bán quá tồn (từ 14/11), không chặn.
- **Kho**: phiếu NT-KHO-003 (đã chốt 12/11, kiennt, chưa code) đặt công tắc chung `bizcity.kho.negative_stock` = `allow_warn` (mặc định) / `block` cho màn lập tay trong kế toán, và ghi rõ chứng từ từ POS **vẫn vào sổ**.

## 2. Khai báo trước
- Cửa hàng `CN01`, kho `CN01-K1`. Mặt hàng `11005100103` (ĐVT nhỏ nhất: hộp).
- Công tắc theo Q1, Q2.

## 3. Các bước thao tác
1. Máy bán CN01 bán `11005100103` số lượng 7.
2. BH10 lập phiếu bán CN01 / `CN01-K1`, ngày 16/11/2026, `11005100103` số lượng 7, bấm Duyệt.
3. Sửa phiếu bước 2 thành 5, Duyệt.

## 4. Số liệu đầu vào

| Ngày | Chứng từ | Kho | `11005100103` |
|---|---|---|---|
| 10/11/2026 | Nhập mua | CN01-K1 | +10 |
| 14/11/2026 | Bán (máy bán) | CN01-K1 | −5 |
| **Tồn 16/11/2026** | | | **5** |

## 5. Kết quả mong đợi (theo đề xuất ở Q1–Q3)

| Mục | Mong đợi |
|---|---|
| Máy bán, giỏ có 7 (tồn 5) | Dòng hàng báo đỏ "Tồn 5, đang bán 7". Bấm Thanh toán: hỏi người duyệt (mã quản lý ca) + lý do; có thì vẫn bán, đơn mang dấu "bán quá tồn" (người, lý do); không có thì không bán được |
| Máy chủ nhận đơn quá tồn không có người duyệt (gọi thẳng API) | Từ chối `POS_STOCK_SHORT`: `11005100103 cần 7, tồn 5 ở CN01` |
| Đơn bán quá tồn đã duyệt | Vào sổ như mọi đơn; màn Đơn bán máy POS lọc được "bán quá tồn" |
| BH10, công tắc kho = Cho phép (mặc định) | Như hôm nay: cảnh báo, vẫn duyệt được |
| BH10, công tắc kho = Chặn, bán 7 | **Không duyệt được**: `11005100103 cần 7, tồn 5 ở CN01-K1 ngày 16/11/2026` |
| BH10, công tắc = Chặn, sửa thành 5 | Duyệt được (tồn không trừ chính phiếu đang sửa) |

**Bút toán:** không đổi (chỉ quyết định có cho ghi hay không).

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Hai dòng cùng mã (4 + 3) | Cộng theo mã: 7 > 5 → như bán 7 |
| 2 | Bán theo ĐVT thùng (1 thùng = 6 hộp), 1 thùng | Quy về hộp: 6 > 5 → như bán quá tồn |
| 3 | Quà 0đ / dòng bill Z cùng mã | Tính vào số xuất (hàng vẫn ra khỏi kho) |
| 4 | Phiếu BH10 ngày lùi 12/11 (tồn ngày đó 10), bán 7 | Cho duyệt (tồn theo ngày phiếu) |
| 5 | Hai máy cùng lúc bán 3 + 3 (tồn 5) | Đơn tới sau bị kiểm với tồn đã trừ đơn trước |
| 6 | Mạng mất, máy bán dùng bản bán dự phòng | Khi gửi lại: không chặn đơn đã bán (hàng đã giao), đánh dấu "bán quá tồn — chưa duyệt" để kế toán xem |

## Cần chốt

| # | Câu hỏi | Đề xuất |
|---|---|---|
| Q1 | Máy bán: chặn cứng, hay cho bán khi có người duyệt? | **Cho bán khi có người duyệt + lý do** (như trả hàng quá hạn). Lý do: tồn trên sổ có thể trễ (phiếu nhập chưa vào) mà hàng có thật trên kệ; chặn cứng làm đứng quầy. Có công tắc theo cửa hàng ở Cài đặt bán hàng: *Bán quá tồn* = Cho phép / Cần duyệt (mặc định) / Chặn |
| Q2 | BH10: dùng chung công tắc kho của NT-KHO-003 hay công tắc riêng? | **Dùng chung** `bizcity.kho.negative_stock` (một chỗ khai cho mọi màn lập tay). Phần công tắc + nhật ký đổi công tắc thuộc NT-KHO-003; nếu kiennt chưa làm thì xin làm luôn phần khoá cài đặt (báo kiennt, không đụng màn kho) |
| Q3 | Tồn kiểm ở đâu? | Máy bán: tồn **cả cửa hàng** (mọi kho của chi nhánh — như máy bán đang hiện). BH10: tồn **kho trên phiếu**, tại **ngày phiếu** (như NT-KHO-003) |
| Q4 | "Chuyển kho" trong mục Bán hàng nghĩa là gì? | Cần anh / kế toán nói rõ: (a) bán hàng xuất từ kho khác của cửa hàng; (b) bán xong thiếu hàng thì lập phiếu chuyển kho bù; (c) việc khác. Chưa làm trong phiếu này |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-021-chan-ban-qua-ton.test.ts` (đề xuất — tạo khi code) |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 16/11/2026 | Tạo phiếu (nháp) |
