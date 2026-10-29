# Tài liệu BizCity Ledger Framework (open-ketoan)

open-ketoan là **lõi sổ cái** cho toàn bộ phân hệ của doanh nghiệp (bán hàng, mua hàng, kho, quỹ, tài sản, thuế, nhân sự…) và cho các plugin bên ngoài (WordPress POS, CRM, WooCommerce). Mọi dữ liệu có ảnh hưởng tài chính đi **một đường duy nhất**:

```
Nguồn (phân hệ / plugin / nhập tay)
   │  bizcity_ledger_intake@1 (docKey + version)
   ▼
accounting_events ──► accounting_event_versions        (chứng từ gốc, có phiên bản, lưu nguyên)
   │  luật định khoản (posting rule) + cấu hình (settings matrix, danh mục)
   ▼
ledger_entries / ledger_lines                           (sổ cái: chỉ thêm, sửa = bút toán đảo)
   ▼
ledger_balances_daily · tax_invoices · debt_items · inventory_movements   (bảng dẫn xuất, dựng lại được)
   ▼
Sổ sách, báo cáo, tờ khai
```

Từ 2026-10-29 repo còn là **Bizcity Core Framework**: hạ tầng ứng dụng doanh nghiệp lấy sổ cái làm hạt nhân, để cộng đồng (người và AI) viết module mà không đụng nhân. Chuẩn cho module: **[standard/README.md](standard/README.md)** (Bizcity Framework Standard v1, 7 hợp đồng).

## Bắt đầu từ đâu

| Bạn là | Đọc theo thứ tự |
|---|---|
| **Mọi người** (bắt buộc) | [00-CANON.md](00-CANON.md) → [framework/00-TONG-QUAN.md](framework/00-TONG-QUAN.md) |
| Người / AI viết **module mới** (cộng đồng, vibecode) | [../AGENTS.md](../AGENTS.md) → [standard/README.md](standard/README.md) → [standard/GOLDEN-CASE-HOP-DONG.md](standard/GOLDEN-CASE-HOP-DONG.md) → 7 hợp đồng → [standard/CONFORMANCE.md](standard/CONFORMANCE.md) |
| Người làm **AI / Cell / chatbot**, gói định khoản theo ngành | [contracts/BIZCITY-MCP-v1.md](contracts/BIZCITY-MCP-v1.md) → [standard/CELL-CONNECT.md](standard/CELL-CONNECT.md) → [standard/CHANNEL-GATEWAY-PORT.md](standard/CHANNEL-GATEWAY-PORT.md) → [contracts/BIZCITY-POSTING-TEMPLATE-v1.md](contracts/BIZCITY-POSTING-TEMPLATE-v1.md) → [standard/TEMPLATE-MARKETPLACE.md](standard/TEMPLATE-MARKETPLACE.md) |
| Nhóm Lõi **tách Kernel / Platform** | [standard/REUSE-MAP.md](standard/REUSE-MAP.md) → [standard/TARGET-LAYOUT.md](standard/TARGET-LAYOUT.md) → [standard/PHASES.md](standard/PHASES.md) |
| Người làm **lõi** | [framework/01-CORE-MODULES.md](framework/01-CORE-MODULES.md) → [rules/](rules/) (cả thư mục) → [contracts/](contracts/README.md) |
| Người phụ trách **phân hệ** (mua hàng, kho, nhân sự…) | [framework/03-MO-RONG.md](framework/03-MO-RONG.md) → [rules/RULE-MODULE-BOUNDARY.md](rules/RULE-MODULE-BOUNDARY.md) → [rules/RULE-EVENT.md](rules/RULE-EVENT.md) → [contracts/BIZCITY-MODULE-v1.md](contracts/BIZCITY-MODULE-v1.md) → [workflows/](workflows/README.md) |
| Người viết **plugin bên ngoài** (WP, POS, CRM) | [contracts/BIZCITY-LEDGER-INTAKE-v1.md](contracts/BIZCITY-LEDGER-INTAKE-v1.md) → [contracts/BIZCITY-CONNECTOR-v1.md](contracts/BIZCITY-CONNECTOR-v1.md) → [contracts/BIZCITY-MASTER-DATA-v1.md](contracts/BIZCITY-MASTER-DATA-v1.md) → [api/](api/README.md) |
| Kế toán trưởng / người cấu hình | [rules/RULE-MASTER-DATA.md](rules/RULE-MASTER-DATA.md) → [rules/RULE-SETTINGS-MATRIX.md](rules/RULE-SETTINGS-MATRIX.md) → [nghiep-vu/](nghiep-vu/) |
| Vận hành, DevOps | [ops/DEPLOY.md](ops/DEPLOY.md) → [ops/CI-CD.md](ops/CI-CD.md) → [ops/CLI.md](ops/CLI.md) → [ops/DIAGNOSTICS.md](ops/DIAGNOSTICS.md) |
| Người duyệt PR | [rules/RULE-QUALITY-GATE.md](rules/RULE-QUALITY-GATE.md) + [.github/PULL_REQUEST_TEMPLATE.md](../.github/PULL_REQUEST_TEMPLATE.md) |

## Cây thư mục

| Thư mục | Nội dung | Tính chất |
|---|---|---|
| [00-CANON.md](00-CANON.md) | Chỉ mục mọi luật, cấp độ, bảng "đổi code X thì sửa tài liệu Y" | **Chuẩn** — nguồn sự thật |
| [standard/](standard/README.md) | Bizcity Framework Standard v1: 3 nguyên tắc, 7 hợp đồng module, phiên bản, bộ kiểm cài đặt, ca chuẩn, Cell/MCP, bản đồ tái sử dụng, Phase 1–6 | **Chuẩn** — module phải qua để được cài |
| [framework/](framework/) | Framework là gì: tầng, lõi, gói dùng chung, cách mở rộng, đặt tên, lộ trình | **Chuẩn** |
| [rules/](rules/) | Luật có mã (`R-LEDGER-1`…), mỗi luật có cách kiểm | **Chuẩn** — vi phạm Tier 0 chặn phát hành |
| [contracts/](contracts/) | Hợp đồng có phiên bản `bizcity_*@N` giữa lõi và phân hệ / plugin | **Chuẩn** — đổi phá vỡ thì tăng số |
| [workflows/](workflows/) | Luồng việc doanh nghiệp chuẩn (O2C, P2P, kho, tiền, tài sản, khoá sổ, nhân sự) | **Chuẩn** |
| [ops/](ops/) | Triển khai, CI/CD, dòng lệnh, chẩn đoán, nhật ký kiểm thử | **Chuẩn** |
| [adr/](adr/) | Quyết định kiến trúc (vì sao chọn thế này) | Lịch sử, chỉ thêm |
| [../tests/conformance/](../tests/conformance/README.md) | Bộ kiểm chuẩn một chỗ: selfcheck (tĩnh) + diagnostics (CSDL) song song, bảng điểm, baseline nợ | **Thực thi** chuẩn — `node tests/conformance/selfcheck.mjs` |
| [audits/](audits/) | Kết quả rà soát code so với chuẩn, việc cần sửa | Ảnh chụp theo ngày |
| [api/](api/) | Hướng dẫn chi tiết cho bên gửi từng loại chứng từ, JSON mẫu đã kiểm | Tham chiếu (thực thi `bizcity_ledger_intake@1`) |
| [nghiep-vu/](nghiep-vu/) | Kế toán cho lập trình viên, tình huống ghi sổ | Tham chiếu nghiệp vụ |
| [can-cu/](can-cu/) | Căn cứ pháp lý (TT99/2025, luật thuế…) | Tham chiếu |
| [huong-dan/](huong-dan/) | Hướng dẫn sử dụng từng màn (nút "Hướng dẫn") | Người dùng cuối |

## Tài liệu cũ ở gốc `docs/`

Giữ lại để không gãy liên kết; nội dung chuẩn đã chuyển vào các thư mục trên. Khi hai nơi nói khác nhau, **thư mục chuẩn thắng** và tài liệu cũ phải sửa theo.

| Tệp cũ | Chuẩn thay thế | Ghi chú |
|---|---|---|
| `kien-truc.md` | [framework/00-TONG-QUAN.md](framework/00-TONG-QUAN.md), [framework/01-CORE-MODULES.md](framework/01-CORE-MODULES.md) | Còn nhắc `gl_*`, "hai bộ sổ" — đã lỗi thời |
| `co-so-du-lieu.md` | [rules/RULE-DATABASE.md](rules/RULE-DATABASE.md), `db/README.md` | Bảng migration còn đánh số cũ 0001–0053; nay là 9 file gốc + 0010… |
| `phat-trien.md` | [framework/03-MO-RONG.md](framework/03-MO-RONG.md), [ops/CLI.md](ops/CLI.md) | Phần quy ước giao diện (6a–6e) vẫn là chuẩn UI |
| `add-in.md` | [framework/03-MO-RONG.md](framework/03-MO-RONG.md) | Mẫu code add-in vẫn đúng |
| `api-tich-hop.md`, `cong-ket-noi.md` | [contracts/BIZCITY-LEDGER-INTAKE-v1.md](contracts/BIZCITY-LEDGER-INTAKE-v1.md), [contracts/BIZCITY-CONNECTOR-v1.md](contracts/BIZCITY-CONNECTOR-v1.md) | Bảng ánh xạ phiếu multisite → docType vẫn dùng |
| `trien-khai.md` | [ops/DEPLOY.md](ops/DEPLOY.md) | Là runbook aaPanel cụ thể |
| `cong-nghe.md` | [framework/02-SHARED-PACKAGES.md](framework/02-SHARED-PACKAGES.md) | Bảng phiên bản thư viện vẫn đúng |
