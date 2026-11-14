# Dữ liệu gốc

Danh mục và cấu hình định khoản chuẩn của công ty. Phần mềm đọc thẳng từ đây:

- **Quay về dữ liệu gốc** (màn TI08 ở menu Tiện ích, nút ở đầu các màn danh mục): chép đè từng bộ từ tệp vào danh mục của đơn vị.
- **Định khoản** mặt hàng chưa có trong danh mục mặt hàng: lấy bộ tài khoản, loại thuế từ `mat-hang-tai-khoan.jsonl`.
- **Khởi tạo đơn vị** (`src/db/seed.ts`): hệ thống tài khoản từ `tai-khoan.csv`.

| Tệp | Danh mục | Ghi chú |
|---|---|---|
| `tai-khoan.csv` | Hệ thống tài khoản (ACC1) | Tên, tên tiếng Anh, tính chất số dư, cờ theo dõi chi tiết và cờ tính chất (ngoại tệ, thuế GTGT, công nợ nội bộ, luôn tăng, sổ cái…) |
| `tai-khoan-ngam-dinh.jsonl` | Tài khoản ngầm định (ACC41) | mười một ô của form + tài khoản của bộ định khoản |
| `loai-thue.jsonl` | Loại thuế (ACC43) | |
| `khoan-muc.jsonl` | Khoản mục (ACC24) | cây cha – con |
| `bo-phan.jsonl` | Bộ phận (ACC26) | cửa hàng: BH + mã cửa hàng |
| `chi-nhanh.jsonl` | Chi nhánh (DM02) | chỉ thêm / cập nhật |
| `so-do-to-chuc.jsonl`, `so-do-to-chuc-gan.jsonl` | Sơ đồ tổ chức (DM16) + chi nhánh gắn nút | cây Công ty → Miền → Chi nhánh → Tỉnh; kho nhận hàng tự lấy chi nhánh xx000 của mỗi chi nhánh cấp 2; quay về gốc bằng nút ở màn DM16 |
| `kho.jsonl` | Kho theo chi nhánh (DM12) | mã kho, chi nhánh sở hữu, kho mặc định (nhận dòng nhập xuất không ghi mã kho); chỉ thêm / cập nhật |
| `ly-do.jsonl` | Lý do – tài khoản (ACC18) | |
| `nhom-hach-toan.jsonl` | Nhóm hạch toán mặt hàng (ACC17) | bộ tài khoản; mặt hàng gán nhóm ở `mat-hang-tai-khoan.jsonl` |
| `phan-loai-hang.jsonl` | Phân loại hàng hoá (DM11) | group = cây nhóm hàng; industry = cấp 1; brand = cấp 2 |
| `mat-hang-tai-khoan.jsonl` | Mặt hàng (DM10, ACC17) | chỉ thêm / cập nhật; gồm ghi chú, thuế TTĐB; bộ định khoản đọc thẳng khi mặt hàng chưa có trong phần mềm |
| `nhom-doi-tuong.jsonl` | Nhóm đối tượng (DM08) | |
| `doi-tuong.jsonl` | Đối tượng (DM03) | không gồm khách lẻ; chỉ thêm / cập nhật |
| `ngan-hang.jsonl` | Tài khoản ngân hàng (DM09) | |
| `hinh-thuc-thanh-toan.jsonl` | Hình thức thanh toán (DM05) | |
| `nhan-vien.jsonl` | Nhân viên (DM04) | |
| `hop-dong.jsonl` | Hợp đồng (ACC25) | |
| `loai-tai-san.jsonl` | Loại tài sản (ACC37) | loại cha "TSCĐ hữu hình" |
| `nhom-ccdc.jsonl` | Nhóm công cụ dụng cụ (ACC19) | |
| `nguon-von.jsonl`, `muc-dich-su-dung.jsonl`, `vu-viec.jsonl`, `du-an.jsonl` | ACC20, ACC21, DM06, DM07 | trống |

## Dữ liệu thật của công ty: thư mục riêng + `SEEDS_DIR` <!-- [2026-11-10 11:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — S030-53: bộ giả lập trên repo, bộ thật ngoài repo (26 §11.2) -->

Repo công khai. Từ S030-53 (2026-11-10), 11 tệp định danh / tổ chức / mặt hàng (`doi-tuong`, `nhan-vien`, `ngan-hang`, `hop-dong`, `chi-nhanh`, `kho`, `bo-phan`, `so-do-to-chuc`, `so-do-to-chuc-gan`, `mat-hang-tai-khoan`, `phan-loai-hang`) là **dữ liệu giả lập** (dòng đầu có `"_nguon": "gia-lap"`), sinh bằng `node scripts/du-lieu-mau/sinh-seeds.mjs` (`--kiem` báo tệp lệch bản sinh). Không thêm tên người, công ty, MST, số tài khoản, địa chỉ thật vào các tệp này.

Bản cài của một công ty dùng danh mục thật của mình:

1. Chép **cả** thư mục `db/seeds/` (cả các danh mục chuẩn) ra ngoài repo, vd `/srv/bizcity/seeds`, rồi thay 11 tệp trên bằng dữ liệu của công ty (giữ đúng khuôn: dòng đầu `_bang`, `_mo_ta`, `_cot`).
   - Bản cài đang chạy trước S030-53: lấy lại bộ cũ từ commit ngay trước đợt này — `git archive <commit> db/seeds | tar -x -C /srv/bizcity`.
2. Đặt `SEEDS_DIR=/srv/bizcity/seeds` trong `.env` của bản cài. <!-- [2026-11-14 01:47 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-11: SEEDS_DIR qua .env có tác dụng trên Docker -->
   - Docker: `docker-compose.yml` gắn thư mục đó **chỉ đọc** vào `/srv/bizcity-seeds` của `api` và `db-migrate`, rồi đặt biến trong container. Chạy lại `docker compose up -d` sau khi đổi `.env`.
   - Chạy ngoài Docker (`npm run dev`): đặt biến môi trường `SEEDS_DIR` cho tiến trình API (`packages/platform/src/db/paths.ts`).
   - Màn TI08 hiện dải *Đang đọc bộ danh mục của công ty*; chưa đặt thì báo đang đọc bộ giả lập.
3. *Quay về dữ liệu gốc* (TI08) và bộ định khoản mặt hàng chưa có trong danh mục khi đó đọc bộ của công ty.

Khi `main` đổi danh mục chuẩn (thêm loại thuế, lý do…), chép các tệp chuẩn đó sang thư mục riêng. Phần mềm **không** lấy bù tệp thiếu từ `db/seeds` (lấy nhầm là nạp dữ liệu giả); `scripts/cap-nhat.sh` so thư mục với `db/seeds` của bản mới và **dừng** khi thiếu tệp, in danh sách để chép.

Thứ tự quay về toàn bộ khai ở `DATASETS` (`src/modules/default-data/default-data.service.ts`).

Định dạng JSONL: mỗi dòng một đối tượng JSON. Dòng đầu của mỗi tệp là mô tả (`_bang`, `_mo_ta`, `_cot`), không phải bản ghi.

Danh mục chuẩn (tài khoản, loại thuế, khoản mục, lý do, nhóm hạch toán…) lập ngày 14/10/2026; 11 tệp định danh / tổ chức / mặt hàng là bộ giả lập (mục trên). Sửa danh mục chuẩn thì sửa thẳng tệp; sửa bộ giả lập thì sửa script sinh rồi chạy lại (giữ đúng tên trường), chạy test `test/default-data.test.ts`, rồi cập nhật phần mềm.
