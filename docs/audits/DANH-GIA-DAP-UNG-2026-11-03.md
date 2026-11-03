# Đánh giá mức đáp ứng: code so với tài liệu trên `main` — 2026-11-03 (DG-001)
<!-- [2026-11-03 10:27 PM Johnny Chu - Chu Hoàng Anh] DANH-GIA — bản đánh giá mức đáp ứng của code so với tài liệu main (bảng điểm, test, nạp 25 TH, đối chiếu sổ, checklist, CHANGELOG, độ phủ luật) -->

> **Câu hỏi:** code hiện tại đã đáp ứng các tài liệu (CANON, ADR, luật, hợp đồng, phase) đang nằm trên `main` chưa? Chỗ nào chưa, vì sao, ai quyết.
> **Đo ở:** `main` @ **`5f2f002`** (Merge PR #54, 2026-11-03 tối) cho phép kiểm tĩnh và đối chiếu tài liệu; test sản phẩm và nạp 25 TH đo ở `main` @ `1d142e5` **cộng hai thay đổi chưa vào `main`** (xem §8). Hai commit sau đó (R-FLOW) chỉ thêm tài liệu, `scripts/nhan-viec.mjs` và phép kiểm SC-FLOW-1, nên chưa chạy lại test sản phẩm.
> **Máy đo:** Windows 11, Node 24.15.0, PostgreSQL 16 (`ketoan-db-1`, cổng 5434), CSDL riêng cho từng lần đo (đã xoá sau khi đo). Mọi dữ liệu thử là dữ liệu giả.
> **Biên bản liền trước:** [VN-CONFORMANCE-BASELINE-2026-11-01](VN-CONFORMANCE-BASELINE-2026-11-01.md) (856 test, tuân chuẩn 97,9) · [REVIEW-2026-10-31-THUY](REVIEW-2026-10-31-THUY.md).

## Trả lời ngắn

**Đáp ứng tốt ở lớp đã có phép kiểm máy; chưa đáp ứng ở ba chỗ: độ phủ luật, chạy kiểm lúc chạy thật (runtime), và các ADR còn "đề xuất".**

| Câu hỏi | Kết luận |
|---|---|
| Sổ kế toán có đúng không? | **Đạt.** Nạp 25 trường hợp mua hàng qua API: 116/119 sau từng case, 113/119 khi xong (đúng mốc biên bản 2026-10-31). Nợ = Có = 4.774.840.842; công nợ ↔ 331 lệch 0; kho ↔ 156 lệch 0; làm tròn 0. |
| Kiến trúc có theo "bốn câu không thương lượng"? | **Phần lớn.** Ba câu có phép kiểm đạt (sổ chỉ thêm, đi qua cửa nạp, một cửa ghi). Câu 4 (không viết số tài khoản trong code định khoản) **còn 2 nợ cũ** ở SC-KERNEL-5. |
| Theo tôn chỉ ADR-0020? | **Một phần.** "Một ngôn ngữ là thư viện mã" đạt (SC-FIND-1/2 = 100). "Không mã hoá quy trình theo chức danh" còn **4 chỗ kiểm theo tên vai trò** (§2, dòng 1). |
| Phép kiểm tự động? | **ĐẠT**: tuân chuẩn **98,7 (A)**, 54 đạt · 8 nợ cũ · 1 cảnh báo · 0 hỏng. Nhưng **độ phủ luật chỉ 42 (F)** và **lane runtime (40 phép CONF-RUN) chưa nối vào bảng điểm**. |
| Lộ trình? | **70%** tổng; Phase 3 gần xong (97%), Phase 4 đang 46%, **Phase 5 = 0%** (chưa bắt đầu). |
| Tài liệu có theo kịp code? | **Phần lớn.** 67/68 commit tính năng có dấu vết ở CHANGELOG; checklist PHASE-014/021/024/025 khớp mã. **Lệch**: PHASE-013 (đã sửa kèm biên bản này), 2 năng lực còn `planned` dù đã có mã, tài liệu API viết tay chỉ phủ 49% đường dẫn (OpenAPI tự sinh phủ đủ). |

## 1. Số đo

### 1.1 Phép kiểm tĩnh (`node tests/conformance/selfcheck.mjs --strict`, `main` @ `5f2f002`)

| Chỉ số | Kết quả |
|---|---|
| Tuân chuẩn (conformance) | **98,7 — A** |
| Sẵn sàng Standard v1 | **77,2 — C** (49/60 năng lực `available`; ca chuẩn Hợp đồng đủ 49/49 năng lực cần) |
| Độ phủ luật | **42 — F** (xem §5) |
| Lộ trình | **70%** · Ma trận tuân thủ **77%** (4 đạt, 5 một phần, 0 thiếu) |
| Kết quả | **ĐẠT** — 54 đạt · 8 nợ cũ · 1 cảnh báo (SC-SEC-4: 15 GitHub Action chưa ghim SHA) · 0 không đạt · 3 chưa có năng lực · 38 bỏ qua |
| Kèm | `--self-test` ĐẠT · `scripts/kiem-chuan.sh` ĐẠT · số migration/ADR không trùng · typecheck 0 lỗi |

**38 phép bỏ qua** là 40 phép của cổng `CONF-RUN` (kiểm lúc chạy thật) và lane CSDL: bảng điểm không có điểm cho cổng này (`score = null`). Việc lộ trình 4.3 "Bộ kiểm đủ CONF-*: lane runtime" đang **0%**.

### 1.2 Test sản phẩm (`apps/api`, vitest, PostgreSQL thật, mỗi lần một CSDL mới)

| | |
|---|---|
| Kết quả | **1205 đạt · 0 hỏng · 11 bỏ qua** (156 tệp). Số 11 bỏ qua là ca chuẩn `golden-hop-dong`, có chủ đích. |
| Chú ý khi chạy | Hai tệp mới (`item-master.test.ts`, `batch-action.test.ts`) cần **quyền chủ CSDL** (`SET session_replication_role`, `CREATE TABLE`). Chạy với `DB_SET_ROLE=ketoan_app` thì 10 ca báo `permission denied`; chạy bằng quyền chủ thì 20/20 đạt. Các tệp còn lại đạt ở cả hai chế độ. |
| Tệp chết worker | Có lần 1 đến 2 tệp báo "pending" vì worker chết (máy tải); chạy riêng lại đều đạt. |

### 1.3 Đúng-sai kế toán: nạp 25 trường hợp mua hàng + đối chiếu (CSDL sạch, đơn vị mới)

| Kiểm | Kết quả |
|---|---|
| Số "mong đợi" của kịch bản | **116/119** ngay sau từng case · **113/119** khi nạp xong cả 25 (3 số lệch là TH15, TH16, TH22: 25 case dồn chung một sổ, cùng NCC — đã giải thích ở biên bản 2026-10-31) |
| Cân sổ | Nợ **4.774.840.842** = Có **4.774.840.842**, lệch 0 |
| Công nợ phải trả ↔ 331 theo đối tượng | 5 NCC, **lệch 0** |
| Kho ↔ 156 | 3.222.591.372 = 3.222.591.372, **lệch 0** |
| Làm tròn / mã hàng / ĐVT | 0 dòng sai |
| Sổ hoá đơn ↔ 133 | **Lệch 64,45 triệu** (14 phiếu chưa có số hoá đơn vẫn ghi 133): chính sách đã biết, chờ chủ quyết (không phải lỗi mới) |
| Lane chẩn đoán (CSDL) | 31 đạt · 0 hỏng · 7 cảnh báo do dữ liệu kịch bản (DG-EINV-1 hoá đơn thiếu ký hiệu; DG-VAT-2 mua trên 5 triệu chưa chứng từ không tiền mặt; DG-TAX-1 thuế đầu vào chưa có hoá đơn; DG-ACC-1 tài khoản dư bên ngược; DG-CLOSE-1 kỳ chưa khoá; DG-PROFILE-1 chưa khai hồ sơ kế toán) và DG-SEC-2 (lane chạy bằng tài khoản chủ CSDL, không phải vai trò ứng dụng). Bất biến xanh: cân sổ, chuỗi băm bằng chứng, trigger sổ chỉ thêm, RLS, tồn kho âm, công nợ ↔ sổ. |

Định khoản thử (L5, PHASE-021) đã chạy trên 20 chứng từ thật đã ghi sổ của kịch bản này: **sổ không đổi** ở mọi chỉ số (sự việc, bút toán, dòng sổ, outbox, nhật ký định khoản). *Phép đo này làm ở đợt đo trước (`main` cũ hơn vài giờ), chưa lặp lại ở đợt này.*

## 2. Mức đáp ứng theo nhóm tài liệu

Mức: **Đạt** = có phép kiểm tự động xanh hoặc đối chiếu trực tiếp; **Một phần** = đạt một phần hoặc chỉ kiểm tay; **Chưa** = chưa có mã.

| # | Tài liệu / yêu cầu | Mức | Bằng chứng và chỗ lệch |
|---|---|---|---|
| 1 | **Tôn chỉ Core** ([CANON §0](../00-CANON.md), [ADR-0020](../adr/ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md), R-GATE-9/10/11) | **Một phần** | Đạt: mã nào cũng có `basis` và dựng từ thư viện mã (SC-FIND-1/2 = 100; trang tra mã 49 mã). **Lệch §5 "không theo chức danh"**: `packages/platform/src/documents/signature.routes.ts:39-40` (ô ký theo vai `chief_accountant`/`director`), `:116` và `core/documents.ts:233` (huỷ ký: "chủ đơn vị"), `modules/system/devtools.routes.ts:51` (chế độ Vận hành: "chỉ chủ"). Đề xuất đổi sang quyền (xem §7). |
| 2 | **Bốn câu không thương lượng** ([AGENTS.md](../../AGENTS.md)) | **Một phần** | (1) không sự việc, không bút toán: ma trận C-1 67%; (2) sổ chỉ thêm: trigger đạt (DG-DB-2), SC-KERNEL-1 đạt, C-3 33% vì tín hiệu `DG-*` chưa đo ở lane tĩnh; (3) đi qua cửa nạp: SC-MOD-1/2 đạt, 0 nợ; (4) không viết số tài khoản: **SC-KERNEL-5 còn 2 nợ cũ**. |
| 3 | **Action / bằng chứng / idempotency** ([BIZCITY-ACTION-v1](../contracts/BIZCITY-ACTION-v1.md), [EVIDENCE](../contracts/BIZCITY-EVIDENCE-v1.md)) | **Đạt** | SC-ACT-1 **chặn**, 208/208 thao tác ghi qua `defineAction`, **0 route ghi thô** (17 route cố ý giữ, có lý do). Chuỗi băm bằng chứng liền (DG-EVD-1 đạt). |
| 4 | **Sổ cái, định khoản, khoá kỳ** ([RULE-LEDGER](../rules/RULE-LEDGER.md), R-POST) | **Đạt** | §1.3; ma trận C-4 (khoá kỳ), C-5 (nhất quán), C-8 (kiểm toán), C-9 (đổi chế độ) = 100%. C-6 lưu trữ 60%, C-7 phân quyền ghi sổ 67%. |
| 5 | **Trạm tiền kiểm / hai cổng kiểm chuẩn** ([ADR-0014](../adr/ADR-0014-tram-tien-kiem-be-cho-dau-vao.md), [ADR-0019](../adr/ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md), PHASE-021) | **Đạt** (phần mã) | 23/26 việc ✅. Còn 3: S021-17 (thực tập sinh thử thật, cần người), S021-4 (chốt khoá theo ngày), S021-21 (người dùng đọc lại bài học, không còn là điều kiện chặn theo ADR-0020). |
| 6 | **Item Master, định danh bất biến** ([ADR-0017/0018](../adr/ADR-0017-dinh-danh-hang-hoa-bat-bien.md), PHASE-024) | **Một phần** | Có mã: migration 0065/0066, Item Resolver, `item_id` ở sổ/kho. Checklist 6/32 ✅ (đang B2). **Lệch**: năng lực `item.master` và `item.validation` vẫn **`planned`** trong `bizcity-standard.json` dù đã có mã song song với `products` (chưa thay thế). |
| 7 | **Accounting Continuity** ([ADR-0021](../adr/ADR-0021-accounting-continuity-lien-tuc-ke-toan.md), [R-CONT](../rules/RULE-CONTINUITY.md), PHASE-025) | **Một phần** | ADR còn **Đề xuất**. Đã có W1 chỉ đọc (truy vết, màn ACC95, "Vì sao giá vốn này?"); 2/18 ✅. Đã kiểm trong mã: chưa có `valuation_layers` / `cost_allocations`, chưa có mã `CT-*` hay Gate C chặn khoá kỳ. |
| 8 | **Quản trị dữ liệu gốc** ([ADR-0022](../adr/ADR-0022-quan-tri-du-lieu-goc-nen-mong.md), PHASE-026) | **Chưa** | ADR **Đề xuất**; mới có tài liệu W0 (1/18). Theo mô tả của ADR-0022 (mục Vấn đề): đối tượng, chi nhánh, kho, tài khoản vẫn chỉ `id` + `code` sửa được, chưa có nhóm đơn vị hay loại trừ nội bộ. |
| 9 | **Kiểm chuẩn pháp lý Việt Nam** (PHASE-020, [R-VNC](../rules/RULE-VN-CONFORMANCE.md)) | **Một phần** | 14/24; Engine, hồ sơ kế toán, rulepack GTGT/hoá đơn chạy. Chờ chủ duyệt D020-1..6. |
| 10 | **Module hoá** ([RULE-MODULE-BOUNDARY](../rules/RULE-MODULE-BOUNDARY.md), PHASE-011/013/014) | **Một phần** | SC-MOD-1 đạt, SC-MOD-2 và SC-LAYER-2 về 0 nợ; `@bizcity/ui-kit` và slot có. **Nhưng** thư mục `modules/` mới có `mua-hang/domain`; mã phân hệ vẫn ở `apps/api/src/phan-he/*` (9 thư mục). Tiêu chí lộ trình 3.9 đạt bằng phép kiểm, chưa bằng việc chuyển thư mục. |
| 11 | **Sao lưu PITR** (PHASE-008, R-BAK) | **Một phần** | 1/4 ✅; R-BAK-1 và R-BAK-3 là luật Tier 0 chỉ kiểm tay. |
| 12 | **Standard v1 / CLI / ca chuẩn** (PHASE-014) | **Một phần** | CLI, template, AGENTS cho module có; **chưa** chạy ca chuẩn Hợp đồng 3 lần (4.5), **chưa** Standard 1.0.0 (4.6), lane runtime 0% (4.3). |
| 13 | **Hệ sinh thái** (PHASE-015/016/017: Cell, WordPress, tải lớn, beta) | **Chưa** | 0/16 việc; Phase 5 lộ trình 0%. |
| 14 | **Quy trình nhận việc** ([RULE-FLOW](../rules/RULE-FLOW.md), mới) | **Đạt** | SC-FLOW-1 chặn, đạt; `scripts/nhan-viec.mjs`. Có 1 dòng giữ chỗ lỗi thời (§7). |

## 3. Lộ trình theo phase (bảng điểm, `docs/standard/roadmap.json`)

| Phase | Nội dung | Tiến độ | Việc xong / tổng |
|---|---|---|---|
| 0 | Chốt chuẩn | 68% | 3 / 7 |
| 1 | Audit, phân lớp | 60% | 3 / 5 |
| 2 | Kernel, Data, Document, Action | 89% | 19 / 23 |
| 3 | Module SDK, manifest, permission, event | 97% | 17 / 18 |
| 4 | AGENTS.md, CLI, template, bộ kiểm | 46% | 3 / 8 |
| 5 | Kiểm chứng CRM/kho, Cell, WordPress | **0%** | 0 / 10 |

**Ba cảnh báo "trái thứ tự"** (2.3, 2.16, 2.17 đang xong nhưng 2.1 mới 50%): việc 2.1 "một cửa ghi sổ" có hai tín hiệu; `SC-KERNEL-3` đạt, `DG-EVENT-4` (sự việc nội bộ có `posted_version = version`) thuộc lane CSDL nên lane tĩnh coi là "chưa đo". Lane CSDL trả "đạt rỗng" (0 dòng) vì dữ liệu thử không có kết chuyển, giá vốn, khấu hao. Muốn 2.1 lên 100% cần một lượt đo có dữ liệu loại này.

## 4. Checklist theo phase (đếm từ `40-MASTER-CHECKLIST.md` của từng phase)

| Phase | Tên | ✅ / tổng | 🟡 | ☐ | ⛔ | Tiến độ README |
|---|---|---|---|---|---|---|
| 001 | Chốt chuẩn | 6 / 11 | 2 | 1 | 2 | 68% |
| 002 | Audit, phân lớp | 3 / 5 | 0 | 1 | 1 | 60% |
| 003 | Action, bằng chứng, MCP đọc | 14 / 15 | 1 | 0 | 0 | 100% |
| 004 | Một cửa ghi sổ | 11 / 11 | 0 | 0 | 0 | 50% |
| 005 | Chính sách có phiên bản | 6 / 8 | 1 | 1 | 0 | 100% |
| 006 | Outbox sự kiện | 9 / 9 | 0 | 0 | 0 | 100% |
| 007 | Cô lập đơn vị (RLS) | 6 / 7 | 0 | 0 | 1 | 100% |
| 008 | Sao lưu PITR | 1 / 4 | 2 | 0 | 1 | 50% |
| 009 | MCP ghi | 4 / 5 | 0 | 0 | 1 | 100% |
| 010 | Tách gói Kernel | 3 / 3 | 0 | 0 | 0 | 100% |
| 011 | Module SDK | 11 / 14 | 2 | 1 | 0 | 95% |
| 012 | Gói định khoản, workflow | 4 / 4 | 0 | 0 | 0 | 100% |
| 013 | ui-kit, chuyển module | 0 / 2 | 1 | 1 | 0 | 75% → **cập nhật cùng PR này** |
| 014 | CLI, template, ca chuẩn | 7 / 13 | 3 | 2 | 1 | 52% |
| 015 | Cell, WordPress | 0 / 5 | 0 | 4 | 1 | 0% |
| 016 | Tải lớn, adapter | 0 / 6 | 0 | 6 | 0 | 0% |
| 017 | Beta hệ sinh thái | 0 / 5 | 0 | 5 | 0 | 0% |
| 018 | Giám sát vận hành, toàn vẹn sổ | 17 / 20 | 0 | 1 | 2 | — |
| 019 | Bàn điều tra cho nhà phát triển | 16 / 19 | 2 | 0 | 0 | — |
| 020 | Kiểm chuẩn pháp lý Việt Nam | 14 / 24 | 2 | 7 | 1 | — |
| 021 | Trạm tiền kiểm đầu vào | 23 / 26 | 1 | 2 | 0 | 100% |
| 022 | Giả định lỗi, Bàn đánh giá theo vai | 11 / 16 | 4 | 1 | 0 | — |
| 023 | Thẻ tài khoản | 3 / 18 | 4 | 10 | 1 | 0% |
| 024 | Item Master, phân loại hạch toán | 6 / 32 | 5 | 19 | 2 | 0% |
| 025 | Accounting Continuity | 2 / 18 | 2 | 14 | 0 | 0% |
| 026 | Quản trị dữ liệu gốc | 1 / 18 | 2 | 15 | 0 | — |
| 027 | Core kế toán cho dev | 0 / 9 | 1 | 7 | 1 | — |
| | **Cộng** | **178 / 327** | **35** | **98** | | |

Ghi chú: "Tiến độ README" tính từ **việc lộ trình** (tín hiệu bộ kiểm), checklist đếm **việc con**; hai số khác bản chất nên có phase 100% mà checklist chưa hết (PHASE-021: còn việc cần người) hoặc ngược lại (PHASE-004: 11/11 ✅, tiến độ 50% do §3). Phase mới (023 đến 027) chưa khai việc lộ trình nên cột này `0%` hoặc `—`.

## 5. Độ phủ luật và nợ

| Chỉ số | Số đo |
|---|---|
| Luật `R-*` | **270**; tự động **123 (45,6%)** · phần còn lại là kiểm tay, kế hoạch hoặc chưa kiểm |
| Chuẩn `STD-*` | 96; ánh xạ sang `CONF-*` 44; tự động 26 |
| `CONF-*` | 46; đã hiện thực 23 |
| **Luật Tier 0 chỉ kiểm tay (17)** | `R-DB-14/15/17/18/19`, `R-CACHE-1/4`, `R-OUTBOX-1/2`, `R-BAK-1/3`, `R-KER-7`, `R-REL-4/5`, `R-SIG-3/6`, `R-VNC-7` |
| Năng lực | 49/60 `available`; 11 `planned`: `item.master`, `item.validation` (P2), `ui.account-card` (P4), Cell/OCR/marketplace (P5), `production`, `payroll`, `fx` (P6) |

**Nợ cũ (baseline) — 160 phát hiện ở 8 phép kiểm** (nợ mới phải sửa, không đưa vào baseline):

| Phép kiểm | Nợ | Ý nghĩa |
|---|---|---|
| SC-DATA-3 | 136 | bảng/cột thiếu `COMMENT ON` (R-DB-5) |
| SC-API-3 | 12 | route chưa khai `requirePermission` (R-API-6) |
| SC-DATA-5 | 4 | bảng nghiệp vụ thiếu `tenant_id` (chặn RLS đủ) |
| SC-EVD-1 | 3 | còn ghi nhật ký nghiệp vụ ra tệp (A-18) |
| SC-KERNEL-5 | 2 | luật định khoản còn viết cứng số tài khoản (R-POST-2) |
| SC-API-2, SC-CON-7, SC-DATA-1 | 1 mỗi phép | `z.coerce.boolean`, biến môi trường chưa khai, migration hở số |

## 6. Tài liệu ↔ code

| Phép đo | Kết quả |
|---|---|
| **CHANGELOG ↔ commit** (68 commit `feat`/`refactor`/`fix` từ 2026-11-01) | **67/68** có dấu vết. Thiếu: `feat(SDTC, NHOM)` (sơ đồ tổ chức, đóng góp) — việc cho người đóng góp, không tự thêm thay. |
| **Hợp đồng ↔ bảng chuẩn** | SC-CON-4 đạt: phiên bản mỗi hợp đồng khớp `bizcity-standard.json`. |
| **Checklist ↔ mã** (PHASE-014, 021, 024, 025) | Khớp (chủ dự án cập nhật sát: S014-13 ✅ "0 route ghi thô"; PHASE-024 ghi B2a/B2b đúng migration 0065/0066). |
| **Checklist PHASE-013** | **Lệch** (từ 2026-10-30): S013-1 còn `☐` nhưng `@bizcity/ui-kit` và slot đã có (PHASE-014 W2/W4); S013-2 `🟡` đúng nhưng văn bản trạng thái ở README đã cũ. **Sửa cùng PR này.** |
| **Năng lực ↔ mã** | Lệch 2: `item.master`, `item.validation` còn `planned`. Quyết định `partial`/`available` thuộc chủ (B2c, B3 chưa xong). |
| **Đường dẫn HTTP ↔ tài liệu viết tay** | 188/385 (49%) đường dẫn được nhắc; **OpenAPI tự sinh từ schema phủ đủ**. Nhóm thiếu nhiều nhất: `/reports` 37, `/purchase` 20, `/assets` 12, `/stock` 11, `/org-units` 8. Không có luật bắt buộc viết tay cho mọi route (ngoài chứng từ ở `docs/api/`). |
| **Action ↔ tài liệu theo mã** | 264 action trong code; 58 được nhắc theo `id` ở `docs/`/CHANGELOG. Cùng ghi chú như trên. |
| **Bảng giữ chỗ** | [CLAIMS.md](../phases/CLAIMS.md) có 1 dòng lỗi thời: "W6 đợt 4 — `ctx.meta` + route đối tượng (PR #50)", nhánh `feat/phase-014-w6-meta` đã xoá (§7). |

## 7. Việc mở, xếp theo ưu tiên

| Ưu tiên | Việc | Ai quyết / làm | Căn cứ |
|---|---|---|---|
| **P0** | Duyệt hoặc sửa ADR-0021 (Continuity) và ADR-0022 (MDG): đang **Đề xuất** nhưng PHASE-025/026 đã mở và có mã đọc | Chủ dự án | §2 dòng 7, 8 |
| **P0** | Nối **lane runtime** vào bảng điểm: 40 phép CONF-RUN đang `score = null`; việc 4.3 = 0% | Nhóm Lõi (PHASE-014) | §1.1 |
| **P0** | Trả **SC-KERNEL-5** (2 chỗ viết cứng số tài khoản) — vi phạm câu không thương lượng số 4 | Nhóm Lõi | §2 dòng 2 |
| **P0** | Chuẩn hoá ADR-0020 §5: chuyển 4 chỗ kiểm theo tên vai trò sang quyền; **chốt `ctx.meta`** (hình dạng + khoá lõi không bị đè) trong [BIZCITY-ACTION-v1](../contracts/BIZCITY-ACTION-v1.md) trước khi sửa mã (R-FLOW-2) | Chủ dự án chốt; Nhóm Lõi làm | §2 dòng 1, §8 |
| P1 | Sao lưu PITR: hoàn R-BAK-1/3 (Tier 0 chỉ kiểm tay), diễn tập khôi phục có biên bản | Vận hành | §5 |
| P1 | 4 bảng thiếu `tenant_id` (SC-DATA-5) để RLS phủ đủ; 12 route thiếu `requirePermission` (SC-API-3); 3 chỗ nhật ký ra tệp (SC-EVD-1) | Nhóm Lõi | §5 |
| P1 | Đổi trạng thái năng lực `item.master`/`item.validation`; chạy ca chuẩn Hợp đồng 3 lần (4.5) rồi cân nhắc Standard 1.0.0 (4.6) | Chủ dự án | §2 dòng 6, 12 |
| P1 | **Dòng giữ chỗ lỗi thời** ở CLAIMS.md ("W6 đợt 4 … PR #50"): xoá (R-FLOW-6) hay giữ cho phiên đang gộp? | Chủ dự án | §6 |
| P2 | Phân hệ mua hàng (Thủy): **bộ nạp 25 TH** (`scripts/mua-hang/nap-25-truong-hop.mjs`) chưa gửi `Idempotency-Key` cho các lệnh ghi và cần khai trước nhãn `63`/`34`, nhóm `221` trong `item_classes` (đo này phải dùng bản sao tạm); CHANGELOG cho commit sơ đồ tổ chức; chuyển `phan-he/mua-hang` sang `modules/` | Người đóng góp, Nhóm Lõi rà (R-REV) | §2 dòng 10, §6 |
| P2 | Tài liệu viết tay cho `reports`, `purchase`, `assets`, `stock`, `org-units` (hoặc xác nhận OpenAPI là nguồn duy nhất) | Nhóm Lõi / chủ dự án | §6 |
| P2 | Hướng dẫn chạy test: hai tệp cần quyền chủ CSDL — ghi vào [AGENTS.md](../../AGENTS.md)/`tests/conformance/README.md` | Nhóm Lõi | §1.2 |

## 8. Thay đổi đã chuẩn bị nhưng **chưa vào `main`** (chờ giữ chỗ theo R-FLOW)

Hai thay đổi nằm ở nhánh cục bộ chưa đẩy `wip/chuan-hoa-adr0020-va-ctx-meta`, vì R-FLOW-1/2 đòi giữ chỗ và chữ chốt vào `main` trước khi đẩy mã:

1. **Chấp nhận cảnh báo đầu vào theo quyền `intake:accept`** thay `bizcity.intake.accept_roles` (danh sách chức danh) — theo ADR-0020 §5. Gồm: quyền mới ở `core/auth.ts`, action `core.intake.accept`, nút ở Trạm kiểm tra, bỏ khoá khỏi sổ cấu hình, sửa câu chữ phương án/bài học/hướng dẫn, hợp đồng `bizcity_intake_findings` 0.9.0-draft, `RULE-TENANT-SECURITY`, test.
2. **`ctx.meta` đè được khoá lõi `idempotency` và `dryRun`** (chỉ `requestId` và `receipt` được giữ, trái comment "khoá lõi không bị đè"). Có test tái hiện và sửa tối thiểu ở `packages/platform/src/core/actions.ts`. Đụng API dùng chung nên cần chữ chốt trước.

Nhánh `feat/phase-014-w6-meta` (đợt 4 trùng với `main`) đã **xoá** theo yêu cầu của chủ dự án.

## 9. Cách tái lập

```bash
git fetch --all --prune && git checkout origin/main && npm install
npm run build -w @ketoan/contracts && npm run build -w @bizcity/mua-hang-domain
node tests/conformance/selfcheck.mjs --strict          # §1.1
node tests/conformance/selfcheck.mjs --self-test && bash scripts/kiem-chuan.sh
npm run typecheck && npm run build -w @ketoan/web
# test sản phẩm trên CSDL riêng (tên có "test"); hai tệp item-master, batch-action cần quyền chủ CSDL
DATABASE_URL=postgres://<user>:<pw>@localhost:5434/ketoan_test_dg node node_modules/vitest/vitest.mjs run   # trong apps/api
# §1.3: seed đơn vị mới, khai item_classes (brand 63, 34; group 221), PUT 3 mặt hàng gốc, posting-modes = auto,
#   rồi scripts/mua-hang/nap-25-truong-hop.mjs (NAP_CHAY=1) và psql -v tenant=<mã> < scripts/doi-chieu-ke-toan.sql
node tests/conformance/selfcheck.mjs --lane diagnostics --psql "docker exec -i ketoan-db-1 psql -U <user> -d <db>"
```
