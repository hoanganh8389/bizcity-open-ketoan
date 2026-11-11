# Nhật ký thay đổi

Mọi thay đổi đáng kể của Bizcity Core (open-ketoan) ghi ở đây. Khuôn theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), số phiên bản theo [SemVer](https://semver.org/lang/vi/). Luật: [docs/rules/RULE-RELEASE.md](docs/rules/RULE-RELEASE.md).

Mỗi bản ghi đủ sáu mục:
- **Thêm**
- **Đổi**
- **Sửa**
- **Thay đổi định khoản**: K2 trở lên, áp cho chứng từ ghi sau khi cập nhật
- **Nâng cấp cần làm**
- **Bảo mật**

## [Chưa phát hành]

### Nhập Excel số dư tài khoản đầu kỳ <!-- [2026-11-11 Nguyễn Văn Thủy] docs/cap-nhat-ux/03 §3 (đóng góp) -->

- **Thêm:** trình nhập Excel loại *Số dư tài khoản đầu kỳ* (TI14, nút Nhập từ Excel ở ACC15): mỗi chi nhánh một phiếu số dư; kiểm trước tài khoản, đối tượng, cân Nợ – Có, chi nhánh đã có phiếu.
- **Thêm:** API `POST /api/v1/partners/exists` (mã đối tượng chưa có, chỉ đọc).
- **Thay đổi định khoản:** không.

### Danh sách phiếu tiền dạng trên – dưới <!-- [2026-11-11 Nguyễn Văn Thủy] docs/cap-nhat-ux/05 (đóng góp) -->

- **Thêm:** thẻ chỉ số trên danh sách phiếu tiền: tổng tiền trong kỳ, số phiếu, tồn quỹ tiền mặt / số dư tiền gửi đến hôm nay.
- **Đổi:** Phiếu thu / chi / báo có / báo nợ / phiếu kế toán: bấm một lần chọn phiếu và xem dòng hạch toán ở nửa dưới; bấm đúp để mở phiếu (trước: bấm một lần là mở).
- **Thay đổi định khoản:** không.

### Bảng tham số báo cáo dạng ngăn kéo bên phải <!-- [2026-11-11 Nguyễn Văn Thủy] docs/cap-nhat-ux/04 (đóng góp) -->

- **Đổi:** ở giao diện Xanh, bảng lọc của sổ / báo cáo / danh sách chứng từ thành ngăn kéo bên phải (nút **Chọn tham số**), báo cáo rộng trọn màn, có dòng tóm tắt tham số; bấm Tìm kiếm thì ngăn tự đóng. Nút **Ghim bên trái** / **Bỏ ghim** để đổi (nhớ theo máy).
- **Đổi:** bảng bấm dòng để mở chứng từ hiện ô Số chứng từ như liên kết.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** kéo ảnh web mới.

### Nhập Excel dùng chung 4 bước (TI14) <!-- [2026-11-11 Nguyễn Văn Thủy] docs/cap-nhat-ux/03 (đóng góp) -->

- **Thêm:** màn **TI14 Nhập dữ liệu từ Excel** và trình nhập 4 bước dùng chung (chọn tệp + tải mẫu, ghép cột tự động + ngầm định, kiểm tra từng dòng trước khi ghi + tải tệp lỗi, kết quả) cho Khách hàng, Nhà cung cấp, Mặt hàng, Kho; nút **Nhập Excel** ở các danh mục đó.
- **Thêm:** API `POST /api/v1/partners/import` (`dryRun`, `mode` create / update / both): mã trống tự cấp theo dãy của nhóm, MST không trùng, mỗi dòng một savepoint.
- **Đổi:** danh mục Mặt hàng dùng trình nhập mới thay hộp nhập cũ.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** kéo ảnh api và web mới.

### Giao diện Xanh, thêm nhanh danh mục ngay trên chứng từ (cập nhật trải nghiệm đợt 1) <!-- [2026-11-11 Nguyễn Văn Thủy] docs/cap-nhat-ux/01 (đóng góp) -->

- **Thêm:** giao diện Xanh (mặc định; avatar → Dùng giao diện cổ điển để quay lại): thanh trên trắng, menu trái nền tối, tiêu đề bảng xanh xám.
- **Thêm:** nút **Thêm nhanh** và mục **Hay dùng** đầu menu trái; màn danh sách nhận `?them=1` để mở sẵn form thêm mới.
- **Thêm:** ô chọn khách hàng / NCC / mặt hàng trên chứng từ có nút **+** và **F9** thêm ngay, ghi xong tự điền mã; danh sách xổ dạng bảng (MST, địa chỉ, điện thoại / ĐVT, **Tồn**); ô kho có nút + thêm kho cho chi nhánh.
- **Thêm:** thẻ chỉ số trên danh mục Đối tượng (nợ quá hạn, tổng nợ) và Mặt hàng (còn hàng, hết hàng, âm kho); cột **Chức năng** (Lập phiếu bán / Lập phiếu nhập) ở danh mục Đối tượng.
- **Thêm:** phiếu bán / trả lại: **Chưa thu tiền / Thu tiền ngay** ở đầu phiếu.
- **Thêm:** API `GET /api/v1/inventory/stock-counts`; `GET /api/v1/inventory/items` nhận `branchCode`, trả `stock`.
- **Đổi:** form chứng từ gần toàn màn, tổng tiền chữ lớn góc phải, chân Thoát · Ghi và thêm mới · Ghi, **Ctrl + S = Ghi**; phiếu chưa duyệt chữ **cam** (trước: mờ); nút Thêm của danh sách là nút chính; ô **Kỳ** có thêm Hôm qua, Tuần này, Cả tháng / quý / năm; danh sách trống có nút Thêm; trang Quy trình của nhóm có cột Báo cáo.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** kéo ảnh api và web mới.

### Bản cài biết kết quả bộ kiểm của chính nó (PHASE-034 S034-11) <!-- [2026-11-11 04:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — S034-11 -->

- **Thêm:** dựng ảnh api tự chạy bộ kiểm tĩnh (lane selfcheck) trên mã của commit và đóng gói kết quả vào ảnh (`build/scoreboard.json`); check đỏ không chặn dựng ảnh.
- **Thêm:** thẻ *Cổng & bộ kiểm* hiện kết quả từng check CI của bản dựng; `GET /api/v1/system/gates` trả `ciRun`.
- **Nâng cấp cần làm:** kéo ảnh api mới. Dựng ảnh lâu hơn vài giây (chép cả repo vào giai đoạn `conformance`).

### HT10: chạy công cụ nhà phát triển ngay trong thẻ, In cả năm thẻ (PHASE-034 B5b · S034-12) <!-- [2026-11-11 03:55 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5b, S034-12 -->

- **Thêm:** thẻ *Nhà phát triển* có nút **Chạy ở đây**: mở đúng màn của công cụ (Toàn vẹn, Sự kiện, Ghi sổ…) ngay dưới bảng; cần quyền Nhà phát triển.
- **Thêm:** nút **In cả năm thẻ** ở Hệ thống → Trụ cột & mức đạt: in năm thẻ nối nhau, mỗi thẻ một trang.
### Bỏ màn Thiết kế hạch toán (ACC92): tài khoản khai một nơi ở Tài khoản ngầm định (ACC41) (PHASE-026) <!-- [2026-11-11 Nguyễn Văn Thủy] PHASE-026 — bỏ ACC92 (đóng góp) -->

- **Đổi:** ACC41 là nơi duy nhất khai tài khoản: dòng có sẵn theo loại chứng từ; dòng thêm theo **Loại hàng** / **Biến thể**, một hộp Thêm / Sửa (dựa trên dòng gốc, TK Nợ / Có điền sẵn). Dòng khớp nhiều điều kiện hơn thắng.
- **Đổi:** nhận / xuất quà ở Mua hàng: dòng định khoản luôn theo tài khoản ở Cài đặt Mua hàng (đổi cài đặt thì đổi theo).
- **Gỡ:** màn ACC92 (đề xuất / duyệt / ngừng quy tắc, chạy thử, sơ đồ dây chuyền, đổi nhóm hạch toán hàng loạt, lịch sử); API `/api/v1/posting-rules` (trừ `options`, `defaults`), `/api/v1/posting-flow/*` (trừ `screens/:key/reasons`); `simulatePosting` của lõi; thư viện `@xyflow/react`.
- **Thay đổi định khoản:** không đổi bút toán: quy tắc đang áp trong CSDL vẫn được lõi đọc.
- **Nâng cấp cần làm:** kéo ảnh api, web mới.

### Thẻ Cổng & bộ kiểm đủ: trụ cột, test của từng mã; trigger CSDL và bộ kiểm CI có sổ (PHASE-034 B3b, S034-6) <!-- [2026-11-11 02:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3b -->

- **Thêm:** `docs/standard/cong-kiem.json` (`bizcity_gates@1`): họ mã → trụ cột (sửa tay) và phần sinh từ repo bằng `scripts/cong-kiem.mjs` (test của mã, mọi check SC-* / DG-*, mọi trigger CSDL); phép kiểm SC-GATE-1.
- **Đổi:** `GET /api/v1/system/gates` trả thêm `pillars`, `tests`, `score` cho từng mã; cổng *Trigger CSDL* và *Bộ kiểm CI* có dữ liệu. Thẻ Cổng & bộ kiểm có cột Test, Trụ cột; mức mỗi mã đủ bốn ý.
- **Nâng cấp cần làm:** kéo ảnh api mới (ảnh chép thêm `docs/standard/cong-kiem.json`).

### HT10 có dòng tổng: năm con số nhìn cả Core (PHASE-034 B6, S034-10) <!-- [2026-11-11 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B6 -->

- **Thêm:** đầu màn Hệ thống → Trụ cột & mức đạt có dòng tổng: Tiêu chí · Nền móng · Cổng & bộ kiểm · Bộ máy · Công cụ dev; bấm số để mở thẻ. Không đổi API.

### Thẻ Nhà phát triển ở HT10: tiến độ chín công cụ dev theo sáu tiêu chí sinh từ mã (PHASE-034 B5a, S034-8) <!-- [2026-11-11 12:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B5a -->

- **Thêm:** `docs/standard/cong-cu-dev.json` (`bizcity_devtools@1`), `scripts/cong-cu-dev.mjs` sinh tiêu chí T1..T6 từ repo, phép kiểm SC-DEV-2, `GET /api/v1/system/dev-tools` (chỉ đọc).
- **Thêm:** thẻ *Nhà phát triển* ở Hệ thống → Trụ cột & mức đạt: bảng công cụ × tiêu chí, nút Mở công cụ.
- **Nâng cấp cần làm:** kéo ảnh api mới (ảnh chép thêm `docs/standard/cong-cu-dev.json`).

### Khách trả hàng lấy đúng giá vốn lúc bán (PHASE-032 B3, S032-17) <!-- [2026-11-11 12:15 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B3: khách trả hàng lấy đúng giá vốn lúc bán -->

- **Đổi:** phiếu khách trả hàng của lần bán **tháng trước** hoàn giá vốn theo đơn giá bình quân **tháng bán gốc** (chứng từ gốc qua `originalDocKey`), và vào công thức đơn giá tháng trả như một dòng nhập. Phiếu trả **không có gốc** hoàn theo đơn giá bình quân tồn đầu kỳ trả (mặc định tạm Q032-5). Trả trong cùng tháng bán: như cũ.
- **Thay đổi định khoản:** K2 — số tiền dòng *Nợ TK kho / Có TK giá vốn* của phiếu khách trả khác tháng bán (và đơn giá bình quân tháng trả) đổi khi **tính lại giá vốn** từ bản này. Tháng đã tính trước không tự đổi; tháng chưa khoá muốn áp thì bấm tính lại giá vốn.
- **Thêm:** test `apps/api/test/tra-hang-gia-von-goc.test.ts` (G1: hoàn 500.000; giá trị tồn = số dư TK 156).
- **Sửa:** không. **Nâng cấp cần làm:** không (không migration). **Bảo mật:** không.

### Thẻ Bộ máy ở HT10: 13 engine của Core, mức đo từ mốc việc (PHASE-034 B4, S034-7) <!-- [2026-11-10 11:58 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B4 -->

- **Thêm:** `docs/standard/bo-may.json` (`bizcity_engines@1`) và `GET /api/v1/system/engines` (chỉ đọc): mỗi bộ máy có lớp, hợp đồng, mã, test, mã kiểm phát ra, và mốc việc — trạng thái mốc đọc từ bảng việc, không gõ tay.
- **Thêm:** thẻ *Bộ máy* ở Hệ thống → Trụ cột & mức đạt; phép kiểm SC-ENG-1 giữ sổ bộ máy khớp repo.
- **Nâng cấp cần làm:** kéo ảnh api mới (ảnh chép thêm `docs/standard/bo-may.json`, `docs/phases/bang-viec.json`).

### Thẻ Cổng & bộ kiểm ở HT10 có dữ liệu thật (PHASE-034 B3a, S034-5) <!-- [2026-11-10 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B3a -->

- **Thêm:** `GET /api/v1/system/gates` (chỉ đọc, `bizcity_gates@1`): mã kiểm của Core theo cổng (A · B · Commit Guard · L · tự chẩn đoán L1/L3/L5), mỗi mã có cách sửa / phương án chưa, điều kiện khoá sổ, kết quả lượt chẩn đoán gần nhất của đơn vị; Cổng C, khoá kỳ, trigger CSDL, bộ kiểm CI hiện dòng giữ chỗ.
- **Thêm:** thẻ *Cổng & bộ kiểm* ở Hệ thống → Trụ cột & mức đạt đọc API này.

### HT10 có năm thẻ: Tiêu chí · Nền móng · Cổng & bộ kiểm · Bộ máy · Nhà phát triển (PHASE-034 B2, S034-4) <!-- [2026-11-10 10:15 PM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B2 -->

- **Thêm:** Hệ thống → Trụ cột & mức đạt có thêm ba thẻ *Cổng & bộ kiểm*, *Bộ máy*, *Nhà phát triển* (hiện "sắp có", nói rõ nguồn dữ liệu và bước làm). Năm thẻ dùng chung một thanh mức đạt.
- **Đổi:** bản cài thiếu tệp nguồn của bảng (`tru-cot.json`, `nen-mong.json`) thì màn nói cách sửa (cập nhật bản cài) thay cho câu lỗi "Không tìm thấy".

### Thẻ Nền móng ở HT10 chạy trên bản cài Docker (PHASE-034 B1, S034-3) <!-- [2026-11-10 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-034 — B1 -->

- **Sửa:** ảnh api chép `docs/standard/nen-mong.json`. Trước đây thẻ *Nền móng* ở Hệ thống → Trụ cột & mức đạt (HT10) báo "Không tìm thấy bản đồ nền móng" trên bản cài Docker (chạy dev thì đúng).
- **Thêm:** luật R-REL-11 và phép kiểm SC-REL-3: tệp `docs/` mà mã đọc lúc chạy phải có trong repo và có `COPY` trong giai đoạn chạy của `docker/api.Dockerfile`.
- **Nâng cấp cần làm:** kéo ảnh api mới (`scripts/cap-nhat.sh`).

### PHASE-032 W0 — Inventory Engine: kho · lô · giá vốn liên tục (ADR-0033 chấp nhận) <!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — W0 tài liệu -->

- **Thêm:** [PHASE-032](docs/phases/PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/README.md) (master plan, kiến trúc tổng thể, mã hàng ≠ mã tài khoản, FIFO / FEFO, chín tình huống vàng, checklist, kế hoạch kiểm thử / PR, bản mẫu `inventory-engine.html`); [ADR-0033](docs/adr/ADR-0033-inventory-engine-gia-von-kho.md) **chấp nhận** 2026-11-09, làm theo chín bước thắng nhỏ B1..B9; quyết định D032-11 (chặn cứng hẹp), D032-12 (R-DIAG-10..16, mở rộng không thêm hợp đồng), D032-13 (HT08 thành Bàn làm việc kế toán); luật [R-INV](docs/rules/RULE-INVENTORY.md) và R-ITEM-10 (mã hàng ≠ mã tài khoản); hợp đồng [`bizcity_inventory@1`](docs/contracts/BIZCITY-INVENTORY-v1.md) 0.1.0-draft; hướng dẫn tính giá vốn và nghiệp vụ 11 thêm mục *Kiến trúc tổng thể*.
- **Đổi:** CANON §3 thêm dòng R-INV; chỉ mục ADR, phases README.
- **Sửa:** không.
- **Thay đổi định khoản:** không (tài liệu thuần; chưa có mã).
- **Nâng cấp cần làm:** không.
- **Bảo mật:** không.

### Chia nhỏ để chốt — lõi chặt chẽ, cách dùng dễ (CANON v1.6, R-FLOW-9) <!-- [2026-11-09 10:30 PM Johnny Chu - Chu Hoàng Anh] CANON — §0.10, LEAN-8, R-FLOW-9 -->

- **Thêm:** CANON §0.10 và LEAN-8 *Small Wins*; luật [R-FLOW-9](docs/rules/RULE-FLOW.md): master plan mỗi phase có bảng bước thắng nhỏ, mỗi bước một PR và người dùng dùng được ngay; câu hỏi mở dùng mặc định tạm ghi rõ trên màn.
- **Đổi:** phase đang mở bổ sung bảng bước trước khi giữ chỗ đợt kế tiếp. Lõi không nới: chữ chốt, K3, danh sách chặn giữ nguyên.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không.
- **Bảo mật:** không đổi.

### Lỗi Kernel mang ngữ cảnh chứng từ và phương án khắc phục (PHASE-022 S022-17, RV-R1-06) <!-- [2026-11-10 12:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — S022-17 -->

- **Thêm:** `details.context` (`docKey`, `docType`, `docNo`, `eventId`, `version`, `entryNo`, `period`, `branchCode`, `postingDate`, `step`) và `details.remedy` (`bizcity_remedy@1`, bảng `ERROR_REMEDY`) cho `UNBALANCED_ENTRY`, `PERIOD_LOCKED`, `POSTING_FAILED` và lỗi trigger CSDL (`step = db-trigger`, kể cả `LEDGER_APPEND_ONLY`); `UNBALANCED_ENTRY` thêm `difference`, `PERIOD_LOCKED` thêm `scope` (`period` / `branch` / `doc-type`, `periodRepository.lockScope`). `withErrorContext` (Platform) bổ sung khoá còn thiếu, `postDocumentIn` bọc ngữ cảnh chứng từ. Chữ chốt BIZCITY-ERRORS-v1 §4b (1.4.0-draft). Test `error-context` (6 ca).
- **Đổi:** không đổi mã, HTTP hay `reason`; khuôn cũ giữ (`debit`, `credit`). Lỗi có `details` dạng mảng câu và kết quả nạp theo lô (`IngestResult.error`) chưa mang `context` / `remedy` (§4b mục 6).
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không.
- **Bảo mật:** `context` chỉ có khoá trong danh sách đóng, không SQL, bảng, đường dẫn, dữ liệu cá nhân.

### Tuổi nợ, sổ công nợ theo hạn, lãi lỗ theo hợp đồng và ghi chú dài hạn hiện tên đối tượng đúng ngày (PHASE-029 S029-19 đợt 2e) <!-- [2026-11-09 07:36 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — đợt 2e -->

- **Thêm:** không (dùng `bizcity_entity_attr_at` và `partnerNamesAt` của đợt 1 / 2a). Golden T029-CTL-1..5.
- **Đổi:** tên đối tượng hiện đúng ngày theo chỗ hiện:
  - **tuổi nợ** (`aging`, `aging-due`): tên tại **ngày xem**;
  - **sổ công nợ theo hạn** (`debt-by-term`): dòng đối tượng = tên **cuối kỳ**; dòng từng chứng từ và dòng thanh toán = tên tại **ngày chứng từ** (chứng từ nhập muộn vẫn mang tên đúng tại ngày phát sinh);
  - **lãi lỗ theo hợp đồng** (`profit-by-contract`): tên đối tượng của hợp đồng = tên **cuối kỳ**;
  - **ghi chú chuyển dài hạn** ở bảng cân đối: tên tại **ngày lập bảng**.
  Số tiền và mã đối tượng không đổi.
- **Sửa:** không.
- **Thay đổi định khoản:** không. Không đổi bảng, trigger hay dữ liệu.
- **Nâng cấp cần làm:** không (cần migration 0087 đã chạy).
- **Bảo mật:** không đổi.


### Ngừng chính sách đóng hiệu lực (PHASE-031 S031-31, RV-R1-04) <!-- [2026-11-10 10:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-031 — S031-31 -->

- **Đổi:** `retirePolicy` (Platform) đóng `effective_to` của bản còn mở bằng **ngày ngừng** (tham số `effectiveTo`, mặc định hôm nay; không sớm hơn `effective_from − 1`) cùng lúc chuyển `retired`. Chứng từ có ngày ≤ ngày ngừng vẫn hợp lệ; **sau** ngày ngừng cửa nạp báo **IN-POL-002** (trước đây chứng từ mới trỏ bản đã ngừng không bị báo). Sự kiện `bizcity.policy.retired` thêm `data.effectiveTo`. Chữ chốt: PHASE-031 · 00 §16.
- **Thêm:** test `policy-retire` (6 ca).
- **Sửa:** không.
- **Thay đổi định khoản:** không đổi cách tính; chứng từ gửi sau ngày ngừng của một chính sách đã ngừng nay nhận cảnh báo IN-POL-002 (advice: vẫn ghi sổ; strict: chờ duyệt).
- **Nâng cấp cần làm:** không. Bản đã `retired` trước đây vẫn có `effective_to = NULL` (không có ngày ngừng đáng tin) — việc gỡ nợ là S031-32.
- **Bảo mật:** không đổi.

### Thiết kế hạch toán: lý do theo màn, sơ đồ dây chuyền định khoản (PHASE-026) <!-- [2026-11-10 09:00 PM Nguyễn Văn Thủy] PHASE-026 — thiết kế hạch toán (đóng góp) -->

- **Thêm:** màn **ACC92 Thiết kế hạch toán**: (1) mỗi màn nghiệp vụ gán vài lý do (bảng `screen_reasons`, migration 0095), lý do chọn sẵn; Phiếu thu / chi chỉ hiện lý do đã gán; (2) sơ đồ dây chuyền Chứng từ → Nguồn tài khoản (lý do, nhóm hạch toán, thuế, hình thức, ngầm định) → Bút toán → Sổ cái, đường liền = nguồn đang dùng, nét đứt = nguồn trống / dự phòng, kiểm Nợ = Có, bấm ô để sửa tài khoản qua API cấu hình có sẵn, hiện ảnh hưởng (số mặt hàng, màn, bút toán); (3) đổi nhóm hạch toán hàng loạt theo nhóm hàng có xem trước. (4) thẻ **Lịch sử thay đổi**: mỗi lần lưu lý do, nhóm hạch toán, ngầm định, loại thuế, hình thức, lý do theo màn, đổi nhóm hàng loạt — ai, lúc nào, từng ô trước → sau (`GET /api/v1/posting-flow/history`, đọc nhật ký thao tác, không thêm bảng). API `/api/v1/posting-flow/*`; thư viện sơ đồ `@xyflow/react` 12.10.1.
- **Đổi:** không đổi bộ định khoản: sơ đồ đọc đúng thứ tự tra tài khoản của lõi; test đối chiếu với bút toán thật.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** chạy migration 0095 (gán sẵn lý do mặc định cho từng màn).

### Form mặt hàng gọn hơn, tên không trùng, biến thể Cận date (PHASE-026) <!-- [2026-11-10 04:30 PM Nguyễn Văn Thủy] PHASE-026 — rà form mặt hàng (đóng góp) -->

- **Thêm:** tên mặt hàng không được trùng (gộp khoảng trắng, không phân biệt hoa thường, kể cả mặt hàng đã ngừng): `sameNameProduct`, kiểm ở form, Excel, thêm sản phẩm con khi thêm mới / đổi tên; `GET /api/v1/catalog/name-check` để form báo khi gõ. Dữ liệu cũ đã trùng vẫn sửa được ô khác. Biến thể **Cận date** (`expiry`, mã B cũ): hàng sắp hết hạn, giá bán riêng, gửi thuế theo mã cha; migration 0094 chuyển mã B đang có từ `legacy` sang.
- **Đổi:** form DM10: Nhóm → Mã → Tên lên đầu; thêm mới là mã cha (không còn ô Mã hàng cha), mã mới chỉ chữ số; Biến thể có câu giải thích, không chọn được Nội bộ khi đã có nhập xuất và đang gửi thuế; nút Thêm sản phẩm con hiện mờ kèm lý do ở mã còn chữ. Hướng dẫn `mat-hang.md` viết lại phần sinh mã, sản phẩm con.
- **Sửa:** sản phẩm con trước chỉ chặn trùng tên trong cùng họ.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** chạy migration 0094.

### Mua hàng đi đúng đường thuế theo mã (PHASE-026) <!-- [2026-11-10 10:30 AM Nguyễn Văn Thủy] PHASE-026 — đường thuế mua hàng (đóng góp) -->

- **Thêm:** `taxPathChecks` (mua-hang-domain): hàng mua có hoá đơn vào mã không gửi thuế → chặn `tax_path_invoice`; hàng / quà không hoá đơn vào mã gửi thuế → chặn `tax_path_gift` (chỉ mã quà cùng họ, chưa có thì báo khai báo danh mục); quà có hoá đơn / xuất quà bằng mã gửi thuế → nhắc `tax_path_invoiced_gift`. `noTaxFamily` gợi ý mã. Kịch bản NT-MH-003, test `mua-hang-duong-thue`.
- **Đổi:** `autoLineType` suy loại dòng theo Biến thể / Loại hàng / Gửi lên thuế của mặt hàng, không theo chữ cuối mã (mã M không còn tự thành quà). Dữ liệu mẫu 25 tình huống: mã quà không hoá đơn khai không gửi thuế.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không.

### Khoá ô Gửi lên thuế khi mặt hàng đã có nhập xuất (PHASE-026) <!-- [2026-11-10 09:00 AM Nguyễn Văn Thủy] PHASE-026 — khoá gửi thuế (đóng góp) -->

- **Đổi:** lưu mặt hàng mà làm đổi `send_to_tax` (trực tiếp, hoặc qua đổi biến thể sang / khỏi Nội bộ) khi đã có `inventory_movements` (theo mã hoặc định danh) → 409. `GET /api/v1/catalog/products/:sku` trả `hasMovements`; DM10 khoá ô.
- **Thêm:** `hasMovements()` ở catalog.service. Quy tắc thuế theo mã: tài liệu 14.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không.

### Ô Gửi lên thuế trên mặt hàng (PHASE-026) <!-- [2026-11-09 07:30 PM Nguyễn Văn Thủy] PHASE-026 — 0093 (đóng góp) -->

- **Thêm:** cột `products.send_to_tax` (migration 0093), mặc định bật; trigger ép tắt với biến thể không sang thuế (Nội bộ). `sendToTax` ở `PUT /api/v1/catalog/products/:sku`, `POST /api/v1/items/add-child`, danh sách và luồng `/api/v1/catalog/feed/products`. Ô *Gửi lên thuế* ở DM10 (mọi mặt hàng, cả mã cha) và form Thêm sản phẩm con; cột *Gửi thuế* ở danh sách.
- **Đổi:** mã cha không có Biến thể (máy chủ từ chối). Hệ thống bán hàng tách khỏi thuế theo ô này, không theo biến thể.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** chạy migration 0093 (thêm cột, tắt gửi thuế cho hàng Nội bộ). Hệ thống bán hàng tự kéo lại danh mục một lượt.

### Sản phẩm con và ô Biến thể, giai đoạn 1 chuyển mã số (PHASE-026) <!-- [2026-11-07 06:20 PM Nguyễn Văn Thủy] PHASE-026 — mã số cha – con GĐ 1 (đóng góp) --> <!-- [2026-11-09 10:00 AM Nguyễn Văn Thủy] PHASE-026 — bỏ khoá tạm, migration 0092 (đóng góp) -->

- **Thêm:** bảng `item_variant_kinds`, cột `products.variant_code` tự điền theo đuôi mã (migration 0092); `POST /api/v1/items/add-child`, `GET /api/v1/items/variant-kinds`; nút Thêm sản phẩm con (tên + Biến thể, chọn được mọi biến thể) và cột Biến thể ở DM10; ô Biến thể sửa được (`variantCode` ở `PUT /api/v1/catalog/products/:sku`); luồng `/api/v1/catalog/feed/products` gửi `variantCode`; bảng Biến thể ở MH26; loại hàng chuẩn. Phương án: `docs/nghiep-vu/12-phuong-an-bo-chu-khoi-ma-hang.md`; xuyên suốt với WordPress: `docs/nghiep-vu/14-ma-so-bien-the-xuyen-suot.md`.
- **Đổi:** MH22 không tự nhận khi NCC dùng lại mã cho hàng khác hẳn, đưa về gợi ý. Đổi mã không làm đổi biến thể (biến thể đi theo mặt hàng). Không gộp hàng Nội bộ với hàng có sang thuế. Bỏ cách tạo mã có đuôi ở DM10 (chọn đuôi, nút Tạo mã có đuôi).
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** chạy migration 0092. Khoảng 9 giây trên 42.016 dòng; không đổi `updated_at`. Hệ thống bán hàng (tgs_accounting_bridge) tự kéo lại danh mục một lượt để nhận `itemId` và `variantCode`.
### Màn "Sửa đầu bút toán" (SC02) và xác nhận của kế toán trưởng (PHASE-004 S004-16, D004-14, D004-16) <!-- [2026-11-10 12:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-16 -->

- **Thêm:** `GET /api/v1/ledger/entry-edits` (quyền `ledger:read`) — mọi lần đổi đầu bút toán từ nhật ký của trigger 0089, nguồn **Ứng dụng** / **Ngoài ứng dụng** (ghép `_txid`), cột trước → sau, vai trò / đăng nhập / ứng dụng / máy, trạng thái xác nhận, tóm tắt; lọc ngày hạch toán, nguồn, cột, số bút toán, trạng thái. Action `core.ledger.header-edit-ack` (`POST …/entry-edits/ack`, quyền `periods:lock`, chỉ người dùng, lý do ≥ 10 ký tự): bằng chứng của action là bản ghi xác nhận, chỉ thêm. Màn **SC02** ở menu Kế toán › Định khoản (bộ lọc trên địa chỉ, cột `content_hash` ẩn mặc định). Hướng dẫn `docs/huong-dan/sua-dau-but-toan.md`. Test `entry-edits` (5 ca).
- **Đổi:** chẩn đoán `LEDGER_HEADER_EDIT_UNATTRIBUTED` (và lane DG-LEDGER-5) bỏ lần sửa đã được xác nhận — khoá kỳ hết chặn sau khi kế toán trưởng xem. Màn đặt ở menu Kế toán thay vì Bàn điều tra (D004-14 đổi: kế toán trưởng không có `devtools:read`).
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không (cần 0089).
- **Bảo mật:** đọc nhật ký theo đơn vị; xác nhận không sửa / xoá dấu vết cũ; khoá API không xác nhận được.


### Nhật ký chi tiền theo khoản mục hiện tên đối tượng lúc ghi (PHASE-029 S029-19 đợt 2d) <!-- [2026-11-09 11:55 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — đợt 2d -->

- **Thêm:** không (dùng cột `partner_name` của migration 0087 / 0090). Golden T029-DIM-1..2.
- **Đổi:** **sổ nhật ký chi tiền theo khoản mục** (ACC75) hiện tên đối tượng **lúc ghi** (tên của dòng Nợ nếu dòng có đối tượng, rồi của đầu bút toán, rồi tên hiện tại): đổi tên đối tượng thì chứng từ cũ, kể cả chứng từ nhập muộn có ngày chứng từ trước ngày đổi tên, vẫn hiện tên cũ. Số tiền và cột khoản mục không đổi.
- **Sửa:** không.
- **Thay đổi định khoản:** không. Không đổi bảng, trigger hay dữ liệu.
- **Nâng cấp cần làm:** không (cần migration 0090 đã chạy).
- **Bảo mật:** không đổi.

### Sổ chi tiết tài khoản và nhật ký chung hiện tên đối tượng lúc ghi (PHASE-029 S029-19 đợt 2c) <!-- [2026-11-09 11:29 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — đợt 2c -->

- **Thêm:** không (dùng cột `partner_name` của migration 0087 / 0090). Golden T029-LED-1..3.
- **Đổi:** **sổ chi tiết tài khoản** và **sổ nhật ký chung** hiện tên đối tượng **lúc ghi** (tên của dòng nếu dòng có đối tượng, rồi của đầu bút toán, rồi tên hiện tại): đổi tên đối tượng thì chứng từ cũ, kể cả chứng từ nhập muộn có ngày chứng từ trước ngày đổi tên, vẫn hiện tên cũ. Mã đối tượng và số tiền không đổi.
- **Sửa:** không.
- **Thay đổi định khoản:** không. Không đổi bảng, trigger hay dữ liệu.
- **Nâng cấp cần làm:** không (cần migration 0090 đã chạy).
- **Bảo mật:** không đổi.

### E1 (điền giá vốn) qua hàm SECURITY DEFINER; ứng dụng không còn sửa trực tiếp số tiền sổ cái (PHASE-004 S004-17, D004-15) <!-- [2026-11-09 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-17 -->

- **Đổi:** migration `0091` — vai trò `ketoan_ledger_cost` (NOLOGIN) sở hữu hai hàm `ledger_fill_cost_lines` / `ledger_fill_entry_totals` (SECURITY DEFINER, `search_path` cố định, `EXECUTE` chỉ cho `ketoan_app`), tự kiểm dòng `cost_fill`, bút toán `posted` không đảo, số ≥ 0, ghi `audit_logs` `ledger.cost_fill`. Trigger sổ cái chỉ cho đổi số tiền khi `current_user = 'ketoan_ledger_cost'` (cờ phiên `ketoan.cost_overwrite` hết tác dụng). `ketoan_app` mất `UPDATE` số tiền: `ledger_lines` chỉ còn cột `item_id`; `ledger_entries` không còn cột `total` (cột mới thêm về sau mặc nhiên không sửa được). `overwriteCostPairs` gọi hai hàm.
- **Thêm:** test `e1-cost-fill` (7 ca: cờ cũ vô tác dụng, qua hàm đổi được và có dấu vết, hàm từ chối dữ liệu sai, không thay / sửa hàm, cân Nợ = Có, đường thật `overwriteCostPairs`).
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** người cài đặt cần quyền tạo vai trò `ketoan_ledger_cost`; nếu không migration dừng và in lệnh `CREATE ROLE` để quản trị CSDL chạy trước. Giá trị tiền không đổi; hiệu năng giữ nguyên (cùng `unnest` theo lô 10.000).
- **Bảo mật:** thu hẹp từ "mọi dòng sổ cái, không dấu vết" xuống "chỉ dòng giá vốn chờ, có dấu vết"; hàm là bề mặt mới (không SQL động, kiểm tham số). Chưa được: `ketoan_app` vẫn gọi hàm với số tiền tuỳ ý cho dòng giá vốn chờ (bản chất của việc điền giá vốn).


### Sổ nhật ký hiện tên đối tượng lúc ghi; khung nhìn bizcity_read thêm partner_name (PHASE-029 S029-19 đợt 2b) <!-- [2026-11-09 11:13 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — đợt 2b -->

- **Thêm:** migration `0090_khung_nhin_ten_doi_tuong.sql` — `bizcity_read.ledger_lines` và `bizcity_read.ledger_entries` thêm `partner_name` + `partner_attr_id` ở cuối (`CREATE OR REPLACE VIEW` chỉ thêm cột, giữ thứ tự cột cũ, giữ `security_invoker` và quyền). Báo cáo đọc sổ qua khung nhìn nên đây là điều kiện để đọc được tên lúc ghi của 0087. Golden T029-JNL-1..4.
- **Đổi:** sổ nhật ký **thu / chi tiền** (`cash-journal`), **bán hàng** (`sales-journal`) và **mua hàng** (`purchase-journal`) hiện tên đối tượng **lúc ghi** (tên của dòng nếu dòng có đối tượng, rồi của đầu bút toán, rồi tên hiện tại): đổi tên đối tượng thì chứng từ cũ — kể cả chứng từ nhập muộn có ngày chứng từ trước ngày đổi tên — vẫn hiện tên cũ. Dòng sổ ghi trước 0087 (chưa có tên lúc ghi) vẫn hiện tên hiện tại. Mã đối tượng và số tiền không đổi.
- **Sửa:** không.
- **Thay đổi định khoản:** không. Không đổi bảng, trigger hay dữ liệu.
- **Nâng cấp cần làm:** chạy migration 0090 (đã có 0087 của đợt 1).
- **Bảo mật:** không đổi (khung nhìn giữ `security_invoker`).

### Cảnh báo sửa đầu bút toán ngoài ứng dụng (PHASE-004 S004-15a, D004-13) <!-- [2026-11-09 08:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-15a -->

- **Thêm:** chẩn đoán L3 `LEDGER_HEADER_EDIT_UNATTRIBUTED` (mức **error**, có phạm vi kỳ / chi nhánh): liệt kê bút toán có lần sửa đầu **ngoài ứng dụng** = dòng nhật ký của trigger 0089 (`_source = db`) không có dòng của ứng dụng (`_source = app`) cùng `_txid`. Vì là lỗi L3 mức error nên khoá kỳ chặn như mọi lỗi L3 (kế toán trưởng ghi lý do thì khoá được). Lane DG-LEDGER-5 cùng bộ mã (R-DIAG-9). Test `e2-unattributed-warning`.
- **Đổi:** không. Số đo `bizcity_ledger_header_edit_unattributed_total` và luật cảnh báo là S004-15b (chờ PHASE-018 W6).
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không (cần migration 0089 đã chạy). Lần sửa trực tiếp trước đây vẫn hiện nếu đã có dòng nhật ký của trigger.
- **Bảo mật:** chỉ đọc `audit_logs` theo đơn vị.


### Báo cáo công nợ hiện tên đối tượng tại ngày kết thúc kỳ (PHASE-029 S029-19 đợt 2a) <!-- [2026-11-09 09:42 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — đợt 2a -->

- **Đổi:** báo cáo **công nợ theo nhân viên** (`GET /api/v1/reports/debt-by-employee`) và **công nợ theo mặt hàng** (`debt-by-item`) hiện tên đối tượng ở tiêu đề theo **tên hiệu lực tại ngày kết thúc kỳ** (`to`), không phải tên hiện tại: đổi tên đối tượng rồi xem báo cáo của kỳ kết thúc trước ngày đổi tên vẫn ra tên cũ, kỳ kết thúc từ ngày đổi tên trở đi ra tên mới. Số liệu và mã đối tượng không đổi. Hàm dùng chung `partnerNamesAt` (`reports/ten-doi-tuong.ts`) cho các báo cáo sau. Golden T029-RPT-1..4.
- **Thêm:** không migration.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không (cần migration 0087 của đợt 1 đã chạy).
- **Bảo mật:** không đổi; tra tên lọc theo đơn vị.

### Thực hiện chương trình khuyến mại: `program[]` ở theo dõi chính sách (PHASE-031 W4c, ADR-0031) <!-- [2026-11-09 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4c -->

- **Thêm:** khoá `program[]` ở `GET /api/v1/policy-tracking` — mỗi *(chính sách, bản)* có chứng từ trong kỳ: số chứng từ áp, **số lượng quà đã tặng theo mặt hàng** (từ các dòng quà nguồn đã gửi trong chứng từ đã ghi sổ), số chứng từ có quà lệch (`IN-POL-004`) và tỉ lệ. Khối *Thực hiện chương trình* ở tab *Theo dõi thực hiện* của màn Chính sách. `bizcity_policy@1` 1.3.0-draft; test T031-PRG-1..5.
- **Đổi:** không. Thêm khoá, không đổi khoá cũ; không migration.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không.
- **Bảo mật:** chỉ đọc, lọc `tenant_id`; cần `catalog:read`.

### Cửa nạp tính lại quà theo chính sách: `IN-POL-004` (PHASE-031 W2b, ADR-0031) <!-- [2026-11-09 07:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2b -->

- **Thêm:** mã `IN-POL-004` (L4, cảnh báo, 10 điểm) — tính lại quà theo **đúng bản chính sách nguồn nêu** trên các dòng không phải quà, so với dòng quà nguồn gửi (thiếu / thừa / lệch số lượng), kèm cặp nguồn ↔ tính lại; chỉ khi bản có thật và băm khớp; im lặng khi không tính được. `getPolicyVersion` (đọc một bản kèm nội dung inline) và điểm mở rộng `registerPolicyRecompute` ở `@bizcity/platform/core/policies` — `apps/api` đăng ký hàm tính (`rule-contracts/recompute.ts`) cùng luật với `POST /policies/evaluate`. `bizcity_intake_findings@1` (§3 thêm mã; số phiên bản nâng sau); trang `loi-dau-vao/IN-POL-004.md`; test `intake-policy-recompute.test.ts` (T031-INT-10..14).
- **Đổi:** `policy_check.findings`, khung nhìn `policy_application.codes` và ô *Lệch theo mã* mang thêm mã mới (không đổi mã nào). Chế độ `strict` coi `IN-POL-004` như mọi `IN-POL-*` (chờ duyệt). Mặc định vẫn chỉ cảnh báo.
- **Sửa:** không. Không migration.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không.
- **Bảo mật:** chỉ đọc; cảnh báo không lộ nội dung chính sách ngoài số lượng quà.

### Màn Chính sách ở Hệ thống (HT15): một trang bốn tab (PHASE-031 W4b, ADR-0031) <!-- [2026-11-09 03:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4b -->

- **Thêm:** màn *Hệ thống → Chính sách* (HT15, quyền `catalog:read`, `/he-thong/chinh-sach`) với bốn tab: *Chính sách* (các bản, hiệu lực, băm, chứng từ đã áp, khoảng trống), *Chờ kế toán xem* (hàng việc `policy_review` + nút *Đánh dấu đã xem*, ẩn khi thiếu `documents:write`), *Truy vết* (chứng từ → chính sách@bản, băm khớp / lệch, ngày ngoài hiệu lực), *Theo dõi thực hiện* (đạt chính sách, lệch theo mã, độ phủ, độ trễ phiên bản, dòng thời gian, sức khoẻ). Đường dẫn sâu `?xem=truy-vet&chung-tu=<docKey>` để màn khác mở thẳng chuỗi chính sách căn cứ.
- **Đổi:** không. Chỉ dùng API đã có (W2c, W4a); không API mới, không migration. Tỉ lệ `null` hiện "—".
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không.
- **Bảo mật:** màn chỉ đọc; nút *Đánh dấu đã xem* cần `documents:write` và đi qua action có bằng chứng (W2c).

### Dấu vết ở CSDL cho mọi thay đổi đầu bút toán, kể cả UPDATE viết thẳng (PHASE-004 S004-14, review R1 RV-R1-14) <!-- [2026-11-09 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-14 -->

- **Thêm:** migration `0089_vet_dau_but_toan.sql` — trigger `ledger_entries_header_audit` (`AFTER UPDATE`, chỉ chạy khi cột đổi) ghi một dòng `audit_logs` `ledger.entry.header_update` cho **mọi** thay đổi chín cột `doc_no`, `invoice_no`, `reason_code`, `partner_id`, `description`, `content_hash`, `event_version`, `partner_name`, `partner_attr_id` của bút toán, từ mọi đường kể cả `UPDATE` viết thẳng bằng `ketoan_app`. `before_data` / `after_data` chỉ gồm cột thật sự đổi; `after_data` thêm `_source = db`, `_txid`, `_role`, `_login`, `_app`, `_client`. Nhật ký mức ứng dụng của S004-13 thêm `_source = app` và cùng `_txid` để đối chiếu. Hằng `E2_DB_COLUMNS`; test `e2-db-audit.test.ts` (T004-DB-1…5, phá thử dưới `ketoan_app`: không tắt / gỡ trigger, không xoá / sửa nhật ký) và `e2-header-audit.test.ts` (T004-E2-3 buộc danh sách cột và trigger dấu vết khớp trigger bất biến).
- **Đổi:** nhật ký E2 mức ứng dụng nay mang `_source` và `_txid` trong `after`. Mỗi lần E2 qua ứng dụng có **hai** dòng cùng `_txid` (ứng dụng và CSDL).
- **Sửa:** trước đây `UPDATE ledger_entries SET event_version = NULL` (hay đổi `description`, `partner_id`…) bằng `ketoan_app` được trigger cho phép và không để lại dấu vết. Phát hiện kèm: `partner_name` và `partner_attr_id` (0087) ghi chú "không đổi về sau" nhưng trigger bất biến không ép nên đổi được; chưa đóng băng (chờ chủ S029-19, Q004-9), nay có dấu vết.
- **Thay đổi định khoản:** không (K3 thêm chặt; không đổi dữ liệu, không đổi hành vi ghi sổ).
- **Nâng cấp cần làm:** chạy `npm run db:migrate`. Mỗi lần định khoản lại đổi thông tin đầu sinh thêm một dòng `audit_logs` (sự kiện hiếm). Cảnh báo "sửa ngoài ứng dụng" và bảng theo dõi là S004-15 / S004-16 (chưa có).
- **Bảo mật:** đóng kẽ hở sửa đầu bút toán không để lại dấu vết. Giới hạn: chủ bảng / superuser vẫn tắt được trigger (chẩn đoán `LEDGER_TRIGGERS` phát hiện sau).

### API đọc chính sách: sổ đăng ký, theo dõi thực hiện, truy vết ngược (PHASE-031 W4a, ADR-0031) <!-- [2026-11-09 11:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W4a -->

- **Thêm:** bốn action đọc `catalog:read` — `GET /api/v1/policy-registry` (+ `/:policyId/applications`), `/policy-tracking`, `/policy-lineage` — đọc `policy_registry` và `bizcity_read.policy_application`; hợp đồng `bizcity_policy@1` 1.2.0-draft mục 11. Test `policy-insight.test.ts` (T031-INS-1..6).
- **Đổi:** không. Không migration, không bảng tổng hợp.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không.
- **Bảo mật:** chỉ đọc, lọc `tenant_id`; khoá API cần `catalog:read`.

### Cập nhật thông tin đầu bút toán (E2) có nhật ký trước / sau (PHASE-004 S004-13, review R1 RV-R1-14) <!-- [2026-11-08 05:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-13 -->

- **Thêm:** `posting.service.ts` ghi nhật ký `ledger.entry.header_update` mỗi khi định khoản lại chỉ đổi thông tin đầu của một bút toán đã ghi (đường E2): `before` / `after` chỉ gồm các cột **thật sự đổi** trong bảy cột `doc_no`, `invoice_no`, `reason_code`, `partner_id`, `description`, `content_hash`, `event_version`; `objectType = ledger_entry`, `objectId` = id bút toán. Hằng `E2_COLUMNS` dùng chung và test `e2-header-audit.test.ts` (T004-E2-1…3) so danh sách đó với trigger `guard_ledger_entry_mutation` trong CSDL.
- **Đổi:** không đổi hành vi ghi sổ, không đổi bút toán, không migration. Trong action nhật ký nằm ở `notes.audit[]` của bằng chứng (ACTION §4.4, phương án C); ngoài action là dòng `audit_logs`.
- **Sửa:** trước đây dấu vết duy nhất của E2 là một con số trong `posting_log` ("cập nhật thông tin đầu M"), không biết cột nào của bút toán nào đã đổi từ giá trị nào.
- **Thay đổi định khoản:** không (K1).
- **Nâng cấp cần làm:** không.
- **Bảo mật:** nhật ký chỉ phủ đường của ứng dụng (`posting.service`). Một câu `UPDATE ledger_entries` viết thẳng bằng vai trò `ketoan_app` vào bảy cột này vẫn được trigger cho phép và **không để lại nhật ký**; chặn hoặc kiểm bằng trigger là câu hỏi Q004-5 của chủ dự án.

### Thuộc tính có hiệu lực của đối tượng / chi nhánh / kho và tên đối tượng lúc ghi trên sổ cái (PHASE-029 S029-19 đợt 1) <!-- [2026-11-08 07:06 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — đợt 1 entity_attributes -->

- **Thêm:** migration `0087_thuoc_tinh_thuc_the.sql` — bảng `entity_attributes` (tên, MST, địa chỉ có `version` và hiệu lực; chỉ thêm; nguồn sự thật tại một ngày), trigger đồng bộ ở `partners` / `branches` / `warehouses` (cột trên bảng thực thể vẫn là ảnh chụp hiện hành), hàm `bizcity_entity_attr_at`. `ledger_entries` và `ledger_lines` thêm `partner_name` + `partner_attr_id`: trigger BEFORE INSERT điền tên đối tượng **theo ngày chứng từ** (chứng từ nhập muộn vẫn mang tên đúng tại ngày phát sinh) và bản thuộc tính đã dùng; bút toán đảo mang tên của bút toán gốc. `resolveEntity` trả thêm `attributes` (`attributeId`, `version`, `validFrom`, `validTo`). Golden T029-ECP-P001 và T029-EA-1..8.
- **Đổi:** không đổi báo cáo nào (đợt 2). Dòng sổ đã ghi giữ nguyên, hai cột mới để trống.
- **Sửa:** không.
- **Thay đổi định khoản:** không. Mức K3 (thêm cột + trigger trên `ledger_*`, một người duyệt): cột nullable chỉ thêm, trigger chỉ điền khi INSERT và khi cột rỗng, tên không vào dấu vân tay bút toán. Đường lui: bỏ hai trigger, hai cột mỗi bảng, rồi `DROP TABLE entity_attributes`.
- **Nâng cấp cần làm:** chạy migration 0087 (tự điền phiên bản 1 cho dữ liệu có sẵn, chạy lại an toàn).
- **Bảo mật:** `entity_attributes` có RLS cô lập theo đơn vị như `entity_codes`.

### Sự kiện chính sách qua outbox: `bizcity.policy.published` / `.retired` (PHASE-031 W3b, ADR-0031) <!-- [2026-11-08 11:59 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3b -->

- **Thêm:** `registerPolicyVersion` phát `bizcity.policy.published` và `retirePolicy` phát `bizcity.policy.retired` qua outbox, cùng giao dịch với việc ghi sổ đăng ký (`data` chỉ định danh + băm + `closes`, không nội dung; `dedupeKey` chống phát đôi). Hợp đồng: `bizcity_event@1` 1.3.0-draft §7, `bizcity_policy@1` 1.1.0-draft §10; test `policy-events.test.ts` (T031-EV-1..5). App ngoài nhận bằng webhook sẵn có (§7a).
- **Đổi:** `retirePolicy` thêm tham số `actor` tuỳ chọn (chữ ký cũ vẫn chạy; thiếu thì tác nhân `system`).
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không (không migration). POS / sàn muốn nghe sự kiện thì khai `events.subscribes` hai loại mới.
- **Bảo mật:** `data` không chứa nội dung chính sách; người nhận phải có quyền `catalog:read` để tải nội dung.

### Gỡ cờ thoát allow_ledger_purge khỏi trigger sổ cái, thu quyền xoá của ketoan_app (PHASE-004 S004-12, review R1 RV-R1-01) <!-- [2026-11-08 04:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 — S004-12 -->

- **Thêm:** migration `0086_go_co_thoat_so_cai.sql` — tạo lại chín trigger bảo vệ sổ (`ledger_entries`, `ledger_lines`, `ledger_links`, `accounting_events`, `accounting_event_versions`) **không còn mệnh đề `WHEN`** theo cờ `ketoan.allow_ledger_purge`; tên trigger và hàm trigger giữ nguyên; `REVOKE DELETE, TRUNCATE` khỏi `ketoan_app` trên sáu bảng sổ (kể cả `posting_log`); tự kiểm cuối dừng migration nếu còn trigger nhắc cờ. Ca phá thử: `app-role.test.ts` (quyền) và `db-rules.test.ts` (đặt cờ rồi DELETE / UPDATE / TRUNCATE đều bị từ chối). Chẩn đoán `LEDGER_TRIGGERS` (DG-DB-2) báo thêm trigger còn nhắc cờ (`cờ thoát:…`).
- **Đổi:** nhóm ngoại lệ E4 của RULE-LEDGER gỡ; SC-KERNEL-4 và `scripts/kiem-chuan.sh` chỉ cho tên cờ ở hai ca phá thử và chẩn đoán. Test cần dọn dòng thử dùng đường của E3 (`SET LOCAL session_replication_role = replica`). `lich-su-chung-tu.test.ts` bỏ ba lần đặt cờ vì `event_version` nằm trong bảy cột E2, đổi được không cần vượt trigger.
- **Sửa:** trước đây cờ là biến của phiên: phiên nào cũng `set_config` được rồi xoá / sửa sổ, và `ketoan_app` có `DELETE` trên các bảng này (0032). Cờ chỉ test dùng.
- **Thay đổi định khoản:** không (K3 **thêm chặt** nên minor; không đổi dữ liệu, không đổi bút toán).
- **Nâng cấp cần làm:** chạy `npm run db:migrate`. Script hay SQL tự viết dùng cờ `allow_ledger_purge` để dọn sổ sẽ không còn hiệu lực: dùng đường E3 (`scripts/xoa-chung-tu.sh`, superuser, có sao lưu). TRUNCATE chưa từng được cấp cho `ketoan_app`; thu thêm cho chắc. Bản cài chưa chạy API bằng `ketoan_app` (PHASE-001 mục 0.7) thì chỉ lớp trigger có tác dụng; chủ bảng / superuser vẫn tắt được trigger (`DISABLE TRIGGER`) — chẩn đoán `LEDGER_TRIGGERS` phát hiện sau đó.
- **Bảo mật:** đóng cửa sau cho phép bất kỳ phiên nào xoá hoặc sửa bút toán chỉ bằng một câu `set_config`.

### SC-PILLAR-1: tiêu chí "đạt" của bảng trụ cột phải có bằng chứng có thật (PHASE-026 S026-15 đợt 1) <!-- [2026-11-08 04:43 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-15 -->

- **Thêm:** bộ kiểm **SC-PILLAR-1** (chặn, `tests/conformance/checks/pillar/`): mỗi tiêu chí `status: "dat"` ở `docs/standard/tru-cot.json` phải dẫn tới ít nhất một thứ có thật trong repo (migration, test, mã check, tuyến API, đường dẫn, tên tệp, định danh trong mã) và không dẫn tới thứ đã mất. Tiêu chí có mã check có thật ghi `source = check`, còn lại `manual` (đếm ở ghi chú). Ca mẫu `repo-bad/docs/standard/tru-cot.json`. Dòng SC-PILLAR-1 ở `RULE-QUALITY-GATE`.
- **Đổi:** không. Trên dữ liệu thật 0 phát hiện (27 tiêu chí đạt: 2 `source = check`, 25 `manual`), không thêm nợ baseline.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không.
- **Bảo mật:** không.

### Hàng việc "Chờ kế toán xem" và nút Đánh dấu đã xem (PHASE-031 W2c, ADR-0031) <!-- [2026-11-08 10:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2c -->

- **Thêm:** migration `0084_xem_lai_chinh_sach`: bảng `policy_review_acks` (bằng chứng đã xem, chỉ thêm, RLS) và nhánh `policy_review` của `bizcity_read.document_queue` — sự việc đã ghi sổ có phát hiện chính sách (IN-POL-*) mà bản kiểm hiện hành chưa ai xem, cờ `policy`, nhóm `pending`. Action `core.queue.policy-review.ack` (`POST /api/v1/queue/policy-review/:eventId/ack`, quyền `documents:write`, `Idempotency-Key`) ghi một dòng bằng chứng; gọi lặp trả kết quả cũ; bản kiểm mới (`checkedAt` đổi) mở lại việc. Test `policy-review.test.ts` (T031-Q-1..5).
- **Đổi:** `QUEUE_SOURCES` thêm `policy_review`, `QUEUE_FLAGS` thêm `policy`; `core.queue.mine` thêm phần `policy` cho người có quyền ghi chứng từ; `core.queue.summary` đếm `policy` theo từng nguồn (`bySource[].policy`), `byFlag` giữ ba khoá cũ.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** chạy `npm run db:migrate`. Sự việc cũ có `policy_check` mang phát hiện sẽ hiện ở hàng việc cho tới khi được đánh dấu đã xem.
- **Bảo mật:** hành động ghi cần `documents:write`; bảng bằng chứng có RLS theo đơn vị và trigger chặn sửa / xoá.

### Xem trước tác động cấu hình nhận scopeId số (PHASE-030, review R1 RV-R1-05) <!-- [2026-11-08 04:07 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — RV-R1-05 -->

- **Thêm:** ca hồi quy T030-CFG-IMP-4 (`apps/api/test/cau-hinh-doi-khoa-a.test.ts`): phạm vi `branch` / `user` với `scopeId` là số được xem trước (200); `scopeId` không phải số vẫn 400.
- **Sửa:** `settingImpact` kiểm `scopeId` bằng `/^d+$/` (thiếu dấu gạch chéo ngược trước chữ d), nên `GET /api/v1/settings/values/:key/impact?scope=branch&scopeId=12` luôn trả 400 "cần scopeId là định danh số". Hàm ghi `setSetting` đã dùng đúng mẫu số; chỉ phần xem trước bị lỗi.
- **Đổi:** không.
- **Thay đổi định khoản:** không (K0, một dòng, không đổi dữ liệu).
- **Nâng cấp cần làm:** không.
- **Bảo mật:** không.

### Mã có phiên bản cho đối tượng / chi nhánh / kho: entity_codes và resolveEntity (PHASE-026 S026-4 đợt 1) <!-- [2026-11-08 04:07 PM Johnny Chu - Chu Hoàng Anh] PHASE-026 — đợt 1 entity_codes -->

- **Thêm:** migration `0085_ma_thuc_the.sql` — bảng `entity_codes` (mã có phiên bản cho partner / branch / warehouse): chỉ thêm, đổi mã = đóng `valid_to` + thêm mã mới, chặn chồng hiệu lực, RLS theo đơn vị. Trigger giữ cột `code` của `partners` / `branches` / `warehouses` khớp ở mọi đường ghi; điền ban đầu từ cột `code` hiện có. `resolveEntity` / `resolveEntities` (mã chính, bí danh, mã ngoài, tra theo ngày), kiểu `EntityRef` / `EntityResolveResult` ở `@ketoan/contracts`. Golden T026-EC-1..9.
- **Đổi:** `id` và `tenant_id` của đối tượng / chi nhánh / kho không đổi được (guard ở CSDL). Xoá thực thể vẫn được, chỉ đóng mã. Kiểu Kysely `LedgerEntriesTable.event_id` thành `string` (S030-41b).
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** chạy migration 0085 (tự điền mã cho dữ liệu có sẵn, chạy lại an toàn). Đợt này chưa có đơn vị tính, lý do.
- **Bảo mật:** `entity_codes` có RLS cô lập theo đơn vị như `item_codes`.

### Lỗi trigger sổ cái ra đúng mã hợp đồng: không cân, khoá kỳ, sổ chỉ thêm (PHASE-029 S029-33, review R1 RV-R1-02) <!-- [2026-11-08 02:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-029 — S029-33 -->

- **Thêm:** `classifyLedgerTriggerError` (`packages/platform/src/core/errors.ts`) — một nơi nhận ra lỗi trigger sổ cái theo SQLSTATE + câu chữ; `core/http.ts` và `errorCodeOf` (trace) cùng gọi. Golden T029-ERR-1…5 (`apps/api/test/db-error-mapping.test.ts`) dùng lỗi sinh từ trigger thật trên PostgreSQL.
- **Đổi:** theo [BIZCITY-ERRORS-v1](docs/contracts/BIZCITY-ERRORS-v1.md) 1.3.0-draft §5: `23514` + "không cân" → `UNBALANCED_ENTRY` (422); `23514` + `PERIOD_LOCKED:` → `PERIOD_LOCKED` (**409**); `42501` + "chỉ được thêm" → `CONFLICT` (**409**) + `details.reason = LEDGER_APPEND_ONLY`. CHECK / quyền khác vẫn `POSTING_FAILED` (422).
- **Sửa:** trước đây mọi lỗi cân, khoá kỳ và sửa sổ ở tầng CSDL đều ra `POSTING_FAILED` vì trigger ném `23514` / `42501` chứ không phải `P0001` như bảng §5 cũ giả định; bên gọi rẽ nhánh theo `code` không phân biệt được ba trường hợp này.
- **Thay đổi định khoản:** không (K0 cho mã; không đổi migration, không đổi bút toán).
- **Nâng cấp cần làm:** bên tích hợp đang rẽ nhánh theo `POSTING_FAILED` cho lỗi khoá kỳ / sửa sổ cần xử lý thêm `PERIOD_LOCKED` và `CONFLICT` + `LEDGER_APPEND_ONLY` (HTTP 422 → 409). Chưa có tag phát hành nào dùng hành vi cũ.

### Sửa trùng số migration 0080: gói K3 đổi sang 0081 / 0082 (PHASE-029) <!-- [2026-11-08 11:33 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — sửa trùng số 0080 -->

- **Sửa:** PHASE-031 W2a (#159) và gói K3 (#165) cùng merge với số 0080, `main` đỏ `SC-DATA-1`. K3 merge sau nên đổi: `0080_nguoi_tao_su_viec_bat_buoc.sql` → `0081_…`, `0081_khoa_ky_o_csdl.sql` → `0082_…`. `0080_kiem_chinh_sach_su_viec.sql` (W2a) giữ nguyên.
- **Đổi:** `RENAMED` ở `migrate.ts` thêm hai cặp tên: bản cài đã áp tên cũ chỉ ghi nhận tên mới, **không chạy lại** (chạy lại sẽ lỗi vì hàm và trigger đã có). Nội dung hai migration không đổi.
- **Thêm:** hai ca ở `migrate-rename.test.ts` (đã áp tên cũ thì không chạy lại; thư mục không còn số trùng).
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** chạy `npm run db:migrate` như thường. Bản cài đã kéo `main` trong khoảng 2026-11-08 và đã áp tên cũ sẽ tự ghi nhận tên mới.
- **Bảo mật:** không.

### Bộ review theo nhịp và bản đồ phase → phiên bản (docs/reviews/, R1 nền móng) <!-- [2026-11-08 12:40 PM Johnny Chu - Chu Hoàng Anh] REVIEW — R1 -->

- **Thêm:** thư mục `docs/reviews/` — tiêu chí 12 trục (thang 0–4, trục cổng A2 · A7 · A12), bảng điểm matrix, bản đồ 31 phase vào sáu phiên bản v0.1.0 → v1.0.0 (đề xuất), bản máy đọc `review-board.json`; biên bản R1 (`main` @ 886f4f95): **ĐẠT có điều kiện 27/48**, 18 phát hiện RV-R1-01…18, trong đó 3 chặn (cờ thoát `allow_ledger_purge` tự bật được; SQLSTATE của trigger bị gộp thành `POSTING_FAILED`; trùng số migration 0080). Nhịp: 3 phase mở mới ⇒ 1 review, trước khi đóng phiên bản.
- **Đổi:** `docs/README.md`, `docs/phases/README.md` trỏ tới `docs/reviews/`.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không (chỉ tài liệu).
- **Bảo mật:** biên bản R1 ghi nhận RV-R1-01 (vai trò ứng dụng có `DELETE` trên `ledger_*` và cờ thoát trigger là biến phiên) là việc chặn trước khi đóng v0.1.0 — chưa sửa trong PR này.

### API chính sách cho nguồn ngoài: lấy, tính, phát hành inline (PHASE-031 W3a, ADR-0031) <!-- [2026-11-08 04:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W3a -->

- **Thêm:** hợp đồng [`bizcity_policy@1`](docs/contracts/BIZCITY-POLICY-v1.md) — `GET /api/v1/policies` (bản đang hiệu lực tại `at`, lọc `domain` / `branch` / `channel`, có `etag`), `GET /api/v1/rule-contracts[/:id]` (tham số, `spec` để plugin viết lại, `vectors` để tự kiểm), `POST /api/v1/policies/evaluate` (tính theo chính sách, trả `applied` / `skipped` kèm lý do / `gifts` / `policyRefs`), `POST /api/v1/policies` (phát hành bản inline). Rule Contract đầu tiên `sale.promo.buy_x_get_y@1` (mua X tặng Y; `itemId`, `repeat`, `maxGiftQty`, dung sai số lẻ). `core/policies.ts`: `listPublishedPolicies`, `publishInlinePolicy`, `inlinePolicyId`.
- **Đổi:** không.
- **Sửa:** không.
- **Thay đổi định khoản:** không. Quyền đọc và tính là `catalog:read` (khoá `documents:write`, `reports:read`, `catalog:write` đều có); **không thêm scope**. Chưa kiểm trần pháp lý hàng khuyến mại (NĐ81); nhiều chính sách áp độc lập, cộng dồn.

### Cửa nạp nhận tham chiếu chính sách (PHASE-031 W2a, ADR-0031) <!-- [2026-11-08 04:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W2a (mục CHANGELOG còn thiếu khi merge #159) -->

- **Thêm:** `policyRefs[]` ở phiếu và `lines[].policyRef` ở dòng hàng (`bizcity_ledger_intake@1` 1.6.0, tuỳ chọn, lưu nguyên văn trong `payload`); `IN-POL-001..003` (L4, cảnh báo, chấp nhận được); `policy_check` ở `accounting_events` / `accounting_event_versions`; khung nhìn `bizcity_read.policy_application`; khoá `bizcity.intake.policy_check` (`advice` mặc định | `strict` → chờ duyệt bằng `hold` sẵn có); Commit Guard băm phong bì chính sách được trỏ tới; phiếu mua hàng nộp kèm `policyRefs` từ `policyTrace`.
- **Đổi:** không.
- **Sửa:** không.
- **Thay đổi định khoản:** không.

### Gói K3 đợt 1: người tạo sự việc bắt buộc, khoá kỳ ở CSDL (PHASE-029 S029-17, PHASE-030 S030-42 / D030-16) <!-- [2026-11-08 10:31 AM Johnny Chu - Chu Hoàng Anh] PHASE-029 — gói K3 đợt 1 -->

- **Thêm:** migration `0082_khoa_ky_o_csdl.sql` — trigger `ledger_entries_period_lock` (BEFORE INSERT) chặn bút toán vào kỳ đã khoá kể cả khi bỏ qua ứng dụng, cùng điều kiện `periodRepository.isLocked`; câu lỗi `PERIOD_LOCKED: kỳ MM/YYYY đã khoá…`. Golden T029-K3-1..5.
- **Đổi:** migration `0081_nguoi_tao_su_viec_bat_buoc.sql` — `accounting_events.created_by` NOT NULL và không rỗng. `eventStore.saveVersion` (khấu hao, giá vốn, khoá sổ…) ghi `auth.actor` khi không truyền người tạo.
- **Sửa:** sự việc do Kernel tự lập không còn rỗng người tạo (trước: 1.484 / 68.923 dòng trên `ketoan_test`, toàn bộ khấu hao và giá vốn).
- **Thay đổi định khoản:** không. Không đổi bút toán nào.
- **Nâng cấp cần làm:** chạy migration 0081, 0082. 0081 điền dòng rỗng bằng `system:<doc_type>`; gặp người tạo là chuỗi trắng thì **dừng** bằng câu tiếng Việt, không tự sửa — xem và ghi đúng người tạo rồi chạy lại. Đường lui: `DROP NOT NULL` + bỏ ràng buộc (0081), `DROP TRIGGER` (0082).
- **Bảo mật:** 0081 tắt riêng trigger `accounting_events_no_delete` trong chính giao dịch migration (khoá độc quyền bảng) chỉ để điền dòng rỗng; người lập đã có giá trị vẫn không đổi được.

### Không còn mật khẩu viết sẵn trong mã: SC-SEC-5, mật khẩu công cụ, mật khẩu quản trị ban đầu (PHASE-027, CK-3 + Q027-5) <!-- [2026-11-07 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-027 — CK-3 -->

- **Thêm:** bộ kiểm **SC-SEC-5** (chặn) — biến bí mật (`PASSWORD`, `SECRET`, `TOKEN`, `API_KEY`, `PRIVATE_KEY`) có giá trị mặc định viết trong mã các lớp (`process.env.X || "…"`, `?? "…"`); không in giá trị, chỉ tên biến và độ dài. `core/security/tool-password.ts` (`checkToolPassword`, so sánh thời gian hằng). Golden T027-SEC-1..4.
- **Đổi:** công cụ dữ liệu mẫu (nạp / xoá dữ liệu tình huống mua hàng, quét cha – con cả danh mục) đọc mật khẩu từ `PURCHASE_SEED_PASSWORD`, **không còn mặc định trong mã**: chưa đặt biến thì công cụ tắt và báo cách bật. `npm run db:seed` khi bỏ trống `SEED_ADMIN_PASSWORD` tự sinh mật khẩu quản trị 16 ký tự và in một lần (trước: mặc định `Admin@123`).
- **Sửa:** gỡ mục nợ SC-CON-7 `PURCHASE_SEED_PASSWORD` đã hết khỏi `baseline.json` (biến nay khai ở [DEPLOY D-10](docs/ops/DEPLOY.md)).
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** cài bằng docker / `scripts/cai-nhanh.sh` không đổi (`.env` vẫn đặt `SEED_ADMIN_PASSWORD`). Muốn dùng công cụ dữ liệu mẫu thì đặt `PURCHASE_SEED_PASSWORD` trong `.env` rồi khởi động lại API; bản thật nên để trống ([DEPLOY D-10](docs/ops/DEPLOY.md)).
- **Bảo mật:** hai mật khẩu đã công bố trong git (`Admin@123`, mật khẩu công cụ cũ) không còn mở được gì nếu chưa đặt biến; bản cài đang dùng mật khẩu công cụ cũ nên đặt `PURCHASE_SEED_PASSWORD` mới.

### Sổ đăng ký chính sách và phiên bản chính sách mua hàng (PHASE-031 W1, ADR-0031) <!-- [2026-11-07 10:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — W1 -->

- **Thêm:** migration `0079_so_dang_ky_chinh_sach.sql` — bảng `policy_registry` (phong bì từng bản chính sách: khoá, bản, phạm vi, hiệu lực của bản theo ngày chứng từ, băm, Rule Contract, người phát hành; bản đã phát hành không sửa, chỉ ngừng hoặc đóng hiệu lực một lần) và `purchase_policy_versions` (chỉ thêm); mỗi chính sách mua hàng đang có được nạp ngược thành bản 1. `packages/platform/src/core/policies.ts`: `registerPolicyVersion`, `resolvePolicy`, `listPolicyVersions`, `retirePolicy`. Route `GET /api/v1/purchase/policies/:id/versions`. Form chính sách có ô *áp cho chứng từ từ ngày*, *lý do đổi*, khối *Phiên bản*.
- **Đổi:** lưu chính sách mua hàng mà nội dung đổi → bản mới (áp lùi về trước hôm nay cần lý do). Engine chọn bản theo **ngày chứng từ** (`policyAt` trong `policiesFor`): phiếu ngày cũ tính lại ra số cũ. Vết chính sách trên phiếu (`policyTrace`) ghi thêm `version`, `hash`. Xoá chính sách chưa áp → các bản chuyển `retired` ở sổ đăng ký.
- **Sửa:** không.
- **Thay đổi định khoản:** không.

### Căn cứ của khoá cấu hình: setting_values.basis, basis / usedBy ở registry (PHASE-030, S030-43) <!-- [2026-11-06 04:35 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-43 -->

- **Thêm:** migration `0078_setting_values_can_cu.sql` — cột `setting_values.basis` (căn cứ của một phiên bản: văn bản, điều, khoản, điểm, đường dẫn, ngày hiệu lực). `core.settings.set` nhận `basis?` (khuôn kiểm, không bắt buộc kể cả khoá loại A — D030-12); lịch sử phiên bản trả căn cứ. Registry `bizcity_settings@1` 1.2.0-draft: `basis` (căn cứ mặc định của khoá) và `usedBy` (nơi đọc khoá). `GET /api/v1/settings/overview` trả `basis`, `basisFrom`, `usedBy`; màn HT13 hiện thẻ Căn cứ và nơi dùng. Golden T030-CFG-BASIS-1..6. Chữ chốt `docs/contracts/BIZCITY-SETTINGS-MATRIX-v1.md` 1.2.0-draft.
- **Đổi:** `getSetting` trả thêm `basis` (căn cứ của phiên bản đang áp), kể cả khoá còn đường lưu cũ ở `tenants.settings`. 10 khoá loại A có căn cứ mặc định là quy tắc nội bộ kiểm được trong repo (không phải điều luật).
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** chạy migration 0078 (chỉ thêm cột, không đổi dòng nào). Căn cứ pháp lý (luật, thông tư) chưa điền: chờ kế toán trưởng xác nhận (S030-12 / S030-35).
- **Bảo mật:** `url` trong căn cứ chỉ nhận `https://`; trường lạ bị từ chối; không đổi quyền ghi (`settings:write`).

### Mọi bút toán có chứng từ gốc: event_id bắt buộc ở CSDL (PHASE-030, S030-41) <!-- [2026-11-06 03:25 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-41 -->

- **Thêm:** migration `0077_event_id_but_toan_bat_buoc.sql` — `ledger_entries.event_id` NOT NULL (R-LEDGER-12, chữ chốt `docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/25-BUT-TOAN-LUON-CO-CHUNG-TU.md`). Golden T030-EVT-1..5, trong đó EVT-5 chạy migration trên CSDL tạm có sẵn dòng rỗng.
- **Đổi:** `DraftEntry.sourceDocumentId` bắt buộc (không còn `?` / `null`); `ledgerService.post()` từ chối ngay đầu hàm khi thiếu chứng từ gốc (`POSTING_FAILED`); `reverse()` không đảo bút toán có `event_id` rỗng.
- **Sửa:** không.
- **Thay đổi định khoản:** không đổi luật định khoản. Mọi đường ghi sổ hiện có đã truyền chứng từ gốc nên không đổi hành vi.
- **Nâng cấp cần làm:** chạy migration 0077. Nếu bản cài có bút toán rỗng `event_id`, migration **dừng** với câu tiếng Việt nêu số dòng và số bút toán đầu, không tự sửa sổ: báo nhóm Lõi (PHASE-030 · 25 §2 D030-15b). Chưa gặp bản cài nào như vậy (0 / 89.547 và 0 / 123 ở hai CSDL test).
- **Bảo mật:** không.

### Màn Cấu hình hệ thống (HT13) bản chỉ đọc (PHASE-030, S030-39) <!-- [2026-11-06 02:41 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-39 -->

- **Thêm:** `GET /api/v1/settings/overview` — mọi khoá registry `bizcity_settings@1`: nhóm, lớp A / B / C, phạm vi, nơi lưu, giá trị hiện hành (chỉ khoá có phiên bản và không phải bí mật), số phiên bản, thay đổi gần nhất, bản sắp hiệu lực, căn cứ, sức khoẻ cấu hình (thiếu căn cứ, đổi 30 ngày, sắp hiệu lực, ngày chưa niêm phong). Màn web **Hệ thống → Cấu hình hệ thống (HT13)**, hướng dẫn `docs/huong-dan/cau-hinh-he-thong.md`. Golden T030-CFG-VIEW-1..6. Chữ chốt `docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/24-CAU-HINH-HE-THONG.md`.
- **Đổi:** không.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** không (không migration). Hôm nay mọi khoá hiện "thiếu căn cứ" vì registry chưa có trường căn cứ (S030-38).
- **Bảo mật:** chỉ đọc; không bao giờ trả giá trị của khoá bí mật hoặc khoá chưa có phiên bản (D030-13); mọi truy vấn lọc theo đơn vị.

### Hàng việc: đếm chứng từ theo trạng thái và thanh "Việc cần làm" (PHASE-030, S030-31) <!-- [2026-11-06 08:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-31 -->

- **Thêm:** view chỉ đọc `bizcity_read.document_queue` (migration 0076) gộp `payment_requests`, `purchase_documents`, `accounting_events`, `intake_inbox` về năm nhóm trạng thái chuẩn + cờ; ba action `core.queue.summary`, `core.queue.items`, `core.queue.mine` (quyền `documents:read`). Chữ chốt `docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/23-HANG-VIEC.md`.
- **Đổi:** thanh "Việc cần làm" lấy thêm nguồn `/api/v1/queue/mine`; bỏ dòng "chứng từ lỗi" lấy từ dashboard vì trùng với hàng việc.
- **Sửa:** không.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** chạy migration 0076 (chỉ tạo view, không đụng dữ liệu).
- **Bảo mật:** view `security_invoker`, chặn ghi bằng trigger; mọi truy vấn lọc `tenant_id`.

### Thư viện tiền: làm tròn nửa xa số 0, chia dư lớn nhất, lịch đều (PHASE-030, S030-19) <!-- [2026-11-06 07:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-19 -->

- **Thêm:** `roundMoney`, `allocate`, `schedule` ở `@ketoan/contracts`, xuất lại ở `@bizcity/module-sdk` (R-MONEY-1..6, `docs/phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/18-THU-VIEN-TIEN.md`). Phép kiểm `SC-STD-5`: tự viết hàm chia tiền hoặc làm tròn tiền bằng `Math.round` trong `modules/**`. Golden `T030-CORE-6`.
- **Đổi:** `allocate` của phân hệ Mua hàng là lớp bọc mỏng quanh bản chung (giữ tên, chữ ký và quy ước "không có cơ sở phân bổ thì không chia"); gói `@bizcity/mua-hang-domain` khai phụ thuộc `@ketoan/contracts`. `splitByDays`, `splitByPercent` của Tài sản chia bằng `allocate` (dư lớn nhất, bước 100 xu). `roundDong` đánh dấu `@deprecated`, giữ hành vi.
- **Sửa:** chia số trích khấu hao theo tỷ lệ phần trăm có thể ra phần âm hoặc mất trắng một phần (vd 200 xu theo 30/30/30/10 % ra 100/100/100/−100); nay Σ = tổng, không phần nào âm.
- **Thay đổi định khoản:** không đổi luật định khoản. Số trích khấu hao chia theo tỷ lệ phần trăm có thể khác ở các ca làm tròn từng phần từng sai; chứng từ đã ghi giữ nguyên (R-POST-8).
- **Nâng cấp cần làm:** `npm run build -w @ketoan/contracts` trước khi build gói mua hàng. Chưa có migration.
- **Bảo mật:** không.

### Xương cá: định danh xuyên suốt (PHASE-026, S024-11, S026-19..23) <!-- [2026-11-05 02:40 PM Nguyễn Văn Thủy] PHASE-026 (đóng góp) -->

- **Thêm:** `item_id` trên `products` và dòng JSON phiếu mua, đề nghị chuyển hàng, đăng ký tồn max; cửa nạp nhận `itemId`; `core.item.retire-code`, `classify`, `upsert`; `bizcity_read.items`, `item_codes`; tài liệu nghiệp vụ mục 10, mục Định danh ở TI10. Đổi mã, thêm mã (mã vạch, bí danh, `external:<nguồn>`), xem trước gộp, gộp mã nhiều lần; đọc mặt hàng theo định danh cho hệ ngoài; thẻ Lịch sử, nút Đổi mã, Gộp mã trên form mặt hàng; `item_id` trên giá NCC, bí danh NCC, dòng hoá đơn NCC, tồn max, cài đặt theo mã, dòng hoá đơn thuế; khung nhìn `inventory_movements_cur`.
- **Đổi:** bảng cấu hình tự theo mã mới khi đổi mã. Báo cáo mua hàng, kho, bán hàng theo mặt hàng gom một dòng theo mã hiện hành. Mã của hàng còn sống hoặc đã gộp không dùng lại được; mã cũ gửi vào cửa nạp vẫn ghi đúng mặt hàng, không tạo mặt hàng mới.
- **Sửa:** sổ chi tiết, sổ nhật ký, sổ bán hàng, đối chiếu kho, đọc sổ của Kernel lọc bằng mã mới mất phần ghi dưới mã cũ. Thẻ Lịch sử không đọc được thao tác ghi trong action. Tìm mặt hàng và lọc theo nhóm quét toàn bảng; DM10 tải cả danh mục về trình duyệt. Đổi mã làm đứt giá NCC, ĐVT, tồn max theo mã cũ. Lãi gộp tra giá vốn theo định danh nên mã cũ vẫn ra đơn giá.
- **Thêm (giao diện):** màn Khối ảnh HT11: thay ảnh theo khối, riêng máy tính và điện thoại, chưa cài thì dùng ảnh mặc định.
- **Đổi (giao diện):** Tổng quan thành bảng điều hành: truy cập nhanh, tình hình tài chính lấy từ báo cáo, banner, lịch công việc; thanh trên có mục cố định Tổng quan, Báo cáo.
- **Thêm (giao diện):** thanh mép phải gồm Việc cần làm, Trợ lý, Thông báo; nội dung đổi theo nhóm đang làm; bỏ hỏi đáp và dữ liệu huấn luyện ở Trợ lý.
- **Đổi (giao diện):** trang chủ nhóm dạng sơ đồ ít chữ, Tổng quan chỉ còn biểu tượng và tên, mô tả dưới tiêu đề thành chú thích rê chuột.
- **Đổi (giao diện):** menu trái gọn theo nhóm việc, bấm mới bung danh sách màn; thẻ màn chính của nhóm ở đầu trang; trang Báo cáo chung `/bao-cao`. Màn, mã, quyền, ghim, tìm Ctrl + K giữ nguyên.
- **Thêm (đọc nghiệp vụ):** trang Hiểu hàng hoá và giá vốn MH28 ở mục Nghiệp vụ IT (riêng), tài liệu `docs/nghiep-vu/11-hang-hoa-gia-von-tu-goc.md`.
- **Thêm (công thức giá vốn):** màn Công thức giá vốn ACC49A, `GET /api/v1/inventory/costing/formula`.
- **Đổi (giá vốn):** công thức theo `BOOK_MODE`. Bản nội bộ lấy thành tiền − thuế cho mọi lý do trả nhà cung cấp; bản thuế định giá XTR1, XTR9 theo tồn đầu.
- **Thêm (tên lúc ghi):** dòng sổ cái lưu `product_name`. Báo cáo theo dòng hiện tên lúc ghi, báo cáo gom theo mặt hàng hiện tên hiện tại. Dòng đã ghi giữ nguyên.
- **Thay đổi định khoản:** không.
- **Nâng cấp cần làm:** chạy migration 0067–0072. Bản nội bộ có phiếu trả XTR1 thì tính lại giá vốn các tháng chưa khoá để áp công thức mới. CSDL cần có sẵn gói `pg_trgm` (ảnh `postgres:16-alpine` đã có). `meta.total` của `GET /api/v1/products` đếm tới 100.001 thì dừng. Thử trên 42.016 mặt hàng hết khoảng 23 giây; số đo 21 triệu dòng ở `docs/core/06-xuong-ca-dinh-danh.md`.
- **Bảo mật:** không đổi. `inventory_movements_cur` dùng `security_invoker`, giữ cô lập đơn vị.

### Đổi
<!-- [2026-11-03 11:45 PM Johnny Chu - Chu Hoàng Anh] ADR-0024 -->
- **Yêu cầu kiến trúc: phân hệ nghiệp vụ nằm ở `modules/<key>/`, `phan-he/` đóng băng** (chủ dự án, [ADR-0024](docs/adr/ADR-0024-phan-he-nam-o-modules-phan-he-dong-bang.md)): không thêm phân hệ mới vào `apps/*/src/phan-he/`; phân hệ cũ sửa lỗi tại chỗ và chuyển sang chuẩn module theo 6 đợt (đề xuất: `quy`, `tai-san`/`kho`/`ban-hang`, `thue`, `ke-toan`, `mua-hang`, giao diện lõi). Mỗi đợt giữ chỗ và chốt thiết kế trước khi code (R-FLOW). `AGENTS.md`, `CONTRIBUTING.md`, `docs/framework/03-MO-RONG.md` sửa cho khớp; hướng dẫn và lời nhắn riêng cho người đóng góp ở [docs/standard/CHUYEN-PHAN-HE-SANG-MODULES.md](docs/standard/CHUYEN-PHAN-HE-SANG-MODULES.md). Chưa đổi mã: việc chuyển và phép kiểm SC-MOD-4 làm theo từng đợt.

### Thêm
<!-- [2026-11-04 05:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — P0 đợt 4 -->
- **Golden Tests đổi mã** (PHASE-026 S026-2, [ca chứng minh](docs/phases/PHASE-026-MASTER-DATA-GOVERNANCE/00-MASTER-PLAN.md)): hai ca kế toán chạy qua API thật — **trả hàng sau khi đổi mã** (hoàn đúng đơn giá của lần bán gốc, giá vốn thuần đúng, hành trình một định danh) và **chuyển kho giữa hai nhóm tính giá khi mã đổi ở giữa** (nhóm nhận định giá theo nhóm gửi, hàng đang chuyển / phải thu nội bộ về 0, mọi dòng sổ cùng định danh). Cùng ca đổi nhóm hạch toán từ ngày D, đây là bộ ca bảo vệ "đổi mã, đổi nhóm không phá giá vốn và sổ cái".
<!-- [2026-11-04 01:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 W6 đợt 8b -->
- **Nhật ký nghiệp vụ trong action vào bằng chứng** (PHASE-014 W6 đợt 8b, ACTION 1.3.0 §4.4): `writeAudit` gọi trong action ghi vào `changes.notes.audit[]` của bằng chứng thay vì chèn dòng `audit_logs` thứ hai, trừ ba tên trong `AUDIT_KEEP` (`costing.fill`, `*.update` của chứng từ nguồn, `settings.item-auto-create`); ghi chú của mục lô bị huỷ bỏ theo mục, lớn hơn 64 KB thì lược; phép kiểm SC-AUDIT-1 chặn chỗ đọc `audit_logs` theo tên ngoài sổ.
<!-- [2026-11-03 11:20 PM Johnny Chu - Chu Hoàng Anh] DANH-GIA -->
- **Bản đánh giá mức đáp ứng của code so với tài liệu `main`** ([docs/audits/DANH-GIA-DAP-UNG-2026-11-03.md](docs/audits/DANH-GIA-DAP-UNG-2026-11-03.md)): bảng điểm tĩnh, test sản phẩm (1205 đạt, 0 hỏng), nạp 25 trường hợp mua hàng và đối chiếu sổ (116/119 và 113/119, Nợ = Có = 4.774.840.842), mức đáp ứng theo 14 nhóm tài liệu, lộ trình, checklist 27 phase, độ phủ luật (42/100), nợ cũ, độ lệch tài liệu ↔ code và việc mở theo ưu tiên.

### Sửa
<!-- [2026-11-03 11:20 PM Johnny Chu - Chu Hoàng Anh] DANH-GIA -->
- **Đồng bộ PHASE-013 với mã**: checklist S013-1 (`@bizcity/ui-kit` và slot) ✅, S013-2 giữ 🟡; dòng PHASE-013 ở bảng lộ trình cập nhật trạng thái.

### Đổi
<!-- [2026-11-03 11:58 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — chốt phương án C nhật ký trong action -->
- **Chốt thiết kế nhật ký nghiệp vụ trong action** (chủ dự án đồng ý, `bizcity_action` 1.3.0-draft, `bizcity_evidence` 1.1.0-draft): `writeAudit` chạy trong action không chèn dòng `audit_logs` thứ hai mà ghi vào `changes.notes.audit[]` của bằng chứng, trừ sổ `AUDIT_KEEP` (ba tên có chỗ đọc: `costing.fill`, `<loại>.update` của chứng từ, `settings.item-auto-create`); phép kiểm SC-AUDIT-1. Chưa đổi mã — làm ở đợt 8b sau đợt 8a.
<!-- [2026-11-03 10:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — chốt thiết kế hợp đồng ACTION 1.2.0 -->
- **Hợp đồng `bizcity_action` 1.2.0-draft** (chốt trước khi chuẩn hoá mã, R-FLOW-2): `ctx.meta(key, value)` — dạng hàm, khoá của runtime bị cấm, chạy thử giữ meta, gửi lặp không phát lại meta; action theo lô `ctx.data.item`; che bí mật và lược `input` lớn trong bằng chứng; `expose.http.query` / `bodyLimit` và thân tuỳ chọn. Mục §4.4 (nhật ký nghiệp vụ trong action, phương án C) là **đề xuất chờ chốt** — không đổi mã `writeAudit` cho tới khi được chốt.
<!-- [2026-11-03 04:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 -->
- **Ghi danh mục chi nhánh, kho, tên đơn vị tính, tài khoản ngân hàng đi qua action** (PHASE-014 W6 đợt 3, SC-ACT-1): cùng đường dẫn, quyền, mã trả về như cũ (201 khi thêm); `Idempotency-Key` không bắt buộc (thao tác đặt trạng thái tuyệt đối, gửi lại không tạo thêm). Khác biệt người dùng thấy: nhật ký bằng chứng ghi tên hành động mới `core.branch.*`, `core.warehouse.*`, `core.unit-name.*`, `core.bank-account.*` thay cho `branch.create`… và có biên nhận `meta.receipt`; kiểm và ghi nằm trong một giao dịch với bằng chứng. Hàm `branchService.create`… cũ giữ nguyên cho nơi khác gọi. SC-ACT-1: 56,7% → 66,9%.

### Thêm
<!-- [2026-11-03 10:55 PM Johnny Chu - Chu Hoàng Anh] FLOW — công cụ nhận việc -->
- **Công cụ nhận việc R-FLOW**: `node scripts/nhan-viec.mjs` (`list`: bảng giữ chỗ trên origin/main và các nhánh còn mở; `kiem`: nhánh hiện tại đã giữ chỗ chưa, tệp đổi có nằm trong phạm vi không, đổi thứ dùng chung đã có chữ chốt vào main chưa, nhánh ngắn không, đã gộp main và không xung đột) và phép kiểm **SC-FLOW-1** (bảng CLAIMS.md đúng khuôn, các dòng không chồng phạm vi, mỗi nhánh một dòng; mức chặn). 11 ca thử ở `tests/conformance/checks/flow/flow.test.mjs`.
<!-- [2026-11-03 09:55 PM Johnny Chu - Chu Hoàng Anh] FLOW — R-FLOW -->
- **Luật nhận việc [R-FLOW](docs/rules/RULE-FLOW.md)** (chủ dự án đồng ý): giữ chỗ vào `main` trước khi code ([CLAIMS.md](docs/phases/CLAIMS.md)), chốt thiết kế thứ dùng chung bằng tài liệu trước, nhánh ngắn, gộp `main` và bộ kiểm xanh trước khi đẩy; Bước 0 trong AGENTS.md. Sinh ra từ việc hai phiên làm trùng W6 đợt 3 và đợt 4 ngày 2026-11-03. Phép kiểm tự động (SC-FLOW-1/2, `nhan-viec.mjs`) là đợt kế tiếp.
<!-- [2026-11-04 04:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-11 -->
- **Tác động mặt hàng** (PHASE-026 S026-11): nút **Tác động** ở Hành trình mặt hàng — mã này đang ở bao nhiêu chứng từ (theo loại, từ ngày nào), còn tồn ở chi nhánh nào, có dòng sổ ở tài khoản nào, bảng giá / quy đổi nào, kỳ đã khoá nào — kèm câu nói rõ đổi mã, đổi nhóm, đổi đơn vị tính hay ngừng dùng sẽ ảnh hưởng gì. Đọc trước khi sửa danh mục. API `GET /api/v1/lineage/items/:sku/impact`.
<!-- [2026-11-04 03:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-10 -->
- **Lịch sử mặt hàng** (PHASE-026 S026-10): nút **Lịch sử mặt hàng** ở Hành trình mặt hàng — mỗi lần đổi mã (mã cũ → mới, hiệu lực từ ngày nào), đổi phân loại hạch toán (từ ngày nào, chứng từ trước giữ phân loại cũ), sửa khai báo, kích hoạt, lưu dù có cảnh báo (kèm lý do đã ghi) — ai làm, lúc nào; gõ mã cũ vẫn ra đúng lịch sử. API `GET /api/v1/lineage/items/:sku/history` (quyền xem danh mục).
<!-- [2026-11-04 03:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — S026-3 -->
- **Họ mặt hàng theo định danh** (migration `0067_bien_the_dinh_danh`, R-ITEM-3): biến thể (mã con) trỏ về mặt hàng cha bằng **định danh**, không bằng chuỗi mã — đổi mã cha hay mã con không làm đứt họ; khai mặt hàng cha sau mã con thì các con tự nhận cha. Hành trình mặt hàng hiện **cha / biến thể / cùng cha** (bấm để mở hành trình biến thể — mỗi biến thể có tồn và giá vốn riêng). Khung Vì sao nhắc **ITEM-HINT-003** khi đổi đơn vị tính gốc của mặt hàng đã có nhập xuất: quy cách khác (hộp ↔ thùng, 400g ↔ 900g) nên là mặt hàng mới cùng mã cha; vẫn lưu được, ghi lý do.
<!-- [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — ADR-0022, HT10 -->
- **Trụ cột & mức đạt (HT10)** và thẻ **Trụ cột** ở trang chủ mỗi phân hệ ([hướng dẫn](docs/huong-dan/tru-cot-muc-dat.md), [ADR-0022](docs/adr/ADR-0022-quan-tri-du-lieu-goc-nen-mong.md), [PHASE-026](docs/phases/PHASE-026-MASTER-DATA-GOVERNANCE/README.md)): Core bảo đảm điều gì (nền móng Quản trị dữ liệu gốc + tám trụ cột) và hôm nay đạt tới đâu — mỗi tiêu chí có mức, bằng chứng, khoảng cách, việc tiếp; mức đạt đi theo bằng chứng, không tích tay. Nguồn `docs/standard/tru-cot.json` (`bizcity_pillars@1`), API `GET /api/v1/system/pillars`; tài liệu [10-DANH-GIA-ADAPT](docs/phases/PHASE-026-MASTER-DATA-GOVERNANCE/10-DANH-GIA-ADAPT.md) sinh từ cùng tệp (`scripts/tru-cot-md.mjs`). Đề xuất Enterprise Master Data Center, bốn khả năng Lịch sử · Tác động · Kiểm chuẩn · Truy vết trên mỗi màn danh mục, nhóm đơn vị HO / kho / cửa hàng ([bản mẫu](docs/phases/PHASE-026-MASTER-DATA-GOVERNANCE/mockups/master-data-center.html)). Chỉ HT10 có code; phần còn lại là tài liệu.
<!-- [2026-11-04 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — G2 -->
- **Giá vốn và báo cáo kho theo định danh mặt hàng** (G2 của PHASE-024 · 70 §3.2.1): tính giá vốn tháng, nhập xuất tồn, sổ chi tiết hàng hoá gom theo `item_id` — đổi mã giữa tháng không còn tách thành hai dòng giá vốn / hai dòng NXT; dòng giá vốn mang mã hiện hành, phiếu giá vốn ghi mã tại ngày; tra sổ chi tiết bằng mã cũ vẫn ra đủ; giá vốn nhập từ Excel theo mã cũ vẫn nhận ra mặt hàng. Hành trình mặt hàng mở được bằng mã cũ.
<!-- [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b -->
- **Định danh mặt hàng trên sổ và kho** (migration `0066_item_id_so_kho`, [bizcity_item_master@1](docs/contracts/BIZCITY-ITEM-MASTER-v1.md) 0.2.0): mọi dòng sổ cái, dòng nhập xuất kho, giá vốn tháng, đơn vị quy đổi, bảng giá mang `item_id` của mặt hàng; mã hàng trên dòng giữ nguyên làm ảnh chụp tại ngày. **Hành trình mặt hàng** truy theo định danh: sau khi đổi mã, mã cũ và mã mới là **một** hành trình, có lịch sử mã, nhãn "mã cũ" trên sự kiện cũ; gõ mã cũ vẫn tìm ra mặt hàng. Sổ cái vẫn chỉ thêm.
<!-- [2026-11-03 10:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2a -->
- **Item Master — định danh mặt hàng bất biến** ([bizcity_item_master@1](docs/contracts/BIZCITY-ITEM-MASTER-v1.md), migration `0065_mat_hang_dinh_danh`, bước B2a, ADR-0017): mỗi mặt hàng có một `item_id` (ULID) không đổi, không xoá, không dùng lại; mã hàng có **phiên bản và ngày hiệu lực** (đổi mã = đóng mã cũ + thêm mã mới); phân loại hạch toán theo ngày. **Bất biến ở CSDL**: không sửa / xoá định danh, mã chỉ thêm, một mã tại một ngày chỉ trỏ một mặt hàng, lịch sử phân loại không bị sửa. Chạy **song song** với danh mục mặt hàng hiện có (đồng bộ tự động ở mọi đường ghi, chưa ảnh hưởng ai); kèm **Item Resolver** (mã hoặc itemId tại một ngày → item_id + phân loại hiệu lực). Chi phí đồng bộ 2.000 mặt hàng qua API: gửi lại y nguyên không đổi, thêm mới +40%.
<!-- [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1 -->
- **Hành trình mặt hàng (ACC95)** — truy vết vòng đời một mặt hàng, chỉ đọc ([hướng dẫn](docs/huong-dan/hanh-trinh-mat-hang.md), [bizcity_lineage@1](docs/contracts/BIZCITY-LINEAGE-v1.md), migration `0064_truy_vet_mat_hang`): mua → nhập → bán → trả → chuyển kho, bút toán mang mã hàng, giá vốn từng tháng; phân biệt sự kiện **kế toán** (đổi sổ) với **vận hành**; bấm một sự kiện để thấy chuỗi nối với nó; **"Vì sao giá vốn này?"** giải thích đơn giá bình quân tháng bằng số thật và các phiếu góp vào; nói rõ phần chưa truy được. Nút **Truy vết** ở Báo cáo nhập xuất tồn, Sổ chi tiết hàng hoá, Danh mục mặt hàng. API: `GET /api/v1/lineage/search`, `/lineage/items/:sku`, `/lineage/items/:sku/cost`.
<!-- [2026-11-03 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — ADR-0021 Accounting Continuity -->
- **Đề xuất trụ cột Accounting Continuity** ([ADR-0021](docs/adr/ADR-0021-accounting-continuity-lien-tuc-ke-toan.md), luật [R-CONT](docs/rules/RULE-CONTINUITY.md), [PHASE-025](docs/phases/PHASE-025-ACCOUNTING-CONTINUITY/README.md)): mọi con số trên sổ đi ngược được về nghiệp vụ gốc qua mua → kho → bán → giá vốn → lãi lỗ, qua mọi lần đổi mã / chế độ; lineage giá vốn (lớp + phân bổ, mọi phương pháp tính giá); kiểm chuẩn vòng đời (Gate C, mã `CT-*`); màn Hành trình mặt hàng và Sẵn sàng khoá kỳ ([bản mẫu](docs/phases/PHASE-025-ACCOUNTING-CONTINUITY/mockups/continuity.html)). Chỉ tài liệu, chưa code.
<!-- [2026-11-03 02:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0020 -->
- **Tôn chỉ Core** ([ADR-0020](docs/adr/ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md), [CANON §0](docs/00-CANON.md)): người dùng quyết định và thao tác; Core làm vấn đề nhìn thấy được và chỉ đúng chỗ sửa (gate, check, sổ tay, debug, bể chờ, nháp), bằng **một ngôn ngữ là thư viện mã**. Hệ quả: mỗi mã có **căn cứ** (văn bản trong danh mục căn cứ pháp lý, hoặc "quy ước phần mềm") — hiện ở khung Vì sao, trang tra mã, thông báo; thông báo của Core dựng từ mã (`notifyFinding`, check SC-FIND-2); bỏ nhãn "nội dung nháp, chờ kế toán trưởng duyệt" — luật chạy ngay, ai chỉnh được là việc của phân quyền.
<!-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — HT09 / D024-3 -->
- **Quy định dữ liệu danh mục (HT09)** — màn của kế toán trưởng ([hướng dẫn](docs/huong-dan/quy-dinh-du-lieu-danh-muc.md), migration `0063_quy_dinh_danh_muc`):
  - **Luật nhắc** của khung Vì sao tại đơn vị: xem luật đúng như trong form kèm căn cứ, Sửa câu chữ, Hạ cảnh báo mềm xuống nhắc (bắt buộc lý do, D023-8), Về mặc định. Luật đổi ở bản phát hành sau thì phần chỉnh cũ hết hiệu lực.
  - **Tắt / bật tự thêm mặt hàng từ chứng từ** (`bizcity.item.auto_create`): tắt thì mã hàng lạ thành mặt hàng nháp và chứng từ chờ ở Trạm kiểm tra với mã mới [`IN-ITEM-001`](docs/huong-dan/loi-dau-vao/IN-ITEM-001.md). Mặc định **bật** cho mọi đơn vị (luật chung R-GATE-9: mặc định cho phép, nhắc khi sai): mặt hàng tự thêm được nhắc bằng thông báo "Chứng từ … đã tự thêm n mặt hàng — cần kiểm" cho người có quyền sửa danh mục.
- Danh sách mặt hàng: dải nhắc "N ngày qua chứng từ đã tự thêm … mặt hàng" và nút **Kích hoạt hàng loạt** mặt hàng nháp (`POST /api/v1/products/activate`).
- Lưu tài khoản / đối tượng / mặt hàng còn cảnh báo mềm (hoặc lưu nháp): dòng nhắc ngắn ở góc màn sau khi lưu.
<!-- [2026-11-03 03:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-25 / PHASE-022 S022-8 -->
- **Cảnh báo thuế và hoá đơn ngay lúc nhập** (PHASE-021 S021-25): Kiểm thử và sửa tại bể nay nhắc thêm bốn điểm mà tự chẩn đoán thuế vốn chỉ quét theo kỳ — `IN-VAT-001` thuế suất giảm dùng ngoài khoảng ngày được giảm (khoảng ngày lấy từ rulepack), `IN-INV-001` hoá đơn mua thiếu ký hiệu / tên / mã số thuế người bán, `IN-INV-002` hoá đơn bán lập sau ngày chứng từ, `IN-CFG-001` chưa khai hồ sơ kế toán (không trừ điểm người lập). Đều là cảnh báo: cửa nạp vẫn nhận, kế toán trưởng chấp nhận được kèm lý do. Cùng một bộ hàm kiểm theo một chứng từ với tự chẩn đoán (`tax.findings.ts`, PHASE-022 S022-8) nên hai nơi không thể lệch luật.
<!-- [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W5 -->
- **Định khoản thử trong Kiểm thử** (PHASE-021 W5, L5): khi chứng từ hết lỗi chặn, Kiểm thử và sửa tại bể chạy thử đường ghi sổ thật rồi hoàn tác hết — báo trước lỗi cấu hình mà trước đây chỉ lộ lúc định khoản: `IN-POST-001` (lý do), `IN-POST-002` (tài khoản), `IN-POST-003` (nhóm hạch toán), `IN-POST-004` (bút toán không cân: lỗi luật, dừng ghi sổ báo nhóm Lõi), `IN-POST-005` (khác), `IN-BIZ-001` (kỳ đã khoá). Giới hạn 3 giây và 20 lần mỗi người mỗi phút. **Gợi ý cấu hình**: lỗi cấu hình lặp từ 3 chứng từ trở lên hiện thành dải gợi ý cho kế toán trưởng (`GET /api/v1/intake/suggestions`), không tự sửa. Trợ lý AI đọc được bể chờ qua `core.intake.list / get / explain` (không có nguyên văn hay giá trị đã gửi).
<!-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W4 -->
- **Bảng điểm đầu vào** (ACC94, PHASE-021 W4): mọi kế toán xem tỷ lệ chứng từ đạt ngay lần đầu, điểm trung bình, mục đang mở (lâu nhất bao lâu), thời gian xử lý, số mục sửa tại bể; theo nguồn / người lập / loại chứng từ; mười mã lỗi hay gặp (mở bài học); xu hướng theo tuần. Không có nội dung chứng từ. API `GET /api/v1/intake/score`. Tự chẩn đoán thêm kiểm **INTAKE_OPEN_AGE** (chứng từ ở bể chờ quá 3 ngày, đổi bằng `bizcity.intake.open_alert_days`), bộ kiểm thêm **DG-INTAKE-1**. Sự kiện lõi mới `bizcity.intake.rejected` / `bizcity.intake.resolved` (chỉ mã và số) — app kết nối nhận qua webhook.
<!-- [2026-11-03 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W3 -->
- **Trạm kiểm tra đầu vào** (PHASE-021 W3, [bizcity_intake_findings@1 §6](docs/contracts/BIZCITY-INTAKE-FINDINGS-v1.md)): màn Định khoản tự động (ACC14) có thêm thẻ **Cần sửa** (chứng từ cửa nạp đã từ chối), **Đã xử lý**, **Thử của tôi**. Bấm một mục: câu kết luận, lỗi theo lớp kèm Vì sao / Sửa ở nguồn / Bài học, sửa ô ngay tại bể (bắt buộc lý do, bản gốc giữ nguyên), Kiểm thử, **Nộp lại** qua đúng cửa nạp, lịch sử lần thử và so hai lần. Chủ đơn vị / kế toán trưởng chấp nhận được cảnh báo (không bao giờ lỗi chặn) kèm lý do; kế toán trưởng bỏ được mục. API mới: `POST /api/v1/intake/:id/patch | resubmit | accept | dismiss` (action `core.intake.*`, không mở cho AI); `GET /api/v1/intake` lọc `closed`, `closedDays`, `mine`; chi tiết kèm `current`. Chứng từ nộp lại từ bể mang `extra.intake`. Khoá cấu hình mới `bizcity.intake.accept_roles`.
<!-- [2026-11-03 09:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-29 -->
- **Commit Guard — `IN-GUARD-001`** (PHASE-024, R-GATE-8): Kiểm thử chứng từ (`POST /api/v1/intake/preflight`) trả thêm `guard` — dấu của phần cấu hình chứng từ dựa vào (mặt hàng trên dòng, chi nhánh, đối tượng, phiên bản chính sách kế toán, khoá kỳ). Nộp kèm dấu đó (header `X-Preflight-Guard` ở `POST /api/v1/documents`, trường `guard` ở `core.document.submit`): nếu cấu hình đã đổi, cửa nạp chạy lại tiền kiểm; còn lỗi chặn thì từ chối với `IN-GUARD-001` kèm lỗi cụ thể và giữ ở Trạm kiểm tra; vẫn đạt thì nhận. Không gửi dấu: như cũ. [Bài học](docs/huong-dan/loi-dau-vao/IN-GUARD-001.md).
<!-- [2026-11-03 12:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-28 / 29 -->
- **Mặt hàng nháp** (PHASE-024, [ADR-0019](docs/adr/ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md), migration `0061_mat_hang_nhap`): khai báo mặt hàng còn lỗi chặn — thiếu đơn vị tính gốc, hoặc thiếu nhóm hạch toán khi đơn vị không có nhóm mặc định — được **lưu nháp** thay vì báo lỗi (không mất bản khai). Mặt hàng nháp không có ở ô chọn của phiếu; chứng từ dùng nó bị cửa nạp giữ ở Trạm kiểm tra với mã **IN-ITEM-009**. Sửa xong → mặt hàng tự kích hoạt và các chứng từ đang chờ vì nó được **kiểm lại tự động**. Áp cho mọi đường lưu (form, nhập Excel, đồng bộ từ POS, `core.product.upsert`). Danh sách mặt hàng có nhãn và bộ lọc "Nháp"; `POST /api/v1/products/validate`.
<!-- [2026-11-02 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-27 -->
- **Thư viện mã phát hiện của hai cổng kiểm chuẩn** ([ADR-0019](docs/adr/ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md), [`bizcity_findings@1`](docs/contracts/BIZCITY-FINDINGS-v1.md)): mọi mã của Gate A (khai báo danh mục) và Gate B (trạm tiền kiểm) một khuôn — mức, bước, vì sao, cách sửa, luật gốc. Tra: trang [Tra mã phát hiện](docs/huong-dan/ma-loi/README.md), `GET /api/v1/findings[/:code]`, công cụ MCP `core.findings.explain` cho trợ lý AI. Check SC-FIND-1: mã không trùng, cảnh báo / chặn phải có cách sửa.
<!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-023 — S023-14 / 15 -->
- **Khung "Vì sao" trong form danh mục** (PHASE-023, `bizcity_catalog_hint@1`): form **Tài khoản** và **Đối tượng** nhắc (ℹ), hướng dẫn (▶), cảnh báo mềm (⚠) và chặn (✘) ngay khi khai báo — tài khoản trái bản chất tài khoản cha / hệ thống chuẩn, tài khoản nhóm công nợ không vào sổ phụ công nợ, ngừng dùng tài khoản còn số dư, NCC thiếu MST, MST sai định dạng, trùng tên. Cảnh báo mềm **lưu được nhưng bắt buộc ghi lý do** (≥ 5 ký tự, nhật ký `catalog.warn.ack`; người lưu tự chịu trách nhiệm vì đã được cảnh báo); lưu qua API không lý do ghi `catalog.warn.unacked`. API mới `POST /api/v1/accounts/validate`, `POST /api/v1/partners/validate`; thêm / sửa trả `meta.findings`.
<!-- [2026-11-02 11:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — S021-26 -->
- **Phương án khắc phục cho mã tiền kiểm `IN-*`** (`INTAKE_REMEDIES`, bizcity_remedy@1): mọi mã `block` / `warn` có bước sửa ở nguồn, màn danh mục khi thiếu mã, việc cấm; phát hiện trả `remedy`; SC-FIX-1 kiểm (ca tự kiểm `repo-bad`). Sổ màn thêm DM02 / DM03 / DM10.
<!-- [2026-11-02 11:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 lần 0 -->
- **Bộ kịch bản nghiệm thu ca chuẩn Hợp đồng** `apps/api/test/golden-hop-dong.test.ts` (GC-1..GC-12, PHASES 4.5): chấm module `modules/hop-dong` do Claude sinh ra chỉ qua HTTP / MCP; chưa có module thì bỏ qua.
<!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 -->
- **Năng lực cho module SDK theo ca chuẩn Hợp đồng** (PHASE-014 W4): workflow YAML dùng được cho chứng từ của module (`@bizcity/module-sdk` xuất `loadWorkflow`; quyền `<module>:<việc>`; mã dời sang `@bizcity/platform/core/workflow`, `apps/api/src/core/workflow.ts` chuyển tiếp); khoá cấu hình module tự khai (`modules/<key>/settings.registry.json`); hook `masterdata.referenceCheck` (xoá đối tượng còn được module dùng → `CONFLICT`); subscriber có `ctx.module`, `ctx.settings`, `ctx.notify`.
- **Thông báo trong ứng dụng** (`notify.inapp`, migration `0060_thong_bao`): `ctx.notify.send` cho module, chuông trên thanh trên cùng, `GET /api/v1/notifications`, `POST /api/v1/notifications/read`.
- **Slot giao diện** (`ui.slots`): `partner.detail.tab` (thẻ trong hồ sơ khách), `dashboard.widget` (ô trên Tổng quan).
<!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W2/W3 -->
- **Lệnh `bizcity`** (gói `@bizcity/cli`, PHASES 4.1): `npx bizcity module new <key>` sinh module từ `templates/starter-module`; `module check <key>` chạy luật module, typecheck, test hợp đồng module trên CSDL test; `migrate`, `ledger verify`, `doctor`. [docs/ops/CLI.md](docs/ops/CLI.md) §1b.
- **Template module** `templates/starter-module/` (PHASES 4.2) kèm AGENTS.md riêng; **`@bizcity/ui-kit`** (PHASES 3.8, năng lực `ui.kit` → available): màn của module dùng thành phần và client API của Core qua gói này, không import `apps/web`.
- **Web nạp phần giao diện của module SDK** (`modules/<key>/web/index.tsx`): mục Tổng quan, menu, route dưới `/app/<key>/` chặn theo quyền. Chưa có slot.
- Test hợp đồng cho mọi module trong `modules/` (`apps/api/test/sdk-modules.contract.test.ts`): bảng có RLS + COMMENT, action manifest = code, quyền mang tiền tố module, GET trả 200, viewer không ghi được.
<!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W1 -->
- **Nạp module viết bằng `@bizcity/module-sdk`** (PHASE-014 W1, [BIZCITY-EXTENSION](docs/contracts/BIZCITY-EXTENSION-v1.md) §3): thư mục `modules/<key>/` có `bizcity.module.json` + `api/index.ts` (`export default defineModule(...)`) được API tìm và nạp như phân hệ — registry, băm thư mục, bật / tắt theo đơn vị; route sinh từ action nằm dưới `/api/v1/m/<key>/`; quyền khai trong manifest vào registry quyền; subscriber vào bộ sự kiện. Mã module lỗi hoặc khoá trùng phân hệ của Core thì dừng khởi động. Biến mới `BIZCITY_MODULES_DIR` (mặc định `<gốc repo>/modules`). SDK xuất thêm `sql` cho bảng của chính module.
<!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.15 manual_journal (K2); PHASE-010 2.8 gói mua-hang-domain -->
- **Phiếu kế toán module lập — `docType: manual_journal`** (PHASES 3.15, [ADR-0015](docs/adr/ADR-0015-chot-sdk-v1-moi-thu-qua-be-su-kien.md) Q1, `bizcity_ledger_intake@1` 1.3.0, năng lực `ledger.manual-journal` → available): module nộp qua `ctx.ledger.submit` dòng `{ reasonCode, amount, partnerCode? }`, **không** số tài khoản, không thuế, không hoá đơn (khuôn đóng). Lý do có loại mới **`journal`** với tài khoản Nợ / Có (migration `0058_ly_do_phieu_ke_toan`; màn Lý do – tài khoản ACC18; gói định khoản `debitAccount` / `creditAccount`, SC-TPL-1 kiểm). Chưa có lý do journal nào trong gói nền — kế toán trưởng chốt danh sách (đặc tả K2).
<!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1–W4 -->
- **Mọi cảnh báo kèm phương án khắc phục có cấu trúc** (PHASE-022 W1, [bizcity_remedy@1](docs/contracts/BIZCITY-REMEDY-v1.md)): mỗi kiểm tự chẩn đoán và mỗi mục bảng kiểm khoá kỳ có `remedy` — các bước (màn cần mở, ai làm), mã kiểm lại, `stopTheLine` cho lỗi toàn vẹn sổ, việc không được làm. Check **SC-FIX-1** (chặn) bắt kiểm thiếu remedy hoặc trỏ màn không có trong menu. Dải cảnh báo ở màn lập chứng từ hiện từng bước kèm nút mở màn.
- **8 kiểm mới cho khoảng trống** (PHASE-022 W2, chỉ đọc, mức warn): `CASH_NEGATIVE`, `ACCOUNT_WRONG_SIDE`, `TRANSIT_NONZERO`, `DEBT_MATCH_LEDGER`, `COGS_STALE`, `STOCK_ADJUST_NO_REASON`, `DEPRECIATION_OPEN`, `CONFORMANCE_STALE` (L3). Tài khoản đọc từ tài khoản ngầm định / công nợ / quy tắc kết chuyển của đơn vị, không viết cứng.
- **Danh mục giả định lỗi F22 + bộ chạy** (PHASE-022 W3): 92 ca trong 10 nhóm (môi trường, chứng từ, thuế, kho, cuối kỳ, sổ, công nợ, tiền, tài sản, phân quyền), mỗi ca có bằng chứng (test, lane, công thức gây lỗi) hoặc lý do chưa làm; bảng điểm `scenario-board.json`.
- **Bàn đánh giá theo vai** (PHASE-022 W4, menu Hệ thống → Bàn đánh giá HT08): checklist giả định lỗi theo ba vai — kế toán trưởng, kiểm soát / ban kiểm soát, thanh tra thuế (tự rà trước, không phải kết luận của cơ quan thuế); trạng thái Đạt / Cảnh báo / Lỗi / Chặn đúng / Chưa kiểm được / Kiểm ở màn khác, không điểm %; mỗi ca bốn khối Hiện tượng · Vì sao · Cách khắc phục · Kiểm lại; in biên bản. API `GET /api/v1/system/review-board?persona=` (`core.review.board`), `GET …/review-board/recheck?code=` (`core.review.recheck`, chạy lại đúng một mã), quyền mới `review:read`. Không có nút sửa sổ, tắt kiểm hay bỏ qua.
- **Vai trò `auditor` (Kiểm soát / ban kiểm soát)** (migration `0057_vai_tro_kiem_soat`): chỉ xem như `viewer` + Bàn đánh giá; không ghi, không cấu hình.
<!-- [2026-11-02 08:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W2 bể chờ -->
- **Bể chờ đầu vào — W2** (PHASE-021, PHASES 2.18, năng lực `intake.inbox` → available): chứng từ cửa nạp từ chối (đơn, lô, `submit`, khoá app) được giữ nguyên văn + mọi phát hiện + điểm ở bảng `intake_inbox` (migration `0059_be_cho_dau_vao`), phản hồi lỗi thêm `error.intake` (lô: `intakeId`); gửi trùng gộp một mục; nguồn gửi lại đúng thì mục tự đóng; `GET /api/v1/intake`, `/intake/:id`, `POST /intake/preflight` (Kiểm thử, lưu mục thử); hạn giữ 90 / 7 ngày. Chưa có màn (W3).
<!-- [2026-11-02 07:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — W1 tiền kiểm -->
- **Tiền kiểm chứng từ — W1** (PHASE-021, PHASES 2.17, ADR-0014, năng lực `intake.findings` → available): danh mục 20 mã lỗi đầu vào `IN-*` (khuôn, số học, danh mục, nghiệp vụ) viết cho người mới — vì sao kế toán cần, sửa ở nguồn thế nào, trang bài học `docs/huong-dan/loi-dau-vao/`; bộ tiền kiểm gom **mọi** lỗi của một chứng từ trong một lần bằng chính luật cửa nạp, chấm điểm 0–100. Chưa lưu bể chờ / chưa có màn (W2, W3).
<!-- [2026-11-02 06:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-11 -->
- **Rulepack nháp thuế GTGT (C03 `vat-vn`) và hoá đơn (C04 `einvoice-vn`)**, phạm vi hẹp (S020-11): bốn kiểm tự chẩn đoán L3 mới, chỉ đọc, mức warn — `VAT_REDUCED_RATE` (8% ngoài thời gian giảm; thời gian là tham số của ca trong rulepack), `VAT_INPUT_NONCASH` và `INVOICE_FIELDS` (dùng lại `taxIssues` của màn Bổ sung thông tin thuế), `INVOICE_ISSUE_DATE`. Schema ca `bizcity_vn_case` 1.1.0 thêm `scenario.params`. Gói `@bizcity/vn-rulepacks` 0.3.0. Mọi căn cứ còn chờ rà; bản cài tự duyệt được (cần người duyệt thuế).
<!-- [2026-11-02 05:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ADR-0016 -->
- **Duyệt rulepack tại bản cài** ([ADR-0016](docs/adr/ADR-0016-duyet-rulepack-tai-ban-cai.md), migration `0056_duyet_rulepack`): bản cài tự chủ tự duyệt rulepack còn nháp cho đơn vị mình (quyền mới `conformance:approve`: chủ đơn vị, kế toán trưởng). `GET /api/v1/conformance/rulepacks`, `POST …/rulepacks/approve`, `…/revoke`. Lượt duyệt gắn phiên bản + băm nội dung, cập nhật gói rulepack thì phải duyệt lại. Kết quả dựa trên duyệt này mang nhãn "Đạt theo duyệt của đơn vị", không mang nhãn Bizcity; báo cáo có `approval_basis`. Màn Kiểm chuẩn có khối "Rulepack và duyệt tại đơn vị".
<!-- [2026-11-02 03:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-20 / S020-21 / lịch đêm -->
- **Màn Hệ thống → Kiểm chuẩn (HT06) và Hồ sơ kế toán (HT07)** (S020-20): ba thẻ Module / Cấu hình / Doanh nghiệp, mỗi thẻ một kết quả và số ca theo 6 trạng thái (không điểm %); ma trận ca có căn cứ điều khoản + trạng thái rà, "Vì sao", "Việc cần làm" (link sang màn sẵn có); xu hướng các lượt gần đây (`GET /api/v1/conformance/runs`, `core.conformance.list`). Màn hồ sơ: xem hồ sơ áp cho hôm nay, lịch sử, phát hành bản mới.
- **Cảnh báo kiểm chuẩn ở màn lập chứng từ và trước khoá kỳ** (S020-21, ADR-0012 T3 / T4): `GET /api/v1/conformance/advisories` (`?date` cho chứng từ, `?year&month` cho kỳ), tính ngoài giao dịch ghi sổ, chỉ thông tin. Lưu phiếu khi còn cảnh báo, hoặc khoá kỳ khi còn cảnh báo (kèm lý do ≥ 10 ký tự), thì ghi một dòng bằng chứng qua `POST /api/v1/conformance/advisories/ack` (`core.conformance.acknowledge`); khoá API / AI không xác nhận thay. Khoá kỳ vẫn chỉ bị chặn bởi lỗi mức error như cũ. Gắn ở phiếu kế toán, phiếu thu chi, khoá kỳ, ACC14 (định khoản hàng loạt: một dòng bằng chứng cho cả lô, ngữ cảnh `documents`) và phiếu hàng <!-- [2026-11-02 04:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-21b -->.
- **Kiểm chuẩn mỗi đêm**: subscriber `core.conformance-nightly` nghe `bizcity.clock.daily` (01:00 giờ VN), mỗi đơn vị một lượt, actor `system:nightly`.
<!-- [2026-11-02 10:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — S020-19: lớp Doanh nghiệp của Conformance Engine -->
- **Lớp Doanh nghiệp của Conformance Engine** (S020-19, Q020-6): hai kiểm tự chẩn đoán L3 mới, chỉ đọc, mức warn, không chặn khoá kỳ: `INVENTORY_NEGATIVE` (tồn kho âm cuối ngày theo mặt hàng × kho) và `PERIOD_CLOSE_OPEN` (tháng qua quá 30 ngày còn thiếu giá vốn, kết chuyển, khoá sổ, hoặc giá vốn tính lại sau kết chuyển). Bản lane DG-INV-1, DG-CLOSE-1. Lượt Kiểm chuẩn trên bản cài nay đánh giá ba lớp; báo cáo `bizcity_vn_conformance_report` 1.1.0 thêm `cases[].layer` và `layer_results` (kết quả riêng cho Module, Cấu hình, Doanh nghiệp). Gói `@bizcity/vn-rulepacks` 0.2.0.
<!-- [2026-11-02 03:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — Conformance Engine trên bản cài (S020-18) -->
- **Conformance Engine chạy trên bản cài** ([ADR-0012](docs/adr/ADR-0012-conformance-engine-tru-cot-kernel.md), S020-18, mức Kernel K1, migration `0055_kiem_chuan`): `POST /api/v1/conformance/runs` (`core.conformance.run`, quyền mới `conformance:run`) đánh giá đơn vị theo rulepack có hiệu lực, lớp Module + Cấu hình, bằng chứng từ tự chẩn đoán của chính đơn vị; lưu ảnh chụp chỉ thêm ở `conformance_runs`. `GET /api/v1/conformance/runs/latest` (`core.conformance.latest`, quyền `conformance:read`, AI đọc được). Hai kiểm tầng L5 mới `PROFILE_DECLARED`, `PROFILE_PACK_REGIME` (mức warn). Dữ liệu luật chuyển thành gói `packages/vn-rulepacks` (`@bizcity/vn-rulepacks`) kèm bộ đánh giá thuần `engine.mjs` dùng chung với `--certify`. `bizcity_action@1` 1.1.0-draft thêm `sideEffects: analysis`. Chỉ đọc sổ, không chặn ghi sổ.
<!-- [2026-11-02 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — hồ sơ kế toán của đơn vị (ADR-0013, migration 0049) -->
- **Hồ sơ kế toán của đơn vị có phiên bản** ([ADR-0013](docs/adr/ADR-0013-ho-so-ke-toan-co-phien-ban.md), mức Kernel K1, migration `0054_ho_so_ke_toan`): năm tài chính (tháng bắt đầu), chế độ kế toán (TT200 / TT99 / TT133 / TT152), loại pháp nhân; hiệu lực từ ngày đầu một năm tài chính, không phát hành vào năm đã có kỳ khoá, chỉ thêm, có bằng chứng. `GET /api/v1/accounting/profile` (`accounting.profile.get`, AI đọc được), `POST /api/v1/accounting/profile/publish` (`accounting.profile.publish`, `settings:write`). Chưa khai thì trả `current: null` — Core không đoán chế độ. Báo cáo năm, kết chuyển cuối năm vẫn theo năm dương lịch (chưa đổi).
<!-- [2026-11-01 11:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — bộ kiểm chuẩn pháp lý Việt Nam: kho nguồn pháp lý, 4 schema, 3 rulepack nháp, check SC-VNC-1/2, luật R-VNC, audit nền VNCONF-001 -->
<!-- [2026-11-02 12:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — Conformance Engine (ADR-0012 đề xuất) + lệnh --certify -->
<!-- [2026-11-02 01:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ADR-0012 chấp nhận + T1–T8, R-VNC-10, rulepack C09 -->
- **ADR-0012 chấp nhận** (02/11/2026) kèm tinh chỉnh T1–T8 và nguyên tắc: Core đơn giản, lean, chặt chẽ; phân tích, cảnh báo, đánh giá chỉ để người dùng ra quyết định ([R-VNC-10](docs/rules/RULE-VN-CONFORMANCE.md)). Schema rulepack thêm `layer` và miền `internal`; rulepack nháp **C09 `enterprise-period-vn`** (lớp Doanh nghiệp, 4 ca); `--certify` coi phát hiện của check mức info ở lớp Doanh nghiệp là ca không đạt.
- **Conformance Engine — kiến trúc trụ cột Kernel** ([ADR-0012](docs/adr/ADR-0012-conformance-engine-tru-cot-kernel.md), [20-KIEN-TRUC](docs/phases/PHASE-020-KIEM-CHUAN-PHAP-LY-VN/20-KIEN-TRUC-CONFORMANCE-ENGINE.md)): trong Core, bật mặc định, menu Hệ thống → Kiểm chuẩn; ba lớp Module · Cấu hình · Doanh nghiệp; Registry hiệu lực cấp điều khoản (thêm TT152/2025, provision chuyển tiếp TT200); ba cổng — Build chặn, **Posting chỉ thông tin (người dùng quyết định ghi sổ)**, Compliance Report; bảng điểm theo ma trận BizCity. Chưa đổi mã chạy app.
- **Một lệnh chứng nhận** `node tests/conformance/selfcheck.mjs --certify [--module] [--profile] [--runtime]`: ba cổng (tĩnh · CSDL · runtime vitest các tệp ca dẫn) + tuân thủ VN theo rulepack chọn theo hồ sơ `bizcity_vn_profile@1`, phiên bản, ngày hiệu lực (R-VNC-4, fail closed); ra `vn-conformance-report.json`, `vn-junit.xml`, `CERTIFICATE.md`; kết luận CERTIFIED / COMPATIBLE / FAIL.
- **Bộ kiểm chuẩn pháp lý Việt Nam — nền** ([PHASE-020](docs/phases/PHASE-020-KIEM-CHUAN-PHAP-LY-VN/README.md), VNCONF-001/002; chưa đổi mã chạy, chưa chứng nhận gì): kho nguồn pháp lý máy đọc `packages/vn-rulepacks/registry/legal-sources.json` (17 văn bản, tất cả `pending`), 4 schema (`bizcity_vn_legal_registry@1`, `bizcity_vn_rulepack@1`, `bizcity_vn_case@1`, `bizcity_vn_conformance_report@1`), catalog C01–C08, 3 rulepack nháp (toàn vẹn kế toán 8 ca, chế độ kế toán 5 ca, ranh giới plugin 6 ca) ánh xạ sang kiểm tự động đang có kèm khoảng trống; check **SC-VNC-1** (schema) và **SC-VNC-2** (cổng phê duyệt fail-closed: approved đòi căn cứ đã rà, hai người duyệt, golden hash; REVIEW_REQUIRED / NOT_TESTED không tính PASS) có ca tự kiểm; luật [R-VNC-1..9](docs/rules/RULE-VN-CONFORMANCE.md); quy trình [docs/compliance/](docs/compliance/README.md); audit nền [VN-CONFORMANCE-BASELINE-2026-11-01](docs/audits/VN-CONFORMANCE-BASELINE-2026-11-01.md).
<!-- [2026-11-02 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — giai đoạn 2: allocateDebt, core.*.upsert + seed, module-sdk/web -->
- **SDK 1.0.0 — giai đoạn 2** (PHASES 3.16–3.18): `ctx.ledger.allocateDebt` (đối trừ công nợ cùng tài khoản giữa hai chứng từ của module); action `core.partner.upsert` / `core.product.upsert` (`POST /api/v1/partners/upsert`, `/products/upsert`) và `seed[]` trong manifest (`POST /api/v1/system/modules/:key/seed`, chạy thử được); `@bizcity/module-sdk/web` (`defineWebModule`). Phiếu kế toán từ module (`manual_journal`, 3.15): đặc tả định khoản chờ kế toán trưởng ký.
<!-- [2026-11-02 05:55 PM Johnny Chu - Chu Hoàng Anh] ADR-0015 — chốt SDK v1 -->
- **SDK v1 chốt** ([ADR-0015](docs/adr/ADR-0015-chot-sdk-v1-moi-thu-qua-be-su-kien.md), chủ duyệt): phiếu kế toán từ module là `manual_journal` theo lý do (chỉ Kế toán tự chọn tài khoản), `ctx.ledger.allocateDebt` cho đối trừ cùng tài khoản, `seed[]` trong manifest, `@bizcity/module-sdk/web`. Nguyên tắc: **mọi thứ chạm sổ qua bể sự kiện** (R-EVENT-14). Bốn năng lực này có kiểu, đang ở lộ trình 3.15–3.18.
<!-- [2026-11-02 05:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — 3.3 quyền module + ctx.ledger.cancel / get -->
- **Quyền theo module** (PHASES 3.3, năng lực `permissions.module` → available): module khai quyền mới trong `permissions[]` của manifest; vai trò nhận theo `roles`; quyền rủi ro cao không cho trợ lý AI làm thay; action khai quyền lạ thì API dừng khởi động; `GET /api/v1/system/permissions` liệt kê theo module.
- **`ctx.ledger.cancel` / `ctx.ledger.get`** (SDK v0.2): module báo huỷ / xem trạng thái chứng từ của chính mình, đi cổng Kernel.
<!-- [2026-11-02 04:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — PR-4: CSDL theo module (3.10) -->
- **CSDL riêng cho module** (PHASES 3.10, ADR-0011 D4, năng lực `data.migrations.module` → available): `npm run module -w @ketoan/api -- migrate <key>` chạy migration của module bằng vai trò `mod_<key>_owner` — chỉ sở hữu schema `mod_<key>`, PostgreSQL từ chối mọi lệnh chạm bảng sổ / Kernel; bảng module thiếu `tenant_id` / RLS / FORCE / chính sách thì huỷ. Lúc chạy, `ctx.data.module(fn)` đọc ghi bảng của module bằng `mod_<key>_rw`.
<!-- [2026-11-02 04:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — PR-3: registry module + vòng đời (3.13) -->
- **Registry module và bật / tắt theo đơn vị** (PHASES 3.13, ADR-0011 D1, D2, năng lực `modules.lifecycle` → available):
  - Bản cài: bảng `module_registry` ghi phiên bản, hash thư mục, trạng thái mỗi phân hệ / add-in. Job cài đặt tự đồng bộ; lệnh `npm run module -w @ketoan/api -- list / sync / activate / deactivate / verify`. Bản thật chỉ nạp module `active` đúng hash; lệch → bỏ riêng module đó, chẩn đoán DG-MOD-1 đỏ.
  - Đơn vị: chủ đơn vị bật / tắt phân hệ (`POST /api/v1/system/modules/disable` / `enable`, có chạy thử báo ảnh hưởng, bằng chứng). Phân hệ tắt: route trả `MODULE_DISABLED`, giao diện ẩn phân hệ, sự kiện tới phân hệ đó ghi `skipped`. Dữ liệu, chứng từ, bút toán giữ nguyên; Kế toán và Hệ thống không tắt được.
<!-- [2026-11-02 10:43 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — PR-2b: app ngoài tiến trình (3.14, ADR-0011 mức 2) -->
- **App ngoài tiến trình** (PHASES 3.14, ADR-0011 mức 2, năng lực `apps.external` → available; [docs/api/ung-dung.md](docs/api/ung-dung.md)): dịch vụ riêng, ngôn ngữ bất kỳ, chỉ nói chuyện qua API công khai.
  - Manifest `kind: "app"` (`bizcity_module` 1.2.0-draft): `app.scopes` (quyền Core app xin, chỉ đọc / nộp chứng từ / danh mục), `events.subscribes` + `app.webhook.url`, `ui.origin` + `ui.entry`. Cài vào bản cài bằng manifest trong `apps/api/src/ung-dung/<key>/` + `APP_KEYS`, không quét thư mục.
  - Màn **Tiện ích → Ứng dụng kết nối** (TI13): chủ đơn vị kết nối (đồng ý phạm vi), tắt / bật, đồng ý phạm vi mới, xoay khoá; khoá API và bí mật webhook hiện một lần. App có giao diện hiện ở nhóm Tiện ích, mở trong khung nhúng `/ung-dung/<key>`.
  - Khoá app: quyền đúng phạm vi đã đồng ý; nộp chứng từ chỉ `docKey` `<app>:…`, nguồn = app, ở mọi cửa nạp; bằng chứng ghi `via app:<key>`.
  - Webhook trên outbox có sẵn (`bizcity_event` 1.1.0-draft §7a): subscriber `<app>.webhook`, chỉ đơn vị đã kết nối có việc giao, ký `Bizcity-Signature` HMAC-SHA256, `Idempotency-Key` = id sự kiện, thử lại 10 lần rồi `dead`.
  - Khung nhúng (`bizcity_extension` 1.1.0-draft §3a): iframe sandbox không điều hướng trang chủ, vé ≤ 5 phút qua `postMessage`, app đổi vé bằng khoá của nó (`POST /api/v1/apps/ticket/exchange`); giao thức đóng `bizcity.ready` / `context` / `navigate` / `toast` / `resize`, kiểm origin hai chiều.
<!-- [2026-11-02 01:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-011 — PR-2: @bizcity/module-sdk v0.1, ctx.ledger.submit, core.document.submit, ctx.settings.get -->
- **`@bizcity/module-sdk` v0.1** (PHASES 3.1, ADR-0011 D6): gói `packages/module-sdk` — mặt tiền duy nhất module import từ Bizcity: `defineModule` (kiểm action / subscriber khớp manifest), `defineAction`, `defineSubscriber`, kiểu `ctx`, `Errors`, `z`, tiền, `docRef`. Không mở `db`, bảng Kernel, `postDocumentIn`, `eventStore`.
- **`ctx.ledger.submit(doc)`** (năng lực `ledger.submit`, ADR-0011 D5): module nộp chứng từ `bizcity_ledger_intake@1` trong giao dịch của action — dữ liệu module và sổ cùng commit hoặc cùng huỷ, dry-run huỷ được. `docKey` phải mang tiền tố `<module>:`, `sourceSystem` = mã module; chỉ action ghi được nộp.
- **Action `core.document.submit`** (`POST /api/v1/documents/submit`, `bizcity_ledger_intake` 1.2.0): nộp chứng từ qua runtime action — `Idempotency-Key`, biên nhận bằng chứng `meta.receipt`, `?dryRun=1` trả bút toán dựng thử. Lỗi định khoản trả mã lỗi, không lưu chứng từ trạng thái lỗi. Cửa cho app ngoài tiến trình (ADR-0011 mức 2); `POST /api/v1/documents` giữ nguyên.
- **`ctx.settings.get(key)`** (năng lực `settings.registry` → available, PHASES 3.6): đọc cấu hình đơn vị theo `bizcity-settings.registry.json` — khoá lạ là lỗi, module chỉ đọc khoá mình sở hữu, chưa đặt thì trả mặc định. Image API chép kèm tệp registry.
<!-- [2026-11-01 11:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-011 — PR-1 manifest 12 gói, SC-MOD-3 block, waiver có hạn, GET /system/modules?detail=true -->
- **Manifest `bizcity.module.json` cho 9 phân hệ + 3 add-in** (PHASES 3.2, PHASE-011 S011-3): khai năng lực cần, action, docType nộp sổ, bảng sở hữu, khung nhìn đọc, workflow, giao diện. API nạp lúc khởi động, lệch `key` / `label` / `kind` / `version` với mã thì dừng; bản dựng chép manifest sang `dist`. `GET /api/v1/system/modules?detail=true` trả manifest tóm tắt của phân hệ + add-in đang bật (mặc định giữ mảng mã). Bộ kiểm: SC-MOD-3 lên **block** (thiếu manifest, `key` lệch thư mục, `kind` sai chỗ, `owners` lệch CODEOWNERS); SC-CON-2 nhận `waivers` có hạn (bắt buộc `expires`, miễn đúng luật, in ra bảng điểm). Waiver hiện có: STD-MOD-2 (Quỹ, Mua hàng, Thuế — A-17) và STD-ACT-6 (Kế toán: action `accounting.*` là tên công cụ MCP), hạn 2027-03-31.
- **Bản mẫu tĩnh Phân hệ và app** ([phan-he.html](docs/phases/PHASE-011-MODULE-SDK/mockups/phan-he.html)): launcher "＋ Thêm phân hệ", trang Phân hệ theo đơn vị / bản cài / app ngoài, chi tiết và tắt module, app ngoài trong iframe; checklist code CK-1…CK-20 cho 3.13, 3.14.
<!-- [2026-11-01 10:16 PM Johnny Chu - Chu Hoàng Anh] ADR-0011 — plugin ba mức tin cậy, không drop-in; lộ trình 3.13, 3.14; năng lực modules.lifecycle, apps.external (planned) -->
- **Quyết định kiến trúc plugin** ([ADR-0011](docs/adr/ADR-0011-plugin-ba-muc-tin-cay.md), chủ dự án duyệt 01/11/2026; chưa đổi mã chạy): ba mức tin cậy — module trong mã nguồn bản cài (tự host, trong tiến trình, bộ kiểm bắt buộc) · app ngoài tiến trình (khoá API có phạm vi, webhook sự kiện ký HMAC, nhúng iframe) · gói ký (Phase 5). Không drop-in (chép thư mục là chạy). Hai mức bật (bản cài × đơn vị), chỉ nạp module đúng hash bản build, migration module chạy bằng vai trò `mod_<key>_owner`, ghi sổ chỉ qua `submit`. Lộ trình thêm 3.13 (registry + vòng đời), 3.14 (app ngoài tiến trình); năng lực `modules.lifecycle`, `apps.external` (planned).
- **Ký theo vai trên mọi chứng từ** (năng lực `documents.signatures`, migration `0048`, PHASES 2.7): `ctx.documents.sign / signatures / unsign` — chữ ký gắn phiên bản hiện tại (phiên bản mới thì chữ ký cũ hết hiệu lực), chỉ người dùng đăng nhập ký (khoá API, AI không ký thay người), huỷ: người đã ký hoặc chủ đơn vị; `GET /api/v1/document-signatures`. Phiếu kế toán giữ luồng ký 4 vai cũ.
<!-- [2026-11-01 04:13 PM Johnny Chu - Chu Hoàng Anh] ADR-0010 — OpenTelemetry từ lõi (PHASE-018 W5): span ở khớp nối Platform + cổng Kernel, lọc thuộc tính, traceparent qua outbox -->
- **Truy vết OpenTelemetry từ lõi** (PHASE-018 W5, ADR-0010; mức Kernel K1 — chỉ bọc cổng `kernel/public.ts`, hành vi ghi sổ không đổi):
  - `packages/platform/src/core/tracing.ts` (tệp duy nhất import `@opentelemetry/*`): span ở mọi khớp nối — HTTP, MCP, `runAction`, cổng Kernel, câu CSDL (chỉ loại câu + bảng), phát / giao sự kiện outbox, gọi ra ngoài bằng `fetch`. Mọi span mang `bizcity.module` và `bizcity.outcome` (`ok` · `rejected` = từ chối đúng luật, không phải sự cố · `error`).
  - Thuộc tính đi qua danh sách cho phép ngay ở bộ xuất: không số tiền, tên, MST, câu SQL, token rời tiến trình.
  - `traceId` trong log, trong phản hồi lỗi (`error.traceId`, `bizcity_errors` 1.1.0-draft) và trong bằng chứng (`audit_logs.trace_id`); sự kiện outbox lưu `trace_parent` để span giao nối (link) về yêu cầu gốc — migration `0047` chỉ thêm hai cột cho phép NULL.
  - `ctx.trace.step(name, fn)` cho module tự chia bước; check SC-OBS-2 chặn module import thẳng SDK truy vết và thuộc tính ngoài danh sách.
  - Bộ giám sát thêm OTel Collector (lấy mẫu đuôi: mọi trace lỗi / chậm > 1 s + `TRACE_SAMPLE_PERCENT`%) và Tempo (7 ngày); Grafana nối trace ↔ log ↔ số đo. Không bật bộ giám sát: không gửi trace đi đâu.
- **Thiết kế OpenTelemetry từ lõi kiến trúc** ([ADR-0010](docs/adr/ADR-0010-opentelemetry-tu-loi.md), chủ dự án quyết 01/11/2026):
  - Sáu lớp bảo đảm: Accounting Kernel (ghi sổ đúng) · PostgreSQL + Audit Ledger (bằng chứng) · OpenTelemetry (hành trình thực thi) · Prometheus (sức khoẻ, hiệu năng) · Grafana + Tempo + Loki (điều tra) · Alertmanager (thông báo).
  - Span chỉ đặt ở khớp nối Platform (HTTP, MCP, `runAction`, outbox, CSDL, gọi ra ngoài), cộng một lần bọc cổng `kernel/public.ts` (K1). Mọi span mang `bizcity.module`, nên module cộng đồng tự có trace và lỗi được khoanh tới module / bước mà không sửa Kernel.
  - Thuộc tính theo danh sách cho phép; luật R-OBS-7 / R-OBS-8.
  - Ghi vào [kiến trúc §7–§8](docs/architecture/README.md) và [OBSERVABILITY §1.1](docs/ops/OBSERVABILITY.md). PHASE-018 W5 nâng P1.
- **Chứng từ dùng chung** (năng lực `documents.numbering`, `documents.versions`, `documents.links`, `documents.attachments`; PHASES 2.7, PHASE-010 S010-2): `ctx.documents.nextNumber / saveVersion / versions / link / links / attach / attachments` trong action (ghi chỉ trên docRef của chính module); migration `0045` thêm `document_versions` (chỉ thêm, băm nội dung), `document_links`, `document_attachments` (tệp trên `DATA_DIR/attachments`, sha256, gỡ = `archived_at`), có RLS. HTTP cho giao diện: `/api/v1/document-versions`, `/api/v1/document-links`, `/api/v1/document-attachments` (gửi, gỡ, tải tệp).
- **Giám sát ghi sổ, sự kiện, đối soát** (PHASE-018 W1–W4, mức Kernel K0): số đo `bizcity_postings_total` / `bizcity_posting_failures_total` đọc từ `posting_log` (chỉ phần đã commit; tách **từ chối nghiệp vụ** — kỳ khoá, không cân, thiếu cấu hình — khỏi **lỗi kỹ thuật**), outbox (`bizcity_outbox_*`), gửi lặp (`bizcity_idempotency_requests_total`), mốc + kết quả tự chẩn đoán, số đơn vị theo dải hoạt động (không lộ đơn vị), trần pool, lỗi bộ thu. Bộ thu chạy giao dịch chỉ đọc có `statement_timeout` 5 s. Dashboard mới 07 Đường sự kiện, 08 Đa đơn vị, 09 Toàn vẹn sổ; 6 cảnh báo mới (`OutboxDeadLetter`, `OutboxBacklog`, `ReconciliationStale`, `DbPoolSaturation`, `MetricsCollectorFailing`, `PostingRejectionSpike` → kênh kế toán) có test `promtool`; sổ tay xử lý [docs/ops/RUNBOOK-CANH-BAO.md](docs/ops/RUNBOOK-CANH-BAO.md); luật dò `H-METRIC-LABEL`. Đường ghi sổ không đổi.
- **Cài nhanh 3 bước** `bash scripts/cai-nhanh.sh [--giam-sat]`: tạo `.env` với `JWT_SECRET` / mật khẩu Grafana ngẫu nhiên (không ghi đè `.env` đã có), tự ghép `infrastructure/monitoring/docker-compose.desktop.yml` trên Docker Desktop, chờ `/health/ready`, in địa chỉ đăng nhập. README thêm ảnh kiến trúc Core, mục giám sát Prometheus / Grafana / Loki, mục kết nối REST API + MCP cho trợ lý AI (17 công cụ).
- **Giám sát — hoàn thiện P1** (PHASE-018): CI chạy job `monitoring` (`promtool check config` / `test rules`, `amtool check-config`); check SC-OBS-1 chặn dashboard / luật cảnh báo dùng số đo `bizcity_*` không có trong mã; dashboard 01 / 03 / 04 thêm hàng sổ & sự kiện, bão hoà pool, ghi sổ theo hành động; `LOKI_LABELDROP=tenant` bỏ nhãn đơn vị khỏi Loki cho bản cài nhiều đơn vị (promtail `-config.expand-env`); job `db-migrate` tạo vai trò `ketoan_monitor` (chỉ `pg_monitor`) cho postgres-exporter khi có `PG_EXPORTER_PASSWORD`, `cai-nhanh.sh --giam-sat` tự sinh.
- **Danh mục chuẩn đọc qua `bizcity_read`** (năng lực `data.read-views`, PHASES 2.4, PHASE-007 S007-4): migration `0044` tạo 8 khung nhìn chỉ đọc `partners`, `products`, `branches`, `warehouses`, `unit_names`, `tax_codes`, `payment_methods`, `dimensions` — theo mã (kho trả `branch_code`, cửa hàng trả `parent_code`), RLS bảng gốc vẫn áp, chặn ghi, không có tài khoản / nhóm hạch toán của Kernel, không có tài khoản ngân hàng / ngày sinh / giới tính. SC-CON-2 kiểm manifest `data.reads` trỏ khung nhìn có thật.
- **Gọi action của module khác** (năng lực `actions.call`, PHASE-012 D012-16): `ctx.actions.call(id, input)` trong action, `callAction(id, input, auth)` cho service cũ — chỉ action đọc, quyền của người gọi, mã chưa đăng ký → `NOT_FOUND`. Action mới `accounting.report.income-statement` (B02, công cụ MCP `accounting.report.income_statement`) và `accounting.report.term-rules` (nhóm tài khoản ngắn / dài hạn B01).
- **Đọc sổ qua Kernel** (PHASE-012 S012-2, PHASES 3.7, năng lực `ledger.query`): schema `bizcity_read` với ba khung nhìn chỉ đọc `ledger_entries`, `ledger_lines`, `ledger_balances_daily` (migration 0043; RLS bảng gốc vẫn áp, ghi qua khung nhìn bị chặn); `ledgerQuery.query` hỏi số dư / phát sinh theo mã tài khoản, đối tượng, chi nhánh, chiều phân tích, mã hàng; `ctx.ledger.query` trong action. Mọi báo cáo, phân hệ, add-in, danh mục chuyển sang đọc khung nhìn; bộ kiểm SC-KERNEL-7 chặn đọc thẳng bảng `ledger_*` ngoài Kernel. `bizcity_ledger_intake` 1.1.0 (§7.1). Số liệu báo cáo không đổi.
- **Workflow khai báo** (PHASE-012 S012-1, PHASES 3.5, năng lực `documents.workflow`): luồng duyệt chứng từ khai bằng tệp `<loại>.workflow.yaml` (trạng thái thuộc 5 nhóm chuẩn, chuyển, quyền, duyệt nhiều cấp theo ngưỡng, tách nhiệm, chỉ người lập, bắt buộc lý do). Yêu cầu thanh toán và chứng từ mua hàng chạy theo YAML; hành vi, thông báo, đường dẫn giữ nguyên. `bizcity_document` 1.1.0-draft (§5.1).
- **Gợi ý lý do định khoản** (PHASE-012 S012-4, PHASES 3.12): `GET /api/v1/posting/reasons/suggest` (công cụ MCP `accounting.posting.reason_suggest`, AI đọc được) xếp hạng lý do tất định từ từ khoá / ví dụ của gói, tên lý do, lịch sử của chính đơn vị; `GET /api/v1/posting/reasons/readiness`. Manifest module khai `ledger.submits[].reasons` (`bizcity_module` 1.1.0-draft), bộ kiểm SC-CON-2 kiểm.
- **Gói định khoản nền** `db/packs/vn-tt99-nen.posting-pack.json` (S012-3b): cấu hình định khoản mặc định của đơn vị mới chuyển từ `seed.ts` sang gói; đơn vị mới nhận đúng dữ liệu như trước (đã so 49 dòng). `bizcity_posting_template` 1.1.0-draft: `paymentMethods[].receivable`.
- **Gói định khoản cài / xem trước / gỡ** (PHASE-012 S012-3, PHASES 3.11, `bizcity_posting_template@1` §5): `GET /api/v1/posting/packs`, `POST /api/v1/posting/packs/install` (`?dryRun=1` xem trước từng mục thêm / ghi đè / giữ / xung đột), `POST /api/v1/posting/packs/uninstall`; quyền `settings:write`. Mục đang khác cấu hình của đơn vị được giữ, trừ khi chọn ghi đè. Cài / gỡ phát hành một bản chính sách kế toán (ADR-0009 Q-5) — chứng từ trước ngày hiệu lực vẫn định khoản theo bản cũ. Năng lực `templates.posting` → available.
- **MCP `accounting.journal.post`** (PHASE-009 S009-2, Q009-1 a): trợ lý AI đề xuất phiếu kế toán / thu / chi **nháp** — sự việc `pending`, 0 bút toán, xem trước là bút toán dựng thử; người có quyền duyệt `POST /api/v1/vouchers/:id/approve` (action `accounting.journal.approve`, `ai: deny`) mới ghi qua eventStore. G2-04 đủ 3 công cụ ghi.
- **Chữ ký kiến trúc và dấu thay đổi (R-SIG)**: [docs/rules/RULE-SIGNATURE.md](docs/rules/RULE-SIGNATURE.md), bộ kiểm SC-SIG-1 (mọi tệp framework có chữ ký Johnny Chu – Chu Hoàng Anh) và SC-SIG-2 (đúng khuôn, không tên agent), công cụ `scripts/ky-dau.mjs`, `.github/copilot-instructions.md`. Ký bù 694 dấu lên 333 tệp framework theo giờ commit thật của từng phase (biên bản `docs/audits/AUDIT-2026-10-30-CHU-KY.md`).
- **Cô lập đơn vị ở tầng CSDL (RLS)** (PHASE-007, migration `0041`): mọi bảng có `tenant_id` (84 bảng) bật Row Level Security + FORCE + chính sách `tenant_isolation`; kết nối của một yêu cầu tự gắn đơn vị đã xác thực, nên một truy vấn quên lọc `tenant_id` cũng không đọc / ghi được dữ liệu đơn vị khác. Việc nền (migration, seed, dispatcher, đăng nhập) chạy như cũ. Tự chẩn đoán `TENANT_ISOLATION`. Migration chạy bằng kết nối riêng, không mượn pool của API.
- **Chính sách kế toán có phiên bản và ngày hiệu lực** (PHASE-005, ADR-0009, migration `0040`): mỗi bút toán định khoản theo luật và mỗi dòng nhật ký định khoản ghi phiên bản chính sách đã dùng; lịch sử ở `GET /api/v1/posting/policy/versions`; đổi chế độ bằng `POST /api/v1/posting/policy/publish` (ngày hiệu lực, ghi chú, không vào kỳ đã khoá). Tự chẩn đoán `POLICY_VERSION`.
- **Khôi phục tới một thời điểm (PITR)** (PHASE-008): `infrastructure/backup/docker-compose.pitr.yml` bật lưu WAL liên tục (chỉ cần PostgreSQL), `scripts/sao-luu-goc.sh` sao lưu gốc + dọn WAL cũ, `scripts/dien-tap-pitr.sh` diễn tập trên container tạm (khôi phục tới mốc T, kiểm sổ, đo RTO / RPO). Máy dev: RTO 8 giây, RPO ≤ 60 giây với 13.428 bút toán.
- **Trợ lý AI lập chứng từ nháp và đề xuất huỷ qua MCP** (PHASE-009): `accounting.document.create_draft` (bán, mua, thu, chi… theo khuôn nạp sổ) và `accounting.entry.reverse`. Luôn xem trước bút toán rồi người dùng xác nhận; kết quả luôn chờ kế toán duyệt ở ACC14, kể cả khi loại chứng từ đặt chế độ "Tự động". AI không duyệt, không khoá kỳ, không đổi cấu hình.
- **Sự kiện miền — transactional outbox** (PHASE-006, PHASES 3.4, migration `0039`): sự kiện ghi cùng giao dịch với dữ liệu, dispatcher trong tiến trình API giao ít nhất một lần, chống xử lý trùng, thử lại giãn nhịp, hết lượt → `dead` (tự chẩn đoán `EVENT_DEAD`), phát lại có bằng chứng (`POST /api/v1/system/events/replay`), xem tình trạng (`GET /api/v1/system/events`). Kernel phát `bizcity.ledger.entry.posted` / `.reversed`, `bizcity.period.locked` / `.unlocked`; đồng hồ `bizcity.clock.daily` / `.hourly`. Header `X-Correlation-Id` (mặc định mã yêu cầu) được ghi vào bằng chứng và sự kiện.
- Báo hệ thống bán hàng "danh mục đổi" nay đi qua outbox: không mất khi khởi động lại, tự thử lại khi bên kia lỗi, gửi kèm `Idempotency-Key`.
- **Một cửa ghi sổ cho sự việc Kernel tự lập** (PHASE-004, PHASES 2.1): phiếu kế toán tay, số dư đầu kỳ, kết chuyển, khấu hao / phân bổ, giá vốn ghi sổ qua `eventStore` (`modules/documents/event-store.ts`), không gọi thẳng `ledgerService`. Sổ không đổi (so 194 ô sổ cái trước / sau: trùng). Kết chuyển và giá vốn nay có `posted_version` và nhật ký định khoản như chứng từ khác; migration `0038` điền `posted_version` cho dữ liệu cũ. Tự chẩn đoán "sự việc đã ghi sổ có bút toán" không còn báo nhầm phiếu chuyển / điều chỉnh kho tổng tiền 0.
- Thư mục phase `docs/phases/PHASE-001…017`: mỗi việc lộ trình và mã checklist G thuộc đúng một phase (check SC-PHASE-1). Đánh giá codebase so với kiến trúc: `docs/audits/AUDIT-2026-10-30-KIEN-TRUC.md`. Lộ trình thêm việc 2.14 (chính sách có phiên bản), 2.15 (PITR), 2.16 (MCP ghi).
- Giấy phép **GPL-2.0-or-later** (`LICENSE`, cùng giấy phép với `bizcity-twin-ai`) và chính sách nhãn hiệu `TRADEMARK.md`. Trước đó repository chưa có giấy phép.
- Bộ chuẩn framework: CANON, luật `R-*`, hợp đồng `bizcity_*@N`, Bizcity Framework Standard v1 (7 hợp đồng module), ADR-0001..0006.
- Bộ kiểm chuẩn `tests/conformance/` gồm hai lane chạy song song:
  - selfcheck: tĩnh, không cần CSDL;
  - diagnostics: CSDL thật, chỉ đọc.

  Kèm theo: bảng điểm, danh sách nợ bánh cóc, tự kiểm trên dữ liệu mẫu, chế độ `--module`.
- Hợp đồng đề xuất:
  - `bizcity_posting_template@1` (gói định khoản theo ngành);
  - `bizcity_mcp@1` (công cụ MCP cho Cell / chatbot).
- Tài liệu: kết nối Cell bằng khoá 1API, port channel-gateway.
- Luật mới:
  - R-KER: thay đổi Kernel;
  - R-SEC: bảo mật;
  - R-REL: phát hành;
  - R-DIAG: tự chẩn đoán.
- `SECURITY.md`, `CHANGELOG.md`.
- Tra cứu mã số thuế: `DOANHNGHIEP_API_KEY`, `TAX_LOOKUP`.
- Đọc hoá đơn nhà cung cấp bằng dịch vụ AI: `INVOICE_AI_URL`, `INVOICE_AI_KEY`, `INVOICE_AI_TIMEOUT_MS`.
- `GET /api/v1/system/health` trả thêm `version`, `kernel`, `standard` (R-REL-1).
- Guard `requireUser()`, `requireAuthenticated()` cho route tự phục vụ (R-API-6).
- Migration `0030_hoa_don_ncc.sql`: bảng `supplier_invoices`, `supplier_invoice_lines`, `supplier_item_aliases` mà code Hoá đơn NCC đã dùng nhưng chưa có migration (khuôn theo `db/types.ts`).
- Migration `0032_vai_tro_ung_dung.sql`: vai trò CSDL `ketoan_app` cho API (không superuser, không sở hữu bảng); biến `DB_APP_USER`, `DB_APP_PASSWORD` (R-SEC-6).
- Phase 1:
  - nhãn lớp `// @bizcity-layer` ở mọi tệp `apps/api/src` (R-BOUND-10, `scripts/gan-nhan-lop.mjs`, SC-LAYER-1);
  - đồ thị phụ thuộc theo lớp, mốc `docs/audits/deps-2026-10-30.*` (`scripts/do-thi-phu-thuoc.mjs`, SC-LAYER-2);
  - bản nháp API `packages/module-sdk/API.md`.
- Tự chẩn đoán trong app (PHASES 2.10, RULE-SELF-DIAGNOSTICS):
  - `GET /api/v1/system/health/ready` (L1: migration, trigger bảo vệ sổ, CSDL ghi được); Docker healthcheck của `api` dùng điểm này;
  - `GET /api/v1/system/diagnostics` (L3 toàn vẹn sổ, quyền `reports:read`) và lịch sử `…/diagnostics/runs`;
  - bảng chỉ thêm `diagnostic_runs` (migration `0034_chan_doan.sql`);
  - mã lỗi mới `NOT_READY` (503).
- `GET /api/v1/system/capabilities`: bảng năng lực Bizcity Standard của bản đang chạy (PHASES 2.9).
- Test: `assertLedgerInvariants()` chạy sau mọi tệp test (PHASES 2.2).
- Runtime action `defineAction` (PHASES 2.5, `bizcity_action@1`):
  - quyền, kiểm input, giao dịch, bằng chứng tự động;
  - **chống gửi lặp** bằng header `Idempotency-Key` (bảng `action_requests`, migration `0035_action_requests.sql`);
  - chạy thử `?dryRun=1`;
  - mã lỗi mới `IDEMPOTENCY_CONFLICT`, `CAPABILITY_MISSING`, `MODULE_DISABLED`, `RATE_LIMITED`;
  - `GET /system/capabilities` liệt kê action.
- Bằng chứng chỉ thêm, có chuỗi băm (PHASES 2.6, `bizcity_evidence@1`):
  - migration `0036_bang_chung.sql`: `audit_logs` thêm cột bằng chứng; mọi dòng mới (kể cả nhật ký cũ do service ghi) vào chuỗi băm theo đơn vị;
  - **không sửa, xoá, TRUNCATE** được nhật ký thao tác;
  - action ghi trả biên nhận `meta.receipt`, ghi bằng chứng cả khi bị từ chối; `GET /api/v1/evidence/:id` kiểm lại;
  - tự chẩn đoán `EVIDENCE_CHAIN` phát hiện dòng bị sửa ngầm.
- **MCP cho trợ lý AI** (PHASES 2.11, 2.12, `bizcity_mcp@1`):
  - `POST /mcp`: Claude, ChatGPT hoặc agent khác đọc cân đối phát sinh, số dư tiền, công nợ theo đối tượng của đơn vị;
  - công cụ sinh tự động từ action, chỉ hiện công cụ người gọi có quyền;
  - ghi qua AI **luôn phải xem trước rồi người dùng xác nhận** (`confirm_token` một lần, 15 phút; migration `0037_mcp_xac_nhan.sql`);
  - bằng chứng ghi rõ "AI làm thay người dùng nào, qua kênh nào".
- **Tuyên bố tối thượng và 7 nguyên tắc kiến trúc** (Johnny Chu – Chu Hoàng Anh):
  - tuyên bố: SQL minh bạch, Accounting Core ổn định, cộng đồng tự do phát triển module nhưng không được thay đổi sự thật kế toán;
  - nguyên tắc AP-1..AP-7 khoá trong `bizcity-standard.json#principles`. Mỗi nguyên tắc trỏ tới check thực thi (SC-CMP-2). AP-6 là nợ đã biết, chờ outbox.
- **Ba lớp kiểm soát** Domain / Event / Compliance:
  - hợp đồng mới `bizcity_compliance@1`: 9 yêu cầu STD-CMP + ma trận pháp lý Việt Nam;
  - **ma trận tuân thủ tính tự động** trên bảng điểm từ `docs/standard/compliance-matrix.json` (SC-CMP-1). Ngày 2026-10-30: 59% (3 đạt, 4 một phần, 2 thiếu).
- **ADR-0007 chấp nhận: không dùng Prisma.** ADR-0008 chốt cây thư mục lean: `packages/kernel` một gói, `contracts/` theo ba lớp kiểm soát, sự kiện là gói Platform.
- **Migration** (R-DB-14..19):
  - SQL là nguồn sự thật;
  - migration đã phát hành bất biến (checksum);
  - `scripts/kiem-nang-cap.sh` + job CI `migrate-upgrade`: thử migration trên CSDL có dữ liệu sổ của bản phát hành trước;
  - migration do AI sinh không chạy production khi chưa kiểm + duyệt.
- **Bản công bố kiến trúc** (`docs/CONG-BO-KIEN-TRUC.md`, thiết kế: Johnny Chu – Chu Hoàng Anh):
  - 4 lớp hợp đồng: Domain, Capability, MCP Tool, Extension;
  - trình tự một lệnh ghi; đối chiếu mô hình 10 bước; mức ưu tiên P0–P3;
  - luật bắt buộc và checklist nhận việc 3 giai đoạn (G1–G3), kèm mẫu issue "Nhận việc".
- **Domain Contract** `bizcity_domain@1`: 22 bất biến kế toán (STD-DOM), mỗi bất biến ghi cách được bảo vệ; đổi = K3 + ADR.
- **Capability Contract**:
  - action ghi phải khai `sideEffects`;
  - `GET /api/v1/system/capabilities` công bố input / output schema, quyền, tác dụng phụ, idempotency, loại bằng chứng của từng action (STD-ACT-9).
- **MCP**:
  - công cụ của Core kế toán đổi miền `ketoan.*` → `accounting.*`;
  - thêm `accounting.balance.get` (số dư tài khoản tại một ngày, đọc thẳng sổ).
- **RULE-INFRASTRUCTURE**:
  - R-CACHE: không cache dữ liệu sổ, đọc nhất quán sau khi ghi;
  - R-OUTBOX: sự kiện cùng giao dịch, consumer idempotent;
  - R-BAK: sao lưu, PITR, kiểm khôi phục.
- `scripts/kiem-khoi-phuc.sh`: khôi phục bản sao lưu vào CSDL tạm, chạy kiểm toàn vẹn, so số dòng, ghi nhật ký (R-BAK-3).
- **Chuẩn hoá theo ADR-0007** (học từ bộ 27 gói tham chiếu, giữ sổ cái làm lõi, PostgreSQL là hạ tầng bắt buộc duy nhất):
  - **mã lỗi** `bizcity_errors@1`: danh mục máy đọc `ERROR_CATALOG` (HTTP, thử lại, thông báo, gợi ý), luật R-ERR, `details.reason`. Phản hồi lỗi có `error.requestId`;
  - **quan sát**:
    - mọi phản hồi có `X-Request-Id`; đọc `traceparent`;
    - log JSON một dòng mỗi yêu cầu (`tenant`, `actor`, `route`, `ms`, `errCode`);
    - `GET /metrics` Prometheus (HTTP, CSDL, action, MCP, sổ cái, tự chẩn đoán), có `METRICS_TOKEN` tuỳ chọn;
  - **bộ giám sát tuỳ chọn** `infrastructure/monitoring/`: Prometheus, Alertmanager, Grafana (6 dashboard), Loki + Promtail, exporter; 8 cảnh báo, trong đó có `LedgerIntegrityError`, `PostingBacklog`;
  - **cài nhanh** `bizcity_preset@1`: preset `thuong-mai-ban-le` + `scripts/cai-preset.mjs` (dữ liệu mẫu hư cấu, nạp qua API);
  - **tài liệu**: sơ đồ kiến trúc `docs/architecture/`, `CONTRIBUTING.md`, mẫu báo lỗi `.github/ISSUE_TEMPLATE/bao-loi.yml`, README mới, LAYOUT-7 / LAYOUT-8;
  - **bộ kiểm**: SC-ERR-1, SC-PRESET-1.

### Đổi
<!-- [2026-11-03 06:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 gộp main -->
- **Action trả thêm khoá vào `meta` của phản hồi** (`ctx.meta`): cổng danh mục (`gate`, `findings`, `held`) vẫn trả như trước sau khi lưu mặt hàng / đối tượng / mặt hàng catalog qua action. Khoá lõi (`requestId`, `receipt`, `idempotency`, `dryRun`) không bị đè. Gửi lặp cùng `Idempotency-Key` chỉ nhận lại dữ liệu và biên nhận, không nhận lại `gate / findings / held`.
- Sơ đồ tổ chức (thêm / sửa / xoá nút, gắn chi nhánh, khôi phục dữ liệu gốc, nhập Excel) và các "Khung Vì sao" kiểm thử khai báo mặt hàng / đối tượng / tài khoản đi qua `defineAction`; kiểm thử là action đọc.
<!-- [2026-11-03 01:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 7 -->
- **Mọi thao tác ghi qua `defineAction`** (SC-ACT-1 nay **chặn**): route ghi mới phải là action, hoặc khai `// @bizcity-route: <lý do>` ngay dòng trên (17 route cố ý giữ: đăng nhập, SSO, đổi mật khẩu, vé ứng dụng, nhịp online, MCP, mẫu in cá nhân, cửa nạp chứng từ, kéo kết nối, nạp mẫu module, dữ liệu mẫu Mua hàng). Thêm mục huấn luyện / chính sách / tệp đính kèm Mua hàng **bắt buộc `Idempotency-Key`** (giao diện đã gửi sẵn).
<!-- [2026-11-03 11:40 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 6 -->
- **Thao tác theo lô chạy trong một giao dịch, mỗi mục một SAVEPOINT** (`ctx.data.item`, `inSavepoint` ở `@bizcity/platform/core/actions`): trạm định khoản, xác nhận nhận tiền, kết chuyển (cả dây chuyền tháng sau), kết chuyển năm, tính giá vốn, bỏ định khoản hàng loạt, sinh phiếu định kỳ, nhập Excel mặt hàng. Mục lỗi vẫn được báo trong kết quả và không chặn mục khác; khác trước: các mục đúng được lưu **cùng lúc khi cả lô xong** (trước: lưu dần), và lỗi ngoài từng mục huỷ cả lô thay vì để lại phần đã chạy. Kết chuyển năm và tính giá vốn nay không còn để lại nửa chừng khi một chi nhánh lỗi.
- Cửa nạp chứng từ (`POST /api/v1/documents`, `/batch`) và kéo chứng từ từ kết nối giữ nguyên cách cũ (có lý do ghi ở route: bể chờ dùng giao dịch riêng; nguồn được báo "đã nhận" sau mỗi trang).
<!-- [2026-11-03 09:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 5 -->
- **Thêm 16 route qua `defineAction`**: mặt hàng / loại hàng, bảng giá, nạp danh mục, quét hoá đơn NCC, khoá dữ liệu, thông tin đơn vị, bút toán tài sản, kế hoạch tiền, lịch bút toán lặp, tờ khai GTGT / bổ sung / TNDN, cấu hình kết nối. Lập bút toán tài sản, dòng kế hoạch tiền, lịch bút toán lặp **bắt buộc `Idempotency-Key`**.
- Runtime action: `expose.http.query` (trường lấy từ query của POST/PUT/PATCH), `expose.http.bodyLimit`; bằng chứng không chép `input` lớn hơn 64 KB (giữ cỡ; `inputHash` vẫn đối chiếu được thân gốc).
- `PUT /api/v1/catalog/products/:sku?new=false` nay hiểu đúng là `false` (trước: `z.coerce.boolean` coi chuỗi "false" là đúng).
<!-- [2026-11-03 07:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 4 -->
- **Mua hàng qua `defineAction`** (tồn max, hoá đơn NCC, chứng từ, chính sách, ĐVT): lập phiếu mua, hoá đơn NCC, yêu cầu điều chuyển / tồn max **bắt buộc `Idempotency-Key`** (giao diện đã gửi sẵn); route xem trước / tra cứu là action đọc. **Bỏ duyệt phiếu mua chạy trong một giao dịch**: lỗi giữa chừng không còn để lại phiếu "đã duyệt" mà chứng từ kế toán đã huỷ.
- Action có thân mà mọi trường đều tuỳ chọn: gửi thiếu thân (hoặc `null`) được nhận như `{}`.
<!-- [2026-11-03 06:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 3 -->
- **Thêm 86 route ghi qua `defineAction`** (danh mục, tài sản, người dùng / khoá API, ứng dụng, thiết lập, kế hoạch tiền, thuế, mua hàng, chữ ký): đường dẫn, quyền, thân yêu cầu, mã 201 không đổi; mỗi lần ghi có bằng chứng. Action mới của phân hệ khai trong `bizcity.module.json`. Route dạng lô (mỗi mục một giao dịch, bắt lỗi từng mục) và cửa nạp chứng từ chưa chuyển.
- **Bằng chứng và bản phản hồi gửi lặp không còn chứa bí mật**: runtime che trường `password`, `secret`, `token`, `apiKey`, `key`… (`***`). Khoá API chỉ trả về một lần; gửi lặp cùng `Idempotency-Key` nhận bản đã che.
- Chỉ số SC-ACT-1 tính lại: action ghi / (action ghi + route ghi thô còn lại); cách cũ đếm cả action đọc nên vượt 100%.
<!-- [2026-11-03 03:25 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W6 đợt 2 -->
- **Route ghi của Kernel qua `defineAction`** (SC-ACT-1 35% → 54%): công nợ, phiếu nhập tay, số dư đầu kỳ, bổ sung thông tin thuế, dữ liệu gốc, kiểm thử bể chờ, kỳ kế toán / khoá kỳ, bút toán kết chuyển mẫu, cấu hình hạch toán, huỷ chứng từ. Đường dẫn, quyền, thân yêu cầu, mã 201 không đổi; mỗi lần ghi có bằng chứng của runtime. Lập phiếu, nhập số dư đầu kỳ, đối trừ tay **bắt buộc `Idempotency-Key`** (gửi lặp không lập / đối trừ hai lần — giao diện đã gửi sẵn); các thao tác còn lại chạy lại vô hại. Bổ sung thông tin thuế nay chạy trong một giao dịch (trước: hai giao dịch nối nhau).
<!-- [2026-11-03 01:20 AM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W5 -->
- **Phân hệ không còn ghi thẳng bảng của lõi** (SC-MOD-2 → 0, C-7): danh mục qua `@bizcity/platform/masterdata/catalog-ensure` (chỉ thêm mục thiếu), lý do định khoản qua Kernel `ensurePostingReason` (có bằng chứng), kỳ hợp đồng "đã chi" qua sự kiện `quy.payment-request.paid` (bên lịch hợp đồng tự cập nhật — chậm vài giây sau khi chi), chứng từ tham chiếu / cấu hình mua hàng qua hàm của bên sở hữu bảng.
- **Import giữa các lớp đúng chiều** (SC-LAYER-2 → 0): Platform / danh mục gọi Kernel và adapter qua cổng `corePort` (gắn ở `app.ts`); Kế toán, Thuế, Mua hàng dùng Tài sản / Kho qua cổng do chính phân hệ khai (`phan-he/<x>/ports.ts`); add-in Xuất Excel đọc báo cáo qua route HTTP của lõi (đầu ra CSV không đổi, có test cả 17 tệp); `readPostingModes` sang `@ketoan/contracts`.
- **Bộ máy tính Mua hàng thành gói riêng `@bizcity/mua-hang-domain`** (`modules/mua-hang/domain`, PHASES 2.8, A-06): `@ketoan/contracts/mua-hang` không còn. Code ngoài repo nhập `@ketoan/contracts/mua-hang` đổi sang `@bizcity/mua-hang-domain`; build thêm `npm run build -w @bizcity/mua-hang-domain` sau contracts.
<!-- [2026-11-01 09:52 PM Johnny Chu - Chu Hoàng Anh] PHASE-010 — gộp main (ADR-0010 OTel) vào gói: tracing / version sang @bizcity/platform, cổng @bizcity/kernel bọc trace; migration ký theo vai đổi số 0047 → 0048; 7 tín hiệu lộ trình / tuân thủ trỏ đường dẫn gói; AUDIT-2026-11-01-PLUGIN-MVP -->
- **Truy vết OpenTelemetry theo gói** (PHASE-010 + ADR-0010): `core/tracing.ts`, `core/version.ts` thuộc `@bizcity/platform` (`packages/platform/src/core/`), phụ thuộc `@opentelemetry/*` chuyển sang gói Platform; cổng `@bizcity/kernel` (`packages/kernel/src/index.ts`) bọc `traceKernelApi / traceKernelFn` như `kernel/public.ts` của main. Check SC-OBS-2 quét cả `packages/platform`, `packages/kernel`.
- **Migration ký theo vai đổi số `0047` → `0048_ky_chung_tu_chung.sql`** (số `0047` đã phát hành trên `main` cho `0047_truy_vet.sql`). Nội dung không đổi; CSDL đã chạy nhánh này trước khi gộp xem "Nâng cấp cần làm".
- **Tín hiệu máy của lộ trình / ma trận tuân thủ trỏ đường dẫn gói**: 7 tín hiệu `fileContains` (C-4 ×2, C-8 ×2, C-9, 2.10, 2.13, 2.14) còn trỏ `apps/api/src/...` sau tách gói nên báo ✘ giả — trỏ sang `packages/kernel`, `packages/platform`; C-4 / C-8 / C-9 về đạt, Phase 2 13/16.
- **Biên bản [AUDIT-2026-11-01-PLUGIN-MVP](docs/audits/AUDIT-2026-11-01-PLUGIN-MVP.md)**: Kernel ổn định ~85%, plugin runtime ~15%; phản biện "drop-in kiểu WordPress"; P0-1..P0-3, P1-1..P1-5; lộ trình PR-P0, PR-0…PR-8 theo phase 011 / 013 / 014; mockup launcher "＋ Thêm phân hệ".
- **Gói `@bizcity/kernel`** (`packages/kernel`, PHASES 2.3, PHASE-010 D010-9): toàn bộ Accounting Kernel (60 tệp: cửa nạp, định khoản, sổ cái, kỳ, sổ phụ, thuế, kết chuyển, dữ liệu gốc) dời khỏi `apps/api/src`; gốc gói là cổng công khai (trước là `apps/api/src/kernel/public.ts`, nay là tệp chuyển tiếp). Phân hệ, add-in không phải đổi import. Kernel không còn import adapter kết nối / báo cáo kho (bộ chuẩn hoá chứng từ đẩy vào đăng ký ở `app.ts`; route báo cáo kho tách sang module kho, đường dẫn API như cũ).
- **Gói `@bizcity/platform`** (`packages/platform`, PHASE-010 D010-8, bước của PHASES 2.3): 22 tệp Platform Kernel cần (lỗi chuẩn, HTTP, quyền, bằng chứng, runtime action, sự kiện, số đo, kết nối / migration / kiểu CSDL, cấu hình, chẩn đoán, ký, hai hàm danh mục) dời khỏi `apps/api/src`; đường cũ là tệp chuyển tiếp nên mã của phân hệ / nhánh đang mở không phải đổi. Dev / test chạy thẳng mã nguồn của gói (điều kiện `development`); bản chạy thật build `dist`.
- **Đính kèm Mua hàng chạy trên đính kèm chung** (migration `0046`, PHASES 2.7, A-19): dòng `purchase_attachments` chép sang `document_attachments` (docRef `mua-hang.<loại chủ>:<mã>`, `legacy_ref` đối chiếu), tệp giữ nguyên chỗ trên ổ (`DATA_DIR/dinh-kem`), băm sha256 ở lần tải đầu. API `/api/v1/purchase/attachments` giữ khuôn; xoá tệp nay là gỡ (lưu trữ, không xoá cứng). Bảng `purchase_attachments` khoá thêm / sửa, giữ để đối chiếu.
- **Một chỗ cấp số chứng từ**: phiếu kế toán tay, đề nghị thanh toán (`quy`), phiếu mua hàng lấy số từ `documentNumbers.next` của Kernel thay vì tự ghi `document_sequences`. Khoá dãy và khuôn số giữ nguyên — không nhảy số.
- **Báo cáo về phân hệ Kế toán** (PHASE-012 Q012-2): `apps/api/src/modules/reports` → `apps/api/src/phan-he/ke-toan/reports`. `documentChecks` (kiểm trước khoá kỳ) về Kernel `modules/periods/document-checks.ts`. Thuế đọc B02 / bảng dài hạn qua action, add-in Bảng tính AI qua `accounting.report.trial-balance`; báo cáo hàng hoá tách: lãi gộp → `phan-he/ban-hang/gross-profit.ts`, chuyển kho → `phan-he/kho/stock-transfers.ts`, kết quả theo cửa hàng ở lại `ke-toan/reports`; `kho`, `mua-hang` lấy route qua `GOODS` (`phan-he/loi.ts`). Đường dẫn API, số liệu báo cáo không đổi. Chi phí theo chiều phân tích gom theo bí danh cột, bỏ `sql.raw`.
- **Cổng công khai của Kernel** (PHASE-010 W1): ngoài Kernel chỉ import Kernel qua `apps/api/src/kernel/public.ts`; 21 tệp đã chuyển; bộ kiểm SC-KERNEL-6 chặn import thẳng mới. Chuẩn bị tách gói `packages/kernel` mà không sửa nơi gọi.
- Yêu cầu thanh toán chạy trên runtime action (mẫu đầu tiên). Đường dẫn và khuôn phản hồi giữ nguyên, nhưng:
  - `POST /api/v1/payment-requests` và `…/:id/pay` **bắt buộc** header `Idempotency-Key`. Giao diện tự gửi: bấm đúp "Ghi" / "Chi" không còn tạo yêu cầu hay phiếu chi trùng;
  - `…/:id/pay?dryRun=1` xem trước phiếu chi rồi huỷ;
  - nhật ký thao tác ghi theo mã action (`quy.payment-request.create`…), thay cho `payment_request.create`.
- **Khoá kỳ bị chặn khi sổ trong kỳ có lỗi toàn vẹn** (R-DIAG-4):
  - lỗi gồm Nợ ≠ Có, số dư ngày lệch, đảo sai, bút toán mồ côi, sự việc lệch phiên bản;
  - muốn vẫn khoá: ghi lý do chấp nhận (ít nhất 10 ký tự), lý do lưu vào nhật ký khoá;
  - bảng kiểm trước khi khoá có thêm mục "Lỗi toàn vẹn sổ".
- `POST /api/v1/auth/logout-others` khai `requireUser()` (khoá API → `403 FORBIDDEN`, như service vốn kiểm). `/api/v1/presence*` khai `requireAuthenticated()` — hành vi không đổi.
- Mua hàng → dữ liệu mẫu tạo kho mặc định qua dịch vụ danh mục kho của lõi (có ghi nhật ký), thôi ghi thẳng bảng `warehouses`.
- `0028_thue_kkkn.sql` đổi số thành `0031_thue_kkkn.sql` (sửa trùng số, A-03); `migrate.ts` ghi nhận tên mới cho bản cài đã áp tên cũ, không chạy lại.
- Khuôn nạp sổ đổi tên từ `bizcity_event@1` thành `bizcity_ledger_intake@1`. Tên `bizcity_event@1` từ nay dành cho sự kiện miền.

### Sửa
<!-- [2026-11-03 09:07 AM Johnny Chu - Chu Hoàng Anh] PHASE-022 — DG-PLAN-1 -->
- **DG-PLAN-1 báo công nợ lệch sổ giả trên mọi đơn vị cài mới**: câu lấy phát hiện lọc tài khoản theo `accounts.is_debt` (hệ thống tài khoản seed để `false` cho 131 / 331), khác câu đếm và kiểm `DEBT_MATCH_LEDGER` trong ứng dụng (lọc theo tài khoản có `debt_items`); nay cùng một định nghĩa. Phát hiện khi chạy bộ 25 trường hợp mua hàng trên đơn vị sạch: đối chiếu 331 lệch 0, lane báo 5 NCC lệch.
<!-- [2026-11-02 11:50 PM Johnny Chu - Chu Hoàng Anh] R-ERR -->
- **Lỗi sai khuôn không nói trường nào sai**: năm chỗ (nộp chứng từ trong giao dịch, gói định khoản, phiếu nháp, phân hệ mua hàng ×2) trả `details` dạng object `flatten()` nên giao diện chỉ hiện "không đúng khuôn"; nay là mảng câu `<trường>: <vì sao>` qua `zodIssueTexts` (BIZCITY-ERRORS 1.2.1-draft).
<!-- [2026-11-02 11:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 lần 0 -->
- **Module đọc danh mục qua `data.reads`** (khung nhìn `bizcity_read.*`, `security_invoker`): trước đây báo "permission denied for table …" vì vai trò `mod_<key>_rw` chỉ có quyền trên khung nhìn. Nay trình cài cấp SELECT đúng các cột khung nhìn dùng trên bảng gốc (RLS vẫn lọc theo đơn vị). Chạy lại `module migrate <key>` cho module đã cài.
- **Template module**: `npm run build` chép tệp không phải `.ts` của `api/` (workflow YAML) sang `dist/api`.
- `GET /api/v1/documents?voucherInfo=false` trước vẫn kèm thông tin phiếu (`z.coerce.boolean()` coi chuỗi "false" là true); nay dùng `queryBool`.
- Đính tệp vào hoá đơn NCC (`ownerType: invoice`) báo lỗi CSDL: bảng `purchase_attachments` chỉ nhận partner / document / policy. Hết lỗi khi chuyển sang đính kèm chung (0046).
- Kiểm nâng cấp (`scripts/kiem-nang-cap.sh`) xác nhận:
  - mọi bản trước commit `ccfc341` (gồm `main` 23a834c) **không cài mới được trên CSDL sạch**: code dùng `users.session_version`, `products.parent_manual` khi chưa có migration;
  - nhánh này sửa bằng migration 0029, 0033 và chặn tái phát bằng SC-DATA-7;
  - bản phát hành đầu tiên từ nhánh này là mốc nâng cấp đầu tiên dùng được.
- Lỗi do trigger bảo vệ sổ / bằng chứng ném ra (sửa, xoá bút toán; bút toán không cân) trước đây trả **500 Lỗi hệ thống**; nay trả `CONFLICT` (reason `LEDGER_APPEND_ONLY`) hoặc `UNBALANCED_ENTRY` kèm câu tiếng Việt của trigger (R-ERR-8).
- Migration `0033_ma_hang_cha_sua_tay.sql`: cột `products.parent_manual` code đã dùng nhưng chưa có migration — thêm / sửa mặt hàng (và Mua hàng, ĐVT, tồn max dùng tới) báo "column parent_manual does not exist".
- Vé đăng nhập cấp trước khi có cơ chế thu hồi phiên (không ghi `sv`) bị từ chối ngay: code coi thiếu `sv` = 1 trong khi `users.session_version` mặc định 0 (migration 0029). Nay thiếu `sv` = 0, dùng được tới lần thu hồi đầu như thiết kế.
- Bộ kiểm thêm SC-DATA-7 (`db/types.ts` ↔ migration) để lỗi "khai kiểu mà quên migration" bị chặn ở CI.

### Thay đổi định khoản
<!-- [2026-11-04 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — S024-8 (R-ITEM-7), PHASE-026 T026-G2 -->
- **Định khoản theo phân loại hạch toán CỦA NGÀY chứng từ (mức K3, R-ITEM-7, PHASE-024 S024-8):** nhóm hạch toán và thuế bán ra của mặt hàng nay lấy từ bản phân loại có hiệu lực **tại ngày hạch toán** của chứng từ (qua định danh, nên mã cũ đã đổi vẫn tra ra), không còn lấy giá trị hiện tại ở danh mục. Trước đây đổi nhóm hạch toán của một mặt hàng rồi **định khoản lại** chứng từ cũ thì chứng từ cũ ra theo nhóm MỚI (tài khoản doanh thu, giá vốn đổi theo). Nay: chứng từ trước ngày đổi định khoản — kể cả định khoản lại — theo nhóm cũ, từ ngày đổi theo nhóm mới; sổ đã ghi vẫn không đổi (chỉ thêm). Mặt hàng chưa từng đổi nhóm, mặt hàng nháp và mã chưa có định danh: như cũ. Áp cả ở tính giá vốn (theo ngày cuối tháng). Ca chứng minh T026-G2: [dinh-khoan-phan-loai-theo-ngay.test.ts](apps/api/test/dinh-khoan-phan-loai-theo-ngay.test.ts) (bỏ bản sửa thì ca đỏ: chứng từ cũ ra 51112 thay vì 51111).
- **Luật định khoản mới `manual_journal` (mức K2, PHASES 3.15; đặc tả [50-DAC-TA-MANUAL-JOURNAL](docs/phases/PHASE-011-MODULE-SDK/50-DAC-TA-MANUAL-JOURNAL.md) phương án A, chủ dự án duyệt K1 / K3 / K4 theo ý kiến kế toán trưởng 02/11/2026):** mỗi dòng Nợ `debit_account` / Có `credit_account` của lý do journal, cả phiếu một bút toán; đối tượng theo dòng hoặc theo phiếu, tài khoản theo dõi đối tượng thiếu đối tượng → chặn; chế độ mặc định **chờ duyệt** ở ACC14. Chỉ áp cho loại chứng từ mới này — sổ và chứng từ đã có không đổi.
- **Định khoản theo chính sách của ngày hạch toán (mức K3, ADR-0009):** chứng từ (cả khi định khoản lại) dùng phiên bản cấu hình định khoản có hiệu lực ở ngày hạch toán của nó.
  - Sửa cấu hình như trước vẫn có tác dụng ngay (hệ thống tự chụp bản bổ sung của chế độ đang áp).
  - Chỉ khi **phát hành** chế độ mới kèm ngày hiệu lực thì chứng từ trước ngày đó mới tiếp tục theo chế độ cũ.
  - Bản đầu = cấu hình đang dùng: sổ đã có không đổi (đã so 128 ô sổ cái trước / sau: trùng).
- Luật định khoản, tài khoản, giá vốn: không đổi.
- **Khoá kỳ (mức K2, RULE-KERNEL):** khoá kỳ bị chặn khi tự chẩn đoán L3 có lỗi trong kỳ (R-DIAG-4).
  - Không đổi bút toán đã ghi, không đổi khoá đã có.
  - Bản cài có sổ lệch sẽ thấy lỗi khi khoá tháng tới: xem `GET /api/v1/system/diagnostics?from&to`. Chấp nhận thì ghi lý do.

### Nâng cấp cần làm
<!-- [2026-11-04 12:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — B2b -->
- Migration `0066` điền `item_id` cho toàn bộ dòng sổ / kho / giá vốn (theo mã có hiệu lực tại ngày của dòng). Mã có trong sổ / kho mà không có trong danh mục mặt hàng được tạo thành **mặt hàng mồ côi** (ngừng dùng, `attributes.orphan`) — khai lại mã đó thì nhận lại đúng định danh. Sổ lớn: chạy thử trên bản sao trước (PHASE-024 · 70 §3.2.1 G6). <!-- [2026-11-04 05:30 AM Johnny Chu - Chu Hoàng Anh] PHASE-024 — G6 (chủ chọn B: không viết lại 0065) --> **Thời gian điền định danh** (migration 0065 điền từ danh mục mặt hàng, ~0,8 ms một mặt hàng): 20.985 mặt hàng ≈ 17 giây · 100.000 ≈ 80 giây · 1.000.000 ≈ 13 phút. Bản cài có hơn vài trăm nghìn mặt hàng: lên lịch cửa sổ bảo trì và chạy thử trên bản sao; migration chạy trong một giao dịch, dừng giữa chừng thì quay lại như chưa chạy. Ước lượng: `SELECT count(*) FROM products` × 0,8 ms.
<!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W4 -->
- Chạy migration `0060_thong_bao` (chỉ thêm hai bảng `notifications`, `notification_reads`). Hợp đồng `bizcity_extension` 1.3.0-draft: hook `document.beforeTransition` bỏ (chưa module nào dùng).
<!-- [2026-11-02 09:33 PM Johnny Chu - Chu Hoàng Anh] PHASE-014 — W3 -->
- Workspace npm thêm `modules/*` (mỗi module SDK là một gói) và hai gói `packages/ui-kit`, `packages/cli`: chạy `npm install`. Image API / web nay chép thư mục `modules/`; job cài đặt (`db-migrate`) tự chạy migration của từng module SDK trước khi ghi registry. Bản cài không có module SDK: không đổi gì.
<!-- [2026-11-02 10:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — W1–W4 -->
- Chạy migration `0057_vai_tro_kiem_soat` (chỉ nới ràng buộc `users_role_check` thêm `auditor`). Kế toán trưởng, kế toán có thêm quyền `review:read` (Bàn đánh giá); `viewer` không có.
<!-- [2026-11-02 05:10 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — ADR-0016 -->
- Chạy migration `0056_duyet_rulepack` (chỉ thêm bảng `rulepack_approvals`). Muốn có kết luận PASS / FAIL thay vì "Chờ duyệt" thì chủ đơn vị / kế toán trưởng duyệt rulepack ở Hệ thống → Kiểm chuẩn.
<!-- [2026-11-02 02:20 PM Johnny Chu - Chu Hoàng Anh] PHASE-020 — đổi số khi gộp main: hồ sơ kế toán 0051, kiểm chuẩn 0052 (0050 là vai trò developer của PHASE-019). -->
<!-- [2026-11-02 03:50 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — migration 0051, image có gói vn-rulepacks -->
- Chạy migration `0055_kiem_chuan` (chỉ thêm bảng `conformance_runs`). Dựng lại image API: image nay chép `packages/vn-rulepacks` (kho rulepack cho Kiểm chuẩn). Vai trò `chief_accountant`, `accountant` có thêm `conformance:read` + `conformance:run`, `viewer` có `conformance:read`; khoá API phạm vi `reports:read` đọc được kết quả Kiểm chuẩn.
<!-- [2026-11-02 02:10 AM Johnny Chu - Chu Hoàng Anh] PHASE-020 — migration 0049 -->
- Chạy migration `0054_ho_so_ke_toan` (chỉ thêm bảng `accounting_profiles`, không đổi dữ liệu cũ). Sau cập nhật, mỗi đơn vị khai hồ sơ kế toán một lần (`accounting.profile.publish`); chưa khai thì mọi việc ghi sổ vẫn như cũ, chỉ Conformance báo "chưa khai".
- Migration `0052_registry_module.sql` (`module_registry`, `tenant_modules`, trạng thái giao `skipped`): job `db-migrate` tự áp và tự ghi registry. Bản thật sửa tay tệp trong thư mục phân hệ mà không dựng lại → API bỏ phân hệ đó; chạy `npm run module -w @ketoan/api -- sync` sau khi dựng.
- Migration `0051_ung_dung_ngoai.sql` (bảng `app_installations`, cột `api_keys.app_key`): chạy tự động khi cập nhật. Đổi `JWT_SECRET` từ nay đổi luôn bí mật webhook và vé iframe của app: sau khi đổi, xoay khoá từng app đã kết nối.
- **Bắt buộc `DB_APP_PASSWORD` trong `.env`** (P0-3): `docker compose` dừng nếu thiếu. `bash scripts/cap-nhat.sh` / `bash scripts/cai-nhanh.sh` tự sinh cho bản cài cũ; tự cập nhật bằng tay thì thêm `DB_APP_PASSWORD=<openssl rand -hex 24>`. API chuyển từ vai trò sở hữu sang `ketoan_app` — tích hợp tự viết đang dựa vào quyền superuser của API (tắt trigger, TRUNCATE) sẽ bị từ chối.
- Migration `0049` chặn mọi `UPDATE` / `DELETE` trực tiếp vào `ledger_entries`, `accounting_events` ngoài các lối của Kernel. Script vận hành tự viết sửa thẳng hai bảng này sẽ lỗi `insufficient_privilege` — dùng bút toán đảo / cửa nạp (xoá sạch một đơn vị vẫn qua `scripts/xoa-chung-tu.sh`).
- CSDL đã chạy nhánh `feat/phase-0-tiep` **trước** khi gộp `main` (có dòng `0047_ky_chung_tu_chung.sql` trong `schema_migrations`): đổi tên dòng đó thành `0048_ky_chung_tu_chung.sql` rồi `npm run db:migrate` (áp `0047_truy_vet.sql`). Bản cài từ `main` không bị ảnh hưởng.
- Dựng từ mã nguồn: `npm install` (liên kết gói mới `@bizcity/platform`, `@bizcity/kernel`), rồi `npm run build` (đã gồm build gói). Image Docker tự làm.
- Bản dựng API chép thêm tệp `*.workflow.yaml` vào `dist` (`npm run build -w @ketoan/api` tự làm; image Docker dựng như cũ). Tự dựng không qua `npm run build` thì phải chép tệp này, thiếu thì API không khởi động.
- Migration `0036` cập nhật cột `actor_kind` cho toàn bộ `audit_logs` cũ một lần: bảng lớn thì job `db-migrate` chạy lâu hơn thường. Sau đó nhật ký thao tác **chỉ thêm**: không xoá được đơn vị đã có nhật ký (như sổ cái).
- Migration `0042` thêm bảng `config_packs` (gói định khoản đã cài, có RLS). Không đổi dữ liệu cũ.
- Image API chép thêm `db/packs` (gói nền). Lần chạy job `db-migrate` đầu sau khi nâng cấp: đơn vị seed ghi nhận "đã cài gói nền" (mọi mục giữ nguyên, không đổi cấu hình). Triển khai tự dựng: nhớ chép thư mục `db/packs` (hoặc đặt `PACKS_DIR`).
- Migration `0047` thêm `event_outbox.trace_parent`, `audit_logs.trace_id` (cho phép NULL, chỉ đổi catalog — chạy tức thì; không vào chuỗi băm bằng chứng). Bộ giám sát có thêm hai dịch vụ `otel-collector`, `tempo` (+ `tempo-init` chạy một lần): `docker compose … up -d` như cũ (ADR-0010).
- **Bắt buộc trên bản cài thật từ migration `0041` (RLS):** đặt `DB_APP_USER=ketoan_app` + `DB_APP_PASSWORD` (≥ 16 ký tự) trong `.env` rồi `docker compose up -d` (DEPLOY D-9, R-SEC-6). Không đặt thì API chạy bằng vai trò sở hữu mặc định của Docker — superuser, luôn vượt RLS: cô lập đơn vị ở tầng CSDL không có hiệu lực.

### Bảo mật
- **Khoá app chỉ ghi qua cửa nạp** (PR-2b, cổng `APP_WRITE_ROUTES`): khoá app gọi mọi route đọc theo quyền nhưng chỉ ghi được `POST /documents`, `/documents/batch`, `/documents/submit`, `/documents/cancel` (chứng từ của app) và đổi vé; phiếu tay, số dư đầu kỳ, tài khoản, thuế, MCP và route ghi thêm sau này đều trả 403. App không xin được `catalog:write`.
- **Khoá app có phạm vi** (PR-2b): khoá của app ngoài tiến trình không bao giờ có quyền quản trị, duyệt chi, khoá kỳ, sửa phiếu người khác; kết nối tắt hoặc bản cài gỡ app → khoá bị từ chối. Vé iframe ký bằng khoá dẫn xuất riêng, không dùng làm phiên đăng nhập được. Bí mật webhook không lưu ở CSDL.
<!-- [2026-11-01 10:55 PM Johnny Chu - Chu Hoàng Anh] PHASE-004 / PHASE-006 / PHASE-001 — PR-P0 (AUDIT-2026-11-01): 0049 khoá đầu bút toán + sự việc, subscriber gắn đơn vị, API mặc định ketoan_app; bản mẫu Phân hệ -->
- **Đầu bút toán và sự việc kế toán khoá ở tầng CSDL** (P0-1, migration `0049_khoa_dau_but_toan.sql`): `ledger_entries` không xoá được; sửa chỉ ba lối của Kernel (đảo `posted` → `reversed`, cập nhật thông tin đầu E2, điền giá vốn E1). `accounting_events` không xoá, không đổi `doc_key` / nguồn / người lập, không lùi phiên bản; `accounting_event_versions` chỉ thêm. Trước đây chỉ chặn TRUNCATE (A-07).
- **Subscriber chạy gắn đơn vị của sự kiện** (P0-2): trước đây giao sự kiện với `bizcity.tenant_id` rỗng → RLS mở, subscriber đọc được dữ liệu mọi đơn vị (thử thật: 33.896 sự việc của đơn vị khác). Nay pool đặt đơn vị cho cả giao dịch giao.
- **API mặc định chạy bằng vai trò `ketoan_app`** (P0-3, R-SEC-6): không superuser, RLS có hiệu lực, không tắt được trigger sổ. CI chạy toàn bộ test dưới `DB_SET_ROLE=ketoan_app`.
- Bộ giám sát: `GRAFANA_ADMIN_PASSWORD` thành biến **bắt buộc** — thiếu thì `docker compose` dừng và báo, không còn mật khẩu mặc định `doi-mat-khau-ngay` (PHASE-018). Bản cài đã bật giám sát mà chưa đặt biến: thêm vào `.env` trước khi `up`.
- Trace (ADR-0010): thuộc tính span qua danh sách cho phép trước khi rời tiến trình (không số tiền, tên, MST, câu / tham số SQL, header xác thực, token); Collector xoá thêm `url.full`, `db.statement`, `exception.message`; Collector, Tempo không mở cổng ra máy chủ. Check SC-OBS-2 chặn module import thẳng `@opentelemetry/*`.
- nginx (container `web`) gửi header bảo mật: `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, CSP `object-src 'none'; base-uri 'self'` (R-SEC-11).
- API có thể chạy bằng vai trò CSDL thường `ketoan_app`: không tắt được trigger bảo vệ sổ, không TRUNCATE (R-SEC-6, R-KER-3). Bật bằng biến môi trường (xem Nâng cấp cần làm).

## [0.1.0] - 2026-10-29

### Thêm
- **Gợi ý lý do định khoản** (PHASE-012 S012-4, PHASES 3.12): `GET /api/v1/posting/reasons/suggest` (công cụ MCP `accounting.posting.reason_suggest`, AI đọc được) xếp hạng lý do tất định từ từ khoá / ví dụ của gói, tên lý do, lịch sử của chính đơn vị; `GET /api/v1/posting/reasons/readiness`. Manifest module khai `ledger.submits[].reasons` (`bizcity_module` 1.1.0-draft), bộ kiểm SC-CON-2 kiểm.
- **Gói định khoản nền** `db/packs/vn-tt99-nen.posting-pack.json` (S012-3b): cấu hình định khoản mặc định của đơn vị mới chuyển từ `seed.ts` sang gói; đơn vị mới nhận đúng dữ liệu như trước (đã so 49 dòng). `bizcity_posting_template` 1.1.0-draft: `paymentMethods[].receivable`.
- Mã nguồn đầu tiên đưa lên GitHub:
  - sổ cái chỉ thêm, một cửa nạp chứng từ, luật định khoản, báo cáo;
  - các phân hệ kế toán, quỹ, mua hàng, bán hàng, kho, tài sản, thuế;
  - add-in.
