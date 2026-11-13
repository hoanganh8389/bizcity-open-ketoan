# NT-BH-014 · Cài đặt bán hàng: một màn cho bán lẻ, phiếu kế toán chênh lệch két, tài khoản hàng bán bị trả lại
<!-- [2026-11-13 06:30 PM Võ Hoàng] NGHIEM-THU — tạo phiếu đợt 3 Bán hàng (chữ chốt docs/nghiep-vu/20) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, nhóm menu `ban-hang`) |
| Màn hình | BH17 *Cài đặt bán hàng* (`/app/pos/cai-dat`), BH15 *Sổ ca bán*, ACC41 *Tài khoản ngầm định*, ACC14 *Trạm chứng từ* |
| Bộ phận yêu cầu | Kế toán bán hàng, kế toán trưởng |
| Ngày tạo | 13/11/2026 |
| Trạng thái | Nháp — nghiệp vụ đã chốt 13/11 (NT-BH-007 Q1, NT-BH-005 R12; "làm như đề xuất, có lỗi sửa sau") |

Chữ chốt thiết kế: [nghiep-vu/20](../../nghiep-vu/20-cai-dat-ban-hang-chenh-lech-ket.md).

## 1. Mục đích quản trị
Kế toán bán hàng có **một màn** xem và sửa mọi cài đặt bán lẻ: tham số máy bán, cách ghi sổ chứng từ bán, xử lý chênh lệch két, tài khoản hạch toán. Tiền thiếu / thừa két khi chốt ca tự lên sổ (tài sản thiếu / thừa chờ xử lý), không lập tay. Hàng bán bị trả lại vào đúng 5213 (52131) theo hệ thống tài khoản của đơn vị, sửa được ở ACC41 mà không báo lỗi.

## 2. Khai báo trước
- Đơn vị có tài khoản 1381, 3381, 1111, 52131 (hệ thống tài khoản mẫu có sẵn), đối tượng chi nhánh `CN-<mã>`.
- Máy bán POS đã bán được, có ca mở với tiền đầu ca.

## 3. Các bước thao tác
1. Mở **Bán hàng → Cài đặt → Cài đặt bán hàng (BH17)**: thấy 4 khối ① Máy bán tại quầy ② Ghi sổ chứng từ bán ③ Chênh lệch két ④ Tài khoản hạch toán bán hàng.
2. Khối ③: bấm **Tạo lý do mặc định** (lần đầu), Ghi.
3. Ở máy bán: mở ca 1.000.000, bán tiền mặt 330.000, chốt ca đếm 1.320.000.
4. Mở ACC14 và Sổ ca bán: xem phiếu kế toán của ca.
5. Mở ACC41, nhóm *Bán hàng*: sửa dòng "Hàng bán trả lại – Bán hàng hoá dịch vụ – Giảm trừ công nợ", Ghi.

## 4. Số liệu đầu vào
Đơn vị demo Docker (chi nhánh có máy bán, ca mở); đơn vị test sạch cho test tự động.

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Khối ① | 4 tham số như cũ (hạn trả, bắt buộc mở ca, ca theo chi nhánh, ngưỡng chênh lệch); ghi như cũ |
| 2 | Khối ② | `sale`, `sale_return`: *Ghi ngay* / *Chờ duyệt*; đổi một loại không làm mất chế độ của loại chứng từ khác |
| 3 | Khối ③ | bật / tắt "Lập phiếu kế toán khi chốt ca lệch két" (mặc định bật); hai lý do Thiếu (Nợ 1381 / Có 1111), Thừa (Nợ 1111 / Có 3381) — sửa được TK; trạng thái "Chưa có lý do — bấm Ghi để tạo" / "Đã có lý do"; bấm **Ghi** tạo / sửa hai lý do |
| 4 | Khối ④ | danh sách loại nhóm *Bán hàng* của ACC41 (tên, TK Nợ, TK Có), chỉ đọc, nút **Sửa ở ACC41** |
| 5 | Chốt ca thiếu 10.000 | một phiếu kế toán: Nợ 1381 (đối tượng `CN-<mã>`) / Có 1111 — 10.000; diễn giải có ca, thu ngân, số phải có / đếm được; Sổ ca cột *Phiếu kế toán* hiện trạng thái (đã ghi sổ / chờ duyệt / lỗi) |
| 6 | Chốt ca thừa 5.000 | Nợ 1111 / Có 3381 (đối tượng `CN-<mã>`) — 5.000 |
| 7 | Lệch 0, hoặc khối ③ tắt | không lập phiếu; biên bản ca như cũ |
| 8 | ACC41 dòng trả lại *(chuyển Thủy — chờ xác nhận danh mục TGS)* | lọc 3387; 5213; 711, mặc định 52131 — **Ghi được** |
| 9 | ACC41 dòng giảm giá hàng bán *(chuyển Thủy)* | lọc 3387; 5212; 711, mặc định tài khoản con của 5212 |
| 10 | Menu, Luồng chi tiết | không còn mục mờ "Định khoản bán hàng"; ô *Tài khoản hạch toán* / *Cài đặt bán hàng* mở BH17 |
| 11 | Hướng dẫn | bài `pos-cai-dat.md`, `pos-ca-ban.md` viết lại theo màn mới |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | Chưa có lý do / lý do thiếu TK khi chốt ca | Core **từ chối phiếu ngay lúc nhận** (kể cả chế độ chờ duyệt). Ca **vẫn chốt**, không để lại chứng từ dở; Sổ ca hiện "Chưa lập — xem lý do". Kế toán khai lý do ở BH17, chọn ca ở Sổ ca, bấm **Lập lại phiếu kế toán** |
| 2 | Gửi chốt ca hai lần (mạng chập chờn) | Lần sau báo `POS_SHIFT_CLOSED`; không có phiếu thứ hai (khoá chứng từ theo ca) |
| 3 | Kỳ kế toán đã khoá ở ngày chốt ca | Như đơn bán cùng ngày: Core chặn (`PERIOD_LOCKED`), chốt ca báo lỗi — mở kỳ hoặc chốt ca trong kỳ mở |
| 4 | *(chuyển Thủy)* Kế toán đã tự sửa lọc ở ACC41 trước khi cập nhật | Cập nhật giữ nguyên dòng đã sửa tay |
| 5 | Người không có quyền ghi cấu hình | Màn chỉ xem; nút Ghi ẩn. Nút Lập lại phiếu ở Sổ ca cần quyền ghi chứng từ |
| 6 | Ca chốt trước khi cập nhật, hoặc khi đang tắt | Không tự lập bù; cần thì bấm **Lập lại phiếu kế toán** ở Sổ ca |

## 7. Kết quả chạy
| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|
| §5 dòng 1–4 (BH17 4 khối) | đủ 4 khối, Ghi tạo lý do | đúng — Docker demo 13/11: trước Ghi "Chưa có lý do", sau Ghi có POS-THIEU-KET (journal, Nợ 1381 / Có 1111), POS-THUA-KET (Nợ 1111 / Có 3381); không lỗi trình duyệt | — | khối ④ cho thấy lệch ACC41 5212 / 5213 (chuyển Thủy) |
| §5 dòng 5 (thiếu 10.000) | Nợ 1381 / Có 1111, đối tượng CN | đúng — test `nt-bh-014`: 1381 Nợ 10.000, 1111 Có 10.000, đối tượng CN-CN01; Docker: `CA-CN01-20261113-1429` manual_journal chờ duyệt, CN-CN01 | — | phiếu kế toán mặc định chờ duyệt (chế độ của loại phiếu kế toán) |
| §5 dòng 6 (thừa 5.000) | Nợ 1111 / Có 3381 | đúng (test) | — | |
| §5 dòng 7 (lệch 0 / tắt) | không lập | đúng (test) | — | |
| §5 dòng 10 (menu, luồng) | không còn mục mờ | đúng (Docker) | — | |
| §6 dòng 1 (chưa có lý do) | ca vẫn chốt | ca chốt, biên bản "not_created" kèm câu lỗi, không chứng từ dở; khai lý do → Lập lại phiếu ghi sổ 10.000; lập lần hai → 409 | khác bản nháp (ACC14 thẻ Lỗi): Core từ chối lúc nhận | đã sửa §6 dòng 1 |
| §6 dòng 2 (gửi lại) | không phiếu thứ hai | đúng (test, cùng khoá idempotency) | — | |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 13/11/2026 | Tạo phiếu |
| 13/11/2026 | §5 dòng 8–9 (ACC41 5212 / 5213) chuyển cho Thủy, chờ kế toán TGS xác nhận danh mục tài khoản |
| 13/11/2026 | Ghi kết quả chạy; §6 dòng 1, 3, 5, 6 sửa theo hành vi thật (Core từ chối phiếu lúc nhận → Lập lại phiếu ở Sổ ca) |
