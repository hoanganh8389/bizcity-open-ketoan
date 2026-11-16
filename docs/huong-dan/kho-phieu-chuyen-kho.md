# Phiếu chuyển kho (KHO01)

<!-- [2026-11-10 08:30 PM Nguyễn Văn Thủy] PHASE-026 — phiếu chuyển kho lập trên phần mềm kế toán (đóng góp) -->

Chuyển hàng giữa hai chi nhánh, hoặc giữa hai kho trong cùng một chi nhánh. Một phiếu có cả hai đầu: chi nhánh và kho **xuất**, chi nhánh và kho **nhập**.

## Nháp và duyệt xuất

- **Ghi nháp**: chưa trừ tồn, chưa vào sổ, sửa thoải mái. Bên nhận chưa nhận được.
- **Ghi và duyệt xuất**: tồn ở chi nhánh + kho xuất **giảm ngay**. Hàng nằm ở *hàng đang chuyển* (1579, khác đơn vị hạch toán thì 13681).
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

## Sửa sau khi duyệt xuất

Phiếu đã duyệt xuất ảnh hưởng cả bên nhận và phiếu xuất kho kiêm vận chuyển nội bộ, nên không sửa thẳng:

| Lúc | Làm gì |
|---|---|
| Đã duyệt xuất, **bên nhận chưa nhận** | **Lập điều chỉnh** (ghi lý do) → sửa → **Duyệt điều chỉnh**. Trong lúc điều chỉnh, bên nhận **bị khoá nhận**; sổ giữ bản cũ. Duyệt thì đảo phần xuất cũ (số âm) và ghi phần xuất mới |
| **Bên nhận đã nhận**, chỉ lệch số nhận | Bên nhận lập **Biên bản chênh lệch**: ghi lại số thực nhận, bắt buộc lý do |
| **Bên nhận đã nhận**, sai phiếu | **Đề nghị điều chỉnh hai đầu** → bên nhận **xác nhận** → **Duyệt điều chỉnh**: đảo và ghi lại cả phần xuất, phần nhập |
| Muốn bỏ thay đổi | **Huỷ điều chỉnh**: phiếu về bản đã duyệt, sổ không đổi |

**Phiếu điện tử**: bấm **Ghi số phiếu điện tử** để lưu số phiếu XK-VCNB đã phát hành. Phiếu đã có số mà điều chỉnh thì khi duyệt phải ghi **số phiếu thay thế / điều chỉnh**. Lịch sử phiếu lưu số cũ → số mới.

Mọi lần điều chỉnh, biên bản chênh lệch đều nằm ở bảng **Lịch sử điều chỉnh / chênh lệch** cuối phiếu: ai lập, lý do, ai xác nhận, ai duyệt, đổi gì.

## Từ chối, huỷ

| Nút | Việc |
|---|---|
| Bỏ nhận | Huỷ phần nhập, phiếu về *chờ nhận* |
| Từ chối | Bên nhận không nhận hàng: huỷ phần xuất, bên chuyển được **trả lại tồn** |
| Huỷ phiếu | Huỷ cả hai phần (phiếu nháp: chỉ đổi trạng thái). Phiếu vẫn giữ lại để tra cứu, không xoá. Đang điều chỉnh thì huỷ điều chỉnh trước |

## Phiếu từ website bán hàng

Phiếu chuyển kho lập trên website vẫn tự vào sổ qua cầu nối như trước. Xem chung mọi phiếu chuyển, cả phần còn trên đường, ở **Bảng kê chuyển kho (HH01)**.
