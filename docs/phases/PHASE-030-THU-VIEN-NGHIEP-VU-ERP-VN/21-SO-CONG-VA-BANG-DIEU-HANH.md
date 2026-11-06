# PHASE-030 · 21 — Cổng trong action, bằng chứng là sổ cổng (trục nhật ký hành vi), bàn điều hành chứng từ & cổng
<!-- [2026-11-06 04:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — chủ dự án: "bộ các công cụ gate cần hiển thị dạng dashboard quản trị, thống kê, phân tích … mọi thứ cần có một nhật ký người dùng dạng filestore log để làm sổ cái của các gate, một trục xương sống liên quan tới nhật ký hành vi người dùng"; đề xuất bizcity_gate@1, sổ cổng gate_decisions, bàn điều hành HT11; nêu xung đột với STD-EVD-4 -->
<!-- [2026-11-06 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — chủ dự án đồng ý bản gọn: không hợp đồng bizcity_gate@1 riêng, không bảng gate_decisions; cổng = các bước bizcity_action@1 §4 trả GateResult; sổ cổng = bizcity_evidence@1 mở rộng (gates[], chặn trước handler, source, basisUsed); thêm luật nhập chứng từ (mở rộng HT09) và nhập tham số pháp lý từ Erp-vn -->

> Nối tiếp: [ADR-0029](../../adr/ADR-0029-loi-bat-bien-nghiep-vu-linh-hoat.md) · [kiến trúc](../../architecture/LOI-BAT-BIEN-NGHIEP-VU-LINH-HOAT.md) · [16](16-CHUAN-CHUNG-TU-DUNG-CHUNG.md) · [19](19-RA-SOAT-DUYET-VA-GHI-SO.md) · đánh giá phân quyền: [22](22-DANH-GIA-GON-PHAN-QUYEN.md). Bản mẫu: [mockups/thu-vien-nghiep-vu.html#cong](mockups/thu-vien-nghiep-vu.html#cong).
> Mọi chỗ "đã có" dẫn tệp:dòng trên HEAD nhánh này.

## 0. Trả lời ngắn

1. **Không có hợp đồng thứ 25.** [`bizcity_action@1` §4](../../contracts/BIZCITY-ACTION-v1.md) đã là một chuỗi cổng: xác thực → module / năng lực → quyền → kiểm đầu vào → chống trùng → handler (chuyển trạng thái, kiểm nghiệp vụ, ghi sổ) → bằng chứng. Chỉ cần **đặt tên các bước là cổng** và cho mỗi bước trả **một kiểu `GateResult`** dùng chung (LEAN-1, LEAN-2).
2. **Không có bảng sổ cổng riêng.** **Bằng chứng** ([`bizcity_evidence@1`](../../contracts/BIZCITY-EVIDENCE-v1.md), `audit_logs`: chỉ thêm, chuỗi băm theo đơn vị, giữ ≥ 10 năm) *là* sổ cổng. Mở rộng thêm:
   - `gates[]`: kết quả từng cổng;
   - ghi cả lần bị chặn **trước** handler;
   - `source`: từ đâu;
   - `basisUsed`: căn cứ và tham số đã dùng.

   Một sự thật một chủ (LEAN-3).
3. **Giống OpenTelemetry nhưng cho nghiệp vụ.** Cùng `trace_id` / `correlation_id`.
   - Trace (giữ 7 ngày, có lấy mẫu) dành cho dev: chậm ở đâu, lỗi ở bước nào.
   - Bằng chứng (đủ 100 %, ≥ 10 năm) dành cho chủ, kế toán trưởng, kiểm toán: ai, khi nào, từ đâu, làm gì, được hay bị chặn, theo căn cứ nào.

   Mỗi cổng phát thêm span event `bizcity.gate` để hai bên bấm qua lại được.
4. **Tệp lưu trữ** (Q030-5): chủ dự án chọn **B** — bằng chứng ở CSDL là nơi ghi chính, xuất niêm phong hằng ngày; cần ADR sửa STD-EVD-4 trước khi code (S030-30).
5. **Bàn điều hành HT11** đọc từ bằng chứng, view hàng việc, bể chờ và nhật ký ghi sổ. Không thêm nguồn.

## 1. Cổng là các bước của action

### 1.1 Bản đồ

| Bước `bizcity_action@1` §4 | Cổng (`gate`) | Câu hỏi | Engine sẵn có | Mặc định khi không chắc | Đã ghi bằng chứng? |
|---|---|---|---|---|---|
| 1 xác thực | `session` | ai đang gọi? | JWT / khoá API / khoá Cell | đóng | ☐ (`apps/api/src/modules/auth/*` không ghi) |
| 2 module bật, năng lực | `capability` | module có bật cho đơn vị? | registry module | đóng | ☐ |
| 3 quyền (+ `expose.ai`) | `role` | người này được làm việc này, ở đây? | `requirePermission` → `authorize` (PHASE-028) | **đóng**; Cấm thắng | ☐ (`actions.ts:388-401` ném trước handler) |
| 4 kiểm `input` (zod) | `shape` | đúng hình dạng dữ liệu? | zod | đóng | ☐ (STD-EVD-1 miễn) |
| 5 chống trùng | `idempotency` | lặp lại một yêu cầu? | khoá idempotency | trả phản hồi cũ | ☐ |
| 7 handler — `wf.plan`, `dataLock`, khoá kỳ | `transition` | được làm lúc này, từ trạng thái này? | workflow YAML, `date-rules.ts`, `period_locks` | **đóng** | ✅ nếu ném trong handler (`actions.ts:571-575`) |
| 7 handler — `check()`, luật nhập, rulepack | `validation` | nội dung đúng luật / nguyên tắc chưa? | findings, HT09, rulepack | cho phép, nhắc (R-GATE-9) | ✅ khi chặn; ☐ khi chỉ nhắc |
| 7 handler — `ctx.ledger.submit` | `ledger` | đủ điều kiện ghi sổ? | Kernel G1–G5 | giữ vào bể chờ | ✅ `posting_log`, `intake_inbox` |

Thứ tự đã cố định trong §4. Hai bước 3 và 4 dừng sớm (không hỏi nội dung với người không có quyền). Bước `validation` gom đủ phát hiện.

### 1.2 Một kiểu chung

```ts
// packages/contracts/src/findings.ts — thêm cạnh Finding (không hợp đồng mới)
type GateKind = 'session' | 'capability' | 'role' | 'shape' | 'idempotency' | 'transition' | 'validation' | 'ledger';
interface GateResult {
  gate: GateKind;
  verdict: 'pass' | 'warn' | 'hold' | 'block';
  codes: string[];                 // mã bizcity_findings@1 / AUTHZ-* / mã lỗi chuẩn
  decisionId?: string;             // AuthzDecision.decisionId, id lần nhận ở Kernel…
  ruleVersion?: string;            // authz_version · phiên bản chính sách · rulepack · luật định khoản
  basisUsed?: BasisUse[];          // §3.3
}
```

`bizcity_action@1` lên **1.4.0**:
- §4 ghi rõ mỗi bước là một cổng và trả `GateResult`;
- runtime gom các kết quả thành `gates[]` trong phản hồi lỗi (`error.details.gates`) và trong bằng chứng;
- handler góp kết quả của nó qua `ctx.evidence.gate(result)`, cùng chỗ với `ctx.evidence.note` sẵn có.

Không engine nào phải viết lại. `wf.plan`, `authorize`, intake findings, `dataLock` chỉ thêm một hàm đổi kết quả sang `GateResult`.

## 2. Bằng chứng là sổ cổng

### 2.1 Mở rộng `bizcity_evidence@1` (1.x, chỉ thêm)

| Thêm | Vì sao | Cách |
|---|---|---|
| `gates jsonb` | biết **vì sao** được / bị chặn, không chỉ cái gì đổi | mảng `GateResult` |
| ghi cả lần bị chặn ở bước 1–5 của action **ghi** | hôm nay chỉ còn một dòng log kỹ thuật (`packages/platform/src/core/http.ts:59-62`) | giao dịch riêng, như đường `result_ok=false` đã có (`actions.ts:571-575`); `result_code` = mã lỗi chuẩn |
| `source jsonb` | **từ đâu**: Erp-vn có IP, trình duyệt, phiên; ta chưa ghi | `{ sessionId, ipPrefix, ua }`; IP chỉ giữ đoạn đầu (/24 IPv4, /48 IPv6) vì là dữ liệu cá nhân (NĐ13/2023); chỉ người có quyền xem |
| `basis_used jsonb` | **theo căn cứ nào**: mã findings đã có `basis`; thêm tham số pháp lý đã dùng | `[{ kind: 'finding' \| 'param' \| 'policy', key, value?, legalRef?, effectiveFrom?, version? }]` |
| đăng nhập, đăng xuất, xuất, in | Erp-vn ghi; ta chưa | đăng nhập / xuất / in thành action có bằng chứng (STD-EVD-7 đã yêu cầu cho đọc nhạy cảm) |

Giữ nguyên:
- chuỗi băm (trigger `0036:45-84`) gồm luôn các cột mới;
- chỉ thêm (STD-EVD-2);
- `changes` chỉ trường đổi, trường cá nhân lưu băm (STD-EVD-5);
- giữ ≥ 10 năm (STD-EVD-8).

Lần bị chặn ở bước 1 (chưa biết đơn vị, sai mật khẩu) ghi vào bằng chứng của đơn vị đích nếu xác định được, nếu không thì chỉ ghi log kỹ thuật kèm bộ đếm.

### 2.2 Không ghi gì thêm cho

- action **đọc** thường (giữ khối lượng nhỏ); trừ đọc nhạy cảm (STD-EVD-7);
- mỗi lần gõ phím ở form: cổng `validation` khi đang soạn trả findings cho giao diện nhưng **không** ghi bằng chứng; chỉ ghi lúc lưu / trình / duyệt.

### 2.3 "Ai? Khi nào? Từ đâu? Làm gì? Chống sửa? Căn cứ nào?"

| Câu hỏi | Trường bằng chứng | Hôm nay |
|---|---|---|
| Ai | `actor`, `actor_kind`, `actor_via`, `on_behalf_of` (AI thay người), `gates[role].decisionId` | ✅ trừ `decisionId` |
| Khi nào | `created_at` | ✅ |
| Từ đâu | `request_id`, `correlation_id`, `trace_id`, **`source`** | ✅ trừ `source` |
| Làm gì | `action`, `subject`, `changes` | ✅ |
| Được hay bị chặn, vì sao | `result_ok`, `result_code`, **`gates[]`** | một phần |
| Theo căn cứ nào | **`basis_used`** | ☐ |
| Chống sửa | `chain_seq`, `prev_hash`, `hash`; chẩn đoán EVIDENCE_CHAIN; (B) manifest tệp | ✅ |

Màn chi tiết một bằng chứng có đủ các khối như màn "Nhật ký hệ thống" của Erp-vn (ai, khi nào / làm gì / từ đâu / chống sửa / bảng giá trị cũ → mới). Thêm hai khối Erp-vn không có:
- **Các cổng**: từng bước, kết quả, mã;
- **Căn cứ**: văn bản, điều khoản, tham số và giá trị tại ngày.

### 2.4 Tệp lưu trữ niêm phong (Q030-5 — chủ dự án chọn **B**, 2026-11-06)

| Phương án | Nơi ghi chính | Tệp | Luật |
|---|---|---|---|
| A | bằng chứng (CSDL) | không | khớp STD-EVD-4 |
| **B (khuyến nghị)** | bằng chứng (CSDL) | xuất niêm phong hằng ngày `DATA_DIR/bang-chung/<đơn vị>/<yyyy>/<mm>/<dd>.jsonl` + `<dd>.manifest.json` (số dòng, `chain_seq` đầu / cuối, băm cuối, băm tệp); chỉ ghi một lần; tuỳ chọn đẩy kho lưu trữ ngoài (WORM) | **ADR sửa STD-EVD-4**: ngoại lệ đúng một tệp `packages/platform/src/core/evidence-export.ts` |
| C | tệp JSONL | — | trái STD-EVD-4 và R-ECP-CONS; không khuyến nghị |

## 3. Căn cứ, tham số pháp lý, luật nhập chứng từ

### 3.1 Căn cứ tới điều, khoản, điểm

`bizcity_findings@1` hiện ghi căn cứ ở **mức văn bản** (R-GATE-11: điều khoản chỉ thêm khi đã đối chiếu văn bản gốc). Erp-vn ghi tới mức *"Nghị định 320/2025/NĐ-CP, Điều 12 khoản 3 điểm k"*.

Đề xuất `basis[]` thêm trường tuỳ chọn `article: { dieu, khoan?, diem? }` kèm `verified: true | false`. Giao diện chỉ hiện điều khoản khi `verified`.

### 3.2 Nhập tham số pháp lý từ Erp-vn

Chủ dự án đã xuất `tham-so-phap-ly-2026-11-06.json` (định dạng `lfood-legal-params` v1):
- **120 tham số**, 9 nhóm: lao động 28 · thuế TNDN 26 · bảo hiểm 17 · TNCN 16 · GTGT 10 · lương 9 · kế toán 8 · tài sản 1 · khác 5;
- 118 `law`, 2 `policy`;
- **mọi** giá trị có `legal_ref` và `date_from` / `date_to`.

Mỗi tham số có dạng `{ code, name, group, value_type, kind, values: [{ value, date_from, date_to, legal_ref, state }] }`. Khớp gần một-một với `setting_values` của E2 (khoá, giá trị, hiệu lực, phạm vi) cộng `legalRef`, `kind` (P-030-2).

Việc S030-15 nay có nguồn cụ thể:
1. viết bộ chuyển đổi `lfood-legal-params@1 → vn-rulepacks`: khoá đổi sang `<nhóm>.<tên>`, giữ mã gốc làm bí danh;
2. tách `legal_ref` thành `{ văn bản, điều, khoản, điểm }` (`verified: false`);
3. kế toán trưởng xác nhận giá trị (S030-12);
4. nạp: E2 đã merge (#105). Vì `setting_values` gắn **một đơn vị** mỗi dòng, tham số **luật** (quốc gia, giống nhau mọi đơn vị) đi vào `vn-rulepacks` làm **mặc định theo ngày** cho mọi đơn vị (có phiên bản, duyệt khi cài — ADR-0016); `setting_values` chỉ giữ 2 tham số `policy` và giá trị đơn vị **ghi đè** (bắt lý do). `getSetting` đọc: đơn vị ghi đè → mặc định rulepack tại ngày → mặc định registry. Cần thêm vào registry `legalRef`, `kind` (P-030-2).

Hai bảng đi cùng đường này:
- **thuế suất GTGT có hiệu lực** (vd 8 % từ 01/07/2025 theo NQ 204/2025/QH15, NĐ 174/2025/NĐ-CP);
- **lịch nghỉ lễ** có căn cứ (Bộ luật Lao động 2019, Điều 112), làm dữ liệu cho `workingDays` (K-030-10).

### 3.3 Luật nhập chứng từ: gợi ý, cảnh báo, hướng dẫn

Erp-vn có "Ràng buộc nhập liệu" (`lfood.entry.rule`):
- điều kiện theo đầu tài khoản và bên Nợ / Có;
- bắt buộc đối tượng / khoản mục / diễn giải / số chứng từ;
- trần số tiền; cấm hạch toán tay (vd 154).

Điểm yếu đã rà ([15 §1 #9](15-KINH-NGHIEM-COT-LOI.md)): luật **chỉ** áp cho màn bút toán, không áp cho phiếu tay thường.

open-ketoan đã có khung đúng cho danh mục: **HT09 Quy định dữ liệu danh mục** (`apps/api/src/modules/system/catalog-rules.routes.ts`). Mỗi luật có mức; đơn vị sửa câu chữ; kế toán trưởng hạ cảnh báo (bắt lý do); chạy ngay (ADR-0020); bản duyệt gắn dấu luật; có căn cứ.

Đề xuất **mở HT09 sang chứng từ**: cùng màn, cùng cách duyệt, thêm loại luật `entry`:

| Phần | Nội dung |
|---|---|
| Điều kiện | loại chứng từ · `reasonCode` / nhóm lý do · nhóm tài khoản (dữ liệu kế toán trưởng cấu hình, không phải số trong mã) · bên Nợ / Có · chi nhánh |
| Yêu cầu | chiều phân tích bắt buộc (đối tượng, khoản mục, bộ phận, vụ việc) · diễn giải · số chứng từ gốc · trần số tiền · cấm hạch toán tay |
| Mức | `info` gợi ý (hiện cạnh ô nhập) · `warn` cảnh báo (qua kèm lý do) · `block` chặn (chỉ cho toàn vẹn dữ liệu) |
| Lời nói | mã finding `ENTRY-*`, có vì sao, cách sửa, căn cứ, trang học |
| Áp ở | cổng `validation` của **mọi** đường vào: phiếu tay, chứng từ module, kết nối / POS (Gate B) |
| Bằng chứng | luật nào chạy, phiên bản luật (dấu luật), mức sau khi đơn vị hạ |

## 4. Bàn điều hành chứng từ & cổng (HT11)

Sáu khối giữ như bản trước, chỉ đổi nguồn:

| Khối | Trả lời | Nguồn |
|---|---|---|
| ① Hàng việc | nháp / chờ duyệt / đã duyệt chưa ghi nhận / bể chờ / bị chặn, theo tuổi | view `bizcity_read.document_queue` (ADR-0026) gộp trạng thái các bảng chứng từ về 5 nhóm + `intake_inbox` |
| ② Cổng | tỷ lệ qua / nhắc / giữ / chặn theo cổng; xu hướng 14 ngày | `audit_logs.gates` + `posting_log` + `intake_inbox` |
| ③ Sai luật / nguyên tắc kế toán | mã hay gặp, căn cứ; chứng từ cần xem lại | `gates[].codes` ⋈ thư viện findings (`basis`) |
| ④ Sai vai trò | ngoài phạm vi, thiếu quyền, thu hồi, tự duyệt | `gates[role]` + `gates[transition]` (SoD) |
| ⑤ Luồng chuyển | ma trận nguồn → đích, thời gian ở mỗi trạng thái | `gates[transition]` + lịch sử trạng thái |
| ⑥ Nhật ký | dòng thời gian theo người / chứng từ; kiểm chuỗi băm (+ manifest) | bằng chứng + `posting_log` + `intake_inbox`, dựng khi hỏi |

Ai thấy gì:
- người dùng: hàng việc của mình ở thanh "Việc cần làm" (`apps/web/src/layout/rail/useViec.ts`, thêm nguồn `GET /api/v1/queue/mine`);
- trưởng bộ phận: theo `scopeOf`;
- kế toán trưởng / quản trị / kiểm toán viên: toàn đơn vị;
- trợ lý AI: số tổng hợp, không danh sách người.

Số liệu đọc từ CSDL, không từ Prometheus (R-OBS-4). ACC14, trạm tiền kiểm, HT08, Bàn điều tra giữ nguyên, HT11 dẫn link sang.

## 5. Golden và chẩn đoán

| Mã | Cho – khi – thì |
|---|---|
| T030-GATE-1 | action ghi bị chặn ở bước quyền (FORBIDDEN) → **có** bằng chứng `result_ok=false`, `gates[role].verdict = 'block'`, mã AUTHZ-*; giao dịch chính huỷ |
| T030-GATE-2 | chuyển thành công → bằng chứng có đủ `gates[]` theo đúng thứ tự §1.1 và `basis_used` của tham số đã dùng |
| T030-GATE-3 | sửa tay một dòng bằng chứng (vượt trigger trong test) → EVIDENCE_CHAIN báo đứt; (B) manifest ngày đó không khớp |
| T030-GATE-4 | không bằng chứng nào chứa nội dung chứng từ, tên người, mã số thuế, IP đầy đủ (quét mẫu) |

Chẩn đoán:
- **dùng lại** EVIDENCE_CHAIN;
- thêm `EVIDENCE_GATES_MISSING` (L3: action ghi không có `gates[]` sau khi bật) và `QUEUE_AGING` (L1: chứng từ chờ quá hạn theo chính sách).

## 6. Việc (thay bản trước)

| Mã | Việc | Chủ | Phụ thuộc |
|---|---|---|---|
| S030-28 | `bizcity_action@1` 1.4.0 (§4 = các cổng, `GateResult`, `error.details.gates`, `ctx.evidence.gate`) + kiểu `GateResult` trong `packages/contracts` — PR chốt thiết kế | nhóm Lõi | — |
| S030-29 | `bizcity_evidence@1` mở rộng: cột `gates`, `source`, `basis_used` (migration ≥ 0076); ghi chặn trước handler; đăng nhập / xuất / in thành action có bằng chứng; `EVIDENCE_GATES_MISSING` | Platform | S030-28; chạm `actions.ts` / `audit.ts` khi dòng PHASE-014 đợt 8b nhả |
| S030-30 | Q030-5 → nếu B: ADR sửa STD-EVD-4, xuất niêm phong bằng chứng hằng ngày + manifest + `GET /evidence/verify` | chủ dự án quyết; Platform | S030-29 |
| S030-31 | View `bizcity_read.document_queue` + API `queue/summary`, `queue/mine`; thanh "Việc cần làm" | Platform + web | — (làm được ngay) |
| S030-32 | Màn HT11 (6 khối) + màn chi tiết bằng chứng (ai / khi nào / từ đâu / làm gì / chống sửa / các cổng / căn cứ) | web | S030-29, S030-31 |
| S030-33 | Golden T030-GATE-1..4 | Conformance | S030-29 |
| S030-34 | HT09 mở sang luật nhập chứng từ (`ENTRY-*`), áp ở cổng `validation` mọi đường vào | Platform | S030-28 |
| S030-35 | Bộ chuyển đổi `lfood-legal-params@1` → `vn-rulepacks` (120 tham số) + thuế suất GTGT có hiệu lực + lịch nghỉ lễ; `basis.article` | Platform + kế toán trưởng | S030-12 (E2 đã merge #105) |
