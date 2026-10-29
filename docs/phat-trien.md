# Phát triển

## 0. Người mới: đọc theo thứ tự này

Trong giao diện: **Tiện ích → Kiến trúc & Nghiệp vụ (TI10)**, tab *Tài liệu nghiệp vụ* (nguồn `docs/nghiep-vu/`).

| Ngày | Đọc | Để hiểu |
|---|---|---|
| 1 | `nghiep-vu/01-ke-toan-cho-lap-trinh-vien.md` | Tài khoản, Nợ / Có, bút toán, ghi số âm, so sánh với khái niệm lập trình |
| 1 | `nghiep-vu/02-nguyen-tac-va-nghiep-vu-mau.md` | Sáu luật không đổi, các nghiệp vụ mẫu |
| 2 | `nghiep-vu/03-luong-du-lieu-va-cau-truc-bang.md`, tab *Luồng dữ liệu*, *Cấu trúc dữ liệu* | Chứng từ đi qua những bảng nào |
| 2 | `nghiep-vu/06-tinh-huong-ghi-so.md` | Bán, hoàn hàng, sửa, huỷ… ghi gì, lưu ở đâu |
| 3 | `nghiep-vu/04-…`, `05-…` | Kho, giá vốn; thuế, công nợ, liên kết bút toán |
| 3 | `kien-truc.md`, mục 3 bên dưới | Đường đi của một chứng từ trong code |
| 4 | `api/README.md` và `api/02-ban-hang.md` | Hệ thống ngoài gửi chứng từ thế nào |
| 4 | `can-cu/00-cach-dung.md` | Chức năng nào theo văn bản pháp luật nào |

Bài tập đầu tiên nên làm: chạy máy dev (mục 1), gửi thử một phiếu bán bằng `docs/api/vi-du`, rồi xem bút toán ở **Chứng từ kế toán (ACC3)** và bảng ở tab *Cấu trúc dữ liệu*; sửa phiếu (gửi `version: 2`) để thấy bút toán đảo và dòng `ledger_links`.

## 1. Chạy máy dev

Cần Node ≥ 22.12 và Docker.

```bash
npm install
cp .env.example .env
docker compose up -d db          # PostgreSQL ở 127.0.0.1:5434
npm run db:seed                  # migration + dữ liệu khởi tạo (đơn vị demo)
npm run dev                      # đủ phân hệ: API http://localhost:4100 + giao diện http://localhost:4180
```

**Chạy theo phân hệ** — làm phần nào chạy phần đó (`scripts/dev.mjs`):

| Lệnh | Chạy |
|---|---|
| `npm run dev:mua-hang` (`:ban-hang`, `:kho`, `:quy`, `:tai-san`, `:thue`, `:ke-toan`) | API chỉ bật phân hệ đó (+ lõi) + giao diện chỉ hiện phân hệ đó |
| `npm run dev -- kho,ban-hang` | Nhiều phân hệ |
| `npm run dev -- mua-hang --api=https://<api-dev>` | **Chỉ giao diện**, gọi API dev dùng chung — không cần cơ sở dữ liệu trên máy (dân làm giao diện) |
| `npm run dev -- mua-hang --api-only` | Chỉ API |

Biến môi trường của API: xem `apps/api/src/config/env.ts`. Mặc định dev nối `postgres://ketoan:ketoan@localhost:5434/ketoan`; API dev tự áp migration (`AUTO_MIGRATE=1`).

### Cấu trúc theo phân hệ (giao việc)

Mỗi phân hệ có **hai thư mục cùng tên** — ai được giao phân hệ nào thì làm trong hai thư mục đó:

```
apps/api/src/phan-he/<phân hệ>/     index.ts (route phân hệ cần) + mã nguồn riêng của phân hệ
apps/web/src/phan-he/<phân hệ>/     manifest.ts (tên, mô tả, biểu tượng, nhóm menu) · menu.ts · routes.tsx · màn hình
```

| Phân hệ | Máy chủ riêng | Giao diện riêng |
|---|---|---|
| ke-toan | planning | closing, periods, opening, reports, planning, requirements, dashboard, debts |
| quy | payment-requests | đề nghị thanh toán |
| mua-hang | (đợt sau: phiếu mua) | phiếu mua hàng, trả hàng NCC (dữ liệu giả) |
| ban-hang | — | sales, phiếu bán hàng, hàng bán trả lại (dữ liệu giả) |
| kho | — | inventory, báo cáo hàng hoá, phiếu chuyển kho (dữ liệu giả) |
| tai-san | — | assets |
| thue | statements, authority-invoices | tax, statements |
| api | (đợt sau: /api/v1/trade-documents) | Thử API, Hướng dẫn API, Nguồn dữ liệu màn hình |
| he-thong | — | menu |

**Lõi** (dùng chung, nhiều phân hệ gọi tới — sửa phải cẩn thận, có người duyệt):

| Phần | Thư mục |
|---|---|
| Cơ sở dữ liệu | `db/` (migrations, seeds) — `db/README.md`; Docker: job `db-migrate` |
| Khuôn API dùng chung | `packages/contracts` |
| Máy chủ: đăng nhập, chứng từ, định khoản, sổ cái, kho, công nợ, báo cáo, tài sản, danh mục | `apps/api/src/core`, `apps/api/src/modules/*`, route lõi ở `apps/api/src/phan-he/loi.ts` |
| Giao diện: màn dùng chung (chứng từ, phiếu, danh mục, cấu hình, hệ thống), thành phần, vỏ | `apps/web/src/features`, `components`, `layout`, `lib` |

**Màn làm trước API (dữ liệu giả):** màn dùng `lib/tradeDocs.ts` (khuôn JSON + chọn nguồn giả / thật) và `lib/mockStore.ts` (kho giả ở trình duyệt), JSON mẫu `mau-*.json` đặt cạnh màn. Người làm giao diện xong màn với dữ liệu giả; người phụ trách API viết endpoint theo `docs/api/13-phieu-nhap-tay.md` rồi bật "API thật" ở **API → Nguồn dữ liệu màn hình**. Màn mới làm theo kiểu này: viết hợp đồng ở `docs/api/`, khuôn + dữ liệu giả ở lõi `lib/`, màn ở phân hệ.

**Luật:** phân hệ không import phân hệ khác — chỉ import lõi. Cần dùng chung thì đưa phần đó về lõi (vd kiểu `DebtItem` ở `lib/debts.ts`, bộ lọc `components/salesFilters.tsx`). Kế toán xem được mọi số liệu nên bật kèm các phân hệ khác qua `includes`, không import chéo.

Người phụ trách từng thư mục khai ở `.github/CODEOWNERS` (PR đụng thư mục nào thì người đó duyệt).

## 2. Kiểm thử

```bash
npm test            # apps/api/test — chạy trên PostgreSQL thật
npm run typecheck   # kiểm tra kiểu cả ba gói
```

Mỗi lần chạy kiểm thử tạo một đơn vị riêng (`t<thời điểm>`) nên không đụng dữ liệu khác. Phép thử đi qua cả luồng: nhận chứng từ → định khoản → sổ cái → báo cáo, gồm gửi trùng, đổi phiên bản (ghi số âm), khoá sổ, lỗi cấu hình và ghi sổ lại.

## 3. Thêm một loại chứng từ

1. `packages/contracts/src/documents.ts`: thêm khuôn và đưa vào `ingestDocumentSchema`; thêm vào `DOC_TYPES`.
2. `apps/api/src/modules/posting/rules/<loai>.rule.ts`: viết luật (dùng `EntryBuilder`, `AccountResolver`).
3. `posting.service.ts`: thêm vào `RULES`.
4. Thêm phép thử.
5. Viết hướng dẫn nếu có màn hình mới.

## 4. Thêm một module API

Mã nguồn chỉ một phân hệ dùng: tạo trong `apps/api/src/phan-he/<phân hệ>/<ten>/` (`schemas`, `repository`, `service`, `routes`) và khai `routes` ở `phan-he/<phân hệ>/index.ts`. Dùng chung nhiều phân hệ: tạo ở `apps/api/src/modules/<ten>/`, khai vào `phan-he/loi.ts` (lõi) hoặc các phân hệ cần. Cần bảng mới thì thêm migration, cập nhật `db/types.ts`, và khai mô tả bảng trong `modules/system/schema-catalog.ts` (phép thử `db-rules` báo lỗi nếu quên; mô tả này hiện ở tab *Cấu trúc dữ liệu*).

## 5. Thêm một màn hình

1. Màn của một phân hệ: `apps/web/src/phan-he/<phân hệ>/<nhom>/<Ten>Page.tsx`; màn dùng chung: `apps/web/src/features/<nhom>/` — dùng `PageHeader` (có `helpKey`), `useQuery`, `DataGrid`.
2. Thêm `<Route>` ở `phan-he/<phân hệ>/routes.tsx` (màn dùng chung: `pages.tsx`) và mục menu ở `phan-he/<phân hệ>/menu.ts` (đặt mã chức năng). Muốn nhóm menu hiện thêm ở phân hệ khác thì thêm khoá nhóm vào `manifest.ts` của phân hệ đó (mảng `groups`).
3. Viết `docs/huong-dan/<helpKey>.md` (mọi màn, kể cả form / hộp thoại, có nút Hướng dẫn).
4. Form / bảng làm theo quy ước ở mục 6a–6c (xem trước rồi Sửa, nút `data-view-ok`, ĐVT quy về nhỏ nhất).

## 4b. Thêm một phân hệ

1. Giao diện: tạo thư mục `apps/web/src/phan-he/<key>/` với `manifest.ts` (`key`, `label`, `description`, `icon` tên biểu tượng lucide — thêm vào `phan-he/icons.tsx` nếu mới, `color`, `order`, `groups`), `menu.ts`, `routes.tsx`; thêm vào `WEB_MODULES` (`phan-he/index.ts`), `layout/menu.ts` (nhóm menu) và `pages.tsx` (routes).
2. Máy chủ: tạo `apps/api/src/phan-he/<key>/index.ts` (cùng `key`, liệt kê routes phân hệ cần), thêm vào `API_MODULES` trong `phan-he/index.ts`.
3. `package.json` gốc: thêm `"dev:<key>": "node scripts/dev.mjs <key>"`; `.github/CODEOWNERS`: thêm người phụ trách.

## 5a. Phiếu nghiệp vụ và trạm định khoản

Nguyên tắc: **phần mềm kế toán là nơi duy nhất ghi sổ**, nhưng **không lập phiếu mua, bán, kho**: các phiếu đó lập ở hệ thống bán hàng (multisite WordPress, WooCommerce…) và vào qua trạm ACC14 — kéo qua kết nối (`modules/connections`, cấu hình ở `tenants.settings.connections`) hoặc hệ thống nguồn đẩy vào cổng chờ `POST /api/v1/documents`. Cả hai đi qua một cửa `postDocumentIn` (`modules/documents/document.service.ts`). Không thêm bảng riêng cho từng loại phiếu: nội dung nằm trong `accounting_events.payload`; báo cáo cần dòng hàng thì đọc view (ví dụ `sales_lines`, `sales_payments`, `posted_event_payloads` — migration 0053). Đầu chuẩn cho hệ thống nguồn: [cong-ket-noi.md](cong-ket-noi.md).

Phiếu kế toán tự lập (thu, chi, báo nợ, báo có, phiếu kế toán) dựng trên `apps/web/src/components/voucher/`:

| Thành phần | Dùng cho |
|---|---|
| `VoucherListPage` + `useListFilter` | Màn danh sách: bảng lọc trái (ngày, chi nhánh nhớ theo màn, chọn nhanh), thanh nút Thêm / Sửa / Copy / Xóa / Nạp / Xuất, lưới có cột Chọn; bấm dòng mở phiếu |
| `VoucherModal` + `L` / `C` + `useVoucherSave` + `readOnlyReason` | Hộp phiếu: thanh nút Ghi / Ghi và thêm mới / In / Xuất / Xóa / Đóng, lưới đầu phiếu, lời báo lỗi, luồng ghi / xóa, phiếu chỉ xem |
| `lookups.ts` | Chiều phân tích |
| `FormBlocks` (`GroupBox`, `InputField`, `Field`, `FormGrid`, `FormTabs`) | Bố cục form kiểu phần mềm để bàn (form bán hàng, form xem chứng từ) |

**Phân hệ và menu**: `layout/menu.ts` — `MODULES` khai các phân hệ trên thanh trên cùng (Kế toán, Bán hàng, Mua hàng, Kho, Hệ thống), mỗi phân hệ là danh sách key nhóm menu. Màn mới: thêm vào nhóm của phân hệ mình phụ trách.

**Trạm ACC14**: mọi chứng từ có cấu trúc đi qua `postDocumentIn`; chứng từ kéo qua kết nối luôn chờ (`hold`), chứng từ đẩy vào cổng chờ theo chế độ của loại chứng từ, mặc định *Chờ định khoản* (`tenants.settings.postingModes`): chỉ lưu (status `pending`, ghi `posting_log` 'receive'); xem trước bằng `GET /api/v1/documents/:id/preview` (chạy định khoản trong giao dịch rồi huỷ); định khoản theo lô bằng `POST /api/v1/documents/post {ids, repost}`. Phiên bản mới của chứng từ đã định khoản: lại `pending`, bút toán cũ giữ tới khi định khoản lại (đảo bằng ghi số âm, `ledger_links`). Không sửa / xoá bút toán, không sửa `posting_log`. Màn mới bám màn tương ứng mà kế toán đang quen dùng (tên ô, thứ tự cột, lời báo), không tự đặt bố cục khác.

## 5b. Bảng yêu cầu nghiệp vụ (YC01)

Màn **Yêu cầu nghiệp vụ → Tài chính – Kế toán** liệt kê từng yêu cầu trong file yêu cầu của công ty và tình trạng đáp ứng. Dữ liệu ở `apps/web/src/features/requirements/finance-requirements.ts`.

Làm xong hoặc làm thêm một phần yêu cầu nào thì **sửa mục đó trong cùng lần thay đổi mã**: trạng thái từng tính năng, ghi chú phần còn thiếu, cách đáp ứng, mã màn, tài liệu hướng dẫn, ngày cập nhật. Chi tiết: [huong-dan/yeu-cau-nghiep-vu.md](huong-dan/yeu-cau-nghiep-vu.md).

## 6. Giao diện

- Màu và thành phần: `apps/web/src/styles/theme.css` (đổi màu thương hiệu ở các biến `--brand-*`).
- Số tiền dùng `<Money>`; ô số dùng lớp `num`; số âm tự đỏ.
- Thông báo lỗi lấy từ API (`errorText`), không tự đặt câu chữ khác.

### 6a. Quy ước thêm / sửa / xoá (mọi form)

| Việc | Cách làm |
|---|---|
| Form sửa bản ghi | `<Modal viewFirst={!isNew} …>`. Mở bản ghi đã có ở chế độ **xem**, chân hộp thoại chỉ có [Sửa] [Thoát]. Bấm Sửa / Enter / F2 mới mở khoá (bấm đúp không mở). Thêm mới thì mở sẵn để nhập. Sửa bản ghi đã có rồi Ghi: `const viewAgain = useViewAgain()`, `<Modal viewAgain={viewAgain} …>`, lưu xong gọi `viewAgain[1]()` thay cho `onClose()` — ở lại hộp thoại, quay về chế độ xem. |
| Nút vẫn dùng được khi đang xem (Xoá, In, Huỷ phiếu…) | Gắn `data-view-ok` lên nút trong `footer`; hộp thoại tự giữ lại. Phần tử trong thân hộp thoại cần bấm được khi xem cũng gắn `data-view-ok`. |
| Khung riêng không dùng `Modal` (như phiếu mua) | Trạng thái `viewing` (đã ghi, chưa duyệt) / `frozen` (đã duyệt, huỷ); `readOnly = frozen \|\| viewing`; gắn class `view-plain` lên vùng đang xem. |
| Bảng sửa tại chỗ | Nút "Sửa bảng" → `fieldset disabled={!edit}` + class `view-plain`; Lưu xong / Huỷ sửa thì về chế độ xem. |
| Xoá | Máy chủ chặn xoá bản ghi đã dùng (409 kèm câu hướng dẫn "bỏ tích Đang dùng / Áp dụng"); giao diện hỏi lại trước khi xoá. |
| Kiểm tra dữ liệu | Kiểm ở **máy chủ** (zod + câu tiếng Việt), giao diện chỉ báo sớm. Ràng buộc nào cần chắc chắn thì đặt luôn ở CSDL (UNIQUE, CHECK, trigger). |
| Mở form danh mục từ màn khác | Dùng `PartnerEditor({ code?, kind })` và `ProductEditor({ sku, startTab?, startEditing? })`. Không chép lại form. |

### 6b. Bảng và cột

- Bảng thường dùng một trong các lớp `mh-mini`, `mh-lines`, `grid-table`, `voucher-lines`, `table.grid` → tự có kẻ cột, nền tiêu đề, dòng xen màu, vạch kéo cột (theme.css, mục "GIAO DIỆN DỄ NHÌN"). Không tự viết bảng trắng không kẻ.
- Form dài: nhóm ô trong `fieldset.fgroup` hoặc khối `.blk` — thân hộp thoại nền xám nhạt, mỗi nhóm là khối trắng viền màu.

- Mọi `<table>` một hàng tiêu đề **tự kéo giãn cột** được và nhớ độ rộng theo màn (`lib/colResize.ts`, cài một lần ở `main.tsx`). Bảng nào không muốn thì gắn `data-no-resize`.
- Danh sách lớn dùng `DataGrid`: có bộ kéo cột, lọc, xuất Excel riêng.
- Chế độ xem dùng chung CSS: `.modal.is-locked` / `.view-plain` làm ô nhập hiện như chữ thường. Không tự viết kiểu riêng.

### 6c. Đơn vị tính (mọi phân hệ)

- Tên ĐVT nằm ở `unit_names` (DM15). Tỉ lệ nằm ở `product_units`, đúng một dòng tỉ lệ 1 = ĐVT nhỏ nhất = ĐVT tồn kho.
- Phiếu giữ ĐVT người dùng chọn. **So sánh, cộng dồn, ghi kho đều quy về ĐVT nhỏ nhất.** Dùng các hàm chung: `ratioOf`, `priceFor`, `defaultUnitFor` (`packages/contracts/src/mua-hang/gia-mua.ts`); `orderProgress(…, units)`, `ratioIn` (`dat-hang.ts`).
- Khai / hiển thị theo ĐVT trung gian ("1 Thùng = 12 Lốc"), chuỗi quy đổi, giá gợi ý, kiểm bộ ĐVT: `refOf`, `chainText`, `suggestPrice`, `unitProblems` (`packages/contracts/src/dvt.ts`). Ô chọn tên ĐVT dùng `UnitNameInput`; thẻ Đơn vị tính là `DvtQuyDoi`, thẻ Giá bán là `GiaBan` (`features/catalog/DvtGiaBan.tsx`). Giá mua không đặt ở thẻ ĐVT: giá mua riêng của sản phẩm (`supplier_products` NCC trống) và giá theo từng NCC nằm ở thẻ Mua hàng.
- Form dài chia thành **khối màu** dùng chung `.blk blk-blue | blk-green | blk-purple | blk-orange` (theme.css).
- Không viết lại phép quy đổi ở chỗ khác.
- Tên ĐVT mới khai ở mặt hàng được trigger tự thêm vào danh mục. Đừng chèn tay vào `unit_names`.

### 6d. Cơ sở dữ liệu tự giải thích

- Mỗi cột mới trong migration viết kèm `COMMENT ON COLUMN …` bằng tiếng Việt. Trang **Cơ sở dữ liệu mua hàng (MH13)** đọc thẳng các chú thích này qua `/api/v1/purchase/db-schema`.
- Bảng mới: thêm vào `schema-catalog.ts` (nhãn, mục đích). Nếu là bảng của phân hệ Mua hàng thì thêm vào `DB_LAYERS` (`apps/api/src/phan-he/mua-hang/csdl.ts`).
- Trigger mới: thêm một câu giải thích vào `TRIGGER_NOTES`.

### 6e. Mặt hàng trên chứng từ, nhãn hàng, khuyến mại (dùng chung)

- **Chọn mặt hàng:** mọi bảng có mã hàng dùng `thanh-phan/ChonMatHang` (bấm dòng là thêm, ↑ ↓ Enter, lọc nhãn, `repeat` = bấm lại cộng số lượng, `onPickAll` = thêm cả danh sách). Không làm ô chọn mã từng dòng mới.
- **Tên hàng, ĐVT, thuế suất, nhãn trên dòng chứng từ không gõ tay** — lấy theo danh mục mặt hàng; ĐVT là ô chọn trong ĐVT đã khai của mã.
- **Nhãn hàng chỉ khai ở danh mục mặt hàng** (`products.brand_code`). Máy chủ ghi `lines[].brandCode` khi lưu (`withBrands`), nhãn phiếu tự suy (`docBrand`). Số liệu theo nhãn nhân `brandShare(doc, nhãn)`; không lọc theo `doc.brandCode ===`.
- **Khuyến mại:** quà mua X tặng Y tính bằng `giftPlan` (một nơi — kiểm tra máy chủ, bảng khuyến mại, tự thêm quà đều gọi). Giao diện: `syncGifts` khi bảng hàng đổi + `promoBoard` cho `thanh-phan/KhuyenMai` (dải trên bảng, khung Trợ lý, bảng đầy đủ).

## 7. Phát hành

```bash
docker compose up -d --build
```

API khi khởi động tự chạy migration và seed (chỉ thêm cái còn thiếu). Sao lưu: `docker compose exec db pg_dump -U ketoan ketoan > backup.sql`.
