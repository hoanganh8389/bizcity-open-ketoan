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
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-027 (18/11 anh chốt): mặc định dạng shop, bỏ bật / tắt, website tự báo số cuối (đóng góp) -->
1. **Phiếu bán** (Q1): `{mã shop}BT{5 số}` — **mặc định cho mọi cửa hàng, không có khoá bật / tắt** (chốt 18/11). Mã shop = mã chi nhánh bên kế toán (= `tgs_site_code` của website). Một bộ đếm mỗi shop, tăng một chiều, **không đặt lại**. Theo đúng luật mã của website: bắt đầu 10000; quá 99999 sang dải chữ kế (`BT99999` → `BU00001`); tối đa 12 ký tự (đồng bộ ngược phần mềm cũ). Mã chi nhánh không dựng được mã 12 ký tự (không phải 1–5 chữ / số, vd `CN-NA`) → giữ dạng `HD` / `TH` theo tháng như cũ.
2. **Nối tiếp số cũ — website tự báo số cuối** (chốt 18/11): trang vỏ React của website đưa số cuối bộ đếm "bt" (bán và hoàn) của shop vào cấu hình trang; máy bán gửi kèm khi gọi bootstrap / xin dải số; module chỉ **nâng** bộ đếm lên ≥ số đó (không bao giờ hạ), trong cùng giao dịch có khoá, số phải là số nguyên dương (≤ 99 999 999). Số đầu tiên trên React = số cuối của shop ở website + 1. Shop mới (website chưa có số): bán từ 10000, hoàn từ 00001. Khi website ghi bản sao đơn React, website nâng bộ đếm "bt" của mình lên ≥ số của đơn đó — shop tắt React quay về POS cũ không cấp trùng mã. Không trùng mã đã có.
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
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — kết quả chạy (đóng góp) -->
| | |
|---|---|
| Ngày chạy | 18/11/2026 |
| Bản code (commit) | nhánh `feat/nt-bh-027-029-quay` |
| Test tự động | `apps/api/test/nt-bh-027-so-bill.test.ts` (11/11), `modules/pos/test/codes.test.ts` (6/6); máy bán React `tgs_pos/react` (số cuối từ trang vỏ gửi kèm bootstrap / xin dải) |

**Không cần bật** (18/11 anh chốt): mọi cửa hàng mặc định dạng shop, không còn khoá `bizcity.pos.shop_codes` / mục ở BH17. Số bắt đầu: website (tgs_pos) đưa số cuối bộ đếm "bt" của shop vào trang vỏ React (`codeSeq`), máy bán gửi `lastSale` / `lastReturn` kèm `GET /bootstrap` và `POST /sequences/reserve`; module nâng bộ đếm lên ≥ số đó, không hạ (số sai → `VALIDATION_ERROR`). Mã cửa hàng (chi nhánh kế toán) phải trùng mã shop website (`tgs_site_code`, ≤ 5 chữ / số) thì mã React mới nối dãy website; mã chi nhánh không dựng được mã 12 ký tự (vd `CN-NA`) giữ `HD` / `TH` theo tháng.

| Mục | Mong đợi | Phần mềm (test) |
|---|---|---|
| Shop 08022, số cuối 08022BT12345 | đơn đầu 08022BT12346, sau 12347 | đạt: website báo `lastSale=12345` kèm bootstrap → `08022BT12346`, `08022BT12347`; gọi lại bootstrap cùng số không đổi gì |
| Qua ngày / qua tháng | chạy tiếp | đạt: đơn ngày tháng trước → `08022BT12349` |
| Bill Z | mã cha + Z | đạt: đơn có quà không gửi thuế `08022BT12348` → bill Z `08022BT12348Z` (số theo thứ tự đơn trong test) |
| Huỷ đơn 12347 | giữ số, "Đã huỷ", đơn kế 12348 | đạt: đơn QR `08022BT12347` huỷ → tra cứu thấy `cancelled`; đơn kế `08022BT12348` |
| Máy xin 12350–12359, dùng 3 | số thiếu 12353–12359, lý do "máy … xin chưa dùng" | đạt: `GET /reports/missing-codes` 7 số, một dải, lý do `máy MAY-01 xin lúc … chưa dùng`; đơn kế `08022BT12360` |
| Phiếu hoàn đầu | `08022.B` + (số cuối + 1) | đạt: website báo `lastReturn=268` → `08022.B00269` |
| Số 99999 | đơn kế `…BU00001` | đạt: `08023BT99999` → `08023BU00001` |
| Mã cũ HD / TH | tra cứu, trả hàng được | đạt: đơn `HD…` đã phát hành trước khi đổi tra cứu được, trả → `08022.B00270` |
| Shop mới (website chưa có số) | bán từ 10000, hoàn từ 00001 | đạt: `CN01BT10000`, `CN01BT10001`; phiếu hoàn `CN01.B00001` |
| Mã chi nhánh không dựng được mã 12 ký tự | giữ HD / TH | đạt: chi nhánh `CN-NA` → `HD…000001` / `TH…000001`, bootstrap `codeFormat = legacy`, số website báo bỏ qua |
| Website báo số thấp hơn / cao hơn bộ đếm | chỉ nâng, không hạ | đạt: báo 12000 → đơn kế vẫn `08022BT12361`; xin dải kèm `lastSale=12400` → `08022BT12401`, `08022BT12402`; hoàn `lastReturn=300` → `08022.B00301` |
| Số website báo sai | từ chối, bộ đếm không đổi | đạt: `0`, `-5`, `abc`, `12.5`, `100000000` → 400 `VALIDATION_ERROR`; đơn kế `08022BT12403` |

Ghi chú: báo cáo số thiếu ở BH16 (khối *Số bill bị thiếu*); máy bán gửi `deviceId` khi xin dải để lý do nêu đúng máy (không gửi thì nêu người xin). Hạn dải giữ nhịp cuối tháng như cũ (dải quá hạn ghi thêm "dải hết hạn").

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo phiếu, chốt Q1–Q4 |
| 18/11/2026 | Code module pos + test; điền kết quả chạy, cách bật |
| 18/11/2026 | 18/11 — anh chốt: mặc định dạng shop, bỏ bật/tắt, website tự báo số cuối. Bỏ khoá `bizcity.pos.shop_codes` và mục BH17; mã chi nhánh không dựng được mã 12 ký tự giữ HD / TH; website nâng bộ đếm "bt" khi ghi bản sao đơn React |
