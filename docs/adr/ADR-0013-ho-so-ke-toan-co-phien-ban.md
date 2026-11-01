# ADR-0013 · Hồ sơ kế toán của đơn vị có phiên bản: năm tài chính, chế độ kế toán, loại pháp nhân
<!-- [2026-11-02 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ADR-0013 chấp nhận: bảng chỉ thêm accounting_profiles (0049), hiệu lực từ đầu năm tài chính, Core giữ cấu trúc, Conformance phân tích; lấp khoảng trống G1 (S020-22). -->

- Trạng thái: **Chấp nhận** — chủ dự án (Johnny Chu) 2026-11-02 ("ok, code nhé", sau khi chốt Q020-2: mở năng lực năm tài chính / chế độ kế toán của đơn vị ngay)
- Ngày: 2026-11-02 · Người quyết: chủ dự án · Mức Kernel: **K1** — thêm bảng chỉ thêm + hai action; **không** đổi luật định khoản, cửa nạp, sổ cái, kỳ kế toán
- Luật / hợp đồng liên quan: [ADR-0012](ADR-0012-conformance-engine-tru-cot-kernel.md) (Conformance Engine, R-VNC-10), [ADR-0009](ADR-0009-chinh-sach-ke-toan-co-phien-ban.md) (chính sách có phiên bản — cùng khuôn), `bizcity_compliance@1` C-9, R-VNC-4 bước 1–2 · Phase: [PHASE-020](../phases/PHASE-020-KIEM-CHUAN-PHAP-LY-VN/README.md) S020-22

## Bối cảnh

Audit [VN-CONFORMANCE-BASELINE-2026-11-01](../audits/VN-CONFORMANCE-BASELINE-2026-11-01.md) ghi khoảng trống **G1**: đơn vị không có năm tài chính, chế độ kế toán, loại pháp nhân. `fiscal_periods` là kỳ tháng dương lịch; chế độ chỉ nằm gián tiếp trên gói định khoản (`config_packs.regime`). Hệ quả:

- TT99/2025 áp theo **năm tài chính bắt đầu từ 01/01/2026**. Đơn vị năm tài chính 01/7/2025 – 30/6/2026 vẫn theo TT200 tới hết năm đó. Không có năm tài chính thì không ai (người hay máy) trả lời được "đơn vị đang theo chế độ nào".
- Conformance Engine lớp Cấu hình (ADR-0012) không có dữ liệu thật để chọn rulepack; mọi ca chế độ chỉ ra REVIEW_REQUIRED.

## Quyết định

1. **Bảng chỉ thêm `accounting_profiles`** (migration 0049): mỗi dòng là một phiên bản hồ sơ gồm `fiscal_year_start_month`, `regime` (`vn-tt200-2014` · `vn-tt99-2025` · `vn-tt133-2016` · `vn-tt152-2025`), `entity_type` (`enterprise` · `sme` · `micro` · `household`), `note` bắt buộc, người phát hành. Trigger chặn sửa / xoá; RLS cùng khuôn 0041.
2. **Hiệu lực từ đầu năm tài chính**: `effective_from` là ngày 01 của tháng bắt đầu năm tài chính của chính hồ sơ đó (CHECK ở CSDL). Hồ sơ áp cho ngày D = bản có `effective_from ≤ D` lớn nhất. Hồ sơ mới không bao giờ đổi chế độ giữa một năm tài chính.
3. **Không phát hành vào năm đã có kỳ khoá** (kỳ khoá ở hoặc sau ngày hiệu lực).
4. **Chưa khai = chưa khai.** Không có dòng thì `current = null`; Core không suy chế độ từ gói định khoản hay từ ngày. Không tự tạo hồ sơ khi khởi tạo đơn vị.
5. **Core chỉ giữ cấu trúc.** Chế độ có hợp với loại pháp nhân / năm tài chính / quy định đang hiệu lực (vd hộ kinh doanh khai TT99, năm tài chính không bắt đầu đầu quý, gói định khoản TT99 trên đơn vị khai TT133) là **phân tích của Conformance Engine** để người dùng quyết định — không chặn ở Kernel (ADR-0012, R-VNC-10).
6. **Hai action**: `accounting.profile.get` (đọc, `ledger:read`, AI đọc được) và `accounting.profile.publish` (`settings:write`, idempotency, dry-run, bằng chứng tự động, AI không dùng). Năng lực `accounting.profile` available.
7. Kỳ kế toán tháng (`fiscal_periods`) **giữ nguyên**: năm tài chính là cách gom 12 kỳ tháng bắt đầu từ tháng đã khai.

## Hệ quả

**Được:** lớp Cấu hình của Conformance có dữ liệu thật; ca C02.2 (năm tài chính lệch) có bằng chứng chạy thật (`accounting-profile.test.ts`); chuyển chế độ có lịch sử bất biến, có bằng chứng, không hồi tố. Một bảng, hai action, không đổi đường ghi sổ.

**Chưa làm (cố ý, giữ Core lean):** báo cáo năm, kết chuyển cuối năm, số dư đầu năm **chưa** đọc năm tài chính từ hồ sơ — vẫn theo năm dương lịch như hôm nay. Chuyển chúng sang năm tài chính là việc riêng có ADR khi có đơn vị cần (đơn vị năm dương lịch không bị ảnh hưởng). Màn khai hồ sơ ở *Hệ thống → Thông tin đơn vị* làm cùng màn Kiểm chuẩn (S020-20). Hệ thống tài khoản theo chế độ (G2) và TT133 / TT152 (G5) vẫn mở.

**Việc phải làm:** migration 0049 chưa phát hành, số có thể đổi khi gộp cùng nhánh khác đang giữ 0049 (đổi tên tệp, không đổi nội dung).

## Phương án đã cân nhắc

| Phương án | Vì sao không |
|---|---|
| Khoá trong `tenants.settings` | đường sửa thông tin đơn vị đọc rồi ghi đè cả cột không khoá dòng: lịch sử chế độ có thể mất âm thầm; không chặn sửa ở CSDL |
| Cột `regime` trên `posting_policy_versions` | trộn hồ sơ đơn vị với cấu hình định khoản; chính sách đổi theo ngày bất kỳ, hồ sơ chỉ đổi đầu năm tài chính |
| Suy chế độ từ gói định khoản đã cài | gói là cấu hình định khoản, không phải lời khai của đơn vị; suy đoán trái nguyên tắc "không đoán" |
| Chặn ở Kernel khi chế độ không hợp loại pháp nhân | là phân tích pháp lý, nguồn còn chờ rà; chặn máy móc sẽ chặn sai — để Conformance báo, người dùng quyết |
