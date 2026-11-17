# NT-BH-026 · Voucher 3 loại: tương đương tiền, lần mua sau sản phẩm / nhãn, tương đương điểm
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — chốt NT-BH-026 (anh Hoàng, 18/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module mới `voucher`; module `pos`, `phieu-ban`; máy bán React) |
| Mục được giao | Chính sách khuyến mại (lịch 16–20/11): "voucher 3 loại" |
| Ngày tạo | 18/11/2026 |
| Trạng thái | **Đã chốt 18/11/2026** (Võ Hoàng) |
| Căn cứ | Họp kế toán 04/11 (CAU-HOI-KE-TOAN-GON, mục voucher): 3 loại theo chương trình; trả lời nghiệp vụ: voucher TGS / NCC, **dùng một lần, không giữ phần dư** |

## 1. Ba loại
1. **Tương đương tiền**: trừ thẳng tổng thanh toán (vd voucher 20–50K Abbott, voucher giấy 20K / 37K).
2. **Lần mua sau sản phẩm / nhãn**: chỉ trừ khi giỏ có sản phẩm / nhãn đó.
3. **Tương đương điểm**: voucher đổi điểm — **đã có** ở module tích điểm (NT-BH-020), giữ nguyên.

## 2. Cách làm
- **Module mới `voucher`** (màn "Voucher"): **đợt phát** (loại, người phát **TGS / hãng – NCC**, mệnh giá, hạn, đơn tối thiểu, sản phẩm / nhãn áp dụng) → **sinh N mã** hoặc **nạp danh sách mã có sẵn** (voucher giấy / của hãng); mỗi mã **gắn SĐT khách** khi phát (nhập tay / Excel / ở quầy) — **chỉ khách đó dùng được** (Q4).
- **Dùng một lần**: dùng là hết, phần dư mất; mã vẫn tra cứu được: đã dùng ở đơn nào, ngày, cửa hàng.
- **Một đơn dùng nhiều voucher** của khách; trừ **sau** chương trình khuyến mại; tổng trừ không vượt số phải trả (Q7).
- **Ghi sổ** (Q3): voucher **TGS phát** = chiết khấu trên hoá đơn, giảm doanh thu + thuế (như voucher đổi điểm, kế toán chốt 04/11); voucher **hãng phát** = **hình thức thanh toán** (doanh thu đủ), phải thu hãng — tài khoản do kế toán khai ở hình thức thanh toán (không viết số tài khoản trong code).
- **Voucher lần mua sau tự phát** (Q6): đợt phát loại "tự động" khai điều kiện (mua sản phẩm / nhãn A ≥ N) → đơn máy bán đủ điều kiện thì module `voucher` tự sinh mã gắn SĐT khách, máy bán in mã trên bill; trả hàng đơn gốc → thu hồi voucher chưa dùng.
- **Máy bán**: nhập mã hoặc chọn từ danh sách voucher còn hạn của khách; **BH10** dùng được. **Báo cáo**: phát hành / đã dùng / còn / hết hạn theo đợt, người phát, cửa hàng; xuất Excel.

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| Đợt "Abbott 50K" (hãng), nạp 100 mã, gắn SĐT | Mã còn hạn, gắn khách |
| Khách A dùng mã 50K cho đơn 30K | Trừ 30K (thanh toán bằng voucher hãng), phần dư mất; mã "Đã dùng" ở đơn đó |
| Khách B đưa mã của khách A | Từ chối: mã không thuộc khách |
| Dùng lại mã đã dùng | Từ chối, nêu đơn đã dùng |
| Đợt TGS 20K | Trừ là chiết khấu: doanh thu + thuế giảm |
| Mua 2 lon Biomil (đủ điều kiện "lần mua sau") | Bill in mã voucher 30K cho lần mua sau Biomil; lần sau giỏ không có Biomil → không trừ |
| Trả hàng đơn đã phát voucher chưa dùng | Thu hồi voucher |

## 4. Đã chốt (18/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | 3 loại | Tương đương tiền / lần mua sau sản phẩm – nhãn / tương đương điểm (đã có) |
| Q2 | Người phát | TGS và hãng / NCC |
| Q3 | Ghi sổ | TGS phát = giảm giá; hãng phát = hình thức thanh toán (phải thu hãng) |
| Q4 | Ai dùng | **Luôn gắn khách** |
| Q5 | Phát hành | Sinh lô + nạp danh sách, gắn khách khi phát |
| Q6 | Lần mua sau | Tự phát khi mua theo chương trình; trả hàng thu hồi |
| Q7 | Nhiều voucher / đơn | Có; cộng khuyến mại; trừ sau khuyến mại |
| Q8 | Phạm vi | Màn Voucher + máy bán + BH10 + báo cáo; voucher đổi điểm giữ ở module tích điểm |
| Q9 | Dùng một lần | Mỗi mã dùng một lần, dùng là mất (phần dư mất), vẫn tra cứu lại mã được |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-026-voucher.test.ts` (tạo khi code) |

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo phiếu, chốt Q1–Q9 |
