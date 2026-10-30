# PHASE-016 — Tải lớn và adapter tuỳ chọn: hàng đợi, partition, Redis, NATS, OIDC, Kubernetes

> **Trạng thái:** ☐ chưa code · chỉ làm khi đo được nhu cầu (ADR-0007)
> **Giai đoạn:** Phase 5 của [PHASES](../../standard/PHASES.md) · **Code:** chưa · **Tiến độ tín hiệu (2026-10-30):** 0%
> **Mục tiêu:** 30.000 chứng từ / ngày, p95 ghi sổ < 1 giây; chạy nhiều máy API đúng; mỗi adapter có mặc định không cần dịch vụ ngoài.
> **Việc lộ trình:** 5.5, 5.9
> **Checklist công bố:** G2-06, G3-03, G3-05, G3-08, G3-09
> **Tuân thủ / nguyên tắc:** C-5 (NATS sau outbox)
> **Phụ thuộc phase:** 006

<!-- [2026-10-30] Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| Tài liệu | Một câu |
|---|---|
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | nguồn trạng thái việc con duy nhất của phase + ca bằng chứng + log |

## Hiện trạng đọc mã

| # | Sự thật | Ở đâu |
|---|---|---|
| F1 | Chạy được chỉ với PostgreSQL; chưa có thư mục `adapters/` | ADR-0007, ADR-0008 |
| F2 | Luật đệm R-CACHE-1..6: không đệm dữ liệu sổ | `docs/rules/RULE-INFRASTRUCTURE.md` §1 |

## Xong khi

Phase xong khi mọi việc lộ trình ở trên **done** trên bảng điểm (`node tests/conformance/selfcheck.mjs`, tín hiệu ở [roadmap.json](../../standard/roadmap.json)) và mọi mã checklist công bố chuyển **có** trong [Bản công bố §6](../../CONG-BO-KIEN-TRUC.md). Trạng thái hôm nay: 5.5 ☐ · 5.9 ☐.
