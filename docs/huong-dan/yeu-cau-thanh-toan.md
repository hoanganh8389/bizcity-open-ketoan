# Yêu cầu thanh toán (CN05)

Đề nghị chi tiền cho nhà cung cấp, chủ nhà… có duyệt trước khi chi, giữ lại ai lập, ai duyệt, lúc nào.

## Vòng đời

Nháp → **Chờ duyệt** → (Đã duyệt cấp 1 →) **Đã duyệt** → **Đã chi**. Ngoài ra: Bị từ chối (sửa rồi gửi lại), Đã huỷ.

## Lập yêu cầu

1. Bấm **Lập yêu cầu**, chọn đối tượng nhận tiền.
2. Bảng **các khoản phải trả đang mở** của đối tượng hiện ra: bấm vào ô **Đề nghị trả** của khoản cần trả (tự điền số còn lại, sửa được để trả một phần).
3. Khoản chi **chưa ghi công nợ** (tạm ứng, chi trực tiếp): không chọn khoản nào, nhập số tiền và **TK ghi Nợ khi chi**.
4. Nhập hạn chi, hình thức (chuyển khoản / tiền mặt), nội dung, chứng từ nguồn.
5. **Lưu nháp** hoặc **Gửi duyệt**.

## Duyệt

- Người có quyền duyệt mở yêu cầu, bấm **Duyệt** hoặc **Từ chối** (ghi lý do).
- **Cấp duyệt thứ hai**: ở góc phải bộ lọc, kế toán trưởng đặt ngưỡng số tiền. Yêu cầu từ ngưỡng trở lên cần thêm chủ sở hữu duyệt cấp 2. Không đặt ngưỡng = mọi yêu cầu chỉ một cấp.

| Vai trò | Quyền |
|---|---|
| Kế toán | Lập, sửa, gửi duyệt, huỷ yêu cầu của mình; lập phiếu chi từ yêu cầu đã duyệt |
| Kế toán trưởng | Duyệt cấp 1; đặt ngưỡng hai cấp |
| Chủ sở hữu | Duyệt cấp 1 và cấp 2 |

## Chi

Mở yêu cầu **Đã duyệt**, chọn **ngày chi** và **tài khoản tiền** rồi bấm **Lập phiếu chi** (tài khoản 111) hoặc **Lập phiếu báo nợ** (tài khoản 112). Phần mềm:

- lập phiếu: Nợ tài khoản công nợ của từng khoản (hoặc TK ghi Nợ đã khai) / Có tài khoản tiền;
- trừ đúng vào các khoản phải trả đã chọn;
- chuyển yêu cầu sang **Đã chi**, ghi số phiếu.

Khoản phải trả đã được trả bằng cách khác trong lúc chờ duyệt (số đề nghị lớn hơn phần còn lại) thì phần mềm báo lỗi, không lập phiếu.

Yêu cầu đã chi muốn huỷ thì huỷ phiếu chi ở màn phiếu chi / báo nợ.
