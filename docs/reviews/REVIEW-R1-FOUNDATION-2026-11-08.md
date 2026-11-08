# Review R1 · Nền móng lần 1 — Core open-ketoan sau PHASE-001 → PHASE-031
<!-- [2026-11-08 12:40 PM Johnny Chu - Chu Hoàng Anh] REVIEW — biên bản R1: quét 31 phase, 32 hợp đồng, mã Kernel / Platform / module ở main 886f4f95; chấm 12 trục theo TIEU-CHI v1.0; 18 phát hiện RV-R1-01…18 -->

> **Đo ở:** `origin/main` @ **`886f4f95`** (Merge PR #163, 2026-11-08 11:30 +07), worktree sạch, chỉ đọc. `main` sau đó tới `b37b1531` chỉ thêm một dòng giữ chỗ tài liệu, không đổi mã.
> **Máy đo:** Windows 11, Node 24; **không có CSDL test** ⇒ 50 phép lane diagnostics `DG-*` bị bỏ qua, điểm trục nào cần bằng chứng chạy thật thì tối đa **3**.
> **Tiêu chí:** [TIEU-CHI.md](TIEU-CHI.md) v1.0. **Bảng điểm:** [BANG-DIEM.md](BANG-DIEM.md). **Bản máy đọc:** [review-board.json](review-board.json).
> **Ký hiệu:** [M] đã thấy trong mã / migration / test · [D] chỉ thấy trong tài liệu · [S] suy luận của người review.

## Kết luận: ĐẠT có điều kiện — 27/48 (56 %)

| | |
|---|---|
| Trục cổng | A2 = 2 · A7 = 2 · A12 = 2 — đều ≥ 2, không trục nào = 0 ⇒ không rơi vào KHÔNG ĐẠT (RV-2) |
| Phát hiện | **3 chặn** · 7 nặng · 5 vừa · 3 nhẹ |
| Bộ kiểm trên `main` | **KHÔNG ĐẠT** — `SC-DATA-1`: hai migration cùng số `0080`. Còn lại: tuân chuẩn 98,6 (A) · sẵn sàng Standard 77,2 (C) · **độ phủ luật 43 (F)** · lộ trình 71 % · ma trận tuân thủ 77 % (4 đạt · 5 một phần) |
| Đóng phiên bản | **Chưa đóng được v0.1.0 (Nền móng)** cho tới khi RV-R1-01, 02, 03 xong và chủ dự án quyết RV-R1-14 — xem [PHIEN-BAN.md](PHIEN-BAN.md) |

**Một câu.** Phần lõi ghi sổ đã chặt (cân Nợ = Có, sổ chỉ thêm, khoá kỳ ở CSDL, outbox cùng giao dịch, nhật ký chuỗi băm); phần mềm dẻo phía ngoài đã mạnh ở trạm tiền kiểm (L1–L5, bể chờ, remedy). Chỗ yếu nằm **ở giữa hai lớp**: lỗi Kernel trả về cho module sai mã và thiếu ngữ cảnh; chính sách mới kiểm "có tham chiếu" chứ chưa kiểm "đúng"; phiên bản chứng từ của phân hệ chưa nối vào sổ; và người vận hành chưa xem được từng sự kiện vào.

## 1. Điểm từng trục

| Trục | Điểm | Vì sao (ý yếu nhất kéo xuống) | Bằng chứng chính |
|---|---|---|---|
| A1 Nền tảng lõi & hợp đồng | **3** | 20/26 hợp đồng có mã + test; `document`, `module`, `extension`, `authorization`, `settings`, `item_master`, `lineage` có mã chưa đủ; `library@1` chỉ tài liệu. Cổng Kernel được SC-KERNEL-6 giữ [M] | `packages/kernel/src/index.ts`, `apps/api/src/kernel/public.ts`, `docs/contracts/BIZCITY-LIBRARY-v1.md` |
| A2 Bảo toàn số & một cửa | **2** | Trigger cân / chỉ thêm / khoá kỳ có thật và có test, nhưng **cờ thoát tự bật được** (RV-01) và nhánh E2 sửa đầu bút toán không cần cờ (RV-14); hai cửa ghi thay vì một (RV-07) [M] | `db/migrations/0006_goc_so_cai.sql`, `db/migrations/0049_khoa_dau_but_toan.sql`, `db/migrations/0082_khoa_ky_o_csdl.sql`, `db/migrations/0077_event_id_but_toan_bat_buoc.sql` |
| A3 Liên tục & truy vết | **2** | Truy vết chứng từ ↔ bút toán đạt ở API hai chiều, có test; nhưng chưa có màn web, chưa tới báo cáo, `correlation_id` đứt ở `posting_log` / `intake_inbox` (RV-13); liên tục kế toán chỉ thiết kế (RV-17) [M] | `packages/kernel/src/modules/documents/document-history.service.ts`, `packages/kernel/src/modules/lineage/lineage.service.ts` |
| A4 Cross-module & sự kiện | **3** | Outbox cùng giao dịch, `correlationId` / `causationId`, subscriber có test; SC-MOD-1/2 giữ biên module = 100 [M]. Chưa 4 vì không có bằng chứng chạy thật | `packages/platform/src/core/events.ts` |
| A5 Minh bạch & nhật ký vận hành | **2** | Chuỗi băm `audit_logs` đạt; nhưng API sự kiện chỉ trả số đếm, không lộ `last_error`, không lọc / xem chi tiết; dead bị xoá sau 90 ngày (RV-09) [M] | `apps/api/src/modules/system/events.routes.ts`, `packages/platform/src/core/audit.ts` |
| A6 Cổng kiểm & thư viện lỗi | **3** | L1–L5 + định khoản thử + Commit Guard có test; 37 mã `IN-*` có `remedy` có cấu trúc, SC-FIX-1 ép; bể chờ sửa – nộp lại đủ vòng [M]. Kẽ hở Commit Guard (RV-10) là mức vừa | `packages/kernel/src/modules/intake/preflight.ts`, `packages/kernel/src/modules/intake/guard.ts`, `packages/contracts/src/intake-findings.ts` |
| A7 Kernel báo lỗi cho module | **2** | Có `ERROR_CATALOG` với hint; nhưng lỗi trigger CSDL bị gộp thành `POSTING_FAILED` (RV-02) và lỗi Kernel không mang docKey / eventId / kỳ / remedy (RV-06) [M] | `packages/platform/src/core/http.ts`, `packages/kernel/src/modules/ledger/ledger.service.ts`, `packages/contracts/src/errors.ts` |
| A8 Chứng từ: phiên bản · workflow · transition · quyền | **2** | (b) bút toán gắn chứng từ gốc: **đạt** nhờ `0077` NOT NULL. (a) phiên bản chứng từ phân hệ chưa gọi `saveVersion`, cùng phiên bản khác nội dung bị ghi đè (RV-08). (c) chỉ 2 YAML, phân hệ tự UPDATE trạng thái. (d) transition không ghi quyền / vai, chưa SoD (RV-11) [M] | `packages/platform/src/core/documents.ts`, `packages/platform/src/core/workflow.ts`, `apps/api/src/phan-he/mua-hang/purchase-document.workflow.yaml` |
| A9 Policy Registry | **2** | Registry có bảng bất biến + API + `IN-POL-001..003` ở cửa nạp; nhưng chưa có Rule Contract / `evaluate`, chưa API cho plugin, chính sách ngừng vẫn qua kiểm (RV-04), regex sai (RV-05), ba cơ chế phiên bản song song (RV-12) [M] | `packages/platform/src/core/policies.ts`, `packages/kernel/src/modules/intake/policy-check.ts`, `db/migrations/0079_so_dang_ky_chinh_sach.sql` |
| A10 Cấu hình UI/UX & tài liệu dev | **2** | HT13 Cấu hình hệ thống đủ mockup → mã → hướng dẫn; HT09, HT10, Phân quyền có mã. Nhưng ui-kit 8 thành phần, template module không có màn cấu hình mẫu, `GateResult` chưa chốt chặn 3 màn, tài liệu dev còn trỏ `phan-he/` (RV-15, RV-16) [M] | `packages/ui-kit/src/index.tsx`, `apps/web/src/features/system/ConfigCenterPage.tsx` |
| A11 Module thi hành | **2** | Mua hàng gần đủ mẫu (flow, YAML, dashboard, lọc, chính sách có phiên bản); kế toán có cảnh báo + dashboard; bán hàng / kho / tài sản / thuế thiếu workflow, chính sách, họ mã lỗi riêng; chuyển `modules/` ≈ 10–15 % (RV-18) [M] | `modules/phan-quyen/`, `modules/mua-hang/domain/`, `apps/api/src/phan-he/` |
| A12 Lean & vận hành cộng đồng | **2** | `main` đỏ (RV-03); độ phủ luật 43 (F); tài liệu chậm hơn mã ở 4 chỗ (RV-15). R-FLOW đang được giữ (CLAIMS, bảng việc sinh từ main) và Core không phình ngoài lý do [M] | `tests/conformance/selfcheck.mjs`, `docs/phases/CLAIMS.md`, `docs/phases/BANG-VIEC.md` |

## 2. Hai mặt của triết lý — đọc theo một chứng từ

```
Nguồn: POS / phân hệ / MCP / nhập tay / kết nối
 │  mềm: tự tính, mua hàng có skipPolicies / override hạn mức      [M]
 ▼
INTAKE   L1 khuôn → BỂ CHỜ giữ nguyên văn (intake_inbox)             [M, test]
         L2 số học · L3 danh mục · L4 nghiệp vụ / thuế / IN-POL     [M, test]
         L5 định khoản thử (savepoint, ≤ 3 s) = "bút toán dự kiến"   [M, test]
         Commit Guard: chỉ chặn khi lệch dấu VÀ còn lỗi chặn        [M] ← RV-10
 ▼
CHỨNG TỪ accounting_events (+ versions)                               [M]
         document_versions của phân hệ: chưa ai gọi                  [M] ← RV-08
 ▼
POLICY   posting_policy_versions · policy_registry · setting_values   [M] ← RV-12 (ba nguồn)
         IN-POL chỉ kiểm "có tham chiếu, đúng băm, đúng ngày"        [M] ← RV-04
 ▼
KERNEL   postDocumentIn ─┐  eventStore.post (cửa thứ 2, assets gọi) [M] ← RV-07
         validateLines   ├─► ledger.service → trigger CSDL           [M, test]
         Nợ = Có · event_id NOT NULL · khoá kỳ · chỉ thêm            [M, test]
         cờ ketoan.allow_ledger_purge tự bật được                    [M] ← RV-01
         lỗi trigger → POSTING_FAILED, mất mã thật                   [M] ← RV-02
 ▼
SỔ       ledger_* · posting_log · event_outbox → deliveries           [M]
         dead xoá sau 90 ngày; không API xem từng sự kiện            [M] ← RV-09
 ▼
ĐỌC      bizcity_read.* · documents/history (API, chưa màn) · lineage [M]
```

**Mặt trong (chặt):** đạt ở Nợ = Có, sổ chỉ thêm, khoá kỳ, sự việc gốc bắt buộc, outbox cùng giao dịch, nhật ký băm. Bị thủng ở **cờ thoát** và **ánh xạ lỗi**.
**Mặt ngoài (mềm):** đạt ở bể chờ, chế độ tư vấn, định khoản thử, remedy có cấu trúc. Thiếu ở **màn xem sự kiện vào**, **lỗi Kernel có ngữ cảnh**, **chính sách có evaluate**.

## 3. Phát hiện

Mức theo RV-4. Cột "Luật gốc" để người sửa đọc đúng chỗ (RV-5). Cột "Việc" trỏ việc có sẵn trong checklist phase, hoặc **đề xuất** việc mới (phải thêm dòng vào `40-MASTER-CHECKLIST.md` của phase sở hữu rồi sinh lại bảng việc).

### Chặn

| Mã | Trục | Phát hiện | Bằng chứng | Luật gốc | Phase · việc |
|---|---|---|---|---|---|
| **RV-R1-01** | A2 | **Cờ thoát "sổ chỉ thêm" tự bật được.** Mọi trigger chống UPDATE / DELETE / TRUNCATE trên `ledger_*` chỉ chạy khi `current_setting('ketoan.allow_ledger_purge') IS DISTINCT FROM 'on'`; đây là biến phiên, phiên nào cũng `set_config` được. Vai trò ứng dụng `ketoan_app` có `DELETE ON ALL TABLES`. Chỉ phép kiểm tĩnh SC-KERNEL-4 chặn; `app-role.test.ts` không phá thử ca này [M] | `db/migrations/0006_goc_so_cai.sql:640-676`, `db/migrations/0049_khoa_dau_but_toan.sql:64-97`, `db/migrations/0032_vai_tro_ung_dung.sql:28` | câu không thương lượng 2; [RULE-LEDGER](../rules/RULE-LEDGER.md); R-KER-4 | PHASE-004 / PHASE-011 — **đề xuất** S004-x: cờ chỉ bật được bởi vai trò bảo trì (GUC superuser-only hoặc hàm `SECURITY DEFINER` có kiểm vai), bỏ `DELETE` trên `ledger_*` khỏi `ketoan_app`, test phá thử; mức **K3 thêm chặt** |
| **RV-R1-02** | A7 | **Lỗi CSDL trả sai mã hợp đồng.** Trigger cân và trigger khoá kỳ `RAISE … ERRCODE 'check_violation'` (23514); trigger chỉ thêm dùng `insufficient_privilege` (42501). `http.ts` gộp cả hai thành `POSTING_FAILED`. Module không bao giờ nhận `UNBALANCED_ENTRY`, `PERIOD_LOCKED`, `LEDGER_APPEND_ONLY` như `BIZCITY-ERRORS-v1` §5 hứa. Test dùng mã giả `P0001` nên không bắt được [M] | `packages/platform/src/core/http.ts:76`, `db/migrations/0006_goc_so_cai.sql:25-26,55-56`, `db/migrations/0082_khoa_ky_o_csdl.sql:27-29` | [BIZCITY-ERRORS-v1](../contracts/BIZCITY-ERRORS-v1.md); R-ERR (CANON §5 dòng mã lỗi) | PHASE-029 (K3 đợt 2) hoặc PHASE-027 CK — **đề xuất** S029-x: trigger dùng `ERRCODE` riêng (vd `P0001` + tiền tố câu) hoặc `http.ts` đọc tiền tố `PERIOD_LOCKED:` / `không cân` trước khi rơi về `POSTING_FAILED`; test với SQLSTATE thật; K0 |
| **RV-R1-03** | A12 | **`main` đỏ:** hai migration cùng số `0080` (`0080_kiem_chinh_sach_su_viec.sql` từ PR #159, `0080_nguoi_tao_su_viec_bat_buoc.sql` từ PR #165, merge cách nhau 15 giây). `SC-DATA-1` KHÔNG ĐẠT ⇒ mọi nhánh khác không đẩy được theo R-FLOW-5. Bản sửa (đổi K3 thành 0081 / 0082) đã có ở máy chủ dự án, chưa lên `origin` [M] | `db/migrations/`, `tests/conformance/selfcheck.mjs` | R-FLOW-5; R-DB (số migration lấy bằng `scripts/so-tiep-theo.mjs`) | PHASE-029 K3 — việc đã giữ chỗ (nhánh `fix/phase-029-k3-doi-so-0081`); **đẩy và merge trước mọi PR khác** |

### Nặng

| Mã | Trục | Phát hiện | Bằng chứng | Luật gốc | Phase · việc |
|---|---|---|---|---|---|
| **RV-R1-04** | A9 | **Chính sách đã ngừng vẫn qua kiểm.** `retirePolicy` chỉ đổi `status`, không đóng `effective_to`; `covers()` ở cửa nạp không xét `status`. Chứng từ mới trỏ bản đã `retired` vẫn đạt `IN-POL`, không có cảnh báo "stale" [M] | `packages/platform/src/core/policies.ts:117-121`, `packages/kernel/src/modules/intake/policy-check.ts:32` | ADR-0031; [PHASE-031 · 10](../phases/PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/10-THIET-KE.md) | PHASE-031 W2b — **đề xuất** S031-x: `retirePolicy(actor, reason)` đóng `effective_to`, `covers()` đòi `status = 'published'`, mã `IN-POL-004` stale; golden T031-REG-3 |
| **RV-R1-05** | A9 · A10 | **Regex sai một ký tự**: `/^d+$/` thiếu `\`, nên xem trước tác động cấu hình luôn từ chối phạm vi `branch` / `accounting_unit` với lỗi "cần scopeId là định danh số" [M] | `packages/platform/src/core/settings.ts:358` | [RULE-SETTINGS-MATRIX](../rules/RULE-SETTINGS-MATRIX.md); D030-12 | PHASE-030 (E2 cấu hình) — sửa một tệp + test ca scopeId `"12"`; K0 |
| **RV-R1-06** | A7 | **Lỗi Kernel thiếu ngữ cảnh chứng từ.** `UNBALANCED_ENTRY.details` chỉ có `{debit, credit}`; `PERIOD_LOCKED` không có `details`; không mã nào mang docKey / eventId / kỳ / `remedy`. Remedy có cấu trúc mới phủ `IN-*`, chưa phủ `ERROR_CATALOG` [M] | `packages/kernel/src/modules/ledger/ledger.service.ts:65,108`, `packages/contracts/src/errors.ts:23-37` | [BIZCITY-REMEDY-v1](../contracts/BIZCITY-REMEDY-v1.md); tôn chỉ "một ngôn ngữ mã" (ADR-0020) | PHASE-022 (giả định lỗi) / PHASE-029 — **đề xuất**: `details` chuẩn `{docKey, eventId, version, period, requestId}` cho mọi lỗi Kernel; `remedy` cho 14 mã catalog; K1 |
| **RV-R1-07** | A2 · A1 | **Hai cửa ghi, không phải một; nguồn gửi số tài khoản.** `eventStore.post` được export ở cổng Kernel và `apps/api/src/modules/assets/asset.service.ts` gọi từ ngoài Kernel; mua hàng và phiếu chi gửi `debitAccount` qua `voucherService.createIn` — trái câu không thương lượng 4 [M] | `packages/kernel/src/modules/documents/event-store.ts`, `apps/api/src/modules/assets/asset.service.ts:29,785`, `apps/api/src/phan-he/mua-hang/posting.ts:111,172,264,310` | câu không thương lượng 3, 4; [RULE-POSTING](../rules/RULE-POSTING.md); SC-KERNEL-5 (2 nợ) | PHASE-004 (một cửa) + PHASE-013 (đợt chuyển mua hàng) — **đề xuất**: assets nộp sự việc qua `postDocumentIn`; mua hàng gửi `reasonCode`, Kernel tra tài khoản; K2 |
| **RV-R1-08** | A8 | **Cùng phiên bản, khác nội dung thì ghi đè im lặng.** Cửa nạp trả "unchanged" khi băm giống; khi `force` / `post` nó `update payload` mà không `archiveVersion`; mua hàng gọi đúng kiểu này. CANON §0 yêu cầu từ chối có mã. Tiền kiểm chỉ cảnh báo `IN-BIZ-005` [M] | `packages/kernel/src/modules/documents/document.service.ts:403-433`, `apps/api/src/phan-he/mua-hang/posting.ts:105` | [RULE-EVENT](../rules/RULE-EVENT.md); [BIZCITY-DOCUMENT-v1](../contracts/BIZCITY-DOCUMENT-v1.md) §7 | PHASE-029 — S029-5 (⛔ chờ nhả tệp dùng chung) + **đề xuất** S029-x: từ chối `409 VERSION_CONTENT_MISMATCH`; K1 |
| **RV-R1-09** | A5 | **Không có nhật ký sự kiện xem được theo từng sự kiện; dead mất bằng chứng.** `GET /api/v1/system/events` chỉ trả số đếm, không `last_error`, không lọc theo type / subject / correlation; replay chỉ có API; `retentionSubscriber` xoá sự kiện không còn `pending` sau 90 ngày, deliveries `dead` đi theo CASCADE. RUNBOOK cảnh báo nói xem được `last_error` ở API này là **sai** [M] | `apps/api/src/modules/system/events.routes.ts:15-29`, `packages/platform/src/core/events.ts:353-375` | [BIZCITY-EVENT-v1](../contracts/BIZCITY-EVENT-v1.md); R-DIAG; PHASE-019 bàn điều tra | PHASE-019 / PHASE-029 — S029-28 (☐), S029-32 (⛔) + **đề xuất**: `GET /api/v1/system/events/items` có lọc + `last_error`; giữ dead vô thời hạn tới khi xử lý; màn DEV06 có nút replay; K1 |
| **RV-R1-10** | A9 · A6 | **Commit Guard không giữ lời "bút toán thật = bút toán dự kiến".** Chỉ chặn khi dấu lệch **và** còn lỗi chặn; chính sách đổi giữa lúc thử và lúc nộp mà không sinh lỗi chặn thì vẫn ghi theo kết quả mới, không `IN-GUARD-001` [M] | `packages/kernel/src/modules/intake/preflight.ts:209`, `packages/kernel/src/modules/intake/guard.ts:35-62` | [RULE-GATE](../rules/RULE-GATE.md); PHASE-031 · 10 §7 | PHASE-031 W2b — **đề xuất** S031-x: lệch dấu ⇒ luôn `IN-GUARD-001` mức warn, kèm diff bút toán; chế độ strict ⇒ chặn |

### Vừa

| Mã | Trục | Phát hiện | Bằng chứng | Luật gốc | Phase · việc |
|---|---|---|---|---|---|
| **RV-R1-11** | A8 | Transition không ghi **quyền / vai** đã dùng (chỉ actor, action, from → to); không bảng lịch sử transition; chỉ 2 chứng từ chạy YAML; mua hàng `approve` chỉ cần `documents:write`, không `sod` ⇒ người lập tự duyệt và ghi sổ [M] | `packages/platform/src/core/workflow.ts:219-245`, `apps/api/src/phan-he/mua-hang/purchase-document.workflow.yaml` | [RULE-WORKFLOW](../rules/RULE-WORKFLOW.md); R-WF-13/14 (đóng băng) | PHASE-029 — S029-11 (☐ `ctx.documents.transition`), S029-25 (☐ SoD); PHASE-028 W3 (`authorize` trong workflow) |
| **RV-R1-12** | A9 | Ba cơ chế phiên bản chính sách song song (`posting_policy_versions`, `setting_values`, `policy_registry`), mỗi bên một quy tắc ngày hiệu lực và một khuôn băm (`sha256:` + hex · hex trần · băm `jsonb::text`); chính sách định khoản chưa đăng ký vào Registry dù D-POL-10 nói trụ cột gồm cả chế độ kế toán [M] | `db/migrations/0079_so_dang_ky_chinh_sach.sql`, `packages/platform/src/core/policies.ts`, `packages/platform/src/core/settings.ts` | ADR-0009, ADR-0031; LEAN-3 "No Duplicate Truth" | PHASE-031 — câu hỏi **đề xuất** Q031-x cho chủ dự án: hợp nhất khuôn băm và đăng ký chính sách định khoản vào Registry ở W3 hay để riêng có lý do |
| **RV-R1-13** | A3 · A5 | `correlation_id` / `trace_id` thiếu ở `posting_log` và `intake_inbox`; `documents/history` không nối `event_outbox`; không API tra theo `correlation_id` [M] | `db/migrations/0005_*` (posting_log), `db/migrations/0059_*` (intake_inbox) — xem `db/migrations/` | [BIZCITY-EVIDENCE-v1](../contracts/BIZCITY-EVIDENCE-v1.md); ECP-04 | PHASE-029 — S029-14 (☐ đường ghi ngoài action) mở rộng cho hai bảng này |
| **RV-R1-14** | A2 | Nhánh (b) của `guard_ledger_entry_mutation` cho `UPDATE` `partner_id`, `doc_no`, `description` trên bút toán đã `posted` mà không cần cờ, miễn `total` không đổi (đường E2). Đây là **lựa chọn thiết kế có chủ ý** (sửa thông tin đầu) nhưng chưa có chữ chốt của chủ dự án về phạm vi trường được sửa và dấu vết [M] | `db/migrations/0049_khoa_dau_but_toan.sql:36-44` | [RULE-LEDGER](../rules/RULE-LEDGER.md) ngoại lệ E2 | PHASE-004 — **đề xuất** Q004-x: chủ dự án chốt danh sách trường E2 và yêu cầu ghi `audit_logs` trước / sau; nếu giữ thì nâng tru-cot I · L-2 thành "đạt có điều kiện E2" |
| **RV-R1-15** | A12 | Tài liệu chậm hơn mã: README PHASE-031 ghi "Code: chưa" và checklist ghi W2a "chờ merge" dù đã merge; CANON §4 ghi `event@1` "chưa có"; `docs/phat-trien.md` §4b còn hướng dẫn tạo `phan-he/<key>` trái ADR-0024; mã màn HT12 dùng cho hai màn khác nhau; `tru-cot.json` P-7 lỗi thời [M] | `docs/phases/PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/README.md`, `docs/00-CANON.md`, `docs/phat-trien.md`, `modules/phan-quyen/web/index.tsx:8` | R-FLOW-7; CANON §5 | PHASE-027 CK-2 (tài liệu dev) + PHASE-031 (sửa README / checklist cùng PR nhả chỗ W2a) |

### Nhẹ

| Mã | Trục | Phát hiện | Bằng chứng | Luật gốc | Phase · việc |
|---|---|---|---|---|---|
| **RV-R1-16** | A10 | `packages/ui-kit` chỉ 8 thành phần; không DataGrid, bộ lọc, ô chọn hiệu lực theo ngày, hiển thị `GateResult`, khung thẻ bốn tab; `templates/starter-module/web` chỉ có `RecordList.tsx`; `GateResult` / `bizcity_action@1` 1.4.0 chưa chốt (S030-28 ⛔) chặn "xem như trên form", sổ cổng, Bàn điều hành HT12 [M] | `packages/ui-kit/src/index.tsx`, `templates/starter-module/` | [BIZCITY-EXTENSION-v1](../contracts/BIZCITY-EXTENSION-v1.md); R-SETTINGS | PHASE-013 S013-12 (☐), PHASE-026 S026-12 (☐), PHASE-030 S030-28 (⛔ nhóm Lõi) |
| **RV-R1-17** | A3 | Liên tục kế toán gần như chỉ thiết kế: không `valuation_layers`, không Gate C, không mã `CT-*`; truy vết bút toán → báo cáo chưa có; người sửa / lý do theo phiên bản sự việc chưa có [M, D] | `packages/kernel/src/modules/lineage/` (chỉ đọc) | ADR-0021, ADR-0028; [RULE-CONTINUITY](../rules/RULE-CONTINUITY.md) | PHASE-025 S025-5..18 (☐), PHASE-029 S029-6, S029-27 (☐) |
| **RV-R1-18** | A11 | Ngoài mua hàng, các phân hệ thiếu workflow YAML, chính sách tại module, họ mã lỗi riêng (`MH-*`, `BH-*`…); bán hàng / kho chưa có `modules/ban-hang`, `modules/kho`; chuyển `phan-he/` → `modules/` ≈ 10–15 %; ma trận 173 nghiệp vụ: 51 ✅ · 40 🟡 · 69 ☐ · 13 ⛔ [M, D] | `apps/api/src/phan-he/`, `modules/`, [PHASE-030 README](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/README.md) | ADR-0024; [CHUYEN-PHAN-HE-SANG-MODULES](../standard/CHUYEN-PHAN-HE-SANG-MODULES.md) | PHASE-013 S013-3..8 (☐), PHASE-030 S030-16, S030-21 (☐), PHASE-031 S031-15 (☐) |

## 4. Điều đã kiểm mà **không** thấy vấn đề [M]

- Trong `apps/api/src`, `modules/`, `packages/platform` không có `INSERT` trực tiếp vào `ledger_*`, `accounting_events`, `posting_log` ngoài `ledger.repository` / `document.repository`.
- Outbox ghi cùng giao dịch với sổ; `correlationId` đi từ header vào cả outbox lẫn audit (test).
- `ledger_entries.event_id` đã `NOT NULL` ở `0077` (một báo cáo trung gian nói còn NULL là do chỉ đọc `0006`).
- SC-MOD-1/2 (biên module), SC-SEC-1/2/3/5, SC-SIG-1/2, SC-PHASE-1, SC-RMP-1 = 100.
- Trạm kiểm tra đầu vào (ACC14) là mạch "đầu vào lỗi → sửa → nộp lại" đầy đủ nhất hiện có; đây là **tệp mẫu làm đúng** cho A6 và cho màn sự kiện (RV-09).

## 5. Việc cần làm trước khi đóng v0.1.0 (Nền móng)

| # | Việc | Phát hiện | Người nhận đề xuất | Mức K |
|---|---|---|---|---|
| 1 | Đẩy và merge bản đổi số migration 0080 → `main` xanh | RV-03 | chủ dự án | K0 |
| 2 | Khoá cờ `allow_ledger_purge` cho vai trò bảo trì; bỏ `DELETE` trên `ledger_*` khỏi `ketoan_app`; test phá thử | RV-01 | nhóm Lõi | K3 thêm chặt |
| 3 | Ánh xạ SQLSTATE đúng mã hợp đồng; test SQLSTATE thật | RV-02 | nhóm Lõi | K0 |
| 4 | Chủ dự án chốt E2 (trường được sửa, dấu vết) | RV-14 | chủ dự án | — |
| 5 | Assets và mua hàng về một cửa, gửi `reasonCode` | RV-07 | nhóm Lõi + người đóng góp mua hàng | K2 |

Các phát hiện còn lại đi vào phiên bản sở hữu theo [PHIEN-BAN.md](PHIEN-BAN.md).

## 6. Giới hạn của lần đo này

- Không có CSDL test ⇒ không chạy lane diagnostics, không chạy `npm test`; mọi điểm "3" là theo test đã đọc được trong repo, không phải đã chạy lại.
- Năm nhóm trục được đọc bởi năm lượt đọc độc lập rồi đối chiếu; hai kết luận trái nhau (NULL của `event_id`; "chưa merge" của W2a) đã kiểm lại trực tiếp và ghi bản đúng ở trên.
- Chưa đọc mã web từng màn phân hệ ngoài danh sách tệp; điểm A10 / A11 có phần [S].

## 7. Quyết định của chủ dự án sau review
<!-- [2026-11-08 01:23 PM Johnny Chu - Chu Hoàng Anh] REVIEW — chủ dự án đồng ý hướng xử lý đề xuất cho RV-R1-14 và RV-R1-12; ghi vào tài liệu theo R-FLOW-7 -->

Chủ dự án đồng ý hướng xử lý đề xuất ở biên bản này (2026-11-08). Hai câu hỏi mở được chốt như sau; việc thi hành đi qua giữ chỗ `CLAIMS.md` của phase sở hữu (R-FLOW-1), không làm trong PR review.

| Mã | Quyết định | Điều kiện thi hành | Phase · việc cần mở |
|---|---|---|---|
| **D-R1-1** (RV-R1-14) | **Giữ đường E2** (sửa thông tin đầu bút toán đã ghi). | (1) Danh sách trường được sửa chốt thành văn bản trong [RULE-LEDGER](../rules/RULE-LEDGER.md) ngoại lệ E2, xuất phát từ ba trường hiện có (`partner_id`, `doc_no`, `description`); thêm trường là đổi thứ dùng chung, phải có chữ chốt trước (R-FLOW-2). (2) Mỗi lần sửa ghi `audit_logs` trước / sau. (3) Khi (1) và (2) xong, `tru-cot.json` I · L-2 ghi "đạt có điều kiện E2" kèm bằng chứng, không ghi "đạt" trơn. | PHASE-004 — mở Q004-x (chữ chốt danh sách trường) và S004-x (ghi `audit_logs`, test phá thử) |
| **D-R1-2** (RV-R1-12) | **Hợp nhất**: một khuôn băm cho mọi bản chính sách, và đăng ký chính sách định khoản vào `policy_registry`, làm ở **W3 của PHASE-031**. | Không đổi bút toán đã ghi (R-KER-4); bản `posting_policy_versions` cũ nạp ngược thành bản 1 như đã làm với chính sách mua hàng (0079); `setting_values` giữ riêng vì là cấu hình, không phải chính sách nghiệp vụ — ghi lý do vào chữ chốt W3. | PHASE-031 — mở Q031-x (khuôn băm chung) và S031-x (đăng ký chính sách định khoản) |

Thứ tự việc chặn của v0.1.0 giữ như §5: (1) đổi số migration `0080`, (2) khoá cờ `allow_ledger_purge`, (3) ánh xạ SQLSTATE đúng mã hợp đồng; việc 4 trong §5 nay đã có quyết định D-R1-1, còn phần thi hành nằm ở PHASE-004.
