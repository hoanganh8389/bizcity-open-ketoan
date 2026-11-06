# PHASE-030 · 55 — Blueprint Nhân sự và tiền lương (NSU01–NSU17, LUONG01–LUONG13)
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — blueprint nhân sự – lương: hồ sơ, hợp đồng, chấm công, nghỉ, lương – bảo hiểm – TNCN là hàm thuần, hạch toán lương một sự việc / tháng -->

Khuôn: [30](30-KHUON-BLUEPRINT.md). Nguồn: `erp/addons/lfood_payroll/models/{payroll,calc,simulation}.py`, `lfood_hr/models/{hr,shift,termination}.py`, `lfood_hr_records/models/*.py`, `lfood_benefit/models/*.py`, `lfood_pit/models/*.py`. Module đích: **`modules/nhan-su/`** (một module, domain tách `luong.ts` — đề nghị cho Q030-1; PHASES 3.7 đã dự kiến "Phân hệ Nhân sự làm phân hệ mẫu chuẩn đầu tiên viết hoàn toàn theo `bizcity_module@1`"). Ưu tiên P2.

**Đã có ở open-ketoan:** `partners.kind=employee` (công nợ theo nhân viên), `org_units`, đề nghị thanh toán (LUONG13), `users` (tách người ↔ nhân viên là S029-23).

**Điểm mở:** `payroll.extraLines` (thưởng, tạm ứng, phạt, công tác phí cắm vào bảng lương), `payroll.beforePost`, `hr.leaveBalance`.
**Năng lực Kernel cần:** K-030-3 (`payroll` docType), K-030-6 (tham số lương – bảo hiểm – TNCN có `legalRef`).

---

## A. Hồ sơ và quan hệ lao động

### NSU02 Hồ sơ nhân viên, người phụ thuộc
- `nhan-su.employee` (danh mục có phiên bản, ECP: không xoá, chỉ ngừng): mã, họ tên, CCCD, ngày sinh, giới, địa chỉ, MST cá nhân, số sổ BHXH, vùng lương tối thiểu (CH05: I–IV theo địa bàn làm việc), phòng ban / chức danh (DM10), tài khoản ngân hàng, `partner_id` (tự tạo `partners.kind=employee` qua `core.partner.upsert`), trạng thái (thử việc / chính thức / nghỉ). Người phụ thuộc: họ tên, quan hệ, CCCD / giấy khai sinh, MST, **từ tháng – đến tháng** được giảm trừ.
- Luật: giảm trừ phụ thuộc theo tháng hiệu lực; một người phụ thuộc chỉ một NLĐ / kỳ (cảnh báo trùng MST). Dữ liệu cá nhân → phân loại nhạy cảm (HT11, S029-24).
- Golden `T030-NSU-1` phụ thuộc hiệu lực từ 03/2026 → lương tháng 2 không giảm trừ, tháng 3 có.

### NSU03 Hợp đồng lao động
- `nhan-su.contract`: draft → running → expired | terminated; cancelled. Loại: thử việc (≤ 60 ngày, lương ≥ 85 %), xác định thời hạn (≤ 36 tháng, gia hạn tối đa 1 lần), không xác định thời hạn; lương cơ bản (≥ lương tối thiểu vùng), phụ cấp, đóng BHXH / BHTN (cờ), ngày bắt đầu / kết thúc.
- Luật: thử việc quá 60 ngày → chặn; HĐ xác định thời hạn lần 3 → chặn (phải không xác định thời hạn); lương < tối thiểu vùng → chặn (`legalRef` NĐ lương tối thiểu). Một NLĐ một HĐ `running` / thời điểm. Hết hạn → nhắc 30 ngày trước.
- Golden `T030-NSU-2` HĐ 12 tháng gia hạn lần 2 → chặn.

### NSU04 Thang bảng lương, quy chế
- `nhan-su.pay_component` (lương cơ bản, phụ cấp ăn, xăng xe, trách nhiệm, điện thoại…): loại, tính thuế?, tính BHXH?, công thức (cố định / theo ngày công / theo %). `employee_component`: gán theo nhân viên, hiệu lực từ. Phụ cấp ăn ca ≤ 730.000 (tham số, `legalRef` TT111 / TT26) miễn thuế phần trong mức.
- Golden `T030-NSU-3` ăn ca 1.000.000 → 730.000 miễn, 270.000 chịu thuế.

### NSU05–NSU08 Ca, chấm công, làm thêm, nghỉ phép
- `nhan-su.shift` (giờ vào / ra, nghỉ giữa ca, ban đêm 22h–6h), `roster` (lịch ca / nhân viên / ngày), `attendance` (ngày, vào, ra, công chuẩn, công thực, giờ thêm ngày thường / ngày nghỉ / lễ / đêm, nguồn: máy chấm / tay), `leave`: draft → approved | refused (loại: phép năm, không lương, ốm, thai sản, việc riêng có lương theo BLLĐ Điều 115).
- Luật: phép năm 12 ngày (+ 1 / 5 năm thâm niên; tham số), tính theo tháng làm việc; làm thêm ≤ 40 giờ / tháng, ≤ 200 (300) giờ / năm → vượt chặn (`legalRef` BLLĐ Điều 107); nghỉ không lương ≥ 14 ngày làm việc / tháng → không đóng BHTN tháng đó (LUONG05).
- Golden `T030-NSU-4` làm thêm luỹ kế 41 giờ / tháng → chặn giờ thứ 41; `T030-NSU-5` phép còn 2, xin 3 → từ chối.

### NSU09 Ốm đau, thai sản — `nhan-su.benefit`: draft → posted; cơ quan BHXH chi (không qua sổ DN, chỉ ghi nhận hồ sơ + thu hộ chi hộ nếu có). NSU10–11 tai nạn / an toàn, NSU12 khen thưởng – kỷ luật (`discipline`: draft → decided; hình thức theo BLLĐ Điều 124; không phạt tiền), NSU13 điều chuyển (`transfer`: draft → done, đổi phòng ban / chức danh / lương có hiệu lực từ), NSU15 báo cáo 01/PLI, NSU16 KPI, NSU17 đào tạo: hồ sơ, không hạch toán ngoài chứng từ chi. Golden `T030-NSU-6` kỷ luật hình thức "phạt tiền" → chặn.

### NSU14 Chấm dứt hợp đồng
- `nhan-su.termination`: draft → approved → posted. Tính: lương tới ngày, phép chưa nghỉ quy tiền, trợ cấp thôi việc (½ tháng lương / năm làm việc trước 2009 hoặc thời gian không đóng BHTN), trợ cấp mất việc, bồi thường vi phạm báo trước (tham số, `legalRef` BLLĐ Điều 46–48); báo trước 30 / 45 ngày theo loại HĐ.
- Hạch toán: vào bảng lương tháng cuối qua `payroll.extraLines` hoặc `payroll` riêng.
- Golden `T030-NSU-7` 6 năm làm, 2 năm không BHTN → trợ cấp thôi việc = 1 tháng lương.

## B. Tiền lương, bảo hiểm, thuế

### LUONG02–LUONG08, LUONG11–LUONG12 Bảng lương tháng
1. **Mục đích.** Một `payroll.run` / đơn vị / tháng: từ chấm công + thành phần lương + tạm ứng + thưởng → phiếu lương từng NLĐ; bảo hiểm; TNCN; chi lương NH; hạch toán một sự việc.
2. **Chứng từ `nhan-su.payroll_run`**: draft → computed → approved → posted → paid; cancelled. Duy nhất (đơn vị, năm, tháng). `computed` chạy `compute_slip` mọi NLĐ (tham số tại `date_to`); `approved` (kế toán trưởng); `posted` nộp `payroll`; `paid` khi `bank_payment` lương posted.
3. **Trường.** Kỳ, đơn vị, ngày tính tham số; phiếu lương: NLĐ, công chuẩn / thực, lương cơ bản, phụ cấp (từng thành phần, chịu thuế?), làm thêm (ngày thường 150 %, nghỉ 200 %, lễ 300 %, đêm + 30 %, làm thêm đêm + 20 % — BLLĐ Điều 98), tổng thu nhập, thu nhập chịu thuế, lương đóng BH, BH NLĐ (8 / 1,5 / 1), BH DN (3 + 14 + 0,5 / 3 / 1), KPCĐ 2 %, giảm trừ bản thân / phụ thuộc, thu nhập tính thuế, TNCN, tạm ứng trừ, khấu trừ khác, thực lĩnh.
4. **Luật (`luong.ts` thuần, mọi số từ `setting_values`):**
   - `luong_bh = NLĐ tham gia ? min(max(lương BH, min_vùng), HE_SO_TRAN_BHXH × LUONG_CO_SO) : 0` (trần 20 × mức tham chiếu, Luật BHXH 2024 Điều 31).
   - `luong_bhtn = tham gia BHTN và nghỉ không lương < 14 ngày ? min(max(lương BH, min_vùng), HE_SO_TRAN_BHTN × min_vùng) : 0` (trần 20 × min vùng, Luật Việc làm 2025 Điều 34).
   - NLĐ: BHXH 8 %, BHYT 1,5 %, BHTN 1 %; DN: ốm đau – thai sản 3 %, hưu trí 14 %, TNLĐ 0,5 % (0,3 % nếu đủ điều kiện), BHYT 3 %, BHTN 1 %; KPCĐ 2 % × `luong_bh` (Luật Công đoàn 2024 Điều 29). Làm tròn đồng từng dòng.
   - `thu_nhap_tinh_thue = max(0, thu nhập chịu thuế − BH NLĐ − (giảm trừ bản thân + n × giảm trừ phụ thuộc))`.
   - TNCN luỹ tiến **5 bậc tháng** (Luật TNCN 2025 Điều 9; bậc / thuế suất là tham số `thue.tncn.bac[n]`): đi từng bậc `part = min(tn, trên) − dưới`, `thuế += part × suất`; chỉ cư trú; HĐ < 3 tháng → khấu trừ 10 % (THUE10) và cảnh báo.
   - `thực lĩnh = tổng thu nhập − BH NLĐ − TNCN − tạm ứng − khấu trừ khác`.
5. **Quyền.** `nhan-su:payroll` tính; `ke-toan:chief` duyệt / ghi sổ; SoD.
6. **Ngoại lệ.** NLĐ không có HĐ `running` trong kỳ → bỏ qua + cảnh báo; lương BH < min vùng → tự nâng lên min vùng (ghi chú); tham số kỳ chưa có `legalRef` → chặn `posted`.
7. **Hạch toán.** `posted` → một sự việc `payroll` (K-030-3) nhiều dòng: chi phí lương theo bộ phận (chiều `org_unit`, tài khoản theo chính sách: SX / bán hàng / QLDN), phải trả NLĐ, phải trả BH (từng quỹ), KPCĐ, TNCN phải nộp, tạm ứng giảm; reasonCode `LUONG`. `paid` → `bank_payment` `CHILUONG` (chi tiết từng NLĐ qua chiều `employee`, một lệnh chi NH tệp Excel / API). Nộp BH / TNCN → `bank_payment` `NOPBH` / `NOPTNCN`.
8. **Căn cứ.** Luật BHXH 41/2024 Điều 31, 33, 34; NĐ158/2025; NĐ188/2025 Điều 6; Luật Việc làm 74/2025 Điều 33, 34; Luật Công đoàn 50/2024 Điều 29; Luật TNCN 109/2025 Điều 9; NQ 110/2025/UBTVQH15 (giảm trừ 15,5 tr / 6,2 tr); BLLĐ 2019 Điều 98; TT99 TK 334, 338 (3382–3386), 3335, 622 / 627 / 641 / 642. Ví dụ: Nợ 642 / Có 334; Nợ 334 / Có 3383, 3384, 3386, 3335; Nợ 642 / Có 3382–3386 (phần DN).
9. **Golden** (bảng số lấy từ self-test của nguồn, tham số 2026: min vùng I 5.310.000; mức tham chiếu 2.530.000; trần BHXH 20 ×; giảm trừ 15,5 tr / 6,2 tr; bậc 10 / 30 / 60 / 100 tr × 5 / 10 / 20 / 30 / 35 %):

   | Mã | Cho | Thì |
   |---|---|---|
   | `T030-LUONG-1` | lương 40 tr, 1 phụ thuộc, cư trú | BH NLĐ 4.200.000; TN tính thuế 14.100.000; TNCN 910.000; thực lĩnh 34.890.000; DN: BHXH 7.000.000, BHYT 1.200.000, BHTN 400.000, KPCĐ 800.000 |
   | `T030-LUONG-2` | lương 80 tr, 0 phụ thuộc | luong_bh 50.600.000 (trần); luong_bhtn 80.000.000 (trần 106,2 tr); BHXH 4.048.000, BHYT 759.000, BHTN 800.000; TN tính thuế 58.893.000; TNCN 8.278.600 |
   | `T030-LUONG-3` | lương 4 tr (< min vùng), nghỉ không lương 14 ngày | luong_bh 5.310.000; luong_bhtn 0; TNCN 0 |
   | `T030-LUONG-4` | sự việc `payroll` tháng | Σ Nợ = Σ Có; Σ chi phí lương theo chiều `org_unit` = Σ tổng thu nhập + BH DN + KPCĐ; 334 = Σ thực lĩnh + tạm ứng trừ |

### LUONG01 Lương tối thiểu vùng — tham số `luong.toi_thieu.vung_{I..IV}` theo ngày hiệu lực, `legalRef` NĐ; nhân viên gán vùng theo địa bàn (CH05). LUONG03 phụ cấp — NSU04. LUONG04 làm thêm / đêm — công thức ở mục 4.

### LUONG07 Khai báo tăng giảm lao động — `nhan-su.insurance_change`: draft → submitted → confirmed; mẫu D02-LT; sinh từ HĐ mới / chấm dứt / đổi lương BH / nghỉ không lương ≥ 14 ngày; nhắc nộp trước ngày `luong.bhxh.han_khai_bao`. Golden `T030-LUONG-5` HĐ mới tháng 3 → dòng tăng tháng 3 tự sinh.

### LUONG09 Tạm ứng lương — `nhan-su.salary_advance`: draft → approved → paid; trừ vào bảng lương tháng (`payroll.extraLines`); chi `payment` reasonCode `TAMUNGLUONG` (phải trả NLĐ Nợ trước). LUONG10 thưởng, tháng 13 — `nhan-su.bonus`: draft → approved → posted (vào bảng lương tháng chi, chịu TNCN cùng kỳ; thưởng bằng hiện vật quy giá). Golden `T030-LUONG-6` ứng 5 tr → thực lĩnh tháng giảm 5 tr, 334 không đổi tổng.

### LUONG13 Đề nghị thanh toán, công tác phí — ✅ đề nghị thanh toán (`quy`); công tác phí = tạm ứng KT07 với bảng kê; khoán công tác phí theo quy chế (tham số) không chịu TNCN phần trong mức.

### THUE07–THUE09 Khấu trừ, chứng từ khấu trừ, quyết toán TNCN
- `nhan-su.pit_settlement` (năm): draft → done; tổng thu nhập chịu thuế năm, BH, giảm trừ theo **số tháng** thực tế, thuế năm theo biểu **năm** (= bậc tháng × 12), đã khấu trừ, còn nộp / hoàn; uỷ quyền quyết toán (NLĐ chỉ một nguồn ≥ 3 tháng); mẫu 05/QTT-TNCN + phụ lục 05-1 / 05-2 / 05-3; chứng từ khấu trừ điện tử (THUE08) cho NLĐ không uỷ quyền.
- Golden `T030-THUE-5` 12 tháng × TNCN tháng = thuế năm khi thu nhập đều; thu nhập không đều → thuế năm < Σ tháng → hoàn.

## C. Mô phỏng tham số (CH03)
`nhan-su.payroll_simulation`: chọn kỳ đã `posted`, ghi đè tham số (`getSetting(key, { overrides })`), tính lại không ghi → bảng chênh từng NLĐ và tổng chi phí DN. Dùng khi dự thảo tăng lương tối thiểu / đổi trần. Golden `T030-LUONG-7` ghi đè min vùng +6 % → chênh đúng, không có bút toán mới.
