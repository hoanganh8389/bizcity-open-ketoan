# PHASE-030 · 40 — Checklist
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — việc con S030-*, ca T030-*, log -->

Ký hiệu: ☐ chưa · 🟡 đang · ✅ xong · ⛔ chờ người ngoài nhóm.

| ID | Việc | Đợt | Ưu tiên | Code? | Trạng thái |
|---|---|---|---|---|---|
| S030-1 | Ma trận đối chiếu 173 nghiệp vụ [10](10-DOI-CHIEU-ERP-VN.md): trạng thái, nguồn, đích, ưu tiên; tổng hợp; đề xuất K-030-1..6 | W0 | P0 | không | ✅ 2026-11-06 |
| S030-2 | Mockup [mockups/thu-vien-nghiep-vu.html](mockups/thu-vien-nghiep-vu.html) — trang Thư viện nghiệp vụ là màn đầu tiên (chủ dự án duyệt hướng 2026-11-06); bản 2: Tổng quan, bản đồ luồng Bán hàng / Kho / Lương / Kế toán, Chuẩn chứng từ, Thư viện tiền, Thông báo, Danh mục | W0–W1 | P0 | không | 🟡 bản 2; ⛔ chủ duyệt chi tiết từng luồng |
| S030-3 | Blueprint mua hàng [50](50-BP-MUA-HANG.md) | W0 | P1 | không | ✅ 2026-11-06 |
| S030-4 | Blueprint kho [51](51-BP-KHO.md) | W0 | P0 | không | ✅ 2026-11-06 |
| S030-5 | Blueprint bán hàng [52](52-BP-BAN-HANG.md) | W0 | P0 | không | ✅ 2026-11-06 |
| S030-6 | Blueprint tài sản [53](53-BP-TAI-SAN.md) | W0 | P1 | không | ✅ 2026-11-06 |
| S030-7 | Blueprint kế toán – ngân sách – thuế [54](54-BP-KE-TOAN-NGAN-SACH-THUE.md) | W0 | P1 | không | ✅ 2026-11-06 |
| S030-8 | Blueprint nhân sự – lương [55](55-BP-NHAN-SU-LUONG.md) | W0 | P2 | không | ✅ 2026-11-06 |
| S030-9 | Khuôn golden test [60](60-GOLDEN-TESTS.md) + danh sách 73 ca; nhóm Lõi duyệt khuôn | W0–W1 | P0 | không | 🟡 bản W0; ⛔ nhóm Lõi |
| S030-10 | Ca chạy được `apps/api/test/golden/T030-MH.test.ts` (mua hàng đã có mã) + `T030-CORE-1..6`; chứng minh khuôn; dòng CLAIMS riêng | W2 | P0 | có | ☐ |
| S030-11 | Chuyển blueprint P0 về `docs/nghiep-vu/ban-hang/`, `docs/nghiep-vu/kho/`; cập nhật `docs/nghiep-vu/08-mua-hang.md` trỏ 50 | W2 | P0 | không | ☐ |
| S030-12 | Kế toán trưởng trả Q030-3 (ngân sách), xác nhận công thức TS03 theo ngày, lương – BH – TNCN và giá trị tham số K-030-6 | W1 | P0 | không | ⛔ kế toán trưởng |
| S030-13 | Nhóm Lõi trả Q030-2 (lô ở Kernel), xếp K-030-1..6 vào phase Kernel; `golden` vào `bizcity_module@1` (PR chốt thiết kế) | W1 | P0 | không | ⛔ nhóm Lõi |
| S030-14 | Chủ dự án trả Q030-1 (nhân sự một hay ba module), Q030-4 (giao hàng tách) | W1 | P1 | không | ⛔ chủ dự án |
| S030-15 | Seed khoá tham số pháp lý VN vào `vn-rulepacks` (danh sách khoá + `legalRef` từ Erp-vn `data/legal_params.xml`, giá trị do kế toán trưởng xác nhận) — K-030-6 | W2 | P1 | có | ☐ sau S030-12, E2 merge |
| S030-16 | Mở phase code từng module theo ADR-0024: `modules/ban-hang`, `modules/kho` (P0); `modules/tam-ung`, `modules/ngan-hang`, `modules/ke-toan-ky` (P1); `modules/nhan-su` (P2) — mỗi module một phase / dòng CLAIMS | W3 | — | có | ☐ ngoài phạm vi 030 |
| S030-17 | 70-REFLECT sau module đầu tiên: khuôn thiếu mục nào; ca nào không viết được bằng bất biến sổ | W4 | P2 | không | ☐ |
| S030-18 | Kinh nghiệm cốt lõi [15](15-KINH-NGHIEM-COT-LOI.md): phân tầng 20 cơ chế, STD-030-1..12, K-030-7..12, P-030-1..8, phản mẫu A1–A12; nhóm Lõi duyệt STD thành kiểm `SC-*` | W0–W1 | P0 | không | 🟡 bản W0; ⛔ nhóm Lõi |
| S030-19 | Thư viện tiền [18](18-THU-VIEN-TIEN.md): `roundMoney`, `allocate`, `schedule` vào `packages/contracts`, xuất ở `module-sdk`; chuyển `allocate` mua hàng và `splitByDays` / `splitByPercent` tài sản; golden T030-CORE-6; SC-STD-5 | W1 | P0 | có | ☐ giữ chỗ ở CLAIMS (PR này) |
| S030-20 | Chuẩn chứng từ [16](16-CHUAN-CHUNG-TU-DUNG-CHUNG.md): nhóm Lõi duyệt `bizcity_document@1` 1.4.0-draft (`defineDocument`, hai con trỏ, `policy`, `locks`, `revision`) + R-WF-10..12 | W1 | P0 | không | ⛔ nhóm Lõi |
| S030-21 | Bộ chuẩn [17](17-BO-CHUAN-STD-030.md): luật R-MSTD-1..12 vào `docs/rules/` + CANON §3; họ finding `DOC-*`, `PARAM-*`, `<MODULE>-*` vào `bizcity_findings@1`; SC-STD-1, -2, -12 (kiểm tĩnh) | W2 | P0 | có | ☐ sau khi nhóm Lõi duyệt S030-18 |
| N030-1 | Nợ: kiểm `apps/api/src/modules/assets/depreciation*.ts` làm tròn tháng hay ngày; nếu tháng → sửa tại chỗ theo `tai_san.khau_hao.theo_ngay` | W2 | P1 | có | ☐ |
| N030-2 | Nợ: `modules/mua-hang/domain/src/engine.ts` có `ACC` số tài khoản (:867), `TAX_RATE` (:295), `allocate` riêng (:514), `Check` riêng (:673) — chuyển sang `reasonCode`, thuế suất từ `tax_codes`, `allocate` dùng chung (K-030-10), `findings` (STD-030-8); `phan-he/mua-hang` đóng băng, sửa khi chuyển | W2 | P1 | có | ☐ sau K-030-10 |

## Ca bằng chứng

Danh sách 73 ca `T030-*` ở [60 §5](60-GOLDEN-TESTS.md). W0: tất cả `it.todo`. Khi có ca chạy, ghi `evidence/W<n>-<ngày>.md`.

## Log

- 2026-11-06 — W0: mở phase; clone + dựng Erp-vn chạy local (Docker, 46 addon cài không lỗi); kiểm kê hai bên; viết 10 / 20 / 30 / 50–55 / 60; mockup; PR tài liệu. Tài liệu thuần, không giữ chỗ (R-FLOW).
- 2026-11-06 — W0 đợt 2: đọc lại cơ chế xuyên suốt (Erp-vn 46 addon × open-ketoan Kernel / Platform / SDK) → [15](15-KINH-NGHIEM-COT-LOI.md); đính chính: `setting_values` E2 chưa có mã, authz PHASE-028 chưa nối; sửa [20 M2](20-MAU-THIET-KE.md); thêm S030-18, N030-2.
- 2026-11-06 — W0 đợt 3 (chủ dự án duyệt hướng mockup, hỏi chuẩn hoá): [16](16-CHUAN-CHUNG-TU-DUNG-CHUNG.md) chuẩn chứng từ dùng chung (nối `bizcity_document@1`); [17](17-BO-CHUAN-STD-030.md) đóng gói 12 chuẩn thành luật / thư viện / thông báo / phép kiểm / bản mẫu; [18](18-THU-VIEN-TIEN.md) chốt thiết kế thư viện tiền (mã tham chiếu chạy thử 20.000 ca; phát hiện `splitByPercent` có ca ra phần âm); mockup bản 2 (chụp kiểm Chrome headless 1440 px và 360 px, sáng / tối); dòng CLAIMS S030-19; thêm S030-19..21. Nhánh rebase lên `main` 682c03c.
