# Sổ kho / Tồn kho theo mặt hàng (MH24, MH25)

Hai báo cáo kho nằm ở nhóm **Báo cáo mua hàng**. Số liệu lấy từ sổ kho của phần mềm (mọi phiếu nhập, xuất, chuyển, điều chỉnh đã ghi sổ), không phụ thuộc hệ thống bán hàng.

**Bộ lọc bên trái**: tích **chi nhánh** → các **mã kho** của chi nhánh hiện bên dưới để tích tiếp (không tích kho, hoặc tích đủ hết kho = mọi kho), bấm **Tìm kiếm**. Dòng phát sinh không ghi kho được tính vào **kho mặc định** của chi nhánh.

**Chỉ chạy khi bấm Tìm kiếm**: mở màn chưa tính gì; đổi ngày, chi nhánh, kho, mã hàng cũng chưa chạy — bấm **Tìm kiếm** mới chạy. Lúc đang tính có **thanh chạy + số giây**, bấm **Huỷ** để dừng; xong hiện "Xong trong … giây · … dòng". Chọn tất cả chi nhánh từ đầu năm là việc nặng (phải cộng cả lịch sử kho để ra tồn đầu): cần nhanh thì thu hẹp chi nhánh / kho. Báo **504** = quá thời gian chờ của máy chủ → thu hẹp rồi tìm lại.

## Sổ kho theo mặt hàng (MH24)

Mỗi mặt hàng một dòng, số lượng theo ĐVT nhỏ nhất, trong kỳ Từ ngày – Đến ngày. Mỗi luồng một màu:

| Cột | Gồm |
|---|---|
| Σ tồn đầu | tồn trước ngày đầu kỳ |
| Σ nhập | nhập mua |
| Σ nhập lại | khách hoàn trả lại hàng |
| Σ nhập nội bộ | chiều **nhận** của phiếu chuyển kho |
| Σ xuất nội bộ | chiều **xuất** của phiếu chuyển kho |
| Σ xuất bán | xuất bán (không gồm phiếu xuất điều chỉnh) |
| Σ xuất trả | trả hàng về nhà cung cấp |
| Σ xuất điều chỉnh | phiếu xuất điều chỉnh của cửa hàng |
| SL điều chỉnh (±) | điều chỉnh cân tồn / kiểm kê — giữ dấu: dương tăng, âm giảm |
| Khác | phát sinh ngoài các luồng trên (vd nhận / xuất quà ở mua hàng) — luôn cộng vào để sổ cân |
| Σ tồn cuối | = tồn đầu + nhập + nhập lại + nhập nội bộ − xuất nội bộ − xuất bán − xuất trả − xuất điều chỉnh + SL điều chỉnh + khác |

## Tồn kho theo mặt hàng (MH25)

Mỗi **kho – mặt hàng** một dòng, tồn tại ngày **Đến ngày**:

| Cột | Ý nghĩa |
|---|---|
| Kho, Chi nhánh | mã kho đang giữ tồn |
| Alias | mã vạch của mặt hàng |
| Số lượng | tồn (ĐVT nhỏ nhất) |
| Đơn giá, Thành tiền | theo giá vốn bình quân / giá trị chứng từ; tháng chưa tính giá vốn thì chưa đủ |
| SL đi đường | hàng đã xuất chuyển đến chi nhánh nhưng chưa nhận — tính vào kho mặc định của chi nhánh nhận |
| Tồn max, Tồn min | khai theo kho ở **Tồn max (MH16)** |
| SL cần nhập | = tồn max − số lượng; **âm** = đang dư so với tồn max; trống = chưa khai tồn max |

Dòng **Tổng cộng** ở cuối bảng; lọc theo cột, **Xuất Excel** xuất đúng các dòng đang xem.
