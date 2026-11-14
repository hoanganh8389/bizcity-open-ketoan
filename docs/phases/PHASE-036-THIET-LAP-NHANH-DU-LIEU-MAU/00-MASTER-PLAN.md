# PHASE-036 · 00 — Kế hoạch & thiết kế: Thiết lập nhanh và dữ liệu mẫu
<!-- [2026-11-10 11:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — W0: hiện trạng đọc mã, quyết định D036-1..12, hộp thoại 4 bước, gói mẫu, 18 báo cáo đích, chống mất dữ liệu, bước thắng nhỏ B1..B7, câu hỏi Q036-1..6 -->

> Đề bài và trả lời ngắn: [README](README.md). Bản mẫu chạy được: [mockups/thiet-lap-nhanh.html](mockups/thiet-lap-nhanh.html).

## 1. Hiện trạng (đọc mã ngày 2026-11-10)

| Phần | Hôm nay | Tệp |
|---|---|---|
| Tạo đơn vị | Chỉ có `seed()` lúc chạy job `db-migrate`: đơn vị `SEED_TENANT_CODE` (mặc định `demo`), chủ đơn vị, khoá API, hệ thống tài khoản `tai-khoan.csv`, gói định khoản nền, loại tài sản, nhóm CCDC, nhóm đối tượng, chi nhánh `CN01`. **Không có chứng từ.** Không có route tạo đơn vị qua HTTP | `packages/kernel/src/db/seed.ts`, `apps/api/src/db/setup.ts` |
| Đăng nhập lần đầu | Không chạy gì. Không có chỗ nào nhận biết "đơn vị trống". Màn Tổng quan (`/`) hiện "—" | `apps/web/src/features/launcher/TongQuanPage.tsx` |
| Preset | `bizcity_preset@1` (STD-PRE-1..7: dữ liệu hư cấu, chỉ qua API, `docKey` tiền tố `preset:<id>:`, ngày `@today-N`, không số tài khoản). Một preset `thuong-mai-ban-le`: 3 chi nhánh, đối tượng, mặt hàng, **3 chứng từ**. Chỉ chạy bằng dòng lệnh `scripts/cai-preset.mjs` | `docs/contracts/BIZCITY-PRESET-v1.md`, `presets/thuong-mai-ban-le/` |
| Danh mục gốc | `db/seeds/*.jsonl` — từ S030-53 là bộ giả lập; chỉ vào đơn vị qua TI08 / nút ở đầu màn danh mục | `packages/kernel/src/modules/default-data/`, `apps/web/src/features/flow/DefaultDataPages.tsx`, `apps/web/src/components/PageHeader.tsx` |
| Nguồn chứng từ mẫu | 14 mẫu cửa nạp `docs/api/vi-du/*.json`; `examples/pos-mini/`; bộ 25 tình huống mua hàng (chạy trong container, cần đơn vị sạch) | `docs/api/vi-du/`, `scripts/mua-hang/nap-25-truong-hop.mjs` |
| Cửa nạp | 10 loại: `sale`, `sale_return`, `customer_payment`, `purchase`, `purchase_return`, `supplier_payment`, `transfer`, `stock_adjustment`, `cash_transfer`, `manual_journal` | `packages/contracts/src/documents.ts` |
| Ngoài cửa nạp | Phiếu thu / chi lẻ (`/api/v1/vouchers`), số dư đầu kỳ (`createOpening`), tài sản + khấu hao (`/api/v1/assets*`), giá vốn (dịch vụ giá vốn), tờ khai (`/api/v1/vat-returns/build`) | Kernel / Core |
| Lương | **Chưa có** phân hệ | — |
| Giao diện | `@bizcity/ui-kit` có `Modal` (`title`, `footer`, `wide`), `Field`, `Money`, `StatusBadge`; **không có** Stepper / Wizard | `packages/ui-kit/src/index.tsx` |
| Sao lưu | `scripts/sao-luu.sh` (pg_dump nén, giữ 14 bản); khôi phục ghi đè cả CSDL, chỉ ghi trong chú thích script; `cap-nhat.sh` sao lưu trước khi nâng cấp nhưng không kiểm bản sao lưu | `scripts/sao-luu.sh`, `scripts/cap-nhat.sh` |

## 2. Quyết định (chủ dự án duyệt 2026-11-13) <!-- [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — chủ dự án: "theo đề nghị" — D036-1..12 chấp nhận, Q036-1..6 theo cột Đề nghị -->

| Mã | Quyết định | Vì sao |
|---|---|---|
| D036-1 | **"Đơn vị trắng"** = đơn vị chưa có bút toán nào trên sổ **và** chưa có chứng từ nào ở bất kỳ trạng thái nào (kể cả nháp, chờ duyệt, bị giữ). Danh mục do `seed()` tạo không tính. Một hàm duy nhất `tenantEmptiness()` trả `{ empty, reasons[] }`; mọi nơi (hộp thoại, tự nạp, nạp mẫu) gọi lại hàm này **trong giao dịch, có khoá** ngay trước khi ghi | Tránh nạp mẫu chồng lên dữ liệu thật khi hai người cùng bấm, hoặc khi kế toán vừa nhập chứng từ đầu tiên |
| D036-2 | **Dữ liệu mẫu ở một đơn vị mẫu riêng** (mã `mau`, tên "Công ty mẫu", cờ `tenants.is_sample`), không nạp nghiệp vụ mẫu vào đơn vị thật. Đơn vị mẫu có biểu ngữ "Dữ liệu mẫu" trên mọi màn, **không gửi được tờ khai / hoá đơn ra ngoài**, xoá cả đơn vị được (chỉ đơn vị có cờ mẫu) | Sổ chỉ thêm (câu không thương lượng 2): chứng từ mẫu trong đơn vị thật không xoá được, đảo bút toán vẫn để lại vết trên sổ và tờ khai. Tách đơn vị thì "bắt đầu thật" sạch |
| D036-3 | **Cài mới tự nạp:** job `db-migrate` thấy CSDL vừa khởi tạo (chưa có đơn vị nào ngoài đơn vị vừa tạo, đơn vị đó trắng) và biến `BIZCITY_SAMPLE=<preset>` thì tạo đơn vị mẫu và nạp gói. `cai-nhanh.sh` đặt mặc định `BIZCITY_SAMPLE=thuong-mai-ban-le`; image cho khách có thể tắt (`BIZCITY_SAMPLE=off`) | Ai cài mới cũng thấy hệ thống chạy ngay (smallwin) mà không phải học dòng lệnh |
| D036-4 | **Không bao giờ nạp mẫu vào đơn vị đã có dữ liệu**, kể cả khi người dùng bấm. Nâng cấp image không chạy lại gói mẫu ở đơn vị đã nạp (ghi `sample_runs` theo phiên bản gói) | Đề bài 3: chống mất / lẫn dữ liệu |
| D036-5 | **Gói mẫu = preset mở rộng** (`bizcity_preset@1` 1.1.0): thêm khối `openings` (số dư đầu kỳ), `vouchers` (thu chi lẻ), `assets` (tài sản + chạy khấu hao), `close` (kết chuyển cuối tháng), `returns` (lập tờ khai nháp), `settings` (tài khoản ngầm định, chế độ ghi sổ). Mỗi khối chỉ gọi API Core có sẵn | Một khuôn cho preset ngành và gói mẫu; người đóng góp thêm ngành mới (dịch vụ, sản xuất…) không phải viết mã |
| D036-6 | **Nghiệp vụ mẫu đi đúng đường của chứng từ thật:** cửa nạp (`postDocumentIn` → luật định khoản → `ledgerService.post()`), phiếu và tài sản qua route Core. **Không** ghi thẳng bảng sổ, **không** số tài khoản trong gói, **không** tự tính giá vốn (STD-PRE-3, STD-PRE-7, bốn câu không thương lượng) | Báo cáo mẫu khớp sổ vì chính Kernel định khoản; gói mẫu cũng là bài kiểm luồng đầu–cuối |
| D036-7 | **Máy chủ chạy gói** (`core.setup.*`), không bắt trình duyệt gọi trăm lần API: `core.setup.status` (trắng hay không, đã nạp gói nào), `core.setup.plan` (xem trước: số dòng mỗi khối, báo cáo sẽ lên số; không ghi), `core.setup.apply` (chạy nền, có tiến độ từng bước, chạy lại được: `docKey` / mã cố định nên lần hai bỏ qua phần đã có). `cai-preset.mjs` gọi lại `core.setup.apply` thay vì tự gọi từng API | Một đường, một bộ kiểm; chạy lại sau lỗi mạng không nhân đôi |
| D036-8 | **Ngày tương đối:** gói mẫu trải **3 tháng gần nhất đến hôm nay** (`@month-2`…`@today`), kỳ đầu có số dư đầu kỳ; tháng trước được kết chuyển để B02 có số, tờ khai GTGT tháng trước lập được | Báo cáo theo kỳ hiện tại và kỳ trước đều có số khi mở |
| D036-9 | **Quay về dữ liệu gốc (TI08) an toàn:** bắt buộc bước **xem trước** (thêm / sửa / đổi mã / xoá / khoá theo từng bộ); **tự sao lưu** các bảng danh mục chạm tới (bảng `default_data_backups`, giữ 10 lần) trước khi ghi, có nút *Lấy lại bản trước*; **chặn** khi tệp gốc là bộ giả lập (`_nguon: "gia-lap"`) mà đơn vị đã có chứng từ — báo dùng `SEEDS_DIR`. Đơn vị trắng thì nút này đổi thành *Thiết lập nhanh* | Đề bài 3 |
| D036-10 | **Nâng cấp image (`cap-nhat.sh`):** sao lưu → **kiểm bản sao lưu** (`pg_restore --list` / đọc thử, cỡ tệp > 0, đếm bảng) → in bảng "cái gì có thể đổi" (migration mới, tệp gốc đổi, `SEEDS_DIR` có đặt không) → hỏi xác nhận (bỏ qua bằng `--yes`) → nâng cấp → kiểm sức khoẻ; lỗi thì in đúng lệnh lùi lại | Đề bài 3 |
| D036-11 | **Tài liệu vận hành sao lưu – khôi phục** `docs/ops/SAO-LUU-KHOI-PHUC.md`: lịch (hằng đêm, giữ bao lâu, để ở máy khác), kiểm bản sao lưu, **khôi phục thử vào CSDL tạm** trước khi ghi đè, khôi phục một đơn vị; `sao-luu.sh --kiem <tệp>` và `khoi-phuc-thu.sh <tệp>` | Hướng dẫn SQL hiện chỉ nằm trong chú thích script |
| D036-12 | **Thư viện và dữ liệu mẫu chung một mục tiêu:** danh mục chuẩn của gói mẫu lấy từ thư viện (`core.khoan-muc`, `vn.loai-thue`, `core.ly-do-dinh-khoan`, `vn.ngay-nghi-le`) và bộ giả lập `db/seeds`; mỗi chứng từ mẫu qua được `npx bizcity event check` (L5) | PHASE-030: thư viện tham chiếu đặt mục tiêu "cài mới là chạy" |

## 3. Luồng tổng

```text
Cài mới (cai-nhanh.sh / docker compose up)
  └─ job db-migrate: migration → seed() → [BIZCITY_SAMPLE ≠ off và CSDL vừa khởi tạo]
        └─ tạo đơn vị "Công ty mẫu" (is_sample) → core.setup.apply(thuong-mai-ban-le)
Đăng nhập
  ├─ đơn vị đang dùng TRẮNG + quyền settings:write → mở hộp thoại Thiết lập nhanh (một lần; tắt được, mở lại ở menu TI09)
  │     ├─ "Xem công ty mẫu"            → chuyển sang đơn vị mẫu (tạo + nạp nếu chưa có) → Tổng quan có số
  │     └─ "Thiết lập công ty của tôi"  → nạp cấu hình + danh mục chuẩn vào đơn vị này (không nghiệp vụ mẫu)
  ├─ đơn vị mẫu → biểu ngữ "Dữ liệu mẫu · Bắt đầu với công ty của bạn"
  └─ đơn vị có dữ liệu → không hộp thoại; TI08 chỉ chạy qua xem trước + sao lưu
```

## 4. Hộp thoại Thiết lập nhanh (UI / UX)

Bản mẫu bấm thử được: [mockups/thiet-lap-nhanh.html](mockups/thiet-lap-nhanh.html). Dựng trên `Modal` của ui-kit (thêm `Steps` — thành phần chỉ báo bước, đề xuất vào ui-kit, R-KER-8: ≥ 2 màn dùng — hộp thoại này và nhập Excel). Màn ở module mới `modules/thiet-lap/` (ADR-0024), mã màn **TI09**.

**Khi nào hiện:** đơn vị trắng (D036-1) **và** người dùng có `settings:write` **và** chưa bấm "Để sau" trong phiên. Người không có quyền thấy biểu ngữ "Đơn vị chưa có dữ liệu — nhờ chủ đơn vị thiết lập".

| Bước | Tên | Nội dung | Nút |
|---|---|---|---|
| 1 | **Bắt đầu** | Hai thẻ lựa chọn lớn: **Xem công ty mẫu** (khuyên dùng lần đầu — 3 tháng nghiệp vụ, 18 báo cáo có số, không đụng dữ liệu của bạn) · **Thiết lập công ty của tôi** (cấu hình + danh mục chuẩn, sổ trống để nhập thật). Dòng nhỏ: "Có thể làm cả hai: xem mẫu trước, thiết lập sau" | Tiếp · Để sau |
| 2 | **Công ty** | Tên công ty, MST (công ty mẫu: điền sẵn giả lập, khoá), năm tài chính bắt đầu, chế độ kế toán (TT99 — chỉ một lựa chọn), phương pháp thuế GTGT (khấu trừ), **ngành** (Thương mại bán lẻ ✓ · Dịch vụ · Sản xuất · Xây dựng — "sắp có", mờ) | Quay lại · Tiếp |
| 3 | **Nạp gì** | Danh sách khối, mỗi khối một hàng: tick · tên · số dòng (từ `core.setup.plan`) · báo cáo mở khoá. Cấu hình và hệ thống tài khoản luôn bật (khoá). Công ty của tôi: chỉ hiện Cấu hình, Danh mục chuẩn, Danh mục mẫu (tuỳ chọn, mặc định tắt). Cột phải: "Báo cáo sẽ có số" — danh sách 18 báo cáo, sáng lên theo khối đã tick | Quay lại · **Nạp dữ liệu** |
| 4 | **Đang nạp → Xong** | Từng khối: đang chạy / xong (số dòng) / lỗi (mã lỗi + *Thử lại*; phần đã xong giữ nguyên — chạy lại không nhân đôi). Xong: lưới báo cáo bấm mở ngay (B01, B02, Tổng quan…), dòng "Kiểm sổ: Nợ = Có ✓, công nợ khớp 131/331 ✓, tồn kho khớp 156 ✓" (chẩn đoán chạy sau khi nạp) | Mở Tổng quan · Đóng |

**Chữ trên màn** (theo `docs/framework/04-DAT-TEN-BIZCITY.md`, tiếng Việt, nói theo người dùng): "Nạp dữ liệu" chứ không "Seed"; "Công ty mẫu" chứ không "tenant demo"; lỗi nói chỗ sai và cách sửa ("Không lập được tờ khai tháng 10: thiếu thông tin người nộp thuế — mở TT01").

**Sau khi nạp:** đơn vị mẫu có biểu ngữ vàng cố định đầu trang: *"Bạn đang xem Công ty mẫu — số liệu hư cấu. [Bắt đầu với công ty của bạn] [Ẩn]"*. Mọi chứng từ mẫu có nhãn "mẫu" ở danh sách (theo tiền tố `docKey`).

## 5. Gói mẫu `thuong-mai-ban-le` 1.1 và 18 báo cáo đích

| Khối | Nội dung (giả lập) | Đường vào | Báo cáo mở khoá |
|---|---|---|---|
| Cấu hình | Thông tin người nộp thuế (giả), tài khoản ngầm định, chế độ ghi sổ tự động 6 loại chứng từ, gói định khoản thương mại, năm tài chính | API cài đặt / TT01 / gói định khoản | — |
| Danh mục | 3 chi nhánh + kho, 40 mặt hàng 3 nhóm thuế suất (0 / 5 / 8 / 10 %), 30 đối tượng (NCC, khách buôn, nhân viên), 3 tài khoản ngân hàng, hình thức thanh toán | API danh mục (`core.item.*`, `core.partner.*`) | — |
| Số dư đầu kỳ | Tiền mặt, tiền gửi, hàng tồn, công nợ phải thu / phải trả, vốn góp | `createOpening` (phiếu đầu kỳ Core) | B01, cân đối phát sinh |
| Mua hàng | 12 phiếu mua có hoá đơn (2 NCC trả chậm), 1 trả hàng NCC | cửa nạp `purchase`, `purchase_return` | Bảng kê mua vào, công nợ phải trả, nhập xuất tồn |
| Bán hàng | 30 đơn bán (lẻ + buôn, tiền mặt / chuyển khoản / công nợ), 2 trả hàng | `sale`, `sale_return` | Bán hàng chi tiết / tổng hợp, lãi gộp, bảng kê bán ra |
| Thu chi – công nợ | Thu tiền khách, trả tiền NCC theo hoá đơn, nộp tiền vào ngân hàng; 6 phiếu chi lẻ (điện, nước, thuê nhà, lương khoán) | `customer_payment`, `supplier_payment`, `cash_transfer`; `/vouchers` | Sổ quỹ, sổ tiền gửi, tuổi nợ, đối chiếu công nợ, B03 |
| Kho | 2 chuyển kho, 1 kiểm kê điều chỉnh | `transfer`, `stock_adjustment` | Thẻ kho, nhập xuất tồn |
| Tài sản | 2 tài sản cố định + 1 CCDC, chạy khấu hao 3 tháng | `/api/v1/assets*` | Sổ tài sản, bảng khấu hao |
| Cuối kỳ | Giá vốn, kết chuyển tháng trước; lập tờ khai GTGT nháp tháng trước | dịch vụ giá vốn / kết chuyển Core; `/vat-returns/build` | B02, tờ khai GTGT, B09 (phần số) |

**18 báo cáo đích** (mã màn): ACC8 B01 · ACC9 B02 · ACC13 B03 · ACC10 cân đối phát sinh · ACC88 sổ cái · ACC89 nhật ký chung · ACC38 công nợ · ACC67 tuổi nợ · ACC83 nhập xuất tồn · ACC82 thẻ kho · ACC80 sổ quỹ · BH02 bán hàng tổng hợp · BH05 lãi gộp · ACC66 tờ khai GTGT · ACC64 / ACC65 bảng kê mua vào / bán ra · ACC28 sổ tài sản · Tổng quan (`/`).

**Ca nghiệm thu T036-1:** nạp gói trên CSDL test sạch → mỗi báo cáo đích **khác rỗng**; `scripts/doi-chieu-ke-toan.sql` ĐẠT (Nợ = Có, công nợ ↔ 131 / 331, hoá đơn ↔ 133, kho ↔ 156); chạy lại `apply` lần hai **không thêm dòng nào**. **Lương** ngoài phạm vi (chưa có phân hệ) — khi có thì thêm khối.

## 6. An toàn (gom đề bài 3)

| Rủi ro | Chặn ở đâu | Bằng chứng |
|---|---|---|
| Nạp mẫu chồng dữ liệu thật | `tenantEmptiness()` trong giao dịch có khoá; D036-4 | T036-2: đơn vị có 1 chứng từ nháp → `apply` trả `CONFLICT` mã `SETUP-NOT-EMPTY` |
| Quay về gốc ghi đè danh mục thật | Xem trước bắt buộc, sao lưu tự động, chặn bộ giả lập trên đơn vị có chứng từ (D036-9) | T036-5..7 |
| Tệp gốc là bộ giả lập trên bản cài thật | Thẻ cảnh báo ở TI08 + dòng cảnh báo ở `cap-nhat.sh` khi chưa đặt `SEEDS_DIR` | T036-8 |
| Nâng cấp hỏng, không lùi được | Kiểm bản sao lưu trước khi nâng cấp (D036-10) | `scripts/kiem-nang-cap.sh` + ca `cap-nhat.sh --kiem` |
| Sao lưu có mà không khôi phục được | `khoi-phuc-thu.sh` vào CSDL tạm, đếm bảng / Nợ = Có (D036-11) | ca chạy tay trong tài liệu ops, ghi bằng chứng |
| Dữ liệu mẫu bị gửi ra ngoài (tờ khai, hoá đơn điện tử) | Đơn vị `is_sample` chặn ở action gửi (connector), không chỉ ẩn nút | T036-4 |

## 7. Bước thắng nhỏ (mỗi bước một PR, có giữ chỗ)

| Bước | Việc | Thấy được gì | Mức |
|---|---|---|---|
| B1 | `tenantEmptiness()` + `core.setup.status`; biểu ngữ "Đơn vị chưa có dữ liệu" ở Tổng quan | Cài mới vào là được chỉ đường, không còn màn "—" | K1 |
| B2 | `core.setup.plan` / `apply` chạy preset có sẵn ở máy chủ; `cai-preset.mjs` gọi qua đây | Một nút nạp 3 chứng từ mẫu → B01 / B02 có số | K1 |
| B3 | Hộp thoại 4 bước (`modules/thiet-lap/`, TI09) + `Steps` ở ui-kit | Kế toán tự nạp không cần dòng lệnh | R1 |
| B4 | Gói `thuong-mai-ban-le` 1.1 (preset 1.1.0: openings, vouchers, assets, close, returns) | 18 báo cáo đích có số, T036-1 | R2 |
| B5 | Đơn vị mẫu riêng (`is_sample`, Q036-1) + tự nạp ở `db-migrate` (`BIZCITY_SAMPLE`) | Cài mới là có Công ty mẫu | K2 (migration, tạo đơn vị) |
| B6 | TI08 an toàn (D036-9) + `cap-nhat.sh` kiểm sao lưu (D036-10) + `docs/ops/SAO-LUU-KHOI-PHUC.md` (D036-11) | Hết đường mất dữ liệu bằng một cú bấm | K1 |
| B7 | Nghiệm thu: T036-1..8, `docs/huong-dan/thiet-lap-nhanh.md`, ảnh màn | Ai cài mới cũng đi hết luồng trong 5 phút | — |

B6 không phụ thuộc B1..B5 — làm song song được, và **nên làm sớm** vì rủi ro mất dữ liệu đang có ở bản cài hiện tại.

## 8. Câu hỏi cho chủ dự án — **đã trả 2026-11-13: theo cột Đề nghị**

| Mã | Câu hỏi | Đề nghị |
|---|---|---|
| Q036-1 | Dữ liệu mẫu ở **đơn vị mẫu riêng** (cần năng lực tạo / chuyển đơn vị — hiện chưa có route) hay nạp thẳng vào **đơn vị trắng đang dùng** (bắt đầu thật = tạo đơn vị mới / cài lại)? | Đơn vị mẫu riêng (D036-2) |
| Q036-2 | Cài mới **mặc định bật** nạp mẫu (`BIZCITY_SAMPLE=thuong-mai-ban-le`), hay mặc định tắt và chỉ hộp thoại hỏi? | Bật ở `cai-nhanh.sh` (bản dùng thử), tắt ở image phát hành cho khách — hộp thoại vẫn hỏi |
| Q036-3 | Gói mẫu đầu tiên chỉ **thương mại bán lẻ**, hay làm luôn **dịch vụ**? | Thương mại bán lẻ trước (đã có preset, phủ kho + giá vốn); dịch vụ là gói thứ hai |
| Q036-4 | Đơn vị mẫu được **xoá cả đơn vị** (ngoại lệ có kiểm soát của câu không thương lượng 2, chỉ cho `is_sample`) hay chỉ "ngừng dùng"? | Xoá được, chỉ đơn vị mẫu, ghi bằng chứng; cần dòng ở RULE-LEDGER danh sách ngoại lệ đóng |
| Q036-5 | "Thiết lập công ty của tôi" có nạp **danh mục mẫu** (mặt hàng, đối tượng giả lập) không? | Không mặc định — chỉ cấu hình + danh mục chuẩn; danh mục mẫu là tick tuỳ chọn |
| Q036-6 | Ưu tiên **B6 (chống mất dữ liệu)** trước hộp thoại? | Có — B6 trước hoặc song song B1 |

## 9. Chữ chốt B6 (2026-11-13) <!-- [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — chữ chốt B6: S036-8a xem trước có mã + sao lưu danh mục + chặn bộ giả lập; S036-8b lấy lại bản trước; S036-9 nâng cấp và sao lưu -->

**S036-8a — quay về dữ liệu gốc không còn là một cú bấm** (Kernel `modules/default-data`, K1):

- **Xem trước bắt buộc:** gọi chính action quay về ở chế độ chạy thử (`POST /api/v1/default-data/:key/restore?dryRun=1`, `POST /api/v1/default-data/all/restore?dryRun=1` — runtime action chạy thật trong giao dịch rồi huỷ, STD-ACT-7) → số thêm / sửa / xoá / khoá và cảnh báo **thật**, không ước lượng. Trả `previewToken` (HMAC theo đơn vị, bộ, người, kết quả, giờ lập; sống 15 phút). <!-- [2026-11-13 09:05 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-8a: xem trước dùng dryRun của runtime action thay route /preview riêng; migration lấy số kế tiếp lúc tạo tệp -->
- **Ghi cần mã xem trước:** `restore` nhận `{ confirm: true, previewToken }`. Thiếu / hết hạn → `VALIDATION`. Ghi xong mà kết quả khác lúc xem trước (dữ liệu đã đổi ở giữa) → huỷ cả giao dịch, `CONFLICT` *"Danh mục đã đổi sau khi xem trước — xem trước lại"*.
- **Sao lưu tự động trước khi ghi:** bảng `default_data_backups` (migration số kế tiếp): đơn vị, bộ, người, giờ, kết quả, ảnh chụp JSON các dòng của đơn vị ở những bảng bộ đó chạm tới (mỗi bộ khai `tables[]`). Giữ 10 bản gần nhất mỗi đơn vị. `GET /api/v1/default-data/backups` (danh sách), `GET /api/v1/default-data/backups/:id` (tải ảnh chụp). Cùng giao dịch với lần ghi: sao lưu hỏng thì không ghi.
- **Chặn bộ giả lập trên đơn vị thật:** tệp gốc có `_nguon: "gia-lap"` (S030-53) và đơn vị đã có bút toán → từ chối `VALIDATION` *"Tệp gốc là dữ liệu mẫu giả lập… đặt SEEDS_DIR tới bộ danh mục của công ty"*. **Không** áp cho `catalog_sample` (làm sạch mặt hàng): bộ này thiết kế để chạy trên đơn vị có sổ (giữ mã đã vào sổ, test của người đóng góp) — vẫn phải xem trước và có ảnh chụp. <!-- [2026-11-13 08:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — S036-8a: catalog_sample không chặn theo bút toán (tránh phá tính năng đã có); chủ dự án đổi được -->
- **Giao diện:** nút Quay về ở đầu màn danh mục và TI08 mở hộp thoại: xem trước (bảng số theo bộ, cảnh báo) → tick "Tôi hiểu…" → *Quay về* → báo mã bản sao lưu. Không còn `window.confirm`.

**S036-8b — Lấy lại bản trước** từ `default_data_backups` (ghi đè theo mã các bảng trong ảnh chụp); xem lại `org-units/restore-defaults` (sơ đồ tổ chức) theo cùng khuôn. Làm sau 8a.

**S036-9 — nâng cấp và sao lưu** (công cụ hạ tầng):

- `scripts/sao-luu.sh --kiem <tệp>`: tệp tồn tại, gunzip đọc hết, có `COPY public.ledger_entries`, đếm bảng; mã thoát ≠ 0 khi hỏng.
- `scripts/khoi-phuc-thu.sh <tệp>`: khôi phục vào CSDL tạm `ketoan_khoi_phuc_thu`, đếm dòng các bảng chính, kiểm Nợ = Có, rồi xoá CSDL tạm — **không chạm CSDL đang chạy**.
- `scripts/cap-nhat.sh`: sao lưu → `sao-luu.sh --kiem` (hỏng thì **dừng**) → in "sắp đổi gì" (số commit, migration mới, tệp `db/seeds` đổi, `SEEDS_DIR` có đặt không, `db/seeds` là bộ giả lập) → hỏi xác nhận (`--yes` bỏ qua) → nâng cấp; lỗi thì in đúng lệnh lùi (`git checkout <commit cũ>` + lệnh khôi phục bản vừa sao).
- `docs/ops/SAO-LUU-KHOI-PHUC.md`: lịch hằng đêm, giữ bao lâu, chép ra máy khác, kiểm bản sao lưu, khôi phục thử, khôi phục thật (ghi đè), những gì **không** nằm trong bản sao lưu (`.env`, `SEEDS_DIR`, tệp đính kèm).

**S036-11 — `SEEDS_DIR` có tác dụng trên bản cài Docker** (hạ tầng, K1) <!-- [2026-11-14 01:46 PM Johnny Chu - Chu Hoàng Anh] PHASE-036 — chữ chốt S036-11: compose gắn thư mục danh mục của công ty chỉ đọc, biến trong container chỉ có khi .env đặt; cap-nhat dừng khi thư mục sai / thiếu tệp; TI08 báo bộ đang đọc -->

- **Compose:** `SEEDS_DIR` trong `.env` là đường dẫn **trên máy chủ**. Service `api` và `db-migrate` gắn `${SEEDS_DIR:-./db/seeds}` vào `/srv/bizcity-seeds` **chỉ đọc**, và đặt biến trong container `SEEDS_DIR: ${SEEDS_DIR:+/srv/bizcity-seeds}` — trống thì biến trong container trống, API đọc `db/seeds` có sẵn trong ảnh như cũ (không đổi hành vi bản cài chưa đặt).
- **`packages/platform/src/db/paths.ts`:** chuỗi rỗng coi như chưa đặt (`||` thay `??`) cho `DB_DIR`, `SEEDS_DIR`, `PACKS_DIR`.
- **Thay cả thư mục, không trộn từng tệp:** thư mục của công ty phải là bản **đủ** (chép cả `db/seeds` rồi thay tệp thật). Không tự lấy tệp thiếu từ bộ giả lập — lấy nhầm là nạp dữ liệu giả vào đơn vị thật.
- **`scripts/cap-nhat.sh`:** `SEEDS_DIR` đặt mà thư mục không có, hoặc thiếu tệp có trong `db/seeds` của bản mới → **dừng trước khi kéo mã**, in danh sách tệp thiếu. Docker không được tự tạo thư mục rỗng thay cho bộ danh mục.
- **TI08:** `GET /api/v1/default-data` trả `seedsSource` (`bundled` | `custom`, không lộ đường dẫn máy chủ) và mỗi bộ `synthetic` (tệp có `_nguon: "gia-lap"`); màn TI08 hiện dải báo đang đọc bộ nào, bộ nào là giả lập.
- **Kiểm:** `docker compose config` với `.env` có / không đặt `SEEDS_DIR`; test API cho `seedsSource` / `synthetic`; chạy thật trên stack dev với thư mục ngoài repo.
