# ADR-0018 · Versioned Master Data Contract: định danh · mã · phân loại tách ba, áp cho mọi đối tượng danh mục — có phân hạng, không đồng nhất
<!-- [2026-11-02 10:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0018: mở rộng ADR-0017 thành nguyên tắc chung cho mọi danh mục (đối tượng, tài khoản, chi nhánh, kho, thuế…); phản biện: tài khoản không có định danh thay thế; đổi mã ≠ đổi bản chất; bốn hạng thay đổi -->

- Trạng thái: **Chấp nhận** — chủ dự án (Johnny Chu) 2026-11-02: *"tôi duyệt đồng ý những gì bro đưa ra"*; chương trình tuân thủ cho dev / CEO ở [PHASE-024 · 50](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/50-TUAN-THU.md). <!-- [2026-11-02 09:50 PM Johnny Chu - Chu Hoàng Anh] PHASE-024 — ADR-0018 chấp nhận -->
- Nguồn: trả lời câu hỏi của chủ dự án 2026-11-02: *"Versioned Master Data Contract áp dụng cho tất cả đối tượng, không chỉ hàng hóa thì có hợp lý không? Phản biện và update vào tài liệu."* Chấp nhận khi chủ duyệt phần "Quyết định" và bảng hạng thay đổi ở [PHASE-024 · 10](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/10-DANH-MUC-CO-PHIEN-BAN.md).
- Ngày: 2026-11-02 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: K0 (nguyên tắc); thi hành theo từng đối tượng có mức riêng (bảng §Quyết định 4).
- Liên quan: [ADR-0017](ADR-0017-dinh-danh-hang-hoa-bat-bien.md) (trường hợp hàng hoá — nay là **thể hiện đầu tiên** của ADR này), [ADR-0009](ADR-0009-chinh-sach-ke-toan-co-phien-ban.md) (chính sách có phiên bản), [ADR-0013](ADR-0013-ho-so-ke-toan-co-phien-ban.md) (hồ sơ kế toán có phiên bản), [R-MD](../rules/RULE-MASTER-DATA.md), [R-ITEM](../rules/RULE-ITEM.md), [R-LEDGER](../rules/RULE-LEDGER.md).

## Bối cảnh

Chủ dự án chỉ ra hai trường hợp phải tách bạch:

1. **Đổi mã định danh đối tượng** — không đổi bản chất nghiệp vụ, số dư, bút toán đã ghi.
2. **Đổi tài khoản hạch toán hoặc bản chất đối tượng** — có thể ảnh hưởng sổ cái, công nợ, phân loại tài sản, báo cáo; phải kiểm chuẩn, có thể cần bút toán điều chỉnh.

Và với tài khoản kế toán: đổi **số hiệu / tên** (quản lý bằng phiên bản + ngày hiệu lực + chuyển số dư nếu cần) khác với **đổi phân loại** (156 → 152: kiểm chứng từ, tồn kho, chính sách, lập bút toán phân loại lại).

Câu hỏi: nguyên tắc này có nên là **một hợp đồng chung** cho mọi danh mục?

Hiện trạng khoá trong sổ (đọc `db/migrations/0006`, `0002`):

| Đối tượng | Khoá trong `ledger_lines` / sổ phụ | Mã | Nhận xét |
|---|---|---|---|
| Đối tượng (khách, NCC, nhân viên nội bộ) | `partner_id` bigint → `partners.id` | `partners.code` UNIQUE theo đơn vị | **Đã tách** định danh khỏi mã; thiếu: lịch sử mã, mã ngoài theo nguồn, hạng thay đổi |
| Chi nhánh | `branch_id` bigint | `branches.code` + `external_ref` | đã tách; `external_ref` là mầm của "mã ngoài" |
| Kho | `warehouse_id` (sổ phụ kho) | `warehouses.code` | đã tách |
| **Hàng hoá** | `product_sku` **text** | `products.sku` | **chưa tách** — lý do có ADR-0017 |
| **Tài khoản** | `account_code` **text** | `accounts.code` | mã **là** nghĩa (số hiệu do chế độ kế toán quy định) — xem phản biện |
| Loại thuế, hình thức TT, ngân hàng | mã text trên dòng / cấu hình | code | là **cấu hình hạch toán**, đã có phiên bản qua ADR-0009 |
| Chiều phân tích (bộ phận, khoản mục, hợp đồng, dự án) | `dims` jsonb theo mã | code | mức rủi ro thấp |

## Phản biện

**Đúng ở nguyên tắc, sai nếu đồng nhất cách làm.**

1. **Tách ba — định danh · mã · phân loại — đúng cho mọi đối tượng.** Nó đã là cấu trúc thực tế của đối tượng, chi nhánh, kho (khoá bằng `id`). Hàng hoá là ngoại lệ chưa làm. Vậy "áp cho tất cả" không phải việc mới cho đa số bảng; việc mới là **chuẩn hoá** ba thứ còn thiếu ở mọi bảng: (a) **lịch sử mã có ngày hiệu lực** (mã cũ tra được cho chứng từ cũ), (b) **mã ngoài theo nguồn** (POS gọi khách là `KH00912`, kế toán gọi là `KH-A`), (c) **hạng thay đổi** quyết định quy trình.

2. **Tài khoản kế toán KHÔNG nên có định danh thay thế (surrogate id).** Số hiệu tài khoản là **ngôn ngữ chung** của chế độ kế toán, cơ quan thuế, kiểm toán và mọi báo cáo: "156" có nghĩa vì TT99 nói thế, không vì bản cài đặt thế. Gắn `account_id` bất biến rồi cho đổi số hiệu tự do sẽ tạo ra sổ mà người ngoài không đọc được. Cách đúng cho tài khoản:
   - Định danh = **(chế độ kế toán, số hiệu)**. Đổi số hiệu chỉ xảy ra khi **đổi chế độ** (TT133 → TT99) hoặc tái cấu trúc tài khoản chi tiết của đơn vị — cả hai là **phiên bản hệ thống tài khoản** có ngày hiệu lực (ADR-0013 đã có hồ sơ kế toán có phiên bản), kèm **bảng ánh xạ** cũ → mới và **bút toán chuyển số dư** tại ngày hiệu lực. Sổ trước ngày đó giữ số hiệu cũ; báo cáo kỳ sau đọc qua ánh xạ.
   - Đổi **tên** tài khoản: thuộc tính, không ảnh hưởng sổ (hạng 0).
   - 156 → 152 cho một mặt hàng **không phải đổi tài khoản** — đó là **đổi phân loại của mặt hàng** (hạng 3): phân loại mới từ ngày D (ADR-0017 D-4), kiểm tồn kho / chứng từ mở, và **một chứng từ phân loại lại** (Nợ 152 / Có 156 theo giá trị tồn tại D) đi qua cửa nạp như mọi chứng từ. Danh mục không bao giờ tự sinh bút toán (điểm "rất quan trọng" của chủ dự án).

3. **Đồng nhất một quy trình nặng (Validate → Impact → Simulate → Approve → Activate) cho mọi thay đổi sẽ làm người dùng né.** Đổi tên khách, sửa địa chỉ không thể chờ duyệt. Phải có **hạng thay đổi**: hạng 0 ghi ngay; hạng 1 (đổi mã) xác nhận ngày hiệu lực; hạng 2 (gộp) xem trước; hạng 3 (đổi bản chất / phân loại) mới đi cổng kiểm chuẩn + chứng từ điều chỉnh. Bảng ở [PHASE-024 · 10](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/10-DANH-MUC-CO-PHIEN-BAN.md) §2.

4. **Chiều phân tích và cấu hình hạch toán không cần định danh thay thế.** Bộ phận, khoản mục, dự án đi vào `dims` theo mã; đổi mã = ánh xạ ở báo cáo, không có số dư pháp lý. Loại thuế, hình thức thanh toán, ngân hàng là cấu hình → đã có phiên bản qua chính sách kế toán (ADR-0009). Ép tất cả qua cùng một bộ bảng `*_codes` là chi phí không có lợi ích.

5. **Chi phí hiệu năng là thật nhưng xử lý được.** Mọi tra cứu mã → định danh tại ngày là một JOIN theo khoảng hiệu lực; với 2.000 dòng / chứng từ phải đệm theo phiên bản danh mục (R-CACHE). Đã tính ở ADR-0017 D-5.

## Quyết định

1. **Một hợp đồng chung `bizcity_master_data@2` (Versioned Master Data Contract)** quy định cho mọi đối tượng danh mục: `identity` (bất biến) · `codes[]` (kind, code, valid_from, valid_to, chỉ thêm) · `classification` (có ngày hiệu lực, chụp vào chính sách) · `attributes` (tự do) · `changeClass` của mỗi thao tác. ADR-0017 / `bizcity_item_master@1` là thể hiện cho hàng hoá; đối tượng, chi nhánh, kho dùng cùng khuôn.
2. **Tài khoản kế toán là ngoại lệ có chủ đích**: định danh = (chế độ, số hiệu); đổi số hiệu chỉ qua **phiên bản hệ thống tài khoản** với bảng ánh xạ + chứng từ chuyển số dư; không `account_id` thay thế trong sổ.
3. **Bốn hạng thay đổi** (0 thuộc tính · 1 mã · 2 gộp / tách · 3 bản chất / phân loại / tài khoản) với quy trình tương ứng; chỉ hạng 3 đi **Cổng kiểm chuẩn danh mục (Gate A)** và có thể sinh **chứng từ điều chỉnh** — luôn là chứng từ, không bao giờ là thao tác danh mục.
4. **Phân hạng đối tượng theo mức áp dụng**:

| Hạng đối tượng | Đối tượng | Áp gì | Mức Kernel |
|---|---|---|---|
| A — đầy đủ | hàng hoá, đối tượng (khách / NCC / nhân viên), tài sản cố định, CCDC | định danh bất biến, `codes[]` chỉ thêm, mã ngoài theo nguồn, phân loại theo ngày, 4 hạng thay đổi, Gate A cho hạng 3 | hàng hoá K3 (sổ đang khoá bằng mã); đối tượng K1 (sổ đã khoá bằng `id`) |
| B — định danh + hiệu lực | chi nhánh, kho, tài khoản ngân hàng | định danh đã có; thêm `codes[]`, ngày hiệu lực, mã ngoài; đổi đơn vị hạch toán của chi nhánh là hạng 3 | K1 |
| C — ánh xạ số hiệu | **tài khoản kế toán** | phiên bản hệ thống tài khoản theo chế độ, bảng ánh xạ cũ → mới, chứng từ chuyển số dư; tên = thuộc tính | K2 (đổi cách đọc sổ qua ánh xạ) |
| D — cấu hình | loại thuế, hình thức TT, lý do, nhóm hạch toán | như nay: chính sách có phiên bản (ADR-0009) | — |
| E — nhẹ | chiều phân tích (bộ phận, khoản mục, dự án, hợp đồng) | nhật ký đổi mã + ánh xạ ở báo cáo; không định danh thay thế | K0 |

5. **Bộ test chuẩn plugin** (ảnh "Conformance Checklist — Plugin" của chủ dự án) được quy về **ca chạy máy** trong lane runtime 4.3, mỗi dòng checklist một ca có mã; không công bố "đạt" bằng checklist tay. Bảng ánh xạ ở [PHASE-024 · 10](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/10-DANH-MUC-CO-PHIEN-BAN.md) §5.

## Hệ quả

- Người dùng thấy **cùng một thẻ** (định danh · lịch sử mã · phân loại · số thật · kiểm) cho mặt hàng và cho khách hàng; cùng hộp thoại "ngày hiệu lực"; cùng câu "sổ đã ghi không đổi".
- Kế toán không bao giờ "sửa danh mục để sửa sổ": mọi thay đổi chạm số dư ra một chứng từ có người duyệt, có bằng chứng.
- Tài khoản giữ được ý nghĩa pháp lý của số hiệu; đổi chế độ kế toán là một dự án có ánh xạ, không phải đổi tên hàng loạt.
- Chi phí: hợp đồng v2 + hai bảng `*_codes` cho đối tượng và chi nhánh (K1, nhỏ); phần nặng vẫn là hàng hoá (ADR-0017).

## Phương án đã cân nhắc

| Phương án | Vì sao không chọn |
|---|---|
| Một bộ bảng `entities` / `entity_codes` chung cho mọi loại đối tượng (EAV) | Mất ràng buộc theo loại, truy vấn sổ phụ chậm, migration K3 cho mọi bảng cùng lúc — rủi ro lớn hơn lợi ích. Chọn: cùng **hợp đồng**, bảng riêng theo loại |
| Tài khoản có `account_id` thay thế như hàng hoá | Số hiệu là ngôn ngữ chung với cơ quan thuế / kiểm toán; sổ không tự giải thích được |
| Mọi thay đổi danh mục đều qua phê duyệt | Người dùng né công cụ; sửa địa chỉ khách không phải việc của kế toán trưởng |
| Để danh mục tự sinh bút toán phân loại lại khi đổi nhóm | Trái R-LEDGER / R-EVENT (không sự việc thì không bút toán); mất người duyệt, mất bằng chứng |
