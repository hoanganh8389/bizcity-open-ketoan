# 09. Báo lỗi tại ô cho mọi hộp thoại

<!-- [2026-11-11 Nguyễn Văn Thủy] bấm Ghi mà ô bắt buộc trống → viền đỏ + chữ đỏ, không còn nút Ghi mờ im lặng (đóng góp) -->

Trước: thiếu thông tin thì nút Ghi mờ đi (không biết thiếu gì) hoặc báo một dòng chung chung. Giờ áp chung cho **mọi hộp thoại** (form danh mục `Modal` và form chứng từ `VoucherModal`), không phải sửa từng form.

## 1. Người dùng thấy gì

- Bấm **Ghi / Lưu** (hoặc **Ctrl + S**) mà ô bắt buộc còn trống: ô đó **viền đỏ**, nhãn đỏ, dòng chữ "… không được để trống" dưới ô; con trỏ nhảy vào ô thiếu đầu tiên; chân hộp thoại ghi "Còn N ô bắt buộc chưa nhập: …". Không ghi.
- Bấm vào nút Ghi **đang mờ**: cũng rà và tô đỏ ô thiếu; không thiếu ô nào thì nói lý do khoá (chú thích của nút).
- Gõ / chọn vào ô đỏ thì ô đó hết đỏ; hết ô đỏ thì dòng báo ở chân cũng tắt.
- Đầu phiếu chứng từ (lưới chật): chỉ viền đỏ; dòng chữ lỗi hiện khi rê chuột / đứng ở ô.
- Form có lỗi riêng (vd số tài khoản trùng) báo đỏ ngay tại ô đó.
- **Máy chủ từ chối** lần ghi (sai định dạng, quá dài, trùng…): câu lỗi gắn vào đúng ô — khớp chính xác theo tên trường khi ô khai `truong`, không thì theo nhãn ô có trong câu lỗi (lấy nhãn dài nhất). Câu không nhắc ô nào thì vẫn báo như cũ.
- **Phiếu mua (MH11)**: bấm Ghi / Gửi duyệt / Duyệt mà thiếu → ô đầu phiếu đỏ (Chi nhánh, Nhà cung cấp, Lý do nhập ngoài đơn…), ô **dòng hàng** lỗi tô đỏ (thiếu mã, số lượng ≤ 0, hàng mua chưa có đơn giá), chân màn ghi lý do.

## 2. Ô nào là bắt buộc

Nhận theo cách form đã đánh dấu sẵn: nhãn có `(*)` (`Field label="Tên (*)"`), nhãn đỏ có dấu * ở đầu phiếu (`L req`), hoặc phần tử tự khai `data-bat-buoc="Tên ô"`. Bỏ qua ô đang ẩn, ô khoá, ô tự cấp (placeholder "Tự cấp khi ghi"…).

## 3. Kỹ thuật

- `components/kiemLoi.ts`: rà ô (`kiemBatBuoc`), bỏ đỏ (`boLoiO`), nhận nút Ghi (`laNutGhi`: btn-primary hoặc chữ Ghi / Lưu).
- `components/useKiemLoi.tsx`: hook gắn vào thân + chân hộp thoại (bắt bấm nút ở pha capture; nút khoá có `pointer-events: none` nên dò theo toạ độ), dùng ở `ui.tsx` Modal và `voucher/VoucherModal.tsx` (cả Ctrl + S).
- `Field` thêm `error` (viền đỏ + chữ đỏ). CSS `.o-loi`, `.o-loi-chu`, `.modal-loi` trong `theme.css`.
- Lỗi máy chủ: `lib/api.ts` phát sự kiện `ketoan:api-loi` khi lần ghi bị từ chối (4xx trừ 401 / 403); hộp thoại trên cùng gọi `ganLoiMayChu`. Máy chủ (`platform/core/http.ts`) trả thêm `error.fields: [{ path, message }]` cho lỗi kiểm dữ liệu, `details` giữ nguyên khuôn câu; test `accounts.test.ts`. Ô khai `<Field truong="name">` để khớp chính xác.
- Phiếu mua: `useKiemLoi(locked, { lyDo })` (lý do riêng của phiếu) + `kl.daKiem` để tô ô dòng hàng. Bộ rà chỉ gỡ ô do nó tô (`data-tk`), không đụng lớp đỏ React đặt.
