# Phiếu bán / trả hàng nhập tay vào sổ thật; kho lấy sổ open-ketoan làm gốc (chữ chốt đợt (b) Bán hàng)
<!-- [2026-11-13 11:00 PM Võ Hoàng] NGHIEM-THU — chữ chốt đợt (b) Bán hàng: module modules/phieu-ban thay dữ liệu giả của BH10 / BH11; số phiếu theo cửa hàng; chính sách cùng bộ tính máy bán; quyết định kho gốc open-ketoan (phiếu NT-BH-015) (đóng góp) -->

Phiếu nghiệm thu: [NT-BH-015](../nghiem-thu/ban-hang/NT-BH-015-phieu-ban-nhap-tay.md). Quyết định của anh Hoàng (POS) ngày 13/11/2026.

## 1. Quyết định nền: kho lấy sổ open-ketoan làm gốc

**Vấn đề.** Đang có hai sổ kho chạy song song:
- WP multisite (`tgs_shop_management`, mỗi shop một site) tính tồn từ mọi phiếu kho của shop.
- open-ketoan tính tồn chỉ từ chứng từ nó nhận được: đơn máy bán POS, và phiếu bán / trả từ cầu nối `tgs_accounting_bridge`.
- Phiếu nhập, chuyển kho, kiểm kê, tồn đầu kỳ ở WP **không** sang open-ketoan. Kho trong shop chưa ánh xạ sang kho của chi nhánh.

Hậu quả: tồn ở open-ketoan lệch tồn thật, nên tồn hiện ở máy bán React, giá vốn và lãi gộp đều sai.

**Chọn (A): open-ketoan là sổ kho gốc.**
- Mọi việc kho làm ở open-ketoan:
  - nhập mua: phân hệ Mua hàng;
  - chuyển hàng xuống shop: MH19;
  - chuyển kho: KHO01;
  - kiểm kê: KHO02;
  - bán, trả: máy bán POS và phiếu nhập tay của đợt này.
- WP chỉ nhận bản sao để xem và để phát hành hoá đơn như hiện nay.
- Chuyển **từng shop**, tại một ngày chốt:
  1. đếm tồn thực tế;
  2. nhập **tồn đầu kỳ** của shop vào open-ketoan theo kho;
  3. từ ngày đó mọi phiếu kho của shop làm ở open-ketoan, phiếu kho trên WP của shop khoá lại.
- Chạy thử 1 shop trước.

Đã cân nhắc (B) — giữ WP làm gốc, cầu nối gửi thêm mọi phiếu kho sang. Không chọn vì phải nuôi hai sổ kho lâu dài, và đi ngược hướng các phân hệ Mua hàng / Kho đang làm.

**Ngoài phạm vi đợt này** (làm ở việc riêng, cần chủ dự án và người giữ phân hệ Kho / Mua hàng đồng ý):
- quy trình chuyển shop, nhập tồn đầu kỳ theo kho;
- khoá phiếu kho phía WP;
- ánh xạ kho WP ↔ kho chi nhánh.

Đợt này chỉ:
- **ghi phiếu theo kho của sổ kế toán**;
- **cảnh báo** khi cửa hàng chưa chuyển kho sang (NT-BH-015 §6 dòng 3).

Dấu "đã chuyển" của cửa hàng: khoá cấu hình module `bizcity.phieu-ban.stock_cutover` (danh sách mã cửa hàng đã chuyển), cho tới khi có màn chuyển shop.

## 2. Chỗ đặt: module mới `phieu-ban` (đề xuất, tạo ở PR code)

- Hợp đồng cũ [docs/api/13](../api/13-phieu-nhap-tay.md) bảo viết ở `apps/api/src/phan-he/api/`. ADR-0024 đã đóng băng `phan-he/`, chức năng mới phải ở `modules/<key>/`. Anh Hoàng chọn **module mới** (13/11).
- Tạo bằng `npx bizcity module new phieu-ban --label "Phiếu bán nhập tay"`:
  - API ở `/api/v1/m/phieu-ban/…`;
  - màn ở `/app/phieu-ban/…`;
  - bảng ở schema `mod_phieu_ban`.
- Nộp sổ qua `ctx.ledger.submit` như module `pos`. Không ghi bảng của Core, không viết số tài khoản.
- [docs/api/13-phieu-nhap-tay.md](../api/13-phieu-nhap-tay.md) sửa lại:
  - phiếu bán / trả trỏ sang module này;
  - phần chuyển kho đã có API riêng (KHO01);
  - mua hàng đã có API ở phân hệ Mua hàng.
- Menu Bán hàng: *Phiếu bán hàng*, *Hàng bán trả lại* trỏ màn của module. Đường cũ `/ban-hang/phieu-ban`, `/ban-hang/tra-lai` chuyển hướng sang màn mới.

## 3. Hình dạng

**Bảng của module** (migration module, schema `mod_phieu_ban`):

| Bảng | Nội dung |
|---|---|
| `docs` | Một phiếu: `doc_id` (uuid), `kind` (`sale` / `sale_return`), `branch_code`, `warehouse_code`, `doc_no`, `doc_date`, `status` (`draft` / `approved`), `partner_code`, `original_doc_id` (phiếu trả), `body` jsonb (dòng, thu tiền, hoá đơn, ghi chú — khuôn `TradeDoc` của docs/api/13), `ledger_doc_key`, `ledger_version`, người lập / duyệt, thời điểm. `UNIQUE (tenant_id, branch_code, kind, doc_no)` |
| `code_counters` | Bộ đếm số phiếu: cửa hàng × loại × tháng, tăng một chiều (như `mod_pos.code_counters`) |

**Số phiếu:**
- Dạng `BH` (bán) / `TL` (trả) + `yyMM` + 6 số, theo cửa hàng.
- Để trống thì cấp lúc Ghi lần đầu.
- Gõ tay thì phải đúng khuôn và chưa có trong cửa hàng + loại, không thì báo lỗi `VALIDATION_ERROR` với câu "Số phiếu … đã có ở cửa hàng …".
- Không dùng `ctx.documents.nextNumber`, vì dãy của nó không theo cửa hàng.

**Action** (`/api/v1/m/phieu-ban/…`):

| Lệnh | Đường | Việc | Quyền |
|---|---|---|---|
| GET | `/docs?kind=&from=&to=&branchCodes=&status=&search=&page=&pageSize=` | danh sách | `documents:read` |
| GET | `/docs/:id` | một phiếu | `documents:read` |
| POST | `/docs` | thêm nháp, cấp số | `documents:write` |
| PUT | `/docs/:id` | sửa nháp | `documents:write` |
| DELETE | `/docs/:id` | xoá nháp (chưa từng duyệt) | `documents:write` |
| POST | `/docs/:id/approve` | duyệt → `ctx.ledger.submit` | `documents:write` |
| POST | `/docs/:id/unapprove` | bỏ duyệt → `ctx.ledger.cancel` (đảo bút toán), về nháp | `documents:write` |
| GET | `/docs/:id/returnable` | số còn trả được của phiếu bán | `documents:read` |

**Chứng từ nộp khi duyệt:**
- `sale` / `sale_return` theo khuôn `bizcity_ledger_intake@1`, như `toSaleDocument` của module pos.
- `docKey` = `phieu-ban:<doc_id>`.
- `version` tăng mỗi lần duyệt lại sau khi bỏ duyệt.
- Kho: `warehouseCode` của phiếu.
- Dòng có khuyến mại mang `policyRef` + `promoDiscount`, để cửa nạp kiểm lại (IN-POL-*).
- Phiếu trả mang `originalDocKey` của phiếu bán gốc.

**Giá và chính sách:**
- Giá đọc bảng giá theo cửa hàng (`bizcity_read.branch_prices`, như máy bán).
- Màn gọi `core.policy.evaluate` (cùng bộ tính máy bán React dùng) khi đổi dòng / khách / ngày.
- Người lập chọn hoặc bỏ từng khuyến mại.
- Máy chủ không tin số của màn: lúc Ghi tính lại tổng; lúc duyệt, cửa nạp kiểm `policyRef`.

**Phiếu giả cũ ở trình duyệt:**
- Không chuyển.
- Màn báo một lần, rồi `tradeDocs.ts` bỏ nguồn `sale` / `sale_return`.
- Nguồn `transfer` và các loại khác giữ nguyên.

## 4. Ảnh hưởng

- **Sổ:** thêm chứng từ bán / trả từ phiếu nhập tay, cùng luật định khoản với chứng từ bán hiện có. Không đổi Kernel, Platform, hợp đồng.
- **Core:** không đổi.
- Module mới đăng ký quyền đọc các view `bizcity_read.*`:
  - `branches`;
  - `products`;
  - `tax_codes`;
  - `payment_methods`;
  - `partners`;
  - `branch_prices`;
  - `stock_on_hand`.
- **Giao diện:**
  - BH10 / BH11 thôi chạy dữ liệu giả;
  - `apps/web/src/lib/tradeDocs.ts` bỏ hai loại;
  - menu và tuyến cũ chuyển hướng;
  - Luồng chi tiết Bán hàng: ô Phiếu bán (BH10) trỏ màn mới.
- **Để đợt sau:**
  - phát hành hoá đơn điện tử từ phiếu nhập tay (NT-BH-015 Q1);
  - chặn hạn mức nợ (Q2, đợt 4);
  - quy trình chuyển kho shop (§1).

## 5. Kiểm bằng gì

- **Test tích hợp `apps/api/test/nt-bh-015-phieu-ban-nhap-tay.test.ts` (đề xuất)** theo NT-BH-015 §5 dòng 1–9, §6 dòng 2–6:
  - số theo cửa hàng, chặn trùng;
  - duyệt → bút toán và tồn;
  - bỏ duyệt → đảo;
  - trả nối gốc, không quá số còn trả;
  - chính sách mang `policyRef`.
- **Test thuần ở thư mục test của module (đề xuất):** tính tổng, khuôn số, còn trả được.
- **Các phép kiểm chung:**
  - `npx bizcity module check phieu-ban`;
  - selfcheck, kiem-chuan.
- **Chạy thật trên Docker demo:** lập → duyệt → xem sổ, tồn → bỏ duyệt → trả.

## 6. Làm thật khác chữ chốt (bước 1, 13/11)
<!-- [2026-11-13 11:55 PM Võ Hoàng] NGHIEM-THU — ghi điểm làm thật khác chữ chốt đợt (b) bước 1 (đóng góp) -->

| # | Chữ chốt | Làm thật | Vì sao |
|---|---|---|---|
| 1 | Màn ở `/app/phieu-ban/…` của module, đường cũ chuyển hướng | Màn BH10 / BH11 **giữ ở khung giao diện** (`components/phieu-hang`); `lib/tradeDocs.ts` trỏ `sale` / `sale_return` sang `/api/v1/m/phieu-ban/docs`, luôn chạy API thật. Module không có màn riêng | Màn đã đủ ô, đọc dữ liệu qua `tradeApi` đúng khuôn TradeDoc — làm lại màn trong module (chỉ ui-kit) là dư; menu, Luồng chi tiết không phải sửa |
| 2 | Giá theo bảng giá cửa hàng + `core.policy.evaluate` trên màn | **Bước 2** | Phải sửa form dùng chung `components/phieu-hang/PhieuHangForm.tsx` (dùng cho cả mua hàng, chuyển kho) — mở rộng phạm vi giữ chỗ trước |
| 3 | Cảnh báo tồn / cửa hàng chưa chuyển kho (khoá `stock_cutover`) | **Bước 2** | Như mục 2 (cảnh báo hiện ở dòng của form) |
| 4 | Không nhắc | `package-lock.json` thêm 2 mục khai báo workspace của module (18 dòng) | Bản dựng Docker chạy `npm ci`; tệp đang trong dòng giữ chỗ MH22 (quá hạn) — mở rộng phạm vi khi người giữ đồng ý |
| 5 | Lỗi có mã `reason` | Chỉ câu báo | Thêm mã vào `ERROR_REASONS` là đổi `packages/contracts` |
| 6 | Quyền `documents:read` / `documents:write` | Quyền của module `phieu-ban:read` / `phieu-ban:write` (vai trò chủ, kế toán trưởng, kế toán; xem thêm viewer) | Luật module: quyền `<key>:<việc>` |
