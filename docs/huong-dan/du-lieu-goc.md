# Dữ liệu gốc (TI08)

Bộ danh mục và cấu hình định khoản chuẩn của công ty, lưu bằng tệp ngay trong phần mềm (thư mục `db/seeds`). Người dùng thêm, sửa, xoá danh mục thoải mái; khi danh mục bị sửa lộn xộn thì **quay về dữ liệu gốc** để làm sạch.

> <!-- [2026-11-10 11:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-53 --> Bản phát hành mang **dữ liệu giả lập** cho các danh mục có tên người / công ty / số tài khoản (cột "giả lập"). Công ty dùng danh mục thật của mình: chép bộ thật ra thư mục riêng và đặt `SEEDS_DIR` — cách làm ở `db/seeds/README.md`.

## Các bộ dữ liệu

Mọi màn danh mục đều có nút **Quay về dữ liệu gốc** ở đầu màn. Thứ tự dưới đây cũng là thứ tự khi bấm **Quay về toàn bộ** (bộ sau dùng mã của bộ trước):

| Bộ | Màn | Tệp | Số bản ghi gốc |
|---|---|---|---|
| Theo dõi chiều của tài khoản | ACC1 | `tai-khoan.csv` | hệ thống tài khoản |
| Tài khoản ngầm định | ACC41 | `tai-khoan-ngam-dinh.jsonl` | 12 |
| Loại thuế | ACC43 | `loai-thue.jsonl` | 51 |
| Danh mục khoản mục | ACC24 | `khoan-muc.jsonl` | 295 |
| Danh mục bộ phận (phòng ban chức năng: Bán hàng, Mua hàng, Kế toán, Kho vận…) | ACC26 | `bo-phan.jsonl` | 10 |
| Chi nhánh / cửa hàng | DM02 | `chi-nhanh.jsonl` | 32 (giả lập) |
| Lý do – tài khoản | ACC18 | `ly-do.jsonl` | 97 |
| Mặt hàng – tài khoản (nhóm hạch toán) | ACC17 | `nhom-hach-toan.jsonl` | 21 |
| **Nhóm hàng + mặt hàng (bộ mẫu, làm sạch)** — nút ở màn DM10, DM11 | DM10, DM11 | `mat-hang-mau.jsonl` | 8 mặt hàng, 2 cây nhóm |
| Phân loại hàng hoá (nhóm, ngành, nhãn hàng) | — | `phan-loai-hang.jsonl` | 72 (giả lập) |
| Danh mục mặt hàng | — | `mat-hang-tai-khoan.jsonl` | 401 (giả lập) |
| Nhóm đối tượng | DM08 | `nhom-doi-tuong.jsonl` | 12 |
| Đối tượng | DM03 | `doi-tuong.jsonl` | 125 (giả lập) |
| Tài khoản ngân hàng | DM09 | `ngan-hang.jsonl` | 12 (giả lập) |
| Hình thức thanh toán | DM05 | `hinh-thuc-thanh-toan.jsonl` | 17 |
| Danh mục nhân viên | DM04 | `nhan-vien.jsonl` | 45 (giả lập) |
| Danh mục hợp đồng | ACC25 | `hop-dong.jsonl` | 4 (giả lập) |
| Loại tài sản | ACC37 | `loai-tai-san.jsonl` | 9 |
| Nhóm công cụ dụng cụ | ACC19 | `nhom-ccdc.jsonl` | 2 |
| Nguồn vốn, mục đích sử dụng, vụ việc, dự án | ACC20, ACC21, DM06, DM07 | `nguon-von.jsonl`, `muc-dich-su-dung.jsonl`, `vu-viec.jsonl`, `du-an.jsonl` | trống (công ty chưa khai mã chuẩn) |

Màn TI08 hiện số bản ghi trong tệp gốc, số đang có trong phần mềm, mô tả; nút **Xem tệp** (tìm theo mã, tên, tài khoản), **Xem mặt hàng** (bộ mặt hàng – tài khoản) và **Quay về dữ liệu gốc**.

## Quay về dữ liệu gốc

Bấm nút ở màn TI08 hoặc ở đầu màn danh mục tương ứng, xác nhận. Cần quyền cài đặt (kế toán trưởng, chủ sở hữu).

- Bản ghi có trong tệp gốc: thiếu thì thêm lại; có rồi thì ghi đè tên, cha, tài khoản… theo tệp.
- Bản ghi người dùng tự thêm:
  - chưa dùng ở đâu thì **xoá**;
  - đã dùng (trên sổ cái, chi nhánh, thẻ tài sản, định mức, lý do) thì **khoá**, để sổ sách cũ vẫn tra được.
- Không sửa chứng từ, sổ cái đã ghi.
- Xong hiện kết quả: số bản ghi thêm, cập nhật, xoá, khoá, kèm các cảnh báo cần xem.

Riêng từng bộ:

- **Chi nhánh, đối tượng, mặt hàng**: chỉ thêm và cập nhật theo tệp, **không xoá, không khoá** bản ghi khác (khách lẻ, mặt hàng mới do hệ thống bán hàng tự thêm). Chi nhánh có đuôi `_OFF` (cửa hàng đã đóng) để ngừng dùng; bộ phận của chi nhánh = BH + 5 số đầu của mã.
- **Đối tượng**: gồm nhà cung cấp, chủ nhà, khách mua buôn, nhân viên (chỉ mã, tên, mã số thuế), cơ quan thuế / bảo hiểm, nội bộ; không gồm khách mua lẻ.
- **Mặt hàng**: tên, đơn vị tính, nhóm hạch toán, loại thuế, nhóm hàng / ngành hàng / nhãn hàng theo cây nhóm hàng. Nên quay về Mặt hàng – tài khoản, Phân loại hàng hoá và Loại thuế trước (bấm **Quay về toàn bộ** thì đã đúng thứ tự).
- **Tài khoản ngân hàng**: tài khoản 112 chi tiết chưa có trong hệ thống tài khoản thì tự tạo dưới tài khoản cấp trên và báo lại. Hai tài khoản ngân hàng trùng một tài khoản 112 thì tài khoản sau để ngừng dùng (mỗi tài khoản 112 chỉ một ngân hàng đang dùng).
- **Hình thức thanh toán**: bảy mã chung mà hệ thống bán hàng gửi (TM, CK, QR, POS, VOUCHER, CONGNO, DOI_TRU) cộng các hình thức theo từng ngân hàng có tài khoản riêng.

- **Bộ phận**: chi nhánh chưa gắn bộ phận được gắn theo quy ước **BH + mã chi nhánh**, nếu bộ phận đó có trong danh mục.
- **Lý do**: lý do trỏ tới tài khoản chưa có trong hệ thống tài khoản thì để trống tài khoản đó và báo lại, để khai thêm tài khoản rồi sửa lý do.
- **Mặt hàng – tài khoản**: đặt lại nhóm hạch toán, loại thuế cho các mặt hàng **đã có** trong phần mềm, không thêm mặt hàng mới. Mặt hàng chưa có thì khi định khoản phần mềm đọc thẳng bộ tài khoản từ tệp gốc.
- **Theo dõi chiều của tài khoản**: đặt lại cờ theo dõi đối tượng, khoản mục, bộ phận, hợp đồng, nhân viên, dòng tiền theo tệp; bật bộ phận cho mọi tài khoản loại 5 – 8 và khoản mục cho tài khoản chi phí bán hàng, quản lý chi tiết (641x, 642x).

## Lưu ý

- Nên quay về dữ liệu gốc khi mới khởi tạo đơn vị, hoặc khi danh mục bị sửa sai nhiều chỗ. Sửa lẻ một vài mã thì sửa thẳng ở màn danh mục.
- Muốn đổi bản gốc (công ty thêm khoản mục, mở cửa hàng mới…) thì sửa tệp trong thư mục `db/seeds` và cập nhật phần mềm. Mỗi dòng tệp là một bản ghi JSON; dòng đầu là mô tả tệp.

## Nhóm hàng + mặt hàng: làm sạch về bộ mẫu

Nút **Quay về dữ liệu gốc** ở màn *Quản lý mặt hàng* (DM10) và *Danh mục nhóm hàng* (DM11):

- **Xoá vĩnh viễn** mọi nhóm hàng, mặt hàng chưa phát sinh (kèm đơn vị tính, giá, khai báo nhà cung cấp của chúng). Không lấy lại được.
- **Giữ nguyên** mặt hàng đã có trên sổ, phiếu kho, chứng từ mua, hoá đơn — cùng nhóm hàng của chúng — để sổ sách không gãy.
- Nạp lại bộ mẫu theo quy định mã hàng (mã 9 số = ngành 2 + nhãn 3 + nhóm 1 + số thứ tự 3):
  - Sữa bột → Vinamilk → Sữa công thức trẻ em / Sữa người lớn (5 mặt hàng)
  - Bỉm tã → Merries → Bỉm tã dán / Bỉm tã quần trẻ em (3 mặt hàng)
- Bấm lại bao nhiêu lần cũng ra cùng một kết quả.

Nút này không chạy trong **Quay về toàn bộ**.

## Quay về dữ liệu gốc an toàn <!-- [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-8a -->

Bấm **Quay về dữ liệu gốc** (đầu màn danh mục) hoặc **Quay về toàn bộ** (TI08) không ghi ngay nữa:

1. Phần mềm **xem trước**: chạy thử trên máy chủ rồi huỷ, hiện đúng số bản ghi sẽ **thêm**, **ghi đè**, **xoá**, **khoá** của từng bộ và các cảnh báo. Chưa ghi gì.
2. Đọc bảng, tick **Tôi đã xem**, bấm **Quay về**. Nếu ai đó vừa sửa danh mục sau lúc xem trước, phần mềm từ chối — bấm **Xem trước lại**. Mã xem trước có hạn 15 phút.
3. Trước khi ghi, phần mềm **tự chụp** danh mục hiện tại của các bảng bị chạm (giữ 10 bản gần nhất). Số bản chụp hiện ở thông báo kết quả; người quản trị tải lại bằng `GET /api/v1/default-data/backups/:id`.

**Bị chặn:** tệp gốc là **dữ liệu mẫu giả lập** (bản phát hành, xem `db/seeds/README.md`) mà đơn vị đã có bút toán — quay về sẽ ghi dữ liệu mẫu đè lên danh mục thật. Người quản trị máy chủ đặt biến `SEEDS_DIR` tới bộ danh mục của công ty rồi làm lại.

**Đang đọc bộ nào** <!-- [2026-11-14 01:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-11 -->: đầu màn TI08 có dải báo. *Đang đọc bộ danh mục của công ty* = máy chủ đã đặt `SEEDS_DIR`. Dải vàng *Đang đọc bộ dữ liệu mẫu giả lập* = chưa đặt; các bộ có nhãn **giả lập** trong bảng là dữ liệu giả.
