# 15. Định khoản theo loại chứng từ và chương trình có hạn mức

<!-- [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — bỏ màn Thiết kế hạch toán (ACC92): tài khoản khai một nơi là Tài khoản ngầm định (ACC41) (đóng góp) -->

> Trạng thái (11/11/2026): tài khoản khai **một nơi** là **Tài khoản ngầm định (ACC41)**. Màn Thiết kế hạch toán (ACC92: đề xuất / duyệt quy tắc, chạy thử, sơ đồ, lịch sử) **đã bỏ** vì hai nơi khai báo gây rối.
>
> Mã: lõi `packages/kernel/src/modules/posting/rule-table.ts` (chọn dòng khớp, áp lên bút toán); API `apps/api/src/modules/posting-flow/posting-rules.*`; màn `apps/web/src/features/posting/DefaultsPage.tsx`; chương trình bán `apps/api/src/modules/sale-programs/`, `apps/web/src/features/sale-programs/ChuongTrinhBanPage.tsx`; test `apps/api/test/tai-khoan-ngam-dinh.test.ts`, `apps/api/test/chuong-trinh-ban.test.ts`.

## 1. Mục tiêu

- Định khoản không fix cứng trong code: đổi cách hạch toán thì sửa ở ACC41.
- **Ít nơi khai báo**: không khai tài khoản ở từng mã hàng, không thêm màn quy tắc riêng.
- Bỏ mã phụ (đuôi Z, B) cho hàng tặng / giảm giá: thay bằng **chương trình có thời gian và hạn mức** (mục 4).

## 2. Cách chọn tài khoản

Mỗi loại chứng từ có các **dòng có sẵn** ở ACC41 (Bán hàng — tiền hàng: Nợ 1311 / Có 51111…). Trường hợp riêng là **dòng thêm** dưới dòng gốc, theo **Loại hàng** và / hoặc **Biến thể** (mã con: chia giá, khuyến mại, kẹp quà, tem, nội bộ…).

1. Dòng thêm khớp loại hàng / biến thể của mặt hàng thì dùng tài khoản của dòng đó; khớp nhiều điều kiện hơn thì thắng.
2. Không khớp dòng thêm nào thì theo dòng có sẵn.
3. Ô tài khoản trống ở dòng thêm = giữ tài khoản dòng gốc.
4. Hai dòng thêm cùng điều kiện bị chặn lúc lưu.

Ngoại lệ không khai ở ACC41:

- Tài khoản tiền: theo **Hình thức thanh toán**.
- Thuế: loại thuế có tài khoản riêng thì theo loại thuế.
- Nhận / xuất quà ở Mua hàng: theo tài khoản ở **Cài đặt Mua hàng** (phân hệ tự giữ dòng định khoản đúng theo cài đặt).
- Bật công tắc lý do hạch toán (`bizcity.posting.use_reasons`): theo nhóm hạch toán của mặt hàng, tài khoản trên lý do đè lên — xem [18](18-bo-ly-do-loai-nghiep-vu.md).

Dòng thêm áp ngay, không có ngày hiệu lực. Muốn giữ bút toán tháng cũ thì **khoá sổ** tháng đó trước khi đổi.

## 3. Lõi kiểm

Lõi kiểm Nợ = Có, tài khoản chi tiết, đối tượng, kỳ khoá; không đạt thì chặn và báo rõ.

## 4. Chương trình bán có hạn mức (BH12) thay mã Z, B

Hàng tặng và hàng giảm giá vẫn là sản phẩm chính, không sinh mã phụ.

**Chương trình gồm:** mã hàng chính; loại (quà tặng / giảm giá, cận date…); thời gian; mức giảm hoặc quà; **hạn mức số lượng từng shop**.

**Khi bán ở POS:**

- Còn hạn chương trình và shop còn hạn mức thì áp quà / giá giảm, rồi trừ hạn mức.
- Hết hạn hoặc hết hạn mức thì bán giá thường.
- Hạn mức trừ lúc lưu bill, có khoá chống hai máy cùng trừ món cuối.
- Mỗi dòng bán mang mã chương trình sang ERP (báo cáo).

**Báo cáo quản lý chương trình:** theo chương trình, shop, mã hàng, khoảng ngày; hạn mức, đã dùng, còn lại, giá trị.

**API cho POS** (`/api/v1/sale-programs`): `GET /active?branchCode=&skus=` chương trình đang chạy còn hạn mức (kèm `policyRef`); `POST /consume` trừ hạn mức theo dòng phiếu (gửi lại cùng phiếu không trừ thêm, hết hạn mức trả 409); `POST /release` trả hạn mức khi huỷ phiếu.

## 5. Còn lại

- POS WordPress gọi API chương trình bán: chưa làm. Phiếu đổi mã tồn Z / B cũ: chưa làm.
- Tài khoản riêng theo chương trình (quà công ty, quà NCC): khai ở chính chương trình / chính sách khi làm phần chính sách — chưa làm.
- Giá trị quà NCC tặng (nhập giá 0) ghi 711: cần chốt với kế toán.
