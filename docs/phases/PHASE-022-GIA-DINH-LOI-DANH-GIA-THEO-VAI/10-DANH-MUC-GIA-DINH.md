# PHASE-022 · 10 — Danh mục giả định lỗi (mỗi ca kèm phương án khắc phục)
<!-- [2026-11-02 07:00 PM Johnny Chu - Chu Hoàng Anh] PHASE-022 — danh mục 92 giả định lỗi trong 10 nhóm: môi trường, chứng từ, thuế / hoá đơn, kho / giá vốn, cuối kỳ, sổ / lệch sổ, công nợ, tiền, tài sản, phân quyền / bằng chứng; mỗi ca có phát hiện, mức, vai, hậu quả, phương án khắc phục từng bước, kiểm lại, trạng thái. -->

> © 2026 Johnny Chu (Chu Hoàng Anh) / BizCity — kiến trúc Bizcity Core Framework.
> Nguồn mã: [DIAGNOSTICS §2](../../ops/DIAGNOSTICS.md) (mã tự chẩn đoán), [PHASE-021 20-KIEN-TRUC](../PHASE-021-TRAM-TIEN-KIEM-DAU-VAO/20-KIEN-TRUC.md) (mã tiền kiểm `IN-*`), `packages/platform/src/core/errors.ts` (mã lỗi API), `GET /api/v1/periods/check` (bảng kiểm trước khoá kỳ).

## 0. Cách đọc

| Cột | Ý nghĩa |
|---|---|
| **Mã ca** | `F22-<NHÓM>-NN` (D022-1). Một ca là một **tình huống sai**; công thức gây lỗi để bộ chạy W3 tái hiện ở [20-KIEN-TRUC §3](20-KIEN-TRUC.md) |
| **Phát hiện** | mã kiểm / mã lỗi bắt được ca này. Chữ nghiêng = **chưa có**, làm ở W2 |
| **Mức** | ⛔ chặn (Kernel từ chối, không ai vượt) · ✘ lỗi (sổ sai, dừng) · ⚠ cảnh báo (người dùng quyết định, ghi bằng chứng khi tiếp tục) · ℹ gợi ý |
| **Vai** | KTT kế toán trưởng · KS kiểm soát / ban kiểm soát · TT thanh tra thuế (tự rà trước). Chữ đậm = vai thấy ca này đầu tiên |
| **Phương án khắc phục** | các bước ①②③, màn (mã + đường dẫn), ai làm. Không bao giờ là sửa thẳng sổ / tắt kiểm (R-FIX-2) |
| **Kiểm lại** | chạy lại đúng mã đó (nút "Kiểm lại" ở HT08) hoặc màn có số liệu đã đổi (R-FIX-4) |
| **TT** | ✔ có kiểm + có test · 🛡 Kernel chặn sẵn (bộ chạy chứng minh bị chặn) · 📋 thiết kế ở PHASE-021 (mã `IN-*`) · ☐ chưa có, làm ở W2 · ○ hoãn, ghi lý do |

Ngưỡng ngày (3, 30) là **quy chế nội bộ** (miền `internal`), đơn vị đổi được qua tham số ca + duyệt tại đơn vị (ADR-0015). Ngưỡng luật (thời gian giảm thuế, 5 triệu…) lấy từ rulepack, căn cứ còn chờ rà.

## 1. Tổng hợp

| Nhóm | Số ca | ✔ | 🛡 | 📋 | ☐ | ○ |
|---|---|---|---|---|---|---|
| [ENV · Môi trường, bản cài](#2-env--môi-trường-bản-cài) | 12 | 11 | 0 | 0 | 1 | 0 |
| [DOC · Chứng từ, cửa nạp](#3-doc--chứng-từ-cửa-nạp) | 16 | 6 | 4 | 6 | 0 | 0 |
| [TAX · Thuế, hoá đơn](#4-tax--thuế-hoá-đơn) | 12 | 5 | 1 | 2 | 4 | 0 |
| [STK · Kho, giá vốn](#5-stk--kho-giá-vốn) | 10 | 5 | 0 | 1 | 4 | 0 |
| [CLOSE · Cuối kỳ, kết chuyển, khoá kỳ](#6-close--cuối-kỳ-kết-chuyển-khoá-kỳ) | 10 | 6 | 2 | 0 | 2 | 0 |
| [LEDGER · Sổ, lệch sổ](#7-ledger--sổ-lệch-sổ) | 10 | 6 | 2 | 0 | 2 | 0 |
| [DEBT · Công nợ](#8-debt--công-nợ) | 6 | 0 | 0 | 0 | 6 | 0 |
| [CASH · Tiền](#9-cash--tiền) | 6 | 0 | 0 | 0 | 5 | 1 |
| [FA · Tài sản, chi phí trả trước](#10-fa--tài-sản-chi-phí-trả-trước) | 4 | 0 | 0 | 0 | 4 | 0 |
| [SEC · Phân quyền, bằng chứng](#11-sec--phân-quyền-bằng-chứng) | 6 | 0 | 6 | 0 | 0 | 0 |
| **Cộng** | **92** | **39** | **15** | **9** | **28** | **1** |

## 2. ENV · Môi trường, bản cài

| Mã ca | Giả định lỗi | Phát hiện | Mức | Vai | Hậu quả | Phương án khắc phục | Kiểm lại | TT |
|---|---|---|---|---|---|---|---|---|
| F22-ENV-01 | Cập nhật mã mới nhưng chưa áp migration | `MIGRATIONS_PENDING` (DG-DB-1); API trả `NOT_READY` | ✘ | **KS**, KTT | màn hình lỗi, chức năng mới không lưu được | ① Vận hành chạy `docker compose up db-migrate` (hoặc `npm run db:migrate`). ② Khởi động lại API. ③ Không nhập chứng từ tới khi xong | `MIGRATIONS_PENDING` | ✔ |
| F22-ENV-02 | Trigger bảo vệ sổ (chỉ thêm, cân Nợ = Có, chặn TRUNCATE) bị tắt hoặc thiếu | `LEDGER_TRIGGERS` (DG-DB-2) | ✘ | **KS** | sổ có thể bị sửa / xoá ngoài luồng | ① Dừng ghi sổ toàn đơn vị. ② Vận hành chạy lại migration để dựng lại trigger. ③ Tra nhật ký CSDL xem ai / lúc nào tắt (R-KER-3), lập biên bản. ④ Báo nhóm Lõi kèm mã tra cứu; chạy lại toàn bộ L3 | `LEDGER_TRIGGERS` rồi cả L3 | ✔ |
| F22-ENV-03 | API trỏ vào CSDL chỉ đọc (bản sao, sau khôi phục) | `DB_WRITABLE` (DG-DB-4) | ✘ | **KS** | mọi lần ghi lỗi | ① Vận hành trỏ `DATABASE_URL` về bản chính. ② Khởi động lại API | `DB_WRITABLE` | ✔ |
| F22-ENV-04 | API kết nối bằng vai trò CSDL quá quyền (superuser, chủ bảng) | `DB_APP_ROLE` (DG-SEC-1, -2) | ✘ | **KS** | RLS có thể bị vượt, đơn vị đọc chéo | ① Vận hành đặt `DB_APP_PASSWORD`, dùng vai trò `ketoan_app` (scripts/cap-nhat.sh tự làm). ② Khởi động lại | `DB_APP_ROLE` | ✔ |
| F22-ENV-05 | Bảng mới có `tenant_id` mà chưa bật RLS + FORCE + chính sách | `TENANT_ISOLATION` (DG-PLAN-5) | ✘ | **KS** | dữ liệu đơn vị này lộ sang đơn vị khác | ① Nhóm phát triển thêm migration bật RLS cho bảng đó (mẫu ở 0041). ② Phát hành bản vá | `TENANT_ISOLATION` | ✔ |
| F22-ENV-06 | Chuỗi băm bằng chứng (`audit_logs`) đứt / bị sửa | `EVIDENCE_CHAIN` (DG-EVD-1) | ✘ | **KS** | mất khả năng chứng minh ai làm gì | ① Không xoá / sửa thêm. ② Xuất đoạn chuỗi đứt (số thứ tự, băm). ③ Báo nhóm Lõi + ban kiểm soát, lập biên bản sự cố | `EVIDENCE_CHAIN` | ✔ |
| F22-ENV-07 | Sự kiện gửi hệ thống ngoài hết lượt thử (dead) | `EVENT_DEAD` (DG-EVT-1) | ⚠ | **KTT** | hệ thống bán hàng / webhook không nhận cập nhật | ① Xem lỗi ở Hệ thống → sự kiện (`GET /api/v1/system/events`). ② Sửa nguyên nhân (địa chỉ nhận, khoá). ③ Phát lại (`core.events.replay`) | `EVENT_DEAD` | ✔ |
| F22-ENV-08 | Khoá lạ trong cấu hình đơn vị (`tenants.settings`) | `SETTINGS_UNKNOWN` (DG-SET-1) | ⚠ | KS | cấu hình không có tác dụng, dễ hiểu nhầm | ① Đối chiếu với registry cấu hình. ② Xoá khoá lạ qua màn cấu hình hoặc đăng ký khoá mới (nhóm phát triển) | `SETTINGS_UNKNOWN` | ✔ |
| F22-ENV-09 | Đơn vị chưa khai hồ sơ kế toán cho ngày đang xét | `PROFILE_DECLARED` (DG-PROFILE-1) | ⚠ | **KTT**, KS | Kiểm chuẩn không chọn được bộ quy định, ca "Chờ duyệt" | ① Kế toán trưởng / chủ mở Hệ thống → Hồ sơ kế toán (HT07, `/he-thong/ho-so-ke-toan`). ② Chọn năm tài chính, chế độ, loại pháp nhân, ghi căn cứ. ③ Phát hành | `PROFILE_DECLARED` | ✔ |
| F22-ENV-10 | Gói định khoản đang cài khác chế độ của hồ sơ | `PROFILE_PACK_REGIME` (DG-PROFILE-2) | ⚠ | **KTT** | hệ thống tài khoản / luật định khoản không đúng chế độ | ① Kiểm lại hồ sơ ở HT07 (chế độ có đúng không). ② Nếu đúng: cài gói định khoản của chế độ đó cho năm tài chính kế tiếp (không đổi giữa năm). ③ Nếu hồ sơ sai: phát hành hồ sơ mới | `PROFILE_PACK_REGIME` | ✔ |
| F22-ENV-11 | Rulepack đã duyệt tại đơn vị, sau đó cập nhật gói rulepack (lệch nội dung) | `core.conformance.rulepacks` (`local.stale`) | ⚠ | **KTT**, KS | ca của rulepack quay về "Chờ duyệt" | ① Mở Hệ thống → Kiểm chuẩn (HT06), khối "Rulepack và duyệt tại đơn vị". ② Đọc nhật ký thay đổi rulepack. ③ Người duyệt kế toán (+ thuế) duyệt lại | trạng thái rulepack ở HT06 | ✔ |
| F22-ENV-12 | Lịch đêm không chạy (lượt kiểm chuẩn gần nhất quá 2 ngày) | *`CONFORMANCE_STALE`* | ⚠ | KS | bảng điểm cũ, lỗi theo thời gian không được bắt | ① Vận hành kiểm tiến trình API (đồng hồ sự kiện chạy trong API). ② Xem `EVENT_DEAD` của `core.conformance-nightly`. ③ Bấm "Chạy kiểm chuẩn" ở HT06 | `CONFORMANCE_STALE` | ☐ |

## 3. DOC · Chứng từ, cửa nạp

| Mã ca | Giả định lỗi | Phát hiện | Mức | Vai | Hậu quả | Phương án khắc phục | Kiểm lại | TT |
|---|---|---|---|---|---|---|---|---|
| F22-DOC-01 | Chứng từ thiếu trường bắt buộc / sai kiểu / ngày sai dạng | `IN-SHAPE-001..006`; hôm nay `VALIDATION_ERROR` | ⛔ | **KTT** | chứng từ không vào hệ thống | ① Mở chứng từ ở Trạm kiểm tra (PHASE-021). ② Sửa đúng trường được chỉ (đường dẫn `lines[2].qty`…) ở nguồn hoặc tại bể. ③ Bấm Kiểm thử rồi Nộp lại | Kiểm thử ở Trạm | 📋 |
| F22-DOC-02 | Tổng các dòng ≠ tổng chứng từ (tới xu) | `IN-SUM-001`; `assertTotals` | ⛔ | **KTT** | sổ sai tổng | ① Sửa dòng hoặc tổng ở nguồn cho khớp. ② Nếu nguồn làm tròn theo dòng: bật làm tròn tổng ở nguồn | Kiểm thử ở Trạm | 🛡 |
| F22-DOC-03 | Tiền thuế ≠ cơ sở × thuế suất ngoài sai số làm tròn | `IN-SUM-003` | ⚠ | KTT, **TT** | thuế kê khai lệch hoá đơn | ① So với hoá đơn gốc. ② Sửa tiền thuế hoặc loại thuế của dòng. ③ Hoá đơn sai thì lập hoá đơn điều chỉnh | Kiểm thử ở Trạm | 📋 |
| F22-DOC-04 | Mã hàng sai quy tắc / chưa có trong danh mục | `IN-MD-002`, `IN-MD-004` | ⚠ | **KTT** | tồn kho, giá vốn tách sai mã | ① Thêm mã ở Danh mục mặt hàng, hoặc ② sửa mã ở nguồn cho đúng quy tắc mã hàng | Kiểm thử ở Trạm | 📋 |
| F22-DOC-05 | Đơn vị tính không khai cho mặt hàng | `IN-MD-003` | ⛔ | **KTT** | không quy đổi số lượng, tồn kho / giá vốn sai | ① Khai ĐVT và tỉ lệ quy đổi ở mặt hàng. ② Hoặc sửa ĐVT ở nguồn | Kiểm thử ở Trạm | 📋 |
| F22-DOC-06 | Bán / mua nợ mà không có đối tượng | `IN-MD-007` | ⛔ | KTT, **KS** | công nợ không theo dõi được | ① Gắn khách hàng / nhà cung cấp ở nguồn. ② Bán lẻ thu tiền ngay thì ghi đủ dòng thanh toán | Kiểm thử ở Trạm | 📋 |
| F22-DOC-07 | `docKey` không mang tiền tố của module / app gửi | `IN-BIZ-003`; `ownDocument` | ⛔ | **KS** | một nguồn ghi đè chứng từ của nguồn khác | ① Sửa cấu hình nguồn dùng đúng tiền tố được cấp. ② Không đổi tiền tố của chứng từ đã gửi | — (bị chặn) | 🛡 |
| F22-DOC-08 | Gửi phiên bản nhỏ hơn bản đã nhận | `IN-BIZ-004`; `CONFLICT` | ⛔ | KS | ghi đè bản mới bằng bản cũ | ① Nguồn gửi lại với `version` lớn hơn bản đang có. ② Kiểm đồng hồ / hàng đợi của nguồn | — (bị chặn) | 🛡 |
| F22-DOC-09 | Cùng `docKey` + phiên bản nhưng nội dung khác | `IN-BIZ-005` | ⚠ | **KS** | bản sửa bị bỏ qua như "không đổi" | ① Nguồn tăng `version` khi sửa. ② Gửi lại | Kiểm thử ở Trạm | 📋 |
| F22-DOC-10 | Chứng từ có ngày thuộc kỳ đã khoá | `PERIOD_LOCKED`; `IN-BIZ-001` | ⛔ | **KTT** | không ghi được | ① Ghi vào kỳ đang mở (điều chỉnh kỳ sau), hoặc ② kế toán trưởng mở khoá kỳ có lý do (ACC2, `/cau-hinh/ky-ke-toan`), ghi xong khoá lại | — | 🛡 |
| F22-DOC-11 | Chứng từ chờ định khoản / lỗi quá 3 ngày | `EVENT_PENDING_AGE` (DG-EVENT-3) | ⚠ | **KTT** | báo cáo thiếu số | ① Mở Định khoản tự động (ACC14, `/chung-tu`), thẻ Chờ / Lỗi. ② Xem trước bút toán; thiếu cấu hình thì bổ sung (F22-DOC-12). ③ Định khoản, hoặc huỷ có lý do | `EVENT_PENDING_AGE` | ✔ |
| F22-DOC-12 | Định khoản lỗi vì thiếu cấu hình (lý do, tài khoản, nhóm hạch toán) | `POSTING_FAILED`; `IN-POST-001..003`; bảng kiểm khoá kỳ `errors` | ⚠ | **KTT** | chứng từ nằm ở thẻ Lỗi | ① Đọc lỗi ở ACC14. ② Bổ sung: Lý do – Tài khoản (ACC18, `/cau-hinh/ly-do`), Mặt hàng – Tài khoản (ACC17, `/cau-hinh/nhom-hach-toan`), Tài khoản ngầm định (ACC41). ③ Định khoản lại ở ACC14 (nguồn không cần gửi lại) | ACC14 thẻ Lỗi | ✔ |
| F22-DOC-13 | Chứng từ "đã ghi sổ" mà không còn bút toán hiệu lực | `EVENT_HAS_ENTRY` (DG-EVENT-2); bảng kiểm `entryMismatch` | ⚠ | KTT, **KS** | chứng từ có mà sổ không có | ① Mở chứng từ ở ACC14, xem nhật ký định khoản. ② Định khoản lại. ③ Lặp lại thì báo nhóm Lõi kèm mã tra cứu | `EVENT_HAS_ENTRY` | ✔ |
| F22-DOC-14 | `posted_version` ≠ `version` (sổ theo phiên bản cũ) | `EVENT_POSTED_VERSION` (DG-EVENT-1) | ✘ | **KS** | sổ không khớp chứng từ mới nhất | ① Định khoản lại chứng từ ở ACC14 (đảo bút toán cũ, ghi mới). ② Còn lỗi: báo nhóm Lõi — không sửa trực tiếp | `EVENT_POSTED_VERSION` | ✔ |
| F22-DOC-15 | Phiếu trả lại không nối được phiếu gốc | bảng kiểm khoá kỳ `orphanReturns` | ⚠ | KTT, **TT** | giảm doanh thu / giá vốn không có cơ sở | ① Mở BC kiểm tra chứng từ (ACC93, `/bao-cao/kiem-tra-chung-tu`). ② Gắn phiếu gốc ở nguồn (số phiếu bán gốc). ③ Gửi lại | `GET /periods/check` | ✔ |
| F22-DOC-16 | Nguồn báo xoá chứng từ, chưa ai huỷ | `EVENT_PENDING_AGE` (sự việc chờ có `cancelRequestedAt`) | ⚠ | **KTT** | chứng từ đã xoá ở nguồn vẫn nằm trong sổ | ① ACC14, dòng ghi "Nguồn báo xoá (chờ huỷ)". ② Xem lý do; đúng thì Huỷ (bút toán ghi số âm), sai thì liên hệ nguồn | `EVENT_PENDING_AGE` | ✔ |

## 4. TAX · Thuế, hoá đơn

| Mã ca | Giả định lỗi | Phát hiện | Mức | Vai | Hậu quả | Phương án khắc phục | Kiểm lại | TT |
|---|---|---|---|---|---|---|---|---|
| F22-TAX-01 | Thuế GTGT đầu vào đã ghi sổ mà chưa có hoá đơn quá 30 ngày | `TAX_INPUT_NO_INVOICE` (DG-TAX-1) | ⚠ | KTT, **TT** | bảng kê mua vào thiếu so với 133 | ① Mở Bổ sung thông tin thuế (ACC78, `/thue/bo-sung-thong-tin`), lọc "Chưa có hoá đơn". ② Có hoá đơn: nhập số / ký hiệu / ngày → định khoản lại. ③ Không có: báo kế toán trưởng, bỏ đánh dấu được khấu trừ | `TAX_INPUT_NO_INVOICE` | ✔ |
| F22-TAX-02 | Hàng bán ra dùng thuế suất giảm 8% ngoài thời gian giảm | `VAT_REDUCED_RATE` (DG-VAT-1) | ⚠ | KTT, **TT** | thuế đầu ra kê thiếu | ① Mở chứng từ theo mẫu khoá. ② Sửa loại thuế mặt hàng / phiếu về thuế suất đúng (Mặt hàng, loại thuế bán). ③ Hoá đơn đã phát hành: lập hoá đơn điều chỉnh theo quy định, định khoản lại | `VAT_REDUCED_RATE` | ✔ |
| F22-TAX-03 | Hàng thuộc danh mục không được giảm thuế mà dùng 8% trong thời gian giảm | *chưa có — cần nhóm hàng / mã HS theo danh mục loại trừ* | ⚠ | **TT** | thuế đầu ra kê thiếu | ① Gắn nhóm "không được giảm" cho mặt hàng (khi có trường). ② Sửa loại thuế, lập hoá đơn điều chỉnh | — | ☐ |
| F22-TAX-04 | Hoá đơn mua vào ≥ 5 triệu (gồm thuế) được khấu trừ mà chưa có chứng từ thanh toán không dùng tiền mặt | `VAT_INPUT_NONCASH` (DG-VAT-2) | ⚠ | KTT, **TT** | thuế đầu vào chưa đủ điều kiện khấu trừ | ① ACC78, cột Chứng từ thanh toán. ② Nhập số chứng từ ngân hàng. ③ Chưa trả (trả chậm): theo dõi tới hạn; quá hạn không trả bằng chuyển khoản thì bỏ đánh dấu được khấu trừ | `VAT_INPUT_NONCASH` | ✔ |
| F22-TAX-05 | Hoá đơn thiếu ký hiệu, thiếu tên / MST người bán, MST sai dạng | `INVOICE_FIELDS` (DG-EINV-1) | ⚠ | KTT, **TT** | bảng kê không khớp dữ liệu cơ quan thuế | ① ACC78, mẫu "số chứng từ: điểm thiếu". ② Bổ sung từ hoá đơn gốc. ③ Đối tượng thiếu MST: sửa ở Danh mục đối tượng | `INVOICE_FIELDS` | ✔ |
| F22-TAX-06 | Hoá đơn bán hàng hoá lập sau ngày giao hàng | `INVOICE_ISSUE_DATE` (DG-EINV-2) | ⚠ | **TT** | lập hoá đơn chậm thời điểm, có thể bị xử phạt | ① Kiểm quy trình xuất hoá đơn ở bán hàng (xuất ngay khi giao). ② Dịch vụ / bán theo đợt: ghi chú căn cứ thời điểm riêng khi xác nhận cảnh báo | `INVOICE_ISSUE_DATE` | ✔ |
| F22-TAX-07 | Số hoá đơn đã có ở chứng từ khác | `IN-BIZ-006` | ⚠ | **TT**, KS | kê trùng, khấu trừ hai lần | ① So hai chứng từ. ② Trùng thật: huỷ một bản; khác nhà cung cấp: kiểm ký hiệu | Kiểm thử ở Trạm | 📋 |
| F22-TAX-08 | Kỳ kê khai trước tháng của ngày hoá đơn | `taxIssues`; ACC78 từ chối | ⛔ | TT | kê sai kỳ | ① Chọn kỳ kê khai từ tháng của ngày hoá đơn trở đi | — (bị chặn) | 🛡 |
| F22-TAX-09 | Sổ hoá đơn ≠ phát sinh tài khoản thuế GTGT trong kỳ | *`TAX_BOOK_MATCH`* (DG-PLAN-2) | ✘ | **TT**, KS | tờ khai lệch sổ | ① Mở Báo cáo thuế vào / ra (ACC64, ACC65). ② So từng chứng từ với sổ chi tiết tài khoản thuế (ACC12). ③ Chứng từ thiếu hoá đơn: F22-TAX-01; bút toán tay vào tài khoản thuế: F22-LEDGER-10 | `TAX_BOOK_MATCH` | ☐ |
| F22-TAX-10 | Hoá đơn của cơ quan thuế có (người bán đã xuất) mà sổ chưa có | màn Hoá đơn từ cơ quan thuế (THUE01) — *chưa có mã kiểm* | ⚠ | **TT** | thiếu chi phí / thuế đầu vào, hoặc mua hàng không ghi sổ | ① Mở THUE01, lọc "chưa khớp". ② Nhập phiếu mua tương ứng, hoặc ③ ghi chú lý do (hoá đơn không thuộc đơn vị) | THUE01 | ☐ |
| F22-TAX-11 | Hoá đơn từ người bán thuộc danh sách rủi ro | màn Cảnh báo hoá đơn rủi ro (THUE02) — *chưa có mã kiểm* | ⚠ | **TT** | thuế đầu vào bị loại | ① Mở THUE02. ② Xác minh người bán (tra cứu MST). ③ Rủi ro thật: bỏ đánh dấu được khấu trừ ở ACC78 | THUE02 | ☐ |
| F22-TAX-12 | Ngày hoá đơn cách ngày chứng từ hơn 5 ngày | `IN-BIZ-007` | ℹ | TT | dấu hiệu nhập muộn / sai ngày | ① Kiểm ngày chứng từ hoặc ngày hoá đơn, sửa ở nguồn nếu nhập nhầm | Kiểm thử ở Trạm | 📋 |

## 5. STK · Kho, giá vốn

| Mã ca | Giả định lỗi | Phát hiện | Mức | Vai | Hậu quả | Phương án khắc phục | Kiểm lại | TT |
|---|---|---|---|---|---|---|---|---|
| F22-STK-01 | Tồn kho âm theo mặt hàng × kho × ngày | `INVENTORY_NEGATIVE` (DG-INV-1); cảnh báo trước khoá kỳ | ⚠ | KTT, **TT** | giá vốn bình quân sai, chi phí không có cơ sở | ① Mẫu `<chi nhánh>:<kho>:<mã>@<ngày âm đầu>`: mở BC nhập xuất tồn (ACC83, `/bao-cao/nhap-xuat-ton`) tại ngày đó. ② Tìm phiếu nhập thiếu / trễ / sai kho / sai mã; bổ sung hoặc sửa ở nguồn. ③ Tính lại giá vốn tháng đó (ACC49). Không điều chỉnh kho cho "khớp" | `INVENTORY_NEGATIVE` | ✔ |
| F22-STK-02 | Tháng có hàng xuất mà chưa có phiếu giá vốn | `PERIOD_CLOSE_OPEN` (`gia-von`); bảng kiểm `cogs` | ⚠ | **KTT** | lợi nhuận tháng sai | ① Tính giá vốn (ACC49, `/nghiep-vu/tinh-gia-von`) cho tháng và chi nhánh trong mẫu. ② Kết chuyển lại nếu đã kết chuyển (F22-STK-03) | `PERIOD_CLOSE_OPEN` | ✔ |
| F22-STK-03 | Tính lại giá vốn sau khi đã kết chuyển | `PERIOD_CLOSE_OPEN` (`thu-tu`); bảng kiểm `closingStale` | ⚠ | **KTT**, KS | kết chuyển dùng số giá vốn cũ | ① Chạy lại Kết chuyển (ACC6, `/nghiep-vu/ket-chuyen`) cho tháng đó | `PERIOD_CLOSE_OPEN` | ✔ |
| F22-STK-04 | Phiếu nhập về / sửa sau khi đã tính giá vốn tháng | *`COGS_STALE`* (dòng kho tạo sau phiếu giá vốn tháng) | ⚠ | **KTT** | đơn giá vốn của tháng lỗi thời | ① Tính lại giá vốn tháng đó (ACC49). ② Kết chuyển lại (ACC6) | `COGS_STALE` | ☐ |
| F22-STK-05 | Hàng đang chuyển giữa chi nhánh không về 0 | *`TRANSIT_NONZERO`* (DG-PLAN-4) | ⚠ | KTT, **KS** | hàng "mất" giữa hai kho | ① Sổ chi tiết tài khoản hàng đang chuyển (ACC12) theo chi nhánh. ② Chi nhánh nhận chưa nhập: nhập phiếu chuyển đến. ③ Lệch đơn giá giữa nhóm tính giá: tính lại giá vốn nhóm gửi trước | `TRANSIT_NONZERO` | ☐ |
| F22-STK-06 | Kho không thuộc chi nhánh của chứng từ | `IN-MD-006` | ⛔ | KTT | tồn sai kho | ① Sửa kho ở nguồn, hoặc khai kho cho chi nhánh (Danh mục kho) | Kiểm thử ở Trạm | 📋 |
| F22-STK-07 | Đơn giá vốn bất thường (bằng 0 khi có hàng, hoặc gấp nhiều lần tháng trước) | *`COST_UNIT_SPIKE`* (ngưỡng nội bộ) | ⚠ | **TT**, KTT | giá vốn bị đội / thiếu | ① Mở bảng đơn giá vốn tháng (ACC49). ② Kiểm phiếu nhập giá bất thường (đơn giá, ĐVT quy đổi). ③ Sửa ở nguồn, tính lại | `COST_UNIT_SPIKE` | ☐ |
| F22-STK-08 | Nhập bảng giá vốn từ Excel thiếu mã đang xuất | kết quả tính giá vốn `imported.missing` | ⚠ | KTT | mã thiếu tính theo bình quân, lẫn hai cách | ① Bổ sung mã vào tệp, nhập lại. ② Hoặc bỏ giá nhập, quay về bình quân | màn ACC49 | ✔ |
| F22-STK-09 | Phiếu điều chỉnh kho (kiểm kê) không ghi lý do | *`STOCK_ADJUST_NO_REASON`* | ⚠ | **KS**, TT | chênh lệch kiểm kê không có cơ sở | ① Ghi lý do + biên bản kiểm kê ở nguồn. ② Chọn lý do có tài khoản đối ứng (ACC18) | `STOCK_ADJUST_NO_REASON` | ☐ |
| F22-STK-10 | Dòng chờ giá vốn kiểu cũ còn số tiền | phiếu giá vốn tháng đưa về 0 (`overwriteCostPairs`) | — | KS | (đã xử lý theo thiết kế) | Không cần làm gì: tính giá vốn tháng tự đưa dòng chờ cũ về 0 | — | ✔ |

## 6. CLOSE · Cuối kỳ, kết chuyển, khoá kỳ

| Mã ca | Giả định lỗi | Phát hiện | Mức | Vai | Hậu quả | Phương án khắc phục | Kiểm lại | TT |
|---|---|---|---|---|---|---|---|---|
| F22-CLOSE-01 | Tháng đã qua còn số doanh thu / chi phí chưa kết chuyển | `PERIOD_CLOSE_OPEN` (`ket-chuyen`); bảng kiểm `closing` | ⚠ | **KTT** | báo cáo kết quả kinh doanh sai | ① Kết chuyển (ACC6) theo tháng / chi nhánh trong mẫu. ② Tháng trước còn thiếu thì làm lần lượt từ tháng cũ nhất | `PERIOD_CLOSE_OPEN` | ✔ |
| F22-CLOSE-02 | Kết chuyển lỗi thời (số liệu / bộ quy tắc đổi sau kết chuyển) | bảng kiểm `closingStale` | ⚠ | **KTT** | kết quả tháng không phản ánh số mới | ① Chạy lại Kết chuyển (ACC6); bút toán cũ tự đảo | `GET /periods/check` | ✔ |
| F22-CLOSE-03 | Đã kết chuyển mà doanh thu / chi phí / 911 còn số dư | bảng kiểm `closingResidual` | ⚠ | KTT, **KS** | bộ quy tắc kết chuyển thiếu bước | ① Xem tài khoản còn dư ở chi tiết kết chuyển. ② Bổ sung bước ở bộ quy tắc kết chuyển. ③ Kết chuyển lại | `GET /periods/check` | ✔ |
| F22-CLOSE-04 | Tháng đã qua quá 30 ngày chưa khoá sổ | `PERIOD_CLOSE_OPEN` (`khoa-so`) | ⚠ | KTT, **KS** | số liệu kỳ cũ còn bị sửa | ① Làm xong giá vốn, kết chuyển. ② Kế toán trưởng khoá kỳ (ACC2); còn cảnh báo thì ghi lý do | `PERIOD_CLOSE_OPEN` | ✔ |
| F22-CLOSE-05 | Khoá kỳ khi sổ có lỗi toàn vẹn | `LEDGER_DIAGNOSTICS_FAILED` (R-DIAG-4) | ⛔ | **KS** | khoá một kỳ có sổ sai | ① Sửa lỗi toàn vẹn trước (nhóm LEDGER). ② Nếu chấp nhận có lý do: ghi lý do ≥ 10 ký tự, lưu kèm lượt chẩn đoán | — (cần lý do) | 🛡 |
| F22-CLOSE-06 | Khoá kỳ khi còn cảnh báo (tồn âm, chưa giá vốn…) | `core.conformance.advisories` + xác nhận | ⚠ | **KTT**, KS | khoá với việc chưa xong | ① Đọc khối cảnh báo ở ACC2. ② Xử lý, hoặc ghi lý do ≥ 10 ký tự rồi khoá (bằng chứng `core.conformance.acknowledge`) | bằng chứng ở nhật ký | ✔ |
| F22-CLOSE-07 | Mở khoá kỳ không ghi lý do | bắt buộc lý do khi mở khoá | ⛔ | KS | mất dấu vết sửa kỳ cũ | ① Ghi lý do; nhật ký khoá / mở lưu ai, lúc nào | nhật ký khoá kỳ | 🛡 |
| F22-CLOSE-08 | Khấu hao / phân bổ chi phí tháng chưa chạy | *`DEPRECIATION_OPEN`* | ⚠ | **KTT**, TT | chi phí tháng thiếu | ① Tính khấu hao, phân bổ (ACC31, `/tai-san/khau-hao`) cho tháng. ② Kết chuyển lại nếu đã kết chuyển | `DEPRECIATION_OPEN` | ☐ |
| F22-CLOSE-09 | Năm tài chính đã qua chưa kết chuyển lãi / lỗ năm | *`YEAR_END_OPEN`* | ⚠ | **KTT**, KS | lợi nhuận chưa phân phối sai | ① Kết chuyển cuối năm (ACC6, chọn năm). ② Khoá các kỳ của năm | `YEAR_END_OPEN` | ☐ |
| F22-CLOSE-10 | Yêu cầu thanh toán chờ duyệt / chưa chi cuối kỳ | bảng kiểm `paymentRequests` | ⚠ | **KTT** | công nợ, tiền cuối kỳ chưa đúng | ① Yêu cầu thanh toán (CN05, `/cong-no/yeu-cau-thanh-toan`): duyệt hoặc từ chối. ② Lập phiếu chi cho yêu cầu đã duyệt | `GET /periods/check` | ✔ |

## 7. LEDGER · Sổ, lệch sổ

| Mã ca | Giả định lỗi | Phát hiện | Mức | Vai | Hậu quả | Phương án khắc phục | Kiểm lại | TT |
|---|---|---|---|---|---|---|---|---|
| F22-LEDGER-01 | Bút toán Nợ ≠ Có | trigger cân + `LEDGER_BALANCED` (DG-LEDGER-1); `UNBALANCED_ENTRY` | ⛔ | **KS** | bảng cân đối sai | ① Không ghi được (trigger chặn). ② Nếu kiểm vẫn báo: trigger đã bị vượt (F22-ENV-02) — dừng ghi sổ, báo nhóm Lõi kèm mã tra cứu, không tự sửa sổ | `LEDGER_BALANCED` | 🛡 |
| F22-LEDGER-02 | Số dư lưu sẵn theo ngày ≠ tổng dòng sổ | `LEDGER_BALANCES_DAILY` (DG-LEDGER-2); bảng kiểm `balanceMismatch` | ✘ | **KS** | báo cáo số dư sai | ① Dừng khoá kỳ. ② Báo nhóm Lõi (công cụ dựng lại số dư từ sổ) — không sửa tay bảng số dư | `LEDGER_BALANCES_DAILY` | ✔ |
| F22-LEDGER-03 | Bút toán đã đảo không có đúng một bút toán đảo | `LEDGER_REVERSED_ONCE` (DG-LEDGER-3) | ✘ | **KS** | đảo trùng / thiếu | ① Mở chứng từ, xem nhật ký định khoản. ② Báo nhóm Lõi kèm số bút toán | `LEDGER_REVERSED_ONCE` | ✔ |
| F22-LEDGER-04 | Bút toán trỏ tới sự việc không tồn tại | `LEDGER_ORPHAN` (DG-LEDGER-4) | ✘ | **KS** | bút toán không có chứng từ gốc | ① Báo nhóm Lõi + ban kiểm soát. ② Lập biên bản; không xoá bút toán | `LEDGER_ORPHAN` | ✔ |
| F22-LEDGER-05 | Ai đó `UPDATE` / `DELETE` thẳng vào sổ cái hoặc bằng chứng | `LEDGER_APPEND_ONLY` (trigger) | ⛔ | **KS** | (bị chặn) | ① Không có đường hợp lệ: sửa bằng chứng từ đảo / điều chỉnh. ② Tìm script vận hành tự viết và gỡ | — (bị chặn) | 🛡 |
| F22-LEDGER-06 | Kết chuyển / giá vốn / khấu hao ghi vòng qua cửa ghi sổ | `INTERNAL_EVENT_VERSION` (DG-EVENT-4) | ⚠ | **KS** | sự việc nội bộ lệch phiên bản | ① Chạy lại kết chuyển / tính giá vốn / khấu hao của kỳ đó. ② Còn lỗi: báo nhóm Lõi | `INTERNAL_EVENT_VERSION` | ✔ |
| F22-LEDGER-07 | Bút toán theo phiên bản chính sách kế toán không áp cho ngày hạch toán | `POLICY_VERSION` (DG-POL-1) | ⚠ | **KS** | định khoản theo luật cũ / chưa hiệu lực | ① Định khoản lại chứng từ ở ACC14. ② Báo nhóm Lõi (có đường định khoản không đọc chính sách theo ngày) | `POLICY_VERSION` | ✔ |
| F22-LEDGER-08 | Tài khoản dư sai bên (tiền, hàng tồn dư Có; tài khoản chỉ dư Nợ lại dư Có) | *`ACCOUNT_WRONG_SIDE`* (theo `normal_side` của tài khoản) | ⚠ | KTT, **KS**, TT | dấu hiệu ghi thiếu chứng từ / ghi nhầm tài khoản | ① Sổ chi tiết tài khoản (ACC12) tại ngày đầu tiên sai bên. ② Tìm chứng từ thiếu (phiếu thu, phiếu nhập) hoặc ghi nhầm. ③ Sửa ở nguồn / lập chứng từ điều chỉnh | `ACCOUNT_WRONG_SIDE` | ☐ |
| F22-LEDGER-09 | Bảng cân đối phát sinh không cân / không khớp số dư đầu kỳ | Nợ = Có theo bút toán (trigger) + `LEDGER_BALANCES_DAILY` | ✘ | **KS** | báo cáo tài chính sai | ① Như F22-LEDGER-02 | `LEDGER_BALANCES_DAILY` | ✔ |
| F22-LEDGER-10 | Phiếu kế toán tay ghi vào tài khoản thuế / doanh thu không qua chứng từ gốc | *`MANUAL_SENSITIVE`* (tài khoản lấy từ cấu hình loại thuế / ngầm định, không viết cứng) | ⚠ | **KS**, TT | sổ thuế / doanh thu lệch hoá đơn | ① Mở phiếu (ACC16). ② Có chứng từ gốc: đính kèm, ghi căn cứ. ③ Không có: huỷ phiếu, lập đúng chứng từ (hoá đơn điều chỉnh, phiếu bán) | `MANUAL_SENSITIVE` | ☐ |

## 8. DEBT · Công nợ

| Mã ca | Giả định lỗi | Phát hiện | Mức | Vai | Hậu quả | Phương án khắc phục | Kiểm lại | TT |
|---|---|---|---|---|---|---|---|---|
| F22-DEBT-01 | Tổng khoản công nợ mở ≠ số dư tài khoản công nợ theo đối tượng | *`DEBT_MATCH_LEDGER`* (DG-PLAN-1) | ✘ | **KS**, KTT | sổ công nợ và sổ cái nói hai số | ① Sổ chi tiết công nợ (ACC40) theo đối tượng lệch. ② Tìm thanh toán chưa phân bổ / phân bổ sai (CN01). ③ Phiếu kế toán tay vào tài khoản công nợ thiếu đối tượng: sửa phiếu | `DEBT_MATCH_LEDGER` | ☐ |
| F22-DEBT-02 | Công nợ phải thu quá hạn quá N ngày (quy chế nội bộ) | *`DEBT_OVERDUE`*; màn tuổi nợ ACC67 | ⚠ | **KTT** | rủi ro mất vốn, cần trích lập dự phòng | ① Báo cáo tuổi nợ quá hạn (ACC67B). ② Gửi biên bản đối chiếu (CN07). ③ Kế toán trưởng xét trích lập dự phòng | `DEBT_OVERDUE` | ☐ |
| F22-DEBT-03 | Khách hàng dư Có (trả thừa) / nhà cung cấp dư Nợ lâu không xử lý | *`DEBT_WRONG_SIDE`* | ⚠ | KTT, **KS** | tiền khách chưa hoàn / chưa cấn trừ | ① Cấn trừ công nợ (BT03) với khoản nợ khác. ② Hoặc lập phiếu chi hoàn tiền | `DEBT_WRONG_SIDE` | ☐ |
| F22-DEBT-04 | Thanh toán chưa phân bổ vào khoản nợ cụ thể | *`DEBT_UNALLOCATED`* | ⚠ | **KTT** | tuổi nợ sai, quá hạn ảo | ① Khoản công nợ và đối trừ (CN01): phân bổ thanh toán vào hoá đơn | `DEBT_UNALLOCATED` | ☐ |
| F22-DEBT-05 | Đặt cọc / trả trước lâu không cấn trừ | *`DEPOSIT_AGED`* | ⚠ | KTT | tài sản ảo trên báo cáo | ① Đặt cọc, trả trước (CN04): cấn trừ vào hoá đơn đã nhận, hoặc thu hồi | `DEPOSIT_AGED` | ☐ |
| F22-DEBT-06 | Cuối năm chưa có biên bản đối chiếu công nợ với đối tượng lớn | *`DEBT_NOT_CONFIRMED`* | ℹ | **KS**, TT | không có xác nhận bên thứ ba | ① Lập biên bản đối chiếu công nợ (CN07, `/cong-no/doi-chieu`), gửi ký | `DEBT_NOT_CONFIRMED` | ☐ |

## 9. CASH · Tiền

| Mã ca | Giả định lỗi | Phát hiện | Mức | Vai | Hậu quả | Phương án khắc phục | Kiểm lại | TT |
|---|---|---|---|---|---|---|---|---|
| F22-CASH-01 | Quỹ tiền mặt âm cuối ngày | *`CASH_NEGATIVE`* (tài khoản tiền mặt lấy từ cấu hình, không viết cứng) | ⚠ | KTT, **TT** | chi khi không có tiền: dấu hiệu thiếu phiếu thu / chi khống | ① Sổ quỹ tiền mặt (ACC55) tại ngày âm đầu tiên. ② Tìm phiếu thu thiếu / nhập trễ, hoặc phiếu chi ghi nhầm ngày. ③ Sửa ở nguồn / lập phiếu thu đúng ngày | `CASH_NEGATIVE` | ☐ |
| F22-CASH-02 | Tiền đang chuyển / chuyển tiền nội bộ không về 0 | *`TRANSIT_NONZERO`* (dùng chung với F22-STK-05) | ⚠ | **KS** | tiền "mất" giữa hai quỹ | ① Chuyển tiền nội bộ: nơi nhận bấm "Xác nhận đã nhận tiền". ② Sổ chi tiết tài khoản tiền đang chuyển (ACC12) | `TRANSIT_NONZERO` | ☐ |
| F22-CASH-03 | Chuyển tiền nội bộ chưa được nơi nhận xác nhận quá N ngày | *`TRANSFER_UNCONFIRMED`* | ⚠ | **KTT** | tiền không ghi nơi nhận | ① Nhắc nơi nhận xác nhận sau khi đối chiếu quỹ / sao kê | `TRANSFER_UNCONFIRMED` | ☐ |
| F22-CASH-04 | Chi tiền mặt cho một khoản vượt ngưỡng phải thanh toán không dùng tiền mặt (ngưỡng luật, căn cứ chờ rà) | *`CASH_LARGE_PAYMENT`* (ngưỡng là tham số rulepack) | ⚠ | **TT** | chi phí có thể bị loại khi tính thuế | ① Đổi sang chuyển khoản cho lần sau. ② Ghi chú căn cứ khi xác nhận cảnh báo | `CASH_LARGE_PAYMENT` | ☐ |
| F22-CASH-05 | Phiếu thu / chi thiếu người nộp / nhận hoặc lý do | *`CASH_VOUCHER_FIELDS`* | ℹ | KS | chứng từ tiền không đủ yếu tố | ① Bổ sung ở phiếu (ACC15 / phiếu thu chi) | `CASH_VOUCHER_FIELDS` | ☐ |
| F22-CASH-06 | Sổ tiền gửi chưa đối chiếu với sao kê ngân hàng | — | ⚠ | **KS** | lệch tiền gửi không phát hiện | — | — | ○ hoãn: chưa có dữ liệu sao kê (như Q020-6) |

## 10. FA · Tài sản, chi phí trả trước

| Mã ca | Giả định lỗi | Phát hiện | Mức | Vai | Hậu quả | Phương án khắc phục | Kiểm lại | TT |
|---|---|---|---|---|---|---|---|---|
| F22-FA-01 | Tài sản đã khấu hao hết vẫn trích khấu hao | *`FA_OVER_DEPRECIATED`* | ⚠ | **TT**, KS | chi phí khấu hao không được trừ | ① Kế hoạch khấu hao (TS01): dừng trích. ② Đảo phần trích thừa bằng chứng từ điều chỉnh | `FA_OVER_DEPRECIATED` | ☐ |
| F22-FA-02 | Tài sản đã ghi giảm vẫn trích khấu hao | *`FA_DISPOSED_DEPRECIATED`* | ⚠ | **TT** | chi phí không có cơ sở | ① Kiểm phiếu ghi giảm (ACC30). ② Tính lại khấu hao tháng đó (ACC31) | `FA_DISPOSED_DEPRECIATED` | ☐ |
| F22-FA-03 | Chi phí trả trước hết kỳ phân bổ vẫn còn số dư | *`PREPAID_RESIDUAL`* | ⚠ | KTT, **TT** | chi phí phân bổ thiếu | ① Phân bổ chi phí trả trước (ACC23): phân bổ phần còn lại vào kỳ cuối | `PREPAID_RESIDUAL` | ☐ |
| F22-FA-04 | Tài sản không có bộ phận sử dụng / tài khoản chi phí | *`FA_MISSING_ALLOCATION`* | ℹ | KTT | khấu hao vào sai chi phí | ① Sửa tài sản (ACC28): khai bộ phận, tài khoản chi phí | `FA_MISSING_ALLOCATION` | ☐ |

## 11. SEC · Phân quyền, bằng chứng

Nhóm này kiểm rằng **hệ thống chặn đúng**. Bộ chạy gây lỗi và mong đợi mã lỗi.

| Mã ca | Giả định lỗi | Phát hiện | Mức | Vai | Hậu quả nếu không chặn | Phương án khắc phục | Kiểm lại | TT |
|---|---|---|---|---|---|---|---|---|
| F22-SEC-01 | Khoá API / AI xác nhận cảnh báo hoặc duyệt rulepack thay người | `FORBIDDEN` (core.conformance.acknowledge / approve) | ⛔ | **KS** | quyết định không có người chịu trách nhiệm | ① Người có quyền đăng nhập để xác nhận | — | 🛡 |
| F22-SEC-02 | AI gọi action ghi (chạy kiểm chuẩn, khai hồ sơ, ghi chứng từ) | `ai: deny` | ⛔ | KS | AI tự ghi sổ / đổi cấu hình | ① AI chỉ đọc; người làm thao tác ghi | — | 🛡 |
| F22-SEC-03 | Người xem / nhà phát triển gửi chứng từ | `FORBIDDEN` | ⛔ | KS | ghi sổ ngoài phân quyền | ① Chủ đơn vị cấp vai trò phù hợp ở Người dùng (HT01) | — | 🛡 |
| F22-SEC-04 | Đơn vị A đọc / ghi dữ liệu đơn vị B | RLS + `TENANT_ISOLATION` | ⛔ | **KS** | lộ dữ liệu | ① (bị chặn) Nếu kiểm báo bảng thiếu RLS: F22-ENV-05 | `TENANT_ISOLATION` | 🛡 |
| F22-SEC-05 | Kế toán viên tự duyệt rulepack / khoá kỳ | `FORBIDDEN` (`conformance:approve`, `periods:lock`) | ⛔ | KS | vượt cấp duyệt | ① Kế toán trưởng / chủ đơn vị làm | — | 🛡 |
| F22-SEC-06 | Gửi lại cùng Idempotency-Key với nội dung khác | `IDEMPOTENCY_CONFLICT` | ⛔ | KS | ghi trùng / ghi nhầm khi mạng chập chờn | ① Nguồn sinh khoá mới cho thao tác mới; gửi lại thì giữ nguyên cả khoá lẫn nội dung | — | 🛡 |

## 12. Kiểm mới cần viết ở W2 (tổng hợp từ cột ☐)

| Mã kiểm | Ca | Ghi chú thiết kế |
|---|---|---|
| `CONFORMANCE_STALE` | ENV-12 | lượt `conformance_runs` mới nhất quá 2 ngày (nội bộ) |
| `TAX_BOOK_MATCH` | TAX-09 | đã giữ chỗ DG-PLAN-2; tài khoản thuế đọc từ loại thuế + ngầm định |
| `COGS_STALE` | STK-04 | `inventory_movements` của tháng có `event_id` tạo sau phiếu giá vốn tháng |
| `TRANSIT_NONZERO` | STK-05, CASH-02 | đã giữ chỗ DG-PLAN-4; tài khoản trung gian đọc từ cấu hình, không viết cứng |
| `COST_UNIT_SPIKE` | STK-07 | ngưỡng là tham số ca (nội bộ) |
| `STOCK_ADJUST_NO_REASON` | STK-09 | `inventory_movements.kind IN (adjust_in, adjust_out)` và `reason_code IS NULL` |
| `DEPRECIATION_OPEN`, `YEAR_END_OPEN` | CLOSE-08, -09 | cùng khuôn với `PERIOD_CLOSE_OPEN` |
| `ACCOUNT_WRONG_SIDE` | LEDGER-08 | theo `accounts.normal_side`; số dư cuối ngày |
| `MANUAL_SENSITIVE` | LEDGER-10 | phiếu `manual` vào tài khoản của loại thuế / ngầm định doanh thu |
| `DEBT_MATCH_LEDGER`, `DEBT_*`, `DEPOSIT_AGED` | DEBT-01..06 | `DEBT_MATCH_LEDGER` đã giữ chỗ DG-PLAN-1 |
| `CASH_NEGATIVE`, `TRANSFER_UNCONFIRMED`, `CASH_LARGE_PAYMENT`, `CASH_VOUCHER_FIELDS` | CASH-01..05 | tài khoản tiền mặt đọc từ cấu hình; ngưỡng luật là tham số rulepack |
| `FA_*`, `PREPAID_RESIDUAL` | FA-01..04 | đọc từ bảng tài sản / kế hoạch khấu hao |
| (nhóm hàng không được giảm thuế) | TAX-03 | cần trường nhóm hàng trước — ticket riêng |
| (đối chiếu hoá đơn cơ quan thuế, hoá đơn rủi ro) | TAX-10, -11 | màn đã có; thêm mã kiểm đọc cùng dữ liệu |

Mỗi kiểm mới: chỉ đọc, có bản lane (R-DIAG-9), có `remedy` (R-FIX-1), có công thức gây lỗi trong bộ chạy (R-FIX-5).
