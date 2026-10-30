# PHASE-005 — Chính sách kế toán có phiên bản + ngày hiệu lực

> **Trạng thái:** ⛔ chưa code · [ADR-0009](../../adr/ADR-0009-chinh-sach-ke-toan-co-phien-ban.md) đã soạn (Đề xuất, 2026-10-30), chờ chủ dự án + kế toán trưởng chốt Q-1…Q-5
> **Giai đoạn:** Phase 2 của [PHASES](../../standard/PHASES.md) · **Code:** chưa · **Tiến độ tín hiệu (2026-10-30):** 0%
> **Mục tiêu:** Đổi chế độ / cấu hình định khoản không áp ngược vào chứng từ cũ: mỗi bản chính sách có `policy_version` + `effective_from`, ghi sổ chọn bản theo ngày chứng từ, `posting_log` ghi bản đã dùng.
> **Việc lộ trình:** 2.14
> **Checklist công bố:** G2-09
> **Tuân thủ / nguyên tắc:** C-9 (0% hôm nay) · AP-5
> **Phụ thuộc phase:** 004 (khuyến nghị: mọi đường ghi đi một cửa thì ghi `policy_version` một chỗ)

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Cấu hình định khoản không có phiên bản / ngày hiệu lực: `posting_defaults`, `posting_reasons`, `product_posting_groups` | `db/migrations/0003_goc_cau_hinh_dinh_khoan.sql:94, 110, 154` |
| F2 | Tiền lệ trong code: luật kết chuyển đã có bảng phiên bản `closing_rule_versions` | `db/migrations/0003_goc_cau_hinh_dinh_khoan.sql:14` |
| F3 | `posting_log` không có cột `policy_version` | `db/migrations/0005_goc_chung_tu.sql:304` |
| F4 | Năng lực `posting.policy-version` đang `planned`; ma trận tuân thủ C-9 = 0% | `docs/standard/bizcity-standard.json`, `compliance-matrix.json` |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 2.14 ☐.
