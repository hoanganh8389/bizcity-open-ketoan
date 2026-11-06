# PHASE-030 · 21 — Bộ cổng chung, sổ cổng (trục nhật ký hành vi), bàn điều hành chứng từ & cổng
<!-- [2026-11-06 04:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — chủ dự án: "bộ các công cụ gate cần hiển thị dạng dashboard quản trị, thống kê, phân tích … mọi thứ cần có một nhật ký người dùng dạng filestore log để làm sổ cái của các gate, một trục xương sống liên quan tới nhật ký hành vi người dùng"; đề xuất bizcity_gate@1, sổ cổng gate_decisions, bàn điều hành HT11; nêu xung đột với STD-EVD-4 -->

> Nối tiếp: [ADR-0029](../../adr/ADR-0029-loi-bat-bien-nghiep-vu-linh-hoat.md) (ba chủ sở hữu, cổng nhận sự việc) · [kiến trúc](../../architecture/LOI-BAT-BIEN-NGHIEP-VU-LINH-HOAT.md) · [16](16-CHUAN-CHUNG-TU-DUNG-CHUNG.md) · [19](19-RA-SOAT-DUYET-VA-GHI-SO.md). Bản mẫu: [mockups/thu-vien-nghiep-vu.html#cong](mockups/thu-vien-nghiep-vu.html#cong).
> Mọi chỗ "đã có" dẫn tệp:dòng trên HEAD nhánh này (`main` d487c73).

## 0. Trả lời ngắn

1. **Các cổng có chung một khuôn.** Validation, Role, Transition và Ledger intake đều nhận `{ai, làm gì, trên cái gì, lúc nào}`, chạy hàm quyết định thuần, trả `GateResult` cùng hình, có mã findings và có bằng chứng. Khác nhau ở câu hỏi, nguồn luật và mặc định khi không chắc (§1).
2. **Sổ cổng là trục xương sống của nhật ký hành vi.** Mỗi quyết định của mọi cổng, kể cả bị chặn và bị huỷ giữa chừng, thành một dòng chỉ thêm, có chuỗi băm theo đơn vị (§2). Cùng với `audit_logs` (cái gì đã đổi) và phiên đăng nhập, nó dựng được dòng thời gian của từng người dùng và từng chứng từ (§3).
3. **"Filestore log" đụng luật đang có.** `bizcity_evidence@1` STD-EVD-4 (Tier 1): *"Không ghi nhật ký nghiệp vụ ra tệp. Tệp chỉ cho log kỹ thuật (pino)"* (`docs/contracts/BIZCITY-EVIDENCE-v1.md:72`). Phép kiểm SC-EVD-1 bắt `appendFile` / `createWriteStream` / `.jsonl` (`tests/conformance/checks/action/action.check.mjs:138-157`); tệp JSONL nghiệp vụ duy nhất (`apps/api/src/phan-he/mua-hang/log.ts`) đang trong danh sách *bỏ*. Đề xuất (§2.4, câu hỏi **Q030-5** cho chủ dự án):
   - nơi ghi chính là **bảng CSDL có chuỗi băm**, như `audit_logs`, ghi ở giao dịch riêng;
   - **tệp niêm phong theo ngày** (JSONL + manifest băm) là bản **lưu trữ / xuất kiểm toán**, bật khi ADR sửa STD-EVD-4 được duyệt. Bản này cho phép kiểm độc lập với CSDL.
4. **Bàn điều hành chứng từ & cổng** (màn mới **HT11**, quản trị) trả lời sáu câu (§4):
   - việc gì cần xử lý: nháp / chờ duyệt / đã duyệt chưa ghi nhận / ở bể chờ;
   - cái gì chưa qua cổng;
   - cái gì sai luật hay nguyên tắc kế toán;
   - cái gì sai vai trò;
   - luồng chuyển trạng thái nghẽn ở đâu;
   - ai đã làm gì.

   Mỗi người dùng thấy **hàng việc của mình** ở thanh "Việc cần làm" sẵn có, cùng nguồn dữ liệu.

## 1. `bizcity_gate@1` — một khuôn cho mọi cổng (đề xuất)

### 1.1 Bốn loại cổng

| Cổng (`gate`) | Câu hỏi | Nguồn luật | Mặc định khi không chắc | Hậu quả | Đã có |
|---|---|---|---|---|---|
| `validation` | nội dung đúng chưa? | `check()` module, rulepack, danh mục | cho phép, nhắc (R-GATE-9) | `warn` qua kèm lý do; `block` giữ ở nháp / bể chờ | Gate A, Gate B, findings |
| `role` | người này được làm việc này trên chứng từ này không? | vai trò, phạm vi, điều kiện (PHASE-028) | **đóng**; `deny` / SoD thắng | `block` | `requirePermission`; `authorize` (chưa nối) |
| `transition` | được làm lúc này, từ trạng thái này không? | workflow YAML, chính sách, khoá kỳ | **đóng** | `block` | `wf.plan`, `dataLock`, `period_locks` |
| `ledger` | sự việc đủ điều kiện ghi sổ chưa? | Kernel G1–G5 | đóng nhưng không vứt | `hold` vào bể chờ | `postDocumentIn`, `intake_inbox` |
| (`session`) | đăng nhập / xuất / in | xác thực, quyền xuất | đóng | `block` | ☐ không ghi gì (`apps/api/src/modules/auth/*`) |

### 1.2 Hình chung

```ts
// packages/contracts/src/gate.ts (đề xuất)
type GateKind = 'validation' | 'role' | 'transition' | 'ledger' | 'session';
type Verdict  = 'pass' | 'warn' | 'hold' | 'block';

interface GateInput {
  principal: { kind: 'user' | 'apikey' | 'ai' | 'system'; id: string };
  action: string;                 // id action / chuyển (vd 'quy.payment_request.approve')
  resource?: { docRef: string; version?: number; contentHash?: string; docType?: string;
               branchId?: string; warehouseId?: string; amount?: number; docDate?: string; status?: string };
  at: string;                     // thời điểm quyết; ngày chứng từ trong resource.docDate
  correlationId: string;
}

interface GateResult {
  gate: GateKind; verdict: Verdict;
  findings: Finding[];            // mã từ bizcity_findings@1 (vì sao, cách sửa, căn cứ)
  decisionId: string;             // uuid; ghi vào bằng chứng và sổ cổng
  ruleVersion: string;            // authz_version / phiên bản chính sách / rulepack / luật định khoản
  reasonCode?: string;            // mã lý do của cổng role (AuthzDecision.reasonCode)
  durationMs: number;
}
```

Bọc, không viết lại (LEAN-1, LEAN-2). Mỗi engine sẵn có thêm một hàm chuyển kết quả của nó sang `GateResult`:
- `wf.plan` hôm nay ném `forbidden(msg)` → bọc thành `block` + mã `DOC-FLOW-*`;
- `authorize` trả `{allowed, reasonCode, decisionId, authzVersion}` (`packages/platform/src/core/authz/types.ts:11`) → gần như khớp sẵn;
- intake findings `block|warn|hint` → `hint` gom về `info`;
- `Check{blocking}` của mua hàng → findings (N030-2).

### 1.3 Ghép cổng trong một chuyển

Thứ tự cố định: `transition` → `role` → `validation` → (Approval Freeze) → `ledger`.
- `transition` và `role` **dừng sớm**: không hỏi nội dung với người không có quyền, vừa vô nghĩa vừa lộ dữ liệu.
- `validation` **gom đủ** mọi phát hiện để sửa một lần.
- Kết quả gộp là verdict nặng nhất; mọi `GateResult` thành phần đều vào sổ cổng.

## 2. Sổ cổng (Gate Journal) — sổ cái của các cổng

### 2.1 Vì sao cần, khi đã có `audit_logs`

| Bảng sẵn có | Ghi gì | Thiếu gì cho mục đích này |
|---|---|---|
| `audit_logs` (`0001:79`, chuỗi băm `0036:45-84`) | **cái gì đã đổi**: một bản / action ghi; lỗi trong handler ghi `result_ok=false` ở giao dịch riêng (`packages/platform/src/core/actions.ts:571-575`) | lỗi **trước** handler (UNAUTHORIZED, FORBIDDEN, sai đầu vào) không ghi gì (`actions.ts:388-401`); không có quyết định từng cổng; không có chuyển trạng thái nào bị từ chối; action đọc không ghi |
| `intake_inbox` (`0059:15-41`) | sự việc bị cửa sổ từ chối, giao dịch riêng (`packages/kernel/src/modules/intake/inbox.ts:66-87`) | chỉ cổng ledger; xoá theo hạn giữ 90 ngày |
| `posting_log` (`0005:304-318`) | mỗi lần nhận / ghi / ghi lại / lỗi / huỷ ở Kernel | chỉ cổng ledger |
| log pino → Loki, metric, span | mọi lỗi có một dòng kỹ thuật (`packages/platform/src/core/http.ts:59-62`) | không phải sổ: không chuỗi băm, giữ ngắn; metric **cấm** nhãn tenant / actor (R-OBS-4) |

Không trùng sự thật (LEAN-3):
- `audit_logs` giữ **hiệu lực** (cái đã đổi);
- sổ cổng giữ **quyết định** (vì sao được / không được);
- `intake_inbox` giữ **hàng chờ sửa**.

Ba bảng nối nhau bằng `correlation_id`, `decision_id`, `evidence_id`, `intake_id`.

### 2.2 Một dòng sổ cổng

```sql
-- db/migrations/00NN_so_cong.sql (đề xuất; số ≥ 0076 vì 0073–0075 đã giữ chỗ)
CREATE TABLE gate_decisions (
  id uuid PRIMARY KEY, tenant_id uuid NOT NULL,
  at timestamptz NOT NULL, correlation_id text NOT NULL, request_id text,
  actor_kind text NOT NULL, actor_id text NOT NULL,             -- định danh, không tên người
  action text NOT NULL, gate text NOT NULL, verdict text NOT NULL,
  doc_ref text, doc_type text, doc_version integer, content_hash text,   -- không nội dung chứng từ
  from_status text, to_status text, branch_id uuid, warehouse_id uuid,
  finding_codes text[] NOT NULL DEFAULT '{}', reason_code text, rule_version text,
  evidence_id uuid, intake_id uuid, posting_log_id uuid, duration_ms integer,
  chain_seq bigint NOT NULL, prev_hash text, hash text NOT NULL   -- chuỗi băm theo đơn vị, như audit_logs
);
-- RLS theo đơn vị; trigger chỉ thêm (không UPDATE / DELETE / TRUNCATE) như 0036:79-84
-- chỉ mục: (tenant_id, at), (tenant_id, doc_ref, at), (tenant_id, actor_id, at), (tenant_id, gate, verdict, at)
```

### 2.3 Đường ghi

- **Giao dịch riêng, sau khi quyết.** Một chuyển bị chặn thì giao dịch chính bị huỷ; nếu ghi sổ cổng trong cùng giao dịch, dòng đó mất theo. Dùng đúng mẫu đã chạy hai nơi: `recordRejection` (`inbox.ts:66-87`) và `result_ok=false` (`actions.ts:571-575`).
- Dòng `pass` của chuyển thành công ghi **sau commit** cùng `evidence_id`.
- **Lỗi ghi sổ không làm hỏng action.** Nếu ghi sổ cổng hỏng thì ghi metric `bizcity_gate_journal_failed_total` cùng một dòng pino, và chẩn đoán `GATE_JOURNAL_GAP` đối chiếu `audit_logs` với `gate_decisions` theo `correlation_id`. Đây là tầng **Eventual / Reconciliation** của R-ECP-CONS: sổ cổng không bao giờ được đọc ngược để quyết quyền (R-OBS-8).
- **Chuỗi băm** dùng lại cách của `audit_logs`: khoá `pg_advisory_xact_lock` theo đơn vị, `chain_seq + 1`, SHA-256 trên các trường (`0036:45-71`). Chẩn đoán `GATE_CHAIN` kiểm lại như `EVIDENCE_CHAIN`.
- **Ghi gì:**
  - mọi chuyển trạng thái (pass / block);
  - mọi quyết định `role` có mục đích `approve`, và mọi `deny` của mục đích khác;
  - kết quả `validation` lúc trình / duyệt (không ghi mỗi lần gõ phím);
  - mọi verdict `ledger`;
  - đăng nhập (đạt / trượt), xuất, in.

  Action đọc thường **không** ghi, để giữ khối lượng nhỏ.

### 2.4 Filestore: bản lưu trữ niêm phong (cần chủ dự án quyết — Q030-5)

| Phương án | Nơi ghi chính | Tệp | Luật | Đề xuất |
|---|---|---|---|---|
| A | bảng `gate_decisions` | không | khớp STD-EVD-4 | tối thiểu |
| **B** | bảng `gate_decisions` | **xuất niêm phong hằng ngày**: `DATA_DIR/so-cong/<đơn vị>/<yyyy>/<mm>/<dd>.jsonl` + `<dd>.manifest.json` (số dòng, `chain_seq` đầu / cuối, băm cuối, băm tệp), chỉ ghi một lần, không sửa; tuỳ chọn đẩy lên kho lưu trữ ngoài (WORM) | cần **ADR sửa STD-EVD-4**: thêm ngoại lệ *"bản lưu trữ niêm phong do Platform xuất từ bảng có chuỗi băm"*; SC-EVD-1 miễn đúng một tệp `packages/platform/src/core/gate-journal-export.ts` | **khuyến nghị** |
| C | tệp JSONL là nơi ghi chính | — | trái STD-EVD-4, trái R-ECP-CONS (mất khi nhiều máy chủ, không truy vấn được, khoá ghi theo tiến trình như `mua-hang/log.ts`) | không |

B giữ được cả hai điều:
- **sổ cái truy vấn được**, cho bàn điều hành và golden;
- **sổ cái cầm được**, cho kiểm toán độc lập, sao lưu ngoài, và chứng minh không ai sửa CSDL: so băm cuối của manifest với `chain_seq` trong bảng.

### 2.5 Riêng tư và hạn giữ

- **Không nội dung chứng từ**, không tên / số điện thoại / mã số thuế / tài khoản ngân hàng (R-SEC-10, R-TEN-8, R-INTAKE-12). Chỉ định danh, mã, băm.
- Hạn giữ đề xuất:
  - quyết định có `evidence_id` hoặc `ledger`: theo bằng chứng, ≥ 10 năm (STD-EVD-8);
  - `role` bị `deny`, `session` trượt: 2 năm;
  - `validation` pass / warn không kèm bằng chứng: 1 năm.

  Xoá theo hạn chạy bằng tác vụ của Platform. Tệp niêm phong (phương án B) giữ theo bằng chứng.
- Ai xem:
  - người dùng xem dòng của chính mình;
  - quản trị đơn vị, kế toán trưởng, kiểm toán viên xem toàn đơn vị;
  - quyền mới `system:gate-journal` (rủi ro cao, AI chỉ đọc tổng hợp).

## 3. Trục nhật ký hành vi người dùng

Không thêm bảng thứ ba. Dòng thời gian **dựng khi hỏi** (D028-13) từ:

| Nguồn | Cho dòng thời gian |
|---|---|
| `gate_decisions` | đã thử làm gì, được hay bị chặn, vì sao (mã) |
| `audit_logs` | cái gì đã thực sự đổi (bằng chứng) |
| `intake_inbox` | cái gì đang chờ sửa ở bể |
| `posting_log` | cái gì đã vào sổ / ra sổ |
| `gate = 'session'` trong `gate_decisions` | đăng nhập, xuất, in |

API đề xuất:
- `GET /api/v1/journal?actor=&docRef=&from=&to=&gate=&verdict=`: gộp các nguồn, sắp theo `at`, phân trang con trỏ.
- `GET /api/v1/journal/verify?from=&to=`: kiểm chuỗi băm (và manifest tệp nếu B).

## 4. Bàn điều hành chứng từ & cổng (HT11)

### 4.1 Sáu câu hỏi, sáu khối

| Khối | Trả lời | Nguồn | Hình |
|---|---|---|---|
| ① Hàng việc | bao nhiêu chứng từ ở nháp / chờ duyệt / đã duyệt chưa ghi nhận / bể chờ / bị chặn; tuổi (≤ 1 ngày, 1–3, 3–7, > 7) | view `bizcity_read.document_queue` (ADR-0026) gộp trạng thái các bảng chứng từ về 5 nhóm (`payment_requests`, `purchase_documents`, `accounting_events` pending / error, `intake_inbox` open; sau này `module_documents`) | ô số + bảng theo loại × tuổi |
| ② Cổng hôm nay / 14 ngày | tỷ lệ qua / nhắc / giữ / chặn theo từng cổng; xu hướng chặn và giữ | `gate_decisions` gộp theo ngày | thanh xếp chồng 100 % (màu trạng thái + biểu tượng) · đường 14 ngày |
| ③ Sai luật / nguyên tắc kế toán | mã findings `block` / `warn` hay gặp nhất, có căn cứ; chứng từ cần xem lại | `gate_decisions.finding_codes` ⋈ `FINDINGS_LIBRARY` (`basis`, `rule`) | thanh ngang theo mã + bảng chứng từ |
| ④ Sai vai trò | bị từ chối vì phạm vi, SoD, thu hồi quyền, thiếu quyền; theo người / quyền | `gate = 'role' AND verdict = 'block'`, `reason_code` | bảng + thanh theo lý do |
| ⑤ Luồng chuyển | ma trận trạng thái nguồn → đích (số lần), thời gian ở mỗi trạng thái, điểm nghẽn | `gate = 'transition'` + lịch sử trạng thái | bản đồ nhiệt một màu |
| ⑥ Nhật ký | dòng thời gian theo người / chứng từ; trạng thái chuỗi băm (+ manifest tệp) | §3 | dòng thời gian + dấu kiểm chuỗi |

Lọc chung ở một hàng phía trên: khoảng ngày, chi nhánh, loại chứng từ / module, người. Mỗi ô và mỗi thanh bấm vào thì ra danh sách chứng từ đã lọc; mỗi chứng từ mở màn chi tiết với tab **Cổng** (mọi quyết định của nó).

### 4.2 Ai thấy gì

| Vai | Thấy |
|---|---|
| Người dùng | hàng việc **của mình** ở thanh "Việc cần làm" (`apps/web/src/layout/rail/useViec.ts`, thêm nguồn `GET /api/v1/queue/mine`) và dòng thời gian của mình |
| Trưởng bộ phận | hàng việc của phạm vi mình (theo `scopeOf`, PHASE-028) |
| Kế toán trưởng, quản trị, kiểm toán viên | HT11 toàn đơn vị |
| Trợ lý AI | số tổng hợp và mã (`ai: 'read'`), không danh sách người |

### 4.3 Dùng lại màn sẵn có

- ACC14 (`apps/web/src/features/documents/DocumentsPage.tsx`) và trạm tiền kiểm (`IntakeStation.tsx`) **giữ nguyên**; HT11 dẫn link sang.
- HT08 Bàn đánh giá (R-GATE-7: tuổi và số lượng bể chờ) lấy khối ① làm nguồn.
- Bàn điều tra (DEV01–09) vẫn là nơi xem log / trace kỹ thuật; HT11 là nơi xem **nghiệp vụ**.
- Số liệu HT11 đọc từ CSDL, **không** từ Prometheus (R-OBS-4 cấm nhãn đơn vị / người trên metric).

## 5. Golden và chẩn đoán

| Mã | Cho – khi – thì |
|---|---|
| T030-GATE-1 | chuyển bị chặn trước handler (FORBIDDEN) → **có** dòng `gate_decisions` dù giao dịch chính huỷ; `audit_logs` không đổi |
| T030-GATE-2 | chuyển thành công → đúng một dòng mỗi cổng đã chạy, cùng `correlation_id`; dòng `pass` cuối có `evidence_id` |
| T030-GATE-3 | sửa tay một dòng `gate_decisions` (vượt trigger bằng quyền superuser trong test) → `GATE_CHAIN` báo đứt; (B) manifest ngày đó không khớp |
| T030-GATE-4 | không dòng nào chứa nội dung chứng từ, tên người, mã số thuế (quét mẫu) |

Chẩn đoán mới: `GATE_CHAIN` (L3), `GATE_JOURNAL_GAP` (L3, đối chiếu `audit_logs` ↔ `gate_decisions`), `QUEUE_AGING` (L1, chứng từ chờ quá hạn theo chính sách).

## 6. Việc

| Mã | Việc | Chủ | Phụ thuộc |
|---|---|---|---|
| S030-28 | Hợp đồng `bizcity_gate@1` (GateInput, GateResult, bốn + một loại cổng, ghép, mặc định) — PR chốt thiết kế | nhóm Lõi | — |
| S030-29 | Sổ cổng: migration `gate_decisions` (≥ 0076), ghi giao dịch riêng, chuỗi băm, RLS, hạn giữ, `GATE_CHAIN`, `GATE_JOURNAL_GAP`; bọc `wf.plan`, `requirePermission`, intake, ledger | Platform | S030-28; chạm `actions.ts` / `audit.ts` sau khi dòng PHASE-014 đợt 8b nhả |
| S030-30 | Q030-5 → nếu B: ADR sửa STD-EVD-4, xuất niêm phong theo ngày + manifest + `journal/verify` | chủ dự án quyết; Platform | S030-29 |
| S030-31 | View `bizcity_read.document_queue` + API `queue/summary`, `queue/mine`; thanh "Việc cần làm" thêm nguồn | Platform + web | — (làm được trước sổ cổng) |
| S030-32 | Màn HT11 Bàn điều hành chứng từ & cổng (6 khối, lọc, đi sâu, tab Cổng ở chứng từ) | web | S030-29, S030-31 |
| S030-33 | Golden T030-GATE-1..4 | Conformance | S030-29 |

Thứ tự hợp lý: S030-31 trước (hàng việc dùng ngay được, chỉ đọc bảng sẵn có), rồi S030-28 → S030-29 → S030-32; S030-30 khi chủ dự án trả lời Q030-5.
