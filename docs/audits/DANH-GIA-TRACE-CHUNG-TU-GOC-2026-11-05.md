# Đánh giá: chuẩn hoá truy vết chứng từ gốc → Accounting Event → Sổ cái (2026-11-05)
<!-- [2026-11-05 07:10 PM Johnny Chu - Chu Hoàng Anh] DANH-GIA — đánh giá hiện trạng truy vết chứng từ gốc so với đề bài "Document SDK & Lifecycle Contracts" (DOC-01..06); chỉ tài liệu, không đổi mã -->

> **Phạm vi:** đo `origin/main` (a546d9f) so với đề bài "Document SDK & Lifecycle Contracts — chuẩn hoá và tái sử dụng thành phần hiện có, không xây thêm Universal Documents": *mọi dòng bút toán truy vết ngược được về chứng từ gốc, đúng phiên bản đã tạo ra bút toán đó; từ một chứng từ gốc truy vấn được toàn bộ quá trình phát sinh, sửa đổi, duyệt, ghi sổ, điều chỉnh, đảo.*
> **Cách đo:** đọc mã và migration, dẫn `tệp:dòng`; không suy từ tên màn. Chưa chạy diagnostics trên CSDL. Ba trạng thái: **CÓ** (mã + khoá CSDL + test) · **MỘT PHẦN** · **THIẾU**.

## 1. Kết luận một đoạn

**Dữ liệu để truy vết đã ghi đủ ở tầng Kernel, nhưng chưa có cổng đọc nào ghép chúng lại, và phía chứng từ gốc của phân hệ gần như chưa dùng chuẩn chung.** Hai mắt xích Event → Ledger tốt (phiên bản đi cùng bút toán, đảo có liên kết, không sửa / xoá ở CSDL). Mắt xích **Chứng từ gốc → Event** yếu: `document_versions` / `document_links` đã có nhưng **không phân hệ nào ghi** (chỉ `ctx.documents` trong SDK). Không có API trả lời được câu hỏi của đề bài ("ai lập V1, ai sửa thành V2, vì sao sửa, ai duyệt, bút toán nào ghi từ V1, bút toán nào đảo V1"). **Mức đạt ước lượng: Event → Ledger ≈ 80 %, Chứng từ gốc → Event ≈ 25 %, cổng truy vết chung ≈ 15 %.** Không cần bảng mới "Universal Documents"; thiếu một cổng đọc và vài cột.

## 2. Chuỗi truy vết chuẩn — từng mắt xích

| # | Mắt xích | Hiện có | Bằng chứng | Trạng thái |
|---|---|---|---|---|
| 1 | Chứng từ gốc của phân hệ (PO, hoá đơn, phiếu…) mang `docRef` | `docRef = <module>.<loại>:<id>` chuẩn ở hợp đồng; `docKey` của sự việc = `docRef` | [BIZCITY-DOCUMENT-v1 §3](../contracts/BIZCITY-DOCUMENT-v1.md); phân hệ cũ (`mua-hang`…) dùng `docRef` **chỉ cho đính kèm** (`phan-he/mua-hang/ncc.ts:133-152`) | MỘT PHẦN |
| 2 | Phiên bản chứng từ gốc (`document_versions`) | bảng chỉ thêm, băm nội dung, trigger chặn sửa / xoá | [`0045_chung_tu_chung.sql:15-40`](../../db/migrations/0045_chung_tu_chung.sql#L15-L40); `documents.saveVersion` ở [`core/documents.ts:79`](../../packages/platform/src/core/documents.ts#L79) | CÓ (nền) — **chưa ai ghi** |
| 3 | Liên kết giữa chứng từ (`source`, `reverses`, `replaces`, `settles`, `ledger`) | bảng + `documents.link` + `GET /api/v1/document-links` | [`0045:44-60`](../../db/migrations/0045_chung_tu_chung.sql#L44-L60); [`doc-refs/doc-ref.routes.ts:60`](../../apps/api/src/modules/doc-refs/doc-ref.routes.ts#L60) | CÓ (nền) — **vai `ledger` không ai tự ghi** |
| 4 | Accounting Event + phiên bản | `accounting_events` (`doc_key`, `version`, `posted_version`, `created_by`, `cancel_reason`); phiên bản cũ cất ở `accounting_event_versions`; CSDL chặn xoá, chặn đổi `doc_key` / nguồn / người lập, chặn lùi phiên bản | [`0005_goc_chung_tu.sql:14-60`](../../db/migrations/0005_goc_chung_tu.sql#L14-L60); [`0049_khoa_dau_but_toan.sql:60-100`](../../db/migrations/0049_khoa_dau_but_toan.sql#L60-L100); test [`db-rules.test.ts:100-103`](../../apps/api/test/db-rules.test.ts#L100-L103) | CÓ |
| 5 | Sự việc → bút toán, đúng phiên bản | `ledger_entries.event_id` + **`event_version`** (= `sourceVersion` lúc ghi); `posted_version` trên sự việc; DG kiểm `posted_version = version` | [`ledger.service.ts:120`](../../packages/kernel/src/modules/ledger/ledger.service.ts#L120); [`event-store.ts:84`](../../packages/kernel/src/modules/documents/event-store.ts#L84); `ledger.diagnostics.ts:115-121` | CÓ |
| 6 | Sửa / huỷ = đảo + ghi mới | `reverses_entry_id`, `is_reversal`, `ledger_links`; mỗi bút toán chỉ bị đảo một lần; `ledger_entries` khoá ở CSDL | [`0049:1-60`](../../db/migrations/0049_khoa_dau_but_toan.sql); `schema-catalog.ts:82` | CÓ |
| 7 | Nhật ký định khoản theo phiên bản | `posting_log` (`version`, `action` receive / post / repost / cancel / unpost, `entry_ids`, `reversed`, `actor`, `policy_version`) — chỉ thêm | [`0005:304-318`](../../db/migrations/0005_goc_chung_tu.sql#L304-L318); `event-store.ts:96-108`; `GET /documents/:id/posting-log` | CÓ |
| 8 | Lineage & audit hai chiều | `audit_logs` (actor, trước / sau, `correlation_id`); lineage **theo mặt hàng** (`bizcity_lineage@1`) | [`lineage.service.ts:1-12`](../../packages/kernel/src/modules/lineage/lineage.service.ts); [BIZCITY-LINEAGE-v1](../contracts/BIZCITY-LINEAGE-v1.md) | MỘT PHẦN — lineage **không theo chứng từ** |
| 9 | **Cổng truy vết chung** (chứng từ ↔ sự việc ↔ bút toán, có phiên bản) | `GET /documents/:id` trả sự việc + bút toán + `sourceVersion`; `/posting-log`; `/document-versions`; `/document-links` — **bốn đường rời** | [`document.service.ts:1054-1085`](../../packages/kernel/src/modules/documents/document.service.ts#L1054-L1085); `document.routes.ts:159-192` | **THIẾU** |

## 3. Sáu nguyên tắc DOC-01..06 của đề bài — đo từng điều

| Mã | Nguyên tắc | Đo | Trạng thái | Khoảng cách |
|---|---|---|---|---|
| **DOC-01** | Mọi bút toán có nguồn: gắn Accounting Event + phiên bản ghi sổ | `ledger_entries.event_id` + `event_version` (cột `event_id` **cho phép NULL**, [`0006_goc_so_cai.sql`](../../db/migrations/0006_goc_so_cai.sql)); sổ nhập tay / số dư đầu đi `eventStore` nên cũng có sự việc | **CÓ** | kiểm bằng DG: bút toán `event_id IS NULL` còn không? (chưa có mã `DG` riêng — xem G7) |
| **DOC-02** | Chứng từ có định danh ổn định; sửa nội dung tạo phiên bản mới, bảo toàn lịch sử | **Sự việc kế toán:** CÓ (`doc_key` bất biến, trigger). **Chứng từ gốc phân hệ:** `docRef` có chuẩn nhưng bảng nghiệp vụ (vd `purchase_documents`) sửa tại chỗ, **không** ghi `document_versions` | **MỘT PHẦN** | G1 |
| **DOC-03** | Phiên bản đã ghi sổ truy xuất được **ảnh chụp nội dung tại thời điểm hạch toán**, kể cả khi chứng từ gốc đổi | Ảnh chụp **của sự việc** có (`accounting_event_versions.payload` + payload hiện hành). **Không có đường đọc**: bảng này chỉ được ghi (`document.repository.ts:52`) và đọc đúng một lần để lấy ngày nhận đầu (`:113`); `GET /documents/:id` trả `payload` **hiện hành** kèm bút toán cũ ⇒ vi phạm đúng câu cấm của đề bài ("không dùng nội dung mới nhất để diễn giải bút toán lịch sử") | **MỘT PHẦN** | **G2 — gấp nhất** |
| **DOC-04** | Sửa nghiệp vụ đã ghi sổ không sửa trực tiếp Ledger: điều chỉnh / đảo + bút toán mới | trigger `ledger_entries_no_update` + `ledgerService.reverse` + `eventStore.reverseActive` | **CÓ** | — |
| **DOC-05** | Quan hệ chứng từ gốc ↔ chứng từ phát sinh ↔ Event ↔ Ledger truy vết hai chiều | Event ↔ Ledger hai chiều CÓ (`event_id`, `GET /documents/:id`); chứng từ gốc → Event: `docKey = docRef` theo quy ước, **không có liên kết `ledger` tự ghi**; chiều ngược (bút toán → chứng từ gốc nghiệp vụ) phải tự suy từ `doc_key` | **MỘT PHẦN** | G3, G5 |
| **DOC-06** | Không xoá cứng / mất lịch sử chứng từ, phiên bản, bằng chứng đã tham gia ghi sổ | `accounting_events` chặn DELETE; versions / `posting_log` / `ledger_*` chỉ thêm. **Lỗ:** `accounting_event_versions.event_id` có `ON DELETE CASCADE` ([`0005:700-704`](../../db/migrations/0005_goc_chung_tu.sql#L700-L704)) — an toàn vì sự việc không xoá được (cờ `ketoan.allow_ledger_purge` chỉ cho test, E4); điểm thật là chứng từ gốc phân hệ **không có khoá chống xoá tương đương** ở CSDL | **MỘT PHẦN** | G6 |

## 4. Ví dụ thực tế của đề bài (phiếu nhập V1 100 → V2 90) — chạy được tới đâu

| Bước | Hệ thống làm gì hôm nay | Truy vết được? |
|---|---|---|
| T1 Phiếu nhập V1 → Event V1 → ghi 100 | `accounting_events` v1; `ledger_entries.event_version = 1`; `posting_log` action `post` | Có: `GET /documents/:id` |
| T2 Sửa thành 90 → Event V2 | cất payload v1 sang `accounting_event_versions`; `reverseActive` đảo bút toán V1; ghi bút toán V2 (`event_version = 2`); `posting_log` action `repost` (`reversed = n`) | Có dữ liệu. **Người xem thấy payload V2 cạnh cả bút toán V1** |
| T3 Kế toán tra | muốn "xem lịch sử V1 → V2": phải gọi tay `/posting-log` rồi đối `event_version` | **Không có màn / API ghép**; **không đọc được payload V1** (G2); **không có "vì sao sửa"** (G4) |

Trả lời từng câu đề bài hỏi:

| Câu hỏi | Trả lời được? | Nguồn dữ liệu / thiếu gì |
|---|---|---|
| Ai lập V1 | Có | `accounting_events.created_by` (bất biến) |
| Ai sửa thành V2 | **Một phần** | `posting_log.actor` + `audit_logs`; `accounting_event_versions` **không có cột actor** (`0005:14-20`) |
| Vì sao sửa | **Không** | không cột lý do cho phiên bản; chỉ huỷ có `cancel_reason` |
| Ai duyệt | Một phần | `purchase_documents`/`payment_requests` có người duyệt **riêng từng phân hệ**; sự việc không mang "duyệt bởi phiên bản nào" |
| Bút toán nào ghi từ V1 / bút toán nào đảo V1 | Có | `ledger_entries.event_version`, `reverses_entry_id`, `posting_log.entry_ids` |
| Phân biệt **phiên bản hiện hành** và **phiên bản đang được ghi nhận trên sổ** | Có dữ liệu (`version` vs `posted_version`), **không có chỗ hiện** | G2 / G3 |

## 5. Khoảng cách và phương án (không thêm bảng "Universal Documents")

| ID | Khoảng cách | Phương án đề xuất | Mức Kernel | Ưu tiên |
|---|---|---|---|---|
| **G1** | Chứng từ gốc phân hệ không ghi `document_versions` / `document_links` | Quy ước + phép kiểm: action ghi chứng từ nghiệp vụ phải gọi `ctx.documents.saveVersion` và `link(…, 'ledger')` khi nộp sổ; thêm `SC-DOC-7` (action `effect: write` thuộc module có `ledger.submits` mà không gọi `saveVersion` → cảnh báo). Phân hệ cũ **đóng băng** (ADR-0024): chỉ làm khi đợt chuyển tới, trước mắt `module check` bắt module **mới** | K1 (kiểm chuẩn) | P1 |
| **G2** | `accounting_event_versions` không có đường đọc; `GET /documents/:id` trộn payload hiện hành với bút toán cũ | Cổng đọc mới `GET /api/v1/documents/:id/versions` + `/versions/:n` trả payload đúng phiên bản (phiên bản hiện hành lấy từ `accounting_events`); `GET /documents/:id` gắn **`versionPayload` theo `sourceVersion` của từng bút toán** hoặc cờ `payloadVersion` để UI không diễn giải sai. Chỉ đọc, không migration | K2 (route Kernel, chỉ đọc) | **P0** |
| **G3** | Không có cổng truy vết chung; bốn đường rời | **Một** action đọc `core.document.trace` (`GET /api/v1/documents/trace?docKey=\|docRef=\|entryId=`) trả: sự việc (hiện hành + `postedVersion`), từng phiên bản (payload băm, người, lúc), bút toán theo phiên bản (kể cả đảo, nối `reverses_entry_id`), `posting_log`, `audit_logs` cùng `correlation_id`, `document_links` hai chiều. Dựng từ khoá có sẵn, như `lineage.service` đã làm cho mặt hàng. SDK: `ctx.documents.trace(docRef)` (chỉ đọc, đúng phạm vi module). Hợp đồng ghi vào `bizcity_document@1` (§7), **không** mở hợp đồng thứ tám | K2 | **P0** |
| **G4** | Phiên bản thiếu người sửa và lý do | Migration (số lấy bằng `node scripts/so-tiep-theo.mjs migration` lúc làm): thêm `created_by text`, `reason text` (NULL được — dữ liệu cũ) vào `accounting_event_versions`; `saveVersion` điền từ `auth.actor` và `reason` nếu cửa nạp gửi (`extra.reason`); cột chỉ thêm, trigger sẵn có vẫn chặn sửa. Thiếu lý do → **warn** `IN-DOC-REASON` (không chặn — tôn chỉ ADR-0020) | K3 (migration) | P1 |
| **G5** | Vai `ledger` của `document_links` không tự ghi | Kernel tự `link(<docRef suy từ docKey>, 'ledger.event:<docKey>', 'ledger')` khi một `docKey` có dạng docRef (`<module>.<loại>:<id>`) lần đầu qua cửa nạp; không cần module tự gọi. **Chưa đo** có bao nhiêu `docKey` của bên tích hợp ngoài đúng dạng này — `accounting_events` không có cột `source_ref` | K2 | P1 |
| **G6** | Khoá chống xoá chứng từ gốc phân hệ | `module check` bắt migration module có `ON DELETE CASCADE` tới bảng chứng từ; chứng từ đã `approved` không `DELETE` (đã có ở hợp đồng STD-DATA-9, kiểm chưa phủ) | K1 | P2 |
| **G7** | Chưa có kiểm tự động cho DOC-01 / DOC-03 / DOC-05 | `DG-DOC-1` bút toán `event_id IS NULL` (mong 0); `DG-DOC-2` mọi `event_version` tồn tại trong `accounting_event_versions` hoặc = `version` hiện hành; `DG-DOC-3` mỗi `docKey` dạng docRef đều có link `ledger`. Phép kiểm tĩnh `SC-DOC-8`: mọi đường ghi bút toán truyền `sourceVersion` (số mã chưa đo) | K1 | P1 |
| **G8** | Lineage chỉ theo mặt hàng, không theo chứng từ | Giữ nguyên `bizcity_lineage@1` (mặt hàng); G3 cho chiều chứng từ; hai cổng dùng chung khoá, không nhân đôi truy vấn | — | — |
| **G9** | Thuật ngữ trùng "truy vết" | `Bàn điều tra / trace` (OpenTelemetry, PHASE-019) ≠ **truy vết chứng từ** (đề bài này). Tên action `core.document.trace` dễ nhầm → đề xuất `core.document.history` / màn "Lịch sử chứng từ" | — | P2 |

## 6. Việc nên làm trước (theo giá trị / rủi ro)

1. **G2 + G3 một PR** — chỉ đọc, không migration, không đổi sổ: sửa lỗi hiển thị sai phiên bản (rủi ro thật cho kế toán đọc lịch sử) và trả lời ngay mọi câu "bút toán nào từ V mấy". Mức K2; cần giữ chỗ + chữ chốt hợp đồng (§7 `bizcity_document@1`).
2. **G7** (ba mã DG + SC) — để "đạt" có số đo; làm cùng 1.
3. **G4** migration (K3, chủ duyệt) → lý do / người sửa từng phiên bản.
4. **G1 / G5** theo đợt chuyển phân hệ (ADR-0024), không kéo vào PR này.

## 7. Câu hỏi cần chủ chốt

| ID | Câu hỏi | Đề xuất |
|---|---|---|
| Q-TR-1 | Tên và chỗ của cổng truy vết: mở rộng `bizcity_document@1` (§7) hay hợp đồng riêng? | Mở rộng `bizcity_document@1` 1.3.0-draft; không thêm hợp đồng thứ tám |
| Q-TR-2 | `GET /documents/:id` đổi khuôn (thêm `versionPayload` theo bút toán) hay giữ nguyên, chỉ thêm route mới? | Giữ nguyên khuôn cũ, thêm trường `payloadVersion` + route mới (tương thích bên tích hợp ngoài) |
| Q-TR-3 | Phiên bản sự việc thiếu "vì sao sửa": bắt buộc hay chỉ nhắc? | Chỉ nhắc (`warn`), đúng ADR-0020 "mặc định cho phép, nhắc khi sai" |
| Q-TR-4 | Phân hệ cũ (`mua-hang`, `ban-hang`…) chưa chuyển module: bắt `saveVersion` ngay hay chờ đợt chuyển? | Chờ đợt chuyển (ADR-0024); chỉ `module check` bắt module mới |

## 8. Không thuộc đánh giá này

Không đổi mã, migration, hợp đồng; không đánh giá Item lineage (đã có `bizcity_lineage@1`, PHASE-025); chưa chạy diagnostics trên CSDL nên số liệu "bao nhiêu bút toán không có `event_id`" **chưa đo** — G7 sinh ra để đo.
