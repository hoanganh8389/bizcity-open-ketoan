# PHASE-030 · 20 — Mười hai mẫu thiết kế rút từ mã Erp-vn và chỗ đặt trong open-ketoan
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — mẫu thiết kế xuyên suốt: đọc từ mã, không chép mã; mỗi mẫu ghi "open-ketoan đã có / đặt ở đâu" -->

Mỗi mẫu: **Erp-vn làm gì** (đọc từ mã, tệp tính từ `erp/addons/`) → **open-ketoan đã có gì** → **đặt ở đâu khi dựng module** → **golden test gắn**. Không chép mã (D030-1).

## M1. Duyệt theo ngưỡng tiền — một ngưỡng là không đủ

- **Erp-vn:** `res.company.lfood_voucher_approval_limit` (mặc định 50 tr). `voucher.action_post`: `amount_total > limit` → `waiting`, ngược lại `posted` ngay. Đơn mua dùng lại ngưỡng này (`lfood_purchase/models/purchase.py:307`). Duyệt / từ chối: kế toán trưởng hoặc giám đốc. Không có bảng bậc, không chuỗi bước, không uỷ quyền; mục "Luồng duyệt" trong `cauhinh-lifeood.html` chưa làm.
- **open-ketoan đã có:** workflow YAML (`draft → submitted → approved1 → approved → paid`), `payment_request_settings.second_level_from`, quyền `payments:approve` / `approve-final`, từ chối bắt lý do, `override` có lý do và chỉ khi mọi cảnh báo chặn thuộc danh sách cho phép (`mua-hang/service.ts:47`).
- **Đặt ở đâu:** mọi blueprint khai luồng duyệt bằng YAML; ngưỡng cấp 2 = khoá `setting_values` `<key>.duyet.cap2_tu` (phạm vi đơn vị, ngày hiệu lực); SoD: người lập ≠ người duyệt (S029-25).
- **Golden:** `T030-CORE-1` nộp phiếu trên ngưỡng → không được ghi sổ khi chưa `approved`; `T030-CORE-2` người lập tự duyệt → từ chối `FORBIDDEN`.

## M2. Tham số pháp lý có ngày hiệu lực, có mô phỏng

- **Erp-vn:** `lfood.legal.param` (code, nhóm, kiểu, `kind` law / policy) ↔ nhiều `lfood.legal.param.value` (value, `date_from`, `date_to`, `legal_ref`, draft / approved). `get_value(code, date, default)` lấy dòng approved phủ ngày; context `lfood_param_sim={code: v}` ghi đè để **mô phỏng** (CH03). Duyệt: `kind=law` bắt `legal_ref`; dòng mở trước đó tự đóng ở `date_from − 1`; chồng ngày → lỗi; đã duyệt không sửa giá trị / ngày, không xoá. Bảng bậc TNCN lưu phẳng `TNCN_BAC_n_DEN`, `TNCN_THUE_SUAT_n`.
- **open-ketoan đã có:** PHASE-029 E2 `setting_values` chỉ thêm, phạm vi user → branch → accounting_unit → tenant, ngày hiệu lực, `getSetting / setSetting`, `config_version` (S029-10 đang làm).
- **Đặt ở đâu:** (1) thêm thuộc tính `legalRef` + `kind: law | policy` vào registry `bizcity-settings.registry.json` (đề xuất cho dòng E2 sau khi merge); (2) seed khoá VN ở `vn-rulepacks` (K-030-6); (3) mô phỏng = `getSetting(key, { at, overrides })` dùng trong *xem trước* của action (dry-run đã có ở PHASE-003).
- **Golden:** `T030-CORE-3` đổi tham số có hiệu lực từ ngày D → chứng từ ngày D−1 tính theo giá trị cũ, ngày D theo giá trị mới; `T030-CORE-4` tham số `law` không có `legalRef` → từ chối.

## M3. Chứng từ có phiên bản, hai con trỏ

- **Erp-vn:** `service.voucher` giữ `current_version_id` (bản đang sửa) và `report_version_id` (bản lên sổ / thuế / báo cáo). `action_edit` (kế toán trưởng, trong cửa sổ `edit_after_post_days`) chép dòng sang phiên bản mới, state `editing`; `_save_edit(reason)` lưu, tính diff vào `voucher.version.diff`; `action_apply_to_report` dời con trỏ báo cáo; `report_differs` báo lệch; `_restore_original`; sửa hàng loạt tạo phiên bản `bulk` và hoàn tác được. `write()` chặn sửa đầu / dòng ngoài draft / editing.
- **open-ketoan đã có:** `accounting_event_versions`, `posted_version`, `eventStore` đảo + ghi lại khi phiên bản mới, lịch sử chứng từ (PHASE-029 W1), `payloadVersion` (W2a), lý do sửa `warn` (D029-4).
- **Đặt ở đâu:** không thêm gì ở module; blueprint MH07 chỉ nói: *sửa sau ghi sổ = nộp phiên bản mới cùng `docKey`, Kernel đảo và ghi lại; màn hình hiện "bản đang xem ≠ bản đã ghi sổ"* khi `payloadVersion ≠ postedVersion`.
- **Golden:** `T030-CORE-5` nộp v2 cùng `docKey` → đúng một bút toán đảo v1 + một bút toán v2; tổng Nợ = Có; `ledger_entries` v1 không bị `UPDATE`.

## M4. Tự tính lại tổng và chia số dư — "chia dư lớn nhất"

- **Erp-vn:** `voucher._apply_total(new_total)`: dòng `locked` giữ nguyên; phần còn lại chia cho dòng không khoá **theo tỷ lệ số hiện có** bằng `allocate()` (`lfood_voucher/models/tools.py`): số nguyên VND, tổng khớp tuyệt đối, chia đều nếu mọi trọng số = 0 (phương pháp *largest remainder*). Ngân sách dùng cùng ý (`spread.py`).
- **open-ketoan đã có:** `modules/mua-hang/domain/src/engine.ts` tính lại máy chủ, không nhận số gửi lên; làm tròn theo luật làm tròn trong `doi-chieu-ke-toan.sql`.
- **Đặt ở đâu:** hàm thuần `allocate(total, weights, locked)` vào `packages/module-sdk` (hoặc `@bizcity/mua-hang-domain` đã có nếu trùng) để mọi module chia phí, chia ngân sách, chia khấu hao đều ra cùng một con số.
- **Golden:** `T030-CORE-6` chia 1.000.000 cho trọng số [1,1,1] → [333.334, 333.333, 333.333], tổng = 1.000.000; trọng số [0,0] → chia đều.

## M5. Lô, hạn dùng, FEFO có hook mở rộng

- **Erp-vn:** `stock.lot` unique (product, name), `expiry_date`; nhập tạo lô từ `lot_name` + hạn; xuất gọi `_fefo_split()` đi theo `expiry_date, id`, lấy đủ thì dừng, thiếu thì lỗi "không đủ". `_fefo_lot_domain()` là hook rỗng: bán hàng thêm `lfood_min_shelf_days` của khách; kiểm soát kho thêm `hold = False`. QC nhập: sản phẩm `qc_required` → lô bị `hold` "Chờ kiểm tra", đạt mới nhả.
- **open-ketoan đã có:** lô / hạn trong `purchase_documents.data`, FEFO ở `mua-hang/reports.ts` (`lotStock`), chính sách `lot_tracking`, cảnh báo `near_expiry`; **Kernel không có lô**.
- **Đặt ở đâu:** K-030-1 (Kernel giữ tồn theo lô, hook chọn lô dạng `defineHook('inventory.pickLots')` để module bán hàng / kho thêm điều kiện). Trước khi có K-030-1, module kho chỉ **đề xuất lô** và ghi `lotRef` vào payload; Kernel chưa kiểm.
- **Golden:** `T030-KHO-2` ba lô hạn 10/01, 10/03, 10/02 → xuất 1,5 lô lấy hết lô 10/01 rồi 0,5 lô 10/02; `T030-KHO-3` lô cách ly không được chọn dù hạn gần nhất.

## M6. Giá xuất bình quân di động, cấm lùi ngày

- **Erp-vn:** `stock.valuation` ghi dòng (qty, value) có dấu; `product._position(wh, lot, upto)` cộng SQL; giá xuất = qty × value / qty tồn, đơn vị cuối lấy phần còn lại cho khớp; `_check_date_order` chặn chứng từ lùi ngày; huỷ phải từ chứng từ mới nhất lùi về.
- **open-ketoan đã có:** bình quân **gia quyền tháng** (`inventory/costing.service.ts`), chạy cuối kỳ qua `eventStore` (`cogs`).
- **Đặt ở đâu:** giữ bình quân tháng (TT99 cho phép; ít vấn đề lùi ngày). Blueprint KHO12 ghi khác biệt và điều kiện chuyển sang di động nếu chủ dự án cần (cần K3 + luật cấm lùi ngày).
- **Golden:** `T030-KHO-6` giá vốn tháng = Σ giá trị nhập + tồn đầu / Σ lượng; mọi `cogs` trong tháng cùng một đơn giá.

## M7. Khấu hao theo ngày tháng đầu, tháng cuối lấy phần dư

- **Erp-vn:** `depr_tools.py`: `monthly = round(depreciable / life_months)`; tháng đầu = `monthly × (days − start.day + 1) / days`; tháng cuối = phần còn lại nên tổng khớp tuyệt đối; `prorate_until` cho tháng thanh lý tới ngày trước thanh lý. `asset.schedule` lưu lịch; `asset.depreciation.action_compute` tháng này từ chối nếu tháng trước chưa ghi. `NGUONG_TSCD` 30 tr chặn ghi tăng dưới ngưỡng, nhắc đi 242.
- **open-ketoan đã có:** `asset_depreciations`, `asset_depreciation_overrides`, lịch TS01, ghi sổ qua `eventStore` (`depreciation`).
- **Đặt ở đâu:** blueprint TS03 ghi công thức theo ngày làm **chuẩn** (TT45/2013 cho phép tính từ ngày đưa vào sử dụng); kiểm tra `phan-he/tai-san` hiện làm tròn tháng hay ngày — nếu tháng thì ghi nợ `N030-1` (sửa tại chỗ, không chuyển phân hệ).
- **Golden:** `T030-TS-1` tài sản 120 tr / 12 tháng đưa vào dùng 16/03 (31 ngày) → tháng 3 = 10 tr × 16/31 = 5.161.290; tổng 13 kỳ = 120.000.000 đúng.

## M8. Trả trước 242, trích trước 335, thuê: một lịch phân bổ dùng chung

- **Erp-vn:** `lfood.prepaid` / `lfood.accrued` cùng `build_schedule` (kỳ đầu theo ngày); `accrual.run` ghi mọi dòng đến hạn trong tháng; `lease` tạo `prepaid`; CCDC (`tool`) đi 153 → 242 → chi phí qua cùng `prepaid`.
- **open-ketoan đã có:** `assets.kind=prepaid` (242) có phân bổ; **chưa** 335, chưa thuê.
- **Đặt ở đâu:** K-030-3 loại sự việc `accrual`; blueprint KT09 / KT10 / TS13 dùng **một** khuôn "lịch phân bổ" (gốc, số kỳ, ngày bắt đầu, khoản mục, chiều Nợ / Có) — khác nhau chỉ ở `reasonCode`.
- **Golden:** `T030-KT-3` trích trước 12 tr / 12 kỳ → 12 bút toán 1 tr, kỳ 13 không có; thanh toán thực tế 11,5 tr → chênh 0,5 tr hoàn nhập đúng một bút toán.

## M9. Lương – bảo hiểm – TNCN là hàm thuần có tự kiểm

- **Erp-vn:** `compute_slip(p)` (`lfood_payroll/models/calc.py`) thuần số học; `payroll.run._params()` lấy mọi tỷ lệ từ tham số tại `date_to`. `si_base = min(max(salary, min_vùng), HE_SO_TRAN_BHXH × LUONG_CO_SO)`; `ui_base` trần `HE_SO_TRAN_BHTN × min_vùng`, = 0 nếu nghỉ không lương ≥ 14 ngày; NLĐ 8 + 1,5 + 1; NSDLĐ 3 + 14 + 0,5 + 3 + 1; KPCĐ 2 %; `assessable = max(0, taxable − bh_nld − (giảm trừ bản thân + n × phụ thuộc))`; `pit_progressive` 5 bậc tháng, chỉ cư trú. Cuối tệp có self-test.
- **open-ketoan:** chưa có.
- **Đặt ở đâu:** `modules/nhan-su/domain/src/luong.ts` thuần, test bảng; mọi tỷ lệ là `setting_values` (K-030-6); ghi sổ một sự việc `payroll` / tháng (K-030-3).
- **Golden:** `T030-LUONG-1..4` (bảng số ở [55](55-BP-NHAN-SU-LUONG.md)).

## M10. Ngân sách trên cây, kiểm khi phát sinh

- **Erp-vn:** `budget` (year, version) draft → approved → locked; `budget.line` unique (budget, item, month), chỉ lá; `set_amount` rải xuống lá bằng `spread`, `amount_for` cộng lên; `check_over(item, date)` lấy bản approved / locked mới nhất của năm, so kế hoạch tháng + nhánh khoản mục với phát sinh thực; gọi từ `purchase.request.action_confirm` (lưu `budget_warning`) và `voucher.action_post` (ghi audit "Vượt ngân sách"). **Chỉ cảnh báo.**
- **open-ketoan đã có:** `cash_plans`, `cost_norms`, KH01 / KH02 phẳng theo tháng.
- **Đặt ở đâu:** `modules/ngan-sach` với cây khoản mục (DM06, cần `dimensions.parent_id` hoặc bảng riêng của module), hook `defineHook('document.beforeSubmit')` trả `warn | require_approval | block` theo Q030-3.
- **Golden:** `T030-NS-1` phát sinh vượt → theo cấu hình: cảnh báo ghi `notes.audit`, hoặc chuyển `pending_approval`, hoặc từ chối `BUDGET_EXCEEDED`.

## M11. Hạn mức công nợ phía bán: nợ + đơn mở + đơn này

- **Erp-vn:** `sale_order.action_confirm`: `debt(131) + open_orders + this > partner.lfood_credit_limit` → state `waiting`, cần `approve_credit` (giám đốc / kế toán trưởng).
- **open-ketoan đã có:** `partners.credit_limit`, kiểm **phía mua** (`mua-hang/ncc.ts`, `credit_exceeded` có `override`).
- **Đặt ở đâu:** `modules/ban-hang` dùng lại đúng mẫu `override` có lý do của mua hàng; nợ đọc từ `debt_items` (sổ thật), đơn mở đọc từ bảng module.
- **Golden:** `T030-BH-4`.

## M12. Hook rỗng để module khác mở rộng, context "hệ thống" để bỏ khoá

- **Erp-vn:** phương thức rỗng `_fefo_lot_domain`, `_load_extras`, `_cost_extra`, `reminder._collect_*` cho addon khác override; cờ context `lfood_*_system` cho mã hệ thống bỏ qua `write()` lock; mọi đổi trạng thái chỉ qua nút action và đều `_record_event`.
- **open-ketoan đã có:** `defineHook` + `hooks` trong manifest (GOLDEN-CASE §3), `defineAction` ghi bằng chứng tự động, action-scope (S014-15).
- **Đặt ở đâu:** blueprint liệt kê **điểm mở** (hook) mà module khác được cắm: `inventory.pickLots`, `sale.priceLine`, `document.beforeSubmit`, `payroll.extraLines`. Không có "context hệ thống" — mọi ghi đi action, kể cả nội bộ.
- **Golden:** `T030-CORE-7` module B đăng ký hook `inventory.pickLots` → kết quả chọn lô của module A thay đổi theo; gỡ B → về mặc định.
