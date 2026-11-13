# NT-BH-013 · Trang Quy trình phân hệ Bán hàng: luồng chi tiết, việc cần làm, menu như Mua hàng
<!-- [2026-11-13 02:00 PM Võ Hoàng] NGHIEM-THU — tạo phiếu: trang Quy trình Bán hàng (luồng chi tiết theo khuôn dùng chung) và menu Bán hàng theo mẫu Mua hàng (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (nhóm menu `ban-hang`) |
| Màn hình | `/nhom/ban-hang` (Quy trình: sơ đồ ít chữ) và `/nhom/ban-hang?xem=chi-tiet` (Luồng chi tiết); menu trái nhóm Bán hàng |
| Bộ phận yêu cầu | Kế toán bán hàng, bộ phận bán lẻ |
| Ngày tạo | 13/11/2026 |
| Trạng thái | Nháp — người dùng duyệt hướng 13/11 (thứ tự đợt, POS + BH12 vào nhóm Bán hàng) |

## 1. Mục đích quản trị
Kế toán bán hàng mở phân hệ Bán hàng là thấy cả luồng (giống Mua hàng): khai báo gì trước, việc chính từng bước, phần mềm tự làm gì, việc đang tồn đọng — bấm ô nào mở đúng màn đã lọc. Mọi phân hệ dùng **một khuôn** luồng chi tiết (chữ chốt [cap-nhat-ux/14](../../cap-nhat-ux/14-luong-chi-tiet-dung-chung.md)).

## 2. Khai báo trước
- Đơn vị bán lẻ: chế độ định khoản `sale`, `sale_return` = ghi ngay (chốt 13/11, NT-BH-004).
- Có ít nhất một chương trình bán (BH12), một đơn máy POS, một phiếu trả để thấy số đếm.

## 3. Các bước thao tác
1. Mở **Bán hàng → Quy trình**: sơ đồ ít chữ như hiện nay; có nút **Luồng chi tiết**.
2. Bấm **Luồng chi tiết**: khung *Việc cần làm* trên cùng; dưới là 7 bước nối mũi tên, mỗi bước có tầng *Khai báo* (trên) và *Phát sinh* (dưới).
3. Bấm một ô / một việc: mở đúng màn đã lọc.
4. Mở menu trái nhóm **Bán hàng**: thấy các mục theo §5 dòng 5.

## 4. Số liệu đầu vào
Đơn vị demo sau các lần chạy thật (đơn HD2611000024 / 25, chương trình BH12 và khuyến mại nội tuyến, ca bán).

## 5. Kết quả mong đợi

| # | Kiểm | Kết quả |
|---|---|---|
| 1 | Luồng chi tiết — 7 bước | ① Giá & chính sách (bảng giá, chương trình bán, khuyến mại) → ② Bán hàng (máy POS, phiếu bán BH10; tự ghi sổ) → ③ Hoá đơn điện tử (phát hành ngầm, người mua) → ④ Thu tiền (TM / CK / QR / thẻ / voucher; ca bán, chốt két) → ⑤ Trả / đổi hàng (hạn trả, duyệt quá hạn, trả hạn mức) → ⑥ Công nợ phải thu (đến hạn, tuổi nợ) → ⑦ Đối chiếu (đơn POS ↔ sổ, ca, hạn mức chương trình) |
| 2 | Tầng Khai báo | khách hàng, bảng giá, chương trình bán BH12, khuyến mại, hình thức thanh toán, Cài đặt bán hàng (BH17 — mở rộng thành cài đặt chung ở đợt 3), tài khoản ngầm định (ACC41) — mục chưa có màn hiện mờ "đang phát triển" (Định khoản bán hàng: đợt 3) |
| 3 | Tầng Phát sinh | quà tặng / hạn mức chương trình, điểm thành viên (đang phát triển — đợt 5), xuất điều chỉnh BH06 |
| 4 | Việc cần làm | chứng từ bán / trả **lỗi ghi sổ** hoặc **chờ duyệt**; đơn QR **chờ tiền** quá hạn mã; ca **chưa chốt** từ hôm trước; chương trình **sắp hết hạn mức** (≥ 90 %); phải thu **quá hạn** — mỗi việc có số và mở đúng màn đã lọc; không còn việc → "Không có việc tồn đọng" |
| 5 | Menu Bán hàng | Chứng từ (phiếu bán, trả lại; *đơn đặt hàng*, *giảm giá hàng bán* đang phát triển) · **Bán lẻ máy POS** (BH13–BH17) · **Chính sách bán** (chương trình bán BH12, khuyến mại, bảng giá; *hạn mức nợ khách* đang phát triển) · Danh mục (khách hàng, mặt hàng, bảng giá, hình thức thanh toán) · Cài đặt (Cài đặt bán hàng BH17, tài khoản ngầm định; *Định khoản bán hàng* đang phát triển) · Báo cáo (như hiện có). Phần riêng giữ lối tắt cũ |
| 6 | Mua hàng, Danh mục sau khi đổi khuôn | luồng chi tiết hiện y như trước (cùng bước, cùng ô, cùng số đếm, cùng việc cần làm) |
| 7 | Nhóm chưa có luồng chi tiết | không có nút "Luồng chi tiết" (như hiện nay); Tiền mặt và Tiền gửi không dùng chung một luồng |
| 8 | Hướng dẫn | bài hướng dẫn Quy trình bán hàng (đề xuất: ban-hang-quy-trinh.md trong docs/huong-dan, viết ở đợt 1) — nút Hướng dẫn ở trang mở đúng bài |

## 6. Trường hợp lệch chuẩn

| # | Tình huống | Xử lý |
|---|---|---|
| 1 | API việc cần làm lỗi / chậm | Luồng vẫn hiện, khung việc cần làm báo "Chưa tải được" + nút thử lại |
| 2 | Người dùng không có quyền một màn | Ô vẫn hiện, bấm báo không có quyền (như Mua hàng) |
| 3 | Module `pos` tắt ở đơn vị | Ô và mục menu của máy POS ẩn; việc cần làm không đếm đơn POS |

## 7. Kết quả chạy
| Mục | Mong đợi | Thực tế | Lệch | Ghi chú |
|---|---|---|---|---|
| §5 dòng 1–3 (Luồng chi tiết Bán hàng) | 7 bước, tầng Khai báo / Phát sinh, ô chưa có màn mờ | đúng (chụp Docker demo 13/11) | — | đợt 1 |
| §5 dòng 4 (việc cần làm) | chứng từ lỗi / chờ, hạn mức ≥ 90 %, nợ quá hạn, đơn QR, ca chưa chốt | đúng; test `ban-hang-viec-can-lam` 2/2 (chờ 1, hạn mức 1, nợ quá hạn 1 khách 200.000); Docker: 27 chứng từ chờ (trước khi đặt ghi sổ ngay) | — | |
| §5 dòng 6 (Mua hàng, Danh mục sau khi đổi khuôn) | giao diện y như trước | đúng — công thức đặt hàng, "In:", "Lập mới", việc cần làm còn nguyên | — | |
| §5 dòng 7 (nhóm chưa có luồng) | không có nút | Tiền mặt không có nút "Luồng chi tiết" | — | |
| §5 dòng 8 (hướng dẫn) | nút Hướng dẫn mở đúng bài | bài ban-hang-quy-trinh.md, khoá trợ giúp theo nhóm (`ban-hang-quy-trinh`) | — | |

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 13/11/2026 | Tạo phiếu |
| 13/11/2026 | Ghi kết quả chạy đợt 1 (luồng chi tiết) |
