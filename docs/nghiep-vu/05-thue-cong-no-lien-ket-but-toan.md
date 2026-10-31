# Thuế, công nợ và liên kết bút toán

Phần này giải thích các mảnh thêm vào sau phần lõi: liên kết bút toán, bổ sung thông tin thuế, khai bổ sung, quyết toán TNDN, công nợ theo nhân viên và theo mặt hàng. Đọc sau *Luồng dữ liệu và cấu trúc bảng*.

## 1. Liên kết bút toán (`ledger_links`)

Sổ cái chỉ thêm. Khi một bút toán mới **liên quan** tới bút toán cũ, quan hệ đó được ghi ở bảng riêng `ledger_links`, cũng chỉ thêm.

| `link_type` | Bút toán mới (`entry_id`) | Bút toán gốc (`target_entry_id`) | Ai ghi |
|---|---|---|---|
| `reversal` | Bút toán ghi số âm | Bút toán bị đảo | `ledgerService.reverse` — mọi đường đảo đều đi qua đây: sửa / huỷ chứng từ, sửa phiếu nhập tay, tính lại giá vốn, khấu hao, kết chuyển |
| `return` | Bút toán hàng bán trả lại / trả hàng nhà cung cấp | Bút toán bán / mua đang có hiệu lực của chứng từ gốc (`originalDocKey`), cùng bộ sổ | `document.service.ts → linkReturnToOriginal` |
| `adjustment`, `gift`, `replacement` | Phiếu điều chỉnh, quà khuyến mại, hoá đơn thay thế | Bút toán gốc | Để sẵn, chưa có màn ghi |

Luật trong cơ sở dữ liệu:
- trigger `ledger_links_no_update`: chặn UPDATE, DELETE;
- chỉ mục duy nhất `ledger_links_one_reversal`: mỗi bút toán chỉ bị đảo một lần;
- CHECK `entry_id <> target_entry_id`.

**Vì sao đảo bằng ghi số âm, không đổi bên Nợ/Có**: đổi bên làm phát sinh Nợ và Có của cả hai tài khoản phồng gấp đôi, cân đối phát sinh và doanh thu theo phát sinh sai. Ghi số âm cho số thuần (xem *Nguyên tắc và nghiệp vụ mẫu*, mục 3.1).

**Trả hàng không phải đảo**: trả hàng là nghiệp vụ mới (Nợ 5213 / Có 131, Nợ 1561 / Có 632), để báo cáo vẫn có "hàng bán bị trả lại". Liên kết `return` chỉ để truy vết.

Cột `ledger_entries.reverses_entry_id` và trạng thái `reversed` vẫn giữ làm bản sao để báo cáo lọc nhanh; nơi tra cứu quan hệ là `ledger_links`.

**Báo cáo không đọc `ledger_links`.** Cân đối phát sinh, sổ cái, lãi lỗ, công nợ cộng thẳng từ sổ cái: bút toán đảo mang số âm nên tự triệt tiêu. `ledger_links` chỉ để tra cứu, truy vết (màn chi tiết bút toán, mục "Liên kết bút toán") — sổ cái lo con số, `ledger_links` lo "cái nào thuộc cái nào".

## 2. Bổ sung thông tin thuế (`tax_info_patches`)

Chứng từ nhận từ hệ thống nguồn là bất biến (`accounting_events.payload` giữ nguyên). Kế toán bổ sung thông tin thuế thì lưu thành **bản vá** riêng cho từng sự kiện:

```
processDocument(doc)
  eff = applyTaxPatch(doc, patch)      ← ghép hoá đơn bổ sung (số, ngày, ký hiệu, MST, tên…)
  posting(eff); tax_invoices(eff)      ← tax_invoices chỉ khi hasTaxInvoice(eff)
  applyTaxFlags(eventId)               ← declare_date, deductible, payment_ref lên sổ hoá đơn
```

- Bản vá được áp lại **mỗi lần** chứng từ được ghi sổ lại (gửi bản mới, ghi sổ lại tay), nên không mất.
- Sửa hoá đơn → chứng từ được ghi sổ lại (bút toán cũ ghi số âm). Sửa kỳ kê khai, khấu trừ, chứng từ thanh toán → chỉ cập nhật sổ hoá đơn, không ghi lại bút toán.
- Ghi sổ lại lỗi (kỳ đã khoá): bản vá trả về như cũ, trạng thái chứng từ giữ "đã ghi sổ".
- `tax_invoices.period_date` là **cột sinh** = `COALESCE(declare_date, invoice_date)`. Mọi bảng kê, tổng hợp thuế, tờ khai lọc theo cột này.
- `[25]` tự tính = thuế mua vào của hoá đơn `deductible = true`.

## 3. Tờ khai: lần đầu và khai bổ sung (`vat_returns.revision`)

- `revision = 0`: tờ khai lần đầu. Lưu nháp / chính thức; chính thức thì màn hiện đúng số đã lưu.
- Tờ khai đã nộp mà số liệu đổi: lập **lần bổ sung** `revision = n` (luôn chính thức), kèm `supplement`:
  - các chỉ tiêu lệch: số đã kê khai, số điều chỉnh, chênh lệch;
  - thuế phải nộp tăng / giảm, thay đổi [43];
  - hạn nộp (tháng: ngày 20 tháng sau; quý: cuối tháng đầu quý sau; lùi qua thứ bảy, chủ nhật), số ngày chậm nộp, tiền chậm nộp = tăng thêm × 0,03% × số ngày.
- Bản cũ không bị ghi đè. Kỳ sau lấy [43] của `revision` lớn nhất.

## 4. Quyết toán TNDN (`cit_returns`)

- [A1] = chỉ tiêu 50 của báo cáo kết quả kinh doanh, cả năm.
- [E] gợi ý = phát sinh Nợ 3334 trong năm.
- Phần điều chỉnh, lỗ chuyển, ưu đãi do kế toán nhập (`manual`). Công thức ở `cit-return.service.ts → computeCit` (giao diện dùng cùng công thức để tính ngay khi gõ).
- Kiểm tra tạm nộp ≥ 80% số thuế quyết toán.

## 5. Công nợ theo nhân viên và theo mặt hàng

- **Nhân viên**: chiều phân tích `employee` (`dimensions.kind = 'employee'`, `ledger_lines.dims.employee`).
  - Chứng từ API có khối `employee { code, name }` → ghi vào **mọi dòng** của bút toán, tự thêm vào danh mục.
  - Phiếu nhập tay chọn ở từng dòng.
  - Báo cáo ACC48 gom số dư, phát sinh tài khoản công nợ theo `dims.employee` rồi theo đối tượng.
- **Mặt hàng** (ACC68): không có cột mặt hàng trên dòng công nợ, nên tính lại:
  - mỗi khoản nợ tăng (gom theo sự kiện) chia về mặt hàng theo tỷ trọng tiền của `sales_lines` (bán) hoặc `inventory_movements` (mua);
  - khoản trả nợ trừ vào khoản nợ cũ nhất trước (FIFO, giống tuổi nợ), trong một khoản nợ trừ theo phần còn nợ của từng mặt hàng;
  - chỉ tính bút toán đang có hiệu lực.
  - Tổng "còn nợ cuối kỳ" luôn bằng số dư tài khoản.

## 6. Mã nguồn

| Phần | Thư mục |
|---|---|
| Liên kết bút toán | `apps/api/src/modules/ledger` (`ledger.service.ts`, `ledger.repository.ts`) |
| Bổ sung thông tin thuế | `apps/api/src/modules/tax-info` |
| Tờ khai GTGT, khai bổ sung, TNDN, người nộp thuế | `apps/api/src/modules/statements` |
| Công nợ theo nhân viên, mặt hàng | `apps/api/src/phan-he/ke-toan/reports/debt-reports.ts` |
| Test | `apps/api/test/ledger-links.test.ts`, `tax-info.test.ts`, `tax-returns.test.ts`, `debt-reports.test.ts` |
