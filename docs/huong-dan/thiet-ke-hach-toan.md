# Thiết kế hạch toán (ACC92)

<!-- [2026-11-10 09:00 PM Nguyễn Văn Thủy] PHASE-026 — thiết kế hạch toán (đóng góp) -->

Một chỗ để **nhìn và sửa cả dây chuyền định khoản**: chứng từ ở màn nào, dùng lý do nào, tài khoản lấy từ đâu, ra bút toán gì.

## 1. Mỗi màn chọn vài lý do

Cột trái là các màn nghiệp vụ: Bán hàng, Khách trả hàng, Nhập mua hàng, Trả hàng nhà cung cấp, Chuyển kho, Nhập / Xuất điều chỉnh kho, Phiếu thu, Phiếu chi.

- Bấm **+** để gán lý do cho màn. Chỉ lý do đúng loại mới chọn được (màn thu chỉ lý do thu…).
- **★** = lý do chọn sẵn khi lập phiếu ở màn đó. **×** = bỏ lý do khỏi màn.
- Màn đã gán lý do thì **màn nhập liệu chỉ hiện các lý do này**. Màn chưa gán thì hiện mọi lý do cùng loại như trước.
- Bấm tên màn hoặc một lý do để xem dây chuyền của lý do đó.

## 2. Đọc sơ đồ dây chuyền

Bốn cột, đọc từ trái sang phải:

| Cột | Là gì |
|---|---|
| Chứng từ | Màn, lý do, số tiền mẫu |
| Nguồn tài khoản | Lý do, nhóm hạch toán của mặt hàng, loại thuế, hình thức thanh toán, tài khoản ngầm định |
| Bút toán | Từng phần của bút toán: Nợ, Có, số tiền |
| Sổ cái | Tổng Nợ, tổng Có, có cân không |

- **Đường liền chạy** xanh = tài khoản đang dùng cho bên Nợ; cam = cho bên Có.
- **Nét đứt mờ "trống"** = nguồn đứng trước nhưng đang bỏ trống. **"dự phòng"** (tích *Đường dự phòng*) = nguồn đứng sau, dùng khi nguồn đang dùng bị bỏ trống.
- Thứ tự lấy tài khoản: **lý do → nhóm hạch toán của mặt hàng → tài khoản ngầm định**. Lý do khai tài khoản doanh thu / giá vốn thì đè lên tài khoản của mặt hàng; bỏ trống thì theo mặt hàng.
- Đổi ô **Nhóm hạch toán, Loại thuế, Hình thức, Tiền hàng, Hàng tặng** ở thanh trên để xem cùng lý do với mặt hàng, thuế khác ra sao.
- Thẻ **Bút toán**: cùng nội dung dạng bảng, có cột "lấy từ".

## 3. Sửa ngay trên sơ đồ

Bấm vào một ô tài khoản ở cột Nguồn → chọn tài khoản → **Lưu và tính lại**. Cả dây chuyền vẽ lại theo tài khoản mới.

- Hộp sửa nói rõ **ảnh hưởng**: bao nhiêu mặt hàng dùng nhóm hạch toán đó, lý do đang dùng ở màn nào, bao nhiêu bút toán đã ghi.
- **Bút toán đã ghi giữ nguyên**; chứng từ định khoản từ nay theo tài khoản mới.
- Ô của lý do, loại thuế để trống được (lấy theo nguồn kế tiếp). Ô của nhóm hạch toán, ngầm định, hình thức bắt buộc có.
- Thiếu tài khoản, tài khoản chưa có trong danh mục, Nợ trùng Có: ô đỏ, Sổ cái báo "cần sửa" và liệt kê bên dưới.

## 4. Đổi nhóm hạch toán hàng loạt

Thẻ thứ hai. Dùng khi cả một nhóm hàng phải đổi tài khoản (ví dụ đổi thuế suất, tách hàng khuyến mại).

1. Bên trái chọn **nhóm hàng** (gồm cả nhóm con); thêm điều kiện **nhóm hạch toán hiện tại**, **mã / tên chứa** nếu cần.
2. Chọn **Đổi sang nhóm**.
3. **Xem trước**: số mặt hàng khớp, số sẽ đổi, đang thuộc nhóm nào, 50 mặt hàng đầu.
4. **Đổi N mặt hàng** → xác nhận. Có nhật ký thao tác.

Phải có ít nhất một điều kiện lọc (không đổi toàn bộ danh mục một lần).

## 5. Lịch sử thay đổi

Thẻ thứ ba. Mỗi lần lưu cấu hình một dòng: **thời gian, người sửa, mục** (lý do, nhóm hạch toán, ngầm định, loại thuế, hình thức, lý do theo màn, đổi nhóm hàng loạt), **đối tượng** và từng ô đổi **trước → sau** (đỏ gạch = giá trị cũ, xanh = giá trị mới).

- Lọc theo loại ở ô **Loại**.
- "Trước" lấy từ lần lưu liền trước của cùng mục; lần lưu đầu tiên trong nhật ký thì "trước" để trống.
- Lỡ tay: mở lại ô ở thẻ Dây chuyền, đặt lại giá trị "trước". Chứng từ đã định khoản trong lúc sai thì định khoản lại ở màn chứng từ.
- Đổi nhóm hàng loạt chỉ ghi lần đổi thật (không ghi lần Xem trước), kèm số mặt hàng đã đổi.

## 6. Kiểm thử

| # | Làm | Kết quả đúng |
|---|---|---|
| 1 | Mở màn, chọn Bán hàng | Sơ đồ có Doanh thu, Thuế, Giá vốn, Thu tiền; Sổ cái "Nợ = Có" |
| 2 | Bấm ô "TK doanh thu (đè)" của lý do bán, bỏ trống, lưu | Đường Có của Doanh thu chuyển sang nhóm hạch toán |
| 3 | Đổi Nhóm hạch toán ở thanh trên | Tài khoản doanh thu, giá vốn, kho đổi theo nhóm |
| 4 | Gán 1 lý do cho Phiếu thu, đặt ★ | Lập phiếu thu mới: chỉ thấy lý do đó, chọn sẵn |
| 5 | Gán lý do loại chi cho Phiếu thu | Báo không hợp màn |
| 6 | Thẻ 2: chọn nhóm hàng, Xem trước, Đổi | Đổi đúng số đã xem trước; bấm lại không đổi gì thêm |

Phép thử tự động: `apps/api/test/posting-flow.test.ts` (gồm đối chiếu sơ đồ với bút toán thật của phiếu bán).
