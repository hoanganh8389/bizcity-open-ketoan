# ADR-0031 · Policy Registry & Rule Contracts: chính sách nghiệp vụ quản trị tập trung, tính toán phân tán, kiểm chứng tại cửa nạp
<!-- [2026-11-06 09:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-031 — ADR-0031: chính sách nghiệp vụ do module sở hữu, Registry là bề mặt chung đăng ký / phát hành / phiên bản; Rule Contract là khuôn luật có phép kiểm và cách ghi nhận; plugin ngoài dùng bản đã phát hành và gửi tham chiếu về; Intake Gate kiểm lại, xin Kernel bút toán dự kiến; Conformance Engine giữ vai tư vấn -->

- Trạng thái: **Đề xuất** (chờ chủ dự án duyệt D-POL-1..10, nhóm Lõi duyệt phần K2).
- Nguồn: chủ dự án 2026-11-06 — *"chính sách nghiệp vụ được quản lý tập trung tại module Mua hàng, Bán hàng, Nhân sự… xoay quanh lõi kế toán, các plugin bên ngoài sử dụng chính sách đã phát hành, thay vì mỗi plugin tự định nghĩa một bộ quy tắc riêng … Chính sách được quản trị tập trung, nhưng không bắt buộc tính toán tập trung … Policy Registry & Rule Contracts cũng là một trụ cột tương tự master data … có các version, trace được theo chứng từ, theo chính sách căn cứ."*
- Ngày: 2026-11-06 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: K0 (nguyên tắc); thi hành K1 (Platform, registry) – K2 (cửa nạp nhận tham chiếu chính sách, bút toán dự kiến) theo [PHASE-031](../phases/PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/README.md).
- Luật / hợp đồng liên quan: [ADR-0029](ADR-0029-loi-bat-bien-nghiep-vu-linh-hoat.md) (tầng ① Chính sách nghiệp vụ), [ADR-0028](ADR-0028-enterprise-continuity-nen-mong-doanh-nghiep.md) (trụ cột 05 Configuration & Policy Registry, ECP-13), [ADR-0022](ADR-0022-quan-tri-du-lieu-goc-nen-mong.md) (trụ cột V), [ADR-0019](ADR-0019-hai-cong-kiem-chuan-nhap-va-be-cho.md) (Gate B, bể chờ), [ADR-0020](ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md) (mặc định cho phép, nhắc khi sai), [ADR-0009](ADR-0009-chinh-sach-ke-toan-co-phien-ban.md) (chính sách định khoản có phiên bản), [`bizcity_ledger_intake@1`](../contracts/BIZCITY-LEDGER-INTAKE-v1.md), [`bizcity_settings@1`](../contracts/BIZCITY-SETTINGS-MATRIX-v1.md), [`bizcity_findings@1`](../contracts/BIZCITY-FINDINGS-v1.md), [PHASE-030 · 21](../phases/PHASE-030-THU-VIEN-NGHIEP-VU-ERP-VN/21-SO-CONG-VA-BANG-DIEU-HANH.md) (`GateResult.ruleVersion`).

## Bối cảnh

ADR-0029 đặt bốn tầng, tầng ① là **chính sách nghiệp vụ** (giá, chiết khấu, khuyến mại, hạn mức, ngưỡng duyệt; theo đối tượng / chi nhánh / chương trình / thời gian). Tầng ① **chưa có chủ và chưa có hình**:

- Chính sách nằm rải: mua hàng có engine thuần 12 loại (`modules/mua-hang/domain/src/engine.ts:152`) trên bảng `purchase_policies` (0010) nhưng **dòng sửa đè, không phiên bản**, chứng từ chỉ ghi `policyTrace` theo mã; bán hàng có `price_lists`, ngưỡng duyệt ở `payment_request_settings`, PHASE-030 · 16 §5 đưa ngưỡng duyệt vào `setting_values`. Mỗi chỗ một khuôn, không chỗ nào **phát hành** cho bên ngoài dùng.
- Plugin ngoài (POS trên WordPress, Woo, sàn) **tự tính** khuyến mại theo luật của nó rồi đổ `sale` vào Kernel. Sự việc không mang căn cứ: Kernel nhận dòng `isGift`, giá 0, nhưng không biết quà đó theo chương trình nào, phiên bản nào, có đúng điều kiện không.
- Conformance Engine (ADR-0012, PHASE-020, rulepack duyệt theo ADR-0016) đánh giá tuân thủ ở **cấp đơn vị / module**, chỉ đọc và tư vấn. Cửa nạp (ADR-0014, PHASE-021: L1 khuôn, L2 số học, L3 dữ liệu gốc, L4 nghiệp vụ, L5 chạy thử định khoản) kiểm **khuôn và dữ liệu gốc** của từng sự việc. Không tầng nào kiểm *"sự việc này có đúng chính sách đã phát hành không"*.
- Trụ cột 05 của ADR-0028 tên là *Configuration & Policy Registry* nhưng hiện trạng chỉ có nửa *Configuration* (khoá cấu hình, `setting_values`). Nửa *Policy* chưa có.

## Quyết định

| Mã | Quyết định |
|---|---|
| **D-POL-1** | **Quản trị tập trung, tính toán không bắt buộc tập trung, kiểm chứng tại cửa nạp.** Chính sách nghiệp vụ được lập và phát hành ở **module nghiệp vụ sở hữu** (Bán hàng, Mua hàng, Nhân sự…). Plugin ngoài **dùng bản đã phát hành**, tự tính tại chỗ (offline được), và **gửi tham chiếu chính sách** về cùng sự việc. Core **kiểm lại** bằng chính bản đó. Không plugin nào tự định nghĩa bộ luật riêng cho cùng nghiệp vụ. |
| **D-POL-2** | **Một kho dữ liệu, một bề mặt chung.** Module giữ **nội dung** chính sách trong bảng của nó (`mod_ban_hang.*`, `purchase_*`, `setting_values` cho chính sách vô hướng). **Policy Registry** (Platform) giữ **phong bì**: khoá, phiên bản, phạm vi, hiệu lực, trạng thái, module chủ, Rule Contract, băm nội dung, ai phát hành. Registry là nơi đăng ký, tra cứu, phát hành, kiểm phiên bản; **không** là kho chính sách thứ hai. |
| **D-POL-3** | **Rule Contract là khuôn luật, không phải mã.** Mỗi loại chính sách khai một Rule Contract `<miền>.<loại>@<major>` (vd `sale.promo.buy_x_get_y@1`): lược đồ tham số (zod / JSON Schema), **phép kiểm** gắn theo (mã finding `POL-*` trong `bizcity_findings@1`, có căn cứ), **kết quả** phải sinh trên chứng từ (dòng tặng, chiết khấu, giữ hạn mức), và **cách ghi nhận kế toán** dưới dạng `reasonCode` (không số tài khoản, D030-3). Luật tính phải **khai báo được và tất định**, để POS và Core cùng chạy một luật ra cùng kết quả. Rule Contract mới = PR vào `packages/contracts`, có golden. |
| **D-POL-4** | **Vòng đời chính sách:** `draft → published → retired`. Bản `published` **không sửa**; đổi = phiên bản mới (ECP-13, ADR-0028 D028-3). Phát hành kiểm: tham số đúng lược đồ, trần pháp lý (vd NĐ81 trần 50 %) — vượt trần là **chặn lúc phát hành**, không chặn lúc bán; phạm vi + hiệu lực không chồng phiên bản cùng khoá; **đã có cách ghi nhận kế toán** tại ngày hiệu lực (posting rule có `reasonCode` đó) — thiếu thì phát hành vẫn được nhưng mang cảnh báo `POL-ACC-001` (mặc định cho phép, nhắc khi sai). |
| **D-POL-5** | **Tham chiếu chính sách đi theo sự việc.** `bizcity_ledger_intake@1` thêm trường tuỳ chọn `policyRefs[]` ở đầu phiếu và `policyRef` ở dòng: `{ key, version, hash }`. Bản minor (thêm trường), không bắt buộc với nguồn cũ. Kernel lưu nguyên vào phiên bản sự việc; truy vết đi được *bút toán → sự việc → chứng từ → chính sách căn cứ (phiên bản, băm)*. |
| **D-POL-6** | **Intake Gate thêm một tầng kiểm chính sách (L4b, giữa L4 nghiệp vụ và L5 chạy thử), mềm.** Khi sự việc có `policyRefs`, tiền kiểm (`preflight.ts`) và cửa nạp: (a) bản đó có đúng là bản hiệu lực tại `docDate` cho phạm vi (chi nhánh, kênh, khách); (b) chạy lại Rule Contract trên dữ liệu sự việc, so kết quả với cái nguồn gửi; (c) dữ liệu gốc của kết quả đủ (quà có `itemId`, kho, lô nếu quản lý lô); (d) chính sách định khoản có `reasonCode` tương ứng tại ngày. Kết quả là `GateResult { gate: 'validation', verdict, codes, ruleVersion: '<key>@<version>' }`. **Mặc định: lệch → `warn`** (vẫn ghi sổ, vào hàng việc kế toán xem); đơn vị bật nghiêm → `hold` vào bể chờ (R-INTAKE). Không `block` ở cửa nạp vì chính sách. |
| **D-POL-7** | **Bút toán dự kiến do Kernel dựng, Gate chỉ hỏi.** Bút toán dự kiến chính là L5 chạy thử đã có (`trial-posting.ts`, savepoint rồi lùi) và `submit?dryRun=1`; không thêm engine. Commit Guard (`guard.ts`) thêm băm các chính sách nghiệp vụ được tham chiếu, cạnh phiên bản chính sách định khoản; kế toán xem được *"chính sách X v3 → dòng tặng → XTA1.4 → Nợ / Có theo chính sách định khoản v… "* trước khi ghi (chế độ gợi ý) hoặc ghi luôn (chế độ tự động). Posting Rules và Ledger **chỉ** thuộc Kernel; Rule Contract chỉ chỉ `reasonCode`. |
| **D-POL-8** | **Conformance Engine giữ vai tư vấn.** Engine PHASE-020 không chặn giao dịch, không ghi sổ. Nó thêm rulepack đọc Registry ở **cấp đơn vị**: chính sách đã phát hành thiếu cách ghi nhận, chính sách sắp hết hạn mà nguồn vẫn gửi, tỷ lệ sự việc lệch chính sách theo nguồn / chi nhánh, nguồn ngoài không gửi `policyRefs` cho nghiệp vụ có chính sách. Kiểm **từng chứng từ** là việc của Intake Gate (D-POL-6); khuyến nghị cấp chứng từ của *Posting Gate* (`core.conformance.advisories`, người dùng xác nhận đã đọc) giữ nguyên. |
| **D-POL-9** | **Phân phối cho plugin bằng API đọc + sự kiện.** `GET /api/v1/policies?domain=&scope=&at=` trả các bản `published` hiệu lực (phong bì + nội dung + băm); sự kiện miền `policy.published` / `policy.retired` qua outbox để plugin làm mới. Plugin offline gửi theo bản đã tải; bản đã hết hiệu lực tại `docDate` → `POL-STALE-001` (cảnh báo, không mất sự việc). |
| **D-POL-10** | **Không thêm trụ cột thứ 18.** Policy Registry & Rule Contracts là **nửa còn thiếu của trụ cột 05** (ADR-0028), ánh xạ trụ cột V của ADR-0022. Ranh giới với *Configuration*: **khoá cấu hình** = một giá trị (vô hướng / json) không có Rule Contract; **chính sách** = có Rule Contract, có phép kiểm, được chứng từ tham chiếu. Ngưỡng duyệt (PHASE-030 · 16 §5) giữ ở `setting_values` như đã chốt, Registry đánh chỉ mục nó với Rule Contract `approval.levels@1` (`store: settings`). |

## Hệ quả

**Được:**
- Một nơi trả lời *"đơn này áp chính sách nào, bản nào, đúng chưa, ghi sổ ra sao"* — cho kế toán, kiểm toán, thanh tra.
- POS / Woo / sàn không còn tự chế luật; đổi chương trình là phát hành bản mới ở module, plugin tự làm mới.
- Chính sách hiệu lực tại ngày chứng từ được giữ như chính sách định khoản (ADR-0009): tính lại được chứng từ cũ bằng đúng luật cũ.
- Sai lệch thành hàng việc có mã và câu giải thích, không thành bút toán sai im lặng; không dừng bán hàng.

**Mất / chi phí:**
- Luật tính phải khai báo được: chương trình quá đặc thù không viết được bằng Rule Contract có sẵn thì đi đường *chính sách tự do* (`custom@1`: chỉ phong bì + căn cứ, L4b chỉ kiểm hiệu lực, không chạy lại) cho tới khi có Rule Contract.
- `bizcity_ledger_intake@1` lên minor; connector / POS phải cập nhật để hưởng L4b (không bắt buộc).
- Mua hàng phải thêm phiên bản cho `purchase_policies` (hôm nay sửa đè, `store.ts:383-391` chỉ chặn xoá) và đăng ký vào Registry — không chuyển kho dữ liệu. Bán hàng chưa có bảng khuyến mại nào: Rule Contract bán hàng đi cùng `modules/ban-hang` (S030-16).

**Việc phải làm:** xem [PHASE-031 · 40](../phases/PHASE-031-POLICY-REGISTRY-RULE-CONTRACTS/40-MASTER-CHECKLIST.md).

## Phương án đã cân nhắc

| Phương án | Vì sao không chọn |
|---|---|
| Registry là kho chính sách riêng, module đọc từ đó | hai kho cho một sự thật; module mất quyền sở hữu nghiệp vụ; trái D-FIN-3 (module khai báo, nền giữ thẩm quyền) |
| Mỗi plugin tự định nghĩa luật, Core chỉ nhận số | đúng hiện trạng; không kiểm được, không truy vết được căn cứ, mỗi kênh một cách tính |
| Core tính tập trung, POS gọi API cho mỗi đơn | POS mất khả năng bán offline; độ trễ; Core thành điểm nghẽn của bán hàng — trái "không bắt buộc tính toán tập trung" |
| Biến Conformance Engine thành cổng chặn từng giao dịch, tự ghi sổ | trộn tư vấn cấp đơn vị với kiểm từng chứng từ; Engine không sở hữu định khoản (D-FIN-3); chặn bán vì chính sách trái ADR-0020 |
| Hợp đồng `bizcity_policy@1` lớn kèm DSL tổng quát | quá sớm; bắt đầu bằng vài Rule Contract cụ thể, có golden, lớn dần theo nhu cầu (bài học "bản gọn" ở PHASE-030 · 21) |
