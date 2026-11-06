# PHASE-030 · 17 — Bộ chuẩn STD-030: luật, thư viện, thông báo, phép kiểm, bản mẫu cho 12 chuẩn
<!-- [2026-11-06 01:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — đóng gói 12 chuẩn STD-030 (15 §2) thành sáu phần dùng được: luật R-MSTD, hợp đồng, thư viện, thư viện thông báo, SC-STD-*, bản mẫu; trả lời: tiết kiệm ở đâu, 6 cơ chế đã vào tài liệu chưa, luật tối thượng có chưa -->

> Đọc cùng: [15](15-KINH-NGHIEM-COT-LOI.md) (vì sao) · [16](16-CHUAN-CHUNG-TU-DUNG-CHUNG.md) (chuẩn chứng từ) · [18](18-THU-VIEN-TIEN.md) (thư viện tiền, chốt thiết kế) · [bản mẫu](mockups/thu-vien-nghiep-vu.html).

## 0. Ba câu hỏi của chủ dự án

### 0.1 Có tiết kiệm token và thời gian khi code nghiệp vụ không?

**Có, nhưng không đều.** Tiết kiệm đến từ ba nguồn:

1. **Không phải nghiên cứu lại luật VN.** Erp-vn đã có công thức, số ví dụ và ngoại lệ (blueprint 50–55 chép lại có dẫn tệp:dòng).
2. **Golden test có sẵn số.** AI sinh mã rồi chạy thử là biết đúng sai, không phải hỏi đi hỏi lại.
3. **Khuôn chung.** `defineDocument`, `allocate`, findings: module không viết lại phần nền. Đây là nguồn tiết kiệm lớn nhất về lâu dài, nhưng **chỉ có khi nền đã làm xong** (bậc 1–3 ở [15 §8](15-KINH-NGHIEM-COT-LOI.md)).

| Nghiệp vụ | Mức tiết kiệm | Vì sao |
|---|---|---|
| Lương – BH – TNCN (LUONG, NSU) | **Cao** | công thức thuần, trần / sàn đóng BH, lũy tiến, giảm trừ đã có đủ, kèm 3 ca số (T030-LUONG-1..3); open-ketoan đang là 0 |
| Khấu hao theo ngày, CCDC, trả trước / trích trước (TS, KT10) | **Cao** | `build_schedule` theo ngày, kỳ cuối nhận phần dư; một bộ tính dùng cho 3 nghiệp vụ |
| Hoá đơn điều chỉnh / thay thế, khuyến mãi NĐ81, dự phòng TT48, chậm nộp, nhà thầu (BH, KT, THUE) | **Cao** | luật nhiều nhánh ngoại lệ — phần tốn công nhất khi tự viết; Erp-vn đã mã hoá (`_check_correction`, bậc 30/50/70/100 %) |
| Kho: lô, FEFO, kiểm kê, cách ly (KHO) | **Trung bình** | luồng và luật rõ, nhưng phải chờ Kernel có lô (K-030-1) |
| Bán hàng: đơn, bảng giá kênh, hạn mức (BH) | **Trung bình** | luồng học được; giao diện và tích hợp sàn vẫn phải tự làm |
| Mua hàng, sổ cái, kết chuyển, báo cáo (MH, KT lõi) | **Thấp** | open-ketoan đã mạnh hơn; Erp-vn chỉ dùng để tra chéo |
| Nhóm ngoài phạm vi (CL, RD) | — | ⛔ |

Điều kiện để thực sự tiết kiệm: dev / AI đọc **blueprint + golden** trước, không đọc mã Odoo. Đọc mã Odoo tốn token gấp nhiều lần và dễ chép nhầm phản mẫu (tài khoản viết cứng, `round()` về chẵn).

### 0.2 Sáu cơ chế dùng chung đã vào tài liệu chưa?

**Đã vào tài liệu cả sáu.** Phần mã thì mới có ba.

| Cơ chế | Tài liệu | Luật đã có | Mã đã có | Còn thiếu |
|---|---|---|---|---|
| Ghi sổ một cửa, khoá chứng từ nguồn | 15 §1 #1, 16 §2, STD-030-1 | CANON câu 1 & 3, R-EVENT, STD-DOC-1, ADR-0015 | ✅ `postDocumentIn`, `UNIQUE(tenant_id, doc_key)`, `ctx.ledger.submit` | SC-STD-1 cho `modules/**`; chưa module nào dùng `ctx.ledger.submit` |
| Sửa sau ghi sổ = đảo + ghi lại | 15 §1 #2–3, **16 §4** (hai con trỏ) | CANON câu 2, R-LEDGER, STD-DOC-5, R-WF-4, DOC-04 | ✅ Kernel `version` / `posted_version`, append-only (0049) | luồng điều chỉnh ở chứng từ module (DOC-030-3, K-030-8) |
| Tham số pháp lý có ngày hiệu lực | 15 §1 #5, 20 M2, STD-030-7 | R-MATRIX (chưa có ngày hiệu lực), ADR-0009 (chính sách định khoản) | ☐ `setting_values` E2 chưa có mã — **đang giữ chỗ** ở CLAIMS (PHASE-029 S029-10, đợt 1) | P-030-2 (thêm `legalRef`, `kind`, mô phỏng sau đợt 1) + seed VN (K-030-6) |
| Nhật ký kiểm toán chuỗi băm | 15 §1 #12, STD-030-6 | R-TEN, bizcity_evidence@1 | ✅ `audit_logs` chuỗi băm (0036), `writeEvidence` | lý do thành trường chung (STD-030-6) |
| Đối soát sổ cái ↔ sổ chi tiết | 15 §1, K-030-12, 60 §4 (INV-4) | R-CONT (sổ chi tiết = sổ cái), R-DIAG | 🟡 `scripts/doi-chieu-ke-toan.sql` viết tay, `assertLedgerInvariants` | khai bằng dữ liệu cho sổ chi tiết mới (K-030-12) |
| Một hàm chia tiền không lệch đồng | 15 §0 #4, STD-030-5, **18** | — | ☐ chưa có ở `packages/`; có 2 cách chia khác nhau (mua hàng, tài sản) | **18** (chốt thiết kế + dòng CLAIMS) |

### 0.3 Có luật tối thượng, hợp đồng framework, hướng dẫn chưa? Hàm chia tiền có chưa?

| Tầng | Đã có | Hàm chia tiền |
|---|---|---|
| **Luật tối thượng** | [00-CANON §1](../../00-CANON.md) bốn câu không thương lượng (Tier 0) + 25 tệp luật `docs/rules/RULE-*.md` | ☐ không luật nào nói tới chia / làm tròn — `R-DB` chỉ nói kiểu `numeric(18,2)` |
| **Hợp đồng framework** | 24 hợp đồng `docs/contracts/BIZCITY-*-v1.md` (chứng từ, findings, lỗi, module, ghi sổ…) | ☐ không có; `packages/contracts/src/money.ts` có `toCents`, `sumMoney`, `roundDong` (= `Math.round`, −2,5 → −2) |
| **Thư viện mã** | `@bizcity/module-sdk` xuất lại `toCents, fromCents, sumMoney, roundDong, moneyEquals` (`packages/module-sdk/src/index.ts:44`) | ☐ không có `allocate`; chỉ `modules/mua-hang/domain/src/engine.ts:514` |
| **Hướng dẫn** | `docs/phat-trien.md`, `docs/HUONG-DAN-LAM-VIEC.md` (dev); `docs/huong-dan/*` (người dùng) | ☐ |

→ [18](18-THU-VIEN-TIEN.md) lấp cả bốn tầng cho tiền: luật **R-MONEY** (Tier 0), mục hợp đồng, mã `allocate` / `roundMoney` (kèm mã tham chiếu đã chạy thử), và trang hướng dẫn. Mã chỉ được viết **sau khi** dòng CLAIMS vào `main` (R-FLOW-1).

## 1. Một chuẩn = sáu phần

Một chuẩn chỉ có tác dụng khi dev gặp nó **đúng lúc**: lúc gõ mã (thư viện), lúc chạy kiểm (SC), lúc người dùng bấm (thông báo). Vì vậy mỗi chuẩn STD-030-n đóng gói đủ sáu phần:

| Phần | Ở đâu | Ai gặp |
|---|---|---|
| **Luật** | `docs/rules/RULE-MODULE-STANDARD.md` (R-MSTD-n, đề xuất §4) + dòng ở CANON §3 | người duyệt PR |
| **Hợp đồng** | mục trong `bizcity_document@1`, `bizcity_module@1`, `bizcity_findings@1` | người viết nền |
| **Thư viện** | `@bizcity/module-sdk` — hàm / kiểu dùng thẳng | dev, lúc gõ mã |
| **Thông báo** | mã finding (người dùng) + câu của SC (dev), một nguồn ở `bizcity_findings@1` | người dùng, dev |
| **Phép kiểm** | `SC-STD-n` trong `tests/conformance/checks/module/` + golden `T030-*` | CI, `bizcity module check` |
| **Bản mẫu** | mục tương ứng ở [mockups/thu-vien-nghiep-vu.html](mockups/thu-vien-nghiep-vu.html) | chủ dự án, dev mới |

## 2. Mười hai chuẩn

Ký hiệu cấp theo CANON §2: **T0** chặn merge, không ngoại lệ · **T1** chặn merge, ngoại lệ cần ADR · **T2** nhắc.

### STD-030-1 · Chỉ ghi sổ qua `ctx.ledger.submit` — T0
- **Luật:** module không gọi `postDocumentIn`, `submitDocumentIn`, `eventStore`, `voucherService`; không đọc / ghi `ledger_*`, `accounting_events`, `debt_items`, `inventory_movements`. Đọc qua `ctx.ledger.query` / view `bizcity_read` (ADR-0026).
- **Đã có:** STD-DOC-1, ADR-0015, SC-KERNEL-7.
- **Thư viện:** `ctx.ledger.submit / cancel / get / query / allocateDebt`; `defineDocument({ ledger: { docType, build } })` (16 §2) gọi hộ.
- **Thông báo:** dev — `SC-STD-1 ✗ <tệp>:<dòng> gọi postDocumentIn — dùng ctx.ledger.submit (17 §STD-030-1)`.
- **Kiểm:** `SC-STD-1` quét import / chuỗi SQL trong `modules/**` (mở rộng SC-KERNEL-7 sang `modules/`); golden INV-3.
- **Bản mẫu:** mọi bản đồ luồng, điểm "ghi sổ" ◆.

### STD-030-2 · Không số tài khoản trong mã module — T0
- **Luật:** không literal số TK / tiền tố TK (`'1561'`, `like '331%'`, `startsWith('112')`) trong `modules/**/src`, `modules/**/domain`, `modules/**/api`. Chỉ `reasonCode`, `methodCode`, khoá `postingDefaults`. Số TK chỉ ở posting pack, báo cáo pháp định, và **dữ liệu người dùng nhập** trên phiếu `manual` (16 §6).
- **Đã có:** CANON câu 4, R-POST-2 (chỉ cho `posting/rules`), SC-KERNEL-5.
- **Thư viện:** `ensurePostingReason` (module khai lý do của mình), `manual_journal` (khuôn `strict` từ chối trường TK).
- **Thông báo:** người dùng — thiếu khai báo thì `POSTING_FAILED` liệt kê đủ (R-POST-4); dev — `SC-STD-2 ✗ <tệp>:<dòng> có '1561' — khai reasonCode, để kế toán trưởng gán tài khoản trong pack`.
- **Kiểm:** `SC-STD-2` regex `'[1-9]\d{2,5}'` có ngữ cảnh tài khoản (biến / khoá tên `acc*`, `account*`, `tk*`, so `like`, `startsWith`); golden INV-8.
- **Nợ hiện có:** N030-2 (`modules/mua-hang/domain/src/engine.ts:867`).

### STD-030-3 · Mọi chứng từ có workflow YAML — T1
- **Luật:** mỗi `documents[].type` có `workflow` hợp lệ; runtime tự nạp; trạng thái thuộc 5 nhóm; từ chối về nhóm `draft` (R-WF-10); ngưỡng qua `policy` (R-WF-11).
- **Đã có:** R-WF-1..9, STD-DOC-3/4, `Workflow.plan`, CONF-MAN-4.
- **Thư viện:** `defineDocument({ workflow })`, `wf.allowed()`, `wf.explain()`.
- **Thông báo:** người dùng — `DOC-FLOW-001` *"Phiếu đang Chờ duyệt, không sửa được — rút về Nháp để sửa"* (thay `blocked` tự do); `DOC-APPROVE-001` câu giải thích chính sách (16 §5.2).
- **Kiểm:** `SC-STD-3` — manifest ↔ tệp YAML ↔ nhóm trạng thái; sinh sơ đồ trạng thái để so tài liệu luồng (R-WF-5).
- **Bản mẫu:** mục *Chuẩn chứng từ* (vòng đời, hai con trỏ).

### STD-030-4 · Khoá kỳ theo ngày chứng từ, kể cả phiếu không ghi sổ — T0
- **Luật:** lưu / chuyển trạng thái một chứng từ có `doc_date` trong kỳ khoá hoặc ngoài `dataLock` → từ chối, trước khi lưu. Áp cho cả chứng từ không chạm sổ (phiếu kiểm kê đang đếm, bảng chấm công đã chốt).
- **Đã có:** STD-DOC-6, `period_locks` (kỳ × chi nhánh × docType), `dataLock`, mở khoá cần lý do.
- **Thư viện:** nền gọi trong `defineDocument` (module không tự gọi).
- **Thông báo:** `PERIOD_LOCKED` (đã có) + finding `DOC-LOCK-001` *"Ngày 28/10/2026 thuộc kỳ 10/2026 đã khoá — đổi ngày chứng từ hoặc xin mở khoá kỳ"*, `DOC-LOCK-002` tài nguyên đang khoá (kho đang kiểm kê).
- **Kiểm:** golden **INV-9** (mới): lưu chứng từ ngày trong kỳ khoá → `PERIOD_LOCKED`, không bản ghi mới.

### STD-030-5 · Tiền là số nguyên đồng, làm tròn nửa xa số 0, chia bằng một `allocate` — T0
- Toàn bộ ở **[18](18-THU-VIEN-TIEN.md)**: luật R-MONEY-1..6, API, mã tham chiếu, bảng số, cách chuyển các bản đang có, cách dev dùng.
- **Kiểm:** `SC-STD-5` — trong `modules/**`: `Math.round` / `toFixed` / `Math.floor` trên biến tiền → cảnh báo; hàm tự đặt tên `allocate|spread|split|chia|phanBo` có vòng cộng dư → chặn; golden T030-CORE-6.

### STD-030-6 · Lý do là trường chung của bằng chứng — T1
- **Luật:** chuyển trạng thái có `requires: [reason]` → lý do vào `notes.audit[].reason` của bằng chứng; không tạo cột `cancel_reason`, `refuse_note` riêng.
- **Đã có:** `AuditNote`, `ctx.evidence.note()`, R-WF-7.
- **Thông báo:** `DOC-REASON-001` *"Cần lý do khi từ chối"* (thay câu tự do của từng module).
- **Kiểm:** `SC-STD-6` — migration module không có cột `*_reason`, `*_note` cho trạng thái; golden INV-5.

### STD-030-7 · Tham số pháp lý không có giá trị mặc định cứng trong mã — T0
- **Luật:** tham số có `legalRef` / `kind: law` đọc theo **ngày chứng từ**, **cấm** `?? 5000000`, `default=`; thiếu thì `NOT_READY` nêu đúng khoá. Tham số chính sách (`kind: policy`) có mặc định **trong registry**, không trong mã.
- **Đã có:** hợp đồng `BIZCITY-SETTINGS-MATRIX-v1` (chưa mã); SC-SEC-5 cùng tinh thần cho bí mật (PHASE-027 CK-3).
- **Thư viện:** `ctx.settings.get(key, { at: doc.docDate })` (P-030-2); mô phỏng `{ at, overrides }`.
- **Thông báo:** `PARAM-MISSING-001` *"Chưa có giá trị 'Lương cơ sở' hiệu lực ngày 01/07/2026 — kế toán trưởng khai ở Cấu hình › Tham số pháp lý"*, căn cứ = `legalRef` của khoá.
- **Kiểm:** `SC-STD-7` — `ctx.settings.get(...)` theo sau bởi `??` / `||` với số; manifest `settings[]` có `legalRef` mà có `default` → chặn. Golden INV-7.
- **Bằng chứng cần chuẩn này:** Erp-vn ngưỡng tiền mặt mặc định `0` ở một chỗ, `5.000.000` ở năm chỗ.

### STD-030-8 · Một hình kết quả kiểm `findings[]` — T1
- **Luật:** hàm kiểm nghiệp vụ trả `Finding[]` của `bizcity_findings@1` (`code, level: block|warn|info, title, why, fix, basis`, + ngữ cảnh `path, got, expected`). Không tự chế `Check{blocking}`.
- **Đã có:** `bizcity_findings@1`, `notifyFinding`, SC-FIND-1/2.
- **Thư viện:** kiểu `Finding`, `finding(code, ctx)` dựng từ thư viện mã; `defineDocument({ check })` nhận `Finding[]`.
- **Kiểm:** `SC-STD-8` — mã finding module khai trong manifest `findings[]`, có trong thư viện; không kiểu `blocking:` tự chế.
- **Nợ:** N030-2 (`engine.ts:673` `Check`).

### STD-030-9 · Mỗi chứng từ có `docRef` và liên kết — T1
- **Luật:** `docRef = <module>.<type>:<id>`; `docKey` gửi sổ = `docRef` (+ `:<lineKey>` / `:<vai>` khi một chứng từ sinh nhiều sự việc); chứng từ lập từ chứng từ khác có `link(…, 'source')`; thanh toán `settles`; điều chỉnh / thay thế `replaces`.
- **Đã có:** hợp đồng §3, DOC-05, R-WF-8, `ctx.documents.link`.
- **Thông báo:** `DOC-LINK-001` (info) *"Hoá đơn này lập từ đơn BH-2026-0012"* trên màn.
- **Kiểm:** `SC-STD-9` golden — từ `entryId` bất kỳ của module, `GET /documents/history` đi về được `docRef` và nguồn của nó.

### STD-030-10 · Mã nghiệp vụ nằm trong manifest — T1
- **Luật:** `actions[].bizCodes`, `documents[].bizCodes`, `golden[]` trong `bizcity.module.json`; mã lấy từ danh mục (P-030-8).
- **Thư viện:** `docs/nghiep-vu/catalog.json` (sinh ma trận 10 và bản mẫu).
- **Kiểm:** `SC-STD-10` — mã có trong danh mục; báo cáo phủ "mã nghiệp vụ → action → golden" theo module.
- **Bằng chứng cần chuẩn này:** Erp-vn 4 lời hứa trong danh mục mà mã không làm.

### STD-030-11 · Bộ tính là hàm thuần có bảng test số liệu — T1
- **Luật:** bộ tính (lương, khấu hao, thuế, giá vốn, khuyến mãi, hạn mức) đặt ở `domain/src/*.ts`, nhận `(input, params)`, không đọc CSDL, không đọc đồng hồ, không đọc `ctx`; có `*.test.ts` dạng bảng số cạnh hàm.
- **Đã có:** R-POST-3 (luật định khoản thuần) — cùng tinh thần.
- **Thư viện:** `@bizcity/module-sdk/calc`: `prorateByDays`, `progressive`, `workingDays` (K-030-10, 18 §6).
- **Kiểm:** `SC-STD-11` — `domain/` không import `@bizcity/platform`, `sql`, `Date.now`, `new Date()` không tham số; mỗi tệp khai trong manifest `calculators[]` có test.

### STD-030-12 · Gỡ module không bao giờ chạm sổ — T0
- **Luật:** gỡ / tắt module không xoá, không sửa `accounting_events`, `ledger_*`, sổ chi tiết; `docType`, `reasonCode`, mã finding module đã dùng thì ở lại, đánh dấu `retired`.
- **Đã có:** append-only CSDL (0049), manifest `data.tables` cấm tiền tố Kernel.
- **Kiểm:** `SC-STD-12` — script gỡ / migration của module không tham chiếu bảng Kernel; test vòng đời module (`module-lifecycle.test.ts`) thêm ca "gỡ sau khi đã ghi sổ → sổ giữ nguyên, docType retired".
- **Bằng chứng cần chuẩn này:** Erp-vn `selection_add(..., ondelete='cascade')` — gỡ module xoá bút toán.

## 3. Thư viện thông báo

Không làm thư viện mới. **`bizcity_findings@1` là thư viện thông báo** (R-GATE-10: *mọi lời Core nói ra bắt đầu từ đây*). Việc cần làm là mở nó cho module và cho chuẩn chứng từ:

| Họ mã | Ai sở hữu | Ví dụ | Khai ở |
|---|---|---|---|
| `IN-*`, `ACC-*`, `PART-*`, `ITEM-*` | Kernel (đã có, 39 mã theo nhật ký hợp đồng 1.1.0) | `IN-ITEM-001` | `packages/contracts/src/findings.ts` |
| `DOC-*` (mới) | Platform — chuẩn chứng từ | `DOC-LOCK-001`, `DOC-FLOW-001`, `DOC-APPROVE-001`, `DOC-REASON-001`, `DOC-REV-001/002`, `DOC-LINK-001` | như trên |
| `PARAM-*` (mới) | Platform — tham số | `PARAM-MISSING-001`, `PARAM-OVERLAP-001` | như trên |
| `<MODULE>-<NHÓM>-<nnn>` (mới) | module | `BH-CREDIT-001` vượt hạn mức, `BH-PROMO-001` KM vượt 50 % (NĐ81), `KHO-COUNT-001` kho đang kiểm kê, `KHO-LOT-002` lô cận hạn, `LUONG-SI-001` lương dưới mức tối thiểu vùng | manifest `findings[]`, nạp vào thư viện lúc cài |

Một mục khai trong manifest:

```json
{ "code": "BH-CREDIT-001", "level": "block", "title": "Vượt hạn mức công nợ",
  "why": "Nợ hiện tại + đơn đang mở + đơn này vượt hạn mức đã duyệt cho khách",
  "fix": "Thu bớt nợ, giảm đơn, hoặc gửi duyệt vượt hạn mức",
  "overridable": { "policy": "ban_hang.han_muc.vuot" },
  "basis": [ { "key": "NOI-BO" } ] }
```

Ba cách hiện, một nguồn chữ:
- **trên trường** (mức `block` / `warn` có `path`);
- **bảng phát hiện** đầu màn chứng từ (đủ mã, vì sao, cách sửa, căn cứ);
- **thông báo** qua `notifyFinding` (chuông, thanh mép phải).

Trợ lý AI đọc cùng mã bằng `core.findings.explain`. Thông báo cho **dev** (câu của SC-STD-n) theo một khuôn: `SC-STD-<n> ✗ <tệp>:<dòng> <điều sai> — <cách sửa> (17 §STD-030-<n>)`.

## 4. Luật đề xuất: R-MSTD (`docs/rules/RULE-MODULE-STANDARD.md`)

Khi nhóm Lõi duyệt, 12 chuẩn thành R-MSTD-1..12 với cấp như §2. Cùng PR đó thêm một dòng vào CANON §3 và mục §5 *"Đổi code X → sửa tài liệu Y"*. Nằm ở phase này cho tới khi duyệt, vì luật chỉ có hiệu lực khi vào `main` qua PR chốt thiết kế (R-FLOW-7).

| Cấp | Chuẩn |
|---|---|
| T0 | 1 ghi sổ một cửa · 2 không số TK · 4 khoá kỳ theo ngày chứng từ · 5 tiền / `allocate` · 7 tham số không mặc định cứng · 12 gỡ module không chạm sổ |
| T1 | 3 workflow YAML · 6 lý do chung · 8 findings · 9 docRef + liên kết · 10 mã nghiệp vụ · 11 bộ tính thuần |

## 5. Dev nhận gì khi `git pull origin main`

Khi bậc 1–3 ([15 §8](15-KINH-NGHIEM-COT-LOI.md)) xong, một dev mới làm module chỉ cần:

```ts
import { defineDocument, allocate, roundMoney, finding, z } from '@bizcity/module-sdk';
```

và chạy:

```
$ bizcity module check kho
  ✓ SC-STD-1  ghi sổ một cửa
  ✗ SC-STD-2  modules/kho/domain/src/dieu-chinh.ts:41 có '1561' — khai reasonCode NDC, để kế toán trưởng gán tài khoản trong pack (17 §STD-030-2)
  ✓ SC-STD-3  2 chứng từ, 2 workflow, 11 trạng thái thuộc 5 nhóm
  ⚠ SC-STD-5  modules/kho/domain/src/gia-von.ts:88 Math.round trên 'amount' — dùng roundMoney (18 §3)
  ✓ golden T030-KHO-6, T030-KHO-7 · assertLedgerInvariants · đối soát kho ↔ 15x = 0
  KẾT QUẢ: KHÔNG ĐẠT (1 chặn, 1 cảnh báo)
```

Khuôn module (`templates/starter-module`, PHASE-014) cập nhật sẵn: một `*.document.ts`, một `*.workflow.yaml`, `findings[]` mẫu, `domain/` có một bộ tính + bảng test.

## 6. Thứ tự làm

| Bậc | Gói | Chuẩn mở khoá | Phase / dòng CLAIMS |
|---|---|---|---|
| 1 | Thư viện tiền ([18](18-THU-VIEN-TIEN.md)) + SC-STD-5 | 5 | **S030-19** (dòng CLAIMS trong PR này) |
| 2 | SC-STD-1, -2, -12 (chỉ là phép kiểm tĩnh trên mã có sẵn) | 1, 2, 12 | phase kiểm, sau khi R-MSTD duyệt |
| 3 | Tham số (P-030-2 = hoàn tất E2) + `PARAM-*` | 7 | PHASE-029 S029-10 |
| 4 | `defineDocument` + `DOC-*` + chính sách duyệt ([16](16-CHUAN-CHUNG-TU-DUNG-CHUNG.md) DOC-030-1..4) | 3, 4, 6, 8, 9 | phase Platform riêng |
| 5 | Danh mục mã nghiệp vụ + `bizCodes` + `calculators[]` | 10, 11 | phase SDK |
