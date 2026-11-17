# NT-DM-001 · Bỏ tên tiếng Anh của tài khoản (ACC1 và CSDL)
<!-- [2026-11-17 10:30 AM kiennt] NGHIEM-THU — tạo phiếu. -->

| | |
|---|---|
| Phân hệ | danh mục (Hệ thống tài khoản) |
| Màn hình | ACC1 Hệ thống tài khoản |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 17/11/2026 |
| Trạng thái | Nháp — chờ chủ duyệt chữ chốt [D023-9](../../phases/PHASE-023-THE-TAI-KHOAN/00-MASTER-PLAN.md#9-chữ-chốt-d023-9--bỏ-tên-tiếng-anh-của-tài-khoản) |

## 1. Mục đích quản trị
Form tài khoản (ACC1) có khung **Tên tài khoản theo ngôn ngữ** (ô *Tên tiếng Anh*). Khung này chỉ để hiển thị: không dùng trong định khoản, báo cáo, BCTC hay bản in. Bỏ hẳn khung này cho form gọn.
- Bỏ khỏi màn, API, file Excel, dữ liệu mẫu và CSDL.
- Tên tiếng Anh đơn vị đã khai **không mất**: được chép sang bảng lưu trước khi xoá cột.

## 2. Khai báo trước
- Đơn vị có hệ thống tài khoản mẫu (TT99), trong đó tài khoản `1111` có *Tên tiếng Anh* = `Cash in VND`, tài khoản `131` để trống.
- Một tệp Excel hệ thống tài khoản xuất từ bản cũ (còn cột "Tên tiếng Anh").

## 3. Các bước thao tác
1. Cập nhật lên bản có migration `0147`.
2. Mở **ACC1**, bấm đúp tài khoản `1111` để mở chi tiết, rồi bấm **Sửa**.
3. Thêm tài khoản con `11111 – Tiền mặt quầy 1`, rồi **Lưu**.
4. **Xuất Excel** hệ thống tài khoản.
5. **Nhập Excel** bằng tệp cũ ở mục 2.

## 4. Số liệu đầu vào

| Tài khoản | Tên | Tên tiếng Anh trước khi cập nhật |
|---|---|---|
| 1111 | Tiền Việt Nam | Cash in VND |
| 131 | Phải thu của khách hàng | (trống) |

## 5. Kết quả mong đợi

**Trên chứng từ / màn hình:**

| Mục | Mong đợi |
|---|---|
| Form tài khoản ACC1 | Không còn khung *Tên tài khoản theo ngôn ngữ* / ô *Tên tiếng Anh* |
| Lưới ACC1 | Không còn cột (ẩn) *Tên tiếng Anh*; bật / tắt cột không thấy cột này |
| Thêm tài khoản 11111 | Lưu được như thường |
| Xuất Excel | Không có cột *Tên tiếng Anh* |
| Nhập Excel tệp cũ | Nhập được; cột *Tên tiếng Anh* bị bỏ qua, không báo lỗi |
| CSDL | Bảng `accounts` không còn cột `name_en`; `accounts_name_en_luu` có đúng 1 dòng của đơn vị: `1111` – `Cash in VND` (dòng trống không chép) |
| API | `GET /api/v1/accounts` không trả `nameEn`; gửi `nameEn` khi lưu không lỗi, bị bỏ qua |

**Bút toán:** không có. Không đổi định khoản, không đụng sổ.

**Báo cáo phải thấy:** báo cáo, BCTC, bản in không đổi (vốn không dùng tên tiếng Anh).

**Sai số làm tròn chấp nhận:** không áp dụng.

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Chạy migration lần hai (bản cài đã cập nhật) | Không lỗi, không chép trùng |
| 2 | Đơn vị chưa khai tên tiếng Anh tài khoản nào | Bảng lưu không có dòng của đơn vị; cột vẫn bị xoá |
| 3 | Cần lấy lại tên tiếng Anh | Có ở `accounts_name_en_luu` (đường lui ở chữ chốt D023-9) |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-dm-001-bo-ten-tieng-anh-tai-khoan.test.ts` (đề xuất, chưa có — viết ở nhánh code) |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 17/11/2026 | Tạo phiếu (chờ chủ duyệt D023-9) |
