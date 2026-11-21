# NT-DM-018 · Mặt hàng (DM10): mã biến thể chỉ thêm ở cuối mã cha (bỏ chữ đầu)
<!-- [2026-11-21 kiennt] NGHIEM-THU — tạo phiếu theo yêu cầu người dùng: phần biến thể bỏ mã đầu, chỉ cho nhập mã cuối (đóng góp) -->

| | |
|---|---|
| Phân hệ | Danh mục |
| Màn hình | DM10 Mặt hàng — Thêm mặt hàng → Đổi → Mã biến thể; Nhập Excel mặt hàng |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 21/11/2026 |
| Trạng thái | Đã chốt (kiennt, 21/11/2026) |

## 1. Yêu cầu

| Trước | Sau |
|---|---|
| Ô Mã hàng của mã biến thể: **chữ đầu** · mã cha (khoá) · **chữ cuối** — cần một trong hai, tổng tối đa 2 | Chỉ còn mã cha (khoá) · **mã cuối** (tối đa 2 ký tự, bắt buộc). Mã cha 9 số: mã cuối nhận chữ cái và chữ số; mã cha chữ + 8 số: chỉ chữ cái |

- Máy chủ: **mã biến thể mới** có chữ ở đầu (vd `A100011001`) bị chặn ở form và nhập Excel: "mã biến thể mới chỉ thêm ở cuối mã cha …".
- Mã có chữ đầu **đã có từ trước**: giữ nguyên, sửa / bán / nhập kho như cũ; phần mềm vẫn nhận ra mã cha của chúng (hàm suy mã cha không đổi).

## 2. Phạm vi

`apps/web/src/features/catalog/ProductFullForm.tsx` (ô mã biến thể), `apps/api/src/modules/catalog/catalog.service.ts`, `apps/api/src/modules/catalog/catalog-import.ts` (chặn chữ đầu cho mã mới), `apps/web/src/lib/nhapExcel.ts` (câu hướng dẫn cột Mã hàng), `apps/api/test/nt-dm-013-ma-bien-the-duoi-so.test.ts` (thêm ca), `docs/huong-dan/mat-hang.md`. Không đổi CSDL.

## 3. Kết quả mong đợi

| # | Thao tác | Mong đợi |
|---|---|---|
| 1 | Thêm mặt hàng → Đổi → Mã biến thể, chọn mã cha `100011001` | Chỉ có mã cha (khoá) và ô **mã cuối** (mặc định Z); không còn ô chữ đầu |
| 2 | Gõ mã cuối `15` | Mã = `10001100115`; gõ quá 2 ký tự không nhận |
| 3 | Nhập Excel dòng mới `A100011001` | Lỗi "chỉ thêm ở cuối mã cha 100011001" |
| 4 | Mở / sửa một mã có chữ đầu đã có | Như cũ, không báo lỗi |

## 4. Kết quả chạy

| | |
|---|---|
| Ngày chạy | 21/11/2026 (máy dev, CSDL test) |
| Test | `nt-dm-013-ma-bien-the-duoi-so.test.ts` 14/14 (2 ca mới bước 3 + form chặn `A971313001`); các bộ mặt hàng khác 45/45; bước 1, 2, 4 trên màn hình |

## 5. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 21/11/2026 | Tạo và chốt theo yêu cầu |
