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
