# Kế toán cho lập trình viên

Tài liệu này dành cho người viết phần mềm đã quen bán hàng, kho, nhưng chưa học kế toán. Không cần nhớ thuật ngữ trước: mỗi khái niệm được giải thích bằng thứ lập trình viên đã biết, rồi chỉ ra nó nằm ở bảng nào trong tgs-ketoan, có câu SQL để tự xem trên dữ liệu thật.

Đọc theo thứ tự, mỗi phần khoảng 5 phút. Mọi bảng nhắc tới đều xem được cột, chú thích, quan hệ ở tab **Cấu trúc dữ liệu** của màn này.

---

## 1. Kế toán thực chất là gì?

**Kế toán là một hệ thống ghi log các lần "giá trị chuyển chỗ", với một luật bảo toàn.**

Hãy nghĩ công ty có nhiều **cái hộp**: hộp tiền mặt, hộp tiền ngân hàng, hộp hàng trong kho, hộp "khách đang nợ mình", hộp "mình đang nợ nhà cung cấp", hộp doanh thu, hộp chi phí…

Mỗi khi có chuyện xảy ra (bán hàng, nhập hàng, trả tiền), giá trị **chuyển từ hộp này sang hộp khác**. Giá trị không tự sinh ra, không tự mất đi: có hộp tăng thì phải có hộp đối ứng.

> Giống luật bảo toàn trong vật lý, hoặc giống chuyển tiền giữa hai tài khoản ngân hàng: trừ ở đây bao nhiêu thì cộng ở kia bấy nhiêu.

Toàn bộ kế toán xoay quanh việc **ghi lại các lần chuyển đó vào một cái log không được sửa**, rồi cộng log lại để ra báo cáo.

---

## 2. Từ điển: thuật ngữ kế toán ↔ lập trình

| Thuật ngữ | Nghĩa đơn giản | Giống cái gì trong lập trình | Trong tgs-ketoan |
|---|---|---|---|
| **Tài khoản** (account) | Một cái hộp có mã số. 111 = tiền mặt, 156 = hàng hoá, 511 = doanh thu | Một biến / một ví (wallet) có ID | bảng `accounts`, cột `code` |
| **Nợ / Có** (debit / credit) | Hai cột **trái / phải** khi ghi. **Không** có nghĩa là "nợ tiền" | Quy ước dấu: cột trái và cột phải | cột `debit`, `credit` trong `ledger_lines` |
| **Định khoản** | Quyết định: nghiệp vụ này ghi vào **hộp nào, bên nào, bao nhiêu** | Một **hàm ánh xạ**: `dinhKhoan(nghiepVu) → [(taiKhoan, ben, soTien)]` | posting engine (`modules/posting`) + bảng cấu hình |
| **Bút toán** (journal entry) | **Một bản ghi** gồm ít nhất 2 dòng, tổng bên Nợ = tổng bên Có | Một **transaction / commit**: nhiều dòng, phải cân | bảng `ledger_entries` (thân) + `ledger_lines` (dòng) |
| **Hạch toán** (posting) | **Hành động** ghi bút toán vào sổ | `INSERT` vào log | hàm `ledgerService.post()` |
| **Chứng từ** | Giấy tờ làm bằng chứng: hoá đơn, phiếu thu, phiếu nhập | **Input / request** gửi vào hệ thống | bảng `accounting_events` (cột `payload`) |
| **Sổ nhật ký chung** | Mọi bút toán xếp theo thời gian | Log sắp theo thời gian | `SELECT … FROM ledger_lines ORDER BY posting_date` |
| **Sổ cái** (một tài khoản) | Mọi dòng của **một** hộp | Log lọc theo một khoá | `… WHERE account_code LIKE '111%'` |
| **Số dư** | Trong hộp đang có bao nhiêu | `reduce` / `SUM` toàn bộ log tới một ngày | `SUM(debit - credit)` |
| **Phát sinh** | Trong kỳ hộp tăng bao nhiêu, giảm bao nhiêu | `SUM` log trong một khoảng thời gian | báo cáo Cân đối phát sinh |
| **Kỳ kế toán** | Một tháng | Một "khoảng thời gian" để chốt số | bảng `fiscal_periods` |
| **Khoá sổ** | Chốt tháng, không ai sửa được nữa | Đóng băng nhánh / gắn tag release | bảng `period_locks` |
| **Ghi số âm** | Sửa sai: ghi lại bút toán cũ với số tiền âm | **`git revert`**: không xoá commit cũ mà thêm commit triệt tiêu | `is_reversal`; liên kết về bút toán gốc ở bảng `ledger_links` |
| **Kết chuyển** | Cuối kỳ đổ hộp doanh thu, chi phí về hộp lãi lỗ | Reset bộ đếm của kỳ, dồn tổng về một chỗ | màn Kết chuyển lãi lỗ |
| **Báo cáo** | Cộng log theo các cách khác nhau | `GROUP BY` | các API `/reports/*` |

**Ba chữ dễ lẫn nhất:**
- **Định khoản** là *quyết định* ghi vào đâu (thiết kế, giống viết hàm).
- **Bút toán** là *kết quả* được ghi ra (dữ liệu, giống một commit).
- **Hạch toán** là *hành động* ghi (giống lệnh INSERT / gọi hàm post).

> Câu của kế toán "*nghiệp vụ này định khoản Nợ 111 / Có 511, mình hạch toán vào sổ thành một bút toán*" dịch ra: "*sự kiện này map ra tăng hộp 111 và tăng hộp 511, ghi vào log thành một transaction*".

---

## 3. Nợ / Có: phần khó nhất, giải thích bằng quy ước dấu

Quên nghĩa đời thường của chữ "nợ". Nợ / Có chỉ là **cột trái / cột phải**.

Mỗi loại hộp có quy ước **bên nào là tăng**:

| Loại hộp | Đầu số | Ghi bên **Nợ** (trái) là | Ghi bên **Có** (phải) là |
|---|---|---|---|
| Thứ công ty **có**: tiền, hàng, khoản khách nợ | 1, 2 | **tăng** | giảm |
| Thứ công ty **nợ người khác**: nợ NCC, thuế phải nộp | 3 | giảm | **tăng** |
| **Vốn** của chủ | 4 | giảm | **tăng** |
| **Doanh thu** | 5, 7 | giảm | **tăng** |
| **Chi phí** | 6, 8 | **tăng** | giảm |

Vì sao lại có quy ước "ngược" như vậy? Vì phương trình gốc:

```
Thứ công ty có  =  Thứ công ty nợ người khác  +  Phần của chủ
   (1, 2)                   (3)                    (4, cộng lãi = doanh thu − chi phí)
```

Hộp ở **vế trái** phương trình tăng bên trái (Nợ), hộp ở **vế phải** tăng bên phải (Có). Chi phí làm giảm phần của chủ, nên nó "ngược" với doanh thu và tăng bên Nợ.

**Luật bảo toàn = mọi bút toán phải có tổng cột Nợ = tổng cột Có.** Nhờ vậy phương trình trên luôn cân. Đây chính là **invariant** mà cơ sở dữ liệu của tgs-ketoan kiểm ở mọi transaction: lệch một đồng là bị từ chối.

> Mẹo kiểm tra: viết định khoản xong, cộng cột Nợ và cột Có. Không bằng nhau là sai, khỏi cần nghĩ tiếp.

---

## 4. Đi qua một phiếu bán hàng thật, từ đầu tới báo cáo

Khách mua hộp sữa: tiền hàng 100.000, thuế GTGT 8% là 8.000, khách trả tiền mặt 108.000. Giá vốn hộp sữa là 70.000.

### Bước 1. Chứng từ gửi sang (input)

POS gửi qua API một JSON, lưu nguyên trong `accounting_events.payload`:

```json
{ "docType": "sale", "docKey": "btsoft:95:sale:671", "docNo": "26001AA00344",
  "lines":    [{ "sku": "SUA01", "amountBeforeTax": 100000, "taxCode": "R08", "taxAmount": 8000 }],
  "payments": [{ "methodCode": "TM", "amount": 108000 }] }
```

### Bước 2. Định khoản (hàm ánh xạ)

Chuyện xảy ra, nói bằng lời:
1. Bán hàng cho khách → khách **nợ** mình 108.000; mình có **doanh thu** 100.000; mình **giữ hộ nhà nước** 8.000 tiền thuế.
2. Khách trả tiền mặt → **tiền mặt** tăng 108.000, khoản khách nợ hết.
3. Hàng ra khỏi kho → **hàng** giảm 70.000; **giá vốn** (chi phí) tăng 70.000.

Dịch sang hộp và bên:

| Cặp | Nợ (trái) | Có (phải) | Số tiền | Nghĩa |
|---|---|---|---|---|
| 1 | 131 Phải thu khách | 511 Doanh thu | 100.000 | khách nợ, mình có doanh thu |
| 1 | 131 Phải thu khách | 3331 Thuế phải nộp | 8.000 | phần thuế giữ hộ |
| 2 | 111 Tiền mặt | 131 Phải thu khách | 108.000 | khách trả, hết nợ |
| 3 | 632 Giá vốn | 156 Hàng hoá | 70.000 | hàng ra khỏi kho *(chưa làm, chờ phần kho)* |

Cộng thử: Nợ = 100.000 + 8.000 + 108.000 = 216.000; Có = 100.000 + 8.000 + 108.000 = 216.000. **Cân.**

> Vì sao không ghi thẳng Nợ 111 / Có 511? Vì bán và thu tiền là **hai sự kiện khác nhau**, giống tách *order* và *payment* trong phần mềm bán hàng. Khách trả nhiều hình thức (một nửa tiền mặt, một nửa QR) hay trả sau đều đi chung một đường qua 131.

### Bước 3. Hạch toán (ghi vào log)

Phần mềm ghi **một bút toán** gồm thân và các dòng, trong **một transaction**:

- `ledger_entries`: 1 dòng (số bút toán `NB26-0000001`, ngày, chi nhánh, trỏ về chứng từ gốc).
- `ledger_lines`: mỗi ô Nợ hoặc Có ở bảng trên là một dòng. Các dòng cùng "cặp" có cùng `pair_no`, để sổ in được cột "tài khoản đối ứng".

Tự xem trên dữ liệu thật trong DBeaver:

```sql
-- Một phiếu bán: chứng từ → bút toán → các dòng Nợ / Có
SELECT d.doc_no, e.entry_no, l.pair_no, l.account_code,
       l.debit AS no, l.credit AS co, l.description
  FROM accounting_events d
  JOIN ledger_entries e ON e.event_id = d.id
  JOIN ledger_lines l ON l.entry_id = e.id
 WHERE d.id = 1
 ORDER BY e.id, l.line_no;
```

Mỗi phiếu đã định khoản có bút toán số `BT…` trong sổ nhật ký chung. Phiếu được định khoản lại thì thấy thêm bút toán đảo (ghi số âm, `is_reversal`) và bút toán mới.

### Bước 4. Số dư và báo cáo (aggregate)

Cùng transaction đó, phần mềm cộng dồn vào `ledger_balances_daily` (số dư theo ngày) để báo cáo khỏi phải quét hết log.

```sql
-- "Sổ cái" tiền mặt = lọc log theo tài khoản
SELECT posting_date, account_code, debit, credit FROM ledger_lines
 WHERE account_code LIKE '111%' ORDER BY posting_date, id LIMIT 50;

-- "Số dư" tiền mặt tới hôm nay = reduce
SELECT SUM(debit - credit) AS so_du_tien_mat FROM ledger_lines WHERE account_code LIKE '111%';

-- "Bảng cân đối phát sinh" = GROUP BY tài khoản
SELECT account_code, SUM(debit) AS phat_sinh_no, SUM(credit) AS phat_sinh_co
  FROM ledger_lines GROUP BY account_code ORDER BY account_code;

-- Invariant: toàn bộ sổ luôn cân
SELECT SUM(debit) AS tong_no, SUM(credit) AS tong_co FROM ledger_lines;
```

Câu cuối cùng luôn ra hai số **bằng nhau**. Nếu không bằng là phần mềm có lỗi nghiêm trọng.

---

## 5. Sửa sai: tại sao sổ không cho UPDATE?

Luật kế toán: **sổ không được tẩy xoá**. Ai đó lỡ sửa số, phải còn dấu vết để kiểm toán.

Đây chính là cách git hoạt động: không ai sửa lịch sử commit, muốn bỏ một commit thì **`git revert`**, tức thêm một commit triệt tiêu nó.

Kế toán Việt Nam làm tương tự bằng **ghi số âm**:

| Lần | Bút toán | Ý nghĩa |
|---|---|---|
| Gốc (sai: ghi nhầm 100.000) | Nợ 111 **100.000** / Có 511 **100.000** | commit cũ |
| Sửa: ghi số âm | Nợ 111 **−100.000** / Có 511 **−100.000** | `git revert` |
| Ghi đúng | Nợ 111 **90.000** / Có 511 **90.000** | commit mới |

Cộng lại: tiền mặt và doanh thu đúng 90.000. Phát sinh trên báo cáo cũng chỉ còn 90.000, như thể chưa từng ghi sai.

Trong tgs-ketoan: khi POS gửi **phiên bản mới** của một phiếu đã ghi sổ, phần mềm tự ghi số âm bút toán cũ (`is_reversal = true`, một dòng `reversal` trong bảng `ledger_links` trỏ về bút toán gốc), rồi ghi bút toán mới. Cơ sở dữ liệu có trigger **chặn UPDATE, DELETE, TRUNCATE** trên `ledger_lines` và chỉ cho đảo mỗi bút toán một lần.

---

## 6. Cuối tháng: kết chuyển và khoá sổ

**Doanh thu và chi phí là bộ đếm theo kỳ.** Hết tháng, phải biết tháng đó lãi hay lỗ, rồi tháng sau đếm lại từ 0.

**Kết chuyển** = đổ hết các bộ đếm đó về hộp 911 (xác định kết quả):
- doanh thu (511) đổ sang 911 bên Có;
- giá vốn, chi phí (632, 641, 642) đổ sang 911 bên Nợ;
- 911 bên Có lớn hơn bên Nợ → **lãi**, chuyển phần chênh vào 421 (lợi nhuận).

> Giống cuối ngày chốt két: dồn số liệu bán trong ngày vào sổ tổng, rồi đưa bộ đếm về 0 cho ngày mới.

**Khoá sổ** = sau khi chốt, không cho ghi hay sửa gì vào tháng đó nữa (giống gắn tag release rồi khoá nhánh). Phiếu sửa muộn phải ghi vào tháng đang mở, hoặc mở khoá có người chịu trách nhiệm.

---

## 7. Một sổ nhật ký chung, sổ hoá đơn

Mọi chứng từ ghi vào **một sổ nhật ký chung**. Số liệu theo hoá đơn (để làm thuế) được tách ra cơ sở dữ liệu riêng bằng tác vụ
ngoài phần mềm (sao chứng từ bán, trả lại có số hoá đơn sang), không làm hai bộ sổ trong cùng một cơ sở dữ liệu.

**Sổ hoá đơn** (`tax_invoices`) không phải sổ kế toán, mà là **danh sách hoá đơn** tách theo thuế suất. Bảng kê thuế và tờ khai thuế đọc từ đây, vì cơ quan thuế cần chi tiết từng hoá đơn chứ không cần số dư tài khoản.

---

## 8. Bản đồ code tgs-ketoan theo khái niệm

| Khái niệm | Bảng | Code |
|---|---|---|
| Chứng từ (input) | `accounting_events`, `accounting_event_versions` | `modules/documents` |
| Hộp (tài khoản) | `accounts` | `modules/accounts`, `seeds/tai-khoan.csv` |
| Quy tắc định khoản | `posting_reasons`, `product_posting_groups`, `tax_codes`, `payment_methods`, `posting_defaults` | `modules/posting` (hàm ánh xạ chứng từ → dòng Nợ / Có) |
| Bút toán, hạch toán | `ledger_entries`, `ledger_lines` | `modules/ledger/ledger.service.ts` (`post`, `reverse`) |
| Số dư | `ledger_balances_daily` | cập nhật trong `ledger.service.ts` |
| Kỳ, khoá sổ | `fiscal_periods`, `period_locks` | `modules/periods` |
| Kết chuyển | `closing_rules` | `modules/closing` |
| Sổ hoá đơn | `tax_invoices`, `tax_invoice_lines` | `modules/tax-invoices` |
| Báo cáo | đọc các bảng trên | `modules/reports`, `modules/sales` |

---

## 9. Tự kiểm tra: đã hiểu chưa?

Làm thử, đáp án ở dưới. Với mỗi câu: nói bằng lời "hộp nào tăng, hộp nào giảm", rồi viết định khoản, rồi cộng Nợ và Có.

1. Khách trả hàng hộp sữa ở ví dụ trên, cửa hàng hoàn tiền mặt.
2. Nhập 10 hộp sữa từ nhà cung cấp, giá 70.000 / hộp chưa thuế, thuế 8%, chưa trả tiền.
3. Trả tiền nhà cung cấp ở câu 2 bằng chuyển khoản.
4. Trả tiền điện cửa hàng 1.000.000 bằng tiền mặt (bỏ qua thuế).

<details><summary>Đáp án</summary>

1. Doanh thu giảm (ghi vào hộp "hàng bán trả lại" 5213), thuế phải nộp giảm, tiền mặt giảm:
   Nợ 5213 100.000, Nợ 3331 8.000 / Có 131 108.000 · Nợ 131 108.000 / Có 111 108.000 · (kho) Nợ 156 70.000 / Có 632 70.000
2. Hàng tăng, thuế được khấu trừ tăng, nợ nhà cung cấp tăng:
   Nợ 156 700.000, Nợ 133 56.000 / Có 331 756.000
3. Nợ nhà cung cấp giảm, tiền ngân hàng giảm: Nợ 331 756.000 / Có 112 756.000
4. Chi phí tăng, tiền mặt giảm: Nợ 642 (hoặc 641 nếu là chi phí bán hàng) 1.000.000 / Có 111 1.000.000

</details>

Làm đúng 4 câu này là bạn đã nắm được 80% cái cần để đọc và phản biện thiết kế phần mềm kế toán.

---

## 10. Học tiếp ở đâu

**YouTube** (tìm đúng các cụm này):
- "nguyên lý kế toán cơ bản cho người mới bắt đầu"
- "nguyên tắc ghi nợ có tài khoản kế toán"
- "định khoản kế toán cơ bản bài tập có lời giải"
- "sổ nhật ký chung sổ cái cách ghi"
- "kết chuyển cuối kỳ xác định kết quả kinh doanh"

**ChatGPT** (dán nguyên câu):
- *"Tôi là lập trình viên, chưa học kế toán. Giải thích Nợ / Có, định khoản, bút toán bằng ví dụ lập trình (biến, transaction, log). Sau đó cho 10 bài tập định khoản cơ bản của cửa hàng bán lẻ, có đáp án, theo Thông tư 99/2025/TT-BTC."*
- *"Với nghiệp vụ [mô tả], hộp nào tăng, hộp nào giảm, định khoản thế nào? Trình bày bảng Nợ / Có có số."*

Kiểm lại đáp án của AI bằng hai câu hỏi: **Nợ có bằng Có không?** và **hộp tăng có ghi đúng bên tăng của nó không** (bảng mục 3)?
