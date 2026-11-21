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
_(điền khi code xong)_

## 7. Lịch sử thay đổi
| Ngày | Thay đổi |
|---|---|
| 21/11/2026 | Tạo phiếu, chốt Q1–Q4; giữ chỗ code |
