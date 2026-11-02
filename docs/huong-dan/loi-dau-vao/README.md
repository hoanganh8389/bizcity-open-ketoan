# Lỗi đầu vào — bài học theo mã
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1: mục lục trang bài học IN-* -->

Mỗi phát hiện của Trạm tiền kiểm (ADR-0014) có một mã `IN-*` và một trang ở đây: vì sao kế toán cần, ví dụ sai, ví dụ đúng, sửa ở đâu. Danh mục gốc: `packages/contracts/src/intake-findings.ts`; bảng hợp đồng: [BIZCITY-INTAKE-FINDINGS-v1](../../contracts/BIZCITY-INTAKE-FINDINGS-v1.md).

| Mã | Tên | Mức |
|---|---|---|
| [IN-SHAPE-001](IN-SHAPE-001.md) | Thiếu trường bắt buộc | block |
| [IN-SHAPE-002](IN-SHAPE-002.md) | Sai kiểu dữ liệu | block |
| [IN-SHAPE-003](IN-SHAPE-003.md) | Ngày không đúng định dạng YYYY-MM-DD | block |
| [IN-SHAPE-004](IN-SHAPE-004.md) | Loại chứng từ không có trong khuôn nạp | block |
| [IN-SHAPE-005](IN-SHAPE-005.md) | Quá độ dài / quá số lượng cho phép | block |
| [IN-SHAPE-006](IN-SHAPE-006.md) | Giá trị ngoài danh sách cho phép | block |
| [IN-SUM-001](IN-SUM-001.md) | Tổng các dòng khác tổng chứng từ | block |
| [IN-SUM-002](IN-SUM-002.md) | Phân bổ thanh toán lớn hơn số tiền phiếu | block |
| [IN-SUM-005](IN-SUM-005.md) | Tổng thanh toán khác tiền trước thuế + thuế | block |
| [IN-SUM-006](IN-SUM-006.md) | Tổng thuế khác cộng thuế các dòng | block |
| [IN-SUM-003](IN-SUM-003.md) | Thuế dòng khác tiền trước thuế × thuế suất | warn |
| [IN-SUM-004](IN-SUM-004.md) | Đơn giá × số lượng − chiết khấu khác thành tiền dòng | warn |
| [IN-MD-001](IN-MD-001.md) | Chi nhánh (mã cửa hàng) chưa có | block |
| [IN-MD-004](IN-MD-004.md) | Mã hàng chưa có trong danh mục | hint |
| [IN-MD-005](IN-MD-005.md) | Mã số thuế đối tượng sai định dạng | warn |
| [IN-BIZ-003](IN-BIZ-003.md) | Mã chứng từ không thuộc nguồn gửi | block |
| [IN-BIZ-004](IN-BIZ-004.md) | Phiên bản cũ hơn bản đã nhận | block |
| [IN-BIZ-005](IN-BIZ-005.md) | Cùng phiên bản nhưng nội dung khác bản đã nhận | warn |
| [IN-BIZ-006](IN-BIZ-006.md) | Số hoá đơn đã có ở chứng từ khác | warn |
| [IN-BIZ-007](IN-BIZ-007.md) | Ngày hoá đơn cách ngày chứng từ hơn 5 ngày | hint |
