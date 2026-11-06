# PHASE-030 · 15 — Kinh nghiệm cốt lõi: chuẩn hoá gì, cái gì thuộc nền tảng, Accounting Kernel học được gì
<!-- [2026-11-06 01:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — đợt đọc thứ hai: cơ chế xuyên suốt của Erp-vn (46 addon) × thành phần nền của open-ketoan; rút kinh nghiệm, phân tầng Kernel / Platform / SDK / module / gói dữ liệu, chuẩn STD-030-*, đề xuất K-030-7..12 và P-030-1..8 -->

> Đọc trước: [20 — mẫu thiết kế theo nghiệp vụ](20-MAU-THIET-KE.md) nói *từng nghiệp vụ* học gì. Tài liệu này nói **cái nằm dưới mọi nghiệp vụ**: cơ chế dùng chung, chỗ nó phải sống, và luật để module viết sau vẫn tái dùng được, nhất quán, truy vết được.
>
> Cách đọc: mỗi nhận định có **bằng chứng tệp:dòng** ở cả hai repo (Erp-vn tính từ `erp/addons/`, open-ketoan tính từ gốc repo). Không chép mã (D030-1).

## 0. Mười câu

1. **Thứ đáng giá nhất của một ERP không nằm ở nghiệp vụ, mà ở 6 cơ chế dưới nghiệp vụ**: một cửa ghi sổ có khoá nguồn, sửa = đảo + ghi lại, tham số có ngày hiệu lực, nhật ký chuỗi băm, bộ đối soát sổ ↔ sổ chi tiết, và chia tiền không lệch đồng. Erp-vn làm tốt cả 6, và đó là lý do 173 nghiệp vụ của nó chạy được.
2. **Erp-vn hỏng ở chỗ không có lớp chứng từ chung**: 79 trường `state` tự khai, 94 lần khai `company_id` bằng tay, 76 lần ghi đè `write`, 31 cờ ngữ cảnh "bỏ qua kiểm" khác nhau. Mỗi module tự làm lại trạng thái, đánh số, duyệt, khoá sửa — và mỗi nơi làm khác nhau một chút.
3. **Tài khoản viết cứng là nợ lớn nhất**: `'3311'` xuất hiện 25 lần, `'112'` 30 lần, `'334'` 23 lần trong 21 module Erp-vn. open-ketoan có `AccountResolver` nhưng **cũng đã rò**: `modules/mua-hang/domain/src/engine.ts:867` khai `ACC = { stock:'1561', vatIn:'1331', payable:'3312', … }`.
4. **Hàm chia tiền phải có đúng một bản**: Erp-vn có `allocate` chuẩn (`lfood_voucher/models/tools.py:5`) mà vẫn bị viết lại 3 kiểu khác (`lfood_costing/models/calc.py:28` dồn dư vào phần lớn nhất, khoản vay dồn vào kỳ cuối, tách VAT tài sản). open-ketoan có 2 cách chia tiền khác nhau: `modules/mua-hang/domain/src/engine.ts:514` `allocate` (dư lớn nhất; `spreadOverMany` ở `phan-he` gọi lại nó) và `apps/api/src/modules/assets/depreciation.ts:140,163` `splitByDays` / `splitByPercent` (làm tròn từng phần, phần cuối nhận còn lại — có ca ra **phần âm**, xem [18 §4.3](18-THU-VIEN-TIEN.md)); cộng một bản chia lượng (`modules/mua-hang/domain/src/ton-max.ts:214` `allocateTransfers`). Hai module chia cùng một khoản ra hai con số khác nhau là lỗi đối soát không ai bắt được.
5. **Tham số có ngày hiệu lực là xương sống của tính đúng luật**: 21/46 addon Erp-vn đọc `lfood.legal.param.get_value(code, date)`. Nhưng có 3 lỗi đáng học: không theo pháp nhân, `default=` cứng che mất thiếu seed (ngưỡng tiền mặt mặc định `0` ở một chỗ, `5.000.000` ở năm chỗ), và chế độ mô phỏng chỉ lương dùng. open-ketoan **chưa có** lớp này (`setting_values` E2 mới là hợp đồng — xem §7).
6. **Khoá kỳ chỉ ở sổ cái là không đủ**: Erp-vn chặn ở `lfood.move._check_lock`, nên phiếu kho / hồ sơ nhân sự không ghi sổ vẫn lùi ngày vào kỳ đã khoá; wizard khoá kỳ chỉ đếm nháp ở 4/23 module ghi sổ. open-ketoan chặn ở `ledgerService.post` **và** có `dataLock` theo ngày (`platform/core/date-rules.ts`) — tốt hơn, nhưng module mới phải dùng cả hai.
7. **Duyệt là chính sách, không phải `if has_group`**: Erp-vn có 18 hàm duyệt / từ chối tự viết, 92 lời gọi `has_group` cứng, không một kiểm "người lập ≠ người duyệt", `reject` nơi về `draft` nơi thành `refused`. open-ketoan có workflow YAML (`sod`, `levels`, `requires:[reason]`) và engine authz PHASE-028 — nhưng engine **chưa được nối** (chỉ test gọi), ngưỡng cấp 2 nằm rải ở `payment_request_settings`, `purchase_policies`.
8. **"Bản đang sửa / bản lên báo cáo" là ý thiết kế hay nhất** (`lfood_voucher/models/voucher.py:234-299`, `lfood_ledger/models/sources.py:40-53`): sửa không đổi báo cáo cho tới khi đẩy con trỏ; đẩy thì đảo bút toán cũ + ghi bút toán mới cùng khoá nguồn. Erp-vn chỉ làm cho **một** loại chứng từ. open-ketoan có nền ở Kernel (`accounting_event_versions`, `posted_version`) cho **mọi** sự việc — nên tổng quát hoá ở đó.
9. **Bộ đối soát là bài kiểm đáng tiền nhất**: `erp/tests/data_consistency.py` 15 phép (kho = 156/152, 131 = hoá đơn mở, 334 = lương thực trả, 3335 = TNCN khấu trừ, B02 lãi = 4212…). open-ketoan đã có `scripts/doi-chieu-ke-toan.sql` + `assertLedgerInvariants` sau mỗi tệp test — đây là nền của golden test ([60](60-GOLDEN-TESTS.md)), phải mở rộng theo từng sổ chi tiết mới (lô, lương, tạm ứng, tỷ giá).
10. **Danh mục nghiệp vụ phải là dữ liệu, không phải tài liệu**: Erp-vn có 173 mã nhưng chỉ ~52 docstring nhắc mã, không có liên kết máy mã → model → màn → test; 4 lời hứa trong danh mục (HT04 duyệt nhiều cấp, HT06 đánh số theo công ty–năm, CH03 mô phỏng, HT08 lưu trữ tự động) **mã không làm**. Không đo được thì trôi.

## 1. Phân tầng: cái gì thuộc đâu

Năm tầng của open-ketoan, từ cứng nhất tới mềm nhất. Luật đặt chỗ: **một cơ chế mà ≥ 2 module cần và sai lệch giữa chúng làm lệch sổ → không được ở module.**

| Tầng | Nằm ở | Chứa | Ai sửa | Ví dụ từ đợt đọc này |
|---|---|---|---|---|
| **AK** Accounting Kernel | `packages/kernel` | sự việc, phiên bản, ghi sổ, đảo, giải tài khoản, sổ chi tiết (công nợ, kho, hoá đơn thuế), khoá kỳ, kết chuyển, giá vốn, bất biến | nhóm Lõi, qua VERSIONING §5 | lô / hạn trong `inventory_movements`, nguyên tệ, `allocate` cho sổ, đánh số khi ghi sổ |
| **PL** Platform | `packages/platform` | action, bằng chứng, quyền, workflow, tham số, đánh số chứng từ, liên kết chứng từ, sự kiện / outbox, nhắc việc, nhập / xuất, mẫu in | nhóm Lõi | lớp chứng từ module chung, chính sách duyệt, nghĩa vụ – nhắc việc, sổ đăng ký mẫu biểu |
| **SDK** Module SDK + contracts | `packages/module-sdk`, `packages/contracts` | hàm thuần dùng chung, kiểu, hình kết quả, manifest | nhóm Lõi (đóng băng v1, ADR-0015) | `money` làm tròn rõ chiều, `allocate`, `prorateByDays`, `progressive`, hình `findings` |
| **RP** Gói dữ liệu (rulepack / posting pack) | `packages/vn-rulepacks`, `db/packs` | lý do định khoản, nhóm tài khoản, thuế suất, tham số pháp lý VN, luật kết chuyển, khung mẫu biểu | kế toán trưởng + nhóm Lõi duyệt (ADR-0016) | seed `TY_LE_BH_*`, `TNCN_GIAM_TRU_*`, `NGUONG_TSCD`, bậc dự phòng |
| **MOD** Module | `modules/<key>` | chứng từ riêng, luật nghiệp vụ riêng, màn hình, báo cáo quản trị | đội module / cộng đồng / AI | đơn bán, bảng giá, kiểm kê, phiếu lương |

### 1.1 Bản đồ 20 cơ chế

Cột **open-ketoan** lấy từ kiểm kê mã HEAD `4cac542`. ✅ vững · 🟡 một phần · ☐ thiếu.

| # | Cơ chế | Erp-vn (bằng chứng) | Bài học | open-ketoan hiện có | Tầng đúng | Việc |
|---|---|---|---|---|---|---|
| 1 | Một cửa ghi sổ có khoá nguồn | `_create_from_source(source, journal, date, lines, key)` `lfood_ledger/models/move.py:160`, 42 chỗ gọi / 23 module; một bút toán sống / (model, id, key) | giữ: khoá nguồn + tự đảo | ✅ `postDocumentIn` `packages/kernel/src/modules/documents/document.service.ts:369`, `UNIQUE(tenant_id, doc_key)` | AK | ép module chỉ qua `ctx.ledger.submit` (hiện chưa module nào dùng; `phan-he` gọi thẳng) — STD-030-1 |
| 2 | Sửa = đảo + ghi lại | `_reverse` `move.py:112`; bút toán đã ghi cấm sửa `move.py:56-67` | giữ; nhưng **không** lùi ngày đảo im lặng (`move.py:117-119` tự đổi sang hôm nay khi kỳ khoá) | ✅ append-only ở CSDL (0049), `ledger_entries_reversed_once` | AK | đảo vào kỳ khoá → lỗi `PERIOD_LOCKED` rõ, không tự đổi ngày (đã đúng — giữ) |
| 3 | Phiên bản hai con trỏ | `current_version_id` / `report_version_id`, diff + lý do, khôi phục bản gốc, sửa hàng loạt `wizards/bulk.py` | tổng quát hoá cho mọi chứng từ | 🟡 Kernel có `version` / `posted_version`; module chưa có "bản nháp sửa" tách khỏi bản đã ghi | AK + PL | K-030-5 (đã có nền) + P-030-1 |
| 4 | Giải tài khoản | **không có**; mã TK là literal / `Char` trên chứng từ | tránh hoàn toàn | ✅ `AccountResolver` `posting/account-resolver.ts:28`; ☐ rò ở `modules/mua-hang/domain/src/engine.ts:867`, `apps/api/src/phan-he/mua-hang/posting.ts:136,151` (`like '331%'`, `startsWith('112')`) | AK + RP | STD-030-2; nợ N030-2 |
| 5 | Tham số có ngày hiệu lực | `lfood.legal.param` `lfood_voucher/models/legal_param.py:49-110`: chồng khoảng bị chặn, đã duyệt bất biến, luật bắt `legal_ref`, tự đóng khoảng cũ, ngữ cảnh mô phỏng | giữ hết; thêm pháp nhân, bỏ `default` cứng, mô phỏng cho mọi bộ tính | ☐ `setting_values` chưa có mã (S029-10 giữ chỗ); có `posting_policy_versions` `selectPolicy(asOf)` và `profileAt(asOf)` | PL (lưu) + RP (giá trị VN) | K-030-6 + P-030-2 |
| 6 | Lớp chứng từ chung | **không có** — gốc của mọi lặp mã | phải có | 🟡 `ctx.documents.{nextNumber, saveVersion, link, attach, sign}` `platform/core/documents.ts:62-236`; trạng thái module vẫn ở bảng riêng, không lịch sử trạng thái chung | PL | P-030-1 |
| 7 | Máy trạng thái | 79 `state` tự khai; kiểm `if state` + cờ ngữ cảnh | khai bằng dữ liệu | ✅ workflow YAML `platform/core/workflow.ts:147` (5 nhóm trạng thái, `sod`, `levels`, `requires`); chỉ 2 chứng từ dùng | PL | STD-030-3: mọi chứng từ module khai YAML |
| 8 | Duyệt + SoD | một ngưỡng `lfood_voucher_approval_limit`; 0 kiểm người lập ≠ người duyệt; ngưỡng `> limit > 0` ở chứng từ (`lfood_voucher/models/voucher.py:189`), `> limit` ở đơn mua (`lfood_purchase/models/purchase.py:316`, 0 ⇒ mọi đơn phải duyệt) | một engine chính sách | 🟡 YAML `sod/levels`; authz PHASE-028 `packages/platform/src/core/authz/engine.ts:143` chưa nối; ngưỡng rải 2 bảng | PL | P-030-3 |
| 9 | Đánh số | 51 `ir.sequence`, tất cả `company_id=False` (hai pháp nhân chung bộ đếm), không `use_date_range` (không reset năm dù tiền tố có năm), lấy số lúc **tạo** ở 28 model ⇒ hổng số khi rollback | đánh số theo (đơn vị, loại, năm), lấy lúc ghi sổ, không hổng | ✅ `document_sequences` theo năm `kernel/.../numbering.ts:17`; 🟡 `numbering.pattern` khai nhưng chưa diễn giải; chưa theo chi nhánh | PL (+ AK cho số bút toán) | K-030-11 |
| 10 | Khoá kỳ | một ngày `lfood_lock_date`, chỉ ở sổ cái | khoá theo ngày chứng từ, mọi chứng từ | ✅ `period_locks` (kỳ × chi nhánh × docType) + `dataLock` + mở khoá bắt lý do | AK + PL | STD-030-4: action module tự gọi `dataLock` theo ngày chứng từ |
| 11 | Kết chuyển cuối kỳ | literal 621/622/…→154→911→4212 `lfood_ledger/wizards/closing.py:28-56` | là dữ liệu | ✅ `closing_rules` + `closing_rule_versions` (0003) | AK + RP | giữ; Erp-vn yếu hơn |
| 12 | Nhật ký kiểm toán | `lfood_audit/models/audit_log.py`: trigger cấm UPDATE/DELETE/TRUNCATE, SHA-256 nối chuỗi; nhưng ghi **hai lần** (diff + tóm tắt), băm không gồm `company_id`, một dòng đầu chuỗi khoá toàn CSDL | giữ chuỗi băm; một sự kiện / hành động; băm gồm đơn vị | ✅ `audit_logs` chuỗi băm (0036), `writeEvidence` đúng một bản ghi / action `platform/core/audit.ts:102` | PL | giữ; lý do là trường chung (STD-030-6) |
| 13 | Chia tiền / làm tròn | `allocate` dư lớn nhất + 3 bản khác; `round()` Python = làm tròn **về chẵn** (2,5 → 2) trên 248 chỗ; tiền là `Float(16,0)` | một thư viện tiền thuần, số nguyên, chiều làm tròn ghi rõ | 🟡 `contracts/src/money.ts` (`toCents`, `roundDong` = `Math.round` → −2,5 thành −2, không đối xứng); chia tiền 2 cách (mua hàng, tài sản) — thiết kế chốt ở [18](18-THU-VIEN-TIEN.md) | SDK | K-030-10 + STD-030-5 |
| 14 | Bộ tính thuần dùng lại | `depr_tools.build_schedule` (tài sản + trích trước), `pit_progressive` (lương + quyết toán), ngày làm việc `holiday.py` (5 module); 17 tệp có tự kiểm `__main__` | bộ tính thuần ở tầng chung, có bảng test | 🟡 khấu hao trong module tài sản; thuế suất lặp ở `engine.ts:295` | SDK + RP | K-030-10 |
| 15 | Lô / hạn / FEFO | hook `_fefo_lot_domain` `lfood_stock/models/stock.py:218-229`, mở rộng ở bán hàng, kiểm soát kho | lô thuộc sổ kho | ☐ Kernel không có lô; mua hàng tự giữ `lotNo / expDate` trong `data` | AK | K-030-1 |
| 16 | Nguyên tệ | `lfood_fx` | — | ☐ không cột nguyên tệ / tỷ giá trên `ledger_lines` | AK | K-030-2 |
| 17 | Loại chứng từ ghi sổ | journal mở rộng bằng `selection_add(..., ondelete='cascade')` — gỡ module **xoá bút toán đã ghi** | không bao giờ để gỡ module chạm sổ | 🟡 `DOC_TYPES` đóng (19 loại, `contracts/src/enums.ts:9`) — an toàn nhưng module lương / trích trước / dự phòng không có chỗ | AK | K-030-3 + K-030-7 |
| 18 | Nhắc việc / nghĩa vụ | `lfood_reminder` cron dựng lại danh sách theo `key` duy nhất, tự đóng việc cũ; module cắm qua `_collect_extra` (10 module) — nhưng module nhắc việc phụ thuộc 7 module nghiệp vụ, không gửi tin | sổ nghĩa vụ để module đăng ký, có kênh gửi | 🟡 `tickClock` + subscriber, `ctx.notify.send`; không sổ nghĩa vụ chung | PL | P-030-5 |
| 19 | Mẫu biểu pháp định | B01/B02/B03, 01/GTGT, 05/QTT-TNCN chỉ là chuỗi; logic B01 ở `wizards/b01.py:125`, SQL báo cáo lặp giữa màn và Excel | mẫu biểu = khuôn có phiên bản (mã mẫu + ngày hiệu lực + công thức dòng) dùng chung màn / Excel / XML | 🟡 báo cáo cứng trong `phan-he/ke-toan/reports/*`; mẫu in `modules/print-templates` không có sổ mẫu số | PL + RP | P-030-6 |
| 20 | Nhập dữ liệu | `lfood_importer`: SPECS 5 loại, đoán cột không dấu, ánh xạ sửa được, xem trước rồi nhập, chạy lại không trùng, số dư đầu kỳ qua cửa ghi sổ | một đường ống nhập chung | 🟡 nhập theo từng tính năng (danh mục, tài sản, hoá đơn mua) | PL | P-030-7 |

Ngoài bảng: **đa pháp nhân**. Erp-vn tách bằng 108 `ir.rule` viết tay, 0 `check_company`, còn hệ tài khoản, bộ đếm số và tham số thì dùng chung toàn cục, và báo cáo hợp nhất cứng đúng hai công ty (`lfood_consolidation/models/consolidation.py:41-44`). open-ketoan dùng RLS trên 84 bảng (`0041_co_lap_don_vi_rls.sql`) theo đơn vị, nên **đơn vị là ranh giới cứng**. Bài học là mọi đối tượng mới (tham số chính sách, bộ đếm số, luật duyệt) phải khai phạm vi đơn vị / chi nhánh ngay từ đầu. Liên pháp nhân thật (hai đơn vị) và hợp nhất N đơn vị là việc của phase sau, không vá vào chi nhánh.

## 2. Chuẩn hoá: luật mọi module phải theo (STD-030-*)

Đây là **đề xuất luật**. Khi được duyệt, mỗi dòng thành một kiểm `SC-*` trong `tests/conformance/checks/` hoặc một mục trong `bizcity module check`.

| Mã | Luật | Vì sao (bằng chứng) | Kiểm bằng |
|---|---|---|---|
| STD-030-1 | Module **chỉ** ghi sổ qua `ctx.ledger.submit({docType, docKey, reasonCode, …})`; không gọi `postDocumentIn` / `eventStore` / `voucherService`, không đọc thẳng `ledger_*`, `debt_items`, `accounting_events` — đọc qua `ctx.ledger.query` / `bizcity_read` | Erp-vn `lfood_entry/models/sheet.py:101` vòng qua cửa chung, tự lặp kiểm; open-ketoan `phan-he` gọi thẳng, đọc thẳng (SC-KERNEL-7 đã có, chỉ chưa áp cho `phan-he` đóng băng) | SC-KERNEL-7 mở rộng cho `modules/**` |
| STD-030-2 | **Không số tài khoản trong mã module**, kể cả trong `domain/` thuần: chỉ `reasonCode`, `methodCode`, khoá `postingDefaults`. Số TK chỉ ở posting pack và báo cáo pháp định | Erp-vn 21 module literal; open-ketoan `engine.ts:867` | grep `/'\d{3,5}'/` trong `modules/*/src`, `modules/*/domain` (SC-KERNEL-5 mở rộng) |
| STD-030-3 | Mọi chứng từ module có **workflow YAML**; trạng thái thuộc 5 nhóm `STATUS_GROUPS`; từ chối luôn về một trạng thái đã khai (không tự chế `refused` / `rejected` / về `draft` tuỳ module); huỷ sau khi ghi sổ = `ctx.ledger.cancel` (đảo) | Erp-vn 79 `state`, `action_reject` về `draft` ở chứng từ, `action_refuse` → `refused` ở nơi khác | manifest `documents[].workflow` bắt buộc khi `ledger: true` |
| STD-030-4 | Action ghi có **ngày chứng từ** phải qua `dataLock` + khoá kỳ **trước** khi lưu, kể cả chứng từ không ghi sổ (phiếu kho nội bộ, chấm công đã chốt) | Erp-vn chỉ khoá ở sổ cái | golden INV-9 (thêm): lưu chứng từ ngày trong kỳ khoá → `PERIOD_LOCKED` |
| STD-030-5 | Tiền là **số nguyên đồng** (hoặc đơn vị nhỏ nhất của tiền tệ); làm tròn **nửa xa số 0** (`roundHalfAwayFromZero`), ghi chiều trong hàm; mọi chia tách dùng **một** `allocate(total, weights)` dư lớn nhất, hoà thì theo thứ tự dòng | Erp-vn `round()` về chẵn + 4 kiểu chia; open-ketoan `Math.round` lệch âm + 2 cách chia khác nhau ([18](18-THU-VIEN-TIEN.md)) | grep `Math.round` trên đại lượng tiền trong `modules/**` → cảnh báo; golden T030-CORE-6 |
| STD-030-6 | Mọi chuyển trạng thái **có lý do** khi workflow ghi `requires:[reason]`; lý do vào trường chung của bằng chứng (`notes.audit[].reason`), không tự đặt cột `cancel_reason`, `refuse_note`… | Erp-vn lý do nằm rải: `reason` trên phiên bản chứng từ, chuỗi tự do trong `_record_event`, ghi chú từ chối riêng từng module | SC-AUDIT mở rộng |
| STD-030-7 | Tham số nghiệp vụ là **khoá có tên** `<module>.<nhóm>.<tên>` đọc theo **ngày chứng từ**, không theo hôm nay; **cấm `default` cứng trong mã** cho tham số có `legalRef` — thiếu giá trị thì lỗi `NOT_READY` nói rõ khoá nào | Erp-vn `NGUONG_TT_KHONG_TIEN_MAT` mặc định 0 ở `voucher.py:96`, 5 tr ở 5 nơi | lint manifest `settings[]`; golden INV-7 |
| STD-030-8 | Kết quả kiểm nghiệp vụ dùng **một hình**: `findings[]` `{code, level: block\|warn\|info, message, path?, overridable?, legalRef?}` (= `packages/contracts/src/findings.ts`); không tự chế `Check{blocking:true}` | open-ketoan đang có 3 hình: intake `block\|warn\|hint` (`contracts/src/intake-findings.ts:16`), `findings.ts:22` `block\|warn\|info`, mua hàng `Check{level, blocking}` (`engine.ts:673`) | SC-FIND mở rộng |
| STD-030-9 | Mỗi chứng từ module có **docRef** `<module>.<type>:<id>` và **liên kết** tới nguồn / chứng từ sinh ra (`document_links` role `source / settles / reverses / replaces / ledger`); docKey gửi sổ = docRef (+ `:<dòng>` khi tách) | truy vết đơn → phiếu xuất → hoá đơn → thu tiền; Erp-vn chỉ có `source_model / source_id` một tầng | `GET /documents/history` đi được từ bút toán ngược về chứng từ module |
| STD-030-10 | Mỗi action / docType / test mang **mã nghiệp vụ** (`bizCodes: ["KHO07"]`) trong manifest; blueprint mục 9 liệt kê golden; `bizcity module check` đo phủ | Erp-vn mã chỉ trong docstring, trôi khỏi danh mục | manifest `actions[].bizCodes`, `golden[]` (đề xuất ở [60 §6](60-GOLDEN-TESTS.md)) |
| STD-030-11 | Bộ tính (lương, khấu hao, thuế, giá vốn, khuyến mãi) là **hàm thuần** `(input, params) → output` không đọc CSDL, không đọc đồng hồ; có **bảng test số liệu** cạnh hàm | Erp-vn 17 tệp tự kiểm `__main__` — cách rẻ nhất để kế toán trưởng duyệt công thức | `domain/src/*.test.ts` bắt buộc khi manifest khai `calculators[]` |
| STD-030-12 | Gỡ / tắt module **không bao giờ** xoá hay sửa dữ liệu sổ; docType, reasonCode do module đăng ký thì ở lại (đánh dấu `retired`) | Erp-vn `selection_add(..., ondelete='cascade')` → gỡ module xoá bút toán | `uninstallPack` / gỡ module có kiểm "đã dùng thì không xoá" |

## 3. Accounting Kernel học được gì

Kernel open-ketoan đã **vượt** Erp-vn ở: sự việc có phiên bản cho mọi chứng từ, giải tài khoản, chính sách / hồ sơ kế toán có ngày hiệu lực, khoá kỳ đa chiều, kết chuyển là dữ liệu, outbox, RLS, chẩn đoán. Những thứ Kernel **nên học thêm** (nối tiếp K-030-1..6 ở [10 §4](10-DOI-CHIEU-ERP-VN.md)):

| Mã | Đề xuất | Học từ | Vì sao ở Kernel, không ở module |
|---|---|---|---|
| K-030-7 | **docType mở có kiểm soát**: module đăng ký docType mới qua manifest `ledger.submits[].docType` kèm **khuôn định khoản theo `reasonCode`** (không số TK) và hợp đồng payload; Kernel duyệt khi cài (ADR-0016 kiểu rulepack), không cần PR Core cho mỗi loại | Erp-vn mở journal bằng `selection_add` (nhanh nhưng nguy hiểm, §1 #17); open-ketoan đóng 19 loại (an toàn nhưng chặn lương / trích trước / dự phòng) | giữ "không sự việc, không bút toán" mà không bắt mọi thứ đi `manual_journal` — mất ngữ nghĩa, mất đối soát |
| K-030-8 | **Con trỏ báo cáo cho sự việc**: tách "phiên bản mới nhất đã lưu" và "phiên bản đã ghi sổ" thành hai trạng thái có thể khác nhau lâu dài; `promote(docKey, version, reason)` = đảo + ghi; `restore(docKey, 1)`; sửa hàng loạt có `batchId` | `voucher_version.py`, `wizards/bulk.py` | phải nguyên tử với đảo / ghi; module không được tự làm |
| K-030-9 | **Nhận diện khoá nguồn hai tầng**: `docKey` = chứng từ, `lineKey` = dòng gửi sổ; một bút toán sống / (docKey, lineKey) | Erp-vn `source_key='version:<id>'`, sinh bút toán theo dòng (tài sản tách VAT, kiểm kê theo dòng) | kiểm kê, phân bổ, lương theo nhân viên cần đảo một dòng không đảo cả chứng từ |
| K-030-10 | **Thư viện tính dùng chung** trong `packages/contracts` (cạnh `money.ts`): `allocate`, `roundMoney(mode)`, `prorateByDays(from, to, monthly)`, `progressive(amount, brackets)`, `workingDays(from, to, calendar)`; Kernel dùng cho giá vốn / phân bổ, module dùng cho nghiệp vụ | `tools.py:5`, `depr_tools.py:21`, `calc.py:15`, `holiday.py:13` — 4 bộ tính được 2–8 module dùng lại | cùng một khoản phải ra cùng một con số ở mọi nơi; đối soát dựa vào điều đó |
| K-030-11 | **Đánh số tại ghi sổ, không hổng**: số chứng từ pháp lý lấy trong cùng giao dịch ghi sổ (số tạm cho nháp); bộ đếm theo (đơn vị, chi nhánh, series, năm tài chính); diễn giải `numbering.pattern` | Erp-vn lấy số lúc tạo, chung bộ đếm hai pháp nhân, không reset năm | số phiếu thu / chi / hoá đơn phải liên tục theo luật; chỉ Kernel biết giao dịch ghi sổ thành công |
| K-030-12 | **Bất biến sổ chi tiết là dữ liệu**: mỗi sổ chi tiết (kho, công nợ, hoá đơn thuế, và mới: lô, tạm ứng, lương phải trả, nguyên tệ) đăng ký một phép đối soát `sổ chi tiết ↔ nhóm tài khoản theo posting pack`; chạy ở chẩn đoán, sau mỗi test, và trước khoá kỳ | `data_consistency.py` 15 phép; open-ketoan `doi-chieu-ke-toan.sql` viết tay | module mới thêm sổ chi tiết thì tự có đối soát, không ai phải nhớ sửa SQL |

**Những điều Kernel không nên học từ Erp-vn**: lùi ngày bút toán đảo cho chứng từ (`voucher.py` đảo theo `accounting_date` cũ), tự đổi ngày đảo sang hôm nay khi kỳ khoá, tài khoản là `Char` trên chứng từ, hệ tài khoản toàn cục không theo đơn vị, đặt chính công ty làm "nguồn" của bút toán kết chuyển.

## 4. Nền tảng (Platform) học được gì (P-030-*)

| Mã | Đề xuất | Thay cho (Erp-vn lặp) | Nối với có sẵn |
|---|---|---|---|
| P-030-1 | **Lớp chứng từ module chung**: bảng `module_documents` (docRef, đơn vị, chi nhánh, series, số, ngày chứng từ, trạng thái, nhóm trạng thái, người lập / duyệt / ghi sổ + thời điểm, docKey sổ, phiên bản) + `document_status_history`; action module chỉ khai phần riêng; `GET /documents/:docRef` chung cho mọi module | 94 `company_id`, 26 `approved_by`, 76 `write` override, 31 cờ bỏ kiểm | `ctx.documents.*`, `document_versions`, `document_links`, workflow YAML |
| P-030-2 | **Tham số có ngày hiệu lực hoàn chỉnh** = E2 `setting_values` + `kind: law\|policy`, `legalRef` bắt buộc khi `law`, trạng thái nháp / đã duyệt (duyệt = kế toán trưởng), chồng khoảng bị chặn, đã duyệt bất biến, tự đóng khoảng trước, **phạm vi đơn vị cho `policy`**, `getSetting(key, {at, overrides})` cho mô phỏng, có đệm | `legal_param.py` (thiếu đơn vị, không đệm, mô phỏng một nơi) | S029-10, `bizcity-settings.registry.json`, `dryRun` của action |
| P-030-3 | **Chính sách duyệt**: bảng (docType × khoảng tiền × đơn vị) → các cấp vai trò có thứ tự; SoD bắt buộc mặc định; mỗi bước là một bằng chứng; workflow YAML tham chiếu `policy: <key>` thay cho ngưỡng cứng | 18 cặp approve / reject, 92 `has_group`, 2 cách so ngưỡng | authz PHASE-028 (`authorize`, `explain`) — **nối vào `runAction`**; `payment_request_settings`, `purchase_policies` chuyển về đây |
| P-030-4 | **Cửa "ghi của hệ thống"**: thay cờ ngữ cảnh bằng actor `system:<job>` có quyền khai trong manifest, có bằng chứng | 31 cờ `lfood_*_system`, `lfood_audit_skip` dùng cả cho khoá kỳ | actor `user:` / `apikey:` của `audit.ts` |
| P-030-5 | **Sổ nghĩa vụ – nhắc việc**: module đăng ký bộ thu `collect(asOf) → obligations[{key, due, owner, docRef}]`; nền dựng lại theo `key`, tự đóng việc hết hạn, chỉ mở lại việc hệ thống đã đóng; gửi qua `ctx.notify` | `lfood_reminder` (mẫu tốt, nhưng phụ thuộc ngược 7 module, không gửi) | `tickClock`, subscriber, `notify` |
| P-030-6 | **Sổ mẫu biểu**: mẫu = (mã mẫu `B01-DN`, căn cứ, ngày hiệu lực, dòng: mã chỉ tiêu + công thức trên nhóm tài khoản / chỉ tiêu khác); một bộ chạy cho màn, Excel, XML | B01 trong wizard, SQL lặp giữa màn và Excel | `print-templates`, `phan-he/ke-toan/reports/*`, `vn-rulepacks` |
| P-030-7 | **Đường ống nhập**: khai `spec` (cột, kiểu, khoá tự nhiên), đoán cột không dấu, ánh xạ lưu lại, xem trước → `findings[]` → nhập qua action (bằng chứng, idempotent); số dư đầu kỳ qua cửa ghi sổ | `lfood_importer` (mẫu tốt) | `catalog-import.ts`, intake inbox (ADR-0014) |
| P-030-8 | **Danh mục mã nghiệp vụ là dữ liệu**: `docs/nghiep-vu/catalog.json` (mã, tên, nhóm, căn cứ, blueprint, module, actions, golden) sinh ra ma trận [10](10-DOI-CHIEU-ERP-VN.md), bản mẫu, và đo phủ | `nghiepvu-src/data.py` chỉ sinh HTML | `bang-viec.mjs`, `nen-mong.json`, STD-030-10 |

## 5. Truy vết xuyên suốt: một sợi chỉ từ luật tới bút toán

Mục tiêu: từ **bất kỳ** đầu nào (một con số trên B01, một bút toán, một dòng luật) đi được tới mọi đầu kia mà không phải đọc mã.

```
căn cứ pháp lý (legalRef)
   └─ tham số  <module>.<nhóm>.<tên>  @ ngày hiệu lực          (P-030-2)
mã nghiệp vụ  KHO07
   └─ blueprint 51 §KHO07  ── golden T030-KHO-6               (STD-030-10)
   └─ action  kho.stock-count.approve   (bizCodes)
        └─ chứng từ  kho.stock_count:<id>  trạng thái / lịch sử   (P-030-1)
             └─ liên kết  source → settles → ledger                 (STD-030-9)
             └─ sự việc  docKey = kho.stock_count:<id>:<dòng>  v<n>  (K-030-9)
                  └─ reasonCode XDC  → AccountResolver → TK theo pack  (STD-030-2)
                  └─ bút toán  event_id / event_version / reverses_entry_id
                  └─ sổ chi tiết  inventory_movements (lô)  ↔ đối soát 15x  (K-030-12)
             └─ bằng chứng  audit_logs (actor, lý do, băm chuỗi)        (STD-030-6)
correlationId  nối HTTP → action → outbox → bằng chứng
```

Đã có: `GET /documents/history?entryId=` (bút toán → sự việc → phiên bản → nhật ký ghi sổ), `/lineage/items/:sku/*`, `correlationId` trên `audit_logs` + `event_outbox`, `posting_log.policy_version`. Còn thiếu ba mắt xích: **tham số dùng** (ghi `settings_used[{key, valueId}]` vào `posting_log` để biết bút toán tính theo giá trị nào), **mã nghiệp vụ** trên action, và **lịch sử trạng thái** chứng từ module.

## 6. Phản mẫu: danh sách soát khi duyệt PR module

Mỗi dòng là một câu hỏi người duyệt hỏi; "có" ⇒ yêu cầu sửa.

| # | Phản mẫu | Thấy ở Erp-vn | Đã thấy ở open-ketoan |
|---|---|---|---|
| A1 | Literal số tài khoản / tiền tố TK trong mã module | 21 module | `modules/mua-hang/domain/src/engine.ts:867`; `phan-he/mua-hang/posting.ts:136,151` |
| A2 | Tự viết hàm chia / làm tròn tiền | `lfood_costing/models/calc.py:28`, `lfood_loan/models/loan_calc.py:22` | `modules/mua-hang/domain/src/engine.ts:514`, `apps/api/src/modules/assets/depreciation.ts:140,163` |
| A3 | Bảng thuế suất / ngưỡng pháp lý trong mã | `provision/calc.DEFAULT_BRACKETS`, `privacy_calc.DAYS` | `modules/mua-hang/domain/src/engine.ts:295` `TAX_RATE` |
| A4 | Ngưỡng duyệt / tham số trong bảng riêng của module | — | `payment_request_settings`, `purchase_policies` |
| A5 | `if role == …` thay cho quyền / chính sách | 92 `has_group` | `assertCanModify` theo người lập (chấp nhận được, nhưng nên về P-030-3) |
| A6 | Cờ "bỏ qua kiểm" | 31 cờ ngữ cảnh | — (giữ vậy) |
| A7 | Đọc thẳng bảng sổ / công nợ | SQL báo cáo | `phan-he/mua-hang/{posting,analysis,reports,ton-max}`, `phan-he/ke-toan/reports`, assets, trợ lý |
| A8 | Hình kết quả kiểm tự chế | — | `modules/mua-hang/domain/src/engine.ts:673` `Check{level, blocking}`, dùng ở `apps/api/src/phan-he/mua-hang/analysis.ts` |
| A9 | Lấy số chứng từ pháp lý lúc tạo nháp | 28 model | — |
| A10 | Ghi nhật ký hai lần cho một hành động | diff + `_record_event` | — (`runAction` ghi đúng một) |
| A11 | Lùi / tự đổi ngày bút toán đảo | `voucher.py`, `move.py:117` | — |
| A12 | Gỡ module chạm dữ liệu sổ | `ondelete='cascade'` | — |

`phan-he/` đóng băng (ADR-0024): A1, A2, A7, A8 ở đó **không vá tại chỗ**; ghi nợ N030-2 và sửa khi chuyển sang `modules/mua-hang`. Riêng `modules/mua-hang/domain` là module mới, nên sửa A1 / A2 / A3 tại chỗ.

## 7. Đính chính đợt W0

- **`setting_values` (PHASE-029 E2) chưa có mã.** Chỉ có hợp đồng (`docs/contracts/BIZCITY-SETTINGS-MATRIX-v1.md`) và việc S029-10 "☐ giữ chỗ"; migration cao nhất là `0072`. Các blueprint 50–55 và [20 M2](20-MAU-THIET-KE.md) dùng `setting_values` như **đích** — chúng phụ thuộc E2 (P-030-2). Thứ đang có để bám tạm là `posting_policy_versions` (`selectPolicy(asOf)`) và `readSetting` / `ctx.settings.get` (theo chủ, không ngày hiệu lực).
- **Engine authz PHASE-028 chưa nối** vào `runAction` (chỉ `apps/api/test/authz-engine.test.ts` gọi). [20 M1](20-MAU-THIET-KE.md) ghi "authz PHASE-028" là nền — đúng về thiết kế, chưa đúng về mã chạy.
- Kết chuyển cuối kỳ của open-ketoan là dữ liệu có phiên bản (`closing_rules`, `closing_rule_versions`, migration 0003): ghi thêm vào "chỗ Erp-vn yếu hơn" ([10 §3](10-DOI-CHIEU-ERP-VN.md)).

## 8. Thứ tự đề xuất

Đi từ thứ mà **nhiều module nhất bị chặn bởi nó**:

| Bậc | Việc | Mở khoá cho | Ai |
|---|---|---|---|
| 1 | K-030-10 thư viện tính + STD-030-5 (tiền, `allocate`) | mọi module; sửa A2 | nhóm Lõi, nhỏ, thuần |
| 2 | P-030-2 tham số (= hoàn tất E2) + K-030-6 seed VN | lương, tài sản, thuế, duyệt, khuyến mãi | nhóm Lõi + kế toán trưởng |
| 3 | P-030-1 lớp chứng từ module + STD-030-3/9 | bán hàng, kho (P0) và mọi module sau | nhóm Lõi |
| 4 | P-030-3 chính sách duyệt (nối authz PHASE-028) | mua, bán, tạm ứng, ngân sách | nhóm Lõi |
| 5 | K-030-1 lô + K-030-12 đối soát sổ chi tiết là dữ liệu | kho, bán hàng | nhóm Lõi |
| 6 | K-030-7 docType mở + K-030-3 | lương, trích trước, dự phòng, lãi vay | nhóm Lõi, qua VERSIONING §5 |
| 7 | K-030-8/9/11, K-030-2, P-030-4..8 | sửa hàng loạt, nguyên tệ, nhắc việc, mẫu biểu, nhập | theo nhu cầu module |

Module P0 (bán hàng, kho) có thể bắt đầu sau bậc 1–3; trước đó chỉ làm `domain/` thuần + golden `it.todo`.

## 9. Tóm tắt cho người viết module

1. Đọc blueprint của mã nghiệp vụ (50–55). Nếu chưa có, viết theo [30](30-KHUON-BLUEPRINT.md) trước khi code.
2. Khai manifest: chứng từ + workflow YAML, quyền, `settings[]` (khoá có tên), `ledger.submits[]` (docType + reasonCode), `bizCodes`, `golden`.
3. Logic tính = hàm thuần trong `domain/`, dùng `money` / `allocate` / bộ tính chung, có bảng test số liệu.
4. Action: kiểm `dataLock` theo ngày chứng từ → kiểm nghiệp vụ trả `findings[]` → workflow `allowed()` (SoD, lý do) → lưu qua `ctx.documents` → ghi sổ qua `ctx.ledger.submit`.
5. Không số TK, không đọc bảng sổ, không ngưỡng trong mã, không cờ bỏ kiểm.
6. Golden `T030-*` xanh + `assertLedgerInvariants` + đối soát sổ chi tiết = đủ điều kiện merge.
