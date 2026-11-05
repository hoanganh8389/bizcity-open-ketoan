# PHASE-029 · 30 — Lộ trình nền móng doanh nghiệp (luồng E1–E9)
<!-- [2026-11-05 09:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — lộ trình ADR-0028: chín luồng E1–E9, ưu tiên P0–P2, mức Kernel, phụ thuộc phase khác, điều kiện bắt đầu -->

> **Trạng thái:** Kế hoạch (2026-11-05). Mỗi luồng: PR tài liệu **chốt thiết kế** + dòng giữ chỗ ở CLAIMS.md vào `main` **trước** nhánh code (R-FLOW). Việc đã có phase sở hữu không lặp lại ở đây (ADR-0028 D028-10).
> **Luồng D (chứng từ gốc, W1–W3)** giữ nguyên ở [00-MASTER-PLAN](00-MASTER-PLAN.md) §3–§5.

## 1. Thứ tự

```
P0  E1 bảng điểm theo bằng chứng ─┐
    E2 cấu hình (settings)        ├─► E3 dữ liệu gốc liên tục ─► E6 đối chiếu ─► E8 KPI
    E5 kỳ khoá ở CSDL (K3)        ┘        (sau S026-4)
P1  E4 chứng từ thuộc tính · E7 tích hợp & định danh ngoài · E9 SDK module & vận hành
```

## 2. Các luồng

| Luồng | Việc | Trụ cột · ECP | Ưu tiên | Mức | Đụng (dự kiến) | Điều kiện bắt đầu |
|---|---|---|---|---|---|---|
| **E1** | Bảng điểm theo bằng chứng: mỗi tiêu chí có trường `signal` (check / mã chẩn đoán / test); engine tính mức; thêm trường `foundation` 01–17; HT10 hiện theo bốn nhóm | 12, 17 · R-ECP-SCORE | P0 | K1 | `tru-cot.json`, check SC-PILLAR | S026-15 (PHASE-026) làm trước phần SC-PILLAR-1; E1 nối thêm, không làm song song |
| **E2** | Cấu hình theo mô hình `options`: bảng giá trị có phạm vi + hiệu lực + `autoload`, chỉ thêm; `settings.get` hẹp → rộng; `settings.set` duy nhất (zod theo registry, nhật ký, lý do); `config_version` của đơn vị huỷ đệm; xuất / nhập; check chặn đọc thô `tenants.settings`; khai hai khoá thiếu; danh mục tiền tệ; thuế suất theo ngày | 05 · ECP-03 | **P0** | K2 + migration | Platform `core/settings.ts`, `core/actions.ts`, registry, migration mới | chốt thiết kế ở `bizcity_settings@1` 1.1 |
| **E3** | Dữ liệu gốc liên tục: thuộc tính có hiệu lực (tên, MST, địa chỉ) cho đối tượng / chi nhánh / kho; ảnh chụp tên đối tượng trên dòng sổ; báo cáo đọc tên theo ngày; gộp đối tượng; test cổng `T029-ECP-P001` | 01, 02 · ECP-01/03/13 | **P0** | K2 | migration mới, Kernel danh mục, báo cáo | S026-4 (`entity_codes`) xong — dùng chung khuôn |
| **E3b** | Xoá an toàn ở CSDL: thu hồi `DELETE` của `ketoan_app` trên dữ liệu gốc; một hàm xoá đọc `md_references`; bỏ `CASCADE` sang dữ liệu nghiệp vụ; ngừng dùng cho `accounting_units`, `product_posting_groups` | 02 · ECP-13 | **P0** | **K3** (chủ ký) | migration, `catalog.service.ts`, các route xoá danh mục | S026-11 (`md_references`) xong; chạy `kiem-nang-cap.sh` |
| **E4** | Chứng từ theo mô hình `posts` / `postmeta`: bảng đầu chứng từ dùng chung + thuộc tính theo khoá có phiên bản; `ctx.documents.transition`; quan hệ có đóng hiệu lực; bật SoD ở luồng duyệt, kiểm người lập ≠ người duyệt | 06, 07 · ECP-05/06/09 | P1 | K2 | Platform `core/documents.ts`, `core/workflow.ts`, migration | W2a (luồng D) xong |
| **E5** | Kỳ khoá ở CSDL: trigger trên `ledger_entries` từ chối ngày hạch toán thuộc kỳ đã khoá (song song kiểm ở ứng dụng) | 09 · R-ECP-CONS-1 | **P0** | **K3** | migration | chủ ký K3; ca test kỳ khoá có sẵn |
| **E6** | Sổ đăng ký đối chiếu: chuyển từng phần `doi-chieu-ke-toan.sql` thành chẩn đoán có mã (hoá đơn ↔ 133, làm tròn, ĐVT); mỗi projection khai phép đối chiếu tầng 3; trạng thái "chứng từ chưa hoàn thành" | 13 · ECP-11 | P1 | K1 | `ledger.diagnostics.ts`, lane `DG-*`, `DIAGNOSTICS.md` | — (phối hợp S025-9..11 Gate C) |
| **E7** | Tích hợp: bảng ánh xạ định danh ngoài; con trỏ đồng bộ tăng dần theo kết nối; nhật ký từng lần kéo + đối chiếu số lượng / băm theo cửa sổ; mã hoá khoá API kết nối khi lưu | 15, 17 · ECP-04/10 | P1 | K2 | `modules/connections`, migration | E2 (cấu hình kết nối ra khỏi `tenants.settings`) |
| **E8** | Sổ KPI: định nghĩa chỉ tiêu có phiên bản (nguồn, công thức, phạm vi, hiệu lực, cách điều chỉnh); chuyển dòng báo cáo tài chính sang định nghĩa có phiên bản | 14 · ECP-12 | P2 | K2 | báo cáo kế toán, migration | E6 |
| **E9** | SDK module & vận hành: SDK xuất đăng ký chẩn đoán / luật kiểm của module; manifest thêm `objects` / `fields` / `rules` / `diagnostics`; khoá checksum migration 0034 → hiện tại + `migrate.ts` ghi checksum; kiểm đường ghi ngoài action mang actor / nguồn; khớp tên sự kiện với hợp đồng; người / nhân viên tách người dùng | 01, 04, 08, 12, 16, 17 · ECP-02/07/08/11 | P1–P2 | K1–K2 | `packages/module-sdk`, schema module, `tests/conformance/locks`, Platform `db/migrate.ts` | PHASE-028 W2+ cho phần người / quyền |

## 3. Phụ thuộc phase khác (không làm lại)

| Việc | Phase giữ |
|---|---|
| `entity_codes`, `resolveEntity` | PHASE-026 S026-4 |
| `md_references`, Tác động | PHASE-026 S026-11 |
| Nhóm đơn vị, giao dịch liên đơn vị | PHASE-026 S026-6 / S026-7 |
| Truy vết đối tượng / tài khoản | PHASE-026 S026-13 |
| SC-PILLAR-1 | PHASE-026 S026-15 |
| Hệ TK có phiên bản, nhóm hạch toán theo ngày | PHASE-026 S026-8 |
| Lớp giá vốn, Gate C, khoá kỳ đòi chuỗi lành | PHASE-025 |
| Vai trò, phạm vi, quyền module, trình sửa vai trò | PHASE-028 |
| Bể chờ, `IN-*` | PHASE-021 |
