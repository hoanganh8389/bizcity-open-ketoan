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

### Đổi
- Khuôn nạp sổ đổi tên từ `bizcity_event@1` thành `bizcity_ledger_intake@1`. Tên `bizcity_event@1` từ nay dành cho sự kiện miền.

### Thay đổi định khoản
- Không có.

### Nâng cấp cần làm
- Không có.

### Bảo mật
- Đã biết, chưa sửa: API dùng vai trò CSDL superuser trong Docker mẫu (R-SEC-6); nginx chưa gửi header bảo mật (R-SEC-11). Xem sổ rủi ro ở `docs/rules/RULE-SECURITY.md` §3.

## [0.1.0] - 2026-10-29

### Thêm
- Mã nguồn đầu tiên đưa lên GitHub:
  - sổ cái chỉ thêm, một cửa nạp chứng từ, luật định khoản, báo cáo;
  - các phân hệ kế toán, quỹ, mua hàng, bán hàng, kho, tài sản, thuế;
  - add-in.
