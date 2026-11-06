# PHASE-030 · 50 — Blueprint Mua hàng (MH01–MH13)
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — blueprint mua hàng: phần đã có ở phan-he/mua-hang giữ nguyên, đặc tả phần thiếu (yêu cầu mua, báo giá, 3 bên, nông sản, nhập khẩu, đánh giá NCC) -->

Khuôn: [30](30-KHUON-BLUEPRINT.md). Nguồn tham khảo: `erp/addons/lfood_purchase/models/{purchase,integration,adjust,tally}.py`, `lfood_contract/models/{purchase_contract,supplier_eval}.py`, `lfood_trade/models/importing.py`. Phân hệ cũ `apps/api/src/phan-he/mua-hang/` **đóng băng** (ADR-0024): phần mới dưới đây đặt ở `modules/mua-hang/` (đã có `domain/`), API / web / migration thêm vào đó; không tạo thư mục mới trong `phan-he/`.

**Đã có ở open-ketoan, không đặc tả lại:** MH03 đơn đặt (`kind=order`, giữ hạn mức), MH06 hoá đơn NCC (`supplier_invoices`, quét AI, kiểm CQT), MH08 tính lại (`engine.ts`), MH09 trả lại / giảm giá (`return`, `rebate` GGHM), MH10 phân bổ chi phí (`cost`), chính sách 14 loại, lô / FEFO / cận hạn, tồn max, Trợ lý mua hàng ([docs/nghiep-vu/08-mua-hang.md](../../nghiep-vu/08-mua-hang.md)).

**Điểm mở (hook) nhóm này cung cấp:** `purchase.beforeSubmit` (ngân sách NS03 cắm vào), `purchase.priceSuggest` (lịch sử giá, giá cố định), `purchase.supplierScore` (MH13 đọc dữ liệu giao hàng, trả hàng).
**Năng lực Kernel cần:** K-030-2 (nguyên tệ, cho MH12), K-030-6 (tham số: dung sai 3 bên, ngưỡng bắt báo giá, ngưỡng không tiền mặt).

---

## MH01 Yêu cầu mua

1. **Mục đích.** Bộ phận cần hàng / dịch vụ lập yêu cầu nội bộ trước khi có đơn mua; kế toán trưởng duyệt; từ yêu cầu đã duyệt mới lập đơn hoặc xin báo giá. Mục tiêu: không mua ngoài kế hoạch, có vết "ai cần, vì sao".
2. **Chứng từ `mua-hang.request`.**

   | Trạng thái | Nhãn | Nhóm |
   |---|---|---|
   | draft | Nháp | draft |
   | submitted | Chờ duyệt | submitted |
   | approved | Đã duyệt | approved |
   | refused | Từ chối | cancelled (mở lại được → draft) |
   | ordered | Đã lập đơn | done |
   | cancelled | Huỷ | cancelled |

   | Từ | Đến | Ai | Điều kiện | Lý do |
   |---|---|---|---|---|
   | draft, refused | submitted | `mua-hang:request` | ≥ 1 dòng; chạy `purchase.beforeSubmit` (ngân sách) | — |
   | submitted | approved | `mua-hang:approve` (≠ người lập) | — | — |
   | submitted | refused | `mua-hang:approve` | — | bắt buộc |
   | approved | ordered | hệ thống (khi đơn mua / chọn báo giá tham chiếu yêu cầu) | nếu `tổng ≥ mua_hang.bao_gia.nguong` thì số báo giá ≥ `mua_hang.bao_gia.so_toi_thieu` | — |
   | draft, submitted, approved | cancelled | người lập hoặc `mua-hang:approve` | chưa `ordered` | — |

3. **Trường.** Đầu: số (`nextNumber`), ngày, người yêu cầu (`users`), bộ phận (`org_units`), chi nhánh, lý do (bắt buộc), ngày cần, tổng ước (tính). Dòng: `item_id` (hoặc mô tả tự do khi chưa có mã — đi trạm tiền kiểm `IN-ITEM-*` khi thành đơn), số lượng, ĐVT, đơn giá ước, khoản mục chi phí (`dimensions`), ghi chú.
4. **Luật.** Tổng ước = Σ số lượng × đơn giá ước. Tham số: `mua_hang.bao_gia.nguong` (mặc định 100 tr, phạm vi đơn vị), `mua_hang.bao_gia.so_toi_thieu` (mặc định 3). Ngân sách: gọi hook; kết quả `warn | require_approval | block` theo Q030-3.
5. **Quyền.** `mua-hang:request` (mọi nhân viên có vai), `mua-hang:approve` (kế toán trưởng / giám đốc); SoD.
6. **Ngoại lệ.** Vượt ngân sách → theo cấu hình; thiếu báo giá khi lập đơn → **chặn** `PURCHASE_QUOTES_REQUIRED`; yêu cầu có dòng chưa có mã hàng → cảnh báo `IN-ITEM-DRAFT` (mã sẽ tạo qua `core.item.*` trước khi đơn được duyệt).
7. **Hạch toán.** Không ghi sổ. (Erp-vn cũng vậy.)
8. **Căn cứ.** Quy chế mua sắm nội bộ; Luật Đấu thầu không áp dụng cho DN tư nhân nhưng ngưỡng "≥ 3 báo giá" là thông lệ kiểm toán.
9. **Golden.** `T030-MH-1` yêu cầu ≥ ngưỡng, 2 báo giá → lập đơn bị chặn; thêm báo giá thứ 3 → qua. `T030-MH-2` người lập tự duyệt → `FORBIDDEN`.

## MH02 Đề nghị báo giá và so sánh

1. **Mục đích.** Gửi cùng danh mục hàng cho nhiều NCC, nhập giá, chọn một báo giá → tự sinh đơn mua.
2. **Chứng từ `mua-hang.quote`** (một bản ghi / NCC / yêu cầu): draft → received → chosen | rejected. `chosen` chỉ một báo giá / yêu cầu; chọn khi yêu cầu `approved`; chọn xong yêu cầu → `ordered` và sinh `purchase_documents.kind=order` nháp với giá từ báo giá.
3. **Trường.** Đầu: yêu cầu (bắt buộc), NCC (`partners.kind=supplier`), ngày nhận, hiệu lực đến, điều khoản thanh toán, ghi chú. Dòng: dòng yêu cầu, đơn giá, thuế suất, thời gian giao (ngày), thành tiền.
4. **Luật.** Bảng so sánh: theo từng dòng yêu cầu, xếp NCC theo thành tiền; cột "rẻ nhất", "giao nhanh nhất". Chọn báo giá không rẻ nhất → bắt lý do (ghi `notes.audit`).
5. **Quyền.** `mua-hang:request` nhập; `mua-hang:approve` chọn.
6. **Ngoại lệ.** Báo giá hết hiệu lực → cảnh báo khi chọn; chọn NCC bị đánh dấu "ngừng giao dịch" (MH13) → chặn.
7. **Hạch toán.** Không.
8. **Căn cứ.** —
9. **Golden.** `T030-MH-3` chọn báo giá B khi A rẻ hơn, không lý do → từ chối; có lý do → đơn sinh ra đúng giá B, lý do có trong audit.

## MH03 Đơn mua hàng — ✅ đã có

`purchase_documents.kind=order`, giữ hạn mức, MH02 phân tích đặt hàng, MH21 đối chiếu đơn ↔ nhập. **Bổ sung nhỏ (không chuyển phân hệ):** cột `request_id` / `quote_id` trong `data` để truy vết MH01 → MH02 → MH03 (`document_links` role `origin`).

## MH04 Hợp đồng mua khung

1. **Mục đích.** Giá / số lượng cam kết theo kỳ với NCC; đơn mua tham chiếu hợp đồng lấy giá; theo dõi đã thực hiện / còn lại.
2. **Chứng từ `hop-dong.purchase_contract`** (đặt ở module `hop-dong` theo GOLDEN-CASE, không ở mua hàng): draft → submitted → active → closed; cancelled. `active` khi có hiệu lực từ ngày; `closed` khi hết hạn hoặc đã giao đủ.
3. **Trường.** NCC, hiệu lực từ – đến, điều khoản thanh toán, tổng cam kết; dòng: `item_id`, giá cố định, số lượng cam kết, đã mua (đọc từ sổ: `purchase` đã ghi có `contract_id`), còn lại.
4. **Luật.** Đơn mua chọn hợp đồng → giá dòng = giá hợp đồng (chính sách `contract` hiện có của mua hàng đọc từ đây thay vì JSON riêng); vượt số lượng cam kết → cảnh báo.
5. **Quyền.** `hop-dong:approve`.
6. **Ngoại lệ.** Giá đơn ≠ giá hợp đồng → chặn, `override` có lý do.
7. **Hạch toán.** Không; hợp đồng là chiều (`dimensions`) trên bút toán mua.
8. **Căn cứ.** Bộ luật Dân sự 2015 (hợp đồng mua bán).
9. **Golden.** `T030-MH-4` đơn mua giá khác hợp đồng → chặn; `override` → qua, lý do ghi vết.

## MH05 Đối chiếu 3 bên (đơn – nhận – hoá đơn)

1. **Mục đích.** Trước khi ghi sổ phiếu nhập / hoá đơn: số lượng nhận ≤ đơn + dung sai; đơn giá hoá đơn ≈ đơn giá đơn trong dung sai; hàng không có trong đơn → chặn.
2. **Chứng từ.** Không chứng từ mới; là bước **phân tích** của `kind=receipt` (đã có `analysis.ts` với `po_none`, `po_over`, `po_price`). Bổ sung: so **hoá đơn NCC** (`supplier_invoices`) với đơn khi gắn hoá đơn vào phiếu nhập.
3. **Trường.** Tham số `mua_hang.doi_chieu.dung_sai_pct` (mặc định 2 %, Erp-vn `lfood_purchase_tolerance`).
4. **Luật.** Với mỗi dòng nhận: `nhận ≤ còn lại đơn × (1 + dung sai)`; `|giá HĐ − giá đơn| / giá đơn ≤ dung sai`. Trả lại không vượt đã nhận theo đơn.
5. **Quyền.** như phiếu nhập; `override` `mua-hang:approve`.
6. **Ngoại lệ.** `po_over`, `po_price` hiện là **cảnh báo** — nâng thành **chặn có override** khi `mua_hang.doi_chieu.bat_buoc = true` (mặc định false để không đổi hành vi bản cài đang chạy).
7. **Hạch toán.** Như `receipt` hiện có.
8. **Căn cứ.** Kiểm soát nội bộ; TT99 chứng từ hợp lệ.
9. **Golden.** `T030-MH-5` nhận 103 khi đơn 100, dung sai 2 % → chặn; dung sai 5 % → cảnh báo, qua.

## MH06 Nhận và kiểm hoá đơn đầu vào — ✅ đã có (MH22, THUE04)

## MH07 Chứng từ mua dịch vụ có phiên bản — 🟡 Kernel đã có nền

Blueprint: *mua dịch vụ* = `purchase_documents.kind=cost` hoặc `receipt` không hàng (dòng dịch vụ). Sửa sau ghi sổ = nộp phiên bản mới cùng `docKey` (M3); màn hình hiện "bản đang xem ≠ bản đã ghi sổ". Không thêm bảng phiên bản ở module. Golden `T030-CORE-5`.

## MH08 Tự tính lại — ✅ đã có (`engine.ts`); bổ sung `allocate` dùng chung (M4) nếu chưa có trong `@bizcity/mua-hang-domain`.

## MH09 / MH10 — ✅ đã có.

## MH11 Thu mua nông sản không hoá đơn (bảng kê 01/TNDN)

1. **Mục đích.** Mua của hộ / cá nhân không có hoá đơn: lập bảng kê để chi phí được trừ khi tính TNDN.
2. **Chứng từ `mua-hang.tally`**: draft → confirmed; cancelled. Là **đầu vào** của `receipt` (phiếu nhập tham chiếu bảng kê, người bán là cá nhân có CCCD).
3. **Trường.** Người bán (họ tên, CCCD, địa chỉ — lưu ở `partners.kind=other` + cờ cá nhân), ngày, mặt hàng, số lượng, đơn giá, thành tiền, chữ ký / xác nhận. Bảng kê tháng gom nhiều dòng.
4. **Luật.** Mỗi khoản ≥ `thue.khong_tien_mat.nguong` (5 tr, K-030-6) phải chuyển khoản mới được tính chi phí hợp lý → cảnh báo trên phiếu chi. Tổng bảng kê tháng khớp Σ phiếu nhập tham chiếu.
5. **Quyền.** `mua-hang:request` lập; `mua-hang:approve` xác nhận.
6. **Ngoại lệ.** Người bán là DN (có MST) → chặn "phải có hoá đơn".
7. **Hạch toán.** Phiếu nhập đi `purchase` bình thường, không VAT đầu vào (`tax_code` KCT); bảng kê không ghi sổ.
8. **Căn cứ.** TT78/2014 Điều 6 khoản 2.4; mẫu 01/TNDN; TT96/2015.
9. **Golden.** `T030-MH-6` phiếu nhập tham chiếu bảng kê có thuế suất ≠ KCT → chặn.

## MH12 Mua hàng nhập khẩu

1. **Mục đích.** Tờ khai hải quan, thuế NK, VAT NK, chi phí nhập (vận tải, bảo hiểm, lưu kho) vào giá vốn; thanh toán ngoại tệ.
2. **Chứng từ `xuat-nhap-khau.import_declaration`**: draft → submitted → cleared → posted; cancelled. Module riêng `modules/xuat-nhap-khau` (P3).
3. **Trường.** Số tờ khai, ngày, NCC nước ngoài, tiền tệ, tỷ giá tính thuế, dòng: `item_id`, số lượng, trị giá CIF nguyên tệ, thuế suất NK, thuế NK, VAT NK; chi phí nhập (nhiều dòng, phân bổ theo trị giá).
4. **Luật.** Giá vốn = CIF × tỷ giá + thuế NK + chi phí (phân bổ `allocate` theo trị giá); VAT NK = (CIF × tỷ giá + thuế NK) × thuế suất; VAT NK được khấu trừ khi đã nộp.
5. **Quyền.** `mua-hang:approve`.
6. **Ngoại lệ.** Thiếu tỷ giá ngày tờ khai → chặn (K-030-2).
7. **Hạch toán.** `cleared → posted`: `purchase` (hàng, reasonCode NMH1 nguyên tệ), thuế NK vào giá vốn, VAT NK reasonCode riêng (đề xuất `VATNK`, kế toán trưởng ký K2); nộp thuế → `bank_payment`.
8. **Căn cứ.** Luật Thuế XNK 107/2016; TT219/2013 Điều 14–15 (khấu trừ VAT NK); TT99 TK 3333 / 33312.
9. **Golden.** `T030-MH-7` CIF 10.000 USD × 25.000, thuế NK 10 %, chi phí 5 tr → giá vốn 280.000.000; VAT NK 27.500.000.

## MH13 Đánh giá nhà cung cấp

1. **Mục đích.** Chấm điểm định kỳ: đúng hạn, đúng số lượng, tỷ lệ trả lại, giá so thị trường → xếp hạng A/B/C; C → "ngừng giao dịch".
2. **Chứng từ `mua-hang.supplier_evaluation`**: draft → done. Một bản / NCC / kỳ.
3. **Trường.** NCC, kỳ, các chỉ số (tự tính từ sổ + bảng module qua hook `purchase.supplierScore`), điểm tay, xếp hạng, kết luận.
4. **Luật.** Điểm = Σ trọng số × chỉ số; trọng số là tham số `mua_hang.danh_gia.trong_so.*`.
5. **Quyền.** `mua-hang:approve`.
6. **Ngoại lệ.** NCC xếp C → đơn mua mới chặn, `override` giám đốc.
7. **Hạch toán.** Không.
8. **Căn cứ.** ISO 9001 7.4 (thông lệ).
9. **Golden.** `T030-MH-8` NCC hạng C → đơn mua `SUPPLIER_BLOCKED`.
