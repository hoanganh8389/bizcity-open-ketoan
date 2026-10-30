# PHASE-017 — Beta hệ sinh thái: CRM, kho tách lõi, phát hành, registry gói

> **Trạng thái:** ☐ chưa code · không làm trước khi ca chuẩn Hợp đồng đạt (4.5 trước 5.1)
> **Giai đoạn:** Phase 5 của [PHASES](../../standard/PHASES.md) · **Code:** chưa · **Tiến độ tín hiệu (2026-10-30):** 0%
> **Mục tiêu:** Người ngoài nhóm Lõi viết module chỉ bằng SDK; bản Beta có phát hành ký, SBOM; registry gói định khoản có chữ ký.
> **Việc lộ trình:** 5.1, 5.2, 5.6, 5.7, 5.8
> **Checklist công bố:** G3-01
> **Tuân thủ / nguyên tắc:** AP-1
> **Phụ thuộc phase:** 014

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Kho còn trong lõi (`modules/inventory` + `phan-he/kho`) | `apps/api/src/` |
| F2 | Luật phát hành và thiết kế marketplace có, chưa có `release.yml` | `docs/rules/RULE-RELEASE.md`, `docs/standard/TEMPLATE-MARKETPLACE.md` |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 5.1 ☐ · 5.2 ☐ · 5.6 ☐ · 5.7 ☐ · 5.8 ☐.
