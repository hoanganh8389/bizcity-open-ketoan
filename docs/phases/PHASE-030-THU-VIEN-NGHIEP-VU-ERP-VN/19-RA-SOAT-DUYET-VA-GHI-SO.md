# PHASE-030 · 19 — Rà soát duyệt → ghi sổ, cổng nhận sự việc, cầu nối PHASE-028, golden (ADR-0029)
<!-- [2026-11-06 03:51 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — rà mã thật theo yêu cầu chủ dự án (P0 / P1 của ADR-0029): luồng approve → ledger, đảo thừa, cổng Kernel, liên kết tài liệu chứng từ ↔ PHASE-028; kế hoạch việc, golden T030-DOC-* / T030-AUTH-*, phép kiểm tuyến nguồn → sổ -->

> Tôn chỉ: CANON §0.9 · [ADR-0029](../../adr/ADR-0029-loi-bat-bien-nghiep-vu-linh-hoat.md) · kiến trúc và hướng dẫn dev: [architecture/LOI-BAT-BIEN-NGHIEP-VU-LINH-HOAT.md](../../architecture/LOI-BAT-BIEN-NGHIEP-VU-LINH-HOAT.md).
> Rà trên HEAD nhánh này (dựa `main` d487c73), chỉ đọc. Mọi dòng có tệp:dòng; bốn chỗ then chốt đã đọc lại tận mã (§1).

## 0. Trả lời ngắn

1. **"Duyệt = ghi sổ" đang là luật chung (R-WF-3 cũ) và gắn cứng trong mua hàng.**
   - Đề nghị thanh toán thì đúng hướng mới: ghi sổ lúc **chi**.
   - YAML `ledger: true` hiện chỉ là nhãn để lint; không ai đọc nó để quyết ghi sổ (`packages/platform/src/core/workflow.ts:109-111`, `:172`).
2. **Có đảo thừa thật, nhiều nhất ở mua hàng.**
   - Sửa bất cứ thứ gì trên phiếu đã duyệt đều phải bỏ duyệt.
   - Bỏ duyệt huỷ mọi sự việc, tức đảo **toàn bộ** bút toán; duyệt lại ghi mới toàn bộ.
   - Kernel vốn chỉ đảo phần đổi, nhưng đường này không bao giờ đi qua cơ chế đó.
3. **Cổng Kernel không kiểm phía chứng từ.** Nó không biết chứng từ nguồn đã duyệt chưa, có phải đúng bản đã duyệt không. Cùng phiên bản mà khác nội dung thì bị bỏ qua **im lặng**.
4. **Tài liệu chứng từ và PHASE-028 chưa liên kết**, cả trong mã lẫn tài liệu. Cầu nối chưa có chủ trước ADR-0029 (D-FIN-9 nay giao chủ).

## 1. Luồng có `approve → ledger`

| Luồng | YAML | Điểm ghi sổ thật trong mã | Đúng hướng ADR-0029? |
|---|---|---|---|
| Phiếu mua (`apps/api/src/phan-he/mua-hang/purchase-document.workflow.yaml`) | `approve`, `override`, `unapprove` mang `ledger: true`; dòng 2: *"Duyệt = ghi sổ (R-WF-3)"* | `approveIn` → `postPurchase` → `postDocumentIn(trx, auth, doc, { post: true, force: true })` (`posting.ts:87`) | điểm ghi nhận = duyệt là **hợp lệ** cho phiếu nhập; sai ở đường sửa (§2) |
| Đề nghị thanh toán (`apps/api/src/phan-he/quy/payment-requests/payment-request.workflow.yaml`) | chỉ `pay` mang `ledger: true`; duyệt 1–2 cấp theo `second_level_from` | `pay` → `voucherService.createIn` (`payment-request.routes.ts:255-286`) | ✅ đúng: duyệt ≠ ghi sổ |
| Phiếu kế toán tay | (không YAML) | `updateManualIn` → `eventStore.reverseActive` toàn bộ rồi ghi lại (`packages/kernel/src/modules/vouchers/voucher.service.ts:354`) | sai ở đường sửa (§2 #4) |

Đã đọc lại tận mã:
- `service.ts:102` từ chối sửa phiếu đã duyệt: *"Phiếu đã duyệt: bỏ duyệt rồi mới sửa được"*;
- `service.ts:226` `documentService.cancelIn` cho từng liên kết khi bỏ duyệt;
- `posting.ts:87` `{ post: true, force: true }`;
- `document.service.ts:397-399` cùng phiên bản → `unchanged`, không so nội dung.

## 2. Đảo thừa đang có

| # | Tình huống | Đường gọi | Hậu quả | Theo ADR-0029 |
|---|---|---|---|---|
| 1 | Sửa **bất cứ gì** trên phiếu mua đã duyệt (kể cả ghi chú, số hoá đơn) | `saveIn` từ chối (`service.ts:102`) → `unapproveIn` → `cancelIn` mọi sự việc (`service.ts:226`; `document.service.ts:895-909` đảo hết, gỡ hoá đơn thuế, gỡ phát sinh kho, sự việc `cancelled`) → sửa → `approveIn` → `postDocumentIn` v+1 → không còn bút toán sống để giữ → ghi mới toàn bộ | 2 lần đảo toàn bộ + 1 lần ghi; sổ kho, hoá đơn thuế xoá rồi thêm lại | bản điều chỉnh v+1 → Kernel đảo phần đổi; sửa ghi chú: chỉ cập nhật đầu bút toán, **0** đảo |
| 2 | Phiếu mua kèm phiếu chi (trả trước, thanh toán, chênh lệch đổi hàng, CKTT) | bỏ duyệt huỷ phiếu chi `manual:payment:<số>`; duyệt lại `voucherService.createIn` → **số và docKey mới** (`voucher.service.ts:248-250`) | hở số phiếu chi; chuỗi phiếu chi không phải một docKey có phiên bản (trái R-WF-4) | cùng docKey, phiên bản mới |
| 3 | Đối trừ công nợ làm lúc duyệt | `offset` → `allocateDebt` (`posting.ts:222,229,239`) bị gỡ và làm lại mỗi vòng | nhật ký đối trừ rác | giữ nếu phần công nợ không đổi |
| 4 | Sửa phiếu kế toán tay (chỉ diễn giải) | `updateManualIn` → `reverseActive` toàn bộ (`voucher.service.ts:354`) | đảo hết dù không đổi số | đi `postDocumentIn` phiên bản mới → giữ / cập nhật đầu theo băm |
| 5 | Đề nghị thanh toán đã chi mà phiếu chi bị huỷ | không có chuyển ra khỏi `paid` | đề nghị kẹt `paid`; muốn sửa phải huỷ + lập mới | chuyển `unpay` (yêu cầu huỷ, lý do) về `approved` |
| 6 | Chẩn đoán `EVENT_ENTRIES_STALE` (DG-DOC-3) | bút toán được **giữ đúng** vẫn mang `event_version` cũ (`document.service.ts:179` chỉ cập nhật khi sửa đầu) | báo sai; lời khuyên "định khoản lại ở ACC14" dẫn người dùng đi đảo thừa | ghi `kept_at_version` hoặc nới chẩn đoán |

Không phải đảo thừa nhưng cùng gốc:
- phiếu mua `pending_approval` vẫn sửa được (lệch hợp đồng §5.1), không lưu ảnh chụp hay băm lúc trình, nên người duyệt duyệt nội dung "lúc đó";
- bỏ duyệt phiếu nhập được phép dù có phiếu thanh toán dựa trên nó (`service.ts:224` lọc bỏ `payment`);
- `force` ghi đè cùng phiên bản không lưu bản cũ (`document.service.ts:425` chỉ lưu khi khác phiên bản).

Đã tốt, giữ:
- Kernel chỉ đảo bút toán đổi (`posting.service.ts:168-183`; `document.service.ts:450-473`);
- bản đang chờ (ACC14) bị thay không đảo (`:436-439`);
- phiên bản chỉ tăng (`:394`);
- chữ ký sự việc Kernel tự hết hiệu lực khi phiên bản đổi (`signature.routes.ts:44-48`);
- đề nghị thanh toán: duyệt không chạm sổ.

## 3. Tài liệu chứng từ có liên kết với PHASE-028 không?

**Không**, cả hai chiều. Chỉ PHASE-029 / PHASE-030 trỏ sang PHASE-028 để nói "ai sở hữu"; không tài liệu nào của PHASE-028 nhắc workflow, `bizcity_document@1`, `sod`, `levels`, ngưỡng duyệt.

| Bên | Đang có | Thiếu để nối |
|---|---|---|
| Workflow (`packages/platform/src/core/workflow.ts`) | không import `authz`; `WorkflowActor.can(p)` = `auth.permissions.has(p)` (:72-74); SoD = `doc.createdBy === actor.id` (:167); lỗi `forbidden(msg)` không mã lý do | đầu phiếu đủ trường (chi nhánh, kho, số tiền, ngày, phiên bản); `decide(p, purpose, resource)` trả quyết định; `decisionId` vào bằng chứng; ánh xạ chuyển → `purpose` (`approve` / `operate`) |
| Authorization (`packages/platform/src/core/authz/engine.ts`) | `authorize` / `explain` / `batchAuthorize` / `scopeOf` thuần (W3 đợt 1 đã merge); tài nguyên `AuthzResourceContext` (`types.ts:134-146`); DENY thắng; điều kiện `amount_max`, `status_in`, `creator` | chưa ai gọi (chỉ `apps/api/test/authz-engine.test.ts`); kho vai trò W1 / W2 đang làm (CLAIMS); **không có điều kiện SoD** (`creator` chỉ self / branch / all); `creator: 'branch'` nhận mà không thi hành (:120); D-AUTH-12: điều kiện / relax chưa lưu được tới bước 4 |
| Rủi ro nếu nối vội | chứng từ không mang `branchId` / `warehouseId` → engine coi thuộc **mọi** phạm vi (`engine.ts:71`) → người duyệt kho K1 duyệt được K2 | nạp đầu phiếu từ máy chủ là điều kiện bắt buộc (AUTHZ-11) |

Chia chủ theo ADR-0029 D-FIN-9 (bảng chủ dự án đưa ra):

| Phần | Phase sở hữu | Việc |
|---|---|---|
| Quyền, vai trò, phạm vi, điều kiện | PHASE-028 | `authorize()` trên tài nguyên chứng từ thực; điều kiện SoD; thi hành `creator: 'branch'`; nối `runAction` |
| Phiên bản, Workflow, chữ ký, lịch sử | PHASE-029 / Document Contract | `transition()` dùng quyết định đó; tự `saveVersion`; `decisionId` vào bằng chứng |
| Ghi sổ | Accounting Kernel | chỉ nhận sự việc đủ điều kiện (G1–G5), giữ liên kết phiên bản chứng từ |
| Golden | Conformance (PHASE-030) | chứng minh không vượt quyền, không bỏ qua duyệt, không đứt lịch sử |

Tài liệu này **không** sửa thư mục PHASE-028 / PHASE-029: các thư mục đó đang có dòng giữ chỗ (W1, W2, E2). Đề xuất việc cho hai phase ở §4 để chủ phase nhận vào checklist của mình.

## 4. Kế hoạch theo P0 / P1 của chủ dự án

| Ưu tiên | Việc (lời chủ dự án) | Làm ở đây | Mã việc | Chủ | Trạng thái |
|---|---|---|---|---|---|
| **P0** | Sửa cách diễn đạt R-WF-3: không mặc định "duyệt = ghi sổ"; điểm ghi nhận riêng từng loại | R-WF-3 / R-WF-4 viết lại; CANON §0.9; `framework/03-MO-RONG.md` | S030-22 | tài liệu (PR này) | ✅ trong PR này |
| **P0** | Rà workflow có `approve → ledger`, đặc biệt `purchase-document.workflow.yaml`; tránh huỷ / ghi lại khi chỉ sửa nội dung chưa ghi nhận | §1–§2; đề xuất: (a) phiếu mua đã duyệt sửa qua **bản điều chỉnh** gọi `postDocumentIn` phiên bản mới (không `cancelIn`); (b) phiếu chi kèm theo giữ docKey; (c) `pending_approval` khoá sửa, rút về nháp mới sửa; (d) `updateManualIn` dùng đường phiên bản của Kernel; (e) chuyển `unpay` cho đề nghị thanh toán | S030-23 | mua hàng / quỹ (sửa khi chuyển sang `modules/`, ADR-0024); (d) Kernel | ☐ đề xuất |
| **P0** | Tăng cường Gate: chỉ nhận phiên bản đạt workflow, hash, chính sách, điều kiện ghi nhận | thiết kế G1–G5 ([kiến trúc §6](../../architecture/LOI-BAT-BIEN-NGHIEP-VU-LINH-HOAT.md)); **làm trước được ngay**: G5 (cùng phiên bản khác băm → `CONFLICT` có mã; `force` lưu bản cũ) vì chỉ chạm Kernel. G1 / G2 cần trường `source` trong `bizcity_ledger_intake@1` (thêm, tuỳ chọn) | S030-24 | Kernel (nhóm Lõi, K2) + hợp đồng nạp sổ | ☐ đề xuất |
| P1 | Approval Freeze / Accounting Freeze bằng SDK sẵn có | R-WF-13 / -14; dùng `saveVersion` (băm), `document_signatures` (gắn phiên bản), `accounting_event_versions`, `posting_log`, `document_links` role `ledger` | S030-20 (gộp vào chuẩn chứng từ 16) | Document Contract | ⛔ nhóm Lõi duyệt |
| P1 | Golden: duyệt, từ chối, sửa trước / sau ghi sổ, đổi chính sách, chạy lại, đồng thời | §5 | S030-25 | Conformance (PHASE-030) | ☐ |
| P1 | Dùng lại `document_versions`, `document_links`, `accounting_event_versions`, `posting_log` để kiểm tuyến nguồn → sổ | §6 | S030-26 | C6 Continuity | ☐ |
| P1 | Cầu nối Document Workflow ↔ PHASE-028 | §3 | S030-27 (theo dõi; việc thật thuộc PHASE-028 + PHASE-029) | PHASE-028, PHASE-029 | ⛔ chủ hai phase nhận |

## 5. Golden mới (thêm vào [60 §5](60-GOLDEN-TESTS.md))

Đếm bằng bất biến sổ, không đọc bảng module ([60 §1](60-GOLDEN-TESTS.md)). Ký hiệu "đảo" = số bút toán `is_reversal = true` sinh ra.

| Mã | Cho – khi – thì |
|---|---|
| T030-DOC-1 | Loại có điểm ghi nhận = `pay`: duyệt 2 cấp → **0 bút toán**; chi → đúng 1 sự việc. Loại "không bao giờ" (đơn đặt): đi hết vòng đời → 0 sự việc |
| T030-DOC-2 | Trình v1 → sửa thành v2 khi đang chờ → quyết định duyệt cũ không còn hiệu lực, phải trình lại; duyệt v2 → sự việc mang `source.version = 2`, băm khớp |
| T030-DOC-3 | Sửa nhiều lần trước ghi nhận (nháp, chờ, đã duyệt chưa chi): **0 đảo**, `accounting_events` không có dòng |
| T030-DOC-4 | Sau ghi nhận: điều chỉnh v4, sửa 3 lần, duyệt điều chỉnh → **đúng 1** lần nộp; số đảo = số bút toán có băm đổi; sửa chỉ diễn giải → 0 đảo |
| T030-DOC-5 | Cổng: nộp cùng `version` khác nội dung → `CONFLICT` có mã, sổ không đổi; `source.contentHash` ≠ băm bản đã duyệt → bể chờ có mã |
| T030-DOC-6 | Đổi chính sách (ngưỡng duyệt từ 50 tr lên 100 tr, hiệu lực ngày D): chứng từ đã trình trước D giữ số cấp cũ; trình sau D dùng số cấp mới |
| T030-DOC-7 | POS tự xác nhận (`system:pos`) khi chính sách cho phép → ghi sổ, có bằng chứng; tắt chính sách → giữ chờ, không ghi |
| T030-DOC-8 | Chạy lại (cùng idempotency key) duyệt / chi → 1 sự việc, 1 bằng chứng; không bút toán trùng |
| T030-DOC-9 | Đồng thời: hai người duyệt cùng chứng từ cùng lúc → một thành công, một `CONFLICT`; một sự việc |
| T030-AUTH-1 | Người có quyền duyệt phạm vi kho K1: duyệt phiếu K1 được; phiếu K2 → `FORBIDDEN` kèm lý do phạm vi |
| T030-AUTH-2 | Thu hồi quyền duyệt (tăng `authz_version`) → lần duyệt tiếp theo bị từ chối, kể cả phiên đang mở |
| T030-AUTH-3 | SoD: người lập không tự duyệt; người duyệt cấp 1 không duyệt cấp 2 khi chính sách bắt khác người |
| T030-AUTH-4 | Chứng từ đổi nội dung → chữ ký cũ `valid: false` cho phiên bản mới; ký lại mới hợp lệ |
| T030-AUTH-5 | Mọi chuyển có `decisionId` trong bằng chứng; `explain` tái hiện được lý do cho / từ chối |

Tổng tăng từ 73 lên **87** ca (T030-DOC-1..9, T030-AUTH-1..5). Ca AUTH-1 / -2 chạy được sau khi PHASE-028 W1 / W2 merge và cầu nối có; trước đó là `it.todo`.

## 6. Kiểm tuyến nguồn → sổ trên bảng sẵn có (S030-26)

Không thêm bảng (D028-13). Chỉ thêm một chẩn đoán đọc, mã đề xuất `DG-DOC-CHAIN-*`:

| Mã | Kiểm | Từ bảng |
|---|---|---|
| DG-DOC-CHAIN-1 | mọi sự việc của module có liên kết `ledger` từ `docRef` nguồn | `document_links` ↔ `accounting_events.doc_key` |
| DG-DOC-CHAIN-2 | phiên bản sự việc đã ghi sổ có băm khớp phiên bản chứng từ đã duyệt | `accounting_event_versions` (băm tính khi đọc, như `document-history.service.ts:123`) ↔ `document_versions.content_hash` |
| DG-DOC-CHAIN-3 | mỗi lần ghi / ghi lại có `policy_version` và trỏ đúng phiên bản sự việc | `posting_log` |
| DG-DOC-CHAIN-4 | không bút toán của sự việc có nguồn còn ở nhóm `draft` / `pending` | trạng thái chứng từ nguồn ↔ `ledger_entries` |
| DG-DOC-CHAIN-5 | số đảo trên mỗi docKey không vượt số lần điều chỉnh / huỷ đã duyệt (phát hiện đảo thừa kiểu §2 #1) | `ledger_entries.reverses_entry_id` ↔ lịch sử trạng thái |

Hôm nay mua hàng và đề nghị thanh toán **chưa** gọi `saveVersion` và **chưa** ghi `document_links` role `ledger` (mua hàng giữ cột JSON `purchase_documents.links`). Vì vậy CHAIN-1 / -2 chỉ chạy được trên module dựng bằng `defineDocument`. Với phân hệ cũ, chúng ghi "chưa có năng lực", không ghi "đạt".

## 7. Câu chữ "duyệt = ghi sổ" còn trong repo

Theo dõi để sửa cùng S030-23. Không sửa mã trong PR tài liệu này:

| Nơi | Ghi chú |
|---|---|
| `apps/api/src/phan-he/mua-hang/purchase-document.workflow.yaml:2`, `service.ts:155`, `routes.ts:183` | đúng cho phiếu mua (điểm ghi nhận = duyệt), nên ghi "Điểm ghi nhận: duyệt (R-WF-3)" |
| `apps/web/src/phan-he/mua-hang/chung-tu/PhieuMuaForm.tsx:8,634,1192`, `csdl/CsdlPage.tsx:61,304`, `NhatKyMuaPage.tsx:31`, `LichSu.tsx:12` | giao diện mua hàng |
| `docs/api/14-mua-hang.md:12,35`, `docs/huong-dan/mua-hang-chung-tu.md:13`, `mua-hang-csdl.md:7` | mô tả mua hàng — đúng nghĩa, giữ |
| `docs/contracts/BIZCITY-CONNECTOR-v1.md:39` (C-2), `docs/rules/RULE-EVENT.md:57` | nói về hệ nguồn / `opts.post` — đọc theo R-WF-3 mới, không đổi nghĩa |
| `docs/framework/03-MO-RONG.md:38` | ✅ đã sửa trong PR này |
