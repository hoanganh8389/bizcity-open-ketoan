# NT-BH-030 · Trả lại hàng bán đợt 3 — trả ở shop khác cùng MST, trả quá hạn có duyệt, hạn trả theo shop, BH11 trả lượt khuyến mại
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — chốt NT-BH-030 (anh Hoàng, 18/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, `phieu-ban`; máy bán React trong `tgs_pos/react`) |
| Màn hình | Máy bán — hộp Hoàn hàng / Đổi hàng; BH17 Cài đặt bán hàng; BH14 Phiếu trả hàng; BH11 Hàng bán trả lại |
| Mục được giao | Trả lại hàng bán: phần còn lại sau NT-BH-024 |
| Ngày tạo | 18/11/2026 |
| Trạng thái | **Đã chốt 18/11/2026** (Võ Hoàng) |
| Căn cứ | Yêu cầu ERP tab Banhang-CTKM POS-003e (cấu hình đổi trả khác shop); họp kế toán 04/11 K3 (hạn đổi trả là tham số, đang 3 ngày; quá hạn chuyển duyệt, lưu vết; trả ở shop khác **cùng mã số thuế**, không chéo MST); NT-BH-025 (lượt khuyến mại BH11 chưa trả) |

## 1. Hiện trạng
- Máy bán chỉ cho trả ở đúng shop đã bán (`POS_RETURN_OTHER_SHOP`).
- Quá hạn trả: chỉ cần gõ tên người duyệt + lý do (`POS_RETURN_EXPIRED`), không có bước duyệt thật.
- Hạn trả một số chung cho công ty (`bizcity.pos.return_days`).
- Đổi hàng sang đơn thấp hơn hàng trả đã bị chặn (`POS_EXCHANGE_LOWER`) — giữ nguyên.
- Phiếu trả lập tay ở BH11 chưa trả lại lượt khuyến mại có hạn mức.

## 2. Cách làm
1. **Trả ở shop khác** (Q1): cho trả khi shop nhận và shop đã bán **cùng MST chi nhánh** (MST khai ở danh mục chi nhánh của kế toán). Khác MST, hoặc một trong hai chưa khai MST → chặn, báo rõ. Phiếu trả lập ở **shop nhận**, tham chiếu đơn gốc: hàng vào kho shop nhận (hàng lỗi vào kho trả lại KTL của shop nhận như NT-BH-024), tiền chi từ két / tài khoản của shop nhận, giảm doanh thu ghi ở shop nhận. Máy bán tìm được đơn gốc của các shop cùng MST (theo mã phiếu / SĐT khách).
2. **Trả quá hạn** (Q2): quá hạn thì thu ngân **gửi yêu cầu trả quá hạn** (đủ dòng hàng, số lượng, tình trạng, lý do). Người có quyền riêng **"Duyệt trả quá hạn"** (`pos:return-approve`; mặc định **kế toán trưởng** và chủ đơn vị) duyệt / từ chối (kèm lý do) trên màn kế toán; duyệt xong máy bán mới hoàn tất được phiếu trả theo đúng nội dung đã duyệt. Nhật ký: người gửi, người duyệt, thời điểm, lý do. Bỏ cách gõ tên người duyệt tay.
3. **Hạn trả** (Q2, Q3): mặc định **3 ngày** cho toàn công ty; shop nào khác thì khai riêng (dạng `CN01=7`) — cùng ở BH17. Kế toán trưởng sửa được (quyền cài đặt bán hàng).
4. **BH11 trả lại lượt khuyến mại** (Q4): phiếu trả lập tay **trả cả phiếu bán gốc** thì trả lại lượt khuyến mại có hạn mức (như máy bán đang làm); trả một phần thì không trả lượt.

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| CN01 và CN02 cùng MST; khách mua ở CN01, mang trả ở CN02 | Trả được; phiếu trả ở CN02 tham chiếu đơn CN01; tồn CN02 tăng; tiền chi từ két CN02 |
| CN03 khác MST (hoặc chưa khai MST) | Từ chối, báo "khác mã số thuế" / "chưa khai MST" |
| Trả trong hạn (≤ 3 ngày) | Như hiện nay, không cần duyệt |
| Shop CN02 khai hạn riêng 7 ngày; trả ngày thứ 5 | Trong hạn ở CN02 |
| Trả quá hạn | Máy bán gửi yêu cầu; chưa duyệt thì không hoàn tất được |
| Kế toán trưởng duyệt | Máy bán hoàn tất được phiếu đúng nội dung đã duyệt; nhật ký ghi người duyệt |
| Kế toán trưởng từ chối | Máy bán thấy "bị từ chối" kèm lý do; không lập được phiếu |
| Thu ngân không có quyền tự duyệt | Bị chặn |
| BH11 trả cả phiếu bán có khuyến mại hạn mức 2 lượt (đã dùng 2) | Còn 1 lượt sau khi trả |

## 4. Đã chốt (18/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Trả ở shop khác | Cùng MST; phiếu trả ghi ở shop nhận (hàng, tiền, giảm doanh thu) |
| Q2 | Trả quá hạn | Mặc định 3 ngày, có chỗ khai; kế toán trưởng có quyền sửa hạn và duyệt; quá hạn thì gửi yêu cầu trả quá hạn chờ duyệt |
| Q3 | Hạn trả theo cấp | Toàn công ty + riêng từng shop |
| Q4 | BH11 trả lượt khuyến mại | Có, làm đợt này |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 18/11/2026 <!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-030: điền kết quả chạy (đóng góp) --> |
| Bản code (commit) | nhánh `feat/nt-bh-030-tra-hang-dot-3` trên `3a04e8ca` (chạy trước khi commit; hash ở PR) |
| Test tự động | `apps/api/test/nt-bh-030-tra-hang-dot-3.test.ts` — **7/7 ĐẠT** (§3 dòng 1 CN01 → CN02 cùng MST: phiếu ở CN02 nối đơn CN01, tồn CN02 tăng, két CN02 chi; dòng 2 CN03 khác MST / CN04 chưa khai; dòng 3 trong hạn; dòng 4 CN02 hạn riêng 7 ngày; dòng 5–8 gửi yêu cầu, chưa duyệt chặn, người gửi / kế toán viên không duyệt được, KTT duyệt → lập đúng nội dung, nhật ký; dòng 7 từ chối kèm lý do; dòng 9 BH11 trả cả phiếu còn 1 lượt, trả một phần không trả lượt, bỏ duyệt lấy lại lượt); `modules/pos/test/tra-hang-dot-3.test.ts` (hàm thuần) — module pos 98/98; cả bộ `nt-bh-0*` 185/188 (3 ca đã biết: `nt-bh-005` "app tgs-wp"; `nt-bh-003`, `nt-bh-012` chập chờn — chạy riêng 9/9, 7/7) |
| Máy bán (tgs_pos/react) | `src/api/returns-dot-3.test.ts` 4/4, `src/features/returns/ReturnDialog.test.tsx` 2/2 (API giả); vitest 737/737 |
| Ghi chú | Cửa nạp lõi nhận `sale_return` của CN02 có `originalDocKey` trỏ chứng từ bán của CN01 (thử thật trong test, `posted`). Hạn trả tính theo cửa hàng nhận. Mỗi đơn × cửa hàng chỉ một yêu cầu trả quá hạn đang mở; mỗi yêu cầu dùng cho một phiếu trả. Đổi hàng quá hạn: phiếu trả của lần đổi gửi `approvalId` như trả |

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo phiếu, chốt Q1–Q4 |
| 18/11/2026 | Code xong, điền §5 kết quả chạy |
