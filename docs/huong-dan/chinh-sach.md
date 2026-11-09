# Chính sách (HT15)
<!-- [2026-11-09 03:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4b (S031-18 / S031-24): hướng dẫn màn Chính sách -->

**Màn này trả lời bốn câu:** đơn vị đang có những chính sách nghiệp vụ nào (khuyến mại, chiết khấu…), chứng từ nào đã áp bản nào, việc nào cần kế toán xem, và việc thực hiện có đúng chính sách không. Mở ở *Hệ thống → Chính sách*; cần quyền xem danh mục (`catalog:read`).

Màn **chỉ đọc**. Chính sách được phát hành ở module chủ (ví dụ Bán hàng, Mua hàng) hoặc qua API; ở đây bạn xem và đóng việc "đã xem", không sửa chính sách.

## Bốn tab

### 1. Chính sách

Mỗi chính sách là một thẻ: mã, khuôn luật, module chủ, và **bản đang áp hôm nay**. Bảng bên dưới liệt kê **mọi bản** (bản cũ không mất): hiệu lực theo **ngày chứng từ** (không phải ngày nhập), trạng thái, mã băm nội dung, người phát hành, lý do. Con số ở cột *Chứng từ đã áp* bấm được: mở danh sách chứng từ đã gửi tham chiếu tới bản đó, kèm mã lệch nếu có.

- **Khoảng trống**: có ngày chứng từ không bản nào phủ — cần xem lại ngày áp.
- **Hết hạn**: bản cuối đã có ngày kết thúc, chưa có bản kế tiếp.
- Gõ vào ô tìm để lọc theo mã chính sách.

### 2. Chờ kế toán xem

Chứng từ **đã ghi sổ** nhưng chính sách đi kèm có điểm cần xem (ví dụ bán bằng bản cũ, tham chiếu không có trong sổ đăng ký). Mặc định phần mềm không chặn chứng từ vì lý do này — nó nhắc để bạn xem.

- **Truy vết**: mở chuỗi chính sách của chứng từ ở tab Truy vết.
- **Đánh dấu đã xem** (cần quyền ghi chứng từ): việc rời danh sách và để lại một dòng bằng chứng (ai, lúc nào, ghi chú). **Chứng từ không bị sửa.** Nếu chứng từ được kiểm lại và có kết quả mới, việc hiện lại.
- Số trên nhãn tab là số việc đang chờ.

### 3. Truy vết

Nhập khoá chứng từ (ví dụ `pos:CN01:HD0001`). Màn cho biết chứng từ đã áp chính sách nào, bản nào, và với mỗi tham chiếu:

- **Trong sổ đăng ký**: bản đó có thật không.
- **Băm**: *Khớp* nghĩa là nguồn dùng đúng nội dung đã phát hành; *Lệch* là nội dung nguồn dùng khác bản đã phát hành.
- **Ngày chứng từ**: *Trong hiệu lực* hay *Ngoài hiệu lực* của bản đó (kèm khoảng hiệu lực).

### 4. Theo dõi thực hiện

Các ô trong một kỳ (mặc định 30 ngày theo ngày chứng từ; lọc được theo chi nhánh, nguồn, module chủ):

| Ô | Ý nghĩa |
|---|---|
| Đạt chính sách | Tỉ lệ chứng từ qua cả ba phép kiểm (có trong sổ, băm khớp, đúng ngày). "—" khi kỳ chưa có chứng từ nào gửi tham chiếu |
| Chứng từ đã áp | Số chứng từ có tham chiếu chính sách và tổng tiền |
| Lệch theo mã | Mã cảnh báo `IN-POL-*` gặp nhiều nhất; bấm mã trong trang giải thích lỗi đầu vào để biết cách sửa |
| Sức khoẻ sổ đăng ký | Chính sách sắp hết hạn (30 ngày), không còn bản phát hành, hoặc có khoảng trống |
| Độ phủ theo nguồn | Nguồn bán nào chưa gửi tham chiếu dù đã có chính sách hiệu lực |
| Độ trễ phiên bản | Nguồn nào còn bán bằng bản cũ, và bản cuối nguồn đó đã gửi |
| Dòng thời gian | Các bản có hiệu lực trong kỳ |

Chưa có ô *Thực hiện chương trình* (số lượng hàng tặng, ngân sách): cần nguồn gửi kèm kết quả tính, sẽ có ở đợt sau.

## Mã cảnh báo thường gặp

| Mã | Nghĩa |
|---|---|
| `IN-POL-001` | Tham chiếu không có trong sổ đăng ký, hoặc băm khác bản đã phát hành |
| `IN-POL-002` | Bản được nêu không phủ ngày chứng từ và không có bản mới hơn phủ |
| `IN-POL-003` | Nguồn dùng bản cũ trong khi đã có bản mới hơn phủ ngày chứng từ — nguồn cần làm mới chính sách |

Các mã này chỉ **cảnh báo** theo mặc định. Đơn vị muốn chặn thì đặt khoá `bizcity.intake.policy_check` = `strict` (chứng từ có mã này chờ duyệt thay vì ghi sổ ngay).

## Với người phát triển nguồn ngoài (POS, Woo, sàn)

Lấy chính sách bằng `GET /api/v1/policies`, tính theo khuôn luật, gửi `policyRefs` kèm chứng từ; nghe `bizcity.policy.published` để biết khi nào có bản mới. Chi tiết: hợp đồng `bizcity_policy@1`.
