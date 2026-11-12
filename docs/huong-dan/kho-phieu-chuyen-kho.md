# Phiếu chuyển kho (KHO01)

<!-- [2026-11-10 08:30 PM Nguyễn Văn Thủy] PHASE-026 — phiếu chuyển kho lập trên phần mềm kế toán (đóng góp) -->

Chuyển hàng giữa hai chi nhánh, hoặc giữa hai kho trong cùng một chi nhánh. Một phiếu có cả hai đầu: chi nhánh và kho **xuất**, chi nhánh và kho **nhập**.

## Ghi phiếu là xuất kho

- Bấm **Ghi**: tồn ở chi nhánh + kho xuất **giảm ngay**. Hàng nằm ở *hàng đang chuyển* (1579, khác đơn vị hạch toán thì 13681).
- Bên nhận **chưa tăng** cho tới khi thủ kho nhập xác nhận.
- Chuyển trong **cùng chi nhánh** (hai kho): mặc định **nhận luôn** khi ghi. Muốn chờ xác nhận thì bỏ tích *Nhận luôn khi ghi*.

## Lập phiếu

| Ô | Cách dùng |
|---|---|
| Chi nhánh xuất | Điền sẵn chi nhánh đang làm việc (đổi ở thanh dưới cùng) |
| Kho xuất / Kho nhập | Chỉ hiện kho của chi nhánh đã chọn, tự chọn kho mặc định. Cùng chi nhánh thì kho nhập tự chọn kho khác |
| Mã hàng | Gõ mã / tên / mã vạch rồi Enter. Trùng mã thì cộng số lượng |
| Dán từ Excel | Chép các cột *Mã hàng · Số lượng · Ghi chú* rồi dán |
| Tồn | Tồn ở chi nhánh + kho xuất tại ngày phiếu, không tính chính phiếu này. Số chuyển vượt tồn thì tô đỏ, khi ghi sẽ hỏi lại |

Phiếu **không có ô lý do**: tài khoản (Nợ 1579 / Có 1561, khác đơn vị hạch toán dùng 13681) lấy theo **Tài khoản ngầm định (ACC41)**.

## Lô hàng

- Thêm mã là phần mềm **gợi ý lô hạn dùng sớm trước** ở đúng kho xuất (ô lô tô xanh). Một mã cần nhiều lô thì tách thành nhiều dòng.
- Sửa số lượng của dòng đang theo gợi ý thì gợi ý lại.
- Muốn lấy lô khác thì **gõ thẳng số lô**: phần mềm xuất đúng lô đã gõ.
- Để trống lô: khi ghi, phần mềm tự chọn đúng như gợi ý. Dòng thiếu tồn lô cũng để trống.
- Bên nhận nhận vào **đúng các lô bên xuất đã xuất**.

## Nhận hàng (thủ kho nhập)

1. Chọn phiếu đang *Đã xuất, chờ nhận* → **Nhận hàng**.
2. Mặc định nhận đủ. Nhận thiếu thì sửa cột **Thực nhận**, và bắt buộc ghi lý do ở ô Ghi chú.
3. Bấm **Xác nhận nhận hàng**: tồn chi nhánh + kho nhập **tăng theo số thực nhận**, ghi theo ngày nhận.

Nhận thiếu thì phần chênh còn ở *hàng đang chuyển* để kế toán xử lý (bắt bồi thường, ghi hao hụt…). Danh sách hiện trạng thái **Nhận thiếu**.

## Sửa, từ chối, huỷ

| Nút | Việc |
|---|---|
| Sửa | Sửa được cả phiếu đã nhận. Phần xuất và phần nhập ghi lại theo phiếu mới, bút toán cũ đảo bằng số âm |
| Bỏ nhận | Huỷ phần nhập, phiếu về *chờ nhận* |
| Từ chối | Bên nhận không nhận hàng: huỷ phần xuất, bên chuyển được **trả lại tồn** |
| Huỷ phiếu | Huỷ cả hai phần. Phiếu vẫn giữ lại để tra cứu, không xoá |

## Phiếu từ website bán hàng

Phiếu chuyển kho lập trên website vẫn tự vào sổ qua cầu nối như trước. Xem chung mọi phiếu chuyển, cả phần còn trên đường, ở **Bảng kê chuyển kho (HH01)**.

## Đính kèm chứng từ gốc
<!-- [2026-11-12 kiennt] NT-QUY-001 — đính kèm chứng từ gốc trên phiếu chuyển kho -->

Cuối phiếu có khung **Đính kèm chứng từ gốc**: kéo thả hoặc **Chọn tệp…** (ảnh, PDF — tối đa 15 MB / tệp), chọn loại (Biên bản, Chứng từ gốc…).

- Phiếu mới: **Ghi** trước rồi mới gắn tệp.
- Đính được cả khi phiếu đang ở chế độ **Xem**, đã huỷ, hay kỳ đã khoá — đính tệp không đổi sổ.
- Gửi lại đúng tệp đã có thì không thêm bản trùng. Bấm tên tệp: PDF / ảnh xem ngay, loại khác tải về.
- **Gỡ** tệp chỉ ẩn khỏi danh sách, không xoá hẳn (còn trong nhật ký). Người chỉ có quyền xem chứng từ thì xem / tải được, không đính / gỡ.
