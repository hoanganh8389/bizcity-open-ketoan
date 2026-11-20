# Cơ cấu tổ chức (DM16)
<!-- [2026-11-03 10:39 AM Nguyễn Văn Thủy] SDTC — hướng dẫn màn Sơ đồ tổ chức -->
<!-- [2026-11-03 02:10 PM Nguyễn Văn Thủy] SDTC — viết lại gọn theo màn đơn giản, bỏ "đơn vị mua hàng" -->
<!-- [2026-11-03 03:00 PM Nguyễn Văn Thủy] SDTC — bỏ ô Mã ngắn, Alias -->

<!-- [2026-11-13 Nguyễn Văn Thủy] Cơ cấu tổ chức một màn: công ty, cơ cấu, cửa hàng, kho, phòng ban; nhiều công ty cha; lịch sử thay đổi -->

<!-- [2026-11-20 Nguyễn Văn Thủy] khai báo từng bước, có hoạt động, chỉ để thống kê, xoá trắng (0171) -->

## Khai báo từng bước (mặc định khi mở màn)

Cây linh hoạt: **Công ty (cấp 0) → Chi nhánh cấp 1 → cấp 2 → cấp 3 … → Cửa hàng**. Cấp nào dùng do đơn vị quyết; không dùng thì bỏ qua bước đó.

| Bước | Khai gì | Gợi ý (ví dụ công ty chuỗi cửa hàng) |
|---|---|---|
| 1. Công ty | Mã, tên, MST. Thêm được nhiều công ty | Công ty CP … |
| 2. Chi nhánh cấp 1 | Vùng / miền để gom số | Miền Bắc, Miền Trung, Miền Nam — thường tích *Chỉ để thống kê* |
| 3. Chi nhánh cấp 2 | Chi nhánh mua hàng | MST riêng, kho tổng, phòng kế toán → tích *Có hoạt động* |
| 4. Chi nhánh cấp 3 | Tỉnh / khu vực | gom các cửa hàng; có kho riêng thì tích *Có hoạt động* |
| (thêm cấp) | Cấp sâu hơn khi cần | luôn có một bước trống để khai cấp mới |
| Cửa hàng | Điểm bán, mã khớp hệ thống bán hàng | tự có bộ phận riêng |
| Kho & bộ phận | Kho, bộ phận (phòng ban, tổ, nhóm…) | kho đặt ở cửa hàng hoặc cấp có hoạt động |

- **Có hoạt động** (công ty / chi nhánh): cấp này tự có kho, ghi chứng từ. Phần mềm gắn một *điểm hoạt động* — chọn chi nhánh có sẵn (vd kho tổng 08000 của CN Phú Thọ) hoặc để trống để tạo mới cùng mã. Kho và chứng từ ghi theo điểm đó; điểm hoạt động hiện chung dòng với cấp của nó.
- **Chỉ để thống kê**: không hiện ở ô tìm / chọn chi nhánh khi lập chứng từ, vẫn dùng để gom báo cáo.
- **MST**: để trống thì dùng MST của cấp trên (chữ mờ trên bảng), đặt riêng thì áp cho cấp đó và các cấp con.
- **Quay về dữ liệu gốc** = **xoá trắng** để khai lại từ bước 1 (cần mật khẩu, không hoàn tác): xoá mọi công ty, chi nhánh các cấp, bộ phận chưa dùng, cửa hàng / kho chưa có chứng từ; thu hồi gán vai trò theo chi nhánh / vùng. Cửa hàng, kho đã có chứng từ được giữ, nằm ở *Chưa xếp vào cơ cấu* để xếp lại.

**Cơ cấu tổ chức** là màn DUY NHẤT để khai báo bộ máy: công ty, các cấp cơ cấu, cửa hàng / chi nhánh, kho và phòng ban
cùng nằm trên một cây.

```
Công ty A (công ty cha)            Công ty B (công ty cha thứ hai — được phép)
└─ BAC  Miền Bắc        cơ cấu cấp 1
   └─ PT  Phú Thọ       cơ cấu cấp 2
      └─ PTO  Tỉnh Phú Thọ   cơ cấu cấp 3
         ├─ 08001  Cửa hàng …        cửa hàng / chi nhánh
         │  └─ 08001-KHH  Kho hàng hoá   kho
         └─ …
```

## Loại nút

| Loại | Ô riêng khi thêm / sửa |
|---|---|
| **Công ty** | Mã, Tên, Thuộc (trống = công ty cha độc lập), MST, Mô tả |
| **Cơ cấu cấp N** | Mã, Tên (Miền, Chi nhánh, Tỉnh… tự đặt), Thuộc, MST kê khai (trống = theo nút trên), Mô tả |
| **Cửa hàng / chi nhánh** | Mã (khớp hệ thống bán hàng), Tên, MST, Thuộc cơ cấu, Phòng ban hạch toán, thông tin in chứng từ |
| **Kho** | Mã kho, Cửa hàng chứa kho, Loại kho, Kho mặc định, Địa chỉ |
| **Phòng ban** | Phòng ban chung (kế toán, kinh doanh…): Mã, Tên, Thuộc cơ cấu / phòng ban cha |

Phòng ban riêng của cửa hàng (BH + số mã, tự tạo khi thêm cửa hàng) **không hiện thành dòng** trên cây: nó là ô **Phòng ban** trong thông tin cửa hàng. Chứng từ của cửa hàng tự mang phòng ban này.

Cấp tự tính theo cây (gốc = cấp 0), không gõ tay.

## Thao tác

- **Xem**: *Cây* (bấm một dòng là mở / đóng nhánh), *Sơ đồ*, hoặc danh sách kiểu Excel theo loại — *Cơ cấu*, *Cửa hàng*, *Kho*, *Phòng ban*, *Tất cả*:
  có hàng lọc dưới tiêu đề để lọc từng cột, bấm tiêu đề để sắp xếp, nút Cột để ẩn / hiện cột, kéo cột lên để nhóm, **Xuất danh sách này**.
- **Thêm**: chọn dòng làm nút cha (không chọn = công ty mới), bấm Thêm. Trong hộp thoại chọn **Loại** trước; ô **Thuộc** chỉ cho chọn nút cha hợp lệ
  (kho → cửa hàng; cửa hàng, cơ cấu, phòng ban → công ty / cơ cấu). Các ô riêng của loại hiện ngay trong hộp.
- **Xem / sửa**: bấm đúp một dòng. Hộp thoại mở ở chế độ xem, bấm **Sửa** mới sửa. Đổi nơi thuộc, đổi MST thì chọn **Áp dụng từ ngày** — chứng từ trước ngày đó giữ như cũ.
- Cuối hộp thoại: **Bên trong** (đếm cơ cấu, cửa hàng, kho, phòng ban) và **Lịch sử thay đổi** (thời gian, người làm, việc, ô nào đổi từ gì sang gì).
- **Sơ đồ**: khối công ty / cơ cấu, mỗi khối ghi số cửa hàng, kho, phòng ban bên trong; bấm khối mở hộp thoại của nút đó.
- **Chưa xếp vào cơ cấu**: cửa hàng chưa gắn cơ cấu, phòng ban chưa đặt chỗ — mở từng dòng, Sửa ô Thuộc.
- **Xuất**: tệp 4 sheet *Cơ cấu*, *Cửa hàng*, *Kho*, *Phòng ban* (sheet Phòng ban có cả phòng ban riêng của từng cửa hàng) — cũng là mẫu để nhập.
- **Nhập Excel ▾** <!-- [2026-11-18 02:30 PM kiennt] NT-DM-007 — nhập Excel DM16 bằng trình nhập chung, 4 loại (đóng góp) -->: chọn **1. Cơ cấu**, **2. Phòng ban**, **3. Cửa hàng**, **4. Kho** — mỗi mục mở trình nhập chung như các màn khác
  (chọn tệp → ghép cột → kiểm tra → kết quả; dòng lỗi bỏ qua, dòng đúng vẫn ghi; tải tệp lỗi). Tệp 4 sheet từ nút Xuất dùng thẳng: trình nhập tự chọn đúng sheet.
  Nhập **lần lượt theo thứ tự** trên (cửa hàng cần cơ cấu, kho cần cửa hàng). Mã chưa có → thêm; mã đã có → cập nhật; ô trống giữ nguyên.
  Cửa hàng ghi mã phòng ban chưa có (tệp xuất từ bản cũ không kèm phòng ban riêng) thì phần mềm tự tạo phòng ban đó, tên "Phòng ban + tên cửa hàng".
- Trong hộp thoại, mở một mục ở danh sách "Thuộc …" để đi sâu; nút **Quay lại** ở chân hộp thoại lùi về mục vừa xem.
- **Quay về dữ liệu gốc**: xoá trắng cơ cấu (xem đầu trang).

Không có nút Xoá dữ liệu đã lưu: ngừng dùng bằng cách bỏ tích **Theo dõi**.

---

## Ghi chú cũ (trước khi gộp một màn)

Sơ đồ tổ chức là cây quản lý của công ty:

```
Công ty
└─ BAC  Miền Bắc                 (cấp 1)
   └─ PT  Chi nhánh Phú Thọ      (cấp 2)
      ├─ PTO  Phú Thọ            (cấp 3)
      ├─ LCI  Lào Cai
      └─ YBI, VPC, TQG, HGG …
```

Mỗi **chi nhánh / cửa hàng** gắn vào một nút, thường là nút cấp 3 (tỉnh). Bạn gắn ở **Danh mục chi nhánh (DM02)**: mở chi nhánh → ô **Thuộc SĐTC** → bấm kính lúp → chọn nút.


**Kiểu xem:** nút **Danh sách** để sửa cây, nút **Sơ đồ** để xem toàn bộ dạng sơ đồ khối. Bấm một khối trên sơ đồ để mở nút đó ở kiểu danh sách.

## Màn hình

- **Trái**: cây. Gõ mã hoặc tên để tìm, không cần dấu.
- **Phải trên**: **Mã** (mã nút, không đổi được sau khi thêm), **Tên**, **Mô tả** (ghi chú tuỳ ý) của nút đang chọn.
- **Phải dưới**: các nút con của nút đang chọn. Ô **Xem** chuyển sang *Xem toàn bộ nhóm cấp 1 / 2 / 3…* hoặc *Xem tất cả*. Bấm đúp một dòng để đi xuống nút đó.

## Thao tác

| Nút | Làm gì |
|---|---|
| **Thêm** | Thêm nút con dưới nút đang chọn. Nhập Mã, Tên rồi bấm **Ghi**. |
| **Sửa** | Sửa tên, mô tả rồi bấm **Ghi**. **Hoãn** để bỏ. |
| **Xoá** | Chỉ xoá được nút **không còn nút con** và **không còn chi nhánh nào gắn vào**. Còn thì phần mềm báo tên chi nhánh / nút con, chuyển đi trước rồi xoá. |
| **Nạp** | Tải lại cây. |
| **Xuất / Nhập Excel** | Tệp 4 sheet Cơ cấu / Phòng ban / Cửa hàng / Kho; nhập bằng **Nhập Excel ▾** từng loại theo thứ tự (xem phần trên). |
| **Quay về dữ liệu gốc** | Đặt lại cây và việc gắn chi nhánh đúng như tệp gốc (`db/seeds`). Nút bạn tự thêm mà không còn chi nhánh thì xoá. Dùng khi đã sửa lộn xộn. |

Shop đổi đuôi mã (lên Plus / Premium, đóng thành _OFF) vẫn khớp được: cùng 5 số đầu là cùng một shop.

## Phần mềm tự làm

- **Mua hàng**: ở Phân tích đặt hàng, Tồn max, Chuyển hàng xuống shop, Công thức đặt hàng, ô **Chi nhánh** chọn theo cây (ví dụ *PT · Chi nhánh Phú Thọ*). Phần mềm lấy mọi cửa hàng nằm dưới PT. Hàng về kho của chi nhánh có mã dạng `xx000` (PT → 08000), bạn không phải khai gì thêm.
- **Báo cáo**: ở bảng lọc bên trái có thẻ **Cây** (Công ty → Miền → Chi nhánh → Tỉnh → cửa hàng → kho). Tích một nút là chọn hết các cửa hàng và kho bên dưới.
