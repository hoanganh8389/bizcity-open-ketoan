# Nhật ký kiểm khai báo (HT19)
<!-- [2026-11-19 Nguyễn Văn Thủy] hướng dẫn HT19 + cách đọc / báo lỗi khai báo (docs/nghiep-vu/25) (đóng góp) -->

Mỗi lần **lưu** một danh mục (hiện có: mặt hàng) ghi một dòng ở đây:
- lưu **đạt**, **lưu nháp**, **lưu nhưng có nhắc**, hay **bị chặn**;
- quy tắc nào chưa đạt (mã lỗi, câu báo);
- ai làm, lúc nào;
- **mã tra cứu** của lần lưu đó.

## Khi bấm Ghi bị báo lỗi

- Đầu form hiện dải đỏ **"N điều chưa đạt"**. Bấm vào để xem:
  - ✗ quy tắc chưa đạt: mã lỗi (vd `ITEM-BLOCK-003`), câu báo, cách sửa;
  - ✓ các quy tắc đã qua.
- Ô sai viền đỏ, chữ đỏ dưới ô.
- Nút **Chép** chép mã lỗi, câu báo, **mã tra cứu**, tên màn và giờ. Dán thẳng vào báo lỗi gửi người hỗ trợ.

## Thoát khi chưa ghi xong (thêm mặt hàng)

- Đang nhập thì phần mềm giữ bản dở trên máy.
- Bấm Huỷ bỏ / đóng form mà đã có mã + tên → hỏi **lưu thành Nháp**:
  - Đồng ý: mặt hàng hiện ở danh sách với cột **Tình trạng "Thiếu …"**. Nháp chưa dùng được trên chứng từ, đủ quy tắc thì tự thành đang dùng.
  - Không: lần **Thêm** sau hiện dòng "Có mặt hàng đang nhập dở" → **Mở lại** hoặc **Bỏ, nhập mới**.

## Cột Tình trạng (danh sách mặt hàng)

**Đủ** (xanh) hoặc **Thiếu N** (đỏ). Rê chuột thấy từng quy tắc: ✗ chưa đạt, ✓ đã qua.

## Lọc nhật ký

- **Từ ngày**, **Đối tượng**.
- **Mã lỗi**: tra mọi lần dính một quy tắc.
- **Tìm**: theo mã bản ghi, người làm, mã tra cứu.
- **Chỉ lượt có lỗi / nhắc**.

Người hỗ trợ nhận mã tra cứu → gõ vào ô Tìm để thấy đúng lần lưu. Lỗi kỹ thuật (máy chủ) thì tìm tiếp trong Grafana / Loki theo cùng mã.

## Nút "Mã lỗi" ở từng danh mục

Ở đầu mỗi danh mục (mặt hàng, nhóm hàng, đối tượng, nhóm đối tượng, đơn vị tính, ngân hàng, chi nhánh) có nút **Mã lỗi**. Bấm vào mở hộp thoại 3 thẻ:
- **Mã lỗi**: mọi mã của danh mục — mức (Chặn / Cảnh báo / Nhắc), báo khi nào, cách sửa.
- **Cài đặt**:
  - Bật / tắt từng **cảnh báo**. Bật thì khi lưu phải ghi lý do, tắt thì chỉ nhắc. Tắt cần ghi lý do; mỗi lần đổi đều ghi nhật ký.
  - Mã **Chặn** luôn bật (giữ đúng sổ sách).
- **Lịch sử lỗi**: các lần lưu bị lỗi của danh mục này, mỗi dòng có nút **Chép** để gửi báo lỗi.

Màn HT19 ở trên là nơi xem chung mọi danh mục.

Danh sách đủ mã lỗi: [Tra mã lỗi](ma-loi/README.md).
