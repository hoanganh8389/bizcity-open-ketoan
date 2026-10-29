# ADR-0005 · Danh mục chuẩn đặt ở `packages/data`, cột tài khoản do Kernel quản

- Trạng thái: Chấp nhận
- Ngày: 2026-10-29 · Người quyết: chủ dự án
- Luật / hợp đồng liên quan: R-MD-1, R-POST-2, `bizcity_master_data@1`, `bizcity_data@1`; audit A-17

## Bối cảnh

Các danh mục khách hàng / nhà cung cấp, mặt hàng, chi nhánh, kho, thuế đang nằm trong lõi kế toán. Mỗi bảng mang hai loại cột:

- cột nghiệp vụ chung: mã, tên, địa chỉ;
- cột kế toán: tài khoản, nhóm hạch toán.

CRM, POS và module cộng đồng cần danh mục nhưng không cần sổ cái. Hiện có phân hệ ghi thẳng vào bảng danh mục (A-17), ví dụ `mua-hang/demo.ts` và `thue/authority-invoice.routes.ts:170`.

## Quyết định

1. **Thực thể danh mục đặt ở `packages/data` (masterdata).** Danh mục dùng được khi không bật Kernel, để Core chạy được CRM / POS thuần.
2. **Cột tài khoản và nhóm hạch toán do Kernel quản.** Có hai cách đặt:
   - bảng mở rộng của Kernel, khoá theo `(tenant_id, code)`;
   - cột có chủ rõ ràng, khai trong registry.

   Module không đọc, không ghi các cột này.
3. Module **chỉ tham chiếu danh mục bằng mã**. Muốn ghi danh mục thì gọi action / API của Core (`masterdata.write`), không ghi vào bảng.
4. Xoá hoặc ngừng một mã mà module đang dùng phải qua hook `masterdata.referenceCheck` (Extension §4).

## Hệ quả

- **Được:** CRM / POS dùng được Core mà không cần phần kế toán. Kế toán vẫn là chủ cấu hình định khoản (CANON câu 4).
- **Việc phải làm:**
  - tách kiểu dữ liệu và repository danh mục khỏi `apps/api/src/modules/{partners,products,branches}`, đưa sang `packages/data` (PHASES 2);
  - đổi `mua-hang/demo.ts` và `thue/*` sang gọi API danh mục.
- **Cách đo trên bảng điểm:** SC-MOD-2. Mỗi khi sửa xong một chỗ, nợ tương ứng (`core:partners`, `core:products`, `core:branches`, `core:posting_reasons`) được xoá khỏi baseline.

## Phương án đã cân nhắc

- *Để danh mục trong Kernel.* CRM / POS sẽ phải kéo theo cả sổ cái. Loại.
- *Mỗi module tự có bảng khách hàng riêng.* Trái R-MD-1 và làm dữ liệu trùng. Loại.
