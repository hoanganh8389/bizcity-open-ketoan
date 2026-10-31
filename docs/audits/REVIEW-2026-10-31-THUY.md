# Rà soát việc của người đóng góp — Nguyễn Văn Thủy · 2026-10-31
<!-- [2026-10-31 04:04 PM Johnny Chu - Chu Hoàng Anh] R-REV — biên bản rà soát đầu tiên: 14 commit của Nguyễn Văn Thủy (e2ada98..149a1bd), ĐẠT có điều kiện. -->
<!-- [2026-10-31 04:29 PM Johnny Chu - Chu Hoàng Anh] R-REV — điều kiện b: nạp 25 trường hợp vào đơn vị sạch, đối chiếu sổ / công nợ / kho / thuế / mã hàng / ĐVT; thêm việc f–j. -->

> **Luật:** [RULE-REVIEW](../rules/RULE-REVIEW.md) · **Khoảng:** `e2ada98..149a1bd` (`origin/main`), chỉ commit tác giả "Thủy" · **Công cụ:** `node scripts/ra-soat-dong-gop.mjs --range e2ada98..origin/main --author "Thủy"`
> **Nội dung:** mua hàng (ĐVT thùng MH27, CK % ⇄ CK đ, chương trình theo giai đoạn, giá NCC hiệu lực theo ngày, biến thể MH26, đơn giá số lẻ, sửa lỗi đợt test 25 trường hợp), giao diện cửa sổ / menu, bộ nạp 25 trường hợp
> **Mức rủi ro (R-REV-9):** **R2** — đổi giá, chiết khấu, ĐVT, hạn mức, công nợ NCC → số tiền vào sổ
> **Kết luận:** 🟡 **ĐẠT có điều kiện** (§6)

## 1. Lượt đầu tự động — kết luận từng phát hiện

| Mã | Chỗ | Kết luận | Việc |
|---|---|---|---|
| H-DIRECT-MAIN | 14 / 14 commit | **đúng** — đẩy thẳng `main`, không qua PR, CI, người duyệt (R-REV-1, R-QG-1) | chủ dự án bật bảo vệ nhánh `main`; Thủy làm trên nhánh riêng + PR |
| H-FRAMEWORK | `packages/contracts/src/mua-hang/{engine,gia-mua,khuyen-mai,ton-max}.ts` | **đúng** — bộ máy tính mua hàng còn nằm tạm trong `packages/contracts` (nợ lộ trình 2.8) nên tính là tệp framework; các lần sửa chưa có dấu R-SIG mới, chủ chưa duyệt | chủ duyệt thay đổi; dài hạn tách về phân hệ (PHASES 2.8) để Thủy sửa không đụng framework |
| H-FRAMEWORK | `scripts/lam-sach-mua-hang.sh`, `nap-25-truong-hop.{sh,mjs}` | **đúng** — thiếu dấu; đã ký bù tên Nguyễn Văn Thủy. SC-SIG-1 vẫn đòi dấu chủ dự án | chủ chọn: duyệt từ hôm nay (R-SIG-7) / đổi luật / chuyển script về thư mục phân hệ |
| H-MASTERDATA | `apps/api/src/modules/catalog/catalog.service.ts` (+35 dòng, 3e45f20, ĐVT thùng) | **cần rà sâu** — danh mục chuẩn: ĐVT mua mặc định, gộp ĐVT gốc tỉ lệ 1 | Nhóm Lõi rà (§6 c) |
| H-STATUS | `apps/api/src/phan-he/mua-hang/service.ts:190` (f03e8e6) | **đúng lúc commit, đã xử lý** — khi gộp với S012-1, bỏ duyệt lấy trạng thái đích từ `purchase-document.workflow.yaml`, giữ phần xoá dấu duyệt ngoại lệ của Thủy | — |
| H-UNIT ×4, H-MONEY ×1 | `ratio: 1` (ĐVT gốc), `toFixed` trong câu thông báo | **dương tính giả** — đã tinh luật dò (chỉ báo hệ số ≥ 2, bỏ `toFixed` trong chuỗi hiển thị) | — (R-REV-10) |

## 2. Bộ kiểm trên mã đã gộp (`feat/phase-0-tiep` = `origin/main` + S012-1)

| Kiểm | Kết quả |
|---|---|
| `selfcheck --strict` | KHÔNG ĐẠT **chỉ** SC-SIG-1: 3 script thiếu dấu chủ dự án (chờ chủ quyết, §1). Mọi check khác đạt |
| `npm run typecheck` | đạt (sau `npm run build -w @ketoan/contracts` — dist cũ báo lỗi giả ở `ton-max.ts`) |
| `npm test` | **801 qua · 0 lỗi · 1 bỏ qua** (ca RLS theo vai trò CSDL, như trước) |
| Test đi kèm (R-QG-2) | có — Thủy thêm / sửa 9 tệp test: `ck-dong`, `ctkm-giai-doan`, `don-gia-so-le`, `dvt-thung`, `gia-ncc-hieu-luc`, `ket-hop-6-cach`, `mua-hang-loi-28-10`, `mua-hang-loi-30-10`, `ton-max` |

## 3. Diagnostics, dữ liệu kế toán (R-REV-6)

**Đã làm 2026-10-31** (điều kiện b). Đơn vị sạch `ra-soat-25th-b` trên CSDL test `ketoan_test`, API chạy mã đã gộp, bộ nạp `scripts/nap-25-truong-hop.mjs` (gọi thẳng, không qua Docker), đối chiếu bằng `scripts/doi-chieu-ke-toan.sql`.

**Chuẩn bị phải tự làm** vì kịch bản viết cho sổ thật `tgs`, nơi đã có danh mục; tệp kịch bản không khai các thứ này:
- bật "định khoản ngay" (đơn vị mới mặc định chờ ACC14);
- 3 mặt hàng gốc `140181006` (Hộp), `110154035`, `110154036` (Lon), tên giả định;
- nhãn `63` (TH), `34` (Anlene), nhóm `221` (quà).

Thiếu nhãn thì thưởng doanh số, hạn mức toàn nhãn ra 0 hoặc không chặn: lần nạp đầu trên đơn vị thiếu nhãn chỉ đạt 104/119.

**Kết quả đối chiếu "Kết quả mong đợi" của kịch bản: 116 / 119 số đạt ngay sau từng case, 113 / 119 khi nạp xong.**

Cả 6 số lệch (TH15 × 3 khi nạp xong, TH16 × 1, TH22 × 2) cùng một nguyên nhân: chính sách cộng dồn theo tháng / quý của NCC Anlene (chỉ tiêu, thưởng giai đoạn, thưởng 3%) gom cả phiếu của **case khác** cùng NCC, cùng tháng, vì 25 case dồn chung một sổ.
- **TT26100002** (TH16): giai đoạn 1 = 120tr → 1% = 1,2tr; giai đoạn 2 = 690tr (gồm NM26100015 550tr của TH15) → 2% = 13,8tr; giai đoạn 3 = 290tr → 3% = 8,7tr; tổng 23,7tr.
- **TT26100003** (TH22): 3% × 2,075 tỷ, đúng bằng tổng 7 phiếu nhập Anlene tháng 10, không tính phiếu chi phí và phiếu quà.

Tính tay theo luật trên đúng các phiếu có trong sổ ra đúng số của sổ, nên **bộ máy tính đúng; số "mong đợi" chỉ đúng khi mỗi case chạy riêng.**

| Đối chiếu | Kết quả |
|---|---|
| Tự chẩn đoán trong ứng dụng `GET /system/diagnostics` | **8 đạt · 0 lỗi · 0 cảnh báo** (3 trống: không có bút toán đảo — bỏ duyệt duy nhất là đơn đặt, không chạm sổ) |
| Cân sổ | Nợ = Có = 4.774.840.842 |
| Công nợ phải trả ↔ 331 theo NCC | **khớp 5 / 5 NCC**, lệch 0 |
| Kho: thẻ kho ↔ 156 | **khớp** 3.222.591.372 |
| Phiếu mua đã duyệt: 331 trên sổ = tổng phiếu | khớp mọi phiếu nhập / chi phí |
| Làm tròn | 0 dòng sổ, 0 phiếu có tiền lẻ dưới đồng; tổng phiếu = trước thuế + thuế ở mọi phiếu (trừ phiếu đổi, xem dưới) |
| **Sổ hoá đơn đầu vào ↔ 133** | **lệch 64.454.000**: sổ hoá đơn 199.051.390, phát sinh 133 263.505.310. 14 sự việc ghi 1331 mà phiếu **không có số hoá đơn** nên không vào sổ hoá đơn (NM26100007, -10, -11, -13, -15, 3 phiếu đổi DO…, 2 phiếu trả, 1 phiếu thưởng) |
| Đầu phiếu đổi hàng (`exchange`) | `total_before_tax`, `total_tax` = cộng **trị tuyệt đối** hai chiều (DO26100001: 3.000.000 + 240.000) trong khi `total` = ròng (0). Sổ ghi đúng (hai sự việc `-N` / `-T`, thuế ròng 0 / 0 / 80.000). Hai cột này có từ commit khởi tạo, chưa báo cáo API nào cộng thẳng; báo cáo nào cộng thì thuế đổi hàng bị đếm đôi |

## 4. Dữ liệu và mã (§5 RULE-REVIEW)

| Kiểm | Kết quả |
|---|---|
| Mã hàng trong `db/seeds/mua-hang-25th/kich-ban.json` | 5 mã, **đúng `SKU_RULE`**: `140181006` (14·018·1·006), `110154035`, `110154036` (11·015·4·035/036), `Q03410001`, `Q03410002` (quà Q·034·1·0001/0002) |
| Mã khác trong kịch bản | chi nhánh `CN01`, `CN-NA`, `CN-ND`, `CN-PT`, `CN-HCM`; NCC `NCC-TRUNGHAU`, `NCC-ANLENE`…; chính sách `TH01-CK7`, `ANLENE-CT-T10`… — chữ hoa, không dấu, gạch nối: **đúng R-REV-8** |
| Bảng danh mục riêng | không có (không migration mới) |
| Sinh mã hàng ngoài `nextSku` | không thấy (H-SKU 0) |
| Mã hàng / ĐVT trong đơn vị sau khi nạp (`doi-chieu-ke-toan.sql` §6, §7) | 5 / 5 mã đúng quy tắc, không trùng; mọi mặt hàng có đúng một ĐVT gốc tỉ lệ 1 và một ĐVT mua mặc định; `140181006`: Hộp = 1, Thùng = 48 (mua) |
| Đoạn nhãn trong mã ↔ mã nhãn danh mục | **cần chủ xác nhận:** Anlene Gold / vani mang đoạn nhãn `015` (`110154035`) nhưng thuộc nhãn danh mục `34`; quà Anlene mang đoạn `034`. Nếu "cấp 2 = nhãn" của `SKU_RULE` phải trùng mã nhãn danh mục thì đây là lệch; nếu cấp 2 là nhánh trong cây nhóm hàng (khác danh mục nhãn) thì đúng |
| Kế thừa ĐVT mã con (`inheritUnits`, 3e45f20) | **cảnh báo R2:** mã con tạo mới lấy **tỉ lệ** quy đổi của mã cha (vd Thùng = 48) cả khi ĐVT gốc của mã con khác mã cha (mã cha Lon, mã con Hộp). Biến thể khác quy cách đóng gói → số lượng quy đổi, tồn kho, giá vốn sai. Cấu trúc ĐVT vẫn hợp lệ (`checkUnits`); nên bắt người dùng xác nhận tỉ lệ kế thừa |

## 5. Lượt đầu — nguyên văn công cụ

### Commit

| Commit | Tác giả | Lúc | Nội dung | Thẳng nhánh đích |
|---|---|---|---|---|
| 2bd97a1 | Nguyễn Văn Thủy | 2026-10-30 23:31 | feat(web): thanh cửa sổ dưới đáy (thu nhỏ, đóng tất cả, chuột phải), nhiều phiếu cùng lúc; nút thu gọn menu trái ở trên cùng | có |
| eca1200 | Nguyễn Văn Thủy | 2026-10-30 22:35 | feat(mua-hang): giá NCC hiệu lực theo ngày chứng từ, giá niêm yết đúng ĐVT ở mọi cách lập; MH23 mã / tên / nhóm hàng lên đầu | có |
| 37b41bb | Nguyễn Văn Thủy | 2026-10-30 21:56 | fix(mua-hang): MH27 không thêm dòng Thùng trống cho NCC; lập đơn theo ĐVT mua mặc định, giá niêm yết đúng ĐVT hoặc quy đổi | có |
| 3e45f20 | Nguyễn Văn Thủy | 2026-10-30 21:17 | feat(mua-hang): ĐVT Thùng đặt hàng (MH27), CK % ⇄ CK đ, chương trình theo giai đoạn, thao tác dòng phiếu | có |
| 9f389af | Nguyễn Văn Thủy | 2026-10-30 19:00 | feat(mua-hang): MH02 gộp tốc độ bán / vòng quay vào một cột nhiều dòng, thêm "Sau đặt" đổi theo SL đặt | có |
| d7850b9 | Nguyễn Văn Thủy | 2026-10-30 18:28 | feat(mua-hang): chú thích rê chuột cho cột / ô số ở MH02, MH18, MH26 | có |
| c7dea90 | Nguyễn Văn Thủy | 2026-10-30 18:24 | feat(mua-hang): MH02 hiện công nợ / hạn mức / điều khoản NCC ở dòng nhóm, thêm cột Bán / ngày và Đủ bán (ngày) | có |
| 6c085e9 | Nguyễn Văn Thủy | 2026-10-30 18:18 | feat(mua-hang): kho lấy min ở công thức đặt hàng, trang Biến thể mặt hàng (MH26), xem trước đơn ngay tại MH02 | có |
| bace27b | Nguyễn Văn Thủy | 2026-10-30 17:38 | fix(scripts): nap-25-truong-hop — lệnh kiểm tệp kịch bản không đọc stdin (không nuốt dòng xác nhận khi đưa vào qua ống) | có |
| 1c336a7 | Nguyễn Văn Thủy | 2026-10-30 17:24 | fix(mua-hang): kho mặc định cho chi nhánh của bộ 25 trường hợp (CN01) — nút MH00 luôn hiện, lệnh nạp tự tạo kho | có |
| f03e8e6 | Nguyễn Văn Thủy | 2026-10-30 16:56 | fix(mua-hang): lỗi đợt test 25 trường hợp — ACC83, còn nợ NCC, hạn mức, FEFO, quà, duyệt ngoại lệ, % số lẻ | có |
| 392d97e | Nguyễn Văn Thủy | 2026-10-30 16:56 | feat(mua-hang): bộ xoá sạch + nạp 25 trường hợp theo Google Sheet vào sổ một đơn vị | có |
| 6cd9908 | Nguyễn Văn Thủy | 2026-10-30 15:45 | feat(mua-hang): đơn giá được có số lẻ (506.018,52), thành tiền / thuế vẫn tròn đồng | có |
| 2b7ebde | Nguyễn Văn Thủy | 2026-10-30 13:49 | fix(scripts): bật quyền chạy cho kiem-khoi-phuc.sh, kiem-nang-cap.sh | có |

### Tệp theo lớp

| Lớp | Tệp | Dòng thêm | Dòng bỏ |
|---|---|---|---|
| D | 12 | 459 | 41 |
| M | 1 | 35 | 0 |
| contracts | 4 | 55 | 33 |
| db | 1 | 3810 | 0 |
| khác | 14 | 748 | 30 |
| test | 9 | 700 | 11 |
| web | 44 | 1200 | 207 |

### Phát hiện

| Mức | Mã | Luật | Chỗ | Commit | Vì sao | Dòng |
|---|---|---|---|---|---|---|
| cảnh báo | H-DIRECT-MAIN | R-QG-1, R-REV-1 | `(git)` | 2bd97a1 eca1200 37b41bb 3e45f20 9f389af d7850b9 c7dea90 6c085e9 bace27b 1c336a7 f03e8e6 392d97e 6cd9908 2b7ebde | không qua PR / CI / người duyệt | `14/14 commit đẩy thẳng origin/main` |
| cảnh báo | H-FRAMEWORK | R-REV-2, R-SIG | `packages/contracts/src/mua-hang/engine.ts` | 3e45f20 f03e8e6 6cd9908 | người đóng góp sửa tệp framework — chủ dự án duyệt + dấu R-SIG |  |
| cảnh báo | H-FRAMEWORK | R-REV-2, R-SIG | `packages/contracts/src/mua-hang/gia-mua.ts` | eca1200 37b41bb | người đóng góp sửa tệp framework — chủ dự án duyệt + dấu R-SIG |  |
| cảnh báo | H-FRAMEWORK | R-REV-2, R-SIG | `packages/contracts/src/mua-hang/khuyen-mai.ts` | f03e8e6 | người đóng góp sửa tệp framework — chủ dự án duyệt + dấu R-SIG |  |
| cảnh báo | H-FRAMEWORK | R-REV-2, R-SIG | `packages/contracts/src/mua-hang/ton-max.ts` | 6c085e9 | người đóng góp sửa tệp framework — chủ dự án duyệt + dấu R-SIG |  |
| cảnh báo | H-FRAMEWORK | R-REV-2, R-SIG | `scripts/lam-sach-mua-hang.sh` | 392d97e | người đóng góp sửa tệp framework — chủ dự án duyệt + dấu R-SIG |  |
| cảnh báo | H-FRAMEWORK | R-REV-2, R-SIG | `scripts/nap-25-truong-hop.mjs` | 1c336a7 392d97e | người đóng góp sửa tệp framework — chủ dự án duyệt + dấu R-SIG |  |
| cảnh báo | H-FRAMEWORK | R-REV-2, R-SIG | `scripts/nap-25-truong-hop.sh` | bace27b 392d97e | người đóng góp sửa tệp framework — chủ dự án duyệt + dấu R-SIG |  |
| cảnh báo | H-MASTERDATA | R-REV-2, R-MD | `apps/api/src/modules/catalog/catalog.service.ts` | 3e45f20 | người đóng góp sửa danh mục chuẩn (lớp M) — Nhóm Lõi rà mã, ĐVT, ràng buộc |  |
| cảnh báo | H-STATUS | R-WF-1 | `apps/api/src/phan-he/mua-hang/service.ts:190` | f03e8e6 | đổi trạng thái bằng UPDATE viết cứng — đi qua workflow (*.workflow.yaml, wf.plan) | `await db.updateTable('purchase_documents').set({ status: 'draft', links: '[]', approved_by: null, approved_at: null, data: sql'data - 'overr` |


## 6. Kết luận: 🟡 ĐẠT có điều kiện

Không có vi phạm chặn ở kiến trúc: không ghi thẳng sổ, không gọi `ledgerService`, không import chéo phân hệ, không viết số tài khoản, không bí mật, không test `.only`. Có test đi kèm, toàn bộ test xanh.

Dữ liệu kế toán của bộ 25 trường hợp **đúng ở mọi phép đối chiếu**: sổ cân, công nợ = 331, kho = 156, tiền tròn đồng, mã hàng, ĐVT. Ngoại lệ là sổ hoá đơn ↔ 133, đây là chính sách của Kernel, không phải việc của đợt này (§3).

| # | Việc | Người | Trạng thái |
|---|---|---|---|
| a | Bật bảo vệ nhánh `main` (PR, CI xanh, 1 người duyệt); từ nay Thủy làm qua PR | chủ dự án · Thủy | ☐ |
| b | Rà dữ liệu kế toán R-REV-6 (§3) | Nhóm Lõi | ✅ 2026-10-31 |
| c | Rà sâu `modules/catalog/catalog.service.ts` | Nhóm Lõi | ✅ — còn cảnh báo kế thừa tỉ lệ ĐVT (§4) → việc f |
| d | Duyệt thay đổi `packages/contracts/src/mua-hang/*`; xếp lịch PHASES 2.8 (tách bộ máy mua hàng khỏi contracts) | chủ dự án | ☐ |
| e | Chọn cách cho SC-SIG-1 với 3 script (§1) | chủ dự án | ☐ |
| f | Mã con kế thừa tỉ lệ ĐVT của mã cha: hỏi người dùng xác nhận khi ĐVT gốc khác nhau (hoặc không kế thừa tỉ lệ ≠ 1) + test | Thủy | ☐ |
| g | Kịch bản 25 trường hợp chạy được trên đơn vị sạch: `chuanBi` khai đủ mặt hàng gốc, nhãn `63` / `34`, nhóm `221`, chế độ định khoản; số "mong đợi" của chính sách cộng dồn (TH15, TH16, TH22) tính trên đúng các phiếu cùng sổ, hoặc mỗi case một kỳ / một NCC riêng | Thủy | ☐ |
| h | **Chính sách kế toán:** phiếu nhập chưa có số hoá đơn vẫn ghi Nợ 1331 (Kernel), nên sổ hoá đơn / bảng kê mua vào ≠ 1331 (lệch 64,45tr ở bộ này). Chọn: giữ (bảng kê đối chiếu phải tính phần chờ hoá đơn) hay ghi thuế chờ hoá đơn ở tài khoản tạm, chuyển 1331 khi có hoá đơn | chủ dự án · kế toán trưởng | ☐ |
| i | Cột `total_before_tax` / `total_tax` của phiếu đổi hàng: ghi ròng (khớp `total`) hoặc ghi rõ nghĩa trong `COMMENT ON` | Nhóm Lõi | ☐ |
| j | Xác nhận đoạn nhãn trong mã hàng (`015`) có phải trùng mã nhãn danh mục (`34`) không (§4) | chủ dự án | ☐ |
