# NT-BH-023 · Đơn đặt hàng: đơn nháp (báo giá) → gửi → kiểm hạn mức + giữ hàng → giao nhiều lần → phiếu bán nháp; đơn livestream lọc trùng
<!-- [2026-11-17 Võ Hoàng] NGHIEM-THU — chốt NT-BH-023 (anh Hoàng, 17/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `phieu-ban` — cùng module với BH10 để tự sinh phiếu bán nháp; module `pos` đọc hàng đang giữ) |
| Màn hình | Màn mới "Đơn đặt hàng" (phần riêng, cạnh BH10); BH10 Phiếu bán hàng; máy bán (tồn khả dụng) |
| Mục được giao | Đơn đặt hàng (lịch 18–20/11): luồng đơn hàng → xuất kho → phiếu bán; đơn livestream, lọc trùng |
| Ngày tạo | 17/11/2026 |
| Trạng thái | **Đã chốt 17/11/2026** (Võ Hoàng) |
| Căn cứ | Quy trình mua bán của phòng kế toán §3.1 bước 2.1–3.3 (báo giá có hạn, SO kế thừa giá / CK / KM, kiểm tồn khả dụng + hạn mức + nợ quá hạn → chuyển duyệt, giữ hàng, xuất không vượt SO, giao thiếu) |
| Phase | PHASE-030 ma trận BH02 Báo giá, BH03 Đơn bán hàng, BH06 Hạn mức công nợ |

## 1. Luồng
1. **Đơn nháp** (= báo giá, Q1): khách, cửa hàng bán, kho, dòng hàng (giá tự điền theo bảng giá cửa hàng, sửa / giảm tay được như BH10), khuyến mại do Core tính (như BH10), **hạn hiệu lực**; in được như báo giá.
2. **Gửi**: kiểm
   - tồn **khả dụng** của kho trên đơn = tồn sổ − hàng các đơn khác đang giữ: thiếu thì báo (không chặn gửi; chặn ở lúc giao — NT-BH-021 của BH10 vẫn áp khi duyệt phiếu bán);
   - **hạn mức công nợ của khách** (`credit_limit` ở danh mục đối tượng, Q2): nợ phải thu hiện tại + đơn đang mở chưa giao + đơn này > hạn mức → **chờ duyệt**;
   - **nợ quá hạn** (quá `payment_term_days` của khách, trống = hạn chung) → **chờ duyệt**.
   Không vướng → **Đã gửi** (không cần duyệt, Q3).
3. **Duyệt** (chỉ đơn chờ duyệt): **kế toán trưởng / chủ đơn vị** (Q3 — vai trò sẵn có, không thêm quyền); ghi người duyệt + lý do.
4. **Giữ hàng** (Q4): đơn Đã gửi / Đã duyệt giữ số lượng chưa giao; **máy bán** thấy tồn khả dụng = tồn − hàng đang giữ (chặn bán quá tồn NT-BH-021 tính theo số này). Huỷ / đóng đơn / hết hạn giữ thì nhả.
5. **Giao** nhiều lần (Q5): mỗi lần giao chọn số lượng ≤ số còn lại → **tự sinh phiếu bán BH10 nháp** nối số đơn (giá, giảm, KM theo đơn, Q6); kế toán duyệt phiếu bán là vào sổ (như BH10 hôm nay). Phần chưa giao vẫn mở, vẫn giữ hàng, tới khi giao nốt hoặc bấm **Đóng đơn**.
6. **Livestream** (Q7): đơn nguồn "Livestream" nhập tay hoặc nạp Excel; cùng SĐT + cùng mã hàng trong 24 giờ → báo **trùng**, người lập chọn gộp vào đơn cũ hoặc giữ riêng.
7. **Lịch sử**: mọi lần sửa đơn (giá, giảm, số lượng, khách), gửi, duyệt, giao, đóng, huỷ ghi lại người / lúc / giá trị cũ → mới; xem ở thẻ Lịch sử của đơn (Q3: không chặn theo khung giảm, quan trọng là xem lại được).
8. **Chuyển kho** khi shop bán thiếu hàng (Q8): **chờ "yêu cầu điều chuyển" của kiennt** — đợt này chưa có nút chuyển kho trên đơn. Đơn đặt hàng chỉ ở phần mềm kế toán, chưa có ở máy bán (Q9).

## 2. Số liệu đầu vào
| | |
|---|---|
| Khách | `KH001` Đại lý An, hạn mức 10.000.000, hạn thanh toán 30 ngày, đang nợ 6.000.000 (không quá hạn) |
| Cửa hàng / kho | `CN01` / `CN01-K1`; `SUA330` tồn 100, giá 330.000 |

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Đơn nháp 10 hộp `SUA330`, hạn 3 ngày | Lưu nháp, số `DH<yymm><6 số>` theo cửa hàng; chưa giữ hàng; in được |
| Gửi (3.300.000; nợ 6.000.000 + 3.300.000 ≤ 10.000.000) | **Đã gửi**, không cần duyệt; giữ 10 hộp — máy bán CN01 thấy tồn khả dụng 90 |
| Đơn thứ hai 20 hộp (6.600.000 → vượt hạn mức) | **Chờ duyệt**: "Vượt hạn mức 10.000.000: nợ 6.000.000 + đơn mở 3.300.000 + đơn này 6.600.000"; kế toán trưởng duyệt (ghi lý do) → Đã duyệt, giữ hàng |
| Giao lần 1: 6 hộp của đơn 1 | Sinh phiếu bán BH10 nháp 6 hộp nối đơn; đơn còn 4, vẫn giữ 4 |
| Giao 5 hộp khi còn 4 | Chặn: vượt số còn lại |
| Đóng đơn 1 | Nhả 4 hộp; đơn Đã đóng |
| Sửa giá dòng từ 330.000 → 320.000 ở đơn nháp | Lưu; thẻ Lịch sử ghi người, lúc, 330.000 → 320.000 |
| Đơn livestream cùng SĐT, cùng `SUA330` trong 24 giờ | Báo trùng, cho gộp hoặc giữ |

**Bút toán:** đơn đặt hàng **không** ghi sổ; bút toán chỉ có khi phiếu bán BH10 được duyệt (như hôm nay).

## 4. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Hết hạn hiệu lực đơn nháp | Không gửi được, tạo lại hoặc gia hạn |
| 2 | Khách đang có nợ quá hạn | Gửi → chờ duyệt (dù chưa vượt hạn mức) |
| 3 | Huỷ đơn đã giao một phần | Chặn huỷ; dùng Đóng đơn (phần đã giao giữ nguyên) |
| 4 | Phiếu bán sinh từ đơn bị bỏ duyệt / xoá nháp | Số đã giao của đơn trả lại tương ứng |
| 5 | Hai người giao cùng lúc vượt số còn lại | Một lần giao được, lần kia bị chặn (khoá theo đơn) |
| 6 | Máy bán bán mã đang bị giữ hết | Chặn bán quá tồn (NT-BH-021) theo tồn khả dụng |

## 5. Đã chốt (17/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Báo giá riêng? | Lập đơn thẳng; báo giá = đơn nháp có hạn, in được |
| Q2 | Hạn mức công nợ | Theo khách; vượt → chờ duyệt |
| Q3 | Duyệt | Chỉ khi vượt hạn mức / nợ quá hạn; người duyệt: **kế toán trưởng / chủ đơn vị**; giảm tay không chặn theo khung — **ghi lịch sử để xem lại** |
| Q4 | Giữ hàng | Có |
| Q5 | Giao nhiều lần | Có; phần còn lại vẫn mở tới khi giao nốt / đóng đơn |
| Q6 | Phiếu bán | Tự sinh phiếu bán BH10 nháp mỗi lần giao; kế toán duyệt |
| Q7 | Livestream | Nhập tay + Excel; trùng = SĐT + mã trong 24 giờ |
| Q8 | Chuyển kho khi thiếu | Chờ "yêu cầu điều chuyển" của kiennt — đợt này chưa làm |
| Q9 | Ở máy bán? | Chưa — chỉ ở phần mềm kế toán |

## 6. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-023-don-dat-hang.test.ts` (tạo khi code) |

## 7. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 8. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 17/11/2026 | Tạo phiếu, chốt Q1–Q9 |
