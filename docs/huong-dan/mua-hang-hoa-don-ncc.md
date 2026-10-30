# Hoá đơn đầu vào của NCC (MH22)

Nơi lưu **từng hoá đơn nhà cung cấp gửi**: đầu hoá đơn (mẫu số, ký hiệu, số, ngày, MST, tổng tiền) và **từng dòng hàng đúng như NCC ghi** (mã, tên, ĐVT của họ). Phần mềm tự biết dòng đó là **mã hàng nào bên mình**, rồi **đối soát với phiếu nhập** cùng số hoá đơn để bắt sai sót: nhập thiếu, nhập thừa, sai giá, sai thuế suất, sai tổng tiền.

Mở từ menu **Mua hàng → Hoá đơn đầu vào của NCC**, hoặc trong **hồ sơ NCC → thẻ Hoá đơn NCC** (chỉ hoá đơn của NCC đó).

## Đưa hoá đơn vào

| Cách | Khi nào dùng |
|---|---|
| **Nhập Excel** | NCC gửi bảng kê / báo cáo hoá đơn dạng Excel. Mỗi dòng một mặt hàng; các dòng cùng **ký hiệu + số hoá đơn** gom thành một hoá đơn. Cột nhận theo tên tiêu đề (bấm "Hướng dẫn cột" để xem và tải tệp mẫu). |
| **Quét ảnh / PDF (AI)** | Có ảnh chụp / tệp PDF hoá đơn. Phần mềm gửi tệp sang dịch vụ đọc hoá đơn đơn vị đã cấu hình (ChatGPT, Claude…), kết quả hiện ra để **kiểm tra trước khi ghi**. Nút mờ = chưa cấu hình, hỏi bộ phận IT. |
| **Thêm hoá đơn** | Gõ tay khi chỉ có vài dòng. |

Trước khi ghi luôn có bước **xem trước**:

- Mỗi hoá đơn hiện từng dòng.
- Dòng **đã nhận diện** có mã bên mình.
- Dòng **chưa nhận diện** tô vàng, kèm **gợi ý**: bấm gợi ý là chọn.
- Có cảnh báo khi hoá đơn **trùng**, thiếu ngày, hoặc cộng dòng khác tổng ghi trên hoá đơn.

Hoá đơn trùng (cùng NCC + ký hiệu + số; số "0000101" và "101" là một) không ghi lại.

## Phần mềm nhận diện mã thế nào

NCC gọi hàng theo tên của họ ("SUA BOT ABBOTT GROW VANI 800G", ĐVT "THUNG"), bên mình là mã 9 số. Phần mềm tìm theo thứ tự tin cậy:

1. **Đã học**: trước đây đã có người chọn mã cho đúng cách ghi này của NCC. Có mã NCC thì tra theo mã, không có thì tra theo tên. NCC đổi tên mà giữ mã thì vẫn nhận đúng.
2. **Khai mặt hàng của NCC**: ở hồ sơ NCC → Mặt hàng & giá mua, đã khai "Mã / tên hàng bên NCC".
3. **NCC ghi đúng mã của mình.**
4. Không chắc chắn thì **chỉ gợi ý**, không tự chọn:
   - xếp theo độ giống tên;
   - mặt hàng NCC này có bán được ưu tiên;
   - khác quy cách (400g / 800g) bị hạ điểm.

**Người chọn mã là mình.** Chọn xong bấm Ghi thì phần mềm **học** cách ghi đó. Lần sau hoá đơn ghi y như vậy sẽ tự nhận đúng. Đó là dữ liệu "training": càng dùng càng ít phải chọn.

ĐVT: nếu ĐVT NCC ghi trùng một ĐVT đã khai của mã (Thùng, Hộp…) thì lấy đúng ĐVT đó. Không thì lấy ĐVT mua mặc định. Có thể đổi ở cột "ĐVT bên mình". Tỉ lệ quy đổi lấy từ danh mục mặt hàng.

**Bảng nhận diện mã** (nút trên màn) liệt kê mọi cách ghi đã học: NCC ghi gì, mã nào, số lần gặp, ai dạy, gặp lần cuối lúc nào. Học sai thì **Xoá** (quên cách ghi đó); nhật ký giữ đủ nội dung đã xoá.

## Đối soát với phiếu nhập

Phiếu nhập gắn với hoá đơn qua **NCC + số (và ký hiệu) hoá đơn**, không cần chọn tay. Phần mềm so **từng mã**:

- **Số lượng** quy về ĐVT nhỏ nhất: hoá đơn 2 Thùng = phiếu 48 Lon là khớp.
- **Đơn giá chưa thuế sau chiết khấu.**
- **Thuế suất.**
- **Tổng thanh toán.**

Tình trạng của mỗi hoá đơn:

| Tình trạng | Nghĩa | Làm gì |
|---|---|---|
| Chưa nhận diện mã | Còn dòng chưa biết là mã nào | Mở hoá đơn → Sửa → chọn mã → Ghi |
| Chưa có phiếu nhập | Chưa phiếu nhập nào ghi số hoá đơn này | Bấm **Lập phiếu nhập từ hoá đơn**, hoặc ghi số hoá đơn vào phiếu nhập đã có |
| Lệch phiếu nhập | Phiếu cùng số hoá đơn lệch SL / giá / thuế / tổng | Xem thẻ **Đối soát phiếu nhập** — sửa phiếu, hoặc liên hệ NCC |
| Khớp phiếu nhập | Từng dòng khớp | — |

Ở **phiếu nhập**, khi đã ghi số hoá đơn mà hoá đơn đó có ở MH22, khung Kiểm tra hiện ngay một trong hai dòng:

- **"Đối soát hoá đơn NCC … khớp"**;
- **"Lệch hoá đơn NCC …: …"** kèm từng chỗ lệch.

Đây là cảnh báo, không chặn duyệt. Hàng giao nhiều lần cùng một hoá đơn thì các phiếu được cộng chung.

**Lập phiếu nhập từ hoá đơn** có hai chỗ bấm:

- trong hoá đơn ở MH22 (nút "Lập phiếu nhập từ hoá đơn");
- ngay trên phiếu nhập: chọn NCC xong, ô **"Lấy từ hoá đơn NCC"** (cạnh "Theo đơn đặt hàng") liệt kê hoá đơn của NCC đó kèm tình trạng. Chọn một hoá đơn là điền vào phiếu đang lập; phiếu đã có dòng thì phần mềm hỏi trước khi thay. Phiếu đang lập theo đơn đặt vẫn chọn được: đơn đặt giữ nguyên, dòng hàng lấy theo hoá đơn.

Hoá đơn còn dòng **chưa nhận diện mã** thì phần mềm **không bỏ qua dòng đó**:
- chọn hoá đơn trên phiếu nhập là mở ngay hộp hoá đơn ở chế độ sửa, chọn mã (và ĐVT) cho các dòng đó rồi **Ghi**;
- phần mềm học các cách ghi này, rồi điền **đủ** dòng vào phiếu nhập;
- đóng hộp mà không ghi thì phiếu chưa lấy hoá đơn.

Hoá đơn chưa nhận diện mã và hoá đơn chưa có phiếu nhập cũng hiện ở **Việc cần làm** (sơ đồ quy trình, tổng quan), bấm vào là mở MH22 đã lọc sẵn.

Phiếu được điền sẵn:

- NCC, số / ký hiệu / ngày hoá đơn;
- dòng hàng: mã, ĐVT, SL, giá chưa thuế, chiết khấu, thuế suất theo hoá đơn;
- dòng hàng tặng thành dòng quà.

Kiểm tra, chọn đơn đặt (nếu có), rồi ghi như phiếu nhập thường.

## Tệp đính kèm, huỷ, nhật ký

- Thẻ **Tệp đính kèm** của hoá đơn: gắn ảnh / PDF / XML hoá đơn gốc để sau này tra lại.
- Hoá đơn là chứng từ, **chỉ Huỷ, không xoá**. Huỷ bắt buộc ghi lý do; phần mềm ghi người huỷ và thời điểm. Huỷ xong thì số hoá đơn đó được nhập lại.
- Mỗi hoá đơn ghi người tạo / sửa, ngày giờ. Nhật ký mua hàng (MH10) ghi các sự kiện: thêm, sửa, huỷ, nhập Excel, quét AI, học mã, xoá mã đã học.

## Dành cho IT: cấu hình dịch vụ đọc hoá đơn (AI)

Đặt biến môi trường cho API:

- `INVOICE_AI_URL`: địa chỉ dịch vụ đọc hoá đơn của đơn vị (tự dựng, gọi ChatGPT / Claude / dịch vụ OCR tuỳ chọn).
- `INVOICE_AI_KEY` (tuỳ chọn): gửi kèm dạng `Authorization: Bearer …`.
- `INVOICE_AI_TIMEOUT_MS` (tuỳ chọn): mặc định 120 000.

Phần mềm gửi `POST` JSON:

```json
{ "fileName": "hd.pdf", "mime": "application/pdf", "dataBase64": "…",
  "hint": { "partnerCode": "NC100227", "partnerName": "…", "partnerTaxCode": "…", "buyerTaxCode": "…" } }
```

Dịch vụ trả về `{ "invoices": [ … ] }`. Mỗi hoá đơn theo khuôn sau (đơn giá **chưa thuế**, trừ khi có `priceIncludesVat: true`):

```json
{ "form": "1", "series": "C26MHZ", "no": "134608", "date": "2026-08-20",
  "sellerTaxCode": "0101234567", "sellerName": "…", "buyerTaxCode": "…",
  "totalBeforeTax": 19200000, "totalTax": 1536000, "total": 20736000,
  "lines": [ { "nccSku": "AB-G800", "nccName": "Sữa bột … 800g", "nccUnit": "Thùng",
               "qty": 2, "price": 9600000, "discountAmount": 0, "amount": 19200000,
               "taxRate": 8, "taxAmount": 1536000, "isGift": false } ] }
```

Quy ước các trường:

- `taxRate: null`: hàng không chịu thuế.
- Dòng giá 0: hàng tặng.

Kết quả **luôn qua bước xem trước**, người dùng kiểm tra rồi mới ghi. Nếu dịch vụ trả sai khuôn, phần mềm báo rõ trường nào sai.
