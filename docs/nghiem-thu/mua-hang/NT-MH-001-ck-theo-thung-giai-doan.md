# NT-MH-001 · Nhập mua có CK theo thùng / %, chương trình theo giai đoạn, quà, CKTT, hỗ trợ ngoài
<!-- [2026-11-03 08:05 PM Johnny Chu - Chu Hoàng Anh] SC-DOC-4 — sửa tham chiếu đường dẫn lỗi thời sau khi tách Kernel / Platform (mã đã dời; gói đích chưa tách ghi rõ "chưa tách") -->
<!-- [2026-11-02 11:50 AM Nguyễn Văn Thủy] NGHIEM-THU — tạo phiếu từ tình huống test mua hàng 31/10/2026 (tình huống 1), kèm kết quả chạy bộ tính. -->

| | |
|---|---|
| Phân hệ | Mua hàng |
| Màn hình | MH04 Chính sách mua hàng · MH27 ĐVT Thùng · MH11 Tổng hợp mua hàng (phiếu nhập, phiếu nhận quà, phiếu thưởng / hỗ trợ, trả tiền) |
| Bộ phận yêu cầu | Phòng kế toán |
| Ngày tạo | 02/11/2026 |
| Trạng thái | Chờ nghiệm thu |

## 1. Mục đích quản trị
Nhập một hoá đơn mua lớn của NCC có nhiều loại chiết khấu cùng lúc: CK theo thùng (tiền / thùng), CK %, chương trình đổi theo giai đoạn trong tháng, quà KM tặng kèm, quà ngoài hoá đơn, thưởng thanh toán đúng hạn và hỗ trợ ngoài theo giá trị đơn.
Phần mềm phải tự áp đúng chương trình theo **ngày chứng từ**, ra đúng số phải trả, hạn trả và tiền thưởng — kế toán không phải tính tay.

## 2. Khai báo trước
- NCC **NC100229** — Chi nhánh Công ty TNHH dinh dưỡng 3A (Việt Nam) tại Nghệ An. Hạn mức công nợ 800.000.000.
- **MH27:** 1 Thùng = **12 Lon** cho 110063095, 110063102, 110064075, 110064075Q.
- **MH04 — chính sách của NCC:**

| Chính sách | Loại | Hiệu lực | Nội dung |
|---|---|---|---|
| CT 01–15/10 | Chiết khấu theo mã hàng | 01/10 – 15/10/2026 | 110063095, 110063102: giảm 132.000đ / Thùng · 110064075, 110064075Q: giảm 144.000đ / Thùng · 120068007: 3% · 120064010: 2,5% |
| CT 16–31/10 | Chiết khấu theo mã hàng | 16/10 – 31/10/2026 | mức giai đoạn 2 (khác giai đoạn 1) |
| Tặng bàn chải | Mua X tặng Y | 01/10 – 15/10/2026 | mua 12 Lon 110063095 tặng 1 Q00640101, lặp lại; không chia vào giá (KM người tiêu dùng) |
| Hạn thanh toán | Điều khoản thanh toán | — | tính từ ngày nhận đủ hàng, **14 ngày làm việc** (= 15 ngày tính cả ngày giao), không gối đầu |
| Thưởng TT đúng hạn | Chiết khấu thanh toán | — | 1% |

## 3. Các bước thao tác
1. Lập **phiếu nhập mua**: ngày chứng từ **15/10/2026** (ngày hoá đơn), ngày nhận đủ hàng & hồ sơ **16/10/2026**, giá **gồm VAT**, hoá đơn 1C26TNA số 00015065 ngày 15/10/2026. Nhập 6 dòng mua ở mục 4. Lưu → duyệt.
2. Lập **phiếu nhận quà** (không hoá đơn, nguồn NCC tặng ngoài hợp đồng): 3 mã Z ở mục 4. Duyệt.
3. Lập **phiếu thưởng / hỗ trợ** cho NC100229: 2% giá trị đơn, phân bổ theo giá trị. Duyệt.
4. Lập **phiếu trả tiền** ngày ≤ 05/11/2026, trả đủ → được thưởng thanh toán đúng hạn.

## 4. Số liệu đầu vào

**Phiếu nhập mua (có hoá đơn, VAT 8%, đơn giá gồm VAT):**

| Mã hàng | Tên | ĐVT | SL | Đơn giá gồm VAT |
|---|---|---|---|---|
| 110063095 | SPDD CT Similac Total Protection 0+ 800g | Lon | 72 | 718.526 |
| 110063102 | TPBS Similac Total Protection 2+ 800G | Lon | 12 | 579.296 |
| 110064075Q | Abbott Glucerna hương Vani 800g - Kẹp KM | Lon | 39 | 920.907 |
| 110064075 | Abbott Glucerna hương Vani 800g | Lon | 39 | 920.907 |
| 120068007 | Abbott Grow Gold 180ml (Combo 11H+1H) | Hộp | 288 | 203.203 |
| 120064010 | Abbott Ensure Gold 237ml | Chai | 8.640 | 61.659 |
| Q00640101 | KM Abbott - Bàn chải điện Similac | Cái | 6 | 0 (phần mềm tự thêm) |

**Phiếu nhận quà (không hoá đơn):** Q00630078Z nón bảo hiểm 2 · Q00620040Z xe đạp Pediasure 2 · Q00620035Z xe đạp trẻ em Grow 3.

## 5. Kết quả mong đợi (theo bảng của bộ phận yêu cầu)

| Mã hàng | TT không VAT | CK | Thuế 8% | Thành tiền |
|---|---|---|---|---|
| 110063095 | 47.901.733 | 733.334 | 3.773.472 | 50.941.871 |
| 110063102 | 6.436.622 | 122.222 | 505.152 | 6.819.552 |
| 110064075Q | 33.254.975 | 433.331 | 2.625.732 | 35.447.376 |
| 110064075 | 33.254.975 | 433.331 | 2.625.732 | 35.447.376 |
| 120068007 | 54.187.468 | 1.625.621 | 4.204.948 | 56.766.795 |
| 120064010 | 493.272.029 | 12.331.800 | 38.475.218 | 519.415.447 |
| Q00640101 (quà, SL 6) | – | – | – | – |
| **Tổng** | **668.307.802** | **15.679.639** | **52.210.253** | **704.838.416** |

| Mục | Mong đợi |
|---|---|
| Quà bàn chải tự thêm | 6 cái (72 Lon ÷ 12) |
| Hạn thanh toán | 05/11/2026 |
| Thưởng thanh toán đúng hạn 1% | 7.048.384 |
| Hỗ trợ ngoài 2% | 14.096.768 |
| Hạn mức | 704,8 triệu / 800 triệu — trong hạn mức |

**Bút toán phiếu nhập:** Nợ 1561 (tiền hàng sau CK) · Nợ 1331 (thuế) / Có 3312 (tổng thanh toán).

**Sai số làm tròn chấp nhận:** chờ Phòng kế toán chốt (xem mục 7).

## 6. Trường hợp lệch chuẩn
| # | Làm thế này | Phần mềm phải |
|---|---|---|
| 1 | Ngày chứng từ **16/10/2026** | áp CT 16–31/10, **không** tặng bàn chải (chương trình quà hết 15/10) |
| 2 | Để quy cách mặc định 48 Lon / Thùng | CK theo thùng chia cho 48 → sai; phải khai 12 ở MH27 trước |
| 3 | Trả tiền ngày 06/11/2026 | từ chối thưởng thanh toán đúng hạn (quá hạn) |
| 4 | Bỏ duyệt phiếu nhập | đảo bút toán bằng số âm, công nợ và kho giảm theo, không xoá phiếu |

## 7. Kết quả chạy
| | |
|---|---|
| Ngày chạy | 31/10/2026 (bộ tính chung `computeDoc`, `modules/mua-hang/domain/src/engine.ts`) |
| Bản code (commit) | 2bd97a1 |
| Test tự động | chưa có — việc tiếp theo: `apps/api/test/nt-mh-001.test.ts` chạy trên sổ thật (CSDL test) |

| Mục | Mong đợi | Phần mềm | Chênh | Giải thích |
|---|---|---|---|---|
| Thành tiền 110063095 | 50.941.871 | 50.941.872 | +1 | làm tròn |
| Thành tiền 110063102 | 6.819.552 | 6.819.552 | 0 | |
| Thành tiền 110064075Q | 35.447.376 | 35.447.373 | −3 | CK đúng = 3,25 thùng × 144.000 = 468.000 gồm VAT (bảng mong đợi ghi 433.331 trước thuế, đúng ra 433.333) |
| Thành tiền 110064075 | 35.447.376 | 35.447.373 | −3 | như trên |
| Thành tiền 120068007 | 56.766.795 | 56.766.790 | −5 | làm tròn |
| Thành tiền 120064010 | 519.415.447 | 519.415.416 | −31 | bảng mong đợi tính đơn giá chưa VAT làm tròn 2 số lẻ × SL; phần mềm trừ CK trên tiền gồm VAT rồi tách thuế |
| **Tổng phải trả** | **704.838.416** | **704.838.376** | **−40** | cộng các dòng trên |
| Quà bàn chải | 6 | 6 | 0 | |
| Hạn thanh toán | 05/11/2026 | 05/11/2026 | 0 | |
| Thưởng TT đúng hạn 1% | 7.048.384 | 7.048.384 | 0 | |
| Hỗ trợ ngoài 2% | 14.096.768 | 14.096.768 | 0 | |
| Lệch chuẩn #1 (ngày 16/10) | CT 16–31, không quà | CT 16–31, không quà | — | |

**Cần Phòng kế toán chốt:** chấp nhận cách làm tròn của phần mềm (lệch 40đ trên tổng), hay theo cách của hoá đơn NCC (đơn giá chưa VAT 2 số lẻ × SL). Khi có hoá đơn thật, kế toán có thể sửa ô CK (đ) của dòng để khớp hoá đơn.

## 8. Biên bản nghiệm thu
| Ngày | Bộ phận | Kết quả | Ghi chú |
|---|---|---|---|
| | Phòng kế toán | | |

## 9. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 02/11/2026 | Tạo phiếu từ tình huống test mua hàng 31/10/2026, ghi kết quả chạy bộ tính |
