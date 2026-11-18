# NT-BH-032 · Giao hàng cho đơn đặt hàng (thông tin giao, trạng thái, hai bước qua kho gửi bán, COD) và copy đơn
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — chốt NT-BH-032 (anh Hoàng, 18/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `phieu-ban` — BH20 Đơn đặt hàng; module `pos` — copy từ đơn máy bán) |
| Màn hình | BH20 Đơn đặt hàng; BH10 Phiếu bán hàng; BH17 Cài đặt bán hàng |
| Mục được giao | Đơn đặt hàng / Bán hàng: yêu cầu ERP tab Banhang-CTKM POS-001b (thông tin giao), POS-001c (copy đơn), POS-001d (trạng thái giao) |
| Ngày tạo | 18/11/2026 |
| Trạng thái | **Đã chốt 18/11/2026** (Võ Hoàng) |
| Căn cứ | Họp kế toán 04/11 K5 (đi giao → xuất kho; giao xong → phiếu bán ghi doanh thu; khách không nhận → huỷ xuất); trả lời 05/11 (copy đơn luôn chạy lại CTKM); NT-BH-023 (đơn đặt hàng, giữ hàng ở kho KCB, giao sinh phiếu bán nháp); danh mục loại kho DM18: **KHG "Kho hàng gửi bán" — tài khoản 157** |

## 1. Hiện trạng
- BH20: báo giá → gửi → kiểm hạn mức → giữ hàng (chuyển kho bán → KCB) → **Giao** nhiều lần: mỗi lần sinh phiếu bán BH10 nháp xuất từ KCB; kế toán duyệt là vào sổ (doanh thu + xuất kho cùng lúc).
- Chưa có thông tin giao (người nhận, địa chỉ, phí, hãng, mã vận đơn, COD), chưa có trạng thái giao, chưa tách "đi giao" và "giao xong", chưa copy đơn.

## 2. Cách làm
1. **Thông tin giao trên đơn đặt hàng BH20** (Q1): người nhận, SĐT, địa chỉ giao, phí ship thu khách, hãng vận chuyển (tự giao / hãng), mã vận đơn, tiền COD. Máy bán tại quầy giữ nguyên.
2. **Mỗi lần giao là một "chuyến giao"** với trạng thái: **Chờ lấy hàng → Đang giao → Đã giao** hoặc **Hoàn (khách không nhận)**; người dùng cập nhật tay (chưa nối API hãng vận chuyển); có nhật ký ai đổi, lúc nào.
3. **Ghi sổ hai bước qua kho gửi bán KHG** (Q2, không sửa lõi — dùng chuyển kho sẵn có):
   - **Đang giao** (hàng rời cửa hàng): phiếu chuyển kho từ **KCB** (hàng đang giữ của đơn) sang kho **KHG "Kho hàng gửi bán"** (TK 157) của cửa hàng — hàng rời kho, **chưa ghi doanh thu**.
   - **Đã giao**: sinh **phiếu bán BH10 xuất từ KHG** (như hôm nay: nháp, kế toán duyệt → doanh thu + giá vốn).
   - **Hoàn**: phiếu chuyển kho **KHG → KCB** (hàng về lại giữ cho đơn) — đơn vẫn mở, giao lại hoặc đóng / huỷ như cũ.
   - Cửa hàng chưa có kho loại KHG → báo "khai kho KHG ở danh mục kho". Kế toán tick KHG vào nghiệp vụ "Xuất bán" ở DM18 (cấu hình, như đã làm với KCB).
4. **COD** (Q3): phiếu bán của chuyến giao có tiền COD thì thanh toán bằng hình thức thanh toán **"COD — <hãng>"** do kế toán khai (phải thu hãng, đối tượng là hãng — như `CPVC-VTPOS` đang có); hãng chuyển tiền thì kế toán đối trừ như công nợ thường. Không viết số tài khoản trong code. **Phí ship thu khách** là một dòng phí trên phiếu bán (mã dịch vụ kế toán khai ở BH17).
5. **Copy đơn** (Q4): (a) đơn đặt hàng → **đơn mới** (nháp); (b) **hoá đơn bán lẻ** (đơn máy bán hoặc phiếu BH10 đã duyệt) → **đơn đặt hàng mới** (khách mua lại, đặt giao). Copy mặt hàng, số lượng, khách, thông tin giao (nếu có); **giá và khuyến mại tính lại theo thời điểm lập mới**. Đơn mới ghi "copy từ <số gốc>".

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Đơn BH20 khai người nhận, địa chỉ, phí ship 30.000, hãng GHN, COD 1.000.000 | Lưu, hiện trên đơn và phiếu in |
| Bấm "Đi giao" chuyến 1 (5 hộp) | Phiếu chuyển kho KCB → KHG 5 hộp; tồn KCB −5, KHG +5; chưa có doanh thu; chuyến "Đang giao" |
| Cập nhật "Đã giao" | Phiếu bán BH10 nháp xuất từ KHG 5 hộp, có dòng phí ship 30.000, thanh toán "COD — GHN"; duyệt → doanh thu + giá vốn + phải thu GHN |
| Chuyến 2 "Hoàn" | Phiếu chuyển kho KHG → KCB; đơn vẫn mở phần chưa giao |
| Cửa hàng chưa có kho KHG | Báo cần khai kho KHG, không đi giao được |
| Copy đơn đặt hàng cũ (giá đã đổi) | Đơn mới nháp, giá + khuyến mại tính lại theo hôm nay; ghi "copy từ …" |
| Copy từ hoá đơn máy bán `CN02BT10005` | Đơn đặt hàng mới cùng khách, cùng hàng, giá tính lại |
| Người không có quyền cập nhật giao | 403 |

## 4. Đã chốt (18/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Thông tin giao gắn ở đâu | Đơn đặt hàng BH20 |
| Q2 | Ghi sổ khi giao | Hai bước qua kho "đang giao" — dùng kho **KHG (TK 157)** sẵn có, không sửa lõi |
| Q3 | Tiền COD | Hình thức thanh toán COD theo hãng (phải thu hãng) |
| Q4 | Copy đơn | Đơn → đơn và hoá đơn lẻ → đơn; giá + CTKM tính lại |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-032-giao-hang.test.ts` (chưa tách — tạo khi code) |

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo phiếu, chốt Q1–Q4 |
