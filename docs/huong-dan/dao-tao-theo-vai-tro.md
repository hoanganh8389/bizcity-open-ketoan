# Tài liệu đào tạo theo vai trò

Mỗi vai trò một danh sách việc thường làm, kèm mã màn hình (gõ mã vào ô tìm ở đầu trang để mở nhanh). Mỗi màn có nút **Hướng dẫn** giải thích chi tiết. Quyền của từng vai trò: xem hướng dẫn **Người dùng (HT01)**.

## Kế toán viên

Học trước (buổi 1):

| Việc | Màn hình |
|---|---|
| Xem chứng từ bán hàng gửi sang, xử lý chứng từ lỗi | Định khoản tự động ACC14, BC kiểm tra chứng từ ACC93 |
| Lập phiếu thu, phiếu chi, báo nợ, báo có; in, in liên tục nhiều phiếu; ký xác nhận người lập | ACC51, ACC52, ACC53, ACC54 |
| Lập phiếu kế toán, lập từ bút toán mẫu | ACC16, BT01 |
| Thu tiền khách, trả tiền nhà cung cấp gạch đúng khoản nợ | Phiếu thu / chi (mục "Thanh toán cho khoản công nợ"), Khoản công nợ CN01 |

Học sau (buổi 2):

| Việc | Màn hình |
|---|---|
| Ghi tăng / giảm công nợ phải thu, phải trả; đặt cọc | CN02, CN03, CN04 |
| Lập yêu cầu thanh toán, chờ duyệt rồi lập phiếu chi | CN05 |
| Bổ sung thông tin thuế cho hoá đơn; nhập hoá đơn từ cổng cơ quan thuế, đối chiếu | ACC78, THUE01 |
| Thẻ tài sản, công cụ; hạch toán ghi tăng, ghi giảm / thanh lý | ACC28, ACC22, ACC23 |
| Biên bản đối chiếu công nợ | CN07 |
| Xem sổ: sổ chi tiết tài khoản, sổ quỹ, sổ chi tiết công nợ | ACC12, ACC76, ACC40 |

Lưu ý: chỉ sửa / huỷ được phiếu do mình lập; phiếu bị khoá kỳ hoặc khoá theo ngày thì chỉ xem được (dòng báo lý do hiện trên phiếu).

## Kế toán trưởng

Gồm việc của kế toán viên, thêm:

| Việc | Màn hình |
|---|---|
| Duyệt yêu cầu thanh toán | CN05 |
| Cuối tháng: tính giá vốn, tính khấu hao / phân bổ, kết chuyển lãi lỗ | ACC49, ACC31, ACC6 |
| Đóng kỳ: xem bảng kiểm, khoá kỳ theo chi nhánh × loại chứng từ; khoá theo ngày | ACC2 |
| Cấn trừ công nợ theo hoá đơn | BT03 |
| Kế hoạch thu chi, định mức chi phí, so thực hiện | KH01, KH02 |
| Cảnh báo hoá đơn rủi ro, danh sách người nộp thuế rủi ro | THUE02 |
| Tờ khai thuế GTGT, quyết toán TNDN | ACC66, TNDN03 |
| Báo cáo tài chính, cân đối phát sinh | ACC8, ACC9, ACC10 |
| Ký xác nhận kế toán trưởng trên phiếu (từng phiếu hoặc hàng loạt) | ACC51 … ACC16 |
| Cấu hình hạch toán: tài khoản ngầm định, mặt hàng – tài khoản, lý do – tài khoản | ACC41, ACC17, ACC18 |

Trình tự cuối tháng: **tính giá vốn → tính khấu hao, phân bổ → kết chuyển lãi lỗ → xem báo cáo → khoá kỳ**.

## Chủ đơn vị (giám đốc)

| Việc | Màn hình |
|---|---|
| Xem Tổng quan và khung "Cần chú ý" (công nợ quá hạn, kỳ hợp đồng sắp đến, hợp đồng sắp hết hạn) | Tổng quan |
| Duyệt cấp 2 yêu cầu thanh toán vượt hạn mức | CN05 |
| Ký xác nhận giám đốc trên phiếu | ACC51 … ACC16 |
| Người dùng, vai trò; thông tin đơn vị, logo; khoá API cho hệ thống khác | HT01, HT03, HT02 |
| Theo dõi yêu cầu nghiệp vụ đã đáp ứng | YC01 |

## Người chỉ xem

Xem báo cáo, sổ, danh mục; không lập, sửa phiếu. Dùng các màn nhóm **Báo cáo chung**, **Báo cáo công nợ**, **BC Quỹ & ngân hàng**, **Báo cáo thuế**; bấm **Xuất Excel** ở mọi bảng để lấy số.

## Thu ngân cửa hàng

Thu ngân bán hàng trên phần mềm bán hàng (POS), không cần dùng phần mềm kế toán: hoá đơn, phiếu trả hàng, tiền thu được gửi sang tự động. Khi kế toán hỏi lại chứng từ, thu ngân chỉ cần cung cấp **số phiếu bán** in trên bill.
