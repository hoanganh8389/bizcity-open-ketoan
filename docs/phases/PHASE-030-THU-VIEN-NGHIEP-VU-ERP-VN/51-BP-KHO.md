# PHASE-030 · 51 — Blueprint Kho, lô, mã vạch (KHO01–KHO12)
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — blueprint kho: chứng từ chuyển kho, kiểm kê, tiêu huỷ, cách ly, mã vạch; lô ở Kernel là K-030-1 -->

Khuôn: [30](30-KHUON-BLUEPRINT.md). Nguồn: `erp/addons/lfood_stock/models/{stock,count,barcode}.py`, `lfood_stock_control/models/control.py`, `lfood_intercompany/models/transfer.py`. Module đích: **`modules/kho/`** (mới, P0). Phân hệ cũ `phan-he/kho/` chỉ có danh sách chuyển kho — giữ, không thêm.

**Đã có ở open-ketoan:** số liệu kho ở Kernel (`inventory_movements`, `inventory_costs`, giá vốn bình quân tháng), `transfer` / `stock_adjustment` là `docType` Kernel với lý do XCKho / NDC / XDC, báo cáo ACC83 / ACC95, lô / FEFO / cận hạn **ở mua hàng** (không ở Kernel), `item_codes.kind=barcode`, in mã.

**Điểm mở nhóm này cung cấp:** `inventory.pickLots` (chọn lô: FEFO mặc định; bán hàng thêm "hạn tối thiểu của khách"; cách ly thêm `hold=false`), `inventory.beforeIssue` (QC, cách ly chặn xuất), `inventory.countSnapshot`.
**Năng lực Kernel cần:** **K-030-1** (lô / hạn trong `inventory_movements`, tồn theo lô) — P0, chặn KHO01 / 02 / 07 / 08 / 09; **K-030-4** (`stock_count` docType).

---

## KHO01 Nhập kho theo lô

1. **Mục đích.** Mỗi lần nhập ghi lô (số lô NCC hoặc tự sinh) + hạn dùng; tồn theo (kho, mặt hàng, lô).
2. **Chứng từ.** Không mới: là dòng của `receipt` mua hàng và `transfer` / nhập khác. Bổ sung trường dòng `lotRef`, `expiryDate`, `mfgDate`.
3. **Trường.** `lotRef` (chuỗi, duy nhất theo `item_id`), `expiryDate` (ngày), `mfgDate`; mặt hàng có cờ `lotTracked` (Item Master: thuộc tính phân loại, không phải mã).
4. **Luật.** Mặt hàng `lotTracked` → dòng nhập bắt buộc lô + hạn; hạn < ngày nhập → chặn; lô đã tồn tại với hạn khác → chặn `IN-KHO-LOT-EXPIRY-MISMATCH`.
5. **Quyền.** như phiếu nhập.
6. **Ngoại lệ.** Mặt hàng không `lotTracked` nhưng có lô → cảnh báo, chấp nhận.
7. **Hạch toán.** Không đổi (`purchase` NMH1); Kernel ghi `inventory_movements` kèm lô (K-030-1).
8. **Căn cứ.** TT99 (theo dõi chi tiết HTK); Luật ATTP 2010 (truy xuất lô).
9. **Golden.** `T030-KHO-1` nhập 2 lô cùng mã → tồn theo lô đúng; nhập lô cũ với hạn khác → chặn.

## KHO02 Xuất kho theo hạn dùng (FEFO)

1. **Mục đích.** Xuất bán / chuyển lấy lô hết hạn sớm nhất trước; bán hàng được đặt "hạn tối thiểu còn lại" theo khách.
2. **Chứng từ.** Dòng của `sale`, `transfer`, `stock_adjustment` (xuất). Khi dòng không chỉ định lô → hook `inventory.pickLots` chia tự động, kết quả ghi vào payload trước khi nộp.
3. **Trường.** Dòng: `lots: [{lotRef, qty}]`; tham số `kho.fefo.bat_buoc` (true), `ban_hang.khach.han_toi_thieu_ngay` (theo khách, mặc định 0).
4. **Luật.** Chọn lô: lọc `expiryDate ≥ hôm nay + hạn tối thiểu`, loại `hold`, sắp theo `expiryDate, lotRef`; lấy lần lượt tới đủ; thiếu → chặn `STOCK_INSUFFICIENT` (ghi rõ còn bao nhiêu). Người dùng chọn tay lô không phải sớm nhất → cảnh báo, bắt lý do.
5. **Quyền.** như phiếu xuất.
6. **Ngoại lệ.** Lô hết hạn → không bao giờ được chọn (chỉ đi KHO08).
7. **Hạch toán.** Không đổi (XBA / XCKho); `cogs` theo tháng không phụ thuộc lô (KHO12).
8. **Căn cứ.** NĐ15/2018 (ATTP), thông lệ FEFO.
9. **Golden.** `T030-KHO-2` ba lô 10/01, 10/03, 10/02 → xuất 1,5 lô = hết 10/01 + nửa 10/02. `T030-KHO-3` lô cách ly không được chọn dù sớm nhất; khách hạn tối thiểu 90 ngày → lô còn 60 ngày bị bỏ qua.

## KHO03 Chuyển kho nội bộ

1. **Mục đích.** Chuyển giữa kho cùng đơn vị; có bước **nhận** khi hai kho khác chi nhánh (hàng đi đường).
2. **Chứng từ `kho.transfer`**: draft → submitted → approved → in_transit → received; cancelled. Cùng chi nhánh: `approved` ghi thẳng → `received`.
3. **Trường.** Kho đi, kho đến, ngày, người giao, người nhận, dòng: `item_id`, lô, số lượng gửi, số lượng nhận, chênh.
4. **Luật.** Tồn kho đi ≥ gửi; nhận ≤ gửi; chênh → sinh `stock_adjustment` (XDC) ở kho đến với lý do bắt buộc.
5. **Quyền.** `kho:transfer` lập; `kho:approve` duyệt; `kho:receive` tại kho đến.
6. **Ngoại lệ.** Chênh > `kho.chuyen.nguong_chenh_pct` (1 %) → cần `kho:approve` duyệt chênh.
7. **Hạch toán.** `approved` → `transfer` (XCKho) ghi hàng đi đường (tài khoản theo chính sách `postingDefaults.goodsInTransit`); `received` → `transfer` nhập kho đến, `docKey` cùng gốc hậu tố `:in`.
8. **Căn cứ.** TT99; mẫu 03-VT phiếu xuất kho kiêm vận chuyển nội bộ. Ví dụ: xuất Nợ 1579 / Có 156; nhận Nợ 156 / Có 1579.
9. **Golden.** `T030-KHO-4` chuyển 100, nhận 98 có lý do → hai bút toán transfer + một XDC 2; tồn hai kho + 1579 = 0 sau nhận.

## KHO04 Chuyển hàng giữa hai pháp nhân

1. **Mục đích.** Bán nội bộ giữa 2 `accounting_units`: một chứng từ sinh **bán** ở bên giao và **mua** ở bên nhận, công nợ nội bộ, loại trừ khi hợp nhất (KT18).
2. **Chứng từ `kho.intercompany_transfer`**: draft → approved → done. `done` nộp hai sự việc: `sale` (đơn vị A, khách = B) và `purchase` (đơn vị B, NCC = A) với `docKey` chung gốc, `document_links` role `mirror`.
3. **Trường.** Đơn vị giao, đơn vị nhận, giá chuyển (= giá vốn hoặc giá thoả thuận), dòng hàng + lô.
4. **Luật.** Hai sự việc cùng ngày, cùng số lượng, cùng lô; chỉ `done` khi cả hai `posted` (lắng `bizcity.ledger.entry.posted` × 2).
5. **Quyền.** `kho:approve` ở cả hai đơn vị (hoặc vai liên đơn vị).
6. **Ngoại lệ.** Một bên bị từ chối → bên kia đảo (`ctx.ledger.cancel`), chứng từ về `approved` với cảnh báo.
7. **Hạch toán.** A: XBA + doanh thu nội bộ; B: NMH1. Chiều `intercompany=true` trên cả hai để KT18 loại trừ.
8. **Căn cứ.** TT99 TK 136 / 336, TT202/2014 (hợp nhất).
9. **Golden.** `T030-KHO-5` sau `done`: tồn A giảm = tồn B tăng; 136(A) = 336(B).

## KHO06 Nhập thành phẩm từ nhà máy

Trường hợp đặc biệt của KHO04 (nhà máy là pháp nhân riêng) hoặc của nhập khác (`stock_adjustment` lý do nhập thành phẩm) khi cùng pháp nhân. Không sản xuất / BOM (ngoài phạm vi, như Erp-vn). Golden `T030-KHO-5` phủ.

## KHO07 Kiểm kê kho

1. **Mục đích.** Đếm thực tế theo kho / lô, ghi chênh có duyệt; biên bản kiểm kê.
2. **Chứng từ `kho.stock_count`** (K-030-4): draft → counting → submitted → approved → done; cancelled.

   | Từ | Đến | Ai | Điều kiện | Lý do |
   |---|---|---|---|---|
   | draft | counting | `kho:count` | chụp tồn sổ (`inventory.countSnapshot`), **khoá chứng từ kho** của kho đó | — |
   | counting | submitted | `kho:count` | mọi dòng có số đếm ≥ 0 | — |
   | submitted | approved | `kho:approve` (≠ người đếm; chênh |giá trị| ≥ `kho.kiem_ke.duyet_cap2_tu` → kế toán trưởng) | — | dòng chênh ≠ 0 bắt nguyên nhân |
   | approved | done | hệ thống | mỗi dòng chênh nộp `stock_adjustment`; mở khoá kho | — |
   | draft, counting, submitted | cancelled | `kho:approve` | mở khoá kho | bắt buộc |

3. **Trường.** Đầu: kho, ngày, tổ kiểm kê (danh sách người), kết luận. Dòng: `item_id`, lô, tồn sổ (chụp), đơn giá bình quân (chụp), số đếm, chênh (= đếm − sổ), giá trị chênh, nguyên nhân.
4. **Luật.** Khoá kho: mọi chứng từ kho của kho đó có ngày ≥ ngày kiểm bị từ chối `WAREHOUSE_COUNTING` tới `done` / `cancelled`. Chênh dương → NDC; âm → XDC; giá trị = chênh × đơn giá chụp.
5. **Quyền.** `kho:count`, `kho:approve`.
6. **Ngoại lệ.** |chênh| / sổ > `kho.kiem_ke.nguong_canh_bao_pct` (5 %) → cảnh báo đỏ; lô không có trong sổ nhưng đếm thấy → dòng mới, lý do bắt buộc.
7. **Hạch toán.** `done`: `stock_adjustment` reasonCode NDC / XDC, `docKey` `kho.stock_count:<id>:<line>`; tài khoản theo chính sách (thừa chờ xử lý / thiếu chờ xử lý).
8. **Căn cứ.** TT99; Luật Kế toán 2015 Điều 40 (kiểm kê); mẫu 05-VT biên bản kiểm kê. Ví dụ: thừa Nợ 156 / Có 3381; thiếu Nợ 1381 / Có 156.
9. **Golden.** `T030-KHO-6` sổ 100, đếm 97 → một XDC 3; tồn sau = 97; phiếu xuất ngày trong lúc `counting` → `WAREHOUSE_COUNTING`. `T030-KHO-7` huỷ sau `submitted` → không bút toán, kho mở khoá.

## KHO08 Hàng cận hạn, hết hạn, tiêu huỷ

1. **Mục đích.** Cảnh báo lô sắp hết hạn; biên bản tiêu huỷ đủ hồ sơ (TT20/2026) → xuất huỷ, ghi chi phí, bồi thường nếu có lỗi.
2. **Chứng từ `kho.disposal`**: draft → approved → done; cancelled. Nhắc cận hạn là **thông báo** (`bizcity.clock.daily` → `ctx.notify`), không chứng từ.
3. **Trường.** Kho, ngày, nguyên nhân (hết hạn / hỏng / không đạt QC / khác), phương án xử lý, số QĐ huỷ, ngày QĐ, số QĐ thành lập hội đồng, bồi thường (số tiền, người), dòng: `item_id`, lô, số lượng, giá trị (tính khi `done` theo giá bình quân).
4. **Luật.** `action_load_holds`: nạp mọi lô `hold` hoặc hết hạn của kho. `approved` chỉ khi đủ hồ sơ: QĐ huỷ + hội đồng (tham số `kho.tieu_huy.ho_so_bat_buoc`). Bồi thường ≤ giá trị huỷ; bồi thường > 0 phải có người. Tham số `kho.han_dung.ngay_can_han` (30).
5. **Quyền.** `kho:count` lập; **giám đốc** (`kho:approve-disposal`) duyệt; kế toán ghi sổ.
6. **Ngoại lệ.** Lô đang cách ly chưa có kết luận QC → chặn "chờ QC"; thiếu hồ sơ → chặn nêu rõ thiếu gì.
7. **Hạch toán.** `done`: `stock_adjustment` lý do huỷ (đề xuất `XHUY`, K2) — giá trị vào chi phí; bồi thường → `debt_items` phải thu người có lỗi (reasonCode `BOITHUONG`, K2).
8. **Căn cứ.** TT20/2026/TT-BTC (hồ sơ huỷ hàng); TT78 Điều 6 (chi phí hàng hỏng được trừ khi đủ hồ sơ). Ví dụ: Nợ 632 (hoặc 811) / Có 156; bồi thường Nợ 1388 / Có 632.
9. **Golden.** `T030-KHO-8` thiếu QĐ hội đồng → không duyệt; đủ → `done` sinh đúng hai bút toán, tồn lô = 0.

## KHO09 Cách ly hàng không đạt

1. **Mục đích.** Lô nghi ngờ / chờ QC không được xuất; giải phóng cần quyền cao.
2. **Chứng từ.** Không; là **trạng thái lô** `hold` + nhật ký (`kho.lot_hold` bảng module: lô, lý do, ngày, người, giải phóng lúc / bởi).
3. **Trường.** Lô, lý do (bắt buộc), ngày; giải phóng: lý do, người.
4. **Luật.** Hook `inventory.pickLots` loại lô `hold`; `inventory.beforeIssue` chặn dòng chỉ định tay lô `hold` → `LOT_ON_HOLD`. QC nhập (nếu module chất lượng cài): mặt hàng `qcRequired` → lô tự `hold` khi nhập, đạt mới nhả.
5. **Quyền.** `kho:hold` đặt; `kho:release` (kế toán trưởng / giám đốc) nhả.
6. **Ngoại lệ.** Lô `hold` quá `kho.cach_ly.ngay_toi_da` (30) chưa kết luận → nhắc hằng ngày.
7. **Hạch toán.** Không (vẫn trong 15x); tiêu huỷ đi KHO08.
8. **Căn cứ.** Luật ATTP; HACCP.
9. **Golden.** `T030-KHO-3` (chung với KHO02); `T030-KHO-9` nhả không quyền → `FORBIDDEN`.

## KHO10 Tồn tối thiểu — ✅ đã có mạnh hơn (tồn max + công thức đặt hàng, `phan-he/mua-hang`). Chỉ bổ sung tuỳ chọn `min_qty` cho kho tổng như Erp-vn nếu chủ dự án cần (`stock_sku_settings`).

## KHO11 Quét mã vạch, in tem lô

1. **Mục đích.** Quét mã hàng / mã lô ở phiếu nhập, xuất, kiểm kê; in tem lô có mã QR (lô + hạn).
2. **Chứng từ.** Không; là **năng lực màn hình** (ui-kit `ScanField`) + action `kho.scan.resolve` (mã → `item_id` + lô).
3. **Trường.** Mã quét: EAN-13 / Code128 (mã hàng, `item_codes.kind=barcode`) hoặc QR nội bộ `LOT:<lotRef>|EXP:<yyyymmdd>|ITEM:<item_id>`.
4. **Luật.** Mã lạ → trạm tiền kiểm `IN-ITEM-UNKNOWN`, không tự tạo mặt hàng (R-ITEM). Tem lô in từ dòng nhập; mẫu in `print_template_settings`.
5. **Quyền.** như chứng từ chứa.
6. **Ngoại lệ.** Quét lô hết hạn ở phiếu xuất → `LOT_EXPIRED`.
7. **Hạch toán.** Không.
8. **Căn cứ.** GS1 Việt Nam.
9. **Golden.** `T030-KHO-10` quét QR lô → dòng điền đúng `item_id`, lô, hạn; quét mã lạ → `IN-ITEM-UNKNOWN`.

## KHO12 Tính giá xuất kho — ✅ bình quân gia quyền tháng (Kernel)

Ghi khác biệt: Erp-vn dùng **bình quân di động** theo (kho, lô) với luật cấm lùi ngày và huỷ ngược từ mới nhất. open-ketoan giữ bình quân tháng (TT99 Điều về HTK cho phép; không bị lùi ngày). Chỉ chuyển sang di động khi có yêu cầu kinh doanh (giá vốn tức thời theo lô) — cần K3 + luật `_check_date_order`. Golden `T030-KHO-11` mọi `cogs` trong tháng cùng đơn giá = (tồn đầu + nhập) / (lượng đầu + lượng nhập).
