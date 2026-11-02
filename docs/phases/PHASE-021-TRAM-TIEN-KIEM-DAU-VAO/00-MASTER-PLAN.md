# PHASE-021 · Kế hoạch tổng
<!-- [2026-11-02 03:34 PM Johnny Chu - Chu Hoàng Anh] PHASE-021 — kế hoạch tổng: D021-1..8, sáu đợt W0–W5 (PR-I1…I5), cổng nghiệm thu, rủi ro, ước lượng -->

> Quyết định nền: [ADR-0014](../../adr/ADR-0014-tram-tien-kiem-be-cho-dau-vao.md) (chấp nhận 2026-11-02). Luật: [RULE-INTAKE](../../rules/RULE-INTAKE.md). Kiến trúc chi tiết: [20-KIEN-TRUC](20-KIEN-TRUC.md).

## 1. Vì sao

Luồng năm bước của open-ketoan (thu thập → kiểm tra → định khoản → ghi sổ → báo cáo) hôm nay chỉ có **một** phản ứng với đầu vào sai: chặn và quên. Hệ quả đọc được từ mã ([10-HIEN-TRANG](10-HIEN-TRANG.md)):

- Kế toán trưởng không biết hệ thống nguồn gửi hỏng bao nhiêu phiếu, vì sao, của ai.
- Thực tập sinh nhận `lines.2.qty: Expected number`, không hiểu, sửa một lỗi lại gặp lỗi tiếp theo.
- Không có số đo chất lượng đầu vào để đào tạo hay để yêu cầu hệ thống nguồn sửa.

Phase này thêm **một tầng hướng dẫn trước cửa Kernel**, không đổi một luật nào của Kernel.

## 2. Quyết định của phase

| Mã | Quyết định | Nguồn |
|---|---|---|
| D021-1 | Bể chờ `intake_inbox` là bảng riêng của cửa nạp (`packages/kernel/src/modules/intake/`), không phải sổ; đầu vào chưa đạt khuôn **không** vào `accounting_events` | ADR-0014 D1, D10 |
| D021-2 | Một bộ luật: bộ tiền kiểm gọi **chính** zod của `packages/contracts`, `assertTotals`, tra danh mục, đường định khoản thử của Kernel; chỉ khác cửa nạp ở chỗ gom thay vì ném. Mã `block` ⇔ cửa nạp từ chối (kiểm bằng test cặp) | R-INTAKE-4 |
| D021-3 | Mã `warn` / `hint` là kiểm **mới, chỉ hướng dẫn**: không bao giờ chặn cửa nạp. Muốn một kiểm thành chặn → sửa Kernel theo R-KER-2, không sửa ở trạm | R-INTAKE-6 |
| D021-4 | Sửa tại bể được (Q1), bản vá RFC 6902 rút gọn (`replace` / `add` / `remove`) trên nguyên văn; sự việc sinh ra có `extra.intake = { inboxId, patched: true }` = dấu lệch nguồn | ADR-0014 Q1, R-INTAKE-7, -8 |
| D021-5 | Hạn giữ: mục đã đóng 90 ngày, mục thử 7 ngày; khoá cấu hình `bizcity.intake.retention_days` / `bizcity.intake.trial_retention_days`; dọn bằng subscriber `bizcity.clock.daily` | ADR-0014 Q2 |
| D021-6 | Bảng điểm theo người lập hiện cho mọi kế toán của đơn vị (người có `documents:write`), chỉ mã lỗi / điểm / số mục — công cụ đào tạo | ADR-0014 Q3 |
| D021-7 | Màn **Trạm kiểm tra đầu vào** thay màn ACC14 (giữ mã ACC14, giữ đường dẫn `/chung-tu`); thẻ mới "Cần sửa" (bể chờ) đứng đầu | ADR-0014 D1 |
| D021-8 | Phản hồi lỗi của cửa nạp giữ mã HTTP; thêm `meta.intake` và `error.details.findings`. Bên tích hợp cũ không phải đổi gì | ADR-0014 D2, D11 |

## 3. Đợt làm

| Đợt | PR | Lộ trình | Nội dung | Mức Kernel | Phụ thuộc |
|---|---|---|---|---|---|
| **W0** | (PR này) | — | ADR-0014 duyệt, RULE-INTAKE, kế hoạch + kiến trúc phase, danh mục mã nháp; bản mẫu tĩnh màn Trạm + bảng điểm | K0 | — |
| **W1** | PR-I1 | 2.17 | Hợp đồng `bizcity_intake_findings@1` + danh mục mã `IN-*` (L1–L4) + hàm `preflight(doc, ctx)` thuần, gom lỗi; test cặp block ⇔ cửa nạp; check `SC-INTAKE-1` (mã ⇔ trang bài học) | K0 | — |
| **W2** | PR-I2 | 2.18 | Migration `intake_inbox`; cửa nạp (đơn, lô, `submit`, app) lưu khi từ chối + `meta.intake`; gộp lần gửi trùng; tự đóng khi nguồn gửi lại đạt; `GET /intake`, `GET /intake/:id`; dọn theo hạn giữ | K1 | W1; PR-2 gộp (`core.document.submit`) |
| **W3** | PR-I3 | 2.19 | Màn Trạm kiểm tra đầu vào: thẻ Cần sửa / Chờ định khoản / Lỗi định khoản / Đã xử lý / Thử; khung chi tiết (lỗi theo lớp, nguyên văn ↔ bản vá); sửa tại bể, Kiểm thử, so sánh lần, nộp lại, chấp nhận cảnh báo, bỏ mục | K0 | W2 |
| **W4** | PR-I4 | 2.20 | Bảng điểm (KPI, theo nguồn / người / loại / mã, xu hướng tuần); `DG-INTAKE-1`; sự kiện `bizcity.intake.rejected` / `.resolved` (webhook app — PR-2b); trang bài học cho mọi mã | K0 | W2; PR-2b gộp |
| **W5** | PR-I5 | 2.21 | L5 định khoản thử trong tiền kiểm (`IN-POST-*`); gợi ý cấu hình từ lỗi lặp (kế toán trưởng duyệt); action đọc `core.intake.explain` cho trợ lý AI | K1 | W3 |

Thứ tự bắt buộc: W1 → W2 → (W3 ∥ W4) → W5. W3 và W4 làm song song được sau W2.

## 4. Ai làm

| Phần | Người làm | Người duyệt |
|---|---|---|
| Kernel (`modules/intake`, bọc cửa nạp), migration, hợp đồng, check | Nhóm Lõi | chủ dự án (K1, R-SIG) |
| Màn Trạm kiểm tra, bảng điểm (web) | Nhóm Lõi dựng khung; người đóng góp giao diện được nhận việc con theo [R-REV](../../rules/RULE-REVIEW.md) | Nhóm Lõi |
| Danh mục mã `IN-*` + trang bài học | Nhóm Lõi viết mã Core; kế toán trưởng / người am hiểu nghiệp vụ đọc lại câu chữ `why` / `fix` | chủ dự án |
| Mã `IN-*` riêng của phân hệ (mua hàng, kho…) | người phụ trách phân hệ, qua danh mục (không đặt bể riêng) | Nhóm Lõi |

## 5. Cổng nghiệm thu từng đợt

| Đợt | Đạt khi |
|---|---|
| W1 | Mỗi mã `block` có ca test cặp: cùng dữ liệu → `preflight` báo mã đó **và** cửa nạp từ chối. Mỗi mã có đủ trường (R-INTAKE-5). Một chứng từ có lỗi ở ba lớp → ba phát hiện trong một lần (T021-3). `selfcheck --strict` đạt |
| W2 | T021-1, -2, -5, -10, -11, -12 đạt dưới `ketoan_app` trên CSDL sạch; `DG-DB-1`, `DG-EVENT-*` không đổi; toàn bộ vitest đạt; đo: thêm ≤ 5 ms trung vị cho chứng từ **hợp lệ** (đường hợp lệ không chạy tiền kiểm) |
| W3 | T021-6, -7, -8, -9 đạt; thực tập sinh thử (người thật, dữ liệu demo): sửa xong ba chứng từ hỏng mẫu không cần hỏi; ảnh màn thật so bản mẫu trong `evidence/` |
| W4 | T021-13, -14, -15, -17 đạt; số trên bảng điểm khớp truy vấn đối chiếu trực tiếp CSDL (biên bản) |
| W5 | T021-16, -18 đạt; L5 không để lại sự việc / bút toán / sự kiện (kiểm `accounting_events`, `ledger_entries`, `event_outbox` trước / sau) |

## 6. Rủi ro và cách giảm

| Rủi ro | Cách giảm |
|---|---|
| Bộ tiền kiểm lệch Kernel (báo chặn mà Kernel cho qua, hoặc ngược lại) | D021-2: gọi chính hàm của Kernel; test cặp cho mọi mã `block`; mã chỉ có ở trạm thì bắt buộc `warn` / `hint` |
| Bể thành kho rác / kho dữ liệu cá nhân | chỉ lưu yêu cầu đã xác thực; giới hạn kích thước; gộp trùng theo băm; hạn giữ; RLS; nguyên văn không vào log / trace / sự kiện (T021-12) |
| Sửa tại bể làm sổ lệch chứng từ gốc | dấu lệch nguồn trên sự việc, chỉ số trên bảng điểm, sự kiện báo nguồn; ưu tiên tự đóng khi nguồn gửi lại |
| Bảng điểm theo người gây áp lực / so bì | chỉ mã lỗi, điểm, số mục; câu dẫn trên màn nói rõ mục đích đào tạo (Q3); không xuất ra ngoài đơn vị |
| Chậm cửa nạp | tiền kiểm đủ lớp **chỉ** chạy khi cửa nạp đã từ chối, hoặc khi người dùng bấm Kiểm thử; đường hợp lệ giữ nguyên |
| L5 định khoản thử khoá dòng / tốn tài nguyên | chạy trong giao dịch riêng, `SET LOCAL statement_timeout`, huỷ ngay; giới hạn lượt thử / phút / người |
| Trùng số migration với nhánh khác | lấy số khi bắt đầu W2 từ `main` mới nhất; SC-DATA-1 chặn trùng |

## 7. Ước lượng

| Đợt | Công |
|---|---|
| W0 | xong cùng PR này + 1 ngày bản mẫu |
| W1 | 3–4 ngày |
| W2 | 4–5 ngày |
| W3 | 5–6 ngày |
| W4 | 3–4 ngày |
| W5 | 3–4 ngày |
| **Tổng** | khoảng 4–5 tuần một người, 3 tuần nếu W3 ∥ W4 |
