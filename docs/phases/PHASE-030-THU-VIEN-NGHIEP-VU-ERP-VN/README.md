# PHASE-030 — Thư viện nghiệp vụ: học thiết kế từ ERP LiFeOOD (Erp-vn) để bổ sung blueprint, mockup, golden test cho các phân hệ
<!-- [2026-11-06 12:45 AM Johnny Chu - Chu Hoàng Anh] PHASE-030 — mở phase: coi repo Erp-vn (Odoo 19, 46 addon, 173 nghiệp vụ) là nguồn học thiết kế nghiệp vụ; open-ketoan là chuẩn; tài liệu thuần, không code -->

> **Trạng thái:** 🟡 W0 tài liệu 2026-11-06 · **Code:** chưa (phase này chỉ sinh tài liệu, bản mẫu và ca kiểm; code đi ở phase của từng module)
> **Mức Kernel:** K0 (không đụng Kernel); những năng lực Kernel còn thiếu được ghi thành **đề xuất** theo [VERSIONING §5](../../standard/VERSIONING.md), không vá
> **Mục tiêu:** Lấy 173 nghiệp vụ đã mã hoá trong ERP LiFeOOD làm **thư viện tham khảo** (quy trình, trạng thái, điều kiện duyệt, công thức, ngoại lệ) để (1) đối chiếu open-ketoan còn thiếu gì ở từng phân hệ, (2) viết **blueprint nghiệp vụ** theo một khuôn chung cho anh em dev / AI dựng module ở `modules/<key>/`, (3) vẽ **mockup luồng** trước khi code, (4) biến luật nghiệp vụ thành **golden test** độc lập mà mọi module (người hay AI viết) phải qua. Mọi phát sinh kế toán vẫn đi `accounting_events` → luật định khoản → Kernel (bốn câu không thương lượng).
> **Việc lộ trình:** —
> **Checklist công bố:** —
> **Quyết định (ADR):** chưa cần ADR; quyết định D030-* ở [00-MASTER-PLAN](00-MASTER-PLAN.md)
> **Phụ thuộc:** PHASE-011 (Module SDK), PHASE-014 (CLI, template), PHASE-024 (Item Master), PHASE-029 (ECP, cấu hình có phiên bản)
> **Nguồn yêu cầu:** chủ dự án 2026-11-06: *"coi repo erp-vn này là nguồn học tập các thiết kế nghiệp vụ … vẽ mockup và init các flow nghiệp vụ đó vào các module builtin đã có; bổ sung tài liệu nghiệp vụ tương ứng từng modules, chức năng để anh em dev dựa vào phát triển"*; ba hướng: Business Blueprints · Golden Tests · khung Module SDK cho HRM, tài sản, lương, ecom
> **Luật đi kèm:** [R-FLOW](../../rules/RULE-FLOW.md) (tài liệu thuần, không cần giữ chỗ; code của từng module phải giữ chỗ riêng), [ADR-0024](../../adr/ADR-0024-phan-he-nam-o-modules-phan-he-dong-bang.md) (module mới ở `modules/<key>/`), [R-ITEM](../../rules/RULE-ITEM.md), [R-ECP](../../rules/RULE-ENTERPRISE-CONTINUITY.md)

## Nguồn học: ERP LiFeOOD

Repo `https://github.com/ConBoCuoiHaha/Erp-vn` (LGPL-3), clone tại `d:\projects\Erp-vn`, đã dựng chạy local bằng Docker (`http://localhost:8069`) để đọc màn hình thật. Đặc điểm đáng học:

- 46 addon `lfood_*`, 173 nghiệp vụ có mã (HT, CH, DM, MH, BH, KHO, RD, CL, TS, KT, NS, THUE, NSU, LUONG, BC); mỗi tệp Python ghi mã nghiệp vụ ở docstring dòng 1 — dễ truy từ mã nghiệp vụ tới mã nguồn.
- **Tham số pháp lý có ngày hiệu lực** (`lfood.legal.param`, 200+ tham số: thuế suất, trần BHXH, lương tối thiểu vùng, ngưỡng TSCĐ) — luật đổi thì sửa tham số, không sửa mã. Cùng tinh thần với `setting_values` của PHASE-029 E2.
- **Mọi phát sinh về một sổ** (`lfood.move`), bút toán đã ghi chỉ đảo không sửa — trùng AP-4 của open-ketoan.
- **Chứng từ có phiên bản** (`service.voucher` ↔ `voucher.version`): hai con trỏ *bản đang sửa* và *bản lên báo cáo*; sửa phải có lý do; diff lưu lại — trùng ADR-0028 ECP-13.
- Mỏng ở chỗ open-ketoan đã mạnh: không có engine duyệt nhiều cấp (chỉ một ngưỡng), ngân sách chỉ cảnh báo, không mẫu in 01-VT / 02-TT, không RLS, không outbox. Vì vậy **open-ketoan là chuẩn**; Erp-vn chỉ là thư viện tình huống.

Chi tiết kiểm kê hai bên: [10-DOI-CHIEU-ERP-VN](10-DOI-CHIEU-ERP-VN.md).

## Tài liệu của phase

| Tài liệu | Một câu |
|---|---|
| [00-MASTER-PLAN](00-MASTER-PLAN.md) | vì sao, quyết định D030-*, câu hỏi Q030-*, đợt W0–W4, "ai dùng gì" |
| [10-DOI-CHIEU-ERP-VN](10-DOI-CHIEU-ERP-VN.md) | ma trận 173 nghiệp vụ × open-ketoan (có / một phần / chưa) × nguồn Erp-vn × module đích × ưu tiên |
| [15-KINH-NGHIEM-COT-LOI](15-KINH-NGHIEM-COT-LOI.md) | kinh nghiệm cốt lõi rút từ cơ chế xuyên suốt hai bên: phân tầng Kernel / Platform / SDK / gói dữ liệu / module, 12 chuẩn STD-030-*, Kernel học gì (K-030-7..12), nền tảng học gì (P-030-1..8), sợi truy vết, phản mẫu khi duyệt PR, thứ tự làm |
| [16-CHUAN-CHUNG-TU-DUNG-CHUNG](16-CHUAN-CHUNG-TU-DUNG-CHUNG.md) | chuẩn chứng từ cho mọi module: `defineDocument`, workflow YAML bắt buộc, hai con trỏ (bản đang sửa / bản trên sổ), chính sách duyệt dùng chung, ranh giới bút toán tay — đề xuất `bizcity_document@1` 1.4.0 |
| [17-BO-CHUAN-STD-030](17-BO-CHUAN-STD-030.md) | 12 chuẩn STD-030 đóng gói thành luật R-MSTD, hợp đồng, thư viện, thông báo (`bizcity_findings@1`), phép kiểm SC-STD-*, bản mẫu; tiết kiệm ở đâu; 6 cơ chế đã vào tài liệu chưa |
| [18-THU-VIEN-TIEN](18-THU-VIEN-TIEN.md) | chốt thiết kế `roundMoney` / `allocate` / `schedule`: luật R-MONEY, mã tham chiếu đã chạy, bảng số golden, cách chuyển các bản đang có, hướng dẫn dev |
| [19-RA-SOAT-DUYET-VA-GHI-SO](19-RA-SOAT-DUYET-VA-GHI-SO.md) | rà mã theo ADR-0029: luồng duyệt → ghi sổ, đảo thừa đang có, cổng Kernel, chứng từ ↔ PHASE-028 chưa nối; kế hoạch P0 / P1, golden T030-DOC / T030-AUTH, chẩn đoán tuyến nguồn → sổ |
| [21-SO-CONG-VA-BANG-DIEU-HANH](21-SO-CONG-VA-BANG-DIEU-HANH.md) | cổng = các bước `bizcity_action@1` §4 trả `GateResult`; bằng chứng mở rộng là sổ cổng (trục nhật ký hành vi: ai / khi nào / từ đâu / làm gì / chống sửa / căn cứ); luật nhập chứng từ; nhập 120 tham số pháp lý, bàn điều hành HT11: hàng việc, cổng, sai luật, sai vai trò, luồng chuyển, nhật ký; câu hỏi Q030-5 về tệp lưu trữ |
| [20-MAU-THIET-KE](20-MAU-THIET-KE.md) | 12 mẫu thiết kế xuyên suốt rút từ mã Erp-vn (duyệt theo ngưỡng, tham số hiệu lực, chứng từ phiên bản, tự tính lại, FEFO, bình quân di động, khấu hao theo ngày, lương–bảo hiểm–TNCN, ngân sách…) và chỗ đặt trong open-ketoan |
| [22-DANH-GIA-GON-PHAN-QUYEN](22-DANH-GIA-GON-PHAN-QUYEN.md) | đánh giá `bizcity_authorization@1` so với ma trận "Ai được làm gì" của Erp-vn: đã gọn ở đâu, gọn thêm ở đâu (bỏ Nới, điều kiện về đúng chủ, SoD ở cổng chuyển trạng thái), không nên bớt gì |
| [30-KHUON-BLUEPRINT](30-KHUON-BLUEPRINT.md) | khuôn một blueprint nghiệp vụ (9 mục) + cách dev / AI dùng blueprint để sinh module theo `bizcity_module@1` |
| [50-BP-MUA-HANG](50-BP-MUA-HANG.md) | MH01–MH13: yêu cầu mua, báo giá, đơn mua, hợp đồng khung, đối chiếu 3 bên, hoá đơn vào, phân bổ chi phí, nông sản không hoá đơn, nhập khẩu, đánh giá NCC |
| [51-BP-KHO](51-BP-KHO.md) | KHO01–KHO12: lô / hạn dùng, FEFO, chuyển kho, liên pháp nhân, kiểm kê, cận hạn / tiêu huỷ, cách ly, tồn tối thiểu, mã vạch, giá xuất |
| [52-BP-BAN-HANG](52-BP-BAN-HANG.md) | BH01–BH14: cơ hội, báo giá, đơn bán, bảng giá theo kênh, khuyến mãi, hạn mức công nợ, nhà phân phối, hoá đơn điện tử / điều chỉnh / thay thế, trả lại, biếu tặng, trade marketing, sàn TMĐT, xuất khẩu |
| [53-BP-TAI-SAN](53-BP-TAI-SAN.md) | TS01–TS13: ghi tăng, tách, khấu hao theo ngày, điều chỉnh, điều chuyển, thanh lý, kiểm kê, thẻ / sổ, CCDC, XDCB, bảo trì, đội xe, thuê |
| [54-BP-KE-TOAN-NGAN-SACH-THUE](54-BP-KE-TOAN-NGAN-SACH-THUE.md) | KT01–KT18, NS01–NS05, THUE01–THUE13: phần open-ketoan còn thiếu (đối soát ngân hàng, tạm ứng, trả trước / trích trước, tỷ giá, dự phòng, vay, hợp nhất, ngân sách, nghĩa vụ thuế, nhà thầu nước ngoài) |
| [55-BP-NHAN-SU-LUONG](55-BP-NHAN-SU-LUONG.md) | NSU01–NSU17, LUONG01–LUONG13: hồ sơ, hợp đồng, chấm công, nghỉ phép, lương – bảo hiểm – TNCN, tạm ứng lương, thưởng, chi lương, hạch toán lương |
| [60-GOLDEN-TESTS](60-GOLDEN-TESTS.md) | khuôn ca kiểm chuẩn `T030-<nhóm>-<n>` độc lập module; cách gắn với `bizcity_compliance@1` và bộ kiểm cài module |
| [40-MASTER-CHECKLIST](40-MASTER-CHECKLIST.md) | việc con `S030-*`, log |
| [mockups/thu-vien-nghiep-vu.html](mockups/thu-vien-nghiep-vu.html) | bản mẫu tĩnh: sơ đồ luồng từng phân hệ theo kiểu màn "Quy trình" (bước → trạng thái → chứng từ → sổ), tô màu theo mức có / một phần / chưa của open-ketoan |

## Trả lời ngắn

- **Có chép mã Odoo sang không?** Không. Chép **thiết kế** (trạng thái, điều kiện, công thức, ngoại lệ), viết lại theo SDK: `defineAction`, workflow YAML, `ctx.ledger.submit` + `reasonCode`, `setting_values` cho tham số. Không import mã LGPL.
- **Blueprint đặt ở đâu khi module được code?** Blueprint sống ở `docs/nghiep-vu/<key>/` (tài liệu sở hữu trên `main`); thư mục phase chỉ giữ bản khởi tạo và lịch sử. Khi module `modules/<key>/` ra đời, `README.md` của module trỏ về blueprint; golden test của module trỏ về mã `T030-*`.
- **Phân hệ cũ (`phan-he/`) thì sao?** Đóng băng theo ADR-0024. Blueprint ghi rõ phần nào đã có trong `phan-he/` (giữ), phần nào mới (→ `modules/<key>/`). Không chuyển hàng loạt.
- **Mockup có phải giao diện cuối?** Không. Mockup là **sơ đồ luồng để duyệt nghiệp vụ** trước khi code; giao diện thật dùng `@bizcity/ui-kit`.

## Xong khi

- [ ] 10: mọi mã nghiệp vụ của Erp-vn có một dòng: trạng thái open-ketoan, nguồn, module đích, ưu tiên (S030-1).
- [ ] 50–55: mỗi nhóm có blueprint theo khuôn 30, có mã golden test (S030-3…S030-8).
- [ ] 60: khuôn golden test được nhóm Lõi duyệt; ít nhất một nhóm (mua hàng) có ca chạy được trên CSDL test (S030-9, S030-10).
- [ ] Mockup luồng được chủ dự án duyệt bố cục và cách nói (S030-2).
- [ ] Blueprint chuyển về `docs/nghiep-vu/<key>/` bằng PR tài liệu (S030-11).
