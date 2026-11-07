# PHASE-031 · 00 — Master plan
<!-- [2026-11-07 09:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chủ dự án chốt tài liệu + bản mẫu ("ok, chốt mockup và tài liệu này, merge về main để code"); D031-11: Policy Registry là năng lực Core / Platform, không module nghiệp vụ riêng; màn chung ở Hệ thống → Chính sách -->
<!-- [2026-11-07 08:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chủ dự án trả Q031-1..3: Policy Registry là trụ cột nền móng ngang MDG; L4b mặc định cảnh báo, POS tự động; online gọi endpoint, offline viết lại theo bản mô tả JSON ánh xạ từ Registry; ba yếu tố nhất quán cross-module · xuyên suốt · truy vết -->
<!-- [2026-11-06 09:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — vì sao, D031-1..10 (ánh xạ D-POL-1..10 của ADR-0031), Q031-1..6, đợt W0–W4, ai làm gì -->

## 1. Vì sao

ADR-0029 nói *linh hoạt trước khi ghi sổ* và đặt tầng ① là chính sách nghiệp vụ, nhưng tầng đó chưa có chủ và chưa có hình (rà mã: [README · Hiện trạng](README.md#hiện-trạng-đọc-mã-originmain-c8afd39-2026-11-06)):

1. **Mua hàng có engine tốt nhưng không có lịch sử luật.** Chính sách sửa đè; chứng từ cũ chỉ trỏ theo mã, nên không trả lời được *"phiếu tháng 9 áp bản nào của chiết khấu NCC X"*. `data.frozen` giữ được **số**, không giữ được **luật**.
2. **Bán hàng không có luật nào ở Core.** POS / Woo tự tính khuyến mại, Kernel nhận dòng `isGift` giá 0 mà không biết căn cứ. Mỗi kênh một bộ luật.
3. **Không tầng nào kiểm "đúng chính sách chưa".** Conformance Engine tư vấn cấp đơn vị theo luật pháp; tiền kiểm L1–L5 kiểm khuôn, số học, dữ liệu gốc, nghiệp vụ chung, chạy thử định khoản. Chính sách nghiệp vụ nằm ngoài cả hai.
4. **Trụ cột 05 mới có nửa *Configuration*.**

## 2. Nguyên tắc (chủ dự án, 06/11)

- Chính sách **quản trị tập trung** ở module nghiệp vụ (Mua hàng, Bán hàng, Nhân sự…), xoay quanh lõi kế toán.
- **Không bắt buộc tính toán tập trung**: plugin tính theo bản đã phát hành.
- Plugin gửi sự kiện về theo luồng **event driven**; cửa nạp **kiểm lại** rồi ghi sổ.
- Xử lý **mềm**: giúp kế toán đánh giá sự kiện đã ổn chưa; gợi ý hay tự động đều được.
- Conformance Engine hiện có **không** biến thành nơi chặn giao dịch hay tự ghi sổ.
- **Không hai kho chính sách**: module sở hữu dữ liệu, Registry là bề mặt chung.

## 3. Quyết định (D031-*, chủ dự án chốt 2026-11-07)

Chi tiết và lý do ở [ADR-0031](../../adr/ADR-0031-policy-registry-rule-contracts.md); thiết kế ở [10](10-THIET-KE.md).

| Mã | ADR | Tóm tắt |
|---|---|---|
| D031-1 | D-POL-1 | Quản trị tập trung, tính phân tán, kiểm chứng tại cửa nạp |
| D031-2 | D-POL-2 | Module giữ nội dung, Registry giữ phong bì (`store: module · settings · inline`) |
| D031-3 | D-POL-3 | Rule Contract = lược đồ tham số + hàm tính tất định + phép kiểm `POL-*` + `reasonCode`; tách từ engine mua hàng |
| D031-4 | D-POL-4 | `draft → published → retired`; bản đã phát hành không sửa; trần pháp lý chặn lúc **phát hành**, không lúc bán |
| D031-5 | D-POL-5 | `bizcity_ledger_intake@1` 1.6.0: `policyRefs[]` đầu phiếu, `policyRef` dòng, tuỳ chọn |
| D031-6 | D-POL-6 | Tầng L4b trong tiền kiểm; mặc định `warn`; `hold` khi thiếu cách ghi nhận hoặc đơn vị chọn nghiêm; không `block` |
| D031-7 | D-POL-7 | Bút toán dự kiến = L5 chạy thử sẵn có; Commit Guard thêm băm `policyRefs` |
| D031-8 | D-POL-8 | Conformance Engine thêm rulepack `policy` cấp đơn vị, chỉ đọc |
| D031-9 | D-POL-9 | `GET /api/v1/policies` + sự kiện `policy.published` / `policy.retired` |
| D031-0 | D-POL-0 | Ba yếu tố: nhất quán cross-module · xuyên suốt · truy vết, mỗi yếu tố có tín hiệu đo; luật lean |
| D031-10 | D-POL-10 | Trụ cột **nền móng ngang MDG**: V của `tru-cot.json` lên `nền móng`, 05 của ADR-0028 đổi tên *Policy Registry & Rule Contracts*; khoá cấu hình = chính sách vô hướng; không đánh số lại |
| D031-11 | D-POL-11 | Năng lực Core / Platform, không module nghiệp vụ riêng; màn chung ở *Hệ thống → Chính sách*; chính sách không chủ module → `he-thong`, `store: inline` |

## 4. Câu hỏi (Q031-*)

| Mã | Hỏi ai | Câu hỏi | Đề nghị |
|---|---|---|---|
| Q031-1 | chủ dự án | Trụ cột riêng hay nửa của 05? | ✅ **2026-11-07: trụ cột nền móng ngang MDG** — *"quan trọng không kém master data … giữ chính sách xuyên suốt, liên quan đến định nghĩa nhiều hơn"* → D031-10 |
| Q031-2 | chủ dự án | L4b mặc định `warn`; POS mặc định *tự động*? | ✅ **2026-11-07: đúng** |
| Q031-3 | chủ dự án | Plugin tính lại bằng cách nào? | ✅ **2026-11-07: online gọi `POST /api/v1/policies/evaluate`; offline viết lại hàm theo bản mô tả JSON**, căn cứ chính sách đã phát hành ở Registry ánh xạ sang; golden `T031-RC-*` chung |
| Q031-4 | nhóm Lõi | Phiên bản chính sách mua hàng: bảng `purchase_policy_versions` cạnh `purchase_policies`, hay dồn nội dung vào `inline` của Registry? | **bảng phiên bản tại module** — giữ D031-2, không đổi engine |
| Q031-5 | kế toán trưởng | Bảng `reasonCode` cho từng loại kết quả: tặng kèm bán (XTA1.4), tặng không kèm mua / mẫu (XQUA), chiết khấu thương mại trên hoá đơn vs sau hoá đơn, chiết khấu thanh toán, thưởng doanh số NPP (CKNPP) | xác nhận bảng ở S031-14 trước khi phát hành Rule Contract bán hàng |
| Q031-6 | nhóm Lõi | `policy.resolve(ref, at)` cho Kernel đọc nội dung chính sách qua Platform: chấp nhận hướng phụ thuộc Kernel → Platform registry (chỉ đọc)? | đồng ý nếu đi qua cổng đọc `bizcity_read` (ADR-0026), Kernel không đọc bảng module |

## 5. Các đợt

| Đợt | Mức | Nội dung | Phụ thuộc |
|---|---|---|---|
| **W0** | K0 | ADR-0031 đề xuất, README, 10 thiết kế, checklist (tài liệu này) | — |
| **W1** small win | K1 | Phong bì Registry (migration + `policies.register / publish / resolve`); phiên bản + băm cho chính sách mua hàng; `policyTrace` ghi `code@version#hash`; golden không sửa bản đã phát hành | Q031-4; dòng CLAIMS |
| **W2** | K2 | `bizcity_ledger_intake@1` 1.6.0 `policyRefs`; cột `policy_refs` / `policy_check` + khung nhìn `policy_application`, nhánh `policy_review` của hàng việc ([20](20-TRUY-VET-VA-THEO-DOI.md)); tầng L4b trong `preflight.ts`; Commit Guard; mã `POL-*` vào `bizcity_findings@1`; `GateResult.ruleVersion`; Rule Contract `purchase.*@1` bọc engine mua hàng | W1; PR chốt thiết kế (đụng cửa nạp, dùng chung) |
| **W3** | K1 | `GET /api/v1/policies`, `POST /api/v1/policies/evaluate`, bản mô tả JSON của Rule Contract, `policy.published` / `.retired`; Rule Contract bán hàng (`sale.price_list@1`, `sale.promo.*@1`, `sale.credit_limit@1`) đi cùng `modules/ban-hang` (S030-16); POS WP đổi sang dùng chính sách phát hành | W2; Q031-3, Q031-5 |
| **W4** | K1 | Rulepack `policy` cho Conformance Engine; màn *Chính sách*, *Truy vết*, *Theo dõi thực hiện* theo [bản mẫu](mockups/chinh-sach.html) ([20](20-TRUY-VET-VA-THEO-DOI.md)); làn `policy` của `bizcity_lineage@1`; `nen-mong.json` trụ cột 05 nửa Policy | W3 |

## 6. Ai làm gì

| Vai | Làm | Không làm |
|---|---|---|
| Module (Bán hàng, Mua hàng, Nhân sự) | lập, giữ nội dung, phát hành chính sách; chọn Rule Contract; tính cho chứng từ nội bộ | tự viết luật định khoản; tự chặn ghi sổ |
| Policy Registry (Platform) | phong bì, phiên bản, hiệu lực, băm, phát hành, phân phối, `resolve` | giữ bản sao nội dung của module |
| Rule Contracts (`packages/contracts`) | khuôn, hàm tính tất định, phép kiểm, `reasonCode` | số tài khoản |
| Plugin ngoài (POS WP, Woo, sàn) | tải bản `published`, tính tại chỗ, gửi `policyRefs` | tự định nghĩa luật cho nghiệp vụ đã có chính sách |
| Intake Gate (L4b, L5) | kiểm sự việc theo bản hiệu lực, ra `GateResult`, bút toán dự kiến | sửa sự việc; chặn bán |
| Accounting Kernel | Posting Rules, ghi sổ, lưu `policyRefs` trong phiên bản sự việc | đọc bảng module |
| Conformance Engine | tư vấn cấp đơn vị trên Registry + sổ | chặn giao dịch, ghi sổ |
| Kế toán | xem hàng việc lệch, chọn ghi / trả về; chọn mức nghiêm | — |

## 7. Chữ chốt W1 (K1, Platform + Mua hàng; R-FLOW-2)
<!-- [2026-11-07 09:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chữ chốt W1 trước khi code: migration 0079, core/policies.ts, phiên bản chính sách mua hàng; Q031-4 theo đề nghị (bảng phiên bản tại module); không đụng db/types.ts (withTables) và schema-catalog.ts (đang có dòng giữ chỗ khác) -->

Phạm vi: S031-4, S031-5, S031-6 (+ golden T031-REG-1, T031-TR-2, T031-MH-1). **Q031-4 chọn theo đề nghị** — bảng phiên bản ở module mua hàng, engine không đổi khuôn; nhóm Lõi đổi ý thì sửa ở PR code trước khi merge.

**Migration `0079_so_dang_ky_chinh_sach.sql`** (số lấy bằng `scripts/so-tiep-theo.mjs`):

| Bảng | Cột chính | Luật |
|---|---|---|
| `policy_registry` (phong bì, [10 §2](10-THIET-KE.md)) | `id` bigserial · `tenant_id` · `policy_key` (mã hiển thị) · `policy_id` text (định danh ổn định, mua hàng = `mua-hang:purchase_policies:<id>`) · `version` int · `owner_module` · `rule_contract` (`purchase.<kind>@1`) · `scope` jsonb · `effective_from` / `effective_to` date (hiệu lực **của bản** theo ngày chứng từ; `NULL` = từ đầu / chưa đóng) · `status` (`published` · `retired`) · `store` (`module` · `settings` · `inline`) · `store_ref` · `content_hash` · `legal_ref` · `published_by` / `published_at` · `reason` · `findings` jsonb | `UNIQUE (tenant_id, policy_id, version)`; RLS `bizcity_tenant_visible` như 0074; trigger: chặn `DELETE`; `UPDATE` chỉ cho `status` `published → retired` và `effective_to` `NULL → ngày` (đóng bản cũ) — mọi cột khác bất biến |
| `purchase_policy_versions` | `tenant_id` · `policy_id` bigint (id `purchase_policies`, **không FK** để lịch sử còn khi xoá chính sách chưa dùng) · `version` · `effective_from` date · `snapshot` jsonb (`code, kind, name, scope, rule, validFrom, validTo, priority, isActive`) · `content_hash` · `created_by` / `created_at` · `reason` | `UNIQUE (tenant_id, policy_id, version)`; chỉ thêm (trigger chặn `UPDATE` / `DELETE`); RLS |
| `purchase_policies` | thêm `version int NOT NULL DEFAULT 1`, `content_hash text` | dòng vẫn là **bản hiện hành** cho engine |

Nạp ngược: mỗi chính sách đang có → `purchase_policy_versions` bản 1 (`effective_from NULL`) + một dòng `policy_registry` `published`. Bảng mới khai bằng `withTables` (mẫu `org-unit.schemas.ts`), **không** sửa `packages/platform/src/db/types.ts`; ~~chưa khai `schema-catalog.ts`~~ → **đính chính 2026-11-07:** test `apps/api/test/db-rules.test.ts` đòi mọi bảng có nhóm trong `schema-catalog.ts`, nên W1 **chỉ thêm** hai khoá `policy_registry`, `purchase_policy_versions`; tệp thuộc dòng giữ chỗ khác, chủ dự án cho phép dùng chung. <!-- [2026-11-07 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — đính chính chữ chốt W1: schema-catalog bắt buộc (db-rules), chủ dự án cho thêm 2 khoá -->

**`packages/platform/src/core/policies.ts`** (tệp mới, nhập bằng `@bizcity/platform/core/policies`):

```ts
registerPolicyVersion(trx, { tenantId, ownerModule, policyKey, policyId, version, ruleContract, scope, effectiveFrom, store, storeRef, content, actor, reason, legalRef? })
  // băm content bằng contentHash() của core/documents.ts; đóng bản trước: effective_to = effectiveFrom − 1 ngày; cùng giao dịch
resolvePolicy(trx, tenantId, policyId, at) → envelope | undefined     // đúng một bản phủ ngày at (T031-TR-2)
listPolicyVersions(trx, tenantId, policyId) → envelope[]
retirePolicy(trx, tenantId, policyId, actor, reason)
```

**Mua hàng:**
- `savePolicy`: băm nội dung; khác băm bản hiện hành → `version + 1`, ghi `purchase_policy_versions` + `registerPolicyVersion` trong cùng giao dịch; giống băm → không tạo bản. Đầu vào thêm tuỳ chọn `effectiveFrom` (*"áp cho chứng từ từ ngày"*, mặc định hôm nay) và `reason`. `effectiveFrom` sớm hơn bản hiện hành → `VALIDATION_ERROR` (không viết lại quá khứ).
- `listPolicies` gắn `versions[]` (một truy vấn). Engine thêm hàm thuần `policyAt(p, date)`; `computeDoc` đổi chính sách về bản của `doc.date` ở đầu hàm. `TraceItem` thêm `version`, `hash` → `policyTrace` ghi `{ policy, kind, text, version, hash }` (giữ `policy` = mã để kiểm xoá hiện có vẫn đúng). Các nơi khác gọi engine không đổi.
- `deletePolicy` (chỉ khi chưa áp) → `retirePolicy`; bản lịch sử giữ.
- Route đọc `GET /api/v1/purchase/policies/:id/versions` (quyền đọc mua hàng).
- Giao diện: tab *Phiên bản* ở chi tiết chính sách; ô *Áp từ ngày* + *Lý do* ở form; vết chính sách trên phiếu hiện `mã@bản`.

**Bảng lớp:** `core/policies.ts` là tệp mới của Platform nên thêm **một dòng** `['core/policies.ts', 'P', 'bizcity.config']` vào `tests/conformance/lib/layers.mjs` (SC-LAYER-1), cùng lớp / đích với `core/settings.ts` — theo khuôn đã chốt, không đổi luật lớp (RULE-MODULE-BOUNDARY giữ nguyên). <!-- [2026-11-07 10:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — bổ sung phạm vi W1: layers.mjs (SC-LAYER-1 đòi dòng cho tệp mới) -->

**Golden:** T031-REG-1 (sửa bản `published` → trigger chặn), T031-TR-2 (mọi ngày đúng một bản, đổi bản không khoảng trống), T031-MH-1 (đổi chiết khấu NCC từ 16/11: phiếu ngày 15/11 tính lại ra số cũ, `policyTrace` trỏ bản cũ; phiếu 16/11 ra số mới).

## 8. Chữ chốt W2a (K2, cửa nạp nhận tham chiếu chính sách; S031-8, R-FLOW-2)
<!-- [2026-11-07 10:32 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chữ chốt W2a: bizcity_ledger_intake@1 1.6.0-draft (policyRefs), IN-POL-001..003 (L4, warn, advice), cột policy_check, khoá bizcity.intake.policy_check (advice | strict → hold), Commit Guard băm tham chiếu, mua hàng nộp kèm tham chiếu, khung nhìn policy_application + nhánh hàng việc; W2b (tính lại theo Rule Contract) sau W3 -->

**Chia nhỏ W2 cho gọn.** W2a chỉ kiểm **tham chiếu** (có trong sổ đăng ký, băm khớp, hiệu lực tại ngày chứng từ, có bản mới hơn chưa) — đủ cho truy vết và cho POS gửi đúng bản. **W2b** (`IN-POL-004` tính lại khác nguồn, `IN-POL-005` thiếu dữ liệu gốc của kết quả, `IN-POL-000` nghiệp vụ có chính sách mà không gửi tham chiếu) cần Rule Contract bán hàng chạy được, nên đi sau W3. Phụ thuộc: W1 (#152, migration 0079, `core/policies.ts`) merge trước.

**1. Hợp đồng `bizcity_ledger_intake@1` 1.6.0-draft (minor, chỉ thêm trường tuỳ chọn)** — [BIZCITY-LEDGER-INTAKE-v1 §3.1](../../contracts/BIZCITY-LEDGER-INTAKE-v1.md):
- đầu phiếu `policyRefs?: { key, version, hash, policyId? }[]` (≤ 50); dòng hàng `policyRef?: { key, version, line? }`;
- `key` = mã chính sách (`policy_registry.policy_key`), `version` ≥ 1, `hash` 64 hex; `policyId` khi nguồn biết định danh (`mua-hang:purchase_policies:42`); `line` = vai của dòng trong kết quả (`gift`, `discount`…), chỉ để đọc;
- dòng có `policyRef` mà `key` không có trong `policyRefs` → `VALIDATION_ERROR` (L1, `IN-SHAPE-001` có đường dẫn);
- lưu nguyên văn trong `payload` như mọi trường khác — **không thêm cột tham chiếu** (sửa [20 §2](20-TRUY-VET-VA-THEO-DOI.md): `accounting_events.payload` / `accounting_event_versions.payload` đã giữ đúng bản đã gửi).

**2. Tầng L4b trong tiền kiểm và cửa nạp** — hàm thuần mới `packages/kernel/src/modules/intake/policy-check.ts` `policyFindings(trx, tenantId, doc)`, gọi ở cả `preflight.ts` (L4) và `postDocumentIn` (một chỗ luật, R-INTAKE-4). Kernel đọc sổ đăng ký qua `resolvePolicy` / `listPolicyVersions` của `@bizcity/platform/core/policies` (Kernel → Platform đúng chiều SC-LAYER-2; **trả Q031-6**: không cần khung nhìn riêng, Kernel không đọc bảng module).

| Mã (`bizcity_intake_findings@1` 0.9.0-draft) | Tầng | Mức | Stage | Trọng số | Khi nào |
|---|---|---|---|---|---|
| `IN-POL-001` | L4 | warn | advice | 10 | `key` / `policyId` không có trong sổ đăng ký, hoặc `hash` khác `content_hash` của bản `version` |
| `IN-POL-002` | L4 | warn | advice | 10 | bản `version` không phủ `docDate` (trước ngày áp, sau ngày đóng, hoặc khoảng rỗng) |
| `IN-POL-003` | L4 | warn | advice | 5 | bản gửi vẫn hợp lệ nhưng sổ đăng ký đã có bản mới hơn phủ `docDate` (nguồn ngoại tuyến dùng bản cũ) |

Cả ba `acceptable: true` — kế toán trưởng chấp nhận có lý do bằng đường sẵn có của bể chờ (= nút *Đánh dấu đã xem* của [20 §3](20-TRUY-VET-VA-THEO-DOI.md)). Thiếu lý do định khoản cho kết quả **không** thêm mã: `IN-POST-001` đã có. Mỗi mã có bài học `docs/huong-dan/loi-dau-vao/IN-POL-00n.md`, căn cứ ở `legal-basis.ts` (`NOI-BO` + ADR-0031) — tệp này đang thuộc dòng giữ chỗ S030-45, W2a **chỉ thêm** ba khoá (đề nghị dùng chung, chủ dự án duyệt cùng PR này), remedy theo `bizcity_remedy@1`.

**3. Khoá cấu hình `bizcity.intake.policy_check`** (registry, `enum(advice|strict)`, mặc định `advice`, loại A, owner `core`): `advice` = ghi sổ như thường, mã `IN-POL-*` lưu kèm để xem lại (chế độ *tự động*, mặc định cho mọi đơn vị và POS — Q031-2); `strict` = có `IN-POL-*` thì cửa nạp nhận sự việc nhưng **giữ chờ duyệt** bằng `hold` sẵn có của `postDocumentIn` (màn chờ ACC14), kế toán duyệt mới ghi (chế độ *gợi ý*). Không trạng thái mới.

**4. Lưu kết quả kiểm** — migration `0080_kiem_chinh_sach_su_viec.sql` (số nối sau 0079 của W1; kiểm lại bằng `so-tiep-theo kiem` trước khi merge):
- `accounting_events.policy_check jsonb` và `accounting_event_versions.policy_check jsonb` (NULL = sự việc không có `policyRefs`): `{ checkedAt, findings: IntakeFinding[], refs: [{ key, version, policyId, ok }] }`; `archiveVersion` cất kèm;
- khung nhìn chỉ đọc `bizcity_read.policy_application` (`security_invoker`, trigger chỉ đọc như 0076): bung `payload->'policyRefs'` + `policy_check` của bản hiện hành và các bản cũ → `tenant_id, policy_key, version, policy_id, event_id, doc_key, doc_version, doc_date, branch_id, source_system, codes[], posted`;
- nhánh `UNION` `source = 'policy_review'` trong `bizcity_read.document_queue` (0076): sự việc `posted` có `IN-POL-*` chưa chấp nhận (chế độ `advice`); sự việc chờ duyệt vì `strict` đã hiện ở nhánh `accounting_event` sẵn có.

**5. Commit Guard** — `guard.ts` thêm vào dấu cấu hình: băm của các phong bì `policy_registry` mà `policyRefs` trỏ tới (bản + `effective_to` + `status`). Chính sách đổi giữa *Kiểm thử* và *Nộp* → `IN-GUARD-001` như đổi cấu hình.

**6. Mua hàng nộp kèm tham chiếu** — `apps/api/src/phan-he/mua-hang/posting.ts`: dựng `policyRefs` từ `policyTrace` của phiếu (mỗi `policy@version` một mục, `policyId = mua-hang:purchase_policies:<id>`, `hash`). Vết không có bản (phiếu cũ trước W1) thì bỏ qua, không đoán.

**Golden W2a:** T031-INT-1 (đúng bản → không `IN-POL-*`, `policy_check` lưu, khung nhìn thấy), T031-INT-3 (bản 2 khi bản 3 đã hiệu lực tại ngày → `IN-POL-003`), T031-INT-5 (băm sai → `IN-POL-001`), T031-INT-6 (chính sách đổi giữa kiểm thử và nộp → `IN-GUARD-001`), T031-INT-7 (không `policyRefs` → như hôm nay, `policy_check` NULL), mới **T031-INT-8** (`strict` + `IN-POL-002` → sự việc chờ duyệt, không bút toán; duyệt → ghi), **T031-INT-9** (phiếu mua hàng duyệt → sự việc mang `policyRefs` đúng bản + băm của `policyTrace`). Cặp tiền kiểm ⇔ cửa nạp (R-INTAKE-4): cùng mã `IN-POL-*` ở cả hai đường.
