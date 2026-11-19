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
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — NT-BH-031: kết quả chạy (đóng góp) -->
| | |
|---|---|
| Ngày chạy | 18/11/2026 |
| Bản code (commit) | nhánh `feat/nt-bh-031-kenh-ban` (open-ketoan); `tgs_pos` main (máy bán React + bản sao website); `tgs_accounting_bridge` main (quyền SSO) |
| Test tự động | `apps/api/test/nt-bh-031-kenh-ban.test.ts` — 7 / 7 ĐẠT (đủ 7 dòng §3, gồm 403); `modules/pos/test/channels.test.ts` — 8 ĐẠT; máy bán React `src/api/promotions.test.ts`, `checkout.test.ts`, `orderRows.test.ts` |

| Dòng §3 | Kết quả |
|---|---|
| 1. Mở màn lần đầu | ĐẠT — `GET /api/v1/m/pos/channels` trả 14 kênh đúng thứ tự (Gần shop, Giới thiệu, Hotline, Khác = offline); bootstrap máy bán trả cùng danh sách |
| 2. Thêm "TMĐT-TikTok Shop" online | ĐẠT — thêm (kế toán viên), bootstrap lần sau có kênh mới ở cuối, đơn mang mã `TMDT_TIKTOK`; trùng mã / tên → `POS_SALE_SOURCE_EXISTS` |
| 3. Ngừng dùng "Hotline" | ĐẠT — bootstrap không còn Hotline; BH13 lọc Hotline vẫn ra đơn cũ, cột Kênh "Hotline"; dùng lại được |
| 4. Mã kênh lạ / đã ngừng | ĐẠT — 400 `POS_SALE_SOURCE` (`cause` unknown / inactive) kèm câu rõ; không gửi → Gần shop; máy cũ gửi tên "Zalo" → nhận `ZALO`; đơn mất mạng gửi bù kênh đã ngừng vẫn nhận |
| 5. BH10 kênh "Livestream CT" | ĐẠT ở API — phiếu lưu `saleChannel` + `saleChannelName`, duyệt giữ kênh, `GET /docs?saleChannel=` lọc được; kênh lạ → `POS_SALE_SOURCE`. Ô chọn kênh trên khung màn BH10 (`apps/web`, ngoài phạm vi giữ chỗ) — việc tiếp |
| 6. Báo cáo bán theo kênh | ĐẠT — `GET /api/v1/m/pos/reports/channels`: kênh × cửa hàng, số đơn, doanh thu, khuyến mại, trả hàng, thực thu, tổng online / offline; gồm đơn máy bán + phiếu BH10 đã duyệt; lọc `branchCodes`; Excel ở thẻ "Bán hàng theo kênh" |
| 7. Không có `pos:kenh-ban-lap` thêm kênh | ĐẠT — người xem 403 (thêm, sửa); kế toán viên ngừng dùng 403 (`pos:kenh-ban-xoa` chỉ chủ đơn vị, kế toán trưởng) |

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo phiếu, chốt Q1–Q4 |
| 18/11/2026 | Code xong (module pos, phieu-ban, máy bán React, bản sao website, quyền SSO); điền §5 |
