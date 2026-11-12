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
| `IN-POL-001` | L4 | warn | advice | 10 | `key` / `policyId` không có trong sổ đăng ký, hoặc `hash` khác `content_hash` của bản `version`, hoặc dòng trỏ `key` không khai ở `policyRefs` |
| `IN-POL-002` | L4 | warn | advice | 10 | bản `version` không phủ `docDate` và không bản nào mới hơn phủ (chưa áp / khoảng rỗng) — *đã đính chính, xem cuối mục* |
| `IN-POL-003` | L4 | warn | advice | 5 | bản `version` không phủ `docDate` nhưng có bản mới hơn phủ (nguồn ngoại tuyến dùng bản cũ) — *đã đính chính* |

Cả ba `acceptable: true` — kế toán trưởng chấp nhận có lý do bằng đường sẵn có của bể chờ (= nút *Đánh dấu đã xem* của [20 §3](20-TRUY-VET-VA-THEO-DOI.md)). Thiếu lý do định khoản cho kết quả **không** thêm mã: `IN-POST-001` đã có. Mỗi mã có bài học `docs/huong-dan/loi-dau-vao/IN-POL-00n.md`, căn cứ ở `legal-basis.ts` (`NOI-BO` + ADR-0031) — tệp này đang thuộc dòng giữ chỗ S030-45, W2a **chỉ thêm** ba khoá (đề nghị dùng chung, chủ dự án duyệt cùng PR này), remedy theo `bizcity_remedy@1`.

**3. Khoá cấu hình `bizcity.intake.policy_check`** (registry, `enum(advice|strict)`, mặc định `advice`, loại A, owner `core`): `advice` = ghi sổ như thường, mã `IN-POL-*` lưu kèm để xem lại (chế độ *tự động*, mặc định cho mọi đơn vị và POS — Q031-2); `strict` = có `IN-POL-*` thì cửa nạp nhận sự việc nhưng **giữ chờ duyệt** bằng `hold` sẵn có của `postDocumentIn` (màn chờ ACC14), kế toán duyệt mới ghi (chế độ *gợi ý*). Không trạng thái mới.

**4. Lưu kết quả kiểm** — migration `0080_kiem_chinh_sach_su_viec.sql` (số nối sau 0079 của W1; kiểm lại bằng `so-tiep-theo kiem` trước khi merge):
- `accounting_events.policy_check jsonb` và `accounting_event_versions.policy_check jsonb` (NULL = sự việc không có `policyRefs`): `{ checkedAt, findings: IntakeFinding[], refs: [{ key, version, policyId, ok }] }`; `archiveVersion` cất kèm;
- khung nhìn chỉ đọc `bizcity_read.policy_application` (`security_invoker`, trigger chỉ đọc như 0076): bung `payload->'policyRefs'` + `policy_check` của bản hiện hành và các bản cũ → `tenant_id, policy_key, version, policy_id, event_id, doc_key, doc_version, doc_date, branch_id, source_system, codes[], posted`;
- nhánh `UNION` `source = 'policy_review'` trong `bizcity_read.document_queue` (0076): sự việc `posted` có `IN-POL-*` chưa chấp nhận (chế độ `advice`); sự việc chờ duyệt vì `strict` đã hiện ở nhánh `accounting_event` sẵn có.

**5. Commit Guard** — `guard.ts` thêm vào dấu cấu hình: băm của các phong bì `policy_registry` mà `policyRefs` trỏ tới (bản + `effective_to` + `status`). Chính sách đổi giữa *Kiểm thử* và *Nộp* → `IN-GUARD-001` như đổi cấu hình.

**6. Mua hàng nộp kèm tham chiếu** — `apps/api/src/phan-he/mua-hang/posting.ts`: dựng `policyRefs` từ `policyTrace` của phiếu (mỗi `policy@version` một mục, `policyId = mua-hang:purchase_policies:<id>`, `hash`). Vết không có bản (phiếu cũ trước W1) thì bỏ qua, không đoán.

**Golden W2a:** T031-INT-1 (đúng bản → không `IN-POL-*`, `policy_check` lưu, khung nhìn thấy), T031-INT-3 (bản 2 khi bản 3 đã hiệu lực tại ngày → `IN-POL-003`), T031-INT-5 (băm sai → `IN-POL-001`), T031-INT-6 (chính sách đổi giữa kiểm thử và nộp → `IN-GUARD-001`), T031-INT-7 (không `policyRefs` → như hôm nay, `policy_check` NULL), mới **T031-INT-8** (`strict` + `IN-POL-002` → sự việc chờ duyệt, không bút toán; duyệt → ghi), **T031-INT-9** (phiếu mua hàng duyệt → sự việc mang `policyRefs` đúng bản + băm của `policyTrace`). Cặp tiền kiểm ⇔ cửa nạp (R-INTAKE-4): cùng mã `IN-POL-*` ở cả hai đường.

**Đính chính khi viết mã W2a ([2026-11-08 01:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-031):**
- **IN-POL-002 / 003 loại trừ nhau.** Bản chữ chốt đầu để 003 = "bản hợp lệ nhưng có bản mới hơn phủ cùng ngày" — không bao giờ xảy ra vì sổ đăng ký bảo đảm mỗi ngày đúng một bản (T031-TR-2); phát hiện nhờ ca kiểm T031-INT-3 đỏ. Định nghĩa đúng: bản gửi **không phủ** ngày chứng từ; có bản mới hơn phủ ngày đó → **003** (nguồn dùng bản cũ, làm mới); không bản nào phủ → **002** (chưa áp / khoảng rỗng: sai ngày hoặc sai bản).
- **Kiểm tham chiếu chéo dòng ↔ phiếu ở Kernel, không ở zod** (union phân biệt cần ZodObject): dòng trỏ key không khai ở `policyRefs` → `IN-POL-001` đường dẫn `lines[i].policyRef.key`.
- **S031-22 (nhánh hàng việc `policy_review`) tách khỏi W2a.** Hàng việc cần cờ mới + nguồn mới ở `queue.routes.ts` (`QUEUE_SOURCES`, bảng quyền, nhãn) và một action *Đánh dấu đã xem* để việc đóng được — thiếu action thì dòng nằm mãi trong hàng đợi. Chế độ `strict` đã hiện ở nhánh `accounting_event` sẵn có (pending / held), đủ cho chế độ *gợi ý*. Làm cùng action ở W2c.
- **Commit Guard** băm `(mã, bản, hiệu lực, trạng thái, băm nội dung)` của các phong bì được trỏ tới; chứng từ không có `policyRefs` giữ nguyên dấu cũ.

## 9. Chữ chốt W3a (K1, Platform + API; R-FLOW-2): POS lấy chính sách đã phát hành và tính theo nó
<!-- [2026-11-08 12:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chữ chốt W3a: GET /policies, GET /rule-contracts, POST /policies/evaluate, POST /policies (phát hành inline); Rule Contract đầu tiên sale.promo.buy_x_get_y@1; dùng catalog:read, không thêm scope; mã ở modules/system để không đụng layers.mjs / contracts index.ts; (đổi số migration 0080 → 0082 đã RÚT, xem §9.7) -->

**Vì sao đây là việc quan trọng nhất.** W2a mới làm nửa sau của vòng (cửa nạp nhận `policyRefs`, kiểm, lưu). Nửa đầu — POS **lấy** chính sách đã phát hành và **tính** theo nó — chưa có: chưa API cho nguồn ngoài, chưa Rule Contract, bán hàng chưa có chính sách nào ở Core. W3a đóng nửa đó bằng phần **không chờ kế toán trưởng** (S031-14): `treatment` chỉ là gợi ý chưa xác nhận.

**Phạm vi W3a** = S031-13 (phần API; sự kiện outbox tách W3b) + Rule Contract đầu tiên `sale.promo.buy_x_get_y@1` làm mẫu cho S031-15 (S031-27 đổi số migration đã **rút**, xem 7). POS WP (S031-16) ở repo plugin, ngoài phạm vi; W3a chỉ cấp API và bộ ca mẫu để plugin viết lại và tự kiểm.

**1. Quyền — sửa D-POL-9: không thêm scope `policies:read`.** Khoá app có `documents:write` **ngầm kéo theo `catalog:read`** (`core/auth.ts:144`), nên POS hiện có đọc được ngay. Thêm scope mới phải sửa `core/apps.ts` (`APP_SCOPES`), `core/auth.ts`, `core/authz/catalog.ts` và ma trận test phân quyền của PHASE-028 — chi phí lớn, lợi ích chưa có (chưa ai cần tách quyền đọc chính sách khỏi quyền nạp). Đọc và tính: `catalog:read`. Phát hành: `settings:write` (chủ đơn vị, kế toán trưởng). Khi có nhu cầu tách thật thì thêm scope bằng PR riêng.

**2. Nơi đặt mã.** `apps/api/src/modules/system/rule-contracts/**` (khuôn + `sale.promo.buy_x_get_y@1`) và `apps/api/src/modules/system/policy.routes.ts`, mount bằng một dòng trong `system.routes.ts`. Tiền tố `modules/system/` **đã có dòng ở bảng lớp** (`P module-sdk`) nên không phải sửa `layers.mjs`; không đụng `packages/contracts/src/index.ts` — hai tệp đang thuộc dòng giữ chỗ khác (S030-45), tránh nợ SC-FLOW-1 lần thứ ba. **Nợ N031-1:** W2b (Kernel tính lại để kiểm, `IN-POL-004`) cần Rule Contract ở chỗ Kernel import được → khi đó dời xuống Platform. Phần đọc / phát hành dùng `core/policies.ts` của W1 (thêm hàm, tệp đã có bảng lớp).

**3. Bốn endpoint** (hợp đồng mới `bizcity_policy@1`, tài liệu `docs/contracts/BIZCITY-POLICY-v1.md` viết cùng mã để SC-DOC-5 đối chiếu route với mã):

| Endpoint | Quyền | Việc |
|---|---|---|
| `GET /api/v1/policies?domain=&branch=&channel=&at=` | `catalog:read` | các bản `published` phủ ngày `at` (mặc định hôm nay) và có cửa sổ nội dung phủ ngày đó; mỗi mục `{ policyKey, policyId, version, ruleContract, scope, effectiveFrom, effectiveTo, contentHash, params, treatment }`; kèm `asOf` và `etag` (băm danh sách) để POS hỏi lại rẻ |
| `GET /api/v1/rule-contracts` · `GET /api/v1/rule-contracts/:id` | `catalog:read` | khuôn luật: `id`, `domain`, danh sách tham số (tên, kiểu, bắt buộc), **`spec`** (thuật toán viết bằng dữ liệu để plugin PHP / JS viết lại) và **`vectors`** (đầu vào → đầu ra chuẩn để plugin tự kiểm) |
| `POST /api/v1/policies/evaluate` | `catalog:read` | `{ docDate, branchCode?, channel?, lines[{ lineKey, sku, qty, itemId? }], policies?[{ key, version? }] }` → `{ applied[{ policyRef{key,version,hash}, ruleContract, result, explain }], skipped[{ key, reason }], policyRefs[], gifts[{ sku, qty, isGift:true, policyRef }] }`. Bỏ `policies` = mọi chính sách `sale` phủ `docDate` và phạm vi. `policyRefs` là **đúng mảng** nguồn gắn vào chứng từ nạp |
| `POST /api/v1/policies` | `settings:write` | phát hành một bản chính sách **inline** (xem 5); action có bằng chứng và nhật ký như `mua-hang.policy.*` |

Không phát sự kiện `policy.published` / `.retired` ở W3a (cần khai loại sự kiện ở `bizcity_event@1`): POS làm mới bằng `etag`. Sự kiện = **W3b** (S031-26).

**4. Khuôn Rule Contract** (TypeScript, thuần, không I/O, không đồng hồ — POS và Core chạy cùng hàm):
```ts
interface RuleContract<P, I, O> {
  id: `${string}@${number}`; domain: 'sale';            // purchase.* bọc engine mua hàng ở S031-11, không ở W3a
  params: ZodType<P>; publishChecks(p: P): Finding[];    // POL-PUB-*: cấu trúc; trần pháp lý chưa làm (xem 8)
  evaluate(p: P, input: I): O;                           // tất định
  treatment(o: O): { on: string; reasonCode: string; confirmed: boolean }[];
  describe(): { params: Field[]; spec: unknown; vectors: { name: string; params: P; input: I; output: O }[] };
}
```
Không dùng `zod-to-json-schema` (không có trong repo, không thêm phụ thuộc): `describe().params` viết tay; test kiểm danh sách khoá khớp `.shape` của zod để không lệch.

**5. `sale.promo.buy_x_get_y@1`.** Tham số `{ buy:{ sku, qty>0 }, get:{ sku, qty>0 }, repeat:boolean=true, maxGiftQty?:number>0, validFrom?, validTo? }`. `evaluate`: `T` = tổng `qty` các dòng có `sku = buy.sku` (**qty tính theo đơn vị nhỏ nhất**, như `bizcity_ledger_intake@1`); `times = repeat ? floor(T / buy.qty) : (T ≥ buy.qty ? 1 : 0)`; `giftQty = min(times × get.qty, maxGiftQty ?? ∞)`; trả `{ times, gifts:[{ sku: get.sku, qty: giftQty }] }` (rỗng khi 0). Ngày: `validFrom/validTo` **trong nội dung** là cửa sổ chiến dịch; ngày hiệu lực của **bản** nằm ở sổ đăng ký (như mua hàng). Áp dụng khi cả hai phủ `docDate`. `treatment`: quà → `reasonCode: 'XTA1.4'` (có trong `db/packs/vn-tt99-nen.posting-pack.json`), `confirmed:false` cho tới khi kế toán trưởng trả Q031-5. **Giới hạn nói rõ:** nhiều chính sách áp **độc lập, cộng dồn**, chưa có "áp riêng" (`exclusive`) như engine mua hàng — để S031-15.

**6. Phát hành inline.** Chỉ `domain = sale`, chủ `ban-hang` (module `modules/ban-hang` chưa có, S030-16), `policyId = ban-hang:inline:<KEY>`, `KEY` dạng `[A-Z0-9][A-Z0-9_.-]{0,63}`; nội dung lưu ở cột `policy_registry.content` (`store = inline`). `effectiveFrom` **bắt buộc** (khác mua hàng nạp ngược: khuyến mại không được "áp từ đầu"); bản sau cùng khoá chuỗi bản với `registerPolicyVersion` (đóng bản trước ở ngày − 1, không lùi). Lùi về trước hôm nay cần `reason` ≥ 3 ký tự. `publishChecks` W3a chỉ kiểm cấu trúc (qty > 0, sku không rỗng, cửa sổ ngày hợp lệ); **trần NĐ81 (quà ≤ 50 % giá) chưa làm** vì cần tham số pháp lý (S030-35) và giá — không chặn trá hình, ghi rõ ở tài liệu. Chủ `ban-hang` chuyển sang module thật ở S030-16 bằng một `policyId` mới, không sửa bản đã phát hành.

**7. Đổi số migration (S031-27) — RÚT LẠI 2026-11-08.** *Bản chữ chốt đầu* đề xuất đổi tệp W2a `0080_kiem_chinh_sach_su_viec` thành `0082_…` vì `main` có hai `0080` (W2a #159 + K3 #165, `R-DB-3` / `SC-DATA-1` đỏ). **Phiên PHASE-029 (K3) đã nhận việc này** ở dòng giữ chỗ *"sửa trùng số migration 0080"* theo đúng quy ước *ai merge sau đổi số*: K3 merge sau (#165 sau #159) nên đổi **của K3** — `0080_nguoi_tao_su_viec_bat_buoc` → `0081`, `0081_khoa_ky_o_csdl` → `0082` — kèm bảng `RENAMED` ở `migrate.ts` cho cơ sở dữ liệu đã áp tên cũ. **Migration W2a giữ `0080`.** Nếu W3a vẫn đổi W2a sang `0082` thì **trùng `0082_khoa_ky_o_csdl`** của K3. Vậy: W3a **không đụng** migration nào; không có migration mới. (Phát hiện khi gộp `main` vào #169 — dòng của K3 vào `main` sau khi mình viết bản đầu.)

**8. Chưa làm ở W3a (ghi để không ai tưởng đã có):** sự kiện outbox (W3b); trần pháp lý NĐ81 (chờ S030-35); "áp riêng"; `sale.price_list`, `sale.promo.discount`, `sale.credit_limit` (S031-15, sau S031-14); Rule Contract mua hàng bọc engine (S031-11); tính lại ở cửa nạp `IN-POL-004` (W2b); bản nháp / duyệt hai bước; màn hình (W4).

**Golden W3a** (`apps/api/test/rule-contracts.test.ts`, `apps/api/test/policy-api.test.ts`):
- **T031-RC-1** bảng số `buy_x_get_y`: 2A→1B · 3A→1B · 4A→2B · 4A không `repeat`→1B · 1A→0 · `maxGiftQty` chặn · nhiều dòng cùng `sku` cộng dồn.
- **T031-RC-2** `publishChecks`: `qty ≤ 0`, `sku` rỗng, `validTo < validFrom` bị từ chối; khoá `describe().params` khớp `.shape` của zod.
- **T031-RC-3** mọi `vectors` của `describe()` chạy qua **hàm thuần và qua endpoint `evaluate`** ra cùng kết quả (đây là bộ chuẩn cho plugin viết lại).
- **T031-REG-3** phát hành bản 2 đóng bản 1 ở ngày − 1; `GET /policies?at=` trả đúng một bản mỗi ngày (T031-TR-2 qua HTTP); bản `retired` không hiện.
- **T031-API-1** quyền. `SCOPE_PERMISSIONS` (`core/auth.ts:143`) cấp `catalog:read` cho khoá API phạm vi **`documents:write`, `reports:read` và `catalog:write`** — cả ba đọc và tính được (định nghĩa chính sách là dữ liệu đọc; chấp nhận khoá báo cáo đọc được). Khoá chỉ có phạm vi không được ánh xạ (vd `ledger:read`) nhận tập quyền **rỗng** → 403; không khoá → 401. Phát hành cần `settings:write`: khoá API → 403, chủ đơn vị / kế toán trưởng → được. *(Đính chính 2026-11-08: bản đầu ghi "khoá chỉ `reports:read` → 403", sai vì `reports:read` cũng được cấp `catalog:read`; phát hiện khi đọc `SCOPE_PERMISSIONS` trước khi viết test.)*
- **T031-API-2** `etag` đổi sau khi phát hành, không đổi khi không có gì mới.
- **T031-E2E-1** `evaluate` → nạp `sale` kèm quà và `policyRefs` đúng như API trả → `posted`, `policy_check` đạt; đổi băm → `IN-POL-001`; ngày trước `effectiveFrom` → `IN-POL-002`.
- ~~**T031-MIG-1** áp lại `0082` idempotent~~ — rút cùng S031-27 (không còn đổi tên migration).

## 10. Chữ chốt W2c (K1, Kernel đọc + API; R-FLOW-2): hàng việc "Chờ kế toán xem" và nút Đánh dấu đã xem
<!-- [2026-11-08 08:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chữ chốt W2c trước khi code: nhánh policy_review của document_queue, bảng bằng chứng policy_review_acks, action ack; không đổi sự việc, không thêm trạng thái -->

Phạm vi: S031-22 **phần đóng được việc** (golden T031-Q-1..5). *Ghi sổ*, *Trả về nguồn*, *Điều chỉnh* của [20 §3](20-TRUY-VET-VA-THEO-DOI.md) **chưa làm** ở đợt này: chế độ *gợi ý* (mặc định, Q031-2) đã ghi sổ ngay, nên việc duy nhất còn lại là xem rồi đóng; *Ghi sổ* chỉ cần khi `strict` — mà sự việc `strict` đã nằm ở nhánh `accounting_event` (pending) sẵn có. *Trả về nguồn* cần sự kiện outbox (S031-26).

**1. Nhánh khung nhìn (migration `0084_xem_lai_chinh_sach.sql`, `CREATE OR REPLACE VIEW bizcity_read.document_queue`).** Thêm một nhánh `UNION ALL` trên `accounting_events`: sự việc có `policy_check->'findings'` khác rỗng, `status` **không** thuộc `pending` / `error` (hai trạng thái đó đã hiện ở nhánh `accounting_event` — không lặp một việc hai dòng), và **chưa có** dòng ở `policy_review_acks` cùng `(tenant_id, event_id, checked_at)`. Cột: `source = 'policy_review'`, `source_id = event_id`, `doc_*` như nhánh `accounting_event`, `status_group = 'pending'`, `flag = 'policy'`, `waiting_since = (policy_check->>'checkedAt')`. **Không thêm nhóm trạng thái mới** (năm nhóm chuẩn của `bizcity_document@1` §5 giữ nguyên — sửa 20 §3 cột `status_group` theo đây); cờ `policy` là giá trị mới của `flag` (đã tính ở đính chính §8).

**2. Bằng chứng, không sửa sự việc.** Bảng `policy_review_acks` (`tenant_id`, `event_id`, `checked_at` text — lấy từ `policy_check.checkedAt` tại lúc xem, `acked_by`, `acked_at`, `note`), `UNIQUE (tenant_id, event_id, checked_at)`, chỉ thêm (trigger chặn `UPDATE` / `DELETE`), RLS như 0074. Khoá theo `checked_at` để **bản mới của sự việc (kiểm lại) mở lại việc** mà không cần sửa dòng cũ (xuyên suốt: mỗi lần kiểm là một việc; truy vết: ai xem bản nào, lúc nào).

**3. Action.** `core.queue.policy-review.ack` — `POST /api/v1/queue/policy-review/:eventId/ack`, quyền `documents:write` (đúng bậc ghi chứng từ; không scope mới), `Idempotency-Key`, thân `{ note? }`, `mcp:false`, `ai:'deny'`. Gọi lần hai cùng `checked_at` trả đúng kết quả lần đầu (không lỗi). Sự việc không có `policy_check` / không có finding → `409` `POLICY_REVIEW_NOT_OPEN`. Mã lỗi vào `docs/huong-dan/` theo `sinh-ma-loi.mjs`.

**4. Hàng việc.** `QUEUE_SOURCES` thêm `policy_review`; `QUEUE_FLAGS` thêm `policy`; `NEXT_PERMISSION['policy_review:*'] = 'documents:write'`; nhãn "Chứng từ chờ kế toán xem chính sách"; `queuePath` → `/chung-tu`; nhóm thanh mép `tong-hop`. Người chỉ có `documents:read` thấy số đếm ở `summary` / `items` nhưng không thấy trong `mine` (như các nguồn khác).

**5. Không làm ở W2c.** Màn hình (W4, S031-18/24); *Ghi sổ* / *Trả về nguồn* / *Điều chỉnh*; đổi `bizcity_lineage@1`.

**Ba yếu tố.** *Nhất quán:* một khung nhìn hàng việc, không hàng việc thứ hai. *Xuyên suốt:* mỗi lần kiểm lại là một việc mới. *Truy vết:* mỗi lần xem một dòng bằng chứng bất biến. *Gọn:* một bảng nhỏ, một nhánh view, một action; không cột mới ở `accounting_events`.

**Golden.** T031-Q-1 sự việc có finding đã ghi sổ hiện ở hàng việc với cờ `policy`; sự việc `pending` chỉ hiện một dòng (nhánh `accounting_event`) · T031-Q-2 ack đóng việc, ack lặp idempotent · T031-Q-3 kiểm lại (`checkedAt` mới) mở lại · T031-Q-4 cô lập đơn vị + ack bảng chỉ thêm · T031-Q-5 `documents:read` không ack được (403).

**Đính chính khi code (W2c, 2026-11-08).** (1) *Không thêm mã lỗi mới:* việc không còn mở trả `409 CONFLICT` kèm `details.reason = POLICY_REVIEW_NOT_OPEN` (danh mục `bizcity_errors@1` giữ nguyên — gọn). (2) `core.queue.summary`: `byFlag` giữ **ba khoá đã phát hành** (`held`, `blocked`, `returned`); số việc chính sách đếm ở `bySource[].policy` — tránh đổi hình hợp đồng đã phát hành; thêm `byFlag.policy` khi có đợt đổi hợp đồng hàng việc. (3) Chưa thêm `hang-viec.test.ts` (đang trong phạm vi dòng PHASE-029): ca phủ `policy_review` nằm ở `policy-review.test.ts`. (4) Fixture test dựng bằng **cửa nạp thật** (`policyRefs` trỏ mã không có trong sổ → IN-POL-001), không chèn tay vì sổ của đơn vị test phải qua bất biến `EVENT_POSTED_VERSION`.

## 11. Chữ chốt W3b (K1, Platform; R-FLOW-2): sự kiện `policy.published` / `policy.retired` qua outbox
<!-- [2026-11-08 11:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chữ chốt W3b trước khi code: dùng outbox + webhook sẵn có (bizcity_event@1), không bảng / migration / hạ tầng mới -->

Phạm vi: S031-26 (golden T031-EV-1..5). **Lean:** `bizcity_event@1` đã có outbox giao ít nhất một lần, thử lại, `dead`, `replay`, và webhook ký HMAC cho app ngoài tiến trình (§7a). POS WP / sàn là app `kind: "app"` nghe hai loại sự kiện mới — **không** thêm đường giao thứ hai.

**1. Hai loại Core phát** (thêm vào [bizcity_event@1 §7](../../contracts/BIZCITY-EVENT-v1.md) và danh sách `docs/standard/bizcity-standard.json`; minor, thêm không phá):

| `type` | Khi nào | `subject` | `data` |
|---|---|---|---|
| `bizcity.policy.published` | `registerPolicyVersion` ghi một bản (mọi đường: phát hành inline, lưu chính sách mua hàng, module khác) | `policy:<policyId>` | `{ policyId, policyKey, version, ownerModule, ruleContract, effectiveFrom, contentHash, closes: { version, effectiveTo } \| null }` |
| `bizcity.policy.retired` | `retirePolicy` đổi `published → retired` (số bản bị ngừng > 0) | `policy:<policyId>` | `{ policyId, retiredVersions }` |

**2. Cùng giao dịch với việc ghi** (STD-EVT-1, R-OUTBOX-1): phát ngay trong `registerPolicyVersion` / `retirePolicy` ở `packages/platform/src/core/policies.ts` — giao dịch huỷ thì không có sự kiện. `dedupeKey` = `policy.published:<policyId>:<version>` (ghi lặp cùng bản không phát đôi), `policy.retired:<policyId>:<số bản lớn nhất>`. `source = 'bizcity.platform'`; actor lấy từ chuỗi `user:<id>` / `apikey:<id>` đã có (`publishedBy`); `retirePolicy` thêm tham số `actor` tuỳ chọn (không đổi chữ ký cũ), thiếu thì `system`.

**3. `data` không mang nội dung chính sách.** Chỉ định danh + băm: nguồn nhận sự kiện rồi **tải lại** bằng `GET /api/v1/policies` (etag) — một nguồn sự thật, nội dung không rò qua kênh phụ (nhất quán). `closes` cho biết bản trước bị đóng ở ngày nào (xuyên suốt: nguồn ngoại tuyến biết bản nào hết hiệu lực khi nào). Truy vết: `correlationId` của yêu cầu phát hành đi cùng sự kiện, nối được vào audit.

**4. Không làm ở W3b.** Plugin POS WP nghe sự kiện (repo plugin, S031-16); `policy.review.rejected` / *Trả về nguồn* (hoãn, cần thiết kế riêng); đổi `etag` (giữ nguyên — vẫn là đường dự phòng khi mất webhook).

**Ba yếu tố.** *Nhất quán:* một kênh, một nguồn nội dung. *Xuyên suốt:* `closes` giữ liền mạch hiệu lực. *Truy vết:* `correlationId` + `dedupeKey`. *Gọn:* không bảng, không migration, ~30 dòng ở `policies.ts`.

**Golden.** T031-EV-1 phát hành inline → đúng một `published` có `closes` đúng · T031-EV-2 giao dịch huỷ → không có sự kiện · T031-EV-3 lưu chính sách mua hàng → `published` (đường module), xoá chính sách → `retired` · T031-EV-4 ghi lặp cùng bản không phát đôi · T031-EV-5 `data` không có `content`/`params`.

## 12. Chữ chốt W4a (K1, API đọc; R-FLOW-2): đọc sổ đăng ký, theo dõi thực hiện, truy vết ngược
<!-- [2026-11-09 08:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chữ chốt W4a trước khi code: tách W4 thành W4a (API đọc, đợt này) và W4b (màn hình, đợt sau); không migration, không bảng tổng hợp -->

**Tách W4.** W4 ([20 §4](20-TRUY-VET-VA-THEO-DOI.md), mockup `chinh-sach.html`) gồm màn hình và số liệu. Làm **số liệu trước** (W4a, chỉ API đọc): màn hình chỉ vẽ lại, và Conformance Engine (S031-17) dùng cùng nguồn số (D-POL-8: dashboard và Engine không có hai cách đếm). **W4b** (màn *Chính sách*, *Theo dõi thực hiện*, nút *Chính sách căn cứ*) sau khi W4a vào main.

**1. Ba action đọc** (`catalog:read`, `mcp:false`, `ai:'deny'`; tiền tố `/api/v1/policy-*` để không đụng `GET /policies` của W3a, mà `policyId` có dấu `:`):

| Action | Đường | Trả |
|---|---|---|
| `core.policy.registry` | `GET /api/v1/policy-registry?owner&status&q` | mỗi chính sách: các bản (số, `effectiveFrom/To`, `status`, `contentHash`, `scope`), số chứng từ đã áp theo bản (đếm `policy_application`), bản đang hiệu lực hôm nay, **khoảng trống** giữa các bản, bản sắp hết hạn |
| `core.policy.applications` | `GET /api/v1/policy-registry/:policyId/applications?version&cursor` | chứng từ đã áp một chính sách (doc_key, ngày, nguồn, mã `IN-POL-*`, `ok`), phân trang con trỏ — đọc `policy_application` |
| `core.policy.tracking` | `GET /api/v1/policy-tracking?from&to&branch&source&owner` | các ô của [20 §4](20-TRUY-VET-VA-THEO-DOI.md) tính được từ dữ liệu có sẵn (mục 2) |
| `core.policy.lineage` | `GET /api/v1/policy-lineage?eventId` hoặc `docKey` | chuỗi ngược: sự việc → mỗi `policyRef` → phong bì bản đó (+ **băm khớp?**, ngày chứng từ có nằm trong hiệu lực?) → `policy_check` lúc nhận. Gộp thành action thay cho hàm SQL `policy_lineage` của S031-21 (không migration; đủ cho một sự việc) |

**2. Ô theo dõi ở W4a** (đều đọc `bizcity_read.policy_application` + `policy_registry`; không bảng tổng hợp, không job đêm — đo ở 1 triệu sự việc rồi mới quyết view vật chất hoá, S031-24):
*Đạt chính sách* (`ok` / tổng, theo kỳ `doc_date`) · *Lệch theo mã* (đếm `codes[]`) · *Độ phủ theo nguồn* (sự việc có `policyRefs` / sự việc cùng `doc_type` thuộc miền có chính sách hiệu lực, theo `source_system`) · *Độ trễ phiên bản* (`IN-POL-003` theo nguồn × chính sách, bản cuối mỗi nguồn đã gửi) · *Dòng thời gian* (bản hiệu lực trong kỳ, khoảng trống) · *Sức khoẻ Registry* (chính sách sắp hết hạn trong 30 ngày, chính sách không còn bản `published`). **Hoãn:** *Thực hiện chương trình* (lượng / giá trị hàng tặng, ngân sách) — cần lưu kết quả tính của nguồn (IN-POL-004, W2b); W4a chỉ cho **số đơn áp** và **tổng tiền** của chứng từ đã áp.

**3. Lọc.** `from/to` theo `doc_date` (mặc định 30 ngày), `branch` theo mã chi nhánh, `source` theo `source_system`, `owner` theo `owner_module`. Mọi truy vấn có `tenant_id` (R-TEN), chạy qua `ctx.data.tx`.

**4. Vị trí mã.** `apps/api/src/modules/system/policy-insight.ts` (truy vấn thuần, có test) + thêm hàng `defineAction` ở `policy.routes.ts` (mảng `policyActions`). Hợp đồng: `bizcity_policy@1` mục 11 (minor 1.2.0-draft). **Không migration.**

**Ba yếu tố.** *Nhất quán:* một khung nhìn cho dashboard, lineage và Engine. *Xuyên suốt:* khoảng trống giữa các bản và độ trễ phiên bản lộ ra theo ngày chứng từ. *Truy vết:* `lineage` kiểm băm và hiệu lực từng tham chiếu. *Gọn:* 4 action đọc, 0 bảng, 0 migration.

**Golden.** T031-INS-1 registry liệt kê bản, đếm chứng từ đã áp theo bản, phát hiện khoảng trống · T031-INS-2 applications phân trang đúng, lọc theo bản · T031-INS-3 tracking: tỉ lệ đạt và đếm mã khớp dữ liệu dựng (cả ca không có dữ liệu → 0, không chia cho 0) · T031-INS-4 độ trễ phiên bản chỉ tính `IN-POL-003` · T031-INS-5 lineage báo băm lệch khi bản bị đổi nội dung giả định và ngày chứng từ ngoài hiệu lực · T031-INS-6 cô lập đơn vị; quyền `catalog:read`.

## 13. Chữ chốt W4b (K1, giao diện; R-FLOW-2): màn *Chính sách* ở Hệ thống
<!-- [2026-11-09 01:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chữ chốt W4b trước khi code: một màn bốn tab theo mockup đã duyệt, chỉ dùng API đã có (W2c, W3a, W4a), không API mới, không migration -->

Phạm vi: S031-18, S031-24 (phần màn hình). **Một trang, bốn tab** đúng [mockup chinh-sach.html](mockups/chinh-sach.html) — D031-11: năng lực Core, màn chung ở *Hệ thống → Chính sách*, **không** module nghiệp vụ riêng.

| Tab | Nguồn API (đã có) | Làm gì |
|---|---|---|
| **Chính sách** | `GET /api/v1/policy-registry` (W4a) | danh sách + chi tiết: các bản theo thời gian, hiệu lực, phạm vi, băm, số chứng từ đã áp; khoảng trống / sắp hết hạn nổi lên; bấm một bản → danh sách chứng từ đã áp (`/applications`, phân trang) |
| **Chờ kế toán xem** | `GET /api/v1/queue/items?source=policy_review&flag=policy` (W2c) + `POST /queue/policy-review/:eventId/ack` | hàng việc; nút *Đánh dấu đã xem* (`documents:write`, có ghi chú tuỳ chọn); số đếm hiện ở nhãn tab |
| **Truy vết** | `GET /api/v1/policy-lineage` (W4a) | nhập số chứng từ → chuỗi sự việc → chính sách@bản, **băm khớp / lệch**, **ngày ngoài hiệu lực** nổi bật; *Chính sách căn cứ* mở từ màn truy vết chứng từ hiện có (nút, không màn mới) |
| **Theo dõi thực hiện** | `GET /api/v1/policy-tracking` (W4a) | các ô: đạt chính sách, lệch theo mã, độ phủ theo nguồn, độ trễ phiên bản, dòng thời gian, sức khoẻ; lọc kỳ · chi nhánh · nguồn · module chủ; mỗi ô bấm → danh sách sự việc cùng khung nhìn |

**Quy tắc màn hình.** (1) Một cách đếm: số trên màn là số API trả, không tính lại ở trình duyệt (D-POL-8). (2) `rate = null` hiện "—", không 0%. (3) Không nút sửa chính sách ở màn này — phát hành đi qua module chủ / API (W3a); màn chỉ đọc và đóng việc xem. (4) Quyền: xem cần `catalog:read`; *Đánh dấu đã xem* cần `documents:write`, thiếu quyền thì nút ẩn (không báo lỗi sau). (5) Trạng thái rỗng giải thích bằng một câu (chưa có chính sách / chưa chứng từ nào gửi tham chiếu). (6) Mọi chữ qua từ điển thuật ngữ sẵn có; mã `IN-POL-*` bấm ra trang giải thích `docs/huong-dan/loi-dau-vao`.

**Vị trí mã.** `apps/web/src/features/policy/` (`PolicyPage.tsx` + một tệp mỗi tab); một dòng route ở `apps/web/src/pages.tsx`, một mục ở `apps/web/src/phan-he/he-thong/menu.ts` (mã HT lấy số kế tiếp còn trống **bằng grep ngay trước khi code**, quyền `catalog:read`), một đường dẫn ở nhóm *Kiểm soát* của `menu-gon.ts`. Không đổi `packages/ui-kit`.

**Kiểm.** Web chưa có khung test: bảo đảm bằng `npm run typecheck -w @ketoan/web` + `vite build` + chạy thật (`/run`) chụp bốn tab với dữ liệu dựng bằng cửa nạp (như `policy-insight.test.ts`) và ghi vào PR; kèm golden T031-UI-1..4 mô tả (hiện đúng số API · rate null · ẩn nút khi thiếu quyền · ack đóng việc và số đếm giảm).

**Ba yếu tố.** *Nhất quán:* cùng nguồn số với API và Engine. *Xuyên suốt:* dòng thời gian + khoảng trống ở tab đầu. *Truy vết:* tab Truy vết với băm / hiệu lực. *Gọn:* một trang, không API mới, không migration.

**Đính chính khi code (W4b, 2026-11-09).** (1) Mã chức năng **HT15**. (2) Nút *Chính sách căn cứ* trên màn truy vết chứng từ hiện có **hoãn**: tệp đó ngoài phạm vi dòng W4b; thay bằng đường dẫn sâu `/he-thong/chinh-sach?xem=truy-vet&chung-tu=<docKey>` đã chạy (tab *Chờ kế toán xem* dùng chính nó cho nút *Truy vết*). (3) Chưa có `helpKey` / trang `docs/huong-dan/chinh-sach.md` (thư mục ngoài phạm vi). (4) Mỗi ô của tab *Theo dõi* **chưa bấm được** sang danh sách sự việc (mục `§4` của 20): hiện chỉ lọc kỳ · chi nhánh · nguồn · module chủ.

## 14. Chữ chốt W2b (K1, Kernel + API; R-FLOW-2): `IN-POL-004` — tính lại ở cửa nạp để kiểm kết quả
<!-- [2026-11-09 05:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chữ chốt W2b trước khi code: một mã IN-POL-004, điểm mở rộng để Kernel gọi Rule Contract mà không phụ thuộc apps/api; chỉ cảnh báo -->

Phạm vi: **một mã** `IN-POL-004` (golden T031-RC-4, T031-INT-10..13). `IN-POL-000` (thiếu tham chiếu) và `IN-POL-005` (thiếu dữ liệu gốc) **để sau**: 000 đã có số liệu ở ô *Độ phủ* của W4a; 005 cần module kho.

**1. Câu hỏi mã trả lời.** Nguồn gửi chứng từ có dòng quà (`isGift`, `policyRef: { key, version, line: 'gift' }`) và `policyRefs`. Cửa nạp **tính lại** quà theo đúng bản chính sách nguồn nêu (không phải bản hiện hành) trên các dòng không phải quà, rồi so với quà nguồn gửi. Khác → `IN-POL-004` (cảnh báo `warn`, `advice`, 10 điểm), kèm `details`: với mỗi mặt hàng, *nguồn gửi* ↔ *tính lại*. Đây là phép kiểm "nguồn tính đúng chưa" — Conformance, không phải Gate chặn (D-POL-8; R-GATE-9: mặc định cho phép, `strict` mới chờ duyệt — `policyHold` đã bao mọi `IN-POL-*`).

**2. Điểm mở rộng, không đảo tầng.** Rule Contract nằm ở `apps/api/src/modules/system/rule-contracts/` (tầng module-sdk); Kernel không được import `apps/api`. Thêm **một hàm đăng ký** ở Kernel: `registerPolicyRecompute(fn)` (tệp `packages/kernel/src/modules/intake/policy-recompute.ts`, kiểu `(trx, tenantId, req: { ref, docDate, lines }) => Promise<{ gifts: { sku, itemId?, qty }[] } | null>`); `apps/api` đăng ký khi nạp `policy.routes.ts` (cùng kiểu `registerSubscribers` của outbox). Chưa đăng ký, hoặc hàm trả `null` (khuôn luật không tính được: nội dung ở module chủ, chi nhánh ngoài phạm vi, không phải khuôn quà) → **không báo gì** (không đoán). Một nguồn luật cho hai đường (R-INTAKE-4): `policyFindings` ở `policy-check.ts` gọi cho cả Kiểm thử và cửa nạp.

**3. Tính theo đúng bản.** Thêm `getPolicyVersion(trx, tenantId, policyId, version)` ở `packages/platform/src/core/policies.ts` (đọc phong bì + nội dung inline của **một bản**, kể cả bản đã đóng / ngừng — chứng từ cũ vẫn kiểm được). Hàm đăng ký ở `apps/api` gọi nó, kiểm `phạm vi` (chi nhánh, kênh) như `evaluatePolicies`, rồi chạy `contract.evaluate(params, { lines })` với các dòng **không** `isGift`. Chỉ khuôn trả `gifts` (hiện `sale.promo.buy_x_get_y@1`) tham gia; khuôn khác bỏ qua.

**4. So sánh.** Gom quà theo `itemId` nếu có, không thì `sku`; số lượng so với dung sai 1e-9 như Rule Contract. Chỉ so **dòng quà mang `policyRef.key` của chính chính sách đó** (quà của chính sách khác / quà tay không tính). Khác khi: thiếu quà, thừa quà, hoặc lệch số lượng. Nguồn không gửi dòng quà nào mà tính lại ra quà → cũng `IN-POL-004` (nguồn bỏ quên).

**5. Danh mục mã.** `IN-POL-004` vào `packages/contracts/src/intake-findings.ts` (có `remedy`, căn cứ, bài học), bảng `BIZCITY-INTAKE-FINDINGS-v1.md` §3 (bản 0.10.0-draft), trang `docs/huong-dan/loi-dau-vao/IN-POL-004.md` — SC-INTAKE-1 và `sinh-ma-loi.mjs` kiểm. `policy_check.findings` mang mã mới; khung nhìn `policy_application.codes` và ô *Lệch theo mã* của W4 tự hiện (không đổi mã nào).

**6. Không làm.** Chặn chứng từ (mặc định cho phép); sửa chứng từ nguồn; lưu kết quả tính vào cột riêng (so ngay tại cửa nạp, kết quả nằm trong `policy_check`); ô *Thực hiện chương trình* của W4 (mở khoá sau W2b nhưng là việc W4c).

**Ba yếu tố.** *Nhất quán:* một khuôn luật cho POS (qua API), cửa nạp và mọi nguồn. *Xuyên suốt:* tính theo **bản nguồn nêu**, đúng ngày chứng từ, nên chứng từ cũ không bị kiểm oan bằng chính sách mới. *Truy vết:* `details` giữ cặp nguồn ↔ tính lại, vào `policy_check` bất biến theo phiên bản chứng từ. *Gọn:* một mã, một hàm đăng ký, một hàm đọc bản; không bảng, không migration.

**Golden.** T031-INT-10 quà đúng → không mã · T031-INT-11 thiếu quà / thừa quà / lệch số lượng → `IN-POL-004` có `details` · T031-INT-12 tính theo **bản được nêu** (bản cũ còn tính đúng dù bản mới đổi số quà; bản nêu sai ngày vẫn `IN-POL-002/003` riêng) · T031-INT-13 chưa đăng ký hàm / chính sách nội dung ở module chủ / không dòng quà và không tính ra quà → im lặng; Kiểm thử và cửa nạp ra cùng mã (R-INTAKE-4); `strict` → chờ duyệt.

**Đính chính khi code (W2b, 2026-11-09).** (1) Điểm mở rộng `registerPolicyRecompute` đặt ở **`packages/platform/src/core/policies.ts`**, không ở `packages/kernel/.../policy-recompute.ts` như mục 2: SC-KERNEL-6 chỉ cho code ngoài Kernel đi qua cổng gốc `@bizcity/kernel` (`packages/kernel/src/index.ts` ngoài phạm vi); platform trung lập — Kernel gọi, `apps/api` đăng ký. Nợ N031-1 (dời Rule Contract xuống platform) **đóng** bằng điểm mở rộng này. (2) Cổng thêm: chỉ tính lại khi bản có thật **và băm khớp** (băm lệch đã là `IN-POL-001`); (3) cửa sổ chiến dịch trong nội dung và phạm vi chi nhánh / kênh được kiểm — ngoài thì không tính (im lặng).

## 15. Chữ chốt W4c (K1, API đọc + giao diện; R-FLOW-2): ô *Thực hiện chương trình*
<!-- [2026-11-09 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chữ chốt W4c trước khi code: một ô mới của core.policy.tracking, đọc quà nguồn đã gửi trong payload; không migration; ngân sách và giá trị hàng tặng hoãn có lý do -->

Phạm vi: S031-30. Mở ô cuối còn thiếu của [20 §4](20-TRUY-VET-VA-THEO-DOI.md) — *chương trình đã chạy tới đâu*. **Làm phần dữ liệu có thật hôm nay; hoãn phần chưa có nguồn, ghi rõ.**

**1. Có thật hôm nay (làm).** Từ `accounting_events` đã có `policyRefs` (cùng khung nhìn `policy_application`) và các dòng quà **nguồn đã gửi** (`payload.lines[]` có `isGift = true` và `policyRef.key` = mã chính sách): với mỗi *(chính sách, bản)* trong kỳ → **số chứng từ áp**, **số lượng quà đã tặng theo mặt hàng**, **số chứng từ có quà lệch** (`IN-POL-004` — nhờ W2b), kèm tỉ lệ lệch. Một nguồn số: quà lấy từ chính chứng từ đã ghi sổ, không tính lại ở API (tính lại là việc cửa nạp, W2b).

**2. Hoãn có lý do.**
- *Giá trị hàng tặng:* dòng quà gửi `amountBeforeTax = 0` (đúng khuôn `bizcity_ledger_intake@1`); giá trị phải lấy từ **giá vốn / giá bán** của mặt hàng ở ngày chứng từ — chưa có nguồn đọc thống nhất ở Core (Costing nối sau sổ cái, PHASE-025). Màn hiện "—" kèm câu giải thích, không ước lượng.
- *Ngân sách (`gift_budget`) và "đã chạy tới đâu so với ngân sách":* Rule Contract `sale.promo.buy_x_get_y@1` **chưa có tham số ngân sách** — thêm là đổi khuôn tham số công bố cho nguồn ngoài (STD: thêm trường tuỳ chọn = minor), cần chủ dự án / kế toán trưởng quyết ngân sách tính theo số lượng hay giá trị. **Câu hỏi mở Q031-7** (không chặn W4c). Khi có: ô thêm thanh tiến độ, không đổi khung đã làm.
- *Chiết khấu đã cho:* chưa có Rule Contract `sale.promo.discount@1` (S031-15).

**3. API.** Thêm khoá `program` vào kết quả `core.policy.tracking` (cùng bộ lọc kỳ · chi nhánh · nguồn · module chủ): `program[] { policyId, policyKey, version, orders, giftsBySku[] { sku, qty }, mismatched, mismatchRate }`. Thêm khoá vào đối tượng trả = **minor** của `bizcity_policy@1` (1.3.0-draft), không đổi khoá cũ. Truy vấn thuần ở `policy-insight.ts`, một câu SQL gom từ `jsonb_array_elements(payload->'lines')` rồi đối chiếu `policy_application`; không bảng tổng hợp (đo hiệu năng ở S031-24).

**4. Màn hình.** Tab *Theo dõi thực hiện* thêm khối *Thực hiện chương trình* (bảng chính sách × bản: chứng từ áp, quà theo mặt hàng, lệch); giá trị hàng tặng và ngân sách hiện "—" kèm chú thích. Hướng dẫn `docs/huong-dan/chinh-sach.md` cập nhật bảng ô.

**Ba yếu tố.** *Nhất quán:* quà lấy từ chứng từ đã ghi sổ, lệch lấy từ `policy_check` — cùng một nguồn với tab Truy vết. *Xuyên suốt:* tách theo **bản** nên chương trình đổi bản giữa kỳ thấy rõ từng giai đoạn. *Truy vết:* mỗi số quy được về danh sách chứng từ (tab *Chính sách* → *Chứng từ đã áp*). *Gọn:* một khoá, một câu SQL, không migration.

**Golden.** T031-PRG-1 đếm đúng chứng từ áp và quà theo mặt hàng theo từng bản · T031-PRG-2 chứng từ có quà lệch (`IN-POL-004`) được tính vào `mismatched` và tỉ lệ; chứng từ không quà không lệch · T031-PRG-3 quà của chính sách khác trên cùng chứng từ không bị cộng nhầm · T031-PRG-4 kỳ rỗng → `program: []`, tỉ lệ `null` · T031-PRG-5 lọc nguồn / chi nhánh / module chủ; cô lập đơn vị · UI: khối hiện đúng số API, "—" ở ô hoãn (chạy thật, như W4b).

**Đính chính khi code (W4c, 2026-11-09).** (1) Quà đếm theo **cặp (khoá chính sách, số bản)** của `policyRef` trên dòng quà — chỉ so số bản thì nhầm khi hai chính sách cùng số bản (bắt được nhờ phá thử). (2) Quà chỉ tính ở chứng từ đã vào `policy_application` (có `policyRefs` và qua cửa nạp); dòng quà nguồn không nêu `policyRef` không thuộc chương trình nào. (3) Q031-7 (ngân sách theo số lượng hay giá trị) vẫn **mở**.

## 16. Chữ chốt RV-R1-04 (K1, Platform; R-FLOW-2): ngừng chính sách đóng `effective_to` <!-- [2026-11-10 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chủ dự án đồng ý đề xuất sau review R1 (2026-11-10) -->

**Vấn đề (review R1, RV-R1-04).** `retirePolicy` chỉ đổi `status` sang `retired`; `effective_to` của bản đang mở vẫn `NULL`. Cửa nạp (`policy-check.ts`, `covers()`) chỉ xét khoảng ngày nên chứng từ mới trỏ bản đã ngừng vẫn **không bị báo** — "ngừng" chỉ là nhãn.

**Quyết định (chủ dự án, 2026-11-10).** `retirePolicy(trx, tenantId, policyId, actor?, effectiveTo?)` đóng khoảng hiệu lực của mọi bản đang `published` bằng **ngày ngừng** (`effectiveTo`, dạng `YYYY-MM-DD`, mặc định ngày hôm nay theo múi giờ của CSDL):

1. `effective_to := ngày ngừng` cho bản có `effective_to IS NULL` (trigger `bizcity_policy_registry_guard` chỉ cho NULL → ngày, một lần). Bản đã đóng từ trước (có bản mới thay) giữ nguyên.
2. Ngày ngừng không sớm hơn `effective_from − 1` (ràng buộc `policy_registry_range_chk`): sớm hơn thì dùng `effective_from − 1` (khoảng rỗng — bản chưa từng có hiệu lực).
3. Chứng từ có **ngày chứng từ ≤ ngày ngừng** vẫn hợp lệ (`covers()` đúng); **sau** ngày ngừng cửa nạp báo **IN-POL-002** (không có bản nào phủ ngày), không cần sửa `policy-check.ts`. Chứng từ cũ vẫn truy được (`getPolicyVersion` đọc cả bản đã ngừng).
4. `effectiveTo` tương lai là hợp lệ (ngừng có hẹn): `status` chuyển ngay (không phát hành thêm bản), chứng từ đến hết ngày đó vẫn được nhận.
5. Gọi lại khi không còn bản `published` trả 0, như hiện nay; sự kiện `policy.retired` thêm `data.effectiveTo`.
6. **Dữ liệu cũ:** bản đã `retired` trước thay đổi này có `effective_to = NULL` và không có ngày ngừng đáng tin; **không** tự đóng (sẽ làm sai chứng từ cũ). Việc gỡ nợ này ghi vào checklist để làm sau khi có số đo trên dữ liệu thật.

**Kiểm bằng:** `apps/api/test/policy-retire.test.ts` (đóng khoảng; trước / đúng / sau ngày ngừng qua cửa nạp; ngày tương lai; ngày sớm hơn `effective_from`; gọi lại).

## 17. Chữ chốt S031-15 / S031-16 phần chương trình bán (K1, API + giao diện; R-FLOW-2) <!-- [2026-11-12 08:50 PM Võ Hoàng] POS-KM — người dùng được giao S031-15 / S031-16 (đóng góp; phiếu NT-BH-003) -->

**Vấn đề.** Chương trình bán BH12 (bảng `sale_programs`, migration 0096) đăng ký bản ở sổ đăng ký với `store = module` và Rule Contract `sale.program.gift@1` / `sale.program.discount@1` — nhưng **hai khuôn này chưa có**, sổ đăng ký không giữ nội dung bản `module`, nên `POST /policies/evaluate` và `IN-POL-004` bỏ qua mọi chương trình BH12. Hạn mức chỉ trừ khi bên gọi tự gọi `/sale-programs/consume` (quyền `documents:write`) — module `pos` không gọi được. Máy bán POS React còn tính khuyến mại bằng bản sao luật của plugin website.

**Quyết định.** BH12 là nơi khai duy nhất (D-MP-14); Core tính; module `pos` chỉ chuyển kết quả có căn cứ vào phiếu bán.

1. **Hai Rule Contract** ở `apps/api/src/modules/system/rule-contracts/`, thuần, có `vectors`:
   - `sale.program.gift@1` — tham số = nội dung bản BH12 (`sku`, `buyQty`, `giftSku` — trống = chính mặt hàng, `giftQty`, `repeat` mặc định true, `maxGiftQty` tuỳ chọn, `validFrom`/`validTo`); luật như `sale.promo.buy_x_get_y@1` (đơn vị nhỏ nhất, dung sai 1e-9, làm tròn 4 số). Treatment `gift` → `XTA1.4` (chốt 09/11), `confirmed: false` tới khi có Q031-5.
   - `sale.program.discount@1` — `sku` + đúng một trong `discountPct` / `discountAmount` / `salePrice` trên **một đơn vị bán**; đầu vào dòng thêm `price` (giá trọn của dòng, tuỳ chọn); ra `discounts: [{ lineKey, sku, qty, amount }]`, `amount` làm tròn đồng, không âm, không quá thành tiền dòng; dòng thiếu `price` mà cần giá → không giảm, nêu ở `explain`. Treatment `discount` → `reasonCode` giảm giá hàng bán (chờ Q031-5, `confirmed: false`).
2. **Đọc nội dung bản `module`**: `rule-contracts` thêm `registerPolicyContentReader(ownerModule, fn)`; `sale-programs` đăng ký bộ đọc trả nội dung từ `sale_programs` **chỉ khi băm khớp `content_hash` của bản** (bản cũ đã bị sửa đè thì trả không đọc được — nêu ở `problem`). `listPolicies`, `evaluatePolicies`, `recomputeGifts` dùng chung. Không đổi Kernel / Platform, không migration sổ đăng ký.
3. **Evaluate**: thêm `lines[].price` (tuỳ chọn); kết quả thêm `discounts[]` (mỗi phần tử kèm `policyRef { key, version, line: 'discount' }`) cạnh `gifts[]`. Chương trình BH12 chỉ áp khi chi nhánh **còn hạn mức** (`branchCode` bắt buộc; hết / không giao → `skipped` với lý do); `applied[]` kèm `quota { branchCode, remaining }`. `buy_x_get_y` giữ nguyên.
4. **Hạn mức tự trừ / tự trả**: người nghe `ban-hang.sale-program-usage` trên `bizcity.ledger.entry.posted` (`docType = sale`) đọc dòng có `policyRef.key` = mã chương trình → ghi lượt dùng theo `(docKey, lineKey)` (gửi lại không trừ thêm); `bizcity.ledger.entry.reversed` (huỷ) → trả lại. **Không chặn** khi vượt (đã bán thật — chốt 05/11 "vượt ít thì báo cáo"): ghi đủ, báo cáo BH12 hiện phần vượt. `/sale-programs/consume` giữ nguyên cho nguồn muốn giữ chỗ trước.
5. **BH12 thêm** (không migration): cột *Tính được* (bản, khuôn, đọc được nội dung không); hộp **Thử tính** (chọn cửa hàng + giỏ hàng mẫu → gọi evaluate, hiện quà / giảm / bỏ qua kèm lý do). Ba tham số `repeat`, `maxGiftQty`, `channels` đã có trong khuôn (mặc định: tặng lặp lại, không trần, mọi kênh) nhưng **chưa có cột ở BH12** — thêm cột cần migration + `schema-catalog.ts`, đang nằm trong phạm vi dòng giữ chỗ PHASE-026; làm ở đợt sau khi dòng đó nhả (R-FLOW-3).
6. **Module `pos`** (S031-16): đơn nhận dòng quà (`isGift`, giá 0) và dòng giảm theo chương trình, mỗi dòng có `policyRef`; đầu phiếu `policyRefs` = các bản đã áp. Dòng quà / giảm thiếu `policyRef` → `POS_GIFT_WITHOUT_POLICY`. Module **không tự tính lại** (không có đường gọi luật); cửa nạp kiểm (`IN-POL-001..004`, mặc định cảnh báo — Q031-2). Hàng tặng không gửi thuế (mã Z) đi chung phiếu, không lên hoá đơn điện tử (như hiện nay).
7. **Máy bán**: gọi thẳng `POST /api/v1/policies/evaluate` của Core — vé WP của máy bán thêm `catalog:read` (chỉ đọc; thu ngân vốn đã xem danh mục, giá). Đề xuất về sau: `ctx.policies.evaluate` ở module SDK để module tự kiểm lại.

**Phát hiện khi làm (đề xuất cho chủ Kernel, ngoài phạm vi đợt):** <!-- [2026-11-12 11:05 PM Võ Hoàng] POS-KM — ghi khi code (đóng góp) -->
-  so quà theo  ở từng phía: dòng quà nguồn có  mà luật chỉ trả mã (khuôn BH12 chỉ biết mã) thì báo lệch giả. Đề xuất:  quy cả hai phía về  (tra theo mã tại ngày chứng từ) trước khi so. Đợt này module  gửi dòng quà theo chương trình **chỉ kèm mã** (cửa nạp tự tra mặt hàng).
- Gửi lại bản 2 (cùng nội dung) của phiếu bán có  bị  — có sẵn trên  (thử với chính sách inline , không dính BH12). Máy bán POS không gửi lại phiếu nên chưa vướng; nguồn khác (Woo, sàn) sẽ vướng.

**Ngoài đợt này:** bậc, quà theo tổng đơn, voucher, combo, mua bất kỳ tặng món rẻ nhất, khung giờ / sinh nhật, áp riêng (exclusive), trần NĐ81, trả hạn mức theo phiếu trả, công cụ chuyển CTKM từ plugin website. `sale.price_list@1`, `sale.credit_limit@1` của S031-15 vẫn để `modules/ban-hang` (S030-16).

**Kiểm bằng:** `apps/api/test/rule-contract-sale-program.test.ts` (vectors qua hàm thuần + endpoint), `apps/api/test/nt-bh-003-ban-hang-chuong-trinh.test.ts` (BH12 → evaluate → phiếu bán → hạn mức trừ / trả), `apps/api/test/nt-bh-003-pos-khuyen-mai.test.ts` (module `pos`).
