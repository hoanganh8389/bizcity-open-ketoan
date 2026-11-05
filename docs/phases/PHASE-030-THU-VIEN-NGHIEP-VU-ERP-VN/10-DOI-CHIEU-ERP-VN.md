# PHASE-030 · 10 — Đối chiếu 173 nghiệp vụ Erp-vn với open-ketoan
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — ma trận nghiệp vụ × open-ketoan × nguồn Erp-vn × module đích × ưu tiên; đề xuất năng lực Kernel K-030-* -->

Kiểm kê 2026-11-06 trên `origin/main` (dee8bf4) của open-ketoan và `main` của Erp-vn. Đường dẫn Erp-vn tính từ `d:\projects\Erp-vn\erp\addons\`; mã nghiệp vụ nằm ở docstring dòng 1 của tệp.

**Ký hiệu cột open-ketoan:** ✅ có (đủ dùng) · 🟡 một phần (có dữ liệu / báo cáo / chính sách nhưng thiếu chứng từ hoặc luồng) · ☐ chưa có · ⛔ không làm (ngoài phạm vi hạt nhân kế toán, hoặc đã quyết không làm).
**Cột Module đích:** `phan-he/<key>` = đã có trong phân hệ cũ, giữ nguyên (ADR-0024); `modules/<key>` = module mới; `kernel` = cần năng lực Kernel (đề xuất ở §4); `core` = module nền có sẵn ở `apps/api/src/modules/*`.
**Ưu tiên:** theo D030-9.

## 1. Ma trận

### 1.1 Nền tảng, cấu hình, danh mục (HT, CH, DM) — phần lớn open-ketoan đã có, ghi để tra chéo

| Mã | Nghiệp vụ | open-ketoan | Bằng chứng | Nguồn Erp-vn | Đích | Ưu tiên |
|---|---|---|---|---|---|---|
| HT01 | Hai pháp nhân, kỳ kế toán | ✅ | `accounting_units`, `branches`, `fiscal_periods` | `lfood_base/models/res_company.py` | core | — |
| HT02 | Người dùng, nhóm quyền, quyền theo dòng | ✅ | PHASE-028 authz, RLS PHASE-007 | `lfood_admin/models/role_matrix.py` | core | — |
| HT03 | Đăng nhập an toàn (2FA, khoá tạm) | 🟡 | api_keys, chưa 2FA | `lfood_security/models/security_settings.py` | core | P3 |
| HT04 | Duyệt nhiều cấp theo hạn mức | ✅ hơn | đề nghị thanh toán 2 cấp `second_level_from`; workflow YAML; Erp-vn chỉ 1 ngưỡng | `lfood_base/models/res_company.py` | core | — |
| HT05 | Nhật ký thay đổi, chuỗi băm | ✅ | `audit_logs`, bằng chứng chỉ thêm (PHASE-003) | `lfood_audit/models/audit_log.py` | core | — |
| HT06 | Chuỗi đánh số chứng từ | ✅ | `document_sequences`, `nextNumber` | `*/data/sequences.xml` | core | — |
| HT07 | Tìm nhanh toàn hệ thống | 🟡 | tra mã (Bàn điều tra), chưa tìm nghiệp vụ | `lfood_admin/models/quick_search.py` | core | P3 |
| HT08 | Lưu trữ chứng từ điện tử, khoá lưu trữ | 🟡 | `document_attachments`, chưa chính sách lưu trữ / băm tệp | `lfood_archive/models/archive.py` | core | P2 |
| HT09 | Nhập – xuất Excel, chuyển từ MISA | 🟡 | nhập hàng loạt tài sản, hoá đơn NCC; chưa khuôn chung | `lfood_importer/models/importer.py` | core | P2 |
| HT10 | Sao lưu, khôi phục | ✅ | PHASE-008 PITR | `lfood_admin/models/backup.py` | — | — |
| HT11 | Bảo vệ dữ liệu cá nhân (NĐ 356/2025) | ☐ | — | `lfood_privacy/models/privacy.py` | modules/nhan-su | P3 |
| HT12 | Nhắc hạn tự động | 🟡 | `ctx.notify`, `bizcity.clock.daily`; chưa bộ gom nhắc theo nhóm | `lfood_reminder/models/reminder.py` | core | P2 |
| HT13 | Ký số chứng từ | 🟡 | `document_signatures`; chưa đăng ký chứng thư / hạn | `lfood_signature/models/signature.py` | core | P3 |
| CH01–CH02, CH08 | Tham số pháp lý theo ngày hiệu lực, cập nhật, lịch sử | 🟡 | `setting_values` (PHASE-029 E2 đang làm); chưa seed tham số pháp lý VN | `lfood_voucher/models/legal_param.py`, `*/data/legal_params.xml` | core + `vn-rulepacks` | **P1** |
| CH03 | Mô phỏng ảnh hưởng trước khi áp | ☐ | — | context `lfood_param_sim`, `lfood_payroll/models/simulation.py` | core | P2 |
| CH04 | Biểu thuế luỹ tiến, bảng bậc | ☐ | — | tham số `TNCN_BAC_n_DEN`, `TNCN_THUE_SUAT_n` | `vn-rulepacks` | P2 |
| CH05 | Địa bàn, vùng lương tối thiểu | ☐ | — | `lfood_payroll/models/payroll.py` (`employee.region`) | modules/nhan-su | P2 |
| CH06 | Lịch nghỉ lễ, ngày làm việc | 🟡 | ngày lễ trong cài đặt mua hàng (MH12) | `lfood_voucher/models/holiday.py` | core | P2 |
| CH07 | Nhắc rà soát tham số | ☐ | — | `lfood_reminder` `_collect_legal` | core | P3 |
| DM01 | Đối tác | ✅ | `partners` (PHASE-026 phiên bản mã) | — | core | — |
| DM02 | Sản phẩm, nguyên liệu, dịch vụ | ✅ | Item Master PHASE-024 | `lfood_stock/models/stock.py` | core | — |
| DM03 | ĐVT và quy đổi | ✅ | `product_units`, MH27 thùng | `lfood_stock/models/uom.py` | core | — |
| DM04 | Kho, vị trí kho | 🟡 | `warehouses`; chưa vị trí trong kho | — | core | P3 |
| DM05 | Hệ thống tài khoản TT99 | ✅ | `accounts`, seed | `lfood_ledger/data/accounts.xml` | core | — |
| DM06 | Cây khoản mục chi phí | 🟡 | `dimensions` (khoản mục phẳng), `cost_norms` | `lfood_voucher/models/cost_item.py` (parent_path) | core | P2 |
| DM07 | Thuế suất | ✅ | `tax_codes` | `lfood.vat.rate` | core | — |
| DM08 | Điều khoản thanh toán | 🟡 | chính sách `payment_term` chỉ ở mua hàng | `lfood_sale/models/payment_term.py` | core | P1 |
| DM09 | Tiền tệ, tỷ giá | ☐ | `bank_accounts.currency` chỉ là nhãn | `lfood_fx/models/fx.py` (`fx.rate`) | kernel K-030-2 | P1 |
| DM10 | Phòng ban, chức danh | 🟡 | `org_units`; chưa chức danh | `lfood_hr_records/models/records.py` | modules/nhan-su | P2 |
| DM11 | Tài khoản ngân hàng | ✅ | `bank_accounts` | — | core | — |
| DM12 | Vùng và kênh bán | 🟡 | `price_list_branches`, chiều `channel` chưa chuẩn | `lfood_salesorder` `sale.channel` | modules/ban-hang | P0 |

### 1.2 Mua hàng (MH)

| Mã | Nghiệp vụ | open-ketoan | Bằng chứng | Nguồn Erp-vn | Đích | Ưu tiên |
|---|---|---|---|---|---|---|
| MH01 | Yêu cầu mua (có kiểm ngân sách) | ☐ | `order` là đơn đặt, không có bước yêu cầu nội bộ | `lfood_purchase/models/purchase.py` `purchase.request` | modules/mua-hang | P1 |
| MH02 | Đề nghị báo giá, so sánh | ☐ | — | `purchase.quote`, `action_choose`, `lfood_quote_threshold` | modules/mua-hang | P2 |
| MH03 | Đơn mua hàng | ✅ | `purchase_documents.kind=order`, giữ hạn mức | `purchase.order` | phan-he/mua-hang | — |
| MH04 | Hợp đồng mua khung | 🟡 | chính sách `contract`, `contract_schedules` | `lfood_contract/models/purchase_contract.py` | modules/hop-dong | P2 |
| MH05 | Đối chiếu 3 bên (đơn – nhập – hoá đơn) | 🟡 | MH21 đối chiếu đơn ↔ nhập; hoá đơn NCC tách (MH22) | `lfood_purchase/models/integration.py` | phan-he/mua-hang | P1 |
| MH06 | Nhận, kiểm hoá đơn đầu vào | ✅ | `supplier_invoices`, quét AI, kiểm cơ quan thuế | `lfood_vat/models/einvoice_check.py` | phan-he/mua-hang, thue | — |
| MH07 | Chứng từ mua dịch vụ có phiên bản | 🟡 | `accounting_event_versions` + lịch sử PHASE-029; chưa "bản sửa / bản báo cáo" | `lfood_voucher/models/voucher.py`, `voucher_version.py` | kernel (đã có nền) | P2 |
| MH08 | Tự tính lại số liệu chứng từ | ✅ | `engine.ts` tính lại máy chủ, `allocate` | `lfood_voucher/models/tools.py` `allocate()` | phan-he/mua-hang | — |
| MH09 | Trả lại, giảm giá hàng mua | ✅ | `return`, `rebate` (GGHM) | `lfood_purchase/models/adjust.py` | phan-he/mua-hang | — |
| MH10 | Phân bổ chi phí mua | ✅ | `cost`, MH07 giá vốn thực | `purchase.adjust kind=landed` | phan-he/mua-hang | — |
| MH11 | Thu mua nông sản không hoá đơn (bảng kê 01/TNDN) | ☐ | — | `lfood_purchase/models/tally.py` | modules/mua-hang | P2 |
| MH12 | Mua hàng nhập khẩu (tờ khai, thuế NK, VAT NK, chi phí) | ☐ | — | `lfood_trade/models/importing.py` | modules/xuat-nhap-khau | P3 |
| MH13 | Đánh giá nhà cung cấp | ☐ | — | `lfood_contract/models/supplier_eval.py` | modules/mua-hang | P3 |

### 1.3 Bán hàng, CRM, TMĐT (BH)

| Mã | Nghiệp vụ | open-ketoan | Bằng chứng | Nguồn Erp-vn | Đích | Ưu tiên |
|---|---|---|---|---|---|---|
| BH01 | Cơ hội bán hàng | ☐ | — | `lfood_salesorder/models/lead.py` | modules/ban-hang (tuỳ chọn) | P3 |
| BH02 | Báo giá | ☐ | — | `sale.order` state draft | modules/ban-hang | **P0** |
| BH03 | Đơn bán hàng | ☐ | BH10 chạy JSON mẫu; `sale` chỉ đến từ POS / Woo | `sale.order` | modules/ban-hang | **P0** |
| BH04 | Bảng giá theo kênh | 🟡 | `price_lists`, `price_list_branches` | `lfood.pricelist`, `sale.channel` | modules/ban-hang | **P0** |
| BH05 | Khuyến mãi, chiết khấu thương mại (NĐ81/2018, trần 50 %) | 🟡 | engine khuyến mãi chỉ phía mua | `lfood_promotion/models/promotion.py` | modules/ban-hang | **P0** |
| BH06 | Hạn mức công nợ khách | 🟡 | `partners.credit_limit` chỉ kiểm phía NCC | `sale_order.py:175-205` (nợ + đơn mở + đơn này > hạn mức → chờ duyệt) | modules/ban-hang | **P0** |
| BH07 | Hợp đồng, chính sách nhà phân phối (bậc, thưởng) | ☐ | — | `lfood_contract/models/distributor.py` | modules/ban-hang | P2 |
| BH08 | Hoá đơn điện tử có mã CQT | 🟡 | `tax_invoices` nhận về; chưa phát hành | `lfood_sale/models/sale_invoice.py` | modules/ban-hang + thue | P1 |
| BH09 | Hoá đơn điều chỉnh, thay thế (04/SS-HĐĐT) | 🟡 | `tax_invoices.status` replaced / adjusted; chưa lập | `sale_invoice.correction` | modules/ban-hang | P1 |
| BH10 | Hàng bán bị trả lại | ✅ | `sale_return`, NTH1 | — | kernel | — |
| BH11 | Hàng khuyến mãi, biếu tặng, mẫu | ✅ | XTA1.4; lý do quà | `promotion.py` | kernel | — |
| BH12 | Chi phí trade marketing, trưng bày | ☐ | — | `lfood.trade.program` | modules/ban-hang | P2 |
| BH13 | Đơn sàn TMĐT (đối soát phí sàn) | 🟡 | chỉ WooCommerce → `sale` | `lfood_ecommerce/models/ecommerce.py` (`ecom.settlement`) | modules/tmdt | P3 |
| BH14 | Bán hàng xuất khẩu | ☐ | — | `lfood_trade/models/exporting.py` | modules/xuat-nhap-khau | P3 |

### 1.4 Kho, lô, mã vạch (KHO)

| Mã | Nghiệp vụ | open-ketoan | Bằng chứng | Nguồn Erp-vn | Đích | Ưu tiên |
|---|---|---|---|---|---|---|
| KHO01 | Nhập kho mua theo lô | 🟡 | lô / hạn ở `purchase_documents.data`; Kernel `inventory_movements` không có lô | `lfood_stock/models/stock.py` `stock.lot` | kernel K-030-1 | **P0** |
| KHO02 | Xuất bán theo hạn dùng (FEFO) | 🟡 | FEFO ở báo cáo mua hàng; xuất bán không chọn lô | `_fefo_split`, hook `_fefo_lot_domain` | kernel K-030-1 + modules/kho | **P0** |
| KHO03 | Chuyển kho nội bộ | 🟡 | `transfer` + XCKho; màn KHO01 chạy JSON mẫu | `stock.picking kind=transfer` | modules/kho | **P0** |
| KHO04 | Chuyển hàng giữa 2 pháp nhân | ☐ | ACC61/62 công nợ nội bộ; chưa chứng từ | `lfood_intercompany/models/transfer.py` | modules/kho | P2 |
| KHO06 | Nhập thành phẩm từ nhà máy | 🟡 | `purpose=factory` ~ nhập khác | `stock.picking purpose=factory` | modules/kho | P2 |
| KHO07 | Kiểm kê kho (phiếu kiểm, chênh lệch → NDC / XDC) | 🟡 | `stock_adjustment` có lý do; chưa **phiếu kiểm kê** | `lfood_stock/models/count.py` | modules/kho | **P0** |
| KHO08 | Cận hạn, hết hạn, tiêu huỷ (TT20/2026) | 🟡 | cảnh báo cận hạn MH08; chưa phiếu tiêu huỷ | `lfood_stock_control/models/control.py` `stock.disposal` | modules/kho | P1 |
| KHO09 | Cách ly hàng không đạt | ☐ | — | `stock.lot.hold`, `stock.hold.wizard` | modules/kho | P1 |
| KHO10 | Tồn tối thiểu, đề xuất đặt | 🟡 | tồn max + công thức đặt hàng (mạnh hơn) | `stock.reorder` | phan-he/mua-hang | — |
| KHO11 | Quét mã vạch, in tem lô | 🟡 | `item_codes.kind=barcode`, in mã; chưa luồng quét | `lfood_stock/models/barcode.py` `scan.mixin` | modules/kho | P2 |
| KHO12 | Tính giá xuất kho | ✅ | bình quân tháng (`costing.service.ts`) | bình quân di động, cấm lùi ngày | kernel (ghi chú khác biệt) | — |

### 1.5 Tài sản, CCDC, bảo trì, xe (TS)

| Mã | Nghiệp vụ | open-ketoan | Bằng chứng | Nguồn Erp-vn | Đích | Ưu tiên |
|---|---|---|---|---|---|---|
| TS01 | Ghi tăng TSCĐ (ngưỡng 30 tr) | ✅ | ACC28, gợi ý Nợ 211 / Có 331 | `lfood_asset/models/asset.py`, `NGUONG_TSCD` | phan-he/tai-san | — |
| TS02 | Tách tài sản khi SL > 1 | ☐ | — | `asset._split_quantity` | phan-he/tai-san | P2 |
| TS03 | Khấu hao hằng tháng | ✅ | `depreciation`, `asset_depreciations`; Erp-vn tính **theo ngày** tháng đầu | `lfood_asset/models/depr_tools.py` | phan-he/tai-san (ghi chú công thức) | P1 |
| TS04 | Điều chỉnh nguyên giá, thời gian | 🟡 | `asset_events.revaluation`, `asset_depreciation_overrides` | Erp-vn không có model riêng | phan-he/tai-san | — |
| TS05 | Điều chuyển | ✅ | ACC33, liên chi nhánh | `asset.transfer` | phan-he/tai-san | — |
| TS06 | Thanh lý, nhượng bán | ✅ | ACC30 | `asset.dispose` | phan-he/tai-san | — |
| TS07 | Kiểm kê TSCĐ | 🟡 | ACC35, `asset_events.audit` | Erp-vn không có model riêng | phan-he/tai-san | — |
| TS08 | Thẻ, sổ TSCĐ | 🟡 | ACC29/42; chưa mẫu S23 / S24 | — | phan-he/tai-san | P2 |
| TS09 | CCDC phân bổ | ✅ | `assets.kind=tool`, ACC22 | sản phẩm `tool` → 153 + `prepaid` 242 | phan-he/tai-san | — |
| TS10 | XDCB dở dang (241 → 211) | ☐ | — | `lfood_asset/models/cip.py` | modules/tai-san | P2 |
| TS11 | Bảo trì thiết bị | ☐ | — | `lfood_equipment/models/equipment.py` `maintenance` | modules/thiet-bi | P3 |
| TS12 | Đội xe, nhiên liệu | ☐ | — | `vehicle`, `fuel.log`, `carrier`, `freight.log` | modules/thiet-bi | P3 |
| TS13 | Thuê tài sản (→ trả trước theo kỳ) | ☐ | — | `lfood_accrual/models/lease.py` | modules/tai-san | P2 |

### 1.6 Kế toán tổng hợp, tiền, công nợ (KT)

| Mã | Nghiệp vụ | open-ketoan | Bằng chứng | Nguồn Erp-vn | Đích | Ưu tiên |
|---|---|---|---|---|---|---|
| KT01 | Thu chi tiền mặt | ✅ | ACC51/52, voucher | `lfood_ledger/models/payment.py` | kernel | — |
| KT02 | Thu chi ngân hàng | ✅ | ACC53/54 | như trên | kernel | — |
| KT03 | Đối soát ngân hàng (sao kê CSV ↔ sổ) | ☐ | chỉ đối soát kho ↔ sổ, hoá đơn CQT ↔ sổ hoá đơn | `lfood_bank/models/bank.py` `bank.statement` | modules/ngan-hang | **P1** |
| KT04–KT05 | Công nợ phải thu / phải trả, tuổi nợ | ✅ | `debt_items`, CN01–07, ACC67 | `lfood_sale/models/aging.py` | kernel | — |
| KT06 | Bù trừ công nợ | ✅ | tự động FIFO theo hạn | `lfood_ledger/wizards/offset.py` | kernel | — |
| KT07 | Tạm ứng, hoàn ứng (141) | ☐ | 141 chỉ là dòng B01 | `lfood_advance/models/advance.py` | modules/tam-ung | **P1** |
| KT08 | Bút toán tổng hợp, điều chỉnh | ✅ | ACC16, `manual_journal` | `lfood_entry` lưới Excel | kernel | — |
| KT09 | Chi phí trả trước (242) | ✅ | `assets.kind=prepaid`, ACC23 | `lfood.prepaid` | phan-he/tai-san | — |
| KT10 | Chi phí trích trước (335) | ☐ | — | `lfood.accrued`, `accrual.run` | modules/ke-toan-ky (kernel K-030-3) | **P1** |
| KT11 | Chênh lệch tỷ giá cuối kỳ (413) | ☐ | 413 chỉ là dòng báo cáo | `lfood_fx/models/fx.py` `fx.revaluation` | kernel K-030-2 | **P1** |
| KT12 | Dự phòng (2293 nợ khó đòi, 2294 giảm giá HTK) | ☐ | dòng B01 | `lfood_provision/models/provision.py` | modules/ke-toan-ky (kernel K-030-3) | **P1** |
| KT13 | Kết chuyển, xác định KQKD | ✅ | ACC6, `closing_rules` có phiên bản | `lfood_ledger/wizards/closing.py` | kernel | — |
| KT14 | Khoá sổ kỳ | ✅ hơn | khoá theo chi nhánh × loại chứng từ, checklist, cổng chẩn đoán | `lfood_lock_date` một ngày | kernel | — |
| KT15 | Kiểm điều kiện chứng từ (≥ 5 tr không tiền mặt) | 🡒 THUE02 | — | `_compute_cash_warning` | — | — |
| KT16 | Vay và lãi vay (3411, lãi ngày 635 / 335) | 🟡 | ACC87 danh sách; chưa lịch, chưa trích lãi | `lfood_loan/models/loan.py` | modules/vay | P2 |
| KT17 | Sổ kế toán | ✅ | ACC88/89/12 | — | kernel | — |
| KT18 | Giao dịch nội bộ, hợp nhất 2 pháp nhân | 🟡 | ACC61/62 công nợ nội bộ | `lfood_consolidation` | modules/hop-nhat | P3 |

### 1.7 Ngân sách (NS)

| Mã | Nghiệp vụ | open-ketoan | Bằng chứng | Nguồn Erp-vn | Đích | Ưu tiên |
|---|---|---|---|---|---|---|
| NS01 | Lập ngân sách trên cây khoản mục | 🟡 | `cash_plans`, `cost_norms` (phẳng, theo tháng) | `lfood_budget/models/budget.py` | modules/ngan-sach | P2 |
| NS02 | Duyệt, phiên bản ngân sách | ☐ | — | `budget.new_version`, unique (company, year, version) | modules/ngan-sach | P2 |
| NS03 | Kiểm soát khi phát sinh (Q030-3) | ☐ | — | `budget.check_over` (chỉ cảnh báo) | modules/ngan-sach + hook mua hàng | P2 |
| NS04 | So sánh kế hoạch / thực tế | 🟡 | KH01, KH02 | `lfood_budget/models/report.py` | modules/ngan-sach | P2 |
| NS05 | Phân bổ chi phí chung | ☐ | — | `lfood_salesorder/models/allocation.py` | modules/ngan-sach | P3 |

### 1.8 Thuế (THUE)

| Mã | Nghiệp vụ | open-ketoan | Bằng chứng | Nguồn Erp-vn | Đích | Ưu tiên |
|---|---|---|---|---|---|---|
| THUE01, THUE03 | GTGT theo thuế suất, tờ khai 01/GTGT | ✅ | ACC66, 01/KHBS | `lfood_vat/models/vat_return.py` | phan-he/thue | — |
| THUE02 | Điều kiện khấu trừ (ngưỡng không tiền mặt) | 🟡 | cảnh báo hoá đơn; chưa chặn theo tham số | `vat_return._check_threshold` | phan-he/thue | P2 |
| THUE04 | Đối chiếu hoá đơn CQT | ✅ | `authority_invoices` | `einvoice_check.py` | phan-he/thue | — |
| THUE05–06 | TNDN tạm nộp quý, quyết toán năm (15 / 17 / 20 %) | ✅ | TNDN03 | `lfood_cit/models/calc.py` `rate_for` | phan-he/thue | — |
| THUE07 | Khấu trừ TNCN từ lương | ☐ | — | `pit_progressive` | modules/nhan-su | P2 |
| THUE08–09 | Chứng từ khấu trừ, quyết toán TNCN (05/QTT) | ☐ | — | `lfood_pit/models/settlement.py` | modules/nhan-su | P2 |
| THUE10 | Khấu trừ thu nhập vãng lai 10 % | ☐ | — | `lfood_pit/models/freelance.py` | modules/nhan-su | P2 |
| THUE11 | Giao dịch liên kết (trần lãi vay 30 %) | ☐ | — | `lfood_related/models/related.py` | modules/thue-mo-rong | P3 |
| THUE12 | Lịch nghĩa vụ thuế, tiền chậm nộp | ☐ | — | `lfood_taxdue/models/obligation.py` | phan-he/thue | P2 |
| THUE13 | Thuế nhà thầu nước ngoài | ☐ | — | `lfood_trade/models/fct.py` | modules/xuat-nhap-khau | P3 |

### 1.9 Nhân sự (NSU) và lương (LUONG) — chưa có mã nào ở open-ketoan ngoài `partners.kind=employee`

| Mã | Nghiệp vụ | Nguồn Erp-vn | Đích | Ưu tiên |
|---|---|---|---|---|
| NSU01 | Tuyển dụng | `lfood_hr_records/models/recruit.py` | modules/nhan-su (tuỳ chọn) | P3 |
| NSU02 | Hồ sơ nhân viên, người phụ thuộc | `lfood.employee`, `lfood.dependent` | modules/nhan-su | P2 |
| NSU03 | Hợp đồng lao động | `lfood_hr/models/hr.py` `hr.contract` | modules/nhan-su | P2 |
| NSU04 | Thang bảng lương, quy chế | `payroll.component`, `employee.component` | modules/nhan-su | P2 |
| NSU05–NSU08 | Ca, chấm công, làm thêm, nghỉ phép | `hr.shift`, `hr.roster`, `hr.attendance`, `hr.leave` | modules/nhan-su | P2 |
| NSU09 | Ốm đau, thai sản | `lfood_benefit/models/benefit.py` | modules/nhan-su | P3 |
| NSU10–NSU11 | Tai nạn, an toàn | `lfood_hr_records/models/safety.py` | modules/nhan-su | P3 |
| NSU12–NSU14 | Khen thưởng, kỷ luật, điều chuyển, chấm dứt | `records.py`, `termination.py` | modules/nhan-su | P2 |
| NSU15 | Báo cáo lao động 01/PLI | `labor_report.py` | modules/nhan-su | P3 |
| NSU16–NSU17 | KPI, đào tạo | `performance.py` | modules/nhan-su | P3 |
| LUONG01–06, 11, 12 | Lương tối thiểu vùng, tính lương, phụ cấp, làm thêm, BHXH / BHYT / BHTN, KPCĐ, bảng lương, hạch toán | `lfood_payroll/models/calc.py` `compute_slip` | modules/nhan-su (kernel K-030-3 `payroll`) | P2 |
| LUONG07 | Tăng giảm lao động (D02-LT) | `insurance_change.py` | modules/nhan-su | P3 |
| LUONG08 | TNCN trên bảng lương | `pit_progressive` | modules/nhan-su | P2 |
| LUONG09–10 | Tạm ứng lương, thưởng, tháng 13 | `lfood_pit/models/advance.py` | modules/nhan-su | P2 |
| LUONG13 | Đề nghị thanh toán, công tác phí | ✅ đã có đề nghị thanh toán (quy); công tác phí = tạm ứng KT07 | modules/tam-ung | P1 |

### 1.10 Báo cáo (BC), chất lượng (CL), R&D (RD)

| Mã | Nghiệp vụ | open-ketoan | Ghi chú |
|---|---|---|---|
| BC01, BC05, BC07, BC10, BC11 | BCTC, tuổi nợ, bảng kê thuế, bảng điều hành, truy ngược | ✅ | truy ngược đã mạnh hơn (PHASE-029 lịch sử chứng từ) |
| BC02 | Phân tích chi phí nhiều kỳ theo cây | 🟡 | cần DM06 cây khoản mục |
| BC03 | Lãi gộp theo nhãn / kênh / vùng / sản phẩm | ✅ | BH01–05 |
| BC04 | Nhập xuất tồn, cận hạn | 🟡 | ACC83 + MH08; cận hạn phụ thuộc K-030-1 |
| BC08 | Lao động, lương, bảo hiểm | ☐ | theo nhân sự |
| BC09 | Hợp nhất | ☐ | KT18 |
| CL01–CL09 | QC, HACCP, truy xuất, thu hồi, công bố | ⛔ | ngành thực phẩm; không thuộc hạt nhân kế toán. Ghi lại làm **ví dụ module ngành** (`presets/`) khi cộng đồng cần |
| RD01–RD04 | R&D tách riêng | ⛔ | ngoài phạm vi |

## 2. Tổng hợp theo nhóm

| Nhóm | Tổng | ✅ | 🟡 | ☐ | ⛔ | Nhận xét |
|---|---|---|---|---|---|---|
| HT / CH / DM | 33 | 14 | 13 | 6 | 0 | nền tảng mạnh hơn Erp-vn; thiếu **seed tham số pháp lý VN** và tiền tệ |
| MH | 13 | 6 | 3 | 4 | 0 | thiếu yêu cầu mua, báo giá, nông sản, nhập khẩu, đánh giá NCC |
| BH | 14 | 2 | 6 | 6 | 0 | **khoảng trống lớn nhất đang có người dùng**: không có đơn bán, bảng giá / kênh / khuyến mãi / hạn mức phía bán |
| KHO | 11 | 1 | 8 | 2 | 0 | có số liệu, thiếu **chứng từ** (chuyển, kiểm kê, tiêu huỷ, cách ly) và **lô ở Kernel** |
| TS | 13 | 6 | 3 | 4 | 0 | thiếu XDCB, thuê, bảo trì, đội xe |
| KT | 18 | 11 | 2 | 5 | 0 | thiếu đối soát ngân hàng, tạm ứng, trích trước, tỷ giá, dự phòng |
| NS | 5 | 0 | 2 | 3 | 0 | chỉ có kế hoạch tiền / định mức |
| THUE | 13 | 5 | 1 | 7 | 0 | thiếu toàn bộ nhánh TNCN và nghĩa vụ thuế |
| NSU / LUONG | 30 | 0 | 0 | 30 | 0 | chưa có |
| BC / CL / RD | 23 | 6 | 2 | 2 | 13 | CL / RD ngoài phạm vi |
| **Tổng** | **173** | **51** | **40** | **69** | **13** | |

## 3. Chỗ Erp-vn yếu hơn open-ketoan — blueprint phải viết theo open-ketoan (D030-8)

| Chủ đề | Erp-vn | open-ketoan | Blueprint ghi |
|---|---|---|---|
| Duyệt theo hạn mức | một ngưỡng `lfood_voucher_approval_limit` (50 tr), nhóm quyền cứng | workflow YAML nhiều trạng thái, `second_level_from`, SoD (S029-25), authz PHASE-028 | luồng duyệt khai YAML; ngưỡng là `setting_values`; cấp 2 từ ngưỡng |
| Ngân sách | `check_over` chỉ cảnh báo | — | theo Q030-3, mặc định `bat_duyet` |
| Sửa chứng từ đã ghi | `editing` trong cửa sổ `edit_after_post_days`, hai con trỏ phiên bản | sửa = đảo + ghi lại, `accounting_event_versions`, lịch sử PHASE-029 | sửa sau ghi sổ = phiên bản mới qua `eventStore` (đảo + ghi), lý do bắt buộc (`warn` theo D029-4) |
| Khoá kỳ | một `lock_date` | khoá theo chi nhánh × loại chứng từ, checklist, cổng chẩn đoán | không hạ |
| Mẫu in VN (01-VT, 02-TT, S23…) | không có | `print_template_settings` (có khung) | blueprint liệt kê mẫu in cần theo TT99 phụ lục III / IV |
| Cô lập đơn vị, bằng chứng, outbox | không | RLS, evidence, outbox | không ghi lại trong blueprint; mặc định SDK |
| Kiểm tra cài module | không | CONFORMANCE | golden test theo [60](60-GOLDEN-TESTS.md) |

## 4. Đề xuất năng lực Kernel (K-030-*) — theo [VERSIONING §5](../../standard/VERSIONING.md), nhóm Lõi xếp phase

| Mã | Năng lực | Blueprint cần | Mức | Gợi ý |
|---|---|---|---|---|
| K-030-1 | **Lô / hạn dùng ở Kernel**: `inventory_movements.lot_ref`, `expiry_date`; `costing` giữ tồn theo lô; hook chọn lô (FEFO + điều kiện: hạn tối thiểu của khách, không cách ly) | KHO01, KHO02, KHO07–09, BC04 | K3 (migration) | Erp-vn: `stock.lot` unique (product, name); `_fefo_split`; hook `_fefo_lot_domain` được module khác mở rộng (bán hàng thêm `min_shelf_days`, kiểm soát kho thêm `hold=False`) |
| K-030-2 | **Nguyên tệ + tỷ giá** trên dòng sổ: `ledger_lines.amount_fc`, `currency`, `rate`; bảng tỷ giá có ngày; loại sự việc `fx_revaluation` (413 → 515 / 635 cuối kỳ) | DM09, KT11, MH12, BH14, THUE13 | K3 | Erp-vn: `fx.rate`, `fx.revaluation` đánh giá số dư ngoại tệ của 112 / 131 / 331 / 341 cuối kỳ |
| K-030-3 | **Loại sự việc kỳ kế toán mới**: `accrual` (trích trước 335), `provision` (2293 / 2294), `payroll` (334 / 338 / 3335 / 622 / 627 / 641 / 642), `employee_advance` (141), `loan_interest` (635 / 335) | KT10, KT12, KT07, LUONG12, KT16 | K2–K3 | mỗi loại một luật định khoản khai báo (PHASES 3.3) + lý do trong gói nền (K2 kế toán trưởng) |
| K-030-4 | **Chứng từ kiểm kê** là `docType` riêng (`stock_count`) sinh `stock_adjustment` chênh lệch, không để module tự lập điều chỉnh | KHO07, TS07 | K2 | Erp-vn `stock.count`: dòng kiểm = tồn sổ, tồn đếm, chênh; done → điều chỉnh |
| K-030-5 | **Phiên bản chứng từ hai con trỏ** (bản đang sửa / bản đã ghi sổ) hiển thị ở `GET /documents/:id` (`payloadVersion`, `postedVersion`) — đã có ở W2a PHASE-029 | MH07 | — | không cần thêm; blueprint trỏ PHASE-029 |
| K-030-6 | **Seed tham số pháp lý VN** vào `vn-rulepacks` theo khoá `setting_values` có `legal_ref`: lương cơ sở, lương tối thiểu 4 vùng, trần BHXH / BHTN, tỷ lệ 8 / 1.5 / 1 / 3 / 14 / 0.5 / 3 / 1 / KPCĐ 2 %, giảm trừ bản thân / phụ thuộc, 5 bậc TNCN, ngưỡng TSCĐ 30 tr, ngưỡng không tiền mặt 5 tr, TNDN 15 / 17 / 20 %, trần KM 50 %, trần lãi vay liên kết 30 % | CH01–CH05, LUONG, THUE | K1 | Erp-vn `*/data/legal_params.xml` (~200 tham số, có `legal_ref`, `date_from`) — **chỉ lấy danh sách khoá và căn cứ pháp lý**, giá trị kế toán trưởng xác nhận |
