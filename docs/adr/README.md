# Quyết định kiến trúc (ADR)
<!-- [2026-10-29 10:24 PM Johnny Chu - Chu Hoàng Anh] INIT — khởi tạo Bizcity Core Framework: sổ cái chỉ thêm, cửa nạp sự việc, CANON, hợp đồng, bộ kiểm chuẩn. -->
<!-- [2026-10-30 12:10 PM Johnny Chu - Chu Hoàng Anh] ADR-0007 — chuẩn hoá mã lỗi, quan sát, bộ giám sát, cài nhanh, kiến trúc, đóng góp. -->
<!-- [2026-10-30 01:11 PM Johnny Chu - Chu Hoàng Anh] CONG-BO — tuyên bố tối thượng, 7 nguyên tắc AP, ba lớp kiểm soát, ma trận tuân thủ, kiểm nâng cấp migration. -->
<!-- [2026-10-30 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-009 — MCP ghi: lập nháp, đề xuất huỷ, luôn chờ duyệt; ADR-0009 đề xuất. -->
<!-- [2026-10-30 09:03 PM Johnny Chu - Chu Hoàng Anh] PHASE-005 — chính sách kế toán có phiên bản + ngày hiệu lực (ADR-0009). -->
<!-- [2026-11-01 10:16 PM Johnny Chu - Chu Hoàng Anh] ADR-0011 — thêm ADR-0011 vào chỉ mục -->
<!-- [2026-11-02 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — thêm ADR-0012 (đề xuất) Conformance Engine trụ cột Kernel vào chỉ mục -->
<!-- [2026-11-02 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ADR-0012 chấp nhận -->
<!-- [2026-11-02 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — thêm ADR-0013 hồ sơ kế toán có phiên bản -->
<!-- [2026-11-01 03:01 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi: sáu lớp bảo đảm, span chỉ ở khớp nối Platform + cổng Kernel, thuộc tính theo danh sách cho phép, Tempo -->

Một tệp cho mỗi quyết định khó đảo ngược hoặc mỗi ngoại lệ Tier 1. Chỉ thêm; quyết định bị thay thì ghi "Thay bởi ADR-xxxx" ở đầu tệp cũ.

| Số | Tiêu đề | Trạng thái |
|---|---|---|
| [0001](ADR-0001-mot-cua-su-viec.md) | Mọi đầu vào tài chính đi một cửa sự việc | Chấp nhận |
| [0002](ADR-0002-tien-to-bizcity.md) | Tiền tố `bizcity_` ở hợp đồng và bề mặt ngoài, không đổi tên bảng | Chấp nhận |
| [0003](ADR-0003-hop-dong-thanh-module.md) | Nghiệp vụ hợp đồng trong lõi chuyển thành module `hop-dong` (sau ca chuẩn) | Chấp nhận |
| [0004](ADR-0004-ban-hang-tach-doi.md) | Bán hàng tách đôi: dòng bán thuộc Kernel, báo cáo là module | Chấp nhận |
| [0005](ADR-0005-danh-muc-chuan-o-packages-data.md) | Danh mục chuẩn ở `packages/data`, cột tài khoản do Kernel quản | Chấp nhận |
| [0006](ADR-0006-bo-kiem-chuan-mot-cho.md) | Một bộ kiểm chuẩn `tests/conformance/`: hai lane song song, bảng điểm, baseline bánh cóc | Chấp nhận |
| [0007](ADR-0007-goi-chia-se-va-ha-tang.md) | Chuẩn hoá gói chia sẻ và hạ tầng: học từ bộ 27 gói tham chiếu, PostgreSQL là hạ tầng bắt buộc duy nhất, adapter tuỳ chọn, `infrastructure/` riêng, không Prisma | Chấp nhận |
| [0008](ADR-0008-cay-thu-muc-lean.md) | Cây thư mục lean: nhận ý đề xuất 9 thư mục gốc, gộp theo tiêu chí lean (`packages/kernel` một gói, `contracts/` theo ba lớp kiểm soát, sự kiện là gói Platform) | Chấp nhận |
| [0009](ADR-0009-chinh-sach-ke-toan-co-phien-ban.md) | Chính sách kế toán có phiên bản + ngày hiệu lực (C-9): đề xuất bản chụp chính sách `posting_policy_versions`, định khoản theo bản của ngày hạch toán; sửa cấu hình tự chụp bản amend, đổi chế độ thì phát hành | Chấp nhận (chủ dự án 2026-10-30; kế toán trưởng chưa ký) |
| [0010](ADR-0010-opentelemetry-tu-loi.md) | OpenTelemetry từ lõi kiến trúc: sáu lớp bảo đảm (Kernel · PostgreSQL + Audit Ledger · OpenTelemetry · Prometheus · Grafana + Tempo + Loki · Alertmanager); span chỉ ở khớp nối Platform + bọc một lần cổng `kernel/public.ts`, thuộc tính theo danh sách cho phép; module cộng đồng tự có trace, không sửa Kernel | Chấp nhận (chủ dự án 2026-11-01) |
| [0011](ADR-0011-plugin-ba-muc-tin-cay.md) | Plugin theo ba mức tin cậy: module trong mã nguồn bản cài (tự host, trong tiến trình) · app ngoài tiến trình (khoá có phạm vi, webhook từ outbox, iframe) · gói ký (Phase 5); **không drop-in**; hai mức bật, nạp theo hash, migration module bằng vai trò `mod_<key>_owner`, ghi sổ chỉ qua `submit` | Chấp nhận 2026-11-01 |
| [0012](ADR-0012-conformance-engine-tru-cot-kernel.md) | Conformance Engine là trụ cột cấp Kernel: ba lớp (Module · Cấu hình · Doanh nghiệp), bốn thành phần (Registry cấp điều khoản · Test Packs · Oracle · Evidence), ba cổng (Build chặn · Posting chỉ thông tin — người dùng quyết · Compliance Report); bảng điểm theo ma trận BizCity; chỉ đọc | Chấp nhận 2026-11-02 (kèm T1–T8) |
| [0013](ADR-0013-ho-so-ke-toan-co-phien-ban.md) | Hồ sơ kế toán của đơn vị có phiên bản: năm tài chính, chế độ kế toán, loại pháp nhân; bảng chỉ thêm `accounting_profiles`, hiệu lực từ đầu năm tài chính; Core giữ cấu trúc, Conformance phân tích; chưa khai thì không đoán | Chấp nhận 2026-11-02 |
| [0014](ADR-0014-tram-tien-kiem-be-cho-dau-vao.md) | Trạm tiền kiểm và bể chờ đầu vào: không vứt đầu vào bị từ chối (`intake_inbox`, không ghi vào `accounting_events`), tiền kiểm năm lớp gom mọi lỗi, phát hiện viết cho người mới, chấm điểm đầu vào cho kế toán trưởng; Kernel chặn nguyên vẹn | Chấp nhận 2026-11-02 → [PHASE-021](../phases/PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/README.md) <!-- [2026-11-02 02:38 PM Johnny Chu - Chu Hoàng Anh] ADR-0014 — thêm vào chỉ mục --> <!-- [2026-11-02 03:34 PM Johnny Chu - Chu Hoàng Anh] ADR-0014 — chủ duyệt --> |
| [0015](ADR-0015-duyet-rulepack-tai-ban-cai.md) | Duyệt rulepack tại bản cài: bản cài tự chủ tự duyệt (quyền `conformance:approve`), lượt duyệt gắn phiên bản + băm nội dung, nhãn "Đạt theo duyệt của đơn vị" tách khỏi nhãn Bizcity <!-- [2026-11-02 05:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ADR-0015 (đổi số: ADR-0014 là Trạm tiền kiểm) --> | Chấp nhận 2026-11-02 |

## Khuôn

```markdown
# ADR-NNNN · <tiêu đề>

- Trạng thái: Đề xuất | Chấp nhận | Thay bởi ADR-xxxx
- Ngày: YYYY-MM-DD · Người quyết: …
- Luật / hợp đồng liên quan: R-…, bizcity_…@N

## Bối cảnh
## Quyết định
## Hệ quả (được gì, mất gì, việc phải làm)
## Phương án đã cân nhắc
```
