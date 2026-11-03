# Nhóm hàng (DM11)
<!-- [2026-11-03 04:30 PM Nguyễn Văn Thủy] NHOM — hướng dẫn màn Nhóm hàng (một cây, bỏ các thẻ ngành / nhãn / loại) -->

Nhóm hàng là **một cây duy nhất** để quản trị hàng hoá từ trên xuống. Mọi báo cáo theo mã hàng đều chọn được nhóm trên cây này, nên con số ở cấp trên luôn khớp với tổng các cấp dưới.

```
Nhóm hàng
└─ Cấp 1   Ngành hàng            mã ngắn 2 ký tự
   └─ Cấp 2   Nhãn hàng          mã ngắn 3 ký tự
      └─ Cấp 3   Nhóm sản phẩm   mã ngắn 1 ký tự
         └─ Cấp 4…  chia nhỏ hơn để theo dõi (không ghép vào mã hàng)
```

Trên màn chỉ ghi **cấp mấy**. Nhìn cấp là biết nhóm đó là ngành, nhãn hay nhóm sản phẩm.

## Mã hàng ghép từ cây

```
Mã hàng (9 ký tự) = mã ngắn cấp 1 (2) + mã ngắn cấp 2 (3) + mã ngắn cấp 3 (1) + số thứ tự (3)
```

- Ô **Đầu mã hàng** trên form cho biết mọi mã hàng của nhóm bắt đầu bằng gì. Cột cùng tên có ở lưới.
- Mặt hàng mới chọn nhóm cấp 3 thì phần mềm tự lấy số thứ tự kế tiếp. Xem **Danh mục mặt hàng (DM10)**.
- Mã có ký tự thứ 10 (chia giá, khuyến mại, kẹp quà, có tem) giữ đầu mã của mã gốc. Xem [Danh mục mặt hàng](mat-hang.md).

## Màn hình

- **Trái**: cây *Danh mục nhóm hàng*. Gõ tên để tìm, không cần dấu.
- **Phải trên**: thông tin nhóm đang chọn. Gồm Mã nhóm hàng, Mã ngắn (mã ghép), Tên nhóm hàng, Đầu mã hàng, Thuộc nhóm, Đang dùng. Tiêu đề khung ghi **Nhóm cấp N**.
- **Phải dưới**: các nhóm con của nhóm đang chọn. Ô **Xem** chuyển sang *Xem toàn bộ nhóm cấp 1 / 2 / 3…* hoặc *Xem tất cả*. Bấm đúp một dòng để đi xuống nhóm đó.

## Thao tác

| Nút | Làm gì |
|---|---|
| **Thêm** | Chọn nhóm cha trên cây rồi bấm **Thêm**. Chọn gốc *Nhóm hàng* thì thêm nhóm cấp 1. Phần mềm điền sẵn **Mã nhóm** (số kế tiếp) và **Mã ngắn** (số kế tiếp trong các nhóm cùng cha, đủ ký tự của cấp). Bạn chỉ nhập **Tên** rồi bấm **Ghi**. |
| **Sửa** | Sửa tên, mã ngắn, Đang dùng. Muốn chuyển sang nhóm khác thì bấm kính lúp ở ô **Thuộc nhóm**. **Hoãn** để bỏ. |
| **Xoá** | Chỉ xoá được nhóm chưa có nhóm con và chưa gắn mặt hàng. Nhóm đã dùng thì bấm **Sửa**, bỏ tích **Đang dùng**. |
| **Nạp** | Tải lại cây. |
| **Xuất** | Xuất lưới đang xem ra Excel. |
| **Điền mã ngắn còn thiếu** | Nhóm chưa có mã ngắn thì phần mềm lấy theo các mã hàng đang có trong nhóm. Danh sách hiện ra để xem trước, bấm đồng ý mới ghi. Nhóm đã có mã ngắn giữ nguyên. |

## Phần mềm tự chặn để không nhầm

- Mã ngắn phải **đủ số ký tự** của cấp: cấp 1 là 2, cấp 2 là 3, cấp 3 là 1.
- Hai nhóm **cùng cha** không được trùng mã ngắn. Nếu trùng, hai nhóm sẽ sinh ra cùng một đầu mã hàng.
- Không chuyển một nhóm vào chính nhánh con của nó.
- Chuyển nhóm sang cấp khác thì ô mã ngắn bị xoá để bạn nhập lại theo cấp mới. **Mã hàng đã có không đổi.**

## Báo cáo chọn theo nhóm

Các báo cáo theo mã hàng có ô **Nhóm hàng: Tất cả | Chọn nhóm**:

- **Tất cả**: không lọc.
- **Chọn nhóm**: hiện cây có ô tích. Tích nhóm cha là lấy cả nhánh con. Bỏ một nhóm con thì các nhóm anh em vẫn giữ. Tích được nhiều nhóm ở nhiều nhánh.

Ô này có ở: Sổ kho theo mặt hàng (MH24), Tồn kho theo mặt hàng (MH25), Nhập xuất tồn, Tính giá vốn, Bảng kê chuyển kho, Chi tiết bán hàng, Báo cáo mua hàng (MH23), Phân tích đặt hàng (MH02), Tồn max (MH16).

## Câu hỏi thường gặp

- **Ngành hàng, nhãn hàng khai ở đâu?** — Ngay trên cây này: nhóm cấp 1 là ngành, nhóm cấp 2 là nhãn. Không có danh mục riêng. Mặt hàng chọn nhóm cấp 3 thì ngành và nhãn tự theo.
- **Nhóm cấp 4 để làm gì?** — Để chia nhỏ hơn khi cần theo dõi riêng, ví dụ theo hình thức bán. Cấp 4 không làm đổi mã hàng.
- **Lỡ sửa lộn xộn?** — Bấm **Quay về dữ liệu gốc** ở đầu màn.
