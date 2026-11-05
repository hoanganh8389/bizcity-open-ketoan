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

<!-- [2026-11-05 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — §4 chữ chốt SC-CORE-1 (phép kiểm giữ sáu năng lực lõi, D028-13) -->
## 4. Chữ chốt SC-CORE-1 — giữ sáu năng lực lõi trong repo (S029-29)

Phép kiểm chặn mới là thứ dùng chung (R-FLOW §3) — mục này là chữ chốt; code mở bằng dòng giữ chỗ riêng sau khi PR tài liệu này vào `main`.

| Mục | Chốt |
|---|---|
| Nguồn | `docs/standard/nen-mong.json` (`bizcity_foundations@1`); không đọc mã để đoán |
| Lớp | CONF-STATIC, thư mục check mới `tests/conformance/checks/foundations/` (đề xuất); chạy trong `selfcheck` |
| Mức | `warn` ở bản đầu; `block` khi nợ = 0 (ratchet `baseline.json`, không thêm nợ mới) |
| Luật 1 | Đúng sáu lõi `C1`..`C6`; mỗi lõi có ≥ 1 capability, mọi capability có trong `bizcity-standard.json`; lõi mức `dat` thì mọi capability phải `available` |
| Luật 2 | Mọi đường dẫn ở `code` tồn tại; mọi hợp đồng ở `contracts` có trong CANON §4 |
| Luật 3 | Đúng 17 trụ cột `01`..`17`, mỗi trụ cột thuộc đúng một lõi (hoặc `SDK`), thuộc đúng một nhóm A–D; mọi ECP-01..13 có ≥ 1 trụ cột |
| Luật 4 | Tín hiệu `co`: `check` → id có trong `tests/conformance/checks`; `diag` → mã có trong mã nguồn chẩn đoán; `test` → tệp tồn tại. Tín hiệu `nhanh` / `chua` không cần tồn tại |
| Luật 5 | Trụ cột / lõi mức `dat` thì không còn tín hiệu `chua` (R-ECP-SCORE-1) |
| Ca tự kiểm | gốc mẫu `fixtures/foundations-bad` (đề xuất): một lõi thiếu, một tín hiệu `co` trỏ tệp không có, một trụ cột `dat` còn `chua` |
| Quan hệ SC-PILLAR-1 | SC-PILLAR-1 (S026-15) kiểm `tru-cot.json`; SC-CORE-1 kiểm `nen-mong.json`. Khi S029-18 thêm trường `foundation` vào `tru-cot.json`, hai phép kiểm dùng chung bộ đọc tín hiệu — không viết hai lần |
| Đổi mã → sửa tài liệu | đổi / dời thư mục ở `code` của một lõi → sửa `nen-mong.json` trong cùng PR (SC-CORE-1 báo) |

<!-- [2026-11-06 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — §5 chữ chốt E2 đợt 1 (S029-10): cấu hình kiểu options, chỉ thêm, phạm vi, hiệu lực -->
## 5. Chữ chốt E2 đợt 1 — cấu hình có phiên bản, phạm vi, ngày hiệu lực (S029-10)

Thiết kế đầy đủ: [`bizcity_settings@1` 1.1.0-draft §2](../../contracts/BIZCITY-SETTINGS-MATRIX-v1.md). Tóm tắt quyết định:

| Mục | Chốt | Vì sao |
|---|---|---|
| Kho | một bảng `setting_values` chỉ thêm (mỗi lần ghi = một phiên bản) + `tenants.config_version` | lịch sử là chính bảng; không bảng history riêng; một khoá huỷ đệm |
| Phạm vi | `user` → `branch` → `accounting_unit` → `tenant` → mặc định registry | đúng R-MATRIX §1; `user` cho tuỳ chọn giao diện (thay localStorage dần) |
| Khoá cũ ở `tenants.settings` | ghi song song (mirror) ở phạm vi đơn vị; hiện hành đọc nhánh JSON cũ; không nhận ngày tương lai ở đợt 1 | hơn 8 chỗ đọc thô không vỡ; chuyển dần ở đợt 2 |
| Khuôn giá trị | trường `valueType` máy đọc trong registry; khoá chưa có `valueType` không đi đường chung | không ghi mù khoá có bí mật / khuôn phức |
| Đăng ký route | `settings-values.routes.ts` gọi từ `catalog-rules.routes.ts` (tệp cấu hình HT09) | `system.routes.ts` đang thuộc dòng E1; `loi.ts` thuộc dòng xương cá |
| Danh mục bảng | thêm mục `setting_values` vào `schema-catalog.ts` (test `db-rules` đòi mọi bảng có nhóm) — tệp này cũng ở dòng PHASE-028 W1: hai dòng merge lần lượt |
| Kiểu Kysely | không sửa `db/types.ts` ở đợt 1 (dòng PHASE-026 đợt 3 giữ) — truy vấn bằng `sql` có tham số | không chồng phạm vi |
| Số migration | `0076` (0073 / 0074 PHASE-026, 0075 PHASE-028 W1) | W-13 |
| Kiểm bằng | test `cau-hinh-gia-tri`: ưu tiên phạm vi, theo ngày, lịch sử, chỉ thêm (trigger), mirror, `config_version`, quyền, lý do loại A; `ctx.settings.get` đọc qua kho mới | LEAN-7 |

Đợt 2 (S029-32): chuyển route ghi riêng sang `setSetting`, `valueType` cho module, phép kiểm chặn đọc thô, xuất / nhập, đệm theo `config_version`.
