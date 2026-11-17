# Thiết lập nhanh (TI15)

<!-- [2026-11-14 07:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-5 (00 §12): hướng dẫn màn Thiết lập nhanh -->

Dành cho **đơn vị mới**, chưa có chứng từ nào. Bốn bước, khoảng một phút: thông tin công ty, chế độ ghi sổ chuẩn, danh mục mẫu nếu muốn. Chỉ chủ đơn vị và kế toán trưởng (quyền *Cấu hình*) chạy được.

**Mở ở đâu:** nút **Thiết lập nhanh** trên thẻ *Đơn vị chưa có chứng từ nào* ở Tổng quan, hoặc menu **Thiết lập nhanh → Thiết lập nhanh** (TI15). Lần đầu vào Tổng quan trong phiên, phần mềm hỏi *Bắt đầu / Để sau*.

## Bốn bước

1. **Bắt đầu.** Chọn **Thiết lập công ty của tôi**. *Xem công ty mẫu* <!-- [2026-11-17 11:21 AM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-7 --> mở **Công ty Mẫu** — đơn vị riêng có ba tháng nghiệp vụ hư cấu, báo cáo có số: bấm *Mở Công ty Mẫu*, đăng nhập lại bằng cùng email và mật khẩu (mã đơn vị điền sẵn, thường là `mau`). Bản cài chưa có Công ty Mẫu thì thẻ này mờ.
2. **Công ty.** Tên công ty, mã số thuế (10 chữ số; chi nhánh thêm `-xxx`), địa chỉ, điện thoại. Bấm *Tiếp* là lưu, như sửa ở màn Thông tin đơn vị. Chế độ kế toán (Thông tư 99) và phương pháp tính thuế GTGT (khấu trừ) chỉ có một lựa chọn. **Ngành**: chọn gói mẫu có trong bản cài (hiện có *Thương mại bán lẻ*); ngành ghi "sắp có" chưa chọn được.
3. **Nạp gì.** Mỗi khối một hàng: tổng, đã có, sẽ thêm.
   - **Chế độ ghi sổ** luôn nạp, và chỉ nạp khi đơn vị còn trắng.
   - **Danh mục mẫu** (chi nhánh, đối tượng, mặt hàng hư cấu): mặc định tắt, tick khi muốn thử. Mã đã có thì bỏ qua, không sửa bản ghi của bạn.
   - **Danh mục chuẩn** (hệ thống tài khoản, loại thuế…) đã có từ lúc tạo đơn vị; xem ở Dữ liệu gốc (TI08).
   - Không có chứng từ mẫu: sổ của bạn để trống để nhập số thật.
4. **Đang nạp → Xong.** Từng khối hiện *chờ / đang nạp / xong / lỗi*. Lỗi thì bấm **Thử lại**: phần đã nạp giữ nguyên, không nhân đôi. Đóng màn giữa chừng không dừng việc nạp; mở lại TI15 là thấy tiến độ. Xong: nhập số dư đầu kỳ, lập phiếu thu đầu tiên, hoặc về Tổng quan.

## Khi nào không chạy được

| Phần mềm báo | Vì sao | Làm gì |
|---|---|---|
| *Đơn vị đã có dữ liệu nghiệp vụ* | Đã có chứng từ (kể cả nháp), không nạp mẫu chồng lên sổ thật | Danh mục chuẩn: dùng TI08. Muốn thử dữ liệu mẫu: dùng đơn vị khác |
| *chỉ chạy lại các khối đã nạp trước đây* | Đơn vị đã có chứng từ, khối xin nạp chưa từng nạp ở lần trước | Như trên — khối mới chỉ nạp vào đơn vị trắng |
| *Đang chạy một gói mẫu cho đơn vị này* | Có người khác vừa bấm nạp | Chờ xong; mở lại TI15 để xem tiến độ |
| Nút *Thiết lập nhanh* không có | Không có quyền *Cấu hình*, hoặc module tắt ở đơn vị | Nhờ chủ đơn vị |

Máy chủ: `GET /api/v1/setup/status`, `GET /api/v1/setup/presets/:id/plan`, `POST /api/v1/setup/presets/:id/apply`, `GET /api/v1/setup/runs/:id` ([BIZCITY-PRESET](../contracts/BIZCITY-PRESET-v1.md)).

## Công ty Mẫu <!-- [2026-11-17 11:21 AM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-7 -->

- Bản dùng thử (`scripts/cai-nhanh.sh`) cài mới là có sẵn **Công ty Mẫu** (mã đơn vị `mau`): ba tháng mua – bán – thu chi – kho – tài sản hư cấu, giá vốn và kết chuyển hai tháng đã qua. Đăng nhập bằng cùng email và mật khẩu quản trị.
- Ở Công ty Mẫu, đầu trang luôn có **dải vàng** *"Bạn đang xem Công ty Mẫu — số liệu hư cấu"*. Bấm *Bắt đầu với công ty của bạn* để đăng xuất, rồi đăng nhập mã đơn vị của công ty.
- Công ty Mẫu **không gửi được gì ra ngoài** và không kết nối ứng dụng ngoài — máy chủ từ chối (`SAMPLE_TENANT`).
- Người quản trị bản cài tắt bằng `BIZCITY_SAMPLE=` (trống) trước lần cài đầu ([docs/ops/DEPLOY.md](../ops/DEPLOY.md)).
