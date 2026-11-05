# PHASE-002 · 40 — Master checklist
<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — thư mục phase PHASE-001…017, SC-PHASE-1. -->

> Nguồn trạng thái **việc con** duy nhất của phase. "Xong" của việc lộ trình do bảng điểm tính, không do bảng này. Nhiều phiên: chỉ sửa đúng dòng theo ID; Log chỉ nối thêm.
> Ký hiệu: ☐ chưa làm · 🟡 có mã + test, chưa đủ tín hiệu · ✅ đủ tín hiệu / có bằng chứng · ⛔ chờ chủ hoặc người ngoài nhóm · ❌ huỷ.

<!-- [2026-10-30 01:36 PM Johnny Chu - Chu Hoàng Anh] AUDIT — Mở thư mục phase theo chỉ đạo của chủ dự án (Johnny Chu – Chu Hoàng Anh): "rà soát lại kiến trúc và checklist đã làm đến đâu … chia phase cụ thể theo từng folder phase". Trạng thái chụp từ bảng điểm cùng ngày (CSDL ketoan_test, đủ migration). -->

| ID | Việc | Lộ trình / G | Code | Trạng thái |
|---|---|---|---|---|
| S002-1 | Rà REUSE-MAP với người phụ trách từng phân hệ | 1.1 | — | ⛔ cần người phụ trách 9 phân hệ xác nhận từng dòng |
| S002-2 | Nhãn lớp mọi tệp + SC-LAYER-1 | 1.2 | có | ✅ |
| S002-3 | A-17..A-26 thành việc có người nhận (mỗi chỗ SC-MOD-2: action Core thay thế hay chuyển bảng về module) | 1.3 | — | 🟡 2026-11-05 đối chiếu: 7/10 đã hết, còn 3 việc chưa ai nhận — bảng dưới <!-- [2026-11-05 04:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-002 — S002-3 đối chiếu A-17..A-26 --> |
| S002-4 | Đồ thị phụ thuộc làm mốc + SC-LAYER-2 | 1.4 | có | ✅ |
| S002-5 | Bản nháp `packages/module-sdk/API.md` | 1.5 | có | ✅ (5 câu hỏi mở chuyển sang PHASE-011) |

### Đối chiếu A-17..A-26 (2026-11-05) <!-- [2026-11-05 04:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-002 — bảng đối chiếu A-17..A-26 -->

Đối chiếu [REUSE-MAP §5](../../standard/REUSE-MAP.md) với `main` (bảng điểm + `bizcity-standard.json`). 1.3 xong khi ba dòng "còn" có người nhận.

| Mã | Còn hay hết | Bằng chứng / việc còn lại |
|---|---|---|
| A-17 | hết | SC-MOD-2 = 0 (S014-13 W5) |
| A-18 | **còn** | SC-EVD-1 nợ cũ: `apps/api/src/phan-he/mua-hang/log.ts:23` (JSONL), `apps/api/src/addins/tro-ly/store.ts:61, 126` — chuyển vào bằng chứng CSDL; người nhận: người phụ trách `mua-hang`, `tro-ly` (CODEOWNERS) |
| A-19 | **còn** (phía phân hệ) | Core có `documents.attachments`; `mua-hang` còn bảng `purchase_attachments` — chuyển trong đợt chuyển `mua-hang` (ADR-0024) |
| A-20 | hết | `documents.workflow`, `documents.signatures` available |
| A-21 | hết | `Idempotency-Key` cho action (G1-04, 2.5) |
| A-22 | hết | outbox + subscriber `catalog.notify-sales` (PHASE-006) |
| A-23 | hết | RLS mọi bảng có `tenant_id` (PHASE-007); `permissions.module` available |
| A-24 | hết | MCP đọc / ghi (PHASE-003, PHASE-009) |
| A-25 | hết | manifest `bizcity.module.json` (3.2) |
| A-26 | **còn** (bảng cũ) | module mới có `data.migrations.module`; bảng nghiệp vụ cũ trong migration nền chỉ dời theo đợt chuyển phân hệ (ADR-0024), không sửa migration đã phát hành |

## Log

| Thời điểm thật | Phiên | Việc |
|---|---|---|
| 2026-10-30 | Claude Code | Mở thư mục phase; trạng thái chụp từ bảng điểm (CSDL `ketoan_test`). |
