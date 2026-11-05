# ADR-0022 · Quản trị dữ liệu gốc (Master Data Governance) là nền móng; Accounting Continuity là cam kết; bảng trụ cột × mức đạt
<!-- [2026-11-04 02:00 AM Johnny Chu - Chu Hoàng Anh] PHASE-026 — ADR-0022: MDG là nền móng của Open Kế Toán (chủ dự án: "Không phải xây thật nhiều menu Danh mục, mà là thiết lập một lần hệ thống định danh và các nguyên tắc đúng") -->

- Trạng thái: **Chấp nhận** <!-- [2026-11-05 04:50 PM Johnny Chu - Chu Hoàng Anh] ADR-0022 — chấp nhận, chốt D026-2 / D026-4 --> — chủ dự án (Johnny Chu) duyệt 2026-11-05: *"đồng ý với toàn bộ đề xuất của bro"* — D026-1..8; D026-2 giữ tên cột `items.item_id` = đơn vị tồn kho (biến thể), "sản phẩm cha" là `items.parent_item_id`, không đổi tên cột; D026-4 nhóm đơn vị làm sau S024-11 ([PHASE-026](../phases/PHASE-026-MASTER-DATA-GOVERNANCE/README.md)).
- Nguồn: chủ dự án 2026-11-04 — *"Master Data Governance phải là nền móng của Open Kế Toán, còn Accounting Continuity & Lineage là cam kết mà toàn bộ Framework phải bảo vệ… để hàng triệu mã hàng, hàng trăm cửa hàng, nhiều pháp nhân và mọi module do cộng đồng phát triển vẫn sử dụng chung một dòng dữ liệu kế toán liên tục, chính xác, có thể truy vết và kiểm toán được."* Ba điều phải bảo đảm: **Identity Continuity**, **Organizational & Accounting Consistency**, **Versioning theo phiên bản + ngày hiệu lực**. Bốn khả năng trên mỗi màn danh mục: **Lịch sử · Tác động · Kiểm chuẩn · Truy vết**. Giao diện phải **thể hiện** điều đó và cho thấy code đã adapt đến đâu.
- Ngày: 2026-11-04 · Người quyết: Johnny Chu – Chu Hoàng Anh · Mức Kernel: K0 (nguyên tắc + bảng trụ cột); thi hành K1–K3 theo PHASE-026.
- Nền: [ADR-0017](ADR-0017-dinh-danh-hang-hoa-bat-bien.md) (item_id), [ADR-0018](ADR-0018-danh-muc-co-phien-ban-toan-framework.md) (danh mục có phiên bản, hạng A–E, bốn lớp thay đổi), [ADR-0020](ADR-0020-ton-chi-core-nguoi-dung-quyet-dinh-mot-ngon-ngu-ma.md) (tôn chỉ), [ADR-0021](ADR-0021-accounting-continuity-lien-tuc-ke-toan.md) (Continuity).

## Vấn đề

Một sai sót ở danh mục lan dây chuyền tới mua hàng, nhập kho, giá vốn, doanh thu, công nợ, lãi lỗ và báo cáo tài chính — **kể cả khi từng bút toán vẫn cân Nợ / Có**. Hôm nay Core có định danh bất biến và mã có phiên bản cho **mặt hàng** (0065 / 0066), lineage theo `item_id`, giá vốn và báo cáo kho gom theo định danh; nhưng:

- đối tượng, chi nhánh, kho, tài khoản vẫn chỉ có `id` số + một cột `code` sửa được — đổi mã là **đứt** lịch sử;
- chỉ có **một** đơn vị (tenant); chuỗi "HO là một tenant, kho tổng là một tenant, 500 cửa hàng là 500 tenant" chưa có mô hình: không có nhóm đơn vị, không có cặp chứng từ liên đơn vị, không có loại trừ nội bộ;
- màn danh mục không có **Lịch sử**, **Tác động**; chỉ mặt hàng có **Truy vết**; **Kiểm chuẩn** mới ở Gate A, chưa phân lớp thay đổi;
- không có bảng nào cho kế toán trưởng và dev **cùng nhìn**: Core bảo đảm gì, hôm nay đạt tới đâu, chỗ nào còn phải tự kiểm bằng tay.

## Phản biện (trước khi chốt)

1. **Có thêm một "trụ cột IV" không?** Không. Quản trị dữ liệu gốc không đứng cạnh ba trụ cột — nó **ở dưới** cả ba: sổ cái bất biến vô nghĩa nếu dòng sổ trỏ về mã có thể đổi; continuity không nối được nếu định danh đứt. Vì vậy MDG là **nền móng (tầng 0)**; ba trụ cột I–III giữ nguyên; thêm năm trụ cột vận hành (IV–VIII) vốn đã có luật rải rác (cửa nạp / cổng, chính sách có phiên bản, bằng chứng, cô lập đơn vị, mở rộng bằng module) để bảng trụ cột **đủ** cho người đọc — xem CANON §0.2.
2. **Thuật ngữ của chủ dự án ("item_id = sản phẩm cha, sku_id / variant_id = biến thể tồn kho") khác tên cột đang chạy.** Core đã dùng `items.item_id` cho **đơn vị tồn kho** (mỗi biến thể một `item_id`) và `items.parent_item_id` cho sản phẩm cha. Không đổi tên cột (0065 / 0066 đã phát hành trong nhánh, hợp đồng `bizcity_item_master@1` đã công bố) — **chốt bảng thuật ngữ** (D026-2) và điền `parent_item_id`. Ý nghĩa giữ đúng yêu cầu: *đổi mã của cùng một biến thể giữ định danh tồn kho; biến thể kinh tế thực sự khác phải có định danh tồn kho mới, cùng sản phẩm cha.*
3. **Dựng "identity registry" chung cho mọi thực thể?** ADR-0018 đã bác bảng `entities` chung (mỗi loại thực thể có bất biến riêng). Giữ: mỗi thực thể hạng A/B có bảng định danh riêng, nhưng **một bảng mã chung** `entity_codes` (loại thực thể, định danh, loại mã, mã, hiệu lực) theo đúng khuôn `item_codes` — một luật, một guard, một màn Lịch sử cho tất cả.
4. **Tenant là HO / kho / cửa hàng — có phá cô lập đơn vị (RLS) không?** Không: RLS giữ nguyên theo tenant. Thêm **nhóm đơn vị** ở trên tenant (`tenant_groups`, vai của từng tenant trong nhóm); danh mục dùng chung là danh mục **của nhóm** được **nhận về** từng đơn vị (bản chiếu có `item_id` chung); giao dịch liên đơn vị là **cặp chứng từ** (mỗi bên một chứng từ trong tenant của mình) nối bằng `intercompany_ref`, loại trừ ở báo cáo nhóm. Không có truy vấn xuyên tenant trong đường ghi sổ.
5. **Scoreboard do ai chấm?** Không ai "tích đạt" (R-CONT-7). Bảng `docs/standard/tru-cot.json` ghi mức đạt **kèm bằng chứng** (migration, test, check); đợt đầu ghi tay có bằng chứng (`source = manual`), đợt sau engine (selfcheck / test) ghi (`source = check`). Màn HT10 và thẻ "Trụ cột" ở trang chủ phân hệ **chỉ đọc** tệp đó.
6. **Hàng triệu SKU?** Mô hình không có gì chặn (ULID, bảng mã chỉ thêm, chỉ mục theo (tenant, item_id)); chỗ phải đo là **trigger đồng bộ theo dòng** (0,7 ms / mặt hàng) và **khoá chống chồng hiệu lực theo đơn vị** (nối đuôi khi nạp lớn). Hướng: đồng bộ theo câu lệnh cho đường nạp lô, `EXCLUDE USING gist` thay khoá, benchmark là việc P2 có số đo.

## Quyết định

| Mã | Quyết định |
|---|---|
| **D026-1** | **Quản trị dữ liệu gốc là nền móng (tầng 0)** của Core, dưới ba trụ cột I–III; Accounting Continuity & Lineage là **cam kết** mà mọi trụ cột và mọi module phải bảo vệ. CANON §0.2 thêm bảng **nền móng + tám trụ cột**, mỗi trụ cột có tiêu chí đo được (`docs/standard/tru-cot.json`). |
| **D026-2** | **Mô hình định danh ba tầng** cho hàng hoá: `product` (sản phẩm cha, `items.parent_item_id`) → `item` (**đơn vị tồn kho** = biến thể, `items.item_id` bất biến) → `codes` (`item_codes`, có phiên bản). Luật: đổi mã của cùng biến thể giữ `item_id`; biến thể kinh tế khác (khác quy cách / bản chất / giá vốn tách riêng) = `item_id` mới cùng `parent_item_id`. Thuật ngữ của chủ dự án: *item_id (cha)* = `parent_item_id`; *sku_id / variant_id* = `item_id`; *mã code* = `item_codes.code`. |
| **D026-3** | **Mã có phiên bản cho mọi thực thể hạng A/B** (ADR-0018): bảng chung `entity_codes(entity_type, entity_id, kind, code, valid_from, valid_to)` chỉ thêm, chặn chồng hiệu lực; đối tượng, chi nhánh, kho, đơn vị tính, lý do… dùng chung; mặt hàng giữ `item_codes` (đã có) và là mẫu. Tài khoản: theo phiên bản hệ thống tài khoản + bảng ánh xạ (ADR-0018), không có id nhân tạo. |
| **D026-4** | **Nhóm đơn vị**: `tenant_groups` + vai của tenant trong nhóm (`ho` · `warehouse` · `store` · `legal_entity`); danh mục nhóm nhận về từng đơn vị giữ chung định danh; giao dịch liên đơn vị = cặp chứng từ + `intercompany_ref`; báo cáo nhóm loại trừ nội bộ. RLS theo tenant giữ nguyên. |
| **D026-5** | **Bốn khả năng trên mọi màn danh mục** qua một khung chung (`MasterDataFrame`): Lịch sử (mã cũ / mới, hiệu lực, người đổi — từ `*_codes` + `audit_logs`), Tác động (chứng từ, kho, tài khoản, cửa hàng, báo cáo dùng mã — chỉ mục tham chiếu), Kiểm chuẩn (Gate A theo lớp thay đổi 0–3; Gate C sau ghi sổ), Truy vết (hành trình theo định danh). |
| **D026-6** | **Bảng trụ cột × mức đạt** là một phần của bản dựng: `docs/standard/tru-cot.json` (`bizcity_pillars@1`), API `GET /api/v1/system/pillars`, màn **HT10 Trụ cột & mức đạt**, thẻ **Trụ cột** ở trang chủ mỗi phân hệ (lọc theo phân hệ). Mức đạt đi theo bằng chứng; không có API ghi "đạt". |
| **D026-7** | **Golden Tests** là cổng phát hành P0: đổi mã, đổi nhóm, đổi phân loại, đổi chế độ, chuyển kho qua đổi mã, trả hàng qua đổi mã — không phá sổ cái, giá vốn (bình quân hôm nay, FIFO khi có), lineage. Có tên (`T026-G*`), chạy trong CI, thất bại = chặn phát hành. |
| **D026-8** | Thứ tự: **P0** (nền tảng không được sai) → **P1** (vận hành chuỗi lớn) → **P2** (quy mô, kiểm toán tự động) — chi tiết [00-MASTER-PLAN §5](../phases/PHASE-026-MASTER-DATA-GOVERNANCE/00-MASTER-PLAN.md). |

## Hệ quả

- Thêm: ADR này; PHASE-026; CANON §0.2; `tru-cot.json`; HT10; thẻ Trụ cột; `entity_codes`, `tenant_groups`, chỉ mục tham chiếu, `MasterDataFrame` (theo đợt).
- Không đổi: tên cột `items.item_id` / `parent_item_id`; RLS theo tenant; ba trụ cột I–III; R-ITEM, R-CONT.
- Rủi ro: (1) nhóm đơn vị là thay đổi mô hình lớn — làm sau khi `products` thành khung nhìn (S024-11) để không có hai đường ghi; (2) bảng trụ cột ghi tay có thể lệch code — vì vậy mỗi dòng phải trỏ bằng chứng và SC-PILLAR-1 kiểm tiêu chí "đạt" có bằng chứng tồn tại.

## Liên quan

[PHASE-026](../phases/PHASE-026-MASTER-DATA-GOVERNANCE/README.md) · [PHASE-024 · 70](../phases/PHASE-024-ITEM-MASTER-PHAN-LOAI-HACH-TOAN/70-LO-TRINH-ON-DINH-CORE.md) · [PHASE-025](../phases/PHASE-025-ACCOUNTING-CONTINUITY/README.md) · [R-ITEM](../rules/RULE-ITEM.md) · [R-CONT](../rules/RULE-CONTINUITY.md)
