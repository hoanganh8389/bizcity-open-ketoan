# PHASE-030 · 54 — Blueprint Kế toán tiền – công nợ, ngân sách, thuế (phần còn thiếu)
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — blueprint KT03 đối soát ngân hàng, KT07 tạm ứng, KT10 trích trước, KT11 tỷ giá, KT12 dự phòng, KT16 vay, KT18 hợp nhất, NS01–05, THUE07–13 -->

Khuôn: [30](30-KHUON-BLUEPRINT.md). Nguồn: `erp/addons/lfood_bank/models/bank.py`, `lfood_advance/models/advance.py`, `lfood_accrual/models/accrual.py`, `lfood_fx/models/{fx,fx_calc}.py`, `lfood_provision/models/{provision,calc}.py`, `lfood_loan/models/loan.py`, `lfood_consolidation/models/consolidation.py`, `lfood_budget/models/{budget,spread,report}.py`, `lfood_pit/models/*.py`, `lfood_taxdue/models/obligation.py`, `lfood_related/models/related.py`. Chỉ đặc tả phần open-ketoan **chưa có** (KT01–06, 08, 09, 13, 14, 17 ✅; THUE01–06 ✅).

**Năng lực Kernel cần:** K-030-2 (nguyên tệ), K-030-3 (`accrual`, `provision`, `employee_advance`, `loan_interest`, `fx_revaluation`), K-030-6 (tham số tỷ lệ dự phòng, trần lãi vay, lãi chậm nộp 0,03 %/ngày).

---

## KT03 Đối soát ngân hàng

1. **Mục đích.** Nhập sao kê (CSV / API) theo kỳ; khớp từng giao dịch với dòng sổ tiền gửi; giao dịch ngân hàng chưa có sổ → lập phiếu; kết thúc khi chênh = 0.
2. **Chứng từ `ngan-hang.statement`**: draft (đang đối soát) ⇄ done. `done` chỉ khi: `dư đầu + Σ phát sinh = dư cuối` (sổ phụ tự khớp), không còn giao dịch chưa khớp, `chênh lệch còn lại = 0`. Mở lại: kế toán trưởng.
3. **Trường.** Tài khoản ngân hàng (`bank_accounts`, `reconcile_from`), từ – đến, dư đầu / cuối sổ phụ, tệp; dòng: ngày, số tham chiếu, nội dung, số tiền (+ vào / − ra), dòng sổ đã khớp (`ledger_lines.id`, **duy nhất** — một dòng sổ chỉ khớp một giao dịch), phiếu lập từ dòng này.
4. **Luật.** Tự khớp (`action_match`): cùng số tiền ± 0, ngày ± `ngan_hang.doi_soat.lech_ngay` (3), ưu tiên trùng số tham chiếu; còn lại khớp tay. Bảng đối chiếu: *dư sổ 112* = Σ dòng sổ posted ≤ ngày cuối; *sổ đã ghi NH chưa* = dòng sổ chưa khớp trong kỳ; *NH đã ghi sổ chưa* = giao dịch chưa khớp; `chênh = dư cuối sổ phụ − dư sổ − NH-chưa-sổ + sổ-chưa-NH`.
5. **Quyền.** `ngan-hang:reconcile`; mở lại `ke-toan:chief`.
6. **Ngoại lệ.** Tệp sai cột (cần `ngay, so_tham_chieu, noi_dung, tien_ra, tien_vao`) → chặn nêu dòng; giao dịch ngoài kỳ → chặn; phí ngân hàng chưa có sổ → nút "Lập phiếu chi" sẵn lý do.
7. **Hạch toán.** Không trực tiếp; phiếu lập từ dòng đi `bank_receipt` / `bank_payment` thường.
8. **Căn cứ.** Luật Kế toán Điều 40; TT99 TK 112; kiểm soát nội bộ.
9. **Golden.** `T030-KT-1` 5 giao dịch, 4 khớp tự động, 1 phí NH → lập phiếu chi → khớp → `done`; cố `done` khi còn chênh → từ chối nêu số.

## KT07 Tạm ứng và hoàn ứng

1. **Mục đích.** Nhân viên tạm ứng, chi, quyết toán bằng bảng kê chứng từ; thừa nộp lại / trừ lương; thiếu chi bổ sung. Công tác phí (LUONG13) dùng chung.
2. **Chứng từ `tam-ung.advance`**: draft → approved → paid → settled → closed; refused; cancelled.

   | Từ | Đến | Ai | Điều kiện |
   |---|---|---|---|
   | draft | approved | `tam-ung:approve` (kế toán trưởng / giám đốc) | nhân viên **không còn tạm ứng quá hạn** (`tam_ung.chan_qua_han = true`); tiền > 0; hạn > ngày đề nghị |
   | draft | refused | `tam-ung:approve` | lý do |
   | approved | paid | hệ thống khi phiếu chi (`payment` / `bank_payment` reasonCode `TAMUNG`) posted | không có phiếu chi nháp khác |
   | paid | settled | `tam-ung:settle` (kế toán) | có ≥ 1 dòng bảng kê; nộp sự việc quyết toán |
   | settled | closed | hệ thống | `còn lại = 0` (đã nộp lại / trừ lương / chi bổ sung posted) |

3. **Trường.** Nhân viên (`partners.kind=employee`), ngày, lý do, số đề nghị, hạn thanh toán, hình thức chi; tính: đã chi, đã nộp lại, đã chi theo chứng từ, còn lại (+ hoàn / − chi bổ sung); `salary_deduct`. Dòng bảng kê: ngày, nội dung, khoản mục chi phí, hoá đơn (ký hiệu, số, người bán), tiền chưa thuế, thuế suất, VAT.
4. **Luật.** `còn lại = đã chi − đã chi theo chứng từ − đã nộp lại`; dòng có hoá đơn ≥ ngưỡng không tiền mặt → cảnh báo VAT không khấu trừ; quá hạn → nhắc hằng ngày + chặn tạm ứng mới.
5. **Quyền.** `tam-ung:request`, `tam-ung:approve`, `tam-ung:settle`.
6. **Hạch toán.** Chi: `payment` reasonCode `TAMUNG` (phải thu tạm ứng theo chính sách, chiều nhân viên); quyết toán: `employee_advance_settlement` (K-030-3) nhiều dòng chi phí + VAT đầu vào, giảm tạm ứng; nộp lại: `receipt` `HOANUNG`; trừ lương: dòng trong `payroll`.
7. **Căn cứ.** TT99 TK 141; mẫu 03-TT giấy đề nghị tạm ứng, 04-TT giấy thanh toán tạm ứng (phụ lục III).
8. **Golden.** `T030-KT-2` ứng 5 tr, chi 4,2 tr (có VAT 10 % trên 2 tr), nộp lại 0,8 tr → 141 = 0, 133 = 200.000, chi phí = 4.000.000; ứng mới khi còn quá hạn → chặn.

## KT09 Trả trước — ✅ (`prepaid`). ## KT10 Chi phí trích trước (335)

1. **Mục đích.** Chi phí chắc chắn phát sinh nhưng chưa có hoá đơn (điện, lãi vay, lương nghỉ phép, sửa chữa lớn): trích đều các kỳ; thực tế về → bù trừ; quyết toán chênh.
2. **Chứng từ `ke-toan-ky.accrual`**: draft → running → done → settled; cancelled (kế toán trưởng, chỉ khi chưa kỳ nào posted; đã posted → đảo). Dòng kỳ: planned → posted; `accrual.run` tháng ghi mọi dòng đến hạn.
3. **Trường.** Nội dung, đối tượng (tuỳ chọn), tổng dự kiến, số kỳ, bắt đầu, khoản mục / chiều chi phí; thực tế (số, ngày, chứng từ gốc).
4. **Luật.** Lịch = `allocate(tổng, N kỳ)` (kỳ đầu theo ngày nếu `ke_toan.trich_truoc.theo_ngay`); quyết toán: `chênh = Σ trích − thực tế`; chênh > 0 hoàn nhập giảm chi phí; < 0 trích bổ sung.
5. **Quyền.** `ke-toan:post`; huỷ `ke-toan:chief`.
6. **Hạch toán.** Mỗi kỳ: `accrual` (K-030-3) reasonCode `TRICHTRUOC` (chi phí / phải trả theo chính sách); thực tế về: chứng từ `purchase` dịch vụ ghi giảm phải trả thay vì chi phí (tài khoản đối ứng theo chính sách `accrual`); quyết toán: `accrual_settle`.
7. **Căn cứ.** TT99 TK 335; CMKT 01 (phù hợp). Ví dụ: Nợ 6427 / Có 335; hoá đơn về Nợ 335, 133 / Có 331.
8. **Golden.** `T030-KT-3` 12 tr / 12 kỳ → 12 bút toán 1 tr; thực tế 11,5 tr → hoàn 0,5 tr một bút toán; 335 cuối = 0.

## KT11 Đánh giá chênh lệch tỷ giá cuối kỳ

1. **Mục đích.** Cuối năm (hoặc kỳ), số dư ngoại tệ của tiền, phải thu, phải trả, vay đánh giá lại theo tỷ giá mua / bán chuyển khoản NH giao dịch; chênh ghi lãi / lỗ tài chính.
2. **Chứng từ `ke-toan-ky.fx_revaluation`**: draft → posted; cancelled (đảo). `action_load`: gom số dư theo (tài khoản, đối tượng, tiền tệ) có nguyên tệ ≠ 0 tới ngày; thiếu tỷ giá tiền tệ nào → chặn nêu tên.
3. **Trường.** Ngày, bảng tỷ giá cuối kỳ (tiền tệ, mua CK, bán CK, trung bình = (mua + bán)/2 cho tiền; phải thu dùng mua, phải trả dùng bán — tham số `ke_toan.ty_gia.quy_tac`), dòng: tài khoản, đối tượng, nguyên tệ, sổ VND, giá trị đánh giá, chênh; tổng lãi / lỗ.
4. **Luật.** `chênh = nguyên tệ × tỷ giá cuối kỳ − sổ VND` (chiều theo tính chất tài khoản); mua ≤ bán, > 0.
5. **Quyền.** `ke-toan:chief`.
6. **Hạch toán.** `fx_revaluation` (K-030-2/3): từng dòng điều chỉnh tài khoản gốc (giữ chiều đối tượng) đối ứng CLTG; cuối cùng kết chuyển CLTG → doanh thu / chi phí tài chính (reasonCode `DGTG`).
7. **Căn cứ.** TT99 TK 413, 515, 635; TT200 Điều 69 (kế thừa); TT53/2016.
8. **Golden.** `T030-KT-4` phải thu 10.000 USD sổ 245 tr, tỷ giá mua cuối kỳ 25.000 → chênh +5 tr: 131 tăng 5 tr, lãi 5 tr; đảo → về 245 tr.

## KT12 Dự phòng

1. **Mục đích.** Trích / hoàn nhập dự phòng nợ phải thu khó đòi theo tuổi nợ (TT48/2019) và giảm giá HTK (giá gốc > giá trị thuần có thể thực hiện).
2. **Chứng từ `ke-toan-ky.provision`**: draft → posted; cancelled. `kind = receivable | inventory`. `action_load`: phải thu → từng hoá đơn posted còn dư, tháng quá hạn, tỷ lệ theo bậc tham số; HTK → từng mặt hàng tồn, giá gốc, giá trị thuần.
3. **Trường.** Ngày, loại, dòng: đối tượng / mặt hàng, cơ sở (dư nợ / lượng × giá gốc), tháng quá hạn, tỷ lệ, dự phòng cần = cơ sở × tỷ lệ (hoặc lượng × (giá gốc − giá thuần) nếu dương); **đã có trên sổ** (dư Có tài khoản dự phòng tới ngày); **điều chỉnh** = cần − đã có.
4. **Luật.** Bậc phải thu (tham số `ke_toan.du_phong.phai_thu.bac`, `legalRef` TT48 Điều 6): 6–<12 tháng 30 %; 12–<24 50 %; 24–<36 70 %; ≥ 36 100 %. Điều chỉnh > 0 trích thêm; < 0 hoàn nhập.
5. **Quyền.** `ke-toan:chief`.
6. **Hạch toán.** `provision` (K-030-3): trích thêm reasonCode `DPPT` (chi phí QLDN / dự phòng phải thu) hoặc `DPHTK` (giá vốn / dự phòng HTK); hoàn nhập = chiều ngược.
7. **Căn cứ.** TT48/2019/TT-BTC Điều 4, 6; TT99 TK 2293, 2294, 6426, 632.
8. **Golden.** `T030-KT-5` nợ 100 tr quá hạn 14 tháng → cần 50 tr; sổ đã có 30 tr → trích thêm 20 tr; kỳ sau thu hết → hoàn 50 tr.

## KT16 Vay và lãi vay

1. **Mục đích.** Hợp đồng vay, lịch trả gốc, giải ngân, trích lãi theo dư nợ từng ngày cuối kỳ, trả lãi, tất toán; lãi vượt trần (bên không phải TCTD) tách phần không được trừ.
2. **Chứng từ `vay.loan`**: draft → running → closed. `action_make_schedule` (N kỳ, cách M tháng, kỳ đầu) — Σ gốc = tiền vay, kỳ cuối ≤ đáo hạn; `disburse` (kế toán trưởng) → `running`; `_accrue(date_to)` lãi = Σ (dư nợ ngày × lãi suất / cơ sở 365|360); `closed` khi dư = 0 và đủ kỳ.
3. **Trường.** Bên cho vay (loại: TCTD / khác), gốc, lãi suất %/năm, cơ sở ngày, từ – đến, mục đích, tài khoản nhận; lịch (ngày, gốc); tính: đã trả gốc, dư nợ, lãi đã trích, lãi đã trả.
4. **Luật.** Bên "khác" lãi suất > `ke_toan.vay.tran_lai_nam` (20 %, `legalRef` BLDS Điều 468) → cảnh báo lúc giải ngân, phần lãi vượt tách dòng "không được trừ" (chiều `nonDeductible` cho THUE06). Đổi lãi suất = hợp đồng mới (phụ lục), không sửa.
5. **Quyền.** `ke-toan:chief`.
6. **Hạch toán.** Giải ngân: `bank_receipt` reasonCode `GIAINGAN`; trích lãi: `loan_interest` (K-030-3) `LAIVAY` (chi phí tài chính / phải trả lãi); trả lãi / gốc: `bank_payment` `TRALAI` / `TRAGOC`. B01: phần gốc đến hạn trong 12 tháng là ngắn hạn.
7. **Căn cứ.** TT99 TK 3411, 635, 335; BLDS 2015 Điều 468; TT78 Điều 6 khoản 2.17 (lãi vay không được trừ).
8. **Golden.** `T030-KT-6` vay 1,2 tỷ 12 %/năm giải ngân 01/01, 365 ngày → lãi tháng 1 = 1,2 tỷ × 12 % × 31/365 = 12.230.137; trả gốc 100 tr ngày 16/01 → lãi tháng 1 = 15 ngày × 1,2 tỷ + 16 ngày × 1,1 tỷ.

## KT18 Giao dịch nội bộ và hợp nhất

Module `modules/hop-nhat` (P3): bảng đối chiếu nội bộ (phải thu A ↔ phải trả B theo chiều `intercompany`), bút toán loại trừ (doanh thu / giá vốn nội bộ, lãi chưa thực hiện trong HTK), B01 / B02 hợp nhất = Σ đơn vị − loại trừ. Không ghi vào sổ đơn vị; bút toán loại trừ lưu ở sổ hợp nhất riêng (bảng module). Golden `T030-KT-7` 136(A) = 336(B) sau mọi KHO04; chênh → báo cáo lệch.

## NS01–NS05 Ngân sách

1. **Mục đích.** Lập ngân sách năm theo cây khoản mục (DM06) và tháng; duyệt; phiên bản; kiểm khi phát sinh; so sánh; phân bổ chi phí chung.
2. **Chứng từ `ngan-sach.budget`**: draft → approved → locked; `new_version` chép thành phiên bản + 1 ở `draft`; duy nhất (đơn vị, năm, phiên bản). Dòng chỉ ở **khoản mục lá**, duy nhất (ngân sách, khoản mục, tháng).
3. **Trường.** Năm, phiên bản, đơn vị / chi nhánh, dòng: khoản mục lá, tháng, số kế hoạch; tổng theo nhánh cộng lên; `set_amount(nhánh, tháng, tổng)` rải xuống lá theo `spread` (trọng số = số hiện có; khoá dòng giữ nguyên).
4. **Luật kiểm (NS03).** Hook `document.beforeSubmit` cho `purchase`, `payment`, `mua-hang.request`: lấy bản `approved | locked` mới nhất của năm; `kế hoạch tháng (nhánh)` so `thực tế posted tháng (nhánh) + chứng từ này`; vượt → theo `ngan_sach.vuot = canh_bao | bat_duyet | chan` (Q030-3; đề nghị mặc định `bat_duyet`).
5. **NS04.** Báo cáo kế hoạch / thực tế / chênh / % theo nhánh bất kỳ, nhiều kỳ (BC02).
6. **NS05.** `ngan-sach.allocation`: draft → posted; phân bổ chi phí chung (điện, thuê VP) sang bộ phận / sản phẩm theo tiêu thức (doanh thu, diện tích, nhân sự) bằng `allocate`; hạch toán `manual` chuyển chiều (không đổi tổng chi phí).
7. **Quyền.** `ngan-sach:edit`, `ngan-sach:approve` (kế toán trưởng).
8. **Căn cứ.** Quy chế tài chính nội bộ.
9. **Golden.** `T030-NS-1` kế hoạch tháng 3 nhánh "Marketing" 50 tr, thực 45 tr, phiếu 10 tr → `bat_duyet` → `pending_approval`; `T030-NS-2` rải 120 tr nhánh 3 lá [10, 20, 30] → [20, 40, 60].

## THUE07–THUE10 TNCN — xem [55](55-BP-NHAN-SU-LUONG.md) (gắn bảng lương). THUE10 vãng lai: `pit.freelance` draft → posted; thu nhập ≥ 2 tr/lần → khấu trừ 10 % (tham số `thue.tncn.vang_lai.nguong`, `ty_le`), chứng từ khấu trừ điện tử; hạch toán `payment` chi + reasonCode `TNCNVL` (phải nộp TNCN). Golden `T030-THUE-1` 5 tr → khấu trừ 500.000, chi 4,5 tr.

## THUE11 Giao dịch liên kết

Đánh dấu `partners.related = true` (+ loại quan hệ NĐ132 Điều 5); báo cáo phụ lục I NĐ132; trần chi phí lãi vay được trừ = 30 % EBITDA (tham số `thue.lien_ket.tran_lai_pct`, `legalRef` NĐ132 Điều 16) → dòng điều chỉnh tăng trong quyết toán TNDN (THUE06). Golden `T030-THUE-2` EBITDA 1 tỷ, lãi vay 400 tr → không được trừ 100 tr.

## THUE12 Lịch nghĩa vụ thuế, tiền chậm nộp

`thue.obligation`: open → paid; cancelled. Sinh tự động từ tờ khai (`vat_returns`, `cit_returns`, TNCN): loại, kỳ, hạn nộp (lịch theo luật: GTGT tháng ngày 20, quý ngày cuối tháng đầu quý sau; TNDN tạm nộp ngày 30 tháng đầu quý sau; quyết toán ngày cuối tháng 3), số phải nộp; `pay` → `bank_payment` reasonCode theo loại thuế; quá hạn → `post_interest` tiền chậm nộp = số × 0,03 % × ngày (tham số, `legalRef` Luật QLT 2019 Điều 59) ghi chi phí không được trừ. Nhắc trước hạn `thue.nhac_truoc_ngay` (7). Golden `T030-THUE-3` nợ 100 tr quá 10 ngày → chậm nộp 300.000, chiều `nonDeductible`.

## THUE13 Thuế nhà thầu nước ngoài

Module `xuat-nhap-khau` (P3): `fct.payment` draft → posted; khi trả nhà thầu nước ngoài: VAT NT = doanh thu tính thuế × tỷ lệ (tham số theo ngành, TT103 Điều 12), TNDN NT = × tỷ lệ (Điều 13); phương pháp trực tiếp (gross-up nếu hợp đồng net). Hạch toán: `bank_payment` chi + hai dòng thuế phải nộp (`VATNT`, `TNDNNT`); VAT NT khấu trừ khi nộp. Golden `T030-THUE-4` dịch vụ 100.000 USD net, VAT 5 %, TNDN 5 % → gross-up đúng TT103 Điều 12.
