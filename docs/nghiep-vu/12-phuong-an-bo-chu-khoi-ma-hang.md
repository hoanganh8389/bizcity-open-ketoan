# 12. Phương án bỏ chữ khỏi mã hàng

Đề xuất của team công nghệ. Tiến độ làm theo phương án này: tài liệu 13. Nền nghiệp vụ xem ở tài liệu 11.

## 1. Tóm tắt phương án

**Mục tiêu cuối:** mọi mã hàng chỉ gồm chữ số. Không còn `K`, `M`, `Q`, `T`, `Z` trên mã.

**Điểm mấu chốt:** mỗi chữ cái đang gánh một việc quản trị. Bỏ chữ mà không chuyển việc đó đi nơi khác thì sẽ mất quản trị, và với `Z` là có rủi ro thuế. Vì vậy mỗi ý nghĩa được chuyển về đúng một chỗ:

| Câu hỏi | Trước đây nhìn vào | Sau này nhìn vào |
|---|---|---|
| Đây là món gì? | Mã có chữ | **Mã số** |
| Nó thuộc sản phẩm nào? | Phần mã trước chữ | **Mã cha** |
| Nó là loại hàng gì? | Đầu `Q`, đầu mã | **Ô Loại hàng** |
| Nó là biến thể gì, xử lý ra sao? | Chữ cuối | **Ô Biến thể**, một lựa chọn tương đương đuôi cũ |
| Quà của chương trình có tách khỏi thuế không? | Thêm hàng `Z` vào đơn | **Cài đặt chương trình** |

Ai quen đuôi cũ vẫn hiểu ngay: chọn Biến thể `Hàng nội bộ` là hiểu như mã `Z` trước đây. Đuôi cũ vẫn hiện làm chú thích trong giai đoạn chuyển đổi.

**Năm nguyên tắc để bảo vệ phương án:**

1. **Mọi thứ bám theo `item_id` xuyên suốt.** Mã chỉ là tên gọi, đổi được. Mã cha, Loại hàng, Biến thể, tồn, giá vốn, lịch sử đều gắn với `item_id`, không gắn với chuỗi mã.
2. **Không đổi cách tính tiền.** Giá vốn, định khoản, hoá đơn giữ nguyên. Chỉ đổi cách nhận diện.
3. **Hệ thống đọc ô, không đọc chữ trên mã.** Luật thuế không còn phụ thuộc vào việc ai gõ đúng một chữ cái.
4. **`Z` vẫn tách 100% khỏi thuế,** chỉ khác là căn cứ vào ô thay vì chữ.
5. **Làm song song và đối chiếu trước khi đổi mã.** Đổi mã là bước cuối, không phải bước đầu.

## 2. Mỗi đuôi đang làm việc gì

| Đuôi cũ | Mục đích quản trị | Vì sao không gộp thẳng vào mã thường | Sang thuế |
|---|---|---|---|
| `K` | Hàng tặng được chia vào giá trị hàng bán | Lô chia giá có đơn giá riêng | Về mã thường |
| `M` | Hàng tặng người tiêu dùng, 0 đồng | Tồn riêng, không bán | Về mã thường nếu có trên hoá đơn |
| `T` | Hàng theo chương trình: túi niêm phong, mua thùng tặng lì xì | Chương trình khác, giá khác | Về mã thường |
| `*Q` | Hàng bán bó kèm quà, không được tách | Là một bộ riêng | Theo hoá đơn |
| `Q*` | Quà, vật phẩm | Không phải hàng bán | Theo hoá đơn, chứng từ |
| `Z` | Quà và hàng của nhóm sữa dưới 24 tháng cần tách | **Tách hẳn khỏi thuế** để không tính vào tồn thuế, giảm rủi ro | **Không bao giờ** |
| `B` | Hàng sắp hết hạn cần bán nhanh, giá rẻ hơn, để shop kiểm đếm tay nhanh | Lúc tạo mã chưa theo dõi được hạn dùng; về sau có thể chuyển sang theo dõi lô và chương trình giá | Chưa xác định, xử lý khi tới lượt |
| `C`, `D` | Trường hợp phát sinh thêm, ít gặp | Khi nào đụng đến mới xử lý | Chưa xác định |

`Z` khác các đuôi còn lại: các đuôi khác chủ yếu phục vụ quản trị nội bộ, còn `Z` là ranh giới với thuế. Vì vậy `Z` phải được thiết kế chặt nhất.

## 3. Thiết kế mã số

### Mã cha

| Loại | Mã cũ | Mã mới |
|---|---|---|
| Hàng thường | `110594012` | Giữ nguyên `110594012` |
| Quà | `Q05940063` | `05940063`, bỏ `Q`; lưu ý số `0` đầu ở dưới |
| Vật tư, công cụ | `19060021` | Giữ nguyên |

Giữ cấu trúc ngành, nhãn, nhóm để kế toán vẫn đọc được mã như hiện nay.

### Mã con

**Mã con = mã cha + 2 số thứ tự, đặt ở cuối.** Không đặt ở đầu để không đụng vào phần ngành, nhãn, nhóm mà mã hàng được sinh theo.

```
110594012     Sữa, mã cha
11059401201   biến thể thứ nhất
11059401202   biến thể thứ hai

05940063      Quà, mã cha
0594006301    biến thể của quà, trước đây có thể là Q05940063Z
```

Ba quy tắc:

- **Hai số cuối chỉ để phân biệt, không mang nghĩa.** Không quy ước `45` nghĩa là `Z`. Nếu không, đây chỉ là đổi chữ thành số và phần mềm lại phải đọc mã để hiểu.
- **Quan hệ cha – con lưu trong dữ liệu, không suy từ mã.** Nhìn mã có thể đoán được, nhưng phần mềm chỉ tin ô Mã cha.
- **Mã luôn lưu dạng chữ, kể cả khi toàn số.** Nếu không, Excel sẽ làm `0594006301` thành `594006301`.

Hai số cuối đủ 99 con cho một cha, nhiều hơn nhu cầu hiện nay.

### Mã không theo quy tắc

**[Đang chạy]** Có 3.486 mã nằm ngoài quy tắc, như `230111M001`, `ComboBimboCal`, `TS101`, `CC110C`. Không tự động đổi nhóm này. Mỗi nhóm cần một danh sách đối chiếu riêng ở giai đoạn 4.

## 4. Hai ô thay cho chữ

**Loại hàng** trả lời "đây là thứ gì", áp cho mọi mã. **Biến thể** trả lời "đây là bản nào của sản phẩm", chỉ dùng khi cần tách.

### Ô Loại hàng

Hàng bán · Quà, vật phẩm · Vật tư tiêu hao · Vật dụng trưng bày · Công cụ dụng cụ · Tài sản · Dịch vụ, khác.

Mã con lấy Loại hàng theo mã cha. Ô này dùng `products.type_code` có sẵn, chỉ để lọc và báo cáo. Không dùng `item_classification.kind`, vì đổi bản chất hạch toán là sự việc kế toán phải có duyệt (`AGENTS.md`), còn ô này không được làm đổi định khoản.

### Ô Biến thể

Đây là danh mục có thể khai thêm, không viết cứng trong phần mềm. Mỗi biến thể khai sẵn cách xử lý, nên thêm một biến thể mới không cần sửa code. MH26 hiện đã có phần cấu hình tách hay gộp khi đặt hàng, nên sẽ mở rộng từ đó.

| Biến thể | Tương đương | Đặt hàng | Sang thuế | Mã khi sang thuế |
|---|---|---|---|---|
| Thường | Không đuôi | | Theo hoá đơn | Chính nó |
| Chia giá | `K` | Gộp vào cha | Theo hoá đơn | Mã cha |
| Khuyến mại | `M` | Gộp vào cha | Theo hoá đơn | Mã cha |
| Theo chương trình | `T` | Tách riêng | Theo hoá đơn | Mã cha |
| Kẹp quà | `*Q` | Tách riêng | Theo hoá đơn | Mã cha hoặc chính nó, theo hoá đơn |
| **Hàng nội bộ** | `Z` | Gộp vào cha | **Không bao giờ** | Không sang |

**Trường hợp hai nghĩa:** `Q05940063Z` trước đây vừa là quà vừa là `Z`. Nay là Loại hàng `Quà`, Biến thể `Hàng nội bộ`. Hai ô không chồng nghĩa lên nhau.

**Mã `Z` chưa có cha:** 1.073 mã `Q…Z` không có mã `Q…` cùng gốc. Đề xuất cho phép chọn Biến thể mà không cần cha, không sinh thêm mã cha rỗng chỉ để đủ cấu trúc.

### Sản phẩm con: màu sắc, kích cỡ ghi vào tên

Màu sắc, kích cỡ chỉ để mô tả, **người khai tự ghi vào tên sản phẩm con**. Không có ô Màu, ô Size. Chỉ ô Biến thể là bắt buộc, vì nó quyết định thuế và đặt hàng.

**Thao tác:** mở mã cha, bấm **Thêm sản phẩm con**, gõ tên, chọn Biến thể. Phần mềm tự làm:

- Tạo mặt hàng mới có `item_id` riêng, mã `cha + 01`, `cha + 02`.
- Lấy đơn vị tính, nhóm hàng, thuế, Loại hàng từ cha.
- Chặn trùng tên dưới cùng một cha.
- Cho nhập mã vạch riêng.

Mỗi con có tồn và giá vốn riêng theo `item_id`. Khi đặt hàng và báo cáo thì cộng về cha được.

**Họ mã chỉ có một cấp:** không tạo con của con, không nối đuôi chồng đuôi. Không làm cha phụ: thêm cấp khiến mã dài hơn, việc cộng dồn và quy mã phức tạp hơn mà chưa có nhu cầu thật. Bản kẹp quà muốn gắn với bản xanh L thì dùng ô mã quy về.

```
170521001     Bình sữa Pigeon                     mã cha
17052100101   Bình sữa Pigeon xanh L              Biến thể: Thường
17052100102   Bình sữa Pigeon đỏ L                Biến thể: Thường
17052100103   Bình sữa Pigeon xanh L kẹp quà      Biến thể: Kẹp quà (Q cũ)
17052100104   Bình sữa Pigeon đỏ L nội bộ         Biến thể: Nội bộ (Z cũ)
```

- **Ghi chú:** mỗi mã có ô ghi chú tự do để giải thích thêm, ví dụ vì sao tạo mã, thuộc chương trình nào. Chỉ dành cho người đọc, không luật nào được dựa vào ghi chú.
- **Mã cha chính là mã thường, nhập và bán bình thường,** có tồn và giá vốn riêng. Tồn cả họ = tồn mã cha + tồn các mã con. Mã con chỉ sinh cho bản cần tách, nên hàng thông thường không cần con Biến thể Thường. Chỉ khi một sản phẩm không có bản chung, ví dụ chỉ bán theo màu, người khai mới đánh dấu mã cha không bán.
- **Đầu `Q` và đuôi `Q` khác nhau:** Quà (`Q*`) là Loại hàng của cả họ. Kẹp quà (`*Q`) là một Biến thể.
- **Quy mã khi sang thuế:** mặc định về mã cha. Hàng có màu cần giữ riêng thì chọn mã quy về bản Thường cùng màu.
- **Báo cáo theo màu, size:** tạm thời tìm theo tên. Khi thật sự cần thống kê chính xác mới thêm ô thuộc tính, vẫn không phải đổi mã.
- **Quá 99 con:** phần mềm không đọc nghĩa từ mã nên con thứ 100 có thể dùng 3 số.

### Mã và tên của NCC

NCC hay đổi tên hàng trong khi vẫn dùng mã cũ. **Tên NCC không bao giờ là căn cứ tạo hàng mới, và không làm đổi tên hàng của mình.** Mỗi NCC có bảng riêng: mã NCC, tên NCC, đơn vị tính bên họ, trỏ tới `item_id`.

| Tình huống | Cách xử lý | Hiện trạng |
|---|---|---|
| Cùng mã, đổi tên | Vẫn nhận theo mã, lưu thêm tên mới làm lịch sử | **Đã có** ở MH22 |
| Đổi mã, cùng hàng | Gợi ý, người chọn một lần, các lần sau tự nhận | **Đã có** |
| Không có mã, tên đổi | Gợi ý, người chọn, không tự gán | **Đã có** |
| NCC dùng lại mã cũ cho hàng khác | Tên khác xa tên đã học thì dừng để người xác nhận | **Chưa có.** Hiện nhận theo mã luôn nên có thể nhận nhầm |

### Vì sao chọn ô Biến thể, không dùng nhóm cấp 4

Nhóm cấp 4 là cách được nghĩ tới và vẫn hữu ích, nhưng cho việc khác.

| Tiêu chí | Ô Biến thể | Nhóm cấp 4 |
|---|---|---|
| Luật thuế dựa vào | An toàn: chỉ đổi khi chủ định | Rủi ro: chuyển nhóm để làm báo cáo có thể đổi luôn việc sang thuế |
| Số lựa chọn | Một danh sách ngắn | Phải lặp lại dưới từng nhóm cấp 3 |
| Một mã mang hai ý | Được, kết hợp với Loại hàng | Mỗi mã chỉ ở một nhóm |
| Báo cáo theo nhóm | Lọc thêm được | Tốt, đúng thế mạnh |

**Kết luận:** nghiệp vụ dựa vào ô Biến thể. Nhóm cấp 4 chỉ thêm khi báo cáo cần phân loại sâu hơn, và không luật nào được đọc nó.

## 5. Luật sang thuế

**Mặc định: hàng khuyến mại sang thuế hết. Chỉ loại khi rơi vào một trong ba trường hợp:**

1. Mặt hàng có Biến thể nội bộ, trước đây là đuôi `Z`.
2. Quà cho sản phẩm dưới 24 tháng.
3. Chương trình khuyến mại được cấu hình cố ý loại quà ra. Tác dụng giống tặng hàng đuôi `Z`.

Thứ tự kiểm tra cho mỗi dòng bán. **[Đang chạy]** Các luật dưới đây đã có trong quầy bán, trừ phần cột "Sau khi đổi" và trường hợp 3.

| # | Trường hợp | Kết quả | Hiện nhận diện bằng | Sau khi đổi |
|---|---|---|---|---|
| 1 | Hàng có Biến thể nội bộ | Bill Z, không sang thuế | Chữ `Z` cuối mã | Ô Biến thể |
| 2 | Quà 0đ đi kèm sữa dưới 24 tháng | Bill Z, không sang thuế | Dòng cha có dấu dưới 24 tháng | Giữ nguyên |
| 3 | Quà 0đ theo cả đơn, đơn có sữa dưới 24 tháng | Loại khỏi hoá đơn | Phạm vi quà và dấu dưới 24 tháng | Giữ nguyên |
| 4 | Quà 0đ đi kèm hàng từ 24 tháng trở lên | **Lên hoá đơn 0 đồng, sang thuế** | Dòng cha không có dấu | Giữ nguyên |
| 5 | Dòng có thu tiền | Bắt buộc lên hoá đơn, không được tách | Giá lớn hơn 0 | Giữ nguyên |

Hai luật giữ nguyên: bill Z không được kéo ngược lên bill chính, và bill chính vẫn được lưu kể cả khi 0 dòng.

**Ví dụ:**

| Đơn | Sữa | Quà | Hoá đơn | Bill Z |
|---|---|---|---|---|
| A | Sữa dưới 24 tháng | Bình nước 0đ | Sữa | Bình nước |
| B | Sữa trên 24 tháng | Bình nước 0đ | Sữa + bình nước 0đ | |
| C | Sữa trên 24 tháng | Mã Biến thể nội bộ | Sữa | Mã nội bộ |

Đơn C cho thấy vì sao vẫn cần Biến thể nội bộ: có hàng phải đứng ngoài thuế bất kể đi với sữa nào.

### Cài đặt tách quà của chương trình

Trước đây muốn loại quà khỏi thuế thường phải thêm hàng đuôi `Z` vào. Nay đưa thành một lựa chọn lúc cấu hình chương trình khuyến mại:

> **Quà của chương trình này:** Sang thuế (mặc định) | Loại khỏi thuế

- **Sang thuế:** chạy theo bảng trên. Quà của sữa dưới 24 tháng vẫn tự bị loại, không cần chọn.
- **Loại khỏi thuế:** người cấu hình cố ý chọn, ví dụ combo đi sinh hoặc chương trình có chủ ý không cho quà lên thuế. Quà của chương trình vào bill Z, dù đi với sữa nào. Vẫn chỉ áp cho dòng 0đ.

**[Đang chạy]** Chính sách bán hàng hiện đã tách được quà từ các dòng khách mua và lưu quà thuộc dòng nào. Team chưa tìm thấy ô "loại khỏi thuế" ở cấp chương trình, nên đây là phần phải làm thêm.

**Hàng tặng không có hoá đơn đầu vào:** vì mặc định là sang thuế, loại hàng này phải được khai Biến thể nội bộ, hoặc chương trình phải chọn loại. Nếu quên, quà sẽ lên hoá đơn bán trong khi bên thuế không có đầu vào, dẫn tới âm tồn thuế.

### Sang dữ liệu thuế

**Danh mục chỉ có một nguồn.** Nội bộ và thuế dùng chung một danh mục: cùng mặt hàng, cùng `item_id`, cùng mã. Nội bộ là nơi khai báo, bản thuế nhận về và không tự tạo mã. Hàng Biến thể nội bộ vẫn có trong danh mục bản thuế nhưng không có phát sinh. Cơ chế đồng bộ này phải kiểm tra lại và làm cùng phần sang thuế.

Sau khi tách ở quầy, phía sau chỉ cần theo một luật: **hàng Biến thể nội bộ không bao giờ đi vào sổ thuế, ở mọi khâu**: nhập, chuyển kho, bán, trả hàng. Đây chính là mục đích tránh tồn thuế sai. Phần tự chuyển phiếu mua và chuyển kho sang thuế xem mục 10 tài liệu 11, chưa có và là phần việc riêng.

## 6. Ví dụ đi hết một vòng

Bình giữ nhiệt NCC tặng, không hoá đơn, dùng cho chương trình sữa dưới 24 tháng.

| Khâu | Trước đây | Sau này | Thuế |
|---|---|---|---|
| Khai báo | `Q05940063Z` | `0594006301`, Loại `Quà`, Biến thể `Hàng nội bộ` | |
| Nhập kho | Nhập mã có `Z` | Nhập mã số, đọc từ ô | Không sang |
| Chuyển kho | Chuyển mã có `Z` | Chuyển mã số | Không sang |
| Bán | Quầy thấy chữ `Z`, đưa xuống bill Z | Quầy đọc ô, đưa xuống bill Z | Không sang |
| Trả hàng | Không lập hoá đơn điều chỉnh | Như cũ | Không sang |
| Giá vốn | Tính theo `item_id` | Như cũ | |
| Tồn | Nội bộ có | Như cũ | Không có |

Mọi cột kết quả giống hệt nhau. Đó là điều phải chứng minh được khi nghiệm thu.

## 7. Phạm vi phải sửa

**[Đang chạy]** Đã rà trong mã nguồn, chưa phải danh sách cuối:

| Nơi | Đang làm gì | Phải đổi |
|---|---|---|
| Quầy bán: xử lý đơn, tách bill, hoàn hàng, báo bill, nhận danh mục | 5 file nhận diện `Z` bằng chữ cuối mã | Đọc ô Biến thể |
| Danh mục hàng ERP (`ma-hang.ts`) | Danh sách đuôi, đặt tên, suy loại dòng từ đuôi | Đọc ô |
| Phiếu mua, form mặt hàng | Suy loại dòng và gợi ý từ đuôi | Đọc ô |
| Phân tích đặt hàng (MH02, MH26) | Gộp, tách theo đuôi | Đọc cấu hình Biến thể |
| Quét họ mã | Chỉ tự gắn mã 9 số + đuôi, trừ `T` | Chuyển theo danh sách đã duyệt |
| Kéo danh mục về website bán hàng | Khoá theo mã, chưa biết đổi mã | **Phải bổ sung** |
| Tồn, lô, sổ phía website bán hàng | Khoá theo mã | Phải có cách chuyển mã |

Dòng cuối là phần khó nhất. ERP đã có định danh `item_id` và chức năng đổi mã giữ lịch sử, còn website bán hàng vẫn đi theo mã. Đổi mã ở ERP mà chưa làm phần này thì quầy sẽ coi là hàng mới, mất nối với tồn cũ.

## 8. Các giai đoạn chuyển đổi

Mỗi giai đoạn đều dừng lại được, và phần mềm vẫn chạy bình thường nếu chỉ làm đến đó.

| GĐ | Làm gì | Mã trên giấy tờ | Điều kiện qua giai đoạn | Quay lui |
|---|---|---|---|---|
| 0 | Chốt khung, danh sách Loại hàng, Biến thể | Có chữ | Được duyệt | Không ảnh hưởng |
| 1 | Thêm 2 ô, tự điền từ đuôi cũ, người rà lại các mã lạ. Thêm chức năng **Thêm sản phẩm con** cho hàng mới. Thêm cảnh báo NCC dùng lại mã | Mã cũ có chữ, biến thể mới toàn số | 100% mã có đuôi chuẩn khớp ô | Bỏ qua ô |
| 2 | Chạy đối chiếu: luật đọc ô so với luật đọc chữ, trên đơn thật, chưa dùng kết quả | Có chữ | Không còn dòng lệch trong thời gian đã thống nhất | Tắt đối chiếu |
| 3 | Phần mềm chuyển sang đọc ô. Mã có chữ vẫn chạy | Có chữ | Tách bill, đặt hàng, thuế đúng như GĐ 2 | Bật lại luật cũ bằng công tắc |
| 4 | Làm phần website bán hàng biết đổi mã | Có chữ | Đổi thử có tồn, bán, hoàn đúng ở shop thử | Trả lại mã cũ |
| 5 | Mã mới sinh ra toàn số. Không tạo mã có chữ nữa | Trộn | Chạy ổn | Mở lại tạo mã |
| 6 | Đổi mã cũ theo từng đợt, nhóm ít rủi ro trước | Trộn | Đối chiếu tồn, giá vốn trước và sau mỗi đợt không đổi | Đổi lại mã |
| 7 | Mã cũ chỉ còn để tra cứu lịch sử | Toàn số | Hết mã có chữ đang dùng | |

**Cập nhật 09/11/2026:** quầy bán, hoá đơn, chính sách đã đọc ô Biến thể (tài liệu 14), nên bỏ khoá tạm: mọi biến thể là sản phẩm con mã số, đổi mã có đuôi sang mã số được, biến thể đi theo mặt hàng. Vẫn giữ: không gộp hàng Nội bộ với hàng có sang thuế.

**Đổi mã chứ không gộp mã:** `item_id` giữ nguyên, nên lịch sử, tồn và giá vốn đi theo. Gộp sẽ làm mất phần tồn và đơn giá riêng.

**Đề xuất thời điểm:** đổi mã đợt lớn vào đầu tháng, sau khi đã khoá sổ tháng trước. Khi đó đối chiếu số trước và sau dễ hơn.

## 9. Rủi ro và cách xử lý

| Rủi ro | Hậu quả | Cách xử lý |
|---|---|---|
| Chọn sai Biến thể ở mã có hàng tồn | Hàng nội bộ lọt sang thuế, hoặc ngược lại | Đổi Biến thể cần quyền riêng, có lý do, có lịch sử. Lên hoá đơn chặn thêm một lớp |
| Mã con thiếu Biến thể | Không biết có sang thuế không | Không có ô này thì không cho bán; không tự cho là được sang thuế |
| Quà trên 24 tháng lên hoá đơn nhưng đầu vào không có hoá đơn | **Tồn thuế âm** | Phải kiểm tra thực tế, xem mục 11 |
| Quầy không phân biệt được hộp thuộc mã nào | Tách mã trên phần mềm nhưng hàng thật lẫn | Trong danh mục ERP, chỉ 26 trên 489 mã `Z` đã gắn cha có mã vạch riêng. Cần rà mã vạch trước GĐ 6 |
| Mã con khác đơn vị tính với mã cha | Quy về cha khi sang thuế bị sai số | 243 trên 2.776 mã con đang khác đơn vị tính cha, phải rà và khai tỉ lệ |
| Mất số `0` đầu qua Excel | Không tìm thấy mã | Lưu dạng chữ, xuất Excel dạng chữ, kiểm tra độ dài khi nhập |
| Hệ thống khác vẫn gửi mã cũ | Sinh hàng mới | ERP đã nhận mã cũ theo bí danh. Phía website bán hàng phải làm tương tự |
| Gõ mã cũ không tìm thấy hàng | Ô tìm ở danh sách mặt hàng hiện chỉ tìm mã đang dùng, tuy lọc sổ bằng mã cũ vẫn ra | Bổ sung tìm theo mã cũ trước khi đổi mã ở GĐ 6 |
| Quen đọc đuôi | Thao tác chậm giai đoạn đầu | Hiện đuôi cũ làm chú thích đến hết GĐ 6 |

## 10. Câu hỏi dễ gặp khi bảo vệ dự án

**Bỏ đuôi thì thuế có hỏi nữa không?**
Hết phần phải giải thích mã có chữ. Nhưng hàng xuất không có hoá đơn thì thuế vẫn có thể hỏi, vì đó là nghiệp vụ chứ không phải cách đặt mã. Phương án này không nhằm giải quyết việc đó.

**Có làm thay đổi giá vốn không?**
Không. Giá vốn tính theo `item_id`, đơn vị và tháng, không đọc chữ trên mã. Mỗi đợt đổi mã đều đối chiếu số trước và sau.

**Sao không gộp tất cả về một mã cho đơn giản?**
Vì tồn hai bên sẽ lệch. Mua 100 hộp có hoá đơn, tặng 10 hộp ngoài hoá đơn: chung một mã thì nội bộ 110, thuế 100, và có thể âm tồn thuế. Xem mục 10 tài liệu 11.

**Vậy số lượng mã có giảm không?**
Có thể giảm ở phần khuyến mại về sau, vì không phải chương trình nào cũng cần mã riêng. Mục tiêu chính không phải giảm số mã, mà là mã không còn mang nghĩa nghiệp vụ.

**Chương trình khuyến mại mới có sinh mã mới không?**
Chỉ khi cần tồn riêng, giá riêng hoặc khác đường sang thuế. Không thì ghi trên dòng phiếu và chương trình.

**Lỡ đổi xong có lỗi thì sao?**
Các đợt nhỏ, mỗi đợt có đối chiếu và đổi lại được. Trước GĐ 6, các mã đang dùng không đổi gì cả.

**Vì sao không dùng nhóm cấp 4?**
Nhóm dùng để báo cáo và có thể được sắp xếp lại. Nếu luật thuế dựa vào nhóm, một lần sắp xếp có thể đổi luôn việc sang thuế.

**Sau này có hàng trăm nghìn biến thể màu sắc, kích cỡ thì sao?**
Mỗi sản phẩm con là một mặt hàng có `item_id` riêng, gõ tên và chọn Biến thể là xong, không phải sửa phần mềm. Team đã đo trên dữ liệu giả lập 1 triệu mã cha, mỗi cha 20 biến thể (21 triệu mặt hàng).

**NCC đổi tên hàng liên tục thì sao?**
Tên NCC chỉ là dữ liệu tham chiếu. Vẫn nhận theo mã NCC, hàng bên mình không đổi tên và không sinh mã mới.

**Bỏ đuôi rồi, sao hàng kẹp quà vẫn là một sản phẩm con?**
Vì nó vẫn là một bộ không được tách, có tồn và giá riêng, sang thuế theo hoá đơn. Cái bỏ đi là chữ trên mã và việc phần mềm đọc chữ đó, không phải bỏ quản lý riêng.

**Vậy một sản phẩm vẫn nhiều mã à? Khác gì trước?**
Mã đang có sẽ không giảm ngay. Khác ở ba điểm: mã đồng nhất toàn số; luật nằm ở ô chứ không nằm ở chữ; từ nay chỉ tạo mã con khi cần tồn riêng, giá riêng hoặc khác đường sang thuế. Chia giá nhập cùng mã nên không sinh mã nữa. Các cặp quà trùng có thể xem xét gộp sau khi đã chạy ổn. Bản thân số mã nhiều không còn là vấn đề của ERP: lõi đã đo trên dữ liệu giả lập 21 triệu mặt hàng, đặt hàng và báo cáo cộng về mã cha được. Phía website bán hàng và thao tác ở quầy thì chưa đo.

**Kế toán có phải học lại không?**
Cấu trúc ngành, nhãn, nhóm giữ nguyên. Chỉ thay chữ cuối bằng một ô chọn cùng ý nghĩa, và trong thời gian chuyển đổi vẫn thấy đuôi cũ.

**Lâu dài có còn phụ thuộc người nhớ quy tắc không?**
Ít hơn nhiều. Khai một lần ở mặt hàng, mọi khâu sau tự đọc. Mục tiêu là phần mềm giữ luật, không phải người giữ luật.

## 11. Việc cần chốt

### Team tự chốt

| # | Việc | Đề xuất |
|---|---|---|
| 1 | Mã con là mã cha + 2 số | Đồng ý như mục 3 |
| 2 | Mã quà bỏ `Q` để lại số `0` đầu, hay đổi đầu ngành khác | Bỏ `Q`, lưu dạng chữ; đổi đầu sẽ phá thói quen đọc mã |
| 3 | `M` là mã con hay sổ quà trên cùng mã | Mã con, để tách tồn rõ |
| 4 | Danh sách Loại hàng, Biến thể | Như mục 4 |
| 5 | Mã `Z` chưa có cha | Không sinh mã cha rỗng |

### Cần người có thẩm quyền quyết định

| # | Việc | Vì sao quan trọng |
|---|---|---|
| 1 | Lựa chọn "Loại khỏi thuế" ở cấp chương trình: ai được chọn, cần duyệt không | Tác động trực tiếp đến số liệu thuế |
| 2 | Quà trên 24 tháng lên hoá đơn 0 đồng mà đầu vào không có hoá đơn thì xử lý thế nào | Có thể gây âm tồn thuế; cần kiểm tra dữ liệu trước |
| 3 | Thời gian chạy đối chiếu ở GĐ 2 và shop thử ở GĐ 4 | Quyết định độ an toàn và tiến độ |

`B`, `C`, `D` (189 mã hàng) chưa xử lý trong đợt đầu: giữ nguyên mã, khi nào đụng đến mới làm.

Với các việc trên, team mang theo phương án và số liệu đã kiểm tra, không gửi bảng câu hỏi.
