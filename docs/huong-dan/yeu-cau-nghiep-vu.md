# Yêu cầu nghiệp vụ (YC01)

Bảng theo dõi từng yêu cầu trong **file yêu cầu xây dựng hệ thống của công ty** (sheet Tài chính – Kế toán) và phần mềm đã đáp ứng tới đâu. Dùng cho:

- **Nhóm phát triển**: biết yêu cầu nào đã xong, còn thiếu gì, dự kiến làm ở đợt nào.
- **Kế toán**: biết phần mềm đã có chức năng đó chưa, ở màn nào, đọc hướng dẫn ở đâu.

Mục tiêu: đến khi xong phiên bản 1, mọi yêu cầu trong bảng đều ở trạng thái **Đã đáp ứng** (trừ phần chờ công ty gửi đầu vào).

## Đọc bảng

| Cột | Ý nghĩa |
|---|---|
| Mục | Mã yêu cầu đúng như file của công ty (DM-001, FI-001, AP-001…). Các yêu cầu không có mã trong file được đặt mã TAX-, BC-, CHUNG- |
| Chức năng | Tên chức năng trong file |
| Trạng thái | **Đã đáp ứng** (mọi tính năng đã có) · **Một phần** · **Chưa làm** · **Chờ đầu vào** (chờ công ty gửi mẫu, chốt cách làm) |
| Tính năng | Số tính năng đã có / tổng số dòng "Tính năng yêu cầu" của chức năng đó |
| Màn hình | Bấm để mở màn. Mã xám là màn chưa làm |
| Phần còn lại | Đợt dự kiến làm nốt |

Bấm một dòng để xem từng tính năng (kèm ghi chú phần còn thiếu), phần mềm đã đáp ứng thế nào, và nút mở **hướng dẫn sử dụng** của chức năng.

Phía trên bảng: tỷ lệ tính năng đã có và số yêu cầu theo từng trạng thái (bấm để lọc).

**Xuất Excel**: tệp giữ bố cục của file yêu cầu (Mục, Chức năng, Tính năng yêu cầu), thêm cột trạng thái, ghi chú, cách đáp ứng, màn hình, hướng dẫn — để gửi lại công ty hoặc họp rà soát.

## Cập nhật (nhóm phát triển)

Dữ liệu nằm ở `apps/web/src/features/requirements/finance-requirements.ts`. Làm xong (hoặc làm thêm một phần) yêu cầu nào thì sửa ngay mục đó trong cùng lần thay đổi mã:

1. Đổi `status` của tính năng: `done`, `partial`, `todo`, `waiting`; ghi `note` nếu còn thiếu.
2. Viết lại `solution` (viết cho kế toán đọc), thêm mã màn vào `screens`, tên tài liệu vào `guides`, đổi `updated`.
3. Viết / cập nhật tài liệu `docs/huong-dan/<tên>.md` của chức năng.

Không sửa câu chữ, thứ tự yêu cầu của công ty. Công ty gửi bản yêu cầu mới thì cập nhật cả danh sách tính năng cho khớp.
