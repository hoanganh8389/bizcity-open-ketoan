# 15. Quy tắc định khoản và chương trình có hạn mức

> Trạng thái (10/11/2026): **đã làm phần nền** — bảng quy tắc, đề xuất / duyệt, nghiệp vụ tự tạo, sơ đồ ACC92 chạy trên bộ định khoản thật, chương trình bán có hạn mức (BH12), API cho POS. Còn lại ở mục 10.
>
> Mã: migration `db/migrations/0096_quy_tac_dinh_khoan.sql`; lõi `packages/kernel/src/modules/posting/rule-table.ts` (chọn và áp quy tắc); API `apps/api/src/modules/posting-flow/posting-rules.service.ts`, `apps/api/src/modules/sale-programs/`; màn `apps/web/src/features/posting/ThietKeHachToanPage.tsx`, `apps/web/src/features/sale-programs/ChuongTrinhBanPage.tsx`; test `apps/api/test/quy-tac-dinh-khoan.test.ts`, `apps/api/test/chuong-trinh-ban.test.ts`.

## 1. Mục tiêu

- Định khoản **không fix cứng trong code**. Phát sinh nghiệp vụ mới, hay cấp trên quyết đổi cách hạch toán, thì chỉ sửa cấu hình.
- **Ít nơi khai báo**: không tạo bừa bãi nhóm, lý do, cấu hình ở từng mã hàng.
- Tài khoản **đi theo nghiệp vụ và chương trình**. Mặt hàng chỉ là mặt hàng.
- Bỏ việc sinh mã phụ (đuôi Z, B) cho hàng tặng và hàng giảm giá. Thay bằng **chương trình có thời gian và hạn mức**.

## 2. Chia vai: Cài đặt quyết, Lõi kiểm

| Tầng | Việc |
|---|---|
| **Cài đặt** (bảng quy tắc, ngoài lõi) | Quyết định phiếu ghi Nợ gì, Có gì, bao nhiêu tiền. Chốt bút toán. |
| **Lõi** (kernel) | Chỉ **kiểm tra rồi ghi sổ**. Không tự chọn tài khoản, không tra lại quy tắc. |

Lõi kiểm tra:

1. Tổng Nợ = tổng Có.
2. Tài khoản có trong hệ thống tài khoản và là tài khoản chi tiết.
3. Đủ thông tin đi kèm: đối tượng (131, 331…), kho (156x)…
4. Kỳ kế toán chưa khoá.
5. Mọi khoản tiền của phiếu (tiền hàng, thuế, chiết khấu, giá vốn, thanh toán…) đều đã được định khoản.

Không đạt thì **chặn và báo rõ**, ví dụ "Chưa có quy tắc cho khoản Thuế, nghiệp vụ Bán hàng, hình thức Chuyển khoản". Phiếu nằm ở cổng chờ để bổ sung quy tắc rồi chạy lại. **Lõi không tự đoán tài khoản để chữa cháy.**

Với lõi, phần tra tài khoản hiện nay (`packages/kernel/src/modules/posting/account-resolver.ts` và các file `rules/*.rule.ts`) chuyển thành không dùng nữa. Phần kiểm tra thì giữ lại và bổ sung cho đủ 5 điểm trên.

## 3. Bảng quy tắc định khoản

Chỉ có **một bảng**. Mỗi dòng là một quy tắc:

| Cột | Ý nghĩa |
|---|---|
| Nghiệp vụ | Bán hàng, Khách trả hàng, Nhập mua, Trả NCC, Chuyển kho, Xuất huỷ, Xuất dùng nội bộ… **Tự tạo thêm được.** |
| Sổ | Nội bộ / Thuế. Cùng nghiệp vụ, hai sổ có thể định khoản khác nhau. |
| Điều kiện | Hình thức thanh toán, loại thuế, loại mặt hàng, chương trình hoặc loại chương trình, kho đi, kho đến, đơn vị hạch toán đi/đến, đối tượng nội bộ hay bên ngoài, hàng tặng. **Ô để trống nghĩa là áp cho mọi trường hợp.** |
| Khoản tiền | Tiền hàng, Thuế, Chiết khấu, Giá vốn, Quà tặng, Tiền thanh toán… |
| Nợ / Có | Tài khoản |
| Ưu tiên | Chỉ dùng khi hai quy tắc khớp ngang nhau |
| Hiệu lực từ ngày | |
| Trạng thái | Đề xuất / Đang áp dụng / Ngừng |

**Cách chọn quy tắc** cho từng khoản tiền của từng dòng:

1. Lấy các quy tắc đang áp dụng, cùng nghiệp vụ và cùng sổ, có hiệu lực tại ngày chứng từ, và khớp mọi điều kiện đã điền.
2. Quy tắc **khớp nhiều điều kiện hơn** thắng (cụ thể hơn thắng chung chung).
3. Còn ngang nhau thì xét **Ưu tiên**. Vẫn ngang nhau thì đó là lỗi khai báo, và lỗi này **phải bị chặn lúc lưu quy tắc** chứ không để đến lúc lập phiếu.
4. Không có quy tắc nào khớp thì lõi chặn (mục 2).

Hệ quả:

- **Tài khoản ngầm định** chính là các quy tắc để trống điều kiện. Không còn là nơi khai báo riêng.
- **Chương trình** chỉ là thêm một điều kiện. Nó cụ thể hơn nên tự thắng ngầm định.
- **Loại mặt hàng** là ô cố định ở mã hàng (Hàng hoá, Dịch vụ, Vật tư, Bao bì, Ký gửi…). Kế toán không tự tạo thêm ô này như nhóm hạch toán trước đây.

Ví dụ:

| Nghiệp vụ | Điều kiện | Khoản | Nợ | Có |
|---|---|---|---|---|
| Bán hàng | (trống) | Tiền hàng | 1311 | 51111 |
| Bán hàng | (trống) | Thuế | 1311 | 33311 |
| Bán hàng | (trống) | Giá vốn | 6321 | 1561 |
| Bán hàng | Loại mặt hàng = Dịch vụ | Tiền hàng | 1311 | 5113 |
| Bán hàng | Loại chương trình = KM công ty | Quà tặng | 6421 | 1561 |
| Nhập mua | Loại chương trình = KM NCC | Quà tặng | 1561 | 711 |
| Chuyển kho | Cùng đơn vị hạch toán | Giá vốn | 1561 (kho đến) | 1561 (kho đi) |
| Chuyển kho | Khác đơn vị, bên đi | Giá vốn | 1368 | 1561 |
| Chuyển kho | Khác đơn vị, bên đến | Giá vốn | 1561 | 3368 |

(Số tài khoản ở bảng chỉ để minh hoạ. Số thật do kế toán khai.)

## 4. Chương trình

Áp dụng cho chính sách NCC (phía mua) và CTKM (phía bán).

- Mỗi chương trình chọn **Loại**: KM của NCC, KM của công ty, Xả hàng cận date… Mỗi loại đã có sẵn quy tắc do kế toán khai một lần và cấp trên duyệt. Người tạo chương trình **không phải gõ tài khoản**.
- Chương trình đặc biệt thì kế toán thêm quy tắc riêng có điều kiện "Chương trình = mã này".
- Chương trình hạch toán được ở **cấp dòng** (quà, giảm giá theo mã) và **cấp chứng từ / kỳ** (chiết khấu đơn, thưởng doanh số, chiết khấu thanh toán).
- **Một dòng dính nhiều chương trình**: tách số tiền theo từng chương trình, mỗi khoản đi theo quy tắc của chương trình đó. Ví dụ dòng giảm 5% của NCC và 3% của công ty thì ra 2 khoản. Mỗi món quà sinh ra từ đúng một chương trình. Cách áp đồng thời / áp riêng giữ như chính sách mua hiện có.

## 5. Thay đổi quy tắc

1. Kế toán sửa hoặc thêm quy tắc ở trạng thái **Đề xuất**, kèm lý do và ngày hiệu lực.
2. Hệ thống chạy thử trên **bộ phiếu mẫu cố định** và cho người duyệt thấy bút toán trước và sau khi đổi.
3. **Cấp trên duyệt** thì quy tắc chuyển sang Đang áp dụng từ ngày hiệu lực. Không duyệt thì quy tắc cũ giữ nguyên.
4. Mọi lần đổi đều lưu lịch sử: ai đề xuất, ai duyệt, lý do.
5. **Chứng từ đã duyệt chốt cứng bút toán**. Quy tắc mới không làm thay đổi chứng từ cũ. Trả hàng thì **đảo theo bút toán của phiếu gốc**, không tra lại quy tắc hôm nay.

**Đổi hàng loạt** (thuế suất, loại mặt hàng…): xuất mẫu Excel, sửa, nhập lại, xem trước chênh lệch rồi mới ghi. Bắt buộc có ngày hiệu lực và lý do. Không sửa ngược chứng từ đã duyệt.

## 6. Chương trình có hạn mức thay mã Z, B

Hàng tặng và hàng giảm giá thực chất vẫn là sản phẩm chính. Không sinh mã phụ nữa.

**Chương trình gồm:**

- Mã hàng chính
- Loại: Quà tặng / Giảm giá (cận date…)
- Thời gian bắt đầu – kết thúc
- Mức giảm, hoặc quà tặng
- **Hạn mức số lượng cho từng shop**

**Khi bán ở POS:**

- Còn hạn chương trình và shop còn hạn mức thì tự áp quà hoặc giá giảm, rồi trừ hạn mức.
- Hết hạn hoặc hết hạn mức thì bán giá thường.
- Hạn mức trừ **ngay lúc lưu bill**, có khoá chống hai máy cùng trừ món cuối cùng. POS mất mạng thì phải có cách xử lý trước (giữ hạn mức tạm ở máy, đồng bộ khi có mạng).
- Mỗi dòng bán **mang theo mã chương trình** sang ERP để định khoản theo mục 4.

**Báo cáo quản lý chương trình** (màn riêng): tính từ các dòng đã bán có mã chương trình.

- Theo chương trình, shop, mã hàng, khoảng ngày.
- Hiển thị: hạn mức, đã dùng, còn lại, giá trị quà / giá trị giảm.
- Dùng để đối soát với NCC và theo dõi quà sắp hết.

**Mã Z, B đang có:** giữ lại để xem lịch sử, từ nay không sinh mới. Tồn hiện có đổi về mã chính bằng một phiếu đổi mã.

**Cần kế toán chốt:**

- Quà NCC tặng nhập giá 0đ chung mã chính sẽ kéo giá vốn bình quân xuống. Muốn như vậy (quà giảm giá vốn), hay hạch toán thu nhập (711) theo quy tắc của loại chương trình.
- Hàng giảm giá cận date: hệ thống chỉ khống chế được số lượng bán giá giảm. Muốn biết đúng hộp nào cận date thì cần quản theo lô / hạn dùng (để sau).
- Dòng quà, dòng giảm giá xuất lên hoá đơn điện tử phải đúng quy định khuyến mại, thống nhất với cách đang xuất.

## 7. Những gì ẩn đi

Chỉ **ẩn**, không xoá dữ liệu, để cần thì bật lại:

- Menu và trang Nhóm hạch toán mặt hàng, tab "Đổi nhóm hạch toán hàng loạt".
- Cấu hình tài khoản ở mã hàng.
- Lý do theo màn trong luồng định khoản (phiếu thu/chi vẫn giữ lý do để ghi diễn giải).

Màn Thiết kế hạch toán (ACC92) giữ vai trò **xem trực quan**: một phiếu khớp những quy tắc nào và ra bút toán gì. Bấm ô nào thì sửa ngay ở quy tắc đó.

## 8. Rủi ro và cách xử lý

| Rủi ro | Cách xử lý |
|---|---|
| Linh hoạt nên dễ khai sai | Chạy thử trên bộ phiếu mẫu trước khi duyệt; lõi chặn khi thiếu hoặc lệch |
| Hai quy tắc khớp ngang nhau | Chặn lúc lưu quy tắc |
| Chương trình mới chờ duyệt làm kẹt việc | Đi theo quy tắc của loại chương trình đã duyệt sẵn |
| Sổ nội bộ và sổ thuế khác nhau | Cột Sổ trong bảng quy tắc |
| Chuyển sang cách mới làm sai số liệu | Chạy song song: chứng từ thật 1 tháng, cách cũ và cách mới cùng định khoản, so từng bút toán; khớp hết hoặc chỗ lệch giải thích được mới chuyển |
| Hai máy POS cùng trừ hạn mức | Khoá khi trừ, trừ lúc lưu bill |

## 9. Kế hoạch làm

| Đợt | Việc | Phạm vi |
|---|---|---|
| 0 | Duyệt tài liệu này với cấp trên và nhóm Lõi | — |
| 1 | Bảng quy tắc + màn khai báo quy tắc (có Nghiệp vụ tự tạo, cột Sổ, kiểm trùng lúc lưu). Chuyển dữ liệu cấu hình hiện có (ngầm định, nhóm hạch toán, lý do, loại thuế, hình thức thanh toán) thành quy tắc. Ô Loại mặt hàng. | ERP |
| 2 | Bộ tra quy tắc ngoài lõi, sinh bút toán đã chốt. **Chạy song song** với cách cũ, có màn so sánh chênh lệch. ACC92 chuyển sang đọc theo quy tắc. | ERP |
| 3 | Lõi bổ sung đủ 5 điểm kiểm tra, nhận bút toán đã chốt, bỏ tra tài khoản. Ẩn nhóm hạch toán, lý do khỏi luồng định khoản. | Nhóm Lõi + ERP |
| 4 | Đề xuất / duyệt / hiệu lực / lịch sử cho quy tắc; chạy thử trên bộ phiếu mẫu; đổi hàng loạt qua Excel. | ERP |
| 5 | Loại chương trình và hạch toán theo chương trình ở chính sách NCC, CTKM (cấp dòng và cấp chứng từ), tách tiền theo chương trình. | ERP |
| 6 | Chương trình có hạn mức theo shop thay mã Z, B: POS áp và trừ hạn mức, gửi mã chương trình sang ERP; màn báo cáo quản lý chương trình; phiếu đổi mã tồn Z, B cũ. | POS WordPress + ERP |

## 10. Đã làm và còn lại (10/11/2026)

**Cách gắn vào lõi đã chọn.** Luật định khoản cũ vẫn dựng bút toán, mỗi cặp Nợ / Có mang nhãn của dòng chứng từ (nghiệp vụ, lý do, hàng tặng, chương trình `policyRef`, hình thức, chiều chuyển kho). Bảng quy tắc áp lên từng cặp ngay trước khi ghi (`applyRulesToParts` trong `posting.service.ts`, và phiếu giá vốn tháng trong `costing.service.ts`). Ô tài khoản trống = giữ tài khoản tự tra. Nhờ vậy:

- chưa có quy tắc thì sổ y như cũ (đã chạy lại các bộ test định khoản, giá vốn, mua hàng: không lệch);
- chạy song song được ngay: màn ACC92 cho thấy tài khoản tự tra và tài khoản sau quy tắc cạnh nhau;
- khi mọi khoản đã có quy tắc, phần tra tài khoản cũ (lý do, nhóm hạch toán) chỉ còn là "ngầm định" và có thể gỡ dần.

| Đợt | Trạng thái |
|---|---|
| 1. Bảng quy tắc, nghiệp vụ tự tạo, loại hàng (dùng ô Loại hàng có sẵn của mặt hàng) | Xong |
| 2. Áp quy tắc trong lõi, chạy thử trên bộ định khoản thật, ACC92 vẽ theo quy tắc | Xong |
| 3. Lõi kiểm đủ 5 điểm | Lõi đã kiểm Nợ = Có, tài khoản chi tiết, đối tượng, kỳ khoá; còn thiếu điểm 5 (mọi khoản tiền phải có tài khoản) — hiện tài khoản tự tra luôn có giá trị nên chưa hở |
| 4. Đề xuất / duyệt / hiệu lực / lịch sử | Xong. **Đổi hàng loạt qua Excel: chưa làm** |
| 5. Hạch toán theo chương trình | Xong cho dòng (quà, giá vốn quà, tiền hàng theo chương trình). Chính sách mua có ô Loại chương trình. **Cấp chứng từ / kỳ (thưởng doanh số, CK thanh toán): chưa làm** |
| 6. Chương trình bán có hạn mức | ERP xong (khai báo, hạn mức, trừ / trả có khoá, báo cáo, đăng ký bản chính sách). **POS WordPress gọi API: chưa làm**; **phiếu đổi mã tồn Z / B cũ: chưa làm** |

Còn lại khác:

- Cột **Sổ** (chỉ sổ thuế) đã có, nhưng phần gửi sổ thuế chưa đọc quy tắc riêng sổ thuế.
- Giá trị quà NCC tặng (nhập giá 0) chưa có số tiền để ghi 711 — cần chốt với kế toán (mục 6).
- Thao tác thu hộ / trả hộ, chuyển tiền giữa chi nhánh chưa gắn nhãn quy tắc (vẫn tự tra).
- Kéo thả nối dây trên sơ đồ; sơ đồ cùng kiểu cho tính giá vốn, kết chuyển cuối kỳ.
- Quản lý theo lô (giữ tên hàng lúc mua cho kê khai, nhập trước xuất trước) — yêu cầu mới, nghiên cứu riêng.

**API cho POS** (`/api/v1/sale-programs`): `GET /active?branchCode=&skus=` lấy chương trình đang chạy còn hạn mức (kèm `policyRef` để gắn vào dòng bán); `POST /consume` trừ hạn mức theo dòng phiếu (gửi lại cùng phiếu không trừ thêm, hết hạn mức trả 409); `POST /release` trả hạn mức khi huỷ phiếu.
