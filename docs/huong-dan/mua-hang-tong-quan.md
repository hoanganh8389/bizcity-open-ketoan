# Tổng quan mua hàng (MH00)

Trang mở đầu của phân hệ Mua hàng, dùng để nắm luồng, thuyết trình và kiểm thử.

## Nạp dữ liệu tình huống

Khối xanh ở đầu trang đưa **25 tình huống của tài liệu yêu cầu** và **8 ví dụ bổ sung** vào **sổ thật** của đơn vị đang đăng nhập:
- 7 nhà cung cấp (có số dư nợ đầu kỳ), 4 chi nhánh, 11 mặt hàng — cái nào chưa có thì phần mềm tự thêm; mã hàng đã có trong danh mục thì giữ nguyên, phiếu lấy đúng tên hàng của danh mục;
- 27 chính sách (CK, CKTT, khuyến mại, hạn mức, hạn trả, giá mua cố định theo ĐVT, thưởng, lô);
- 38 chứng từ — phiếu "đã duyệt" được ghi sổ thật (bút toán, công nợ, kho), phiếu nháp để bấm thử trực tiếp.

Cách làm: nhập **mật khẩu nạp dữ liệu** → **Nạp dữ liệu** (mất khoảng 10–30 giây). Đã nạp rồi thì có **Nạp lại từ đầu** (xoá bản cũ, nạp lại) và **Xoá dữ liệu tình huống** (đảo bút toán các phiếu đã duyệt; nhà cung cấp, mặt hàng, chi nhánh đã thêm vẫn giữ).

Bảng **Ví dụ bổ sung ngoài tài liệu** (NCC Hoà Bình): đơn đặt 3 mã 2 mức thuế → giao 2 lần; khăn ướt tự hưởng bậc chiết khấu; chi phí bốc xếp phân bổ theo số lượng; giá cao hơn giá cố định (cảnh báo); chiết khấu sau mua có hoá đơn điều chỉnh; trả một phần; lô cận date. Bấm **Mở phiếu** để xem từng phiếu.

- **Dải luồng**: Chính sách → Đơn đặt → Nhập mua → Duyệt → Sổ kế toán → Cuối kỳ.
- **Thẻ số liệu**: số chứng từ (đã duyệt / chờ duyệt), giá trị nhập đã duyệt, số chính sách đang áp, số phép thử khớp.
- **Bảng 25 tình huống**:

| Cột | Nghĩa |
|---|---|
| Phần mềm làm gì | Cách phân hệ xử lý tình huống |
| Tài liệu ghi | Con số tài liệu yêu cầu đưa ra |
| Phần mềm tính ra | Con số phần mềm tính trên dữ liệu mẫu |
| Khớp | ✓ khi mọi con số tài liệu đều có trong kết quả |

Bấm **Demo** ở mỗi dòng để mở đúng màn / đúng phiếu của tình huống đó. Kịch bản demo đầy đủ: tài liệu nghiệp vụ *08. Phân hệ Mua hàng* (mục 7).
