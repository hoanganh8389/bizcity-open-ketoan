# Nguyên tắc và nghiệp vụ mẫu

Phần "xương sống" mà mọi chức năng kế toán đều dựa vào: phương trình kế toán, quy tắc Nợ / Có, sáu luật không đổi, và định khoản của 15 nghiệp vụ hay gặp ở chuỗi bán lẻ. Đọc sau tài liệu *Kế toán cho lập trình viên*.

**Lưu ý về quy định**: chế độ kế toán doanh nghiệp đã đổi từ Thông tư 200/2014 sang **Thông tư 99/2025/TT-BTC**, áp dụng từ 01/01/2026. Nguyên lý ghi kép không đổi, nhưng số hiệu tài khoản, mẫu chứng từ, mẫu báo cáo có thay đổi. Khi tự tìm hiểu luôn kiểm tra tài liệu đang nói theo thông tư nào.

---

## 1. Nguyên tắc kế toán phải nắm

### 1.1 Phương trình và ghi kép

```
TÀI SẢN  =  NỢ PHẢI TRẢ  +  VỐN CHỦ SỞ HỮU  (+ Doanh thu − Chi phí trong kỳ)
```

Mọi nghiệp vụ đều làm phương trình này **vẫn cân**. Vì vậy mỗi nghiệp vụ ghi vào ít nhất hai tài khoản: tổng bên **Nợ** bằng tổng bên **Có**. Đó là định khoản.

| Loại tài khoản (đầu số) | Ví dụ | Tăng ghi | Giảm ghi | Số dư |
|---|---|---|---|---|
| 1, 2: Tài sản | 111 Tiền mặt, 112 Ngân hàng, 131 Phải thu khách, 156 Hàng hoá | Nợ | Có | Nợ |
| 3: Nợ phải trả | 331 Phải trả NCC, 3331 Thuế GTGT phải nộp | Có | Nợ | Có |
| 4: Vốn chủ sở hữu | 411 Vốn góp, 421 Lợi nhuận chưa phân phối | Có | Nợ | Có |
| 5, 7: Doanh thu, thu nhập | 511 Doanh thu, 515, 711 | Có | Nợ | không có số dư cuối kỳ |
| 6, 8: Chi phí | 632 Giá vốn, 641 Bán hàng, 642 Quản lý | Nợ | Có | không có số dư cuối kỳ |
| 9: Xác định kết quả | 911 | trung gian kết chuyển | | không có số dư |

Mẹo nhớ: tài khoản đầu 1, 2, 6, 8 "tăng bên Nợ"; đầu 3, 4, 5, 7 "tăng bên Có". Tài khoản **lưỡng tính** như 131, 331 có thể dư Nợ ở khách này và dư Có ở khách khác, nên phải theo dõi **theo từng đối tượng**.

### 1.2 Dòng chảy của kế toán

```
Chứng từ gốc  →  Định khoản  →  Ghi sổ (nhật ký chung, sổ cái, sổ chi tiết)  →  Khoá sổ cuối kỳ  →  Báo cáo
(hoá đơn,       (Nợ TK… / Có TK…)  (sổ chỉ thêm, không sửa)                       (kết chuyển 911)   (CĐPS, BCTC, thuế)
 phiếu thu,
 phiếu nhập…)
```

### 1.3 Các luật "100 năm không đổi" mà phần mềm phải giữ

1. **Không chứng từ thì không ghi sổ.** Mỗi bút toán trỏ về chứng từ gốc.
2. **Nợ = Có** ở từng bút toán.
3. **Sổ không tẩy xoá.** Sai thì sửa theo một trong ba phương pháp chữa sổ: cải chính (sổ tay), **ghi số âm** (bút toán giống hệt, số tiền âm), ghi bổ sung. Phần mềm dùng ghi số âm, rồi ghi bút toán đúng.
4. **Kỳ đã khoá thì không ghi, không sửa.** Muốn sửa phải mở khoá, có người chịu trách nhiệm.
5. **Đánh số liên tục**, không trùng, không nhảy số (số chứng từ, số bút toán).
6. **Cuối kỳ kết chuyển** doanh thu, chi phí về 911 để ra lãi lỗ, rồi chuyển lãi lỗ về 421.

### 1.4 Thuế GTGT (phần kế toán hỏi nhiều nhất)

- Bán ra: thuế đầu ra ghi **Có 3331**. Mua vào: thuế đầu vào được khấu trừ ghi **Nợ 133**.
- Phải nộp = thuế đầu ra − thuế đầu vào được khấu trừ. Âm thì chuyển kỳ sau.
- Tờ khai lập từ **sổ hoá đơn** theo từng hoá đơn, tách theo thuế suất (không chịu thuế, 0%, 5%, 8%, 10%).
- Hoá đơn điện tử có trạng thái: hợp lệ, bị thay thế, bị điều chỉnh, bị huỷ. Hoá đơn điều chỉnh giảm ghi **số âm** trên bảng kê.

### 1.5 Giá vốn (phần dễ sai nhất về sau)

Bán một hàng hoá luôn có **hai cặp bút toán**: ghi doanh thu (Nợ 131 / Có 511, Có 3331) và ghi giá vốn (Nợ 632 / Có 156). Cách tính giá xuất kho phải chốt trước: **bình quân gia quyền cuối kỳ** (phổ biến nhất ở bán lẻ), bình quân tức thời, hoặc nhập trước xuất trước. Hàng tặng khuyến mãi vẫn có giá vốn, ghi vào chi phí (Nợ 641 / Có 156).

---

## 2. Nghiệp vụ chính và định khoản mẫu

Số liệu ví dụ: hàng giá 100.000 chưa thuế, thuế 8% = 8.000, giá vốn 70.000.

| # | Nghiệp vụ | Chứng từ | Định khoản | Ghi chú |
|---|---|---|---|---|
| 1 | Bán lẻ thu tiền mặt | Hoá đơn / phiếu bán, phiếu thu | Nợ 131 108.000 / Có 511 100.000, Có 3331 8.000 · Nợ 111 108.000 / Có 131 108.000 · Nợ 632 70.000 / Có 156 70.000 | Đi qua 131 để mọi hình thức thu cùng một đường; tiền thu ghi theo từng hình thức |
| 2 | Bán thu chuyển khoản / QR / thẻ | như trên | Thu: Nợ 112 (hoặc 113 tiền đang chuyển) / Có 131 | Thẻ, QR thường về tài khoản sau 1–2 ngày → 113 rồi đối soát |
| 3 | Bán chịu, sau thu nợ | Hoá đơn, sau đó phiếu thu | Bán: như dòng 1 nhưng chưa thu · Thu: Nợ 111/112 / Có 131 | Công nợ theo từng khách |
| 4 | Hàng tặng, khuyến mãi | Phiếu xuất (bill 0 đồng) | Nợ 641 70.000 / Có 156 70.000 | Không có doanh thu, vẫn có giá vốn |
| 5 | Khách trả hàng | Phiếu nhập hàng trả lại, hoá đơn điều chỉnh giảm | Nợ 5213 100.000, Nợ 3331 8.000 / Có 131 108.000 · Nợ 156 70.000 / Có 632 70.000 · Trả tiền: Nợ 131 / Có 111 | Tính theo **ngày trả**, không theo ngày bán |
| 6 | Mua hàng nhập kho | Hoá đơn đầu vào, phiếu nhập kho | Nợ 156 100.000, Nợ 133 8.000 / Có 331 108.000 | Thuế chỉ khấu trừ khi hoá đơn hợp lệ |
| 7 | Trả tiền nhà cung cấp | Phiếu chi, uỷ nhiệm chi | Nợ 331 / Có 111, 112 | |
| 8 | Trả hàng nhà cung cấp | Hoá đơn xuất trả, phiếu xuất | Nợ 331 / Có 156, Có 133 | |
| 9 | Chiết khấu thương mại nhận từ NCC | Hoá đơn ghi giảm | Nợ 331 / Có 156 (hoặc Có 632 nếu hàng đã bán), Có 133 | Cần chốt cách ghi với kế toán |
| 10 | Chuyển kho giữa cửa hàng (cùng pháp nhân) | Phiếu xuất kho kiêm vận chuyển nội bộ | Nợ 156 (kho nhận) / Có 156 (kho xuất) | Không có doanh thu; nếu khác đơn vị hạch toán thì dùng 136 / 336 |
| 11 | Kiểm kê thiếu / thừa | Biên bản kiểm kê | Thiếu: Nợ 1381 / Có 156 · Thừa: Nợ 156 / Có 3381 | Chờ xử lý rồi mới kết chuyển |
| 12 | Chi phí cửa hàng (điện, thuê, lương) | Hoá đơn, bảng lương, phiếu chi | Nợ 641 / 642, Nợ 133 / Có 111, 112, 331, 334 | Gắn khoản mục, bộ phận |
| 13 | Nộp thuế GTGT | Giấy nộp tiền | Khấu trừ: Nợ 3331 / Có 133 · Nộp: Nợ 3331 / Có 112 | |
| 14 | Cuối kỳ kết chuyển | Phiếu kết chuyển (phần mềm tự sinh) | Có 5213 về 511 · Nợ 511 / Có 911 · Nợ 911 / Có 632, 641, 642 · lãi: Nợ 911 / Có 4212 | Thứ tự quan trọng |
| 15 | Sửa phiếu đã ghi sổ | Phiếu sửa (phiên bản mới) | Bút toán cũ ghi **số âm** + bút toán mới | Kỳ đã khoá thì không sửa được |

Số tài khoản chi tiết cấp 2, 3 (ví dụ 5111, 51111, 1311) theo danh mục của công ty. Danh mục trong phần mềm đã rà theo **Thông tư 99/2025** (đổi tên 112 Tiền gửi không kỳ hạn, 242 Chi phí chờ phân bổ, 3387 Doanh thu chờ phân bổ…; bổ sung 215, 332, 1383, 2295, 3525, 82111, 82112; bỏ 611, 631, 461, 466). Các tài khoản dùng trong bảng trên (113, 1381, 3381, 5212, 5213, 242…) vẫn còn trong Thông tư 99.

---

## 3. Các điểm thiết kế cần hiểu

### 3.1 Vì sao sửa sai bằng "ghi số âm" chứ không "đảo chiều"?

Ví dụ: bút toán sai Nợ 111 / Có 511 100.000.

| | Đảo chiều | Ghi số âm |
|---|---|---|
| Bút toán sửa | Nợ 511 / Có 111 **100.000** | Nợ 111 / Có 511 **−100.000** |
| Phát sinh Nợ 111 trong kỳ | 100.000 (sai, phồng) | 0 |
| Phát sinh Có 111 trong kỳ | 100.000 (sai, phồng) | 0 |
| Số dư cuối | 0 (đúng) | 0 (đúng) |
| Bảng cân đối phát sinh | Phát sinh cả hai bên tăng ảo | Phát sinh đúng như chưa từng ghi sai |

Số dư như nhau, nhưng **số phát sinh khác**. Kế toán Việt Nam đọc bảng cân đối phát sinh, sổ quỹ, doanh thu theo phát sinh, nên **ghi số âm** là đúng thói quen và đúng phương pháp chữa sổ. tgs-ketoan ghi số âm, có trigger chỉ cho phép số âm ở bút toán đảo.

### 3.2 Câu hỏi thiết kế đang mở: ghi sổ từng phiếu hay gộp?

- **Từng phiếu**: truy vết từng bill, sửa một phiếu thì chỉ đảo đúng phiếu đó. Đổi lại sổ cái rất lớn (xem *Luồng dữ liệu và cấu trúc bảng*, phần quy mô).
- **Gộp theo cửa hàng × ngày (hoặc ca) × thuế suất × hình thức thanh toán**: sổ cái nhỏ hơn hàng trăm lần, kế toán đọc nhật ký chung dễ hơn. Chi tiết từng bill vẫn nằm ở bảng bán hàng và sổ hoá đơn. Đổi lại sửa một bill thì phải đảo và ghi lại cả bút toán gộp của ngày đó.
- **Đề xuất**: bán lẻ khách vãng lai **gộp theo ngày**; bán có hoá đơn ghi tên người mua, bán chịu, trả hàng thì **từng phiếu**. Bảng kê thuế luôn đọc sổ hoá đơn theo từng hoá đơn nên không bị ảnh hưởng.

Cần quyết sớm vì nó đổi cấu trúc phần định khoản tự động (posting engine).

### 3.3 Câu kế toán hay hỏi và cách trả lời

| Kế toán hỏi | Trả lời |
|---|---|
| "Sửa phiếu rồi thì sổ cũ đi đâu?" | Không mất. Bút toán cũ ghi số âm, có liên kết về bút toán gốc; xem được ở chế độ "hiện bút toán sửa" |
| "Doanh thu sao lệch báo cáo bán hàng của shop?" | Kiểm ba thứ: phiếu lỗi chưa ghi sổ; phiếu trả hàng tính theo ngày trả; chứng từ còn chờ định khoản ở ACC14. Có công cụ đối chiếu theo ngày |
| "Thuế ra trên bảng kê thấp hơn tổng bán?" | Bình thường: phiếu chưa xuất hoá đơn và bill nội bộ không lên bảng kê |
| "Khoá sổ rồi có sửa được không?" | Không. Phải mở khoá (có ghi người mở), sửa, rồi khoá lại |
| "Tiền thẻ, QR về tài khoản trễ thì sao?" | Ghi vào 113 (tiền đang chuyển), khi ngân hàng báo có thì chuyển sang 112 |
