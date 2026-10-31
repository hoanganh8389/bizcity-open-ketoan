# RULE · Rà soát việc của người đóng góp (R-REV)
<!-- [2026-10-31 04:04 PM Johnny Chu - Chu Hoàng Anh] R-REV — luật rà soát việc của người đóng góp: phân vai, quy trình PR, biên bản, dữ liệu kế toán, mã hàng, công cụ ra-soat-dong-gop.mjs. -->
<!-- [2026-10-31 05:07 PM Johnny Chu - Chu Hoàng Anh] R-REV — 1.1: R-REV-11 (không làm sạch sổ để chạy lại), R-REV-12 (công cụ phân hệ ở scripts/<phân hệ>/), R-REV-13 (tra cứu cho tiền không có giá trị mặc định ngầm), §5 đoạn nhãn mã hàng, §6 cảnh báo các trường hợp đã gặp. -->

<!-- [2026-10-31 10:57 PM Johnny Chu - Chu Hoàng Anh] R-REV — 1.2: R-REV-14..16, §7 thang chấm đóng góp 11 trục, §8 mẫu báo cáo rà PR / rà repo. -->

> **Cấp:** Tier 0 (R-REV-1, -5, -6, -7, -11, -13, -14) · Tier 1 (còn lại) · **Phiên bản:** 1.2 · 2026-10-31 · **Chỉ mục:** [../00-CANON.md](../00-CANON.md)
> **Công cụ:** [`scripts/ra-soat-dong-gop.mjs`](../../scripts/ra-soat-dong-gop.mjs) · **Biên bản:** `docs/audits/REVIEW-<ngày>-<người>.md`

## 1. Phân vai

| Vai | Ai | Làm gì |
|---|---|---|
| **Người đóng góp** | thành viên phát triển phân hệ (vd Nguyễn Văn Thủy) | tính năng phân hệ, sửa lỗi, giao diện / trải nghiệm: `apps/api/src/phan-he/*` (lớp D), `apps/web`, `docs/huong-dan`, dữ liệu mẫu của phân hệ |
| **Nhóm Lõi** | chủ dự án Johnny Chu – Chu Hoàng Anh + agent làm theo chỉ đạo | framework: Kernel, Platform, danh mục chuẩn, hợp đồng, luật, bộ kiểm; **rà soát** việc của người đóng góp theo luật này |

Nhóm Lõi không viết thay tính năng phân hệ, mà bảo đảm phần người đóng góp làm **đúng kiến trúc, đúng chuẩn, không để lại lỗi hay rủi ro, và dữ liệu kế toán đúng**. *"Cộng đồng được tự do phát triển module, nhưng không được tự do thay đổi sự thật kế toán."*

## 2. Luật

| Mã | Luật | Kiểm bằng |
|---|---|---|
| **R-REV-1** | Người đóng góp làm trên nhánh riêng và mở PR vào `main`. **Không đẩy thẳng `main`.** Chủ dự án bật bảo vệ nhánh `main` (cần PR, CI xanh R-QG-1, một người duyệt) | `scripts/ra-soat-dong-gop.mjs` (H-DIRECT-MAIN) |
| **R-REV-2** | Phạm vi người đóng góp là lớp D / U, `apps/web`, hướng dẫn, dữ liệu mẫu. Đụng tệp framework ([RULE-SIGNATURE §3](RULE-SIGNATURE.md)) — Kernel, Platform, `packages/contracts`, migration, `scripts/`, `tests/conformance`, luật / hợp đồng — thì **chủ dự án duyệt trước khi merge**, có dấu R-SIG (người đóng góp ký tên mình, chủ ký dấu duyệt). Danh mục chuẩn (lớp M: `modules/catalog`, mặt hàng, ĐVT, đối tượng…) dù không phải tệp framework cũng phải qua Nhóm Lõi rà | `scripts/ra-soat-dong-gop.mjs` (H-FRAMEWORK, H-MASTERDATA), SC-SIG-1 |
| **R-REV-3** | Mỗi PR của người đóng góp, hoặc mỗi lần kéo việc của họ từ `main` về, chạy rà soát lượt đầu: `node scripts/ra-soat-dong-gop.mjs --range <từ>..<đến> --author "<tên>" --out docs/audits/REVIEW-<ngày>-<người>.md` | `scripts/ra-soat-dong-gop.mjs` |
| **R-REV-4** | Biên bản rà soát đủ sáu phần: (1) lượt đầu tự động, từng phát hiện có kết luận *đúng / dương tính giả / đã sửa*; (2) `selfcheck --strict`; (3) typecheck + `npm test` (số qua / lỗi); (4) diagnostics DG-* trên CSDL test có dữ liệu của tính năng; (5) dữ liệu và mã (§5); (6) kết luận **ĐẠT / ĐẠT có điều kiện / KHÔNG ĐẠT** kèm việc cần làm, người nhận | `docs/audits/REVIEW-2026-10-31-THUY.md` |
| **R-REV-5** | Phát hiện mức **chặn** (§4) thì không nhận vào nhánh làm việc của Nhóm Lõi, không phát hành, cho tới khi sửa. Nhóm Lõi **không âm thầm sửa** việc của người đóng góp: ghi việc vào biên bản và báo người đóng góp. Lỗi chặn khẩn thì sửa ngay, ghi rõ trong biên bản và commit | biên bản |
| **R-REV-6** | **Dữ liệu kế toán:** tính năng đụng định khoản, sổ, công nợ, kho, giá vốn, thuế (rủi ro R2+) phải: so bút toán trước / sau trên bộ tình huống của phân hệ (vd 25 trường hợp mua hàng); diagnostics DG-* không lỗi (sổ cân, công nợ mở = số dư 131 / 331 theo đối tượng, sổ hoá đơn = phát sinh thuế, tài khoản trung gian về 0); đổi định khoản ghi mục "Thay đổi định khoản" ở `CHANGELOG.md` | `scripts/doi-chieu-ke-toan.sql`, lane diagnostics `tests/conformance`, `apps/api/test/mua-hang-25-tinh-huong.test.ts` |
| **R-REV-7** | **Mã hàng** theo `SKU_RULE` ([`modules/catalog/sku-rule.ts`](../../apps/api/src/modules/catalog/sku-rule.ts)), chi tiết ở §5. Mã mới **chỉ** sinh qua `nextSku`, không tự ghép ở phân hệ hay giao diện. Mã đã phát sinh không đổi, không xoá (R-MD-4). Dữ liệu mẫu / seed / kịch bản phải đúng quy tắc | `apps/api/test/sinh-ma-hang.test.ts`, `scripts/ra-soat-dong-gop.mjs` (H-SKU, H-SKU-DATA) |
| **R-REV-8** | **Mã danh mục khác** (chi nhánh, đối tượng, chính sách, hình thức thanh toán, kho): chữ hoa, không dấu, gạch nối; ổn định; `UNIQUE (tenant_id, code)`; tham chiếu bằng mã, không bằng `id` (R-MD-2, R-MD-3). Không tạo bảng danh mục riêng (R-MD-1) | `scripts/ra-soat-dong-gop.mjs` (H-MD-TABLE), `db-rules.test.ts` |
| **R-REV-9** | Phân mức rủi ro trong biên bản: **R0** chỉ giao diện · **R1** nghiệp vụ phân hệ, không chạm sổ · **R2** chạm sổ, dữ liệu kế toán, danh mục, ĐVT, giá · **R3** framework. R2+ bắt buộc R-REV-6; R3 bắt buộc R-REV-2 | biên bản |
| **R-REV-10** | Lỗi gặp hai lần thì thành luật: thêm luật dò H-* vào `scripts/ra-soat-dong-gop.mjs` hoặc check SC-* / DG-*, kèm ca tự kiểm. Không chỉ sửa một lần. Lỗi **lọt** qua công cụ kiểm (vd công cụ không đọc loại tệp đó) thì vá công cụ ngay lần đầu | `tests/conformance/README.md` §7 |
| **R-REV-11** | **Không "làm sạch" sổ để chạy lại.** Không script / công cụ nào của người đóng góp được xoá, sửa, tắt trigger trên `ledger_*`, `accounting_events*`, `posting_log`, sổ hoá đơn, công nợ, thẻ kho của một phần dữ liệu. Muốn chạy lại kịch bản: nạp vào **đơn vị mới** (seed) hoặc **bản test** (`scripts/tao-ban-test.sh`); xoá trọn một đơn vị chỉ qua ngoại lệ E3 (`scripts/xoa-chung-tu.sh`) trên bản test. Sửa / huỷ dữ liệu thật = bút toán đảo qua Kernel | `scripts/kiem-chuan.sh`, `scripts/ra-soat-dong-gop.mjs` (H-LEDGER, H-TRIGGER-OFF) |
| **R-REV-12** | Công cụ của phân hệ (nạp dữ liệu mẫu, kịch bản test, nhập liệu một lần) đặt ở `scripts/<phân hệ>/` (vd `scripts/mua-hang/`): không phải tệp framework, người đóng góp tự quản, vẫn qua rà lượt đầu. `scripts/*.sh`, `scripts/*.mjs` cấp đầu là công cụ framework (R-SIG) | `scripts/ra-soat-dong-gop.mjs` (H-FRAMEWORK) |
| **R-REV-13** | Hàm tra cứu dùng cho **tiền / số lượng** (tỉ lệ ĐVT, thuế suất, giá, tài khoản) không được trả giá trị mặc định "an toàn" khi không tìm thấy (vd tỉ lệ `1`): không tìm thấy → không áp / báo lỗi rõ. Có test cho ca "không tìm thấy" | `apps/api/test/dvt-thung.test.ts` |
| **R-REV-14** | Mỗi lần rà (một PR, một người, hay cả repo) chấm theo **thang 11 trục §7** và kết luận theo luật cổng §7.2. Trục cổng (T1, T2, T4, T5) bị 0 điểm thì **KHÔNG ĐẠT**, tổng điểm cao cũng không bù được | biên bản §8 |
| **R-REV-15** | **Core chỉ lớn lên khi có lý do.** Đóng góp cần năng lực Core chưa có (`planned` trong `bizcity-standard.json`) thì làm đề xuất theo [VERSIONING §5](../standard/VERSIONING.md), không tự vá Kernel / `packages/*` trong PR phân hệ. Thêm vào Core phải chứng minh: ≥ 2 phân hệ cần, không trùng năng lực có sẵn ([REUSE-MAP](../standard/REUSE-MAP.md)), không thêm phụ thuộc npm (R-KER-8), có mức K0–K3 (R-KER-1) | §7 trục T3, T11 |
| **R-REV-16** | Rà là để **dạy luật, không chỉ chặn**: mỗi phát hiện ghi mã luật gốc + cách làm đúng + tệp mẫu làm đúng trong repo, để người đóng góp tự sửa và lần sau không lặp. Phát hiện không dẫn được về luật / hợp đồng / AP nào thì ghi "gợi ý", không được chặn | biên bản §8 |

## 3. Quy trình mỗi lần nhận việc

1. Đồng bộ: AGENTS.md "Trước khi code" (`git fetch`, `merge --ff-only origin/main`…).
2. Chạy lượt đầu (R-REV-3) cho đúng các commit của người đóng góp. Kết luận từng phát hiện.
3. Chạy `node tests/conformance/selfcheck.mjs --strict`, `npm run typecheck`, `npm test` trên mã **đã gộp**.
4. R2+: nạp bộ tình huống của phân hệ vào một đơn vị trên CSDL test, chạy diagnostics, so sổ (R-REV-6).
5. Kiểm dữ liệu và mã (§5).
6. Ghi biên bản `docs/audits/REVIEW-<ngày>-<người>.md`, báo người đóng góp các việc cần sửa.

## 4. Luật dò lượt đầu (H-*)

Chạy trên **dòng thêm** của từng commit. Đây là gợi ý, người rà phải xác nhận từng dòng.

| Mã | Mức | Dò gì | Luật gốc |
|---|---|---|---|
| H-LEDGER | chặn | ghi / xoá thẳng bảng `ledger_*` (mã, script, `.sql` ngoài migration) | câu 2, R-LEDGER |
| H-TRIGGER-OFF | chặn | tắt trigger bảo vệ sổ (`session_replication_role`, `DISABLE TRIGGER`, `allow_ledger_purge`) ngoài ngoại lệ E3 | R-LEDGER-1 |
| H-LEDGERSVC | chặn | phân hệ gọi `ledgerService` | câu 3 |
| H-KERNEL-IMPORT | chặn | phân hệ import thẳng mô-đun Kernel | SC-KERNEL-6 |
| H-CROSS-MODULE | chặn | phân hệ import phân hệ khác | R-BOUND |
| H-ACCOUNT-LITERAL | chặn | số tài khoản viết trong mã định khoản | câu 4, R-POST-2 |
| H-REPLY | chặn | `reply.status()` | R-API |
| H-SKIP | chặn | `it.only` / `.skip` mới | R-QG-8 |
| H-SECRET | chặn | chuỗi giống bí mật | R-SEC |
| H-MD-TABLE | chặn | migration tạo bảng khách / hàng / chi nhánh / đối tượng riêng | R-MD-1 |
| H-SEQ | cảnh báo | phân hệ tự đếm `document_sequences` | STD-DOC-6 |
| H-STATUS | cảnh báo | đổi trạng thái bằng UPDATE viết cứng | R-WF-1 |
| H-MONEY | cảnh báo | tiền tính bằng `parseFloat` / `toFixed` | quy ước tiền |
| H-FETCH | cảnh báo | gọi HTTP ra ngoài từ API | R-OUTBOX |
| H-ROUTE-PERM | cảnh báo | route ghi mới không khai quyền | R-TEN, SC-ACT-1 |
| H-SKU | cảnh báo | tự ghép mã hàng ngoài `sku-rule.ts` | R-REV-7 |
| H-SKU-DATA | cảnh báo | mã hàng trong JSON / CSV sai quy tắc | R-REV-7 |
| H-UNIT | cảnh báo | hệ số quy đổi ĐVT viết cứng (≥ 2) | R-REV-7 |
| H-DIRECT-MAIN | cảnh báo | commit đẩy thẳng nhánh đích | R-REV-1 |
| H-FRAMEWORK | cảnh báo | người đóng góp sửa tệp framework | R-REV-2 |
| H-MASTERDATA | cảnh báo | người đóng góp sửa danh mục chuẩn (lớp M) | R-REV-2, R-MD |
| H-NO-TEST | cảnh báo | đổi logic API / contracts mà không có test | R-QG-2 |
| H-MIGRATION | ghi chú | có migration mới: rà `COMMENT ON`, `numeric(18,2)`, RLS | R-DB |

## 5. Chuẩn dữ liệu và mã

**Mã hàng (`SKU_RULE`):** mã hàng = mã SKU nhóm cấp 1 + cấp 2 + cấp 3 + số thứ tự.

| Đoạn | Độ dài | Nghĩa | Ví dụ `110063101` |
|---|---|---|---|
| cấp 1 | 2 | ngành (quà khuyến mại: `Q`) | `11` Sữa bột |
| cấp 2 | 3 | nhãn | `006` ABBOTT |
| cấp 3 | 1 | nhóm sản phẩm | `3` Sữa công thức trẻ em |
| số thứ tự | 3 (quà: 4) | lớn nhất cùng tiền tố + 1 | `101` |

- **Đoạn cấp 2 là số thứ tự của nhóm cấp 2 trong cây nhóm hàng, đánh số riêng trong từng ngành — không phải mã nhãn danh mục** (`item_classes` loại `brand`). Ví dụ Anlene: `015` dưới ngành `11` (sữa bột), `034` dưới ngành `Q` (quà), nhãn danh mục `34`. Chính sách, hạn mức, thưởng theo nhãn dùng `brandCode` của danh mục; **không suy nhãn từ mã hàng**. Không đổi mã đã phát sinh để "khớp" nhãn (R-MD-4). Cảnh báo khi cùng đoạn ngành + nhãn mà khác nhãn danh mục: `scripts/doi-chieu-ke-toan.sql` §8 (quyết định việc j, 2026-10-31).
- Đuôi biến thể chữ hoa (K / M / Q / T, đuôi riêng Z, B) được lưu, nhưng không làm lệch số tự sinh.
- Mã gõ tay khác quy tắc vẫn lưu được (dữ liệu cũ). Rà soát phải báo danh sách các mã này.
- Đổi quy tắc chỉ ở `SKU_RULE`.

**Đơn vị tính:** ĐVT tồn kho = ĐVT nhỏ nhất, tỉ lệ 1. Quy đổi (thùng, lốc…) khai ở `product_units`, không viết cứng. ĐVT chưa khai ở mặt hàng thì không quy đổi (R-REV-13).

**Thuế GTGT đầu vào chưa có hoá đơn** (quyết định việc h, 2026-10-31):
- **Bước 1 — có:** tự chẩn đoán `TAX_INPUT_NO_INVOICE` / DG-TAX-1 cảnh báo sự việc đã ghi thuế đầu vào mà chưa có hoá đơn quá 30 ngày. Rà soát chạy `scripts/doi-chieu-ke-toan.sql` §3, §3b; biên bản ghi số lệch sổ hoá đơn ↔ 133.
- **Bước 2 — chờ kế toán trưởng duyệt (K2, cần ADR):** khoá ngầm định `tax_input_pending` trong gói định khoản. Phiếu chưa có hoá đơn ghi tài khoản chờ; khi nhập hoá đơn, Kernel đảo và ghi lại sang thuế được khấu trừ. Phát hành bản chính sách có ngày hiệu lực (ADR-0009); chứng từ cũ giữ nguyên.

**Tiền và giá:**
- Tiền lưu `numeric(18,2)`, cộng trừ qua `toCents` / `fromCents`.
- Đơn giá được có số lẻ. Thành tiền và thuế làm tròn đồng, làm tròn **một** chỗ.

**Câu hỏi rà dữ liệu:**
- Mã nào sai quy tắc?
- Mã nào trùng sau khi bỏ khoảng trắng hay đổi chữ hoa / thường?
- Mặt hàng nào thiếu ĐVT tỉ lệ 1?
- Bút toán của bộ tình huống có đổi so với lần trước không?
- Diagnostics DG-* có lỗi không?

## 6. Cảnh báo — những trường hợp đã gặp (đọc trước mỗi lần rà)
<!-- [2026-10-31 05:07 PM Johnny Chu - Chu Hoàng Anh] R-REV — cảnh báo các trường hợp đã gặp ở lần rà đầu (REVIEW-2026-10-31-THUY). -->

Mỗi dòng là một lỗi / rủi ro **đã xảy ra thật**. Gặp dấu hiệu tương tự thì dừng, rà kỹ, không coi là chuyện nhỏ.

| # | Dấu hiệu | Vì sao nguy | Làm đúng / kiểm bằng | Lần gặp |
|---|---|---|---|---|
| W-1 | Script "làm sạch", "xoá để nạp lại", `session_replication_role`, `DISABLE TRIGGER`, `DELETE FROM ledger_` / `accounting_events` | đi vòng lớp bảo vệ sổ chỉ thêm; xoá chọn lọc làm hở số bút toán, mồ côi công nợ / bằng chứng phân hệ khác; chạy nhầm trên sổ thật là mất dữ liệu kế toán | R-REV-11: đơn vị mới / bản test; E3 chỉ `xoa-chung-tu.sh`. **Chặn** — H-TRIGGER-OFF, H-LEDGER, `kiem-chuan.sh` | `lam-sach-mua-hang.sql` (392d97e), đã gỡ |
| W-2 | Hàm tra cứu trả mặc định khi không tìm thấy (`?? 1`, `?? 0`, phép "hoặc 1") rồi đem nhân / chia tiền | ĐVT, thuế suất, giá lạ được coi như hợp lệ → tiền sai nhiều lần mà không ai thấy | R-REV-13; test ca "không tìm thấy" | CK theo mã ĐVT Thùng chưa khai → giảm gấp 48 lần (3e45f20), đã sửa |
| W-3 | Kế thừa / sao chép cấu hình số (tỉ lệ ĐVT, giá, chiết khấu) từ bản ghi khác (mã cha, NCC khác, kỳ trước) | đúng hình thức nhưng sai thực tế (biến thể khác quy cách) → tồn kho, giá vốn sai | bắt người dùng xác nhận; test ca khác nhau | `inheritUnits` mã con (3e45f20), việc f |
| W-4 | Kịch bản test nhiều case dồn **chung một sổ** cho chính sách **cộng dồn** (tháng, quý, năm, hạn mức) | số "mong đợi" tính theo từng case riêng → lệch giả, che lỗi thật | mỗi case một kỳ / NCC / đơn vị riêng, hoặc tính mong đợi trên đúng các phiếu cùng sổ; tính tay lại khi lệch | 25 trường hợp: TH15, TH16, TH22 |
| W-5 | Kịch bản / script chỉ chạy được trên **sổ thật** (cần mặt hàng, nhãn, nhóm có sẵn) | không chạy lại được trên đơn vị sạch → không kiểm độc lập được, dễ bị đem chạy thẳng trên sổ thật | `chuanBi` khai đủ dữ liệu nền; chạy được trên đơn vị mới | 25 trường hợp (thiếu 3 mặt hàng, nhãn 63 / 34, nhóm 221), việc g |
| W-6 | Thuế đầu vào ghi sổ khi phiếu chưa có số hoá đơn | bảng kê mua vào < sổ 133; khấu trừ thuế khi chưa đủ điều kiện | `TAX_INPUT_NO_INVOICE` / DG-TAX-1; `doi-chieu-ke-toan.sql` §3b; bước 2 chờ kế toán trưởng (§5) | 64,45tr ở bộ 25 trường hợp |
| W-7 | Cột tổng đầu phiếu không nhất quán (`total` ≠ `total_before_tax` + `total_tax`) ở loại phiếu đặc biệt (đổi hàng…) | báo cáo nào cộng thẳng cột sẽ sai (đếm đôi thuế) dù sổ đúng | đối chiếu cột đầu phiếu với sổ; báo cáo đọc sổ, không đọc cột đầu phiếu | phiếu đổi `DO…`, việc i |
| W-8 | Suy nhãn hàng từ đoạn mã hàng, hoặc đổi mã cho "khớp" nhãn | đoạn cấp 2 là số trong ngành, không phải mã nhãn (§5); đổi mã đã phát sinh phá lịch sử | dùng `brandCode` danh mục; `doi-chieu-ke-toan.sql` §8 | Anlene `015` / `034` / nhãn `34`, việc j |
| W-9 | Commit đẩy thẳng `main`, không PR / CI | lỗi W-1, W-2 vào `main` không ai duyệt | R-REV-1, bảo vệ nhánh | 14 / 14 commit đợt 30/10 |
| W-10 | Công cụ kiểm báo xanh nhưng không đọc loại tệp có vi phạm (`.sql`, `.json`, tệp ngoài `apps/`) | "xanh giả" | thêm loại tệp / thư mục vào luật dò ngay (R-REV-10) | `kiem-chuan.sh` bỏ `.sql`, đã vá |
| W-11 | Typecheck báo lỗi lạ ở `packages/contracts` sau khi kéo `main` | `dist` cũ, không phải lỗi mã | `npm run build -w @ketoan/contracts` rồi kiểm lại (AGENTS.md "Trước khi code") | đợt 31/10 |

## 7. Thang chấm đóng góp (R-REV-14)
<!-- [2026-10-31 10:57 PM Johnny Chu - Chu Hoàng Anh] R-REV — thang chấm 11 trục: sự thật kế toán, ranh giới Kernel, hợp đồng, bảo mật, kiểm đầu vào, CSDL, hiệu năng, bộ nhớ đệm, báo cáo, kiểm thử, Core gọn. -->

Mục tiêu của thang: hàng chục người đóng góp cùng lúc mà Core **ngày càng chắc, gọn, an toàn, nhanh** — không phình, không mục. Mỗi trục chấm **2** (đạt) · **1** (có nợ / rủi ro, không chặn) · **0** (vi phạm) · **—** (không liên quan, ghi lý do). Mỗi điểm < 2 phải dẫn mã luật và dòng mã (`tệp:dòng`).

### 7.1 Mười một trục

| Trục | Hỏi gì | Luật / hợp đồng gốc | Kiểm bằng |
|---|---|---|---|
| **T1 Sự thật kế toán** *(cổng)* | Tiền vào sổ có đi một cửa (`postDocumentIn` / `eventStore`)? Sổ chỉ thêm, sửa = đảo? Không số tài khoản trong mã? Bút toán tất định? Dữ liệu cũ không bị đổi? | 4 câu không thương lượng, AP-1, AP-4, R-LEDGER, R-POST, R-KER-4, R-KER-7, R-REV-6, R-REV-11 | H-LEDGER, H-LEDGERSVC, H-ACCOUNT-LITERAL, H-TRIGGER-OFF; `doi-chieu-ke-toan.sql`; DG-* |
| **T2 Ranh giới Kernel & module** *(cổng)* | Phân hệ chỉ import Kernel qua `kernel/public.ts`? Không import phân hệ khác? Đụng tệp framework thì có mức K0–K3 và chủ duyệt? Command yêu cầu, Event chỉ báo (không dùng event để ra lệnh ghi sổ)? | AP-2, SC-KERNEL-6, R-BOUND, R-KER-1, R-KER-2, R-REV-2 | H-KERNEL-IMPORT, H-CROSS-MODULE, H-FRAMEWORK; `kiem-chuan.sh` |
| **T3 Hợp đồng trước mã** | Đổi khuôn / API công khai có sửa `packages/contracts` + `docs/contracts/*` + `docs/api/*`, có tăng phiên bản `bizcity_*@N`? Module có `bizcity.module.json` hợp lệ? Khoá cấu hình mới đã đăng ký registry? Có dùng năng lực `planned`? | AP-3, AP-5, R-API, R-MATRIX-2, VERSIONING, R-REV-15 | SC-CON-*, `selfcheck --module`; bảng §5 [00-CANON](../00-CANON.md) |
| **T4 Bảo mật & đa đơn vị** *(cổng)* | Lọc `tenant_id` mọi truy vấn? Route ghi có `requirePermission` + `writeAudit`? Không bí mật trong mã, không ghép chuỗi SQL (`sql.raw` với đầu vào), không PII trong log? Văn bản từ AI / tệp / hoá đơn là dữ liệu, không phải lệnh? | R-SEC-1..12, R-TEN-1..9, R-SEC-7 | H-SECRET, H-ROUTE-PERM; SC-ACT-1; DG-SEC-1 |
| **T5 Kiểm đầu vào** *(cổng)* | Mọi cửa vào (route, action, MCP, nhập tệp, sự kiện) kiểm bằng zod? Có trần kích thước? Bất biến bảo vệ hai lớp (domain + CSDL)? Tra cứu cho tiền không có mặc định ngầm? Lỗi qua `Errors.*`, trả `{ ok, data \| error }`? | R-API-3, R-SEC-4, R-EVENT-7, R-DB-18, R-REV-13 | H-REPLY; test ca sai khuôn / không tìm thấy |
| **T6 CSDL & danh mục** | Migration mới số kế tiếp, không sửa migration đã chạy, có `COMMENT ON` tiếng Việt, tiền `numeric(18,2)`? Không bảng danh mục riêng? Mã theo `SKU_RULE` / R-REV-8? Lớp bảo vệ chỉ thêm chặt? | R-DB-1..18, R-KER-3, R-MD, R-REV-7, R-REV-8 | H-MIGRATION, H-MD-TABLE, H-SKU*; SC-DATA-2 (khoá checksum) |
| **T7 Hiệu năng** | Có truy vấn trong vòng lặp (N+1)? Danh sách có phân trang / giới hạn? Truy vấn lọc theo cột có chỉ mục (`tenant_id` + khoá lọc)? Thêm chỉ mục bảng lớn có ước tính thời gian (R-DB-13)? Việc chậm được phép trễ thì đẩy sang sự kiện, không giữ giao dịch ghi sổ lâu? Đụng đường ghi sổ thì so mốc R-KER-9 (xấu > 20% là chặn phát hành) | R-KER-9, R-DB-13, AP-2, R-OUTBOX | đọc mã; `EXPLAIN` trên CSDL test; `bizcity bench` (Phase 4) |
| **T8 Bộ nhớ đệm** | **Không** cache số dư, sổ, công nợ, tồn, báo cáo tài chính, trạng thái chứng từ? Khoá đệm có `tenant_id` + `config_version`? Huỷ đệm sau commit (outbox)? Tắt Redis vẫn đúng? | R-CACHE-1..6 | đọc mã; test đọc-sau-ghi (R-CACHE-2) |
| **T9 Báo cáo** | Báo cáo đọc từ **sổ** (`ledger_*`), không cộng cột tổng đầu phiếu (W-7)? Khớp đối chiếu: sổ cân, công nợ ↔ 131 / 331, sổ hoá đơn ↔ 133, kho ↔ 156? Làm tròn một chỗ? Kỳ đã khoá không đổi số? | R-REV-6, W-6, W-7, R-DIAG | `doi-chieu-ke-toan.sql`; DG-*; so số trước / sau trên bộ tình huống |
| **T10 Kiểm thử & bằng chứng** | Đổi logic có test? Không `.only` / `.skip` mới? `selfcheck --strict` ĐẠT, không thêm nợ vào `baseline.json`? Đổi định khoản ghi CHANGELOG? Tệp framework có dấu R-SIG đúng người? | R-QG-1..10, R-REL, R-SIG, R-REV-10 | H-NO-TEST, H-SKIP; SC-SIG-1, SC-SIG-2; `npm test` |
| **T11 Core gọn** | Có thêm phụ thuộc npm, dịch vụ ngoài vào Kernel? Có viết lại thứ đã có (trùng [REUSE-MAP](../standard/REUSE-MAP.md))? Có mã chết, cờ / nhánh tương thích ngược thừa, trừu tượng cho nhu cầu giả định? Năng lực mới đặt đúng lớp (phân hệ trước, Core khi ≥ 2 phân hệ cần)? | R-KER-8, R-REV-15, AP-7 | đọc diff; `package.json`; đồ thị phụ thuộc `@bizcity-layer` |

### 7.2 Luật cổng và kết luận

| Kết luận | Điều kiện |
|---|---|
| **KHÔNG ĐẠT** | bất kỳ trục cổng (T1, T2, T4, T5) = 0 · hoặc có phát hiện mức **chặn** §4 chưa sửa · hoặc selfcheck / test đỏ do phần đóng góp |
| **ĐẠT có điều kiện** | không trục cổng nào = 0, nhưng có trục khác = 0 hoặc ≥ 3 trục = 1 → ghi việc, người nhận, hạn; merge được khi việc chặn đã xong |
| **ĐẠT** | mọi trục ≥ 1, trục cổng = 2 (hoặc —), không phát hiện chặn |

Điểm tổng = tổng điểm / (2 × số trục được chấm), báo theo %, kèm điểm từng trục. **So với lần rà trước** của cùng người / cùng phân hệ: trục nào đi xuống thì nêu rõ (R-REV-10 — lỗi lặp lại thành luật dò).

### 7.3 Rà cả repo (sức khoẻ framework)

Khi được yêu cầu "check repo" (không chỉ một PR), ngoài 11 trục trên mã đổi gần đây, báo thêm:

- Bảng điểm `selfcheck --strict` và **ma trận tuân thủ** C-1..C-9 (% hiện tại so ảnh chụp ở [CONG-BO-KIEN-TRUC §4.1](../CONG-BO-KIEN-TRUC.md)).
- AP-1..AP-7: nguyên tắc nào chưa có cách thực thi trong runtime / CI (= nợ, AP-7).
- Nợ trong `tests/conformance/baseline.json`: tăng hay giảm so lần trước.
- Người đóng góp / phân hệ: số commit, số PR, số commit đẩy thẳng `main` (W-9), xu hướng điểm.
- Lệch giữa mã và tài liệu: bảng "đổi X → sửa Y" ([00-CANON §5](../00-CANON.md)).
- Top việc nên làm tiếp để Core chắc hơn / gọn hơn, xếp theo rủi ro.

## 8. Mẫu báo cáo rà
<!-- [2026-10-31 10:57 PM Johnny Chu - Chu Hoàng Anh] R-REV — mẫu biên bản rà PR / người đóng góp / cả repo. -->

Ghi ở `docs/audits/REVIEW-<ngày>-<người>.md` (rà người / PR) hoặc `docs/audits/AUDIT-REPO-<ngày>.md` (rà cả repo).

```markdown
# Rà soát <PR #… | người | repo> — <ngày>
Phạm vi: <range commit / PR> · Tác giả: <tên commit git> · Mức rủi ro: R0–R3 · Mức Kernel: K0–K3 / không đụng

## Kết luận: ĐẠT | ĐẠT có điều kiện | KHÔNG ĐẠT — điểm <..%> (lần trước <..%>)

| Trục | Điểm | Ghi chú (mã luật, tệp:dòng) |
|---|---|---|
| T1 Sự thật kế toán | 2/1/0/— | |
| … T11 Core gọn | | |

## Phát hiện
| # | Mức (chặn / cảnh báo / gợi ý) | Trục | Luật gốc | Tệp:dòng | Vấn đề | Cách làm đúng (+ tệp mẫu) | Kết luận (đúng / dương tính giả / đã sửa) |

## Bằng chứng
selfcheck --strict: … · typecheck: … · npm test: … qua / … lỗi · diagnostics: error=… · đối chiếu: …

## Việc cần làm
| Việc | Người nhận | Hạn | Chặn merge? |

## Luật cần thêm (R-REV-10)
<lỗi lặp lại / lọt công cụ → H-* / SC-* / DG-* đề xuất>
```
