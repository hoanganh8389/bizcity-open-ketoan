# PHASE-030 · Bản mẫu Thư viện nghiệp vụ
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — bản mẫu sơ đồ luồng nghiệp vụ theo phân hệ, học từ màn "Quy trình" của Erp-vn -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

[thu-vien-nghiep-vu.html](thu-vien-nghiep-vu.html) là **bản mẫu tĩnh** để duyệt **luồng nghiệp vụ** của từng phân hệ trước khi code module (D030-7). Mở thẳng bằng trình duyệt, không máy chủ, không thư viện ngoài. Dữ liệu là JSON nội tuyến (`GROUPS`), sửa trực tiếp trong tệp.

- Bố cục học từ màn "Quy trình" của ERP LiFeOOD: ba làn **Khai báo** (làm một lần) → **Luồng chính** (theo thời gian) → **Phát sinh** (treo dưới bước sinh ra nó); mỗi thẻ = một mã nghiệp vụ, trạng thái, chứng từ, điểm ghi sổ, nguồn, module đích.
- Màu viền trên thẻ = mức của open-ketoan: ✅ có · 🟡 một phần · ☐ chưa · K cần năng lực Kernel (K-030-*). Số trên tab = có / một phần / chưa.
- Mở thẳng một nhóm: `#mh`, `#kho`, `#bh`, `#ts`, `#kt`, `#ns`. Nút ◐ đổi sáng / tối.
- Không vẽ form chi tiết; form thật dùng `@bizcity/ui-kit` khi module được code.

| Nhóm | Điều cần duyệt |
|---|---|
| Mua hàng | có đưa MH01 yêu cầu mua + MH02 báo giá vào trước đơn mua không; MH05 đối chiếu 3 bên nâng thành chặn có override |
| Kho | thứ tự ưu tiên: K-030-1 lô ở Kernel trước, rồi kiểm kê / chuyển kho / tiêu huỷ |
| Bán hàng | báo giá = đơn ở `draft`; có tách giao hàng không (Q030-4); hạn mức: nợ + đơn mở + đơn này |
| Tài sản | khấu hao theo ngày là chuẩn (N030-1) |
| Kế toán | nhóm cuối kỳ (trích trước, dự phòng, tỷ giá) đi cùng một module `ke-toan-ky` hay tách |
| Nhân sự – lương | Q030-1 một hay ba module |

Khi module đầu tiên (bán hàng hoặc kho) chạy: chụp màn thật đặt cạnh bản mẫu trong `evidence/`.
