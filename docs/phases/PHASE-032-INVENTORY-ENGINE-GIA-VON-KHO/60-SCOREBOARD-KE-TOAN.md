# PHASE-032 · 60 — Scoreboard kế toán: điều kiện khoá kỳ cũng là điều kiện hằng ngày, hằng tuần
<!-- [2026-11-09 11:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — scoreboard theo góc nhìn kế toán: 23 phép kiểm PC-001..023 (bản mẫu PHASE-033) đối chiếu ngược với mã origin/main 90697182; một sổ đăng ký phép kiểm, ba nhịp ngày · tuần · kỳ; mức HARD hẹp, REVIEW có lý do; checklist triển khai Inventory Engine theo điều kiện khoá kỳ -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **DRAFT.** Đầu vào: bản mẫu *Sẵn sàng khoá kỳ* PHASE-033 (PC-001..023, chưa có trên `main`), đánh giá 11 điều kiện của chủ dự án, mã `origin/main` `90697182` (2026-11-09). Bản vẽ: [mockups/bang-diem-ke-toan.html](mockups/bang-diem-ke-toan.html).

## 1. Trả lời ngắn

**Được, và nên làm như vậy.** Kế toán không tin một hệ thống chỉ "báo đỏ" vào ngày 30. Họ tin khi ngày nào cũng thấy cùng những phép kiểm đó và biết chắc ngày khoá sổ sẽ không có bất ngờ. Vì thế:

1. **Một sổ đăng ký phép kiểm, ba nhịp.** PC-001..023 là một danh sách. Mỗi phép kiểm chạy theo ba nhịp: **ngày** (đêm 01:00, phần phát sinh mới), **tuần** (đối chiếu sâu, lần tính giá nháp) và **kỳ** (trước kết chuyển, sau kết chuyển, lúc khoá). Không có phép kiểm "chỉ cuối kỳ mới biết".
2. **Cùng phép kiểm, khác mức theo nhịp.** Ở nhịp ngày và tuần, phép kiểm **chỉ nhắc** và giao việc. Ở nhịp kỳ, nó mới **chặn**. Lỗi ngày 5 mà để tới ngày 30 thì kế toán đã thấy nó 25 lần.
3. **Hai bảng điểm, không trộn.** Bảng **A · Hệ thống làm được gì** đi theo bằng chứng mã, giống `tru-cot.json`. Bảng **B · Số liệu của tôi hôm nay** đi theo kết quả chạy trên dữ liệu thật. Kế toán dùng A để đánh giá phần mềm, dùng B để làm việc.
4. **Mức chặn hẹp và có lý do.** HARD chỉ dành cho trạng thái sai về toán học hoặc toàn vẹn. Ở trạng thái đó, "miễn trừ" không có nghĩa gì, vì cách sửa duy nhất là sửa chứng từ hoặc chạy lại. Mọi thứ nghiệp vụ là REVIEW: một người có quyền ghi lý do và bằng chứng, có nhật ký. Cách này giữ đúng ADR-0020 và D030-12.

## 2. Bốn yêu cầu khắt khe của kế toán, và cách hệ thống đáp ứng

| Kế toán cần | Nghĩa cụ thể | Hệ thống phải có |
|---|---|---|
| **An toàn, bảo toàn số liệu** | Không ai, kể cả quản trị, sửa được số đã ghi mà không để dấu; khoá rồi không ghi lùi | Sổ chỉ thêm, trigger CSDL khoá kỳ (0082), E1 qua hàm có dấu vết (0091), chuỗi băm bằng chứng. **Đã có** |
| **Rõ ràng** | Mỗi phát hiện nói *cái gì sai, bao nhiêu tiền, ở chứng từ nào, ai sửa, sửa ở màn nào* | Thư viện mã có `remedy` (bước, màn, vai, `forbid`), ví dụ `INVENTORY_LEDGER_MISMATCH` cấm "lập phiếu điều chỉnh kho để làm khớp số". **Có khuôn**, cần phủ đủ 23 |
| **An tâm** | Biết trước ngày khoá: còn bao nhiêu việc, việc nào chặn, việc nào chỉ cần giải trình | Bảng B theo nhịp ngày, tuổi phát hiện, "dự báo sẵn sàng khoá". **Chưa có** |
| **Dễ dùng, linh hoạt** | Ngoại lệ nghiệp vụ thật (hàng đi đường qua ngày khoá, chưa có biên bản công nợ) không bị coi là lỗi | Mức REVIEW có lý do, có bằng chứng, áp theo phạm vi. Mặc định cho phép, nhắc khi sai (ADR-0020) |

## 3. Bảng A · Hệ thống làm được gì (đối chiếu ngược với mã `origin/main` `90697182`)

Ký hiệu: ✅ có phép kiểm chạy được, có `remedy` · 🟡 có một phần, hoặc đúng ý nhưng sai mức · ☐ chưa có. Cột *Mức đề nghị* là mức **ở nhịp kỳ**; ở nhịp ngày và tuần mọi phép kiểm chỉ nhắc.

| PC | Điều kiện | Hôm nay trong mã | Trạng thái | Thiếu | Ai làm | Nhịp | Mức đề nghị |
|---|---|---|---|---|---|---|---|
| PC-001 | Master Data hợp lệ tại ngày | `ENTITY_CODE_NOT_VALID_AT_DATE` (entity-resolver); `IN-ITEM-*` ở cửa nạp; `UNIT_BASE_INVALID`, `ITEM_CODE_CASE_DUP` (warn) | 🟡 | `DG-ITEM-1..5` chưa đủ; kiểm nhóm hạch toán và tài khoản **hiệu lực tại ngày** chứng từ | PHASE-024 / 026 | ngày | REVIEW (chưa phân loại) · HARD (dòng sổ thiếu `item_id`, DG-ITEM-3) |
| PC-002 | Chứng từ & Ledger đúng trạng thái, không ghi trùng | `EVENT_POSTED_VERSION`, `LEDGER_REVERSED_ONCE` (error); `EVENT_HAS_ENTRY` (warn); `document-checks` (lỗi, bút toán lệch chứng từ) | ✅ | — | — | ngày | HARD |
| PC-003 | Bể chờ không còn việc của kỳ | `EVENT_PENDING_AGE`, `INTAKE_OPEN_AGE`, `EVENT_DEAD` (warn) | ✅ | Tách **lỗi phải sửa** khỏi **chứng từ chờ hợp lệ** (đúng ý đánh giá của chủ dự án) | PHASE-021 | ngày | REVIEW: mỗi mục phải được xử lý, chuyển kỳ hoặc từ chối có lý do |
| PC-004 | Tồn kho không âm; kiểm kê đã xử lý | `INVENTORY_NEGATIVE` (warn, có `forbid` điều chỉnh cho khớp) | 🟡 | Tồn theo **lô**; `stock_count` + snapshot; tách âm **tạm trong kỳ** khỏi âm **tại ngày khoá** | **PHASE-032** S032-8, S032-19 | ngày | REVIEW (âm tạm trong kỳ) · HARD (âm tại ngày khoá, CT-INV-001) |
| PC-005 | Giá vốn đã chốt (`settled`), không cũ | `PERIOD_CLOSE_OPEN` (thiếu giá vốn / kết chuyển trước giá vốn); `COGS_STALE` (warn) | 🟡 | `costing_runs` + `settled`; phát hiện **stale** khi nguồn đổi sau settle; phụ thuộc **mọi nhóm tính giá** của phạm vi khoá | **PHASE-032** S032-13, S032-20 | tuần (lần tính nháp) · kỳ | HARD tại khoá (DG-CLOSE-1); sửa = settle, không phải giải trình |
| PC-006 | Phân bổ FIFO / lớp giá khớp | — | ☐ | `valuation_layers`, `cost_allocations`, CT-COST-001..003 | **PHASE-032** S032-12..16 | tuần · kỳ | HARD (Σ phân bổ ≠ lượng xuất là sai số học) |
| PC-007 | FEFO / tình trạng lô | lô, hạn, cận hạn **chỉ ở mua hàng** (`purchase_documents.data`) | ☐ | Lô ở Kernel; **chỉ xuất từ lô cấm mới đáng kể**; lệch gợi ý FEFO có lý do là hợp lệ | **PHASE-032** S032-8..10 | ngày | INFO (lệch gợi ý có lý do) · REVIEW (xuất lô hết hạn hoặc cách ly, IN-INV-013) · **không HARD** |
| PC-008 | Chuyển kho, hàng đang chuyển | `TRANSIT_NONZERO` (warn: dư TK hàng đang chuyển ≠ 0) | 🟡 **sai ý** | Hàng đi đường qua ngày khoá là **hợp lệ**. Phải kiểm: dư TK hàng đang chuyển = Σ phiếu chuyển **chưa nhận**; phiếu quá *N* ngày; hai đầu phiếu khớp số lượng và giá trị | **PHASE-032** S032-18, sửa CT-INV-003 | ngày | HARD (dư TK ≠ Σ phiếu mở) · REVIEW (đi đường quá N ngày) |
| PC-009 | Giá trị kho ↔ Ledger | `INVENTORY_LEDGER_MISMATCH` (warn, theo nhóm hạch toán, có `forbid`) | 🟡 | So **theo lớp** sau settle, theo (đơn vị kế toán × tài khoản tồn kho × nhóm tính giá) | **PHASE-032** S032-20 (CT-COST-004) | tuần · kỳ | HARD sau settle |
| PC-010 | Trả hàng / đảo giá vốn đúng gốc | `document-checks.orphanReturns` (phiếu trả không tìm được đơn gốc) | 🟡 | Hoàn theo **phân bổ gốc** (hôm nay hoàn theo bình quân tháng trả); trả vượt; trả nhiều lần | **PHASE-032** S032-17 | ngày | REVIEW (không có gốc) · HARD (trả vượt, CT-COST-011) |
| PC-011 | Thuế & hoá đơn | `VAT_INPUT_INVOICE_MATCH`, `TAX_INPUT_NO_INVOICE`, `INVOICE_ISSUE_DATE` (warn); `document-checks` (trùng số, hổng số, hoá đơn bất thường) | 🟡 | Doanh thu và thuế đầu ra ↔ hoá đơn đã phát hành theo kỳ | PHASE-020 / 030 | ngày · tuần | REVIEW |
| PC-012 | Tiền & ngân hàng | `CASH_NEGATIVE` (warn) | 🟡 | Đối soát sổ ngân hàng ↔ sao kê (PHASE-030 ghi là chưa có) | PHASE-030 | tuần | REVIEW (thiếu sao kê) · HARD (quỹ âm tại ngày khoá) |
| PC-013 | Công nợ ↔ Ledger | `DEBT_MATCH_LEDGER` (warn) | ✅ | Biên bản đối chiếu NCC / khách là bằng chứng, không là điều kiện cứng | — | tuần | HARD (sổ chi tiết ≠ sổ cái) · REVIEW (thiếu biên bản) |
| PC-014 | Chi phí cuối kỳ | `DEPRECIATION_OPEN` (warn) | 🟡 | Phân bổ trả trước, trích trước, dự phòng, chênh lệch tỷ giá | PHASE-030 | kỳ | REVIEW |
| PC-015 | Kỳ & phạm vi khoá | khoá đa chiều kỳ × chi nhánh × loại chứng từ; trigger CSDL 0082 | 🟡 | Khoá một chi nhánh phải kéo theo **mọi chi nhánh cùng nhóm tính giá** (giá vốn là của nhóm, không của chi nhánh) | **PHASE-032** S032-28 | kỳ | HARD |
| PC-016 | Bất biến & toàn vẹn Ledger | `LEDGER_ORPHAN`, `LEDGER_BALANCES_DAILY`, `LEDGER_HEADER_EDIT_UNATTRIBUTED`, `EVIDENCE_CHAIN`, `TENANT_ISOLATION` (error); trigger chỉ thêm | ✅ | — | — | ngày | HARD |
| PC-017 | Nguồn đủ để kết chuyển | luật kết chuyển có phiên bản + băm; `PERIOD_CLOSE_OPEN` | 🟡 | Đọc `costing_runs.settled` thay cho "đã bấm tính giá vốn" | **PHASE-032** S032-20 | kỳ (trước) | HARD (DG-CLOSE-1) |
| PC-018 | Kết chuyển không lỗi thời | `PERIOD_CLOSE_OPEN` bắt `cogs_at > close_at` | 🟡 | Mọi nguồn đổi sau kết chuyển (phiếu muộn, settle lại, đổi luật) | **PHASE-032** S032-20 (DG-CLOSE-2) | ngày · kỳ (sau) | HARD tại khoá; sửa = kết chuyển lại |
| PC-019 | Số dư TK 911 = 0 | `closing.service` huỷ cả lần chạy khi 911 còn dư; báo loại 5–8 còn dư | ✅ | — | — | kỳ (sau) | HARD |
| PC-020 | Lợi nhuận & báo cáo khớp | Báo cáo chỉ đọc sổ (R-LEDGER-7) | 🟡 | Phép đối chiếu P&L ↔ phát sinh 911 ↔ 421 | phase kết chuyển | kỳ (sau) | HARD |
| PC-021 | Nguồn không đổi tới lúc khoá | khoá chạy trong giao dịch, có chẩn đoán R-DIAG-4 | ☐ | `sourceDigest` lúc kiểm, kiểm lại **trong cùng giao dịch khoá** | **PHASE-032** S032-29 | khoá | HARD; sửa = chạy lại, không có miễn trừ |
| PC-022 | Quyền khoá và người duyệt | quyền `periods:lock`; vai trò có phạm vi (PHASE-028 W1–W3) | 🟡 | Phạm vi khoá theo vai trò; **tách nhiệm là tuỳ chọn** của đơn vị (D030-12: mặc định một người, có nhật ký) | PHASE-028 | khoá | HARD (không quyền) · REVIEW tuỳ chọn (cùng người lập và duyệt) |
| PC-023 | Liên tục số dư giữa các kỳ | `period_lock_events` ghi mở khoá + lý do; `LEDGER_BALANCES_DAILY` | 🟡 | Đầu kỳ = cuối kỳ trước theo **snapshot khoá**; mở lại kỳ trước thì kỳ sau mất `settled` | **PHASE-032** S032-29 | kỳ | HARD |

**Đếm bảng A hôm nay:** 5 có (PC-002, 003, 013, 016, 019), 15 một phần, 3 chưa có (PC-006, 007, 021). PHASE-032 chịu **12 / 23** dòng: PC-004..010, 015, 017, 018, 021, 023. Đây là lý do *phase giá vốn và kho xong thì kết chuyển mới ổn*.

## 4. Chỉnh hai điều kiện theo đánh giá của chủ dự án

| Điều kiện | Sai ở đâu | Sửa thành |
|---|---|---|
| **FEFO** (PC-007) | Coi mọi lần lệch gợi ý FEFO là vi phạm chặn khoá | Lệch gợi ý **có lý do** = INFO. Xuất từ lô **hết hạn hoặc cách ly** = REVIEW, vì sổ phải ghi đúng việc đã xảy ra, sửa bằng chứng từ chứ không bằng chặn. FEFO **không bao giờ** chặn khoá kỳ |
| **Chuyển kho** (PC-008) | `TRANSIT_NONZERO` hôm nay và CT-INV-003 trong bản đầu PHASE-032 đòi TK hàng đang chuyển **về 0** cuối kỳ | Hàng đi đường qua ngày cuối kỳ là nghiệp vụ hợp lệ. Điều kiện đúng: **dư TK hàng đang chuyển = Σ giá trị phiếu chuyển đã xuất, chưa nhận tại ngày khoá**. Lệch là HARD; phiếu mở quá *N* ngày (tham số, mặc định 7) là REVIEW. Đã sửa CT-INV-003 trong [R-INV](../../rules/RULE-INVENTORY.md) và [35 · G6](35-GOLDEN-CASES.md) |

Chín điều kiện còn lại đúng; phần "cần bổ sung" của bảng đánh giá đã nằm trong cột *Thiếu* ở §3.

## 5. Ba nhịp kiểm: cùng một danh sách, khác mức

| Nhịp | Khi nào | Phạm vi | Chạy gì | Kết quả với kế toán |
|---|---|---|---|---|
| **Ngày** | đêm 01:00 (`bizcity.clock.daily`, đã có cho kiểm chuẩn), và khi bấm *Kiểm ngay* | phát sinh từ lần chạy trước, cả kỳ đang mở | PC-001..004, 007, 008, 010, 011, 016, 018 | **Hộp việc hôm nay**: mỗi phát hiện một việc, có người phụ trách, có tuổi. Không chặn gì |
| **Tuần** | thứ Hai 01:00, và khi bấm *Kiểm tuần* | cả kỳ đang mở | thêm PC-005 (**lần tính giá nháp**, không ghi sổ), 006, 009, 011..013 | **Báo cáo tuần**: đối chiếu sổ chi tiết ↔ sổ cái; dự báo giá vốn, lãi gộp; tuổi việc quá 7 ngày đỏ |
| **Kỳ** | khi kế toán mở *Sẵn sàng khoá kỳ* | kỳ × phạm vi khoá (kéo theo nhóm tính giá) | PRE: tất cả trừ 018..020 → settle → kết chuyển → POST: 018..020, 023 → LOCK: 015, 021, 022 trong cùng giao dịch | **Cổng**: HARD chặn, REVIEW cần lý do và bằng chứng, INFO không chặn |

Chỉ số kế toán xem mỗi sáng (bảng B):

| Chỉ số | Ý nghĩa | Ngưỡng nhắc |
|---|---|---|
| Phép kiểm đạt | đạt / áp dụng, không tính N/A | < 100 % |
| HARD đang mở | việc sẽ chặn khoá nếu để nguyên | > 0 |
| Tuổi việc cũ nhất | ngày từ lần đầu phát hiện | > 7 ngày |
| REVIEW chưa giải trình | ngoại lệ chưa ghi lý do | > 0 vào tuần cuối kỳ |
| Lệch kho ↔ sổ cái | tiền, theo nhóm tính giá | ≠ 0 |
| Lần tính giá nháp gần nhất | ngày, số dòng chưa phân bổ | > 7 ngày hoặc > 0 dòng |
| Dự báo sẵn sàng khoá | "nếu hôm nay khoá thì còn N HARD, M REVIEW" | — |

## 6. Mức HARD hẹp, REVIEW có lý do (Q032-6 — **chủ dự án chọn C ngày 2026-11-09**, D032-11)

Bản mẫu PHASE-033 ghi *"HARD_BLOCK không thể miễn trừ, kể cả admin"*. Trên `main` hôm nay, **R-DIAG-4** cho khoá kỳ khi chẩn đoán L3 có lỗi, nếu người khoá ghi lý do ≥ 10 ký tự. ADR-0020 nói *mặc định cho phép, nhắc khi sai*; D030-12 chọn *một người, chỉ ghi nhật ký*. Hai hướng này mâu thuẫn, nên cần chủ dự án quyết.

**Đã chốt (phương án C):** chỉ một nhóm hẹp là HARD không miễn trừ. Đó là những trạng thái mà "chấp nhận có lý do" chỉ có nghĩa là đóng băng một con số sai. Cách thoát duy nhất là **sửa bằng chứng từ hoặc chạy lại**, nên không ai bị kẹt:

| HARD không miễn trừ | Vì sao không có nghĩa khi miễn trừ | Cách thoát |
|---|---|---|
| PC-016 sổ không cân, dòng mồ côi, sửa đầu bút toán không rõ người | sổ sai về toán học hoặc mất vết | sửa bằng bút toán đảo + ghi mới; không sửa SQL |
| PC-006 Σ phân bổ ≠ lượng xuất; lớp xuất quá lượng nhập | giá vốn không tồn tại về số học | sửa chứng từ nguồn, chạy lại |
| PC-009 tồn theo lớp ≠ số dư tài khoản tồn kho, sau settle | sổ chi tiết và sổ cái nói hai sự thật | tìm chứng từ lệch; `forbid` điều chỉnh cho khớp |
| PC-019 911 còn dư sau kết chuyển | báo cáo kết quả sai | kết chuyển lại |
| PC-021 nguồn đổi giữa lúc kiểm và lúc khoá | kết quả kiểm không còn đúng | kiểm lại |
| PC-023 đầu kỳ ≠ cuối kỳ trước | đứt chuỗi số dư | khoá lại kỳ trước hoặc chạy lại kỳ này |

**Mọi điều kiện khác là REVIEW:** một người có quyền khoá ghi lý do và bằng chứng (tệp hoặc liên kết chứng từ). Người đó chọn phạm vi chấp nhận. Lý do gắn vào `sourceDigest`, nên nguồn đổi thì lý do hết hiệu lực. Đơn vị muốn chặt hơn thì bật *tách nhiệm* (người duyệt REVIEW ≠ người lập), đúng tinh thần "strict là lựa chọn của đơn vị".

## 7. Checklist triển khai Inventory Engine theo điều kiện khoá kỳ

Thứ tự đi theo **cái kế toán dùng được sớm nhất**. Mỗi đợt mang thêm phép kiểm vào nhịp ngày trước, rồi mới vào cổng kỳ.

| Bước | Đợt | Mang lại cho kế toán | PC đạt thêm | Việc |
|---|---|---|---|---|
| 1 | W0+ | **Sổ đăng ký phép kiểm** một chỗ: mã PC, nhịp, mức theo nhịp, `remedy`, chủ việc; ánh xạ mã chẩn đoán hiện có vào PC | — (khung) | S032-26 |
| 2 | W0+ | **Hộp việc hằng ngày**: chạy L3 hiện có lúc 01:00 cạnh kiểm chuẩn đêm; lưu lượt; bảng B tối thiểu | PC-002, 003, 013, 016 sang nhịp ngày | S032-27 |
| 3 | W1 | Lô ở Kernel, `lotRef`, pick-lots, IN-INV-010..013 | PC-007 (mức đúng), PC-004 theo lô | S032-8..10 |
| 4 | W1 | Sửa định nghĩa hàng đang chuyển: dư TK = Σ phiếu mở; quá N ngày | PC-008 đúng ý | S032-18 (một phần), sửa `TRANSIT_NONZERO` |
| 5 | W2 | Lớp, phân bổ, `costing_runs`; **lần tính nháp hằng tuần** không ghi sổ; parity P1 | PC-005 (nháp), PC-006, PC-009 theo lớp | S032-12..14 |
| 6 | W3 | Đảo chiều theo gốc, trả vượt, chuyển kho giữ giá trị, hai pháp nhân | PC-010, PC-008 đủ | S032-15..18 |
| 7 | W4 | Cổng: DG-CLOSE-1 / 2 đọc `settled`; khoá kéo cả nhóm tính giá; `sourceDigest` kiểm lại trong giao dịch khoá; đầu kỳ = snapshot cuối kỳ trước | PC-005 (settled), 015, 017, 018, 021, 023 | S032-20, S032-28, S032-29 |
| 8 | W4 | Mức HARD hẹp / REVIEW theo §6 (sau khi chủ dự án trả Q032-6); lý do gắn `sourceDigest` | toàn bộ cổng | S032-30 |
| 9 | W5 | Màn *Sẵn sàng khoá kỳ* (bản mẫu PHASE-033) đọc cùng sổ đăng ký; màn *Sức khoẻ sổ hôm nay* | bảng A + B trên màn | S032-24 |

Ngoài PHASE-032, và sẽ thuộc phase kết chuyển / PHASE-033: PC-011, 012, 014, 020, 022. Bảng A ghi rõ chủ việc để không ai tưởng Inventory Engine lo hết.

## 8. Kế toán dùng bảng này để đánh giá hệ thống thế nào

1. **Trước khi dùng thật:** đọc bảng A. Mỗi dòng 🟡 hoặc ☐ là việc vẫn phải kiểm bằng tay hôm nay, ví dụ đối soát ngân hàng hay hoàn giá vốn trả hàng. Bảng A sinh từ bằng chứng, không ai tích tay (R-CONT-7).
2. **Hằng ngày:** mở hộp việc. Chỉ số *HARD đang mở = 0* và *tuổi việc ≤ 7 ngày* nghĩa là sổ khoẻ.
3. **Hằng tuần:** xem lần tính giá nháp và đối chiếu kho ↔ sổ cái. Lệch phát hiện ở tuần 2 rẻ hơn nhiều so với ngày 30.
4. **Cuối kỳ:** *Sẵn sàng khoá kỳ* không nên có phát hiện mới. Nếu có, đó là lỗi của nhịp ngày hoặc tuần, và phải ghi lại để sửa phép kiểm.
5. **Diễn tập:** chín ca vàng G1..G9 và C1 ([35](35-GOLDEN-CASES.md)) là bộ đề kế toán trưởng tự chạy trên bản thử để tin hệ thống.

## 9. Bảng điểm chấm theo tuần và theo tháng: chia nhỏ để chốt dễ
<!-- [2026-11-10 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — bảng điểm tuần / tháng (chủ dự án: "scoreboard chấm hàng tuần, hàng tháng, tháng nào nhìn được kết quả tháng đó, chia nhỏ vấn đề ra thì chốt dễ hơn"); chốt tuần mềm; S032-31..33 -->

**Có, chia nhỏ thì chốt dễ hơn**, vì ba lẽ:
1. Lỗi phát hiện trong tuần thì chứng từ còn mới, người lập còn nhớ, nhà cung cấp còn dễ hỏi.
2. Mỗi tuần chỉ phải giải quyết việc của tuần đó. Ngày khoá sổ chỉ còn các phép kiểm vốn chỉ chạy được cuối kỳ (PC-014, 017..023).
3. Kết quả từng tuần, từng tháng được **lưu lại**. Kế toán trưởng nhìn được tháng nào cũng như tháng nào, không phải dựng lại từ trí nhớ.

### 9.1 Ba lớp bảng điểm

| Lớp | Đơn vị chấm | Nguồn | Lưu | Ai nhìn |
|---|---|---|---|---|
| **Ngày** | hộp việc sáng | lượt chẩn đoán đêm (`diagnostic_runs`, đã có từ 0034) | lượt chạy | kế toán viên |
| **Tuần** | (tuần ISO, kỳ, phạm vi) | tổng các lượt ngày + đối chiếu tuần + lần tính giá nháp | **bản chụp chỉ thêm**, có `sourceDigest` | kế toán trưởng |
| **Tháng** | (kỳ, phạm vi) | tổng các tuần + phép kiểm chỉ chạy ở kỳ + kết quả khoá | bản chụp lưu **cùng nhật ký khoá**, là hồ sơ bằng chứng của kỳ | kế toán trưởng, CEO, kiểm toán |

Tuần vắt hai tháng (ví dụ 27/10–02/11) tách **hai dòng**, mỗi kỳ một dòng theo ngày chứng từ. Vì vậy tháng nào cũng có đủ tuần của chính nó.

### 9.2 Chỉ số chấm (đếm được, không gộp thành một "điểm" mơ hồ)

| Chỉ số | Tuần | Tháng | Mức màu |
|---|---|---|---|
| Phép kiểm đạt / áp dụng | ✓ | ✓ | xanh 100 % · vàng ≥ 90 % · đỏ < 90 % |
| HARD đang mở cuối tuần | ✓ | — | xanh 0 · đỏ > 0 |
| Việc mới / việc đã đóng trong tuần | ✓ | Σ | vàng khi mới > đóng hai tuần liền |
| Tuổi việc cũ nhất | ✓ | ✓ | vàng > 7 ngày · đỏ > 14 ngày |
| Lệch kho ↔ sổ cái (tiền) | ✓ | ✓ | xanh 0 · đỏ ≠ 0 |
| Lần tính giá nháp: dòng chưa phân bổ | ✓ | — | xanh 0 |
| Tuần đã chốt mềm | ✓ | số tuần / tổng | vàng khi tuần cũ chưa chốt |
| **Phát hiện mới ở cổng kỳ** (không có ở tuần nào trước) | — | ✓ | **mục tiêu 0**: đo chất lượng của nhịp tuần |
| Số ngày từ cuối tháng tới khoá | — | ✓ | so với tháng trước |
| REVIEW đã chấp nhận khi khoá | — | ✓ (kèm lý do) | để kiểm toán đọc |

Màu chỉ để nhìn nhanh. Mỗi ô bấm vào ra danh sách việc thật, không có con số nào không truy được.

### 9.3 Chốt tuần (mềm): chia nhỏ mà không khoá dữ liệu

- Cuối tuần, kế toán trưởng bấm **Đã xem tuần 46**. Điều kiện là mọi việc của tuần đã **có người nhận** hoặc **có lý do để lại**. Không cần hết lỗi, chỉ cần không còn việc vô chủ.
- Chốt tuần **không khoá dữ liệu**, không chặn ghi lùi. Đây không phải khoá sổ, nên không trái ADR-0020.
- Chứng từ ghi lùi vào tuần đã chốt hiện nhãn **đổi sau khi chốt tuần** trên bảng điểm tuần đó, kèm chứng từ nào, ai, khi nào. Bản chụp cũ vẫn giữ nguyên, một bản mới được thêm vào. Kế toán thấy tuần đó đã từng sạch rồi bị thay đổi, đúng như kiểm toán cần.
- Chỉ khoá kỳ (cuối tháng) mới chặn, và chặn theo D032-11.

### 9.4 Lưu ý với giá vốn bình quân tháng

Đơn giá bình quân **chỉ đúng khi hết tháng**. Lần tính giá nháp hằng tuần chỉ để **phát hiện sớm** dòng xuất thiếu phiếu nhập, tồn âm, lệch kho ↔ sổ cái. Nó **không** là số báo cáo, và bảng điểm tuần ghi rõ "giá vốn tạm tính". Với FIFO (khi đơn vị chọn), số tuần đã gần số thật, nhưng vẫn chỉ chốt khi settle cuối kỳ.

### 9.5 Ví dụ một tháng

| Tuần (kỳ 11/2026) | Đạt | HARD cuối tuần | Mới / đóng | Việc cũ nhất | Lệch kho | Chốt mềm |
|---|---|---|---|---|---|---|
| T44 (01/11 — phần thuộc kỳ 11; 26–31/10 thuộc kỳ 10) | 23 / 23 | 0 | 1 / 1 | 0 | 0 | ✓ 02/11 |
| T45 (02–08/11) | 19 / 23 | 1 | 6 / 3 | 9 ngày | 5.000.000 | ✓ 09/11, có lý do |
| T46 (09–15/11) | 22 / 23 | 0 | 2 / 5 | 3 ngày | 0 | ✓ 16/11 |
| T47 (16–22/11) | 23 / 23 | 0 | 1 / 1 | 0 | 0 | ✓ 23/11 |
| T48 (23–29/11) | 22 / 23 | 0 | 3 / 2 | 2 ngày | 0 | ✓ 30/11 → **đổi sau chốt**: 1 phiếu ghi lùi ngày 28/11 |
| T49 (30/11 — phần thuộc kỳ 11) | 22 / 23 | 0 | 1 / 0 | 0 | 0 | gộp vào cổng kỳ |
| **Tháng 11** | cổng kỳ: 0 HARD, 2 REVIEW có lý do | | **phát hiện mới ở cổng kỳ: 0** | | | khoá 03/12 (tháng 10: khoá 08/12) |

Bản vẽ: [mockups/bang-diem-ke-toan.html](mockups/bang-diem-ke-toan.html) › *C · Theo tuần / tháng*.

## 10. Ma trận thời gian: tiêu chí × tuần / tháng, kèm mốc triển khai
<!-- [2026-11-10 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — ma trận thời gian (chủ dự án: "nhìn được nhiều tuần, nhiều tháng, kiểu milestone hoặc timeline scoreboard matrix để đánh giá từng cột tiêu chí theo từng tháng, tuần"); S032-34 -->

Bảng điểm tuần / tháng ở §9 cho biết **một** cột. Ma trận ghép nhiều cột lại để nhìn ba điều một lúc:

1. **Theo hàng:** một tiêu chí đỏ lặp lại qua nhiều tuần là **điểm yếu có hệ thống**, ví dụ quy trình lấy biên bản công nợ hay nạp phiếu nhập muộn. Lỗi một tuần thì không cần đổi quy trình.
2. **Theo cột:** mỗi tuần, mỗi tháng có tỉ lệ đạt trên số tiêu chí đo được. Nhìn ngang là thấy xu hướng tốt lên hay xấu đi.
3. **Theo mốc:** bên phải vạch *nay*, các mốc M0..M4 của PHASE-032 cho biết **từ cột nào** hệ thống bắt đầu đo được tiêu chí nào. Ô "chưa đo được" trước mốc là chỗ kế toán còn kiểm tay. Ô đó **không** được tính là đạt.

### 10.1 Khuôn

| Trục | Nội dung |
|---|---|
| Hàng | 23 tiêu chí PC, gom bốn nhóm: dữ liệu gốc & chứng từ · kho & giá vốn · thuế, tiền, công nợ, chi phí · kết chuyển & khoá |
| Cột | hạt **tuần** (tuần ISO, tách theo kỳ) hoặc hạt **tháng** (kỳ); cột quá khứ đọc bản chụp đã lưu, cột tương lai đọc kế hoạch mốc |
| Ô quá khứ | ✓ đạt · **!** có việc, đã xử lý trong cột · **R** REVIEW chấp nhận có lý do · **✕** HARD / lỗi còn mở cuối cột · **·** không áp dụng ở hạt này (tiêu chí chỉ chạy ở kỳ) · **╱** hệ thống chưa đo được; chấm cam ở góc = đo một phần (bảng A 🟡) |
| Ô tương lai | viền đứt = chưa có mốc; viền tím + **M** = cột bắt đầu đo được theo mốc |
| Tổng | cuối hàng: số cột đỏ / vàng; cuối cột: đạt / đo được |
| Bấm ô | kết quả, việc của cột, người xử lý, bản chụp (`sourceDigest`) hoặc mốc |

Nguồn dữ liệu là bản chụp tuần / tháng của §9 (S032-31, S032-33). Ma trận **chỉ đọc**, không có ô nào sửa tay được (R-CONT-7). Mốc đọc từ checklist phase: khi một việc S032-* chuyển ✅, cột bắt đầu đo được dời về ngày thật.

### 10.2 Đọc ma trận

| Thấy | Nghĩa | Làm gì |
|---|---|---|
| Cả cột đỏ dày (ví dụ kỳ 10) | kỳ khoá dồn việc cuối tháng | bật nhịp tuần; cột sau phải nhạt dần |
| Một hàng có **R** tháng nào cũng có (ví dụ PC-013 biên bản công nợ) | ngoại lệ đã thành thói quen | đổi quy trình lấy biên bản, không chấp nhận mãi |
| Hàng **╱** dài tới một mốc | hệ thống chưa đo, kế toán đang kiểm tay | giữ bằng chứng kiểm tay; theo dõi mốc |
| Cột **✕** ở tuần, sang tuần sau ✓ | phát hiện sớm, sửa kịp | đúng mục tiêu của nhịp tuần |
| ✕ xuất hiện lần đầu ở cột tháng | cổng kỳ có phát hiện mới | xem lại phép kiểm tuần (chỉ số §9.2) |

### 10.3 API (đề xuất, viết cùng S032-34)

`GET /api/v1/closing/scoreboard?grain=week|month&from=&to=&scope=` (quyền `ledger:read`) trả `{ columns[{ key, label, past, snapshotId?, sourceDigest? }], rows[{ pc, group, cells[{ state, findings, accepted?, milestone? }] }], milestones[{ id, column, pcs[] }] }`. Không ghi. Bản vẽ: [mockups/bang-diem-ke-toan.html](mockups/bang-diem-ke-toan.html) › *D · Ma trận thời gian* (mở thẳng: `#D`, hạt tháng: `#d-thang`).
