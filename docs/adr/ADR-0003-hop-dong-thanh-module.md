# ADR-0003 · Nghiệp vụ hợp đồng trong lõi chuyển thành module `hop-dong`

- Trạng thái: Chấp nhận
- Ngày: 2026-10-29 · Người quyết: chủ dự án
- Luật / hợp đồng liên quan: R-BOUND-2, R-BOUND-5, `bizcity_module@1`, `bizcity_document@1`; audit A-17, A-26

## Bối cảnh

Lõi đang chứa một phần nghiệp vụ hợp đồng:

- mã phân tích `dimensions` loại `contract`;
- bảng `contract_schedules`, tạo ở `0002_goc_danh_muc.sql`;
- cột `payment_requests.contract_schedule_id`;
- quy ước `cash_plans.source_ref = 'contract:…'`.

Phân hệ Quỹ ghi thẳng vào `contract_schedules` (`payment-request.routes.ts:264`). Ca chuẩn của Standard v1 ([GOLDEN-CASE-HOP-DONG.md](../standard/GOLDEN-CASE-HOP-DONG.md)) cũng là module Hợp đồng. Giữ cả hai thì một nghiệp vụ có hai nguồn sự thật.

## Quyết định

1. **Sinh module `hop-dong` mới theo ca chuẩn trước.** Đây là phép đo Standard v1: Claude Code sinh module mà không sửa Kernel.
2. **Sau đó chuyển phần hợp đồng đang ở lõi vào module đó.** Phần chuyển gồm lịch thu / chi theo hợp đồng, liên kết với `payment_requests` và với `cash_plans`.
3. Bảng cũ **không đổi tên, không xoá** (ADR-0002, R-DB-1). Trong thời gian chuyển, module đọc bảng cũ qua view `bizcity_read.*`. Dữ liệu chuyển bằng migration mới của module.
4. Mã phân tích `contract` vẫn là **mã phân tích chung** của Platform (`packages/data`, theo REUSE-MAP), để bút toán và báo cáo theo hợp đồng vẫn chạy. Module chỉ tham chiếu mã này, không sở hữu nó.

## Hệ quả

- **Được:**
  - một nguồn sự thật cho nghiệp vụ hợp đồng;
  - Quỹ thôi ghi bảng của nghiệp vụ khác;
  - ca chuẩn trở thành module thật, không phải bản demo.
- **Mất:** một đợt chuyển dữ liệu, kèm một thời gian chạy hai đường song song.
- **Phép thử hồi quy:** `contract-schedules.test.ts` và `payment-requests.test.ts` phải xanh cả trước lẫn sau khi chuyển.
- **Cách đo trên bảng điểm:**
  - SC-MOD-2 hết nợ `core:contract_schedules` của phân hệ `quy`;
  - mục "Ca chuẩn Hợp đồng" đạt đủ năng lực.

## Phương án đã cân nhắc

- *Giữ ở lõi, module mới chỉ làm giao diện.* Trái nguyên tắc P2 (module không vá Kernel) và làm lõi phình thêm nghiệp vụ. Loại.
- *Chuyển trước rồi mới sinh module.* Mất phép đo "AI sinh module mới từ chuẩn". Loại.
