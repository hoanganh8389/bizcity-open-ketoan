# PHASE-027 · 00 — Kế hoạch: Core kế toán cho dev
<!-- [2026-11-03 10:14 PM Johnny Chu - Chu Hoàng Anh] PHASE-027 — kế hoạch W0: sự thật đọc mã, quyết định D027-*, sáu chuẩn, vai trò theo trụ cột 0–VIII, công cụ kiểm, đề xuất chờ duyệt -->

> Nguồn: tài liệu làm việc "Kiện toàn framework v2" (03/11/2026), đối chiếu lại với `main` ngày 2026-11-03 22:00. Chỗ nào tài liệu đó và `main` khác nhau, `main` thắng.

## 1. Vì sao

Dev và AI không biết kế toán nên khi thêm tính năng dễ sai định khoản, sai nguyên tắc tài khoản, sai cấu hình, làm vỡ sổ; AI viết nhưng không tự soát lại. Cách chữa không phải dạy kế toán mà là: (1) app chỉ **kể sự việc**, Kernel định khoản; (2) mỗi bước có **một lệnh** trả PASS / FAIL / SKIP; (3) mỗi lỗi có **mã, bước sửa, ai sửa, luật gốc**; (4) phép kiểm chặn trong CI để lỗi không lặp lại.

## 2. Sự thật đọc mã (2026-11-03)

| Hạng mục | Có trên `main` | Thiếu |
|---|---|---|
| Cửa nạp, tiền kiểm | `bizcity_ledger_intake@1` (10 loại chứng từ), tiền kiểm L1–L5 (`POST /api/v1/intake/preflight`), bể chờ, trạm ACC14, bảng điểm ACC94 | — |
| Mã lỗi | `bizcity_errors@1`, `bizcity_findings@1`, `bizcity_remedy@1`, ca F22 theo vai | mỗi mã chưa có câu giải thích theo từng vai (Q027-1) |
| Định danh hàng | `items`, `item_codes`, `item_classification`, `item_id` trên sổ / kho / giá vốn (0065 / 0066), Hành trình mặt hàng ACC95 | `products` chưa là khung nhìn; API chưa trả `itemId` (PHASE-024 G1, G8) |
| Giá vốn | bình quân gia quyền tháng, gom theo `item_id` | phương pháp có phiên bản (S025-7); FIFO (B7) |
| Công cụ cho dev | `bizcity` CLI một tệp (`packages/cli/bin/bizcity.mjs`), starter module | lệnh kiểm chứng từ / chuỗi / module, skill cho AI, API đối chiếu kho ↔ sổ cái (CK-1) |
| Kiểm tài liệu ↔ mã | SC-DOC-1..3 (liên kết, cột "Kiểm bằng", số ADR) | đường dẫn, route, mục menu thiếu hướng dẫn (CK-2) |
| Bí mật trong mã | SC-SEC-1..4 | biến bí mật có giá trị mặc định `process.env.X \|\| '…'` (CK-3) |

## 3. Quyết định

| # | Quyết định | Nguồn | Ghi ở |
|---|---|---|---|
| D027-1 | Một khung trụ cột duy nhất là 0–VIII; không thêm khung "bảy trụ cột". Tài liệu cho dev viết theo 0–VIII, thêm cột "giúp ai việc gì" (§4) | chủ dự án 2026-11-03 | §4 bảng này; bảng trụ cột [tru-cot.json](../../standard/tru-cot.json) giữ nguyên số |
| D027-2 | Giá vốn mặc định bình quân gia quyền tháng; quy tắc xuất lô FEFO / FIFO theo lô tách khỏi giá vốn | chủ dự án 2026-11-03 | D025-2, D025-2b |
| D027-3 | Chứng từ sản xuất (MRP): giữ chỗ cổng, Nhóm Lõi không làm, cộng đồng phát triển qua skill | chủ dự án 2026-11-03 | [ADR-0023](../../adr/ADR-0023-cong-chung-tu-san-xuat-giu-cho.md) |
| D027-4 | Kernel phải có API đối chiếu sổ chi tiết kho với số dư tài khoản hàng tồn kho (chỉ đọc, theo chi nhánh × mặt hàng, tài khoản lấy từ nhóm hạch toán); sau B2b khoá đối chiếu là `item_id` | chủ dự án 2026-11-03 | CK-1; cùng công thức với CT-REC-001 ([PHASE-025 · 20](../PHASE-025-ACCOUNTING-CONTINUITY/20-KIEM-CHUAN-VONG-DOI.md)) |
| D027-5 | Công cụ kiểm không giữ luật riêng: mỗi lệnh gọi lại khuôn của `@ketoan/contracts`, bộ kiểm chuẩn, API của đơn vị. Thiếu bản dựng / máy chủ thì **SKIP** kèm lý do, không bao giờ coi là PASS. Mã thoát 0 PASS · 1 FAIL · 2 SKIP | đề xuất, duyệt cùng S027-1 | §6 |

## 4. Vai trò theo trụ cột (khung 0–VIII, thêm cột "giúp ai việc gì")

| Trụ cột | Dev viết app / module | Cộng đồng phát triển Core | Kế toán | CEO |
|---|---|---|---|---|
| 0 Quản trị dữ liệu gốc | đọc danh mục qua API, không tự tạo mã ngầm | khuôn có phiên bản cho danh mục khác (PHASE-026) | duyệt nháp, luật nhắc (HT09), đổi / gộp mã có ngày hiệu lực | báo cáo không vỡ khi đổi quy định |
| I Sổ cái bất biến | nộp qua một cửa, giữ biên nhận | giữ bất biến Tier 0, migration có ca vi phạm | sổ không sửa được, sai thì đảo | số liệu kiểm toán được |
| II Định danh bất biến, mã có phiên bản | một mặt hàng một mã gửi sang sổ; khi API có thì gửi `itemId` | Item Resolver, `core.item.*` (PHASE-024) | đổi mã không đứt lịch sử | lãi lỗ theo mặt hàng liền qua các lần đổi mã |
| III Liên tục kế toán | sửa ở nguồn khi chuỗi đứt; kiểm chuỗi nhiều kỳ | lineage giá vốn, CT-REC-* (PHASE-025) | đối chiếu kho ↔ sổ cái mỗi kỳ, giải thích từng số | tin được giá vốn, lãi gộp |
| IV Một cửa nạp, cổng kiểm chuẩn, một ngôn ngữ mã | `docKey` + `version`, tiền kiểm trước khi nộp, hiện mã lỗi cho người dùng | mỗi mã chặn có bước sửa, người sửa; ca F22 | bể chờ: ai sửa gì, sửa ở màn nào | thấy rủi ro đang treo |
| V Chính sách, chế độ kế toán có phiên bản | không viết tài khoản, thuế suất, giá vốn | gói định khoản, luật định khoản có test, kế toán trưởng ký | chọn chính sách, tính giá vốn, kết chuyển | lãi gộp nhất quán qua các kỳ |
| VI Bằng chứng, quan sát được | giữ `requestId`, biên nhận | số đo, span, cảnh báo | truy bằng chứng của từng bút toán | bảng điểm tuân thủ |
| VII Cô lập đơn vị, phân quyền | khoá API của đơn vị, không đọc chéo | RLS cho mọi bảng mới | tách quyền lập / duyệt | dữ liệu từng đơn vị riêng |
| VIII Mở rộng bằng module, kiểm chuẩn tự động | `module new`, `module check`, kiểm kế toán của module (§5) | module, skill, phép kiểm | module không đụng sổ | thêm tính năng không làm vỡ sổ |

## 5. Sáu chuẩn kế toán cho mọi app (C1–C6)

Một app nối vào Core **đạt chuẩn** khi sáu điều sau đúng. Ký hiệu: ✅ Kernel thi hành · 🟡 một phần · ☐ đã duyệt thiết kế, chưa thi hành. Lệnh kiểm đi cùng CK-1.

| Chuẩn | App phải | App không được | Trụ cột | Hôm nay |
|---|---|---|---|---|
| C1 Liền mạch mua → kho → bán → giá vốn → lãi lỗ | mọi lần hàng vào là `purchase` (cả hàng tặng giá 0); trả hàng có `originalDocKey`; chuyển kho là `transfer`; lệch kiểm kê là `stock_adjustment` có lý do | tự tính giá vốn rồi gửi (trừ khi kế toán chọn hệ thống gửi là nguồn giá vốn); gửi bán trước nhập cùng lô | III, V | ✅ bình quân tháng theo `item_id` · ☐ FIFO (B7) |
| C2 Mã hàng có phiên bản, định danh giữ nguyên | mã đã có dòng sổ thì không đổi, không dùng lại; cùng hàng khác ĐVT = một mã + quy đổi | đổi mã ngầm ở app | 0, II | 🟡 `item_id` trên sổ / kho, mã có phiên bản, Hành trình ACC95 · ☐ API trả `itemId`, `products` khung nhìn |
| C3 Ghi sổ, định khoản đúng quy định | chọn `docType` đúng nghiệp vụ; lý do và mã thuế lấy từ API | gửi / đoán số tài khoản, tự đặt thuế suất, đổi loại để "cho qua" | V | ✅ |
| C4 Sổ có nguồn chứng từ, có phiên bản | `docKey` ổn định có tiền tố app; sửa = `version + 1`; huỷ có lý do | sửa chứng từ cũ tại chỗ | I, IV | ✅ |
| C5 Làm việc với sổ có nguyên tắc | để kế toán tính giá vốn, kết chuyển, khoá kỳ trên màn | UPDATE / DELETE bảng sổ, tắt trigger, đổi ngày để né kỳ khoá | I, IV | ✅ |
| C6 Báo rõ lý do chưa đạt | hiện mã, thông báo, gợi ý, giữ `requestId`; đơn bị từ chối ở trạng thái "cần xử lý" | nuốt lỗi, thử lại lỗi không thử lại được | IV, VI | ✅ mã + bước sửa + luật · 🟡 giải thích theo vai, sổ tay theo action (Q027-1, Q027-2) |

Kiểm từng chứng từ vẫn lọt: chuỗi mua → bán không nối được; mã đổi giữa kỳ; trả hàng sai giá vốn gốc; Nợ = Có mà sổ kho lệch tài khoản kho; mọi chứng từ hợp lệ nhưng không đủ điều kiện khoá kỳ. CK-1 thêm kiểm chuỗi nhiều kỳ và đối chiếu kho ↔ sổ cái cho các ca này.

## 6. Công cụ kiểm (CK-1)

| Lệnh | Làm gì |
|---|---|
| `bizcity event check <tệp.json>` | một chứng từ: khuôn, tổng tiền, tiền kiểm L1–L5, (tuỳ chọn) nộp |
| `bizcity flow check --sku --period [--to]` | một chuỗi mua → kho → bán → giá vốn → lãi lỗ → khoá kỳ, sổ kho ↔ sổ cái, nhiều kỳ |
| `bizcity explain <MÃ> [--role]` | nghĩa, vì sao, ai sửa, bước sửa, việc cấm, theo vai dev / kế toán trưởng / kiểm soát / thanh tra |
| `bizcity module accounting-check <key>` | module không đụng sổ (bảng mã AC dưới) |
| `bizcity skills install` | chép skill kế toán cho AI vào dự án |

Mã AC của `module accounting-check` (kiểm tĩnh bằng biểu thức; test hợp đồng trên CSDL vẫn là lớp chặn cuối):

| Mã | Bắt gì | Mức |
|---|---|---|
| AC-1 | đụng bảng `ledger_*`, `inventory_movements`, `inventory_costs`, `accounting_events` (code, migration); đọc qua `bizcity_read.*` thì được | FAIL |
| AC-2 | số tài khoản viết cứng; module `ke-toan` là ngoại lệ duy nhất (ADR-0015) | FAIL |
| AC-3 | tự điền giá vốn trong tệp có gửi sổ | WARN |
| AC-4 | `docType` ngoài hợp đồng hoặc ngoài `ledger.submits` của manifest; loại sản xuất → "cổng chưa mở" (ADR-0023) | FAIL |
| AC-5 | `docKey` không ổn định (`Date.now`, `Math.random`…) hoặc thiếu tiền tố `<key>:` (R-EVENT-13, IN-BIZ-003) | FAIL |
| AC-6 | chứng từ mẫu `modules/<key>/examples/*.json` qua `event check`; chưa có mẫu thì WARN | FAIL / WARN / SKIP |

Small win cho dev module mới: `module new` → `module check` → đặt một chứng từ mẫu rồi `module accounting-check` với máy chủ để thấy bút toán → gửi thật một chuỗi rồi `flow check --to`.

## 7. Đề xuất chờ duyệt

| # | Đề xuất | Vì sao | Khi duyệt thì |
|---|---|---|---|
| Q027-1 | Mỗi mã (API, IN-*, DG-*, F22) có câu giải thích theo vai (dev, kế toán trưởng, kiểm soát, thanh tra, CEO), mỗi câu ≤ 120 ký tự, người có vai đó duyệt, không do model sinh; phép kiểm SC-ERR-2 bắt mã thiếu | dev nhận mã lỗi nhưng không biết ai sửa; CEO không cần số tài khoản | mở rộng `bizcity_findings@1` (R-FLOW-2: chốt hợp đồng trước) |
| Q027-2 | Sổ tay theo action `bizcity_sotay@1`: mỗi action ghi của module có một thẻ ngắn (nghiệp vụ bằng lời; kế toán mong thấy gì theo vai tài khoản; có thể sai ở đâu — mã IN-* / F22; Kernel từ chối gì; không làm), sáu câu hỏi dịch; thẻ viết trước code; phép kiểm SC-SOTAY-1..5 | tài liệu kế toán hiện theo khái niệm, dev không biết mở mục nào cho action đang làm | hợp đồng + mẫu thẻ trong starter module; làm thử với `mua-hang` trước |
| Q027-3 | Quy tắc cho skill (RULE-SKILL): skill là một lệnh có PASS / FAIL, không ghi sổ trực tiếp, ghi dữ liệu thì qua action có xem trước → xác nhận, đọc catalogue không chứa câu chữ nghiệp vụ riêng, mỗi skill có test trên fixture | skill dạng tài liệu dài thì AI không đọc hết | luật mới trong `docs/rules/` |
| Q027-4 | Kiểm lại cổng phát hành: CI xanh trên `main`, bảo vệ `main` đúng [CI-CD §4](../../ops/CI-CD.md), bản phát hành đầu có SHA256SUMS và SBOM | tài liệu làm việc đo được CI chưa từng xanh (232 lượt, 2026-11-02); cần đo lại | việc của PHASE-001 (0.2) |
| Q027-5 | Bỏ giá trị mặc định của `SEED_ADMIN_PASSWORD` (mật khẩu quản trị ban đầu); cài nhanh tự sinh mật khẩu | SC-SEC-5 bắt; đang ghi nợ baseline | đổi luồng cài đặt, chủ dự án quyết |

## 8. Không làm

- Không thêm "Finality contract" nhiều trạng thái cho giá vốn: kế toán bấm tính lại, phiên bản dòng giá vốn đã là bằng chứng (D025-2c).
- Không tạo thêm catalogue mã lỗi; chỉ nối các họ mã đã có.
- Không để model viết câu giải thích theo vai hay bước sửa; model chỉ đọc và diễn giải.
- Không gắn nhãn "đạt" một văn bản pháp lý khi căn cứ còn chờ rà (SC-VNC-2 giữ nguyên).
- Không đổi phương pháp giá vốn giữa năm tài chính.
- Không dùng runner tự dựng trên máy đang chạy dịch vụ thật để né lỗi CI.
- Không quảng bá công cụ là "tiết kiệm token": phần lợi chính là thời gian của dev và độ tin cậy của sổ; số tiết kiệm phải tách số đã đo khỏi giả định.
