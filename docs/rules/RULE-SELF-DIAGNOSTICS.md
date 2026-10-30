# RULE · Tự chẩn đoán (R-DIAG)
<!-- [2026-10-29 10:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-001 — luật phát hành, thay đổi Kernel, bảo mật, tự chẩn đoán. -->
<!-- [2026-10-30 10:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-003 — tự chẩn đoán L1 / L3, diagnostic_runs, khoá kỳ chặn khi sổ lỗi (PHASES 2.10). -->

> **Cấp:** Tier 0 / 1 (ghi từng luật) · **Phiên bản:** 1.0 · 2026-10-29 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Danh sách mã kiểm và khuôn kết quả:** [../ops/DIAGNOSTICS.md](../ops/DIAGNOSTICS.md) · **Bộ kiểm đang chạy được:** [../../tests/conformance/](../../tests/conformance/README.md) (lane diagnostics)
> **Mục tiêu:** mỗi bản cài **tự biết mình còn đúng không**: sổ có cân không, lớp bảo vệ còn nguyên không, cấu hình có lệch chuẩn không. Phải biết trước khi kế toán hay kiểm toán phát hiện ra.

## 1. Năm tầng

| Tầng | Hỏi gì | Ở đâu | Hiện có |
|---|---|---|---|
| **L0 Sống** | tiến trình chạy, CSDL trả lời `select 1` | `GET /api/v1/system/health` | **có** |
| **L1 Sẵn sàng** | migration đã áp hết; trigger bảo vệ sổ còn và đang bật; CSDL ghi được | `GET /api/v1/system/health/ready` (Docker healthcheck) | **có**: `MIGRATIONS_PENDING`, `LEDGER_TRIGGERS`, `DB_WRITABLE`; bộ kiểm DG-DB-1, DG-DB-2, DG-DB-4 |
| **L2 Bản cài** | đủ biến môi trường; múi giờ; vai trò CSDL không superuser; sao lưu gần nhất < 26 giờ; dung lượng đĩa > 15%; chứng chỉ https còn > 14 ngày; khoá Cell còn hiệu lực (nếu có) | `bizcity doctor`, màn Hệ thống → Chẩn đoán | một phần: DG-DB-3, DG-SEC-1 |
| **L3 Toàn vẹn sổ** | Nợ = Có; số dư ngày khớp dòng; đảo đúng một lần; không bút toán mồ côi; sự việc treo; công nợ, thuế khớp sổ | `GET /api/v1/system/diagnostics`; trước khi khoá kỳ; `afterAll` mọi tệp test | **có**: `LEDGER_*`, `EVENT_*` (bộ kiểm DG-LEDGER-*, DG-EVENT-*); công nợ, thuế khớp sổ (DG-PLAN-*) chưa viết |
| **L4 Tuân chuẩn** | code, migration, hợp đồng, module tuân Standard | CI, `selfcheck.mjs` | **có**: SC-* |

L0–L3 chạy **trên bản cài** (cả bản offline, không cần Cell, không cần mạng ngoài). L4 chạy trên mã nguồn (CI, máy dev, trước khi cài module).

## 2. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-DIAG-1** | Mỗi kiểm có: **mã ổn định** (`LEDGER_BALANCED`…), **mức** (`error` / `warn` / `info`), một câu tiếng Việt nói **hậu quả** và **cách sửa**. Cùng một mã cho cùng một ý nghĩa ở mọi nơi (endpoint, CLI, bộ kiểm, cảnh báo) | `schema/check.schema.json` (`code`) |
| **R-DIAG-2** *(T0)* | Tự chẩn đoán **chỉ đọc**: truy vấn trong giao dịch `READ ONLY`, không bao giờ tự sửa sổ. Sửa dẫn xuất (dựng lại `ledger_balances_daily`…) chỉ bằng lệnh do người chạy, thuộc danh sách ngoại lệ của RULE-LEDGER, có bằng chứng | `lib/db.mjs` (`default_transaction_read_only`); DG-DB-2 |
| **R-DIAG-3** | Lịch chạy:<br>- L0 / L1 mỗi 30 giây (healthcheck Docker);<br>- L2 mỗi giờ và sau khởi động;<br>- L3 mỗi đêm sau sao lưu, sau mỗi cập nhật (R-REL-9), và **trước khi khoá kỳ**. | `events.clock` (Phase 3); `cap-nhat.sh` |
| **R-DIAG-4** *(T0)* | **Khoá kỳ bị chặn** khi L3 có mục `error` thuộc kỳ đó, trừ khi kế toán trưởng ghi lý do chấp nhận (có bằng chứng) | `apps/api/test/diagnostics.test.ts` |
| **R-DIAG-5** | Kết quả lưu vào bảng chỉ thêm `diagnostic_runs` (giữ 90 ngày), xem ở *Hệ thống → Chẩn đoán*, có xu hướng theo ngày giống bảng điểm của bộ kiểm | migration `0034_chan_doan.sql`; `apps/api/test/diagnostics.test.ts` (màn xem: Phase 3) |
| **R-DIAG-6** | Cảnh báo khi có `error` mới:<br>- thông báo trong ứng dụng cho chủ và kế toán trưởng;<br>- có Cell thì phát sự kiện `bizcity.diagnostics.failed` để Cell nhắn Zalo; không có Cell thì gửi email nếu đã cấu hình.<br>Cảnh báo chỉ chứa mã, số lượng, đường dẫn mở màn; **không** chứa số liệu sổ, tên khách | test sự kiện (Phase 3) |
| **R-DIAG-7** | **Đạt rỗng không phải đạt**: kiểm không có dữ liệu để xét thì ghi "rỗng" (0 dòng đã xét), không tính điểm | `selfcheck.mjs` (đã làm) |
| **R-DIAG-8** | Gói hỗ trợ `bizcity doctor --bundle`: phiên bản, cấu hình đã **che bí mật**, kết quả L0–L3, 200 dòng log cuối đã che PII. **Không** có payload chứng từ, không có sổ. Người dùng tự xem rồi tự gửi | Phase 4 (CLI) |
| **R-DIAG-9** | Mỗi kiểm mới ở L1–L3 có bản trong lane diagnostics của bộ kiểm và chạy được bằng `--lane diagnostics` trên bản sao trước khi đưa vào endpoint | SC-DIAG-1 |

## 3. Đối chiếu nhanh

```bash
# Máy dev / bản cài Docker: L1–L3 ngay hôm nay (chỉ đọc)
BIZCITY_PSQL="docker exec -i <tên-container-db> psql -U <user> -d <db>" node tests/conformance/selfcheck.mjs --lane diagnostics
```

Kết quả gần nhất trên máy dev (2026-10-29):
- 11/11 trigger bảo vệ sổ còn và đang bật (DG-DB-2 đạt);
- CSDL đúng múi giờ, UTF8, PostgreSQL ≥ 16;
- **API dùng vai trò superuser** (DG-SEC-1 cảnh báo, R-SEC-6);
- CSDL dev chưa có bút toán, nên L3 là "đạt rỗng".
