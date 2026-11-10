# 18. Công tắc lý do hạch toán (mặc định tắt)

<!-- [2026-11-10 09:30 PM Nguyễn Văn Thủy] PHASE-026 — kế hoạch bỏ lý do khỏi người dùng; tài khoản chỉ khai ở ACC41 + ACC92 (đóng góp) -->

Hướng ban đầu (đã thay bằng công tắc, xem mục dưới):
- Người dùng không còn thấy khái niệm "lý do hạch toán".
- Tài khoản chỉ khai ở hai nơi: **Tài khoản ngầm định (ACC41)** và **quy tắc ở Thiết kế hạch toán (ACC92)**.
- Lõi vẫn đọc được mã lý do cũ, để sổ đã ghi và cầu nối website (đang gửi `reasonCode`) không phải sửa.

## Chốt lại (10/11/2026, muộn): giữ lý do, thêm công tắc

Không xoá lý do. Thêm khoá cài đặt **`bizcity.posting.use_reasons`** (Trung tâm cấu hình, có ngày hiệu lực, mặc định **tắt**):

| | Tắt (mặc định) | Bật |
|---|---|---|
| Định khoản | Không đọc tài khoản trên lý do. Tài khoản theo **ACC41** + nghiệp vụ của loại chứng từ + nhóm hàng + quy tắc **ACC92** | Tài khoản trên lý do (đối ứng, doanh thu / trả lại, giá vốn, chi phí mua) **đè** lên như phần mềm cũ |
| Giao diện | Ẩn ô Lý do (phiếu thu chi, phiếu kế toán), ẩn màn ACC18 khỏi menu | Hiện như cũ |

- Đọc theo **ngày chứng từ**: bật / tắt từ một ngày, chứng từ trước ngày đó giữ cách cũ khi định khoản lại.
- Mã lý do trên chứng từ vẫn nhận (website gửi kèm). Khi tắt, mã chỉ dùng để chọn **nghiệp vụ tự tạo** ở ACC92 (quy tắc riêng) và để báo cáo.
- Cờ cách tính trên lý do (bán nội bộ theo giá bán, trả NCC theo giá đầu kỳ, khoản mục) chưa theo công tắc.
- Sau này bỏ hẳn: rà khoá `bizcity.posting.use_reasons` và các chỗ đọc (`useReasonsAt`, `AccountResolver.onReason`, `useUseReasons`).
- **Sổ thật**: cập nhật bản này xong thì bật tạm công tắc cho tới khi kế toán khai xong quy tắc cho các trường hợp riêng (hàng hỏng, tặng, xuất dùng…), rồi mới tắt.

Phần dưới là phương án "bỏ hẳn" đã cân nhắc trước đó, giữ để tham khảo.

## Vì sao

- Lý do (ACC18) và ACC41 / ACC92 đang cùng khai tài khoản cho một việc. Hai nơi thì dễ lệch, kế toán không biết sửa chỗ nào.
- Bán, mua, trả hàng, chuyển kho chỉ có một trường hợp; phần mềm tự biết, không cần ô chọn.
- Chỗ thật sự cần phân biệt là xuất / nhập điều chỉnh kho và thu / chi khác. Ở đó người dùng chọn **loại nghiệp vụ** bằng chữ dễ hiểu (hàng hỏng, mất, dùng nội bộ, tặng khách, kiểm kê thiếu, lương, thuê cửa hàng…).
- Loại nghiệp vụ cũng là dữ liệu cho báo cáo lô / lần nhập: tỷ lệ hỏng, hết hạn theo NCC (xem [16-lo-hang](16-lo-hang.md)).

## Các đợt

| Đợt | Việc | Ảnh hưởng sổ |
|---|---|---|
| 1 (đã xong) | Bỏ ô lý do ở **KHO01**. Phiếu đi theo nghiệp vụ chuyển kho mặc định | Không đổi |
| 2 | Xuất / nhập điều chỉnh kho, thu / chi: ô "Loại nghiệp vụ" thay ô lý do. Tài khoản của từng loại chuyển thành quy tắc ACC92 với điều kiện mới `kind` (loại nghiệp vụ). Sinh quy tắc từ các lý do đang có tài khoản riêng (khoảng 100 lý do ở đơn vị tgs) | Đối chiếu bút toán trước / sau của mọi chứng từ: phải bằng nhau |
| 3 | Hai cách tính đặc biệt đang là cờ của lý do thành tuỳ chọn của nghiệp vụ: `costAtSalePrice` (bán nội bộ, giá vốn theo giá bán) và `returnAtOpeningCost` (trả NCC theo giá đầu kỳ) | Đối chiếu giá vốn |
| 4 | ACC18 chỉ còn để tra cứu mã cũ. Cầu nối website gửi mã cũ thì lõi quy về loại nghiệp vụ tương ứng | Không đổi |

## Ví dụ lý do đang mang tài khoản riêng (đơn vị tgs)

| Nhóm | Lý do → tài khoản |
|---|---|
| Xuất điều chỉnh | XHH01 huỷ hàng hỏng → 6328 · XHH02 mất / thất thoát → 8115 · XHH03 huỷ cận date → 13881 / 7118 · XCXL hàng thiếu chờ xử lý → 1381 · XSD1 / XSD2 xuất dùng bộ phận bán hàng / quản lý → 64128 / 64232 · XMKT1 khách dùng thử → 64184 · XTA* tặng / ngoại giao / thưởng → 6418x / 6428x / 64113 · XDT_641 / XDT_642 đào tạo → 64185 / 64285 |
| Nhập điều chỉnh | NKKT kiểm kê thừa → 7118 · NKKB thừa được cấn trừ → 1311 / 6321 · NQUA nhận quà không hoá đơn → 71153 · DCGV-HKM → 6323 |
| Bán | XCN bán chi nhánh khác → 13681 / 51116 / 6326 (giá vốn theo giá bán) · XDTK doanh thu khác → 5118 / 6328 |
| Thu / chi | CNV01 lương → 33411 · Tra01 thuê cửa hàng → 242111 · Tra02 nộp thuế thay chủ nhà → 242112 · CPQL → 64288 · TBNH thu tiền chi nhánh khác → 13681 |

Danh sách đầy đủ lấy từ bảng `posting_reasons` của từng đơn vị khi chạy đợt 2.
