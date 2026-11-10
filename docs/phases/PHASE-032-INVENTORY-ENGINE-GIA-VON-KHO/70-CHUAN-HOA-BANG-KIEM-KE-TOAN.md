# PHASE-032 · 70 — Chuẩn hoá bảng kiểm sổ sách: một bộ kiểm cho kế toán, gắn với nghiệp vụ module và sự việc nạp về Kernel
<!-- [2026-11-10 01:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — rà CANON / luật / hợp đồng theo bảng kiểm ngày · tuần · tháng · khoá thử; đề xuất R-DIAG-10..16 (mở rộng, không hợp đồng mới), module khai phép kiểm, trường "kiểm được" ở cửa nạp, Bàn làm việc kế toán thống nhất HT08, thuật ngữ cho kế toán; Q032-7 -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> <!-- [2026-11-09 09:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — Q032-7 = mở rộng, Q032-8 = đổi HT08 --> **Hướng đã duyệt (2026-11-09):** Q032-7 = mở rộng (D032-12), Q032-8 = đổi HT08 (D032-13). Mã chưa làm; luật có hiệu lực theo từng việc S032-35..39. Đọc mã `origin/main` `5cde9984` (2026-11-10). Bản vẽ: [mockups/bang-diem-ke-toan.html](mockups/bang-diem-ke-toan.html).

## 1. Trả lời ngắn

| Câu hỏi | Trả lời |
|---|---|
| Có cần định nghĩa chuẩn mới không? | **Có, nhưng mở rộng cái đang có, không thêm hợp đồng hay engine thứ hai.** Bộ chẩn đoán (`registerDiagnostics`, `DiagCheck`, `diagnostic_runs`, R-DIAG-1..9), thư viện mã có cách sửa (R-FIX-1, `bizcity_remedy@1`) và xem trước khoá kỳ (`GET /api/v1/periods/check`, màn PeriodsPage đang gọi) và xem trước kết chuyển (`POST /api/v1/closing/preview`, action `core.closing.preview`) đã là phần lớn bộ máy. Thiếu: **kỳ kiểm** (ngày / tuần / cuối tháng), **bước khoá** (trước kết chuyển / sau / lúc khoá), **mức theo kỳ kiểm**, **mã điều kiện khoá sổ** (PC), **bản lưu tuần / tháng**, và **module tự khai phép kiểm**. Đề xuất bảy luật R-DIAG-10..16 (§3) |
| Gắn với nghiệp vụ module, sự việc nạp về Kernel thế nào? | Mỗi loại chứng từ khai **nó ảnh hưởng điều kiện khoá sổ nào** và **phải gửi trường nào để kiểm được**. Không gửi đủ thì phép kiểm biết là "không kiểm được", không giả vờ đạt (R-DIAG-7). Sự việc ghi sổ làm phép kiểm liên quan **phải chạy lại** (§4) |
| Bàn làm việc kế toán? | **Một bàn**, phát triển từ Bàn đánh giá HT08 đã có, năm thẻ bằng lời kế toán: *Việc hôm nay · Khoá thử hôm nay · Kết quả từng tuần, tháng · Sổ theo dõi các tháng · Phần mềm tự kiểm được gì*. Việc đi vào **hàng việc** sẵn có, khoá sổ thật vẫn ở ACC2 (§5) |
| Một chuẩn bảng kiểm cho mọi việc của kế toán? | **Có:** một sổ đăng ký điều kiện khoá sổ, một kiểu kết quả, ba kỳ kiểm, một bản lưu. Mọi màn đọc từ đó: hộp việc, khoá thử, khoá sổ thật, bàn đánh giá theo vai, sổ theo dõi các tháng, bảng trụ cột HT10 |
| Khoá thử hôm nay | Giữ và nâng lên thành **thẻ riêng**: kiểm số liệu + tính tạm giá vốn + kết chuyển thử + kiểm sau kết chuyển, **không ghi gì vào sổ** (R-DIAG-2). Chạy mỗi sáng thành **dự báo** khoá sổ (§6) |
| Thuật ngữ | Bỏ tiếng Anh trên màn kế toán. Bảng đối chiếu ở §7; bản mẫu đã đổi hết |

## 2. Rà CANON, luật, hợp đồng: đã có gì, thiếu gì

| Thành phần | Đang có trên `main` | Thiếu cho bảng kiểm ngày / tuần / tháng |
|---|---|---|
| CANON §0.9, ADR-0020 | người dùng quyết, Core chỉ chỗ sai, mặc định cho phép, nhắc khi sai | câu "điều kiện khoá sổ cũng là việc hằng ngày" — đề xuất thêm một dòng ở §0 (sau duyệt) |
| R-DIAG-1..9 ([RULE-SELF-DIAGNOSTICS](../../rules/RULE-SELF-DIAGNOSTICS.md)) | mã ổn định, mức, một câu hậu quả + cách sửa; chỉ đọc; lịch L3 mỗi đêm và trước khoá kỳ; khoá bị chặn khi L3 `error` (+ ngoại lệ D032-11); lưu 90 ngày; báo khi có lỗi mới; "đạt rỗng không phải đạt" | kỳ kiểm tuần; mức **theo kỳ kiểm**; bước khoá; bản lưu tuần / tháng **giữ lâu hơn 90 ngày** (hồ sơ kỳ); khoá thử đủ bước |
| `DiagCheck` (`packages/platform/src/system/diagnostics.ts`) | `code`, `layer`, `level`, `title`, `fix`, `remedy`, `scoped`, `run()` | `closeRef` (PC), `cadence[]`, `stage`, `levelAt` theo kỳ kiểm, `hard` (D032-11), `owner` (vai), `scopeBy` (chi nhánh / nhóm tính giá / đơn vị) |
| R-FIX-1, `bizcity_remedy@1` | mỗi kiểm `warn` / `error` có bước, màn, vai, kiểm lại, `forbid` | đủ — dùng nguyên |
| `bizcity_findings@1`, `bizcity_intake_findings@1` | một ngôn ngữ mã cho cổng A / B / C, có căn cứ pháp lý | ánh xạ mã → PC (một mã có thể nuôi một điều kiện) |
| `GET /api/v1/periods/check` | xem trước chẩn đoán L3 của kỳ, không lưu lượt | chưa có tính tạm giá vốn, kết chuyển thử, kiểm sau kết chuyển trong cùng một lần |
| `bizcity_module@1`, `module-sdk` | module khai action, sự kiện, hook, quyền, cấu hình | **không khai được phép kiểm** — `registerDiagnostics` chỉ ở Platform / Kernel |
| `bizcity_ledger_intake@1` | khuôn chứng từ nạp, `lineKey`, `policyRefs` | không ghi "trường cần để kiểm" theo loại chứng từ (`originalLineRef`, `lotRef`, cặp chứng từ chuyển) |
| `bizcity_event@1` | `bizcity.ledger.entry.posted`, `bizcity.diagnostics.failed`… | sự kiện bản lưu tuần / tháng, "số liệu đổi sau khi đã xem tuần" |
| HT08 Bàn đánh giá (PHASE-022), HT10 Trụ cột, HT12 Bàn điều hành (PHASE-030 · 21), ACC14 chờ duyệt, hàng việc (`QUEUE_SOURCES`) | ba vai đọc checklist giả định lỗi; mức đạt trụ cột; thống kê cổng | không có góc nhìn **theo thời gian**; HT08 và màn khoá kỳ không dùng chung một sổ điều kiện |

Kết luận: **không có hợp đồng thứ 25** (giữ tinh thần PHASE-030 · 21 *"không hợp đồng `bizcity_gate@1` riêng"*). Chuẩn mới là **luật R-DIAG mở rộng + trường mới trên `DiagCheck` + minor của ba hợp đồng có sẵn**.

## 3. Luật R-DIAG-10..16 (đã duyệt, Q032-7 → D032-12)

| Mã | Luật | Kiểm bằng (khi có mã) |
|---|---|---|
| **R-DIAG-10** | **Một sổ điều kiện khoá sổ.** Mọi điều kiện khoá sổ có mã `PC-nnn`, tên tiếng Việt, nhóm, bước (`trước kết chuyển` · `sau kết chuyển` · `lúc khoá`), chủ việc (vai). Một PC được nuôi bởi một hay nhiều mã chẩn đoán / mã kiểm; mọi màn (hộp việc, khoá thử, khoá sổ, bàn đánh giá, sổ theo dõi) **đọc cùng sổ này** | SC-DIAG-2: mỗi `DiagCheck` có `closeRef` hoặc ghi rõ "không thuộc khoá sổ"; mỗi PC có ít nhất một mã nuôi hoặc ghi "kế toán kiểm tay" |
| **R-DIAG-11** | **Ba kỳ kiểm, cùng một phép kiểm.** Mỗi PC khai `cadence ⊆ {ngày, tuần, cuối tháng}`. Hằng ngày và hằng tuần **chỉ nhắc việc**, không chặn; cuối tháng (và khoá thử) mới áp mức chặn | test: cùng dữ liệu, nhịp ngày ra *nhắc việc*, khoá thử ra *chặn khoá sổ* |
| **R-DIAG-12** | **Ba mức khi khoá sổ, nói bằng lời kế toán:** *Chặn khoá sổ — phải sửa* (chỉ danh sách D032-11), *Cần giải trình* (một người có quyền ghi lý do + bằng chứng, gắn **dấu số liệu**), *Để biết* (không chặn). Mức gắn theo **kết quả**, không theo tên điều kiện: cùng PC-008, lệch dư tài khoản hàng đang chuyển là *chặn*, phiếu đi đường quá N ngày là *cần giải trình* | test PC-008 hai nhánh |
| **R-DIAG-13** | **Bản lưu tuần, bản lưu tháng.** Mỗi tuần (tuần ISO, tách theo kỳ) và mỗi kỳ khoá có một bản lưu chỉ thêm: kết quả từng PC, việc mới / đã đóng, dấu số liệu. Bản lưu tháng giữ **cùng hồ sơ khoá kỳ** (không theo hạn 90 ngày của R-DIAG-5). Số liệu đổi sau khi đã xem tuần → thêm bản lưu mới, giữ bản cũ | trigger chỉ thêm; `CT-*` / `DG-CLOSE-*` đọc bản lưu |
| **R-DIAG-14** | **Khoá thử không ghi sổ.** Khoá thử chạy đủ các bước của khoá thật (kiểm trước → tính tạm giá vốn → kết chuyển thử → kiểm sau → kiểm lúc khoá) trên giao dịch chỉ đọc hoặc bản nháp không lưu; kết quả = dự báo. Không tạo bút toán, không đổi trạng thái kỳ | test: chạy khoá thử, số bút toán và `period_locks` không đổi |
| **R-DIAG-15** | **Module tự khai phép kiểm của mình** qua SDK (`defineCheck`, minor `bizcity_module@1` `extensions.checks`): chỉ đọc (R-DIAG-2), có `remedy` (R-FIX-1), gắn PC hoặc tạo PC mới trong nhóm của module; không được hạ mức của PC lõi | SC-MOD: manifest khai `checks` khớp mã; selfcheck module |
| **R-DIAG-16** | **Kiểm được là điều kiện của khuôn nạp.** Mỗi loại chứng từ khai các trường cần để kiểm (bảng §4). Thiếu trường thì PC tương ứng ghi **"không kiểm được"** (khác "đạt", R-DIAG-7) và hiện trên bàn làm việc; nguồn bị nhắc sửa | `IN-*` ở cửa nạp; bàn làm việc đếm "không kiểm được" |

`DiagCheck` thêm (Platform, chỉ thêm trường tuỳ chọn, không phá ai):

```ts
interface DiagCheck {
  // … như hiện nay
  closeRef?: `PC-${string}` | 'none';        // R-DIAG-10
  cadence?: ('day' | 'week' | 'period')[];   // R-DIAG-11
  stage?: 'pre' | 'post' | 'lock';           // bước khoá
  severityAtClose?: (r: DiagResult) => 'block' | 'explain' | 'note';   // R-DIAG-12, theo kết quả
  owner?: 'accountant' | 'chief_accountant' | 'warehouse' | 'cashier' | 'tax';
  scopeBy?: 'branch' | 'cost_group' | 'entity';  // khoá kéo theo nhóm tính giá (PC-015)
}
```

### 3a. Gắn 46 phép kiểm đang có vào điều kiện khoá sổ (B2c-2, S032-35)
<!-- [2026-11-10 09:35 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B2c-2: chữ chốt trường DiagCheck (closeRef, kỳ kiểm, bước khoá, mức khi khoá) theo R-FLOW-2 -->

Hình dạng chốt ở [RULE-SELF-DIAGNOSTICS §2b](../../rules/RULE-SELF-DIAGNOSTICS.md): kỳ kiểm và bước khoá thuộc PC, phép kiểm chỉ trỏ `closeRef`; người làm là `remedy.owner` đã có, không thêm `owner`; `scopeBy` hoãn tới S032-28. Bảng dưới thay khối `DiagCheck` phác ở §3. Cột *Nhịp* lấy từ [60 §2](60-SCOREBOARD-KE-TOAN.md). Bước: *trước* = trước kết chuyển, *sau* = sau kết chuyển.

| PC | Tên | Nhịp | Bước | Phép kiểm nuôi (`closeRef`) |
|---|---|---|---|---|
| PC-001 | Danh mục hợp lệ tại ngày | ngày | trước | `ITEM_CODE_CASE_DUP`, `UNIT_BASE_INVALID` |
| PC-002 | Chứng từ và sổ đúng trạng thái, không ghi trùng | ngày | trước | `EVENT_POSTED_VERSION`, `LEDGER_REVERSED_ONCE`, `EVENT_HAS_ENTRY`, `INTERNAL_EVENT_VERSION`, `POLICY_VERSION`, `ENTRY_NO_VERSION`, `ENTRY_VERSION_UNKNOWN`, `EVENT_ENTRIES_STALE` |
| PC-003 | Không còn chứng từ chờ của kỳ | ngày | trước | `EVENT_PENDING_AGE`, `INTAKE_OPEN_AGE`, `EVENT_DEAD` |
| PC-004 | Tồn kho không âm, kiểm kê đã xử lý | ngày | trước | `INVENTORY_NEGATIVE`, `STOCK_ADJUST_NO_REASON` |
| PC-005 | Giá vốn đã chốt, không cũ | tuần · cuối tháng | trước | `COGS_STALE` |
| PC-006 | Phân bổ giá vốn theo lớp nhập khớp lượng xuất | tuần · cuối tháng | trước | — *chưa có phép kiểm; thêm ở S032-12..16* |
| PC-007 | Lô và hạn dùng | ngày | trước | — *chưa có phép kiểm; thêm ở S032-8..10* |
| PC-008 | Chuyển kho, hàng đang chuyển | ngày | trước | `TRANSIT_NONZERO` |
| PC-009 | Giá trị kho khớp sổ cái | tuần · cuối tháng | trước | `INVENTORY_LEDGER_MISMATCH` |
| PC-010 | Trả hàng hoàn đúng giá vốn gốc | ngày | trước | — *kiểm chứng từ `orphanReturns` (không phải tự chẩn đoán); thêm ở S032-17* |
| PC-011 | Thuế và hoá đơn | ngày · tuần | trước | `TAX_INPUT_NO_INVOICE`, `VAT_INPUT_INVOICE_MATCH`, `VAT_REDUCED_RATE`, `VAT_INPUT_NONCASH`, `INVOICE_FIELDS`, `INVOICE_ISSUE_DATE` |
| PC-012 | Tiền và ngân hàng | tuần | trước | `CASH_NEGATIVE` |
| PC-013 | Công nợ khớp sổ cái | tuần | trước | `DEBT_MATCH_LEDGER` |
| PC-014 | Chi phí cuối kỳ (khấu hao, phân bổ) | cuối tháng | trước | `DEPRECIATION_OPEN` |
| PC-015 | Kỳ và phạm vi khoá | cuối tháng | lúc khoá | — *khoá theo kỳ × chi nhánh × loại chứng từ, trigger CSDL 0082; thêm ở S032-28* |
| PC-016 | Sổ cái toàn vẹn, không sửa ngoài ứng dụng | ngày | trước | `LEDGER_BALANCED`, `LEDGER_BALANCES_DAILY`, `LEDGER_ORPHAN`, `LEDGER_ROUNDING`, `LEDGER_HEADER_EDIT_UNATTRIBUTED`, `EVIDENCE_CHAIN`, `EVIDENCE_SEAL_MISSING`, `EVIDENCE_SEAL_FILE`, `EVIDENCE_SEAL_DB`, `EVIDENCE_SEAL_CHAIN`, `TENANT_ISOLATION` (L1), `LEDGER_TRIGGERS` (L1) |
| PC-017 | Đủ nguồn để kết chuyển | cuối tháng | trước | `PERIOD_CLOSE_OPEN` |
| PC-018 | Kết chuyển không lỗi thời | ngày · cuối tháng | sau | — *hôm nay nằm trong `PERIOD_CLOSE_OPEN`; tách mã ở S032-20 (DG-CLOSE-2)* |
| PC-019 | Tài khoản 911 hết số dư | cuối tháng | sau | — *`closing.service` huỷ cả lần kết chuyển khi 911 còn dư* |
| PC-020 | Lợi nhuận và báo cáo khớp sổ | cuối tháng | sau | `ACCOUNT_WRONG_SIDE` (tài khoản dư sai bên làm sai báo cáo) |
| PC-021 | Số liệu không đổi tới lúc khoá | cuối tháng | lúc khoá | — *khoá chạy trong giao dịch có chẩn đoán R-DIAG-4; dấu số liệu ở S032-29* |
| PC-022 | Quyền khoá sổ, tách người lập và người duyệt | cuối tháng (phép kiểm nhắc hằng ngày) | lúc khoá | `LEDGER_SELF_APPROVED` (S029-25, thêm 2026-11-11 <!-- [2026-11-11 01:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — PC-022 có phép kiểm nuôi -->); quyền `periods:lock`, vai có phạm vi (PHASE-028) |
| PC-023 | Số dư liền mạch giữa các kỳ | cuối tháng | lúc khoá | — *`period_lock_events` ghi mở khoá kèm lý do; thêm ở S032-29* |
| `none` | Việc vận hành, không thuộc khoá sổ | — | — | `MIGRATIONS_PENDING`, `DB_WRITABLE` (L1), `CONFORMANCE_STALE`, `PROFILE_DECLARED`, `PROFILE_PACK_REGIME` (L5) |

Tổng: 42 mã gắn PC, 5 mã `none` (từ 2026-11-11, thêm `LEDGER_SELF_APPROVED`). Tám PC chưa có phép kiểm tự chẩn đoán nuôi; mỗi PC ghi `checkedElsewhere` như cột cuối. Mức khi khoá kỳ ở B2c-2 theo mặc định (`error` → cần giải trình, `warn` → để biết); chưa mã nào trả *chặn khoá sổ* cho tới S032-30.

## 4. Gắn với nghiệp vụ của module và sự việc nạp về Kernel

**Hai chiều:** chứng từ nào làm điều kiện nào phải kiểm lại (chiều *ảnh hưởng*), và chứng từ đó phải mang trường gì để kiểm được (chiều *kiểm được*).

| Module · loại chứng từ | Ảnh hưởng điều kiện khoá sổ | Phải mang để kiểm được | Thiếu thì |
|---|---|---|---|
| Mua hàng · `purchase` | PC-001, 004, 005, 006, 009, 011 | `itemId`/mã tại ngày, `lineKey`, `lotRef` (mặt hàng theo dõi lô), hoá đơn (`invoice`), `policyRefs` | PC-007 / 011 "không kiểm được" cho dòng đó |
| Mua hàng · `purchase_return` | PC-005, 006, 009, 010 | `originalLineRef` (phiếu nhập gốc), `lotRef` | `CT-COST-010` cần giải trình |
| Bán hàng / POS · `sale` | PC-004, 005, 006, 007, 011 | `lineKey`, `lotRef` khi đã chọn lô, `policyRefs`, hoá đơn | lô "không kiểm được"; FEFO chỉ để biết |
| Bán hàng · `sale_return` | PC-005, 010 | `originalDocKey` + `originalLineRef` | hoàn giá vốn theo dự phòng, cần giải trình |
| Kho · `transfer` | PC-008, 009 | cặp xuất / nhận (`pairRef`), ngày nhận, `lotRef` | đi đường quá N ngày, cần giải trình |
| Kho · `stock_adjustment`, `stock_count` | PC-004, 009 | lý do, bản chụp kiểm kê, `lotRef` | `STOCK_ADJUST_NO_REASON` (đã có) |
| Tiền · `cash_transfer`, `customer_payment`, `supplier_payment` | PC-012, 013 | tài khoản ngân hàng, đối tượng, chứng từ được thanh toán (`settles`) | công nợ chưa cấn trừ, nhắc việc |
| Tài sản · khấu hao | PC-014 | kỳ, tài sản | `DEPRECIATION_OPEN` (đã có) |
| Kernel · giá vốn (`CostingResult`), kết chuyển | PC-005, 006, 009, 017..020 | lần tính, phiên bản chính sách, dấu số liệu | chặn khoá sổ theo D032-11 |
| Mọi chứng từ | PC-002, 003, 016, 021, 023 | `docKey`, `version`, `event_id` (đã bắt buộc) | — |

**Sự việc làm phép kiểm chạy lại:** mỗi lần `bizcity.ledger.entry.posted` / `reversed`, Kernel đánh dấu các PC bị ảnh hưởng của (kỳ, phạm vi) là **cần kiểm lại**. Lượt hằng ngày chỉ chạy lại các PC đó (rẻ). Nếu tuần đó đã được kế toán xem, bản lưu tuần ghi *số liệu đổi sau khi đã xem tuần*, kèm chứng từ, người, giờ.

Sự kiện mới (minor `bizcity_event@1`): `bizcity.checks.week_saved` `{ week, period, scope, digest }` · `bizcity.checks.changed_after_review` `{ week, docKey, actor }` · `bizcity.checks.trial_close` `{ period, scope, block, explain, at }`. Cell nhắn Zalo cho kế toán trưởng được (R-DIAG-6).

## 5. Bàn làm việc kế toán: một bàn, năm thẻ

Không dựng màn mới song song. **HT08 Bàn đánh giá** (PHASE-022, đã có ba vai) đổi thành **Bàn làm việc kế toán**, đọc sổ điều kiện của R-DIAG-10:

| Thẻ | Dùng khi | Có gì | Dẫn tới |
|---|---|---|---|
| **Việc hôm nay** | mỗi sáng | việc mới từ lượt đêm, ai phụ trách, bao nhiêu ngày; nút *Kiểm lại ngay* | hàng việc (`QUEUE_SOURCES` thêm `close_check`), màn sửa chứng từ |
| **Khoá thử hôm nay** | bất cứ lúc nào, nhất là tuần cuối tháng | năm bước của khoá thật, kết luận *khoá được / chưa*, danh sách *phải sửa* và *cần giải trình*; không ghi sổ | ACC49 tính giá vốn, ACC6 kết chuyển, ACC2 khoá sổ |
| **Kết quả từng tuần, tháng** | thứ Hai, cuối tháng | bản lưu tuần, nút *Đã xem tuần*, kết quả khoá sổ của tháng, so tháng trước | bản lưu, nhật ký khoá |
| **Sổ theo dõi các tháng** | họp tháng, kiểm toán | mỗi dòng một điều kiện, mỗi cột một tuần / tháng; dòng đỏ lặp lại = cần đổi cách làm | bản lưu của ô |
| **Phần mềm tự kiểm được gì** | đánh giá phần mềm, trước khi dùng thật | điều kiện nào phần mềm tự kiểm, điều kiện nào kế toán còn kiểm tay, mốc nâng cấp | HT10 Trụ cột |

Ba vai của HT08 giữ nguyên làm **bộ lọc**: kế toán viên thấy việc của mình; kế toán trưởng thấy cả đơn vị và giải trình; kiểm soát / thanh tra chỉ đọc bản lưu tháng.

## 6. Khoá thử hôm nay

| Bước | Hôm nay có gì | Thêm |
|---|---|---|
| 1. Kiểm số liệu (trước kết chuyển) | `GET /api/v1/periods/check` — chẩn đoán L3 xem trước | chạy theo sổ PC, có mức theo kết quả |
| 2. Tính tạm giá vốn | màn ACC49 tính và **ghi** | lần tính nháp không ghi sổ (`costing.run` → draft, PHASE-032 W2) |
| 3. Kết chuyển thử | `POST /api/v1/closing/preview` (action `core.closing.preview`): bút toán sẽ sinh, lãi lỗ từng chi nhánh, không ghi | nối số giá vốn tạm của bước 2 |
| 4. Kiểm sau kết chuyển | 911 phải hết dư (lần chạy thật bị huỷ nếu còn) | kiểm trên kết quả thử: 911, P&L ↔ 421 (PC-019, 020) |
| 5. Kiểm lúc khoá | quyền `periods:lock`, khoá đa chiều | phạm vi kéo nhóm tính giá (PC-015), dấu số liệu (PC-021) |
| Kết luận | — | *Khoá được* / *Chưa khoá được: N việc phải sửa, M việc cần giải trình*; lưu thành dự báo của ngày |

Chạy tự động mỗi sáng trong tuần cuối tháng và mỗi thứ Hai các tuần khác. Kế toán bấm tay lúc nào cũng được. Kết quả khoá thử **không bao giờ** là căn cứ khoá thật: khoá thật luôn chạy lại trong cùng giao dịch (PC-021).

## 7. Thuật ngữ trên màn kế toán

Mã và tên kỹ thuật chỉ ở tài liệu dev và ở dòng nhỏ khi rê chuột. Trên màn kế toán dùng cột phải:

| Tài liệu kỹ thuật | Trên màn kế toán |
|---|---|
| HARD / HARD_BLOCK | **Chặn khoá sổ — phải sửa** |
| REVIEW | **Cần giải trình** |
| REVIEW đã chấp nhận | **Đã giải trình** |
| INFO | **Để biết** |
| PASS / FAIL / N/A | **Đạt / Chưa đạt / Không áp dụng** |
| nhịp ngày / tuần / kỳ (cadence) | **Kiểm hằng ngày / hằng tuần / cuối tháng** |
| dry-run lock, "nếu khoá hôm nay" | **Khoá thử hôm nay** |
| PRE / POST / LOCK | **Trước kết chuyển / Sau kết chuyển / Lúc khoá sổ** |
| costing run draft / settled | **Giá vốn tính tạm / Giá vốn đã chốt** |
| snapshot | **Bản lưu** |
| sourceDigest | **Dấu số liệu** (đổi khi có chứng từ mới, sửa, xoá) |
| soft close tuần | **Đã xem tuần** |
| changed after soft close | **Số liệu đổi sau khi đã xem tuần** |
| timeline matrix | **Sổ theo dõi kiểm tra các tháng** |
| milestone M1..M4 | **Mốc nâng cấp phần mềm** |
| unmeasured | **Phần mềm chưa tự kiểm — kế toán kiểm tay** |
| scoreboard A | **Phần mềm tự kiểm được gì** |
| scoreboard B, hộp việc | **Việc hôm nay** |
| cost pool / valuation pool | **Nhóm tính giá vốn** |
| in-transit | **Hàng đang đi đường** |
| lot, FEFO | **Lô hàng, hạn dùng; xuất lô gần hết hạn trước** |
| Kernel / Engine / API | không hiện; nói "phần mềm" |

Số hiệu tài khoản (156, 632, 1579, 911…) **giữ nguyên** trên màn kế toán vì đó là ngôn ngữ của kế toán, kèm chú thích "theo chế độ đang dùng" khi cần (R-ITEM-10).

## 8. Việc và câu hỏi

| Mã | Việc / câu hỏi | Ai |
|---|---|---|
| **Q032-7** ✅ mở rộng (D032-12) | Duyệt hướng **mở rộng** (R-DIAG-10..16 + trường `DiagCheck` + minor `bizcity_module@1`, `bizcity_ledger_intake@1`, `bizcity_event@1`), không thêm hợp đồng `bizcity_close_checks@1` riêng | chủ dự án |
| **Q032-8** ✅ đổi HT08 (D032-13) | HT08 đổi thành *Bàn làm việc kế toán* (giữ ba vai làm bộ lọc) hay giữ HT08 và mở màn mới? Đề nghị: đổi HT08 | chủ dự án |
| S032-35 | Thêm trường R-DIAG-10..12 vào `DiagCheck`; gắn `closeRef` cho mọi chẩn đoán L3 đang có (ánh xạ ở [60 §3](60-SCOREBOARD-KE-TOAN.md)) | nhóm Lõi |
| S032-36 | Khoá thử hôm nay đủ năm bước (R-DIAG-14) trên `periods/check` + kết chuyển chỉ tính + giá vốn tạm | nhóm Lõi |
| S032-37 | SDK `defineCheck` + `extensions.checks` (R-DIAG-15) | nhóm Lõi |
| S032-38 | Bảng "trường cần để kiểm" theo loại chứng từ vào `bizcity_ledger_intake@1` (R-DIAG-16); "không kiểm được" trên bàn | nhóm Lõi |
| S032-39 | Bàn làm việc kế toán năm thẻ (§5), thuật ngữ §7, nguồn `close_check` của hàng việc | nhóm Lõi + kế toán trưởng duyệt câu chữ |
