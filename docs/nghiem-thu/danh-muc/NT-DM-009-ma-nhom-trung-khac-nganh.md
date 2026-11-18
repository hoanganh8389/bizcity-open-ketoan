# NT-DM-009 · Mã nhóm hàng: chỉ chặn trùng nhóm cùng cha và trùng tên nhóm cha
<!-- [2026-11-18 03:10 PM kiennt] NGHIEM-THU — tạo phiếu. -->

| | |
|---|---|
| Phân hệ | danh mục |
| Màn hình | DM11 Danh mục nhóm hàng (thêm / sửa nhóm, nhập Excel) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 18/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Mục đích quản trị
Hiện **Mã nhóm hàng** (tên ngắn trên cây) bị chặn trùng với mọi nhóm trong hệ thống, nên không đặt được cùng tên ở hai ngành khác nhau (vd thêm nhóm "Bỉm tã" dưới ngành ĐỒ UỐNG bị báo trùng với ngành "Bỉm tã"). Đổi lại: **nhóm con không được trùng tên nhau (cùng cha) và không trùng tên nhóm cha; khác cha thì được trùng, kể cả trong cùng một cây.**

Người dùng xác nhận yêu cầu ngày 18/11/2026 (đã chốt). Bản đầu chặn theo cả cây ngành, người dùng sửa lại cùng ngày: chỉ cùng cha + tên cha.

## 2. Khai báo trước
- Ngành "Bỉm tã" (cấp 1) và ngành "ĐỒ UỐNG" (cấp 1) có nhãn bên dưới.

## 3. Các bước thao tác
1. DM11 → chọn ngành ĐỒ UỐNG → **+ Tạo nhãn mới trong ngành này**, Mã nhóm hàng = `Bỉm tã` → **Ghi**.
2. Trong nhãn `Bỉm tã` (ĐỒ UỐNG) thêm nhóm tên `bỉm  TÃ`.
3. Trong ngành ĐỒ UỐNG thêm nhãn thứ hai tên `Bỉm TÃ`.
4. Dưới hai nhãn khác nhau của ĐỒ UỐNG, mỗi nhãn thêm một nhóm `Sữa nước`.
5. Sửa nhãn `Bỉm tã` (ĐỒ UỐNG) thành tên một nhóm con trực tiếp của nó.

## 5. Kết quả mong đợi

| Mục | Mong đợi |
|---|---|
| Bước 1 | Ghi được (trùng tên ngành "Bỉm tã" nhưng khác cha) |
| Bước 2 | Chặn: "Mã nhóm hàng trùng nhóm cha …" (API 409) |
| Bước 3 | Chặn: trùng nhóm cùng cấp (API 409) |
| Bước 4 | Ghi được cả hai (cùng ngành, khác cha) |
| Bước 5 | Chặn: trùng tên một nhóm con (API 409) |
| So trùng | Không phân biệt hoa thường, dấu cách thừa (như cũ) |
| Thêm ngành hàng (cấp 1) | Không trùng ngành hàng khác (cùng gốc) |
| Nhập Excel DM11 | Cùng cha + cùng tên → cập nhật nhóm đó (như cũ); trùng tên nhóm cha → dòng lỗi |

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Thêm ngành hàng tên trùng ngành đang có | Chặn |
| 2 | Trùng tên ông / bà (không phải cha trực tiếp) | Cho ghi (luật chỉ xét cha trực tiếp) |
| 3 | Nhập Excel, nhóm cha ghi theo tên mà tên đó có ở nhiều nhánh | Báo không rõ nhóm cha (như NT-DM-003) — ghi đường dẫn đầy đủ |
| 4 | Mã ngắn trùng nhóm cùng cha | Vẫn chặn như cũ (không đổi) |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 18/11/2026 |
| Bản code (commit) | nhánh `fix/nt-dm-009-ma-nhom-trung-khac-nganh` |
| Test tự động | `apps/api/test/nhom-hang.test.ts` — "mã nhóm hàng trùng nhóm cùng cha / trùng tên cha bị chặn; khác cha thì được" |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
| Thêm "nhãn  THỬ b" dưới N1 (đã có "Nhãn thử B") | 409 cùng cấp | 409 | 0 | |
| Thêm "Nhãn thử B" dưới chính nhãn "Nhãn thử B" | 409 nhóm cha | 409 | 0 | |
| Thêm "Nhóm thử" dưới N2B (đã có "Nhóm thử" dưới N2, cùng ngành) | Ghi được | 200 | 0 | |
| Thêm "Nhóm thử" dưới ngành khác | Ghi được | 200 | 0 | |
| Thêm ngành "Ngành thử" (trùng ngành) | 409 | 409 | 0 | |
| Sửa ngành "Ngành khác" thành "nhóm thử" (tên nhóm con trực tiếp) | 409 nhóm con | 409 | 0 | |
