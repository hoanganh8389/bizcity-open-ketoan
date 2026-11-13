# 11. Hồ sơ in: thông tin đơn vị, người ký, ngày ký (HT16)

<!-- [2026-11-11 Nguyễn Văn Thủy] màn HT16 Báo cáo, chứng từ (đóng góp) -->

Nguyên tắc: thông tin in trên **mọi** báo cáo và chứng từ khai **một nơi**. Không viết cứng tên đơn vị, logo hay người ký trong mẫu in, nên đổi sang đơn vị khác chỉ cần sửa cấu hình.

## Người dùng thấy gì

- Menu **Hệ thống → Báo cáo, chứng từ (HT16)**.
- **Thông tin đơn vị trên báo cáo, chứng từ**: tên, địa chỉ, MST, điện thoại, email, website, tài khoản ngân hàng, logo. Mỗi dòng có ô nội dung (để trống thì lấy theo HT03) và ô **Hiện**. Có thêm lựa chọn **Căn lề** Trái / Giữa.
- **Thông tin chữ ký**: Giám đốc, Kế toán trưởng, Thủ kho, Thủ quỹ, Người lập biểu. Mỗi dòng gồm tiêu đề và tên người ký.
- **Ngày ký**:
  - Báo cáo: theo ngày cuối kỳ, hoặc ngày in.
  - Chứng từ: theo ngày chứng từ, hoặc để trống ghi tay.
- **Nhiều chi nhánh**: chỉ hiện khi đơn vị có từ hai chi nhánh. Ô **Áp cho** chọn Cả đơn vị hoặc một chi nhánh để đặt riêng; tuỳ chọn **In dòng chi nhánh**.
- Mọi mẫu in (`OrgHead`, `Signs`, `LedgerForm`) tự đọc hồ sơ này. Ô ký nào trùng chức danh, kể cả "Người lập", "Người ghi sổ", "Người đại diện theo pháp luật", thì tự lấy tên đã khai.

## Kỹ thuật

| Phần | Nơi |
|---|---|
| Khai báo trường, chức danh, giá trị mặc định, hàm gộp | `packages/contracts/src/print-profile.ts` (`printProfileSchema`, `SIGNER_ROLES` + `aliases`, `PRINT_PROFILE_DEFAULT`, `mergePrintProfile`, `signerRoleOf`) |
| Bảng | `db/migrations/0103_ho_so_in.sql` `print_profiles(tenant_id, branch_code '' = cả đơn vị, profile jsonb)`; chỉ lưu phần khác mặc định |
| API | `apps/api/src/modules/print-templates/print-profile.routes.ts`: GET / PUT / DELETE `/api/v1/print-profile`. Gộp theo thứ tự mặc định → cả đơn vị → chi nhánh cha → chi nhánh |
| Giao diện | `components/print/profile.ts` (`usePrintProfile`, `PrintProfileCtx`, `signFromProfile`). `PrintCtx.profile`, `PrintCtx.org` lấy theo hồ sơ. Màn `features/system/PrintProfilePage.tsx` |
| Kiểm thử | `apps/api/test/print-profile.test.ts` |

**Thêm một tuỳ chọn in mới** cần ba bước:
1. Thêm trường vào schema và giá trị mặc định trong `print-profile.ts`.
2. Thêm một dòng vào `ROWS` của màn HT16.
3. Đọc `ctx.profile` trong khối in.

Dữ liệu đã lưu không phải sửa gì.

**Thêm chức danh ký** chỉ cần thêm một dòng vào `SIGNER_ROLES`.

Còn lại (đợt sau): hộp **Tuỳ chọn in** riêng từng báo cáo, gồm lặp tiêu đề cột, cột STT, dòng cộng chuyển trang, khổ giấy, lề, ẩn/hiện người ký và font.
