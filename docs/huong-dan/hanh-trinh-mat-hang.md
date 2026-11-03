# Hành trình mặt hàng (ACC95)
<!-- [2026-11-03 09:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-025 — W1: hướng dẫn màn Hành trình mặt hàng -->

Màn này cho thấy **cả vòng đời của một mặt hàng**: mua, nhập, bán, giá vốn, trả hàng, chuyển kho — và giá vốn hình thành từ những phiếu nào. Dùng khi bạn cần giải thích một con số: "vì sao giá vốn mã này là như vậy", "phiếu trả hàng này hoàn giá nào".

## Vào màn bằng cách nào

- **Từ một con số** (nhanh nhất): ở *Báo cáo nhập xuất tồn*, bấm **Truy vết** trên dòng mặt hàng; ở *Sổ chi tiết hàng hoá*, bấm **Truy vết** cạnh tên hàng; ở *Danh mục mặt hàng*, chọn một dòng rồi bấm **Hành trình**. Màn mở đúng mặt hàng và đúng khoảng ngày của báo cáo.
- **Từ menu:** Kho → Báo cáo kho → *Hành trình mặt hàng*, rồi gõ mã, tên hoặc mã vạch.

## Đọc màn

| Phần | Cho biết |
|---|---|
| Ghi chú đầu trang | phần nào **chưa truy được** (ví dụ tháng chưa tính giá vốn, phiếu trả hàng chưa nối được chứng từ gốc). Màn không giả vờ đầy đủ |
| **Vòng đời** | các sự kiện theo làn: Mua · nhập, Bán · xuất, Trả hàng, Chuyển kho. **Viền xanh** = sự kiện *kế toán* (đổi số lượng / giá trị tồn, có bút toán); **viền xám** = *vận hành* (chuyển kho trong cùng nhóm tính giá — không đổi sổ). **Bấm một sự kiện** để làm nổi các sự kiện nối với nó (cùng chứng từ; hàng trả ↔ chứng từ bán gốc) |
| **Dòng thời gian** | cùng các sự kiện dạng bảng; tích "chỉ sự kiện đổi sổ" để ẩn sự kiện vận hành; bấm số chứng từ để mở chứng từ |
| **Giá vốn từng tháng** | tồn đầu, nhập, đơn giá, xuất, tồn cuối theo nhóm tính giá. Bấm **Vì sao giá vốn này?** để đọc công thức bằng số thật |
| **Bút toán mang mã hàng** | các dòng sổ cái của mã này (có dòng giá vốn 632 / 156); dòng giá vốn đang chờ tính ghi "chờ tính giá" |

## "Vì sao giá vốn này?"

Ví dụ: *Tồn đầu tháng: số lượng 10, giá trị 700.000 đồng. Nhập trong tháng: số lượng 10, giá trị 760.000 đồng. Đơn giá = (700.000 + 760.000) ÷ (10 + 10) = 73.000 đồng. So với tháng 09/2026 (đơn giá 70.000): tăng 4,3%. Phiếu kéo đơn giá nhiều nhất: NM-10 — nhập với đơn giá 76.000, cao hơn đơn giá đầu kỳ 8,6%.*

Bảng bên dưới liệt kê từng phiếu và **vai** của nó: *góp vào đơn giá*, *hàng xuất*, *quà (không vào đơn giá)*, *chuyển cùng nhóm*, *trả nhà cung cấp*. Dòng cuối cho biết cộng lại từ các phiếu có **khớp** số đã lưu không; nếu không khớp (ví dụ tháng có phiếu trả nhà cung cấp, được định giá theo luật lý do) thì màn nói vì sao.

## Lưu ý

- Hiện truy vết theo **mã hàng hiện hành**. Khi mặt hàng có phiên bản mã (đổi mã giữa kỳ), các mã cũ và mới sẽ nối về một định danh — màn sẽ hiện cả lịch sử đổi mã.
- Giải thích giá vốn hiện áp dụng cho **bình quân gia quyền theo tháng** (cách tính đang chạy).
- Màn **chỉ đọc**: không sửa dữ liệu. Sửa sai bằng chứng từ điều chỉnh ở kỳ còn mở.
