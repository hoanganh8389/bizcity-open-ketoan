# NT-BH-027 · Số bill máy bán theo dạng của shop (mã shop + BT + số), chạy liên tục
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — chốt NT-BH-027 (anh Hoàng, 18/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`; máy bán React; website `tgs_pos`) |
| Mục được giao | Kiểm soát tại quầy: câu K6 (số bill nhảy cóc) |
| Ngày tạo | 18/11/2026 |
| Trạng thái | **Đã chốt 18/11/2026** (Võ Hoàng) |
| Căn cứ | Mã phiếu đang dùng ở POS website (`tgs_pos`, chế độ "bt"): `08022BT10000` = mã shop + `BT` + 5 số, phiếu sau = phiếu trước + 1, không đặt lại theo ngày / tháng |

## 1. Hiện trạng
Máy bán React lấy số từ module `pos`: `HD` + năm tháng + 6 số (`HD2611000001`), đặt lại mỗi tháng; phiếu hoàn `TH2611000001`. Khác dạng shop đang dùng, nên chuyển sang React là đổi dạng số bill.

## 2. Cách làm
1. **Phiếu bán** (Q1): `{mã shop}BT{5 số}`. Mã shop = mã chi nhánh bên kế toán (= `tgs_site_code` của website). Một bộ đếm mỗi shop, tăng một chiều, **không đặt lại**. Theo đúng luật mã của website: bắt đầu 10000; quá 99999 sang dải chữ kế (`BT99999` → `BU00001`); tối đa 12 ký tự (đồng bộ ngược phần mềm cũ).
2. **Nối tiếp số cũ:** số đầu tiên trên React = số cuối của shop ở website + 1 (khai số kế thừa theo shop, lấy từ bộ đếm website một lần). Không trùng mã đã có.
3. **Bill Z** = mã phiếu cha + `Z`, không tiêu số của bộ đếm.
4. **Phiếu hoàn** (Q4): dạng website `{mã shop}.B{5 số}`, từ 00001, liên tục, nối tiếp số cũ.
5. **Mất mạng** (Q2): giữ cách hiện có — máy xin trước dải số, mất mạng vẫn in số thật; **chấp nhận hở số**. Thêm báo cáo **"Số bill bị thiếu"** theo cửa hàng × ngày: mỗi số thiếu ghi lý do (máy xin chưa dùng / hết hạn dải).
6. **Đơn huỷ** (Q3): giữ số, trạng thái "Đã huỷ", tra cứu thấy; dãy không hở vì huỷ.
7. Mã cũ `HD…` / `TH…` đã phát hành vẫn đọc, tra cứu, trả hàng được.

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Shop 08022, số cuối ở website 08022BT12345 | Đơn đầu trên React = `08022BT12346`, đơn sau `08022BT12347` |
| Qua ngày / qua tháng | Số chạy tiếp, không về 10000 |
| Đơn có quà tách bill Z | Bill Z = `08022BT12347Z` |
| Huỷ đơn 12347 | Số giữ, "Đã huỷ"; đơn kế = 12348 |
| Máy xin dải 12350–12359, dùng 12350–12352 rồi hết ngày | Báo cáo số thiếu ngày đó: 12353–12359, lý do "máy … xin chưa dùng" |
| Phiếu hoàn đầu tiên trên React | `08022.B{số cuối + 1}` |
| Số 99999 | Đơn kế `08022BU00001` |

## 4. Đã chốt (18/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Dạng số bill | Theo dạng shop: mã shop + BT + 5 số, liên tục |
| Q2 | Mất mạng | Xin trước dải số, chấp nhận hở; có báo cáo số thiếu |
| Q3 | Đơn huỷ | Giữ số, ghi "Đã huỷ" |
| Q4 | Phiếu hoàn | Theo dạng POS cũ của shop |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-027-so-bill.test.ts` (chưa tách — tạo khi code) |

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo phiếu, chốt Q1–Q4 |
