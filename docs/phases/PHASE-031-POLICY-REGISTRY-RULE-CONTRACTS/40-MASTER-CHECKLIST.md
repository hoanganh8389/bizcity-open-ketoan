# PHASE-031 · 40 — Checklist
<!-- [2026-11-06 09:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — việc con S031-*, ca T031-*, log -->
<!-- [2026-11-07 09:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chủ dự án chốt tài liệu + bản mẫu ("ok, chốt mockup và tài liệu này, merge về main để code"); D031-11: Policy Registry là năng lực Core / Platform, không module nghiệp vụ riêng; màn chung ở Hệ thống → Chính sách -->
<!-- [2026-11-07 08:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — chủ dự án trả Q031-1..3: Policy Registry là trụ cột nền móng ngang MDG; L4b mặc định cảnh báo, POS tự động; online gọi endpoint, offline viết lại theo bản mô tả JSON ánh xạ từ Registry; ba yếu tố nhất quán cross-module · xuyên suốt · truy vết -->

Ký hiệu: ☐ chưa · 🟡 đang · ✅ xong · ⛔ chờ người ngoài nhóm.

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S031-1 | ADR-0031 đề xuất, README (hiện trạng đọc mã), [00](00-MASTER-PLAN.md), [10](10-THIET-KE.md), checklist | W0 | P0 | không | ✅ 2026-11-06 |
| S031-2 | Chủ dự án duyệt D031-0..11, trả Q031-1..3 | W0 | P0 | không | ✅ 2026-11-07 |
| S031-3 | Nhóm Lõi trả Q031-4, Q031-6; duyệt phần K2 (cửa nạp, Guard) | W0 | P0 | không | ⛔ nhóm Lõi |
| S031-4 | Migration phong bì Registry (chỉ thêm, RLS, trigger chặn sửa bản `published`) + `policies.register / publish / resolve` ở Platform | W1 | P0 | có | ✅ 2026-11-07 (#152) |
| S031-5 | Phiên bản chính sách mua hàng (`purchase_policy_versions` theo Q031-4), sửa = bản mới, đăng ký vào Registry `store: module` | W1 | P0 | có | ✅ 2026-11-07 (#152) |
| S031-6 | `policyTrace` của chứng từ mua ghi `code@version#hash`; màn chứng từ hiện bản đã áp | W1 | P0 | có | ✅ 2026-11-07 (#152) |
| S031-7 | Đánh chỉ mục khoá ngưỡng duyệt (`setting_values`, 16 §5) vào Registry với `approval.levels@1`, `store: settings` | W1 | P2 | có | ☐ sau DOC-030-4 |
| S031-8 | PR chốt thiết kế cửa nạp: `bizcity_ledger_intake@1` 1.6.0 (`policyRefs`, `policyRef`), JSON Schema, `ingestDocumentSchema` | W2 | P0 | không | ✅ 2026-11-07 (#153; đính chính #163) |
| S031-9 | Tầng L4b trong `preflight.ts` + Commit Guard băm `policyRefs`; `GateResult.ruleVersion` | W2 | P0 | có | ✅ 2026-11-08 (#159) |
| S031-10 | Họ mã `POL-*` (REF, EFF, STALE, EVAL, DATA, ACC, PUB) vào `bizcity_findings@1`, có căn cứ và câu giải thích | W2 | P0 | có | ✅ 2026-11-08 (#159) |
| S031-11 | Rule Contract `purchase.*@1` bọc `engine.ts` (không đổi kết quả; hồi quy mua hàng) | W2 | P1 | có | ☐ |
| S031-12 | Khoá `intake.policy.severity`, `intake.policy.mode` vào registry cấu hình (loại A, mặc định cho phép) | W2 | P1 | có | ✅ 2026-11-08 (#159) |
| S031-13 | API cho nguồn ngoài: `GET /api/v1/policies`, `GET /api/v1/rule-contracts[/:id]`, `POST /api/v1/policies/evaluate` (Q031-3), `POST /api/v1/policies` (phát hành inline) — quyền `catalog:read` / `settings:write`, **không** scope mới (sửa D-POL-9; [00 §9](00-MASTER-PLAN.md)); sự kiện outbox tách S031-26 | W3 | P0 | có | 🟡 giữ chỗ W3a 2026-11-08 (nhánh `feat/phase-031-w3a-api-chinh-sach`) |
| S031-14 | Kế toán trưởng xác nhận bảng `reasonCode` theo loại kết quả (Q031-5) | W3 | P0 | không | ⛔ kế toán trưởng |
| S031-15 | Rule Contract bán hàng `sale.price_list@1`, `sale.promo.discount@1`, `sale.promo.buy_x_get_y@1`, `sale.credit_limit@1` cùng `modules/ban-hang` (S030-16); `publishChecks` trần NĐ81 | W3 | P0 | có | ☐ sau S031-14 — `sale.promo.buy_x_get_y@1` làm trước ở W3a làm mẫu; còn price_list, discount, credit_limit, "áp riêng", trần NĐ81 |
| S031-16 | POS WP: tải chính sách, tính theo Rule Contract, gửi `policyRefs`; bỏ luật khuyến mại riêng của plugin (repo plugin, dòng CLAIMS riêng) | W3 | P1 | có | ☐ |
| S031-17 | Rulepack `policy` cho Conformance Engine (§9 của [10](10-THIET-KE.md)), chỉ đọc | W4 | P1 | có | ☐ |
| S031-18 | Màn *Chính sách* (phiên bản, phạm vi, chứng từ đã áp) + nút *Chính sách căn cứ* trên màn truy vết | W4 | P1 | có | ☐ |
| S031-19 | `nen-mong.json` / `NEN-MONG-DOANH-NGHIEP.md`: trụ cột 05 hai nửa, tín hiệu nửa Policy; `tru-cot.json` V theo Q031-1 | W4 | P1 | không | 🟡 phần tài liệu 2026-11-07 (V lên nền móng, 05 đổi tên, P-5..7); tín hiệu nửa Policy ở nen-mong.json khi W1 / W2a vào main |
| S031-20 | Hai cột `policy_refs`, `policy_check` trên `accounting_event_versions` (gộp migration S031-9) — [20 §2](20-TRUY-VET-VA-THEO-DOI.md) | W2 | P0 | có | ✅ 2026-11-08 (#159) |
| S031-21 | Khung nhìn `bizcity_read.policy_application` + hàm `policy_lineage(event_id)`; nhánh `UNION` mua hàng | W2 | P0 | có | ✅ 2026-11-08 (#159) |
| S031-22 | Nhánh `policy_review` trong `bizcity_read.document_queue`; action Ghi sổ / Đánh dấu đã xem / Trả về nguồn — [20 §3](20-TRUY-VET-VA-THEO-DOI.md) | W2 | P0 | có | ☐ tách khỏi W2a → W2c: nhánh `policy_review` đi cùng action *Đánh dấu đã xem* (xem 00 §8 đính chính) |
| S031-23 | Làn `policy` của `bizcity_lineage@1` (0.4.0-draft) | W4 | P2 | có | ☐ |
| S031-24 | Màn Theo dõi thực hiện chính sách (đọc khung nhìn); đo hiệu năng ở 1 triệu sự việc trước khi quyết materialized view | W4 | P1 | có | ☐ |
| S031-25 | Bản mẫu [mockups/chinh-sach.html](mockups/chinh-sach.html): Chính sách · Chờ kế toán xem · Truy vết · Theo dõi thực hiện; chủ dự án duyệt hướng | W0 | P0 | không | ✅ 2026-11-07 |
| S031-26 | Sự kiện miền `policy.published` / `policy.retired` qua outbox (khai ở `bizcity_event@1`); POS đổi từ hỏi `etag` sang nghe sự kiện | W3b | P1 | có | ☐ |
| S031-27 | ~~Đổi số migration W2a `0080` → `0082`~~ — **rút**: phiên PHASE-029 (K3) sửa trùng `0080` bằng cách đổi **số của K3** (`0081`, `0082`), migration W2a giữ `0080`; đổi W2a sang `0082` sẽ trùng `0082_khoa_ky_o_csdl` ([00 §9.7](00-MASTER-PLAN.md)) | W3a | P0 | không | ⛔ rút 2026-11-08 (phiên PHASE-029 đã nhận) |

## Ca bằng chứng (golden)

| ID | Ca | Đợt |
|---|---|---|
| T031-REG-1 | sửa nội dung bản `published` → bị chặn; đổi = phiên bản mới, bản cũ tự đóng ở `valid_from − 1` | W1 |
| T031-REG-2 | hai bản `published` chồng hiệu lực cùng phạm vi → không phát hành được | W1 |
| T031-MH-1 | đổi chiết khấu NCC giữa tháng: phiếu trước ngày đổi tính lại ra số cũ, `policyTrace` trỏ bản cũ | W1 |
| T031-RC-1 | `sale.promo.buy_x_get_y@1`: 2 A → 1 B; 4 A → 2 B (lặp); 3 A → 1 B; cùng bảng số cho bản TS và bản plugin | W3 |
| T031-RC-2 | `publishChecks`: giá trị quà 55 % giá A → chặn phát hành; 50 % → được (NĐ81 Điều 9) | W3 |
| T031-INT-1 | `sale` POS đúng SALE-PROMO-001@3 → L4b `pass`, ghi sổ, truy vết tới chính sách | W2 |
| T031-INT-2 | 2 A + 2 B → `POL-EVAL-001` `warn`; chế độ *gợi ý* vào hàng việc kèm bút toán dự kiến; chế độ *tự động* ghi | W2 |
| T031-INT-3 | POS offline gửi bản 2 khi bản 3 đã hiệu lực tại `docDate` → `POL-STALE-001`, sự việc không mất | W2 |
| T031-INT-4 | `reasonCode` của `treatment` chưa có trong chính sách định khoản tại ngày → `hold`, vào bể chờ, kích hoạt chính sách định khoản → bể tự kiểm lại | W2 |
| T031-INT-5 | băm `policyRefs` không khớp bản đã phát hành → `POL-REF-001` | W2 |
| T031-INT-6 | chính sách đổi giữa tiền kiểm và ghi → Commit Guard `IN-GUARD-001` | W2 |
| T031-INT-7 | nguồn cũ không gửi `policyRefs` → nhận như hôm nay, L4b `POL-REF-000` `info` | W2 |
| T031-TR-1 | mọi dòng sổ của sự việc có `policy_refs` đi ngược tới phong bì; băm khớp; 0 mồ côi | W2 |
| T031-TR-2 | chọn ngày D bất kỳ → đúng một bản hiệu lực mỗi khoá × phạm vi; đổi bản không tạo khoảng trống | W1 |
| T031-TR-3 | bảng theo dõi và rulepack `policy` đếm cùng một số trên cùng dữ liệu | W4 |
| T031-RC-3 | endpoint `evaluate` và bản viết lại theo mô tả JSON ra cùng kết quả trên cùng bảng số | W3 |

## Nhật ký

- 2026-11-06 — W0: chủ dự án đưa đề bài *"chính sách nghiệp vụ được quản lý tập trung tại module … plugin bên ngoài sử dụng chính sách đã phát hành … Conformance gate … phối hợp với Accounting Rules để dựng bút toán dự kiến trước khi ghi sổ … chính sách được quản trị tập trung, nhưng không bắt buộc tính toán tập trung"*. Rà mã origin/main `c8afd39`: mua hàng có engine chính sách thuần nhưng không phiên bản; bán hàng không có luật ở Core; tiền kiểm L1–L5 và Conformance Engine không kiểm chính sách nghiệp vụ; L5 chạy thử sẵn là bút toán dự kiến. Viết ADR-0031 (đề xuất), README, 00, 10, checklist. Chờ S031-2, S031-3.
- 2026-11-07 — chủ dự án trả **Q031-1** (trụ cột nền móng ngang MDG: *"quan trọng không kém master data … giữ chính sách xuyên suốt, liên quan đến định nghĩa nhiều hơn"*), **Q031-2** (L4b mặc định cảnh báo, POS tự động: đúng), **Q031-3** (online gọi endpoint, offline viết lại theo bản mô tả JSON ánh xạ từ Registry); chốt **ba yếu tố** của bộ: nhất quán cross-module · xuyên suốt · truy vết, kèm luật lean (D031-0). Thêm [20](20-TRUY-VET-VA-THEO-DOI.md) (tín hiệu đo ba yếu tố, truy vết bằng hai khung nhìn chỉ đọc, hàng việc = nhánh `policy_review` của `document_queue`, bảng theo dõi) và bản mẫu [chinh-sach.html](mockups/chinh-sach.html) bốn tab; S031-20..25, T031-TR-1..3, T031-RC-3; mã `POL-REF-000`.
- 2026-11-07 — chủ dự án hỏi có nên làm module chính sách riêng → không: năng lực Core / Platform, màn chung ở *Hệ thống → Chính sách* (D031-11). Chủ dự án *"ok, chốt mockup và tài liệu này, merge về main để code"*: ADR-0031 chấp nhận, S031-2 và S031-25 ✅, W0 xong. Bước tiếp: PR giữ chỗ CLAIMS cho W1 (S031-4..6); W2 cần PR chốt thiết kế cửa nạp (S031-8) và nhóm Lõi trả Q031-4, Q031-6.
- 2026-11-07 — W1 giữ chỗ: chữ chốt [00 §7](00-MASTER-PLAN.md) (migration 0079 `policy_registry` + `purchase_policy_versions`, `core/policies.ts`, `policyAt` trong engine, `policyTrace` có bản + băm; Q031-4 theo đề nghị). Tránh hai tệp đang có dòng giữ chỗ khác: `db/types.ts` (dùng `withTables`), `schema-catalog.ts` (để W4).
- 2026-11-07 — W1 bổ sung phạm vi giữ chỗ: `tests/conformance/lib/layers.mjs` (một dòng lớp cho `core/policies.ts`; SC-LAYER-1 chỉ ra khi chạy bộ kiểm trên mã W1). Code W1 đã viết ở máy, chưa đẩy, chờ PR bổ sung này vào main (R-FLOW-3).
- 2026-11-07 — W1 code xong trên nhánh: migration `0079_so_dang_ky_chinh_sach.sql`, `core/policies.ts`, phiên bản chính sách mua hàng (`savePolicy` → bản mới khi nội dung đổi; `policyAt` trong `policiesFor`; vết có `version` + `hash`; route versions; xoá → retired), web (ô áp từ ngày, lý do, khối Phiên bản, "bản N" trên phiếu), hướng dẫn `mua-hang-chinh-sach.md`. Golden T031-REG-1, T031-TR-2 (`policy-registry.test.ts`), T031-MH-1 (`mua-hang-chinh-sach-phien-ban.test.ts`) xanh; phá thử bỏ `policyAt` → T031-MH-1 đỏ đúng chỗ (phiếu 15/11 ra 50.000 thay vì 20.000).
- 2026-11-07 — chạy đủ bộ test API trên nhánh W1: 1526/1528 xanh; `db-rules` đỏ vì hai bảng mới chưa có nhóm trong `schema-catalog.ts` (chữ chốt W1 đánh giá sai: tưởng chỉ rơi vào nhóm "Khác"); `default-data` hết giờ do máy tải nặng, chạy riêng xanh. Chủ dự án cho phép **chỉ thêm** hai khoá vào `schema-catalog.ts` dù tệp thuộc dòng *mã số cha – con GĐ 1*. Cùng lúc phát hiện phần `layers.mjs` thêm ở #147 đã mất khỏi dòng W1 trên main (`b5af827`, gộp xung đột của #148 lấy bản cũ) → PR này khôi phục.
- 2026-11-07 — SC-FLOW-1 chặn hai dòng đang làm cùng giữ `schema-catalog.ts` (phép kiểm không có ngoại lệ theo dòng). Ghi **một nợ đã biết** vào `tests/conformance/baseline.json` (khoá `chong:main:feat/phase-031-w1-registry:…schema-catalog.ts`, `why` + `ref` ghi chủ dự án cho phép); nợ tự thành "đã sửa" khi một trong hai dòng nhả — PR cuối của W1 xoá mục nợ cùng lúc xoá dòng giữ chỗ.
- 2026-11-07 — S031-19 phần tài liệu theo Q031-1: `tru-cot.json` trụ cột V `role: nền móng` (ngang MDG), tên *Policy Registry & Rule Contracts — chính sách nghiệp vụ và chế độ kế toán có phiên bản*, thêm tiêu chí P-5 (nhất quán cross-module), P-6 (xuyên suốt), P-7 (truy vết) — đều `tai-lieu` tới khi W1 / W2a vào main; `nen-mong.json`, `NEN-MONG-DOANH-NGHIEP.md`, CANON: trụ cột 05 đổi tên, không đánh số lại.
- 2026-11-07 — dòng giữ chỗ W1 lại mất phần bổ sung (`layers.mjs`, `schema-catalog.ts`) khi #154 (`8ba8318`) gộp xung đột lấy bản cũ — lần thứ hai sau #148. Khôi phục trong PR S031-19; #154 cũng xoá dòng PHASE-028 · W5 đợt 2 và thêm lại dòng S030-40 đã xong — báo chủ dự án, không tự sửa dòng của phiên khác.
- 2026-11-07 — **W1 xong** (#152 merge): S031-4, S031-5, S031-6 ✅; golden T031-REG-1, T031-TR-2, T031-MH-1 xanh. Xoá dòng giữ chỗ W1 (R-FLOW-6) và mục nợ SC-FLOW-1 của nó ở `baseline.json`. `tru-cot.json` P-6 lên `mot-phan` (có mã trên main cho chính sách mua hàng).
- 2026-11-07 — W2 chia W2a / W2b. Chữ chốt W2a [00 §8](00-MASTER-PLAN.md): `bizcity_ledger_intake@1` §3.1 1.6.0-draft (`policyRefs`, `lines[].policyRef`), `IN-POL-001..003` (L4, warn, advice), khoá `bizcity.intake.policy_check` (`advice` | `strict` → `hold` sẵn có), migration 0080 (cột `policy_check`, khung nhìn `policy_application`, nhánh hàng việc `policy_review`), Commit Guard băm phong bì, mua hàng nộp kèm tham chiếu từ `policyTrace`. Đính chính 20 §2: tham chiếu nằm trong `payload`, không thêm cột `policy_refs`. Q031-6 trả: Kernel đọc qua `core/policies` (đúng chiều lớp). W2b (`IN-POL-000/004/005`) sau W3.
- 2026-11-07 — W2a bổ sung phạm vi giữ chỗ (phát hiện khi viết mã bằng nhan-viec kiem): `docs/contracts/BIZCITY-INTAKE-FINDINGS-v1.md` (bảng §3 phải khớp danh mục mã, SC-INTAKE-1) và `docs/huong-dan/ma-loi/README.md` (trang tra mã sinh tự động, SC-FIND-1). Chữ chốt 00 §8 đã nêu bảng §3 nhưng dòng giữ chỗ thiếu — sót của mình, không đổi thiết kế.
- 2026-11-07 — `docs/huong-dan/ma-loi/README.md` chồng `ma-loi/**` của S030-45 (SC-FLOW-1). Là tệp sinh tự động → ghi một nợ ở baseline.json có why / ref; hết khi một trong hai dòng nhả.

- 2026-11-08 — W2a code xong trên nhánh: `policyRefs` / `lines[].policyRef` ở khuôn nạp, `IN-POL-001..003` (+ remedy, căn cứ, bài học, bảng §3), `policy-check.ts` (một hàm cho tiền kiểm và cửa nạp), `policy_check` ở `accounting_events` / `accounting_event_versions` (0080), khung nhìn `bizcity_read.policy_application`, khoá `bizcity.intake.policy_check` (advice | strict → hold sẵn có), Commit Guard băm phong bì, mua hàng nộp kèm `policyRefs` từ `policyTrace`. Golden T031-INT-1, 3, 5, 6, 7, 8, 9 (`intake-policy-check.test.ts`, 11 ca xanh); phá thử bỏ `policyOnHold` → INT-8 đỏ, bỏ phần chính sách ở guard → INT-6 đỏ. Phát hiện và sửa khi viết mã: IN-POL-003 như chữ chốt đầu không bao giờ kích hoạt (xem 00 §8). S031-22 tách sang W2c.
- 2026-11-08 — **W2a xong** (#159 mã, #163 đính chính): S031-8, 9, 10, 12, 20, 21 ✅. Rà `main` sau merge: **hai `0080`** (W2a + K3 #165) → `R-DB-3` đỏ; bộ chạy khoá theo tên tệp nên không mất dữ liệu (sắp `0080_kiem…` trước `0080_nguoi…`). Chữ chốt W3a [00 §9](00-MASTER-PLAN.md): quyền `catalog:read` (không scope mới — sửa D-POL-9), mã ở `modules/system/` (không đụng `layers.mjs` / `contracts/index.ts`), `sale.promo.buy_x_get_y@1` đầu tiên, phát hành inline, đổi số migration → 0082 (S031-27). Nợ N031-1: dời Rule Contract xuống Platform khi W2b cần.
- 2026-11-08 — **S031-27 rút** khi gộp `main` vào #169: phiên PHASE-029 (K3) đã nhận sửa trùng `0080` theo quy ước *ai merge sau đổi số* — họ đổi **của họ** (`0081`, `0082_khoa_ky_o_csdl`), migration W2a giữ `0080`. Đổi W2a sang `0082` như bản chữ chốt đầu sẽ **trùng** `0082_khoa_ky_o_csdl`. W3a không còn đụng migration; bỏ T031-MIG-1; dòng giữ chỗ W3a bỏ hai đường dẫn migration. Bài học: trước khi sửa một lỗi dùng chung trên `main`, đọc `CLAIMS.md` mới nhất — có thể phiên khác đã nhận.
