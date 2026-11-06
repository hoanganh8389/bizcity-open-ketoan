# PHASE-030 · Bản mẫu Thư viện nghiệp vụ
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — bản mẫu sơ đồ luồng nghiệp vụ theo phân hệ, học từ màn "Quy trình" của Erp-vn -->
<!-- [2026-11-06 02:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — bản 2: trang Thư viện nghiệp vụ là màn đầu tiên; chín mục; bản đồ luồng SVG sinh từ dữ liệu; thư viện tiền chạy thật -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.

[thu-vien-nghiep-vu.html](thu-vien-nghiep-vu.html) là **bản mẫu tĩnh** của trang *Thư viện nghiệp vụ*, màn đầu tiên người làm module mở ra (chủ dự án duyệt hướng 2026-11-06). Mở thẳng bằng trình duyệt: không máy chủ, không thư viện ngoài. Dữ liệu là JSON nội tuyến, sửa trực tiếp trong tệp:
- `FLOWS`: bản đồ luồng;
- `STDS`: 12 chuẩn;
- `MECHANISMS`: 6 cơ chế;
- `FINDINGS`: mã thông báo;
- `GROUPS`: danh mục.

| Mục (`#…`) | Cho thấy | Chủ dự án duyệt |
|---|---|---|
| `#tong-quan` | 6 cơ chế dùng chung (có / một phần / chưa), 12 chuẩn STD-030 (cấp, thư viện, phép kiểm), lối vào các bản đồ | thứ tự ưu tiên, cách nói |
| `#ban-hang` | báo giá → đơn → hạn mức (duyệt vượt) → phiếu xuất → hoá đơn ◆ → thu tiền ◆ → điều chỉnh / thay thế / trả lại ◆; bảng bước: docRef, chuyển YAML, mã thông báo, golden | Q030-4 có tách phiếu xuất không; hạn mức chặn hay bắt duyệt |
| `#kho` | nhập theo lô ◆ → cách ly → chuyển kho ◆ → xuất FEFO ◆ → kiểm kê (khoá kho) → duyệt chênh ◆ → tiêu huỷ ◆ → giá vốn tháng ◆ | thứ tự: K-030-1 lô ở Kernel trước |
| `#luong` | hồ sơ → chấm công (chốt kỳ) → tính lương (hàm thuần, tham số theo ngày) → bảng lương → duyệt → payroll ◆ → chi lương ◆ → nộp BH, thuế ◆; ca số T030-LUONG-1 | Q030-1 một hay ba module |
| `#ke-toan` | tạm ứng / hoàn ứng ◆, đối soát ngân hàng, **phiếu kế toán tay** (số TK là dữ liệu người nhập) ◆, cuối kỳ ◆, khoá kỳ → kết chuyển ◆ → báo cáo | gom cuối kỳ vào một module `ke-toan-ky` hay tách |
| `#chung-tu` | 5 nhóm trạng thái; **hai con trỏ** (bảng thời gian: sửa nhiều lần, sổ đổi một lần); màn chi tiết chứng từ có tab Nội dung / So sánh / Duyệt / Sổ / Liên kết / Nhật ký; ba loại chứng từ và bút toán tay | bố cục màn chi tiết; nhãn "Bản đang sửa / Bản trên sổ" |
| `#tien` | `allocate`, `schedule` chạy thật (mã tham chiếu của [18 §3](../18-THU-VIEN-TIEN.md)); bảng phần nguyên / dư / kết quả, Σ = tổng; so sánh làm tròn | — (kỹ thuật) |
| `#cong` | bàn điều hành chứng từ & cổng (HT11): hàng việc + tuổi, kết quả từng cổng (qua / nhắc / giữ / chặn, màu trạng thái có biểu tượng), chặn / giữ 14 ngày, mã sai luật hay gặp, chứng từ cần xem lại, sai vai trò, ma trận chuyển trạng thái, sổ cổng có kiểm chuỗi băm | sáu khối có đủ chưa; ai được xem; Q030-5 |
| `#thong-bao` | thư viện thông báo: ba cách hiện (trên trường, nổi, bảng phát hiện), mẫu danh mục mã, câu của bộ kiểm cho dev | giọng văn thông báo |
| `#danh-muc` | thẻ 173 nghiệp vụ theo 6 nhóm (dữ liệu W0 giữ nguyên) | — |

Ký hiệu trên bản đồ:
- viền ô = nhóm trạng thái (nháp / chờ duyệt / đã duyệt / hoàn tất);
- hình thoi = duyệt theo chính sách;
- ô tím ◆ = ghi sổ qua `ctx.ledger.submit` (docType · reasonCode, không số tài khoản);
- viền gạch = bộ tính thuần;
- nét đứt xanh = liên kết chứng từ (`source / settles / replaces`).

Đã kiểm 2026-11-06 bằng Chrome headless: 1440 px sáng / tối, khung 360 px (trang không cuộn ngang; bản đồ và bảng cuộn trong khung riêng). Địa chỉ cũ `#mh`, `#bh`, `#ts`, `#kt`, `#ns` chuyển về mục tương ứng.

Không vẽ form chi tiết; form thật dùng `@bizcity/ui-kit` khi module được code. Khi module đầu tiên (bán hàng hoặc kho) chạy: chụp màn thật đặt cạnh bản mẫu trong `evidence/`.
