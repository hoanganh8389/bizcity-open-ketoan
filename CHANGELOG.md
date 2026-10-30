# Nhật ký thay đổi

Mọi thay đổi đáng kể của Bizcity Core (open-ketoan) ghi ở đây. Khuôn theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), số phiên bản theo [SemVer](https://semver.org/lang/vi/). Luật: [docs/rules/RULE-RELEASE.md](docs/rules/RULE-RELEASE.md).

Mỗi bản ghi đủ sáu mục:
- **Thêm**
- **Đổi**
- **Sửa**
- **Thay đổi định khoản**: K2 trở lên, áp cho chứng từ ghi sau khi cập nhật
- **Nâng cấp cần làm**
- **Bảo mật**

## [Chưa phát hành]

### Thêm
- Bộ chuẩn framework: CANON, luật `R-*`, hợp đồng `bizcity_*@N`, Bizcity Framework Standard v1 (7 hợp đồng module), ADR-0001..0006.
- Bộ kiểm chuẩn `tests/conformance/` gồm hai lane chạy song song:
  - selfcheck: tĩnh, không cần CSDL;
  - diagnostics: CSDL thật, chỉ đọc.

  Kèm theo: bảng điểm, danh sách nợ bánh cóc, tự kiểm trên dữ liệu mẫu, chế độ `--module`.
- Hợp đồng đề xuất:
  - `bizcity_posting_template@1` (gói định khoản theo ngành);
  - `bizcity_mcp@1` (công cụ MCP cho Cell / chatbot).
- Tài liệu: kết nối Cell bằng khoá 1API, port channel-gateway.
- Luật mới:
  - R-KER: thay đổi Kernel;
  - R-SEC: bảo mật;
  - R-REL: phát hành;
  - R-DIAG: tự chẩn đoán.
- `SECURITY.md`, `CHANGELOG.md`.
- Tra cứu mã số thuế: `DOANHNGHIEP_API_KEY`, `TAX_LOOKUP`.
- Đọc hoá đơn nhà cung cấp bằng dịch vụ AI: `INVOICE_AI_URL`, `INVOICE_AI_KEY`, `INVOICE_AI_TIMEOUT_MS`.
- `GET /api/v1/system/health` trả thêm `version`, `kernel`, `standard` (R-REL-1).
- Guard `requireUser()`, `requireAuthenticated()` cho route tự phục vụ (R-API-6).
- Migration `0030_hoa_don_ncc.sql`: bảng `supplier_invoices`, `supplier_invoice_lines`, `supplier_item_aliases` mà code Hoá đơn NCC đã dùng nhưng chưa có migration (khuôn theo `db/types.ts`).
- Migration `0032_vai_tro_ung_dung.sql`: vai trò CSDL `ketoan_app` cho API (không superuser, không sở hữu bảng); biến `DB_APP_USER`, `DB_APP_PASSWORD` (R-SEC-6).
- Phase 1:
  - nhãn lớp `// @bizcity-layer` ở mọi tệp `apps/api/src` (R-BOUND-10, `scripts/gan-nhan-lop.mjs`, SC-LAYER-1);
  - đồ thị phụ thuộc theo lớp, mốc `docs/audits/deps-2026-10-30.*` (`scripts/do-thi-phu-thuoc.mjs`, SC-LAYER-2);
  - bản nháp API `packages/module-sdk/API.md`.

### Đổi
- `POST /api/v1/auth/logout-others` khai `requireUser()` (khoá API → `403 FORBIDDEN`, như service vốn kiểm). `/api/v1/presence*` khai `requireAuthenticated()` — hành vi không đổi.
- Mua hàng → dữ liệu mẫu tạo kho mặc định qua dịch vụ danh mục kho của lõi (có ghi nhật ký), thôi ghi thẳng bảng `warehouses`.
- `0028_thue_kkkn.sql` đổi số thành `0031_thue_kkkn.sql` (sửa trùng số, A-03); `migrate.ts` ghi nhận tên mới cho bản cài đã áp tên cũ, không chạy lại.
- Khuôn nạp sổ đổi tên từ `bizcity_event@1` thành `bizcity_ledger_intake@1`. Tên `bizcity_event@1` từ nay dành cho sự kiện miền.

### Sửa
- Migration `0033_ma_hang_cha_sua_tay.sql`: cột `products.parent_manual` code đã dùng nhưng chưa có migration — thêm / sửa mặt hàng (và Mua hàng, ĐVT, tồn max dùng tới) báo "column parent_manual does not exist".
- Vé đăng nhập cấp trước khi có cơ chế thu hồi phiên (không ghi `sv`) bị từ chối ngay: code coi thiếu `sv` = 1 trong khi `users.session_version` mặc định 0 (migration 0029). Nay thiếu `sv` = 0, dùng được tới lần thu hồi đầu như thiết kế.
- Bộ kiểm thêm SC-DATA-7 (`db/types.ts` ↔ migration) để lỗi "khai kiểu mà quên migration" bị chặn ở CI.

### Thay đổi định khoản
- Không có.

### Nâng cấp cần làm
- Khuyên làm trên bản cài thật: đặt `DB_APP_USER=ketoan_app` + `DB_APP_PASSWORD` trong `.env` rồi `docker compose up -d` (DEPLOY D-9). Không đặt thì mọi thứ chạy như cũ.

### Bảo mật
- nginx (container `web`) gửi header bảo mật: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP `object-src 'none'; base-uri 'self'` (R-SEC-11).
- API có thể chạy bằng vai trò CSDL thường `ketoan_app`: không tắt được trigger bảo vệ sổ, không TRUNCATE (R-SEC-6, R-KER-3). Bật bằng biến môi trường (xem Nâng cấp cần làm).

## [0.1.0] - 2026-10-29

### Thêm
- Mã nguồn đầu tiên đưa lên GitHub:
  - sổ cái chỉ thêm, một cửa nạp chứng từ, luật định khoản, báo cáo;
  - các phân hệ kế toán, quỹ, mua hàng, bán hàng, kho, tài sản, thuế;
  - add-in.
