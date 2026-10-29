# RULE · Cổng chất lượng (R-QG)

> **Cấp:** Tier 1 · **Phiên bản:** 1.0 · 2026-10-28 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **CI:** [../ops/CI-CD.md](../ops/CI-CD.md) · **Bằng chứng:** [../ops/DIAGNOSTICS.md](../ops/DIAGNOSTICS.md) §4

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-QG-1** | PR chỉ merge khi CI xanh: `npm run typecheck`, `npm test` (PostgreSQL 16 thật), kiểm số migration, các grep ranh giới | `.github/workflows/ci.yml` |
| **R-QG-2** | Thêm luật nghiệp vụ → thêm test trong `apps/api/test/`. Test đi qua **cửa thật** (`POST /api/v1/documents` hoặc service) rồi kiểm sổ, không kiểm hàm nội bộ đơn lẻ | Duyệt PR |
| **R-QG-3** | Mỗi lần chạy test dùng **đơn vị riêng** (`setupTenant()` → `t<thời điểm>`); test không dựa vào dữ liệu test khác | `helpers.ts` |
| **R-QG-4** | Test nhân phải gồm: gửi trùng, đổi phiên bản (đảo), phiên bản cũ (409), kỳ khoá, thiếu cấu hình rồi ghi lại, huỷ | `ledger-flow.test.ts` |
| **R-QG-5** | `afterAll` của mọi file test gọi `assertLedgerInvariants(tenantId)` (Giai đoạn 1) | test-kit |
| **R-QG-6** | PR đụng nhân (T0) dán **bằng chứng chạy**: khối tóm tắt vitest (số file / số test / thời gian) + kết quả `GET /system/diagnostics` trên CSDL test | Mẫu PR |
| **R-QG-7** | JSON mẫu trong `docs/api/vi-du/` được test tự động gửi vào và phải `posted` | `api-examples.test.ts` |
| **R-QG-8** | Không merge với test bị `skip` / `only` mới thêm | Grep CI |
| **R-QG-9** | PR đổi hợp đồng ghi vào CHANGELOG hợp đồng và tăng `version` trong tệp `docs/contracts/*` | Mẫu PR |
| **R-QG-10** | Sau triển khai: `GET /api/v1/system/health` khoẻ và `diagnostics` không có lỗi mức `error` trước khi báo xong | [../ops/DEPLOY.md](../ops/DEPLOY.md) §4 |
