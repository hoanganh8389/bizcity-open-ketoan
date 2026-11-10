# Đánh giá nền tảng theo phần hành và rà soát 467 chỗ chặn chưa nói lý do — 2026-11-10
<!-- [2026-11-10 11:16 PM Johnny Chu - Chu Hoàng Anh] REVIEW — đánh giá giữa kỳ (không phải lượt R2): độ chắc 12 khối lõi theo bằng chứng + rà 467 nợ R-BLOCK; checklist A (UI) / B (mã); mockup bảng kiểm -->

> **Loại:** đánh giá giữa kỳ theo chỉ đạo chủ dự án 2026-11-10, không thay lượt review R2 (R2 chạy sau PHASE-034, RV-7).
> **Đo ở:** `main` @ `3feddb2c` · bộ kiểm tĩnh lượt `20261110-155459` · lane chẩn đoán chạy trên CSDL test `ketoan_test_s022` (dữ liệu do test sinh, cố ý có sổ lỗi) · GitHub Actions qua API công khai.
> **Thang:** 0–4 như [TIEU-CHI.md §1](TIEU-CHI.md) (3 = mã + test / check đạt; 4 = thêm bằng chứng chạy thật).
> **Mockup bảng kiểm:** [mockups/bang-kiem-danh-gia.html](mockups/bang-kiem-danh-gia.html) (UI-first, chờ duyệt).

## 0. Kết luận trong bốn câu

1. **Không khối nào đạt mức 4.** CI có 1 817 lượt chạy, **0 lượt xanh** (API GitHub, `status=success` = 0); lượt mới nhất báo khoá thanh toán tài khoản Actions. Mọi test và chẩn đoán mới chỉ chạy ở máy dev.
2. **Lõi sổ cái và khoá kỳ chắc nhất (mức 3):** trigger CSDL + check tĩnh + test phá thử; hôm nay lane chẩn đoán chạy trên CSDL test đạt các mã toàn vẹn (`LEDGER_BALANCED`, `LEDGER_TRIGGERS`, `LEDGER_REVERSED_ONCE`, `TENANT_ISOLATION`, `EVIDENCE_CHAIN`…: 42 đạt / 9 cảnh báo / 1 không đạt do CSDL test thiếu migration 0100).
3. **Chưa chắc:** giá vốn liên tục / Gate C (mức 1–2), Commit Guard không giữ lời hứa (RV-R1-10), chính sách đã ngừng còn lọt (RV-R1-04), phân quyền theo phạm vi mới chạy bóng, tách nhiệm mới ghi dấu, ranh giới phân hệ đang đỏ trên `main` (SC-MOD-2, SC-LAYER-1/2).
4. **467 chỗ chặn chưa nói lý do** chia làm: ~152 theo trạng thái chứng từ / mã cố định, ~167 chưa đủ dữ liệu, ~69 chỉ là ô hiển thị, ~50 theo quyền, ~19 đang xử lý bị bắt nhầm, ~10 thiếu cấu hình. Gốc lớn nhất không ở giao diện: **máy chủ nuốt mất lý do "người khác lập"** (`document.service.ts` `catch {}`), nên mọi form phiếu tự bịa câu.

## 1. Độ chắc 12 khối lõi

| # | Khối | Mức | Bằng chứng chính | Lỗ hổng còn mở | Việc gắn |
|---|---|:---:|---|---|---|
| 1 | Accounting Kernel — sổ chỉ thêm, Nợ = Có, một cửa ghi, đảo một lần | **3** | trigger 0006 / 0049 / 0066 / 0082 / 0086 / 0089; `ledger.service.ts` post/reverse; `event-store.ts`; test `db-rules` (19, có ca cờ purge không xoá được), `ledger-flow` (18); SC-KERNEL-1..4/6/7 đạt; DG-LEDGER-1..5 **đạt trên CSDL test hôm nay** | E2 còn sửa được 7 cột đầu bút toán (RV-R1-14); cùng phiên bản khác nội dung ghi đè im lặng (RV-R1-08); `accounting_event_versions` thiếu `tenant_id` (SC-DATA-5); `migrations.lock.json` chỉ khoá tới 0033 | S004-15b (⏸), S029-5/34, S029-12 |
| 2 | Định khoản (posting engine) | **2–3** | `rule-table.ts`, `account-resolver.ts`; phiên bản `posting_policy_versions` (0040); xem trước + L5 thử trong savepoint; test `posting-flow` (10), `quy-tac-dinh-khoan` (12) | còn tài khoản viết cứng: `stock.rule.ts:56` (157), `mua-hang/posting.ts:193` (112), `closing.service.ts:54-77` (911/421) mà SC-KERNEL-5 **không quét**; 8 TK cứng ở mua hàng (RV-R1-07); ba cơ chế phiên bản chính sách (RV-R1-12) | S024-33, S004-18, D-R1-2 |
| 3 | Khoá kỳ · kết chuyển · số dư đầu kỳ | **3 / 2** | khoá kỳ hai lớp (app + trigger 0082); R-DIAG-4 chạy L3 trước khi khoá; test `period-locks`, `khoa-ky-csdl`, `closing` (15), `year-end`; C-4 đạt; DG-CLOSE-1 chạy (cảnh báo trên test) | "khoá kỳ đòi chuỗi lành" còn todo (S025-11/14, S032-20/28/29); E11 khai 0 test; không test riêng số dư đầu kỳ | PHASE-025/032 |
| 4 | Master data — định danh, mã có phiên bản, gộp mã, cây tổ chức | **3 (mặt hàng) / 2 (khác)** | 0065–0068 items / item_codes / gộp mã; `item-resolver.ts`; test `item-master` (18), `golden-chuyen-kho-doi-ma`; 0085 entity_codes (9 test); 0062 org_units; DG `ITEM_CODE_CASE_DUP`, `UNIT_BASE_INVALID` đạt | chưa phiên bản ĐVT / lý do (S026-4), hệ thống TK (S026-8); xoá an toàn CSDL (S029-12); gộp đối tượng (S029-20); SC-ITEM-1 planned | PHASE-026/029 |
| 5 | Inventory engine — lô, giá vốn liên tục, chuyển kho, Gate C | **2 (Gate C: 1)** | `costing.service.ts` bình quân tháng; 0091 E1 SECURITY DEFINER; 0098 lô (số lượng + hạn), 0099 chuyển kho hai đầu; test `costing` (19), `lo-hang` (10), `phieu-chuyen-kho` (8); DG-STK-1..3, `TRANSIT_NONZERO`, `INVENTORY_LEDGER_MISMATCH` đạt trên test | không `valuation_layers`, không FIFO / đích danh, không Gate C / CT-* (RV-R1-17); 6 action chuyển kho thiếu `sideEffects: ledger` (SC-ACT-2 nợ); 0098/0099 mới vào, chưa khoá băm | S025-5..10, S032-8/12/13/16/18 |
| 6 | Cửa nạp & cổng kiểm — L1–L5, bể chờ, trạm ACC14, Commit Guard | **3, có lỗ** | `preflight.ts` L1–L5; `intake_inbox` (0059); `guard.ts`; test `intake-*` (≥ 6 tệp), `commit-guard` (5), `gates`; SC-INTAKE-1, SC-FIND-1/2 đạt | **Commit Guard chỉ báo IN-GUARD-001 khi dấu lệch VÀ còn lỗi chặn** (`preflight.ts:218`, RV-R1-10) — `tru-cot.json` G-3 ghi "đạt" là sai; `covers()` ở `policy-check.ts:55` không xét `status` nên bản đã ngừng còn `effective_to` null vẫn lọt (RV-R1-04, S031-32) | PHASE-031 |
| 7 | Bộ kiểm chuẩn — SC tĩnh, DG chẩn đoán, E09 VN | **3 / 2 / 2** | 90 check (62 block · 25 ratchet · 1 info · 2 planned), 45 tệp, 17 bộ fixture, `--self-test` đạt; 54 DG (15 block · 37 info · 2 planned) khớp 37 mã trong app (SC-DIAG-1); E09: SC-VNC-1/2, test `conformance-engine` (7) | **`main` đang KHÔNG ĐẠT**: SC-FLOW-1, SC-LAYER-1, SC-SIG-1 (block), SC-LAYER-2, SC-MOD-2 (ratchet); độ phủ luật 43 % (R-* 134/298); 17 luật Tier 0 chưa kiểm tự động; mọi rulepack VN `draft`; lane VN chưa vào CI (S020-7/12) | PHASE-020, R-REV |
| 8 | Document SDK · Workflow · tách nhiệm | **2** | `workflow.ts` (`sod: true / warn`), 2 YAML, test `workflow` (8), `sod-ghi-dau` (7), `lich-su-chung-tu`, `signatures`; SC-DOC-7 đạt; DG-LEDGER-6 chạy | người lập vẫn tự duyệt (chỉ ghi dấu); transition chưa ghi quyền / vai, không bảng lịch sử (S029-11); E04 đánh số 0 test; S030-20/27/28 bị chặn | PHASE-028 W3, PHASE-029/030 |
| 9 | Phân quyền — RLS, vai trò, phạm vi | **3 (RLS) / 2** | RLS 27 migration, 118/124 bảng (SC-DATA-6 95,2 % nhưng còn planned); test `tenant-isolation`, `authz-engine` (21), `authz-scope` (9); DG `TENANT_ISOLATION`, `DB_APP_ROLE` đạt | engine `authorize` mới chạy **bóng** (`authz/shadow.ts`), mặc định tắt; `requireScope` dùng 2 chỗ; 12 route chưa khai quyền (SC-API-3 nợ); 6 bảng chưa RLS | S028-6..11 |
| 10 | Policy Registry · Rule Contracts · thư viện | **2–3 / 1–2 / 3** | 0079 registry chỉ thêm + trigger; test `policy-*` (6 tệp), `rule-contracts`; thư viện SC-LIB-1/2/3 đạt, 5 test `thu-vien*`; DG `POLICY_VERSION`, `PROFILE_PACK_REGIME` đạt | RV-R1-04, RV-R1-12; Rule Contract mua / bán hàng chưa có (S031-11/15); chặn đọc thô `tenants.settings` bị chặn (S029-32) | PHASE-031 W3 |
| 11 | Bằng chứng · audit · lineage · observability | **2–3** | `audit.ts` chuỗi băm; SC-EVD-2/9 đạt; test `evidence` (8), `evidence-seal` (12), `lineage` (8); DG-EVD-1..5 **đạt trên CSDL test hôm nay** | thiếu `correlation_id` ở `posting_log`, `intake_inbox` (RV-R1-13); sự kiện `dead` bị xoá sau 90 ngày, không API xem từng sự kiện (RV-R1-09); chưa truy vết bút toán → báo cáo (S029-27); `tro-ly/store.ts` ghi nhật ký ra tệp (SC-EVD-1 nợ) | PHASE-019/029 |
| 12 | Module SDK · ranh giới phân hệ | **2–3** | `module-sdk`, `module-registry.ts`; test `module-sdk` (16), `phan-he-ranh-gioi`; SC-MOD-1/3, SC-CON-2 đạt | **đang đỏ trên `main`**: `phan-he/mua-hang/demo.ts:70` ghi thẳng `products` (SC-MOD-2); `cli/doi-chieu-dinh-khoan.ts` thiếu nhãn lớp + import ngược (SC-LAYER-1/2); `mua-hang/posting.ts:23` import `modules/posting-flow`; `phan-he` → `modules` mới ~10–15 % (RV-R1-18); ui-kit 8 thành phần (RV-R1-16) | PHASE-013/026 |

**Bằng chứng chạy thật hôm nay (lane chẩn đoán, CSDL test):** 54 DG → 42 đạt · 9 cảnh báo (`ACCOUNT_WRONG_SIDE`, `CASH_NEGATIVE`, `INVENTORY_NEGATIVE`, `VAT_INPUT_NONCASH`, `PROFILE_DECLARED`, `PERIOD_CLOSE_OPEN`, `INVOICE_FIELDS`, `LEDGER_SELF_APPROVED`, `DB_CONNECTION_ROLE` — đều do dữ liệu test cố ý) · 1 không đạt (`MIGRATIONS_PENDING`: CSDL test chưa áp 0100) · 2 planned. Đây là bằng chứng **ở máy dev trên dữ liệu test**, chưa phải bằng chứng vận hành — nên vẫn là mức 3.

### 1.1 Tài liệu tự khai lệch với mã (sửa ở nguồn, cùng PR với phase chủ)

| Tệp | Ghi | Thực tế |
|---|---|---|
| `docs/standard/nen-mong.json` trụ cột 09 | trigger khoá kỳ ở CSDL: chưa | đã có, migration 0082 |
| `docs/standard/tru-cot.json` ID-6 | chưa | đã có, 0085 `entity_codes` |
| `docs/standard/tru-cot.json` IV G-3 Commit Guard | đạt | RV-R1-10 còn mở (`preflight.ts:218`) |
| `docs/standard/tru-cot.json` VIII M-2 | "52 đạt 2026-11-04" | đã cũ, nay 90 check |
| `docs/standard/roadmap.json` 0.2 "Bật CI" | 67 % | 0 lượt xanh |

## 2. Rà soát 467 chỗ chặn chưa nói lý do (nợ SC-UI-1)

### 2.1 Năm phát hiện cần sửa trước khi trả nợ từng màn

| # | Phát hiện | Ở đâu | Hệ quả | Sửa |
|---|---|---|---|---|
| P1 | **Máy chủ nuốt lý do "người khác lập"**: `assertCanModify` ném câu "Bạn chỉ sửa được phiếu do chính mình lập…" nhưng `catch {}` bỏ đi, `modifyBlockedReason` vẫn `null` | `packages/kernel/src/modules/documents/document.service.ts:997-1003` | mọi form phiếu tự ghép câu (`VoucherModal.tsx:33`, `VoucherForm.tsx:406`) — trái R-BLOCK-3 | gán `err.message` vào `modifyBlockedReason` trong `catch` (Kernel K0, một dòng) |
| P2 | **Phiếu đã huỷ không có dải thông báo**: `VoucherModal.tsx:84` chỉ hiện khi `!cancelled`; câu "Phiếu đã xóa." không bao giờ hiện | `apps/web/src/components/voucher/VoucherModal.tsx:84` | người dùng chỉ thấy "(đã huỷ)" ở tiêu đề | bỏ điều kiện `!cancelled` (giữ dải khi huỷ) |
| P3 | 22 ô `disabled` trần chỉ là **ô hiển thị** (loại tiền, tỷ giá, tổng tiền, tên nhân viên) | CashVoucherForm, ManualVoucherForm… | bị đếm là chặn | đổi sang `readOnly` — trả nợ nhanh nhất |
| P4 | Hai chỗ **quyền kiểm lệch**: `PaymentRequestsPage.tsx:110` `editable` không xét `can('documents:write')` (gõ được, nút Lưu bị giấu — trái R-BLOCK-5); `ChuongTrinhBanPage.tsx:80` nút Sửa hiện cho mọi người | quỹ / chương trình bán | đến lúc Lưu mới bị từ chối | đưa `can()` vào điều kiện và hiện mờ kèm lý do |
| P5 | **Khoá kỳ có lẽ không nằm trong `canModify`** (chỉ xét `dateRuleViolation`) | `document.service.ts:1000-1003` | phiếu thuộc kỳ đã khoá vẫn mở sửa, chỉ bị chặn cứng lúc Ghi | cần xác minh rồi thêm `PERIOD_LOCKED` vào lý do trả về (chưa đọc hết luồng — ghi là nghi vấn) |

### 2.2 Phân loại 467 chỗ (12 tệp đầu đọc mã, 119 tệp còn lại ước lượng theo tên biến)

| Loại | Số (≈) | Cách trả | Ví dụ câu "Vì sao / Cách gỡ" |
|---|---:|---|---|
| b · trạng thái chứng từ / kỳ khoá / mã cố định sau khi tạo | 152 | **một dải đầu khối** (R-BLOCK-4) ở VoucherModal, PhieuHangForm, PhieuMuaForm, PaymentRequests, DangKyMax + nút gỡ | "Phiếu đã duyệt. Bấm Bỏ duyệt (cần quyền duyệt) rồi sửa." · "Số và chi nhánh cố định sau khi ghi. Huỷ phiếu rồi lập phiếu mới." |
| c · chưa đủ dữ liệu / chưa chọn | 167 | `BlockedHint` nêu đúng ô đầu tiên còn thiếu; nhóm `!d` ở 32 trang báo cáo dùng chung một câu | "Chưa chọn dòng chi tiết. Bấm vào một dòng rồi Xoá." · "Chưa có số liệu. Chọn kỳ rồi bấm Xem." |
| e · chỉ là UI (ô hiển thị, lật trang, chế độ xem) | 69 | đổi `readOnly` / bỏ khỏi phép kiểm; chế độ xem: một câu "Đang xem. Bấm Sửa (F2)." | — |
| a · thiếu quyền | 50 | **bảng dùng chung quyền → tên + người cấp** (một nơi, không gõ tay 30 chỗ) + `BlockedHint` | "Bạn chưa có quyền ghi chứng từ (documents:write). Nhờ quản trị cấp ở màn Người dùng." |
| f · đang xử lý bị bắt nhầm | 19 | đổi nhãn nút ("Đang lưu…"); sửa mẫu BUSY của SC-UI-1 (`scan.busy`, `rechecking`, `publish.isPending`) | — |
| d · thiếu cấu hình | 10 | `BlockedHint` dẫn tới màn cấu hình | "Tài khoản trên dòng bắt buộc theo dõi khoản mục. Đổi tài khoản, hoặc bỏ cờ ở Danh mục tài khoản." |

### 2.3 Theo màn (12 tệp nhiều nợ nhất = 195 chỗ)

| Màn / tệp | Nợ | Biến gốc | Loại chính | Dải đầu khối? | Nguồn lý do | Việc chính |
|---|---:|---|---|---|---|---|
| Phiếu thu / chi `CashVoucherForm` | 31 | `dis = readOnly` ← `canModify` (API) | b | có (`readOnlyText`), trừ phiếu huỷ (P2) | API, riêng "người khác lập" UI tự ghép (P1) | P1, P2, P3 (5 ô), 2 nút c |
| Phiếu kế toán `VoucherForm` | 26 | `readOnly` | b | có, tự làm riêng (dòng 405) | như trên | P1; `canSave` nêu ô thiếu; `dimsVisible` (d) |
| Phiếu kế toán tay `ManualVoucherForm` | 25 | `dis` | b | có (VoucherModal) | như trên | P1, P3 (3 ô) |
| Thiết kế hạch toán `ThietKeHachToanPage` | 16 | `readOnly = !editing`; `rule.state` | e + b | một phần (`alert-info` chỉ ở chế độ replace) | UI theo state từ API | một câu theo state: nháp / đang áp ("Đề xuất sửa") |
| Chương trình bán `ChuongTrinhBanPage` | 16 | `ro = !editing` | e | không | UI | "Đang xem. Bấm Sửa."; thêm `can()` (P4) |
| Tài sản `AssetPages` | 13 | `!can('catalog:write')`, `!value.isNew`, `canPost` | a + b + c | không (nút Ghi bị giấu — trái R-BLOCK-5) | UI | dải quyền; mã cố định; `canPost` lấy lý do từ `s.warnings` |
| Tờ khai thuế `StatementPages` | 13 | `!editable(k)`, `!d`, `!can(...)` | a + b + c | một phần (dòng 186 "đã lưu chính thức", có nút Mở lại) | `final` API; quyền UI | `!d` → "đang tính"; dải quyền B01D |
| Kết nối `Connections` | 12 | `!canEdit` ← `can('settings:write')` | a | một phần (dòng 86, chưa có động từ gỡ) | UI | đổi thành alert có cách gỡ |
| Đăng ký max `DangKyMaxPage` | 12 | `locked` (huỷ / đã duyệt) | b | không (chỉ trạng thái trên tiêu đề) | UI theo `req.status` | dải: "Phiếu đã duyệt, max đã ghi. Lập phiếu mới (MH17)." |
| Phiếu mua `PhieuMuaForm` | 11 | `readOnly = frozen \|\| viewing` | b + e | không (badge tiêu đề); `problems` ẩn khi readOnly | UI theo `v.status` | dải theo trạng thái; hiện `problems` cả khi xem; tách `busy` |
| Phiếu hàng `PhieuHangForm` | 10 | `readOnly` ← `status === 'approved'` | b | không | UI | dải: "Phiếu đã duyệt. Bấm Bỏ duyệt trên danh sách rồi sửa." |
| Yêu cầu thanh toán `PaymentRequestsPage` | 10 | `!editable` (trạng thái) | b + c | không | UI | dải theo trạng thái; P4 |

Biến lặp nhiều nhất toàn repo: `readOnly` 76 (sáu cách tính khác nhau cùng tên) · `dis` 45 · `!d` 38 · `save.isPending \|\| …` 29 · `true` 22 · `!editable` 20 (ba nghĩa: trạng thái / quyền / chế độ) · `ro` 15 · `!value.isNew` 13 · `locked` 11 · `!canEdit` 11. Gợi ý: gom các cách tính `readOnly` theo trạng thái về **một hàm `blockedReason()` trả `Blocked`** lấy từ `modifyBlockedReason` của API sau khi sửa P1.

Chi tiết từng biểu thức: `tests/conformance/baseline.json` → `checks["SC-UI-1"].debts` (467 mục, có `file` + khoá).

## 3. Checklist

### Checklist A — UI (từng màn, theo mockup [bang-kiem-danh-gia.html](mockups/bang-kiem-danh-gia.html))

| ID | Màn / thành phần | Việc | Lớp | Trạng thái |
|---|---|---|---|---|
| A-1 | `VoucherModal` (thu, chi, kế toán tay) | dải đầu khối hiện cả khi phiếu huỷ (P2); câu lấy từ `modifyBlockedReason`; nút gỡ "Nhờ kế toán trưởng" / "Mở khoá dữ liệu" | 1 | ☐ |
| A-2 | 3 form phiếu Kernel | 8 ô hiển thị → `readOnly` (P3); nút In / Xoá dòng / Chọn phiếu bọc `BlockedHint` | 1 | ☐ |
| A-3 | `PhieuMuaForm`, `PhieuHangForm`, `PaymentRequestsPage`, `DangKyMaxPage` | một dải theo trạng thái (đã duyệt / huỷ / chờ duyệt) + nút gỡ (Bỏ duyệt, Lập mới) | 1 | ☐ |
| A-4 | `ThietKeHachToanPage`, `ChuongTrinhBanPage` | một câu chế độ xem ("Bấm Sửa / F2"); quy tắc đang áp → "Đề xuất sửa" | 1 | ☐ |
| A-5 | Màn có `!can(...)` (Assets, Statements, Connections, Tenant, Periods, Planning…) | bảng dùng chung quyền → tên + người cấp; hiện mờ kèm lý do, **không giấu nút** (R-BLOCK-5) | 1 | ☐ |
| A-6 | 32 trang báo cáo `!d` | một thành phần "Chưa có số liệu / đang tính" dùng chung | 1 | ☐ |
| A-7 | HT10 thẻ **Đánh giá** (mockup đã có: `the-danh-gia-ht10.html`) | bảng "Độ chắc theo khối" (§1) hiện cạnh Nền móng; bảng kiểm R-BLOCK theo màn | 2 | ☐ chờ duyệt |
| A-8 | Bốn trạng thái mỗi dải / hint: có lý do · đang xử lý · lỗi máy chủ (remedy) · không có quyền | — | 1 | ☐ |

### Checklist B — mã

| ID | Việc | Khối | Mức ảnh hưởng | Trạng thái |
|---|---|---|---|---|
| B-1 | `document.service.ts` `catch` → gán `modifyBlockedReason = err.message` (P1); xác minh P5, thêm `PERIOD_LOCKED` vào lý do | 1, 8 | K0 | ☐ |
| B-2 | API trả `blocked[]` cùng `allowed[]` cho chuyển trạng thái (`workflow.allowed()` → `allowedWithReasons()`), để UI không đoán (R-BLOCK-3) | 8 | K1 | ☐ |
| B-3 | Commit Guard báo IN-GUARD-001 khi dấu lệch dù không còn lỗi chặn (RV-R1-10); sửa `tru-cot.json` G-3 | 6 | K1 | ☐ |
| B-4 | `covers()` xét `status === 'retired'` (RV-R1-04 phần còn lại, S031-32) | 6, 10 | K1 | ☐ |
| B-5 | SC-KERNEL-5 quét thêm `closing.service.ts`, `analysis.ts`; gỡ 157 / 112 / 911-421 viết cứng | 2 | K1 | ☐ |
| B-6 | `migrations.lock.json` khoá băm tới 0100 (các migration bảo vệ sổ 0049+) | 1 | — | ☐ |
| B-7 | Làm xanh `main`: SC-MOD-2 (`demo.ts:70`), SC-LAYER-1/2 (`cli/doi-chieu-dinh-khoan.ts`, `mua-hang/posting.ts:23`), SC-SIG-1 (12 tệp), SC-FLOW-1 | 12, 7 | — | ☐ (chủ tệp: PHASE-026 / 028 / 032) |
| B-8 | CI: gỡ khoá thanh toán Actions; sau đó lần đầu chạy `test` + `diagnostics` trên CI và lưu scoreboard | 7 | — | ☐ chủ dự án |
| B-9 | Lane chẩn đoán trên bản cài thật (không phải CSDL test) — điều kiện để lên mức 4 | 1, 3, 11 | — | ☐ |
| B-10 | SC-UI-1: mẫu BUSY thêm `scan.busy`, `rechecking`, `*.isPending`; bỏ qua `disabled` trần trên ô `readOnly` | 7 | — | ☐ |
| B-11 | Bật `authorize` thật thay chế độ bóng; `requireScope` cho mọi route ghi chứng từ (S028-6..11) | 9 | K1 | ☐ |
| B-12 | Gate C / `valuation_layers` / CT-* (RV-R1-17) | 5 | K2 | ☐ PHASE-025/032 |

### Thứ tự đề xuất (≤ 4 bước mỗi đợt, R-LEAN-4)

1. **Gốc trước:** B-1 (một dòng, K0) + A-1 + A-2 → trả ~110 chỗ ở ba form phiếu Kernel, không còn câu bịa.
2. **Dải đầu khối cho phiếu nghiệp vụ:** A-3 + A-4 → ~70 chỗ.
3. **Quyền một nơi:** bảng quyền dùng chung + A-5 → ~50 chỗ; đi cùng B-11.
4. **Chắc lõi:** B-3, B-4, B-5, B-6 (mỗi cái một PR nhỏ) rồi B-7/B-8 để `main` và CI xanh — điều kiện trước khi R2 chấm.

## 4. Bằng chứng

| Nguồn | Giá trị |
|---|---|
| `node tests/conformance/selfcheck.mjs --strict` lượt `20261110-155459` | KHÔNG ĐẠT · tuân chuẩn 98,6 · sẵn sàng v1 76,4 · độ phủ luật 43 · 69 đạt / 10 nợ cũ / 1 cảnh báo / 3 không đạt |
| Lane chẩn đoán `--lane diagnostics --psql "docker exec -i ketoan-db-1 psql -U ketoan -d ketoan_test_s022"` (2026-11-10 23:09, ngoài `output/latest`) | 54 DG: 42 đạt · 9 cảnh báo · 1 không đạt (`MIGRATIONS_PENDING` 0100) · 2 planned; Diagnostics 93,8 B |
| GitHub Actions API `actions/runs?status=success` | 0 / 1 817 lượt (đọc 2026-11-10 23:15) |
| `tests/conformance/baseline.json` SC-UI-1 | 467 nợ ở 131 tệp |
| `apps/api/test` | 239 tệp vitest; `setup.ts` gọi `assertLedgerInvariants()` ở mọi tệp |
| Migration | 99 tệp (hở 0015), 38 có trigger, 27 bật RLS, lock băm tới 0033 |

Điều chưa làm: không chạy toàn bộ vitest trong lần này (các tệp liên quan tới S029-25 / S022-22 đã chạy đạt sớm hơn trong ngày); không đọc thân mọi hàm trigger; P5 là nghi vấn chưa xác minh.
