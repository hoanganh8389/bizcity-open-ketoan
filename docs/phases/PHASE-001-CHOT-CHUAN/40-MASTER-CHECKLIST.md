# PHASE-001 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S001-1 | Nhóm Lõi duyệt `docs/standard/`, hợp đồng, CANON | 0.1 | có | ⛔ chủ merge nhánh `feat/phase-0-tiep` vào `main` |
| S001-2 | CI `ci.yml` + `conformance.yml` | 0.2 | có | 🟡 chờ CI xanh trên `main` sau merge |
| S001-3 | Migration đúng chuẩn (0030, 0031, 0033) | 0.3 | có | ✅ |
| S001-4 | ADR-0003..0005 chốt REUSE-MAP §6 | 0.4 | có | ✅ |
| S001-5 | Bộ kiểm chuẩn một chỗ (ADR-0006) | 0.5 | có | ✅ |
| S001-6 | Luật R-KER / R-SEC / R-REL / R-DIAG, `SECURITY.md`, `CHANGELOG.md` | 0.6 | có | ⛔ chủ bật GitHub Private Vulnerability Reporting |
| S001-7 | Vai trò CSDL `ketoan_app` + header bảo mật nginx | 0.7 | có | ⛔ bản cài thật đặt `DB_APP_USER` / `DB_APP_PASSWORD` |
| S001-8 | Kiểm migration sạch + nâng cấp | G1-13 | có | 🟡 chờ tag `v*` đầu tiên làm mốc |
| S001-9 | Ba lớp kiểm soát + ma trận tuân thủ tính tự động | G2-10 | có | ✅ |
| S001-10 | Giấy phép GPL-2.0-or-later + `TRADEMARK.md` | — | có | ✅ |
| S001-11 | CSDL dev áp 0030–0037 | — | — | ☐ `docker compose up -d --build` |

## Ca bằng chứng

| ID | Ca | Mong đợi | Trạng thái |
|---|---|---|---|
| T001-1 | Merge vào `main` | CI `test` + `conformance` xanh trên `main` | ☐ |
| T001-2 | Gắn tag `v0.2.0` | job `migrate-upgrade` chạy thật từ tag, ĐẠT | ☐ |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
