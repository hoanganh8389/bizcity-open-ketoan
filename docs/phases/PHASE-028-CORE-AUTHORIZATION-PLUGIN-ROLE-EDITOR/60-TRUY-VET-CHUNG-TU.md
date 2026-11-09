# PHASE-028 · 60 — Vòng đời chứng từ và truy vết kế toán
<!-- [2026-11-05 07:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — chủ dự án bổ sung: sáu nguyên tắc DOC-01..06, ví dụ phiên bản phiếu nhập kho, nhóm tiêu chí TRACE-01..08 cho bảng điểm; mức đạt chấm theo mã trên main b820e30 -->
<!-- [2026-11-09 Johnny Chu - Chu Hoàng Anh] PHASE-028 — đưa bản draft W0 (05/11) vào main, thêm §0 đối chiếu với mã W1–W5 -->

## 0. Đối chiếu với mã đã merge (2026-11-09)

> Sáu nguyên tắc DOC-01..06 **trùng ý** với luật R-ECP (ECP-05 truy bút toán về sự việc và phiên bản; ECP-13 không xoá thật) và công việc của [PHASE-029](../PHASE-029-CHUAN-HOA-CHUNG-TU-GOC-TRUY-VET/README.md) (luồng D). Mức đạt ở §1 và §3 đo ở `b820e30` ngày 05/11, **chưa đo lại**.
>
> Các ca **T028-23..26** (`POSTED_SNAPSHOT`, `DOC_TO_LEDGER_CHAIN`, `REVERSAL_REASON`, `CHAIN_ACROSS_VERSIONS`) chưa có trong checklist PHASE-029 và chưa có test. **Cần chủ chốt:** giữ ở 028 hay chuyển sang PHASE-029 (khuyến nghị: chuyển, tránh hai phase cùng sửa một ca).


> Nguồn: chủ dự án bổ sung ngày 2026-11-05 (sáu nguyên tắc, ví dụ phiên bản, đề xuất nhóm tiêu chí "Document Lifecycle & Accounting Traceability"). Mức đạt dưới đây đọc từ mã và test trên `origin/main` @ `b820e30`. Không tiêu chí nào chấm "Đạt" khi thiếu test hoặc phép kiểm.

## 1. Sáu nguyên tắc bắt buộc

| Mã | Nguyên tắc | Hiện trạng trong repo | Mức |
|---|---|---|---|
| DOC-01 | Mọi bút toán có nguồn phát sinh xác định, gắn với Accounting Event và phiên bản đã ghi sổ | `ledger_entries.event_id`, `event_version` (`db/migrations/0006_goc_so_cai.sql:241-242`); tự chẩn đoán L3 `LEDGER_ORPHAN` mức lỗi bắt bút toán không có sự việc (`packages/kernel/src/modules/ledger/ledger.diagnostics.ts:101-109`), chạy trên mọi đơn vị test (`assertLedgerInvariants`) | Đạt |
| DOC-02 | Chứng từ có định danh ổn định; sửa nội dung tạo phiên bản mới, giữ lịch sử | `accounting_events` một dòng / `(tenant_id, doc_key)` + `version` (`0005_goc_chung_tu.sql:49-50,546`); bản cũ cất vào `accounting_event_versions` trước khi ghi đè (`packages/kernel/src/modules/documents/event-store.ts:54`); không đổi `doc_key`, không lùi phiên bản (`apps/api/test/db-rules.test.ts:93`); chứng từ của module: `document_versions` có băm (`0045_chung_tu_chung.sql:15`) | Đạt |
| DOC-03 | Phiên bản đã ghi sổ xuất được ảnh chụp nội dung tại thời điểm hạch toán, kể cả khi chứng từ gốc đã đổi | Dữ liệu đủ: `accounting_events.posted_version` (`0005:65`), khung nhìn `posted_event_payloads` = nội dung theo phiên bản đang nằm trong sổ (`0005:278-298`), bản cất từng phiên bản | Một phần — **chưa có API / màn** "nội dung phiên bản đã ghi của bút toán X" |
| DOC-04 | Sửa nghiệp vụ đã ghi sổ không sửa trực tiếp Ledger; điều chỉnh / đảo và ghi bút toán mới đúng quy tắc | Trigger chặn sửa / xoá / TRUNCATE dòng sổ (trụ I L-1); phiên bản mới → đảo bút toán cũ, ghi bút toán mới (`apps/api/test/ledger-flow.test.ts:96`, `event-store.test.ts:63-71`); một bút toán chỉ bị đảo một lần (`0006:586`) | Đạt |
| DOC-05 | Quan hệ chứng từ gốc ↔ chứng từ phát sinh ↔ Accounting Event ↔ Ledger truy được hai chiều | Sự việc ↔ bút toán: `event_id` có chỉ mục (`0006:580`); bút toán ↔ bút toán (đảo, trả hàng, điều chỉnh): `ledger_links` hai chiều (`apps/api/test/ledger-links.test.ts:41-54`); mặt hàng → sự kiện → chứng từ (`lineage.test.ts:63-80`) | Một phần — chiều **chứng từ module (`doc_ref`) → sự việc → bút toán** chưa có test xuyên suốt |
| DOC-06 | Không xoá cứng / làm mất lịch sử chứng từ, phiên bản và bằng chứng đã tham gia ghi sổ | Sự việc không xoá được; bản cất phiên bản chặn UPDATE / DELETE / TRUNCATE (`db/migrations/0049_khoa_dau_but_toan.sql:88-92`, test `db-rules.test.ts:93-103`); nhật ký thao tác chỉ thêm (trụ VI E-1); nhật ký phân quyền chỉ thêm (0072 trong nhánh này) | Đạt |

## 2. Ví dụ phiên bản: phiếu nhập kho đổi sau khi ghi sổ

| Thời điểm | Chứng từ | Accounting Event | Ledger | Trong repo |
|---|---|---|---|---|
| T1 | Phiếu nhập V1: 100 sản phẩm | `accounting_events` version 1 | bút toán E1, `event_version = 1`, `status posted` | `event-store.test.ts:54-59` |
| T2 | Phát hiện sai, điều chỉnh thành 90 | version 2; V1 cất vào `accounting_event_versions` | E1 → `reversed`; E1′ đảo (`is_reversal`, `reverses_entry_id = E1`, `event_version = 1`); E2 ghi nhận V2 (`event_version = 2`) | `event-store.test.ts:63-71` — kiểm đúng ba dòng `[reversed, false, 1]`, `[posted, true, 1]`, `[posted, false, 2]` và bản cất phiên bản 1 |
| T3 | Kế toán kiểm tra lại | xem lịch sử V1 → V2 | xem E1, E1′, E2 | **chưa có một API trả lời đủ** (§2.1) |

### 2.1. Câu hỏi truy vết phải trả lời được

| Câu hỏi | Dữ liệu có | Còn thiếu |
|---|---|---|
| Ai lập V1, lúc nào | `accounting_event_versions.received_at`, `audit_logs` (actor, chuỗi băm) | ghép thành một dòng thời gian |
| Ai sửa thành V2, vì sao | `audit_logs` của lần gửi V2; lý do bắt buộc khi bỏ định khoản phiếu tay (`ledger-vouchers.test.ts:100`) | phiên bản mới gửi qua API **không bắt buộc lý do**; `ledger_links.reason` mặc định chuỗi rỗng (`0006:419`) |
| Ai duyệt | trạng thái luồng duyệt (`workflow.ts`), chữ ký (`document_signatures`) | gắn người duyệt vào từng phiên bản |
| Bút toán nào ghi từ V1, bút toán nào đảo V1, bút toán nào từ V2 | `event_version`, `is_reversal`, `reverses_entry_id`, `ledger_links` | API `GET …/events/:docKey/history` trả ba nhóm |
| Phân biệt **phiên bản hiện hành** và **phiên bản đang ghi nhận trên sổ** | `accounting_events.version` ≠ `posted_version` khi chứng từ chờ định khoản lại; `posted_event_payloads`; màn ACC3C "lệch so với phiếu gốc" (`ledger-vouchers.test.ts:67`) | màn / báo cáo **không bao giờ** diễn giải bút toán cũ bằng nội dung mới nhất — cần luật kiểm (đề xuất SC-TRACE-1: báo cáo đọc nội dung chứng từ cho bút toán phải đi qua `posted_event_payloads` hoặc bản cất theo `event_version`) |

## 3. Nhóm tiêu chí TRACE (bảng điểm)

Đặt thành nhóm **"Document Lifecycle & Traceability"** trong dữ liệu bảng điểm nháp ([data/authz-criteria.draft.json](data/authz-criteria.draft.json)), hiện cùng bản mẫu [mockups/authz-scoreboard.html](mockups/authz-scoreboard.html). Nơi đặt chính thức trong `tru-cot.json` chờ chủ dự án quyết (D-AUTH-16, §4).

| Mã | Tiêu chí | Mức | Bằng chứng | Khoảng cách | Việc tiếp |
|---|---|---|---|---|---|
| TRACE-01 | 100% bút toán có nguồn sự việc kế toán hợp lệ | **Đạt** | `LEDGER_ORPHAN` L3 mức lỗi (`ledger.diagnostics.ts:101-109`); `assertLedgerInvariants` trên mọi đơn vị test | đo "100%" trên bản cài thật qua tự chẩn đoán định kỳ (đã có lịch đêm của Kiểm chuẩn) | — |
| TRACE-02 | 100% bút toán truy được đúng phiên bản đã ghi sổ | Một phần | `event_version` trên bút toán; bản cất phiên bản; `event-store.test.ts:54-71` | API / màn đọc nội dung phiên bản của một bút toán; luật SC-TRACE-1 | T028-23 |
| TRACE-03 | Chứng từ gốc truy được toàn bộ bút toán liên quan | Một phần | `event_id` → bút toán; `ledger_links` hai chiều (`ledger-links.test.ts:46`) | chứng từ module `doc_ref` → sự việc → bút toán chưa có test xuyên suốt | T028-24 |
| TRACE-04 | Phiên bản cũ không bị ghi đè hoặc mất lịch sử | **Đạt** | bản cất chỉ thêm (`0049:88-92`); test `db-rules.test.ts:93-103`, `event-store.test.ts:71` | — | — |
| TRACE-05 | Bút toán đảo truy ngược được bút toán bị đảo và lý do | Một phần | `reverses_entry_id`, đảo một lần (`0006:586`), `ledger_links_one_reversal` (`0006:628`), test `ledger-links.test.ts:41` | **lý do** có thể rỗng khi đảo do phiên bản mới qua API | T028-25 |
| TRACE-06 | Quan hệ liên phân hệ không đứt khi đổi mã hoặc trạng thái | Một phần | mặt hàng: `item_id` qua đổi mã / gộp mã (`xuong-ca-dinh-danh.test.ts:46-160`, trụ II ID-2, III C-2) | đối tượng, chi nhánh, kho chưa có mã phiên bản (trụ II ID-6, S026-4) | S026-4 |
| TRACE-07 | Truy vết tôn trọng phân quyền và phạm vi tenant | Một phần | RLS theo đơn vị (trụ VII S-1); route truy vết gác quyền (`apps/api/src/modules/doc-refs/doc-ref.routes.ts:37`) | **phạm vi chi nhánh / kho** chưa có (PHASE-028 W3 `scopeOf`); xuất truy vết chưa lọc phạm vi | S028-12 |
| TRACE-08 | Kiểm thử chuỗi mua → kho → bán → giá vốn → Ledger xuyên nhiều phiên bản | Một phần | Golden Tests đổi mã (S026-2); hành trình + giá vốn tháng (`lineage.test.ts:63-132`) | chưa có ca **sửa phiếu đã ghi sổ ở giữa chuỗi** (V1 → V2 phiếu nhập sau khi đã bán, tính lại giá vốn) | T028-26 |

Mức nhóm theo công thức HT10: 2 Đạt + 6 Một phần → (2 + 3) / 8 = **63 %**. P0 mở: TRACE-02, 03, 05, 07, 08.

Không trùng điểm: TRACE-01 cùng nội dung trụ I L-3, TRACE-06 gần trụ III C-2. Khi ghép vào `tru-cot.json`, tiêu chí cũ giữ mã cũ, TRACE trỏ tới (`same_as`) thay vì chấm hai lần.

## 4. Quyết định cần chốt (D-AUTH-16)

| Phương án | Ưu | Nhược |
|---|---|---|
| **A. Trụ mới "Vòng đời chứng từ & truy vết"** (đề xuất của chủ dự án) | thấy ngay trên HT10; một chỗ cho DOC-01..06 | chồng một phần trụ I (L-3), III (C-1, C-2), VI (E-1) — phải đánh dấu `same_as` |
| B. Nhóm TRACE trong trụ III "Liên tục kế toán" | không thêm trụ; chủ là PHASE-025 | khó thấy riêng; DOC-01..06 nằm rải |
| C. Nhóm trong bảng điểm phân quyền (như bản mẫu này) | làm nhanh | sai chủ: chỉ TRACE-07 thuộc phân quyền |

Đề xuất: **A**, chủ là PHASE-025 (Accounting Continuity), PHASE-028 giữ TRACE-07. Bản mẫu bảng điểm hiện đặt nhóm ở đây chỉ để xem trước.

## 5. Ca kiểm bổ sung

| Ca | Đạt khi |
|---|---|
| T028-23 `POSTED_SNAPSHOT` | sau V2, đọc bút toán E1 trả nội dung **V1** (không phải V2); báo cáo diễn giải E1 bằng V1 |
| T028-24 `DOC_TO_LEDGER_CHAIN` | từ một `doc_ref` của module: liệt kê đủ sự việc → bút toán (gồm đảo); từ bút toán đi ngược về `doc_ref` |
| T028-25 `REVERSAL_REASON` | mọi bút toán đảo có lý do không rỗng (phiên bản mới qua API phải gửi lý do hoặc Core ghi lý do chuẩn từ thư viện mã) |
| T028-26 `CHAIN_ACROSS_VERSIONS` | mua 100 → bán 60 → sửa phiếu mua thành 90 (V2) → tính lại giá vốn tháng: tồn = 30, sổ cân, chuỗi truy vết chỉ đúng V1 / V2 cho từng bút toán |
