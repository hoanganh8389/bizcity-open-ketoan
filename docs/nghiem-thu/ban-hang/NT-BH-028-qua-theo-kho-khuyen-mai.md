# NT-BH-028 · Quà cùng mã hàng bán, trừ tồn ở kho khuyến mại (KKM)
<!-- [2026-11-18 Võ Hoàng] NGHIEM-THU — chốt NT-BH-028 (anh Hoàng, 18/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, `phieu-ban`; máy bán React) |
| Mục được giao | Kiểm soát tại quầy: "quà phải là mã không gửi thuế" → đổi cơ chế |
| Ngày tạo | 18/11/2026 |
| Trạng thái | **Đã chốt 18/11/2026** (Võ Hoàng) |
| Căn cứ | Anh Hoàng 18/11: bỏ mã con (mã Z) cho quà; quà và hàng bán **cùng mã**, phân biệt bằng **phân kho**; trừ tồn quà ở kho quà. ADR-0035 / PHASE-037 (D037-6 cùng `item_id` cho quà, D037-7 phân kho) |

## 1. Hiện trạng (rà 18/11)
- Lõi đã ghi tồn theo kho; dòng chứng từ bán đã có `warehouseCode`, `isGift`; có loại kho KKM "Kho hàng khuyến mại", luật kho cho xuất tặng từ KKM.
- Máy bán (module `pos`) và BH10 trừ **mọi dòng, kể cả quà**, ở kho mặc định của cửa hàng; tồn bán và tồn quà cùng mã cộng chung.
- Lên thuế / hoá đơn / bill Z vẫn quyết theo **mã** (`send_to_tax`, mã Nội bộ); cùng mã thì không tách được. Theo CANON §0.11 việc này phải do chính sách `core.combo.gift_treatment@1` (PHASE-037, S037-8) quyết, chưa có mã → **không làm trong phiếu này**.

## 2. Cách làm
1. **Kho quà** (Q1): dùng loại **KKM** có sẵn. Mỗi cửa hàng khai một kho KKM; khoá `bizcity.pos.gift_warehouses` (dạng `CN01=KHO-KM`, chọn ở BH17), dùng chung cho máy bán và BH10.
2. **Máy bán** (module `pos`): dòng quà (`isGift`) gửi `warehouseCode` = kho quà của cửa hàng; dòng bán gửi kho bán. Kiểm tồn theo **mặt hàng × kho**: quà kiểm tồn kho quà, hàng bán kiểm tồn kho bán, không cộng chung. Cửa hàng chưa khai kho quà → như cũ (trừ kho bán).
3. **BH10** (`phieu-ban`): dòng quà tự gán kho quà của cửa hàng; kiểm tồn như trên.
4. **Máy bán React:** tồn quà trong hộp chọn quà lấy theo kho quà (không trừ số đang bán cùng mã); bootstrap trả kho bán / kho quà; bản sao đơn ghi về website mang phân kho của dòng.
5. **Thuế / bill Z** (Q2): giữ như hiện nay (theo mã) cho tới khi lõi có chính sách PHASE-037; báo Thủy2k / sếp.
6. **POS cũ (PHP)** (Q3): không sửa.

## 3. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| CN01: kho bán KHO01 có 10 SUA330, kho KM KHO01-KM có 3 SUA330; đơn mua 2 tặng 1 | Phiếu bán: 2 dòng bán trừ KHO01, 1 dòng quà trừ KHO01-KM |
| Kho KM còn 0, kho bán còn 10 | Quà báo hết (hết quà thì không tặng), hàng bán vẫn bán |
| Kho bán còn 0, kho KM còn 3 | Không bán được hàng (chặn tồn); quà không dùng thay hàng bán |
| BH10 lập phiếu có dòng quà | Dòng quà tự vào kho KM |
| Cửa hàng chưa khai kho quà | Như cũ: mọi dòng trừ kho bán |

## 4. Đã chốt (18/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Kho quà | Loại KKM có sẵn |
| Q2 | Thứ tự | Làm trừ tồn theo kho ngay; thuế theo dòng chờ lõi (PHASE-037) |
| Q3 | POS cũ | Không sửa; chỉ React + kế toán |

## 5. Kết quả chạy
| | |
|---|---|
| Ngày chạy | |
| Bản code (commit) | |
| Test tự động | `apps/api/test/nt-bh-028-qua-kho-km.test.ts` (chưa tách — tạo khi code) |

## 6. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 18/11/2026 | Tạo phiếu, chốt Q1–Q3 |
