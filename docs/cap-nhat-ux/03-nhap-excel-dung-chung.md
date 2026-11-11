# 03. Nhập Excel dùng chung (4 bước)

<!-- [2026-11-11 Nguyễn Văn Thủy] đợt 2 cập nhật trải nghiệm: trình nhập Excel một màn cho mọi loại (đóng góp) -->

Ngày: 11/11/2026. Hướng dẫn người dùng: [docs/huong-dan/nhap-excel.md](../huong-dan/nhap-excel.md) (nút Hướng dẫn ở màn TI14).

## 1. Người dùng thấy gì

- Màn mới **TI14 Nhập dữ liệu từ Excel** (Tiện ích → Dữ liệu; Thêm nhanh → Danh mục → Nhập từ Excel): thẻ từng loại — Khách hàng, Nhà cung cấp, Mặt hàng, Kho; liên kết tới nhập phiếu mua ở MH11.
- Nút **Nhập Excel** ở danh mục Đối tượng (theo màn: khách hàng / NCC), Mặt hàng, Kho mở cùng một trình nhập.
- Trình nhập 4 bước, giống chuẩn phần mềm kế toán phổ biến:
  1. **Chọn tệp nguồn**: kéo thả, Tải tệp mẫu (sinh từ mô tả trường, có sheet Hướng dẫn), chọn sheet, dòng tiêu đề tự dò (tệp có dòng tiêu đề nhóm ở trên vẫn nhận), cách nhập *Thêm mới và cập nhật / Chỉ thêm mới / Chỉ cập nhật*.
  2. **Ghép dữ liệu**: tự ghép theo tên cột (không dấu, nhận cả tên cột hay gặp như "Mã khách hàng (\*)", "Mã nhóm khách hàng", "Số nợ tối đa"…); bảng Trường · Bắt buộc · Cột trên tệp · Giá trị dòng đầu · **Ngầm định** · Diễn giải; lọc Đã ghép / Chưa ghép; nhớ cách ghép cho lần sau.
  3. **Kiểm tra dữ liệu** (chưa ghi): số dòng hợp lệ (thêm mới / cập nhật), không hợp lệ; bảng từng dòng, ô đổi hiện cũ → mới; **Tải tệp lỗi** (tệp gốc + cột Trạng thái, Lỗi).
  4. **Kết quả nhập**: ghi dòng hợp lệ, bỏ dòng lỗi; Tải tệp kết quả; Mở danh sách.
- Danh mục mặt hàng bỏ hộp nhập cũ (một cách nhập cho mọi loại).

## 2. Kỹ thuật

| Phần | Tệp |
|---|---|
| Mô tả loại nhập (trường, bắt buộc, tên khác, ngầm định, ví dụ, `run`) | `apps/web/src/lib/nhapExcel.ts` (`NHAP_LOAI`) |
| Trình nhập 4 bước, nút `NutNhapExcel` | `apps/web/src/components/NhapExcelWizard.tsx` |
| Màn TI14 | `apps/web/src/features/system/NhapExcelPage.tsx` (`?loai=<id>` mở thẳng) |
| API nhập đối tượng | `POST /api/v1/partners/import` `{ dryRun, mode: create\|update\|both, rows }` — `apps/api/src/modules/partners/partner-import.ts` |
| Mặt hàng | dùng lại `POST /api/v1/catalog/products/import` |
| Kho | kiểm ở trình duyệt, ghi từng kho qua API kho có sẵn (ít dòng) |

API nhập đối tượng: mỗi dòng một savepoint; mã trống khi thêm mới → tự cấp mã nối dãy của nhóm / kiểu (khoá theo đơn vị); kiểu nhận chữ (Khách hàng, KH, Nhà cung cấp, NCC…); nhóm theo mã hoặc tên; MST đúng dạng, không trùng trong tệp và với đối tượng khác; số có dấu phân nghìn đọc được; NCC: tên / địa chỉ vào thông tin công ty. Test: `apps/api/test/nhap-doi-tuong.test.ts`.

Thêm loại mới: viết một `NhapLoai` (trường + `run`) rồi thêm vào `NHAP_LOAI`; nếu cần API thì theo khuôn `dryRun` + savepoint của hai API trên.

## 3. Bổ sung: số dư tài khoản đầu kỳ

- Loại **Số dư tài khoản đầu kỳ** (nhóm Số dư ban đầu; nút *Nhập từ Excel* ở ACC15): Chi nhánh, Ngày chốt số dư (ngầm định cuối tháng trước), Tài khoản, Mã đối tượng, Dư Nợ, Dư Có, TK cân đối. Gom theo chi nhánh → mỗi chi nhánh một phiếu `POST /api/v1/opening-balances`.
- Kiểm trước như máy chủ: tài khoản chi tiết có thật, không phải loại 5–8 / 911; tài khoản theo dõi đối tượng phải có mã đối tượng có thật (`POST /api/v1/partners/exists`); mỗi dòng một bên; cân Nợ – Có theo chi nhánh; chi nhánh đã có phiếu số dư; một chi nhánh một ngày. Phiếu còn dòng lỗi thì không ghi nửa vời.
- Đọc số "1.000.000" / "1,000,000", ngày dd/mm/yyyy hoặc ô ngày Excel.

## 4. Bổ sung: phiếu thu / chi / báo có / báo nợ / phiếu kế toán + ghi sổ hàng loạt

- Năm loại phiếu (nhóm Chứng từ; nút *Nhập Excel* trên thanh nút danh sách phiếu). Gom dòng theo *Số chứng từ* (trống = mỗi dòng một phiếu, tự cấp số); ngầm định TK Nợ 1111 (phiếu thu), TK Có 1111 (phiếu chi), Diễn giải theo loại.
- API `POST /api/v1/vouchers/import` `{ dryRun, vouchers: [{ rows, voucher }] }` (kernel `voucher.routes.ts`): mỗi phiếu **ghi sổ thử rồi huỷ** (savepoint) — bắt cả lỗi chỉ lộ ra lúc ghi sổ (tài khoản theo dõi đối tượng thiếu đối tượng…); qua rồi mới lưu **nháp chờ duyệt** (`draftIn`, giữ số phiếu, chưa có bút toán). Test `apps/api/test/nhap-phieu-tien.test.ts`.
- Danh sách phiếu tiền hiện cả phiếu chờ duyệt (chữ cam, cột Trạng thái); nút **Ghi sổ** ghi hàng loạt các phiếu chờ duyệt đã tích qua `POST /api/v1/vouchers/:id/approve`, phiếu lỗi báo riêng.

## 5. Bổ sung: tồn kho đầu kỳ, tồn max

- **Tồn kho đầu kỳ (số lượng)**: Ngày cân tồn (ngầm định hôm nay), Kho, Mã hàng, Tên hàng, Số lượng tồn. Dùng API cân tồn có sẵn `POST /api/v1/stock/init/reconcile/{preview,import}` với `zeroMissing: false` (mã không có trong tệp giữ nguyên). Kết quả mỗi dòng: tồn trên sổ → tồn theo tệp; mỗi kho có chênh lệch một phiếu điều chỉnh kho (mixed) ghi sổ ngay, số phiếu hiện ở cột Kho. Dòng lỗi bỏ qua; nhập lại cả tệp không sinh chênh lệch.
- **Tồn max**: Kho, Mã hàng, Tồn max → `POST /api/v1/stock/init/max/{preview,import}`; dòng mới / đổi max hiện cũ → mới.

## 6. Việc tiếp theo của mục này

- Loại: nhóm hàng, phiếu chuyển kho, phiếu bán hàng.
