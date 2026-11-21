# NT-BH-035 · Dọn việc treo bán hàng (kênh + voucher BH10, quà trả về KKM, mặt hàng dịch vụ không ghi kho, mã máy khi giữ số, tạo khách trên POS)
<!-- [2026-11-21 Võ Hoàng] NGHIEM-THU — chốt NT-BH-035 (anh Hoàng, 21/11) (đóng góp) -->

| | |
|---|---|
| Phân hệ | Bán hàng (module `pos`, `phieu-ban`); lõi kho (loại kho, thẻ kho) |
| Màn hình | BH10 Phiếu bán, BH11 Phiếu trả, BH17 Cài đặt bán hàng, BH20 Đơn đặt hàng, BH23 Báo cáo khách hàng; POS React (máy bán) |
| Ngày tạo | 21/11/2026 |
| Trạng thái | **Đã chốt 21/11/2026** (Võ Hoàng) |
| Căn cứ | Việc còn treo sau NT-BH-024, 026, 027, 028, 034; `TIEN-DO.md` (docs123) |

## 1. Hiện trạng
1. BH10: API phiếu bán đã nhận kênh bán và mã voucher (NT-BH-026), màn chưa có ô chọn kênh, ô nhập voucher.
2. Trả hàng: dòng quà trả về kho bán. Loại kho `sale_return_in` (0128) chỉ cho `KTL`, `KHH` — kho quà `KKM` bị chặn.
3. Mặt hàng `items.kind = 'service'` (vd phí vận chuyển) vẫn sinh dòng thẻ kho và giá vốn như hàng hoá. Phiếu bán đang lách bằng cách bỏ riêng dòng phí ship (`SHIP_LINE_KEY`, `feeSku`).
4. Máy bán giữ dải số (`mod_pos.code_reservations`) có cột `device_id` nhưng React chưa gửi mã máy.
5. BH20, BH17, BH23 chưa kiểm bằng trình duyệt thật.
6. Máy bán chỉ tạo khách khi lập đơn. Cửa hàng muốn thêm khách mới ngay, không cần đơn.

## 2. Đã chốt (21/11/2026, Võ Hoàng)
| # | Câu hỏi | Chốt |
|---|---|---|
| Q1 | Phạm vi đợt này | Làm cả bốn nhóm: (a) ô kênh + voucher ở BH10; (b) quà trả về KKM + phí ship không trừ kho; (c) mã máy khi giữ số; (d) kiểm giao diện BH20 / BH17 / BH23 |
| Q2 | Quà khách trả về kho nào | **Cho về kho KKM** của cửa hàng nhận trả |
| Q3 | Phí vận chuyển không trừ kho bằng cách nào | **Mặt hàng dịch vụ không ghi kho** (theo `items.kind`, áp chung, không lách riêng mã phí ship) |
| Q4 | Tạo khách trên POS | "Thêm được khách mới trên POS luôn, không cần phải có đơn bán" — đi **qua website + khoá API cầu nối** |

## 3. Cách làm
### 3.1 BH10 — kênh bán, voucher
- `PhieuBanPages.tsx` / `PhieuHangForm.tsx`: ô **Kênh bán** (danh sách từ `pos.channel.list` qua API phiếu bán đang có) và ô **Mã voucher** (kiểm qua báo giá phiếu, hiện số được giảm, lỗi rõ khi mã sai / hết lượt). Không đổi API.
- Quyền: dùng quyền lập / sửa phiếu bán hiện có; không thêm mã quyền.

### 3.2 Quà trả về KKM (Q2)
- **Migration lõi 0178:** thêm `KKM` vào `warehouse_type_ops.sale_return_in` của mọi đơn vị và vào bộ mặc định cho đơn vị mới (giữ thứ tự `KTL`, `KHH` trước — kho mặc định của "khách trả" không đổi).
- POS (`return-service.ts`) và BH11 phiếu-bán: dòng quà (`isGift`) **nguyên vẹn** vào kho quà của cửa hàng nhận (khoá `bizcity.pos.gift_warehouses`, NT-BH-028; phiếu-bán hỏi `pos.gift-warehouse.get`). Cửa hàng chưa khai kho quà → về kho bán như cũ. Dòng quà **lỗi** vẫn vào KTL như NT-BH-024.

### 3.3 Mặt hàng dịch vụ không ghi kho (Q3) — sửa lõi
- **Kernel kho** (`inventory-movement.repository.ts`): dòng chứng từ có `item_id` trỏ mặt hàng `kind = 'service'` **không** sinh dòng thẻ kho → không có tồn, không vào giá vốn (`costing.service.ts` chỉ đọc thẻ kho). Doanh thu / thuế của dòng vẫn định khoản như cũ.
- Không suy từ mã hàng, không viết `if (sku === …)` (AGENTS: danh mục, combo). Dòng không có `item_id` giữ nguyên hành vi.
- Phiếu bán: bỏ phần lách riêng dòng phí ship ở chỗ tính tồn khi mã phí đã là dịch vụ; cài đặt phí ship (BH17) nhắc khi mã phí chưa là dịch vụ.
- Mức thay đổi Kernel K1 (đổi hành vi có điều kiện, không đổi khuôn, không migration dữ liệu sổ). Thẻ kho cũ của dòng dịch vụ **không** sửa / xoá (sổ chỉ thêm); chỉ áp từ chứng từ mới.

### 3.4 Mã máy khi giữ số
- React (`tgs_pos/react`) gửi `deviceId` (mã máy đã lưu ở máy) khi giữ dải số; API `pos` lưu vào `device_id` (đã có cột). Giữ số không có mã máy vẫn nhận (máy cũ).

### 3.5 Kiểm giao diện BH20 / BH17 / BH23
- Chạy trình duyệt thật trên bản cài thử: lập → gửi → giao → đóng đơn BH20; đổi cài đặt BH17; xem BH23. Lỗi tìm được sửa trong đợt nếu thuộc phạm vi giữ chỗ; ngoài phạm vi thì ghi lại.

### 3.6 Tạo khách trên POS không cần đơn (Q4)
- React: nút **Thêm khách** ở ô tìm khách → form tên, SĐT, (địa chỉ, MST nếu có).
- `tgs_pos` (WP): endpoint mới gọi qua `tgs_accounting_bridge` (khoá API có quyền ghi danh mục) tới `POST /api/v1/partners/upsert` (`core.partner.upsert`, đã có). Kiểm trùng SĐT trước khi tạo (khách đã có → trả khách đó, báo người bán). Lưu bản sao ở WP như khách tạo cùng đơn.
- Không sửa lõi open-ketoan cho phần này.

## 4. Kết quả mong đợi
| Mục | Mong đợi |
|---|---|
| BH10 chọn kênh + nhập voucher hợp lệ | Phiếu lưu kênh; tiền giảm đúng như API; duyệt vào sổ đúng |
| BH10 voucher sai / hết lượt | Báo lỗi rõ, không lưu được |
| Trả hàng có dòng quà, cửa hàng có kho KKM | Dòng quà nhập kho KKM; dòng bán nhập kho bán; tồn KKM tăng |
| Trả hàng có dòng quà, cửa hàng chưa khai kho quà | Như cũ (kho bán) |
| Loại kho "Khách trả" | Có KKM; kho mặc định không đổi |
| Bán / trả mặt hàng dịch vụ (phí ship) | Có doanh thu, thuế; không có dòng thẻ kho, không giá vốn; kiểm tồn âm không chặn |
| Hàng hoá thường | Không đổi (test hồi quy kho, giá vốn hiện có đạt) |
| Giữ dải số từ máy React | `device_id` có mã máy |
| BH20 / BH17 / BH23 trên trình duyệt | Chạy được; lỗi (nếu có) đã sửa hoặc đã ghi |
| Thêm khách trên POS không có đơn | Khách có trong danh mục kế toán (đối tượng khách) và tìm được ngay ở POS; SĐT trùng → dùng khách cũ |

## 5. Kiểm
- Test API: `apps/api/test/nt-bh-035-*.test.ts` (quà về KKM ở POS và BH11; dịch vụ không ghi kho; giữ số có mã máy; loại kho có KKM).
- Hồi quy: test kho / giá vốn / phiếu bán / trả hàng hiện có; `selfcheck --strict`; typecheck.
- React: build `npm run build:hybrid`, e2e thật trên shop thử cho thêm khách và giữ số.

## 6. Kết quả chạy
<!-- [2026-11-21 Võ Hoàng] NGHIEM-THU — NT-BH-035: kết quả chạy phần §3.1–3.4 (đóng góp) -->
Ngày 21/11/2026, nhánh `feat/nt-bh-035-don-viec-treo` — làm §3.1–3.4; §3.5 (kiểm trình duyệt BH20 / BH17 / BH23) và §3.6 (tạo khách trên POS, plugin WP) **chưa làm** trong lượt này.

| Kiểm | Kết quả |
|---|---|
| `apps/api/test/nt-bh-035-don-viec-treo.test.ts` | 10 / 10 đạt (loại kho có KKM, mặc định KTL; quà trả POS → KKM; quà lỗi → KTL; cửa hàng chưa khai kho quà → như cũ; BH11 quà → KKM; dịch vụ bán / trả không thẻ kho, không giá vốn, doanh thu + thuế có; POS bán dịch vụ không tồn không chặn; BH10 chặn tồn bật không chặn dòng dịch vụ + BH17 nhắc; giữ số có `device_id`; BH10 kênh + kiểm voucher) |
| Hồi quy `apps/api` (nt-bh-*, inventory, costing, gia-von, kho, loai-kho, phan-kho, tk-kho, tra-hang, golden, item, phieu-chuyen-kho, nt-kho, posting, kiem-ke) | 54 tệp đạt, 1 bỏ qua · 406 test đạt, 11 bỏ qua |
| Test module `modules/pos/test`, `modules/phieu-ban/test` | 113 / 113, 21 / 21 đạt |
| `npm run typecheck` | đạt |
| `selfcheck` | 27 không đạt như `main`; mới: SC-SIG-1 ở `db/migrations/0178_kho_khuyen_mai_nhan_tra.sql` (migration chưa phát hành cần dấu chủ dự án — chờ chủ quyết, R-SIG) |

Lệch / bổ sung so với §3 (ghi rõ để duyệt):
1. **Loại mặt hàng** nằm ở `item_classification.kind` (theo ngày hiệu lực), không phải `items.kind` — Kernel tra định danh của dòng (`itemId`, không có thì định danh của mã tại ngày như trigger gắn `item_id`) → bản phân loại tại ngày chứng từ. Hiện **chưa có màn / action nào đặt `kind`** (`core.item.classify` chỉ đổi nhóm hạch toán, thuế) và hàm đồng bộ `bizcity_item_classify` tạo bản mới không mang `kind` cũ → cần việc tiếp: khai loại mặt hàng (ngoài phạm vi giữ chỗ).
2. Migration 0178 thêm khung nhìn chỉ đọc `bizcity_read.item_kinds` để module `pos`, `phieu-ban` biết dòng dịch vụ (bỏ kiểm tồn); hai manifest khai `data.reads`. Module chưa được cấp khung nhìn (chưa chạy lại `module migrate`) → như cũ.
3. BH10 "hiện số được giảm": thêm action đọc `phieu-ban.voucher.check` (POST `/api/v1/m/phieu-ban/vouchers/check`, quyền `phieu-ban:write`) — cùng luật lúc duyệt, không giữ mã.
4. Kho quà khai sai (không phải KKM…) khi trả quà nguyên vẹn ở máy bán → `POS_GIFT_WAREHOUSE` như lúc bán quà (NT-BH-028); chưa khai → như cũ.
5. Mã phí ship chưa là dịch vụ: BH10 vẫn bỏ qua kiểm tồn dòng đó như NT-BH-032 (lối lùi), BH17 nhắc.
6. §3.4: action `pos.sequence.reserve` đã nhận / lưu `deviceId` — chỉ thêm test; phần React gửi mã máy ở `tgs_pos`.

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 21/11/2026 | Tạo phiếu, chốt Q1–Q4; giữ chỗ code |
| 21/11/2026 | Code §3.1–3.4 (nhánh `feat/nt-bh-035-don-viec-treo`), điền §6 |
