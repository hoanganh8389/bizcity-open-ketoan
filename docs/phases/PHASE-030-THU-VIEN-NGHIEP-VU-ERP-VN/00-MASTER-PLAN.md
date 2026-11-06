# PHASE-030 · 00 — Kế hoạch: thư viện nghiệp vụ từ Erp-vn
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — kế hoạch tổng, quyết định D030-*, đợt W0–W4 -->

## 1. Vì sao

open-ketoan đã có **hạt nhân** vững (sổ cái chỉ thêm, một cửa ghi sổ, luật định khoản, RLS, outbox, SDK, bộ kiểm) và **một phân hệ nghiệp vụ dày** (mua hàng: 10 loại phiếu, 14 loại chính sách, lô / FEFO, tồn max). Phần còn lại mỏng hoặc chưa có: bán hàng (màn BH10 / BH11 vẫn chạy JSON mẫu), kho (chỉ danh sách chuyển kho), nhân sự, lương, bảo hiểm, ngân sách, đối soát ngân hàng, trích trước, dự phòng, tỷ giá, hợp nhất, tạm ứng, bảo trì, đội xe, thuê tài sản, sàn TMĐT ([10 §1](10-DOI-CHIEU-ERP-VN.md)).

Anh em dev và cộng đồng muốn dựng các module đó cần **đặc tả nghiệp vụ**: quy trình, trạng thái, điều kiện duyệt, công thức, ngoại lệ — chứ không phải đọc lại luật kế toán từ đầu. ERP LiFeOOD đã mã hoá 173 nghiệp vụ Việt Nam (TT99/2025, Bộ luật Lao động 2019, Luật BHXH, TT89/2026, NĐ254/2026…) thành mã Python đọc được; đó là **thư viện tình huống** rẻ nhất để rút đặc tả.

Nguyên tắc: **open-ketoan là chuẩn.** Erp-vn cho *cái gì* (nghiệp vụ, công thức, ngoại lệ); open-ketoan quyết *làm thế nào* (một cửa ghi sổ, `reasonCode`, workflow YAML, `setting_values`, RLS, bộ kiểm).

## 2. Sự thật đọc mã (2026-11-06)

| Bên | Đọc được gì | Nguồn |
|---|---|---|
| open-ketoan | `DOC_TYPES` 18 loại; luật định khoản `sale / sale-return / purchase / stock / cash / journal`; gói nền `vn-tt99-nen` 14 lý do; `purchase_documents.kind` 10 loại, workflow `draft → pending_approval → approved`, `override` có lý do; đề nghị thanh toán 2 cấp theo `second_level_from`; tài sản `fixed_asset / tool / prepaid`; thuế GTGT / TNDN; khoá kỳ; bù trừ công nợ | `packages/contracts/src/enums.ts`, `packages/kernel/src/modules/posting/rules/*`, `db/packs/vn-tt99-nen.posting-pack.json`, `apps/api/src/phan-he/mua-hang/*`, `apps/api/src/phan-he/quy/payment-requests/*.yaml`, `apps/api/src/modules/assets/*` |
| open-ketoan | **Chưa có:** báo giá / đơn bán / giao hàng; chứng từ kiểm kê; cách ly lô; lô trong `inventory_movements` của Kernel; nhân sự / lương / bảo hiểm; sao kê ngân hàng; 335 / 2293 / 413 ngoài dòng báo cáo; tạm ứng 141; hợp nhất; bảo trì; đội xe; thuê; sàn ngoài Woo | kiểm kê [10 §1](10-DOI-CHIEU-ERP-VN.md) |
| Erp-vn | 46 addon, model có `state` rõ (vd `purchase.request: draft → waiting → approved → ordered`), tham số pháp lý `get_value(code, date)` có mô phỏng, chuỗi băm audit, voucher hai con trỏ phiên bản, `allocate()` chia dư lớn nhất, FEFO với hook `_fefo_lot_domain`, bình quân di động cấm lùi ngày, khấu hao theo ngày tháng đầu, `compute_slip` lương – bảo hiểm – TNCN thuần, ngân sách chỉ cảnh báo | `d:\projects\Erp-vn\erp\addons\lfood_*` (dòng 1 mỗi tệp ghi mã nghiệp vụ); [20](20-MAU-THIET-KE.md) |
| Erp-vn | **Không có:** engine duyệt nhiều cấp (một ngưỡng `lfood_voucher_approval_limit`), mẫu in 01-VT / 02-TT / C-series (chỉ B01 / B02 / B03 / 01-GTGT / 03-TNDN / 05-QTT bằng HTML + Excel), RLS, outbox, bộ kiểm cài module, TS04 / TS07 không có model riêng | kiểm kê [10 §1](10-DOI-CHIEU-ERP-VN.md) |

## 3. Quyết định (D030-*)

| Mã | Quyết định | Vì sao |
|---|---|---|
| D030-1 | Erp-vn là **thư viện tham khảo thiết kế**, không phải nguồn mã. Không import, không dịch mã LGPL; chỉ rút trạng thái, điều kiện, công thức, ngoại lệ, mẫu biểu | giấy phép khác (GPL-2.0-or-later ↔ LGPL-3), kiến trúc khác (ORM Odoo ↔ SQL minh bạch + SDK) |
| D030-2 | Một **khuôn blueprint 9 mục** ([30](30-KHUON-BLUEPRINT.md)) cho mọi nghiệp vụ, mã giữ nguyên mã của Erp-vn (MH01…) để tra chéo được về `nghiepvu-lifeood.html`; thêm hậu tố `-OK` khi open-ketoan đã có cách làm khác | một khuôn thì AI sinh module đồng nhất, bộ kiểm so được |
| D030-3 | Blueprint **không** viết số tài khoản trong phần hạch toán của module; viết `reasonCode` + "tài khoản theo chính sách"; số tài khoản chỉ xuất hiện ở mục *Căn cứ* để kế toán đối chiếu | bốn câu không thương lượng (câu 4); `AccountResolver` |
| D030-4 | Tham số nghiệp vụ (ngưỡng duyệt, trần BHXH, ngưỡng TSCĐ, số ngày cận hạn…) là **khoá `setting_values` có ngày hiệu lực** (PHASE-029 E2), không phải hằng trong mã, không phải bảng riêng của module | Erp-vn chứng minh "luật đổi thì sửa tham số" chạy được; E2 đã có mô hình |
| D030-5 | Mỗi blueprint có mục **Golden test** với mã `T030-<nhóm>-<n>`; ca kiểm viết theo *cho – khi – thì* trên bất biến sổ (Nợ = Có, công nợ ↔ 131 / 331, kho ↔ 15x, không sửa `ledger_*`) chứ không trên bảng của module | ca kiểm độc lập module thì module người hay AI viết đều phải qua |
| D030-6 | Năng lực Kernel còn thiếu mà blueprint cần (lô / hạn trong `inventory_movements`, nguyên tệ + tỷ giá trên dòng sổ, loại sự việc `accrual` / `provision` / `fx_revaluation` / `payroll`, kiểm kê thành chứng từ) ghi thành **đề xuất năng lực** ở [10 §4](10-DOI-CHIEU-ERP-VN.md), đi theo [VERSIONING §5](../../standard/VERSIONING.md); module không tự vá | P2 Module không sửa Kernel |
| D030-7 | Mockup là **sơ đồ luồng** (bước → trạng thái → chứng từ → sổ) theo kiểu màn "Quy trình" của Erp-vn, một tệp HTML tĩnh dữ liệu JSON nội tuyến, tô màu theo mức có / một phần / chưa; không vẽ form chi tiết | duyệt nghiệp vụ trước, form sau bằng ui-kit |
| D030-8 | Phần Erp-vn **yếu hơn** open-ketoan (duyệt một ngưỡng, ngân sách chỉ cảnh báo, không mẫu in, không RLS) thì blueprint ghi theo cách open-ketoan, kèm ghi chú "Erp-vn làm đơn giản hơn: …" | không hạ chuẩn |
| D030-9 | Thứ tự ưu tiên theo **khoảng trống × tần suất dùng**: (P0) bán hàng + kho vì màn đang chạy JSON mẫu và POS / Woo đã đổ chứng từ vào; (P1) kế toán tiền – công nợ còn thiếu (đối soát ngân hàng, tạm ứng, trả trước / trích trước, dự phòng, tỷ giá) + tài sản phần thiếu; (P2) nhân sự – lương; (P3) ngân sách, hợp nhất, sàn TMĐT, nhập – xuất khẩu, bảo trì, đội xe | chủ dự án liệt kê mua – kho – bán – tài sản trước |

## 4. Câu hỏi mở (Q030-*)

| Mã | Câu hỏi | Ai trả lời |
|---|---|---|
| Q030-1 | Nhân sự – lương làm **một** module `nhan-su` (như PHASES 3.7 đã dự kiến) hay tách `nhan-su` / `luong` / `bao-hiem`? Erp-vn tách 5 addon (payroll, hr, hr_records, benefit, pit) nhưng `payroll` là gốc phụ thuộc | chủ dự án |
| Q030-2 | Lô / hạn dùng đặt ở Kernel (`inventory_movements.lot_id`, FEFO trong `costing`) hay giữ ở module kho và Kernel chỉ nhận `lotRef` trong payload? Hiện mua hàng giữ lô ở `purchase_documents.data` | nhóm Lõi (đề xuất năng lực K-030-1) |
| Q030-3 | Ngân sách: cảnh báo (như Erp-vn) hay **chặn / bắt duyệt** khi vượt (như spec NS03 của chính Erp-vn chưa làm)? Đề nghị: cấu hình `ngan_sach.vuot = canh_bao \| bat_duyet \| chan` | kế toán trưởng |
| Q030-4 | Bán hàng: có cần "giao hàng" (delivery) là chứng từ riêng giữa đơn bán và hoá đơn không, hay xuất kho = hoá đơn như POS hiện nay? Erp-vn: đơn → picking OUT → hoá đơn | chủ dự án |
| Q030-5 <!-- [2026-11-06 04:40 PM Johnny Chu - Chu Hoàng Anh] PHASE-030 — sổ cổng --> | Sổ cổng dạng tệp: giữ STD-EVD-4 (chỉ bảng CSDL, phương án A) hay sửa STD-EVD-4 để thêm **bản lưu trữ niêm phong** xuất hằng ngày từ bảng có chuỗi băm (phương án B, khuyến nghị)? Tệp làm nơi ghi chính (C) không khuyến nghị ([21 §2.4](21-SO-CONG-VA-BANG-DIEU-HANH.md)) | ✅ chủ dự án 2026-11-06: **B** |

## 5. Đợt

| Đợt | Việc | Kết quả kiểm được |
|---|---|---|
| **W0** (2026-11-06) | README, kế hoạch, ma trận đối chiếu [10](10-DOI-CHIEU-ERP-VN.md), mẫu thiết kế [20](20-MAU-THIET-KE.md), khuôn [30](30-KHUON-BLUEPRINT.md), blueprint 50–55, khuôn golden test [60](60-GOLDEN-TESTS.md), mockup luồng | PR tài liệu vào `main`; `selfcheck` ĐẠT (SC-PHASE-1, SC-SIG-1) |
| **W1** | Chủ dự án duyệt mockup + ưu tiên D030-9; kế toán trưởng trả Q030-3; nhóm Lõi trả Q030-2 và xếp đề xuất năng lực K-030-* vào phase Kernel | chữ chốt ghi vào [40](40-MASTER-CHECKLIST.md) |
| **W2** | Chuyển blueprint P0 (bán hàng, kho) về `docs/nghiep-vu/ban-hang/`, `docs/nghiep-vu/kho/`; viết ca golden test chạy được cho mua hàng (đã có mã) để chứng minh khuôn [60](60-GOLDEN-TESTS.md) | `apps/api/test/golden/T030-MH-*.test.ts` xanh trên CSDL test |
| **W3** | Mở phase code cho từng module theo ADR-0024 (`npx bizcity module new ban-hang`, `kho`, …) — mỗi module một phase / một dòng CLAIMS | ngoài phạm vi 030 |
| **W4** | Rà lại blueprint sau module đầu tiên: khuôn thiếu mục nào, golden test nào không viết được bằng bất biến sổ | 70-REFLECT |

## 6. Ai dùng gì

| Ai | Đọc | Làm |
|---|---|---|
| Dev / AI dựng module | [30](30-KHUON-BLUEPRINT.md) → blueprint nhóm mình (50–55) → [60](60-GOLDEN-TESTS.md) | `bizcity module new <key>`, viết workflow YAML đúng trạng thái blueprint, action đúng điều kiện, `ctx.ledger.submit` đúng `reasonCode`; chạy golden test trước khi mở PR |
| Kế toán trưởng | mục *Căn cứ* + *Hạch toán* của từng blueprint | duyệt công thức, ngưỡng, lý do định khoản; ký K2 cho lý do mới vào gói nền |
| Nhóm Lõi | [10 §4](10-DOI-CHIEU-ERP-VN.md) đề xuất năng lực | xếp vào phase Kernel; thêm `DOC_TYPES`, luật định khoản, chẩn đoán |
| Chủ dự án | mockup + [10 §2](10-DOI-CHIEU-ERP-VN.md) | duyệt ưu tiên, cách nói, tên màn |
