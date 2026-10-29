# Danh mục hàng chuẩn (DM10 · DM11 · DM14)

Mặt hàng, đơn vị tính, bảng giá và giá bán **khai ở phần mềm kế toán**. Hệ thống bán hàng (multisite) kéo về để hiển thị và bán, không tự sửa.

## Màn hình

| Mã | Màn | Nội dung |
|---|---|---|
| DM10 | Danh mục mặt hàng | Form trọn một mặt hàng, 4 thẻ: **Thông tin** (mã hàng, tên, nhóm, barcode, xuất xứ, khối lượng, ảnh, mô tả) · **ĐVT & giá bán** (đơn vị + tỉ lệ, đơn vị bán chính, giá ở bảng giá công ty và các bảng giá chi nhánh, nút điền theo tỉ lệ) · **Trạng thái** (hàng chính, sữa < 24 tháng, không được bán, xuất điều chỉnh dù vẫn bán, KCT, theo dõi mã định danh) · **Kế toán** (VAT ra/vào, TTĐB, nhóm hạch toán) |
| DM11 | Phân loại hàng hoá | Nhóm hàng (cây) có thêm cột **Mã SKU** dùng sinh mã hàng; nút **Suy mã SKU** điền mã cho nhóm chưa khai từ mã hàng đang có |
| DM14 | Bảng giá bán | Một bảng giá công ty + các bảng giá chi nhánh; gán chi nhánh nào áp bảng giá nào |

## Luật dữ liệu

- Mỗi mặt hàng có **đúng một** đơn vị tỉ lệ 1 (đơn vị nhỏ nhất) và tối đa một đơn vị bán chính. 1 đơn vị = tỉ lệ × đơn vị nhỏ nhất.
- Giá bán đã gồm thuế, theo bảng giá × mặt hàng × đơn vị. Ô trống = chưa khai giá.
- Chi nhánh chưa gán bảng giá thì theo bảng giá công ty. Mỗi chi nhánh một bảng giá.
- **Lấy giá khi bán** (hệ thống bán hàng tính): hàng chính chỉ lấy giá công ty (đúng ĐVT, không có thì quy đổi từ ĐVT khác của giá công ty); hàng thường ưu tiên giá bảng giá chi nhánh rồi mới tới giá công ty.
- Bỏ một đơn vị tính thì giá của đơn vị đó bị xoá theo.

## Sinh mã hàng

`mã hàng = mã SKU nhóm cấp 1 + cấp 2 + cấp 3 + số thứ tự 3 chữ số` — ví dụ `110063101`: 11 Sữa bột · 006 ABBOTT · 3 Sữa công thức trẻ em · 101.

Nhóm cấp 1 là nhóm không có cha. Mặt hàng gắn nhóm sâu hơn cấp 3 thì lấy theo nhóm tổ tiên cấp 3. Số thứ tự = số lớn nhất đang có của cùng tiền tố + 1. Đổi quy tắc (số cấp, độ dài số thứ tự): sửa `SKU_RULE` trong `apps/api/src/modules/catalog/sku-rule.ts`.

## API (`apps/api/src/modules/catalog`)

| | |
|---|---|
| `GET/PUT/DELETE /api/v1/catalog/products/:sku` | trọn một mặt hàng; PUT `?new=1` khi thêm mới (báo trùng mã) |
| `GET /api/v1/catalog/next-sku?groupCode=` | mã hàng kế tiếp theo nhóm |
| `POST /api/v1/catalog/sku-codes/infer` | suy mã SKU nhóm (`apply=false` xem trước) |
| `GET /api/v1/catalog/price-lists`, `PUT/DELETE …/:code`, `PUT …/:code/branches` | bảng giá + gán chi nhánh |
| `GET /api/v1/catalog/feed/meta?since=` | bảng giá, gán chi nhánh, nhóm hàng, mục đã xoá (`catalog_tombstones`) |
| `GET /api/v1/catalog/feed/products?after=&limit=` | mặt hàng đổi sau con trỏ (kèm trọn bộ đơn vị tính) |
| `GET /api/v1/catalog/feed/prices?after=&limit=` | dòng giá đổi sau con trỏ |
| `POST /api/v1/catalog/import` | nạp dữ liệu ban đầu (một lần lúc chuyển sang khai ở đây) |

**Báo ngay:** mọi lệnh ghi thành công vào `/api/v1/catalog/*`, `/api/v1/products*`, `/api/v1/item-classes*` → sau 2 giây (gom nhiều lần sửa) phần mềm gọi `POST …/catalog-changed` của **kết nối chính** (trạm ACC14: đường dẫn `…/pending` đổi thành `…/catalog-changed`, cùng khoá Bearer). Hệ thống bán hàng kéo luồng thay đổi ngay. Báo lỗi thì chỉ ghi log, bên kia vẫn tự kéo 5 phút một lần (`catalog-notify.ts`).

Con trỏ luồng thay đổi có dạng `ISO-thời-điểm|id` (theo `updated_at`, `id`). Bên kéo lưu con trỏ `next` sau mỗi trang, lặp tới khi `more = false`. Xoá thì ghi `catalog_tombstones`, nên bên kéo biết mà xoá theo.

## Hệ thống bán hàng kéo về

Plugin cổng kế toán (`TGS_Acc_Catalog_Sync`, tool `danh-muc-hang.php`):

1. `nap --dry` → `nap`: nạp dữ liệu đang có sang đây.
2. `keo --dry --full --mau`: đối chiếu hai bên, không ghi.
3. `bat`: khoá MỌI thao tác thêm / sửa / xoá danh mục hàng bên bán hàng (trừ thuế suất, còn khai bên đó), nhận báo đổi để kéo ngay, cron 5 phút làm lưới an toàn.

Thuế suất **chưa** kéo về (còn lệch hai bên, xem `SYNC_TAX`).
