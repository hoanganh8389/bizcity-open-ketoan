# Tính giá vốn (ACC49)

Tính **giá vốn bình quân** (bình quân gia quyền theo tháng) cho từng mặt hàng **trong một phạm vi trên Cơ cấu tổ chức**, rồi ghi sổ giá vốn của hàng đã xuất trong tháng.

<!-- [2026-11-17 Nguyễn Văn Thủy] màn theo trình tự phạm vi → các lần tính → bảng giá vốn; nhập Excel là giá vốn bình quân đầu kỳ (đóng góp) -->
## Dùng màn này

1. **Phạm vi tính (cơ cấu)** → bấm **Chọn…**, bấm một nút trên cây (miền, chi nhánh, tỉnh) hoặc một shop. Mọi shop bên dưới dùng chung một giá vốn bình quân. Mặc định mỗi **chi nhánh cấp 2** (nơi mua hàng đại diện rồi phát xuống shop) là một phạm vi.
2. Chọn **Tháng**, bấm **Tính giá vốn**. Mỗi lần bấm lưu một dòng ở **Các lần tính giá vốn** (lọc theo ngày tính), kèm mốc cơ cấu của phạm vi.
3. Bấm một lần tính để xem **bảng giá vốn** các mã hàng của lần đó. Rê chuột lên tiêu đề cột để xem giải thích; cột chi tiết bật ở nút **Cột**.

Mỗi shop trong một tháng chỉ có **một** giá vốn: chọn nút X rồi tính thì các phạm vi nhỏ hơn bên dưới X gộp vào X; chọn một shop thì shop đó tính riêng. Đổi phạm vi rồi tính lại thì phiếu giá vốn cũ được đảo, ghi phiếu mới.

| Cột | Ý nghĩa |
|---|---|
| Tồn đầu (SL, $) · Giá vốn BQ đầu kỳ | Tồn cuối tháng trước; giá vốn bình quân đầu kỳ = Tồn đầu $ ÷ SL (hoặc giá nhập từ Excel) |
| Nhập mua (SL, $) | Nhập từ nhà cung cấp theo giá Net (chưa VAT − chiết khấu trên phiếu) |
| Chi phí (+) | Chi phí mua hàng phân bổ vào mã (vận chuyển, bốc xếp…) — tăng giá vốn |
| Thưởng, CK (−) | Thưởng doanh số / chiết khấu nhãn hàng phân bổ theo mã — giảm giá vốn |
| Nhập khác (SL, $) | Trả nhà cung cấp (âm), nhập điều chỉnh, nhận từ chi nhánh khác |
| **Giá vốn BQ cuối kỳ** | (Tồn đầu $ + Nhập mua $ + Chi phí − Thưởng, CK + Nhập khác $) ÷ (Tồn đầu SL + Nhập mua SL + Nhập khác SL) |
| Xuất · Tồn cuối (SL, $) | Giá vốn hàng xuất và tồn cuối = SL × Giá vốn BQ cuối kỳ |

<!-- [2026-11-09 11:30 PM Johnny Chu - Chu Hoàng Anh] PHASE-032 — mục Kiến trúc tổng thể cho dev / kế toán / CEO; số tài khoản là ví dụ TT99 -->
## Công thức giá vốn

- Ô **Công thức** hiện công thức đang áp dụng cho tháng chọn. Bấm vào để xem công thức dạng phân số:
  Giá vốn BQ cuối kỳ = (Giá trị tồn đầu kỳ + Giá trị nhập mua + Chi phí phân bổ − Thưởng, CK phân bổ − Trả NCC + Nhập điều chỉnh + Nhận từ chi nhánh khác) ÷ (SL tương ứng).
- Công thức **cố định** để lãi lỗ, kết chuyển, khoá sổ nhất quán. Khi tính không phải chọn.
- Cần đổi (ví dụ đầu năm tài chính): bấm **Đổi công thức…**, chọn các lựa chọn, **Áp dụng từ tháng** và mật khẩu. Tháng trước giữ công thức cũ; không áp vào tháng đã khoá sổ. Sau khi đổi, tính lại các tháng từ tháng áp dụng.

## Kiến trúc tổng thể: giá vốn nằm ở đâu trong hệ thống

Trang này nói **cách tính** của màn ACC49. Để hiểu giá vốn nằm ở đâu trong cả hệ thống (ai tính, ai ghi sổ, khi nào được kết chuyển), đọc sơ đồ một trang ở [PHASE-032 · 10 Kiến trúc](../phases/PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/10-KIEN-TRUC.md) hoặc mở bản vẽ [inventory-engine.html](../phases/PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/mockups/inventory-engine.html):

```text
Master Data & Policy Registry  (item_id bất biến · SKU có phiên bản · phương pháp tính giá có phiên bản)
        ↓
Mua hàng · Kho · Bán hàng      (kể sự việc, không ghi sổ)
        ↓
Cửa nạp → cổng kiểm chuẩn       (định danh, lô, dòng gốc, chính sách)
        ↓
Inventory Engine  ──►  Accounting Kernel
(số lượng · lô · lớp giá vốn ·  (nơi duy nhất ghi sổ cái; tra tài khoản
 phân bổ; KHÔNG ghi sổ)          theo lý do → nhóm hạch toán tại ngày)
        ↓
Cost Settlement → Period Closing (giá vốn kỳ chốt rồi mới kết chuyển 632 → 911, khoá sổ)
        ↓
Báo cáo & truy vết              (lãi gộp theo item_id; bút toán → phân bổ → lớp → phiếu nhập)
```

Bốn điều hệ thống phải giữ đồng thời: **Identity** (một hàng một `item_id`), **Inventory** (ở đâu, lô nào, còn bao nhiêu), **Cost** (giá gốc, phân bổ, điều chỉnh), **Accounting** (đúng tài khoản, đối chiếu, kết chuyển, khoá kỳ). Hôm nay Kernel tính **bình quân gia quyền tháng** như mô tả dưới đây; mô hình lớp giá vốn + phân bổ, lô ở Kernel, FIFO và cổng *giá vốn chốt trước kết chuyển* là việc của PHASE-032 (đề xuất, chưa có mã).

> **Mã hàng ≠ mã tài khoản.** Các số 156, 632, 1579, 1381… trong trang này là **ví dụ theo gói nền TT99**; luật định khoản tra tài khoản theo *lý do → nhóm hạch toán → chế độ kế toán tại ngày*, không viết cứng và không gắn tài khoản vào mặt hàng ([PHASE-032 · 20](../phases/PHASE-032-INVENTORY-ENGINE-GIA-VON-KHO/20-MA-HANG-VA-MA-TAI-KHOAN.md), R-ITEM-10).

## Cách tính

Các shop cùng **phạm vi tính** (nút trên Cơ cấu tổ chức) dùng chung một giá vốn bình quân cho mỗi mặt hàng trong tháng:

```
                       Giá trị tồn đầu + nhập mua + chi phí phân bổ − thưởng, CK phân bổ − trả NCC + điều chỉnh tăng + nhận từ chi nhánh khác
Giá vốn BQ cuối kỳ = ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
                       Số lượng tồn đầu + nhập mua − trả NCC + điều chỉnh tăng + nhận từ chi nhánh khác
```

- **Tồn đầu** là tồn cuối tháng trước. Tháng trước chưa tính thì phần mềm tự tính lần lượt các tháng còn thiếu.
- **Chuyển kho giữa hai shop cùng phạm vi** không làm đổi giá vốn (hàng chỉ đổi chỗ); nhận từ phạm vi khác thì tính vào giá theo giá vốn bên gửi.
- Tháng không nhập gì (mẫu số bằng 0) thì dùng đơn giá gần nhất của các tháng trước.
- **Hàng bán nội bộ theo giá bán** (lý do XCN): giá vốn đã ghi ngay bằng giá bán, và bị **trừ khỏi cả tử và mẫu** của công thức trên.
- **Hàng bán nội bộ theo giá bán, xuất tặng thưởng khách hàng** (lý do có đánh dấu "Xuất theo giá trị chứng từ", mặc định XCN, XTA1.4): như trên.
- **Hàng trả nhà cung cấp** (không theo lý do — lý do chỉ là nhãn): **sổ nội bộ** lấy thành tiền − thuế trên phiếu; **sổ thuế** định giá theo tồn đầu, không lấy thẳng tiền trên phiếu trả. Xem [Công thức giá vốn](cong-thuc-gia-von.md).

  Định giá theo tồn đầu:

  | Trường hợp | Giá trị đưa vào công thức |
  |---|---|
  | Tiền trả bằng 0 | 0 |
  | Đơn giá trả ≤ đơn giá tồn đầu | Số lượng trả × đơn giá tồn đầu |
  | Tiền trả ≤ giá trị tồn đầu | Tiền trả |
  | Số lượng trả ≤ số lượng tồn đầu | Giá trị tồn đầu |
  | Còn lại | Giá trị tồn đầu + (số lượng trả − số lượng tồn đầu) × đơn giá trả |

  Tồn kho trên sổ vẫn giảm đúng số tiền ghi trên phiếu trả.

- **Khách trả hàng** <!-- [2026-11-11 12:15 AM Johnny Chu - Chu Hoàng Anh] PHASE-032 — B3: khách trả hàng lấy đúng giá vốn lúc bán -->: phiếu trả ghi **chứng từ bán gốc** thì phần mềm hoàn giá vốn **đúng đơn giá đã dùng lúc bán**, không lấy đơn giá tháng trả.
  | Trường hợp | Giá vốn hoàn (Nợ TK kho / Có TK giá vốn) |
  |---|---|
  | Bán và trả cùng tháng | số lượng trả × đơn giá tháng (cũng là đơn giá lúc bán) |
  | Bán tháng trước, trả tháng này | số lượng trả × **đơn giá tháng bán gốc**. Hàng trả vào công thức đơn giá tháng này như một dòng nhập, nên giá trị tồn cuối khớp số dư tài khoản kho |
  | Phiếu trả không ghi chứng từ gốc (hoặc gốc đã huỷ) | số lượng trả × **đơn giá bình quân tồn đầu tháng trả** (mặc định tạm, kế toán trưởng có thể đổi sau) |

  Ví dụ: tháng 10 đơn giá 100.000, bán 30 cái. Tháng 11 nhập thêm 25 cái giá 120.000, khách trả 5 cái của đơn bán tháng 10: hoàn **500.000** (không phải 526.316 theo đơn giá tháng 11 cũ, hay 600.000 theo giá nhập gần nhất). Tính lại giá vốn tháng bán gốc sau đó thì tính lại cả tháng trả.
- **Nhập điều chỉnh tăng** vào công thức theo giá trị trên phiếu (số lượng 0 thì là điều chỉnh giá trị). Muốn bỏ hẳn nhập điều chỉnh ra khỏi công thức: đổi công thức giá vốn (Không tính).

## Nhập giá vốn bình quân đầu kỳ từ Excel

Dùng khi bắt đầu áp dụng (chưa có tồn đầu đủ giá trị) hoặc khi cần chốt lại giá đầu kỳ của một tháng:

1. Chọn **Tháng**, bấm **Nhập giá vốn bình quân đầu kỳ … từ Excel**, chọn tệp `.xlsx` / `.xls` / `.csv`.
2. Tệp cần cột **Mã hàng** (bắt buộc) và **Giá vốn bình quân đầu kỳ**; **Tên hàng** chỉ để tham khảo. Dòng tiêu đề nằm trong 10 dòng đầu. Một mã lặp nhiều dòng thì lấy giá khác 0 xuất hiện nhiều nhất.
3. Bấm **Ghi**: giá trị tồn đầu = **SL tồn đầu × giá nhập**, rồi bình quân với chứng từ nhập trong tháng ra **giá vốn bình quân cuối kỳ** và ghi sổ ngay. Tháng sau tự lấy tiếp, không cần nhập lại.

- Mỗi mã một giá cho mọi phạm vi; giữ đủ số lẻ, tiền giá vốn từng phiếu làm tròn đồng.
- Mã không có tồn đầu và không nhập gì trong tháng thì lấy đúng giá nhập.
- Mã **không có trong tệp** lấy tồn cuối tháng trước; phần mềm báo danh sách mã có xuất mà thiếu trong tệp.
- Cột **Nguồn giá đầu kỳ** (bật ở Cột) cho biết mã lấy giá từ Excel hay tồn cuối tháng trước. Muốn bỏ giá đã nhập thì bấm **Bỏ giá đầu kỳ đã nhập**.

## Ghi sổ

Phiếu **chưa có giá vốn** (bán hàng, khách trả, chuyển kho đi / đến, điều chỉnh tăng / giảm, xuất điều chỉnh) khi định khoản đã có sẵn **dòng giá vốn 0 đồng cho từng mặt hàng** ngay trong bút toán của phiếu. Tính giá vốn **ghi đè số tiền** = số lượng × đơn giá vừa tính (làm tròn đồng, theo từng phiếu, từng mặt hàng) lên chính các dòng đó:

| Nghiệp vụ | Nợ | Có |
|---|---|---|
| Bán hàng | 632 Giá vốn (hàng tặng có thể vào 641) | 156 Hàng hoá |
| Khách trả hàng | 156 | 632 |
| Chuyển kho đi | 1579 Hàng đang chuyển (khác đơn vị: 13681) | 156 |
| Chuyển kho đến | 156 | 1579 (13681) |
| Kiểm kê thiếu | 1381 Thiếu chờ xử lý | 156 |
| Kiểm kê thừa | 156 | 3381 Thừa chờ xử lý |

Phiếu định khoản **trước khi** có dòng giá vốn sẵn (dữ liệu cũ) thì giá vốn vẫn ghi vào một chứng từ **"Giá vốn hàng xuất"** của từng chi nhánh, ngày cuối tháng. Định khoản lại các phiếu đó thì chúng có dòng giá vốn sẵn như phiếu mới.

## Lưu ý

- **Tính giá vốn trước, rồi mới kết chuyển lãi lỗ.** Đã kết chuyển rồi mới tính giá vốn thì phải kết chuyển lại.
- Bấm tính lại bao nhiêu lần cũng được (ví dụ khi có thêm phiếu muộn): số tiền dòng giá vốn **được ghi đè**, không sinh bút toán ghi số âm (riêng chứng từ "Giá vốn hàng xuất" của dữ liệu cũ vẫn ghi số âm rồi ghi lại).
- Phiếu đổi phiên bản và được định khoản lại thì dòng giá vốn trở về 0, cần bấm tính giá vốn lại.
- Kỳ đã khoá sổ thì không tính lại được.
- Hàng xuất mà hệ thống bán hàng đã gửi kèm giá vốn thì giá vốn được ghi cùng bút toán của chứng từ, không tính lại ở đây.

## Căn cứ pháp lý

Chuẩn mực kế toán số 02 — Hàng tồn kho (phương pháp bình quân gia quyền); Thông tư 99/2025/TT-BTC, hướng dẫn tài khoản 156, 632. Xem thêm màn **Căn cứ pháp lý** (TI11), trang *Hàng tồn kho và giá vốn*.
