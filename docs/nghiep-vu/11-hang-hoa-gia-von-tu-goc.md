# 11. Hiểu hàng hoá và giá vốn từ gốc

Trang này dành cho người làm phần mềm chưa có kiến thức kế toán. Đọc xong phải trả lời được: một món hàng được khai báo thế nào, mã hàng có nghĩa gì, khuyến mại làm đổi giá vốn ra sao, kế toán ghi những gì, dữ liệu sang thuế bằng cách nào, và cần làm gì để chuyển mã có chữ sang mã số cha – con.

Nhiệm vụ của team là thiết kế được cách quản lý cho cả hệ thống, không chỉ đổi cách đánh mã. Ý kiến góp vào là đầu vào để cân nhắc. Trước khi hỏi ai, hãy tra văn bản và dữ liệu thật trước.

Mỗi nội dung có nhãn căn cứ:

| Nhãn | Nghĩa |
|---|---|
| **[Quy định]** | Có trong văn bản công ty: quy tắc mã hàng, công thức giá vốn nội bộ và thuế, mô tả mua hàng |
| **[Họp]** | Nêu trong buổi họp với bộ phận kế toán |
| **[Góp ý]** | Bộ phận kế toán góp ý khi trao đổi, để tham khảo, chưa phải quyết định |
| **[Đang chạy]** | Thấy trong cách hệ thống đang vận hành, hoặc đếm từ dữ liệu trên máy phát triển |
| **[Suy luận]** | Team công nghệ suy ra, chưa được xác nhận |

Số liệu trong các ví dụ là tự dựng, trừ khi ghi rõ.

## 1. Bức tranh một trang

Thế Giới Sữa mua hàng từ nhà cung cấp (NCC), đưa về kho chi nhánh, chuyển xuống shop rồi bán cho khách. NCC thường xuyên tặng hàng, chiết khấu và thưởng, nên **giá mua thật của một hộp sữa không nằm sẵn trên hoá đơn**. Phần lớn độ phức tạp của hệ thống đến từ đây.

```
                 KHAI BÁO: tổ chức, kho, tài khoản, lý do, nhóm hàng, mặt hàng
                                         │
                                         ▼
NCC ──► Đơn đặt ──► Phiếu nhập ──► Kho tổng ──► Chuyển kho ──► Shop ──► Bán cho khách
                       │                                                    │
             chia dòng: mua, tặng                                 bill chính │ bill tách riêng
                       │                                                    │
                       ▼                                                    ▼
                 Tiền vốn tăng                                     Doanh thu, thuế đầu ra
                       │                                                    │
                       └───────────► CUỐI THÁNG: tính giá vốn ◄─────────────┘
                                             │
                                             ▼
                                Sổ cái, báo cáo, lãi lỗ, khoá sổ

Song song: dữ liệu NỘI BỘ giữ mọi chứng từ. Dữ liệu THUẾ chỉ giữ phần có hoá đơn, lấy từ nội bộ sang, không nhập lại.
```

Sáu câu cần nhớ:

1. Bán hàng **không biết giá vốn ngay**. Cuối tháng mới tính.
2. Giá vốn tính theo **từng mã, từng chi nhánh, từng tháng**.
3. Hàng tặng có thể làm giảm giá vốn hoặc không, tuỳ **cách ghi**.
4. Nội bộ và thuế là **hai dữ liệu**, số có thể khác nhau, và điều đó là bình thường.
5. Mã biến thể sinh ra để **tách quản lý**: tồn riêng, giá riêng, có sang thuế hay không. Bỏ chữ trên mã không được làm mất các việc này. **[Góp ý]**
6. Nội bộ phải **tách được nghiệp vụ** để tự sang thuế. Kế toán không phải làm hai lần. **[Góp ý]**

## 2. Kế toán tối thiểu cần biết

Tiền luôn đi từ chỗ này sang chỗ khác. Mỗi nghiệp vụ ghi hai vế: **Nợ** là vế nhận giá trị, **Có** là vế cho đi giá trị. Tổng Nợ luôn bằng tổng Có. Đừng hiểu "Nợ" theo nghĩa đời thường.

| Tài khoản | Tên | Hiểu đơn giản |
|---|---|---|
| 1561 | Hàng hoá | Tiền đang nằm dưới dạng hàng trong kho |
| 1579 | Hàng đang chuyển | Hàng đã rời kho này, chưa tới kho kia |
| 1331 | Thuế GTGT được khấu trừ | Thuế trả khi mua, sẽ được trừ vào thuế phải nộp |
| 3312 | Phải trả NCC | Tiền mình còn nợ NCC |
| 1311 | Phải thu khách | Tiền khách còn phải trả |
| 1111, 112 | Tiền mặt, tiền gửi | Tiền thật |
| 51111 | Doanh thu | Tiền bán được, chưa thuế |
| 33311 | Thuế GTGT đầu ra | Thuế thu hộ khách, phải nộp nhà nước |
| 6321 | Giá vốn hàng bán | Tiền vốn của hàng đã bán |
| 641 | Chi phí bán hàng | Tiền chi để bán hàng, gồm quà tặng theo lý do |
| 13681, 33681 | Phải thu, phải trả nội bộ | Tiền giữa các chi nhánh với nhau |

**Lãi gộp = Doanh thu − Giá vốn.** Mọi khuyến mại rốt cuộc đều dẫn về câu hỏi: món hàng này thật ra tốn bao nhiêu tiền?

## 3. Khai báo: phải có gì trước khi chạy

Khai báo theo thứ tự này, vì cái sau dựa vào cái trước.

| # | Khai báo | Màn | Để làm gì | Khai sai thì sao |
|---|---|---|---|---|
| 1 | Sơ đồ tổ chức | DM16 | Công ty → Miền → Chi nhánh → Tỉnh | Sai nhóm tính giá vốn, sai báo cáo cấp trên |
| 2 | Chi nhánh, shop | DM02 | Nơi phát sinh chứng từ, gắn vào sơ đồ | Không biết số liệu thuộc về ai |
| 3 | Kho | DM12 | Hàng nằm ở đâu | Sai tồn từng kho |
| 4 | Tài khoản | ACC1 | Danh sách tài khoản dùng | Không định khoản được |
| 5 | Nhóm hạch toán của hàng | ACC17 | Hàng này dùng TK kho, giá vốn, doanh thu nào | Sai báo cáo lãi lỗ |
| 6 | Lý do | ACC18 | Vì sao hàng di chuyển, TK đối ứng là gì | Sai định khoản |
| 7 | Tài khoản ngầm định | ACC41 | TK dùng khi không chỉ định gì | Chứng từ báo lỗi, không vào sổ |
| 8 | Nhóm hàng | DM11 | Ngành, nhãn, nhóm để báo cáo và sinh mã | Báo cáo theo nhóm sai |
| 9 | Mặt hàng | DM10 | Mã, tên, ĐVT, thuế, nhóm | Mọi khâu sau sai |
| 10 | NCC, chính sách mua | DM13, MH04 | Giá, chiết khấu, khuyến mại, thưởng | Giá vốn và công nợ sai |

### Ba khai báo quyết định định khoản

Một dòng phiếu đi vào tài khoản nào được quyết định theo thứ tự:

```
Lý do của phiếu  ──►  có chỉ định TK?  ── có ──► dùng TK của lý do
                           │ không
                           ▼
Nhóm hạch toán của mặt hàng  ──► có ──► dùng TK của nhóm
                           │ không
                           ▼
Tài khoản ngầm định  ──► không có ──► chứng từ báo lỗi, KHÔNG ghi bừa
```

Ví dụ thật trong cấu hình hiện có:

| Lý do | Nghĩa | Đối ứng | Doanh thu | Giá vốn |
|---|---|---|---|---|
| `NMH1` | Nhập mua từ NCC | 3312 | | |
| `XBA` | Xuất bán tại cửa hàng | 1311 | 51111 | Theo nhóm hàng |
| `NTH1` | Khách trả hàng | 1311 | 52131 | Theo nhóm hàng |
| `XCN` | Xuất bán chi nhánh khác | 13681 | 51116 | 6326 |
| `XTR1` | Trả hàng NCC | 3312 | | |
| `XTA1.4` | Xuất tặng khách hàng | | | 64184 |

Nhóm hạch toán thường gặp: `NHT01` hàng hoá (kho 1561, giá vốn 6321, doanh thu 51111); `NHT02` hàng khuyến mại, quà tặng (kho 1561, giá vốn 6323, doanh thu 51113).

**Nhận xét [Đang chạy]:** trên dữ liệu local, cùng là mã đuôi `M` nhưng 1.281 mã dùng `NHT01`, 368 mã dùng `NHT02`. Cùng là hàng khuyến mại mà đi hai bộ tài khoản khác nhau. Chưa rõ đây là chủ ý hay do khai báo lâu năm, xem mục 13.

## 4. Đọc một mã hàng

**[Quy định]** Mã thường có 9 ký tự:

```
1 1   0 0 5   1   0 0 1
└┬┘   └─┬─┘   │   └─┬─┘
Ngành   Nhãn  Nhóm  Số tự sinh
Sữa bột Vinamilk Sữa bà bầu
```

| Ngành | Tên | Ngành | Tên |
|---|---|---|---|
| 10 | Hàng chiến lược | 15 | Đồ ăn dặm |
| 11 | Sữa bột | 16 | Ngũ cốc, bột dinh dưỡng, thực phẩm |
| 12 | Sữa bột pha sẵn | 17 | Đồ dùng mẹ và bé |
| 13 | Sữa nước | 18 | Đồ uống |
| 14 | Chế phẩm từ sữa | 19 | Bỉm, tã |
| Q | Quà khuyến mại | | |

- **Nhóm** khai theo từng ngành. Ví dụ ngành Sữa bột: 1 bà bầu, 2 đặc trị trẻ em, 3 công thức trẻ em, 4 người lớn, 5 nguyên kem. Trong mọi ngành, nhóm 8 là Combo, nhóm 9 là Khác.
- **Tên hàng** dưới 50 ký tự, khoảng 80% theo công bố sản phẩm, 20% thông tin kinh doanh.

Ý nghĩa **[Suy luận]**: mã có cấu trúc để nhìn là biết hàng thuộc đâu, thời chưa có báo cáo linh hoạt. Nay thông tin đó có thể nằm ở nhóm hàng, mã chỉ cần duy nhất. Tuy vậy kế toán đã quen đọc mã và còn quản lý theo mã **[Góp ý]**, nên giữ cấu trúc 9 số là hợp lý.

Đừng nhầm mã đầu `19`: 9 số là ngành Bỉm, tã; 8 số là vật tư, đồng phục, vật dụng cửa hàng (mục 5). **[Đang chạy]**

## 5. Các loại mã đặc biệt

Văn bản quy định từ 2019 có `K`, `M`, `Q` cuối, `T`, combo và quà đầu `Q`. Lúc trao đổi, bộ phận kế toán liệt kê 5 biến thể đang gặp là `T`, `Q*`, `Z`, `*Q`, `M`, không nhắc `K`. **`K` vẫn có**: văn bản có quy định và dữ liệu còn 105 mã.

| Loại | Mã | Định nghĩa **[Quy định]** | Hiểu đơn giản | Tên hàng |
|---|---|---|---|---|
| Thường | 9 số | Hàng hoá thông thường | Không có ký tự chữ | Theo công bố sản phẩm |
| Chia giá | + `K`, 10 ký tự | Công ty quyết định chia thẳng giá trị hàng KM của NCC cho công ty hoặc người tiêu dùng vào giá trị hàng bán | Được tặng, nhưng coi như được giảm giá | Tên + "K" |
| Khuyến mại | + `M`, 10 ký tự | Hàng để tặng, thưởng người tiêu dùng, giá trị ghi nhận 0 đồng | Hàng để cho, không bán | "KM" + tên |
| Kẹp quà (`*Q`) | + `Q`, 10 ký tự | Một hàng bán + hàng KM thành bộ, không được tách | Hộp sữa bó kèm quà | Tên + "Kẹp quà KM" |
| Có tem | + `T`, 10 ký tự | Hàng có tem | Hàng theo chương trình, xem dưới | Tên + "T" |
| Combo | Nhóm 8, 9 ký tự | Từ 2 hàng bán trở lên thành bộ, có thể bán tách | Mua 2 hộp giá ưu đãi | Theo hoá đơn NCC |
| Quà khuyến mại (`Q*`) | `Q` + nhãn 3 + nhóm 1 + số 4 | Quà của nhãn hàng | Vật phẩm tặng, trả thưởng | Có "KM" + nhãn viết tắt |

**Vì sao có mã `T` [Góp ý]:** hàng theo chương trình như túi niêm phong mua 8 tặng 2, hay mua 1 thùng tặng 1 lì xì. Chương trình khác, giá khác, nên phải tách khỏi hàng thường để quản lý.

**`Q` đầu và `Q` cuối khác hẳn nhau:** `Q*` là quà, vật phẩm. `*Q` là hàng bán bó kèm quà. Góp ý gọi chung `*Q` là hàng kẹp, combo, nhưng văn bản tách hai loại và dữ liệu cũng vậy: 463 trên 472 mã `*Q` có chữ "Kẹp" trong tên, còn combo nằm ở nhóm 8 (73 mã) và mã bắt đầu bằng `Combo` (42 mã).

Không có trong quy tắc mã hàng:

| Đuôi | Biết gì | Căn cứ |
|---|---|---|
| `Z` | Quà đi kèm sữa dưới 24 tháng, phải tách bill; là một trong 5 biến thể đang gặp | **[Góp ý]**, **[Đang chạy]** |
| `B` | Hàng sắp hết hạn cần bán nhanh, giá rẻ hơn, để shop kiểm đếm tay nhanh khi chưa theo dõi được hạn dùng | Team đã xác nhận |
| `C`, `D` | Trường hợp phát sinh thêm, ít gặp. Khi nào đụng đến mới xử lý | Team đã xác nhận |

### Dữ liệu thật đang thế nào

**[Đang chạy]** Đếm trên một đơn vị của máy phát triển, 21.017 mã:

| Dạng | Số mã | Ví dụ |
|---|---|---|
| Toàn số | 7.901 | `110594012` |
| Quà `Q…` | 4.139 | `Q05940063` |
| Không theo quy tắc | 3.486 | `230111M001`, `ComboBimboCal`, `TS101`, `CC110C` |
| Quà có `Z`: `Q…Z` | 1.792 | `Q05940063Z` |
| `…M` | 1.659 | `110594012M` |
| `…Z` | 734 | `110594012Z` |
| `…T` | 492 | `130181027T` |
| `…Q` | 472 | `110053022Q` |
| `…B`, `…C`, `…D` | 237 | `100021001B` |
| `…K` | 105 | `110051001K` |

Bốn điều rút ra khi làm phần chuyển mã:

- **Một mã có thể mang hai nghĩa:** `Q05940063Z` vừa là quà, vừa có `Z`. Đổi 1 chữ thành 1 số là không đủ.
- **Chỉ 719 trên 1.792 mã `Q…Z` có mã `Q…` cùng gốc.** 1.073 mã còn lại chưa có mã cha để gắn.
- **`Z` không chỉ ở quà:** còn có ở hàng như "(Z) Bỉm dán Merries M56".
- **Không được đọc nghĩa từ chữ cuối:** `ComboBimboDK` tận cùng `K` vì tên có "DK Drop", `TS302B` là tài sản. Phải chuyển theo danh sách đã rà, không dùng quy tắc chữ cuối cho mọi mã.

### Nhìn tổng thể: không chỉ có hàng để bán

**[Góp ý]** Xây mã phải nhìn tổng thể cho có hệ thống, giống cách chia NCC thành NCC hàng hoá, NCC chi phí dịch vụ, NCC nội bộ. Ngoài hàng bán và quà còn các loại dưới đây. Danh mục đối tác đã chia theo cách đó (`NCC-HH`, `NCC-TSDV`, `CHU-NHA`, `NOI-BO`); danh mục hàng thì chưa có một ô "loại hàng" rõ ràng.

| Loại | Ví dụ | Cách nhận ra trong dữ liệu | Theo dõi |
|---|---|---|---|
| Hàng bán | Sữa, bỉm | 9 số, `NHT01` | Tồn, giá vốn, doanh thu |
| Quà, vật phẩm | Bình nước, đồ chơi | `Q…`, `NHT01` hoặc `NHT02` | Tồn, xuất tặng |
| Vật tư tiêu hao | Túi nilon, giấy in bill, băng dính | 8 số đầu `19`, `NHT06`–`NHT08` | Đưa vào 641, 153 **[Góp ý]** |
| Vật dụng trưng bày | POSM, poster, kệ | Như "KM Abbott - Kệ trưng bày", đầu `1986` | Chưa rõ |
| Công cụ dụng cụ tại shop | Ô TGS, đồng phục, kéo | Đầu `1906`, `NHT04`, `NHT05` | Theo dõi tồn tại shop **[Góp ý]** |
| Tài sản | Xe, nhà cửa, biển hiệu | `TS…` (77 mã), `NHT19` | Khấu hao |
| Không phải hàng hữu hình | Doanh thu dịch vụ, voucher, mã giảm giá | `NHT12`–`NHT16`, `NHT20`, `NHT21` | Chỉ để hạch toán |

**Nhận xét [Đang chạy]:** các mã `TS…` lấy mẫu đang ở `NHT01` (kho 1561) dù đã có `NHT19` cho tài sản. Khi làm ô "loại hàng", đừng suy thẳng từ nhóm hạch toán hiện có.

### Quy định nhập liệu

| Loại | Nội bộ nhập | Thuế nhập |
|---|---|---|
| `K`, `M`, `T` | Đúng mã có đuôi | **Mã thường** |
| Kẹp quà | Mã `Q` | Theo hoá đơn: mã thường hoặc mã `Q` |
| Combo | Mã combo | Theo hoá đơn: mã thường hoặc mã combo |
| Quà | Mã quà | Theo hoá đơn, chứng từ |

Các ràng buộc:

- **Tỷ lệ số lượng:** chi nhánh hoặc giám đốc kinh doanh quyết định bao nhiêu hộp vào mỗi mã.
- **Không nhập đổi mã:** kế toán nhập đúng mã quy định. Trường hợp đặc biệt phải ban lãnh đạo duyệt.
- **Tách quà khỏi hàng kẹp:** chỉ khi hoá đơn không thể hiện quà, và phải có giám đốc chi nhánh duyệt.
- **Phá combo:** có tem thì không được phá. Không có tem thì tuỳ trường hợp, phải bổ sung chứng từ số 10, 11; trường hợp đặc biệt cần ban lãnh đạo duyệt bằng văn bản.

## 6. Khuyến mại làm đổi giá vốn thế nào

Đây là phần quan trọng nhất. Ví dụ NCC bán 100 hộp giá 100.000đ, tặng 10 hộp.

### Hai cách hiểu 10 hộp được tặng

| | Chia giá | Quà cho người tiêu dùng |
|---|---|---|
| Bản chất | NCC giảm giá dưới dạng hàng, công ty chia vào giá trị hàng bán | Hàng của chương trình, phải đến tay khách |
| Số hộp bán được | 110 | 100, còn 10 hộp để tặng |
| Giá vốn | 10.000.000 ÷ 110 = **90.909đ** | 10.000.000 ÷ 100 = **100.000đ** |
| Bán 120.000đ, lãi mỗi hộp | **29.091đ** | **20.000đ** |

Ghi nhầm cách là báo cáo lãi sai ngay từ đầu.

### Ghi bằng mã, hay ghi bằng dòng phiếu

**[Quy định]** Mô tả mua hàng ghi ba dòng trên cùng mã `140181006`: hàng mua 1.200; KM TGS chia giá 120; KM cho người tiêu dùng 240. Còn quy tắc mã hàng dùng mã `K` và `M`. Ghép lại **[Suy luận]**:

| Ý nghĩa | Ghi bằng mã | Ghi bằng dòng phiếu | Trong phần mềm |
|---|---|---|---|
| Hàng mua | Mã thường | Dòng "Hàng mua" | `lineType = buy` |
| Tặng, chia vào giá | Mã `K` | Dòng "KM chia giá" | `lineType = gift_seller` |
| Tặng người tiêu dùng | Mã `M` | Dòng "KM cho NTD" | `lineType = gift_consumer` |

### Vì sao cách ghi làm đổi đơn giá

Đang tồn 500 hộp giá 100.000đ, nhập thêm lô chia giá trên (110 hộp, 10 triệu đồng).

| Cách ghi | Mã thường | Lô khuyến mại | Tổng tiền |
|---|---|---|---|
| Cùng mã | 610 hộp, **98.361đ** | Trộn chung | 60 triệu |
| Mã `K` riêng | 500 hộp, **100.000đ** | 110 hộp, **90.909đ** | 60 triệu |

**Tổng tiền y hệt, chỉ khác cách chia cho từng hộp.**

- Mã riêng: thấy rõ lô khuyến mại lãi bao nhiêu, nhưng một sản phẩm ra nhiều mã.
- Cùng mã: một mã gọn, nhưng lợi ích khuyến mại tan vào giá chung, phải theo dõi bằng chương trình.

<!-- tinh-thu -->

### Tăng và giảm giá vốn sau khi đã nhập

| Nghiệp vụ | Ví dụ | Tác động | Ghi sổ |
|---|---|---|---|
| Chi phí mua | Vận chuyển 500.000đ | Tăng vốn | Nợ 1561 / Có 3312 |
| Chiết khấu, thưởng của NCC | Thưởng doanh số 1.000.000đ | Giảm vốn | Nợ 3312 / Có 1561 |

Cả hai đổi giá trị, không đổi số lượng, và được **phân bổ vào từng mã**, ví dụ theo giá trị hàng đã nhập (màn MH07).

Buổi họp nêu **[Họp]** ba kiểu thưởng: tính cho chi nhánh; tính cho công ty; tính trên công ty rồi phân bổ về chi nhánh. Kiểu nào vào giá vốn chi nhánh **chưa rõ**, xem mục 13.

## 7. Công thức giá vốn

**[Quy định]** Bình quân gia quyền theo tháng, theo từng mã, từng chi nhánh.

```
                   Giá trị (Tồn đầu + Nhập + Trả NCC + Nhập điều chỉnh − Xuất chi nhánh)
Đơn giá vốn   =   ──────────────────────────────────────────────────────────────────────
                   Số lượng (Tồn đầu + Nhập + Trả NCC + Nhập điều chỉnh − Xuất chi nhánh)
```

Trả NCC viết dấu cộng vì phần mềm ghi số âm, thực chất là trừ.

**Câu hỏi để phân loại mọi nghiệp vụ:** việc này làm đổi tiền vốn của hàng, hay chỉ đổi chỗ, hay chỉ lấy hàng ra?

| Nghiệp vụ | Vào công thức? | Vì sao |
|---|---|---|
| Nhập mua, chiết khấu, điều chỉnh tăng | Có | Đổi tiền vốn |
| Trả NCC | Có | Hàng và tiền vốn cùng giảm |
| Xuất chi nhánh `XCN` | Có, trừ cả tử và mẫu | Hàng rời đi theo giá chứng từ, không theo bình quân |
| Bán thường | Không | Chỉ lấy hàng ra theo đơn giá đã tính |
| Khách trả hàng | Không | Nhập lại theo đơn giá của tháng |
| Chuyển kho trong chi nhánh | Không | Chỉ đổi chỗ |

**Giá Net** = đơn giá chưa VAT − chiết khấu. VAT không vào vốn vì được khấu trừ.

**"Chi nhánh" là cấp 2 của sơ đồ tổ chức.** Ví dụ Nghệ An gồm Nghệ An, Hà Tĩnh. Mọi shop trong đó dùng chung một đơn giá. Đây là phần nội bộ; bản thuế theo đơn vị nào đang chờ xác nhận (mục 13).

### Nội bộ và thuế khác nhau ở đâu

Biến môi trường `BOOK_MODE` của bản cài quyết định dùng công thức nào. Xem và tính thử ở màn ACC49A.

| Nội dung | Nội bộ | Thuế |
|---|---|---|
| Chứng từ | Mọi chứng từ | Chứng từ có số hoá đơn |
| Trả NCC `XTR1`, `XTR9` | Thành tiền − thuế | Định giá theo tồn đầu |
| Trả NCC lý do khác | Thành tiền − thuế | Thành tiền − thuế |
| Nhập điều chỉnh | Số lượng × đơn giá, trừ lý do `ĐGTTK` | Số lượng 0 thì lấy đơn giá |

Định giá theo tồn đầu (bản thuế):

| Trường hợp | Giá trị trừ |
|---|---|
| Đơn giá trả ≤ đơn giá tồn đầu | Số lượng trả × đơn giá tồn đầu |
| Tiền trả ≤ giá trị tồn đầu | Tiền trả **[Đang chạy, văn bản không ghi]** |
| Số lượng trả ≤ số lượng tồn đầu | Giá trị tồn đầu |
| Còn lại | Giá trị tồn đầu + phần vượt × đơn giá trả |

### Ví dụ đủ một tháng: Chi nhánh Nghệ An

| Nghiệp vụ | Số lượng | Giá trị bản thuế | Giá trị bản nội bộ |
|---|---|---|---|
| Tồn đầu | 100 | 10.000.000 | 10.000.000 |
| `NMH1`: 200 hộp × 110.000, chiết khấu 200.000 | +200 | +21.800.000 | +21.800.000 |
| `NCKhau1`: chiết khấu NCC | 0 | −300.000 | −300.000 |
| Nhập điều chỉnh: 5 × 100.000 | +5 | +500.000 | +500.000 |
| `XTR1`: trả 10 hộp, tiền 950.000 | −10 | −1.000.000 | −950.000 |
| `XCN`: xuất chi nhánh 20 hộp × 130.000 | −20 | −2.600.000 | −2.600.000 |
| **Cộng** | **275** | **28.400.000** | **28.450.000** |
| **Đơn giá** | | **≈ 103.273đ** | **≈ 103.455đ** |
| Giá vốn bán 150 hộp | | 15.490.909 | 15.518.182 |
| Tồn cuối 125 hộp | | 12.909.091 | 12.931.818 |

Kiểm tra bản thuế: 28.400.000 − 15.490.909 = 12.909.091.

Văn bản nội bộ không ghi trừ `XCN`, ví dụ này vẫn trừ theo phần mềm đang làm; chưa được xác nhận.

## 8. Luồng kế toán: một lô hàng đi từ đầu đến cuối

NCC bán 100 hộp giá 100.000đ, VAT 8%, tặng 10 hộp chia giá. Bán 50 hộp giá 120.000đ, VAT 8%.

| # | Việc xảy ra | Chứng từ, lý do | Nợ | Có | Số tiền |
|---|---|---|---|---|---|
| 1 | Đặt hàng | Đơn đặt | Chưa ghi sổ | | |
| 2 | Hàng về kho tổng | Phiếu nhập `NMH1` | 1561 | 3312 | 10.000.000 |
| | Thuế đầu vào | | 1331 | 3312 | 800.000 |
| 3 | Trả tiền NCC | Phiếu chi | 3312 | 112 | 10.800.000 |
| 4 | Chuyển 60 hộp xuống shop | Chuyển kho: xuất | 1579 | 1561 | Theo đơn giá, cuối tháng |
| | Shop nhận | Chuyển kho: nhận | 1561 | 1579 | Như trên |
| 5 | Bán 50 hộp | Phiếu bán `XBA` | 1311 | 51111 | 6.000.000 |
| | Thuế đầu ra | | 1311 | 33311 | 480.000 |
| 6 | Khách trả tiền | Phiếu thu | 1111 | 1311 | 6.480.000 |
| 7 | Cuối tháng, tính giá vốn | Phiếu giá vốn tháng | 6321 | 1561 | 4.545.455 |

Kết quả:

- Đơn giá: 10.000.000 ÷ 110 = 90.909đ.
- Giá vốn: 50 × 90.909 = 4.545.455đ.
- Lãi gộp: 6.000.000 − 4.545.455 = **1.454.545đ**.
- Tồn cuối: 60 hộp, 5.454.545đ. Kiểm tra: 4.545.455 + 5.454.545 = 10.000.000.

### Các tình huống khác

| Tình huống | Nợ | Có | Ghi chú |
|---|---|---|---|
| Khách trả hàng, tiền hàng | 52131 | 1311 | Lý do `NTH1` |
| Khách trả hàng, giá vốn | 1561 | 6321 | Theo đơn giá của tháng |
| Trả hàng NCC | 3312 | 1561, 1331 | Lý do `XTR1` |
| Xuất bán chi nhánh khác | 13681 | 51116, 33311 | Lý do `XCN` |
| Giá vốn xuất chi nhánh | 6326 | 1561 | Bằng giá bán, ghi ngay |
| Chuyển giữa hai chi nhánh | 13681 | 1561 | Khác đơn vị hạch toán |
| Nhận quà không hoá đơn | 1561 | 71153 | Lý do `NQUA` |
| Xuất quà tặng khách | 64184 | 1561 | Lý do `XQUA` |
| Kiểm kê thiếu | Theo lý do | 1561 | Theo đơn giá của tháng |

### Vì sao giá vốn ghi cuối tháng

Đơn giá chỉ biết khi có đủ hàng nhập của tháng. Vì vậy phiếu bán không có dòng giá vốn. Cuối tháng phần mềm sinh **một phiếu giá vốn cho mỗi chi nhánh**, liệt kê từng mã. Tính lại thì đảo bút toán cũ, ghi bút toán mới.

Thứ tự cuối tháng: khoá nhận chứng từ → tính giá vốn → khấu hao, phân bổ → kết chuyển lãi lỗ → khoá sổ.

### Phần mềm ghi gì khi có một chứng từ

| Dữ liệu | Bảng | Dùng để |
|---|---|---|
| Chứng từ gốc, theo phiên bản | `accounting_events` | Lưu nguyên bản, sửa là phiên bản mới |
| Hàng vào, ra | `inventory_movements` | Nhập xuất tồn, đầu vào giá vốn |
| Đơn giá tháng | `inventory_costs` | Kết quả giá vốn |
| Bút toán | `ledger_entries`, `ledger_lines` | Sổ cái, chỉ thêm, không sửa |
| Bán hàng | `sales_lines` | Báo cáo bán |
| Công nợ | `debt_items` | Theo dõi khoản phải thu, trả |
| Hoá đơn | `tax_invoices` | Bảng kê thuế |

## 9. Bán hàng và tách bill

**[Đang chạy]** Một lần bán có thể sinh hai phiếu:

```
Khách mua: 2 hộp sữa dưới 24 tháng + 1 bình nước tặng 0đ

   Bill chính: 2 hộp sữa        ──►  lên hoá đơn, sang thuế
   Bill tách:  1 bình nước 0đ   ──►  không hoá đơn, chỉ ở nội bộ
```

Vì sao tách **[Đang chạy]**: luật không cho khuyến mại nhóm sữa này, nên quà phải nằm ở phiếu riêng. Câu chuyện thuế của phần này cần kế toán trưởng hoặc tư vấn thuế xác nhận.

| Luật | Vì sao |
|---|---|
| Hàng đã tách không được đưa ngược lên bill chính | Tránh lách qua lại khi gửi thuế |
| Chỉ dòng 0đ mới được tách | Dòng có thu tiền phải lên hoá đơn |
| Bill chính luôn được lưu, kể cả 0 dòng | Bill tách trỏ về bill cha; không có dòng thì không gửi thuế |

Hàng tách **vẫn xuất kho thật ở nội bộ**, nên có giá vốn ở nội bộ, còn thuế không thấy. Do đó tồn hai bên lệch nhau có lý do.

Ngoài mã đuôi `Z`, quầy còn tự tách quà 0đ của đơn có sữa dưới 24 tháng. Vì vậy nếu bỏ đuôi `Z`, phải giữ đủ cả hai điều kiện.

**[Đang chạy]** Từ 09/11/2026 tách bill không còn đọc đuôi `Z`: mọi mặt hàng có ô **Gửi lên thuế** (`products.send_to_tax`, mặc định bật; biến thể Nội bộ luôn tắt). Tắt thì dòng 0đ tách sang bill Z, dòng có tiền ở lại bill chính nhưng bị loại khỏi hoá đơn. Quà 0đ của đơn sữa dưới 24 tháng vẫn tự tách như trước.

**[Quy định nội bộ, 10/11/2026]** "Không gửi thuế" gắn vào **mã**, không gắn vào chương trình: mỗi mã đi trọn một đường thuế để tồn thuế và giá vốn không lệch. Mã đã có nhập xuất thì không đổi được ô này. Quà phải là mã không gửi thuế; hết quà thì lập phiếu chuyển đổi mã chính → mã quà (chờ kế toán chốt cách ghi sổ thuế).

**[Đang chạy]** Dấu `is_under_24m` đang dành cho sữa, còn các mã `Z` đều chưa bật dấu này. Nên `Z` không thể chỉ đổi thành dấu "dưới 24 tháng"; cần tách hai ý: hàng này thuộc nhóm sữa dưới 24 tháng, và hàng này có được sang thuế không. **[Góp ý]** đồng ý với hướng thêm dấu "có sang thuế hay không" như một lớp giảm rủi ro.

## 10. Hai dữ liệu: nội bộ và thuế

**[Họp]** Dữ liệu đi từ nội bộ sang thuế, và cấu trúc tổ chức hai bên khác nhau:

| | Nội bộ | Thuế |
|---|---|---|
| Mục đích | Quản trị | Kê khai |
| Tổ chức | 8 chi nhánh, theo khu vực và logistics | Theo mã số thuế, địa lý, khoảng 37–39 đơn vị |
| Ví dụ Hoà Bình | Do Hà Nội phụ trách | Thuộc mã số thuế Phú Thọ |
| Mã hàng | Mã chi tiết | `K`, `M`, `T` về mã thường |

Vì vậy cùng một lô có thể có giá vốn khác nhau. Ví dụ 100 hộp mua, 10 hộp tặng cho người tiêu dùng **[Suy luận]**:

| | Nội bộ | Thuế, nếu hoá đơn ghi 110 hộp |
|---|---|---|
| Ghi nhận | Mã thường 100 hộp, 10 triệu; mã `M` 10 hộp, 0đ | Mã thường 110 hộp, 10 triệu |
| Đơn giá | 100.000đ và 0đ | 90.909đ |

### Khâu nào sang thuế

Nội bộ giữ cả hàng có và không có hoá đơn đầu vào, qua mua, chuyển kho, bán và giá vốn. Thuế theo cùng các khâu đó nhưng chỉ giữ phần có hoá đơn. **[Góp ý]**

| Trường hợp | Nội bộ | Thuế | Căn cứ |
|---|---|---|---|
| Hàng mua có hoá đơn | Mã đúng | Sang | **[Góp ý]** |
| `K`, `M`, `T` có trên hoá đơn | Mã có đuôi | Quy về mã thường | **[Quy định]** |
| Kẹp quà, combo | Mã riêng | Theo hoá đơn: mã thường hoặc mã riêng | **[Quy định]** |
| Hàng tặng ngoài, không hoá đơn | Có | **Loại**, kể cả khâu chuyển kho của mã đó | **[Góp ý]** |
| Bill tách của sữa dưới 24 tháng | Có | Không sang | **[Đang chạy]** |

Điểm cần phân biệt: hàng tặng **có trên hoá đơn** thì quy về mã thường, hàng tặng **ngoài hoá đơn** thì loại hẳn. Cùng là hàng tặng nhưng hai đường khác nhau.

### Vì sao tách mã giúp tồn hai bên khớp

Mua 100 hộp có hoá đơn, được tặng thêm 10 hộp ngoài hoá đơn, rồi quầy xuất đi 105 hộp. **[Suy luận]**

| Cách ghi | Xuất đi | Tồn nội bộ | Tồn thuế |
|---|---|---|---|
| Chung một mã | 105 hộp cùng mã, đều lên hoá đơn | 110 − 105 = 5 | 100 − 105 = **−5**, âm kho |
| Tách mã | 100 hộp mã thường lên hoá đơn; 5 hộp mã tặng ngoài hoá đơn | Mã thường 0, mã tặng 5 | Mã thường 0, không âm |

Đây là lý do thật của mã biến thể: **một mã mà hai bên có số nhập khác nhau thì tồn sẽ lệch**. **[Góp ý]** Vì vậy phương án thay thế phải giữ được việc này. Nó cũng có giới hạn: quầy phải phân biệt được hộp nào thuộc mã nào, nếu không thì tách mã trên phần mềm cũng không cứu được.

### Điểm phân tách: không nhập lại từ đầu

**[Góp ý]** Yêu cầu là: nghiệp vụ nào đồng bộ được thì đồng bộ hết sang thuế; nội bộ phải tách được nghiệp vụ để chuyển tự động, kế toán không làm hai lần. Hướng đánh dấu "có sang thuế không" được đồng tình. Câu khó nhất: **nội bộ hạch toán một kiểu, thuế hạch toán kiểu khác**, ví dụ công nợ nội bộ 3318, sang thuế 3312.

Khi một chứng từ sang thuế, phải trả lời được ba câu **[Suy luận]**:

| Câu hỏi | Lấy từ đâu |
|---|---|
| Dòng này có sang không? | Chứng từ có hoá đơn không, dòng và mặt hàng có dấu loại trừ không |
| Sang với mã nào? | Mã con quy về mã cha nếu có quy định, kẹp và combo theo hoá đơn |
| Hạch toán tài khoản nào? | Bảng đổi tài khoản nội bộ → thuế, theo từng trường hợp |

Không xác định được thì đưa vào chờ xử lý, có lý do rõ ràng. Không đoán, không bỏ qua trong im lặng.

**Hiện trạng ERP [Đang chạy]:**

| Việc | Đã có | Chưa có |
|---|---|---|
| Sang thuế | Bản cài riêng; nhận phiếu bán, hoàn có số hoá đơn; loại phiếu `internalOnly` | Phiếu mua, trả NCC, chuyển kho; trong khi công thức giá vốn thuế cần phiếu mua và trả NCC |
| Đánh dấu | `is_under_24m` trên mặt hàng, `internalOnly` trên phiếu | Dấu "có sang thuế không" theo mặt hàng và theo dòng |
| Quy mã | Quan hệ cha – con (2.776 mã đã gắn cha) | Quy mã con về cha khi sang thuế |
| Tài khoản | | Bảng đổi tài khoản nội bộ → thuế |

## 11. Vì sao bỏ đuôi, và đi về đâu

**[Họp]** `K`, `M`, `Q` chỉ là giải pháp tạm thời. Một sản phẩm ra nhiều mã làm phần mềm nặng, bán hàng mệt, ảnh hưởng tồn max. Khi thuế kiểm tra phải giải thích mã Z, mã B. Yêu cầu là dùng cha – con và không dùng mã để xử lý khuyến mại nữa.

**Gốc của vấn đề:** một chữ cái đang gánh nhiều nghĩa. Bỏ đuôi không phải bỏ ý nghĩa, mà chuyển mỗi ý nghĩa về đúng chỗ. Phương án chi tiết: tài liệu 12.

| Ý nghĩa | Hiện nằm ở | Chuyển về |
|---|---|---|
| Đây là hàng gì | 9 số đầu | Mã số, cha – con |
| Có tính vào vốn không | Đuôi `K`, `M` | Loại dòng phiếu nhập |
| Thuộc chương trình nào | Đuôi | Chương trình gắn trên dòng |
| Có tách bill không | Đuôi `Z` | Ô **Gửi lên thuế** trên mặt hàng (đã làm 09/11/2026) |
| Có sang thuế không | Đuôi `Z`, hoặc do người nhập biết | Ô **Gửi lên thuế** trên mặt hàng (đã làm); dòng phiếu sau |
| Bán tách được không | Đuôi `Q`, nhóm 8 | Thuộc tính của bộ hàng |
| Thuộc loại gì | Đầu `Q`, `TS`, `CC`, 8 số đầu `19` | Ô loại hàng |

### Mã số cha – con

**Hướng đang đi:** mọi mã toàn số, sản phẩm con là biến thể của sản phẩm cha. Một cha có thể có nhiều con, ví dụ 20 con, và sau này có thể lên rất nhiều mã (màu sắc và các biến thể khác), nên cách đánh số phải chịu được quy mô đó. Hiện chưa nhiều biến thể **[Góp ý]**, nên chưa cần làm phức tạp ngay.

Ví dụ đang bàn, số `45` chỉ để minh hoạ:

```
Q05940063    quà, mã cha      →   05940063
Q05940063Z   quà có Z         →   0594006345   con của 05940063, gắn dấu cho biết là hàng gì
```

Đề xuất của team **[Suy luận]**:

- **Hai số con chỉ để phân biệt, không mang nghĩa.** Nghĩa nằm ở dấu và loại hàng. Nếu lại quy ước `45` nghĩa là `Z` thì chỉ là đổi chữ thành số, vẫn còn vấn đề cũ.
- **Mã luôn lưu dạng chữ.** Mã bắt đầu bằng `0` sẽ mất số `0` nếu Excel đọc thành số. Hoặc chọn đầu ngành khác cho quà để tránh hẳn.
- **Chiều dài phải phân biệt được cha và con.** Hiện đã có mã 8 số đầu `19` là vật tư, 9 số là hàng thường, nên cần quy tắc rõ trước khi sinh mã con.
- **Thêm cấp 4 cho nhóm hàng** nếu cần phân loại chi tiết hơn. Việc này phục vụ báo cáo, không thay được dấu nghiệp vụ.

### Khi nào cần mã con

Họp yêu cầu không dùng mã để xử lý khuyến mại **[Họp]**, còn thực tế vẫn quản lý theo mã **[Góp ý]**. Hai ý này không mâu thuẫn nếu có tiêu chí **[Suy luận]**:

> Sinh mã con khi cần **tồn riêng, giá riêng, hoặc khác đường sang thuế**. Không cần những thứ đó thì ghi bằng dòng phiếu và chương trình.

| Biến thể | Cần tách tồn, giá? | Đề xuất |
|---|---|---|
| `K` | Không, cố ý trộn giá | Không sinh mã mới, dùng dòng phiếu chia giá |
| `T` | Có, chương trình và giá khác | Mã con |
| `M` | Có, 0đ, tồn riêng | Mã con, hoặc sổ quà trên cùng mã; cần chốt |
| `Z` | Có, không sang thuế | Mã con có dấu |
| `*Q`, combo | Có, là bộ riêng | Mã con hoặc bộ hàng |
| `Q*` | Là sản phẩm riêng | Mã cha riêng, không phải biến thể |

### Hai việc khác nhau, đừng lẫn

| | Mã cũ đã có | Từ nay về sau |
|---|---|---|
| Làm gì | **Đổi mã**, giữ lịch sử | Khuyến mại **không sinh mã mới** |
| Giá vốn | Không đổi | Chia giá nhập cùng mã, đơn giá **trộn chung** |
| Theo dõi lợi ích khuyến mại | Theo mã con | Theo chương trình, cần báo cáo riêng |

Vì sao đổi mã không làm sai giá vốn: công thức khoá theo `item_id`, không theo chữ trên mã.

| | Đổi mã | Gộp mã |
|---|---|---|
| Nghĩa | Một mặt hàng đổi số hiệu | Hai mặt hàng thành một |
| Lịch sử | Giữ, tra lại được | Giữ, nhưng về một mặt hàng |
| Tồn, giá vốn riêng | Giữ nguyên | Mất phần riêng |
| Dùng khi | Chuyển mã cũ sang số | Hai mã thật sự trùng hàng |

**Giới hạn phải nói rõ:** đổi mã chỉ hết chuyện giải trình đuôi chữ. Hàng xuất không có hoá đơn thì thuế vẫn có thể hỏi.

## 12. Được tuỳ biến gì

**Câu hỏi kiểm tra:** thay đổi có làm đổi đơn giá vốn, số tiền trên sổ, số liệu sang thuế, hoặc lịch sử đã lưu không? Không đổi thì team tự thiết kế được. Có đổi thì cần bộ phận kế toán kiểm tra số trước khi dùng thật.

| Không tự đổi | Tự làm được |
|---|---|
| Công thức, phạm vi tính giá vốn | Giao diện, báo cáo, cách lọc, cách gom |
| Sổ cái chỉ thêm, sửa bằng bút toán đảo | Dạng mã, cách sinh mã, loại hàng, nhóm cấp 4 |
| Mã, tên đã lưu trên chứng từ | Công thức đặt hàng, cảnh báo |
| Dòng có thu tiền phải lên hoá đơn | Tự động hoá thao tác, giữ nguyên định khoản |

## 13. Việc còn phải làm rõ

Gom theo người xử lý. Tra văn bản và dữ liệu trước. Việc cần kế toán thì đưa kèm phương án và số liệu đã kiểm tra, không gửi bảng câu hỏi.

### Team tự chốt

1. Quy tắc số của mã con: bao nhiêu số, phân biệt cha và con thế nào, xử lý số `0` đầu.
2. Tiêu chí sinh mã con, và `M` là mã con hay sổ quà.
3. Danh sách loại hàng, và có cần nhóm cấp 4 không.
4. Cách chuyển 1.073 mã `Q…Z` chưa có mã cha, và 3.486 mã không theo quy tắc.
5. Thiết kế điểm phân tách: dấu sang thuế, quy mã, bảng đổi tài khoản.

### Cần số liệu hoặc xác nhận của bộ phận kế toán

Theo thứ tự ảnh hưởng thiết kế:

1. Từ nay chia giá nhập cùng mã, đơn giá trộn chung, có chấp nhận không? Cần báo cáo gì về khuyến mại?
2. Bảng đổi tài khoản nội bộ → thuế gồm những cặp nào, ngoài ví dụ 3318 → 3312?
3. Bản thuế tính giá vốn theo đơn vị nào: 8 chi nhánh hay theo mã số thuế?
4. Cây tổ chức nội bộ theo 8 chi nhánh, HO để ở đâu?
5. Ba kiểu thưởng, kiểu nào vào giá vốn chi nhánh?
6. Công ty mua, chi nhánh nhận hàng và hoá đơn: giá vốn ở đâu?
7. Quà sữa dưới 24 tháng xử lý thuế thế nào?
8. Hàng tặng khách hạch toán 632, 6323 hay 641?
9. Cùng là mã `M`, vì sao có mã `NHT01`, có mã `NHT02`?
10. Nguyên tắc tạo kho.
