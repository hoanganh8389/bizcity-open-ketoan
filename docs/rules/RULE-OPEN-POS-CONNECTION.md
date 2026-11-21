# RULE · open-pos ⇄ open-ketoan — câu hỏi kết nối là luật tối thượng (R-OKT-CONN)
<!-- [2026-11-21 01:23 PM Johnny Chu - Chu Hoàng Anh] R-OKT-CONN — luật kết nối open-pos / open-pos-backend với open-ketoan qua open-ketoan-bridge: standalone đầy đủ, kết nối thì theo kế toán, tự cấu hình ánh xạ mặc định, một blog một tenant (chủ dự án 2026-11-21). -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> **Cấp:** Tier 1 (R-OKT-CONN-1…10). Với phía open-pos, đây là **luật tối thượng**: khi mâu thuẫn với quyết định nào khác của open-pos, luật này thắng.
> **Trạng thái:** **Chấp nhận 2026-11-21** (chủ dự án), **chưa có mã**.
> **Thi hành:** phía WordPress ở repo tgs_shop_management, phase PHASE-001 "Danh mục theo site + đồng bộ open-ketoan" (doc 25; đường dẫn thuộc repo khác). Phía open-ketoan theo mục *Nghĩa vụ phía open-ketoan* bên dưới.
> **Luật nền:** [R-MD](RULE-MASTER-DATA.md) (R-MD-1: kế toán là chủ danh mục), [R-TEN](RULE-TENANT-SECURITY.md) (tenant đi theo khoá API), [R-ECP-CONS](RULE-ENTERPRISE-CONTINUITY.md) (POS là tầng Eventual), [R-GATE](RULE-GATE.md) (R-GATE-9 `auto_create`), [R-FLOW](RULE-FLOW.md).
> **Hợp đồng:** [BIZCITY-CONNECTOR-v1](../contracts/BIZCITY-CONNECTOR-v1.md) · [BIZCITY-MASTER-DATA-v1](../contracts/BIZCITY-MASTER-DATA-v1.md) · feed `GET /api/v1/catalog/feed/{meta,products,prices}`.

## Tên gọi

| Tên | Là gì | Mã nguồn hiện tại |
|---|---|---|
| **open-pos** | Phần bán hàng tại cửa hàng | plugin WordPress `tgs_pos` (+ `tgs_pos_react`) |
| **open-pos-backend** | Phần cấu hình và quản trị của open-pos: sản phẩm, nhóm, giá, thuế, kết nối | plugin WordPress `tgs_shop_management` |
| **open-ketoan-bridge** | Cầu nối duy nhất giữa open-pos và open-ketoan: cấu hình kết nối, gọi API, đẩy chứng từ, nhận sự kiện | plugin WordPress `tgs_accounting_bridge` (thư mục `open-ketoan-bridge`) |

## Nguyên tắc một câu

> **Luôn hỏi trước: shop này có kết nối API thành công với open-ketoan qua bridge không?**
> - **Không:** open-pos chạy **standalone**, shop tự sửa sản phẩm, giá, thuế.
> - **Có:** shop **không sửa** được dữ liệu gốc. open-pos-backend **tự cấu hình ánh xạ mặc định** và lấy **dữ liệu đối chứng chuẩn** từ open-ketoan.

## Luật

| Mã | Luật | Thể hiện khi làm việc |
|---|---|---|
| **R-OKT-CONN-1** | **Một câu hỏi, một hàm.** Mọi thao tác sửa sản phẩm, nhóm, giá, thuế, ĐVT ở open-pos-backend đều hỏi một hàm duy nhất, `tgs_okt_connected( $blog_id )`. Chế độ (`standalone` / `connected`) luôn được **tính** từ hàm đó, không có công tắc để admin đặt tay. | Không có màn hay option "bật danh mục từ kế toán" riêng. Công tắc cũ `catalog_from_erp` của bridge bị gỡ, thay bằng hàm này. |
| **R-OKT-CONN-2** | **"Kết nối thành công" là gì.** Hàm trả lời "Có" khi đủ ba điều: **(a)** open-ketoan-bridge đang bật; **(b)** blog có cấu hình kết nối (URL, khoá API của tenant blog đó); **(c)** lần kiểm sức khoẻ gần nhất (`GET /api/v1/catalog/feed/meta` bằng khoá đó: 200, đúng tenant) thành công. Kết quả kiểm giữ 60 giây, mỗi lần kiểm thật có timeout ngắn. | Bridge tắt, chưa nhập khoá, hoặc kế toán không trả lời đều là "Không". |
| **R-OKT-CONN-3** | **Standalone là chế độ đầy đủ, không phải chế độ lỗi.** Không có open-ketoan, open-pos vẫn bán được. open-pos-backend CRUD đầy đủ sản phẩm, nhóm, bảng giá, ĐVT, thuế trong **bảng theo prefix của blog**. Mã không có thuế dùng thuế mặc định của shop (cấu hình, mặc định 8 %). | Không tính năng bán hàng nào được đòi bridge hay open-ketoan mới chạy. |
| **R-OKT-CONN-4** | **Kết nối thì theo kế toán.** Khi "Có": trường gốc (định danh, SKU, tên chuẩn, ĐVT và quy đổi, nhóm, thuế, giá theo bảng giá, gán bảng giá, barcode, cờ nghiệp vụ) **chỉ đọc** ở open-pos-backend, sửa ở open-ketoan (R-MD-1). Shop vẫn tự quyết các trường vận hành (bán / ẩn tại shop, tên hiển thị trên POS, nhóm POS, thứ tự, min / max). | Ô trường gốc bị khoá phải ghi **vì sao** và **link sửa ở kế toán** (R-BLOCK). |
| **R-OKT-CONN-5** | **Tự cấu hình ánh xạ mặc định.** Khi kết nối thành công lần đầu, open-pos-backend **tự** dựng ánh xạ từ dữ liệu chuẩn của open-ketoan, admin không phải khai tay: blog ↔ tenant (từ khoá), chi nhánh, bảng giá được gán, nhóm, ĐVT, mã thuế, hình thức thanh toán. Lúc đó open-pos-backend chạy kéo đầy đủ lần đầu, rồi đối chứng (đếm dòng, hash theo SKU · giá · thuế) và ghi kết quả. Ánh xạ tự dựng xem được, và chỉ đọc khi đang kết nối. | Màn Kết nối của shop hiện kết quả đối chứng; lệch thì chỉ ra dòng lệch. |
| **R-OKT-CONN-6** | **Một blog = một shop = một tenant.** 2 shop là 2 blog, ứng với 2 `tenant_id`. Tenant đi theo khoá API của từng blog (R-TEN). Hai blog không được giữ chung một tenant: nếu trùng, cả hai trả "Không" và màn mạng báo đỏ. Khoá kết nối là **theo blog**, không phải một khoá cho cả mạng multisite. | Hằng `TGS_KETOAN_API_URL` / `TGS_KETOAN_API_KEY` dùng chung cả mạng không được dùng để trả lời câu hỏi kết nối của từng blog. |
| **R-OKT-CONN-7** | **Kéo qua bridge, một bộ kéo.** Kết nối (cấu hình, khoá, gọi API, nhận `catalog-changed`) đi qua open-ketoan-bridge. **open-pos-backend** giữ việc kéo catalog / giá / thuế và ghi vào bảng theo prefix của blog. Không có job thứ hai ghi catalog. Nhịp: sự kiện tức thời, cron 5 phút, gặp mã lạ, đối soát đêm, bấm tay. | Phần kéo catalog của bridge vào bảng global (`TGS_Acc_Catalog_Sync`) bị gỡ khi open-pos-backend nhận việc. |
| **R-OKT-CONN-8** | **Mã mới tại shop khi đang kết nối.** Shop vẫn tạo được mã mới: mã được **gửi thẳng** open-ketoan (API ghi danh mục, có `Idempotency-Key`) và **bán ngay**. Đơn có mã kế toán chưa biết đi vào accounting events và do open-ketoan xử lý (R-GATE-9, `auto_create` giữ bật). | Mã lên kế toán xong thì trường gốc của nó chỉ đọc như mọi mã khác. |
| **R-OKT-CONN-9** | **Chuyển chế độ không mất dữ liệu.** *Standalone → kết nối:* mã shop tự tạo khớp theo SKU rồi barcode; khớp thì gắn `item_id`, không khớp thì gửi thẳng như mã mới. *Mất kết nối giữa chừng:* là "Không", shop sửa được, mọi sửa trường gốc được ghi nhật ký; khi kết nối thông lại, open-ketoan **ghi đè** và màn hình liệt kê thay đổi đã bị ghi đè. *Bỏ kết nối:* dữ liệu đã kéo ở lại và thành của shop. | Không có bước nào xoá dữ liệu bán hàng hay sổ kho của shop. |
| **R-OKT-CONN-10** | **Phạm vi.** Luật này phủ catalog, giá, hàng hoá. Mua hàng và kho (lô, HSD / EAN, phiếu nhập, chuyển kho) sau này lấy về open-ketoan, theo phase riêng. open-pos và open-pos-backend **không dùng bảng global multisite** (`wp_global_product_*`, `wp_global_htsoft_*`) cho catalog và giá. | Bảng global đứng yên, không xoá, cho tới khi mọi shop đã chuyển sang bảng theo prefix. |

## Nghĩa vụ phía open-ketoan

Luật này **không** thêm gì vào Kernel. Nó chỉ cần open-ketoan giữ đúng những gì đã hứa:

1. **Feed đúng theo tenant** (R-TEN): khoá của blog nào chỉ thấy catalog của tenant đó.
2. **Phân trang feed không lặp, không sót:** sửa con trỏ `feed/products` / `feed/prices` (độ chính xác thời gian, nhiều dòng cùng `now()`).
3. **Có tenant cho từng shop:** hiện các shop đang là chi nhánh (`branches.external_ref = 'blog:N'`) của một tenant. Muốn đúng R-OKT-CONN-6 thì phải có cách tách chi nhánh thành tenant theo shop, kèm số liệu cũ.
4. **Ghi danh mục từ shop có giới hạn:** nên có scope hẹp chỉ cho tạo mã mới, không sửa mã có sẵn (R-OKT-CONN-8).

Mỗi việc trên là một đợt riêng theo [R-FLOW](RULE-FLOW.md): giữ chỗ trong [CLAIMS](../phases/CLAIMS.md), chốt bằng tài liệu, rồi mới code.

## Hiện trạng lệch luật (2026-11-21, đọc mã `open-ketoan-bridge` 0.5.0)

| Chỗ | Hiện trạng | Lệch khoản |
|---|---|---|
| `TGS_Acc_Config` | URL / khoá lấy từ hằng wp-config hoặc `get_site_option` (một bộ cho cả mạng) | R-OKT-CONN-6 |
| `TGS_Acc_Catalog_Sync` | Kéo vào bảng global `wp_global_product_name`, `wp_global_htsoft_*`; công tắc `catalog_from_erp`; `SYNC_TAX = false` | R-OKT-CONN-1, -7, -10 |
| `TGS_Acc_Branch_Sync` | Tạo **chi nhánh** cho từng site trong một tenant | R-OKT-CONN-6 |
| `catalog/feed/*` (open-ketoan) | Con trỏ mili-giây, có thể lặp khi ≥ `limit` dòng cùng thời điểm | Nghĩa vụ 2 |
