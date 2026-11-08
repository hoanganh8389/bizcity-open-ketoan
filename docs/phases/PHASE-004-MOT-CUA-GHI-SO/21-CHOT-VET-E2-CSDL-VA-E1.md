# PHASE-004 · 21 — Chữ chốt (đề xuất): dấu vết E2 ở tầng CSDL, cảnh báo, bảng theo dõi; phương án cho E1; RV-R1-07
<!-- [2026-11-08 07:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — chữ chốt đề xuất S004-14…18 (R-FLOW-2): yêu cầu chủ dự án 2026-11-08 sau S004-13; phương án E1 (Q004-4); thu hẹp RV-R1-07 -->

> **Trạng thái:** **Đã duyệt** — chủ dự án đồng ý các phương án ngày 2026-11-08: D004-11…14 (Q004-7), phương án E1 ở §4 (Q004-4), hướng "đo trước" cho RV-R1-07 ở §5 (Q004-8). Được viết mã theo thứ tự ở §3 (giữ chỗ mã ở CLAIMS.md trước).
> **Nguồn:** yêu cầu của chủ dự án 2026-11-08: *"UPDATE ledger_entries viết thẳng bằng ketoan_app vào 7 cột này vẫn được trigger cho phép và cần phải để lại dấu vết, cảnh báo rõ ràng. Dấu vết rõ, cảnh báo rõ, dashboard rõ để trace."*; câu hỏi Q004-4 (E1) và RV-R1-07; tiếp [20-CHOT-CO-THOAT-VA-E2](20-CHOT-CO-THOAT-VA-E2.md).

## 1. Khoảng trống còn lại sau S004-13 (đã đo)

- **[M]** `ketoan_app` có `UPDATE` trên `ledger_entries`. Trigger `guard_ledger_entry_mutation` (0049) cho phép đổi bảy cột `doc_no`, `invoice_no`, `reason_code`, `partner_id`, `description`, `content_hash`, `event_version` khi bút toán `posted` và `total` không đổi.
- **[M]** S004-13 chỉ ghi nhật ký **ở nhánh mã của ứng dụng** (`posting.service.ts`). Một câu `UPDATE ledger_entries SET event_version = NULL` viết thẳng không đi qua mã đó: trigger cho qua, **không dấu vết**. Đã thấy trong `lich-su-chung-tu.test.ts`: ba test đổi `event_version` của bút toán đã ghi bằng SQL thuần mà không cần vượt trigger.
- **Hệ quả:** dấu vết đặt ở mã ứng dụng chỉ chứng minh những gì ứng dụng **khai báo**. Muốn bắt cả những gì **đã xảy ra**, dấu vết phải nằm ở CSDL, nơi `ketoan_app` không tắt được (không phải chủ bảng, không superuser).

## 2. Chữ chốt đề xuất

| # | Chữ chốt | Lý do |
|---|---|---|
| **D004-11** | **Dấu vết ở CSDL.** Migration mới thêm trigger `ledger_entries_header_audit` `AFTER UPDATE` trên `ledger_entries`, `FOR EACH ROW WHEN` một trong bảy cột đổi. Trigger `INSERT` một dòng `audit_logs`: `action = 'ledger.entry.header_update'`, `object_type = 'ledger_entry'`, `object_id` = id bút toán, `before_data` / `after_data` chỉ gồm cột **thật sự đổi**, cộng `_txid` (`pg_current_xact_id()`), `_source = 'db'`, `_role` (`session_user`). Dùng bảng `audit_logs` có sẵn (chuỗi băm, chỉ thêm, 0036): không bảng mới. | Mọi đường đổi bảy cột, kể cả SQL thẳng, đều để lại dòng. `ketoan_app` không tắt được trigger, không xoá được dòng nhật ký. |
| **D004-12** | **Phân biệt "đã khai báo" với "xảy ra ngoài ứng dụng".** Nhật ký của S004-13 (mức ứng dụng) thêm `_txid` cùng giá trị. Dòng `_source = 'db'` mà **không có** dòng cùng `_txid` ở mức ứng dụng = **sửa ngoài ứng dụng**. Không dùng biến phiên làm "giấy phép" (sẽ lặp lại lỗi của cờ `allow_ledger_purge`): dấu vết ghi **mọi** thay đổi, việc phân loại chỉ làm sau, ở tầng đọc. | Một cờ do ứng dụng tự đặt là thứ phiên nào cũng giả được. `_txid` do CSDL cấp, không giả được; ứng dụng chỉ **thêm** bằng chứng khai báo, không **bớt** được dấu vết. |
| **D004-13** | **Cảnh báo.** (1) Chẩn đoán L3 `LEDGER_HEADER_EDIT_UNATTRIBUTED` (mức `error`) liệt kê các bút toán có sửa đầu ngoài ứng dụng trong kỳ, kèm người (`_role`), giờ, cột, giá trị trước / sau, link tới lịch sử chứng từ. (2) Số đo `bizcity_ledger_header_edit_unattributed_total` (khai ở OBSERVABILITY) và luật cảnh báo trong `infrastructure/monitoring/prometheus/alerts.yml` (SC-OBS-1). (3) Đưa vào **bảng kiểm trước khi khoá kỳ**: còn sửa ngoài ứng dụng chưa được kế toán trưởng xác nhận thì không khoá kỳ, trừ khi ghi lý do (cùng cơ chế các lỗi L3 hiện nay). | Cảnh báo phải dẫn tới hành động: đến khoá kỳ thì một sửa đầu lạ phải được xem. |
| **D004-14** | **Bảng theo dõi.** API chỉ đọc `GET /api/v1/ledger/entry-edits` (lọc: kỳ, nguồn `ứng dụng / ngoài ứng dụng`, cột, người, bút toán; phân trang) và thẻ **"Sửa đầu bút toán"** trong Bàn điều tra (PHASE-019). Mỗi dòng: bút toán → chứng từ gốc, cột, trước → sau, nguồn, người, giờ, `txid`. Quyền: vai trò xem sổ + `audit:read`. **Bản mẫu HTML ở `mockups/` được chủ duyệt trước khi viết giao diện**, đủ trạng thái tải / rỗng / lỗi / không quyền, máy tính và điện thoại. | Dấu vết mà không ai nhìn được thì không phải dấu vết. |

**Chi phí và rủi ro:** thêm một dòng `audit_logs` cho mỗi lần đổi đầu bút toán (sự kiện hiếm: chỉ E2). Trigger `AFTER UPDATE ... WHEN` không chạy cho đảo (`status`) hay E1 (`total`). Mức K3 thêm chặt (minor), không đổi dữ liệu. Giới hạn: **chủ bảng / superuser vẫn tắt được trigger** (như mọi trigger khác); chẩn đoán `LEDGER_TRIGGERS` phát hiện sau. Ca phá thử: dưới `SET LOCAL ROLE ketoan_app`, `UPDATE ledger_entries SET event_version = NULL` ⇒ có đúng một dòng `audit_logs`; `DROP TRIGGER` / `DISABLE TRIGGER` ⇒ bị từ chối vì không phải chủ.

## 3. Việc (R-FLOW: Chữ chốt → Mã → Tự kiểm → Ghi)

| Việc | Nội dung | K | Phụ thuộc |
|---|---|---|---|
| S004-14 | migration trigger + `_txid` ở nhật ký S004-13 + ca phá thử + chẩn đoán `LEDGER_TRIGGERS` biết trigger mới | K3 thêm chặt | chủ duyệt D004-11, D004-12 |
| S004-15 | `LEDGER_HEADER_EDIT_UNATTRIBUTED` + số đo + luật cảnh báo + bảng kiểm khoá kỳ | K1 | S004-14 |
| S004-16 | API `entry-edits` + thẻ Bàn điều tra; **bản mẫu trước** | K1 | S004-14, chủ duyệt bản mẫu |

## 4. E1 (`ketoan.cost_overwrite`) — phương án cụ thể cho Q004-4

**Hiện trạng [M].** E1 có đúng **một** nơi ghi: `ledgerService.overwriteCostPairs` (`ledger.service.ts`). Nó bật cờ phiên `ketoan.cost_overwrite`, rồi `UPDATE ledger_lines` (theo lô, `unnest`, tối đa 10.000 dòng một câu) và `UPDATE ledger_entries.total`. Trigger chỉ cho đổi `debit` / `credit` ≥ 0 của dòng có `cost_fill`, bút toán `posted`, không đảo, mọi cột khác giữ nguyên. Cờ do ứng dụng tự đặt nên **bất kỳ phiên `ketoan_app` nào** đặt cờ rồi `UPDATE` được số tiền các dòng giá vốn, **không để lại dấu vết**, miễn mỗi cặp dòng vẫn cân.

**Phương án (đề xuất, chờ chọn):** thay cờ phiên bằng **hàm `SECURITY DEFINER`** có người sở hữu riêng.

1. Tạo vai trò `NOLOGIN` `ketoan_ledger_cost` (người cài đặt tạo, như `ketoan_app` ở 0032).
2. Hai hàm do vai trò đó sở hữu, `SET search_path = public`, `EXECUTE` chỉ cấp cho `ketoan_app`:
   - `ledger_fill_cost_lines(ids bigint[], debits numeric[], credits numeric[])`
   - `ledger_fill_entry_totals(ids bigint[], deltas numeric[])`
   Mỗi hàm **tự kiểm lại** điều kiện hiện nằm trong trigger (dòng có `cost_fill`, bút toán `posted`, không đảo, số ≥ 0), rồi `UPDATE` theo lô như hôm nay (cùng `unnest`, hiệu năng giữ nguyên) và ghi **một dòng `audit_logs` `costing.fill`** với tổng trước / sau và số dòng.
3. Trigger `guard_ledger_line_mutation` và nhánh (c) của `guard_ledger_entry_mutation` đổi điều kiện từ `current_setting('ketoan.cost_overwrite') = 'on'` thành `current_user = 'ketoan_ledger_cost'` (trong hàm `SECURITY DEFINER`, `current_user` là chủ hàm; ứng dụng không thể đặt).
4. `REVOKE UPDATE ON ledger_lines FROM ketoan_app` (đây là nơi duy nhất ứng dụng ghi `ledger_lines`); trên `ledger_entries` thu `UPDATE` rồi `GRANT UPDATE (status, doc_no, invoice_no, reason_code, partner_id, description, content_hash, event_version)`, **bỏ `total`**.
5. `overwriteCostPairs` gọi hai hàm thay vì `UPDATE` trực tiếp.

**Được:** ứng dụng không còn sửa trực tiếp được số tiền sổ cái; E1 chỉ qua hàm có điều kiện cố định và có dấu vết. **Chưa được:** `ketoan_app` vẫn gọi được hàm với số tiền tuỳ ý cho các dòng `cost_fill` (đó là bản chất của việc điền giá vốn); phương án thu hẹp từ "mọi dòng, không dấu vết" xuống "chỉ dòng giá vốn chờ, có dấu vết và đối soát". **Chi phí:** một migration (K3 thêm chặt), hai hàm, đổi một hàm TypeScript; `costing.test.ts` giữ nguyên làm hồi quy; ca phá thử "đặt cờ cũ rồi `UPDATE ledger_lines` ⇒ bị từ chối vì quyền". **Rủi ro:** hàm `SECURITY DEFINER` là bề mặt tấn công mới (phải `SET search_path`, không dùng SQL động, kiểm kỹ tham số); cần quyền tạo vai trò / chủ hàm ở bản cài (một bước thủ công như `ketoan_app`). **Không làm:** để nguyên cờ phiên (phương án 0). Việc: S004-17.

## 5. RV-R1-07 — vì sao K2 và phương án (đã thu hẹp sau khi đọc mã)

**Rút lại một nửa.** (a) "assets gọi `eventStore.post` từ ngoài Kernel": **không phải lỗi**. AGENTS câu 3 ghi rõ sự việc Kernel tự lập (phiếu tay, kết chuyển, khấu hao, giá vốn) đi `eventStore`; hai cửa là **thiết kế**. (b) Phần còn lại là có thật nhưng bản chất khác tôi mô tả:

**Hiện trạng [M].** `resolveAccounts` (`apps/api/src/phan-he/mua-hang/analysis.ts:42-64`) là một bộ phân giải tài khoản **riêng của module** cho 8 vai trò: `stock`, `vatIn`, `payable`, `cash`, `bank`, `giftIncome`, `giftExpense`, `finIncome`. Thứ tự: cài đặt module → bảng Kernel (`posting_reasons.counter_account`, `payment_methods.account_code`) → **số viết cứng** (`1561`/`156`, `1331`/`133`, `3312`…`331`, `1111`/`111`, `1121`/`112`, `71153`…`711`, `64184`…`6428`, `5152`…`515`). Kết quả đi vào các phiếu `voucherService.createIn` (trả tiền NCC, NCC hoàn tiền, chiết khấu thanh toán) dưới dạng `manual_journal` có sẵn `debitAccount` / `creditAccount`. Đường chính của phiếu mua (`postDocumentIn` → `AccountResolver`) **không** đi qua đây.

**Vấn đề.** Hai nguồn sự thật cho tài khoản mặc định (Kernel và module) có thể lệch: cùng một nghiệp vụ ra hai tài khoản tuỳ đường đi. Câu 4 (AGENTS) chỉ cấm số tài khoản trong **code định khoản**, mà `resolveAccounts` không phải code định khoản, nên SC-KERNEL-5 không bắt. Mức **vừa**, không phải nặng.

**Vì sao K2 (nếu sửa).** [RULE-KERNEL](../../rules/RULE-KERNEL.md): K2 = "đổi **hành vi ghi sổ** cho chứng từ **mới**". Bắt module lấy tài khoản từ `AccountResolver` sẽ đổi tài khoản của chứng từ **mới** bất cứ khi nào cài đặt / số cứng của module khác mặc định Kernel. Khi đó cần: mục "Thay đổi định khoản" trong CHANGELOG, chạy lại bộ test luật định khoản và 25 tình huống mua hàng (R-KER-5), và kế toán trưởng xác nhận từng vai trò lệch. **Nếu đo ra không lệch ở vai trò nào thì thực chất là K1** (chỉ gom một nguồn). Vì vậy việc đầu tiên là **đo**, chưa sửa.

**Phương án (3 bước, mỗi bước một PR):**
1. **S004-18 — Đo (K0, không đổi mã sản phẩm).** Script so, cho từng vai trò trong 8, kết quả của `resolveAccounts` với kết quả của `AccountResolver` / `posting_defaults` trên (i) dữ liệu của 25 tình huống mua hàng, (ii) một bản sao cài đặt thật nếu có. Ra bảng "vai trò × (module, Kernel) × lệch / khớp".
2. **Cổng Kernel (K1).** Thêm một hàm đọc ở cổng Kernel (`ports.ts` của module đã có sẵn chỗ) trả tài khoản theo vai trò từ `AccountResolver`; `resolveAccounts` gọi nó, **bỏ số viết cứng**: thiếu cấu hình thì báo lỗi bốn trường "chưa khai tài khoản mặc định cho vai trò X" (cùng tinh thần R-REV-13: không trả mặc định ngầm cho tiền).
3. **Chốt từng vai trò lệch (K2 nếu có).** Với mỗi vai trò đo ra lệch, kế toán trưởng chọn tài khoản đúng, ghi vào CHANGELOG "Thay đổi định khoản", chạy bộ test (R-KER-5).

**Khuyến nghị:** làm bước 1 trước, rồi mới biết bước 2–3 là K1 hay K2. Việc: S004-18 (+ bước 2–3 mở khi có kết quả).

## 6. Đính chính nhãn và Q004-6 (`tru-cot.json`)

Tôi đã ghi nhầm tiêu chí: trong trụ cột I, **L-1** là "dòng sổ không sửa / xoá / TRUNCATE" (`dat`), **L-2** là "Nợ = Có" (`dat`), **L-3** là "mọi dòng trỏ về sự việc có phiên bản" (`dat`), **L-4** là "ảnh chụp mã + định danh mặt hàng" (`mot-phan`; phần căn cứ pháp lý của PHASE-030, chưa rà bản gốc). Vì vậy câu hỏi "chuyển L-2 sang `dat`" **không đúng tiền đề**: ba tiêu chí về sổ đã `dat`.

Chốt thay thế (đã làm trong PR này, `docs/standard/tru-cot.json`):
- **L-1:** giữ `dat`, **bổ sung bằng chứng** 0086 (gỡ cờ, thu quyền), ca phá thử ở `db-rules` / `app-role`, chẩn đoán `LEDGER_TRIGGERS`.
- **L-5 (mới):** "Đầu bút toán chỉ đổi theo E2 (bảy cột), mỗi lần đổi có dấu vết ở tầng CSDL, sửa ngoài ứng dụng bị cảnh báo", `mot-phan` (S004-13 xong ở mức ứng dụng; còn S004-14…16). Chuyển `dat` khi S004-14 và S004-15 có test chạy được (R-ECP-SCORE).
- **Trụ cột I nói chung chưa thể ghi "đạt"** vì L-4 vẫn `mot-phan` (không thuộc phần này) và L-5 vừa mở.

## 7. Cần chủ dự án quyết

| # | Câu hỏi | Gợi ý |
|---|---|---|
| **Q004-7** | Duyệt D004-11…14 (dấu vết ở CSDL, phân biệt bằng `_txid`, cảnh báo vào khoá kỳ, bảng theo dõi trong Bàn điều tra)? | Duyệt. Mở S004-14 trước (K3 thêm chặt) |
| **Q004-4** | Chọn phương án E1 ở §4 (hàm `SECURITY DEFINER`) hay giữ nguyên? | Chọn §4; làm sau S004-14 |
| **Q004-8** | RV-R1-07: duyệt hướng "đo trước" (S004-18) rồi mới quyết K1 / K2? | Duyệt; không sửa mã mua hàng khi chưa có bảng lệch |

## 8. Quyết định của chủ dự án
<!-- [2026-11-08 10:24 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — chủ dự án duyệt Q004-7, Q004-4, Q004-8 (R-FLOW-7: quyết định vào tài liệu sở hữu) -->

Chủ dự án **đồng ý các phương án** (2026-11-08):

| # | Quyết định | Việc mở |
|---|---|---|
| **Q004-7** | Duyệt D004-11…14 | S004-14 (trước, K3 thêm chặt), rồi S004-15, S004-16 (bản mẫu HTML trước) |
| **Q004-4** | Chọn phương án E1 ở §4 (hàm `SECURITY DEFINER`) | S004-17, làm sau S004-14 (hai việc K3 không chạy song song: cùng sửa trigger `ledger_*`) |
| **Q004-8** | Duyệt hướng "đo trước" cho RV-R1-07 | S004-18 (K0) song song được, không đụng sổ |

Thứ tự mã: S004-14 và S004-18 trước (không phụ thuộc nhau); S004-15, S004-16, S004-17 sau S004-14.
