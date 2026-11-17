# ADR-0034 · Xoá Công ty Mẫu bằng script vận hành theo cơ chế E3 — chỉ đơn vị `is_sample`, không đổi trigger sổ
<!-- [2026-11-17 09:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — ADR-0034: xoá Công ty Mẫu (Q036-4) bằng scripts/xoa-cong-ty-mau.sh — mở rộng E3 cho đơn vị is_sample; không nút trong ứng dụng, không cờ thoát trigger -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

- Trạng thái: **Chấp nhận** 2026-11-17
- Nguồn: chủ dự án 2026-11-17 — chọn *"Script vận hành"* cho xoá Công ty Mẫu (Q036-4 của PHASE-036: xoá được, chỉ đơn vị mẫu, ghi bằng chứng; cần dòng ở RULE-LEDGER).
- Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: **K2** (không đổi trigger, không đổi bảng sổ; thêm một script vận hành cùng cơ chế E3).
- Luật liên quan: [R-LEDGER-1, ngoại lệ E3](../rules/RULE-LEDGER.md), SC-KERNEL-4 (`session_replication_role` chỉ ở script được phép), [PHASE-036 · 00 §14, §15](../phases/PHASE-036-THIET-LAP-NHANH-DU-LIEU-MAU/00-MASTER-PLAN.md).

## Bối cảnh

Công ty Mẫu (`tenants.is_sample`, B5a) có sổ cái thật: chứng từ mẫu đi cửa nạp, Kernel định khoản. Sổ chỉ thêm (R-LEDGER-1). Người vận hành cần bỏ hẳn Công ty Mẫu khi bản cài chuyển sang dùng thật, hoặc để tạo lại gói mới.

## Lựa chọn

| Hướng | Cơ chế | Rủi ro |
|---|---|---|
| **A. Script vận hành (chọn)** | `scripts/xoa-cong-ty-mau.sh` + `.sql`: cùng cơ chế E3 (`SET LOCAL session_replication_role = replica`, vai trò superuser CSDL, sao lưu trước, gõ câu xác nhận); **từ chối** khi đơn vị không `is_sample` (kiểm trong cùng giao dịch, trước khi xoá) | Thấp: không thêm đường thoát trigger trong ứng dụng; vai trò `ketoan_app` không làm được |
| B. Nút xoá trong ứng dụng | ngoại lệ mới E5: hàm `SECURITY DEFINER`, trigger sổ cho qua đúng đơn vị mẫu; phải khoá cột `is_sample` để không biến đơn vị thật thành "mẫu" rồi xoá | Cao: đổi trigger sổ (K3); một lỗi quyền là mở sổ thật — cùng loại rủi ro đã khiến gỡ E4 (0086) |
| C. Chỉ "ngừng dùng" | `tenants.is_active = false` | Không xoá được dữ liệu; đổi quyết định Q036-4 |

## Quyết định

1. Xoá Công ty Mẫu **chỉ** bằng `scripts/xoa-cong-ty-mau.sh <mã>` trên máy chủ, vai trò superuser CSDL — như E3. Không route, không action, không nút.
2. Script **tự kiểm**, trong cùng giao dịch xoá: đơn vị có mã đó, `is_sample = true`; sai → `RAISE`, không xoá gì.
3. Xoá **cả đơn vị**: mọi bảng có `tenant_id` (mọi schema của ứng dụng, gồm `mod_*`), bốn bảng con không có `tenant_id` xoá theo bảng cha (`accounting_event_versions`, `tax_invoice_lines`, `asset_allocations`, `asset_depreciation_overrides`), rồi dòng `tenants`. Sau xoá đếm lại: còn dòng nào của đơn vị → `RAISE` (huỷ cả giao dịch).
4. Bằng chứng: bản sao lưu ngay trước khi xoá (`scripts/sao-luu.sh`) + một dòng ở `backups/xoa-cong-ty-mau.log` (giờ, mã, số dòng đã xoá từng bảng, tệp sao lưu). Không ghi `audit_logs` của đơn vị — đơn vị bị xoá cùng nhật ký của nó.
5. SC-KERNEL-4 và `scripts/kiem-chuan.sh` cho phép `session_replication_role` thêm ở `scripts/xoa-cong-ty-mau.sql` / `.sh` (danh sách đóng).

## Hệ quả

- Danh sách ngoại lệ RULE-LEDGER vẫn đóng: E3 có thêm một script hẹp hơn (chỉ `is_sample`, cả đơn vị). Không ngoại lệ mới, không trigger mới.
- Đơn vị thật không bao giờ đi đường này: `is_sample` chỉ do job cài / tạo theo yêu cầu đặt (B5a / B5b), API không có trường sửa.
- Test: script SQL chạy trên CSDL test xoá sạch một đơn vị mẫu (0 dòng còn lại mọi bảng), từ chối đơn vị thường (không xoá dòng nào).
