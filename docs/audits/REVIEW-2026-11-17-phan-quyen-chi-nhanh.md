# Rà soát phân quyền theo chi nhánh — 17/11/2026
<!-- [2026-11-17 02:25 PM khanhtd] NT-HT-003 — biên bản rà soát phạm vi chi nhánh (15 ca tái hiện, 9 lỗ) và kết quả sau khi vá (GĐ3) -->

| | |
|---|---|
| Phạm vi | Phân quyền theo chi nhánh (`apps/api/src/modules/access/quyen-chi-nhanh.ts`, `man-hinh.ts`), vai trò hệ thống, báo cáo, quản trị POS, danh sách chứng từ / kiểm kê |
| Mã rà | `main` tại `a319842a` |
| Bối cảnh | Chuỗi cửa hàng: mua hàng NCC → kho → bán POS → kế toán. Yêu cầu: nhân viên bán hàng chỉ vào cửa hàng mình; quản lý chi nhánh chỉ xem báo cáo chi nhánh mình; cấp càng cao càng rộng |
| Cách test | CSDL `ketoan_test` (Postgres 16), Node 22, công tắc `bizcity.authz.branch_scope = on`, CN01 / CN02, module POS bật. Mỗi ca khẳng định hành vi an toàn — đỏ = lỗ |
| Kết luận trước vá | **KHÔNG ĐẠT** khi bật giới hạn chi nhánh: 9 / 15 ca đỏ (T4 bảo mật & đa đơn vị) |
| Kết luận sau vá | Xem §4 |

## 1. Lỗ tìm thấy

| # | Kịch bản | Trước vá | Nguyên nhân |
|---|---|---|---|
| 7 | Thu ngân xem bảng cân đối số phát sinh cả công ty | 200 | Vai trò chính thấp nhất (`viewer`) có `ledger:read`, `reports:read` toàn đơn vị |
| 8 | Thu ngân xem quản trị POS mọi chi nhánh | 200 | `pos:report` khai mặc định cho `viewer` |
| 9 | Quản lý CN01 xem báo cáo lọc CN02 | 200, có số | Báo cáo lấy chi nhánh người dùng chọn; `allowedScope` chưa route nào gọi |
| 10 | Quản lý CN01 xem đơn POS lọc CN02 | 200 | Như trên |
| 11 | Kế toán CN01 xem danh sách chứng từ thấy phiếu CN02 | thấy | Như trên |
| 12 | Hạn chế tại CN02: sửa phiếu chi CN02 (của mình) bằng thân + header CN01 | 200, phiếu chuyển sang CN01 | Chi nhánh của yêu cầu lấy từ thân / header, không từ bản ghi (trái AUTHZ-11) |
| 13 | Hạn chế tại CN02: huỷ phiếu chi CN02 (của mình) bằng header CN01 | 200, đã đảo | Như trên |
| 14 | Phạm vi CN01: sửa phiếu chi CN02 (của mình) bằng thân CN01 | 200, phiếu chuyển sang CN01 | Như trên |
| 15 | Phạm vi CN01: huỷ phiếu chi CN02 (của mình) bằng header CN01 | 200, đã đảo | Như trên |

Ca 1–6 (mở ca ngoài chi nhánh, lập phiếu ngoài phạm vi, sửa / huỷ phiếu người khác) đã chặn đúng từ trước.

## 2. Sửa

Chi tiết ở [NT-HT-003 §13](../nghiem-thu/he-thong/NT-HT-003-phan-quyen-man-hinh-chi-nhanh.md). Tóm tắt:

1. **Chi nhánh từ bản ghi**: thân ∪ chi nhánh của bản ghi đã có (`docKey`, `/vouchers/:id`, phiếu kho theo mã, hook `dangKyChiNhanhBanGhi`). Header không đè bản ghi.
2. **Phạm vi đọc**: tham số lọc chi nhánh bị ép về chọn ∩ phạm vi; lệnh đọc không lọc được → bỏ quyền đọc dữ liệu cho riêng yêu cầu (đóng mặc định).
3. **Vai trò Nhân viên** (`staff`): chỉ `catalog:read`; quyền nghiệp vụ đến từ lần gán tại chi nhánh. Migration 0149.
4. Danh sách kiểm kê nhận `branchCodes`.
5. Chuẩn [DANG-KY-QUYEN](../standard/DANG-KY-QUYEN.md) + bộ kiểm `phan-quyen-dang-ky.test.ts`.

## 3. Cần chốt trước khi mở PR code (R-FLOW-2)

- Vai trò `staff`: đổi `packages/contracts` + migration 0149.
- Đổi hành vi khi công tắc bật: lệnh đọc không lọc được theo chi nhánh trả thiếu quyền.
- Sửa `packages/platform/src/core/auth.ts` (lớp P, PHASE-028).

## 4. Kết quả sau vá

Chạy trên `main` `75c028b0` + nhánh `feat/phan-quyen-pham-vi-chi-nhanh` (GĐ3, GĐ5, GĐ4), CSDL `ketoan_test` (Docker, Postgres 16, Node 22). Kết luận: **ĐẠT có điều kiện** — 9 / 9 lỗ đã đóng; còn chờ chốt §3.

| Kiểm | Kết quả |
|---|---|
| `phan-quyen-pham-vi-chi-nhanh.test.ts` | 25 / 25 (15 ca cũ, 9 ca từng đỏ nay xanh; 10 ca mới 16–25, gồm H7 Mua hàng / Tài sản) |
| `phan-quyen-dang-ky.test.ts` (bộ kiểm đăng ký quyền) | 4 / 4 |
| `phan-quyen-vung.test.ts` (GĐ5) | 9 / 9 |
| `phan-quyen-module.test.ts` (GĐ4) | 6 / 6 |
| `npm run typecheck` | sạch |
| Cả bộ `npx vitest run` (292 tệp) | 2281 đạt, 5 đỏ, 12 bỏ qua — cả 15 tệp phân quyền xanh. 5 đỏ không do nhánh: NT-BH-005 (webhook tgs-wp), `db-rules.test.ts` (API cấu trúc dữ liệu), `mat-khau-mac-dinh.test.ts` (T027-SEC-4) đỏ cả trên `main` gốc; NT-BH-012, NT-BH-003-pos xanh khi chạy riêng trên nhánh, chỉ đỏ khi chạy chung cả bộ (bước `deliver()` của hàng đợi sự kiện) |
| `bash scripts/kiem-chuan.sh` | ĐẠT |
| `node tests/conformance/selfcheck.mjs` | KHÔNG ĐẠT như `main` (18 mục có sẵn). Nhánh không thêm phát hiện, trừ SC-SIG-1 +5: `db/migrations/0149_vai_tro_nhan_vien.sql`, `db/migrations/0150_pham_vi_so_do_to_chuc.sql`, `apps/api/src/modules/access/man-hinh-module.ts`, `docs/standard/DANG-KY-QUYEN.md`, biên bản này — tệp framework mới chờ dấu của chủ dự án |
