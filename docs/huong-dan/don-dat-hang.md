# Đơn đặt hàng (BH20)
<!-- [2026-11-17 Võ Hoàng] NGHIEM-THU — NT-BH-023: hướng dẫn màn Đơn đặt hàng (đóng góp) -->

Lập đơn đặt hàng / báo giá cho khách buôn, khách nợ, đơn livestream; giữ hàng cho đơn; giao nhiều lần, mỗi lần sinh một **phiếu bán nháp (BH10)** để kế toán duyệt. Đơn đặt hàng **không** ghi doanh thu — doanh thu, giá vốn ghi khi duyệt phiếu bán. Phiếu nghiệm thu: [NT-BH-023](../nghiem-thu/ban-hang/NT-BH-023-don-dat-hang.md).

## Mở màn
Menu trái → **Phần riêng** → **Phiếu bán nhập tay** → **Đơn đặt hàng**. Xem cần quyền `phieu-ban:read`; lập / sửa / gửi / giao cần `phieu-ban:write` (kế toán, kế toán trưởng, chủ đơn vị); **duyệt / từ chối** đơn chờ duyệt cần `phieu-ban:order-approve` (mặc định kế toán trưởng, chủ đơn vị).

## Trạng thái đơn

| Trạng thái | Ý nghĩa | Làm được |
|---|---|---|
| Nháp | Báo giá: có **hạn hiệu lực**, in được (**In báo giá**). Chưa giữ hàng | Sửa, Gửi, Huỷ |
| Chờ duyệt | Gửi mà khách vượt hạn mức nợ hoặc có nợ quá hạn — lý do hiện ở đầu đơn | Duyệt, Từ chối (về Nháp), Huỷ; sửa thì đơn về Nháp, gửi lại |
| Đã gửi | Đang giữ hàng ở kho KCB, giao dần | Giao, sửa số lượng (chuyển bù hàng giữ), Đóng đơn, Huỷ (khi chưa giao gì) |
| Đã đóng | Giao đủ, hoặc bấm Đóng đơn (phần chưa giao trả về kho bán) | Chỉ xem |
| Đã huỷ | Huỷ khi chưa giao gì | Chỉ xem |

## Lập đơn
1. Bấm **+ Lập đơn**. Chọn **cửa hàng**; **kho bán** để trống = kho mặc định của cửa hàng.
2. **Ngày đơn**, **Hiệu lực đến** (báo giá có hạn — quá hạn thì không gửi được, sửa ngày hiệu lực để gia hạn).
3. Khách: **mã khách** (khách có hạn mức nợ), hoặc tên + số điện thoại người đặt (đơn livestream). Đơn chưa có mã khách thì phải chọn khách trước khi giao.
4. Dòng hàng: mã, số lượng; **đơn giá** để trống = giá bán của cửa hàng; chiết khấu, quà như phiếu bán. Bấm **Ghi** — máy chủ tính lại tiền, thuế.

## Gửi, duyệt
- **Gửi**: phần mềm kiểm
  - **hạn mức nợ** của khách (danh mục đối tượng): nợ hiện tại + các đơn đang mở chưa giao + đơn này > hạn mức → **Chờ duyệt** ("Vượt hạn mức …: nợ … + đơn mở … + đơn này …"); hạn mức trống / 0 = không giới hạn;
  - **nợ quá hạn**: nợ cũ hơn *hạn thanh toán* của khách (trống = 30 ngày) chưa trả → **Chờ duyệt**;
  - không vướng → **Đã gửi**, giữ hàng ngay.
- **Duyệt / Từ chối**: kế toán trưởng / chủ đơn vị, ghi lý do. Người lập đơn **không tự duyệt** đơn của mình.
- Tồn kho bán thiếu thì vẫn gửi được: phần mềm giữ được bao nhiêu giữ bấy nhiêu và báo thiếu.

## Giữ hàng
Đơn Đã gửi được giữ hàng bằng **phiếu chuyển kho nội bộ** từ kho bán sang kho loại **KCB "Kho hàng chờ bán"** của cửa hàng (số lượng chưa giao). Sổ kho và báo cáo tồn theo kho thấy rõ hàng đang giữ; **máy bán chỉ bán tồn kho mặc định** nên không bán lấn hàng đã giữ. Sửa số lượng đơn → phiếu chuyển bù; Đóng / Huỷ → chuyển phần còn giữ về kho bán.

Loại chứng từ "Chuyển kho" đặt chế độ *chờ duyệt* (ACC14) thì phiếu giữ hàng nằm chờ kế toán duyệt rồi mới chuyển tồn.

## Giao hàng
Ở đơn Đã gửi, nhập **Giao lần này** ở từng dòng (≤ số còn lại) rồi bấm **Giao** → phần mềm lập **phiếu bán nháp** (BH10) xuất từ kho KCB, giá / chiết khấu / khuyến mại theo đơn, ghi "Giao theo đơn đặt hàng DH…". Kế toán duyệt phiếu bán ở BH10 là vào sổ. Giao đủ thì đơn tự **Đã đóng**.
- Hai người giao cùng lúc vượt số còn lại: một lần được, lần kia bị chặn.
- Sửa số lượng phiếu bán nháp đó → đơn cập nhật số đã giao; **xoá** phiếu nháp → đơn trả lại số đã giao (hàng vẫn ở kho KCB, giữ lại cho đơn).
- Kho KCB phải được tick vào nghiệp vụ "Xuất bán" ở Danh mục → Loại kho (DM18).

## Lịch sử
Thẻ **Lịch sử** của đơn: mọi lần lập, sửa (giá, chiết khấu, số lượng, khách, hạn), gửi, duyệt, từ chối, giữ / trả hàng, giao, đóng, huỷ — người, lúc, giá trị cũ → mới, ghi chú.

## Nạp đơn livestream
Thẻ **Nạp đơn livestream**: chọn cửa hàng, dán bảng từ Excel — mỗi dòng một mặt hàng: **Tên | SĐT | Mã hàng | SL | Đơn giá (trống = giá cửa hàng) | Mã khách (tuỳ chọn)**; cùng SĐT gom thành một đơn. Đơn **trùng** (cùng SĐT + cùng mã hàng trong 24 giờ): chọn *Chỉ báo* (không lập), *Gộp vào đơn cũ* hoặc *Giữ riêng*. Lập tay đơn livestream trùng thì form hiện nút **Gộp vào đơn này** / **Giữ riêng**.

## Cài đặt
Thẻ **Cài đặt**: chọn kho KCB giữ hàng cho từng cửa hàng (cần quyền ghi cấu hình). Cửa hàng chưa có kho KCB → khai ở Danh mục kho trước; chưa chọn thì gửi đơn báo "Cửa hàng … chưa có kho loại KCB".

## Chưa có (đợt sau)
- Nút "Lập chuyển kho" từ đơn khi cửa hàng thiếu hàng (Q12) — tạm lập tay ở KHO01.
- Đơn đặt hàng ở máy bán (Q9).
