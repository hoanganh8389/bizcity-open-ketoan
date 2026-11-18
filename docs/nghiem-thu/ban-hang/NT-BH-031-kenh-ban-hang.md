# NT-BH-031 · Kênh bán hàng: danh mục kênh do kế toán khai, đơn / phiếu bán mang kênh, báo cáo theo kênh (nội bộ, không lên sổ)
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — chốt NT-BH-031 (anh Hoàng, 18/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, `phieu-ban`; máy bán React trong `tgs_pos/react`; website `tgs_pos`) |
| Màn hình | Kênh bán hàng (mới, như CH18 của phần mềm cũ); máy bán — ô Nguồn bán; BH10 Phiếu bán hàng; BH13 Đơn máy bán; báo cáo bán theo kênh |
| Mục được giao | Bán hàng: yêu cầu ERP tab Banhang-CTKM DM-013a/b, POS-001a, Report c |
| Ngày tạo | 18/11/2026 |
| Trạng thái | **Đã chốt 18/11/2026** (Võ Hoàng) |
| Căn cứ | PHASE-030 `10-DOI-CHIEU-ERP-VN.md` dòng DM12 "Vùng và kênh bán" (🟡, P0, đặt ở module bán hàng); màn CH18 "Kênh bán hàng" trong bộ phân quyền TGS (`docs/standard/phan-quyen/tgs-nguon.csv`); 14 "nguồn bán" của POS cũ (`tgs_pos/includes/class-tgs-pos-sale-source.php`) |

## 1. Hiện trạng
- Lõi chưa có khái niệm kênh: chứng từ không có ô kênh, không có danh mục kênh.
- Module `pos` có ô `saleSource` trên đơn (máy bán gửi, lọc được ở màn Đơn hàng) nhưng danh sách viết cứng (bản kế toán chỉ "Tại quầy"; website 14 giá trị viết trong code).
- Phiếu bán BH10 không có kênh. Không có báo cáo tổng hợp theo kênh.

## 2. Cách làm
1. **Phạm vi** (Q1): kênh là **thông tin nội bộ của module bán hàng**, **không sửa lõi, không lên sổ** (sổ cái / BH02 không lọc theo kênh).
2. **Danh mục kênh** (Q2): màn mới "Kênh bán hàng" trong module `pos` (chủ của kênh): mã, tên, loại **online / offline**, thứ tự, đang dùng / ngừng dùng. Kế toán khai. **Nạp sẵn 14 nguồn của POS cũ** (Gần shop, Giới thiệu, Hotline, Zalo, Website, Khác, Facebook CT, Facebook CN, IG-Tik Tok CT, IG-Tik Tok CN, Livestream CT, Livestream CN, TMĐT-Shopee, TMĐT-Lazada). Kênh đã dùng thì chỉ **ngừng dùng**, không xoá (ECP-13). Quyền theo luật đăng ký quyền: xem bằng `catalog:read`; `pos:kenh-ban-lap`, `pos:kenh-ban-sua`, `pos:kenh-ban-xoa` (ngừng dùng).
3. **Đơn / phiếu mang kênh:** máy bán lấy danh sách kênh đang dùng từ khởi động máy (thay danh sách viết cứng), đơn lưu mã kênh; mã kênh không có / đã ngừng → từ chối. **BH10** chọn kênh trên phiếu (lấy danh mục của module `pos` qua action đọc). Đơn cũ không có kênh → coi là kênh mặc định (Gần shop). Bản sao đơn về website ghi tên kênh vào ô nguồn bán như cũ.
4. **Báo cáo theo kênh:** BH13 và BH10 lọc theo kênh; báo cáo "Bán hàng theo kênh" (kênh × cửa hàng × khoảng ngày: số đơn, doanh thu, khuyến mại, trả hàng, thực thu; tách online / offline), xuất Excel.
5. **Để sau** (Q3, Q4): chương trình khuyến mại theo kênh; giá bán theo kênh (cần lõi bảng giá — gom vào đề xuất lõi cùng ngày hiệu lực / duyệt giá).

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Mở màn Kênh bán hàng lần đầu | Có sẵn 14 kênh của POS cũ |
| Kế toán thêm kênh "TMĐT-TikTok Shop", loại online | Máy bán thấy kênh mới sau khi khởi động lại |
| Ngừng dùng kênh "Hotline" | Máy bán không còn chọn được; đơn cũ vẫn hiện "Hotline" |
| Máy bán gửi mã kênh lạ / đã ngừng | Từ chối, báo rõ |
| BH10 lập phiếu kênh "Livestream CT" | Phiếu lưu kênh; BH10 lọc theo kênh được |
| Báo cáo bán theo kênh 01–18/11 | Mỗi kênh × cửa hàng: số đơn, doanh thu, trả hàng, thực thu; gồm cả đơn máy bán và phiếu BH10 |
| Người không có `pos:kenh-ban-lap` thêm kênh | 403 |

## 4. Đã chốt (18/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Kênh lên sổ | Không — chỉ nội bộ module, không sửa lõi |
| Q2 | Danh mục kênh | Kế toán khai, nạp sẵn 14 nguồn cũ |
| Q3 | CTKM theo kênh | Để sau |
| Q4 | Giá theo kênh | Để sau, cần lõi bảng giá |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-031-kenh-ban.test.ts` (chưa tách — tạo khi code) |

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo phiếu, chốt Q1–Q4 |
