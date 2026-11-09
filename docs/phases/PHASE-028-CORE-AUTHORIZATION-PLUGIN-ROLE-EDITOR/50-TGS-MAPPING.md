# PHASE-028 · 50 — Ánh xạ TGS → quyền Open Kế Toán
<!-- [2026-11-05 05:45 PM Johnny Chu - Chu Hoàng Anh] PHASE-028 — W0: đếm lại 349 mã × 28 nhóm × 6 cờ từ dữ liệu gốc, ánh xạ nháp từng mã, mã trùng với repo, quyền đặc biệt thành phạm vi / điều kiện -->
<!-- [2026-11-09 Johnny Chu - Chu Hoàng Anh] PHASE-028 — đưa bản draft W0 (05/11) vào main, thêm §0 đối chiếu với mã W1–W5 -->

## 0. Đối chiếu với mã đã merge (2026-11-09)

> Phần **đếm và phân tích** (§1–§8) vẫn đúng làm nguồn đọc. Phần **dữ liệu và quy trình** đã bị thay bởi W5 đợt 2 ([ADR-0027 Phụ lục A, W5 đợt 2](../../adr/ADR-0027-core-authorization-plugin-role-editor.md)):

- Dữ liệu sinh nay ở [`docs/standard/phan-quyen/`](../../standard/phan-quyen/README.md): `tgs-nguon.csv` (1.618 dòng), `tgs-ma-chuc-nang.json` (349 mã), `tgs-nhom.json` (28 nhóm), sinh bởi `scripts/phan-quyen/tgs-anh-xa.mjs`; phép kiểm **SC-AUTH-04** chặn lệch. Các tệp `data/tgs-*` của bản draft **không đưa vào** (thay thế).
- **Đổi so với §1 "Không commit":** chủ dự án chọn đưa **cả 28 nhóm** vào repo làm thư viện mẫu; không còn giữ ngoài repo.
- Trạng thái vẫn là bản nháp: 28 vai trò nạp bằng `nap-vai-tro-tgs.mjs` ở dạng **vô hiệu** (D-AUTH-08), chưa mã nào BA / kế toán TGS duyệt.
- Luật ánh xạ đã siết so với §4: cờ chỉ tính khi bảng gốc có Thêm / Sửa / Xóa; bí danh của quyền đọc chỉ ứng Tìm / In, bí danh quyền ghi chỉ ứng Thêm / Sửa / Xóa; "Xóa" = huỷ / đảo (ECP-13).
- §10 "Việc tiếp (W5)": đợt 2 đã xong; còn lại là BA duyệt từng mã và các bất thường nêu ở README thư viện.
- Liên kết `data/tgs-*` trong §1 là của bản draft và **sẽ gãy**; dùng thư mục thư viện ở trên.


> **Trạng thái mọi bản ghi: `DRAFT`.** Chưa mã nào được BA / kế toán TGS duyệt. Bản ánh xạ là **nguồn chuyển đổi và test**, không phải sự thật phân quyền (D-AUTH-08).

## 1. Nguồn

| | |
|---|---|
| Tệp | "Bảng phân quyền tổng hợp TGS - 03.11.2026" — Google Sheets `1Iz1Jr5CvKDZqodDojN_crt34ufKrpjCwxywSqwLyFbs`, tải dạng xlsx ngày 2026-11-05 |
| sha256 bản tải | `f0a970b042e80ff732f200f3996e941f0248ebccb6912818577c525ed1f80ac7` |
| Sheet đọc | 28 sheet vai trò gốc (`bcqt kho` … `thu ngan_view`, 8 cột: mã, tên, Tìm, Thêm, Sửa, Xóa, In, Xuất); `Danh muc nhom chuc nang` (mã → nhóm); `max nhoms usser` + `Danh muc nhom nguon` (50 nhóm nguồn) |
| Cách đếm | đếm lại từ 28 sheet gốc, **không** từ sheet tổng hợp; bỏ dòng cuối mỗi sheet (một số đếm, không phải bản ghi — đối chiếu khớp số bản ghi của sheet) |
| Dữ liệu sinh | `data/tgs-mapping.draft.jsonl` (bản draft, không đưa vào) (349 dòng) · `data/tgs-role-snapshot.json` (bản draft, không đưa vào) · `data/tgs-stats.json` (bản draft, không đưa vào) |
| Không commit | cờ chi tiết theo từng nhóm của TGS (tên nhóm nội bộ khách hàng) — D-AUTH-11; bản đầy đủ giữ ngoài repo, sinh lại được từ tệp gốc |

### 1.1. Đối chiếu số liệu đề bài

| Số | Đề bài | Đếm lại | Khớp |
|---|---:|---:|---|
| Mã chức năng | 349 | 349 (mỗi mã có trong danh mục nhóm, không mã thừa / thiếu) | ✔ |
| Nhóm nghiệp vụ | 16 | 16, số mã từng nhóm khớp bảng §2.2 đề bài | ✔ |
| Nhóm có bản chụp | 28 | 28 sheet | ✔ |
| Bản ghi chức năng × nhóm | 1.618 | 1.618; không bản ghi trùng (sheet, mã) | ✔ |
| Nhóm trong danh mục nguồn | 50 | 50 (dòng 51 của sheet là số đếm) | ✔ |
| Sheet khớp nhóm nguồn | — | **22 / 28** khớp tên sau chuẩn hoá; 6 chưa khớp (§3) | ghi mới |
| Mã có nhiều tên giữa các sheet | — | 4: `ACC6`, `ACC93A`, `ADHT1`, `BC34A` | ghi mới |
| Mã quyền đặc biệt `#` | — | 36 | ghi mới |

## 2. Độ phủ theo 16 nhóm

Cột sau "Có repo khác nghĩa" đều **0** vì chưa làm — giữ để W5 điền, không tự nâng.

| # | Nhóm | Mã | Đã ánh xạ | Không tương đương | Chưa rõ | Repo cùng nghĩa | Repo khác nghĩa | BA duyệt | Có action | Có gác API | Có phạm vi | Có test | Nghiệm thu |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | Quản trị hệ thống & người dùng | 5 | 4 | 1 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| 2 | Danh mục & cấu hình | 28 | 28 | 0 | 0 | 6 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 3 | Dữ liệu, đồng bộ & tự động hoá | 32 | 32 | 0 | 0 | 0 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| 4 | Mua hàng & nhà cung cấp | 13 | 13 | 0 | 0 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| 5 | Bán hàng & đơn hàng | 5 | 5 | 0 | 0 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 0 |
| 6 | Giá, chiết khấu & khuyến mãi | 12 | 12 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 7 | Kho, chuyển kho & kiểm kê | 34 | 34 | 0 | 0 | 3 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| 8 | Thu chi, quỹ & ngân hàng | 38 | 38 | 0 | 0 | 14 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 9 | Công nợ & đối trừ | 20 | 20 | 0 | 0 | 10 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 10 | Thuế & hoá đơn VAT | 15 | 15 | 0 | 0 | 5 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 11 | Kế toán tổng hợp & sổ sách | 21 | 20 | 1 | 0 | 12 | 3 | 0 | 0 | 0 | 0 | 0 | 0 |
| 12 | TSCĐ, CCDC & chi phí | 21 | 21 | 0 | 0 | 18 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 13 | Khách hàng & CSKH | 10 | 10 | 0 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 14 | Kế hoạch kinh doanh | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| 15 | Báo cáo kinh doanh & quản trị | 40 | 39 | 1 | 0 | 3 | 1 | 0 | 0 | 0 | 0 | 0 | 0 |
| 16 | Kiểm soát & quyền đặc biệt | 51 | 50 | 1 | 1 | 4 | 4 | 0 | 0 | 0 | 0 | 0 | 0 |
| | **Tổng** | **349** | **345** | **4** | **1** | **77** | **28** | **0** | **0** | **0** | **0** | **0** | **0** |

"Repo cùng nghĩa" = mã có trong menu repo và nhãn cùng nghĩa (đọc tay từng cặp). 244 mã chưa có màn tương ứng trong repo.

Theo loại: báo cáo 162 · danh mục 43 · chứng từ 41 · quyền đặc biệt 39 · import 27 · cấu hình 22 · chạy tác vụ 9 · phạm vi 2 · hạn chế 2 · chỉ menu 2. Theo module đề xuất: ke-toan 78 · ban-hang 67 · kho 47 · quy 44 · danh-muc 35 · thue 19 · mua-hang 17 · tai-san 17 · he-thong 12 · crm 9 · ke-hoach 4 (`crm`, `ke-hoach` chưa có module — ADR-0024: mở ở `modules/<key>` khi có chủ).

## 3. 28 nhóm có bản chụp

"Quyền đích" = số quyền mới mà nhóm sẽ nhận nếu ánh xạ nháp được duyệt nguyên (đếm thô, chưa gộp báo cáo). "Cao" = trong đó có rủi ro cao.

| Sheet | Khớp nhóm nguồn | Bản ghi | Có cấp | Quyền đích | Cao | Phạm vi / hạn chế suy ra |
|---|---|---:|---:|---:|---:|---|
| bcqt kho | BCQT Kho | 15 | 15 | 10 | 2 | — |
| bgd | BGĐ — Ban giám đốc | 5 | 5 | 8 | 0 | xem báo cáo mọi kho |
| **bgdd** | **chưa khớp** — có thể "Admin TCKT"; 344 / 349 mã, gần đủ 6 cờ | 344 | 343 | 567 | 109 | mọi kho; nhiều chi nhánh; danh sách kho báo cáo; khoảng xem |
| bqt mua hang | chưa khớp — có thể BCQTMH "BCQT Mua hàng" | 27 | 27 | 10 | 1 | danh sách kho báo cáo |
| bqt tc | chưa khớp — có thể BCQTTC "BCQT Tài chính" | 137 | 122 | 90 | 27 | khoảng xem |
| cham soc kh | CSKH | 9 | 9 | 15 | 1 | mọi kho |
| duyet kho | DuyetKHO | 23 | 23 | 31 | 3 | mọi kho; cấm xem cấu hình NCC; khoảng xem |
| giam doc cn | GĐCN | 10 | 10 | 12 | 3 | — |
| ho tro kt cn | Hỗ trợ — Hỗ trợ KT CN | 56 | 46 | 67 | 5 | danh sách kho báo cáo; khoảng xem |
| ho tro kt hang hoa | Hỗ trợ KT HH | 3 | 3 | 7 | 2 | — |
| ke toan cong no | KT Ctr | 95 | 95 | 122 | 9 | danh sách kho báo cáo |
| ke toan doanh thu | KT DT | 59 | 59 | 81 | 5 | danh sách kho báo cáo; khoảng xem |
| ke toan kho | KT Kho | 68 | 67 | 92 | 6 | — |
| ke toan thanh toan | KT TT | 29 | 28 | 45 | 3 | — |
| ke toan thue | KT Thuế | 60 | 60 | 90 | 11 | danh sách kho báo cáo; khoảng xem |
| ke toan tong hop | KT T.H | 40 | 40 | 51 | 18 | — |
| ke toan | Kế toán | 207 | 206 | 277 | 52 | khoảng xem |
| kiem ke | Kiểm kê | 31 | 31 | 55 | 1 | danh sách kho báo cáo; khoảng xem |
| kt chi nhanh | chưa khớp — có thể "KS CN / KTT Chi nhánh" | 89 | 89 | 149 | 27 | khoảng xem |
| kt chi phi | KT CP | 58 | 58 | 60 | 8 | — |
| kt hang hoa | chưa khớp — có thể "KT H.Hoa" | 65 | 61 | 71 | 6 | khoảng xem |
| quan ly min max hh | Min Max HH | 2 | 2 | 3 | 0 | khoảng xem |
| quan ly thue | chưa khớp — có thể "QL Thuế" | 3 | 3 | 4 | 2 | — |
| thu kho | Thủ kho | 35 | 35 | 46 | 3 | danh sách kho báo cáo; cấm cấu hình NCC; khoảng xem |
| thu ngan online | Thu Ngân_ON | 2 | 2 | 5 | 1 | — |
| thu ngan | Thu ngân | 54 | 51 | 67 | 2 | cấm cấu hình NCC; khoảng xem |
| thu ngan_no vat | Thu ngân_No Vat | 44 | 44 | 75 | 2 | cấm cấu hình NCC; khoảng xem |
| thu ngan_view | Thu ngân_View | 48 | 48 | 55 | 2 | cấm cấu hình NCC; khoảng xem |

- 28 nhóm nguồn **không có bản chụp** (Admin, Admin 2, IT, Thủ Quỹ, KS Công nợ Cty, KS Cty, KS Mua hàng, KS Quỹ shop, LEADER, PT *, QL_Profomilk, QLy KD, Quản lý, Sổ TM-TGNH, View-QL, View kho, View PS Mua, BP Nhập, CSKHQL, Gia Ban HH…): **không suy ra quyền**. Cần TGS chạy câu lệnh ở Phụ lục F §8 trên máy chủ HTsoft.
- `bgdd` gần như mọi mã, gần đủ 6 cờ: **không** dùng làm mẫu "chủ đơn vị" mặc định (AUTH-TGS-02). Nếu là tài khoản quản trị TCKT thì trong hệ mới tách thành vai trò quản trị (không có quyền nghiệp vụ) + vai trò kế toán trưởng.
- Nhóm thu ngân có 4 biến thể (`thu ngan`, `_no vat`, `_view`, `online`) — trong hệ mới là **một** vai trò `cashier` + hạn chế / phạm vi (không VAT = Cấm `thue:*`; view = chỉ mục đích `report`), không 4 vai trò.

## 4. Sáu cờ: nghĩa và chất lượng dữ liệu

| Cờ | Chứng từ | Danh mục | Báo cáo | Import | Quyền đặc biệt |
|---|---|---|---|---|---|
| Tìm | `-read` | `-read` | `-read` | — | **không có nghĩa riêng** |
| Thêm | `-create` | `-create` | vô nghĩa | `-import` | ″ |
| Sửa | `-update` | `-update` | vô nghĩa | `-import` | ″ |
| Xóa | **`-cancel`** (huỷ = đảo, không xoá cứng — AUTHZ-12) | `-deactivate` | vô nghĩa | — | ″ |
| In | `-print` | `-read` | `-read` | — | ″ |
| Xuất | `-export` (rủi ro cao khi hàng loạt) | `-export` | `-export` | — | ″ |

Phát hiện từ dữ liệu:

- **375 bản ghi báo cáo** có Thêm / Sửa / Xóa = TRUE — vô nghĩa với báo cáo; ánh xạ bỏ qua và ghi số đếm (`flag_noise_records`).
- **58 bản ghi** cấp **Xóa** trên mã chứng từ (phiếu kế toán, phiếu thu / chi, hoá đơn bán / mua, chuyển kho…). Trong hệ mới thành `-cancel` (đảo bút toán); **không** có quyền xoá chứng từ đã ghi sổ.
- **36 mã `#`** là công tắc nhưng dùng 14 kiểu cờ khác nhau (`100000`, `100011`, `111111`…). Quy ước đề xuất: có ít nhất một cờ TRUE = bật; cả 6 FALSE = có bản ghi nhưng không cấp. **Chờ BA xác nhận** — cách HTsoft đọc cờ của mã `#` chưa đọc được từ mã nguồn (Phụ lục F "Nguồn và độ tin cậy").
- **36 bản ghi** có mặt nhưng 6 cờ FALSE — là "không cấp" tường minh, khác "không có bản ghi".
- Ba mã là **cờ hạn chế** (nghĩa ngược): `HT29` "#Không cho phép nhân viên xem cấu hình NCC", `HT47` "#Không bị ràng buộc bởi cn sửa dữ liệu đến ngày", `HT55` "#Bị giới hạn thời gian xem báo cáo từ ngày".

## 5. Mã trùng với repo

Mã màn của TGS **không dùng được** làm khoá hay bí danh trần. 28 mã trùng mã repo nhưng khác nghĩa (`C` trùng chính xác, `P` trùng sau bỏ số 0 đầu như `HT10` ↔ `HT010`):

| Mã TGS | Kiểu | TGS | Repo | Repo ở |
|---|---|---|---|---|
| ACC2 | C | Danh mục kỳ kế toán | Đóng / mở kỳ kế toán (rủi ro cao hơn hẳn) | `apps/web/src/phan-he/ke-toan/menu.ts` |
| ACC3 | C | Sổ cái | Chứng từ kế toán | `ke-toan/menu.ts:18,176` |
| ACC6 | C | Danh mục bút toán kết chuyển / Kết chuyển lãi lỗ (2 tên) | Kết chuyển lãi / lỗ | `ke-toan/menu.ts` |
| ACC15 | C | Kết chuyển số dư sang kỳ sau | Số dư tài khoản | `ke-toan/menu.ts` |
| ACC17, ACC18 | C | Import tài khoản mặt hàng / lý do | Danh mục Mặt hàng – TK / Lý do – TK | `ke-toan/menu.ts` |
| ACC47 | C | BC chi tiền theo KM và BP | BC chi tiết theo KM và PB | `ke-toan/menu.ts` |
| ACC94 | C | BC chi tiết công nợ theo chứng từ | Bảng điểm đầu vào | `ke-toan/menu.ts` |
| BH10 | C | #Hiển thị giá vốn | Phiếu bán hàng (Nguồn dữ liệu) | `apps/web/src/phan-he/api/nguon-du-lieu/NguonDuLieuPage.tsx:14` |
| BH11 | C | #Được sửa giá khi bán | Hàng bán trả lại (Nguồn dữ liệu) | `NguonDuLieuPage.tsx:15` |
| MH11 | C | Quản lý tồn max / min | Tổng hợp mua hàng | `apps/web/src/phan-he/mua-hang/menu.ts` |
| MH17 | C | Nhập điều chỉnh | Phiếu đăng ký tồn max | `mua-hang/menu.ts` |
| MH19 | C | Chứng từ mua dịch vụ | Chuyển hàng xuống shop | `mua-hang/menu.ts` |
| HT10 | C | #Được phép sửa dữ liệu trong quá khứ (10 nhóm) | Trụ cột & mức đạt | `apps/web/src/phan-he/he-thong/menu.ts:26` |
| BH1–BH6 | P | Hoá đơn bán lẻ, Hàng bán trả lại, Thu tiền KH, Thống kê, Xuất-nhập kho nội bộ, Quản lý KHTT | BH01–BH06: Báo cáo bán hàng, Tổng hợp bán hàng, Thu tiền theo HTTT, Lãi gộp, BC thu tiền bán hàng, Phiếu xuất điều chỉnh | `apps/web/src/phan-he/ban-hang/menu.ts` |
| HT3, HT4, HT5, HT9 | P | Nhật ký người dùng, Phân quyền, Sao lưu, #Nhập lệch ngày | HT03–HT05, HT09: Thông tin đơn vị, Chuyển chi nhánh, Mẫu in, Quy định dữ liệu danh mục | `he-thong/menu.ts:14-24` |
| MH1, MH2, MH4, MH7 | P | Hoá đơn mua hàng, Hàng mua trả lại, Đơn mua hàng, Quản lý giá vốn | MH01, MH02, MH04, MH07: NCC mua hàng, Phân tích đặt hàng, Chính sách mua hàng, Phân bổ & giá vốn thực tế | `mua-hang/menu.ts` |

Thêm: `HT11` của TGS = "#Được phép xem báo cáo trên tất cả các Kho" → không dùng HT11 cho màn Role Editor (D-AUTH-06 đề xuất **HT12**). Phụ lục F ghi `ACC3` = Chứng từ kế toán và `ACC88` = Sổ cái — **khác** TGS (`ACC3` = Sổ cái, `ACC88` = Sổ Cái); F ghi `ACC3D` = "Chỉnh sửa nhanh chứng từ" (rủi ro cao), TGS = "Danh sách chứng từ". Hai chỗ này BA phải xác minh trên `tblFUNCTION` thật.

Cách dùng: bí danh luôn có không gian tên (`tgs:HT10`, `repo:HT10`). SC-AUTH-11 cảnh báo khi một bí danh trỏ hai quyền khác nghĩa.

## 6. Mức hạt báo cáo (D-AUTH-14)

Gộp 162 báo cáo thành một quyền / module (`kho:report-read`…) làm **mất thông tin cấp quyền ở 23 trường hợp, 7 nhóm, 18 quyền đích**: trong cùng nhóm, một số báo cáo được cấp, số khác không. Ví dụ: `bqt mua hang` được xuất 5 báo cáo bán hàng, không được xuất 10 báo cáo khác; `ho tro kt cn` xem 5 / 9 báo cáo kho; `thu ngan` xuất 6 / 7 báo cáo kho. Đề xuất: **mỗi báo cáo một quyền**, sinh từ sổ báo cáo, Role Editor tick theo nhóm (chọn tất cả chỉ phủ quyền rủi ro thấp). Báo cáo có giá vốn / lợi nhuận (`BC17`, `BC68A`, `BC80`, `BCAD135`, `ACC70`, `ACC71`, `ACC82`, `ACC83`) đòi thêm quyền trường `kho:cost-read` / `*:profit-read`.

## 7. Quyền đặc biệt (nhóm 16 và tương tự)

Phần lớn **không phải quyền** mà là **phạm vi** hoặc **điều kiện** — lý do chọn mô hình Cho / Nới / Cấm (ADR-0027 D5):

| Mã | Nghĩa TGS | Số nhóm cấp | Đích đề xuất | Quyền Core hôm nay | Kiểu |
|---|---|---:|---|---|---|
| HT9 | #Nhập dữ liệu lệch ngày so với máy chủ | 9 | Nới `doc_date_back/forward` trên `*:create` | `documents:bypass-date-lock` | SPLIT |
| HT10 | #Sửa dữ liệu trong quá khứ | 10 | Nới `edit_window` trên `*:update` | `documents:bypass-date-lock` | SPLIT |
| HT47 | #Không bị ràng buộc khoá sửa đến ngày (cờ ngược) | 1 | Nới `respect_lock_date=false` | `documents:bypass-date-lock` | MERGE |
| HT33 | #Đặt mốc thời gian cho phép sửa chứng từ | 1 | `ke-toan:edit-lock-configure` (high) | `settings:write` | SPLIT |
| ACC3F | #Sửa / xoá chứng từ chi nhánh khác | 1 | phạm vi + Nới `creator=all` | `documents:edit-all` | SPLIT |
| HT21, HT22, HT53 | #Sửa SO / PO của người khác / chi nhánh khác | 2 / 1 / 2 | Nới `creator=all` / phạm vi | `documents:edit-all` | SPLIT |
| HT11 | #Xem báo cáo mọi kho | 4 | **phạm vi** `warehouse:*` mục đích `report` | — | phạm vi |
| HT34 | #Chỉ định kho được xem báo cáo | 8 | **phạm vi** danh sách kho, mục đích `report` | — | phạm vi |
| HT27 | #Thu tiền KH nhiều chi nhánh | 1 | **phạm vi** nhiều chi nhánh, `operate` | — | phạm vi |
| HT55 | #Bị giới hạn khoảng ngày xem báo cáo | 15 | **điều kiện** `view_window` | — | hạn chế |
| HT29 | #Không cho xem cấu hình NCC | 5 | **Cấm** `mua-hang:supplier-config-read` | — | hạn chế |
| AD15 | #Xác nhận phiếu chuyển kho quá 2 ngày | 4 | Nới hạn trên `kho:transfer-confirm` | — | SPLIT |
| ADHT1 | #Lập hàng bán trả lại không giới hạn ngày | 4 | Nới trên `ban-hang:sales-return-create` | — | SPLIT |
| HT16, BH10 | #Xem / hiển thị giá vốn | 6 / 6 | `kho:cost-read` (quyền trường) | — | EXACT / MERGE |
| HT13 | #Xem nhanh doanh thu | 2 | `ban-hang:revenue-quickview` | — | EXACT |
| HT17, HT18 | #Duyệt SO / PO | 4 / 3 | `ban-hang:sales-order-approve`, `mua-hang:purchase-order-approve` (high) | — | EXACT |
| HT19, HT20 | #Cập nhật trạng thái SO / PO | 3 / 2 | `…-status` | — | EXACT |
| CK2, CK3 | #Điều phối / duyệt chuyển kho | 11 / 9 | `kho:transfer-dispatch`, `kho:transfer-approve` (tách hai đầu) | — | EXACT / SPLIT |
| HT40 | #Sửa phiếu chuyển kho đã duyệt | 1 | `kho:transfer-edit-approved` (high) | — | EXACT |
| HT25, HT26 | #Xác nhận / điều phối phiếu chuyển tiền | 7 / 5 | `quy:fund-transfer-confirm` (high), `-dispatch` | — | EXACT |
| BH11, BH12, BH13 | #Sửa giá / chiết khấu / thuế khi bán | 7 / 4 / 4 | `ban-hang:price-override` (high), `discount-override`, `tax-override` (high) | — | EXACT |
| BH14 | #Sửa giá vốn khi bán | 1 | **không mang sang** — giá vốn do Costing tính sau ghi sổ (ADR-0017, invariant Item Master) | — | NO_EQUIVALENT |
| BH15, BH22 | #Chọn nhân viên bán / thu qua ngân hàng | 3 / 4 | `ban-hang:salesperson-select`, `bank-collect` | — | EXACT |
| HT58 | Cập nhật giá toàn hệ thống | 1 | `ban-hang:price-update-all` (high) | — | EXACT |
| HT62 | #Sửa giá hàng dịch vụ khi nhập xuất | 3 | `kho:service-price-override` | — | EXACT |
| CH16, CH17, CH39 | Gộp mã hàng / khách hàng / lý do | 1 / 1 / 1 | `danh-muc:*-merge` (high, không đảo được) | — | EXACT |
| HT46 | #Xoá chi tiết trong các phiếu | 7 | chưa rõ: là sửa phiếu chưa ghi sổ? | — | UNKNOWN |
| HT4, HT14 | Phân quyền / Quản lý nhóm user | 2 / 1 | `he-thong:user-roles-assign`, `he-thong:roles-manage` (high) | `users:write` | EXACT |
| HT5 | Sao lưu phục hồi | 1 | việc vận hành (PHASE-008), không là quyền trong ứng dụng | — | NO_EQUIVALENT |
| ACC0, AD10 | Hiện menu kế toán / danh sách báo cáo add-in | 9 / 13 | menu suy từ quyền | — | NO_EQUIVALENT |

`documents:bypass-date-lock` hôm nay gánh 3 quyền TGS khác nhau (HT9, HT10, HT47) → bằng chứng cho rủi ro R2 (quyền quá thô).

## 8. Ví dụ ánh xạ trong đề bài — đối chiếu

| Đề bài | Dữ liệu thật | Kết luận |
|---|---|---|
| `ACC1` → `accounting:account-read/configure` | ACC1 = Danh mục tài khoản ✔ | đích: `ke-toan:account-read/create/update/deactivate/export` (khoá module là `ke-toan`, không `accounting`) |
| `ACC16` Phiếu kế toán | ✔ | `ke-toan:voucher-*`; post / reverse tách quyền |
| `ACC3` Sổ cái | TGS ✔; **repo `ACC3` = Chứng từ kế toán** | xung đột, §5 |
| `BH1` Hoá đơn bán lẻ | ✔; repo `BH01` khác nghĩa | `ban-hang:retail-invoice-*` |
| `MH1` Hoá đơn mua hàng | ✔; repo `MH01` khác nghĩa | `mua-hang:purchase-invoice-*` |
| `CK6` Yêu cầu chuyển kho | ✔ | `kho:transfer-request-*` |
| `HT16` Xem giá vốn | ✔ (và `BH10` cùng nghĩa) | `kho:cost-read` |
| `HT17` Duyệt SO | ✔ | `ban-hang:sales-order-approve` |

## 9. Trường của bản ghi ánh xạ

`legacy_system`, `legacy_function_code`, `legacy_label`, `legacy_label_variants`, `legacy_group`, `source_sheet`, `source_row`, `roles_with_record`, `roles_granting_any`, `proposed_module`, `resource`, `kind`, `risk` (nhãn phân tích low / medium / high — D-AUTH-13), `scope_kinds`, `canonical_permission_ids` (đuôi `?` = quyền nên có thêm, không có cờ nguồn), `core_permission_today`, `condition`, `mapping_type` (`EXACT` / `SPLIT` / `MERGE` / `NO_EQUIVALENT` / `UNKNOWN`), `high_risk_ops`, `confidence`, `verified_status` (`DRAFT` → `BA_REVIEWED` → `ACCOUNTING_APPROVED` → `IMPLEMENTED` → `TESTED`), `review_owner`, `note`, `repo` (`SAME` / `CONFLICT` / `PADDED_CONFLICT` / `NONE` + vị trí), `repo_action`, `repo_route`, `repo_guard`, `flag_noise_records`, `xoa_on_document_records`, `test_case`, `evidence_link`, `gap`, `next_phase`.

`repo_action` / `repo_route` / `repo_guard` để trống cho tới khi tìm thấy mã thật (W5) — không điền suy đoán.

## 10. Việc tiếp (W5)

1. TGS chạy câu lệnh Phụ lục F §8 (chỉ đọc) → bản `tblFUNCTION` / `tblUserGroupRight` chính thức; so lại 349 mã và 4 mã nhiều tên; lấy dữ liệu 28 nhóm chưa có bản chụp.
2. BA xác nhận quy ước cờ của mã `#` (§4) và nghĩa `ACC3`, `ACC3D`, `ACC88`, `HT46`.
3. Kế toán TGS duyệt từng nhóm (cột "BA duyệt"), bắt đầu nhóm 8 (quỹ), 7 (kho), 15 (báo cáo) — khớp 3 luồng MVP (D-AUTH-09).
4. Chạy tương đương: với mỗi nhóm × mã × cờ, quyết định của hệ mới (vai trò dựng từ ánh xạ) = cờ nguồn; khác biệt phải có lý do (gộp / tách đã duyệt).
5. `NO_EQUIVALENT` (`ACC0`, `AD10`, `HT5`, `BH14`) vào backlog với quyết định: không cần / việc vận hành / bỏ có chủ đích.

Sinh lại: tải lại tệp xlsx, so sha256; chạy trình đọc (đọc 28 sheet gốc theo `Danh sach`, ghép `Danh muc nhom chuc nang`, ánh xạ theo bảng mã → [module, resource, loại] viết tay) — trình đọc đặt vào `scripts/` cùng PR W5 có giữ chỗ, không nằm trong PR tài liệu này.
