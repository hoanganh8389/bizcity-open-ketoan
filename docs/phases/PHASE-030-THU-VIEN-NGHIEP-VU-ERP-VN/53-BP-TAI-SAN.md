# PHASE-030 · 53 — Blueprint Tài sản, CCDC, bảo trì, xe (TS01–TS13)
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — blueprint tài sản: phần có ở phan-he/tai-san giữ; đặc tả khấu hao theo ngày, tách tài sản, XDCB, thuê, bảo trì, đội xe -->

Khuôn: [30](30-KHUON-BLUEPRINT.md). Nguồn: `erp/addons/lfood_asset/models/{asset,schedule,depreciation,depr_tools,cip}.py`, `lfood_accrual/models/{accrual,lease}.py`, `lfood_equipment/models/equipment.py`. Phân hệ cũ `phan-he/tai-san/` (+ `apps/api/src/modules/assets/*`) **đóng băng**, sửa tại chỗ cho TS02 / TS03; phần mới → `modules/tai-san/` (XDCB, thuê) và `modules/thiet-bi/` (bảo trì, đội xe).

**Đã có:** `assets.kind = fixed_asset | tool | prepaid`, `status = in_use | stopped | disposed`, `asset_events.kind = revaluation | transfer | audit | increase | decrease`, khấu hao / phân bổ tháng qua `eventStore` (`depreciation`), gợi ý định khoản ghi tăng / giảm, điều chuyển liên chi nhánh, nhập hàng loạt, ACC22–35, TS01 lịch.

**Điểm mở:** `asset.depreciationSchedule` (phương pháp khác đường thẳng), `asset.beforeDispose`.
**Năng lực Kernel cần:** K-030-3 (`accrual` cho thuê / trích trước), K-030-6 (ngưỡng TSCĐ 30 tr, khung thời gian sử dụng TT45).

---

## TS01 Ghi tăng TSCĐ — ✅ đã có. Bổ sung luật: nguyên giá < `tai_san.nguong_tscd` (30 tr, `legalRef` TT45 Điều 3) → chặn ghi tăng TSCĐ, gợi ý ghi CCDC (TS09). Thời gian sử dụng ngoài khung TT45 phụ lục I cho nhóm tài sản → cảnh báo. Golden `T030-TS-2`.

## TS02 Tách tài sản khi số lượng > 1

1. **Mục đích.** Mua 5 máy giống nhau một hoá đơn → 5 thẻ tài sản riêng (mỗi thẻ điều chuyển / thanh lý độc lập).
2. **Chứng từ.** Thao tác trên phiếu ghi tăng (`asset_events.increase`) khi `quantity > 1`: tạo `quantity` bản ghi `assets`, nguyên giá = tổng / SL (`allocate`, M4), mã thẻ hậu tố `-01…`.
3. **Luật.** Σ nguyên giá các thẻ = tổng hoá đơn; khấu hao tính riêng từng thẻ.
4. **Quyền.** `tai-san:write`.
5. **Hạch toán.** Một sự việc `increase` nhiều dòng (một dòng / thẻ) — không đổi.
6. **Golden.** `T030-TS-3` 5 máy 100.000.001 → thẻ 1 = 20.000.001, còn lại 20.000.000; Σ = 100.000.001.

## TS03 Tính và ghi sổ khấu hao hằng tháng — ✅ có; **chốt công thức theo ngày**

1. **Luật (TT45/2013 Điều 9 khoản 9, sửa TT30/2025):** trích từ **ngày** tăng, thôi từ **ngày** giảm.
   - `monthly = round(nguyên giá phải khấu hao / số tháng)`.
   - Tháng đầu: `monthly × (số ngày trong tháng − ngày bắt đầu + 1) / số ngày`, làm tròn đồng.
   - Các tháng giữa: `monthly`. Tháng cuối: **phần còn lại** để Σ = nguyên giá phải khấu hao đúng tuyệt đối.
   - Tháng giảm (thanh lý ngày d): `monthly × (d − 1) / số ngày`.
   - Lịch lưu sẵn (`asset_depreciations` kế hoạch); chạy tháng T từ chối nếu tháng T−1 chưa ghi; tài sản `stopped` không trích.
2. **Tham số.** `tai_san.khau_hao.theo_ngay = true` (false = tròn tháng, cho bản cài cũ).
3. **Hạch toán.** `depreciation` (đã có): chi phí theo bộ phận sử dụng (chiều `org_unit`) / hao mòn luỹ kế theo chính sách.
4. **Căn cứ.** TT45/2013 Điều 9, 10, 13; TT30/2025; TT99 TK 214. Ví dụ: Nợ 6424 / Có 2141.
5. **Golden.** `T030-TS-1` 1 tỷ / 60 tháng, dùng từ 16/09/2026 (30 ngày) → tháng 9 = 8.333.334; tháng 10 = 16.666.667; 61 kỳ; Σ = 1.000.000.000; kỳ cuối 30/09/2031. `T030-TS-4` 120 tr / 12 tháng từ 01/01 → 12 kỳ × 10 tr. `T030-TS-5` thanh lý 16/06 → tháng 6 = monthly × 15/30.
6. **Nợ ghi nhận:** `N030-1` kiểm `apps/api/src/modules/assets/depreciation*.ts` đang làm tròn tháng hay ngày; nếu tháng → sửa tại chỗ theo tham số trên (không chuyển phân hệ).

## TS04 Điều chỉnh nguyên giá, thời gian — ✅ (`revaluation`, `asset_depreciation_overrides`). Luật bổ sung: sau điều chỉnh, lịch còn lại tính lại = (giá trị còn lại mới) / (số tháng còn lại mới); các kỳ đã ghi không đổi. Golden `T030-TS-6`.

## TS05 Điều chuyển — ✅. ## TS06 Thanh lý — ✅ (+ `prorate_until` TS03). ## TS07 Kiểm kê TSCĐ — ✅ (`audit`); bổ sung biên bản mẫu 05-TSCĐ (TT99 phụ lục III), chênh → `decrease` lý do mất / `increase` phát hiện thừa.

## TS08 Thẻ tài sản, sổ TSCĐ

Mẫu in `print_template_settings`: thẻ TSCĐ S23-DN, sổ TSCĐ S24-DN, sổ CCDC S25-DN (TT99 phụ lục IV). Dữ liệu từ `assets` + `asset_events` + `asset_depreciations`. Golden `T030-TS-7` thẻ in khớp Σ khấu hao luỹ kế trên sổ.

## TS09 Công cụ dụng cụ — ✅ (`kind=tool`). Chốt luật: CCDC xuất dùng phân bổ ≤ 36 tháng (TT78 Điều 6 khoản 2.2d → tham số `tai_san.ccdc.so_thang_toi_da = 36`); mua về nhập kho CCDC (15x) → xuất dùng tạo bản ghi `tool` phân bổ (242 theo chính sách). Golden `T030-TS-8` CCDC 36 tr / 36 tháng → 36 kỳ 1 tr; đặt 40 tháng → chặn.

## TS10 Xây dựng cơ bản dở dang

1. **Mục đích.** Gom chi phí dự án (xây, lắp, mua sắm) vào XDCB; hoàn thành → ghi tăng TSCĐ một hoặc nhiều thẻ.
2. **Chứng từ `tai-san.cip`**: draft → open (gom chi phí) → completed (ghi tăng) ; cancelled. Dòng chi phí liên kết chứng từ gốc (`purchase`, `payment` có chiều `project=cip`).
3. **Trường.** Dự án, ngày bắt đầu, dự toán, tổng đã gom (đọc sổ theo chiều), ngày hoàn thành, danh sách tài sản tạo ra (tên, nguyên giá = phân bổ `allocate`, số tháng).
4. **Luật.** Σ nguyên giá tài sản tạo = Σ chi phí gom; vượt dự toán → cảnh báo.
5. **Quyền.** `tai-san:approve`.
6. **Hạch toán.** Chi phí gom: chứng từ gốc đã đi `purchase` / `payment` với tài khoản XDCB theo chính sách (chiều `project`); `completed` → `increase` (reasonCode `GTXDCB`, K2) chuyển XDCB → TSCĐ.
7. **Căn cứ.** TT99 TK 241; TT45 Điều 4 (nguyên giá TSCĐ tự xây).
8. **Golden.** `T030-TS-9` gom 3 chứng từ 300 tr → hoàn thành 2 thẻ 200 / 100 → 241 = 0, 211 tăng 300.

## TS11 Bảo trì thiết bị · TS12 Đội xe

Module `modules/thiet-bi` (P3). `thiet-bi.equipment` (liên kết `asset_id` tuỳ chọn), `maintenance` draft → scheduled → done (chi phí = `payment` / `purchase` chiều `equipment`), `vehicle` (biển số, đăng kiểm hạn, bảo hiểm hạn), `fuel_log` (ngày, km, lít, tiền → chi phí chiều `vehicle`), `freight_log`. Nhắc hạn đăng kiểm / bảo hiểm qua `ctx.notify`. Không ghi sổ ngoài chứng từ chi phí. Golden `T030-TS-10` chi phí xe tháng = Σ fuel + maintenance theo chiều `vehicle`.

## TS13 Thuê tài sản

1. **Mục đích.** Thuê hoạt động trả trước nhiều kỳ → phân bổ chi phí; thuê có đặt cọc.
2. **Chứng từ `tai-san.lease`**: draft → running → closed. `running` sinh bản ghi phân bổ (dùng chung khuôn lịch với `prepaid` / `accrual` — M8).
3. **Trường.** Bên cho thuê, tài sản thuê (mô tả), từ – đến, tiền thuê / kỳ, kỳ trả (tháng / quý / năm), đặt cọc, chiều chi phí.
4. **Luật.** Trả trước N kỳ → một `prepaid` N kỳ; trả sau → `accrual` (K-030-3); đặt cọc → phải thu khác.
5. **Hạch toán.** Trả tiền: `payment` → trả trước (242 theo chính sách); mỗi kỳ: `depreciation`-kiểu phân bổ (reasonCode `PBTT`, đã có cho prepaid).
6. **Căn cứ.** TT99 TK 242, 331; CMKT 06.
7. **Golden.** `T030-TS-11` thuê 12 tháng 120 tr trả trước → 12 kỳ 10 tr; thanh lý sớm tháng 7 → 5 kỳ còn lại hoàn một bút toán.
